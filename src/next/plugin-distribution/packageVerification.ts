import { validatePluginPackageInventory } from './artifactInventory'
import { validatePluginPackageManifest } from './packageManifest'
import { sanitizePluginDistributionText } from './sanitization'
import { validatePluginSignatureEnvelope } from './trustPolicy'
import type {
  PluginFailureReason,
  PluginPackageArchitecture,
  PluginPackagePlatform,
  PluginPackageRuntimeKind,
} from './types'
import { compareSemverLike, isValidSha256, readNonEmptyString } from './validation'

export type LocalVerificationTrustPolicy = Readonly<{
  requireSignedPackages: boolean
}>

export type LocalVerificationEnvironment = Readonly<{
  platform?: string
  architecture?: string
  appVersion?: string
  now?: Date
}>

export type LocalPackageVerificationInput = Readonly<{
  manifest: unknown
  inventory: unknown
  packageSha256?: unknown
  signatureMetadata?: unknown
  trustPolicy: LocalVerificationTrustPolicy
  environment?: LocalVerificationEnvironment
}>

export type PackageVerificationStatus = 'verified_metadata_only' | 'failed'

export type LocalPackageIdentity = Readonly<{
  pluginId: string
  pluginVersion: string
  runtimeKind: PluginPackageRuntimeKind
}>

export type LocalPackageArtifactSummary = Readonly<{
  artifactCount: number
  requiredArtifactCount: number
  classes: Readonly<Record<string, number>>
  signatureArtifactCount: number
}>

export type SanitizedVerificationDiagnostic = Readonly<{
  code: string
  field: string
  detail?: string
}>

export type LocalPackageVerificationResult = Readonly<{
  ok: boolean
  status: PackageVerificationStatus
  failureReasons: readonly PluginFailureReason[]
  diagnostics: readonly SanitizedVerificationDiagnostic[]
  normalizedPackageIdentity: LocalPackageIdentity | null
  artifactSummary: LocalPackageArtifactSummary
  trust: Readonly<{
    signatureMetadataPresent: boolean
    cryptographicVerificationDeferred: boolean
    executableTrustApproved: false
  }>
}>

