import { describe, expect, it } from 'vitest'
import { isTrustedCredentialSafeStorageBackend } from './credentialSafeStorageBackend'

describe('credential safeStorage backend policy', () => {
  it('fails closed for Electron Linux basic_text and unknown backends', () => {
    expect(isTrustedCredentialSafeStorageBackend({ platform: 'linux', backend: 'basic_text' })).toBe(false)
    expect(isTrustedCredentialSafeStorageBackend({ platform: 'linux', backend: 'unknown' })).toBe(false)
    expect(isTrustedCredentialSafeStorageBackend({ platform: 'linux', backend: 'mystery' })).toBe(false)
  })

  it('accepts the documented Linux secret-store backends', () => {
    for (const backend of ['gnome_libsecret', 'kwallet', 'kwallet5', 'kwallet6']) {
      expect(isTrustedCredentialSafeStorageBackend({ platform: 'linux', backend })).toBe(true)
    }
  })
})
