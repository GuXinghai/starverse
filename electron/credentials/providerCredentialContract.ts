export type ProviderCredentialKey =
  | 'openrouter'
  | 'openai_responses'
  | 'google_ai_studio'
  | 'anthropic'
  | 'deepseek'

export const PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX = 'providerCredentials.v1.'

export const PROVIDER_CREDENTIAL_KEYS = Object.freeze([
  'openrouter',
  'openai_responses',
  'google_ai_studio',
  'anthropic',
  'deepseek',
] as const satisfies readonly ProviderCredentialKey[])

export function providerCredentialSecureStoreKeys(): string[] {
  return PROVIDER_CREDENTIAL_KEYS.map((providerKey) => `${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}${providerKey}`)
}

export function isProviderCredentialSecureStoreKey(key: string): boolean {
  return typeof key === 'string' && key.startsWith(PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX)
}
