import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { parseManagedEnginePluginManifest } from '../../src/next/file-type/externalEngineManifest'
import type { EnginePlatform, ManagedEnginePluginManifest } from '../../src/next/file-type/externalEngineTypes'

export const DFC_OFFICE_PDF_ENGINE_ID = 'libreoffice'
export const DFC_OFFICE_PDF_PLUGIN_ID = 'libreoffice'
export const DFC_OFFICE_PDF_RUNTIME_ID = 'libreoffice-office-pdf'
export const DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID = 'starverse.dfc.libreoffice'
export const DFC_OFFICE_PDF_CAPABILITIES = ['office_to_pdf', 'docx_to_pdf'] as const
export const DFC_OFFICE_PDF_RUNTIME_MANIFEST = 'manifest.json'
export const DFC_OFFICE_PDF_MIN_CONTRACT_VERSION = '1'
export const DFC_OFFICE_PDF_RUNTIME_KIND = 'managed_external_process'

export type DfcOfficePdfRuntimeDiagnosticCode =
  | 'office_pdf_runtime_missing'
  | 'office_pdf_runtime_disabled'
  | 'office_pdf_runtime_manifest_invalid'
  | 'office_pdf_runtime_executable_missing'
  | 'office_pdf_runtime_path_rejected'
  | 'office_pdf_runtime_platform_unsupported'
  | 'office_pdf_runtime_metadata_incomplete'

export type DfcOfficePdfRuntimeDiagnostic = Readonly<{
  code: DfcOfficePdfRuntimeDiagnosticCode
  message: string
}>

export type DfcOfficePdfRuntimeAvailability =
  | Readonly<{
      ok: true
      runtime: DfcOfficePdfManagedRuntimeSummary
      diagnostics: readonly DfcOfficePdfRuntimeDiagnostic[]
    }>
  | Readonly<{
      ok: false
      runtime: null
      diagnostics: readonly DfcOfficePdfRuntimeDiagnostic[]
    }>

export type DfcOfficePdfManagedRuntimeSummary = Readonly<{
  pluginId: string
  packageId: string
  runtimePackageId: string
  engineId: string
  runtimeId: string
  displayName: string
  pluginVersion: string
  runtimeKind: string
  platform: string
  arch: string | null
  capabilities: readonly string[]
  libreOfficeVersion: string
  packageVersion: string
  minimumStarverseContractVersion: string
  provenance: string | null
  licenseId: string | null
  attribution: string | null
  officialRelease: DfcOfficePdfRuntimeOfficialRelease | null
}>

export type DfcOfficePdfManagedRuntimeExecutionDescriptor = DfcOfficePdfManagedRuntimeSummary & Readonly<{
  managedRuntimeRootDir: string
  executablePath: string
}>

export type DfcOfficePdfRuntimeExecutionAvailability =
  | Readonly<{
      ok: true
      runtime: DfcOfficePdfManagedRuntimeExecutionDescriptor
      diagnostics: readonly DfcOfficePdfRuntimeDiagnostic[]
    }>
  | Readonly<{
      ok: false
      runtime: null
      diagnostics: readonly DfcOfficePdfRuntimeDiagnostic[]
    }>

export type DfcOfficePdfRuntimeManifest = Readonly<{
  manifestSchemaVersion?: string | null
  pluginId?: string | null
  packageId: string
  runtimePackageId?: string | null
  engineId: string
  runtimeId: string
  displayName?: string | null
  pluginVersion?: string | null
  runtimeKind?: string | null
  enabled?: boolean | null
  platform: string
  arch?: string | null
  executablePath: string
  libreOfficeVersion: string
  packageVersion: string
  artifactSha256?: string | null
  executableSha256?: string | null
  executableSizeBytes?: number | null
  provenance?: string | null
  licenseId?: string | null
  attribution?: string | null
  notices?: readonly string[] | null
  capabilities?: readonly string[] | null
  minimumStarverseContractVersion: string
  officialRelease?: DfcOfficePdfRuntimeOfficialRelease | null
  securityPolicy?: Readonly<{
    macrosDisabled?: boolean | null
    networkDisabled?: boolean | null
    externalLinksDisabled?: boolean | null
    embeddedObjectExecutionDisabled?: boolean | null
    isolatedProfileRequired?: boolean | null
  }> | null
}>

