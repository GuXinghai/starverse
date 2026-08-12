import { describe, expect, it } from 'vitest'
import { PROVIDER_CREDENTIAL_KEYS } from './providerCredentialContract'
import { decodeAndValidateEpoch2ProviderCredentialRecord } from './epoch2ProviderCredentialRecord'

function record(providerKey: (typeof PROVIDER_CREDENTIAL_KEYS)[number]) {
  return {
    version: 3,
    providerKey,
    backend: 'electron_safe_storage',
    ciphertextBase64: Buffer.from(`secret-${providerKey}`).toString('base64'),
    credentialScopeId: `credential-scope-v2:${'a'.repeat(64)}`,
    revision: 1,
    updatedAtMs: 123,
  }
}

describe('epoch-2 provider credential record', () => {
  it('strictly validates every approved encrypted provider record and zeroes validator bytes', async () => {
    for (const providerKey of PROVIDER_CREDENTIAL_KEYS) {
      let observed: Buffer | undefined
      const decoded = await decodeAndValidateEpoch2ProviderCredentialRecord({
        value: record(providerKey),
        providerKey,
        validateDecrypt: async (_key, ciphertext) => {
          observed = ciphertext
          return { credential: ciphertext.toString('utf8') }
        },
      })
      expect(decoded).toEqual(record(providerKey))
      expect(Object.isFrozen(decoded)).toBe(true)
      expect(observed).toBeDefined()
      expect([...observed!]).toEqual(new Array(observed!.byteLength).fill(0))
    }
  })

  it('rejects mixed payloads, wrong-provider, malformed-base64 and timestamp shapes', async () => {
    const valid = record('openrouter')
    for (const value of [
      { ...valid, extra: true },
      { ...valid, plaintext: 'secret' },
      { ...valid, backend: 'plaintext_fallback' },
      { ...valid, providerKey: 'anthropic' },
      { ...valid, ciphertextBase64: 'not canonical==' },
      { ...valid, ciphertextBase64: '' },
      { ...valid, credentialScopeId: 'not-a-scope' },
      { ...valid, revision: 0 },
      { ...valid, updatedAtMs: -1 },
      { ...valid, updatedAtMs: 1.5 },
    ]) {
      await expect(decodeAndValidateEpoch2ProviderCredentialRecord({
        value,
        providerKey: 'openrouter',
        validateDecrypt: async () => ({ credential: 'secret' }),
      })).rejects.toThrow('EPOCH2_CREDENTIAL_INVALID:openrouter')
    }
  })

  it('accepts a plaintext record only as its own exact discriminated shape', async () => {
    const plaintext = {
      version: 3,
      providerKey: 'openrouter',
      backend: 'plaintext',
      plaintext: 'secret',
      credentialScopeId: `credential-scope-v2:${'b'.repeat(64)}`,
      revision: 1,
      updatedAtMs: 123,
    }
    await expect(decodeAndValidateEpoch2ProviderCredentialRecord({
      value: plaintext, providerKey: 'openrouter', validateDecrypt: async () => {
        throw new Error('plaintext must not decrypt')
      },
    })).resolves.toEqual(plaintext)
  })

  it('projects and zeroes replacement ciphertext before config persistence', async () => {
    const rewrapped = Buffer.from('rotated-ciphertext')
    const decoded = await decodeAndValidateEpoch2ProviderCredentialRecord({
      value: record('openrouter'),
      providerKey: 'openrouter',
      validateDecrypt: async () => ({ credential: 'secret', rewrappedCiphertext: rewrapped }),
    })
    expect(decoded.backend).toBe('electron_safe_storage')
    if (decoded.backend === 'electron_safe_storage') {
      expect(decoded.ciphertextBase64).toBe(Buffer.from('rotated-ciphertext').toString('base64'))
    }
    expect([...rewrapped]).toEqual(new Array(rewrapped.byteLength).fill(0))
  })

  it('rejects empty or failed decrypts and zeroes bytes on both paths', async () => {
    for (const outcome of ['empty', 'throw'] as const) {
      let captured: Buffer | undefined
      const validateDecrypt = async (_key: string, ciphertext: Buffer) => {
        captured = ciphertext
        if (outcome === 'throw') throw new Error('decrypt failed')
        return { credential: '   ' }
      }
      await expect(decodeAndValidateEpoch2ProviderCredentialRecord({
        value: record('deepseek'),
        providerKey: 'deepseek',
        validateDecrypt,
      })).rejects.toThrow('EPOCH2_CREDENTIAL_INVALID:deepseek')
      expect(captured).toBeDefined()
      expect([...captured!]).toEqual(new Array(captured!.byteLength).fill(0))
    }
  })
})
