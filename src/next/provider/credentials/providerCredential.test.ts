import { describe, expect, it } from 'vitest'
import {
  createBearerCredential,
  buildAuthHeader,
  buildProviderAuthHeaders,
  maskCredential,
  isCredentialValid,
  isCredentialError,
  redactCredentialFromMessage,
  sanitizeErrorCode,
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

  describe('redactCredentialFromMessage', () => {
    const token = 'sk-secret-12345'

    it('redacts exact token occurrence', () => {
      const result = redactCredentialFromMessage(`Invalid key: ${token}`, token)
      expect(result).not.toContain(token)
      expect(result).toContain('[REDACTED_CREDENTIAL]')
    })

    it('redacts Bearer <token> pattern', () => {
      const result = redactCredentialFromMessage(`Bad Authorization: Bearer ${token}`, token)
      expect(result).not.toContain(token)
      expect(result).not.toContain('Bearer sk-')
      expect(result).toContain('[REDACTED_CREDENTIAL]')
    })

    it('redacts Authorization: Bearer <token> pattern', () => {
      const result = redactCredentialFromMessage(`Rejected: Authorization: Bearer ${token}`, token)
      expect(result).not.toContain(token)
      expect(result).not.toContain('Authorization:')
    })

    it('handles empty message', () => {
      const result = redactCredentialFromMessage('', token)
      expect(result).toBe('')
    })

    it('handles empty token gracefully', () => {
      const result = redactCredentialFromMessage('Bearer abc123', '')
      // Pattern-based redaction still applies
      expect(result).not.toContain('Bearer abc123')
    })

    it('redacts multiple occurrences', () => {
      const result = redactCredentialFromMessage(`${token} and Bearer ${token}`, token)
      expect(result).not.toContain(token)
    })

    it('preserves non-credential text', () => {
      const result = redactCredentialFromMessage('Rate limit exceeded', token)
      expect(result).toBe('Rate limit exceeded')
    })
  })

  describe('sanitizeErrorCode', () => {
    const token = 'sk-secret-12345'

    it('preserves short safe code', () => {
      expect(sanitizeErrorCode('rate_limit_exceeded', token, 'fallback')).toBe('rate_limit_exceeded')
    })

    it('falls back for missing code', () => {
      expect(sanitizeErrorCode(undefined, token, 'fallback')).toBe('fallback')
    })

    it('falls back for non-string code', () => {
      expect(sanitizeErrorCode(123, token, 'fallback')).toBe('fallback')
    })

    it('falls back for empty string code', () => {
      expect(sanitizeErrorCode('', token, 'fallback')).toBe('fallback')
    })

    it('falls back when code is exact token', () => {
      expect(sanitizeErrorCode(token, token, 'fallback')).toBe('fallback')
    })

    it('falls back when code contains Bearer <token>', () => {
      expect(sanitizeErrorCode(`Bearer ${token}`, token, 'fallback')).toBe('fallback')
    })

    it('falls back when code contains Authorization: Bearer <token>', () => {
      expect(sanitizeErrorCode(`Authorization: Bearer ${token}`, token, 'fallback')).toBe('fallback')
    })

    it('falls back for very long code', () => {
      const longCode = 'a'.repeat(200)
      expect(sanitizeErrorCode(longCode, token, 'fallback')).toBe('fallback')
    })

    it('redacts token from code and falls back if changed', () => {
      const code = `error_${token}_something`
      expect(sanitizeErrorCode(code, token, 'fallback')).toBe('fallback')
    })

    it('uses provider fallback for SSE errors', () => {
      expect(sanitizeErrorCode(token, token, 'generic_provider_error')).toBe('generic_provider_error')
    })

    it('uses HTTP fallback for HTTP errors', () => {
      expect(sanitizeErrorCode(token, token, 'generic_http_error')).toBe('generic_http_error')
    })
  })
})