export type DfcOfficePdfRuntimeOfficialRelease = Readonly<{
  sourceKind: 'official' | 'development' | 'test_fixture'
  packageRef: string
  releaseTag?: string | null
  provenance?: string | null
}>

type RuntimeManifestParseResult =
  | Readonly<{ ok: true; manifest: DfcOfficePdfRuntimeManifest }>
  | Readonly<{ ok: false; code: 'office_pdf_runtime_manifest_invalid' | 'office_pdf_runtime_metadata_incomplete' }>

const NUL_RE = /\0/u
const WINDOWS_DRIVE_RE = /^[A-Za-z]:[\\/]/u
const UNC_RE = /^\\\\/u
const FULL_SHA256_RE = /^[a-fA-F0-9]{64}$/u

export function getDfcLibreOfficeManagedRuntimeRoot(appManagedRootDir: string): string {
  return path.join(appManagedRootDir, 'managed-runtimes', 'dfc-office-pdf', DFC_OFFICE_PDF_RUNTIME_ID)
}

export async function checkDfcLibreOfficeRuntimeAvailability(input: Readonly<{
  managedRuntimeRootDir: string
  platform?: NodeJS.Platform
  arch?: string
  pluginEnabled?: boolean | null
}>): Promise<DfcOfficePdfRuntimeAvailability> {
  const result = await resolveDfcLibreOfficeRuntimeExecutionDescriptor(input)
  if (!result.ok) return result
  const { managedRuntimeRootDir: _managedRuntimeRootDir, executablePath: _executablePath, ...runtime } = result.runtime
  return {
    ok: true,
    runtime,
    diagnostics: result.diagnostics,
  }
}

