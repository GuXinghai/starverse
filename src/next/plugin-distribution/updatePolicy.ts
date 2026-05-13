import { sanitizePluginDistributionText } from './sanitization'
import type {
  PluginFailureReason,
  PluginPackageArchitecture,
  PluginPackageCompatibility,
  PluginPackagePlatform,
  PluginVerificationStatus,
} from './types'
import { compareSemverLike, readNonEmptyString } from './validation'

export const PDP_UPDATE_CHANNELS = ['stable', 'beta', 'dev'] as const
export type PdpUpdateChannel = (typeof PDP_UPDATE_CHANNELS)[number]

export type PdpInstalledPluginVersion = Readonly<{
  pluginId: string
  pluginVersion: string
  runtimeKind: string
  channel?: PdpUpdateChannel
}>

export type PdpUpdateCandidate = Readonly<{
  pluginId: string
  pluginVersion: string
  runtimeKind: string
  channel?: PdpUpdateChannel
  compatibility: PluginPackageCompatibility
  verificationStatus: PluginVerificationStatus
  executableTrustApproved: boolean
  failureReason?: PluginFailureReason | null
}>

export type PdpUpdateEnvironment = Readonly<{
  platform?: string
  architecture?: string
  appVersion?: string
  allowedChannel?: PdpUpdateChannel
}>

export type PdpUpdateEligibilityFailureReason =
  | PluginFailureReason
  | 'identity_mismatch'
  | 'same_version'
  | 'downgrade_blocked'
  | 'invalid_version'
  | 'channel_not_allowed'
  | 'channel_version_mismatch'
  | 'candidate_unverified'
  | 'candidate_not_trusted'

export type PdpUpdateEligibilityDiagnostic = Readonly<{
  code: PdpUpdateEligibilityFailureReason
  field: string
  detail?: string
}>

export type PdpUpdateEligibilityResult =
  | Readonly<{
      ok: true
      status: 'eligible'
      currentVersion: string
      candidateVersion: string
      candidateChannel: PdpUpdateChannel
      diagnostics: readonly PdpUpdateEligibilityDiagnostic[]
    }>
  | Readonly<{
      ok: false
      status: 'not_eligible'
      failureReasons: readonly PdpUpdateEligibilityFailureReason[]
      diagnostics: readonly PdpUpdateEligibilityDiagnostic[]
    }>

const CHANNEL_RANK: Readonly<Record<PdpUpdateChannel, number>> = {
  stable: 0,
  beta: 1,
  dev: 2,
}

const BLOCKING_CANDIDATE_FAILURES = new Set<PluginFailureReason>([
  'disabled_by_user',
  'expired_metadata',
  'hash_mismatch',
  'health_failed',
  'incompatible_app_version',
  'incompatible_arch',
  'incompatible_platform',
  'install_interrupted',
  'install_root_unsafe',
  'integrity_missing',
  'package_path_unsafe',
  'revoked',
  'rollback_detected',
  'signature_invalid',
  'signature_missing',
  'unknown',
  'unsupported_manifest_schema',
  'unsigned',
])

