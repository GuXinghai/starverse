import { describe, expect, it } from 'vitest'
import { getDefaultGenerationParamProfile, getEffectiveGenerationParamCapabilities } from './generationParamProfiles'
import { anthropicGenerationProfile } from './providerProfiles/anthropicGenerationProfile'
import { deepseekGenerationProfile } from './providerProfiles/deepseekGenerationProfile'
import { geminiGenerationProfile } from './providerProfiles/geminiGenerationProfile'
import { geminiImageGenerationProfile } from './providerProfiles/geminiImageGenerationProfile'
import {
  genericOpenAICompatibleLegacyGenerationProfile,
  genericOpenAICompatibleModernGenerationProfile,
} from './providerProfiles/genericOpenAICompatibleGenerationProfile'
import { openaiResponsesGenerationProfile } from './providerProfiles/openaiResponsesGenerationProfile'
import { openrouterGenerationProfile } from './providerProfiles/openrouterGenerationProfile'

describe('generationParamProfiles', () => {
  it('keeps OpenRouter wide parameters in the OpenRouter profile only', () => {
    expect(openrouterGenerationProfile.params.minP?.wireKey).toBe('min_p')
    expect(openrouterGenerationProfile.params.topA?.wireKey).toBe('top_a')
    expect(openrouterGenerationProfile.params.repetitionPenalty?.wireKey).toBe('repetition_penalty')
    expect(openaiResponsesGenerationProfile.params.minP).toBeUndefined()
    expect(openaiResponsesGenerationProfile.params.topA).toBeUndefined()
    expect(openaiResponsesGenerationProfile.params.repetitionPenalty).toBeUndefined()
  })

  it('marks Gemini 3 sampling capabilities deprecated by model override', () => {
    const capabilities = getEffectiveGenerationParamCapabilities(geminiGenerationProfile, 'models/gemini-3-pro-preview')

    expect(capabilities.temperature?.status).toBe('deprecated')
    expect(capabilities.topP?.status).toBe('deprecated')
    expect(capabilities.topK?.status).toBe('deprecated')
    expect(capabilities.thinkingBudget?.supported).toBe(false)
  })

  it('uses a distinct Gemini image generation profile on request', () => {
    expect(getDefaultGenerationParamProfile('google_ai_studio')?.profileId).toBe(geminiGenerationProfile.profileId)
    expect(getDefaultGenerationParamProfile('google_ai_studio', { requestKind: 'image_generation' })?.profileId).toBe(
      geminiImageGenerationProfile.profileId,
    )

    const lite = getEffectiveGenerationParamCapabilities(geminiImageGenerationProfile, 'gemini-3.1-flash-lite-image')
    expect(lite.temperature?.range).toMatchObject({ min: 0, max: 2 })
    expect(lite.maxOutputTokens?.range?.max).toBe(4096)
    expect(lite.googleSearch?.supported).toBe(false)
    expect(lite.imageSearch?.supported).toBe(false)
  })

  it('restricts OpenAI Responses model-specific reasoning effort', () => {
    const gpt51 = getEffectiveGenerationParamCapabilities(openaiResponsesGenerationProfile, 'gpt-5.1')
    const gpt54Nano = getEffectiveGenerationParamCapabilities(openaiResponsesGenerationProfile, 'gpt-5.4-nano')
    const gpt55Pro = getEffectiveGenerationParamCapabilities(openaiResponsesGenerationProfile, 'gpt-5.5-pro')
    const gpt52Codex = getEffectiveGenerationParamCapabilities(openaiResponsesGenerationProfile, 'gpt-5.2-codex-2026-01-01')
    const gpt5Pro = getEffectiveGenerationParamCapabilities(openaiResponsesGenerationProfile, 'gpt-5-pro')
    const gpt41 = getEffectiveGenerationParamCapabilities(openaiResponsesGenerationProfile, 'gpt-4.1-mini')
    const unknown = getEffectiveGenerationParamCapabilities(openaiResponsesGenerationProfile, 'future-model')

    expect(gpt51.reasoningEffort?.enumValues).toEqual(['auto', 'none', 'low', 'medium', 'high'])
    expect(gpt54Nano.reasoningEffort?.enumValues).toEqual(['auto', 'none', 'low', 'medium', 'high', 'xhigh'])
    expect(gpt54Nano.reasoningEffort?.ui?.providerAutoHint).toBe('none')
    expect(gpt55Pro.reasoningEffort?.enumValues).toEqual(['auto', 'medium', 'high', 'xhigh'])
    expect(gpt52Codex.reasoningEffort?.enumValues).toEqual(['auto', 'low', 'medium', 'high', 'xhigh'])
    expect(gpt5Pro.reasoningEffort?.enumValues).toEqual(['auto', 'high'])
    expect(gpt41.reasoningEffort?.supported).toBe(false)
    expect(gpt41.reasoningSummary?.supported).toBe(false)
    expect(unknown.reasoningEffort?.supported).toBe(false)
  })

  it('marks modern Claude sampling controls rejected', () => {
    const capabilities = getEffectiveGenerationParamCapabilities(anthropicGenerationProfile, 'claude-sonnet-5-20260601')

    expect(capabilities.temperature?.status).toBe('rejected')
    expect(capabilities.topP?.status).toBe('rejected')
    expect(capabilities.topK?.status).toBe('rejected')
  })

  it('marks DeepSeek thinking models no-effect for ignored sampling params', () => {
    const capabilities = getEffectiveGenerationParamCapabilities(deepseekGenerationProfile, 'deepseek-v4-flash')

    expect(capabilities.temperature?.status).toBe('noEffect')
    expect(capabilities.topP?.status).toBe('noEffect')
    expect(capabilities.presencePenalty?.status).toBe('noEffect')
    expect(capabilities.frequencyPenalty?.status).toBe('noEffect')
  })

  it('distinguishes generic legacy and modern max token wire keys', () => {
    expect(genericOpenAICompatibleLegacyGenerationProfile.params.maxOutputTokens?.wireKey).toBe('max_tokens')
    expect(genericOpenAICompatibleModernGenerationProfile.params.maxOutputTokens?.wireKey).toBe('max_completion_tokens')
    expect(getDefaultGenerationParamProfile('generic_openai_compatible')?.profileId).toBe(
      genericOpenAICompatibleLegacyGenerationProfile.profileId,
    )
    expect(getDefaultGenerationParamProfile('generic_openai_compatible', { genericProtocol: 'modern' })?.profileId).toBe(
      genericOpenAICompatibleModernGenerationProfile.profileId,
    )
  })
})
