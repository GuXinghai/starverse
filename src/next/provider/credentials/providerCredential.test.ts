import { describe, expect, it } from 'vitest'
import {
  createBearerCredential,
  buildAuthHeader,
  buildProviderAuthHeaders,
  maskCredential,
  isCredentialValid,
  isCredentialError,
} from '@/next/provider/credentials/providerCredential'

describe('providerCredential', () => {
  describe('createBearerCredential', () => {
    it('creates valid bearer credential from token', () => {
      const cred = createBearerCredential('sk-test-123')
      expect(isCredentialValid(cred)).toBe(true)
      if (isCredentialValid(cred)) {
        expect(cred.kind).toBe('bearer')
        expect(cred.token).toBe('sk-test-123')
      }
    })

    it('rejects empty string', () => {
      const cred = createBearerCredential('')
      expect(isCredentialError(cred)).toBe(true)
      if (isCredentialError(cred)) {
        expect(cred.code).toBe('empty_token')
      }
    })

    it('rejects whitespace-only string', () => {
      const cred = createBearerCredential('   ')
      expect(isCredentialError(cred)).toBe(true)
      if (isCredentialError(cred)) {
        expect(cred.code).toBe('empty_token')
      }
    })

    it('rejects null as missing', () => {
      const cred = createBearerCredential(null as any)
      expect(isCredentialError(cred)).toBe(true)
      if (isCredentialError(cred)) {
        expect(cred.code).toBe('missing_token')
      }
    })

    it('rejects undefined as missing', () => {
      const cred = createBearerCredential(undefined as any)
      expect(isCredentialError(cred)).toBe(true)
      if (isCredentialError(cred)) {
        expect(cred.code).toBe('missing_token')
      }
    })
  })

  describe('buildAuthHeader', () => {
    it('builds Authorization header from valid credential', () => {
      const cred = createBearerCredential('sk-abc')
      const header = buildAuthHeader(cred)
      expect(header).toEqual({ Authorization: 'Bearer sk-abc' })
    })

    it('returns error for invalid credential', () => {
      const cred = createBearerCredential('')
      const header = buildAuthHeader(cred)
      expect(isCredentialError(header)).toBe(true)
    })
  })

  describe('buildProviderAuthHeaders', () => {
    it('builds headers from valid credential', () => {
      const cred = createBearerCredential('sk-xyz')
      const headers = buildProviderAuthHeaders(cred)
      expect(headers).toEqual({ Authorization: 'Bearer sk-xyz' })
    })

    it('returns error for invalid credential', () => {
      const cred = createBearerCredential('  ')
      const headers = buildProviderAuthHeaders(cred)
      expect(isCredentialError(headers)).toBe(true)
    })
  })

  describe('maskCredential', () => {
    it('masks valid credential — raw token never appears', () => {
      const cred = createBearerCredential('sk-secret-token-12345')
      const masked = maskCredential(cred)
      expect(masked.kind).toBe('bearer')
      expect(masked.present).toBe(true)
      expect(masked.maskedToken).toBe('***')
      // Raw token must never appear in masked output
      expect(JSON.stringify(masked)).not.toContain('sk-secret-token-12345')
    })

    it('masks invalid credential as not present', () => {
      const cred = createBearerCredential('')
      const masked = maskCredential(cred)
      expect(masked.kind).toBe('bearer')
      expect(masked.present).toBe(false)
      expect(masked.maskedToken).toBe('***')
    })

    it('masked output is JSON-safe and stable', () => {
      const cred = createBearerCredential('sk-test')
      const masked = maskCredential(cred)
      const json = JSON.stringify(masked)
      expect(json).toBe('{"kind":"bearer","present":true,"maskedToken":"***"}')
    })
  })

  describe('isCredentialValid / isCredentialError', () => {
    it('valid credential is valid and not error', () => {
      const cred = createBearerCredential('sk-test')
      expect(isCredentialValid(cred)).toBe(true)
      expect(isCredentialError(cred)).toBe(false)
    })

    it('error credential is error and not valid', () => {
      const cred = createBearerCredential('')
      expect(isCredentialValid(cred)).toBe(false)
      expect(isCredentialError(cred)).toBe(true)
    })
  })

  describe('raw token never in safe diagnostics', () => {
    it('maskCredential output contains no raw token', () => {
      const rawToken = 'sk-super-secret-key-do-not-leak'
      const cred = createBearerCredential(rawToken)
      const masked = maskCredential(cred)
      const serialized = JSON.stringify(masked)
      expect(serialized).not.toContain(rawToken)
    })

    it('CredentialError contains no raw token', () => {
      const cred = createBearerCredential('')
      const serialized = JSON.stringify(cred)
      // Error has no token at all
      expect(serialized).not.toContain('sk-')
    })
  })
})
