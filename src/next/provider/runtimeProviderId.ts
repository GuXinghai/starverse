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
