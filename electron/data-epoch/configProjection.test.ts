import { describe, expect, it } from 'vitest'
import { projectEpoch2Config } from './configProjection'

describe('epoch-2 config projection network policy', () => {
  it('preserves an already valid V2 proxy settings object exactly', async () => {
    const settings = Object.freeze({ proxyMode: 'manual' as const, manualProxyUrl: 'http://proxy.test:8080', noProxy: '', strictSSL: true })
    const projected = await projectEpoch2Config({ rawConfig: { networkProxySettingsV2: settings }, validateDecrypt: async () => ({ credential: 'unused' }) })
    expect(projected.networkProxySettingsV2).toEqual(settings)
  })

  it('converts only a recognized legacy system policy and removes the legacy key', async () => {
    const projected = await projectEpoch2Config({ rawConfig: { networkProxyPolicy: { mode: 'system', proxyRules: 'ignored', credentialRef: 'ignored' } }, validateDecrypt: async () => ({ credential: 'unused' }) })
    expect(projected).toEqual({ networkProxySettingsV2: { proxyMode: 'system', manualProxyUrl: '', noProxy: '', strictSSL: true } })
    expect(projected).not.toHaveProperty('networkProxyPolicy')
  })

  it('blocks corrupt V2 proxy settings instead of applying the fresh-profile default', async () => {
    await expect(projectEpoch2Config({
      rawConfig: { networkProxySettingsV2: { proxyMode: 'environment', extra: true } },
      validateDecrypt: async () => ({ credential: 'unused' }),
    })).rejects.toThrow('EPOCH2_CONFIG_INVALID:networkProxySettingsV2')
  })

  it('preserves global and provider catalog policies without spreading OpenRouter legacy settings', async () => {
    const balanced = { startupSyncPolicy: 'stale_only', pickerOpenSyncPolicy: 'stale_only', listApplyMode: 'automatic', freshnessMs: 86_400_000, retentionMs: 30 * 86_400_000 }
    const projected = await projectEpoch2Config({ rawConfig: {
      catalogPolicyV2: balanced,
      providerCatalog: { anthropic: { policyV2: { ...balanced, freshnessMs: 7 * 86_400_000 } } },
      openRouterCatalogStartupSync: 'always',
    }, validateDecrypt: async () => ({ credential: 'unused' }) })
    expect(projected.catalogPolicyV2).toEqual(balanced)
    expect(projected.providerCatalog).toEqual({
      anthropic: { policyV2: { ...balanced, freshnessMs: 7 * 86_400_000 } },
    })
    expect(projected).not.toHaveProperty('openRouterCatalogStartupSync')
    expect(projected.providerCatalog).not.toHaveProperty('openrouter')
  })

  it('rejects malformed catalog policy roots instead of silently falling back', async () => {
    await expect(projectEpoch2Config({
      rawConfig: { providerCatalog: [] },
      validateDecrypt: async () => ({ credential: 'unused' }),
    })).rejects.toThrow('EPOCH2_CONFIG_INVALID:providerCatalog')
  })
})
