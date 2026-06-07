import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runCatalogSyncAtStartup } from '../jobs/catalogSyncStartup'
import { deriveCatalogScopeFromStore } from '../modelCatalog/catalogScope'
import { registerModelCatalogSyncIpc } from './modelCatalogSyncIpc'

vi.mock('../jobs/catalogSyncStartup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../jobs/catalogSyncStartup')>()
  return {
    ...actual,
    runCatalogSyncAtStartup: vi.fn(),
  }
})

function createStore(initial: Record<string, unknown>) {
  const data = new Map<string, unknown>(Object.entries(initial))
  return {
    get: vi.fn((key: string) => data.get(key)),
    setValue(key: string, value: unknown) {
      data.set(key, value)
    },
  } as any
}

function getScope(store: any) {
  const apiKey = String(store.get('openRouterApiKey') ?? '').trim()
  return deriveCatalogScopeFromStore({
    store,
    providerKey: 'openrouter',
    apiKey,
    baseUrl: String(store.get('openRouterBaseUrl') ?? '').trim() || null,
    dataSource: 'models_user_primary',
  }).catalogScopeKey
}

function registerHandlers(input?: {
  store?: any
  dbWorkerManager?: any
  notifyRenderer?: (channel: string, payload: unknown) => void
}) {
  const registerInvoke = vi.fn()
  const store = input?.store ?? createStore({
    openRouterApiKey: 'sk-ipc-a',
    openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890',
  })
  const dbWorkerManager = input?.dbWorkerManager ?? { call: vi.fn() }
  const notifyRenderer = input?.notifyRenderer ?? vi.fn()
  registerModelCatalogSyncIpc({
    registerInvoke,
    store,
    dbWorkerManager,
    notifyRenderer,
  })
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  for (const [channel, handler] of registerInvoke.mock.calls) {
    handlers.set(channel, handler)
  }
  return { handlers, store, dbWorkerManager, notifyRenderer }
}

function makeRunnerResult(partial: Record<string, unknown> = {}) {
  return {
    providerKey: 'openrouter',
    startedAtMs: 1,
    finishedAtMs: 2,
    durationMs: 1,
    hadCache: false,
    staleCache: false,
    syncAttempted: true,
    syncSucceeded: true,
    usedCacheFallback: false,
    force: false,
    reason: 'synced',
    source: 'models_user_primary',
    modelCountBefore: 0,
    modelCountAfter: 1,
    lastSyncAtMs: 2,
    syncSnapshotId: 'snap-ipc',
    ...partial,
  } as any
}

function makeScopedMeta(scope: string, partial: Record<string, unknown> = {}) {
  return {
    providerKey: 'openrouter',
    catalogScopeKey: scope,
    baseUrl: 'https://openrouter.ai/api/v1',
    dataSource: 'models_user_primary',
    activeSnapshotId: 'snap-ipc',
    syncState: 'ok',
    lastSyncAtMs: 123,
    lastUsedAtMs: 123,
    modelCount: 1,
    visibleModelCount: 1,
    hiddenModelCount: 0,
    schemaVersion: 1,
    ...partial,
  }
}

