import { sanitizePluginDistributionText } from './sanitization'
import type { ReadOnlyCatalogEntryDto } from './catalogReadModel'
import { isValidSha256, normalizeSha256, readFiniteNonNegativeInteger, readNonEmptyString } from './validation'

export type OfficialDownloadSourceKind = 'catalog_official' | 'local_official_fixture' | 'dev_fixture'
export type RejectedDownloadSourceKind = 'user_url' | 'third_party' | 'marketplace_url' | 'remote_url'
export type DownloadSourceKind = OfficialDownloadSourceKind | RejectedDownloadSourceKind | string

export type DownloadPolicyCatalogPackageRef = Readonly<{
  pluginId: string
  pluginVersion: string
  packageRef: string
  sourceKind: DownloadSourceKind
  catalogStatus: 'valid_metadata_only' | 'invalid'
  installabilityStatus?: ReadOnlyCatalogEntryDto['installabilityStatus'] | 'verified_future_install'
  packageSha256: string
  packageSizeBytes: number
}>

export type DownloadPolicyOptions = Readonly<{
  maxBytes: number
  allowLocalFixtures?: boolean
  allowDevFixtures?: boolean
  allowedOfficialHosts?: readonly string[]
}>

export type AcceptedDownloadPolicy = Readonly<{
  pluginId: string
  pluginVersion: string
  packageRef: string
  sourceKind: OfficialDownloadSourceKind
  expectedSha256: string
  expectedSizeBytes: number
  maxBytes: number
  transportRef: string
}>

export type DownloadPolicyFailureReason =
  | 'non_official_source'
  | 'user_url_not_allowed'
  | 'third_party_source_not_allowed'
  | 'remote_source_not_allowed'
  | 'non_https_remote'
  | 'file_url_not_allowed'
  | 'official_host_required'
  | 'official_host_not_allowed'
  | 'missing_expected_hash'
  | 'missing_expected_size'
  | 'package_too_large'
  | 'catalog_invalid'
  | 'package_not_installable'
  | 'unsafe_package_ref'
  | 'invalid_max_bytes'

export type DownloadPolicyDiagnostic = Readonly<{
  code: DownloadPolicyFailureReason
  field: string
  detail?: string
}>

export type DownloadPolicyResult =
  | Readonly<{ ok: true; policy: AcceptedDownloadPolicy; diagnostics: readonly DownloadPolicyDiagnostic[] }>
  | Readonly<{
      ok: false
      failureReasons: readonly DownloadPolicyFailureReason[]
      diagnostics: readonly DownloadPolicyDiagnostic[]
    }>

const REMOTE_REJECTED_KINDS = new Set<string>(['user_url', 'marketplace_url', 'remote_url'])
const THIRD_PARTY_REJECTED_KINDS = new Set<string>(['third_party'])

