import { LOCAL_CONTROLLED_ROOT_KINDS, type LocalControlledRootKind } from './localPackageRegistration'
import type { PluginCryptoVerificationResult } from './cryptoVerification'
import { sanitizePluginDistributionText } from './sanitization'
import { readNonEmptyString } from './validation'

export type VerifiedInstallPackageIdentity = Readonly<{
  pluginId: string
  pluginVersion: string
  runtimeKind: string
}>

export type VerifiedInstallArtifactSummary = Readonly<{
  artifactCount: number
  requiredArtifactCount: number
  classes: Readonly<Record<string, number>>
}>

export type InstallPlanInput = Readonly<{
  verification: PluginCryptoVerificationResult
  controlledRootKind: LocalControlledRootKind | string
  packageIdentity: VerifiedInstallPackageIdentity
  artifactSummary: VerifiedInstallArtifactSummary
  stagingRef: string
  finalInstallRef: string
  previousInstallRef?: string | null
}>

export type PluginInstallPlan = Readonly<{
  verificationProof: Readonly<{
    status: 'cryptographic_ed25519_verified'
    verifiedKeyId: string
    trustRootId: string
  }>
  pluginId: string
  pluginVersion: string
  runtimeKind: string
  controlledRootKind: LocalControlledRootKind
  stagingRef: string
  finalInstallRef: string
  previousInstallRef: string | null
  artifactSummary: VerifiedInstallArtifactSummary
  stateTransitions: readonly ['staged', 'installing', 'installed']
  extractionDeferred: true
}>

export type InstallPlanFailureReason =
  | 'package_unverified'
  | 'package_incompatible'
  | 'install_root_unsafe'
  | 'package_path_unsafe'
  | 'integrity_missing'
  | 'unknown'

export type InstallPlanDiagnostic = Readonly<{
  code: InstallPlanFailureReason
  field: string
  detail?: string
}>

export type InstallPlanResult =
  | Readonly<{ ok: true; plan: PluginInstallPlan; diagnostics: readonly InstallPlanDiagnostic[] }>
  | Readonly<{
      ok: false
      failureReasons: readonly InstallPlanFailureReason[]
      diagnostics: readonly InstallPlanDiagnostic[]
    }>

const CONTROLLED_ROOT_SET = new Set<string>(LOCAL_CONTROLLED_ROOT_KINDS)

