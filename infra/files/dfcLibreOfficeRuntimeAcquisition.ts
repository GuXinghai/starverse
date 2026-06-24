import { createHash } from 'node:crypto'
import { statSync } from 'node:fs'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  downloadOfficialPackageToMemory,
  type PackageDownloadMemoryResult,
  type PackageDownloadTransport,
} from '../../src/next/plugin-distribution/packageDownloader'
import type { DownloadPolicyCatalogPackageRef } from '../../src/next/plugin-distribution/downloadPolicy'
import { sanitizePluginDistributionText } from '../../src/next/plugin-distribution/sanitization'
import {
  DFC_OFFICE_PDF_PLUGIN_ID,
  DFC_OFFICE_PDF_RUNTIME_ID,
  type DfcLibreOfficeRuntimeAcquisitionSource,
} from './dfcManagedLibreOfficeRuntime'

export type DfcLibreOfficeRuntimeAcquisitionStatus = 'downloaded' | 'skipped' | 'failed' | 'disabled'

export type DfcLibreOfficeRuntimeAcquisitionDiagnosticCode =
  | 'office_pdf_acquisition_disabled'
  | 'office_pdf_acquisition_policy_denied'
  | 'office_pdf_acquisition_platform_unsupported'
  | 'office_pdf_acquisition_cache_rejected'
  | 'office_pdf_acquisition_download_failed'
  | 'office_pdf_acquisition_hash_mismatch'
  | 'office_pdf_acquisition_size_mismatch'
  | 'office_pdf_acquisition_oversized'
  | 'office_pdf_acquisition_timeout'
  | 'office_pdf_acquisition_write_failed'

export type DfcLibreOfficeRuntimeAcquisitionDiagnostic = Readonly<{
  code: DfcLibreOfficeRuntimeAcquisitionDiagnosticCode
  message: string
}>

export type DfcLibreOfficeRuntimeAcquisitionResult =
  | Readonly<{
      ok: true
      acquisitionStatus: 'downloaded'
      source: DfcLibreOfficeRuntimeAcquisitionSource
      packageVersion: string
      runtimeVersion: string
      platform: string
      arch: string
      sha256: string
      sizeBytes: number
      stagingRef: string
      internal: Readonly<{
        stagedPackagePath: string
      }>
      nextStep: 'import'
      productionApproved: false
      ownerGated: true
      experimental: true
      diagnostics: readonly DfcLibreOfficeRuntimeAcquisitionDiagnostic[]
    }>
  | Readonly<{
      ok: false
      acquisitionStatus: 'skipped' | 'failed' | 'disabled'
      source: DfcLibreOfficeRuntimeAcquisitionSource
      packageVersion: string | null
      runtimeVersion: string | null
      platform: string | null
      arch: string | null
      sha256: null
      sizeBytes: null
      stagingRef: null
      internal: null
      nextStep: 'none' | 'ownerApprovalRequired' | 'retry'
      productionApproved: false
      ownerGated: true
      experimental: true
      diagnostics: readonly DfcLibreOfficeRuntimeAcquisitionDiagnostic[]
    }>

export type DfcLibreOfficeRuntimeAcquisitionInput = Readonly<{
  source: DfcLibreOfficeRuntimeAcquisitionSource
  cacheRootDir: string
  transport: PackageDownloadTransport
  allowDownload?: boolean | null
  repoRootDir?: string | null
  platform?: NodeJS.Platform | null
  arch?: string | null
  maxBytes?: number | null
  timeoutMs?: number | null
  allowedOfficialHosts?: readonly string[] | null
}>

const DEFAULT_MAX_BYTES = 1024 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000
const SHA256_RE = /^[a-f0-9]{64}$/u