// PDP4-B keeps all official-source, host-pinning, hash, size, and byte-limit checks in one gate.
// eslint-disable-next-line max-lines-per-function, complexity
export function validateDownloadPolicy(
  ref: DownloadPolicyCatalogPackageRef,
  options: DownloadPolicyOptions
): DownloadPolicyResult {
  const diagnostics: DownloadPolicyDiagnostic[] = []
  const failureReasons: DownloadPolicyFailureReason[] = []
  const sourceKind = normalizeSourceKind(ref.sourceKind)
  const maxBytes = readFiniteNonNegativeInteger(options.maxBytes)
  const officialHosts = normalizeAllowedHosts(options.allowedOfficialHosts)

  if (maxBytes === null || maxBytes <= 0) {
    pushFailure(diagnostics, failureReasons, 'invalid_max_bytes', 'maxBytes', 'download byte limit must be positive')
  }
  if (sourceKind === 'catalog_official' && officialHosts.length === 0) {
    pushFailure(
      diagnostics,
      failureReasons,
      'official_host_required',
      'allowedOfficialHosts',
      'official catalog downloads require explicit official host pinning'
    )
  }

  if (!isOfficialSourceKind(sourceKind, options)) {
    const reason = sourceFailureReason(sourceKind)
    pushFailure(diagnostics, failureReasons, reason, 'sourceKind', 'download source must be official and policy-controlled')
  }

  if (ref.catalogStatus !== 'valid_metadata_only') {
    pushFailure(diagnostics, failureReasons, 'catalog_invalid', 'catalogStatus', 'catalog metadata must be valid')
  }

  if (
    ref.installabilityStatus &&
    ref.installabilityStatus !== 'metadata_compatible_future_install' &&
    ref.installabilityStatus !== 'verified_future_install'
  ) {
    pushFailure(
      diagnostics,
      failureReasons,
      'package_not_installable',
      'installabilityStatus',
      'catalog entry is not metadata-compatible for install'
    )
  }

  const expectedSha256 = normalizeExpectedSha(ref.packageSha256)
  if (!expectedSha256) {
    pushFailure(
      diagnostics,
      failureReasons,
      'missing_expected_hash',
      'packageSha256',
      'catalog package hash is required'
    )
  }

  const expectedSizeBytes = readFiniteNonNegativeInteger(ref.packageSizeBytes)
  if (expectedSizeBytes === null || expectedSizeBytes <= 0) {
    pushFailure(
      diagnostics,
      failureReasons,
      'missing_expected_size',
      'packageSizeBytes',
      'catalog package size is required'
    )
  } else if (maxBytes !== null && expectedSizeBytes > maxBytes) {
    pushFailure(
      diagnostics,
      failureReasons,
      'package_too_large',
      'packageSizeBytes',
      'catalog package size exceeds configured maximum'
    )
  }

  const packageRef = normalizePackageRef(ref.packageRef, sourceKind, { ...options, allowedOfficialHosts: officialHosts })
  if (!packageRef.ok) {
    pushFailure(diagnostics, failureReasons, packageRef.reason, 'packageRef', packageRef.detail)
  }

  const pluginId = readNonEmptyString(ref.pluginId)
  const pluginVersion = readNonEmptyString(ref.pluginVersion)
  if (!pluginId) pushFailure(diagnostics, failureReasons, 'unsafe_package_ref', 'pluginId', 'pluginId is required')
  if (!pluginVersion) {
    pushFailure(diagnostics, failureReasons, 'unsafe_package_ref', 'pluginVersion', 'pluginVersion is required')
  }

  if (
    failureReasons.length > 0 ||
    !isOfficialSourceKind(sourceKind, options) ||
    !packageRef.ok ||
    !expectedSha256 ||
    expectedSizeBytes === null ||
    expectedSizeBytes <= 0 ||
    maxBytes === null ||
    maxBytes <= 0 ||
    !pluginId ||
    !pluginVersion
  ) {
    return {
      ok: false,
      failureReasons: uniqueFailures(failureReasons),
      diagnostics: sanitizeDiagnostics(diagnostics),
    }
  }

  return {
    ok: true,
    policy: {
      pluginId,
      pluginVersion,
      packageRef: packageRef.value,
      sourceKind: sourceKind as OfficialDownloadSourceKind,
      expectedSha256,
      expectedSizeBytes,
      maxBytes,
      transportRef: packageRef.transportRef,
    },
    diagnostics: [],
  }
}

function normalizeSourceKind(input: string): string {
  return readNonEmptyString(input)?.toLowerCase() ?? ''
}

function normalizeAllowedHosts(input: readonly string[] | undefined): readonly string[] {
  return (input ?? []).map((host) => readNonEmptyString(host)?.toLowerCase()).filter((host): host is string => Boolean(host))
}

function isOfficialSourceKind(sourceKind: string, options: DownloadPolicyOptions): boolean {
  if (sourceKind === 'catalog_official') return true
  if (sourceKind === 'local_official_fixture') return options.allowLocalFixtures === true
  if (sourceKind === 'dev_fixture') return options.allowDevFixtures === true
  return false
}

function sourceFailureReason(sourceKind: string): DownloadPolicyFailureReason {
  if (REMOTE_REJECTED_KINDS.has(sourceKind)) return 'user_url_not_allowed'
  if (THIRD_PARTY_REJECTED_KINDS.has(sourceKind)) return 'third_party_source_not_allowed'
  return 'non_official_source'
}

