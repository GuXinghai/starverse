import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { sanitizePluginDistributionText } from './sanitization'
import {
  validateDownloadPolicy,
  type AcceptedDownloadPolicy,
  type DownloadPolicyCatalogPackageRef,
  type DownloadPolicyFailureReason,
  type DownloadPolicyOptions,
} from './downloadPolicy'
import {
  buildProxyFetchInit,
  isProxyFetchInitFailure,
  type NetworkProxySettings,
} from './networkProxy'

export type PackageDownloadTransportRequest = Readonly<{
  transportRef: string
  maxBytes: number
  signal?: AbortSignal
  proxy?: NetworkProxySettings
}>

export type PackageDownloadProgress = Readonly<{
  bytesReceived: number
  totalBytes: number | null
  retryCount?: number
  phase?: 'downloading' | 'retrying' | 'paused_retryable'
}>

export type PackageDownloadResumeDescriptor = Readonly<{
  pluginId: string
  runtimeId: string
  packageId: string
  releaseTag: string
  assetName: string
  sourceKind: 'github_release_asset'
  expectedSizeBytes: number
  expectedSha256: string
  tempArtifactId: string
  rangeSupportMode: 'direct_browser_download_url' | 'redirected_asset_host'
}>

export type PackageDownloadResumeOptions = Readonly<{
  enabled: boolean
  descriptor: PackageDownloadResumeDescriptor
  maxRetries: number
  retryDelayMs: number
}>

export type PackageDownloadFileTransportRequest = Readonly<{
  transportRef: string
  maxBytes: number
  outputPath: string
  signal?: AbortSignal
  onProgress?: (progress: PackageDownloadProgress) => void
  resume?: PackageDownloadResumeOptions
  proxy?: NetworkProxySettings
}>

export type PackageDownloadTransportResult =
  | Readonly<{
      ok: true
      bytes: Uint8Array
      finalRef?: string | null
    }>
  | Readonly<{
      ok: false
      code: 'cancelled' | 'download_failed' | 'redirect_rejected' | 'too_large'
      detail?: string | null
      finalRef?: string | null
    }>

export type PackageDownloadFileTransportResult =
  | Readonly<{
      ok: true
      filePath: string
      sizeBytes: number
      sha256: string
      finalRef?: string | null
    }>
  | Readonly<{
      ok: false
      code:
        | 'cancelled'
        | 'download_failed'
        | 'redirect_rejected'
        | 'too_large'
        | 'resume_range_ignored'
        | 'resume_range_rejected'
        | 'resume_content_range_invalid'
        | 'resume_retries_exhausted'
      detail?: string | null
      finalRef?: string | null
    }>

export type PackageDownloadTransport = Readonly<{
  fetchPackage(request: PackageDownloadTransportRequest): Promise<PackageDownloadTransportResult>
  fetchPackageToFile?(request: PackageDownloadFileTransportRequest): Promise<PackageDownloadFileTransportResult>
}>

export type StagedDownloadedMemoryPackage = Readonly<{
  pluginId: string
  pluginVersion: string
  stageKind: 'memory'
  stagingRef: string
  sizeBytes: number
  sha256: string
  bytes: Uint8Array
}>

export type StagedDownloadedFilePackage = Readonly<{
  pluginId: string
  pluginVersion: string
  stageKind: 'file'
  stagingRef: string
  sizeBytes: number
  sha256: string
  filePath: string
}>

export type StagedDownloadedPackage = StagedDownloadedMemoryPackage | StagedDownloadedFilePackage

export type PackageDownloadFailureReason =
  | DownloadPolicyFailureReason
  | 'download_cancelled'
  | 'download_failed'
  | 'redirect_rejected'
  | 'final_ref_missing'
  | 'download_too_large'
  | 'hash_mismatch'
  | 'size_mismatch'
  | 'resume_range_ignored'
  | 'resume_range_rejected'
  | 'resume_content_range_invalid'
  | 'resume_retries_exhausted'

