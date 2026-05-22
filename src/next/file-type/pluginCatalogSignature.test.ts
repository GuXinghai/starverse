/* eslint-disable max-lines-per-function */
import { generateKeyPairSync, sign as cryptoSign } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  PLUGIN_CATALOG_SIGNATURE_ALGORITHMS,
  createCatalogSigningPayload,
  verifyCatalogSignature,
  type PluginCatalogSignature,
  type TrustedCatalogPublicKeyMap,
} from './pluginCatalogSignature'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const keyId = 'test-signing-key-v1'
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

function createTrustedRoots(): TrustedCatalogPublicKeyMap {
  return {
    [keyId]: { keyId, algorithm: 'ed25519', publicKeyPem },
  }
}

function signPayload(payload: unknown): PluginCatalogSignature {
  const payloadBytes = createCatalogSigningPayload(payload)
  const signatureBytes = cryptoSign(null, Buffer.from(payloadBytes), privateKey)
  return {
    keyId,
    algorithm: 'ed25519',
    value: Buffer.from(signatureBytes).toString('base64'),
  }
}

const samplePayload = {
  schemaVersion: '1',
  source: 'official',
  generatedAt: '2026-05-10T00:00:00Z',
  plugins: [
    {
      pluginId: 'magika',
      pluginVersion: '1.0.0',
      packageSha256: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      manifestSha256: 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321',
      packagePath: null,
      manifestPath: null,
    },
  ],
}

