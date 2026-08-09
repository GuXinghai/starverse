import { afterEach, describe, expect, it, vi } from 'vitest'
import { CatalogQueryService } from './catalogQueryService'
import { installGenerationV2ModelsList, successfulGenerationV2Models } from '../../../tests/helpers/generationV2ModelsBridge'

function installScopedFixture(legacy: ReturnType<typeof vi.fn>) {
  return installGenerationV2ModelsList('openrouter', async (payload) => {
    const value = await legacy(payload) as any
    if (value?.status === 'failed') return { ok: false, code: value.failureReasonCode ?? 'provider_catalog_query_failed' }
    if (value?.status === 'not_synced') return { ok: false, code: 'catalog_not_synced' }
    return successfulGenerationV2Models(Array.isArray(value?.items) ? value.items : [], {
      responseDigest: value?.catalogRevision ?? 'catalog-test-digest', observedAtMs: value?.lastSyncAtMs ?? 123,
    })
  })
}

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
    for (const provider of ['openrouter', 'openai_responses', 'anthropic_messages', 'google_ai_studio', 'deepseek']) {
      CatalogQueryService.invalidateProviderRuntimeCache(provider)
    }
    vi.restoreAllMocks()
  })

  it('returns empty result when scoped query IPC is not available', async () => {
    ;(globalThis as any).generationV2 = { ...(globalThis as any).generationV2, models: {} }
    const result = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      searchText: 'vision',
    })
    expect(result).toMatchObject({ items: [], nextCursor: null, status: 'failed', errorCode: 'provider_catalog_unavailable' })
  })

  it('invokes scoped current query IPC with normalized payload and decodes items', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      sourceProviderKey: 'openrouter',
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
          inputModalities: ['text', 'image'],
          outputModalities: ['text'],
          supportedParameters: ['reasoning', 'tools'],
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
    installScopedFixture(modelCatalogQueryScopedCurrent)
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async () => {
        throw new Error('legacy query should not be called')
      }),
    }

    const result = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
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
        capabilities: {
          reasoning: true,
          vision: true,
        },
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
    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith({ timeoutMs: 30_000 })
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
    expect(result.nextCursor).toBeNull()
    expect(result).toMatchObject({
      status: 'synced',
      catalogRevision: 'checksum-a',
      modelCount: 1,
      lastSyncAtMs: 123,
    })
  })

  it('supports context_length and max_output_tokens sort fields with cursor normalization', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      items: [],
      nextCursor: null,
      status: 'synced',
    }))
    installScopedFixture(modelCatalogQueryScopedCurrent)

    await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
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
          modelKey: 'openrouter::openai/gpt-4o',
        },
      },
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith({ timeoutMs: 30_000 })

    await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      sort: {
        by: 'max_output_tokens',
        order: 'asc',
      },
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenLastCalledWith({ timeoutMs: 30_000 })
  })

  it('pins subsequent pages to the immutable first-page snapshot without a second authority read', async () => {
    const digest = 'a'.repeat(64)
    const rows = Array.from({ length: 120 }, (_, index) => ({
      providerKey: 'openrouter',
      modelId: `model-${String(index).padStart(3, '0')}`,
      modelKey: `openrouter::model-${String(index).padStart(3, '0')}`,
      displayName: `Model ${String(index).padStart(3, '0')}`,
      capabilities: { reasoning: false, tools: false, structuredOutputs: false, vision: false, longContext: false },
    }))
    const list = vi.fn(async () => successfulGenerationV2Models(rows, { responseDigest: digest, observedAtMs: 123 }))
    installGenerationV2ModelsList('openrouter', list)

    const first = await CatalogQueryService.query({ sourceProviderKey: 'openrouter', page: { limit: 100 } })
    const second = await CatalogQueryService.query({ sourceProviderKey: 'openrouter', snapshotDigest: digest,
      page: { limit: 100, cursor: first.nextCursor } })

    expect(list).toHaveBeenCalledTimes(1)
    expect(first.items).toHaveLength(100)
    expect(second.items).toHaveLength(20)
    expect(second.catalogRevision).toBe(digest)
    expect(first.nextCursor?.snapshotDigest).toBe(digest)
  })

  it('rejects an authority response that does not match the requested immutable snapshot digest', async () => {
    const requested = 'b'.repeat(64)
    const returned = 'c'.repeat(64)
    installGenerationV2ModelsList('openrouter', async () => successfulGenerationV2Models([], { responseDigest: returned }))

    const result = await CatalogQueryService.query({ sourceProviderKey: 'openrouter', snapshotDigest: requested })

    expect(result).toMatchObject({ authorityReadSucceeded: false, status: 'failed',
      errorCode: 'catalog_snapshot_digest_mismatch', items: [] })
  })

  it('degrades identity-only provider rows to capability-unknown catalog items without capability claims', async () => {
    installGenerationV2ModelsList('deepseek', async () => successfulGenerationV2Models([
      { nativeModelId: 'deepseek-chat', name: 'DeepSeek Chat', inputModalities: ['text'], outputModalities: ['text'] },
    ], { responseDigest: 'd'.repeat(64), observedAtMs: 456 }))

    const result = await CatalogQueryService.query({ sourceProviderKey: 'deepseek' })

    expect(result).toMatchObject({ authorityReadSucceeded: true, status: 'synced' })
    expect(result.items).toHaveLength(1)
    const item = result.items[0]
    expect(item).toMatchObject({
      providerKey: 'deepseek',
      modelId: 'deepseek-chat',
      modelKey: 'deepseek::deepseek-chat',
      displayName: 'DeepSeek Chat',
    })
    expect(item?.capabilityResolution).toBeNull()
    expect(item?.observation).toBeNull()
    expect(item?.capabilities).toEqual({
      reasoning: false,
      tools: false,
      structuredOutputs: false,
      vision: false,
      longContext: false,
    })
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
    installScopedFixture(modelCatalogQueryScopedCurrent)

    const result = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      page: {
        limit: -5,
      },
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith({ timeoutMs: 30_000 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0].modelId).toBe('anthropic/claude-3')
    expect(result.nextCursor).toBeNull()
  })

  it('routes category filters through scoped current query without renderer fetch or legacy queryCore', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      items: [{
        providerKey: 'openrouter',
        modelId: 'scoped/programming-model',
        modelKey: 'openrouter::scoped/programming-model',
        displayName: 'Scoped Programming Model',
        capabilities: {
          reasoning: false,
          tools: false,
          structuredOutputs: false,
          vision: false,
          longContext: false,
        },
      }],
      nextCursor: null,
      status: 'synced',
    }))
    const legacyInvoke = vi.fn(async () => {
      throw new Error('legacy query should not be called')
    })
    const fetchImpl = vi.fn(async () => {
      throw new Error('renderer network should not be called')
    })
    installScopedFixture(modelCatalogQueryScopedCurrent)
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

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith({ timeoutMs: 30_000, category: 'programming' })
    expect(legacyInvoke).not.toHaveBeenCalled()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(modelCatalogQueryScopedCurrent.mock.calls)).not.toContain('sk-test-should-not-be-read')
    expect(result.items.map((item) => item.modelId)).toEqual(['scoped/programming-model'])
    expect(result.notice).toBeNull()
  })

  it('applies rich catalog filters without falling back to legacy queryCore', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn(async () => ({
      items: [{ providerKey: 'openrouter', modelId: 'current/vision', modelKey: 'openrouter::current/vision',
        displayName: 'Current Vision', tags: ['capability:vision'], capabilities: { reasoning: false, tools: false,
          structuredOutputs: false, vision: true, longContext: false } }],
      nextCursor: null,
      status: 'synced',
    }))
    const legacyInvoke = vi.fn(async () => ({ items: [{ modelId: 'legacy/only-model' }], nextCursor: null }))
    installScopedFixture(modelCatalogQueryScopedCurrent)
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }

    const result = await CatalogQueryService.query({
      sourceProviderKey: 'openrouter',
      filter: {
        tags: ['capability:vision'],
      },
    })

    expect(modelCatalogQueryScopedCurrent).toHaveBeenCalledWith({ timeoutMs: 30_000 })
    expect(legacyInvoke).not.toHaveBeenCalled()
    expect(result.items.map((item) => item.modelId)).toEqual(['current/vision'])
    expect(result.notice).toBeNull()
  })

  it('maps V2 authority failures to explicit catalog failure results', async () => {
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
    installScopedFixture(modelCatalogQueryScopedCurrent)

    const notSynced = await CatalogQueryService.query({ sourceProviderKey: 'openrouter' })
    const failed = await CatalogQueryService.query({ sourceProviderKey: 'openrouter' })

    expect(notSynced).toMatchObject({ items: [], nextCursor: null, notice: 'Model list is unavailable.', status: 'failed', errorCode: 'catalog_not_synced' })
    expect(failed).toMatchObject({
      items: [],
      nextCursor: null,
      notice: 'Model list is unavailable.',
      status: 'failed',
      errorCode: 'cache_corrupted',
    })
  })

  it('preserves Last-Known-Good items and raw provider failure when the active scope status is failed', async () => {
    const providerFailure = {
      origin: 'http_response',
      phase: 'response_body',
      providerId: 'openrouter',
      contractId: 'openrouter-chat-models-v1',
      operationId: 'catalog:openrouter',
      requestSequence: 1,
      httpStatus: 429,
      httpStatusText: 'Too Many Requests',
      providerError: {
        code: 'rate_limit_exceeded',
        type: 'provider_error',
        status: null,
        message: 'Please retry later.',
        param: null,
        requestId: 'req_catalog_1',
        retryAfterMs: 30_000,
        rawJson: { error: { code: 'rate_limit_exceeded', message: 'Please retry later.' } },
        rawText: null,
      },
      rawFrameExcerpt: null,
      transportError: null,
      starverseDiagnosticCode: 'PROVIDER_RESPONSE_HTTP_ERROR',
      redactions: [],
      truncations: [],
    } as const
    installGenerationV2ModelsList('openrouter', async () => ({
      ok: true,
      status: 'failed',
      responseDigest: 'failed-lkg-digest',
      observedAtMs: 456,
      modelCount: 1,
      visibleModelCount: 1,
      hiddenModelCount: 0,
      errorCode: 'PROVIDER_RESPONSE_HTTP_ERROR',
      errorMessage: 'Please retry later.',
      providerFailure,
      items: [{
        providerKey: 'openrouter',
        modelId: 'openai/lkg',
        modelKey: 'openrouter::openai/lkg',
        displayName: 'LKG Model',
        capabilities: {
          reasoning: false,
          tools: false,
          structuredOutputs: false,
          vision: false,
          longContext: false,
        },
      }],
    }))

    const result = await CatalogQueryService.query({ sourceProviderKey: 'openrouter' })

    expect(result).toMatchObject({
      status: 'failed',
      errorCode: 'PROVIDER_RESPONSE_HTTP_ERROR',
      errorMessage: 'Please retry later.',
      providerFailure,
    })
    expect(result.items.map((item) => item.modelId)).toEqual(['openai/lkg'])
  })

  it('does not default missing source provider to OpenRouter', async () => {
    const modelCatalogQueryScopedCurrent = vi.fn()
    installScopedFixture(modelCatalogQueryScopedCurrent)

    const result = await CatalogQueryService.query({} as any)

    expect(modelCatalogQueryScopedCurrent).not.toHaveBeenCalled()
    expect(result).toEqual({
      items: [],
      nextCursor: null,
      notice: 'Model catalog source provider is required.',
    })
  })
})