export async function resolveDfcLibreOfficeRuntimeExecutionDescriptor(input: Readonly<{
  managedRuntimeRootDir: string
  platform?: NodeJS.Platform
  arch?: string
  pluginEnabled?: boolean | null
}>): Promise<DfcOfficePdfRuntimeExecutionAvailability> {
  const root = normalizeAbsoluteDir(input.managedRuntimeRootDir)
  if (!root) return unavailable('office_pdf_runtime_manifest_invalid', 'Office PDF runtime root is invalid.')
  if (input.pluginEnabled === false) {
    return unavailable('office_pdf_runtime_disabled', 'Office PDF managed runtime is disabled.')
  }

  const manifestPath = path.join(root, DFC_OFFICE_PDF_RUNTIME_MANIFEST)
  const manifestText = await readFile(manifestPath, 'utf8').catch((error) => {
    if (isNotFound(error)) return null
    return ''
  })
  if (manifestText === null) {
    return unavailable('office_pdf_runtime_missing', 'Office PDF runtime manifest is missing.')
  }
  if (!manifestText) {
    return unavailable('office_pdf_runtime_manifest_invalid', 'Office PDF runtime manifest cannot be read.')
  }

  const parsed = parseManifest(manifestText)
  if (!parsed.ok) {
    return unavailable(parsed.code, parsed.code === 'office_pdf_runtime_metadata_incomplete'
      ? 'Office PDF runtime package metadata is incomplete.'
      : 'Office PDF runtime manifest is invalid.')
  }

  const manifest = parsed.manifest
  if (manifest.enabled === false) {
    return unavailable('office_pdf_runtime_disabled', 'Office PDF managed runtime is disabled.')
  }
  const expectedPlatform = input.platform ?? process.platform
  const expectedArch = input.arch ?? process.arch
  if (manifest.platform !== expectedPlatform || (manifest.arch && manifest.arch !== expectedArch)) {
    return unavailable('office_pdf_runtime_platform_unsupported', 'Office PDF runtime does not support this platform.')
  }

  const executable = resolveManagedExecutable(root, manifest.executablePath)
  if (!executable.ok) {
    return unavailable('office_pdf_runtime_path_rejected', 'Office PDF runtime executable path is outside the managed runtime root.')
  }

  const executableStat = await stat(executable.path).catch((error) => {
    if (isNotFound(error)) return null
    return undefined
  })
  if (executableStat === null) {
    return unavailable('office_pdf_runtime_executable_missing', 'Office PDF runtime executable is missing.')
  }
  if (!executableStat?.isFile()) {
    return unavailable('office_pdf_runtime_manifest_invalid', 'Office PDF runtime executable metadata is invalid.')
  }
  const realRoot = await realpath(root).catch(() => null)
  const realExecutable = await realpath(executable.path).catch(() => null)
  if (!realRoot || !realExecutable || !isPathInside(realRoot, realExecutable)) {
    return unavailable('office_pdf_runtime_path_rejected', 'Office PDF runtime executable path is outside the managed runtime root.')
  }
  if (!hasCompletePackageMetadata(manifest)) {
    return unavailable('office_pdf_runtime_metadata_incomplete', 'Office PDF runtime package metadata is incomplete.')
  }
  if (typeof manifest.executableSizeBytes === 'number' && manifest.executableSizeBytes !== executableStat.size) {
    return unavailable('office_pdf_runtime_manifest_invalid', 'Office PDF runtime executable size does not match the manifest.')
  }
  if (manifest.executableSha256) {
    const bytes = await readFile(executable.path).catch(() => null)
    if (!bytes || sha256(bytes) !== manifest.executableSha256.toLowerCase()) {
      return unavailable('office_pdf_runtime_manifest_invalid', 'Office PDF runtime executable hash does not match the manifest.')
    }
  }

  return {
    ok: true,
    runtime: {
      managedRuntimeRootDir: root,
      executablePath: executable.path,
      pluginId: manifest.pluginId ?? DFC_OFFICE_PDF_PLUGIN_ID,
      packageId: manifest.packageId,
      runtimePackageId: manifest.runtimePackageId ?? manifest.packageId,
      engineId: manifest.engineId,
      runtimeId: manifest.runtimeId,
      displayName: manifest.displayName ?? 'LibreOffice Office PDF',
      pluginVersion: manifest.pluginVersion ?? manifest.packageVersion,
      runtimeKind: manifest.runtimeKind ?? DFC_OFFICE_PDF_RUNTIME_KIND,
      platform: manifest.platform,
      arch: manifest.arch ?? null,
      capabilities: [...(manifest.capabilities ?? [])],
      libreOfficeVersion: manifest.libreOfficeVersion,
      packageVersion: manifest.packageVersion,
      minimumStarverseContractVersion: manifest.minimumStarverseContractVersion,
      provenance: manifest.provenance ?? null,
      licenseId: manifest.licenseId ?? null,
      attribution: manifest.attribution ?? null,
      officialRelease: manifest.officialRelease ?? null,
    },
    diagnostics: [],
  }
}

export function toDfcLibreOfficeManagedEnginePluginManifest(
  runtime: DfcOfficePdfManagedRuntimeSummary
): ManagedEnginePluginManifest {
  return parseManagedEnginePluginManifest({
    id: runtime.engineId,
    displayName: runtime.displayName,
    version: runtime.pluginVersion,
    kind: 'plugin',
    platform: normalizeEnginePlatform(runtime.platform),
    capabilities: ['document_conversion'],
    supportedFormatIds: ['docx'],
    supportedMimeTypes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    supportedOutputRoutes: ['direct_file'],
    resourceLimits: { maxInputBytes: null, maxDurationMs: 60000 },
    sandbox: { enabled: true },
    network: { allowed: false },
    healthcheck: null,
    metadataAllowlist: [
      'pluginId',
      'runtimePackageId',
      'runtimeId',
      'libreOfficeVersion',
      'packageVersion',
      'minimumStarverseContractVersion',
      'capabilities',
    ],
  })
}

