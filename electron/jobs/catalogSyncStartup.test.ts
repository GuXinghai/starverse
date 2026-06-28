import { beforeEach, describe, expect, it, vi } from 'vitest'
import { syncOpenRouterModelCatalog } from '../modelCatalog/catalogSyncJob'
import { resolveCurrentOpenRouterCatalogScope, runCatalogSyncAtStartup } from './catalogSyncStartup'

vi.mock('../modelCatalog/catalogSyncJob', () => ({
  syncOpenRouterModelCatalog: vi.fn(),
}))

function createStore(initial: Record<string, unknown>) {
  const data = new Map<string, unknown>(Object.entries(initial))
  return {
    get: vi.fn((key: string) => data.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      data.set(key, value)
    }),
  } as any
}

function makeScopedMeta(partial: Record<string, unknown> = {}) {
  return {
    providerKey: 'openrouter',
    catalogScopeKey: 'scope-a',
    baseUrl: 'https://openrouter.ai/api/v1',
    dataSource: 'models_user_primary',
    activeSnapshotId: 'snap-a',
    syncState: 'ok',
    lastSyncAtMs: Date.now(),
    lastUsedAtMs: Date.now(),
    modelCount: 1,
    visibleModelCount: 1,
    hiddenModelCount: 0,
    schemaVersion: 1,
    ...partial,
  }
}

function makeModel() {
  return {
    modelId: 'openai/a',
    modelKey: 'openrouter::openai/a',
    displayName: 'A',
    status: 'active' as const,
    visibility: 'visible' as const,
    inputModalitiesJson: '["text"]',
    outputModalitiesJson: '["text"]',
    supportedParametersJson: '["temperature"]',
    capabilitiesJson: '{}',
    firstSeenAtMs: Date.now(),
    lastSeenAtMs: Date.now(),
    syncedAtMs: Date.now(),
  }
}

