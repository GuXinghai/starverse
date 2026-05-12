import type { PluginFailureReason } from './types'
import { sanitizePluginDistributionText } from './sanitization'
import {
  patchPdpRegistryRecord,
  type PdpPluginRegistryRecord,
} from './registryModel'

export type SafeHealthResult = Readonly<{
  status: 'healthy' | 'failed' | 'unavailable'
  detail?: string | null
}>

export type LifecycleTransitionResult =
  | Readonly<{ ok: true; record: PdpPluginRegistryRecord }>
  | Readonly<{
      ok: false
      failureReason: PluginFailureReason
      detail: string
      record: PdpPluginRegistryRecord
    }>

const ENABLE_BLOCKED_FAILURE_REASONS = new Set<PluginFailureReason>([
  'revoked',
  'expired_metadata',
  'incompatible_platform',
  'incompatible_arch',
  'incompatible_app_version',
])

export function enablePdpPluginRecord(
  record: PdpPluginRegistryRecord
): LifecycleTransitionResult {
  if (record.installState === 'uninstalled') {
    return fail(record, 'unknown', 'cannot enable uninstalled package')
  }
  if (record.installState === 'failed' || record.registryState === 'failed') {
    return fail(record, record.failureReason ?? 'unknown', 'cannot enable failed package')
  }
  if (record.verificationStatus !== 'verified') {
    const reason = record.verificationStatus === 'unverified' ? 'unsigned' : 'signature_invalid'
    return fail(record, reason, 'cannot enable package before verification completes')
  }
  if (record.failureReason && ENABLE_BLOCKED_FAILURE_REASONS.has(record.failureReason)) {
    return fail(record, record.failureReason, 'cannot enable incompatible package')
  }
  const next = patchPdpRegistryRecord(record, {
    registryState: 'enabled',
    installState: 'installed',
    enabled: true,
    healthStatus: record.healthStatus === 'disabled' ? 'unknown' : record.healthStatus,
    failureReason: null,
  })
  return { ok: true, record: next }
}

export function disablePdpPluginRecord(
  record: PdpPluginRegistryRecord
): LifecycleTransitionResult {
  if (record.registryState !== 'enabled') {
    return fail(record, 'disabled_by_user', 'disable is only valid from enabled state')
  }
  const next = patchPdpRegistryRecord(record, {
    registryState: 'disabled',
    installState: 'disabled',
    enabled: false,
    healthStatus: 'disabled',
    failureReason: 'disabled_by_user',
  })
  return { ok: true, record: next }
}

export function uninstallPdpPluginRecord(
  record: PdpPluginRegistryRecord
): PdpPluginRegistryRecord {
  return patchPdpRegistryRecord(record, {
    registryState: 'uninstalled',
    installState: 'uninstalled',
    enabled: false,
    healthStatus: 'unknown',
    failureReason: null,
  })
}

export function markPdpPluginVerifying(
  record: PdpPluginRegistryRecord
): PdpPluginRegistryRecord {
  return patchPdpRegistryRecord(record, {
    registryState: 'verifying',
    installState: 'installing',
    verificationStatus: 'unverified',
    enabled: false,
  })
}

export function markPdpPluginVerified(
  record: PdpPluginRegistryRecord
): PdpPluginRegistryRecord {
  return patchPdpRegistryRecord(record, {
    registryState: 'verified',
    installState: 'installed',
    verificationStatus: 'verified',
    enabled: false,
    failureReason: null,
  })
}

export function markPdpPluginVerificationFailed(
  record: PdpPluginRegistryRecord,
  failureReason: PluginFailureReason
): PdpPluginRegistryRecord {
  return patchPdpRegistryRecord(record, {
    registryState: 'failed',
    installState: 'failed',
    verificationStatus: 'failed',
    enabled: false,
    healthStatus: 'failed',
    failureReason,
  })
}

export function applySafeHealthResultToPdpRecord(
  record: PdpPluginRegistryRecord,
  result: SafeHealthResult
): PdpPluginRegistryRecord {
  if (result.status === 'healthy') {
    return patchPdpRegistryRecord(record, {
      healthStatus: 'healthy',
      failureReason: null,
    })
  }
  if (result.status === 'failed') {
    return patchPdpRegistryRecord(record, {
      registryState: 'failed',
      installState: record.installState === 'uninstalled' ? 'uninstalled' : 'failed',
      enabled: false,
      healthStatus: 'failed',
      failureReason: 'health_failed',
      verificationStatus: record.verificationStatus,
      diagnostics: appendDiagnostic(record, sanitizeHealthDetail(result.detail)),
    })
  }
  return patchPdpRegistryRecord(record, {
    healthStatus: 'unknown',
    failureReason: record.failureReason === 'health_failed' ? null : record.failureReason,
    verificationStatus: record.verificationStatus,
    diagnostics: appendDiagnostic(record, sanitizeHealthDetail(result.detail)),
  })
}

function appendDiagnostic(
  record: PdpPluginRegistryRecord,
  detail: string | undefined
): readonly string[] {
  if (!detail) return record.diagnostics
  return [...record.diagnostics, detail]
}

function sanitizeHealthDetail(detail: string | null | undefined): string | undefined {
  return sanitizePluginDistributionText(detail)
}

function fail(
  record: PdpPluginRegistryRecord,
  failureReason: PluginFailureReason,
  detail: string
): LifecycleTransitionResult {
  return {
    ok: false,
    failureReason,
    detail,
    record,
  }
}
