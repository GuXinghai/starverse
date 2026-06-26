import { describe, expect, it, vi } from 'vitest'
import {
  ANTHROPIC_MODELS_API_VERSION,
  getAnthropicCuratedModelAvailabilitySeeds,
  listAnthropicProviderModelAvailability,
  parseAnthropicModelsResponse,
  resolveAnthropicModelAvailabilityFromModelsPayload,
} from './anthropicModelSource'

const OBSERVED_AT_MS = Date.UTC(2026, 5, 25, 0, 0, 0)

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Anthropic Models API parser', () => {
  it('parses normal provider-reported model records', () => {
    const result = parseAnthropicModelsResponse({
      data: [
        {
          id: 'claude-sonnet-4-5',
          type: 'model',
          display_name: 'Claude Sonnet 4.5',
          created_at: '2026-01-15T00:00:00Z',
        },
      ],
      first_id: 'claude-sonnet-4-5',
      last_id: 'claude-sonnet-4-5',
      has_more: false,
    }, OBSERVED_AT_MS)

    expect(result).toMatchObject({ ok: true, warnings: [], hasMore: false, lastId: 'claude-sonnet-4-5' })
    expect(result.ok && result.models).toEqual([
      expect.objectContaining({
        providerKey: 'anthropic_messages',
        endpointId: 'anthropic-official',
        profileId: 'anthropic_messages_v1',
        nativeModelId: 'claude-sonnet-4-5',
        displayName: 'Claude Sonnet 4.5',
        createdAt: '2026-01-15T00:00:00Z',
        modelType: 'model',
        source: 'anthropic_models_api',
        confidence: 'provider_reported',
        observedAtMs: OBSERVED_AT_MS,
        capabilitySeed: expect.objectContaining({
          textChat: true,
          imageInput: 'unknown',
          thinking: 'unknown',
          toolUse: 'unknown',
        }),
      }),
    ])
  })

  it('returns a safe invalid response when data[] is missing', () => {
    expect(parseAnthropicModelsResponse({ object: 'list' }, OBSERVED_AT_MS)).toEqual({
      ok: false,
      code: 'invalid_response',
      message: 'Anthropic Models API response is missing data[].',
      warnings: [],
    })
  })

  it('drops invalid model ids and non-model records without throwing', () => {
    const result = parseAnthropicModelsResponse({
      data: [
        { id: 'claude-sonnet-4-5', type: 'model' },
        { id: '', type: 'model' },
        { id: '../secret', type: 'model' },
        { id: 'workspace', type: 'workspace' },
      ],
      has_more: false,
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    expect(result.ok && result.models.map((model) => model.nativeModelId)).toEqual(['claude-sonnet-4-5'])
    expect(result.ok && result.warnings).toEqual([
      'Dropped invalid Anthropic Models API item at index 1.',
      'Dropped invalid Anthropic Models API item at index 2.',
      'Dropped invalid Anthropic Models API item at index 3.',
    ])
  })

  it('omits invalid created_at with a warning', () => {
    const result = parseAnthropicModelsResponse({
      data: [
        { id: 'claude-sonnet-4-5', type: 'model', created_at: 'not-a-date' },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    const model = result.ok ? result.models[0] : null
    expect(model?.createdAt).toBeUndefined()
    expect(result.ok && result.warnings).toEqual([
      'Omitted invalid Anthropic created_at for claude-sonnet-4-5 at index 0.',
    ])
  })

  it('ignores extra fields safely', () => {
    const result = parseAnthropicModelsResponse({
      data: [
        {
          id: 'claude-sonnet-4-5',
          type: 'model',
          display_name: 'Claude Sonnet 4.5',
          api_key: 'sk-ant-provider-should-not-leak',
          nested: { Authorization: 'Bearer sk-ant-provider-should-not-leak' },
        },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('sk-ant-provider-should-not-leak')
    expect(JSON.stringify(result)).not.toContain('Authorization')
    expect(JSON.stringify(result)).not.toContain('Bearer')
  })

  it('accepts an empty model list', () => {
    expect(parseAnthropicModelsResponse({ data: [], has_more: false }, OBSERVED_AT_MS)).toEqual({
      ok: true,
      models: [],
      warnings: [],
      hasMore: false,
    })
  })

  it('maps provider-reported capability seed and token limits when present', () => {
    const result = parseAnthropicModelsResponse({
      data: [
        {
          id: 'claude-opus-4-1',
          type: 'model',
          max_input_tokens: 200000,
          max_tokens: 64000,
          capabilities: {
            vision: true,
            thinking: true,
            adaptive_thinking: true,
            tool_use: true,
            files: false,
            structured_output: false,
            citations: true,
            future_safe_key: true,
          },
        },
      ],
      has_more: false,
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    expect(result.ok && result.models[0]?.capabilitySeed).toEqual({
      textChat: true,
      imageInput: true,
      maxInputTokens: 200000,
      maxOutputTokens: 64000,
      thinking: 'supported',
      adaptiveThinking: true,
      toolUse: true,
      files: false,
      structuredOutput: false,
      citations: true,
      capabilitiesRawKeys: [
        'adaptive_thinking',
        'citations',
        'files',
        'future_safe_key',
        'structured_output',
        'thinking',
        'tool_use',
        'vision',
      ],
    })
  })
})

describe('Anthropic curated metadata seed', () => {
  it('distinguishes curated metadata from provider-reported availability', () => {
    const seeds = getAnthropicCuratedModelAvailabilitySeeds(OBSERVED_AT_MS)

    expect(seeds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nativeModelId: 'claude-sonnet-4-5',
        source: 'starverse_curated_metadata',
        confidence: 'curated',
        observedAtMs: OBSERVED_AT_MS,
        capabilitySeed: expect.objectContaining({
          textChat: true,
          imageInput: true,
          thinking: 'unknown',
          toolUse: 'unknown',
          files: 'unknown',
          structuredOutput: 'unknown',
        }),
      }),
    ]))
  })

  it('merges curated warnings without overriding provider-reported source confidence', () => {
    const result = resolveAnthropicModelAvailabilityFromModelsPayload({
      data: [
        { id: 'claude-sonnet-4-5', type: 'model', display_name: 'Provider Sonnet' },
      ],
      has_more: false,
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    const sonnet = result.ok ? result.models.find((model) => model.nativeModelId === 'claude-sonnet-4-5') : null
    expect(sonnet).toMatchObject({
      source: 'anthropic_models_api',
      confidence: 'provider_reported',
      displayName: 'Provider Sonnet',
      capabilitySeed: expect.objectContaining({
        textChat: true,
        imageInput: 'unknown',
      }),
    })
    expect(sonnet?.warnings.join('\n')).toContain('Starverse curated metadata is supplemental')
  })

  it('does not overclaim capabilities or add curated-only models for unknown provider-reported models', () => {
    const result = resolveAnthropicModelAvailabilityFromModelsPayload({
      data: [
        { id: 'claude-future-model', type: 'model' },
      ],
      has_more: false,
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    const unknown = result.ok ? result.models.find((model) => model.nativeModelId === 'claude-future-model') : null
    expect(unknown).toMatchObject({
      source: 'anthropic_models_api',
      confidence: 'provider_reported',
      nativeModelId: 'claude-future-model',
      capabilitySeed: expect.objectContaining({
        textChat: true,
        imageInput: 'unknown',
        thinking: 'unknown',
        toolUse: 'unknown',
        structuredOutput: 'unknown',
      }),
    })
    expect(result.ok && result.models.some((model) => model.nativeModelId === 'claude-sonnet-4-5')).toBe(false)
  })
})

describe('Anthropic Models API client pagination', () => {
  it('fetches /models with Anthropic headers and follows bounded pagination', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe('GET')
      expect(init?.redirect).toBe('error')
      expect((init?.headers as Record<string, string>)?.['x-api-key']).toBe('sk-ant-secret')
      expect((init?.headers as Record<string, string>)?.['anthropic-version']).toBe(ANTHROPIC_MODELS_API_VERSION)
      if (url === 'https://api.anthropic.com/v1/models?limit=100') {
        return jsonResponse({
          data: [{ id: 'claude-sonnet-4-5', type: 'model' }],
          last_id: 'claude-sonnet-4-5',
          has_more: true,
        })
      }
      expect(url).toBe('https://api.anthropic.com/v1/models?limit=100&after_id=claude-sonnet-4-5')
      return jsonResponse({
        data: [{ id: 'claude-opus-4-1', type: 'model' }],
        last_id: 'claude-opus-4-1',
        has_more: false,
      })
    }) as unknown as typeof fetch

    const result = await listAnthropicProviderModelAvailability({
      apiKey: 'sk-ant-secret',
      fetchImpl,
      observedAtMs: OBSERVED_AT_MS,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.ok).toBe(true)
    expect(result.ok && result.models.map((model) => model.nativeModelId)).toEqual([
      'claude-opus-4-1',
      'claude-sonnet-4-5',
    ])
    expect(JSON.stringify(result)).not.toContain('sk-ant-secret')
  })

  it('warns when pagination is truncated by the bounded R5 page limit', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      data: [{ id: 'claude-sonnet-4-5', type: 'model' }],
      last_id: 'claude-sonnet-4-5',
      has_more: true,
    })) as unknown as typeof fetch

    const result = await listAnthropicProviderModelAvailability({
      apiKey: 'sk-ant-secret',
      fetchImpl,
      observedAtMs: OBSERVED_AT_MS,
      maxPages: 1,
    })

    expect(result.ok).toBe(true)
    expect(result.ok && result.warnings).toContain('Anthropic models pagination was truncated after the bounded R5 page limit.')
  })

  it('redacts provider HTTP errors', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      error: {
        message: 'x-api-key sk-ant-secret failed',
      },
    }, 401)) as unknown as typeof fetch

    const result = await listAnthropicProviderModelAvailability({
      apiKey: 'sk-ant-secret',
      fetchImpl,
      observedAtMs: OBSERVED_AT_MS,
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'http_error',
      httpStatus: 401,
      message: 'Anthropic model source credential was rejected.',
    })
    expect(JSON.stringify(result)).not.toContain('sk-ant-secret')
    expect(JSON.stringify(result)).not.toContain('x-api-key')
  })
})
