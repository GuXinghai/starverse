import { safeStorage } from 'electron'

export class CredentialSafeStorageBackendError extends Error {
  constructor(readonly code:
    | 'CREDENTIAL_SAFE_STORAGE_UNAVAILABLE'
    | 'CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED') {
    super(code)
    this.name = 'CredentialSafeStorageBackendError'
  }
}

export function isTrustedCredentialSafeStorageBackend(input: Readonly<{
  platform: NodeJS.Platform
  backend: string
}>): boolean {
  return input.platform !== 'linux' ||
    input.backend === 'gnome_libsecret' || input.backend === 'kwallet' ||
    input.backend === 'kwallet5' || input.backend === 'kwallet6'
}

/**
 * Electron may report async encryption as available while Linux has selected
 * `basic_text`. That backend is not credential encryption and must never be
 * treated as the secure persistence path.
 */
export async function requireTrustedCredentialSafeStorage(input: Readonly<{
  platform?: NodeJS.Platform
}> = {}): Promise<void> {
  const platform = input.platform ?? process.platform
  try {
    if (!await safeStorage.isAsyncEncryptionAvailable()) {
      throw new CredentialSafeStorageBackendError('CREDENTIAL_SAFE_STORAGE_UNAVAILABLE')
    }
  } catch (error) {
    if (error instanceof CredentialSafeStorageBackendError) throw error
    throw new CredentialSafeStorageBackendError('CREDENTIAL_SAFE_STORAGE_UNAVAILABLE')
  }

  if (platform !== 'linux') return

  try {
    const backend = safeStorage.getSelectedStorageBackend()
    if (!isTrustedCredentialSafeStorageBackend({ platform, backend })) {
      throw new CredentialSafeStorageBackendError('CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED')
    }
  } catch (error) {
    if (error instanceof CredentialSafeStorageBackendError) throw error
    throw new CredentialSafeStorageBackendError('CREDENTIAL_SAFE_STORAGE_BACKEND_UNTRUSTED')
  }
}
