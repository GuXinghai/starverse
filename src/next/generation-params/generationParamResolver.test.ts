import { describe, expect, it } from 'vitest'
import { anthropicGenerationProfile } from './providerProfiles/anthropicGenerationProfile'
import { deepseekGenerationProfile } from './providerProfiles/deepseekGenerationProfile'
import { geminiGenerationProfile } from './providerProfiles/geminiGenerationProfile'
import { openaiResponsesGenerationProfile } from './providerProfiles/openaiResponsesGenerationProfile'
import { openrouterGenerationProfile } from './providerProfiles/openrouterGenerationProfile'
import { resolveGenerationParamsFromLayers } from './generationParamResolver'

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

  it('does not put absent params or provider implicit defaults into requestParams', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openrouterGenerationProfile,
      layers: {},
    })

    expect(resolved.requestParams).toEqual({})
    expect(resolved.decisions.topP).toMatchObject({ state: 'inheritedToAbsent' })
    expect(resolved.decisions.temperature).toMatchObject({ state: 'inheritedToAbsent' })
  })

  it('records unsupported provider params as warnings without blocking send', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openaiResponsesGenerationProfile,
      layers: {
        conversation: { minP: { mode: 'custom', value: 0.1 } },
      },
    })

    expect(resolved.requestParams.minP).toBeUndefined()
    expect(resolved.decisions.minP).toMatchObject({ state: 'unsupported' })
    expect(resolved.errors).toEqual([])
    expect(resolved.warnings).toEqual([
      expect.objectContaining({ code: 'unsupported_param', key: 'minP' }),
    ])
  })

  it('treats OpenAI Responses reasoningEffort auto as provider auto without sending effort', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openaiResponsesGenerationProfile,
      modelId: 'gpt-5.4-nano',
      layers: {
        conversation: { reasoningEffort: { mode: 'custom', value: 'auto' } },
        global: { reasoningEffort: { mode: 'custom', value: 'high' } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.reasoningEffort).toBeUndefined()
    expect(resolved.decisions.reasoningEffort).toMatchObject({
      state: 'providerAuto',
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

  it('does not send OpenAI Responses reasoning summary for non-reasoning models', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openaiResponsesGenerationProfile,
      modelId: 'gpt-4.1-mini',
      layers: {
        conversation: { reasoningSummary: { mode: 'custom', value: 'auto' } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.reasoningSummary).toBeUndefined()
    expect(resolved.decisions.reasoningSummary).toMatchObject({ state: 'unsupported' })
    expect(resolved.warnings).toEqual([
      expect.objectContaining({ code: 'unsupported_param', key: 'reasoningSummary' }),
    ])
  })

  it('does not send unsupported OpenAI Responses reasoning effort for non-reasoning models', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openaiResponsesGenerationProfile,
      modelId: 'gpt-4.1-mini',
      layers: {
        conversation: { reasoningEffort: { mode: 'custom', value: 'high' } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.reasoningEffort).toBeUndefined()
    expect(resolved.decisions.reasoningEffort).toMatchObject({ state: 'unsupported' })
    expect(resolved.warnings).toEqual([
      expect.objectContaining({ code: 'unsupported_param', key: 'reasoningEffort' }),
    ])
  })

  it('warns but sends deprecated Gemini 3 sampling params', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: geminiGenerationProfile,
      modelId: 'gemini-3-pro-preview',
      layers: {
        conversation: { topP: { mode: 'custom', value: 0.85 } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.topP).toBe(0.85)
    expect(resolved.decisions.topP).toMatchObject({ state: 'deprecated' })
    expect(resolved.warnings).toEqual([
      expect.objectContaining({ code: 'deprecated_param', key: 'topP' }),
    ])
  })

  it('reports invalid values using provider capability ranges', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: openrouterGenerationProfile,
      layers: {
        conversation: { temperature: { mode: 'custom', value: 99 } },
      },
    })

    expect(resolved.requestParams.temperature).toBeUndefined()
    expect(resolved.decisions.temperature).toMatchObject({ state: 'rejected' })
    expect(resolved.errors).toEqual([
      expect.objectContaining({ code: 'invalid_value', key: 'temperature' }),
    ])
  })

  it('records rejected provider params as warnings without blocking send', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: anthropicGenerationProfile,
      modelId: 'claude-sonnet-5-20260601',
      layers: {
        conversation: { temperature: { mode: 'custom', value: 0.2 } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.temperature).toBe(0.2)
    expect(resolved.decisions.temperature).toMatchObject({ state: 'rejected', value: 0.2 })
    expect(resolved.warnings).toEqual([
      expect.objectContaining({ code: 'rejected_param', key: 'temperature' }),
    ])
  })

  it('records no-effect provider params as warnings without blocking send', () => {
    const resolved = resolveGenerationParamsFromLayers({
      profile: deepseekGenerationProfile,
      modelId: 'deepseek-v4-flash',
      layers: {
        conversation: { topP: { mode: 'custom', value: 0.8 } },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams.topP).toBe(0.8)
    expect(resolved.decisions.topP).toMatchObject({ state: 'noEffect', value: 0.8 })
    expect(resolved.warnings).toEqual([
      expect.objectContaining({ code: 'no_effect_param', key: 'topP' }),
    ])
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
