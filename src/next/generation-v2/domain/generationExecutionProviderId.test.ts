import { describe, expect, it } from 'vitest'
import { GenerationV2Identity } from './identityV2'
import {
  GENERATION_EXECUTION_PROVIDER_IDS,
  createGenerationExecutionProviderIdentityV2,
  decodeGenerationExecutionProviderId,
  isGenerationExecutionProviderId,
  readGenerationExecutionProviderIdentityV2,
} from './generationExecutionProviderId'

describe('Generation execution provider identity', () => {
  it('accepts exactly the reviewed production execution provider domain', () => {
    expect(GENERATION_EXECUTION_PROVIDER_IDS).toEqual([
      'openrouter',
      'google_ai_studio',
      'anthropic',
      'deepseek',
      'openai_responses',
      'generic_local',
      'ollama',
      'lmstudio',
      'openai_compatible',
    ])
    for (const providerId of GENERATION_EXECUTION_PROVIDER_IDS) {
      expect(isGenerationExecutionProviderId(providerId)).toBe(true)
      expect(decodeGenerationExecutionProviderId(providerId)).toBe(providerId)
      expect(createGenerationExecutionProviderIdentityV2(providerId).value).toBe(providerId)
    }
  })

  it('rejects runtime aliases, historical spellings, and arbitrary strings', () => {
    for (const value of ['gemini', 'anthropic_messages', 'lm_studio', 'ollama_local', 'local_endpoint', 'openai', 'other', '', null]) {
      expect(isGenerationExecutionProviderId(value)).toBe(false)
      expect(() => decodeGenerationExecutionProviderId(value)).toThrow('GENERATION_V2_EXECUTION_PROVIDER_ID_INVALID')
    }
  })

  it('rejects a generic provider identity outside the execution domain', () => {
    expect(() => readGenerationExecutionProviderIdentityV2(
      GenerationV2Identity.create('provider_id', 'gemini'),
    )).toThrow('GENERATION_V2_EXECUTION_PROVIDER_ID_INVALID')
  })
})
