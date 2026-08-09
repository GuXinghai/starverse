import { describe, expect, it } from 'vitest'
import { CATALOG_POLICY_PRESETS_V2 } from './catalogPolicyPresetsV2'
import { resolveCatalogPolicyV2, validateCatalogPolicyV2 } from './catalogPolicyV2'
import { GLOBAL_CATALOG_POLICY_V2_STORE_KEY, providerCatalogPolicyV2StoreKey, readResolvedCatalogPolicyV2 } from './catalogPolicyResolverV2'

describe('CatalogPolicyV2', () => {
  it('keeps the unconfigured state network quiet', () => {
    expect(resolveCatalogPolicyV2({})).toEqual({ source: 'unconfigured', policy: null })
  })

  it('requires freshness whenever stale_only is selected', () => {
    expect(() => validateCatalogPolicyV2({
      startupSyncPolicy: 'stale_only', pickerOpenSyncPolicy: 'never', listApplyMode: 'manual', freshnessMs: null, retentionMs: 'never',
    })).toThrow('CATALOG_POLICY_FRESHNESS_REQUIRED')
  })

  it('resolves provider override before global policy without any provider special case', () => {
    const global = CATALOG_POLICY_PRESETS_V2.balanced
    const provider = CATALOG_POLICY_PRESETS_V2.manual
    expect(resolveCatalogPolicyV2({ providerOverride: provider, globalPolicy: global })).toEqual({ source: 'provider_override', policy: provider })
    expect(resolveCatalogPolicyV2({ globalPolicy: global })).toEqual({ source: 'global', policy: global })
  })

  it('reads canonical global and provider keys independently', () => {
    const values = new Map<string, unknown>([[GLOBAL_CATALOG_POLICY_V2_STORE_KEY, CATALOG_POLICY_PRESETS_V2.balanced]])
    expect(readResolvedCatalogPolicyV2({ get: (key) => values.get(key) }, 'openrouter')).toMatchObject({ source: 'global' })
    values.set(providerCatalogPolicyV2StoreKey('openrouter'), CATALOG_POLICY_PRESETS_V2.manual)
    expect(readResolvedCatalogPolicyV2({ get: (key) => values.get(key) }, 'openrouter')).toMatchObject({ source: 'provider_override' })
    expect(readResolvedCatalogPolicyV2({ get: (key) => values.get(key) }, 'deepseek')).toMatchObject({ source: 'global' })
  })
})
