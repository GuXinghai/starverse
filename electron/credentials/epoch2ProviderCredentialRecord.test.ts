import { describe, expect, it } from 'vitest'
import { PROVIDER_CREDENTIAL_KEYS } from './providerCredentialContract'
import { decodeAndValidateEpoch2ProviderCredentialRecord } from './epoch2ProviderCredentialRecord'

function record(providerKey: (typeof PROVIDER_CREDENTIAL_KEYS)[number]) {
  return {
    version: 1,
    providerKey,
    backend: 'electron_safe_storage',
    ciphertextBase64: Buffer.from(`secret-${providerKey}`).toString('base64'),
    updatedAtMs: 123,
  }
}

describe('epoch-2 provider credential record', () => {
  it('strictly validates every approved encrypted provider record and zeroes validator bytes', () => {
    for (const providerKey of PROVIDER_CREDENTIAL_KEYS) {
      let observed: Buffer | undefined
      const decoded = decodeAndValidateEpoch2ProviderCredentialRecord({
        value: record(providerKey),
        providerKey,
        validateDecrypt: (_key, ciphertext) => {
          observed = ciphertext
          return ciphertext.toString('utf8')
        },
      })
      expect(decoded).toEqual(record(providerKey))
      expect(Object.isFrozen(decoded)).toBe(true)
      expect(observed).toBeDefined()
      expect([...observed!]).toEqual(new Array(observed!.byteLength).fill(0))
    }
  })

  it('rejects extra, plaintext, wrong-provider, malformed-base64 and timestamp shapes', () => {
    const valid = record('openrouter')
    for (const value of [
      { ...valid, extra: true },
      { ...valid, plaintext: 'secret' },
      { ...valid, backend: 'plaintext_fallback' },
      { ...valid, providerKey: 'anthropic' },
      { ...valid, ciphertextBase64: 'not canonical==' },
      { ...valid, ciphertextBase64: '' },
      { ...valid, updatedAtMs: -1 },
      { ...valid, updatedAtMs: 1.5 },
    ]) {
      expect(() => decodeAndValidateEpoch2ProviderCredentialRecord({
        value,
        providerKey: 'openrouter',
        validateDecrypt: () => 'secret',
      })).toThrow('EPOCH2_CREDENTIAL_INVALID:openrouter')
    }
  })

  it('rejects empty or failed decrypts and zeroes bytes on both paths', () => {
    for (const outcome of ['empty', 'throw'] as const) {
      let captured: Buffer | undefined
      const validateDecrypt = (_key: string, ciphertext: Buffer): string => {
        captured = ciphertext
        if (outcome === 'throw') throw new Error('decrypt failed')
        return '   '
      }
      expect(() => decodeAndValidateEpoch2ProviderCredentialRecord({
        value: record('deepseek'),
        providerKey: 'deepseek',
        validateDecrypt,
      })).toThrow('EPOCH2_CREDENTIAL_INVALID:deepseek')
      expect(captured).toBeDefined()
      expect([...captured!]).toEqual(new Array(captured!.byteLength).fill(0))
    }
  })
})