export type PackageDownloadDiagnostic = Readonly<{
  code: PackageDownloadFailureReason
  field: string
  detail?: string
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

export type PackageDownloadFailureResult = Readonly<{
  ok: false
  status: 'failed' | 'cancelled'
  failureReasons: readonly PackageDownloadFailureReason[]
  diagnostics: readonly PackageDownloadDiagnostic[]
}>

export type PackageDownloadMemoryResult =
  | Readonly<{
      ok: true
      status: 'staged_verified_bytes'
      stagedPackage: StagedDownloadedMemoryPackage
      diagnostics: readonly PackageDownloadDiagnostic[]
    }>
  | PackageDownloadFailureResult

export type PackageDownloadFileResult =
  | Readonly<{
      ok: true
      status: 'staged_verified_file'
      stagedPackage: StagedDownloadedFilePackage
      diagnostics: readonly PackageDownloadDiagnostic[]
    }>
  | PackageDownloadFailureResult

export type PackageDownloadResult = PackageDownloadMemoryResult | PackageDownloadFileResult

export type DownloadOfficialPackageInput = Readonly<{
  packageRef: DownloadPolicyCatalogPackageRef
  policy: DownloadPolicyOptions
  transport: PackageDownloadTransport
  signal?: AbortSignal
  proxy?: NetworkProxySettings
}>

export type DownloadOfficialPackageToFileInput = DownloadOfficialPackageInput & Readonly<{
  outputPath: string
  onProgress?: (progress: PackageDownloadProgress) => void
  resume?: PackageDownloadResumeOptions
}>

export async function downloadOfficialPackageToMemory(
  input: DownloadOfficialPackageInput
): Promise<PackageDownloadMemoryResult> {
  const policyResult = validateDownloadPolicy(input.packageRef, input.policy)
  if (!policyResult.ok) {
    return {
      ok: false,
      status: 'failed',
      failureReasons: policyResult.failureReasons,
      diagnostics: policyResult.diagnostics,
    }
  }

  if (input.signal?.aborted) {
    return fail('cancelled', ['download_cancelled'], [
      { code: 'download_cancelled', field: 'signal', detail: 'download was cancelled before start' },
    ])
  }

  const transportResult = await input.transport.fetchPackage({
    transportRef: policyResult.policy.transportRef,
    maxBytes: policyResult.policy.maxBytes,
    signal: input.signal,
    proxy: input.proxy,
  })

  if (!transportResult.ok) {
    return mapTransportFailure(transportResult)
  }

  const redirectCheck = validateRedirectTarget(policyResult.policy, transportResult.finalRef ?? null, input.policy)
  if (!redirectCheck.ok) {
    return fail('failed', [redirectCheck.reason], [
      { code: redirectCheck.reason, field: 'transport.finalRef', detail: redirectCheck.detail },
    ])
  }

  const bytes = transportResult.bytes
  if (bytes.byteLength > policyResult.policy.maxBytes) {
    return fail('failed', ['download_too_large'], [
      { code: 'download_too_large', field: 'bytes', detail: 'download exceeded maximum byte limit' },
    ])
  }
  if (bytes.byteLength !== policyResult.policy.expectedSizeBytes) {
    return fail('failed', ['size_mismatch'], [
      { code: 'size_mismatch', field: 'bytes', detail: 'downloaded size did not match catalog metadata' },
    ])
  }
  const sha256 = createHash('sha256').update(Buffer.from(bytes)).digest('hex')
  if (sha256 !== policyResult.policy.expectedSha256) {
    return fail('failed', ['hash_mismatch'], [
      { code: 'hash_mismatch', field: 'bytes', detail: 'downloaded hash did not match catalog metadata' },
    ])
  }

  return {
    ok: true,
    status: 'staged_verified_bytes',
    stagedPackage: {
      pluginId: policyResult.policy.pluginId,
      pluginVersion: policyResult.policy.pluginVersion,
      stageKind: 'memory',
      stagingRef: createStagingRef(policyResult.policy),
      sizeBytes: bytes.byteLength,
      sha256,
      bytes,
    },
    diagnostics: [],
  }
}

export async function downloadOfficialPackageToFile(
  input: DownloadOfficialPackageToFileInput
): Promise<PackageDownloadFileResult> {
  const policyResult = validateDownloadPolicy(input.packageRef, input.policy)
  if (!policyResult.ok) {
    return {
      ok: false,
      status: 'failed',
      failureReasons: policyResult.failureReasons,
      diagnostics: policyResult.diagnostics,
    }
  }

  if (input.signal?.aborted) {
    return fail('cancelled', ['download_cancelled'], [
      { code: 'download_cancelled', field: 'signal', detail: 'download was cancelled before start' },
    ])
  }

  if (!input.transport.fetchPackageToFile) {
    return fail('failed', ['download_failed'], [
      { code: 'download_failed', field: 'transport', detail: 'streaming package transport is unavailable' },
    ])
  }

  const transportResult = await input.transport.fetchPackageToFile({
    transportRef: policyResult.policy.transportRef,
    maxBytes: policyResult.policy.maxBytes,
    outputPath: input.outputPath,
    signal: input.signal,
    onProgress: input.onProgress,
    resume: input.resume,
    proxy: input.proxy,
  })

  if (!transportResult.ok) {
    return mapTransportFailure(transportResult)
  }

  const redirectCheck = validateRedirectTarget(policyResult.policy, transportResult.finalRef ?? null, input.policy)
  if (!redirectCheck.ok) {
    await removeQuietly(transportResult.filePath)
    return fail('failed', [redirectCheck.reason], [
      { code: redirectCheck.reason, field: 'transport.finalRef', detail: redirectCheck.detail },
    ])
  }

  if (transportResult.sizeBytes > policyResult.policy.maxBytes) {
    await removeQuietly(transportResult.filePath)
    return fail('failed', ['download_too_large'], [
      { code: 'download_too_large', field: 'file', detail: 'download exceeded maximum byte limit' },
    ])
  }
  if (transportResult.sizeBytes !== policyResult.policy.expectedSizeBytes) {
    await removeQuietly(transportResult.filePath)
    return fail('failed', ['size_mismatch'], [
      { code: 'size_mismatch', field: 'file', detail: 'downloaded size did not match catalog metadata' },
    ])
  }
  if (transportResult.sha256 !== policyResult.policy.expectedSha256) {
    await removeQuietly(transportResult.filePath)
    return fail('failed', ['hash_mismatch'], [
      { code: 'hash_mismatch', field: 'file', detail: 'downloaded hash did not match catalog metadata' },
    ])
  }

  return {
    ok: true,
    status: 'staged_verified_file',
    stagedPackage: {
      pluginId: policyResult.policy.pluginId,
      pluginVersion: policyResult.policy.pluginVersion,
      stageKind: 'file',
      stagingRef: createStagingRef(policyResult.policy),
      sizeBytes: transportResult.sizeBytes,
      sha256: transportResult.sha256,
      filePath: transportResult.filePath,
    },
    diagnostics: [],
  }
}

export async function fetchPackageToFileWithFetch(
  request: PackageDownloadFileTransportRequest
): Promise<PackageDownloadFileTransportResult> {
  if (request.resume?.enabled) {
    return fetchPackageToFileWithResume(request)
  }
  const init = buildProxyFetchInit(request.proxy, request.transportRef, { signal: request.signal })
  if (isProxyFetchInitFailure(init)) {
    return { ok: false, code: 'download_failed', detail: init.diagnosticCode }
  }
  let response: Response
  try {
    response = await fetch(request.transportRef, init)
  } catch (error: any) {
    return {
      ok: false,
      code: request.signal?.aborted ? 'cancelled' : 'download_failed',
      detail: request.signal?.aborted ? 'download cancelled' : sanitizeNetworkDetail(error),
    }
  }
  if (!response.ok) {
    return { ok: false, code: 'download_failed', detail: `http_${response.status}` }
  }
  const contentLength = parseContentLength(response.headers.get('content-length'))
  if (contentLength != null && contentLength > request.maxBytes) {
    return { ok: false, code: 'too_large', finalRef: response.url }
  }
  if (!response.body) {
    return { ok: false, code: 'download_failed', detail: 'response body unavailable', finalRef: response.url }
  }
  return streamReadableResponseToFile({
    body: response.body,
    outputPath: request.outputPath,
    maxBytes: request.maxBytes,
    totalBytes: contentLength,
    finalRef: response.url,
    signal: request.signal,
    onProgress: request.onProgress,
  })
}

async function fetchPackageToFileWithResume(
  request: PackageDownloadFileTransportRequest
): Promise<PackageDownloadFileTransportResult> {
  const resume = request.resume
  if (!resume?.enabled) return fetchPackageToFileWithFetch({ ...request, resume: undefined })
  const partialPath = `${request.outputPath}.partial`
  const metadataPath = `${request.outputPath}.partial.json`
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
    if (request.signal?.aborted) {
      await Promise.all([removeQuietly(partialPath), removeQuietly(metadataPath)])
      return { ok: false, code: 'cancelled', detail: 'download cancelled' }
    }

    const currentBytes = await verifiedPartialSize(partialPath, metadata.currentBytesWritten)
    if (currentBytes === null) {
      await Promise.all([removeQuietly(partialPath), removeQuietly(metadataPath)])
      return { ok: false, code: 'download_failed', detail: 'resume_partial_metadata_mismatch' }
    }
    metadata = { ...metadata, currentBytesWritten: currentBytes, updatedAt: new Date().toISOString() }
    await writeResumeMetadata(metadataPath, metadata)

    const attempt = await fetchResumeAttempt({
      request,
      partialPath,
      metadataPath,
      resume,
      currentBytes,
      retryCount: retries,
    })

    if (attempt.ok) {
      await rename(partialPath, request.outputPath)
      await removeQuietly(metadataPath)
      const digest = await hashFile(request.outputPath)
      return {
        ok: true,
        filePath: request.outputPath,
        sizeBytes: attempt.sizeBytes,
        sha256: digest,
        finalRef: attempt.finalRef,
      }
    }

    if (attempt.code === 'cancelled' || !isRetryableResumeFailure(attempt.code)) {
      if (attempt.code !== 'resume_retries_exhausted') {
        await Promise.all([removeQuietly(partialPath), removeQuietly(metadataPath)])
      }
      return attempt
    }

    retries += 1
    metadata = {
      ...metadata,
      currentBytesWritten: await getFileSize(partialPath),
      retryCount: retries,
      terminalDiagnostic: attempt.code,
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
      metadata = { ...metadata, terminalDiagnostic: 'resume_retries_exhausted', updatedAt: new Date().toISOString() }
      await writeResumeMetadata(metadataPath, metadata)
      request.onProgress?.({
        bytesReceived: metadata.currentBytesWritten,
        totalBytes: resume.descriptor.expectedSizeBytes,
        retryCount: retries,
        phase: 'paused_retryable',
      })
      return {
        ok: false,
        code: 'resume_retries_exhausted',
        detail: 'resume retries exhausted',
      }
    }
    try {
      await delay(resume.retryDelayMs, request.signal)
    } catch {
      await Promise.all([removeQuietly(partialPath), removeQuietly(metadataPath)])
      return { ok: false, code: 'cancelled', detail: 'download cancelled' }
    }
  }
}

