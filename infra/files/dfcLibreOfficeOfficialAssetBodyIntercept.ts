import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { rm, stat, rename, mkdir } from 'node:fs/promises'
import { once } from 'node:events'
import path from 'node:path'
import type {
  PackageDownloadFileTransportRequest,
  PackageDownloadFileTransportResult,
  PackageDownloadTransport,
  PackageDownloadTransportRequest,
  PackageDownloadTransportResult,
} from '../../src/next/plugin-distribution/packageDownloader'
import {
  fetchPackageToFileWithFetch,
} from '../../src/next/plugin-distribution/packageDownloader'
import {
  getDfcLibreOfficeFirstPartyRuntimeCatalogEntry,
  type DfcLibreOfficeFirstPartyRuntimeCatalogEntry,
} from './dfcManagedLibreOfficeRuntime'

export const DFC_LIBREOFFICE_M53_ASSET_BODY_INTERCEPT_ENV = 'STARVERSE_DFC_M53_OFFICIAL_ASSET_BODY_INTERCEPT'
export const DFC_LIBREOFFICE_M53_ASSET_BODY_INTERCEPT_SVPKG_ENV = 'STARVERSE_DFC_M53_OFFICIAL_ASSET_BODY_SVPKG'

export type DfcLibreOfficeOfficialAssetBodyInterceptEvidence = Readonly<{
  enabled: boolean
  sourceClass: 'disabled' | 'harness_local_equivalent_to_official_github_asset'
  descriptorMatched: boolean
  localPackageProvided: boolean
  extensionMatched: boolean
  sizeMatched: boolean
  hashMatched: boolean
  diagnosticCode: string | null
}>

export type DfcLibreOfficeOfficialAssetBodyInterceptPreflightResult =
  | Readonly<{
      ok: true
      evidence: DfcLibreOfficeOfficialAssetBodyInterceptEvidence
      packagePath: string
    }>
  | Readonly<{
      ok: false
      evidence: DfcLibreOfficeOfficialAssetBodyInterceptEvidence
    }>

export type DfcLibreOfficeOfficialAssetBodyInterceptInput = Readonly<{
  enabled: boolean
  localPackagePath?: string | null
  catalog?: DfcLibreOfficeFirstPartyRuntimeCatalogEntry
  fallbackTransport?: PackageDownloadTransport
  createReadStreamForTest?: (filePath: string) => NodeJS.ReadableStream
}>

const OFFICIAL_FINAL_REF_HOST = 'https://release-assets.githubusercontent.com'

export function createDfcLibreOfficeOfficialAssetBodyInterceptFromEnv(): PackageDownloadTransport | null {
  if (process.env[DFC_LIBREOFFICE_M53_ASSET_BODY_INTERCEPT_ENV] !== '1') return null
  return createDfcLibreOfficeOfficialAssetBodyInterceptTransport({
    enabled: true,
    localPackagePath: process.env[DFC_LIBREOFFICE_M53_ASSET_BODY_INTERCEPT_SVPKG_ENV] ?? null,
  })
}

export function createDfcLibreOfficeOfficialAssetBodyInterceptTransport(
  input: DfcLibreOfficeOfficialAssetBodyInterceptInput
): PackageDownloadTransport {
  const catalog = input.catalog ?? getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()
  const fallback = input.fallbackTransport ?? defaultFallbackTransport
  return {
    fetchPackage(request) {
      return fallback.fetchPackage(request)
    },
    async fetchPackageToFile(request) {
      if (!input.enabled || !matchesOfficialLibreOfficeAssetRequest(catalog, request.transportRef)) {
        if (fallback.fetchPackageToFile) return fallback.fetchPackageToFile(request)
        return fallbackFetchToFile(request)
      }
      const preflight = await preflightDfcLibreOfficeOfficialAssetBodyInterceptPackage({
        enabled: input.enabled,
        localPackagePath: input.localPackagePath,
        catalog,
        transportRef: request.transportRef,
      })
      if (!preflight.ok) {
        return {
          ok: false,
          code: 'download_failed',
          detail: preflight.evidence.diagnosticCode ?? 'harness_asset_intercept_preflight_failed',
          finalRef: officialFinalRef(catalog),
        }
      }
      return streamLocalOfficialAssetToDownloader({
        packagePath: preflight.packagePath,
        request,
        finalRef: officialFinalRef(catalog),
        createReadStreamForTest: input.createReadStreamForTest,
      })
    },
  }
}

