export const GENERATION_EXECUTION_PROVIDER_IDS = Object.freeze([
  'openrouter',
  'google_ai_studio',
  'anthropic',
  'deepseek',
  'openai_responses',
  'generic_local',
  'ollama',
  'lmstudio',
  'openai_compatible',
] as const)

export type GenerationExecutionProviderId = typeof GENERATION_EXECUTION_PROVIDER_IDS[number]

const generationExecutionProviderIds = new Set<string>(GENERATION_EXECUTION_PROVIDER_IDS)

export class GenerationExecutionProviderIdError extends Error {
  constructor(readonly code: 'GENERATION_V2_EXECUTION_PROVIDER_ID_INVALID') {
    super(code)
    this.name = 'GenerationExecutionProviderIdError'
  }
}

export function isGenerationExecutionProviderId(value: unknown): value is GenerationExecutionProviderId {
  return typeof value === 'string' && generationExecutionProviderIds.has(value)
}

export function decodeGenerationExecutionProviderId(value: unknown): GenerationExecutionProviderId {
  if (!isGenerationExecutionProviderId(value)) {
    throw new GenerationExecutionProviderIdError('GENERATION_V2_EXECUTION_PROVIDER_ID_INVALID')
  }
  return value
}