export async function acquireDfcLibreOfficeOfficialRuntimePackage(
  input: DfcLibreOfficeRuntimeAcquisitionInput
): Promise<DfcLibreOfficeRuntimeAcquisitionResult> {
  const source = input.source
  if (!source.downloadEnabled || source.sourceKind === 'disabled') {
    return blocked('disabled', source, 'office_pdf_acquisition_disabled', 'LibreOffice runtime acquisition is disabled.', 'ownerApprovalRequired')
  }
  if (source.sourceKind === 'manual_import') {
    return blocked('skipped', source, 'office_pdf_acquisition_disabled', 'LibreOffice runtime acquisition requires manual import.', 'none')
  }
  if (input.allowDownload !== true) {
    return blocked('disabled', source, 'office_pdf_acquisition_policy_denied', 'LibreOffice runtime download requires explicit owner-gated approval.', 'ownerApprovalRequired')
  }

  const platform = normalizePlatform(input.platform ?? process.platform)
  const arch = normalizeArch(input.arch ?? process.arch)
  if (!isPlatformCompatible(source.platform, platform) || !isArchCompatible(source.arch, arch)) {
    return blocked('failed', source, 'office_pdf_acquisition_platform_unsupported', 'LibreOffice runtime package is not compatible with this platform.', 'none')
  }

  const cache = normalizeCacheRoot(input.cacheRootDir, input.repoRootDir ?? null)
  if (!cache.ok) {
    return blocked('failed', source, 'office_pdf_acquisition_cache_rejected', cache.message, 'none')
  }

  const packageRef = buildDownloadPackageRef(source)
  if (!packageRef.ok) {
    return blocked('failed', source, 'office_pdf_acquisition_policy_denied', packageRef.message, 'none')
  }

  const controller = new AbortController()
  const timeoutMs = normalizePositiveInteger(input.timeoutMs, DEFAULT_TIMEOUT_MS)
  try {
    const download = await withDownloadTimeout(
      downloadOfficialPackageToMemory({
        packageRef: packageRef.ref,
        policy: {
          maxBytes: normalizePositiveInteger(input.maxBytes, DEFAULT_MAX_BYTES),
          allowedOfficialHosts: input.allowedOfficialHosts ?? [],
        },
        transport: input.transport,
        signal: controller.signal,
      }),
      timeoutMs,
      controller
    )
    if (!download.ok) {
      return blocked(
        download.status === 'cancelled' ? 'failed' : 'failed',
        source,
        mapDownloadFailure(download.failureReasons),
        'LibreOffice runtime package download failed.',
        download.status === 'cancelled' ? 'retry' : 'retry'
      )
    }

    const stagingDir = path.join(cache.root, 'libreoffice-office-pdf', platform, arch)
    const stagingRef = createStagingRef(source, platform, arch)
    const finalPath = path.join(stagingDir, `${stagingRef}.svpkg`)
    const tempPath = path.join(stagingDir, `.${stagingRef}.${Date.now()}.${process.pid}.tmp`)
    try {
      await mkdir(stagingDir, { recursive: true })
      await writeFile(tempPath, Buffer.from(download.stagedPackage.bytes), { flag: 'wx' })
      const verified = await verifyWrittenPackage(tempPath, download.stagedPackage.sha256, download.stagedPackage.sizeBytes)
      if (!verified.ok) {
        await cleanupTemp(tempPath)
        return blocked('failed', source, verified.code, verified.message, 'retry')
      }
      await rename(tempPath, finalPath)
    } catch (error) {
      await cleanupTemp(tempPath)
      return blocked('failed', source, 'office_pdf_acquisition_write_failed', sanitizeMessage(error, 'LibreOffice runtime package staging failed.'), 'retry')
    }

    return {
      ok: true,
      acquisitionStatus: 'downloaded',
      source,
      packageVersion: source.packageVersion ?? download.stagedPackage.pluginVersion,
      runtimeVersion: source.runtimeVersion ?? 'unknown',
      platform,
      arch,
      sha256: download.stagedPackage.sha256,
      sizeBytes: download.stagedPackage.sizeBytes,
      stagingRef,
      internal: {
        stagedPackagePath: finalPath,
      },
      nextStep: 'import',
      productionApproved: false,
      ownerGated: true,
      experimental: true,
      diagnostics: [],
    }
  } finally {
    controller.abort()
  }
}

function buildDownloadPackageRef(
  source: DfcLibreOfficeRuntimeAcquisitionSource
): Readonly<{ ok: true; ref: DownloadPolicyCatalogPackageRef } | { ok: false; message: string }> {
  const packageRef = source.sourceUrl ?? source.packageRef
  if (!packageRef || !source.expectedSha256 || !source.expectedSizeBytes || !source.packageVersion) {
    return { ok: false, message: 'LibreOffice runtime acquisition source metadata is incomplete.' }
  }
  if (!SHA256_RE.test(source.expectedSha256)) {
    return { ok: false, message: 'LibreOffice runtime acquisition source hash is invalid.' }
  }
  if (!Number.isInteger(source.expectedSizeBytes) || source.expectedSizeBytes <= 0) {
    return { ok: false, message: 'LibreOffice runtime acquisition source size is invalid.' }
  }
  return {
    ok: true,
    ref: {
      pluginId: DFC_OFFICE_PDF_PLUGIN_ID,
      pluginVersion: source.packageVersion,
      packageRef,
      sourceKind: 'catalog_official',
      catalogStatus: 'valid_metadata_only',
      installabilityStatus: 'verified_future_install',
      packageSha256: source.expectedSha256,
      packageSizeBytes: source.expectedSizeBytes,
    },
  }
}

function normalizeCacheRoot(
  cacheRootDir: string,
  repoRootDir: string | null
): Readonly<{ ok: true; root: string } | { ok: false; message: string }> {
  if (!cacheRootDir || cacheRootDir.includes('\0')) {
    return { ok: false, message: 'LibreOffice runtime cache root is invalid.' }
  }
  const root = path.resolve(cacheRootDir)
  if (path.basename(root).toLowerCase() === '.artifacts' || root.split(/[\\/]/u).some((part) => part.toLowerCase() === '.artifacts')) {
    return { ok: false, message: 'LibreOffice runtime cache root cannot be under artifact directories.' }
  }
  if (repoRootDir) {
    const repo = path.resolve(repoRootDir)
    const relative = path.relative(repo, root)
    if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
      return { ok: false, message: 'LibreOffice runtime cache root cannot be inside the source repository.' }
    }
  }
  return { ok: true, root }
}

