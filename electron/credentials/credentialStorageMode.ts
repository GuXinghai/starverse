export type CredentialStorageMode = 'system_secure' | 'session' | 'plaintext'

export type CredentialStorageBackend =
  | 'electron_safe_storage'
  | 'session'
  | 'plaintext'
