export type CatalogSyncTriggerPolicy = 'always' | 'stale_only' | 'never'
export type CatalogListApplyMode = 'automatic' | 'manual'
export type CatalogRetention = number | 'never'

export type CatalogPolicyV2 = Readonly<{
  startupSyncPolicy: CatalogSyncTriggerPolicy
  pickerOpenSyncPolicy: CatalogSyncTriggerPolicy
  listApplyMode: CatalogListApplyMode
  freshnessMs: number | null
  retentionMs: CatalogRetention
}>

export type CatalogPolicySourceV2 = 'provider_override' | 'global' | 'unconfigured'

export type ResolvedCatalogPolicyV2 = Readonly<{
  source: CatalogPolicySourceV2
  policy: CatalogPolicyV2 | null
}>

export const UNCONFIGURED_CATALOG_POLICY_V2: ResolvedCatalogPolicyV2 = Object.freeze({
  source: 'unconfigured',
  policy: null,
})

const SYNC_POLICIES: readonly CatalogSyncTriggerPolicy[] = ['always', 'stale_only', 'never']
const APPLY_MODES: readonly CatalogListApplyMode[] = ['automatic', 'manual']

export class CatalogPolicyV2Error extends Error {
  constructor(readonly code: 'CATALOG_POLICY_INVALID' | 'CATALOG_POLICY_FRESHNESS_REQUIRED') {
    super(code)
    this.name = 'CatalogPolicyV2Error'
  }
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function decodeCatalogSyncTriggerPolicyV2(value: unknown): CatalogSyncTriggerPolicy {
  if (!SYNC_POLICIES.includes(value as CatalogSyncTriggerPolicy)) {
    throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
  }
  return value as CatalogSyncTriggerPolicy
}

export function decodeCatalogListApplyModeV2(value: unknown): CatalogListApplyMode {
  if (!APPLY_MODES.includes(value as CatalogListApplyMode)) {
    throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
  }
  return value as CatalogListApplyMode
}

export function decodeCatalogFreshnessMsV2(value: unknown): number | null {
  if (value === null) return null
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!isFiniteNonNegativeInteger(numeric)) throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
  return numeric
}

export function decodeCatalogRetentionV2(value: unknown): CatalogRetention {
  if (value === 'never') return 'never'
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!isFiniteNonNegativeInteger(numeric)) throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
  return numeric
}

export function validateCatalogPolicyV2(value: unknown): CatalogPolicyV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
  }
  const raw = value as Record<string, unknown>
  const keys = Object.keys(raw).sort()
  if (JSON.stringify(keys) !== JSON.stringify([
    'freshnessMs', 'listApplyMode', 'pickerOpenSyncPolicy', 'retentionMs', 'startupSyncPolicy',
  ])) {
    throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
  }
  const startupSyncPolicy = decodeCatalogSyncTriggerPolicyV2(raw.startupSyncPolicy)
  const pickerOpenSyncPolicy = decodeCatalogSyncTriggerPolicyV2(raw.pickerOpenSyncPolicy)
  const listApplyMode = decodeCatalogListApplyModeV2(raw.listApplyMode)
  const freshnessMs = decodeCatalogFreshnessMsV2(raw.freshnessMs)
  if ((raw.startupSyncPolicy === 'stale_only' || raw.pickerOpenSyncPolicy === 'stale_only') && freshnessMs === null) {
    throw new CatalogPolicyV2Error('CATALOG_POLICY_FRESHNESS_REQUIRED')
  }
  if (freshnessMs === null && (startupSyncPolicy !== 'never' || pickerOpenSyncPolicy !== 'never')) {
    throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
  }
  const retentionMs = decodeCatalogRetentionV2(raw.retentionMs)
  return Object.freeze({
    startupSyncPolicy,
    pickerOpenSyncPolicy,
    listApplyMode,
    freshnessMs,
    retentionMs,
  })
}

export function isCatalogPolicyV2(value: unknown): value is CatalogPolicyV2 {
  try {
    validateCatalogPolicyV2(value)
    return true
  } catch {
    return false
  }
}

export function resolveCatalogPolicyV2(input: Readonly<{
  providerOverride?: unknown
  globalPolicy?: unknown
}>): ResolvedCatalogPolicyV2 {
  if (input.providerOverride !== undefined && input.providerOverride !== null) {
    if (!isCatalogPolicyV2(input.providerOverride)) throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
    return Object.freeze({ source: 'provider_override', policy: validateCatalogPolicyV2(input.providerOverride) })
  }
  if (input.globalPolicy !== undefined && input.globalPolicy !== null) {
    if (!isCatalogPolicyV2(input.globalPolicy)) throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
    return Object.freeze({ source: 'global', policy: validateCatalogPolicyV2(input.globalPolicy) })
  }
  return UNCONFIGURED_CATALOG_POLICY_V2
}
