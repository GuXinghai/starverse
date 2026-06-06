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
      snapshotId: 'snap-ipc',
      modelCount: 1,
    })
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
})