const DIAGNOSTIC_PATH_RE = /(?:^|[\s:(])(?:\.\.\/|\.\\)/g

const INCOMPATIBLE_REASONS = new Set<PluginFailureReason>([
  'incompatible_platform',
  'incompatible_arch',
  'incompatible_app_version',
])

// eslint-disable-next-line max-lines-per-function, complexity
export function verifyLocalPluginPackage(
  input: LocalPackageVerificationInput
): LocalPackageVerificationResult {
  const diagnostics: SanitizedVerificationDiagnostic[] = []
  const failureReasons: PluginFailureReason[] = []
  const environment = normalizeEnvironment(input.environment)
  const now = environment.now ?? new Date()

  const manifestResult = validatePluginPackageManifest(input.manifest)
  const inventoryResult = validatePluginPackageInventory(input.inventory, {
    runtimeKind: manifestResult.ok ? manifestResult.manifest.runtimeKind : undefined,
  })

  if (!manifestResult.ok) {
    diagnostics.push(...mapValidationErrors(manifestResult.errors))
    failureReasons.push(...mapValidationErrorsToReasons(manifestResult.errors))
  }
  if (!inventoryResult.ok) {
    diagnostics.push(...mapValidationErrors(inventoryResult.errors))
    failureReasons.push(...mapValidationErrorsToReasons(inventoryResult.errors))
  }

  const packageSha256 = readNonEmptyString(input.packageSha256)
  if (packageSha256 && !isValidSha256(packageSha256)) {
    diagnostics.push({
      code: 'invalid_sha256',
      field: 'packageSha256',
      detail: 'packageSha256 must be a 64-char lowercase hex digest',
    })
    failureReasons.push('hash_mismatch')
  }

  const signatureResult =
    input.signatureMetadata === undefined || input.signatureMetadata === null
      ? null
      : validatePluginSignatureEnvelope(input.signatureMetadata, { now })
  const signatureMetadataPresent =
    input.signatureMetadata !== undefined && input.signatureMetadata !== null
  if (signatureResult && !signatureResult.ok) {
    diagnostics.push(...mapValidationErrors(signatureResult.errors))
    failureReasons.push('signature_invalid')
  }

  let normalizedPackageIdentity: LocalPackageIdentity | null = null
  let artifactSummary: LocalPackageArtifactSummary = emptyArtifactSummary()

  if (manifestResult.ok && inventoryResult.ok) {
    const manifest = manifestResult.manifest
    const inventory = inventoryResult.inventory

    normalizedPackageIdentity = {
      pluginId: manifest.pluginId,
      pluginVersion: manifest.pluginVersion,
      runtimeKind: manifest.runtimeKind,
    }

    if (
      inventory.pluginId !== manifest.pluginId ||
      inventory.pluginVersion !== manifest.pluginVersion
    ) {
      diagnostics.push({
        code: 'inventory_identity_mismatch',
        field: 'inventory.pluginId/pluginVersion',
        detail: 'inventory plugin identity must match package manifest',
      })
      failureReasons.push('integrity_missing')
    }

    artifactSummary = summarizeArtifacts(inventory.artifacts)

    evaluateCompatibility(manifest.compatibility, environment, diagnostics, failureReasons)
  }

  if (input.trustPolicy.requireSignedPackages && !signatureMetadataPresent) {
    diagnostics.push({
      code: 'signature_missing',
      field: 'signatureMetadata',
      detail: 'signed package policy requires signature metadata',
    })
    failureReasons.push('signature_missing')
    failureReasons.push('unsigned')
  }

  const dedupedReasons = uniqueFailureReasons(failureReasons)
  const ok = dedupedReasons.length === 0

  return {
    ok,
    status: ok ? 'verified_metadata_only' : 'failed',
    failureReasons: dedupedReasons,
    diagnostics: diagnostics.map((entry) => ({
      ...entry,
      detail: sanitizeDiagnosticText(entry.detail),
    })),
    normalizedPackageIdentity,
    artifactSummary,
    trust: {
      signatureMetadataPresent,
      cryptographicVerificationDeferred: true,
      executableTrustApproved: false,
    },
  }
}

export function canEnableAfterVerification(
  result: LocalPackageVerificationResult
): boolean {
  if (!result.ok) return false
  if (result.status !== 'verified_metadata_only') return false
  if (result.failureReasons.some((reason) => INCOMPATIBLE_REASONS.has(reason))) return false
  return true
}

function evaluateCompatibility(
  compatibility: Readonly<{
    platforms: readonly PluginPackagePlatform[]
    architectures: readonly PluginPackageArchitecture[]
    starverseVersionRange: string
  }>,
  environment: Readonly<{
    platform: PluginPackagePlatform
    architecture: PluginPackageArchitecture
    appVersion: string | null
  }>,
  diagnostics: SanitizedVerificationDiagnostic[],
  failureReasons: PluginFailureReason[]
): void {
  const platformOk =
    compatibility.platforms.includes('any') ||
    compatibility.platforms.includes(environment.platform)
  if (!platformOk) {
    diagnostics.push({
      code: 'incompatible_platform',
      field: 'compatibility.platforms',
      detail: `platform ${environment.platform} is not supported by package`,
    })
    failureReasons.push('incompatible_platform')
  }

  const archOk =
    compatibility.architectures.includes('any') ||
    compatibility.architectures.includes(environment.architecture)
  if (!archOk) {
    diagnostics.push({
      code: 'incompatible_arch',
      field: 'compatibility.architectures',
      detail: `architecture ${environment.architecture} is not supported by package`,
    })
    failureReasons.push('incompatible_arch')
  }

  if (environment.appVersion) {
    const appVersionOk = satisfiesSemverRange(
      environment.appVersion,
      compatibility.starverseVersionRange
    )
    if (!appVersionOk) {
      diagnostics.push({
        code: 'incompatible_app_version',
        field: 'compatibility.starverseVersionRange',
        detail: 'current app version is outside package compatibility range',
      })
      failureReasons.push('incompatible_app_version')
    }
  }
}

function normalizeEnvironment(
  environment: LocalVerificationEnvironment | undefined
): Readonly<{
  platform: PluginPackagePlatform
  architecture: PluginPackageArchitecture
  appVersion: string | null
  now?: Date
}> {
  const platform = normalizePlatform(environment?.platform ?? process.platform)
  const architecture = normalizeArchitecture(environment?.architecture ?? process.arch)
  const appVersion = readNonEmptyString(environment?.appVersion)
  return { platform, architecture, appVersion, now: environment?.now }
}

function normalizePlatform(value: string): PluginPackagePlatform {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'win32' || normalized === 'darwin' || normalized === 'linux') {
    return normalized
  }
  return 'any'
}

