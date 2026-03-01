import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogQueryService } from './catalogQueryService'
import { __resetOpenRouterCategoryCacheForTests } from './openRouterCategoryCache'

describe('CatalogQueryService.query', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronStore = (globalThis as any).electronStore
  const originalFetch = (globalThis as any).fetch

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).fetch = originalFetch
    __resetOpenRouterCategoryCacheForTests()
    vi.restoreAllMocks()
  })

  it('returns empty result when dbBridge is not available', async () => {
    ;(globalThis as any).dbBridge = undefined
    const result = await CatalogQueryService.query({
      searchText: 'vision',
    })
    expect(result).toEqual({
      items: [],
      nextCursor: null,
      notice: null,
    })
  })

  it('invokes modelCatalog.queryCore with normalized payload and decodes items', async () => {
    const invoke = vi.fn(async () => ({
      items: [
        {
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
          modelKey: 'openrouter::openai/gpt-4o',
          canonicalSlug: 'openai/gpt-4o',
          displayName: 'GPT-4o',
          description: 'omni model',
          vendor: 'openai',
          contextLength: 128000,
          createdAtSec: 1700000123,
          pricePrompt: '0.000005',
          priceCompletion: '0.000015',
          priceRequest: '0',
          priceImage: '0.00001',
          capReasoning: 1,
          capTools: 1,
          capStructuredOutputs: 1,
          capVision: 1,
          capLongContext: 1,
        },
      ],
      nextCursor: {
        sortBy: 'name',
        sortOrder: 'asc',
        name: 'GPT-4o',
        modelKey: 'openrouter::openai/gpt-4o',
      },
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await CatalogQueryService.query({
      providerKey: 'openrouter',
      searchText: 'gpt omni',
      filter: {
        vendors: ['openai', 'openai', ''],
        tags: ['capability:vision'],
        contextBuckets: ['xlarge'],
        priceBuckets: ['cheap'],
      },
      sort: {
        by: 'name',
        order: 'asc',
      },
      page: {
        limit: 25,
      },
    })

    expect(invoke).toHaveBeenCalledTimes(1)
    expect(invoke).toHaveBeenCalledWith(
      'modelCatalog.queryCore',
      expect.objectContaining({
        providerKey: 'openrouter',
        searchText: 'gpt omni',
        vendors: ['openai'],
        tags: ['capability:vision'],
        contextBuckets: ['xlarge'],
        priceBuckets: ['cheap'],
        sortBy: 'name',
        sortOrder: 'asc',
        limit: 25,
        cursor: null,
      })
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toMatchObject({
      modelId: 'openai/gpt-4o',
      displayName: 'GPT-4o',
      vendor: 'openai',
      capabilities: {
        reasoning: true,
        tools: true,
        structuredOutputs: true,
        vision: true,
        longContext: true,
      },
      pricing: {
        prompt: '0.000005',
      },
    })
    expect(result.nextCursor).toMatchObject({
      modelKey: 'openrouter::openai/gpt-4o',
      sortBy: 'name',
      sortOrder: 'asc',
    })
  })

  it('maps deprecated providers filter to vendors payload', async () => {
    const invoke = vi.fn(async () => ({ items: [], nextCursor: null }))
    ;(globalThis as any).dbBridge = { invoke }

    await CatalogQueryService.query({
      filter: {
        providers: ['openai', 'anthropic'],
      },
    })

    expect(invoke).toHaveBeenCalledWith(
      'modelCatalog.queryCore',
      expect.objectContaining({
        vendors: ['openai', 'anthropic'],
      })
    )
  })

  it('forwards extended model-level filters to queryCore payload', async () => {
    const invoke = vi.fn(async () => ({ items: [], nextCursor: null }))
    ;(globalThis as any).dbBridge = { invoke }

    await CatalogQueryService.query({
      filter: {
        contextLength: { min: 8192, max: 200000 },
        maxOutputTokens: { min: 1024, max: 8192 },
        expiringWithinDays: 7,
        hasPerRequestLimits: true,
        hasDefaultParameters: true,
        topProviderIsModerated: true,
        architectureModalities: ['text->text'],
        tokenizers: ['cl100k_base'],
        instructTypes: ['chatml'],
        modalities: ['image'],
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        supportedParameters: ['reasoning', 'tools'],
      },
    })

    expect(invoke).toHaveBeenCalledWith(
      'modelCatalog.queryCore',
      expect.objectContaining({
        contextLength: { min: 8192, max: 200000 },
        maxOutputTokens: { min: 1024, max: 8192 },
        expiringWithinDays: 7,
        hasPerRequestLimits: true,
        hasDefaultParameters: true,
        topProviderIsModerated: true,
        architectureModalities: ['text->text'],
        tokenizers: ['cl100k_base'],
        instructTypes: ['chatml'],
        modalities: ['image'],
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        supportedParameters: ['reasoning', 'tools'],
      })
    )
  })

  it('supports context_length and max_output_tokens sort fields with cursor normalization', async () => {
    const invoke = vi.fn(async () => ({ items: [], nextCursor: null }))
    ;(globalThis as any).dbBridge = { invoke }

    await CatalogQueryService.query({
      sort: {
        by: 'context_length',
        order: 'desc',
      },
      page: {
        limit: 20,
        cursor: {
          sortBy: 'context_length',
          sortOrder: 'desc',
          contextLength: 8192,
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
        } as any,
      },
    })

    expect(invoke).toHaveBeenCalledWith(
      'modelCatalog.queryCore',
      expect.objectContaining({
        sortBy: 'context_length',
        sortOrder: 'desc',
        cursor: expect.objectContaining({
          modelKey: 'openrouter::openai/gpt-4o',
          contextLength: 8192,
        }),
      })
    )

    await CatalogQueryService.query({
      sort: {
        by: 'max_output_tokens',
        order: 'asc',
      },
    })

    expect(invoke).toHaveBeenLastCalledWith(
      'modelCatalog.queryCore',
      expect.objectContaining({
        sortBy: 'max_output_tokens',
        sortOrder: 'asc',
      })
    )
  })

  it('prefers sourceProviderKey and maps it to queryCore.providerKey', async () => {
    const invoke = vi.fn(async () => ({ items: [], nextCursor: null }))
    ;(globalThis as any).dbBridge = { invoke }

    await CatalogQueryService.query({
      sourceProviderKey: 'openai-direct',
      providerKey: 'openrouter',
    })

    expect(invoke).toHaveBeenCalledWith(
      'modelCatalog.queryCore',
      expect.objectContaining({
        providerKey: 'openai-direct',
      })
    )
  })

  it('accepts legacy cursor (providerKey + modelId) and normalizes to modelKey', async () => {
    const invoke = vi.fn(async () => ({ items: [], nextCursor: null }))
    ;(globalThis as any).dbBridge = { invoke }

    await CatalogQueryService.query({
      page: {
        limit: 10,
        cursor: {
          sortBy: 'name',
          sortOrder: 'asc',
          name: 'GPT-4o',
          providerKey: 'openrouter',
          modelId: 'openai/gpt-4o',
        } as any,
      },
    })

    expect(invoke).toHaveBeenCalledWith(
      'modelCatalog.queryCore',
      expect.objectContaining({
        cursor: expect.objectContaining({
          modelKey: 'openrouter::openai/gpt-4o',
        }),
      })
    )
  })

  it('drops malformed rows and malformed cursor safely', async () => {
    const invoke = vi.fn(async () => ({
      items: [
        { modelId: 'missing-required-fields' },
        {
          providerKey: 'openrouter',
          modelId: 'anthropic/claude-3',
          modelKey: 'openrouter::anthropic/claude-3',
          displayName: 'Claude 3',
          capReasoning: 0,
          capTools: 0,
          capStructuredOutputs: 0,
          capVision: 0,
          capLongContext: 0,
        },
      ],
      nextCursor: {
        providerKey: '',
        modelId: '',
      },
    }))
    ;(globalThis as any).dbBridge = { invoke }

    const result = await CatalogQueryService.query({
      page: {
        limit: -5,
      },
    })

    expect(invoke).toHaveBeenCalledWith(
      'modelCatalog.queryCore',
      expect.objectContaining({
        limit: 1,
      })
    )
    expect(result.items).toHaveLength(1)
    expect(result.items[0].modelId).toBe('anthropic/claude-3')
    expect(result.nextCursor).toBeNull()
  })

  it('applies category membership filter with first fetch then cache hit', async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === 'modelCatalog.getCoreMeta') {
        return { baseUrl: 'https://eu.openrouter.ai/api/v1' }
      }
      if (method === 'modelCatalog.queryCore') {
        return {
          items: [
            {
              providerKey: 'openrouter',
              modelId: 'openai/gpt-4o',
              modelKey: 'openrouter::openai/gpt-4o',
              displayName: 'GPT-4o',
              capReasoning: 1,
              capTools: 1,
              capStructuredOutputs: 1,
              capVision: 1,
              capLongContext: 1,
            },
          ],
          nextCursor: null,
        }
      }
      return null
    })
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [{ id: 'openai/gpt-4o' }, { id: 'anthropic/claude-3' }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    })
    ;(globalThis as any).dbBridge = { invoke }
    ;(globalThis as any).fetch = fetchImpl
    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'sk-test'
        if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
        return null
      }),
    }

    const first = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      filter: {
        category: 'programming',
      },
    })
    const second = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      filter: {
        category: 'programming',
      },
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0] ?? '')).toContain(
      'https://eu.openrouter.ai/api/v1/models?category=programming'
    )
    expect(invoke.mock.calls.filter((call) => call[0] === 'modelCatalog.queryCore')).toHaveLength(2)
    expect(invoke).toHaveBeenNthCalledWith(
      2,
      'modelCatalog.queryCore',
      expect.objectContaining({
        providerKey: 'openrouter',
        modelIds: ['openai/gpt-4o', 'anthropic/claude-3'],
      })
    )
    expect(invoke).toHaveBeenNthCalledWith(
      4,
      'modelCatalog.queryCore',
      expect.objectContaining({
        providerKey: 'openrouter',
        modelIds: ['openai/gpt-4o', 'anthropic/claude-3'],
      })
    )
    expect(first.notice).toBeNull()
    expect(second.notice).toBeNull()
  })

  it('returns explainable notice when category membership exists but local query result is empty', async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === 'modelCatalog.getCoreMeta') {
        return { baseUrl: 'https://openrouter.ai/api/v1' }
      }
      if (method === 'modelCatalog.queryCore') {
        return { items: [], nextCursor: null }
      }
      return null
    })
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [{ id: 'openai/gpt-4o' }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    })
    ;(globalThis as any).dbBridge = { invoke }
    ;(globalThis as any).fetch = fetchImpl
    ;(globalThis as any).electronStore = {
      get: vi.fn(async () => null),
    }

    const result = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      filter: {
        category: 'science',
      },
    })

    expect(result.items).toHaveLength(0)
    expect(String(result.notice ?? '')).toContain('No models matched category "science"')
  })

  it('returns explainable notice when category filter is unresolved offline', async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === 'modelCatalog.getCoreMeta') {
        return { baseUrl: 'https://openrouter.ai/api/v1' }
      }
      if (method === 'modelCatalog.queryCore') {
        return { items: [], nextCursor: null }
      }
      return null
    })
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline')
    })
    ;(globalThis as any).dbBridge = { invoke }
    ;(globalThis as any).fetch = fetchImpl
    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'openRouterApiKey') return 'sk-test'
        if (key === 'openRouterBaseUrl') return 'https://openrouter.ai/api/v1'
        return null
      }),
    }

    const result = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      filter: {
        category: 'programming',
      },
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(invoke.mock.calls.filter((call) => call[0] === 'modelCatalog.queryCore')).toHaveLength(0)
    expect(result).toEqual({
      items: [],
      nextCursor: null,
      notice: 'Category filter requires online refresh. Please reconnect and retry.',
    })
  })

  it('downgrades legacy categories array to single category and returns compatibility notice', async () => {
    const invoke = vi.fn(async (method: string) => {
      if (method === 'modelCatalog.getCoreMeta') {
        return { baseUrl: 'https://openrouter.ai/api/v1' }
      }
      if (method === 'modelCatalog.queryCore') {
        return { items: [], nextCursor: null }
      }
      return null
    })
    const fetchImpl = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          data: [{ id: 'openai/first-only' }],
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }
      )
    })
    ;(globalThis as any).dbBridge = { invoke }
    ;(globalThis as any).fetch = fetchImpl
    ;(globalThis as any).electronStore = {
      get: vi.fn(async () => null),
    }

    const result = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      filter: {
        categories: ['programming', 'science'],
      },
    })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0] ?? '')).toContain('category=programming')
    expect(invoke).toHaveBeenCalledWith(
      'modelCatalog.queryCore',
      expect.objectContaining({
        providerKey: 'openrouter',
        modelIds: ['openai/first-only'],
      })
    )
    expect(String(result.notice ?? '')).toContain('single-select')
  })
})
