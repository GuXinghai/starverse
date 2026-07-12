import { describe, expect, it, vi } from 'vitest'
import { createBearerCredential } from '@/next/provider/credentials/providerCredential'
import { providerCredentialResolutionFromCredential } from '@/next/provider/credentials/providerCredentialResolver'
import {
  OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY,
  OPENROUTER_CATALOG_LEGACY_CREDENTIAL_REF,
  createOpenRouterCatalogLegacyStoreCredentialResolver,
  readOpenRouterCatalogLegacyCredentialFromStore,
  resolveOpenRouterCatalogCredentialFromLegacyStore,
  resolveOpenRouterCatalogLegacyCredential,
  toSafeOpenRouterCatalogCredentialDiagnostics,
} from './openRouterCatalogCredential'

describe('OpenRouter official catalog credential source', () => {
  it('reads only the API key and always uses the official endpoint', () => {
    const get = vi.fn((key: string) => key === OPENROUTER_CATALOG_LEGACY_API_KEY_STORE_KEY ? ' sk-catalog ' : 'ignored')
    expect(readOpenRouterCatalogLegacyCredentialFromStore({ get })).toEqual({
      kind: 'openrouter_catalog_legacy_credential',
      apiKey: 'sk-catalog',
      baseUrl: null,
    })
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('resolves opaque credential refs without endpoint material', () => {
    const resolved = resolveOpenRouterCatalogLegacyCredential({
      credentialRef: OPENROUTER_CATALOG_LEGACY_CREDENTIAL_REF,
      resolveCredential: () => providerCredentialResolutionFromCredential(createBearerCredential('sk-resolved')),
    })
    expect(resolved).toEqual({
      kind: 'openrouter_catalog_legacy_credential',
      apiKey: 'sk-resolved',
      baseUrl: null,
    })
    expect(toSafeOpenRouterCatalogCredentialDiagnostics(resolved)).toMatchObject({
      status: 'configured',
      baseUrlConfigured: false,
    })
  })

  it('returns a safe missing result without fallback', () => {
    expect(resolveOpenRouterCatalogCredentialFromLegacyStore({ get: () => undefined })).toMatchObject({
      ok: false,
      failure: { code: 'credential_unresolved' },
      diagnostics: { baseUrlConfigured: false },
    })
    const resolver = createOpenRouterCatalogLegacyStoreCredentialResolver({ get: () => 'sk-secret' })
    expect(resolver({ kind: 'credential_ref', id: 'other' })).toMatchObject({ ok: false })
  })
})
