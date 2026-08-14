export type RuntimeProviderId =
  | 'openrouter'
  | 'openai_responses'
  | 'google_ai_studio'
  | 'anthropic_messages'
  | 'deepseek'
  | 'lm_studio'
  | 'ollama_local'
  | 'local_endpoint'

export const RUNTIME_PROVIDER_IDS = Object.freeze([
  'openrouter',
  'openai_responses',
  'google_ai_studio',
  'anthropic_messages',
  'deepseek',
  'lm_studio',
  'ollama_local',
  'local_endpoint',
] as const satisfies readonly RuntimeProviderId[])

const RUNTIME_PROVIDER_ID_SET: ReadonlySet<string> = new Set(RUNTIME_PROVIDER_IDS)

export function isRuntimeProviderId(value: unknown): value is RuntimeProviderId {
  return typeof value === 'string' && RUNTIME_PROVIDER_ID_SET.has(value)
}

export function decodeRuntimeProviderId(value: unknown): RuntimeProviderId {
  if (!isRuntimeProviderId(value)) throw new Error('RUNTIME_PROVIDER_ID_INVALID')
  return value
}
