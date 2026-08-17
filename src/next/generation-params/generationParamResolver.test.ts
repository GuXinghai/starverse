import { describe, expect, it } from 'vitest'
import { anthropicGenerationProfile } from './providerProfiles/anthropicGenerationProfile'
import { deepseekGenerationProfile } from './providerProfiles/deepseekGenerationProfile'
import { geminiGenerationProfile } from './providerProfiles/geminiGenerationProfile'
import { openaiResponsesGenerationProfile } from './providerProfiles/openaiResponsesGenerationProfile'
import { openrouterGenerationProfile } from './providerProfiles/openrouterGenerationProfile'
import { resolveGenerationParamsFromLayers } from './generationParamResolver'
import { resolveGeminiThinkingCapability } from '../provider/gemini/geminiThinkingPolicy'

describe('generationParamResolver', () => {
  it('resolves custom precedence conversation > project > global', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openrouterGenerationProfile,
      layers: {
        conversation: {
          temperature: { mode: 'inherit' },
          topP: { mode: 'custom', value: 0.8 },
        },
        project: {
          temperature: { mode: 'custom', value: 0.4 },
          topP: { mode: 'custom', value: 0.6 },
        },
        global: {
          temperature: { mode: 'custom', value: 0.2 },
          maxOutputTokens: { mode: 'custom', value: 1200 },
        },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams).toMatchObject({
      temperature: 0.4,
      topP: 0.8,
      maxOutputTokens: 1200,
    })
    expect(resolved.decisions.temperature).toMatchObject({ state: 'sent', source: 'project', value: 0.4 })
    expect(resolved.decisions.topP).toMatchObject({ state: 'sent', source: 'conversation', value: 0.8 })
  })

  it('uses omit to terminate inherited custom values', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openrouterGenerationProfile,
      layers: {
        conversation: { topP: { mode: 'omit' } },
        global: { topP: { mode: 'custom', value: 0.9 } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.topP).toBeUndefined()
    expect(resolved.decisions.topP).toMatchObject({ state: 'omitted', source: 'conversation' })
  })

  it('preserves explicit false for Gemini includeThoughts', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: geminiGenerationProfile,
      modelId: 'gemini-3.1-flash-lite',
      geminiThinkingCapability: resolveGeminiThinkingCapability({
        model: 'gemini-3.1-flash-lite', thinking: true, thinkingOwnProperty: true, supportedGenerationMethods: ['generateContent'],
      }),
      layers: {
        conversation: {
          thinkingLevel: { mode: 'custom', value: 'medium' },
          includeThoughts: { mode: 'custom', value: false },
        },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams).toMatchObject({ thinkingLevel: 'medium', includeThoughts: false })
    expect(resolved.decisions.includeThoughts).toMatchObject({ state: 'sent', value: false })
  })

  it('does not put absent params or provider implicit defaults into requestParams', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openrouterGenerationProfile,
      layers: {},
    })

    expect(resolved.requestParams).toEqual({})
    expect(resolved.decisions.topP).toMatchObject({ state: 'inheritedToAbsent' })
    expect(resolved.decisions.temperature).toMatchObject({ state: 'inheritedToAbsent' })
  })

  it('preserves a custom value for capability validation at the Generation V2 boundary', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openaiResponsesGenerationProfile,
      layers: {
        conversation: { minP: { mode: 'custom', value: 0.1 } },
      },
    })

    expect(resolved.requestParams.minP).toBe(0.1)
    expect(resolved.decisions.minP).toMatchObject({ state: 'sent', value: 0.1 })
    expect(resolved.errors).toEqual([])
    expect(resolved.warnings).toEqual([])
  })

  it('preserves OpenAI Responses reasoningEffort auto as a raw value', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openaiResponsesGenerationProfile,
      modelId: 'gpt-5.4-nano',
      layers: {
        conversation: { reasoningEffort: { mode: 'custom', value: 'auto' } },
        global: { reasoningEffort: { mode: 'custom', value: 'high' } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.reasoningEffort).toBe('auto')
    expect(resolved.decisions.reasoningEffort).toMatchObject({
      state: 'sent',
      source: 'conversation',
      value: 'auto',
    })
  })

  it('uses omit to disable OpenAI Responses reasoning summary without sending a wire value', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openaiResponsesGenerationProfile,
      modelId: 'gpt-5.4-nano',
      layers: {
        conversation: { reasoningSummary: { mode: 'omit' } },
        global: { reasoningSummary: { mode: 'custom', value: 'detailed' } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.reasoningSummary).toBeUndefined()
    expect(resolved.decisions.reasoningSummary).toMatchObject({
      state: 'omitted',
      source: 'conversation',
    })
  })

  it('does not derive OpenAI Responses reasoning support from model identity', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openaiResponsesGenerationProfile,
      modelId: 'gpt-4.1-mini',
      layers: {
        conversation: { reasoningSummary: { mode: 'custom', value: 'auto' } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.reasoningSummary).toBe('auto')
    expect(resolved.decisions.reasoningSummary).toMatchObject({ state: 'sent', value: 'auto' })
    expect(resolved.warnings).toEqual([])
  })

  it('does not derive OpenAI Responses reasoning effort support from model identity', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openaiResponsesGenerationProfile,
      modelId: 'gpt-4.1-mini',
      layers: {
        conversation: { reasoningEffort: { mode: 'custom', value: 'high' } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.reasoningEffort).toBe('high')
    expect(resolved.decisions.reasoningEffort).toMatchObject({ state: 'sent', value: 'high' })
    expect(resolved.warnings).toEqual([])
  })

  it('does not derive Gemini sampling policy from model identity', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: geminiGenerationProfile,
      modelId: 'gemini-3-pro-preview',
      layers: {
        conversation: { topP: { mode: 'custom', value: 0.85 } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.topP).toBe(0.85)
    expect(resolved.decisions.topP).toMatchObject({ state: 'sent' })
    expect(resolved.warnings).toEqual([])
  })

  it('leaves value validation to the resolved capability validator', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openrouterGenerationProfile,
      layers: {
        conversation: { temperature: { mode: 'custom', value: 99 } },
      },
    })

    expect(resolved.requestParams.temperature).toBe(99)
    expect(resolved.decisions.temperature).toMatchObject({ state: 'sent', value: 99 })
    expect(resolved.errors).toEqual([])
  })

  it('does not derive Anthropic sampling policy from model identity', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: anthropicGenerationProfile,
      modelId: 'claude-sonnet-5-20260601',
      layers: {
        conversation: { temperature: { mode: 'custom', value: 0.2 } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.temperature).toBe(0.2)
    expect(resolved.decisions.temperature).toMatchObject({ state: 'sent', value: 0.2 })
    expect(resolved.warnings).toEqual([])
  })

  it('does not derive DeepSeek no-effect policy from model identity', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: deepseekGenerationProfile,
      modelId: 'deepseek-v4-flash',
      layers: {
        conversation: { topP: { mode: 'custom', value: 0.8 } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.topP).toBe(0.8)
    expect(resolved.decisions.topP).toMatchObject({ state: 'sent', value: 0.8 })
    expect(resolved.warnings).toEqual([])
  })

  it('warns when temperature and topP are both custom', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openrouterGenerationProfile,
      layers: {
        conversation: {
          temperature: { mode: 'custom', value: 0.7 },
          topP: { mode: 'custom', value: 0.9 },
        },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.warnings).toEqual([
      expect.objectContaining({ code: 'conflict_group' }),
    ])
  })
})
