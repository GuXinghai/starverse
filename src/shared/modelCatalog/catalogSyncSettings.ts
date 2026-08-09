import {
  decodeCatalogFreshnessMsV2,
  decodeCatalogListApplyModeV2,
  decodeCatalogRetentionV2,
  decodeCatalogSyncTriggerPolicyV2,
  type CatalogListApplyMode,
  type CatalogRetention,
  type CatalogSyncTriggerPolicy,
} from './catalogPolicyV2'

export type CatalogAutoSyncPolicy = CatalogSyncTriggerPolicy
export type CatalogListUpdateMode = CatalogListApplyMode
export type CatalogRetentionMs = CatalogRetention

export const OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY = 'openRouterCatalogStartupSyncPolicy'
export const OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY = 'openRouterCatalogPickerOpenSyncPolicy'
export const OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY = 'openRouterCatalogListUpdateMode'
export const OPENROUTER_CATALOG_FRESHNESS_MS_KEY = 'openRouterCatalogFreshnessMs'
export const OPENROUTER_CATALOG_RETENTION_MS_KEY = 'openRouterCatalogRetentionMs'
export const OPENROUTER_DEPRECATED_CATALOG_CACHE_CLEARED_AT_MS_KEY = 'openRouterDeprecatedCatalogCacheClearedAtMs'

export const DEFAULT_CATALOG_AUTO_SYNC_POLICY: CatalogAutoSyncPolicy = 'never'
export const DEFAULT_CATALOG_LIST_UPDATE_MODE: CatalogListUpdateMode = 'manual'
export const DEFAULT_CATALOG_FRESHNESS_MS = 24 * 60 * 60 * 1000
export const DEFAULT_CATALOG_RETENTION_MS = 90 * 24 * 60 * 60 * 1000

export const CATALOG_FRESHNESS_PRESETS_MS = [
  15 * 60 * 1000,
  60 * 60 * 1000,
  6 * 60 * 60 * 1000,
  DEFAULT_CATALOG_FRESHNESS_MS,
  7 * 24 * 60 * 60 * 1000,
] as const

export const CATALOG_RETENTION_PRESETS_MS = [
  7 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
  DEFAULT_CATALOG_RETENTION_MS,
  180 * 24 * 60 * 60 * 1000,
] as const

export function normalizeCatalogAutoSyncPolicy(value: unknown): CatalogAutoSyncPolicy {
  try { return decodeCatalogSyncTriggerPolicyV2(value) } catch { return DEFAULT_CATALOG_AUTO_SYNC_POLICY }
}

export function normalizeCatalogListUpdateMode(value: unknown): CatalogListUpdateMode {
  try { return decodeCatalogListApplyModeV2(value) } catch { return DEFAULT_CATALOG_LIST_UPDATE_MODE }
}

export function normalizeCatalogFreshnessMs(value: unknown): number {
  try { return decodeCatalogFreshnessMsV2(value) ?? DEFAULT_CATALOG_FRESHNESS_MS } catch { return DEFAULT_CATALOG_FRESHNESS_MS }
}

export function normalizeCatalogRetentionMs(value: unknown): CatalogRetentionMs {
  try { return decodeCatalogRetentionV2(value) } catch { return DEFAULT_CATALOG_RETENTION_MS }
}

export function isCatalogStatusStale(input: Readonly<{
  status?: unknown
  lastSyncAtMs?: unknown
  freshnessMs?: unknown
  nowMs?: number
}>): boolean {
  if (input.status !== 'synced') return true
  const lastSyncAtMs = Number(input.lastSyncAtMs ?? 0)
  if (!Number.isFinite(lastSyncAtMs) || lastSyncAtMs <= 0) return true
  if (input.freshnessMs === null || input.freshnessMs === undefined) return false
  const freshnessMs = decodeCatalogFreshnessMsV2(input.freshnessMs)
  if (freshnessMs === null) return false
  return (input.nowMs ?? Date.now()) - lastSyncAtMs >= freshnessMs
}
