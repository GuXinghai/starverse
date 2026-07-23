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
  if (!SYNC_POLICIES.includes(raw.startupSyncPolicy as CatalogSyncTriggerPolicy) ||
      !SYNC_POLICIES.includes(raw.pickerOpenSyncPolicy as CatalogSyncTriggerPolicy) ||
      !APPLY_MODES.includes(raw.listApplyMode as CatalogListApplyMode)) {
    throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
  }
  const freshnessMs = raw.freshnessMs
  if (freshnessMs !== null && !isFiniteNonNegativeInteger(freshnessMs)) {
    throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
  }
  if ((raw.startupSyncPolicy === 'stale_only' || raw.pickerOpenSyncPolicy === 'stale_only') && freshnessMs === null) {
    throw new CatalogPolicyV2Error('CATALOG_POLICY_FRESHNESS_REQUIRED')
  }
  const retentionMs = raw.retentionMs
  if (retentionMs !== 'never' && !isFiniteNonNegativeInteger(retentionMs)) {
    throw new CatalogPolicyV2Error('CATALOG_POLICY_INVALID')
  }
  return Object.freeze({
    startupSyncPolicy: raw.startupSyncPolicy as CatalogSyncTriggerPolicy,
    pickerOpenSyncPolicy: raw.pickerOpenSyncPolicy as CatalogSyncTriggerPolicy,
    listApplyMode: raw.listApplyMode as CatalogListApplyMode,
    freshnessMs: freshnessMs as number | null,
    retentionMs: retentionMs as CatalogRetention,
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