async function fetchResumeAttempt(input: Readonly<{
  request: PackageDownloadFileTransportRequest
  partialPath: string
  metadataPath: string
  resume: PackageDownloadResumeOptions
  currentBytes: number
  retryCount: number
}>): Promise<PackageDownloadFileTransportResult> {
  const headers: Record<string, string> = {}
  if (input.currentBytes > 0) headers.Range = `bytes=${input.currentBytes}-`
  let response: Response
  try {
    const init = buildProxyFetchInit(input.request.proxy, input.request.transportRef, {
      signal: input.request.signal,
      headers,
    })
    if (isProxyFetchInitFailure(init)) {
      return {
        ok: false,
        code: input.request.signal?.aborted ? 'cancelled' : 'download_failed',
        detail: input.request.signal?.aborted ? 'download cancelled' : init.diagnosticCode,
      }
    }
    response = await fetch(input.request.transportRef, init)
  } catch (error: any) {
    return {
      ok: false,
      code: input.request.signal?.aborted ? 'cancelled' : 'download_failed',
      detail: input.request.signal?.aborted ? 'download cancelled' : sanitizeNetworkDetail(error),
    }
  }

  const finalRef = response.url
  if (input.currentBytes > 0) {
    if (response.status === 200) {
      await response.body?.cancel().catch(() => undefined)
      return { ok: false, code: 'resume_range_ignored', detail: 'resume range ignored', finalRef }
    }
    if (response.status === 416) {
      await response.body?.cancel().catch(() => undefined)
      const localSize = await getFileSize(input.partialPath)
      if (localSize === input.resume.descriptor.expectedSizeBytes) {
        return completeExistingPartial(input.partialPath, finalRef)
      }
      return { ok: false, code: 'resume_range_rejected', detail: 'resume range rejected', finalRef }
    }
    if (response.status !== 206) {
      await response.body?.cancel().catch(() => undefined)
      return { ok: false, code: 'download_failed', detail: `http_${response.status}`, finalRef }
    }
    const contentRange = parseContentRange(response.headers.get('content-range'))
    if (
      !contentRange ||
      contentRange.start !== input.currentBytes ||
      contentRange.total !== input.resume.descriptor.expectedSizeBytes
    ) {
      await response.body?.cancel().catch(() => undefined)
      return { ok: false, code: 'resume_content_range_invalid', detail: 'resume content range invalid', finalRef }
    }
  } else if (!response.ok) {
    await response.body?.cancel().catch(() => undefined)
    return { ok: false, code: 'download_failed', detail: `http_${response.status}`, finalRef }
  }

  const totalBytes = input.resume.descriptor.expectedSizeBytes
  const contentLength = parseContentLength(response.headers.get('content-length'))
  if (input.currentBytes === 0 && contentLength != null && contentLength > input.request.maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    return { ok: false, code: 'too_large', finalRef }
  }
  if (!response.body) {
    return { ok: false, code: 'download_failed', detail: 'response body unavailable', finalRef }
  }

  return appendReadableResponseToPartialFile({
    body: response.body,
    partialPath: input.partialPath,
    metadataPath: input.metadataPath,
    descriptor: input.resume.descriptor,
    maxBytes: input.request.maxBytes,
    totalBytes,
    initialBytes: input.currentBytes,
    finalRef,
    signal: input.request.signal,
    retryCount: input.retryCount,
    onProgress: input.request.onProgress,
  })
}