function parseManifest(value: string): RuntimeManifestParseResult {
  try {
    const parsed = JSON.parse(value) as Partial<DfcOfficePdfRuntimeManifest> | null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return invalidManifest()
    if (parsed.manifestSchemaVersion !== DFC_OFFICE_PDF_MIN_CONTRACT_VERSION) return invalidManifest()
    if (parsed.pluginId !== DFC_OFFICE_PDF_PLUGIN_ID) return invalidManifest()
    if (parsed.packageId !== DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID) return invalidManifest()
    if (parsed.runtimePackageId !== DFC_OFFICE_PDF_RUNTIME_PACKAGE_ID) return invalidManifest()
    if (parsed.engineId !== DFC_OFFICE_PDF_ENGINE_ID) return invalidManifest()
    if (parsed.runtimeId !== DFC_OFFICE_PDF_RUNTIME_ID) return invalidManifest()
    if (!isNonEmpty(parsed.displayName)) return invalidManifest()
    if (!isNonEmpty(parsed.pluginVersion)) return invalidManifest()
    if (parsed.runtimeKind !== DFC_OFFICE_PDF_RUNTIME_KIND) return invalidManifest()
    if (parsed.enabled != null && typeof parsed.enabled !== 'boolean') return invalidManifest()
    if (!isNonEmpty(parsed.platform)) return invalidManifest()
    if (!isNonEmpty(parsed.executablePath)) return invalidManifest()
    if (!isNonEmpty(parsed.libreOfficeVersion)) return invalidManifest()
    if (!isNonEmpty(parsed.packageVersion)) return invalidManifest()
    if (!isNonEmpty(parsed.minimumStarverseContractVersion)) return invalidManifest()
    if (parsed.arch != null && !isNonEmpty(parsed.arch)) return invalidManifest()
    if (parsed.capabilities != null && (!Array.isArray(parsed.capabilities) || parsed.capabilities.some((item) => !isNonEmpty(item)))) return invalidManifest()
    if (parsed.notices != null && (!Array.isArray(parsed.notices) || parsed.notices.some((item) => !isNonEmpty(item)))) return invalidManifest()
    if (parsed.artifactSha256 != null && (!isNonEmpty(parsed.artifactSha256) || !FULL_SHA256_RE.test(parsed.artifactSha256))) return invalidManifest()
    if (parsed.executableSha256 != null && (!isNonEmpty(parsed.executableSha256) || !FULL_SHA256_RE.test(parsed.executableSha256))) return invalidManifest()
    if (parsed.executableSizeBytes != null && (!Number.isFinite(parsed.executableSizeBytes) || parsed.executableSizeBytes < 0)) return invalidManifest()
    if (!isValidOfficialRelease(parsed.officialRelease ?? null)) return { ok: false, code: 'office_pdf_runtime_metadata_incomplete' }
    if (!hasMetadataShape(parsed)) return { ok: false, code: 'office_pdf_runtime_metadata_incomplete' }
    if (!hasRequiredCapabilities(parsed.capabilities ?? [])) return { ok: false, code: 'office_pdf_runtime_metadata_incomplete' }
    if (!hasRequiredSecurityPolicy(parsed.securityPolicy ?? null)) return { ok: false, code: 'office_pdf_runtime_metadata_incomplete' }
    return {
      ok: true,
      manifest: {
        manifestSchemaVersion: parsed.manifestSchemaVersion,
        pluginId: parsed.pluginId,
        packageId: parsed.packageId,
        runtimePackageId: parsed.runtimePackageId,
        engineId: parsed.engineId,
        runtimeId: parsed.runtimeId,
        displayName: parsed.displayName,
        pluginVersion: parsed.pluginVersion,
        runtimeKind: parsed.runtimeKind,
        enabled: parsed.enabled ?? true,
        platform: parsed.platform,
        arch: parsed.arch ?? null,
        executablePath: parsed.executablePath,
        libreOfficeVersion: parsed.libreOfficeVersion,
        packageVersion: parsed.packageVersion,
        artifactSha256: parsed.artifactSha256 ?? null,
        executableSha256: parsed.executableSha256 ?? null,
        executableSizeBytes: parsed.executableSizeBytes ?? null,
        provenance: parsed.provenance ?? null,
        licenseId: parsed.licenseId ?? null,
        attribution: parsed.attribution ?? null,
        notices: parsed.notices ?? [],
        capabilities: parsed.capabilities ?? [],
        minimumStarverseContractVersion: parsed.minimumStarverseContractVersion,
        officialRelease: parsed.officialRelease ?? null,
        securityPolicy: {
          macrosDisabled: true,
          networkDisabled: true,
          externalLinksDisabled: true,
          embeddedObjectExecutionDisabled: true,
          isolatedProfileRequired: true,
        },
      },
    }
  } catch {
    return invalidManifest()
  }
}

