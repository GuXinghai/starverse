import { describe, expect, it, vi } from 'vitest'
import {
  getOpenAICuratedModelAvailabilitySeeds,
  listOpenAIProviderModelAvailability,
  parseOpenAIModelsResponse,
  resolveOpenAIModelAvailabilityFromModelsPayload,
} from './openAIResponsesModelSource'

const OBSERVED_AT_MS = Date.UTC(2026, 5, 25, 0, 0, 0)

describe('OpenAI /models parser', () => {
  it('parses normal provider-reported model records', () => {
    const result = parseOpenAIModelsResponse({
      object: 'list',
      data: [
        { id: 'gpt-4.1-mini', object: 'model', created: 1745875200, owned_by: 'system' },
        { id: 'gpt-4.1', object: 'model', created: 1745875201, owned_by: 'system' },
      ],
    }, OBSERVED_AT_MS)

    expect(result).toMatchObject({ ok: true, warnings: [] })
    expect(result.ok && result.models).toEqual([
      expect.objectContaining({
        providerKey: 'openai_responses',
        endpointId: 'openai-responses-official',
        profileId: 'openai_responses_v1',
        nativeModelId: 'gpt-4.1-mini',
        createdAtSec: 1745875200,
        ownedBy: 'system',
        source: 'openai_models_api',
        confidence: 'provider_reported',
        observedAtMs: OBSERVED_AT_MS,
      }),
      expect.objectContaining({
        nativeModelId: 'gpt-4.1',
        createdAtSec: 1745875201,
        source: 'openai_models_api',
        confidence: 'provider_reported',
      }),
    ])
  })

  it('returns a safe invalid response when data[] is missing', () => {
    expect(parseOpenAIModelsResponse({ object: 'list' }, OBSERVED_AT_MS)).toEqual({
      ok: false,
      code: 'invalid_response',
      message: 'OpenAI /models response is missing data[].',
      warnings: [],
    })
  })

  it('drops invalid model ids without throwing', () => {
    const result = parseOpenAIModelsResponse({
      object: 'list',
      data: [
        { id: 'gpt-4.1-mini', object: 'model', created: 1745875200, owned_by: 'system' },
        { id: '', object: 'model', created: 1745875200, owned_by: 'system' },
        { id: '../secret', object: 'model', created: 1745875200, owned_by: 'system' },
        { id: 'gpt-4.1', object: 'not_model', created: 1745875201, owned_by: 'system' },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    expect(result.ok && result.models.map((model) => model.nativeModelId)).toEqual(['gpt-4.1-mini'])
    expect(result.ok && result.warnings).toEqual([
      'Dropped invalid OpenAI /models item at index 1.',
      'Dropped invalid OpenAI /models item at index 2.',
      'Dropped invalid OpenAI /models item at index 3.',
    ])
  })

  it('ignores extra fields safely', () => {
    const result = parseOpenAIModelsResponse({
      object: 'list',
      data: [
        {
          id: 'gpt-4.1-mini',
          object: 'model',
          created: 1745875200,
          owned_by: 'system',
          api_key: 'sk-provider-should-not-leak',
          nested: { Authorization: 'Bearer sk-provider-should-not-leak' },
        },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    expect(JSON.stringify(result)).not.toContain('sk-provider-should-not-leak')
    expect(JSON.stringify(result)).not.toContain('Authorization')
    expect(JSON.stringify(result)).not.toContain('Bearer')
  })

  it('accepts an empty model list', () => {
    const result = parseOpenAIModelsResponse({ object: 'list', data: [] }, OBSERVED_AT_MS)

    expect(result).toEqual({
      ok: true,
      models: [],
      warnings: [],
    })
  })
})

describe('OpenAI curated metadata seed', () => {
  it('distinguishes curated metadata from provider-reported availability', () => {
    const seeds = getOpenAICuratedModelAvailabilitySeeds(OBSERVED_AT_MS)

    expect(seeds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        nativeModelId: 'gpt-4.1-mini',
        source: 'starverse_curated_metadata',
        confidence: 'curated',
        observedAtMs: OBSERVED_AT_MS,
        capabilitySeed: {
          textChat: true,
          responsesApi: true,
          reasoning: 'unsupported',
          imageInput: 'unknown',
          fileInput: 'unknown',
          functionCalling: 'unknown',
          hostedTools: 'unknown',
          structuredOutput: 'unknown',
          audioInput: 'unknown',
        },
      }),
    ]))
  })

  it('merges curated warnings without overriding provider-reported source confidence', () => {
    const result = resolveOpenAIModelAvailabilityFromModelsPayload({
      object: 'list',
      data: [
        { id: 'gpt-4.1-mini', object: 'model', created: 1745875200, owned_by: 'system' },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    const mini = result.ok ? result.models.find((model) => model.nativeModelId === 'gpt-4.1-mini') : null
    expect(mini).toMatchObject({
      source: 'openai_models_api',
      confidence: 'provider_reported',
      ownedBy: 'system',
      capabilitySeed: {
        textChat: true,
        responsesApi: true,
        reasoning: 'unsupported',
      },
    })
    expect(mini?.warnings.join('\n')).toContain('/models reports availability/basic ownership')
  })

  it('seeds provider-reported reasoning-capable models from the OpenAI Responses policy', () => {
    const result = resolveOpenAIModelAvailabilityFromModelsPayload({
      object: 'list',
      data: [
        { id: 'gpt-5.4-nano', object: 'model', created: 1745875200, owned_by: 'system' },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    const nano = result.ok ? result.models.find((model) => model.nativeModelId === 'gpt-5.4-nano') : null
    expect(nano).toMatchObject({
      capabilitySeed: {
        textChat: true,
        responsesApi: true,
        reasoning: 'supported',
        reasoningEffort: ['none', 'low', 'medium', 'high', 'xhigh'],
      },
    })
  })

  it('does not overclaim capabilities for unknown provider-reported models', () => {
    const result = resolveOpenAIModelAvailabilityFromModelsPayload({
      object: 'list',
      data: [
        { id: 'unknown-openai-model', object: 'model', created: 1745875200, owned_by: 'system' },
      ],
    }, OBSERVED_AT_MS)

    expect(result.ok).toBe(true)
    const unknown = result.ok ? result.models.find((model) => model.nativeModelId === 'unknown-openai-model') : null
    expect(unknown).toMatchObject({
      source: 'openai_models_api',
      confidence: 'provider_reported',
      nativeModelId: 'unknown-openai-model',
    })
    expect(unknown?.capabilitySeed).toBeUndefined()
    expect(result.ok && result.models.some((model) => model.nativeModelId === 'gpt-4.1-mini')).toBe(false)
  })
})

describe('OpenAI model availability network errors', () => {
  it.each([
    [401, 'OpenAI Responses model source credential was rejected.', 'http_401_auth'],
    [403, 'OpenAI Responses model source access was forbidden.', 'http_403_forbidden'],
    [404, 'OpenAI Responses model source endpoint or model list was not found.', 'http_404_not_found_or_model_missing'],
    [429, 'OpenAI Responses model source rate limit was reached.', 'http_429_rate_limited'],
  ] as const)('surfaces HTTP %s without generic fallback', async (status, message, safeDetailCode) => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: { message: 'redacted' } }), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch

    const result = await listOpenAIProviderModelAvailability({
      apiKey: 'sk-provider-should-not-leak',
      fetchImpl,
      observedAtMs: OBSERVED_AT_MS,
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'http_error',
      httpStatus: status,
      message,
      networkError: {
        safeDetailCode,
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-provider-should-not-leak')
  })
})