describe('runCatalogSyncAtStartup scoped catalog path', () => {
  beforeEach(() => {
    vi.mocked(syncOpenRouterModelCatalog).mockReset()
  })

  it('characterizes current startup scope as resolver-backed legacy openRouterApiKey and official openRouterBaseUrl reads', () => {
    const rawApiKey = 'sk-startup-direct-read-secret'
    const store = createStore({
      openRouterApiKey: `  ${rawApiKey}  `,
      openRouterBaseUrl: ' https://openrouter.ai/api/v1/ ',
      openRouterCatalogLocalSecret: 'local-secret-for-startup-tests-1234567890',
    })

    const scope = resolveCurrentOpenRouterCatalogScope(store)

    expect(scope).toMatchObject({
      providerKey: 'openrouter',
      normalizedBaseUrl: 'https://openrouter.ai/api/v1',
      scopeDataSource: 'models_user_primary',
    })
    expect(store.get).toHaveBeenCalledWith('openRouterApiKey')
    expect(store.get).toHaveBeenCalledWith('openRouterBaseUrl')
    expect(store.get).toHaveBeenCalledWith('openRouterCatalogLocalSecret')
    expect(JSON.stringify(scope)).not.toContain(rawApiKey)
    expect(JSON.stringify(scope)).not.toContain('local-secret-for-startup-tests-1234567890')
  })

  it('returns missing_api_key without reading legacy or scoped DB state', async () => {
    const store = createStore({})
    const dbWorkerManager = { call: vi.fn() } as any

    const result = await runCatalogSyncAtStartup({ store, dbWorkerManager, force: true })

    expect(result).toMatchObject({
      syncAttempted: true,
      syncSucceeded: false,
      reason: 'missing_api_key_no_cache',
      failureMessage: 'missing_api_key',
    })
    expect(dbWorkerManager.call).not.toHaveBeenCalled()
    expect(syncOpenRouterModelCatalog).not.toHaveBeenCalled()
  })

  it('writes remote sync results to current scoped snapshot only', async () => {
    const rawApiKey = 'sk-startup-secret-a'
    const store = createStore({
      openRouterApiKey: rawApiKey,
      openRouterBaseUrl: 'https://openrouter.ai/api/v1/',
      openRouterCatalogLocalSecret: 'local-secret-for-startup-tests-1234567890',
    })
    const scope = resolveCurrentOpenRouterCatalogScope(store)!
    const dbWorkerManager = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'modelCatalog.getScopedMeta') return null
        if (method === 'modelCatalog.writeScopedSnapshot') return { ok: true, modelCount: 1, ...params }
        throw new Error(`unexpected method ${method}`)
      }),
    } as any
    vi.mocked(syncOpenRouterModelCatalog).mockImplementation(async (options: any) => {
      await options.writer.writeScopedSnapshot({
        providerKey: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        dataSource: 'models_user_primary',
        snapshotId: 'snap-scoped',
        snapshotChecksum: 'checksum-scoped',
        models: [makeModel()],
        syncedAtMs: 123,
        schemaVersion: 1,
      })
      return {
        ok: true,
        snapshotId: 'snap-scoped',
        modelCount: 1,
        dataSource: 'models_user_primary',
        baseUrl: 'https://openrouter.ai/api/v1',
      }
    })

    const result = await runCatalogSyncAtStartup({ store, dbWorkerManager, force: true })

    expect(result).toMatchObject({
      syncAttempted: true,
      syncSucceeded: true,
      syncSnapshotId: 'snap-scoped',
      modelCountAfter: 1,
    })
    expect(dbWorkerManager.call).toHaveBeenCalledWith('modelCatalog.writeScopedSnapshot', expect.objectContaining({
      providerKey: 'openrouter',
      catalogScopeKey: scope.catalogScopeKey,
      baseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary',
      snapshotId: 'snap-scoped',
    }))
    expect(dbWorkerManager.call).not.toHaveBeenCalledWith('modelCatalog.syncSnapshot', expect.anything())
    expect(dbWorkerManager.call).not.toHaveBeenCalledWith('modelCatalog.syncCoreSnapshot', expect.anything())
    expect(JSON.stringify(scope)).not.toContain(rawApiKey)
    expect(JSON.stringify(dbWorkerManager.call.mock.calls)).not.toContain(rawApiKey)
  })

  it('passes the resolver-backed legacy OpenRouter key and official baseUrl to the current catalog sync job only', async () => {
    const rawApiKey = 'sk-startup-sync-job-secret'
    const store = createStore({
      openRouterApiKey: rawApiKey,
      openRouterBaseUrl: 'https://openrouter.ai/api/v1/',
      openRouterCatalogLocalSecret: 'local-secret-for-startup-tests-1234567890',
    })
    const dbWorkerManager = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'modelCatalog.getScopedMeta') return null
        if (method === 'modelCatalog.writeScopedSnapshot') return { ok: true, ...params }
        throw new Error(`unexpected method ${method}`)
      }),
    } as any
    vi.mocked(syncOpenRouterModelCatalog).mockResolvedValue({
      ok: true,
      snapshotId: 'snap-direct-key',
      modelCount: 0,
      dataSource: 'models_user_primary',
      baseUrl: 'https://openrouter.ai/api/v1',
    })

    await runCatalogSyncAtStartup({ store, dbWorkerManager, force: true })

    expect(syncOpenRouterModelCatalog).toHaveBeenCalledTimes(1)
    expect(syncOpenRouterModelCatalog).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: rawApiKey,
      baseUrl: 'https://openrouter.ai/api/v1',
    }))
    expect(JSON.stringify(dbWorkerManager.call.mock.calls)).not.toContain(rawApiKey)
  })

  it('does not run catalog sync with saved OpenRouter key when baseUrl is an attacker host', async () => {
    const store = createStore({
      openRouterApiKey: 'sk-startup-attacker-base-secret',
      openRouterBaseUrl: 'https://attacker.example.test/custom/v1/',
      openRouterCatalogLocalSecret: 'local-secret-for-startup-tests-1234567890',
    })
    const dbWorkerManager = { call: vi.fn() } as any

    const result = await runCatalogSyncAtStartup({ store, dbWorkerManager, force: true })

    expect(result).toMatchObject({
      syncAttempted: true,
      syncSucceeded: false,
      reason: 'missing_api_key_no_cache',
      failureMessage: 'missing_api_key',
    })
    expect(dbWorkerManager.call).not.toHaveBeenCalled()
    expect(syncOpenRouterModelCatalog).not.toHaveBeenCalled()
  })

  it('keeps startup catalog sync failure logs and diagnostics free of raw key material', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rawApiKey = 'sk-startup-failure-log-secret'
    const store = createStore({
      openRouterApiKey: rawApiKey,
      openRouterCatalogLocalSecret: 'local-secret-for-startup-tests-1234567890',
    })
    const dbWorkerManager = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'modelCatalog.getScopedMeta') return null
        if (method === 'modelCatalog.updateScopedMetaSyncError') return { ok: true, ...params }
        throw new Error(`unexpected method ${method}`)
      }),
    } as any
    vi.mocked(syncOpenRouterModelCatalog).mockRejectedValue(new Error('remote catalog unavailable'))

    try {
      const result = await runCatalogSyncAtStartup({ store, dbWorkerManager, force: true })

      expect(result).toMatchObject({
        syncAttempted: true,
        syncSucceeded: false,
        reason: 'sync_failed_no_cache',
      })
      const serializedDbCalls = JSON.stringify(dbWorkerManager.call.mock.calls)
      expect(serializedDbCalls).not.toContain(rawApiKey)
      expect(serializedDbCalls).not.toContain(`Bearer ${rawApiKey}`)
      expect(serializedDbCalls).not.toContain('Authorization')

      const serializedLogs = warnSpy.mock.calls.map((call) => call.map(String).join(' ')).join('\n')
      expect(serializedLogs).not.toContain(rawApiKey)
      expect(serializedLogs).not.toContain(`Bearer ${rawApiKey}`)
      expect(serializedLogs).not.toContain('Authorization')
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('returns cache_fresh for current scoped meta without remote sync', async () => {
    const store = createStore({
      openRouterApiKey: 'sk-startup-secret-a',
      openRouterCatalogLocalSecret: 'local-secret-for-startup-tests-1234567890',
    })
    const dbWorkerManager = {
      call: vi.fn(async (method: string) => {
        if (method === 'modelCatalog.getScopedMeta') return makeScopedMeta()
        if (method === 'modelCatalog.validateActiveScopedSnapshot') return { ok: true, modelCount: 1 }
        throw new Error(`unexpected method ${method}`)
      }),
    } as any

    const result = await runCatalogSyncAtStartup({ store, dbWorkerManager, force: false })

    expect(result).toMatchObject({
      reason: 'cache_fresh',
      syncAttempted: false,
      modelCountAfter: 1,
    })
    expect(syncOpenRouterModelCatalog).not.toHaveBeenCalled()
  })

  it('uses configured freshness to decide whether current scoped meta is stale', async () => {
    const store = createStore({
      openRouterApiKey: 'sk-startup-secret-a',
      openRouterCatalogLocalSecret: 'local-secret-for-startup-tests-1234567890',
    })
    const staleAtMs = Date.now() - 16 * 60 * 1000
    const dbWorkerManager = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'modelCatalog.getScopedMeta') return makeScopedMeta({ lastSyncAtMs: staleAtMs })
        if (method === 'modelCatalog.validateActiveScopedSnapshot') return { ok: true, modelCount: 1 }
        if (method === 'modelCatalog.writeScopedSnapshot') return { ok: true, ...params }
        throw new Error(`unexpected method ${method}`)
      }),
    } as any
    vi.mocked(syncOpenRouterModelCatalog).mockImplementation(async (options: any) => {
      await options.writer.writeScopedSnapshot({
        providerKey: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        dataSource: 'models_user_primary',
        snapshotId: 'snap-stale',
        models: [makeModel()],
        syncedAtMs: 123,
        schemaVersion: 1,
      })
      return { ok: true, snapshotId: 'snap-stale', modelCount: 1, dataSource: 'models_user_primary', baseUrl: 'https://openrouter.ai/api/v1' }
    })

    const freshResult = await runCatalogSyncAtStartup({
      store,
      dbWorkerManager,
      force: false,
      freshnessMs: 24 * 60 * 60 * 1000,
    })
    expect(freshResult.reason).toBe('cache_fresh')
    expect(syncOpenRouterModelCatalog).not.toHaveBeenCalled()

    const staleResult = await runCatalogSyncAtStartup({
      store,
      dbWorkerManager,
      force: false,
      freshnessMs: 15 * 60 * 1000,
    })
    expect(staleResult.reason).toBe('synced')
    expect(syncOpenRouterModelCatalog).toHaveBeenCalledTimes(1)
  })

  it('force=true bypasses current scoped cache freshness', async () => {
    const store = createStore({
      openRouterApiKey: 'sk-startup-secret-a',
      openRouterCatalogLocalSecret: 'local-secret-for-startup-tests-1234567890',
    })
    const dbWorkerManager = {
      call: vi.fn(async (method: string, params: any) => {
        if (method === 'modelCatalog.getScopedMeta') return makeScopedMeta()
        if (method === 'modelCatalog.validateActiveScopedSnapshot') return { ok: true, modelCount: 1 }
        if (method === 'modelCatalog.writeScopedSnapshot') return { ok: true, ...params }
        throw new Error(`unexpected method ${method}`)
      }),
    } as any
    vi.mocked(syncOpenRouterModelCatalog).mockImplementation(async (options: any) => {
      await options.writer.writeScopedSnapshot({
        providerKey: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
        dataSource: 'models_user_primary',
        snapshotId: 'snap-force',
        models: [makeModel()],
        syncedAtMs: 123,
        schemaVersion: 1,
      })
      return { ok: true, snapshotId: 'snap-force', modelCount: 1, dataSource: 'models_user_primary', baseUrl: 'https://openrouter.ai/api/v1' }
    })

    const result = await runCatalogSyncAtStartup({ store, dbWorkerManager, force: true })

    expect(result).toMatchObject({
      reason: 'synced',
      syncAttempted: true,
      syncSnapshotId: 'snap-force',
    })
    expect(syncOpenRouterModelCatalog).toHaveBeenCalledTimes(1)
  })
})
