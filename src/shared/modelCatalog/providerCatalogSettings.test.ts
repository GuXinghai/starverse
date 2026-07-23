import { describe, expect, it, vi } from 'vitest'
import { CATALOG_POLICY_PRESETS_V2 } from './catalogPolicyPresetsV2'
import { GLOBAL_CATALOG_POLICY_V2_STORE_KEY, providerCatalogPolicyV2StoreKey } from './catalogPolicyResolverV2'
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

  it('uses provider overrides without reading OpenRouter legacy settings', () => {
    const store = createStore({
      [GLOBAL_CATALOG_POLICY_V2_STORE_KEY]: CATALOG_POLICY_PRESETS_V2.balanced,
      [providerCatalogPolicyV2StoreKey('openrouter')]: CATALOG_POLICY_PRESETS_V2.manual,
    })

    expect(readProviderCatalogSettings(store, 'openrouter')).toMatchObject({
      providerKey: 'openrouter',
      source: 'provider_override', startupSyncPolicy: 'never', freshnessMs: null, retentionMs: 90 * 24 * 60 * 60 * 1000,
    })
  })

  it('uses provider-neutral keys for new providers', () => {
    const store = createStore({
      [providerCatalogPolicyV2StoreKey('deepseek')]: { ...CATALOG_POLICY_PRESETS_V2.frequent, retentionMs: 7 * 24 * 60 * 60 * 1000 },
    })

    expect(readProviderCatalogSettings(store, 'deepseek')).toMatchObject({
      providerKey: 'deepseek',
      startupSyncPolicy: 'stale_only',
      freshnessMs: 60 * 60 * 1000,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
    })
  })

  it('keeps an unconfigured provider network-quiet', () => {
    const store = createStore({
      [GLOBAL_CATALOG_POLICY_V2_STORE_KEY]: undefined,
    })

    expect(readProviderCatalogSettings(store, 'google_ai_studio')).toMatchObject({
      source: 'unconfigured', startupSyncPolicy: 'never', pickerOpenSyncPolicy: 'never', freshnessMs: null, retentionMs: 'never',
    })
  })
})
