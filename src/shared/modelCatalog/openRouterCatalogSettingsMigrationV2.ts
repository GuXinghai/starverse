import {
  OPENROUTER_CATALOG_FRESHNESS_MS_KEY,
  OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY,
  OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY,
  OPENROUTER_CATALOG_RETENTION_MS_KEY,
  OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY,
} from './catalogSyncSettings'
import { validateCatalogPolicyV2, type CatalogPolicyV2 } from './catalogPolicyV2'

export const OPENROUTER_CATALOG_LEGACY_KEYS_V2 = Object.freeze([
  OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY,
  OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY,
  OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY,
  OPENROUTER_CATALOG_FRESHNESS_MS_KEY,
  OPENROUTER_CATALOG_RETENTION_MS_KEY,
] as const)

const LEGACY_DEFAULTS: CatalogPolicyV2 = Object.freeze({
  startupSyncPolicy: 'stale_only', pickerOpenSyncPolicy: 'stale_only', listApplyMode: 'manual',
  freshnessMs: 24 * 60 * 60 * 1000, retentionMs: 90 * 24 * 60 * 60 * 1000,
})

export class OpenRouterCatalogSettingsMigrationV2Error extends Error {
  constructor() {
    super('OPENROUTER_CATALOG_SETTINGS_MIGRATION_INVALID')
    this.name = 'OpenRouterCatalogSettingsMigrationV2Error'
  }
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

export function migrateOpenRouterCatalogSettingsV2(raw: unknown): CatalogPolicyV2 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const source = raw as Record<string, unknown>
  if (!OPENROUTER_CATALOG_LEGACY_KEYS_V2.some((key) => hasOwn(source, key))) return null
  const policy = {
    startupSyncPolicy: source[OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY] ?? LEGACY_DEFAULTS.startupSyncPolicy,
    pickerOpenSyncPolicy: source[OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY] ?? LEGACY_DEFAULTS.pickerOpenSyncPolicy,
    listApplyMode: source[OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY] ?? LEGACY_DEFAULTS.listApplyMode,
    freshnessMs: source[OPENROUTER_CATALOG_FRESHNESS_MS_KEY] ?? LEGACY_DEFAULTS.freshnessMs,
    retentionMs: source[OPENROUTER_CATALOG_RETENTION_MS_KEY] ?? LEGACY_DEFAULTS.retentionMs,
  }
  if ((policy.startupSyncPolicy !== 'always' && policy.startupSyncPolicy !== 'stale_only' && policy.startupSyncPolicy !== 'never') ||
      (policy.pickerOpenSyncPolicy !== 'always' && policy.pickerOpenSyncPolicy !== 'stale_only' && policy.pickerOpenSyncPolicy !== 'never') ||
      (policy.listApplyMode !== 'automatic' && policy.listApplyMode !== 'manual') ||
      (typeof policy.freshnessMs !== 'number' || !Number.isSafeInteger(policy.freshnessMs) || policy.freshnessMs < 0) ||
      (policy.retentionMs !== 'never' && (typeof policy.retentionMs !== 'number' || !Number.isSafeInteger(policy.retentionMs) || policy.retentionMs < 0))) {
    throw new OpenRouterCatalogSettingsMigrationV2Error()
  }
  try { return validateCatalogPolicyV2(policy) }
  catch { throw new OpenRouterCatalogSettingsMigrationV2Error() }
}

export function canonicalOpenRouterCatalogPolicyV2(policy: CatalogPolicyV2): Readonly<{ providerCatalog: { openrouter: { policyV2: CatalogPolicyV2 } } }> {
  return Object.freeze({ providerCatalog: Object.freeze({ openrouter: Object.freeze({ policyV2: policy }) }) })
}