function invalidManifest(): RuntimeManifestParseResult {
  return { ok: false, code: 'office_pdf_runtime_manifest_invalid' }
}

function hasRequiredCapabilities(capabilities: readonly string[]): boolean {
  return DFC_OFFICE_PDF_CAPABILITIES.every((capability) => capabilities.includes(capability))
}

function hasRequiredSecurityPolicy(policy: DfcOfficePdfRuntimeManifest['securityPolicy']): boolean {
  return policy?.macrosDisabled === true
    && policy.networkDisabled === true
    && policy.externalLinksDisabled === true
    && policy.embeddedObjectExecutionDisabled === true
    && policy.isolatedProfileRequired === true
}

function hasMetadataShape(value: Partial<DfcOfficePdfRuntimeManifest>): boolean {
  return isNonEmpty(value.artifactSha256)
    && FULL_SHA256_RE.test(value.artifactSha256)
    && isNonEmpty(value.executableSha256)
    && FULL_SHA256_RE.test(value.executableSha256)
    && typeof value.executableSizeBytes === 'number'
    && Number.isFinite(value.executableSizeBytes)
    && value.executableSizeBytes >= 0
    && isNonEmpty(value.provenance)
    && isNonEmpty(value.licenseId)
    && isNonEmpty(value.attribution)
    && Array.isArray(value.notices)
    && value.notices.length > 0
}

function hasCompletePackageMetadata(value: DfcOfficePdfRuntimeManifest): boolean {
  return hasMetadataShape(value)
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

function isValidOfficialRelease(value: DfcOfficePdfRuntimeOfficialRelease | null): boolean {
  if (!value || typeof value !== 'object') return false
  if (value.sourceKind !== 'official' && value.sourceKind !== 'development' && value.sourceKind !== 'test_fixture') return false
  if (!isNonEmpty(value.packageRef)) return false
  if (value.releaseTag != null && !isNonEmpty(value.releaseTag)) return false
  if (value.provenance != null && !isNonEmpty(value.provenance)) return false
  return true
}

function normalizeEnginePlatform(value: string): EnginePlatform {
  return value === 'win32' || value === 'darwin' || value === 'linux' ? value : 'any'
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function isNotFound(error: unknown): boolean {
  return !!error && typeof error === 'object' && String((error as any).code ?? '').trim().toUpperCase() === 'ENOENT'
}

function unavailable(code: DfcOfficePdfRuntimeDiagnosticCode, message: string): Readonly<{
  ok: false
  runtime: null
  diagnostics: readonly DfcOfficePdfRuntimeDiagnostic[]
}> {
  return {
    ok: false,
    runtime: null,
    diagnostics: [{ code, message }],
  }
}
