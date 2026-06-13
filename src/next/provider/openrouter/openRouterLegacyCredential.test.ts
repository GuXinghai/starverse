import { describe, expect, it } from 'vitest'
import { createBearerCredential } from '@/next/provider/credentials/providerCredential'
import {
  providerCredentialResolutionFailure,
  providerCredentialResolutionFromCredential,
  type ProviderCredentialRef,
} from '@/next/provider/credentials/providerCredentialResolver'
import {
  openRouterLegacyCredentialFromRaw,
  resolveOpenRouterLegacyCredential,
  toSafeOpenRouterLegacyCredentialDiagnostics,
} from '@/next/provider/openrouter/openRouterLegacyCredential'

const RAW_KEY = 'sk-or-openrouter-legacy-secret'
const CREDENTIAL_REF: ProviderCredentialRef = { kind: 'credential_ref', id: 'openrouter-default' }

function expectNoSecretLeak(value: unknown): void {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toContain(RAW_KEY)
  expect(serialized).not.toContain(`Bearer ${RAW_KEY}`)
  expect(serialized).not.toContain('Bearer')
  expect(serialized).not.toContain('Authorization')
}

describe('openRouterLegacyCredential facade', () => {
  it('is explicitly scoped to the OpenRouter legacy exception', () => {
    const material = openRouterLegacyCredentialFromRaw({ apiKey: RAW_KEY })
    const diagnostics = toSafeOpenRouterLegacyCredentialDiagnostics(material)

    expect(material.kind).toBe('openrouter_legacy_api_key')
    expect(diagnostics.kind).toBe('openrouter_legacy_credential')
    expect(JSON.stringify({ material, diagnostics })).not.toContain('credential_ref')
    expect(JSON.stringify({ material, diagnostics })).not.toContain('provider_credential')
  })

  it('accepts valid raw key and creates adapter-side legacy credential material', () => {
    const material = openRouterLegacyCredentialFromRaw({
      apiKey: RAW_KEY,
      baseUrl: 'https://openrouter.example.test/api/v1/',
    })

    expect(material).toEqual({
      kind: 'openrouter_legacy_api_key',
      apiKey: RAW_KEY,
      baseUrl: 'https://openrouter.example.test/api/v1/',
    })
  })

  it('preserves empty raw key behavior for the legacy adapter path', () => {
    const material = openRouterLegacyCredentialFromRaw({ apiKey: '' })
    const diagnostics = toSafeOpenRouterLegacyCredentialDiagnostics(material)

    expect(material.apiKey).toBe('')
    expect(diagnostics.status).toBe('missing')
    expect(diagnostics.code).toBe('credential_missing')
  })

  it('preserves missing raw key behavior when legacy callers bypass types', () => {
    const material = openRouterLegacyCredentialFromRaw({ apiKey: undefined as any })
    const diagnostics = toSafeOpenRouterLegacyCredentialDiagnostics(material)

    expect((material as any).apiKey).toBeUndefined()
    expect(diagnostics.status).toBe('missing')
    expect(diagnostics.code).toBe('credential_missing')
  })

  it('safe diagnostics never include raw key, Bearer, or Authorization', () => {
    const material = openRouterLegacyCredentialFromRaw({
      apiKey: RAW_KEY,
      baseUrl: 'https://user:pass@openrouter.example.test:8443/api/v1',
    })

    const diagnostics = toSafeOpenRouterLegacyCredentialDiagnostics(material)

    expect(diagnostics.status).toBe('configured')
    expect(diagnostics.code).toBe('credential_configured')
    expect(diagnostics.maskedApiKey).toBe('***')
    expect(diagnostics.baseUrlConfigured).toBe(true)
    expect(diagnostics.maskedBaseUrl).toBe('https://o***t:8443')
    expect(JSON.stringify(diagnostics)).not.toContain('user')
    expect(JSON.stringify(diagnostics)).not.toContain('pass')
    expect(JSON.stringify(diagnostics)).not.toContain('openrouter.example.test')
    expectNoSecretLeak(diagnostics)
  })

  it('safe diagnostics do not validate or change legacy baseUrl semantics', () => {
    const material = openRouterLegacyCredentialFromRaw({
      apiKey: RAW_KEY,
      baseUrl: 'not a url',
    })

    const diagnostics = toSafeOpenRouterLegacyCredentialDiagnostics(material)

    expect(material.baseUrl).toBe('not a url')
    expect(diagnostics.maskedBaseUrl).toBe('[invalid-url]')
    expectNoSecretLeak(diagnostics)
  })

  it('maps resolved provider bearer credential to OpenRouter legacy facade material', () => {
    const material = resolveOpenRouterLegacyCredential({
      credentialRef: CREDENTIAL_REF,
      resolveCredential: () => providerCredentialResolutionFromCredential(createBearerCredential(RAW_KEY)),
      baseUrl: 'https://openrouter.example.test/api/v1/',
    })

    expect(material).toEqual({
      kind: 'openrouter_legacy_api_key',
      apiKey: RAW_KEY,
      baseUrl: 'https://openrouter.example.test/api/v1/',
    })
    const diagnostics = 'code' in material ? material : toSafeOpenRouterLegacyCredentialDiagnostics(material)
    expectNoSecretLeak(diagnostics)
  })

  it('normalizes resolver failure without leaking raw resolver internals', () => {
    const result = resolveOpenRouterLegacyCredential({
      credentialRef: CREDENTIAL_REF,
      resolveCredential: () => ({
        ok: false,
        error: {
          code: 'credential_unresolved',
          message: `raw resolver output Authorization: Bearer ${RAW_KEY}`,
        },
      }),
    })

    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.code).toBe('credential_unresolved')
      expect(result.message).toBe('Credential could not be resolved.')
      expectNoSecretLeak(result)
    }
  })

  it('keeps invalid resolved credential as safe invalid failure', () => {
    const result = resolveOpenRouterLegacyCredential({
      credentialRef: CREDENTIAL_REF,
      resolveCredential: () => providerCredentialResolutionFromCredential(createBearerCredential('')),
    })

    expect('code' in result).toBe(true)
    if ('code' in result) {
      expect(result.code).toBe('credential_invalid')
      expect(result.message).toBe('Credential material is invalid.')
      expectNoSecretLeak(result)
    }
  })

  it('normalizes thrown resolver errors as safe unresolved failure', () => {
    const result = resolveOpenRouterLegacyCredential({
      credentialRef: CREDENTIAL_REF,
      resolveCredential: () => {
        throw new Error(`store unavailable with ${RAW_KEY}`)
      },
    })

    const expected = providerCredentialResolutionFailure('credential_unresolved')
    expect(expected.ok).toBe(false)
    if (!expected.ok) {
      expect(result).toEqual(expected.error)
    }
    expectNoSecretLeak(result)
  })
})
