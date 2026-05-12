import { createHash } from 'node:crypto'
import { sanitizePluginDistributionText } from './sanitization'
import {
  validateDownloadPolicy,
  type AcceptedDownloadPolicy,
  type DownloadPolicyCatalogPackageRef,
  type DownloadPolicyFailureReason,
  type DownloadPolicyOptions,
} from './downloadPolicy'

export type PackageDownloadTransportRequest = Readonly<{
  transportRef: string
  maxBytes: number
  signal?: AbortSignal
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

export type PackageDownloadTransport = Readonly<{
  fetchPackage(request: PackageDownloadTransportRequest): Promise<PackageDownloadTransportResult>
}>

export type StagedDownloadedPackage = Readonly<{
  pluginId: string
  pluginVersion: string
  stageKind: 'memory'
  stagingRef: string
  sizeBytes: number
  sha256: string
  bytes: Uint8Array
}>

export type PackageDownloadFailureReason =
  | DownloadPolicyFailureReason
  | 'download_cancelled'
  | 'download_failed'
  | 'redirect_rejected'
  | 'final_ref_missing'
  | 'download_too_large'
  | 'hash_mismatch'
  | 'size_mismatch'

export type PackageDownloadDiagnostic = Readonly<{
  code: PackageDownloadFailureReason
  field: string
  detail?: string
}>

export type PackageDownloadResult =
  | Readonly<{
      ok: true
      status: 'staged_verified_bytes'
      stagedPackage: StagedDownloadedPackage
      diagnostics: readonly PackageDownloadDiagnostic[]
    }>
  | Readonly<{
      ok: false
      status: 'failed' | 'cancelled'
      failureReasons: readonly PackageDownloadFailureReason[]
      diagnostics: readonly PackageDownloadDiagnostic[]
    }>

export type DownloadOfficialPackageInput = Readonly<{
  packageRef: DownloadPolicyCatalogPackageRef
  policy: DownloadPolicyOptions
  transport: PackageDownloadTransport
  signal?: AbortSignal
}>

export async function downloadOfficialPackageToMemory(
  input: DownloadOfficialPackageInput
): Promise<PackageDownloadResult> {
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

function mapTransportFailure(result: Exclude<PackageDownloadTransportResult, { ok: true }>): PackageDownloadResult {
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
    default:
      return fail('failed', ['download_failed'], [
        { code: 'download_failed', field: 'transport', detail: result.detail ?? 'download failed' },
      ])
  }
}

function createStagingRef(policy: AcceptedDownloadPolicy): string {
  return `staged_${policy.pluginId}_${policy.pluginVersion}`.replace(/[^a-z0-9._-]/giu, '_')
}

function fail(
  status: 'failed' | 'cancelled',
  failureReasons: readonly PackageDownloadFailureReason[],
  diagnostics: readonly PackageDownloadDiagnostic[]
): PackageDownloadResult {
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