describe('pluginCatalogSignature', () => {
  describe('verifyCatalogSignature', () => {
    it('passes verification with valid signed payload', () => {
      const signature = signPayload(samplePayload)
      const result = verifyCatalogSignature({
        signedPayload: samplePayload,
        signature,
        trustedRoots: createTrustedRoots(),
      })
      expect(result.ok).toBe(true)
    })

    it('fails with signature_missing when signature is null', () => {
      const result = verifyCatalogSignature({
        signedPayload: samplePayload,
        signature: null,
        trustedRoots: createTrustedRoots(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('signature_missing')
      }
    })

    it('fails with signature_missing when signature is undefined', () => {
      const result = verifyCatalogSignature({
        signedPayload: samplePayload,
        signature: undefined,
        trustedRoots: createTrustedRoots(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('signature_missing')
      }
    })

    it('fails with signature_algorithm_unsupported for non-ed25519 algorithm', () => {
      const result = verifyCatalogSignature({
        signedPayload: samplePayload,
        signature: { keyId, algorithm: 'ecdsa' as 'ed25519', value: 'dGVzdA==' },
        trustedRoots: createTrustedRoots(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('signature_algorithm_unsupported')
      }
    })

    it('fails with trusted_root_missing when keyId is empty', () => {
      const result = verifyCatalogSignature({
        signedPayload: samplePayload,
        signature: { keyId: '', algorithm: 'ed25519', value: 'dGVzdA==' },
        trustedRoots: createTrustedRoots(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('trusted_root_missing')
      }
    })

    it('fails with trusted_root_missing when keyId not in trusted roots', () => {
      const otherPay = signPayload(samplePayload)
      const result = verifyCatalogSignature({
        signedPayload: samplePayload,
        signature: { ...otherPay, keyId: 'nonexistent-key' },
        trustedRoots: createTrustedRoots(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('trusted_root_missing')
      }
    })

    it('fails with trusted_root_invalid when PEM in trusted root is empty', () => {
      const signature = signPayload(samplePayload)
      const badRoots: TrustedCatalogPublicKeyMap = {
        [keyId]: { keyId, algorithm: 'ed25519', publicKeyPem: '' },
      }
      const result = verifyCatalogSignature({
        signedPayload: samplePayload,
        signature,
        trustedRoots: badRoots,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('trusted_root_invalid')
      }
    })

    it('fails with trusted_root_invalid when PEM parse fails', () => {
      const signature = signPayload(samplePayload)
      const badRoots: TrustedCatalogPublicKeyMap = {
        [keyId]: { keyId, algorithm: 'ed25519', publicKeyPem: 'not-valid-pem' },
      }
      const result = verifyCatalogSignature({
        signedPayload: samplePayload,
        signature,
        trustedRoots: badRoots,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('trusted_root_invalid')
      }
    })

    it('fails with signature_value_invalid for non-base64 signature value', () => {
      const result = verifyCatalogSignature({
        signedPayload: samplePayload,
        signature: { keyId, algorithm: 'ed25519', value: '!!!not-valid-base64!!!' },
        trustedRoots: createTrustedRoots(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('signature_value_invalid')
      }
    })

    it('fails with signature_value_invalid for empty signature value', () => {
      const result = verifyCatalogSignature({
        signedPayload: samplePayload,
        signature: { keyId, algorithm: 'ed25519', value: '' },
        trustedRoots: createTrustedRoots(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('signature_value_invalid')
      }
    })

    it('fails with signature_invalid when payload is tampered', () => {
      const signature = signPayload(samplePayload)
      const tamperedPayload = {
        ...samplePayload,
        plugins: [
          {
            ...samplePayload.plugins[0],
            pluginVersion: '999.0.0',
          },
        ],
      }
      const result = verifyCatalogSignature({
        signedPayload: tamperedPayload,
        signature,
        trustedRoots: createTrustedRoots(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('signature_invalid')
      }
    })

    it('fails with signature_invalid when signed with wrong key', () => {
      const otherKeyPair = generateKeyPairSync('ed25519')
      const wrongSigBytes = cryptoSign(null, createCatalogSigningPayload(samplePayload), otherKeyPair.privateKey)
      const signature: PluginCatalogSignature = {
        keyId,
        algorithm: 'ed25519',
        value: Buffer.from(wrongSigBytes).toString('base64'),
      }
      const result = verifyCatalogSignature({
        signedPayload: samplePayload,
        signature,
        trustedRoots: createTrustedRoots(),
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.reason).toBe('signature_invalid')
      }
    })
  })

  describe('PLUGIN_CATALOG_SIGNATURE_ALGORITHMS', () => {
    it('only includes ed25519', () => {
      expect(PLUGIN_CATALOG_SIGNATURE_ALGORITHMS).toEqual(['ed25519'])
    })
  })

  describe('createCatalogSigningPayload', () => {
    it('produces deterministic output for identical inputs', () => {
      const a = createCatalogSigningPayload(samplePayload)
      const b = createCatalogSigningPayload(JSON.parse(JSON.stringify(samplePayload)))
      expect(Buffer.from(a).toString('hex')).toBe(Buffer.from(b).toString('hex'))
    })

    it('sorts object keys alphabetically', () => {
      const unordered = {
        z: 1,
        a: 2,
        m: 3,
      }
      const result = createCatalogSigningPayload(unordered)
      const resultStr = Buffer.from(result).toString('utf8')
      const aPos = resultStr.indexOf('"a"')
      const mPos = resultStr.indexOf('"m"')
      const zPos = resultStr.indexOf('"z"')
      expect(aPos).toBeLessThan(mPos)
      expect(mPos).toBeLessThan(zPos)
    })

    it('drops undefined values', () => {
      const payloadWithUndefined = {
        a: 1,
        b: undefined,
        c: 3,
      }
      const result = createCatalogSigningPayload(payloadWithUndefined)
      const resultStr = Buffer.from(result).toString('utf8')
      expect(resultStr).toContain('"a"')
      expect(resultStr).toContain('"c"')
      expect(resultStr).not.toContain('"b"')
    })

    it('handles nested arrays', () => {
      const payload = { items: [{ b: 2, a: 1 }, { d: 4, c: 3 }] }
      const result = createCatalogSigningPayload(payload)
      const resultStr = Buffer.from(result).toString('utf8')
      expect(resultStr).toContain('"items"')
    })

    it('handles null values', () => {
      const payload = { a: null, b: 'value' }
      const result = createCatalogSigningPayload(payload)
      const resultStr = Buffer.from(result).toString('utf8')
      expect(resultStr).toContain('null')
    })
  })
})
