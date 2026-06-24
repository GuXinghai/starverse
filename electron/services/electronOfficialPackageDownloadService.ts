import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { once } from 'node:events'
import { net } from 'electron'
import type {
  PackageDownloadFileTransportRequest,
  PackageDownloadFileTransportResult,
  PackageDownloadProgress,
  PackageDownloadResumeDescriptor,
  PackageDownloadResumeOptions,
} from '../../src/next/plugin-distribution/packageDownloader'

type ElectronNetRequest = typeof net.request

type ElectronDownloadResponse = Readonly<{
  statusCode: number
  headers: Record<string, string | string[]>
  finalUrl: string
  response: NodeJS.ReadableStream
}>

type ResumeMetadata = Readonly<{
  pluginId: string
  runtimeId: string
  packageId: string
  releaseTag: string
  assetName: string
  sourceKind: 'github_release_asset'
  expectedSizeBytes: number
  expectedSha256: string
  currentBytesWritten: number
  tempArtifactId: string
  rangeSupportMode: 'direct_browser_download_url' | 'redirected_asset_host'
  createdAt: string
  updatedAt: string
  retryCount: number
  terminalDiagnostic: string | null
}>

export async function fetchPackageToFileWithElectronNet(
  request: PackageDownloadFileTransportRequest,
  options: Readonly<{ request?: ElectronNetRequest }> = {}
): Promise<PackageDownloadFileTransportResult> {
  if (request.resume?.enabled) {
    return fetchPackageToFileWithElectronNetResume(request, options)
  }
  return fetchElectronNetAttemptToFile({
    request,
    netRequest: options.request ?? net.request,
    outputPath: request.outputPath,
    initialBytes: 0,
    retryCount: 0,
  })
}

async function fetchPackageToFileWithElectronNetResume(
  request: PackageDownloadFileTransportRequest,
  options: Readonly<{ request?: ElectronNetRequest }>
): Promise<PackageDownloadFileTransportResult> {
  const resume = request.resume
  if (!resume?.enabled) return fetchPackageToFileWithElectronNet({ ...request, resume: undefined }, options)
  const partialPath = `${request.outputPath}.partial`
  const metadataPath = `${request.outputPath}.partial.json`
  const netRequest = options.request ?? net.request
  await mkdir(dirname(request.outputPath), { recursive: true })
  await removeQuietly(request.outputPath)

  let metadata = await readResumeMetadata(metadataPath)
  if (!metadataMatchesDescriptor(metadata, resume.descriptor)) {
    await Promise.all([removeQuietly(partialPath), removeQuietly(metadataPath)])
    metadata = createResumeMetadata(resume.descriptor)
    await writeResumeMetadata(metadataPath, metadata)
  }

  let retries = metadata.retryCount
  while (true) {
    const currentBytes = await verifiedPartialSize(partialPath, metadata.currentBytesWritten)
    if (currentBytes === null) {
      await Promise.all([removeQuietly(partialPath), removeQuietly(metadataPath)])
      return { ok: false, code: 'download_failed', detail: 'resume_partial_metadata_mismatch' }
    }
    metadata = { ...metadata, currentBytesWritten: currentBytes, updatedAt: new Date().toISOString() }
    await writeResumeMetadata(metadataPath, metadata)

    const attempt = await fetchElectronNetResumeAttempt({
      request,
      netRequest,
      partialPath,
      metadataPath,
      resume,
      currentBytes,
      retryCount: retries,
    })
    if (attempt.ok === true) {
      await rename(partialPath, request.outputPath)
      await removeQuietly(metadataPath)
      return {
        ok: true,
        filePath: request.outputPath,
        sizeBytes: attempt.sizeBytes,
        sha256: await hashFile(request.outputPath),
        finalRef: attempt.finalRef,
      }
    }

    const failure = attempt as Exclude<PackageDownloadFileTransportResult, { ok: true }>
    if (failure.code === 'cancelled' || !isRetryable(failure.code)) {
      if (failure.code !== 'resume_retries_exhausted') {
        await Promise.all([removeQuietly(partialPath), removeQuietly(metadataPath)])
      }
      return failure
    }

    retries += 1
    metadata = {
      ...metadata,
      currentBytesWritten: await getFileSize(partialPath),
      retryCount: retries,
      terminalDiagnostic: failure.code,
      updatedAt: new Date().toISOString(),
    }
    await writeResumeMetadata(metadataPath, metadata)
    request.onProgress?.({
      bytesReceived: metadata.currentBytesWritten,
      totalBytes: resume.descriptor.expectedSizeBytes,
      retryCount: retries,
      phase: 'retrying',
    })
    if (retries > resume.maxRetries) {
      await writeResumeMetadata(metadataPath, {
        ...metadata,
        terminalDiagnostic: 'resume_retries_exhausted',
        updatedAt: new Date().toISOString(),
      })
      request.onProgress?.({
        bytesReceived: metadata.currentBytesWritten,
        totalBytes: resume.descriptor.expectedSizeBytes,
        retryCount: retries,
        phase: 'paused_retryable',
      })
      return { ok: false, code: 'resume_retries_exhausted', detail: 'resume retries exhausted' }
    }
    await delay(resume.retryDelayMs)
  }
}

