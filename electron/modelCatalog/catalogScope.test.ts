import { describe, expect, it, vi } from 'vitest'
import {
  deriveCatalogScopeFromStore,
  deriveCatalogScopeKey,
  getOrCreateCatalogLocalSecret,
  normalizeCatalogBaseUrl,
  OPENROUTER_CATALOG_LOCAL_SECRET_KEY,
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
  })

  it('returns the same catalogScopeKey for the same key/baseUrl/dataSource', () => {
    const input = {
      localSecret: 'local-secret-for-test-only',
      providerKey: 'openrouter',
      apiKey: ' sk-same-key ',
      baseUrl: 'https://openrouter.ai/api/v1/',
      dataSource: 'models_user_primary' as const,
    }

    expect(deriveCatalogScopeKey(input)).toBe(deriveCatalogScopeKey(input))
  })

  it('changes catalogScopeKey for different API keys, baseUrls, and dataSources', () => {
    const base = {
      localSecret: 'local-secret-for-test-only',
      providerKey: 'openrouter',
      apiKey: 'sk-key-a',
      baseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary' as const,
    }
    const original = deriveCatalogScopeKey(base)

    expect(deriveCatalogScopeKey({ ...base, apiKey: 'sk-key-b' })).not.toBe(original)
    expect(deriveCatalogScopeKey({ ...base, baseUrl: 'https://example.test/api/v1' })).not.toBe(original)
    expect(deriveCatalogScopeKey({ ...base, dataSource: 'models_fallback' })).not.toBe(original)
  })

  it('does not embed the raw API key in catalogScopeKey', () => {
    const apiKey = 'sk-phase1-secret-never-persist'
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

  it('derives current scope from store without exposing local secret in result', () => {
    const store = createStore({ [OPENROUTER_CATALOG_LOCAL_SECRET_KEY]: 'local-secret-for-test-only' })
    const result = deriveCatalogScopeFromStore({
      store,
      providerKey: 'openrouter',
      apiKey: 'sk-secret-not-in-result',
      baseUrl: 'https://openrouter.ai/api/v1/',
      dataSource: 'models_user_primary',
    })

    expect(result.catalogScopeKey).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(result)).not.toContain('sk-secret-not-in-result')
    expect(JSON.stringify(result)).not.toContain('local-secret-for-test-only')
  })
})