// PDP5-A is metadata-only: it decides whether a verified candidate may enter the staged update flow.
// eslint-disable-next-line max-lines-per-function, complexity
export function evaluatePdpUpdateEligibility(
  current: PdpInstalledPluginVersion,
  candidate: PdpUpdateCandidate,
  environment: PdpUpdateEnvironment
): PdpUpdateEligibilityResult {
  const diagnostics: PdpUpdateEligibilityDiagnostic[] = []
  const failureReasons: PdpUpdateEligibilityFailureReason[] = []

  const currentPluginId = normalizeIdentity(current.pluginId)
  const candidatePluginId = normalizeIdentity(candidate.pluginId)
  const currentRuntimeKind = normalizeIdentity(current.runtimeKind)
  const candidateRuntimeKind = normalizeIdentity(candidate.runtimeKind)

  if (!currentPluginId || !candidatePluginId || currentPluginId !== candidatePluginId) {
    pushFailure(diagnostics, failureReasons, 'identity_mismatch', 'candidate.pluginId', 'candidate must match installed plugin id')
  }
  if (!currentRuntimeKind || !candidateRuntimeKind || currentRuntimeKind !== candidateRuntimeKind) {
    pushFailure(
      diagnostics,
      failureReasons,
      'identity_mismatch',
      'candidate.runtimeKind',
      'candidate runtime kind must match installed plugin'
    )
  }

  const versionComparison = compareSemverLike(candidate.pluginVersion, current.pluginVersion)
  if (versionComparison === null) {
    pushFailure(
      diagnostics,
      failureReasons,
      'invalid_version',
      'candidate.pluginVersion',
      'candidate and current versions must be comparable semver-like values'
    )
  } else if (versionComparison === 0) {
    pushFailure(diagnostics, failureReasons, 'same_version', 'candidate.pluginVersion', 'same version is not an update')
  } else if (versionComparison < 0) {
    pushFailure(
      diagnostics,
      failureReasons,
      'downgrade_blocked',
      'candidate.pluginVersion',
      'downgrade is only allowed through the rollback policy'
    )
  }

  const explicitCandidateChannel = normalizeChannel(candidate.channel)
  const inferredCandidateChannel = inferChannelFromVersion(candidate.pluginVersion)
  const candidateChannel = explicitCandidateChannel ?? inferredCandidateChannel
  const allowedChannel = normalizeChannel(environment.allowedChannel) ?? normalizeChannel(current.channel) ?? 'stable'
  if (explicitCandidateChannel && CHANNEL_RANK[explicitCandidateChannel] < CHANNEL_RANK[inferredCandidateChannel]) {
    pushFailure(
      diagnostics,
      failureReasons,
      'channel_version_mismatch',
      'candidate.channel',
      'candidate channel must not claim higher stability than the candidate version suffix'
    )
  }
  if (CHANNEL_RANK[candidateChannel] > CHANNEL_RANK[allowedChannel]) {
    pushFailure(
      diagnostics,
      failureReasons,
      'channel_not_allowed',
      'candidate.channel',
      'candidate stability channel is not allowed by update policy'
    )
  }

  if (candidate.verificationStatus !== 'verified') {
    pushFailure(
      diagnostics,
      failureReasons,
      'candidate_unverified',
      'candidate.verificationStatus',
      'candidate must be cryptographically verified before update eligibility'
    )
  }
  if (!candidate.executableTrustApproved) {
    pushFailure(
      diagnostics,
      failureReasons,
      'candidate_not_trusted',
      'candidate.executableTrustApproved',
      'candidate executable trust must be approved before update eligibility'
    )
  }
  if (candidate.failureReason && BLOCKING_CANDIDATE_FAILURES.has(candidate.failureReason)) {
    pushFailure(
      diagnostics,
      failureReasons,
      candidate.failureReason,
      'candidate.failureReason',
      'candidate carries a blocking verification or compatibility failure'
    )
  }

  enforceUpdateCompatibility(candidate.compatibility, environment, diagnostics, failureReasons)

  if (failureReasons.length > 0) {
    return {
      ok: false,
      status: 'not_eligible',
      failureReasons: uniqueFailures(failureReasons),
      diagnostics: sanitizeDiagnostics(diagnostics),
    }
  }

  return {
    ok: true,
    status: 'eligible',
    currentVersion: current.pluginVersion,
    candidateVersion: candidate.pluginVersion,
    candidateChannel,
    diagnostics: [],
  }
}