function normalizeExpectedSha(input: unknown): string | null {
  return isValidSha256(input) ? normalizeSha256(input) : null
}

function normalizePackageRef(
  packageRef: string,
  sourceKind: string,
  options: DownloadPolicyOptions
): Readonly<
  | { ok: true; value: string; transportRef: string }
  | { ok: false; reason: DownloadPolicyFailureReason; detail: string }
> {
  const value = readNonEmptyString(packageRef)
  if (!value) {
    return { ok: false, reason: 'unsafe_package_ref', detail: 'packageRef is required' }
  }
  if (value.startsWith('file:')) {
    return { ok: false, reason: 'file_url_not_allowed', detail: 'file URLs are not accepted as download sources' }
  }
  if (sourceKind === 'catalog_official') {
    return normalizeOfficialRemoteRef(value, options)
  }
  if (sourceKind === 'local_official_fixture' || sourceKind === 'dev_fixture') {
    return normalizeLocalFixtureRef(value)
  }
  return { ok: false, reason: 'non_official_source', detail: 'unsupported download source kind' }
}

function normalizeOfficialRemoteRef(
  value: string,
  options: DownloadPolicyOptions
): Readonly<
  | { ok: true; value: string; transportRef: string }
  | { ok: false; reason: DownloadPolicyFailureReason; detail: string }
> {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return { ok: false, reason: 'unsafe_package_ref', detail: 'official package reference must be HTTPS URL' }
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: 'non_https_remote', detail: 'official remote package references must use HTTPS' }
  }
  if (!options.allowedOfficialHosts?.length) {
    return {
      ok: false,
      reason: 'official_host_required',
      detail: 'official package host allowlist is required',
    }
  }
  const hostname = parsed.hostname.toLowerCase()
  const hostAllowed = options.allowedOfficialHosts.some((host) => hostname === host.toLowerCase())
  if (!hostAllowed) {
    return {
      ok: false,
      reason: 'official_host_not_allowed',
      detail: 'official package host is not allowed by downloader policy',
    }
  }
  parsed.hash = ''
  parsed.username = ''
  parsed.password = ''
  return { ok: true, value: safeRemoteRefLabel(parsed), transportRef: parsed.toString() }
}

function normalizeLocalFixtureRef(
  value: string
): Readonly<
  | { ok: true; value: string; transportRef: string }
  | { ok: false; reason: DownloadPolicyFailureReason; detail: string }
> {
  if (
    value.includes('/') ||
    value.includes('\\') ||
    value.includes('\u0000') ||
    /(^|[\\/])\.\.($|[\\/])/u.test(value) ||
    /^[A-Za-z]:[\\/]/u.test(value) ||
    /^\\\\/u.test(value) ||
    /^\//u.test(value) ||
    /^[a-z][a-z0-9+.-]*:/iu.test(value)
  ) {
    return { ok: false, reason: 'unsafe_package_ref', detail: 'local fixture ref must be an abstract token' }
  }
  return { ok: true, value, transportRef: value }
}

function safeRemoteRefLabel(parsed: URL): string {
  const parts = parsed.pathname.split('/').filter(Boolean)
  const leaf = parts[parts.length - 1] ?? parsed.hostname
  return sanitizePluginDistributionText(leaf) ?? 'official-package'
}

function pushFailure(
  diagnostics: DownloadPolicyDiagnostic[],
  failureReasons: DownloadPolicyFailureReason[],
  code: DownloadPolicyFailureReason,
  field: string,
  detail: string
): void {
  failureReasons.push(code)
  diagnostics.push({ code, field, detail })
}

function uniqueFailures(values: readonly DownloadPolicyFailureReason[]): readonly DownloadPolicyFailureReason[] {
  const seen = new Set<DownloadPolicyFailureReason>()
  const out: DownloadPolicyFailureReason[] = []
  for (const value of values) {
    if (!seen.has(value)) {
      seen.add(value)
      out.push(value)
    }
  }
  return out
}

function sanitizeDiagnostics(values: readonly DownloadPolicyDiagnostic[]): readonly DownloadPolicyDiagnostic[] {
  return values.map((entry) => ({
    ...entry,
    detail: sanitizePluginDistributionText(entry.detail),
  }))
}
