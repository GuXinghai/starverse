import { describe, expect, it, vi } from 'vitest'
import { createBearerCredential } from '@/next/provider/credentials/providerCredential'
import { providerCredentialResolutionFromCredential } from '@/next/provider/credentials/providerCredentialResolver'
import {
  OPENROUTER_CHAT_LEGACY_API_KEY_STORE_KEY,
  OPENROUTER_CHAT_LEGACY_CREDENTIAL_REF,
  createOpenRouterChatLegacyStoreCredentialResolver,
  openRouterLegacyCredentialFromRaw,
  resolveOpenRouterChatCredentialFromLegacyStore,
  resolveOpenRouterLegacyCredential,
  toSafeOpenRouterLegacyCredentialDiagnostics,
} from './openRouterLegacyCredential'

describe('OpenRouter official credential facade', () => {
  it('wraps only API-key material and reports no configurable base URL', () => {
    const material = openRouterLegacyCredentialFromRaw({ apiKey: 'sk-secret' })
    expect(material).toEqual({ kind: 'openrouter_legacy_api_key', apiKey: 'sk-secret' })
    expect(toSafeOpenRouterLegacyCredentialDiagnostics(material)).toEqual({
      kind: 'openrouter_legacy_credential',
      status: 'configured',
      code: 'credential_configured',
      maskedApiKey: '***',
      baseUrlConfigured: false,
    })
  })

  it('resolves the official credential through an opaque reference', () => {
    const result = resolveOpenRouterLegacyCredential({
      credentialRef: OPENROUTER_CHAT_LEGACY_CREDENTIAL_REF,
      resolveCredential: () => providerCredentialResolutionFromCredential(createBearerCredential('sk-resolved')),
    })
    expect(result).toEqual({ kind: 'openrouter_legacy_api_key', apiKey: 'sk-resolved' })
  })

  it('reads only the legacy API-key backing and ignores unrelated endpoint state', () => {
    const get = vi.fn((key: string) => key === OPENROUTER_CHAT_LEGACY_API_KEY_STORE_KEY ? ' sk-store ' : 'ignored')
    const store = { get }
    const result = resolveOpenRouterChatCredentialFromLegacyStore(store)
    expect(result).toMatchObject({
      ok: true,
      credential: { apiKey: 'sk-store' },
      diagnostics: { baseUrlConfigured: false },
    })
    expect(get).toHaveBeenCalledTimes(1)
    expect(get).toHaveBeenCalledWith(OPENROUTER_CHAT_LEGACY_API_KEY_STORE_KEY)
  })

  it('fails closed for a missing key or a foreign credential reference', () => {
    expect(resolveOpenRouterChatCredentialFromLegacyStore({ get: () => undefined })).toMatchObject({
      ok: false,
      failure: { code: 'credential_unresolved' },
    })
    const resolver = createOpenRouterChatLegacyStoreCredentialResolver({ get: () => 'sk-secret' })
    expect(resolver({ kind: 'credential_ref', id: 'other' })).toMatchObject({ ok: false })
  })
})
