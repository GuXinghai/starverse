import { describe, expect, it } from 'vitest'
import {
  isProviderCatalogScopeDescriptor,
  normalizeProviderCatalogBaseUrl,
  normalizeProviderCatalogDataSource,
} from './providerCatalogScope'

describe('providerCatalogScope contracts', () => {
  it('normalizes base URLs without forcing an OpenRouter default', () => {
    expect(normalizeProviderCatalogBaseUrl(' https://api.example.test/v1/// ', 'https://fallback.test'))
      .toBe('https://api.example.test/v1')
    expect(normalizeProviderCatalogBaseUrl('   ', 'https://fallback.test/v1/'))
      .toBe('https://fallback.test/v1')
  })

  it('normalizes scoped catalog data source through the current persisted enum', () => {
    expect(normalizeProviderCatalogDataSource('models_user_primary')).toBe('models_user_primary')
    expect(normalizeProviderCatalogDataSource('models_fallback')).toBe('models_fallback')
    expect(normalizeProviderCatalogDataSource('mixed')).toBe('mixed')
    expect(normalizeProviderCatalogDataSource('provider_api')).toBe('models_user_primary')
  })

  it('accepts only safe plain scope descriptors', () => {
    expect(isProviderCatalogScopeDescriptor({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-key',
      normalizedBaseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary',
      credentialIdentity: {
        kind: 'credential_fingerprint',
        fingerprint: 'fingerprint',
      },
    })).toBe(true)

    expect(isProviderCatalogScopeDescriptor({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-key',
      normalizedBaseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'provider_api',
      credentialIdentity: { kind: 'anonymous' },
    })).toBe(false)
  })
})