function normalizePlatform(platform: NodeJS.Platform): string {
  return platform === 'win32' || platform === 'darwin' || platform === 'linux' ? platform : platform
}

function normalizeArch(arch: string): string {
  return arch || 'unknown'
}

function isPlatformCompatible(expected: DfcLibreOfficeRuntimeAcquisitionSource['platform'], actual: string): boolean {
  return expected === 'any' || expected === actual
}

function isArchCompatible(expected: DfcLibreOfficeRuntimeAcquisitionSource['arch'], actual: string): boolean {
  return expected === 'any' || expected === actual
}

function normalizePositiveInteger(value: number | null | undefined, fallback: number): number {
  return Number.isInteger(value) && value !== null && value !== undefined && value > 0 ? value : fallback
}

async function verifyWrittenPackage(
  filePath: string,
  expectedSha256: string,
  expectedSizeBytes: number
): Promise<Readonly<{ ok: true } | { ok: false; code: DfcLibreOfficeRuntimeAcquisitionDiagnosticCode; message: string }>> {
  const file = await stat(filePath)
  if (file.size !== expectedSizeBytes) {
    return {
      ok: false,
      code: 'office_pdf_acquisition_size_mismatch',
      message: 'LibreOffice runtime package size did not match verified download metadata.',
    }
  }
  const data = await readFile(filePath)
  const sha256 = createHash('sha256').update(data).digest('hex')
  if (sha256 !== expectedSha256) {
    return {
      ok: false,
      code: 'office_pdf_acquisition_hash_mismatch',
      message: 'LibreOffice runtime package hash did not match verified download metadata.',
    }
  }
  return { ok: true }
}

function mapDownloadFailure(reasons: readonly string[]): DfcLibreOfficeRuntimeAcquisitionDiagnosticCode {
  if (reasons.includes('hash_mismatch')) return 'office_pdf_acquisition_hash_mismatch'
  if (reasons.includes('size_mismatch')) return 'office_pdf_acquisition_size_mismatch'
  if (reasons.includes('download_too_large') || reasons.includes('package_too_large')) return 'office_pdf_acquisition_oversized'
  if (reasons.includes('download_cancelled')) return 'office_pdf_acquisition_timeout'
  return 'office_pdf_acquisition_download_failed'
}

function withDownloadTimeout(
  download: Promise<PackageDownloadMemoryResult>,
  timeoutMs: number,
  controller: AbortController
): Promise<PackageDownloadMemoryResult> {
  return new Promise((resolve) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      controller.abort()
      resolve({
        ok: false,
        status: 'cancelled',
        failureReasons: ['download_cancelled'],
        diagnostics: [{
          code: 'download_cancelled',
          field: 'timeout',
          detail: 'download timed out',
        }],
      })
    }, timeoutMs)
    download.then(
      (result) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve(result)
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        resolve({
          ok: false,
          status: 'failed',
          failureReasons: ['download_failed'],
          diagnostics: [{
            code: 'download_failed',
            field: 'transport',
            detail: 'download transport failed',
          }],
        })
      }
    )
  })
}

function createStagingRef(source: DfcLibreOfficeRuntimeAcquisitionSource, platform: string, arch: string): string {
  const version = source.packageVersion ?? 'unknown'
  return `${DFC_OFFICE_PDF_RUNTIME_ID}-${version}-${platform}-${arch}`.replace(/[^a-z0-9._-]/giu, '_')
}

function blocked(
  status: Exclude<DfcLibreOfficeRuntimeAcquisitionStatus, 'downloaded'>,
  source: DfcLibreOfficeRuntimeAcquisitionSource,
  code: DfcLibreOfficeRuntimeAcquisitionDiagnosticCode,
  message: string,
  nextStep: 'none' | 'ownerApprovalRequired' | 'retry'
): DfcLibreOfficeRuntimeAcquisitionResult {
  return {
    ok: false,
    acquisitionStatus: status,
    source,
    packageVersion: source.packageVersion,
    runtimeVersion: source.runtimeVersion,
    platform: source.platform,
    arch: source.arch,
    sha256: null,
    sizeBytes: null,
    stagingRef: null,
    internal: null,
    nextStep,
    productionApproved: false,
    ownerGated: true,
    experimental: true,
    diagnostics: [{
      code,
      message: sanitizePluginDistributionText(message) ?? 'LibreOffice runtime acquisition failed.',
    }],
  }
}

async function cleanupTemp(tempPath: string): Promise<void> {
  try {
    await rm(tempPath, { force: true })
  } catch {
    // Best-effort cleanup only; diagnostics stay path-redacted at the caller boundary.
  }
}

function sanitizeMessage(error: unknown, fallback: string): string {
  return sanitizePluginDistributionText(error instanceof Error ? error.message : String(error)) ?? fallback
}

export function isDfcLibreOfficeAcquisitionCachePathPresent(filePath: string): boolean {
  try {
    return statSync(filePath).isFile()
  } catch {
    return false
  }
}