function validateRedirectTarget(
  policy: AcceptedDownloadPolicy,
  finalRef: string | null,
  options: DownloadPolicyOptions
): Readonly<{ ok: true } | { ok: false; reason: 'redirect_rejected' | 'final_ref_missing'; detail: string }> {
  if (policy.sourceKind !== 'catalog_official') return { ok: true }
  if (!finalRef) {
    return {
      ok: false,
      reason: 'final_ref_missing',
      detail: 'download transport must report final HTTPS official package reference',
    }
  }
  let parsed: URL
  try {
    parsed = new URL(finalRef)
  } catch {
    return { ok: false, reason: 'redirect_rejected', detail: 'redirect target must remain HTTPS official source' }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'redirect_rejected', detail: 'redirect target must remain HTTPS' }
  }
  if (!options.allowedOfficialHosts?.length) {
    return { ok: false, reason: 'redirect_rejected', detail: 'official host allowlist is required' }
  }
  const hostAllowed = options.allowedOfficialHosts.some((host) => parsed.hostname.toLowerCase() === host.toLowerCase())
  if (!hostAllowed) {
    return { ok: false, reason: 'redirect_rejected', detail: 'redirect host is not official' }
  }
  return { ok: true }
}

function mapTransportFailure(
  result: Exclude<PackageDownloadTransportResult | PackageDownloadFileTransportResult, { ok: true }>
): PackageDownloadFailureResult {
  switch (result.code) {
    case 'cancelled':
      return fail('cancelled', ['download_cancelled'], [
        { code: 'download_cancelled', field: 'transport', detail: result.detail ?? 'download cancelled' },
      ])
    case 'redirect_rejected':
      return fail('failed', ['redirect_rejected'], [
        { code: 'redirect_rejected', field: 'transport', detail: result.detail ?? 'redirect rejected' },
      ])
    case 'too_large':
      return fail('failed', ['download_too_large'], [
        { code: 'download_too_large', field: 'transport', detail: result.detail ?? 'download too large' },
      ])
    case 'resume_range_ignored':
      return fail('failed', ['resume_range_ignored'], [
        { code: 'resume_range_ignored', field: 'transport', detail: result.detail ?? 'resume range ignored' },
      ])
    case 'resume_range_rejected':
      return fail('failed', ['resume_range_rejected'], [
        { code: 'resume_range_rejected', field: 'transport', detail: result.detail ?? 'resume range rejected' },
      ])
    case 'resume_content_range_invalid':
      return fail('failed', ['resume_content_range_invalid'], [
        { code: 'resume_content_range_invalid', field: 'transport', detail: result.detail ?? 'resume content range invalid' },
      ])
    case 'resume_retries_exhausted':
      return fail('failed', ['resume_retries_exhausted'], [
        { code: 'resume_retries_exhausted', field: 'transport', detail: result.detail ?? 'resume retries exhausted' },
      ])
    default:
      return fail('failed', ['download_failed'], [
        { code: 'download_failed', field: 'transport', detail: result.detail ?? 'download failed' },
      ])
  }
}

