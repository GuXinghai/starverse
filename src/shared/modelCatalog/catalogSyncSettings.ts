export type CatalogAutoSyncPolicy = 'always' | 'stale_only' | 'never'
export type CatalogListUpdateMode = 'automatic' | 'manual'
export type CatalogRetentionMs = number | 'never'

export const OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY = 'openRouterCatalogStartupSyncPolicy'
export const OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY = 'openRouterCatalogPickerOpenSyncPolicy'
export const OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY = 'openRouterCatalogListUpdateMode'
export const OPENROUTER_CATALOG_FRESHNESS_MS_KEY = 'openRouterCatalogFreshnessMs'
export const OPENROUTER_CATALOG_RETENTION_MS_KEY = 'openRouterCatalogRetentionMs'
export const OPENROUTER_DEPRECATED_CATALOG_CACHE_CLEARED_AT_MS_KEY = 'openRouterDeprecatedCatalogCacheClearedAtMs'

export const DEFAULT_CATALOG_AUTO_SYNC_POLICY: CatalogAutoSyncPolicy = 'stale_only'
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
  return value === 'always' || value === 'stale_only' || value === 'never'
    ? value
    : DEFAULT_CATALOG_AUTO_SYNC_POLICY
}

export function normalizeCatalogListUpdateMode(value: unknown): CatalogListUpdateMode {
  return value === 'automatic' || value === 'manual'
    ? value
    : DEFAULT_CATALOG_LIST_UPDATE_MODE
}

export function normalizeCatalogFreshnessMs(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return (CATALOG_FRESHNESS_PRESETS_MS as readonly number[]).includes(numeric)
    ? numeric
    : DEFAULT_CATALOG_FRESHNESS_MS
}

export function normalizeCatalogRetentionMs(value: unknown): CatalogRetentionMs {
  if (value === 'never') return 'never'
  const numeric = typeof value === 'number' ? value : Number(value)
  return (CATALOG_RETENTION_PRESETS_MS as readonly number[]).includes(numeric)
    ? numeric
    : DEFAULT_CATALOG_RETENTION_MS
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
  const freshnessMs = normalizeCatalogFreshnessMs(input.freshnessMs)
  return (input.nowMs ?? Date.now()) - lastSyncAtMs >= freshnessMs
}
