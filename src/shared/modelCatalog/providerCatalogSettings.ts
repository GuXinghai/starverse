import {
  DEFAULT_CATALOG_AUTO_SYNC_POLICY,
  DEFAULT_CATALOG_FRESHNESS_MS,
  DEFAULT_CATALOG_LIST_UPDATE_MODE,
  DEFAULT_CATALOG_RETENTION_MS,
  OPENROUTER_CATALOG_FRESHNESS_MS_KEY,
  OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY,
  OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY,
  OPENROUTER_CATALOG_RETENTION_MS_KEY,
  OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY,
  type CatalogAutoSyncPolicy,
  type CatalogListUpdateMode,
  type CatalogRetentionMs,
  normalizeCatalogAutoSyncPolicy,
  normalizeCatalogFreshnessMs,
  normalizeCatalogListUpdateMode,
  normalizeCatalogRetentionMs,
} from './catalogSyncSettings'
import type { ProviderCatalogKey } from './providerCatalogContracts'

export type ProviderCatalogSettingsStoreReader = Readonly<{
  get: (key: string) => unknown
}>

export type ProviderCatalogSettingName =
  | 'startupSyncPolicy'
  | 'pickerOpenSyncPolicy'
  | 'listUpdateMode'
  | 'freshnessMs'
  | 'retentionMs'

export type ProviderCatalogSettings = Readonly<{
  providerKey: ProviderCatalogKey
  startupSyncPolicy: CatalogAutoSyncPolicy
  pickerOpenSyncPolicy: CatalogAutoSyncPolicy
  listUpdateMode: CatalogListUpdateMode
  freshnessMs: number
  retentionMs: CatalogRetentionMs
}>

const OPENROUTER_LEGACY_SETTING_KEYS: Readonly<Partial<Record<ProviderCatalogSettingName, string>>> = {
  startupSyncPolicy: OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY,
  pickerOpenSyncPolicy: OPENROUTER_CATALOG_PICKER_OPEN_SYNC_POLICY_KEY,
  listUpdateMode: OPENROUTER_CATALOG_LIST_UPDATE_MODE_KEY,
  freshnessMs: OPENROUTER_CATALOG_FRESHNESS_MS_KEY,
  retentionMs: OPENROUTER_CATALOG_RETENTION_MS_KEY,
}

export function providerCatalogSettingKey(
  providerKey: ProviderCatalogKey,
  settingName: ProviderCatalogSettingName,
): string {
  return `providerCatalog.${String(providerKey).trim()}.${settingName}`
}

function readProviderCatalogSetting(input: Readonly<{
  store: ProviderCatalogSettingsStoreReader
  providerKey: ProviderCatalogKey
  settingName: ProviderCatalogSettingName
}>): unknown {
  const providerKey = String(input.providerKey).trim()
  if (providerKey === 'openrouter') {
    const legacyKey = OPENROUTER_LEGACY_SETTING_KEYS[input.settingName]
    if (legacyKey) {
      const legacyValue = input.store.get(legacyKey)
      if (legacyValue !== undefined && legacyValue !== null && legacyValue !== '') return legacyValue
    }
  }
  return input.store.get(providerCatalogSettingKey(providerKey, input.settingName))
}

export function readProviderCatalogSettings(
  store: ProviderCatalogSettingsStoreReader,
  providerKey: ProviderCatalogKey,
): ProviderCatalogSettings {
  return {
    providerKey,
    startupSyncPolicy: normalizeCatalogAutoSyncPolicy(readProviderCatalogSetting({
      store,
      providerKey,
      settingName: 'startupSyncPolicy',
    }) ?? DEFAULT_CATALOG_AUTO_SYNC_POLICY),
    pickerOpenSyncPolicy: normalizeCatalogAutoSyncPolicy(readProviderCatalogSetting({
      store,
      providerKey,
      settingName: 'pickerOpenSyncPolicy',
    }) ?? DEFAULT_CATALOG_AUTO_SYNC_POLICY),
    listUpdateMode: normalizeCatalogListUpdateMode(readProviderCatalogSetting({
      store,
      providerKey,
      settingName: 'listUpdateMode',
    }) ?? DEFAULT_CATALOG_LIST_UPDATE_MODE),
    freshnessMs: normalizeCatalogFreshnessMs(readProviderCatalogSetting({
      store,
      providerKey,
      settingName: 'freshnessMs',
    }) ?? DEFAULT_CATALOG_FRESHNESS_MS),
    retentionMs: normalizeCatalogRetentionMs(readProviderCatalogSetting({
      store,
      providerKey,
      settingName: 'retentionMs',
    }) ?? DEFAULT_CATALOG_RETENTION_MS),
  }
}