async function appendReadableResponseToPartialFile(input: Readonly<{
  body: ReadableStream<Uint8Array>
  partialPath: string
  metadataPath: string
  descriptor: PackageDownloadResumeDescriptor
  maxBytes: number
  totalBytes: number
  initialBytes: number
  finalRef?: string | null
  signal?: AbortSignal
  retryCount: number
  onProgress?: (progress: PackageDownloadProgress) => void
}>): Promise<PackageDownloadFileTransportResult> {
  const reader = input.body.getReader()
  let sizeBytes = input.initialBytes
  const writer = createWriteStream(input.partialPath, { flags: input.initialBytes > 0 ? 'a' : 'w' })
  const existingMetadata = await readResumeMetadata(input.metadataPath)
  const baseMetadata = metadataMatchesDescriptor(existingMetadata, input.descriptor)
    ? existingMetadata
    : createResumeMetadata(input.descriptor)
  try {
    while (true) {
      if (input.signal?.aborted) throw new DownloadCancelledError()
      const { value, done } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
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
    await Promise.race([
      once(writer, 'finish'),
      once(writer, 'error').then(([error]) => {
        throw error
      }),
    ])
    return completeExistingPartial(input.partialPath, input.finalRef)
  } catch (error: any) {
    const cancelled = input.signal?.aborted || error instanceof DownloadCancelledError
    return cleanupWriterAndFail(writer, input.partialPath, '', {
      ok: false,
      code: cancelled ? 'cancelled' : 'download_failed',
      detail: cancelled ? 'download cancelled' : sanitizeNetworkDetail(error),
      finalRef: input.finalRef,
    }, { keepOutput: true })
  } finally {
    reader.releaseLock()
  }
}

async function completeExistingPartial(
  partialPath: string,
  finalRef?: string | null
): Promise<PackageDownloadFileTransportResult> {
  const sizeBytes = await getFileSize(partialPath)
  return {
    ok: true,
    filePath: partialPath,
    sizeBytes,
    sha256: await hashFile(partialPath),
    finalRef,
  }
}

function createStagingRef(policy: AcceptedDownloadPolicy): string {
  return `staged_${policy.pluginId}_${policy.pluginVersion}`.replace(/[^a-z0-9._-]/giu, '_')
}

async function streamReadableResponseToFile(input: Readonly<{
  body: ReadableStream<Uint8Array>
  outputPath: string
  maxBytes: number
  totalBytes: number | null
  finalRef?: string | null
  signal?: AbortSignal
  onProgress?: (progress: PackageDownloadProgress) => void
}>): Promise<PackageDownloadFileTransportResult> {
  const partialPath = `${input.outputPath}.partial`
  const hash = createHash('sha256')
  let sizeBytes = 0
  const reader = input.body.getReader()

  await mkdir(dirname(input.outputPath), { recursive: true })
  await Promise.all([removeQuietly(partialPath), removeQuietly(input.outputPath)])
  const writer = createWriteStream(partialPath, { flags: 'wx' })

  try {
    while (true) {
      if (input.signal?.aborted) {
        throw new DownloadCancelledError()
      }
      const { value, done } = await reader.read()
      if (done) break
      const chunk = Buffer.from(value)
      sizeBytes += chunk.byteLength
      if (sizeBytes > input.maxBytes) {
        return await cleanupWriterAndFail(writer, partialPath, input.outputPath, {
          ok: false,
          code: 'too_large',
          finalRef: input.finalRef,
        })
      }
      hash.update(chunk)
      if (!writer.write(chunk)) {
        await once(writer, 'drain')
      }
      input.onProgress?.({ bytesReceived: sizeBytes, totalBytes: input.totalBytes })
    }

    writer.end()
    await Promise.race([
      once(writer, 'finish'),
      once(writer, 'error').then(([error]) => {
        throw error
      }),
    ])
    await rename(partialPath, input.outputPath)
    return {
      ok: true,
      filePath: input.outputPath,
      sizeBytes,
      sha256: hash.digest('hex'),
      finalRef: input.finalRef,
    }
  } catch (error: any) {
    const cancelled = input.signal?.aborted || error instanceof DownloadCancelledError
    return cleanupWriterAndFail(writer, partialPath, input.outputPath, {
      ok: false,
      code: cancelled ? 'cancelled' : 'download_failed',
      detail: cancelled ? 'download cancelled' : error?.message ?? 'streaming download failed',
      finalRef: input.finalRef,
    })
  } finally {
    reader.releaseLock()
  }
}

async function cleanupWriterAndFail(
  writer: ReturnType<typeof createWriteStream>,
  partialPath: string,
  outputPath: string,
  result: Exclude<PackageDownloadFileTransportResult, { ok: true }>,
  options: Readonly<{ keepOutput?: boolean }> = {}
): Promise<Exclude<PackageDownloadFileTransportResult, { ok: true }>> {
  writer.destroy()
  if (!(writer as { closed?: boolean }).closed) {
    await once(writer, 'close').catch(() => undefined)
  }
  if (!options.keepOutput) {
    await Promise.all([removeQuietly(partialPath), removeQuietly(outputPath)])
  }
  return result
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
  return Boolean(metadata) &&
    metadata!.pluginId === descriptor.pluginId &&
    metadata!.runtimeId === descriptor.runtimeId &&
    metadata!.packageId === descriptor.packageId &&
    metadata!.releaseTag === descriptor.releaseTag &&
    metadata!.assetName === descriptor.assetName &&
    metadata!.sourceKind === descriptor.sourceKind &&
    metadata!.expectedSizeBytes === descriptor.expectedSizeBytes &&
    metadata!.expectedSha256 === descriptor.expectedSha256 &&
    metadata!.tempArtifactId === descriptor.tempArtifactId &&
    metadata!.rangeSupportMode === descriptor.rangeSupportMode
}

async function verifiedPartialSize(partialPath: string, expectedSize: number): Promise<number | null> {
  if (expectedSize === 0) return 0
  const actual = await getFileSize(partialPath)
  return actual === expectedSize ? actual : null
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
  await new Promise<void>((resolve, reject) => {
    const reader = createReadStream(filePath)
    reader.on('data', (chunk) => hash.update(chunk))
    reader.on('error', reject)
    reader.on('end', resolve)
  })
  return hash.digest('hex')
}

function parseContentRange(value: string | null): Readonly<{ start: number; end: number; total: number }> | null {
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+)$/iu.exec(String(value ?? '').trim())
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  const total = Number(match[3])
  return Number.isFinite(start) && Number.isFinite(end) && Number.isFinite(total)
    ? { start, end, total }
    : null
}

