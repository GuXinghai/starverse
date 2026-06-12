import { describe, expect, it } from 'vitest'
import { createBearerCredential } from '@/next/provider/credentials/providerCredential'
import {
  providerCredentialResolutionFailure,
  providerCredentialResolutionSuccess,
  resolveProviderCredential,
  validateProviderCredentialRef,
  type ProviderCredentialRef,
  type ProviderCredentialResolver,
} from '@/next/provider/credentials/providerCredentialResolver'

describe('providerCredentialResolver', () => {
  describe('ProviderCredentialRef', () => {
    it('is a non-secret pointer with kind/id only', () => {
      const ref: ProviderCredentialRef = { kind: 'credential_ref', id: 'generic-default' }
      const serialized = JSON.stringify(ref)

      expect(ref.kind).toBe('credential_ref')
      expect(ref.id).toBe('generic-default')
      expect(serialized).not.toContain('sk-')
      expect(serialized).not.toContain('Bearer')
      expect(serialized).not.toContain('Authorization')
      expect(serialized).not.toContain('headers')
      expect(serialized).not.toContain('password')
      expect('token' in ref).toBe(false)
      expect('apiKey' in ref).toBe(false)
      expect('secret' in ref).toBe(false)
    })

    it('rejects secret-like fields with static safe errors', () => {
      const result = validateProviderCredentialRef({
        kind: 'credential_ref',
        id: 'generic-default',
        apiKey: 'sk-leaked',
        Authorization: 'Bearer sk-leaked',
      })

      expect('code' in result).toBe(true)
      if ('code' in result) {
        expect(result.code).toBe('invalid_credential_ref')
        expect(result.message).toBe('Credential reference must not contain secret-like fields.')
        expect(JSON.stringify(result)).not.toContain('sk-leaked')
        expect(JSON.stringify(result)).not.toContain('Authorization')
        expect(JSON.stringify(result)).not.toContain('Bearer')
      }
    })

    it('rejects missing, wrong-kind, and empty-id refs', () => {
      const missing = validateProviderCredentialRef(undefined)
      const wrongKind = validateProviderCredentialRef({ kind: 'bearer', id: 'x' })
      const emptyId = validateProviderCredentialRef({ kind: 'credential_ref', id: '  ' })

      expect('code' in missing && missing.code).toBe('invalid_credential_ref')
      expect('code' in wrongKind && wrongKind.code).toBe('invalid_credential_ref')
      expect('code' in emptyId && emptyId.code).toBe('invalid_credential_ref')
    })
  })

  describe('resolveProviderCredential', () => {
    const ref: ProviderCredentialRef = { kind: 'credential_ref', id: 'generic-default' }

    it('returns credential material from an injected resolver', () => {
      const resolver: ProviderCredentialResolver = () =>
        providerCredentialResolutionSuccess(createBearerCredential('sk-resolved-token'))

      const result = resolveProviderCredential(ref, resolver)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.credential.kind).toBe('bearer')
        expect(result.credential.token).toBe('sk-resolved-token')
      }
    })

    it('normalizes unresolved credential failure to a stable safe expression', () => {
      const resolver: ProviderCredentialResolver = () => ({
        ok: false,
        error: {
          code: 'credential_unresolved',
          message: 'missing raw token sk-do-not-leak Authorization: Bearer sk-do-not-leak',
        },
      })

      const result = resolveProviderCredential(ref, resolver)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('credential_unresolved')
        expect(result.error.message).toBe('Credential could not be resolved.')
        const serialized = JSON.stringify(result)
        expect(serialized).not.toContain('sk-do-not-leak')
        expect(serialized).not.toContain('Authorization')
        expect(serialized).not.toContain('Bearer')
      }
    })

    it('normalizes invalid credential material before adapter fetch', () => {
      const resolver: ProviderCredentialResolver = () =>
        providerCredentialResolutionSuccess(createBearerCredential('') as any)

      const result = resolveProviderCredential(ref, resolver)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('credential_invalid')
        expect(result.error.message).toBe('Credential material is invalid.')
      }
    })

    it('normalizes thrown resolver errors without leaking internals', () => {
      const resolver: ProviderCredentialResolver = () => {
        throw new Error('resolver exploded with sk-throw-secret')
      }

      const result = resolveProviderCredential(ref, resolver)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error.code).toBe('credential_unresolved')
        expect(JSON.stringify(result)).not.toContain('sk-throw-secret')
      }
    })

    it('has explicit failure helpers with static messages', () => {
      const unresolved = providerCredentialResolutionFailure('credential_unresolved')
      const invalid = providerCredentialResolutionFailure('credential_invalid')

      expect(unresolved).toEqual({
        ok: false,
        error: { code: 'credential_unresolved', message: 'Credential could not be resolved.' },
      })
      expect(invalid).toEqual({
        ok: false,
        error: { code: 'credential_invalid', message: 'Credential material is invalid.' },
      })
    })
  })
})
