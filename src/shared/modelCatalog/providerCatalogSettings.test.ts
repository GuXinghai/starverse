import { describe, expect, it, vi } from 'vitest'
import {
  OPENROUTER_CATALOG_FRESHNESS_MS_KEY,
  OPENROUTER_CATALOG_RETENTION_MS_KEY,
  OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY,
} from './catalogSyncSettings'
import {
  providerCatalogSettingKey,
  readProviderCatalogSettings,
  type ProviderCatalogSettingsStoreReader,
} from './providerCatalogSettings'

function createStore(values: Record<string, unknown>): ProviderCatalogSettingsStoreReader {
  return {
    get: vi.fn((key: string) => values[key]),
  }
}

describe('providerCatalogSettings', () => {
  it('builds provider-neutral setting keys for non-OpenRouter providers', () => {
    expect(providerCatalogSettingKey('google_ai_studio', 'freshnessMs'))
      .toBe('providerCatalog.google_ai_studio.freshnessMs')
  })

  it('keeps OpenRouter legacy settings as compatibility keys', () => {
    const store = createStore({
      [OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY]: 'always',
      [OPENROUTER_CATALOG_FRESHNESS_MS_KEY]: 15 * 60 * 1000,
      [OPENROUTER_CATALOG_RETENTION_MS_KEY]: 'never',
      [providerCatalogSettingKey('openrouter', 'startupSyncPolicy')]: 'never',
    })

    expect(readProviderCatalogSettings(store, 'openrouter')).toMatchObject({
      providerKey: 'openrouter',
      startupSyncPolicy: 'always',
      freshnessMs: 15 * 60 * 1000,
      retentionMs: 'never',
    })
  })

  it('uses provider-neutral keys for new providers', () => {
    const store = createStore({
      [providerCatalogSettingKey('deepseek', 'startupSyncPolicy')]: 'never',
      [providerCatalogSettingKey('deepseek', 'freshnessMs')]: 60 * 60 * 1000,
      [providerCatalogSettingKey('deepseek', 'retentionMs')]: 7 * 24 * 60 * 60 * 1000,
    })

    expect(readProviderCatalogSettings(store, 'deepseek')).toMatchObject({
      providerKey: 'deepseek',
      startupSyncPolicy: 'never',
      freshnessMs: 60 * 60 * 1000,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
    })
  })

  it('falls back to safe defaults for invalid values', () => {
    const store = createStore({
      [providerCatalogSettingKey('google_ai_studio', 'startupSyncPolicy')]: 'bad',
      [providerCatalogSettingKey('google_ai_studio', 'freshnessMs')]: 123,
      [providerCatalogSettingKey('google_ai_studio', 'retentionMs')]: 456,
    })

    expect(readProviderCatalogSettings(store, 'google_ai_studio')).toMatchObject({
      startupSyncPolicy: 'stale_only',
      freshnessMs: 24 * 60 * 60 * 1000,
      retentionMs: 90 * 24 * 60 * 60 * 1000,
    })
  })
})