function isRetryableResumeFailure(code: Exclude<PackageDownloadFileTransportResult, { ok: true }>['code']): boolean {
  return code === 'download_failed'
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    if (signal) {
      if (signal.aborted) {
        clearTimeout(timer)
        reject(new DownloadCancelledError())
      } else {
        signal.addEventListener('abort', () => {
          clearTimeout(timer)
          reject(new DownloadCancelledError())
        }, { once: true })
      }
    }
  })
}

function sanitizeNetworkDetail(error: any): string {
  const code = String(error?.cause?.code ?? error?.code ?? error?.message ?? 'download_failed')
  return /^[a-z0-9_:-]{1,80}$/iu.test(code) ? code.toLowerCase() : 'download_failed'
}

function parseContentLength(value: string | null): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

async function removeQuietly(filePath: string): Promise<void> {
  await rm(filePath, { force: true }).catch(() => undefined)
}

class DownloadCancelledError extends Error {}

function fail(
  status: 'failed' | 'cancelled',
  failureReasons: readonly PackageDownloadFailureReason[],
  diagnostics: readonly PackageDownloadDiagnostic[]
): PackageDownloadFailureResult {
  return {
    ok: false,
    status,
    failureReasons: uniqueFailures(failureReasons),
    diagnostics: diagnostics.map((entry) => ({
      ...entry,
      detail: sanitizePluginDistributionText(entry.detail),
    })),
  }
}

function uniqueFailures(values: readonly PackageDownloadFailureReason[]): readonly PackageDownloadFailureReason[] {
  const seen = new Set<PackageDownloadFailureReason>()
  const out: PackageDownloadFailureReason[] = []
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      out.push(value)
    }
  }
  return out
}
