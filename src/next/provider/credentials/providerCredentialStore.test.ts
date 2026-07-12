import { describe, expect, it } from 'vitest'
import {
  createBearerCredential,
  isCredentialValid,
  type ProviderCredential,
} from '@/next/provider/credentials/providerCredential'
import type { ProviderCredentialRef } from '@/next/provider/credentials/providerCredentialResolver'
import {
  providerCredentialResolverFromStore,
  providerCredentialStoreCredential,
  providerCredentialStoreError,
  providerCredentialStoreInvalid,
  providerCredentialStoreMissing,
  providerCredentialStoreUnavailable,
  type ProviderCredentialStore,
  type ProviderCredentialStoreResult,
} from '@/next/provider/credentials/providerCredentialStore'
import {
  safeProviderCredentialMetadataForStoreError,
  safeProviderCredentialMetadataFromStoreResult,
} from '@/next/provider/credentials/providerCredentialMetadata'

const VALID_REF: ProviderCredentialRef = { kind: 'credential_ref', id: 'generic-default' }

function inMemoryCredentialStore(
  entries: Readonly<Record<string, ProviderCredential>>,
): ProviderCredentialStore {
  const credentials = new Map(Object.entries(entries))
  return {
    getCredential(ref) {
      const credential = credentials.get(ref.id)
      if (!credential) return providerCredentialStoreMissing()
      return providerCredentialStoreCredential(credential)
    },
  }
}

function fixedStore(result: ProviderCredentialStoreResult): ProviderCredentialStore {
  return {
    getCredential: () => result,
  }
}

function throwingStore(message: string): ProviderCredentialStore {
  return {
    getCredential: () => {
      throw new Error(message)
    },
  }
}

describe('providerCredentialStore boundary', () => {
  it('in-memory credential store returns bearer credential by ProviderCredentialRef', () => {
    const store = inMemoryCredentialStore({
      [VALID_REF.id]: createBearerCredential('sk-store-token') as ProviderCredential,
    })
    const resolver = providerCredentialResolverFromStore(store)

    const result = resolver(VALID_REF)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.credential.kind).toBe('bearer')
      expect(result.credential.token).toBe('sk-store-token')
    }
  })

  it('missing credential becomes safe unresolved failure', () => {
    const resolver = providerCredentialResolverFromStore(inMemoryCredentialStore({}))

    const result = resolver(VALID_REF)

    expect(result).toEqual({
      ok: false,
      error: { code: 'credential_unresolved', message: 'Credential could not be resolved.' },
    })
  })

  it('invalid credential material becomes safe invalid failure', () => {
    const resolver = providerCredentialResolverFromStore(fixedStore(providerCredentialStoreInvalid()))

    const result = resolver(VALID_REF)

    expect(result).toEqual({
      ok: false,
      error: { code: 'credential_invalid', message: 'Credential material is invalid.' },
    })
  })

  it('explicit invalid store result becomes safe invalid failure', () => {
    const resolver = providerCredentialResolverFromStore(fixedStore(providerCredentialStoreInvalid()))

    const result = resolver(VALID_REF)

    expect(result).toEqual({
      ok: false,
      error: { code: 'credential_invalid', message: 'Credential material is invalid.' },
    })
  })

  it('store success helper accepts only valid ProviderCredential material', () => {
    const credential = createBearerCredential('sk-store-valid-token')
    expect(isCredentialValid(credential)).toBe(true)
    if (!isCredentialValid(credential)) {
      throw new Error('Expected valid credential in test setup')
    }

    const result = providerCredentialStoreCredential(credential)

    expect(result).toEqual({ ok: true, credential })
  })

  it('store success helper rejects CredentialError at type level', () => {
    type StoreCredentialInput = Parameters<typeof providerCredentialStoreCredential>[0]

    const invalidCredential = createBearerCredential('')
    expect(isCredentialValid(invalidCredential)).toBe(false)
    if (!isCredentialValid(invalidCredential)) {
      type CredentialErrorAssignableToStoreSuccess =
        typeof invalidCredential extends StoreCredentialInput ? true : false
      const assignable: CredentialErrorAssignableToStoreSuccess = false
      expect(assignable).toBe(false)
    }
  })

  it('store unavailable and internal errors become safe unresolved failures', () => {
    const unavailableResolver = providerCredentialResolverFromStore(fixedStore(providerCredentialStoreUnavailable()))
    const errorResolver = providerCredentialResolverFromStore(fixedStore(providerCredentialStoreError()))

    expect(unavailableResolver(VALID_REF)).toEqual({
      ok: false,
      error: { code: 'credential_unresolved', message: 'Credential could not be resolved.' },
    })
    expect(errorResolver(VALID_REF)).toEqual({
      ok: false,
      error: { code: 'credential_unresolved', message: 'Credential could not be resolved.' },
    })
  })

  it('store results map to safe metadata without raw store messages', () => {
    const cases = [
      { result: providerCredentialStoreMissing(), status: 'missing', code: 'credential_missing' },
      { result: providerCredentialStoreInvalid(), status: 'invalid', code: 'credential_invalid' },
      { result: providerCredentialStoreUnavailable(), status: 'unavailable', code: 'credential_unavailable' },
      { result: providerCredentialStoreError(), status: 'error', code: 'credential_error' },
      {
        result: {
          ok: false,
          code: 'store_error',
          message: 'Authorization: Bearer sk-store-metadata-leak headers userinfo',
        } as ProviderCredentialStoreResult,
        status: 'error',
        code: 'credential_error',
      },
    ] as const

    for (const { result, status, code } of cases) {
      const metadata = safeProviderCredentialMetadataFromStoreResult(VALID_REF, result)
      const serialized = JSON.stringify(metadata)

      expect(metadata.status).toBe(status)
      expect(metadata.code).toBe(code)
      expect(serialized).not.toContain('sk-store-metadata-leak')
      expect(serialized).not.toContain('Authorization')
      expect(serialized).not.toContain('Bearer')
      expect(serialized).not.toContain('headers')
      expect(serialized).not.toContain('userinfo')
    }

    expect(safeProviderCredentialMetadataForStoreError(VALID_REF).code).toBe('credential_error')
  })

  it('thrown store error does not leak raw token, Authorization, Bearer, or headers', () => {
    const resolver = providerCredentialResolverFromStore(throwingStore(
      'store failed with Authorization: Bearer sk-store-throw-secret headers={"Authorization":"Bearer sk-store-throw-secret"}',
    ))

    const result = resolver(VALID_REF)
    const serialized = JSON.stringify(result)

    expect(result.ok).toBe(false)
    expect(serialized).not.toContain('sk-store-throw-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('headers')
  })

  it('store boundary does not expose a raw credential list API', () => {
    const rawToken = 'sk-hidden-in-memory-store'
    const store = inMemoryCredentialStore({
      [VALID_REF.id]: createBearerCredential(rawToken) as ProviderCredential,
    })

    expect(Object.keys(store)).toEqual(['getCredential'])
    expect('listCredentials' in store).toBe(false)
    expect('entries' in store).toBe(false)
    expect('credentials' in store).toBe(false)
    expect(JSON.stringify(store)).not.toContain(rawToken)
  })

  it('CredentialRef remains non-secret', () => {
    const serialized = JSON.stringify(VALID_REF)

    expect(VALID_REF).toEqual({ kind: 'credential_ref', id: 'generic-default' })
    expect(serialized).not.toContain('token')
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('headers')
  })

})
