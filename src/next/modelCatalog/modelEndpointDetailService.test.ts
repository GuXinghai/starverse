import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetModelEndpointDetailCacheForTests,
  buildEndpointKey,
  getModelEndpointDetails,
} from './modelEndpointDetailService'

type EndpointMetaRow = {
  providerKey: string
  baseUrl: string
  modelId: string
  endpointKey: string
  providerName: string | null
  tag: string | null
  quantization: string | null
  contextLength: number | null
  maxCompletionTokens: number | null
  maxPromptTokens: number | null
  supportedParametersJson: string | null
  supportsImplicitCaching: 0 | 1 | null
  rawJson: string | null
  fetchedAtMs: number
}

const originalDbBridge = (globalThis as any).dbBridge
const originalElectronStore = (globalThis as any).electronStore
const originalFetch = globalThis.fetch

describe('modelEndpointDetailService', () => {
  let diskRows: EndpointMetaRow[] = []
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    diskRows = []
    __resetModelEndpointDetailCacheForTests()
    fetchMock = vi.fn(async (url: string) => {
      if (!String(url).endsWith('/models/openai/gpt-4/endpoints')) {
        return new Response(JSON.stringify({ error: { code: 404, message: 'not found' } }), { status: 404 })
      }
      return new Response(
        JSON.stringify({
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
                latency_last_30m: { p50: 0.25 },
                throughput_last_30m: { p50: 45.2 },
                status: 0,
              },
            ],
          },
        }),
        { status: 200 },
      )
    })
    ;(globalThis as any).fetch = fetchMock

    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'sk-test'
        if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
        return null
      }),
    }

    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string, params: any) => {
        if (method === 'modelCatalog.getCoreMeta') {
          return {
            providerKey: 'openrouter',
            baseUrl: 'https://openrouter.ai/api/v1',
          }
        }
        if (method === 'modelCatalog.listEndpointMeta') {
          return diskRows.filter(
            (row) =>
              row.providerKey === String(params?.providerKey) &&
              row.baseUrl === String(params?.baseUrl) &&
              row.modelId === String(params?.modelId),
          )
        }
        if (method === 'modelCatalog.replaceEndpointMeta') {
          const providerKey = String(params?.providerKey ?? '')
          const baseUrl = String(params?.baseUrl ?? '')
          const modelId = String(params?.modelId ?? '')
          const fetchedAtMs = Number(params?.fetchedAtMs ?? 0)
          const endpoints = Array.isArray(params?.endpoints) ? params.endpoints : []
          diskRows = endpoints.map((row: any) => ({
            providerKey,
            baseUrl,
            modelId,
            endpointKey: String(row.endpointKey ?? ''),
            providerName: typeof row.providerName === 'string' ? row.providerName : null,
            tag: typeof row.tag === 'string' ? row.tag : null,
            quantization: typeof row.quantization === 'string' ? row.quantization : null,
            contextLength:
              typeof row.contextLength === 'number' && Number.isFinite(row.contextLength)
                ? row.contextLength
                : null,
            maxCompletionTokens:
              typeof row.maxCompletionTokens === 'number' && Number.isFinite(row.maxCompletionTokens)
                ? row.maxCompletionTokens
                : null,
            maxPromptTokens:
              typeof row.maxPromptTokens === 'number' && Number.isFinite(row.maxPromptTokens)
                ? row.maxPromptTokens
                : null,
            supportedParametersJson: typeof row.supportedParametersJson === 'string' ? row.supportedParametersJson : null,
            supportsImplicitCaching:
              row.supportsImplicitCaching === 0 || row.supportsImplicitCaching === 1 ? row.supportsImplicitCaching : null,
            rawJson: typeof row.rawJson === 'string' ? row.rawJson : null,
            fetchedAtMs,
          }))
          return { ok: true }
        }
        return null
      }),
    }
  })

  afterEach(() => {
    __resetModelEndpointDetailCacheForTests()
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('fetches endpoint details on first view and reuses cache on subsequent views', async () => {
    const first = await getModelEndpointDetails({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
    })
    const second = await getModelEndpointDetails({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
    })

    expect(first.source).toBe('network')
    expect(first.error).toBeNull()
    expect(first.items).toHaveLength(1)
    expect(first.items[0]).toMatchObject({
      endpointKey: buildEndpointKey('openai/gpt-4', {
        tag: 'openai',
        quantization: 'fp16',
        providerName: 'OpenAI',
      }),
      providerName: 'OpenAI',
      supportsImplicitCaching: true,
      supportedParameters: ['temperature', 'tools'],
      contextLength: 8192,
      status: 0,
      uptimeLast30m: 99.5,
    })

    expect(second.source).toBe('cache')
    expect(second.items).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('forces refresh only when requested manually', async () => {
    await getModelEndpointDetails({ providerKey: 'openrouter', modelId: 'openai/gpt-4' })
    await getModelEndpointDetails({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
      forceRefresh: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back to disk cache when refresh fails', async () => {
    const endpointKey = buildEndpointKey('openai/gpt-4', {
      tag: 'openai',
      quantization: 'fp16',
      providerName: 'OpenAI',
    })
    diskRows = [
      {
        providerKey: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        modelId: 'openai/gpt-4',
        endpointKey,
        providerName: 'OpenAI',
        tag: 'openai',
        quantization: 'fp16',
        contextLength: 8192,
        maxCompletionTokens: 4096,
        maxPromptTokens: 8192,
        supportedParametersJson: '["temperature"]',
        supportsImplicitCaching: 1,
        rawJson: '{"provider_name":"OpenAI"}',
        fetchedAtMs: Date.now(),
      },
    ]
    fetchMock.mockImplementation(async () =>
      new Response(JSON.stringify({ error: { code: 503, message: 'unavailable' } }), { status: 503 }),
    )

    const result = await getModelEndpointDetails({
      providerKey: 'openrouter',
      modelId: 'openai/gpt-4',
      forceRefresh: true,
    })

    expect(result.source).toBe('cache')
    expect(result.items).toHaveLength(1)
    expect(result.error).toContain('unavailable')
  })
})