describe('registerModelCatalogSyncIpc scoped catalog sync', () => {
  beforeEach(() => {
    vi.mocked(runCatalogSyncAtStartup).mockReset()
  })

  it('syncNow returns missing_api_key without DB or legacy fallback when current API key is absent', async () => {
    const dbWorkerManager = { call: vi.fn() }
    const { handlers } = registerHandlers({
      store: createStore({ openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890' }),
      dbWorkerManager,
    })

    const result = await handlers.get('modelCatalog.syncNow')?.({}, {
      providerKey: 'openrouter',
      force: true,
      reason: 'manual_refresh',
    }) as any

    expect(result).toMatchObject({
      ok: false,
      errorCode: 'missing_api_key',
      failureReasonCode: 'missing_api_key',
    })
    expect(dbWorkerManager.call).not.toHaveBeenCalled()
    expect(runCatalogSyncAtStartup).not.toHaveBeenCalled()
  })

  it('getSyncStatus reads only current credential scope and does not reuse key A for key B', async () => {
    const store = createStore({
      openRouterApiKey: 'sk-ipc-a',
      openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890',
    })
    const scopeA = getScope(store)
    store.setValue('openRouterApiKey', 'sk-ipc-b')
    const scopeB = getScope(store)
    store.setValue('openRouterApiKey', 'sk-ipc-a')
    const dbWorkerManager = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'modelCatalog.getScopedMeta') {
          return params.catalogScopeKey === scopeA ? makeScopedMeta(scopeA) : null
        }
        if (method === 'modelCatalog.validateActiveScopedSnapshot') return { ok: true, modelCount: 1 }
        throw new Error(`unexpected method ${method}`)
      }),
    }
    const { handlers } = registerHandlers({ store, dbWorkerManager })

    const statusA = await handlers.get('modelCatalog.getSyncStatus')?.({}, { providerKey: 'openrouter' }) as any
    store.setValue('openRouterApiKey', 'sk-ipc-b')
    const statusB = await handlers.get('modelCatalog.getSyncStatus')?.({}, { providerKey: 'openrouter' }) as any

    expect(scopeA).not.toBe(scopeB)
    expect(statusA).toMatchObject({ status: 'synced', syncState: 'ok', modelCount: 1 })
    expect(statusB).toMatchObject({ status: 'not_synced', syncState: 'idle', modelCount: 0 })
    expect(dbWorkerManager.call).toHaveBeenCalledWith('modelCatalog.getScopedMeta', expect.objectContaining({ catalogScopeKey: scopeB }))
    expect(dbWorkerManager.call).not.toHaveBeenCalledWith('modelCatalog.getCoreMeta', expect.anything())
  })

  it('getSyncStatus reports missing_api_key without reading legacy meta', async () => {
    const dbWorkerManager = { call: vi.fn() }
    const { handlers } = registerHandlers({
      store: createStore({ openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890' }),
      dbWorkerManager,
    })

    const status = await handlers.get('modelCatalog.getSyncStatus')?.({}, { providerKey: 'openrouter' }) as any

    expect(status).toMatchObject({
      status: 'failed',
      syncState: 'error',
      lastErrorCode: 'missing_api_key',
      failureReasonCode: 'missing_api_key',
    })
    expect(dbWorkerManager.call).not.toHaveBeenCalled()
  })

  it('getSyncStatus reports cache_corrupted when active scoped snapshot validation fails', async () => {
    const store = createStore({
      openRouterApiKey: 'sk-ipc-a',
      openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890',
    })
    const scope = getScope(store)
    const dbWorkerManager = {
      call: vi.fn(async (method: string) => {
        if (method === 'modelCatalog.getScopedMeta') return makeScopedMeta(scope)
        if (method === 'modelCatalog.validateActiveScopedSnapshot') return { ok: false, code: 'cache_corrupted' }
        throw new Error(`unexpected method ${method}`)
      }),
    }
    const { handlers } = registerHandlers({ store, dbWorkerManager })

    const status = await handlers.get('modelCatalog.getSyncStatus')?.({}, { providerKey: 'openrouter' }) as any

    expect(status).toMatchObject({
      status: 'failed',
      syncState: 'error',
      lastErrorCode: 'cache_corrupted',
      failureReasonCode: 'cache_corrupted',
    })
  })

  it('getSyncStatus reports db_unavailable when scoped DB read fails', async () => {
    const dbWorkerManager = {
      call: vi.fn(async () => {
        throw Object.assign(new Error('DB worker not initialized'), { code: 'ERR_UNAVAILABLE' })
      }),
    }
    const { handlers } = registerHandlers({ dbWorkerManager })

    const status = await handlers.get('modelCatalog.getSyncStatus')?.({}, { providerKey: 'openrouter' }) as any

    expect(status).toMatchObject({
      status: 'failed',
      syncState: 'error',
      lastErrorCode: 'db_unavailable',
      failureReasonCode: 'db_unavailable',
    })
  })

  it('syncNow treats current scoped cache_fresh as success without syncAttempted', async () => {
    vi.mocked(runCatalogSyncAtStartup).mockResolvedValue(makeRunnerResult({
      syncAttempted: false,
      syncSucceeded: false,
      reason: 'cache_fresh',
      modelCountAfter: 7,
      lastSyncAtMs: 123,
    }))
    const { handlers } = registerHandlers()

    const result = await handlers.get('modelCatalog.syncNow')?.({}, { providerKey: 'openrouter', force: false, reason: 'model_picker_opened' }) as any

    expect(result).toMatchObject({
      ok: true,
      syncAttempted: false,
      syncSucceeded: true,
      modelCount: 7,
      errorCode: null,
    })
  })

  it('syncNow passes normalized catalog freshness to scoped runner', async () => {
    vi.mocked(runCatalogSyncAtStartup).mockResolvedValue(makeRunnerResult())
    const { handlers } = registerHandlers({
      store: createStore({
        openRouterApiKey: 'sk-ipc-a',
        openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890',
        openRouterCatalogFreshnessMs: 15 * 60 * 1000,
      }),
    })

    await handlers.get('modelCatalog.syncNow')?.({}, {
      providerKey: 'openrouter',
      force: false,
      reason: 'model_picker_opened',
    })

    expect(runCatalogSyncAtStartup).toHaveBeenCalledWith(expect.objectContaining({
      force: false,
      freshnessMs: 15 * 60 * 1000,
    }))
  })

  it('syncNow emits sanitized sync event payload on scoped success', async () => {
    const rawApiKey = 'sk-ipc-a'
    vi.mocked(runCatalogSyncAtStartup).mockResolvedValue(makeRunnerResult())
    const notifyRenderer = vi.fn()
    const { handlers } = registerHandlers({
      store: createStore({
        openRouterApiKey: rawApiKey,
        openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890',
      }),
      notifyRenderer,
    })

    await handlers.get('modelCatalog.syncNow')?.({}, { providerKey: 'openrouter', force: true, reason: 'manual_refresh' })

    expect(notifyRenderer).toHaveBeenCalledWith('db:modelCatalogSynced', {
      routerSource: 'openrouter',
      modelCount: 1,
      lastSyncAtMs: 2,
    })
    expect(JSON.stringify(notifyRenderer.mock.calls)).not.toContain('snap-ipc')
    expect(JSON.stringify(notifyRenderer.mock.calls)).not.toContain(rawApiKey)
  })

  it('uses one lock per current scope and does not serialize different credential scopes together', async () => {
    const store = createStore({
      openRouterApiKey: 'sk-ipc-a',
      openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890',
    })
    let resolveA: (value: any) => void = () => {}
    let resolveB: (value: any) => void = () => {}
    vi.mocked(runCatalogSyncAtStartup)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveA = resolve
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveB = resolve
      }))
    const { handlers } = registerHandlers({ store })

    const first = handlers.get('modelCatalog.syncNow')?.({}, { providerKey: 'openrouter', force: true, reason: 'manual_refresh' }) as Promise<any>
    const sameScope = handlers.get('modelCatalog.syncNow')?.({}, { providerKey: 'openrouter', force: true, reason: 'manual_refresh' }) as Promise<any>
    expect(runCatalogSyncAtStartup).toHaveBeenCalledTimes(1)

    store.setValue('openRouterApiKey', 'sk-ipc-b')
    const otherScope = handlers.get('modelCatalog.syncNow')?.({}, { providerKey: 'openrouter', force: true, reason: 'manual_refresh' }) as Promise<any>
    expect(runCatalogSyncAtStartup).toHaveBeenCalledTimes(2)

    resolveA(makeRunnerResult({ syncSnapshotId: 'snap-a' }))
    resolveB(makeRunnerResult({ syncSnapshotId: 'snap-b' }))
    await expect(first).resolves.toMatchObject({ ok: true })
    await expect(sameScope).resolves.toMatchObject({ ok: true })
    await expect(otherScope).resolves.toMatchObject({ ok: true })
  })

  it('queryScopedCurrent returns missing_api_key without DB or legacy fallback', async () => {
    const dbWorkerManager = { call: vi.fn() }
    const { handlers } = registerHandlers({
      store: createStore({ openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890' }),
      dbWorkerManager,
    })

    const result = await handlers.get('modelCatalog.queryScopedCurrent')?.({}, {
      providerKey: 'openrouter',
      searchText: 'gpt',
    }) as any

    expect(result).toMatchObject({
      providerKey: 'openrouter',
      status: 'failed',
      syncState: 'error',
      failureReasonCode: 'missing_api_key',
      items: [],
      nextCursor: null,
    })
    expect(dbWorkerManager.call).not.toHaveBeenCalled()
  })

  it('queryScopedCurrent reads current scoped active snapshot and strips scope fields from renderer payload', async () => {
    const rawApiKey = 'sk-query-a'
    const store = createStore({
      openRouterApiKey: rawApiKey,
      openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890',
    })
    const scope = getScope(store)
    const dbWorkerManager = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'modelCatalog.getScopedMeta') {
          expect(params).toMatchObject({ providerKey: 'openrouter', catalogScopeKey: scope })
          return makeScopedMeta(scope)
        }
        if (method === 'modelCatalog.validateActiveScopedSnapshot') {
          expect(params).toMatchObject({ providerKey: 'openrouter', catalogScopeKey: scope })
          return { ok: true, modelCount: 1 }
        }
        if (method === 'modelCatalog.queryScopedActive') {
          expect(params).toMatchObject({
            providerKey: 'openrouter',
            catalogScopeKey: scope,
            searchText: 'gpt',
            vendors: ['openai'],
            sortBy: 'name',
            sortOrder: 'asc',
            limit: 25,
          })
          expect(JSON.stringify(params)).not.toContain(rawApiKey)
          return {
            items: [
              {
                providerKey: 'openrouter',
                catalogScopeKey: scope,
                snapshotId: 'snap-ipc',
                modelId: 'openai/gpt-4o',
                modelKey: 'openrouter::openai/gpt-4o',
                canonicalSlug: 'openai/gpt-4o',
                displayName: 'GPT-4o',
                description: 'omni',
                vendor: 'openai',
                contextLength: 128000,
                maxOutputTokens: 8192,
                createdAtSec: 1700000123,
                pricingJson: '{"prompt":"0.1"}',
                capabilitiesJson: '{"reasoning":true,"tools":true}',
                rawJson: `{"apiKey":"${rawApiKey}"}`,
              },
            ],
            nextCursor: { sortBy: 'name', sortOrder: 'asc', modelKey: 'openrouter::openai/gpt-4o' },
          }
        }
        throw new Error(`unexpected method ${method}`)
      }),
    }
    const { handlers } = registerHandlers({ store, dbWorkerManager })

    const result = await handlers.get('modelCatalog.queryScopedCurrent')?.({}, {
      providerKey: 'openrouter',
      apiKey: rawApiKey,
      searchText: 'gpt',
      vendors: ['openai'],
      sortBy: 'name',
      sortOrder: 'asc',
      limit: 25,
    } as any) as any

    expect(result).toMatchObject({
      providerKey: 'openrouter',
      status: 'synced',
      syncState: 'ok',
      failureReasonCode: null,
      nextCursor: { sortBy: 'name', sortOrder: 'asc', modelKey: 'openrouter::openai/gpt-4o' },
    })
    expect(result.items).toEqual([
      expect.objectContaining({
        providerKey: 'openrouter',
        modelId: 'openai/gpt-4o',
        modelKey: 'openrouter::openai/gpt-4o',
        displayName: 'GPT-4o',
        pricing: expect.objectContaining({ prompt: '0.1' }),
        capabilities: expect.objectContaining({ reasoning: true, tools: true }),
      }),
    ])
    expect(JSON.stringify(result)).not.toContain(rawApiKey)
    expect(JSON.stringify(result)).not.toContain(scope)
    expect(JSON.stringify(result)).not.toContain('snapshotId')
    expect(dbWorkerManager.call).not.toHaveBeenCalledWith('modelCatalog.queryCore', expect.anything())
    expect(dbWorkerManager.call).not.toHaveBeenCalledWith('modelCatalog.list', expect.anything())
  })

  it('queryScopedCurrent isolates API keys and base URLs by current scope', async () => {
    const store = createStore({
      openRouterApiKey: 'sk-query-a',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
      openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890',
    })
    const scopeA = getScope(store)
    store.setValue('openRouterApiKey', 'sk-query-b')
    const scopeB = getScope(store)
    store.setValue('openRouterApiKey', 'sk-query-a')
    store.setValue('openRouterBaseUrl', 'https://alt.openrouter.test/api/v1')
    const scopeAltBaseUrl = getScope(store)
    store.setValue('openRouterApiKey', 'sk-query-a')
    store.setValue('openRouterBaseUrl', 'https://openrouter.ai/api/v1')
    const dbWorkerManager = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'modelCatalog.getScopedMeta') {
          if (params.catalogScopeKey === scopeA || params.catalogScopeKey === scopeB) {
            return makeScopedMeta(params.catalogScopeKey)
          }
          return null
        }
        if (method === 'modelCatalog.validateActiveScopedSnapshot') return { ok: true }
        if (method === 'modelCatalog.queryScopedActive') {
          const modelId = params.catalogScopeKey === scopeA ? 'scope-a/model' : 'scope-b/model'
          return {
            items: [{
              providerKey: 'openrouter',
              modelId,
              modelKey: `openrouter::${modelId}`,
              displayName: modelId,
              pricingJson: null,
              capabilitiesJson: '{}',
            }],
            nextCursor: null,
          }
        }
        throw new Error(`unexpected method ${method}`)
      }),
    }
    const { handlers } = registerHandlers({ store, dbWorkerManager })

    const resultA = await handlers.get('modelCatalog.queryScopedCurrent')?.({}, { providerKey: 'openrouter' }) as any
    store.setValue('openRouterApiKey', 'sk-query-b')
    const resultB = await handlers.get('modelCatalog.queryScopedCurrent')?.({}, { providerKey: 'openrouter' }) as any
    store.setValue('openRouterApiKey', 'sk-query-a')
    store.setValue('openRouterBaseUrl', 'https://alt.openrouter.test/api/v1')
    const resultAltBaseUrl = await handlers.get('modelCatalog.queryScopedCurrent')?.({}, { providerKey: 'openrouter' }) as any

    expect(scopeA).not.toBe(scopeB)
    expect(scopeA).not.toBe(scopeAltBaseUrl)
    expect(resultA.items.map((item: any) => item.modelId)).toEqual(['scope-a/model'])
    expect(resultB.items.map((item: any) => item.modelId)).toEqual(['scope-b/model'])
    expect(resultAltBaseUrl).toMatchObject({
      status: 'not_synced',
      syncState: 'idle',
      items: [],
    })
  })

  it('queryScopedCurrent returns cache_corrupted and db_unavailable without legacy fallback', async () => {
    const store = createStore({
      openRouterApiKey: 'sk-query-a',
      openRouterCatalogLocalSecret: 'local-secret-for-ipc-tests-1234567890',
    })
    const scope = getScope(store)
    const dbWorkerManager = {
      call: vi
        .fn()
        .mockImplementationOnce(async (method: string) => {
          if (method === 'modelCatalog.getScopedMeta') return makeScopedMeta(scope)
          throw new Error(`unexpected method ${method}`)
        })
        .mockImplementationOnce(async (method: string) => {
          if (method === 'modelCatalog.validateActiveScopedSnapshot') return { ok: false, code: 'cache_corrupted' }
          throw new Error(`unexpected method ${method}`)
        })
        .mockImplementationOnce(async () => {
          throw Object.assign(new Error('DB worker unavailable'), { code: 'ERR_UNAVAILABLE' })
        }),
    }
    const { handlers } = registerHandlers({ store, dbWorkerManager })

    const corrupted = await handlers.get('modelCatalog.queryScopedCurrent')?.({}, { providerKey: 'openrouter' }) as any
    const unavailable = await handlers.get('modelCatalog.queryScopedCurrent')?.({}, { providerKey: 'openrouter' }) as any

    expect(corrupted).toMatchObject({
      status: 'failed',
      syncState: 'error',
      failureReasonCode: 'cache_corrupted',
      items: [],
    })
    expect(unavailable).toMatchObject({
      status: 'failed',
      syncState: 'error',
      failureReasonCode: 'db_unavailable',
      items: [],
    })
    expect(dbWorkerManager.call).not.toHaveBeenCalledWith('modelCatalog.queryCore', expect.anything())
  })
})
