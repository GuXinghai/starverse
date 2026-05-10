/* eslint-disable max-lines-per-function */
import { generateKeyPairSync } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import type { TrustedCatalogPublicKey } from './pluginCatalogSignature'
import {
  emptyVerificationBinding,
  failedResult,
  filterActiveTrustedRoots,
  filterRevokedRoots,
  isKeyIdRevoked,
  isPluginVerified,
  mapVerificationStatusToFailureReason,
  parseRevokedRootsList,
  resolveTrustRootEnvironment,
  revokedResult,
  sanitizeVerificationDetail,
  trustedRootMetadataFromPublicKey,
  unconfiguredResult,
  unverifiedResult,
  verifiedResult,
} from './enginePluginTrustContracts'

const { publicKey } = generateKeyPairSync('ed25519')
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

const testKey: TrustedCatalogPublicKey = {
  keyId: 'test-root-v1',
  algorithm: 'ed25519',
  publicKeyPem,
}

describe('enginePluginTrustContracts', () => {
  describe('trustedRootMetadataFromPublicKey', () => {
    it('uses defaults when no overrides provided', () => {
      const meta = trustedRootMetadataFromPublicKey(testKey)
      expect(meta.keyId).toBe('test-root-v1')
      expect(meta.version).toBe(1)
      expect(meta.scope).toBe('production')
      expect(meta.environment).toBe('unknown')
      expect(meta.revoked).toBe(false)
      expect(meta.expiresAt).toBeNull()
    })

    it('applies overrides', () => {
      const meta = trustedRootMetadataFromPublicKey(testKey, {
        version: 3,
        scope: 'test',
        revoked: true,
        expiresAt: '2027-01-01T00:00:00Z',
      })
      expect(meta.version).toBe(3)
      expect(meta.scope).toBe('test')
      expect(meta.revoked).toBe(true)
      expect(meta.expiresAt).toBe('2027-01-01T00:00:00Z')
    })
  })

  describe('emptyVerificationBinding', () => {
    it('returns a binding with null fields and empty engineId', () => {
      const binding = emptyVerificationBinding()
      expect(binding.engineId).toBe('')
      expect(binding.platform).toBeNull()
      expect(binding.pluginVersion).toBeNull()
      expect(binding.modelVersion).toBeNull()
      expect(binding.license).toBeNull()
      expect(binding.attribution).toBeNull()
    })
  })

  describe('verification result helpers', () => {
    it('verifiedResult returns ok:true with verified status', () => {
      const result = verifiedResult()
      expect(result.ok).toBe(true)
      expect(result.status).toBe('verified')
      expect(result.detail).toBeNull()
    })

    it('unverifiedResult returns ok:false with unverified status and null detail', () => {
      const result = unverifiedResult()
      expect(result.ok).toBe(false)
      expect(result.status).toBe('unverified')
      expect(result.detail).toBeNull()
    })

    it('failedResult returns ok:false with failed status and detail', () => {
      const result = failedResult('catalog_signature_invalid')
      expect(result.ok).toBe(false)
      expect(result.status).toBe('failed')
      expect(result.detail).toBe('catalog_signature_invalid')
    })

    it('revokedResult returns ok:false with revoked status', () => {
      const result = revokedResult()
      expect(result.ok).toBe(false)
      expect(result.status).toBe('revoked')
      expect(result.detail).toBe('trusted_root_revoked')
    })

    it('revokedResult accepts custom detail', () => {
      const result = revokedResult('catalog_signature_invalid')
      expect(result.detail).toBe('catalog_signature_invalid')
    })

    it('unconfiguredResult returns ok:false with unconfigured status', () => {
      const result = unconfiguredResult()
      expect(result.ok).toBe(false)
      expect(result.status).toBe('unconfigured')
      expect(result.detail).toBe('trusted_root_unconfigured')
    })

    it('isPluginVerified returns true for verified', () => {
      expect(isPluginVerified(verifiedResult())).toBe(true)
    })

    it('isPluginVerified returns false for unverified', () => {
      expect(isPluginVerified(unverifiedResult())).toBe(false)
    })

    it('isPluginVerified returns false for failed', () => {
      expect(isPluginVerified(failedResult('catalog_signature_invalid'))).toBe(false)
    })
  })

  describe('mapVerificationStatusToFailureReason', () => {
    it('returns null for null input', () => {
      expect(mapVerificationStatusToFailureReason(null)).toBeNull()
    })

    it('maps integrity_verification_failed to hash_mismatch', () => {
      expect(mapVerificationStatusToFailureReason('integrity_verification_failed')).toBe('hash_mismatch')
    })

    it('maps manifest_hash_mismatch to hash_mismatch', () => {
      expect(mapVerificationStatusToFailureReason('manifest_hash_mismatch')).toBe('hash_mismatch')
    })

    it('maps package_hash_mismatch to hash_mismatch', () => {
      expect(mapVerificationStatusToFailureReason('package_hash_mismatch')).toBe('hash_mismatch')
    })

    it('maps plugin_not_found to plugin_not_found', () => {
      expect(mapVerificationStatusToFailureReason('plugin_not_found')).toBe('plugin_not_found')
    })

    it('maps manifest_engine_mismatch to manifest_invalid', () => {
      expect(mapVerificationStatusToFailureReason('manifest_engine_mismatch')).toBe('manifest_invalid')
    })

    it('maps manifest_version_mismatch to manifest_invalid', () => {
      expect(mapVerificationStatusToFailureReason('manifest_version_mismatch')).toBe('manifest_invalid')
    })

    it('maps manifest_model_version_mismatch to manifest_invalid', () => {
      expect(mapVerificationStatusToFailureReason('manifest_model_version_mismatch')).toBe('manifest_invalid')
    })

    it('maps manifest_license_missing to manifest_invalid', () => {
      expect(mapVerificationStatusToFailureReason('manifest_license_missing')).toBe('manifest_invalid')
    })

    it('maps manifest_attribution_missing to manifest_invalid', () => {
      expect(mapVerificationStatusToFailureReason('manifest_attribution_missing')).toBe('manifest_invalid')
    })

    it('maps manifest_platform_mismatch to platform_unsupported', () => {
      expect(mapVerificationStatusToFailureReason('manifest_platform_mismatch')).toBe('platform_unsupported')
    })

    it('maps install_root_kind_mismatch to disabled_by_policy', () => {
      expect(mapVerificationStatusToFailureReason('install_root_kind_mismatch')).toBe('disabled_by_policy')
    })

    it('maps trusted_root_unconfigured to disabled_by_policy', () => {
      expect(mapVerificationStatusToFailureReason('trusted_root_unconfigured')).toBe('disabled_by_policy')
    })

    it('maps trusted_root_expired to disabled_by_policy', () => {
      expect(mapVerificationStatusToFailureReason('trusted_root_expired')).toBe('disabled_by_policy')
    })

    it('maps trusted_root_revoked to disabled_by_policy', () => {
      expect(mapVerificationStatusToFailureReason('trusted_root_revoked')).toBe('disabled_by_policy')
    })

    it('maps catalog_signature_invalid to disabled_by_policy', () => {
      expect(mapVerificationStatusToFailureReason('catalog_signature_invalid')).toBe('disabled_by_policy')
    })

    it('maps catalog_signature_missing to disabled_by_policy', () => {
      expect(mapVerificationStatusToFailureReason('catalog_signature_missing')).toBe('disabled_by_policy')
    })

    it('maps catalog_entry_not_found to disabled_by_policy', () => {
      expect(mapVerificationStatusToFailureReason('catalog_entry_not_found')).toBe('disabled_by_policy')
    })
  })

  describe('sanitizeVerificationDetail', () => {
    it('returns null for null input', () => {
      expect(sanitizeVerificationDetail(null)).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(sanitizeVerificationDetail('')).toBeNull()
    })

    it('translates Windows path to [path]', () => {
      const result = sanitizeVerificationDetail('file not found: C:\\Users\\test\\plugin\\config.json')
      expect(result).toContain('[path]')
      expect(result).not.toContain('C:')
      expect(result).not.toContain('Users')
    })

    it('translates Unix path to [path]', () => {
      const result = sanitizeVerificationDetail('error at /home/user/plugin/manifest.json')
      expect(result).toContain('[path]')
      expect(result).not.toContain('/home')
    })

    it('translates sha256 hash to [hash]', () => {
      const result = sanitizeVerificationDetail(
        'expected abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890 but got different',
      )
      expect(result).toContain('[hash]')
      expect(result).not.toContain('abcdef12')
    })

    it('translates PEM public key to [public-key]', () => {
      const detail = `invalid key: ${publicKeyPem}`
      const result = sanitizeVerificationDetail(detail)
      expect(result).toContain('[public-key]')
      expect(result).not.toContain('BEGIN PUBLIC KEY')
      expect(result).not.toContain('MCowBQ')
    })

    it('preserves non-sensitive text unchanged', () => {
      const detail = 'verification failed due to unknown error'
      const result = sanitizeVerificationDetail(detail)
      expect(result).toBe(detail)
    })
  })

  describe('resolveTrustRootEnvironment', () => {
    it('returns production when isProduction is true', () => {
      expect(resolveTrustRootEnvironment({ isProduction: true })).toBe('production')
    })

    it('returns test when isTest is true', () => {
      expect(resolveTrustRootEnvironment({ isTest: true })).toBe('test')
    })

    it('returns development when neither flag is set', () => {
      expect(resolveTrustRootEnvironment({})).toBe('development')
    })

    it('returns development for explicit false values', () => {
      expect(resolveTrustRootEnvironment({ isProduction: false, isTest: false })).toBe('development')
    })
  })

  describe('filterActiveTrustedRoots', () => {
    const key2: TrustedCatalogPublicKey = {
      keyId: 'root-v2',
      algorithm: 'ed25519',
      publicKeyPem,
    }
    const roots = {
      [testKey.keyId]: testKey,
      [key2.keyId]: key2,
    }

    it('returns all roots when metadata is undefined', () => {
      const result = filterActiveTrustedRoots(roots)
      expect(Object.keys(result)).toHaveLength(2)
      expect(result[testKey.keyId]).toBeDefined()
      expect(result[key2.keyId]).toBeDefined()
    })

    it('returns all roots when metadata is null (as undefined)', () => {
      const result = filterActiveTrustedRoots(roots, undefined)
      expect(Object.keys(result)).toHaveLength(2)
    })

    it('passes through keys not in metadata', () => {
      const result = filterActiveTrustedRoots(roots, {})
      expect(Object.keys(result)).toHaveLength(2)
    })

    it('filters out revoked roots', () => {
      const metadata = {
        [testKey.keyId]: trustedRootMetadataFromPublicKey(testKey, { revoked: true }),
        [key2.keyId]: trustedRootMetadataFromPublicKey(key2),
      }
      const result = filterActiveTrustedRoots(roots, metadata)
      expect(Object.keys(result)).toHaveLength(1)
      expect(result[testKey.keyId]).toBeUndefined()
      expect(result[key2.keyId]).toBeDefined()
    })

    it('filters out expired roots', () => {
      const metadata = {
        [testKey.keyId]: trustedRootMetadataFromPublicKey(testKey, { expiresAt: '2020-01-01T00:00:00Z' }),
        [key2.keyId]: trustedRootMetadataFromPublicKey(key2),
      }
      const result = filterActiveTrustedRoots(roots, metadata)
      expect(Object.keys(result)).toHaveLength(1)
      expect(result[testKey.keyId]).toBeUndefined()
      expect(result[key2.keyId]).toBeDefined()
    })

    it('keeps roots with future expiry date', () => {
      const future = new Date()
      future.setFullYear(future.getFullYear() + 10)
      const metadata = {
        [testKey.keyId]: trustedRootMetadataFromPublicKey(testKey, { expiresAt: future.toISOString() }),
        [key2.keyId]: trustedRootMetadataFromPublicKey(key2),
      }
      const result = filterActiveTrustedRoots(roots, metadata)
      expect(Object.keys(result)).toHaveLength(2)
    })

    it('returns empty when all roots are revoked or expired', () => {
      const metadata = {
        [testKey.keyId]: trustedRootMetadataFromPublicKey(testKey, { revoked: true }),
        [key2.keyId]: trustedRootMetadataFromPublicKey(key2, { expiresAt: '2019-01-01T00:00:00Z' }),
      }
      const result = filterActiveTrustedRoots(roots, metadata)
      expect(Object.keys(result)).toHaveLength(0)
    })
  })

  describe('parseRevokedRootsList', () => {
    it('parses a valid revoked roots JSON', () => {
      const input = {
        schemaVersion: '1',
        entries: [
          { keyId: 'compromised-key-1', revokedAt: '2026-06-01T00:00:00Z', reason: 'key compromised' },
        ],
      }
      const result = parseRevokedRootsList(input)
      expect(result).not.toBeNull()
      expect(result!.schemaVersion).toBe('1')
      expect(result!.entries).toHaveLength(1)
      expect(result!.entries[0].keyId).toBe('compromised-key-1')
    })

    it('rejects non-object input', () => {
      expect(parseRevokedRootsList(null)).toBeNull()
      expect(parseRevokedRootsList('invalid')).toBeNull()
      expect(parseRevokedRootsList([])).toBeNull()
    })

    it('rejects wrong schema version', () => {
      const input = { schemaVersion: '2', entries: [] }
      expect(parseRevokedRootsList(input)).toBeNull()
    })

    it('rejects entries that is not an array', () => {
      const input = { schemaVersion: '1', entries: 'not-an-array' }
      expect(parseRevokedRootsList(input)).toBeNull()
    })

    it('skips entries with missing keyId', () => {
      const input = {
        schemaVersion: '1',
        entries: [
          { keyId: '', revokedAt: '2026-01-01T00:00:00Z' },
          { keyId: 'valid-key', revokedAt: '2026-01-01T00:00:00Z' },
        ],
      }
      const result = parseRevokedRootsList(input)
      expect(result!.entries).toHaveLength(1)
      expect(result!.entries[0].keyId).toBe('valid-key')
    })

    it('skips entries with missing revokedAt', () => {
      const input = {
        schemaVersion: '1',
        entries: [
          { keyId: 'some-key', revokedAt: '' },
        ],
      }
      const result = parseRevokedRootsList(input)
      expect(result!.entries).toHaveLength(0)
    })

    it('handles empty entries array', () => {
      const input = { schemaVersion: '1', entries: [] }
      const result = parseRevokedRootsList(input)
      expect(result).not.toBeNull()
      expect(result!.entries).toHaveLength(0)
    })
  })

  describe('isKeyIdRevoked', () => {
    it('returns false for null revoked roots list', () => {
      expect(isKeyIdRevoked('any-key', null)).toBe(false)
    })

    it('returns true for revoked keyId', () => {
      const list = parseRevokedRootsList({
        schemaVersion: '1',
        entries: [{ keyId: 'revoked-1', revokedAt: '2026-01-01T00:00:00Z' }],
      })
      expect(isKeyIdRevoked('revoked-1', list)).toBe(true)
    })

    it('returns false for non-revoked keyId', () => {
      const list = parseRevokedRootsList({
        schemaVersion: '1',
        entries: [{ keyId: 'revoked-1', revokedAt: '2026-01-01T00:00:00Z' }],
      })
      expect(isKeyIdRevoked('active-key', list)).toBe(false)
    })
  })

  describe('filterRevokedRoots', () => {
    const key1 = testKey
    const key2: TrustedCatalogPublicKey = { keyId: 'root-v2', algorithm: 'ed25519', publicKeyPem }
    const roots = { [key1.keyId]: key1, [key2.keyId]: key2 }

    it('returns all roots when revoked list is null', () => {
      const result = filterRevokedRoots(roots, null)
      expect(Object.keys(result)).toHaveLength(2)
    })

    it('filters out revoked keyIds', () => {
      const revoked = parseRevokedRootsList({
        schemaVersion: '1',
        entries: [{ keyId: key1.keyId, revokedAt: '2026-01-01T00:00:00Z' }],
      })
      const result = filterRevokedRoots(roots, revoked)
      expect(Object.keys(result)).toHaveLength(1)
      expect(result[key1.keyId]).toBeUndefined()
      expect(result[key2.keyId]).toBeDefined()
    })

    it('filters out all roots when all are revoked', () => {
      const revoked = parseRevokedRootsList({
        schemaVersion: '1',
        entries: [
          { keyId: key1.keyId, revokedAt: '2026-01-01T00:00:00Z' },
          { keyId: key2.keyId, revokedAt: '2026-01-01T00:00:00Z' },
        ],
      })
      const result = filterRevokedRoots(roots, revoked)
      expect(Object.keys(result)).toHaveLength(0)
    })
  })
})