function normalizeArchitecture(value: string): PluginPackageArchitecture {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'x64' || normalized === 'arm64') return normalized
  return 'any'
}

function mapValidationErrors(
  errors: readonly Readonly<{ code: string; field: string; expected?: string; path?: string }>[]
): SanitizedVerificationDiagnostic[] {
  return errors.map((error) => ({
    code: error.code,
    field: error.field,
    detail: error.expected
      ? `expected ${error.expected}`
      : error.path
        ? `path=${error.path}`
        : undefined,
  }))
}

function mapValidationErrorsToReasons(
  errors: readonly Readonly<{ code: string }>[]
): PluginFailureReason[] {
  const reasons: PluginFailureReason[] = []
  for (const error of errors) {
    switch (error.code) {
      case 'unsupported_manifest_schema':
        reasons.push('unsupported_manifest_schema')
        break
      case 'invalid_sha256':
        reasons.push('hash_mismatch')
        break
      case 'missing_required_artifact':
        reasons.push('integrity_missing')
        break
      case 'unsafe_relative_path':
        reasons.push('package_path_unsafe')
        break
      case 'rollback_detected':
        reasons.push('rollback_detected')
        break
      case 'expired_metadata':
        reasons.push('expired_metadata')
        break
      default:
        reasons.push('unknown')
        break
    }
  }
  return reasons
}

function summarizeArtifacts(
  artifacts: readonly Readonly<{
    artifactClass: string
    required?: boolean
  }>[]
): LocalPackageArtifactSummary {
  const classes: Record<string, number> = {}
  let requiredArtifactCount = 0
  let signatureArtifactCount = 0
  for (const artifact of artifacts) {
    classes[artifact.artifactClass] = (classes[artifact.artifactClass] ?? 0) + 1
    if (artifact.required) requiredArtifactCount += 1
    if (artifact.artifactClass === 'signature') signatureArtifactCount += 1
  }
  return {
    artifactCount: artifacts.length,
    requiredArtifactCount,
    classes,
    signatureArtifactCount,
  }
}

function emptyArtifactSummary(): LocalPackageArtifactSummary {
  return {
    artifactCount: 0,
    requiredArtifactCount: 0,
    classes: {},
    signatureArtifactCount: 0,
  }
}

function uniqueFailureReasons(reasons: readonly PluginFailureReason[]): PluginFailureReason[] {
  const seen = new Set<PluginFailureReason>()
  const unique: PluginFailureReason[] = []
  for (const reason of reasons) {
    if (!seen.has(reason)) {
      seen.add(reason)
      unique.push(reason)
    }
  }
  return unique
}

function sanitizeDiagnosticText(detail: string | undefined): string | undefined {
  const sanitized = sanitizePluginDistributionText(detail)
  if (!sanitized) return undefined
  return sanitized.replace(DIAGNOSTIC_PATH_RE, ' [redacted-relative]')
}

function satisfiesSemverRange(currentVersion: string, starverseVersionRange: string): boolean {
  const range = starverseVersionRange.trim()
  if (!range) return false

  if (range.startsWith('>=')) {
    const minimum = range.slice(2).trim()
    const comparison = compareSemverLike(currentVersion, minimum)
    return comparison !== null && comparison >= 0
  }
  if (range.startsWith('=')) {
    const expected = range.slice(1).trim()
    const comparison = compareSemverLike(currentVersion, expected)
    return comparison !== null && comparison === 0
  }

  const comparison = compareSemverLike(currentVersion, range)
  return comparison !== null && comparison === 0
}
