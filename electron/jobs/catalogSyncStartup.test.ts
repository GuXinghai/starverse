import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  sessionFetch: vi.fn(),
}))

const openRouterSourceMock = vi.hoisted(() => ({
  fetchSnapshot: vi.fn(),
}))

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      fetch: electronMock.sessionFetch,
    },
  },
}))

import { openRouterCatalogSource } from '../../src/shared/modelCatalog/providers/openrouter/openRouterCatalogSource'
import type { ProviderCatalogSnapshot } from '../../src/shared/modelCatalog/providerCatalogContracts'
import type { CatalogModel } from '../../src/shared/modelCatalog/internalSchema'
import { resolveCurrentOpenRouterCatalogScope, runCatalogSyncAtStartup } from './catalogSyncStartup'

vi.mock('../../src/shared/modelCatalog/providers/openrouter/openRouterCatalogSource', () => ({
  openRouterCatalogSource: {
    descriptor: {
      providerKey: 'openrouter',
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
      defaultDataSource: 'models_user_primary',
    },
    fetchSnapshot: openRouterSourceMock.fetchSnapshot,
  },
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

function makeModel(partial: Partial<CatalogModel> = {}): CatalogModel {
  const nowMs = Date.now()
  return {
    modelId: 'openai/a',
    modelKey: 'openrouter::openai/a' as const,
    providerKey: 'openrouter',
    displayName: 'A',
    status: 'active' as const,
    visibility: 'visible' as const,
    inputModalities: ['text'] as const,
    outputModalities: ['text'] as const,
    supportedParameters: ['temperature'],
    capabilities: {
      reasoning: false,
      tools: false,
      structuredOutputs: false,
      vision: false,
      longContext: false,
    },
    tags: [],
    firstSeenAtMs: nowMs,
    lastSeenAtMs: nowMs,
    syncedAtMs: nowMs,
    ...partial,
  }
}

function makeSnapshot(partial: Partial<ProviderCatalogSnapshot> = {}): ProviderCatalogSnapshot {
  return {
    providerKey: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    dataSource: 'models_user_primary' as const,
    fetchedAtMs: 123,
    models: [makeModel()],
    ...partial,
  }
}

describe('runCatalogSyncAtStartup scoped catalog path', () => {
  beforeEach(() => {
    vi.mocked(openRouterCatalogSource.fetchSnapshot).mockReset()
    electronMock.sessionFetch.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
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
    expect(openRouterCatalogSource.fetchSnapshot).not.toHaveBeenCalled()
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
    vi.mocked(openRouterCatalogSource.fetchSnapshot).mockResolvedValue(makeSnapshot())

    const result = await runCatalogSyncAtStartup({ store, dbWorkerManager, force: true })

    expect(result).toMatchObject({
      syncAttempted: true,
      syncSucceeded: true,
      modelCountAfter: 1,
    })
    expect(result.syncSnapshotId).toEqual(expect.any(String))
    expect(dbWorkerManager.call).toHaveBeenCalledWith('modelCatalog.writeScopedSnapshot', expect.objectContaining({
      providerKey: 'openrouter',
      catalogScopeKey: scope.catalogScopeKey,
      baseUrl: 'https://openrouter.ai/api/v1',
      dataSource: 'models_user_primary',
      snapshotId: result.syncSnapshotId,
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
    vi.mocked(openRouterCatalogSource.fetchSnapshot).mockResolvedValue(makeSnapshot({ models: [] }))

    await runCatalogSyncAtStartup({ store, dbWorkerManager, force: true })

    expect(openRouterCatalogSource.fetchSnapshot).toHaveBeenCalledTimes(1)
    expect(openRouterCatalogSource.fetchSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: rawApiKey,
      baseUrl: 'https://openrouter.ai/api/v1',
    }))
    expect(JSON.stringify(dbWorkerManager.call.mock.calls)).not.toContain(rawApiKey)
  })

  it('uses Electron session fetch for catalog sync by default instead of global fetch', async () => {
    const globalFetch = vi.fn(async () => {
      throw new Error('global fetch should not be used')
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', globalFetch)
    electronMock.sessionFetch.mockResolvedValueOnce(new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const store = createStore({
      openRouterApiKey: 'sk-startup-sync-job-secret',
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
    vi.mocked(openRouterCatalogSource.fetchSnapshot).mockImplementation(async (input: any) => {
      expect(input.fetchImpl).toBeTypeOf('function')
      await input.fetchImpl('https://openrouter.ai/api/v1/models', {
        method: 'GET',
        redirect: 'error',
      })
      return makeSnapshot({ models: [] })
    })

    const result = await runCatalogSyncAtStartup({ store, dbWorkerManager, force: true })

    expect(result).toMatchObject({
      syncAttempted: true,
      syncSucceeded: true,
      modelCountAfter: 0,
    })
    expect(result.syncSnapshotId).toEqual(expect.any(String))
    expect(electronMock.sessionFetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/models', {
      method: 'GET',
      redirect: 'error',
    })
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('preserves explicit fetchImpl injection for catalog sync tests', async () => {
    const injectedFetch = vi.fn(async () => new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
    const store = createStore({
      openRouterApiKey: 'sk-startup-sync-job-secret',
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
    vi.mocked(openRouterCatalogSource.fetchSnapshot).mockImplementation(async (input: any) => {
      expect(input.fetchImpl).toBe(injectedFetch)
      return makeSnapshot({ models: [] })
    })

    await runCatalogSyncAtStartup({
      store,
      dbWorkerManager,
      fetchImpl: injectedFetch,
      force: true,
    })

    expect(openRouterCatalogSource.fetchSnapshot).toHaveBeenCalledTimes(1)
    expect(electronMock.sessionFetch).not.toHaveBeenCalled()
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
    expect(openRouterCatalogSource.fetchSnapshot).not.toHaveBeenCalled()
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
    vi.mocked(openRouterCatalogSource.fetchSnapshot).mockRejectedValue(new Error('remote catalog unavailable'))

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
    expect(openRouterCatalogSource.fetchSnapshot).not.toHaveBeenCalled()
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
    vi.mocked(openRouterCatalogSource.fetchSnapshot).mockResolvedValue(makeSnapshot())

    const freshResult = await runCatalogSyncAtStartup({
      store,
      dbWorkerManager,
      force: false,
      freshnessMs: 24 * 60 * 60 * 1000,
    })
    expect(freshResult.reason).toBe('cache_fresh')
    expect(openRouterCatalogSource.fetchSnapshot).not.toHaveBeenCalled()

    const staleResult = await runCatalogSyncAtStartup({
      store,
      dbWorkerManager,
      force: false,
      freshnessMs: 15 * 60 * 1000,
    })
    expect(staleResult.reason).toBe('synced')
    expect(openRouterCatalogSource.fetchSnapshot).toHaveBeenCalledTimes(1)
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
    vi.mocked(openRouterCatalogSource.fetchSnapshot).mockResolvedValue(makeSnapshot())

    const result = await runCatalogSyncAtStartup({ store, dbWorkerManager, force: true })

    expect(result).toMatchObject({
      reason: 'synced',
      syncAttempted: true,
    })
    expect(result.syncSnapshotId).toEqual(expect.any(String))
    expect(openRouterCatalogSource.fetchSnapshot).toHaveBeenCalledTimes(1)
  })
})
