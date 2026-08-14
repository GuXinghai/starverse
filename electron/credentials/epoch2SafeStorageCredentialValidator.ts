import { safeStorage } from 'electron'
import type { Epoch2ProviderCredentialDecryptValidator } from './epoch2ProviderCredentialRecord'
import { requireTrustedCredentialSafeStorage } from './credentialSafeStorageBackend'

export class Epoch2SafeStorageCredentialValidatorError extends Error {
  constructor(readonly code:
    | 'EPOCH2_CREDENTIAL_STORAGE_UNAVAILABLE'
    | 'EPOCH2_CREDENTIAL_DECRYPT_FAILED') {
    super(code)
    this.name = 'Epoch2SafeStorageCredentialValidatorError'
  }
}

export const validateEpoch2SafeStorageCredentialDecrypt: Epoch2ProviderCredentialDecryptValidator =
  async (_providerKey, ciphertext) => {
    try {
      await requireTrustedCredentialSafeStorage()
    } catch (error) {
      if (error instanceof Epoch2SafeStorageCredentialValidatorError) throw error
      throw new Epoch2SafeStorageCredentialValidatorError('EPOCH2_CREDENTIAL_STORAGE_UNAVAILABLE')
    }

    try {
      const decrypted = await safeStorage.decryptStringAsync(ciphertext)
      if (!decrypted || typeof decrypted !== 'object' ||
          typeof decrypted.shouldReEncrypt !== 'boolean' ||
          typeof decrypted.result !== 'string' || decrypted.result.trim().length === 0) {
        throw new Epoch2SafeStorageCredentialValidatorError('EPOCH2_CREDENTIAL_DECRYPT_FAILED')
      }
      if (!decrypted.shouldReEncrypt) {
        return Object.freeze({ credential: decrypted.result })
      }
      let rewrappedCiphertext: Buffer
      try {
        rewrappedCiphertext = await safeStorage.encryptStringAsync(decrypted.result)
      } catch {
        throw new Epoch2SafeStorageCredentialValidatorError('EPOCH2_CREDENTIAL_DECRYPT_FAILED')
      }
      if (!Buffer.isBuffer(rewrappedCiphertext) || rewrappedCiphertext.byteLength === 0 ||
          rewrappedCiphertext.byteLength > 1024 * 1024) {
        if (Buffer.isBuffer(rewrappedCiphertext)) rewrappedCiphertext.fill(0)
        throw new Epoch2SafeStorageCredentialValidatorError('EPOCH2_CREDENTIAL_DECRYPT_FAILED')
      }
      return Object.freeze({ credential: decrypted.result, rewrappedCiphertext })
    } catch (error) {
      if (error instanceof Epoch2SafeStorageCredentialValidatorError) throw error
      throw new Epoch2SafeStorageCredentialValidatorError('EPOCH2_CREDENTIAL_DECRYPT_FAILED')
    }
  }
