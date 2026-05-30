import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export const DFC_HTML_PDF_RUNTIME_ID = 'playwright-chromium-html-pdf'
export const DFC_HTML_PDF_RUNTIME_PACKAGE_ID = 'starverse.dfc.playwright-chromium'
export const DFC_HTML_PDF_RUNTIME_CAPABILITY = 'html_to_pdf'
export const DFC_HTML_PDF_RUNTIME_MANIFEST = 'manifest.json'

export type DfcHtmlPdfRuntimeDiagnosticCode =
  | 'html_pdf_runtime_missing'
  | 'html_pdf_runtime_manifest_invalid'
  | 'html_pdf_runtime_executable_missing'
  | 'html_pdf_runtime_path_rejected'
  | 'html_pdf_runtime_platform_unsupported'
  | 'html_pdf_runtime_metadata_incomplete'

export type DfcHtmlPdfRuntimeDiagnostic = Readonly<{
  code: DfcHtmlPdfRuntimeDiagnosticCode
  message: string
}>

export type DfcHtmlPdfRuntimeAvailability =
  | Readonly<{
      ok: true
      runtime: DfcHtmlPdfManagedRuntimeSummary
      diagnostics: readonly DfcHtmlPdfRuntimeDiagnostic[]
    }>
  | Readonly<{
      ok: false
      runtime: null
      diagnostics: readonly DfcHtmlPdfRuntimeDiagnostic[]
    }>

export type DfcHtmlPdfManagedRuntimeSummary = Readonly<{
  packageId: string
  runtimeId: string
  platform: string
  arch: string | null
  capabilities: readonly string[]
  playwrightVersion: string
  browserRevision: string
  provenance: string | null
  license: string | null
}>

export type DfcHtmlPdfRuntimeManifest = Readonly<{
  packageId: string
  runtimeId: string
  platform: string
  arch?: string | null
  capabilities?: readonly string[] | null
  executablePath: string
  playwrightVersion: string
  browserRevision: string
  sha256?: string | null
  sizeBytes?: number | null
  provenance?: string | null
  license?: string | null
}>

type RuntimeManifestParseResult =
  | Readonly<{ ok: true; manifest: DfcHtmlPdfRuntimeManifest }>
  | Readonly<{ ok: false; code: 'html_pdf_runtime_manifest_invalid' | 'html_pdf_runtime_metadata_incomplete' }>

const NUL_RE = /\0/u
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/u
const UNC_RE = /^\\\\/u
const FULL_SHA256_RE = /^[a-fA-F0-9]{64}$/u

export function getDfcHtmlPdfManagedRuntimeRoot(appManagedRootDir: string): string {
  return path.join(appManagedRootDir, 'managed-runtimes', 'dfc-html-pdf', DFC_HTML_PDF_RUNTIME_ID)
}

export async function checkDfcHtmlPdfRuntimeAvailability(input: Readonly<{
  managedRuntimeRootDir: string
  platform?: NodeJS.Platform
  arch?: string
}>): Promise<DfcHtmlPdfRuntimeAvailability> {
  const root = normalizeAbsoluteDir(input.managedRuntimeRootDir)
  if (!root) return unavailable('html_pdf_runtime_manifest_invalid', 'HTML PDF browser runtime root is invalid.')

  const manifestPath = path.join(root, DFC_HTML_PDF_RUNTIME_MANIFEST)
  const manifestText = await readFile(manifestPath, 'utf8').catch((error) => {
    if (isNotFound(error)) return null
    return ''
  })
  if (manifestText === null) {
    return unavailable('html_pdf_runtime_missing', 'HTML PDF browser runtime manifest is missing.')
  }
  if (!manifestText) {
    return unavailable('html_pdf_runtime_manifest_invalid', 'HTML PDF browser runtime manifest cannot be read.')
  }

  const parsed = parseManifest(manifestText)
  if (!parsed.ok) {
    return unavailable(parsed.code, parsed.code === 'html_pdf_runtime_metadata_incomplete'
      ? 'HTML PDF browser runtime package metadata is incomplete.'
      : 'HTML PDF browser runtime manifest is invalid.')
  }
  const manifest = parsed.manifest
  const expectedPlatform = input.platform ?? process.platform
  const expectedArch = input.arch ?? process.arch
  if (manifest.platform !== expectedPlatform || (manifest.arch && manifest.arch !== expectedArch)) {
    return unavailable('html_pdf_runtime_platform_unsupported', 'HTML PDF browser runtime does not support this platform.')
  }

  const executable = resolveManagedExecutable(root, manifest.executablePath)
  if (!executable.ok) {
    return unavailable('html_pdf_runtime_path_rejected', 'HTML PDF browser runtime executable path is outside the managed runtime root.')
  }

  const executableStat = await stat(executable.path).catch((error) => {
    if (isNotFound(error)) return null
    return undefined
  })
  if (executableStat === null) {
    return unavailable('html_pdf_runtime_executable_missing', 'HTML PDF browser runtime executable is missing.')
  }
  if (!executableStat?.isFile()) {
    return unavailable('html_pdf_runtime_manifest_invalid', 'HTML PDF browser runtime executable metadata is invalid.')
  }
  if (!hasCompletePackageMetadata(manifest)) {
    return unavailable('html_pdf_runtime_metadata_incomplete', 'HTML PDF browser runtime package metadata is incomplete.')
  }
  if (typeof manifest.sizeBytes === 'number' && manifest.sizeBytes !== executableStat.size) {
    return unavailable('html_pdf_runtime_manifest_invalid', 'HTML PDF browser runtime executable size does not match the manifest.')
  }
  if (manifest.sha256) {
    const bytes = await readFile(executable.path).catch(() => null)
    if (!bytes || sha256(bytes) !== manifest.sha256.toLowerCase()) {
      return unavailable('html_pdf_runtime_manifest_invalid', 'HTML PDF browser runtime executable hash does not match the manifest.')
    }
  }

  return {
    ok: true,
    runtime: {
      packageId: manifest.packageId,
      runtimeId: manifest.runtimeId,
      platform: manifest.platform,
      arch: manifest.arch ?? null,
      capabilities: [...(manifest.capabilities ?? [])],
      playwrightVersion: manifest.playwrightVersion,
      browserRevision: manifest.browserRevision,
      provenance: manifest.provenance ?? null,
      license: manifest.license ?? null,
    },
    diagnostics: [],
  }
}