export async function preflightDfcLibreOfficeOfficialAssetBodyInterceptPackage(input: Readonly<{
  enabled: boolean
  localPackagePath?: string | null
  catalog?: DfcLibreOfficeFirstPartyRuntimeCatalogEntry
  transportRef?: string | null
}>): Promise<DfcLibreOfficeOfficialAssetBodyInterceptPreflightResult> {
  const catalog = input.catalog ?? getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()
  const descriptorMatched = !input.transportRef || matchesOfficialLibreOfficeAssetRequest(catalog, input.transportRef)
  const packagePath = String(input.localPackagePath ?? '').trim()
  const baseEvidence = {
    enabled: input.enabled,
    sourceClass: input.enabled ? 'harness_local_equivalent_to_official_github_asset' as const : 'disabled' as const,
    descriptorMatched,
    localPackageProvided: Boolean(packagePath),
    extensionMatched: packagePath.toLowerCase().endsWith('.svpkg'),
    sizeMatched: false,
    hashMatched: false,
  }
  if (!input.enabled) {
    return { ok: false, evidence: { ...baseEvidence, diagnosticCode: 'intercept_disabled' } }
  }
  if (!descriptorMatched) {
    return { ok: false, evidence: { ...baseEvidence, diagnosticCode: 'official_asset_descriptor_mismatch' } }
  }
  if (!packagePath) {
    return { ok: false, evidence: { ...baseEvidence, diagnosticCode: 'local_package_missing' } }
  }
  if (!baseEvidence.extensionMatched) {
    return { ok: false, evidence: { ...baseEvidence, diagnosticCode: 'local_package_extension_invalid' } }
  }
  let file
  try {
    file = await stat(packagePath)
  } catch {
    return { ok: false, evidence: { ...baseEvidence, diagnosticCode: 'local_package_missing' } }
  }
  if (!file.isFile()) {
    return { ok: false, evidence: { ...baseEvidence, diagnosticCode: 'local_package_missing' } }
  }
  const expectedSize = catalog.acquisitionSource.expectedSizeBytes ?? -1
  const sizeMatched = file.size === expectedSize
  if (!sizeMatched) {
    return { ok: false, evidence: { ...baseEvidence, sizeMatched, diagnosticCode: 'local_package_size_mismatch' } }
  }
  const sha256 = await hashFile(packagePath)
  const hashMatched = sha256 === catalog.acquisitionSource.expectedSha256
  if (!hashMatched) {
    return { ok: false, evidence: { ...baseEvidence, sizeMatched, hashMatched, diagnosticCode: 'local_package_hash_mismatch' } }
  }
  return {
    ok: true,
    packagePath,
    evidence: {
      ...baseEvidence,
      sizeMatched,
      hashMatched,
      diagnosticCode: null,
    },
  }
}

function matchesOfficialLibreOfficeAssetRequest(
  catalog: DfcLibreOfficeFirstPartyRuntimeCatalogEntry,
  transportRef: string
): boolean {
  const expectedUrl = catalog.acquisitionSource.sourceUrl
  if (!expectedUrl || transportRef !== expectedUrl) return false
  const packageRef = catalog.acquisitionSource.packageRef ?? ''
  const assetName = packageRef.split('/').filter(Boolean).at(-1) ?? ''
  if (!assetName || !expectedUrl.endsWith(`/${assetName}`)) return false
  return (
    catalog.acquisitionSource.sourceKind === 'github_release_asset' &&
    Number.isInteger(catalog.acquisitionSource.expectedSizeBytes) &&
    (catalog.acquisitionSource.expectedSizeBytes ?? 0) > 0 &&
    /^[a-f0-9]{64}$/u.test(catalog.acquisitionSource.expectedSha256 ?? '')
  )
}

