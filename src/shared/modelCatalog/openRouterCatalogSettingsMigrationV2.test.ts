import { describe, expect, it } from 'vitest'
import { migrateOpenRouterCatalogSettingsV2 } from './openRouterCatalogSettingsMigrationV2'

describe('OpenRouter catalog settings migration V2', () => {
  it('converts only legacy OpenRouter settings into a provider override', () => {
    expect(migrateOpenRouterCatalogSettingsV2({
      openRouterCatalogStartupSyncPolicy: 'never',
      openRouterCatalogPickerOpenSyncPolicy: 'stale_only',
      openRouterCatalogListUpdateMode: 'manual',
      openRouterCatalogFreshnessMs: 60 * 60 * 1000,
      openRouterCatalogRetentionMs: 'never',
    })).toEqual({
      startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'stale_only', listApplyMode: 'manual',
      freshnessMs: 60 * 60 * 1000, retentionMs: 'never',
    })
  })

  it('rejects invalid legacy values instead of silently choosing a policy', () => {
    expect(() => migrateOpenRouterCatalogSettingsV2({ openRouterCatalogFreshnessMs: 'not-a-duration' })).toThrow('OPENROUTER_CATALOG_SETTINGS_MIGRATION_INVALID')
  })
})
