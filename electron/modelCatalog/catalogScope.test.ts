import { describe, expect, it, vi } from 'vitest'
import {
  deriveCatalogScopeFromStore,
  deriveCatalogScopeKey,
  deriveProviderCatalogScopeFromStore,
  deriveProviderCatalogScopeKey,
  getOrCreateCatalogLocalSecret,
  getOrCreateProviderCatalogLocalSecret,
  isSensitiveCatalogStoreKey,
  normalizeCatalogBaseUrl,
  OPENROUTER_CATALOG_LOCAL_SECRET_KEY,
  PROVIDER_CATALOG_LOCAL_SECRET_KEY,
} from './catalogScope'

function createStore(initial: Record<string, unknown> = {}) {
  const values = new Map<string, unknown>(Object.entries(initial))
  return {
    get: vi.fn((key: string) => values.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      values.set(key, value)
    }),
  } as any
}

describe('catalogScope', () => {
  it('normalizes baseUrl with default and trailing slash removal', () => {
    expect(normalizeCatalogBaseUrl('https://openrouter.ai/api/v1///')).toBe('https://openrouter.ai/api/v1')
    expect(normalizeCatalogBaseUrl('')).toBe('https://openrouter.ai/api/v1')
    expect(normalizeCatalogBaseUrl('', 'https://api.deepseek.com/')).toBe('https://api.deepseek.com')
  })

  it('returns the same catalogScopeKey for the same key/baseUrl/dataSource', () => {
    const input = {
      localSecret: 'local-secret-for-test-only',
      providerKey: 'openrouter',
      apiKey: ' same-test-token ',
      baseUrl: 'https://openrouter.ai/api/v1/',
      dataSource: 'models_user_primary' as const,
    }

    expect(deriveCatalogScopeKey(input)).toBe(deriveCatalogScopeKey(input))
  })

  it('changes catalogScopeKey for different API keys, baseUrls, and dataSources', () => {
    const base = {
      localSecret: 'local-secret-for-test-only',
      providerKey: 'openrouter',
      apiKey: 'token-a',
      baseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary' as const,
    }
    const original = deriveCatalogScopeKey(base)

    expect(deriveCatalogScopeKey({ ...base, apiKey: 'token-b' })).not.toBe(original)
    expect(deriveCatalogScopeKey({ ...base, baseUrl: 'https://example.test/api/v1' })).not.toBe(original)
    expect(deriveCatalogScopeKey({ ...base, dataSource: 'models_fallback' })).not.toBe(original)
  })

  it('derives provider catalog scopes with provider-specific dataSource, default baseUrl, and request context', () => {
    const base = {
      localSecret: 'provider-local-secret-for-test-only',
      providerKey: 'anthropic_messages',
      apiKey: 'anthropic-test-token',
      baseUrl: '',
      defaultBaseUrl: 'https://api.anthropic.com/v1',
      dataSource: 'anthropic_models_primary' as const,
      requestContextFingerprint: 'anthropic-version:2023-06-01',
    }
    const original = deriveProviderCatalogScopeKey(base)

    expect(original).toMatch(/^[a-f0-9]{64}$/)
    expect(deriveProviderCatalogScopeKey(base)).toBe(original)
    expect(deriveProviderCatalogScopeKey({ ...base, providerKey: 'openai_responses' })).not.toBe(original)
    expect(deriveProviderCatalogScopeKey({ ...base, dataSource: 'openai_models_primary' })).not.toBe(original)
    expect(deriveProviderCatalogScopeKey({ ...base, requestContextFingerprint: 'anthropic-version:2024-01-01' })).not.toBe(original)
  })

  it('does not embed the raw API key in catalogScopeKey', () => {
    const apiKey = 'phase1-secret-never-persist'
    const scopeKey = deriveCatalogScopeKey({
      localSecret: 'local-secret-for-test-only',
      providerKey: 'openrouter',
      apiKey,
      baseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary',
    })

    expect(scopeKey).not.toContain(apiKey)
    expect(scopeKey).toMatch(/^[a-f0-9]{64}$/)
  })

  it('creates and reuses a local secret in main-process store', () => {
    const store = createStore()
    const first = getOrCreateCatalogLocalSecret(store)
    const second = getOrCreateCatalogLocalSecret(store)

    expect(first).toBe(second)
    expect(first.length).toBeGreaterThanOrEqual(32)
    expect(store.set).toHaveBeenCalledTimes(1)
    expect(store.set).toHaveBeenCalledWith(OPENROUTER_CATALOG_LOCAL_SECRET_KEY, first)
  })

  it('creates and reuses a provider catalog local secret separately from OpenRouter legacy scope secret', () => {
    const store = createStore()
    const openRouterSecret = getOrCreateCatalogLocalSecret(store)
    const providerSecret = getOrCreateProviderCatalogLocalSecret(store)
    const providerSecretAgain = getOrCreateProviderCatalogLocalSecret(store)

    expect(providerSecret).toBe(providerSecretAgain)
    expect(providerSecret.length).toBeGreaterThanOrEqual(32)
    expect(providerSecret).not.toBe(openRouterSecret)
    expect(store.set).toHaveBeenCalledWith(PROVIDER_CATALOG_LOCAL_SECRET_KEY, providerSecret)
  })

  it('characterizes catalog local secrets as blocked from renderer store IPC', () => {
    expect(isSensitiveCatalogStoreKey(OPENROUTER_CATALOG_LOCAL_SECRET_KEY)).toBe(true)
    expect(isSensitiveCatalogStoreKey(PROVIDER_CATALOG_LOCAL_SECRET_KEY)).toBe(true)
    expect(isSensitiveCatalogStoreKey('openRouterApiKey')).toBe(false)
    expect(isSensitiveCatalogStoreKey('openRouterBaseUrl')).toBe(false)
    expect(isSensitiveCatalogStoreKey('geminiApiKey')).toBe(false)
    expect(isSensitiveCatalogStoreKey('apiKey')).toBe(false)
    expect(isSensitiveCatalogStoreKey('activeProvider')).toBe(false)
  })

  it('derives current scope from store without exposing local secret in result', () => {
    const store = createStore({ [OPENROUTER_CATALOG_LOCAL_SECRET_KEY]: 'local-secret-for-test-only' })
    const result = deriveCatalogScopeFromStore({
      store,
      providerKey: 'openrouter',
      apiKey: 'secret-not-in-result',
      baseUrl: 'https://openrouter.ai/api/v1/',
      dataSource: 'models_user_primary',
    })

    expect(result.catalogScopeKey).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result)).not.toContain('secret-not-in-result')
    expect(JSON.stringify(result)).not.toContain('local-secret-for-test-only')
  })

  it('derives provider catalog scope from store without using the OpenRouter local secret key', () => {
    const store = createStore({ [PROVIDER_CATALOG_LOCAL_SECRET_KEY]: 'provider-local-secret-for-test-only' })
    const result = deriveProviderCatalogScopeFromStore({
      store,
      providerKey: 'google_ai_studio',
      apiKey: 'google-test-token-not-in-result',
      baseUrl: '',
      defaultBaseUrl: 'https://generativelanguage.googleapis.com',
      dataSource: 'gemini_models_v1beta_primary',
    })

    expect(result.normalizedBaseUrl).toBe('https://generativelanguage.googleapis.com')
    expect(result.catalogScopeKey).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result)).not.toContain('google-test-token-not-in-result')
    expect(JSON.stringify(result)).not.toContain('provider-local-secret-for-test-only')
    expect(store.set).not.toHaveBeenCalled()
  })
})