function parseManifest(value: string): RuntimeManifestParseResult {
  try {
    const parsed = JSON.parse(value) as Partial<DfcHtmlPdfRuntimeManifest> | null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalidManifest()
    if (parsed.packageId !== DFC_HTML_PDF_RUNTIME_PACKAGE_ID) return invalidManifest()
    if (parsed.runtimeId !== DFC_HTML_PDF_RUNTIME_ID) return invalidManifest()
    if (!isNonEmpty(parsed.platform)) return invalidManifest()
    if (!isNonEmpty(parsed.executablePath)) return invalidManifest()
    if (!isNonEmpty(parsed.playwrightVersion)) return invalidManifest()
    if (!isNonEmpty(parsed.browserRevision)) return invalidManifest()
    if (parsed.arch != null && !isNonEmpty(parsed.arch)) return invalidManifest()
    if (parsed.capabilities != null && (!Array.isArray(parsed.capabilities) || parsed.capabilities.some((item) => !isNonEmpty(item)))) return invalidManifest()
    if (parsed.sha256 != null && (!isNonEmpty(parsed.sha256) || !FULL_SHA256_RE.test(parsed.sha256))) return invalidManifest()
    if (parsed.sizeBytes != null && (!Number.isFinite(parsed.sizeBytes) || parsed.sizeBytes < 0)) return invalidManifest()
    return {
      ok: true,
      manifest: {
        packageId: parsed.packageId,
        runtimeId: parsed.runtimeId,
        platform: parsed.platform,
        arch: parsed.arch ?? null,
        capabilities: parsed.capabilities ?? [],
        executablePath: parsed.executablePath,
        playwrightVersion: parsed.playwrightVersion,
        browserRevision: parsed.browserRevision,
        sha256: parsed.sha256 ?? null,
        sizeBytes: parsed.sizeBytes ?? null,
        provenance: isNonEmpty(parsed.provenance) ? parsed.provenance : null,
        license: isNonEmpty(parsed.license) ? parsed.license : null,
      },
    }
  } catch {
    return invalidManifest()
  }
}

function invalidManifest(): RuntimeManifestParseResult {
  return { ok: false, code: 'html_pdf_runtime_manifest_invalid' }
}

function resolveManagedExecutable(root: string, executablePath: string): Readonly<{ ok: true; path: string } | { ok: false }> {
  const requested = String(executablePath ?? '').trim()
  if (!requested || NUL_RE.test(requested)) return { ok: false }
  if (UNC_RE.test(requested)) return { ok: false }
  if (WINDOWS_DRIVE_RE.test(requested)) return { ok: false }
  if (path.isAbsolute(requested)) return { ok: false }
  const parts = requested.split(/[\\/]+/u)
  if (parts.some((part) => part === '..')) return { ok: false }
  const resolved = path.resolve(root, requested)
  if (!isPathInside(root, resolved)) return { ok: false }
  return { ok: true, path: resolved }
}

function normalizeAbsoluteDir(value: string): string | null {
  const normalized = String(value ?? '').trim()
  if (!normalized || NUL_RE.test(normalized)) return null
  return path.resolve(normalized)
}

function isPathInside(root: string, candidate: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedCandidate = path.resolve(candidate)
  const rootForCompare = process.platform === 'win32' ? resolvedRoot.toLowerCase() : resolvedRoot
  const candidateForCompare = process.platform === 'win32' ? resolvedCandidate.toLowerCase() : resolvedCandidate
  return candidateForCompare === rootForCompare || candidateForCompare.startsWith(rootForCompare.endsWith(path.sep) ? rootForCompare : `${rootForCompare}${path.sep}`)
}

function isNonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasPackageMetadataShape(value: Partial<DfcHtmlPdfRuntimeManifest>): boolean {
  return isNonEmpty(value.sha256)
    && FULL_SHA256_RE.test(value.sha256)
    && typeof value.sizeBytes === 'number'
    && Number.isFinite(value.sizeBytes)
    && value.sizeBytes >= 0
    && isNonEmpty(value.provenance)
    && isNonEmpty(value.license)
}

function hasCompletePackageMetadata(value: DfcHtmlPdfRuntimeManifest): boolean {
  return hasPackageMetadataShape(value)
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function isNotFound(error: unknown): boolean {
  return !!error && typeof error === 'object' && String((error as any).code ?? '').trim().toUpperCase() === 'ENOENT'
}

function unavailable(code: DfcHtmlPdfRuntimeDiagnosticCode, message: string): DfcHtmlPdfRuntimeAvailability {
  return {
    ok: false,
    runtime: null,
    diagnostics: [{ code, message }],
  }
}