async function fetchElectronNetResumeAttempt(input: Readonly<{
  request: PackageDownloadFileTransportRequest
  netRequest: ElectronNetRequest
  partialPath: string
  metadataPath: string
  resume: PackageDownloadResumeOptions
  currentBytes: number
  retryCount: number
}>): Promise<PackageDownloadFileTransportResult> {
  const headers: Record<string, string> = {}
  if (input.currentBytes > 0) headers.Range = `bytes=${input.currentBytes}-`
  let response: ElectronDownloadResponse
  try {
    response = await openElectronNetResponse({
      request: input.netRequest,
      url: input.request.transportRef,
      method: 'GET',
      headers,
    })
  } catch (error) {
    return { ok: false, code: 'download_failed', detail: sanitizeElectronNetDownloadError(error) }
  }

  const finalRef = response.finalUrl
  if (input.currentBytes > 0) {
    if (response.statusCode === 200) {
      destroyReadable(response.response)
      return { ok: false, code: 'resume_range_ignored', detail: 'resume range ignored', finalRef }
    }
    if (response.statusCode === 416) {
      destroyReadable(response.response)
      const localSize = await getFileSize(input.partialPath)
      if (localSize === input.resume.descriptor.expectedSizeBytes) {
        return completeExistingPartial(input.partialPath, finalRef)
      }
      return { ok: false, code: 'resume_range_rejected', detail: 'resume range rejected', finalRef }
    }
    if (response.statusCode !== 206) {
      destroyReadable(response.response)
      return { ok: false, code: 'download_failed', detail: `http_${response.statusCode}`, finalRef }
    }
    const contentRange = parseContentRange(firstHeader(response.headers['content-range']))
    if (
      !contentRange ||
      contentRange.start !== input.currentBytes ||
      contentRange.total !== input.resume.descriptor.expectedSizeBytes
    ) {
      destroyReadable(response.response)
      return { ok: false, code: 'resume_content_range_invalid', detail: 'resume content range invalid', finalRef }
    }
  } else if (response.statusCode < 200 || response.statusCode >= 300) {
    destroyReadable(response.response)
    return { ok: false, code: 'download_failed', detail: `http_${response.statusCode}`, finalRef }
  }

  const contentLength = parseHeaderNumber(response.headers['content-length'])
  if (input.currentBytes === 0 && contentLength != null && contentLength > input.request.maxBytes) {
    destroyReadable(response.response)
    return { ok: false, code: 'too_large', finalRef }
  }

  return appendNodeReadableToPartialFile({
    response: response.response,
    partialPath: input.partialPath,
    metadataPath: input.metadataPath,
    descriptor: input.resume.descriptor,
    maxBytes: input.request.maxBytes,
    totalBytes: input.resume.descriptor.expectedSizeBytes,
    initialBytes: input.currentBytes,
    finalRef,
    retryCount: input.retryCount,
    onProgress: input.request.onProgress,
  })
}

