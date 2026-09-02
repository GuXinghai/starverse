import { describe, expect, it, vi } from 'vitest'
import {
  ANTHROPIC_MODELS_API_VERSION,
  listAnthropicProviderModelAvailability,
  parseAnthropicModelsResponse,
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
        observation: expect.objectContaining({
          rawProviderRecord: expect.objectContaining({ id: 'claude-sonnet-4-5' }),
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

  it('preserves provider-reported capability fields without projecting a seed', () => {
    const result = parseAnthropicModelsResponse({
      data: [
        {
          id: 'claude-opus-4-1',
          type: 'model',
          max_input_tokens: 200000,
          max_tokens: 64000,
          capabilities: {
            image_input: { supported: true },
            thinking: { supported: true },
            adaptive_thinking: true,
            tool_use: true,
            files: false,
            structured_outputs: { supported: false },
            citations: true,
            future_safe_key: true,
          },
        },
      ],
      has_more: false,
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    expect(result.ok && result.models[0]?.observation).toMatchObject({
      rawProviderRecord: expect.objectContaining({ max_input_tokens: 200000, max_tokens: 64000 }),
      facts: {
        reasoning: expect.objectContaining({ presence: 'present', value: true }),
        tools: expect.objectContaining({ presence: 'present', value: true }),
        structuredOutputs: expect.objectContaining({ presence: 'present', value: false }),
        vision: expect.objectContaining({ presence: 'present', value: true }),
      },
    })
    expect(result.ok && result.models[0]?.providerSpecific?.capabilitiesRawKeys).toEqual([
        'adaptive_thinking',
        'citations',
        'files',
        'future_safe_key',
        'image_input',
        'structured_outputs',
        'thinking',
        'tool_use',
      ])
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
    expect(result.ok && result.rawSourcePayloads).toEqual([
      {
        data: [{ id: 'claude-sonnet-4-5', type: 'model' }],
        last_id: 'claude-sonnet-4-5',
        has_more: true,
      },
      {
        data: [{ id: 'claude-opus-4-1', type: 'model' }],
        last_id: 'claude-opus-4-1',
        has_more: false,
      },
    ])
    expect(JSON.stringify(result)).not.toContain('sk-ant-secret')
  })

  it('fails explicitly when pagination is truncated by the bounded page limit', async () => {
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

    expect(result).toMatchObject({
      ok: false,
      code: 'pagination_incomplete',
      pagesFetched: 1,
      nextPageCursor: 'claude-sonnet-4-5',
    })
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
      providerFailure: {
        origin: 'http_response',
        phase: 'response_headers',
        httpStatus: 401,
        providerError: {
          message: 'x-api-key [redacted] failed',
          rawJson: { error: { message: 'x-api-key [redacted] failed' } },
        },
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-ant-secret')
  })
})
