import { describe, expect, it, vi } from 'vitest'
import {
  OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY,
  OPENROUTER_CATALOG_LEGACY_BASE_URL_STORE_KEY,
  readOpenRouterCatalogLegacyCredentialFromStore,
  toSafeOpenRouterCatalogCredentialDiagnostics,
} from './openRouterCatalogCredential'

const RAW_KEY = 'sk-openrouter-catalog-wrapper-secret'

function createStore(initial: Record<string, unknown>) {
  const data = new Map<string, unknown>(Object.entries(initial))
  return {
    get: vi.fn((key: string) => data.get(key)),
  }
}

function expectNoSecretLeak(value: unknown): void {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toContain(RAW_KEY)
  expect(serialized).not.toContain(`Bearer ${RAW_KEY}`)
  expect(serialized).not.toContain('Bearer')
  expect(serialized).not.toContain('Authorization')
}

describe('OpenRouter catalog legacy credential read wrapper', () => {
  it('reads the current legacy OpenRouter catalog apiKey and baseUrl unchanged apart from existing trim behavior', () => {
    const store = createStore({
      [OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY]: `  ${RAW_KEY}  `,
      [OPENROUTER_CATALOG_LEGACY_BASE_URL_STORE_KEY]: ' https://openrouter-proxy.example.test/custom/v1/ ',
    })

    const credential = readOpenRouterCatalogLegacyCredentialFromStore(store)

    expect(credential).toEqual({
      kind: 'openrouter_catalog_legacy_credential',
      apiKey: RAW_KEY,
      baseUrl: 'https://openrouter-proxy.example.test/custom/v1/',
    })
    expect(store.get).toHaveBeenCalledWith('openRouterApiKey')
    expect(store.get).toHaveBeenCalledWith('openRouterBaseUrl')
  })

  it('preserves missing-key behavior by returning null before reading baseUrl', () => {
    const store = createStore({
      [OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY]: '   ',
      [OPENROUTER_CATALOG_LEGACY_BASE_URL_STORE_KEY]: 'https://openrouter-proxy.example.test/custom/v1/',
    })

    const credential = readOpenRouterCatalogLegacyCredentialFromStore(store)

    expect(credential).toBeNull()
    expect(store.get).toHaveBeenCalledWith('openRouterApiKey')
    expect(store.get).not.toHaveBeenCalledWith('openRouterBaseUrl')
  })

  it('does not read catalog local secret as provider credential material', () => {
    const store = createStore({
      [OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY]: RAW_KEY,
      openRouterCatalogLocalSecret: 'local-secret-for-scope-hmac-only',
    })

    const credential = readOpenRouterCatalogLegacyCredentialFromStore(store)

    expect(credential?.apiKey).toBe(RAW_KEY)
    expect(store.get).not.toHaveBeenCalledWith('openRouterCatalogLocalSecret')
  })

  it('safe diagnostics never include raw key, Bearer, Authorization, or URL userinfo', () => {
    const credential = readOpenRouterCatalogLegacyCredentialFromStore(createStore({
      [OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY]: RAW_KEY,
      [OPENROUTER_CATALOG_LEGACY_BASE_URL_STORE_KEY]: 'https://user:pass@openrouter.example.test/custom/v1',
    }))

    const diagnostics = toSafeOpenRouterCatalogCredentialDiagnostics(credential)

    expect(diagnostics).toEqual({
      kind: 'openrouter_catalog_legacy_credential',
      status: 'configured',
      code: 'credential_configured',
      baseUrlConfigured: true,
    })
    expect(JSON.stringify(diagnostics)).not.toContain('user')
    expect(JSON.stringify(diagnostics)).not.toContain('pass')
    expect(JSON.stringify(diagnostics)).not.toContain('openrouter.example.test')
    expectNoSecretLeak(diagnostics)
  })

  it('safe diagnostics represent missing credential without leaking store values', () => {
    const diagnostics = toSafeOpenRouterCatalogCredentialDiagnostics(null)

    expect(diagnostics).toEqual({
      kind: 'openrouter_catalog_legacy_credential',
      status: 'missing',
      code: 'credential_missing',
      baseUrlConfigured: false,
    })
    expectNoSecretLeak(diagnostics)
  })
})