async function fetchElectronNetAttemptToFile(input: Readonly<{
  request: PackageDownloadFileTransportRequest
  netRequest: ElectronNetRequest
  outputPath: string
  initialBytes: number
  retryCount: number
}>): Promise<PackageDownloadFileTransportResult> {
  const partialPath = `${input.outputPath}.partial`
  await mkdir(dirname(input.outputPath), { recursive: true })
  await Promise.all([removeQuietly(partialPath), removeQuietly(input.outputPath)])
  let response: ElectronDownloadResponse
  try {
    response = await openElectronNetResponse({
      request: input.netRequest,
      url: input.request.transportRef,
      method: 'GET',
    })
  } catch (error) {
    return { ok: false, code: 'download_failed', detail: sanitizeElectronNetDownloadError(error) }
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    destroyReadable(response.response)
    return { ok: false, code: 'download_failed', detail: `http_${response.statusCode}`, finalRef: response.finalUrl }
  }
  const totalBytes = parseHeaderNumber(response.headers['content-length'])
  if (totalBytes != null && totalBytes > input.request.maxBytes) {
    destroyReadable(response.response)
    return { ok: false, code: 'too_large', finalRef: response.finalUrl }
  }
  const result = await streamNodeReadableToFile({
    response: response.response,
    partialPath,
    outputPath: input.outputPath,
    maxBytes: input.request.maxBytes,
    totalBytes,
    finalRef: response.finalUrl,
    onProgress: input.request.onProgress,
  })
  return result
}

async function openElectronNetResponse(input: Readonly<{
  request: ElectronNetRequest
  url: string
  method: 'GET' | 'HEAD'
  headers?: Record<string, string>
}>): Promise<ElectronDownloadResponse> {
  return await new Promise((resolve, reject) => {
    let settled = false
    let idleTimer: NodeJS.Timeout | null = null
    let requestRef: ReturnType<ElectronNetRequest> | null = null
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      if (idleTimer) clearTimeout(idleTimer)
      fn()
    }
    const resetIdleTimer = () => {
      if (idleTimer) clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        try {
          requestRef?.abort()
        } catch {
          // ignore abort errors
        }
        finish(() => reject(new Error('download_body_timeout')))
      }, 120_000)
    }
    requestRef = input.request({
      url: input.url,
      method: input.method,
      redirect: 'follow',
    } as any)
    for (const [name, value] of Object.entries(input.headers ?? {})) {
      requestRef.setHeader(name, value)
    }
    resetIdleTimer()
    requestRef.on('response', (response: any) => {
      resetIdleTimer()
      finish(() => resolve({
        statusCode: Number(response.statusCode ?? 0),
        headers: normalizeHeaders(response.headers),
        finalUrl: String(response.url ?? input.url),
        response,
      }))
    })
    requestRef.on('error', (error: unknown) => {
      finish(() => reject(error))
    })
    requestRef.end()
  })
}

async function streamNodeReadableToFile(input: Readonly<{
  response: NodeJS.ReadableStream
  partialPath: string
  outputPath: string
  maxBytes: number
  totalBytes: number | null
  finalRef?: string | null
  onProgress?: (progress: PackageDownloadProgress) => void
}>): Promise<PackageDownloadFileTransportResult> {
  const hash = createHash('sha256')
  let sizeBytes = 0
  const writer = createWriteStream(input.partialPath, { flags: 'wx' })
  try {
    for await (const rawChunk of input.response as AsyncIterable<Buffer | Uint8Array | string>) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
      sizeBytes += chunk.byteLength
      if (sizeBytes > input.maxBytes) {
        return await cleanupWriterAndFail(writer, input.partialPath, input.outputPath, {
          ok: false,
          code: 'too_large',
          finalRef: input.finalRef,
        })
      }
      hash.update(chunk)
      if (!writer.write(chunk)) await once(writer, 'drain')
      input.onProgress?.({ bytesReceived: sizeBytes, totalBytes: input.totalBytes })
    }
    writer.end()
    await waitForWriter(writer)
    await rename(input.partialPath, input.outputPath)
    return {
      ok: true,
      filePath: input.outputPath,
      sizeBytes,
      sha256: hash.digest('hex'),
      finalRef: input.finalRef,
    }
  } catch (error) {
    return cleanupWriterAndFail(writer, input.partialPath, input.outputPath, {
      ok: false,
      code: 'download_failed',
      detail: sanitizeElectronNetDownloadError(error),
      finalRef: input.finalRef,
    })
  }
}

