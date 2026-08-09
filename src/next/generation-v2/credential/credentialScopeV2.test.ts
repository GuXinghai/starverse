import { describe, expect, it } from 'vitest'
import { GenerationV2Identity } from '../domain/identityV2'
import { deriveCredentialScopeIdV2 } from './credentialScopeV2'

const provider = GenerationV2Identity.create('provider_id', 'openrouter')

describe('credential scope V2', () => {
  it('derives a deterministic opaque scope without exposing credential material', () => {
    const key = new Uint8Array(32).fill(7)
    const first = deriveCredentialScopeIdV2({ epochScopeKey: key, providerId: provider, credential: 'sk-secret-value' })
    const second = deriveCredentialScopeIdV2({ epochScopeKey: key, providerId: provider, credential: 'sk-secret-value' })
    expect(first.value).toBe(second.value)
    expect(first.value).toMatch(/^credential-scope-v2:[0-9a-f]{64}$/u)
    expect(first.value).toBe('credential-scope-v2:2fc6725e881c3b1f346b3ea92126d0ec26a0b59036a177abab4c6ab056c7a7c1')
    expect(first.value).not.toContain('secret')
    expect(key).toEqual(new Uint8Array(32).fill(7))
  })

  it('copies Buffer-backed key material instead of wiping the caller-owned buffer', () => {
    const key = Buffer.alloc(32, 9)
    const before = Buffer.from(key)
    deriveCredentialScopeIdV2({ epochScopeKey: key, providerId: provider, credential: 'credential' })
    expect(key).toEqual(before)
  })

  it('isolates credential rotation, provider identity and epoch key rotation', () => {
    const key = new Uint8Array(32).fill(1)
    const base = deriveCredentialScopeIdV2({ epochScopeKey: key, providerId: provider, credential: 'credential-a' }).value
    expect(deriveCredentialScopeIdV2({ epochScopeKey: key, providerId: provider, credential: 'credential-b' }).value).not.toBe(base)
    expect(deriveCredentialScopeIdV2({
      epochScopeKey: key,
      providerId: GenerationV2Identity.create('provider_id', 'openai_responses'),
      credential: 'credential-a',
    }).value).not.toBe(base)
    expect(deriveCredentialScopeIdV2({ epochScopeKey: new Uint8Array(32).fill(2), providerId: provider, credential: 'credential-a' }).value)
      .not.toBe(base)
  })

  it('rejects invalid keys, unbranded providers and unnormalized credentials', () => {
    expect(() => deriveCredentialScopeIdV2({ epochScopeKey: new Uint8Array(31), providerId: provider, credential: 'credential' }))
      .toThrow('GENERATION_V2_CREDENTIAL_SCOPE_KEY_INVALID')
    expect(() => deriveCredentialScopeIdV2({ epochScopeKey: new Uint8Array(32), providerId: { kind: 'provider_id', value: 'openrouter' } as never, credential: 'credential' }))
      .toThrow('GENERATION_V2_CREDENTIAL_SCOPE_PROVIDER_INVALID')
    expect(() => deriveCredentialScopeIdV2({ epochScopeKey: new Uint8Array(32), providerId: provider, credential: ' credential ' }))
      .toThrow('GENERATION_V2_CREDENTIAL_SCOPE_CREDENTIAL_INVALID')
    if (typeof SharedArrayBuffer !== 'undefined') {
      expect(() => deriveCredentialScopeIdV2({
        epochScopeKey: new Uint8Array(new SharedArrayBuffer(32)), providerId: provider, credential: 'credential',
      })).toThrow('GENERATION_V2_CREDENTIAL_SCOPE_KEY_INVALID')
    }
  })
})
