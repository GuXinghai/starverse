import { describe, expect, it } from 'vitest'
import { GENERATION_EXECUTION_PROVIDER_IDS } from './generationExecutionProviderId'
import { runtimeProviderIdForGenerationExecutionProvider } from './generationExecutionRuntimeProviderAuthority'

describe('Generation execution/Runtime preference conversion authority', () => {
  it('is exhaustive and excludes OpenAI-compatible from ordinary preferences', () => {
    expect(GENERATION_EXECUTION_PROVIDER_IDS.map((providerId) => [
      providerId,
      runtimeProviderIdForGenerationExecutionProvider(providerId),
    ])).toEqual([
      ['openrouter', 'openrouter'],
      ['google_ai_studio', 'google_ai_studio'],
      ['anthropic', 'anthropic_messages'],
      ['deepseek', 'deepseek'],
      ['openai_responses', 'openai_responses'],
      ['generic_local', 'local_endpoint'],
      ['ollama', 'ollama_local'],
      ['lmstudio', 'lm_studio'],
      ['openai_compatible', null],
    ])
  })
})
