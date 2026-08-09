import { describe, expect, it } from 'vitest'
import { parseDeepSeekModelsResponse, resolveDeepSeekModelAvailabilityFromModelsPayload } from './deepSeekModelSource'

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

describe('DeepSeek catalog authority', () => {
  it('publishes only provider-reported models without curated aliases', () => {
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
      observation: expect.objectContaining({ rawProviderRecord: expect.objectContaining({ id: 'deepseek-v4-flash' }) }),
    })
    expect(result.ok ? result.sourceDocuments.map((entry) => entry.source) : []).toEqual([
      'deepseek_list_models_api_docs',
      'deepseek_models_pricing_docs',
      'deepseek_api_intro_docs',
      'deepseek_thinking_mode_docs',
      'deepseek_tool_calls_docs',
      'deepseek_json_output_docs',
    ])
    expect(result.ok && result.models.some((model) => model.nativeModelId === 'deepseek-chat')).toBe(false)
  })
})
