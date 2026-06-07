import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogQueryService } from './catalogQueryService'

describe('CatalogQueryService.query', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronAPI = (globalThis as any).electronAPI
  const originalElectronStore = (globalThis as any).electronStore
  const originalFetch = (globalThis as any).fetch

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronAPI = originalElectronAPI
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('returns empty result when scoped query IPC is not available', async () => {
    ;(globalThis as any).electronAPI = undefined
    const result = await CatalogQueryService.query({
      searchText: 'vision',
    })
    expect(result).toEqual({
      items: [],
      nextCursor: null,
      notice: null,
    })
  })

  it('invokes scoped current query IPC with normalized payload and decodes items', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      providerKey: 'openrouter',
      status: 'synced',
      syncState: 'ok',
      failureReasonCode: null,
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
          maxOutputTokens: 8192,
          createdAtSec: 1700000123,
          pricing: {
            prompt: '0.000005',
            completion: '0.000015',
            request: '0',
            image: '0.00001',
          },
          capabilities: {
            reasoning: true,
            tools: true,
            structuredOutputs: true,
            vision: true,
            longContext: true,
          },
        },
      ],
      nextCursor: {
        sortBy: 'name',
        sortOrder: 'asc',
        name: 'GPT-4o',
        modelKey: 'openrouter::openai/gpt-4o',
      },
      catalogRevision: 'checksum-a',
      modelCount: 1,
      lastSyncAtMs: 123,
    }))
    ;(globalThis as any).electronAPI = { modelCatalogQueryScopedCurrent }
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async () => {
        throw new Error('legacy query should not be called')
      }),
    }

    const result = await CatalogQueryService.query({
      providerKey: 'openrouter',
      searchText: 'gpt omni',
      includeDescriptionInSearch: true,
      filter: {
        vendors: ['openai', 'openai', ''],
        contextLength: { min: 8192, max: 200000 },
        maxOutputTokens: { min: 1024, max: 8192 },
        modalities: ['image'],
        inputModalities: ['text', 'image'],
        outputModalities: ['text'],
        supportedParameters: ['reasoning', 'tools'],
      },
      sort: {
        by: 'name',
        order: 'asc',
      },
      page: {
        limit: 25,
      },
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledTimes(1)
    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'openrouter',
      searchText: 'gpt omni',
      includeDescriptionInSearch: true,
      vendors: ['openai'],
      contextLength: { min: 8192, max: 200000 },
      maxOutputTokens: { min: 1024, max: 8192 },
      modalities: ['image'],
      inputModalities: ['text', 'image'],
      outputModalities: ['text'],
      supportedParameters: ['reasoning', 'tools'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 25,
      cursor: null,
    }))
    expect((globalThis as any).dbBridge.invoke).not.toHaveBeenCalled()
    expect(JSON.stringify(modelCatalogQueryScopedCurrent.mock.calls)).not.toContain('sk-')
    expect(JSON.stringify(modelCatalogQueryScopedCurrent.mock.calls)).not.toContain('catalogScopeKey')
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
    expect(result).toMatchObject({
      status: 'synced',
      catalogRevision: 'checksum-a',
      modelCount: 1,
      lastSyncAtMs: 123,
    })
  })

  it('maps deprecated providers filter to scoped vendors payload', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      items: [],
      nextCursor: null,
      status: 'synced',
    }))
    ;(globalThis as any).electronAPI = { modelCatalogQueryScopedCurrent }

    await CatalogQueryService.query({
      filter: {
        providers: ['openai', 'anthropic'],
      },
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith(expect.objectContaining({
      vendors: ['openai', 'anthropic'],
    }))
  })

  it('supports context_length and max_output_tokens sort fields with cursor normalization', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      items: [],
      nextCursor: null,
      status: 'synced',
    }))
    ;(globalThis as any).electronAPI = { modelCatalogQueryScopedCurrent }

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

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith(expect.objectContaining({
      sortBy: 'context_length',
      sortOrder: 'desc',
      cursor: expect.objectContaining({
        modelKey: 'openrouter::openai/gpt-4o',
        contextLength: 8192,
      }),
    }))

    await CatalogQueryService.query({
      sort: {
        by: 'max_output_tokens',
        order: 'asc',
      },
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenLastCalledWith(expect.objectContaining({
      sortBy: 'max_output_tokens',
      sortOrder: 'asc',
    }))
  })

  it('prefers sourceProviderKey and passes it to scoped current query', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      items: [],
      nextCursor: null,
      status: 'synced',
    }))
    ;(globalThis as any).electronAPI = { modelCatalogQueryScopedCurrent }

    await CatalogQueryService.query({
      sourceProviderKey: 'openai-direct',
      providerKey: 'openrouter',
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'openai-direct',
    }))
  })

  it('drops malformed rows and malformed cursor safely', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      items: [
        { modelId: 'missing-required-fields' },
        {
          providerKey: 'openrouter',
          modelId: 'anthropic/claude-3',
          modelKey: 'openrouter::anthropic/claude-3',
          displayName: 'Claude 3',
          capabilities: {
            reasoning: false,
            tools: false,
            structuredOutputs: false,
            vision: false,
            longContext: false,
          },
        },
      ],
      nextCursor: {
        providerKey: '',
        modelId: '',
      },
      status: 'synced',
    }))
    ;(globalThis as any).electronAPI = { modelCatalogQueryScopedCurrent }

    const result = await CatalogQueryService.query({
      page: {
        limit: -5,
      },
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith(expect.objectContaining({
      limit: 1,
    }))
    expect(result.items).toHaveLength(1)
    expect(result.items[0].modelId).toBe('anthropic/claude-3')
    expect(result.nextCursor).toBeNull()
  })

  it('does not use renderer category API key fetch or legacy queryCore for category filters', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      items: [{ modelId: 'legacy/should-not-appear' }],
      nextCursor: null,
      status: 'synced',
    }))
    const legacyInvoke = vi.fn(async () => {
      throw new Error('legacy query should not be called')
    })
    const fetchImpl = vi.fn(async () => {
      throw new Error('renderer network should not be called')
    })
    ;(globalThis as any).electronAPI = { modelCatalogQueryScopedCurrent }
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }
    ;(globalThis as any).fetch = fetchImpl
    ;(globalThis as any).electronStore = {
      get: vi.fn(async () => 'sk-test-should-not-be-read'),
    }

    const result = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      filter: {
        category: 'programming',
      },
    })

    expect(modelCatalogQueryScopedCurrent).not.toHaveBeenCalled()
    expect(legacyInvoke).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(result.items).toHaveLength(0)
    expect(result.notice).toBe('Category filter is unavailable for the current catalog.')
  })

  it('does not fallback to legacy queryCore for unsupported scoped filters', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      items: [{ modelId: 'legacy/should-not-appear' }],
      nextCursor: null,
      status: 'synced',
    }))
    const legacyInvoke = vi.fn(async () => ({ items: [{ modelId: 'legacy/only-model' }], nextCursor: null }))
    ;(globalThis as any).electronAPI = { modelCatalogQueryScopedCurrent }
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }

    const result = await CatalogQueryService.query({
      filter: {
        tags: ['capability:vision'],
      },
    })

    expect(modelCatalogQueryScopedCurrent).not.toHaveBeenCalled()
    expect(legacyInvoke).not.toHaveBeenCalled()
    expect(result).toEqual({
      items: [],
      nextCursor: null,
      notice: 'Some filters are unavailable for the current catalog.',
    })
  })

  it('maps not_synced and failed scoped query status to neutral UI notices', async () => {
    const modelCatalogQueryScopedCurrent = vi
      .fn()
      .mockResolvedValueOnce({
        providerKey: 'openrouter',
        status: 'not_synced',
        syncState: 'idle',
        failureReasonCode: null,
        items: [],
        nextCursor: null,
      })
      .mockResolvedValueOnce({
        providerKey: 'openrouter',
        status: 'failed',
        syncState: 'error',
        failureReasonCode: 'cache_corrupted',
        items: [],
        nextCursor: null,
      })
    ;(globalThis as any).electronAPI = { modelCatalogQueryScopedCurrent }

    const notSynced = await CatalogQueryService.query()
    const failed = await CatalogQueryService.query()

    expect(notSynced).toMatchObject({
      items: [],
      nextCursor: null,
      notice: 'Model list is not synced.',
      status: 'not_synced',
      catalogRevision: null,
    })
    expect(failed).toMatchObject({
      items: [],
      nextCursor: null,
      notice: 'Model list is unavailable.',
      status: 'failed',
      catalogRevision: null,
    })
  })
})