// PDP4-C validates the whole verified install contract before producing a finalizable plan.
// eslint-disable-next-line max-lines-per-function, complexity
export function createVerifiedInstallPlan(input: InstallPlanInput): InstallPlanResult {
  const diagnostics: InstallPlanDiagnostic[] = []
  const failureReasons: InstallPlanFailureReason[] = []

  if (!input.verification.ok || !input.verification.executableTrustApproved) {
    pushFailure(
      diagnostics,
      failureReasons,
      'package_unverified',
      'verification',
      'package must pass cryptographic verification before install planning'
    )
  }
  if (
    input.verification.failureReasons.some(
      (reason) =>
        reason === 'incompatible_platform' ||
        reason === 'incompatible_arch' ||
        reason === 'incompatible_app_version' ||
        reason === 'revoked' ||
        reason === 'expired_metadata'
    )
  ) {
    pushFailure(diagnostics, failureReasons, 'package_incompatible', 'verification', 'package is not installable')
  }

  const controlledRootKind = normalizeControlledRootKind(input.controlledRootKind)
  if (!controlledRootKind) {
    pushFailure(
      diagnostics,
      failureReasons,
      'install_root_unsafe',
      'controlledRootKind',
      'controlled root must be user_local, portable, or dev_only'
    )
  }

  const stagingRef = normalizeInstallRef(input.stagingRef)
  if (!stagingRef) {
    pushFailure(diagnostics, failureReasons, 'package_path_unsafe', 'stagingRef', 'stagingRef must be an abstract token')
  }
  const finalInstallRef = normalizeInstallRef(input.finalInstallRef)
  if (!finalInstallRef) {
    pushFailure(
      diagnostics,
      failureReasons,
      'package_path_unsafe',
      'finalInstallRef',
      'finalInstallRef must be an abstract token'
    )
  }
  const previousInstallRef =
    input.previousInstallRef === undefined || input.previousInstallRef === null
      ? null
      : normalizeInstallRef(input.previousInstallRef)
  if (input.previousInstallRef && !previousInstallRef) {
    pushFailure(
      diagnostics,
      failureReasons,
      'package_path_unsafe',
      'previousInstallRef',
      'previousInstallRef must be an abstract token'
    )
  }

  if (input.artifactSummary.artifactCount <= 0 || input.artifactSummary.requiredArtifactCount <= 0) {
    pushFailure(
      diagnostics,
      failureReasons,
      'integrity_missing',
      'artifactSummary',
      'verified install requires artifact summary coverage'
    )
  }

  const pluginId = normalizeIdentity(input.packageIdentity.pluginId)
  const pluginVersion = normalizeIdentity(input.packageIdentity.pluginVersion)
  const runtimeKind = normalizeIdentity(input.packageIdentity.runtimeKind)
  if (!pluginId || !pluginVersion || !runtimeKind) {
    pushFailure(diagnostics, failureReasons, 'unknown', 'packageIdentity', 'package identity is required')
  }

  if (!input.verification.verifiedKeyId || !input.verification.trustRootId) {
    pushFailure(
      diagnostics,
      failureReasons,
      'package_unverified',
      'verification',
      'verified key and trust root are required for install finalization'
    )
  }

  if (
    failureReasons.length > 0 ||
    !controlledRootKind ||
    !stagingRef ||
    !finalInstallRef ||
    !pluginId ||
    !pluginVersion ||
    !runtimeKind ||
    !input.verification.verifiedKeyId ||
    !input.verification.trustRootId
  ) {
    return {
      ok: false,
      failureReasons: uniqueFailures(failureReasons),
      diagnostics: sanitizeDiagnostics(diagnostics),
    }
  }

  return {
    ok: true,
    plan: {
      verificationProof: {
        status: 'cryptographic_ed25519_verified',
        verifiedKeyId: input.verification.verifiedKeyId,
        trustRootId: input.verification.trustRootId,
      },
      pluginId,
      pluginVersion,
      runtimeKind,
      controlledRootKind,
      stagingRef,
      finalInstallRef,
      previousInstallRef,
      artifactSummary: input.artifactSummary,
      stateTransitions: ['staged', 'installing', 'installed'],
      extractionDeferred: true,
    },
    diagnostics: [],
  }
}

function normalizeControlledRootKind(input: string): LocalControlledRootKind | null {
  const normalized = readNonEmptyString(input)?.toLowerCase()
  return normalized && CONTROLLED_ROOT_SET.has(normalized) ? (normalized as LocalControlledRootKind) : null
}

function normalizeIdentity(input: string): string | null {
  const value = readNonEmptyString(input)
  if (!value || containsUnsafeRefSyntax(value)) return null
  return value
}

function normalizeInstallRef(input: string): string | null {
  const value = readNonEmptyString(input)
  if (!value || !/^[a-z0-9][a-z0-9._:-]{1,127}$/iu.test(value)) return null
  return containsUnsafeRefSyntax(value) ? null : value
}

export function containsUnsafeRefSyntax(value: string): boolean {
  return (
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\u0000') ||
    /(^|[\\/])\.\.($|[\\/])/u.test(value) ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    /^\\\\/u.test(value) ||
    /^\//u.test(value) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(value)
  )
}

function pushFailure(
  diagnostics: InstallPlanDiagnostic[],
  failureReasons: InstallPlanFailureReason[],
  code: InstallPlanFailureReason,
  field: string,
  detail: string
): void {
  failureReasons.push(code)
  diagnostics.push({ code, field, detail })
}

function uniqueFailures(values: readonly InstallPlanFailureReason[]): readonly InstallPlanFailureReason[] {
  const seen = new Set<InstallPlanFailureReason>()
  const out: InstallPlanFailureReason[] = []
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      out.push(value)
    }
  }
  return out
}

function sanitizeDiagnostics(values: readonly InstallPlanDiagnostic[]): readonly InstallPlanDiagnostic[] {
  return values.map((entry) => ({
    ...entry,
    detail: sanitizePluginDistributionText(entry.detail),
  }))
}
