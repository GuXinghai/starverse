import { describe, expect, it, vi } from 'vitest'
import { resolveCurrentOpenRouterCatalogScope } from './providerCatalogScopeResolver'

function createStore(initial: Record<string, unknown>) {
  const data = new Map<string, unknown>(Object.entries(initial))
  return {
    get: vi.fn((key: string) => data.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      data.set(key, value)
    }),
  } as any
}

describe('providerCatalogScopeResolver', () => {
  it('resolves the current OpenRouter scoped catalog identity without exposing the raw API key', () => {
    const rawApiKey = 'sk-scope-secret'
    const store = createStore({
      openRouterApiKey: rawApiKey,
      openRouterBaseUrl: 'https://openrouter.ai/api/v1/',
      openRouterCatalogLocalSecret: 'local-secret-for-scope-resolver-tests-1234567890',
    })

    const scope = resolveCurrentOpenRouterCatalogScope(store)

    expect(scope).toMatchObject({
      providerKey: 'openrouter',
      normalizedBaseUrl: 'https://openrouter.ai/api/v1',
      scopeDataSource: 'models_user_primary',
    })
    expect(scope?.catalogScopeKey).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(scope)).not.toContain(rawApiKey)
  })

  it('returns null when the legacy OpenRouter catalog credential is unsafe', () => {
    const store = createStore({
      openRouterApiKey: 'sk-scope-secret',
      openRouterBaseUrl: 'https://attacker.example.test/v1',
      openRouterCatalogLocalSecret: 'local-secret-for-scope-resolver-tests-1234567890',
    })

    expect(resolveCurrentOpenRouterCatalogScope(store)).toBeNull()
  })
})
