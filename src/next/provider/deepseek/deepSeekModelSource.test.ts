import { describe, expect, it } from 'vitest'
import {
  DEEPSEEK_ALIAS_DEPRECATION_AT_ISO,
  getDeepSeekCuratedModelAvailabilitySeeds,
  parseDeepSeekModelsResponse,
  resolveDeepSeekModelAvailabilityFromModelsPayload,
} from './deepSeekModelSource'

const OBSERVED_AT_MS = Date.UTC(2026, 5, 21, 0, 0, 0)

describe('DeepSeek /models parser', () => {
  it('parses normal provider-reported model records', () => {
    const result = parseDeepSeekModelsResponse({
      object: 'list',
      data: [
        { id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' },
        { id: 'deepseek-v4-pro', object: 'model', owned_by: 'deepseek' },
      ],
    }, OBSERVED_AT_MS)

    expect(result).toMatchObject({ ok: true, warnings: [] })
    expect(result.ok && result.models).toEqual([
      expect.objectContaining({
        providerKey: 'deepseek',
        endpointId: 'deepseek-official',
        profileId: 'deepseek_official_openai_compat',
        nativeModelId: 'deepseek-v4-flash',
        ownedBy: 'deepseek',
        source: 'deepseek_models_api',
        confidence: 'provider_reported',
        observedAtMs: OBSERVED_AT_MS,
      }),
      expect.objectContaining({
        nativeModelId: 'deepseek-v4-pro',
        source: 'deepseek_models_api',
        confidence: 'provider_reported',
      }),
    ])
  })

  it('returns a safe invalid response when data[] is missing', () => {
    expect(parseDeepSeekModelsResponse({ object: 'list' }, OBSERVED_AT_MS)).toEqual({
      ok: false,
      code: 'invalid_response',
      message: 'DeepSeek /models response is missing data[].',
      warnings: [],
    })
  })

  it('drops invalid model ids without throwing', () => {
    const result = parseDeepSeekModelsResponse({
      object: 'list',
      data: [
        { id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' },
        { id: '', object: 'model', owned_by: 'deepseek' },
        { id: '../secret', object: 'model', owned_by: 'deepseek' },
        { id: 'deepseek-v4-pro', object: 'not_model', owned_by: 'deepseek' },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    expect(result.ok && result.models.map((model) => model.nativeModelId)).toEqual(['deepseek-v4-flash'])
    expect(result.ok && result.warnings).toEqual([
      'Dropped invalid DeepSeek /models item at index 1.',
      'Dropped invalid DeepSeek /models item at index 2.',
      'Dropped invalid DeepSeek /models item at index 3.',
    ])
  })

  it('ignores extra fields safely', () => {
    const result = parseDeepSeekModelsResponse({
      object: 'list',
      data: [
        {
          id: 'deepseek-v4-flash',
          object: 'model',
          owned_by: 'deepseek',
          api_key: 'sk-provider-should-not-leak',
          nested: { Authorization: 'Bearer sk-provider-should-not-leak' },
        },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('sk-provider-should-not-leak')
    expect(JSON.stringify(result)).not.toContain('Authorization')
  })

  it('accepts an empty model list', () => {
    const result = parseDeepSeekModelsResponse({ object: 'list', data: [] }, OBSERVED_AT_MS)

    expect(result).toEqual({
      ok: true,
      models: [],
      warnings: [],
    })
  })
})

describe('DeepSeek curated model metadata seed', () => {
  it('seeds deepseek-v4-flash pricing and capabilities from observed docs metadata', () => {
    const flash = getDeepSeekCuratedModelAvailabilitySeeds(OBSERVED_AT_MS)
      .find((model) => model.nativeModelId === 'deepseek-v4-flash')

    expect(flash).toMatchObject({
      source: 'deepseek_pricing_metadata',
      confidence: 'curated',
      displayName: 'DeepSeek V4 Flash',
      capabilitySeed: {
        textChat: true,
        thinkingMode: 'supported',
        contextLength: 1000000,
        maxOutputTokens: 384000,
        tools: true,
        jsonOutput: true,
      },
      pricingSeed: {
        inputCacheHitPer1MTokens: '0.0028',
        inputCacheMissPer1MTokens: '0.14',
        outputPer1MTokens: '0.28',
        currency: 'USD',
      },
    })
  })

  it('seeds deepseek-v4-pro pricing and capabilities from observed docs metadata', () => {
    const pro = getDeepSeekCuratedModelAvailabilitySeeds(OBSERVED_AT_MS)
      .find((model) => model.nativeModelId === 'deepseek-v4-pro')

    expect(pro).toMatchObject({
      source: 'deepseek_pricing_metadata',
      confidence: 'curated',
      displayName: 'DeepSeek V4 Pro',
      pricingSeed: {
        inputCacheHitPer1MTokens: '0.003625',
        inputCacheMissPer1MTokens: '0.435',
        outputPer1MTokens: '0.87',
        currency: 'USD',
      },
    })
  })

  it('keeps deepseek-chat as a deprecated compatibility alias warning', () => {
    const alias = getDeepSeekCuratedModelAvailabilitySeeds(OBSERVED_AT_MS)
      .find((model) => model.nativeModelId === 'deepseek-chat')

    expect(alias).toMatchObject({
      source: 'starverse_curated_metadata',
      confidence: 'curated',
      capabilitySeed: { thinkingMode: 'non_thinking_only' },
    })
    expect(alias?.warnings.join('\n')).toContain(`deepseek-chat is a deprecated compatibility alias until ${DEEPSEEK_ALIAS_DEPRECATION_AT_ISO}`)
  })

  it('keeps deepseek-reasoner as a deprecated compatibility alias warning', () => {
    const alias = getDeepSeekCuratedModelAvailabilitySeeds(OBSERVED_AT_MS)
      .find((model) => model.nativeModelId === 'deepseek-reasoner')

    expect(alias).toMatchObject({
      source: 'starverse_curated_metadata',
      confidence: 'curated',
      capabilitySeed: { thinkingMode: 'thinking_only' },
    })
    expect(alias?.warnings.join('\n')).toContain(`deepseek-reasoner is a deprecated compatibility alias until ${DEEPSEEK_ALIAS_DEPRECATION_AT_ISO}`)
  })

  it('merges provider availability with curated pricing metadata without changing source confidence', () => {
    const result = resolveDeepSeekModelAvailabilityFromModelsPayload({
      object: 'list',
      data: [
        { id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    const flash = result.ok ? result.models.find((model) => model.nativeModelId === 'deepseek-v4-flash') : null
    expect(flash).toMatchObject({
      source: 'deepseek_models_api',
      confidence: 'provider_reported',
      pricingSeed: { source: 'deepseek_pricing_metadata' },
    })
    expect(result.ok && result.models.some((model) => model.nativeModelId === 'deepseek-chat')).toBe(true)
  })
})