async function appendNodeReadableToPartialFile(input: Readonly<{
  response: NodeJS.ReadableStream
  partialPath: string
  metadataPath: string
  descriptor: PackageDownloadResumeDescriptor
  maxBytes: number
  totalBytes: number
  initialBytes: number
  finalRef?: string | null
  retryCount: number
  onProgress?: (progress: PackageDownloadProgress) => void
}>): Promise<PackageDownloadFileTransportResult> {
  let sizeBytes = input.initialBytes
  const writer = createWriteStream(input.partialPath, { flags: input.initialBytes > 0 ? 'a' : 'w' })
  const existingMetadata = await readResumeMetadata(input.metadataPath)
  const baseMetadata = metadataMatchesDescriptor(existingMetadata, input.descriptor)
    ? existingMetadata
    : createResumeMetadata(input.descriptor)
  try {
    for await (const rawChunk of input.response as AsyncIterable<Buffer | Uint8Array | string>) {
      const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
      sizeBytes += chunk.byteLength
      if (sizeBytes > input.maxBytes) {
        return await cleanupWriterAndFail(writer, input.partialPath, '', {
          ok: false,
          code: 'too_large',
          finalRef: input.finalRef,
        }, { keepOutput: true })
      }
      if (!writer.write(chunk)) await once(writer, 'drain')
      await writeResumeMetadata(input.metadataPath, {
        ...baseMetadata,
        currentBytesWritten: sizeBytes,
        retryCount: input.retryCount,
        updatedAt: new Date().toISOString(),
      })
      input.onProgress?.({
        bytesReceived: sizeBytes,
        totalBytes: input.totalBytes,
        retryCount: input.retryCount,
        phase: 'downloading',
      })
    }
    writer.end()
    await waitForWriter(writer)
    return completeExistingPartial(input.partialPath, input.finalRef)
  } catch (error) {
    return cleanupWriterAndFail(writer, input.partialPath, '', {
      ok: false,
      code: 'download_failed',
      detail: sanitizeElectronNetDownloadError(error),
      finalRef: input.finalRef,
    }, { keepOutput: true })
  }
}

async function completeExistingPartial(
  partialPath: string,
  finalRef?: string | null
): Promise<PackageDownloadFileTransportResult> {
  return {
    ok: true,
    filePath: partialPath,
    sizeBytes: await getFileSize(partialPath),
    sha256: await hashFile(partialPath),
    finalRef,
  }
}

function createResumeMetadata(descriptor: PackageDownloadResumeDescriptor): ResumeMetadata {
  const timestamp = new Date().toISOString()
  return {
    pluginId: descriptor.pluginId,
    runtimeId: descriptor.runtimeId,
    packageId: descriptor.packageId,
    releaseTag: descriptor.releaseTag,
    assetName: descriptor.assetName,
    sourceKind: descriptor.sourceKind,
    expectedSizeBytes: descriptor.expectedSizeBytes,
    expectedSha256: descriptor.expectedSha256,
    currentBytesWritten: 0,
    tempArtifactId: descriptor.tempArtifactId,
    rangeSupportMode: descriptor.rangeSupportMode,
    createdAt: timestamp,
    updatedAt: timestamp,
    retryCount: 0,
    terminalDiagnostic: null,
  }
}

async function readResumeMetadata(metadataPath: string): Promise<ResumeMetadata | null> {
  try {
    const parsed = JSON.parse(await readFile(metadataPath, 'utf8')) as Partial<ResumeMetadata>
    if (
      typeof parsed.pluginId === 'string' &&
      typeof parsed.runtimeId === 'string' &&
      typeof parsed.packageId === 'string' &&
      typeof parsed.releaseTag === 'string' &&
      typeof parsed.assetName === 'string' &&
      parsed.sourceKind === 'github_release_asset' &&
      typeof parsed.expectedSizeBytes === 'number' &&
      typeof parsed.expectedSha256 === 'string' &&
      typeof parsed.currentBytesWritten === 'number' &&
      typeof parsed.tempArtifactId === 'string' &&
      (parsed.rangeSupportMode === 'direct_browser_download_url' || parsed.rangeSupportMode === 'redirected_asset_host') &&
      typeof parsed.createdAt === 'string' &&
      typeof parsed.updatedAt === 'string' &&
      typeof parsed.retryCount === 'number'
    ) {
      return {
        pluginId: parsed.pluginId,
        runtimeId: parsed.runtimeId,
        packageId: parsed.packageId,
        releaseTag: parsed.releaseTag,
        assetName: parsed.assetName,
        sourceKind: parsed.sourceKind,
        expectedSizeBytes: parsed.expectedSizeBytes,
        expectedSha256: parsed.expectedSha256,
        currentBytesWritten: parsed.currentBytesWritten,
        tempArtifactId: parsed.tempArtifactId,
        rangeSupportMode: parsed.rangeSupportMode,
        createdAt: parsed.createdAt,
        updatedAt: parsed.updatedAt,
        retryCount: parsed.retryCount,
        terminalDiagnostic: typeof parsed.terminalDiagnostic === 'string' ? parsed.terminalDiagnostic : null,
      }
    }
  } catch {
    return null
  }
  return null
}

