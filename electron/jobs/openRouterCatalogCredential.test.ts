import { describe, expect, it, vi } from 'vitest'
import { createBearerCredential } from '@/next/provider/credentials/providerCredential'
import {
  providerCredentialResolutionFromCredential,
  type ProviderCredentialRef,
  type ProviderCredentialResolver,
} from '@/next/provider/credentials/providerCredentialResolver'
import { providerCredentialResolverFromStore } from '@/next/provider/credentials/providerCredentialStore'
import {
  OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY,
  OPENROUTER_CATALOG_LEGACY_BASE_URL_STORE_KEY,
  readOpenRouterCatalogLegacyCredentialFromStore,
  resolveOpenRouterCatalogLegacyCredential,
  toSafeOpenRouterCatalogCredentialDiagnostics,
} from './openRouterCatalogCredential'

const RAW_KEY = 'sk-openrouter-catalog-wrapper-secret'
const REF: ProviderCredentialRef = { kind: 'credential_ref', id: 'openrouter-catalog-default' }

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

  it('resolver seam success returns catalog legacy credential material with the bearer token as apiKey', () => {
    const resolver: ProviderCredentialResolver = () =>
      providerCredentialResolutionFromCredential(createBearerCredential(RAW_KEY))

    const credential = resolveOpenRouterCatalogLegacyCredential({
      credentialRef: REF,
      resolveCredential: resolver,
      baseUrl: ' https://openrouter-proxy.example.test/custom/v1/ ',
    })

    expect(credential).toEqual({
      kind: 'openrouter_catalog_legacy_credential',
      apiKey: RAW_KEY,
      baseUrl: ' https://openrouter-proxy.example.test/custom/v1/ ',
    })
  })

  it('resolver seam success preserves null baseUrl behavior for catalog legacy material', () => {
    const resolver: ProviderCredentialResolver = () =>
      providerCredentialResolutionFromCredential(createBearerCredential(RAW_KEY))

    const credential = resolveOpenRouterCatalogLegacyCredential({
      credentialRef: REF,
      resolveCredential: resolver,
    })

    expect(credential).toEqual({
      kind: 'openrouter_catalog_legacy_credential',
      apiKey: RAW_KEY,
      baseUrl: null,
    })
  })

  it('resolver seam unresolved failure is static, safe, and does not call a catalog sync job', () => {
    const syncJob = vi.fn()
    const resolver: ProviderCredentialResolver = () => ({
      ok: false,
      error: {
        code: 'credential_unresolved',
        message: `missing ${RAW_KEY} Authorization: Bearer ${RAW_KEY} headers userinfo https://user:pass@example.test`,
      },
    })

    const result = resolveOpenRouterCatalogLegacyCredential({
      credentialRef: REF,
      resolveCredential: resolver,
      baseUrl: 'https://openrouter.example.test/custom/v1',
    })
    const diagnostics = toSafeOpenRouterCatalogCredentialDiagnostics(result)

    expect(syncJob).not.toHaveBeenCalled()
    expect(result).toEqual({
      kind: 'openrouter_catalog_credential_resolution_error',
      code: 'credential_unresolved',
      status: 'missing',
      message: 'Credential could not be resolved.',
    })
    expect(diagnostics).toEqual({
      kind: 'openrouter_catalog_legacy_credential',
      status: 'missing',
      code: 'credential_missing',
      baseUrlConfigured: false,
    })
    const serialized = JSON.stringify({ result, diagnostics })
    expect(serialized).not.toContain(RAW_KEY)
    expect(serialized).not.toContain(`Bearer ${RAW_KEY}`)
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('headers')
    expect(serialized).not.toContain('userinfo')
    expect(serialized).not.toContain('user:pass')
  })

  it('resolver seam invalid credential returns safe invalid failure', () => {
    const resolver: ProviderCredentialResolver = () =>
      providerCredentialResolutionFromCredential(createBearerCredential(''))

    const result = resolveOpenRouterCatalogLegacyCredential({
      credentialRef: REF,
      resolveCredential: resolver,
    })
    const diagnostics = toSafeOpenRouterCatalogCredentialDiagnostics(result)

    expect(result).toEqual({
      kind: 'openrouter_catalog_credential_resolution_error',
      code: 'credential_invalid',
      status: 'invalid',
      message: 'Credential material is invalid.',
    })
    expect(diagnostics).toEqual({
      kind: 'openrouter_catalog_legacy_credential',
      status: 'invalid',
      code: 'credential_invalid',
      baseUrlConfigured: false,
    })
    expectNoSecretLeak({ result, diagnostics })
  })

  it('resolver seam thrown errors with secret-like text are safely normalized', () => {
    const resolver: ProviderCredentialResolver = () => {
      throw new Error(`resolver exploded ${RAW_KEY} Bearer ${RAW_KEY} Authorization headers userinfo`)
    }

    const result = resolveOpenRouterCatalogLegacyCredential({
      credentialRef: REF,
      resolveCredential: resolver,
    })

    expect(result).toEqual({
      kind: 'openrouter_catalog_credential_resolution_error',
      code: 'credential_unresolved',
      status: 'missing',
      message: 'Credential could not be resolved.',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(RAW_KEY)
    expect(serialized).not.toContain(`Bearer ${RAW_KEY}`)
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('headers')
    expect(serialized).not.toContain('userinfo')
  })

  it('resolver seam store unavailable failure is safe and does not expose store internals', () => {
    const resolver = providerCredentialResolverFromStore({
      getCredential: () => ({
        ok: false,
        code: 'store_unavailable',
        message: `store unavailable with ${RAW_KEY} Bearer ${RAW_KEY} Authorization headers userinfo`,
      }),
    })

    const result = resolveOpenRouterCatalogLegacyCredential({
      credentialRef: REF,
      resolveCredential: resolver,
    })
    const diagnostics = toSafeOpenRouterCatalogCredentialDiagnostics(result)

    expect(result).toEqual({
      kind: 'openrouter_catalog_credential_resolution_error',
      code: 'credential_unresolved',
      status: 'missing',
      message: 'Credential could not be resolved.',
    })
    expect(diagnostics).toEqual({
      kind: 'openrouter_catalog_legacy_credential',
      status: 'missing',
      code: 'credential_missing',
      baseUrlConfigured: false,
    })
    const serialized = JSON.stringify({ result, diagnostics })
    expect(serialized).not.toContain(RAW_KEY)
    expect(serialized).not.toContain(`Bearer ${RAW_KEY}`)
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('headers')
    expect(serialized).not.toContain('userinfo')
  })
})
