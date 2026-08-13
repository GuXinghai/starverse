import {
  PROVIDER_CREDENTIAL_KEYS,
} from '../../src/shared/provider/providerCredentialKey'

export { PROVIDER_CREDENTIAL_KEYS, type ProviderCredentialKey } from '../../src/shared/provider/providerCredentialKey'

export const PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX = 'providerCredentials.v1.'

export function providerCredentialSecureStoreKeys(): string[] {
  return PROVIDER_CREDENTIAL_KEYS.map((providerKey) => `${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}${providerKey}`)
}

export function isProviderCredentialSecureStoreKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith(PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX)
}
