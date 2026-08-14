export const PROVIDER_CREDENTIAL_KEYS = Object.freeze([
  'openrouter',
  'openai_responses',
  'google_ai_studio',
  'anthropic',
  'deepseek',
] as const)

export type ProviderCredentialKey = typeof PROVIDER_CREDENTIAL_KEYS[number]

export function isProviderCredentialKey(value: unknown): value is ProviderCredentialKey {
  return typeof value === 'string' && PROVIDER_CREDENTIAL_KEYS.includes(value as ProviderCredentialKey)
}

export function decodeProviderCredentialKey(value: unknown): ProviderCredentialKey {
  if (!isProviderCredentialKey(value)) throw new Error('PROVIDER_CREDENTIAL_KEY_INVALID')
  return value
}
