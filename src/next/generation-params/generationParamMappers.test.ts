import { describe, expect, it } from 'vitest'
import { mapGenerationParamsToProviderRequestPatch } from './generationParamMappers'
import { geminiGenerationProfile } from './providerProfiles/geminiGenerationProfile'
import { genericOpenAICompatibleModernGenerationProfile } from './providerProfiles/genericOpenAICompatibleGenerationProfile'
import { openaiResponsesGenerationProfile } from './providerProfiles/openaiResponsesGenerationProfile'
import { openrouterGenerationProfile } from './providerProfiles/openrouterGenerationProfile'
import type { ProviderGenerationParamProfile } from './generationParamTypes'

describe('generationParamMappers', () => {
  it('maps OpenRouter canonical keys to snake_case top-level wire keys', () => {
    expect(mapGenerationParamsToProviderRequestPatch({
      profile: openrouterGenerationProfile,
      requestParams: {
        topP: 0.9,
        maxOutputTokens: 2048,
      },
    })).toEqual({
      top_p: 0.9,
      max_tokens: 2048,
    })
  })

  it('maps Gemini canonical keys to nested generationConfig', () => {
    expect(mapGenerationParamsToProviderRequestPatch({
      profile: geminiGenerationProfile,
      requestParams: {
        topP: 0.8,
        maxOutputTokens: 4096,
      },
    })).toEqual({
      generationConfig: {
        topP: 0.8,
        maxOutputTokens: 4096,
      },
    })
  })

  it('maps OpenAI Responses verbosity and reasoning into nested objects', () => {
    expect(mapGenerationParamsToProviderRequestPatch({
      profile: openaiResponsesGenerationProfile,
      modelId: 'gpt-5.4-nano',
      requestParams: {
        verbosity: 'low',
        reasoningEffort: 'high',
        reasoningSummary: 'concise',
      },
    })).toEqual({
      text: { verbosity: 'low' },
      reasoning: { effort: 'high', summary: 'concise' },
    })
  })

  it('maps OpenAI Responses reasoning summary without explicit effort', () => {
    expect(mapGenerationParamsToProviderRequestPatch({
      profile: openaiResponsesGenerationProfile,
      modelId: 'gpt-5.4-nano',
      requestParams: {
        reasoningSummary: 'auto',
      },
    })).toEqual({
      reasoning: { summary: 'auto' },
    })
  })

  it('omits OpenAI Responses provider-auto reasoning effort from the wire patch', () => {
    expect(mapGenerationParamsToProviderRequestPatch({
      profile: openaiResponsesGenerationProfile,
      modelId: 'gpt-5.4-nano',
      requestParams: {
        maxOutputTokens: 64,
        reasoningEffort: 'auto',
      },
    })).toEqual({
      max_output_tokens: 64,
    })
  })

  it('maps generic modern maxOutputTokens to max_completion_tokens', () => {
    expect(mapGenerationParamsToProviderRequestPatch({
      profile: genericOpenAICompatibleModernGenerationProfile,
      requestParams: {
        maxOutputTokens: 1024,
      },
    })).toEqual({
      max_completion_tokens: 1024,
    })
  })

  it('throws if a requestParam has no provider wire target', () => {
    expect(() => mapGenerationParamsToProviderRequestPatch({
      profile: openaiResponsesGenerationProfile,
      requestParams: {
        minP: 0.1,
      },
    })).toThrow(/generationParams\.minP/)
  })

  it('uses model overrides when selecting provider wire targets', () => {
    const profile: ProviderGenerationParamProfile = {
      providerId: 'generic_openai_compatible',
      profileId: 'mapper_model_override_fixture',
      wireProtocol: 'openai-chat-compatible-legacy',
      params: {
        maxOutputTokens: {
          supported: true,
          wireKey: 'max_tokens',
          valueType: 'integer',
          range: { min: 1, integer: true },
        },
      },
      modelOverrides: [
        {
          match: { exactModelIds: ['modern-model'] },
          params: {
            maxOutputTokens: {
              supported: true,
              wireKey: 'max_completion_tokens',
              valueType: 'integer',
              range: { min: 1, integer: true },
            },
          },
        },
      ],
    }

    expect(mapGenerationParamsToProviderRequestPatch({
      profile,
      modelId: 'modern-model',
      requestParams: {
        maxOutputTokens: 512,
      },
    })).toEqual({
      max_completion_tokens: 512,
    })
  })
})
