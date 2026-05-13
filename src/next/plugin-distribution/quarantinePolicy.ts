import { sanitizePluginDistributionText } from './sanitization'
import type { PdpPluginRegistryRecord } from './registryModel'
import type { PluginFailureReason } from './types'

export const PDP_QUARANTINE_REASONS = [
  'revoked',
  'verification_failed',
  'signature_invalid',
  'hash_mismatch',
  'integrity_missing',
  'health_failed',
  'manual_owner_action',
] as const

export type PdpQuarantineReason = (typeof PDP_QUARANTINE_REASONS)[number]

export type PdpQuarantineInput = Readonly<{
  record: PdpPluginRegistryRecord
  reason: PdpQuarantineReason
  detail?: string | null
  ownedCleanupRefs?: readonly string[]
}>

export type PdpRevocationResponseInput = Readonly<{
  record: PdpPluginRegistryRecord
  revoked: boolean
  detail?: string | null
  ownedCleanupRefs?: readonly string[]
}>

export type PdpQuarantineResult = Readonly<{
  record: PdpPluginRegistryRecord
  quarantined: boolean
  disabled: boolean
  enableBlocked: true
  cleanupRefs: readonly string[]
  diagnostics: readonly string[]
  arbitraryDeletionDeferred: true
}>

export function quarantinePdpPlugin(input: PdpQuarantineInput): PdpQuarantineResult {
  const failureReason = mapQuarantineReason(input.reason)
  const diagnostics = sanitizeDiagnostics([input.reason, input.detail])
  const record: PdpPluginRegistryRecord = {
    ...input.record,
    registryState: 'failed',
    installState: 'quarantined',
    verificationStatus: failureReason === 'revoked' ? 'revoked' : 'failed',
    enabled: false,
    healthStatus: input.record.healthStatus === 'healthy' ? 'unknown' : input.record.healthStatus,
    failureReason,
    diagnostics: [...input.record.diagnostics, ...diagnostics].map((entry) => sanitizePluginDistributionText(entry) ?? 'sanitized'),
  }
  return {
    record,
    quarantined: true,
    disabled: true,
    enableBlocked: true,
    cleanupRefs: sanitizeOwnedRefs(input.ownedCleanupRefs ?? []),
    diagnostics,
    arbitraryDeletionDeferred: true,
  }
}

export function applyPdpRevocationResponse(input: PdpRevocationResponseInput): PdpQuarantineResult {
  if (!input.revoked) {
    return {
      record: input.record,
      quarantined: false,
      disabled: !input.record.enabled,
      enableBlocked: true,
      cleanupRefs: [],
      diagnostics: sanitizeDiagnostics([input.detail]),
      arbitraryDeletionDeferred: true,
    }
  }
  return quarantinePdpPlugin({
    record: input.record,
    reason: 'revoked',
    detail: input.detail,
    ownedCleanupRefs: input.ownedCleanupRefs,
  })
}

export function canEnablePdpQuarantinedRecord(record: PdpPluginRegistryRecord): boolean {
  if (record.verificationStatus !== 'verified') return false
  if (record.installState !== 'installed') return false
  if (record.registryState === 'failed') return false
  if (record.failureReason) return false
  return true
}

function mapQuarantineReason(reason: PdpQuarantineReason): PluginFailureReason {
  switch (reason) {
    case 'revoked':
      return 'revoked'
    case 'signature_invalid':
      return 'signature_invalid'
    case 'hash_mismatch':
      return 'hash_mismatch'
    case 'integrity_missing':
      return 'integrity_missing'
    case 'health_failed':
      return 'health_failed'
    default:
      return 'unknown'
  }
}

function sanitizeOwnedRefs(refs: readonly string[]): readonly string[] {
  const out: string[] = []
  for (const ref of refs) {
    const value = typeof ref === 'string' ? ref.trim() : ''
    if (!isSafeOwnedRef(value)) continue
    out.push(value)
  }
  return out
}

function isSafeOwnedRef(value: string): boolean {
  return (
    /^[a-z0-9][a-z0-9._:-]{1,127}$/iu.test(value) &&
    !value.includes('/') &&
    !value.includes('\\') &&
    !value.includes('\u0000') &&
    !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value)
  )
}

function sanitizeDiagnostics(values: readonly (string | null | undefined)[]): readonly string[] {
  return values
    .map((value) => sanitizePluginDistributionText(value))
    .filter((value): value is string => Boolean(value))
}