async function streamLocalOfficialAssetToDownloader(input: Readonly<{
  packagePath: string
  request: PackageDownloadFileTransportRequest
  finalRef: string
  createReadStreamForTest?: (filePath: string) => NodeJS.ReadableStream
}>): Promise<PackageDownloadFileTransportResult> {
  const partialPath = `${input.request.outputPath}.partial`
  const hash = createHash('sha256')
  let sizeBytes = 0
  await mkdir(path.dirname(input.request.outputPath), { recursive: true })
  await Promise.all([removeQuietly(partialPath), removeQuietly(input.request.outputPath)])
  const writer = createWriteStream(partialPath, { flags: 'wx' })
  const reader = input.createReadStreamForTest?.(input.packagePath) ?? createReadStream(input.packagePath)
  try {
    for await (const chunk of reader) {
      if (input.request.signal?.aborted) {
        throw new Error('download_cancelled')
      }
      const buffer = Buffer.from(chunk as Buffer)
      sizeBytes += buffer.byteLength
      if (sizeBytes > input.request.maxBytes) {
        await cleanupWriter(writer, partialPath, input.request.outputPath)
        return { ok: false, code: 'too_large', finalRef: input.finalRef }
      }
      hash.update(buffer)
      if (!writer.write(buffer)) await once(writer, 'drain')
      input.request.onProgress?.({ bytesReceived: sizeBytes, totalBytes: null })
    }
    writer.end()
    await Promise.race([
      once(writer, 'finish'),
      once(writer, 'error').then(([error]) => {
        throw error
      }),
    ])
    await rename(partialPath, input.request.outputPath)
    return {
      ok: true,
      filePath: input.request.outputPath,
      sizeBytes,
      sha256: hash.digest('hex'),
      finalRef: input.finalRef,
    }
  } catch (error: any) {
    await cleanupWriter(writer, partialPath, input.request.outputPath)
    return {
      ok: false,
      code: input.request.signal?.aborted || error?.message === 'download_cancelled' ? 'cancelled' : 'download_failed',
      detail: input.request.signal?.aborted ? 'download cancelled' : 'harness_asset_stream_failed',
      finalRef: input.finalRef,
    }
  }
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    hash.update(Buffer.from(chunk as Buffer))
  }
  return hash.digest('hex')
}

async function cleanupWriter(
  writer: ReturnType<typeof createWriteStream>,
  partialPath: string,
  outputPath: string
): Promise<void> {
  writer.destroy()
  if (!(writer as { closed?: boolean }).closed) {
    await once(writer, 'close').catch(() => undefined)
  }
  await Promise.all([removeQuietly(partialPath), removeQuietly(outputPath)])
}

async function removeQuietly(filePath: string): Promise<void> {
  await rm(filePath, { force: true }).catch(() => undefined)
}

function officialFinalRef(catalog: DfcLibreOfficeFirstPartyRuntimeCatalogEntry): string {
  const asset = catalog.acquisitionSource.packageRef?.split('/').filter(Boolean).at(-1) ?? 'asset.svpkg'
  return `${OFFICIAL_FINAL_REF_HOST}/${asset}`
}

function fallbackFetchToFile(request: PackageDownloadFileTransportRequest): Promise<PackageDownloadFileTransportResult> {
  return fetchPackageToFileWithFetch(request)
}

const defaultFallbackTransport: PackageDownloadTransport = {
  async fetchPackage(request: PackageDownloadTransportRequest): Promise<PackageDownloadTransportResult> {
    const response = await fetch(request.transportRef, { signal: request.signal })
    if (!response.ok) return { ok: false, code: 'download_failed', detail: `http_${response.status}` }
    const bytes = new Uint8Array(await response.arrayBuffer())
    if (bytes.byteLength > request.maxBytes) return { ok: false, code: 'too_large', finalRef: response.url }
    return { ok: true, bytes, finalRef: response.url }
  },
  fetchPackageToFile: fallbackFetchToFile,
}