function enforceUpdateCompatibility(
  compatibility: PluginPackageCompatibility,
  environment: PdpUpdateEnvironment,
  diagnostics: PdpUpdateEligibilityDiagnostic[],
  failureReasons: PdpUpdateEligibilityFailureReason[]
): void {
  const platform = normalizePlatform(environment.platform)
  const architecture = normalizeArchitecture(environment.architecture)
  const appVersion = readNonEmptyString(environment.appVersion)

  if (!platform || (!compatibility.platforms.includes('any') && !compatibility.platforms.includes(platform))) {
    pushFailure(
      diagnostics,
      failureReasons,
      'incompatible_platform',
      'compatibility.platforms',
      platform ? 'candidate does not support current platform' : 'current platform must be known'
    )
  }
  if (!architecture || (!compatibility.architectures.includes('any') && !compatibility.architectures.includes(architecture))) {
    pushFailure(
      diagnostics,
      failureReasons,
      'incompatible_arch',
      'compatibility.architectures',
      architecture ? 'candidate does not support current architecture' : 'current architecture must be known'
    )
  }
  if (!appVersion || !satisfiesSemverRange(appVersion, compatibility.starverseVersionRange)) {
    pushFailure(
      diagnostics,
      failureReasons,
      'incompatible_app_version',
      'compatibility.starverseVersionRange',
      appVersion ? 'current app version is outside candidate compatibility range' : 'current app version must be known'
    )
  }
}

function normalizeIdentity(input: string): string | null {
  const value = readNonEmptyString(input)
  if (!value || /[\\/]|^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)) return null
  return value
}

function normalizeChannel(input: string | undefined): PdpUpdateChannel | null {
  const value = input?.trim().toLowerCase()
  return value === 'stable' || value === 'beta' || value === 'dev' ? value : null
}

function inferChannelFromVersion(version: string): PdpUpdateChannel {
  const suffix = version.split('-', 2)[1]?.toLowerCase()
  if (!suffix) return 'stable'
  if (suffix.includes('dev') || suffix.includes('alpha') || suffix.includes('canary')) return 'dev'
  return 'beta'
}

function normalizePlatform(input: string | undefined): PluginPackagePlatform | null {
  const normalized = input?.trim().toLowerCase()
  if (normalized === 'win32' || normalized === 'darwin' || normalized === 'linux') return normalized
  return normalized === 'any' ? 'any' : null
}

function normalizeArchitecture(input: string | undefined): PluginPackageArchitecture | null {
  const normalized = input?.trim().toLowerCase()
  if (normalized === 'x64' || normalized === 'arm64') return normalized
  return normalized === 'any' ? 'any' : null
}

function satisfiesSemverRange(currentVersion: string, starverseVersionRange: string): boolean {
  const range = starverseVersionRange.trim()
  if (!range) return false
  if (range.startsWith('>=')) {
    const comparison = compareSemverLike(currentVersion, range.slice(2).trim())
    return comparison !== null && comparison >= 0
  }
  if (range.startsWith('=')) {
    const comparison = compareSemverLike(currentVersion, range.slice(1).trim())
    return comparison !== null && comparison === 0
  }
  const comparison = compareSemverLike(currentVersion, range)
  return comparison !== null && comparison === 0
}

function pushFailure(
  diagnostics: PdpUpdateEligibilityDiagnostic[],
  failureReasons: PdpUpdateEligibilityFailureReason[],
  code: PdpUpdateEligibilityFailureReason,
  field: string,
  detail: string
): void {
  failureReasons.push(code)
  diagnostics.push({ code, field, detail })
}

function uniqueFailures(
  values: readonly PdpUpdateEligibilityFailureReason[]
): readonly PdpUpdateEligibilityFailureReason[] {
  const seen = new Set<PdpUpdateEligibilityFailureReason>()
  const out: PdpUpdateEligibilityFailureReason[] = []
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      out.push(value)
    }
  }
  return out
}

function sanitizeDiagnostics(
  values: readonly PdpUpdateEligibilityDiagnostic[]
): readonly PdpUpdateEligibilityDiagnostic[] {
  return values.map((entry) => ({
    ...entry,
    detail: sanitizePluginDistributionText(entry.detail),
  }))
}
