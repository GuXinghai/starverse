import { describe, expect, it } from 'vitest'
import {
  OpenRouterCatalogClient,
  mapOpenRouterModelToCatalogModel,
  mapOpenRouterProviderToCatalogProvider,
} from './openRouterCatalogClient'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('openRouterCatalogClient mapping', () => {
  it('maps model payload to internal schema and derives capabilities/tags', () => {
    const nowMs = Date.now()
    const model = mapOpenRouterModelToCatalogModel(
      {
        id: 'openai/gpt-4',
        canonical_slug: 'openai/gpt-4',
        name: 'GPT-4',
        created: '1700000000',
        context_length: 200000,
        supported_parameters: ['tools', 'response_format', 'reasoning'],
        architecture: {
          modality: 'text->text',
          input_modalities: ['image', 'text'],
          output_modalities: ['text'],
          tokenizer: 'cl100k_base',
          instruct_type: 'chatml',
        },
        top_provider: {
          is_moderated: true,
          context_length: 200000,
          max_completion_tokens: 4096,
        },
        per_request_limits: {
          max_input_tokens: 120000,
        },
        default_parameters: {
          temperature: 0.3,
        },
        pricing: {
          prompt: '0.00003',
          completion: '0.00006',
          request: '0',
          image: '0',
          web_search: '0.0009',
          internal_reasoning: '0.0011',
          input_cache_read: '0.000004',
          input_cache_write: '0.000008',
        },
        expiration_date: '2099-01-01T00:00:00.000Z',
      },
      {
        providerKey: 'openrouter',
        source: 'models_user',
        fetchedAtMs: nowMs,
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    )

    expect(model).toBeTruthy()
    expect(model).toMatchObject({
      modelKey: 'openrouter::openai/gpt-4',
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
      canonicalSlug: 'openai/gpt-4',
      displayName: 'GPT-4',
      architectureModality: 'text->text',
      inputModalities: ['image', 'text'],
      outputModalities: ['text'],
      tokenizer: 'cl100k_base',
      instructType: 'chatml',
      capabilities: {
        reasoning: true,
        tools: true,
        structuredOutputs: true,
        vision: true,
        longContext: true,
      },
      pricing: {
        prompt: '0.00003',
        completion: '0.00006',
        request: '0',
        image: '0',
        webSearch: '0.0009',
        internalReasoning: '0.0011',
        inputCacheRead: '0.000004',
        inputCacheWrite: '0.000008',
      },
      perRequestLimits: {
        max_input_tokens: 120000,
      },
      defaultParameters: {
        temperature: 0.3,
      },
      topProviderIsModerated: true,
      topProviderContextLength: 200000,
      createdAtSec: 1700000000,
      expirationDate: '2099-01-01T00:00:00.000Z',
    })
    expect(typeof model?.pricing?.prompt).toBe('string')
    expect(model?.tags.map((tag) => tag.key)).toEqual([
      'capability:long_context',
      'capability:reasoning',
      'capability:structured_outputs',
      'capability:tools',
      'capability:vision',
      'category:cheap_bucket:expensive',
    ])
    expect(model?.raw?.buckets?.[0]?.source).toBe('models_user')
  })

  it('tolerates missing architecture fields and normalizes empty tokenizer/instruct_type to null', () => {
    const model = mapOpenRouterModelToCatalogModel(
      {
        id: 'openai/minimal-safe',
        architecture: {
          tokenizer: '   ',
          instruct_type: '',
        },
        created: '1702000000',
      },
      {
        providerKey: 'openrouter',
        source: 'models',
        fetchedAtMs: 123,
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    )

    expect(model).toMatchObject({
      modelId: 'openai/minimal-safe',
      displayName: 'openai/minimal-safe',
      architectureModality: null,
      inputModalities: ['text'],
      outputModalities: ['text'],
      tokenizer: null,
      instructType: null,
      perRequestLimits: null,
      defaultParameters: null,
      createdAtSec: 1702000000,
    })
  })

  it('keeps mapping stable when optional fields are missing or malformed', () => {
    const model = mapOpenRouterModelToCatalogModel(
      {
        id: 'openai/edge-cases',
        created: 'not-a-number',
        expiration_date: 'not-a-date',
        supported_parameters: null,
        architecture: {
          modality: 'TEXT->TEXT',
          input_modalities: null,
          output_modalities: null,
          tokenizer: 1234,
          instruct_type: true,
        },
        top_provider: {
          is_moderated: null,
          context_length: 'not-numeric',
        },
        pricing: {
          prompt: null,
          completion: '',
        },
      },
      {
        providerKey: 'openrouter',
        source: 'models',
        fetchedAtMs: 321,
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    )

    expect(model).toMatchObject({
      modelId: 'openai/edge-cases',
      architectureModality: 'text->text',
      inputModalities: ['text'],
      outputModalities: ['text'],
      tokenizer: '1234',
      instructType: null,
      createdAtSec: null,
      expirationDate: 'not-a-date',
      supportedParameters: [],
      topProviderIsModerated: null,
      topProviderContextLength: null,
      perRequestLimits: null,
      defaultParameters: null,
      pricing: null,
    })
  })

  it('normalizes created values to unix seconds integers', () => {
    const fromFloat = mapOpenRouterModelToCatalogModel(
      {
        id: 'openai/created-float',
        created: 1702000003.987,
      },
      {
        providerKey: 'openrouter',
        source: 'models',
        fetchedAtMs: 777,
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    )

    const fromString = mapOpenRouterModelToCatalogModel(
      {
        id: 'openai/created-string',
        created: '1702000004.9',
      },
      {
        providerKey: 'openrouter',
        source: 'models',
        fetchedAtMs: 778,
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    )

    expect(fromFloat?.createdAtSec).toBe(1702000003)
    expect(fromString?.createdAtSec).toBe(1702000004)
  })

  it('maps provider payload and keeps raw envelope', () => {
    const provider = mapOpenRouterProviderToCatalogProvider(
      {
        name: 'OpenAI',
        slug: 'openai',
        privacy_policy_url: 'https://example.com/privacy',
      },
      {
        fetchedAtMs: 100,
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    )

    expect(provider).toMatchObject({
      providerKey: 'openai',
      displayName: 'OpenAI',
      slug: 'openai',
      privacyPolicyUrl: 'https://example.com/privacy',
    })
    expect(provider.raw?.buckets?.[0]?.source).toBe('providers')
  })
})

describe('OpenRouterCatalogClient', () => {
  it('falls back to /models when /models/user fails and tolerates missing fields', async () => {
    const calls: Array<{ url: string; headers: HeadersInit | undefined }> = []
    const fakeFetch = async (url: string, init?: RequestInit): Promise<Response> => {
      calls.push({ url, headers: init?.headers })
      if (url.endsWith('/models/user')) {
        return jsonResponse({ error: { code: 503, message: 'unavailable' } }, 503)
      }
      if (url.endsWith('/models')) {
        return jsonResponse({
          data: [
            { id: 'openai/minimal' },
            { name: 'missing-id' },
          ],
        })
      }
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }

    const client = new OpenRouterCatalogClient({ fetchImpl: fakeFetch as any })
    const result = await client.listModels({
      apiKey: 'sk-test',
      baseUrl: 'https://openrouter.ai/api/v1',
      preferUserScopedModels: true,
    })

    expect(calls.map((item) => item.url)).toEqual([
      'https://openrouter.ai/api/v1/models/user',
      'https://openrouter.ai/api/v1/models',
    ])
    expect(result.meta).toMatchObject({
      primarySource: 'models',
      usedFallback: true,
    })
    expect(result.models).toHaveLength(1)
    expect(result.models[0]).toMatchObject({
      modelId: 'openai/minimal',
      displayName: 'openai/minimal',
      providerKey: 'openrouter',
      inputModalities: ['text'],
      outputModalities: ['text'],
      tokenizer: null,
      instructType: null,
      perRequestLimits: null,
      defaultParameters: null,
    })

    const firstHeaders = calls[0].headers as Record<string, string>
    expect(String(firstHeaders.Authorization)).toBe('Bearer sk-test')
    expect(String(firstHeaders['HTTP-Referer'])).toBeTruthy()
    expect(String(firstHeaders['X-Title'])).toBeTruthy()
  })

  it('lists providers and count endpoint successfully', async () => {
    const fakeFetch = async (url: string): Promise<Response> => {
      if (url.endsWith('/providers')) {
        return jsonResponse({
          data: [
            { name: 'OpenAI', slug: 'openai' },
            { name: 'Anthropic', slug: 'anthropic' },
          ],
        })
      }
      if (url.endsWith('/models/count')) {
        return jsonResponse({
          data: { count: 88 },
        })
      }
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }

    const client = new OpenRouterCatalogClient({ fetchImpl: fakeFetch as any })
    const providers = await client.listProviders({
      apiKey: 'sk-test',
      baseUrl: 'https://openrouter.ai/api/v1',
    })
    const count = await client.listModelsCount({
      apiKey: 'sk-test',
      baseUrl: 'https://openrouter.ai/api/v1',
    })

    expect(providers.map((provider) => provider.providerKey)).toEqual(['openai', 'anthropic'])
    expect(count.count).toBe(88)
  })

  it('fetches model endpoints and maps endpoint metrics', async () => {
    const fakeFetch = async (url: string): Promise<Response> => {
      if (url.endsWith('/models/openai/gpt-4/endpoints')) {
        return jsonResponse({
          data: {
            endpoints: [
              {
                provider_name: 'OpenAI',
                tag: 'openai',
                quantization: 'fp16',
                context_length: 8192,
                max_completion_tokens: 4096,
                max_prompt_tokens: 8192,
                supported_parameters: ['temperature', 'tools'],
                uptime_last_30m: 99.5,
                supports_implicit_caching: true,
                latency_last_30m: { p50: 0.25, p90: 0.48 },
                throughput_last_30m: { p50: 45.2, p99: 15.1 },
                status: 0,
              },
            ],
          },
        })
      }
      return jsonResponse({ error: { code: 404, message: 'not found' } }, 404)
    }

    const client = new OpenRouterCatalogClient({ fetchImpl: fakeFetch as any })
    const endpoints = await client.getModelEndpoints({
      apiKey: 'sk-test',
      baseUrl: 'https://openrouter.ai/api/v1',
      modelId: 'openai/gpt-4',
      author: 'openai',
      slug: 'gpt-4',
    })

    expect(endpoints).toBeTruthy()
    expect(endpoints).toMatchObject({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
      author: 'openai',
      slug: 'gpt-4',
    })
    expect(endpoints?.endpoints).toHaveLength(1)
    expect(endpoints?.endpoints[0]).toMatchObject({
      providerName: 'OpenAI',
      tag: 'openai',
      quantization: 'fp16',
      contextLength: 8192,
      maxCompletionTokens: 4096,
      maxPromptTokens: 8192,
      supportedParameters: ['temperature', 'tools'],
      uptimeLast30m: 99.5,
      supportsImplicitCaching: true,
      latencyLast30m: { p50: 0.25, p90: 0.48 },
      throughputLast30m: { p50: 45.2, p99: 15.1 },
      status: 0,
    })
    expect(endpoints?.raw?.buckets?.[0]?.source).toBe('endpoints')
  })
})
