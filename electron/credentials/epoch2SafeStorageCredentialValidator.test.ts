import { beforeEach, describe, expect, it, vi } from 'vitest'

const safeStorageMock = vi.hoisted(() => ({
  available: true,
  backend: 'gnome_libsecret' as const,
  decryptResult: { shouldReEncrypt: false, result: 'credential' } as unknown,
  isAsyncEncryptionAvailable: vi.fn(async () => safeStorageMock.available),
  getSelectedStorageBackend: vi.fn(() => safeStorageMock.backend),
  decryptStringAsync: vi.fn(async () => safeStorageMock.decryptResult),
  encryptStringAsync: vi.fn(async (value: string) => Buffer.from(`rewrapped:${value}`)),
}))

vi.mock('electron', () => ({ safeStorage: safeStorageMock }))

import { validateEpoch2SafeStorageCredentialDecrypt } from './epoch2SafeStorageCredentialValidator'

beforeEach(() => {
  safeStorageMock.available = true
  safeStorageMock.backend = 'gnome_libsecret'
  safeStorageMock.decryptResult = { shouldReEncrypt: false, result: 'credential' }
  safeStorageMock.isAsyncEncryptionAvailable.mockClear()
  safeStorageMock.decryptStringAsync.mockClear()
  safeStorageMock.encryptStringAsync.mockClear()
})

describe('epoch-2 async safe-storage credential validator', () => {
  it('uses only the asynchronous Electron safeStorage contract', async () => {
    const ciphertext = Buffer.from('ciphertext')
    await expect(validateEpoch2SafeStorageCredentialDecrypt('openrouter', ciphertext))
      .resolves.toEqual({ credential: 'credential' })
    expect(safeStorageMock.isAsyncEncryptionAvailable).toHaveBeenCalledTimes(1)
    expect(safeStorageMock.decryptStringAsync).toHaveBeenCalledWith(ciphertext)
  })

  it('returns owned replacement ciphertext when Electron requests key rotation', async () => {
    safeStorageMock.decryptResult = { shouldReEncrypt: true, result: 'credential' }
    const result = await validateEpoch2SafeStorageCredentialDecrypt('openrouter', Buffer.from('ciphertext'))
    expect(result.credential).toBe('credential')
    expect(result.rewrappedCiphertext?.toString('utf8')).toBe('rewrapped:credential')
    result.rewrappedCiphertext?.fill(0)
  })

  it('fails closed on unavailable storage and malformed or failed decrypt results', async () => {
    safeStorageMock.available = false
    await expect(validateEpoch2SafeStorageCredentialDecrypt('openrouter', Buffer.from('ciphertext')))
      .rejects.toThrow('EPOCH2_CREDENTIAL_STORAGE_UNAVAILABLE')
    expect(safeStorageMock.decryptStringAsync).not.toHaveBeenCalled()

    safeStorageMock.available = true
    for (const result of [null, '', { shouldReEncrypt: false, result: '' }]) {
      safeStorageMock.decryptResult = result
      await expect(validateEpoch2SafeStorageCredentialDecrypt('openrouter', Buffer.from('ciphertext')))
        .rejects.toThrow('EPOCH2_CREDENTIAL_DECRYPT_FAILED')
    }
    safeStorageMock.decryptStringAsync.mockRejectedValueOnce(new Error('secret-bearing provider failure'))
    await expect(validateEpoch2SafeStorageCredentialDecrypt('openrouter', Buffer.from('ciphertext')))
      .rejects.toThrow('EPOCH2_CREDENTIAL_DECRYPT_FAILED')
  })
})