async function writeResumeMetadata(metadataPath: string, metadata: ResumeMetadata): Promise<void> {
  await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`)
}

function metadataMatchesDescriptor(
  metadata: ResumeMetadata | null,
  descriptor: PackageDownloadResumeDescriptor
): metadata is ResumeMetadata {
  return !!metadata &&
    metadata.pluginId === descriptor.pluginId &&
    metadata.runtimeId === descriptor.runtimeId &&
    metadata.packageId === descriptor.packageId &&
    metadata.releaseTag === descriptor.releaseTag &&
    metadata.assetName === descriptor.assetName &&
    metadata.sourceKind === descriptor.sourceKind &&
    metadata.expectedSizeBytes === descriptor.expectedSizeBytes &&
    metadata.expectedSha256 === descriptor.expectedSha256 &&
    metadata.tempArtifactId === descriptor.tempArtifactId &&
    metadata.rangeSupportMode === descriptor.rangeSupportMode
}

async function verifiedPartialSize(partialPath: string, expectedSize: number): Promise<number | null> {
  try {
    const info = await stat(partialPath)
    return info.size === expectedSize ? info.size : null
  } catch {
    return expectedSize === 0 ? 0 : null
  }
}

async function getFileSize(filePath: string): Promise<number> {
  try {
    return (await stat(filePath)).size
  } catch {
    return 0
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}

async function cleanupWriterAndFail(
  writer: ReturnType<typeof createWriteStream>,
  partialPath: string,
  outputPath: string,
  result: Exclude<PackageDownloadFileTransportResult, { ok: true }>,
  options: Readonly<{ keepOutput?: boolean }> = {}
): Promise<Exclude<PackageDownloadFileTransportResult, { ok: true }>> {
  writer.destroy()
  await once(writer, 'close').catch(() => undefined)
  if (!options.keepOutput) {
    await Promise.all([removeQuietly(partialPath), removeQuietly(outputPath)])
  }
  return result
}

async function waitForWriter(writer: ReturnType<typeof createWriteStream>): Promise<void> {
  await Promise.race([
    once(writer, 'finish'),
    once(writer, 'error').then(([error]) => {
      throw error
    }),
  ])
}

async function removeQuietly(filePath: string): Promise<void> {
  await rm(filePath, { force: true }).catch(() => undefined)
}

function parseHeaderNumber(value: string | string[] | undefined): number | null {
  const parsed = Number(firstHeader(value) ?? NaN)
  return Number.isFinite(parsed) ? parsed : null
}

function firstHeader(value: string | string[] | undefined): string | null {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && value.length > 0) return value[0]
  return null
}

function normalizeHeaders(raw: unknown): Record<string, string | string[]> {
  if (!raw || typeof raw !== 'object') return {}
  const out: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') out[key.toLowerCase()] = value
    else if (Array.isArray(value)) out[key.toLowerCase()] = value.map((item) => String(item))
  }
  return out
}

function parseContentRange(value: string | null): { start: number; end: number; total: number } | null {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/iu.exec(String(value ?? '').trim())
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  const total = Number(match[3])
  if (![start, end, total].every(Number.isFinite)) return null
  return { start, end, total }
}

function destroyReadable(stream: NodeJS.ReadableStream): void {
  const destroy = (stream as { destroy?: () => void }).destroy
  if (typeof destroy === 'function') destroy.call(stream)
}

function isRetryable(code: Exclude<PackageDownloadFileTransportResult, { ok: true }>['code']): boolean {
  return code === 'download_failed'
}

function sanitizeElectronNetDownloadError(error: unknown): string {
  const code = String((error as any)?.code ?? (error as any)?.message ?? '').trim()
  if (/timeout|timedout|etimedout|abort/iu.test(code)) return 'download_body_timeout'
  if (/econnreset|socket|network|closed|interrupted/iu.test(code)) return 'network_transport_failed'
  return 'download_failed'
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
