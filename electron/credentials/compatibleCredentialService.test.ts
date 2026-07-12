import { describe, expect, it, vi } from 'vitest'
import type Store from 'electron-store'
import {
  compatibleCredentialSecureStoreKey,
  createCompatibleCredentialService,
  isCompatibleCredentialSecureStoreKey,
} from './compatibleCredentialService'

function createStore() {
  const values = new Map<string, unknown>()
  const store = {
    get: vi.fn((key: string) => values.get(key)),
    set: vi.fn((key: string, value: unknown) => values.set(key, value)),
    delete: vi.fn((key: string) => values.delete(key)),
  } as unknown as Store
  Object.defineProperty(store, 'store', { get: () => Object.fromEntries(values) })
  return {
    values,
    store,
  }
}

function secureStorage(available = true) {
  return {
    kind: 'electron_safe_storage' as const,
    isEncryptionAvailable: () => available,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, 'utf8'),
    decryptString: (value: Buffer) => value.toString('utf8').replace(/^encrypted:/u, ''),
  }
}

describe('CompatibleCredentialService', () => {
  it.each([
    { mode: 'bearer' as const, token: 'test-bearer-value' },
    { mode: 'basic' as const, username: 'test-user', password: 'test-password-value' },
    { mode: 'custom_headers' as const, headers: [{ name: 'X-Api-Key', value: 'test-header-secret' }] },
  ])('round-trips $mode only through main-owned encrypted records', (payload) => {
    const { store, values } = createStore()
    const service = createCompatibleCredentialService(store, { secureStorage: secureStorage(), nowMs: () => 11 })
    const ref = 'ocp_credential_12345678' as any
    const summary = service.write(ref, payload)

    expect(summary).toMatchObject({ authMode: payload.mode, configured: true, maskState: 'configured_masked' })
    expect(service.readForMain(ref)).toEqual(payload)
    expect(service.has(ref)).toBe(true)
    const storedText = JSON.stringify(values.get(compatibleCredentialSecureStoreKey(ref)))
    for (const forbidden of ['test-bearer-value', 'test-password-value', 'test-header-secret']) {
      expect(storedText).not.toContain(forbidden)
    }
    expect(storedText).not.toContain('plaintext')
    expect(isCompatibleCredentialSecureStoreKey(compatibleCredentialSecureStoreKey(ref))).toBe(true)
  })

  it('fails closed when OS encryption is unavailable and never writes plaintext fallback', () => {
    const { store, values } = createStore()
    const service = createCompatibleCredentialService(store, { secureStorage: secureStorage(false) })
    expect(() => service.write('ocp_credential_12345678' as any, { mode: 'bearer', token: 'test-secret' })).toThrow(/unavailable/i)
    expect(values.size).toBe(0)
  })

  it('deletes an immutable credential version without exposing its payload', () => {
    const { store } = createStore()
    const service = createCompatibleCredentialService(store, { secureStorage: secureStorage() })
    const ref = 'ocp_credential_12345678' as any
    service.write(ref, { mode: 'bearer', token: 'test-secret' })
    service.delete(ref)
    expect(service.has(ref)).toBe(false)
    expect(() => service.readForMain(ref)).toThrow(/unavailable/i)
  })

  it('never overwrites an immutable credential version ref', () => {
    const { store } = createStore()
    const service = createCompatibleCredentialService(store, { secureStorage: secureStorage() })
    const ref = 'ocp_credential_12345678' as any
    service.write(ref, { mode: 'bearer', token: 'original-secret' })

    expect(() => service.write(ref, { mode: 'bearer', token: 'replacement-secret' })).toThrow(/already exists/i)
    expect(service.readForMain(ref)).toEqual({ mode: 'bearer', token: 'original-secret' })
  })

  it('enumerates only valid opaque refs for main-process reconciliation', () => {
    const { store } = createStore()
    const service = createCompatibleCredentialService(store, { secureStorage: secureStorage() })
    service.write('ocp_credential_12345678' as any, { mode: 'bearer', token: 'first-secret' })
    service.write('ocp_credential_abcdefgh' as any, { mode: 'bearer', token: 'second-secret' })
    store.set('compatibleCredentials.v1.invalid', { ciphertextBase64: 'ignored' })

    expect(service.listRefsForMain()).toEqual([
      'ocp_credential_12345678',
      'ocp_credential_abcdefgh',
    ])
  })

  it('treats a key/record credential ref mismatch as unavailable', () => {
    const { store, values } = createStore()
    const service = createCompatibleCredentialService(store, { secureStorage: secureStorage() })
    const first = 'ocp_credential_12345678' as any
    const second = 'ocp_credential_abcdefgh' as any
    service.write(first, { mode: 'bearer', token: 'first-secret' })
    const record = values.get(compatibleCredentialSecureStoreKey(first)) as Record<string, unknown>
    values.set(compatibleCredentialSecureStoreKey(first), { ...record, credentialVersionRef: second })

    expect(service.has(first)).toBe(false)
    expect(() => service.readForMain(first)).toThrow(/unavailable/i)
  })
})
