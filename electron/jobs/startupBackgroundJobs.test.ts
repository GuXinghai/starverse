import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CATALOG_FRESHNESS_MS,
  OPENROUTER_DEPRECATED_CATALOG_CACHE_CLEARED_AT_MS_KEY,
  OPENROUTER_CATALOG_FRESHNESS_MS_KEY,
  OPENROUTER_CATALOG_RETENTION_MS_KEY,
  OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY,
} from '../../src/shared/modelCatalog/catalogSyncSettings'
import {
  cleanupExpiredOpenRouterScopedCatalogCaches,
  clearDeprecatedOpenRouterCatalogCacheOnce,
} from './catalogCacheCleanup'
import { runStartupBackgroundJobs, startStartupBackgroundJobs } from './startupBackgroundJobs'

function createStore(values: Record<string, unknown> = {}) {
  return {
    get: vi.fn((key: string) => values[key]),
    set: vi.fn((key: string, value: unknown) => {
      values[key] = value
    }),
  } as any
}

function makeSyncResult(partial: Record<string, unknown> = {}) {
  return {
    providerKey: 'openrouter',
    startedAtMs: 100,
    finishedAtMs: 200,
    durationMs: 100,
    hadCache: false,
    staleCache: true,
    syncAttempted: true,
    syncSucceeded: true,
    usedCacheFallback: false,
    force: false,
    reason: 'synced',
    source: 'models_user_primary',
    modelCountBefore: 0,
    modelCountAfter: 2,
    lastSyncAtMs: 200,
    syncSnapshotId: 'snap-hidden',
    ...partial,
  } as any
}

describe('startupBackgroundJobs catalog policy', () => {
  it('defaults startup policy to stale_only and passes default freshness', async () => {
    const runCatalogSync = vi.fn(async () => makeSyncResult())
    const cleanupExpiredScopedCaches = vi.fn(async () => ({
      ok: true,
      skipped: false,
      reason: null,
      deletedScopeCount: 0,
      deleted: {},
    }))
    const clearDeprecatedCatalogCacheOnce = vi.fn(async () => ({
      ok: true,
      skipped: false,
      reason: null,
      deletedScopeCount: 0,
      deleted: {},
    }))

    const result = await runStartupBackgroundJobs({
      store: createStore(),
      dbWorkerManager: {} as any,
      runCatalogSync,
      cleanupExpiredScopedCaches,
      clearDeprecatedCatalogCacheOnce,
    })

    expect(runCatalogSync).toHaveBeenCalledWith(expect.objectContaining({
      force: false,
      freshnessMs: DEFAULT_CATALOG_FRESHNESS_MS,
    }))
    expect(result.postWindowNotifications).toEqual([{
      channel: 'db:modelCatalogSynced',
      payload: {
        routerSource: 'openrouter',
        modelCount: 2,
        lastSyncAtMs: 200,
      },
    }])
    expect(JSON.stringify(result.postWindowNotifications)).not.toContain('snap-hidden')
    expect(JSON.stringify(result.postWindowNotifications)).not.toContain('sk-')
    expect(cleanupExpiredScopedCaches).toHaveBeenCalledWith(expect.objectContaining({
      store: expect.anything(),
      dbWorkerManager: expect.anything(),
    }))
    expect(clearDeprecatedCatalogCacheOnce).toHaveBeenCalledWith(expect.objectContaining({
      store: expect.anything(),
      dbWorkerManager: expect.anything(),
    }))
  })

  it('startup policy always forces sync with normalized freshness', async () => {
    const runCatalogSync = vi.fn(async () => makeSyncResult())
    const cleanupExpiredScopedCaches = vi.fn(async () => ({
      ok: true,
      skipped: false,
      reason: null,
      deletedScopeCount: 0,
      deleted: {},
    }))
    const clearDeprecatedCatalogCacheOnce = vi.fn(async () => ({
      ok: true,
      skipped: false,
      reason: null,
      deletedScopeCount: 0,
      deleted: {},
    }))

    await runStartupBackgroundJobs({
      store: createStore({
        [OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY]: 'always',
        [OPENROUTER_CATALOG_FRESHNESS_MS_KEY]: 15 * 60 * 1000,
      }),
      dbWorkerManager: {} as any,
      runCatalogSync,
      cleanupExpiredScopedCaches,
      clearDeprecatedCatalogCacheOnce,
    })

    expect(runCatalogSync).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      freshnessMs: 15 * 60 * 1000,
    }))
  })

  it('startup policy never skips catalog sync', async () => {
    const runCatalogSync = vi.fn(async () => makeSyncResult())
    const cleanupExpiredScopedCaches = vi.fn(async () => ({
      ok: true,
      skipped: false,
      reason: null,
      deletedScopeCount: 0,
      deleted: {},
    }))
    const clearDeprecatedCatalogCacheOnce = vi.fn(async () => ({
      ok: true,
      skipped: false,
      reason: null,
      deletedScopeCount: 0,
      deleted: {},
    }))

    const result = await runStartupBackgroundJobs({
      store: createStore({ [OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY]: 'never' }),
      dbWorkerManager: {} as any,
      runCatalogSync,
      cleanupExpiredScopedCaches,
      clearDeprecatedCatalogCacheOnce,
    })

    expect(runCatalogSync).not.toHaveBeenCalled()
    expect(cleanupExpiredScopedCaches).toHaveBeenCalledTimes(1)
    expect(clearDeprecatedCatalogCacheOnce).toHaveBeenCalledTimes(1)
    expect(result.postWindowNotifications).toEqual([])
  })

  it('startup catalog cleanup failure does not block sync notifications', async () => {
    const runCatalogSync = vi.fn(async () => makeSyncResult())
    const cleanupExpiredScopedCaches = vi.fn(async () => {
      throw new Error('cleanup failed')
    })
    const clearDeprecatedCatalogCacheOnce = vi.fn(async () => ({
      ok: true,
      skipped: false,
      reason: null,
      deletedScopeCount: 0,
      deleted: {},
    }))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const result = await runStartupBackgroundJobs({
      store: createStore(),
      dbWorkerManager: {} as any,
      runCatalogSync,
      cleanupExpiredScopedCaches,
      clearDeprecatedCatalogCacheOnce,
    })

    expect(result.postWindowNotifications).toEqual([{
      channel: 'db:modelCatalogSynced',
      payload: {
        routerSource: 'openrouter',
        modelCount: 2,
        lastSyncAtMs: 200,
      },
    }])
    expect(warn).toHaveBeenCalledWith('[startup-jobs] catalog cleanup failed (non-fatal):', expect.any(Error))
    warn.mockRestore()
  })

  it('scheduler returns before async startup sync completes', async () => {
    let resolveRun!: (value: Awaited<ReturnType<typeof runStartupBackgroundJobs>>) => void
    const runJobs = vi.fn(() => new Promise<Awaited<ReturnType<typeof runStartupBackgroundJobs>>>((resolve) => {
      resolveRun = resolve
    }))
    const notifyRenderer = vi.fn()

    startStartupBackgroundJobs({
      store: createStore(),
      dbWorkerManager: {} as any,
      notifyRenderer,
      runJobs,
    })

    expect(runJobs).not.toHaveBeenCalled()
    await Promise.resolve()
    expect(runJobs).toHaveBeenCalledTimes(1)
    expect(notifyRenderer).not.toHaveBeenCalled()

    resolveRun({
      postWindowNotifications: [{
        channel: 'db:modelCatalogSynced',
        payload: { routerSource: 'openrouter', modelCount: 1, lastSyncAtMs: 123 },
      }],
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(notifyRenderer).toHaveBeenCalledWith('db:modelCatalogSynced', {
      routerSource: 'openrouter',
      modelCount: 1,
      lastSyncAtMs: 123,
    })
  })
})

describe('startup scoped catalog cleanup retention', () => {
  it('skips automatic cleanup when retention is never', async () => {
    const dbWorkerManager = { call: vi.fn() } as any

    const result = await cleanupExpiredOpenRouterScopedCatalogCaches({
      store: createStore({ [OPENROUTER_CATALOG_RETENTION_MS_KEY]: 'never' }),
      dbWorkerManager,
      nowMs: 1000,
    })

    expect(result).toMatchObject({ ok: true, skipped: true, reason: 'retention_never' })
    expect(dbWorkerManager.call).not.toHaveBeenCalled()
  })

  it('passes normalized retention to scoped cleanup worker method', async () => {
    const dbWorkerManager = {
      call: vi.fn(async () => ({ deleted: { catalog_scope_meta: 1 }, deletedScopeCount: 1 })),
    } as any

    const result = await cleanupExpiredOpenRouterScopedCatalogCaches({
      store: createStore({ [OPENROUTER_CATALOG_RETENTION_MS_KEY]: 7 * 24 * 60 * 60 * 1000 }),
      dbWorkerManager,
      nowMs: 1234,
    })

    expect(result).toMatchObject({ ok: true, skipped: false, deletedScopeCount: 1 })
    expect(dbWorkerManager.call).toHaveBeenCalledWith('modelCatalog.cleanupExpiredScopedCatalogCaches', {
      providerKey: 'openrouter',
      nowMs: 1234,
      retentionMs: 7 * 24 * 60 * 60 * 1000,
    })
    expect(JSON.stringify(dbWorkerManager.call.mock.calls)).not.toContain('sk-')
    expect(JSON.stringify(dbWorkerManager.call.mock.calls)).not.toContain('catalogScopeKey')
  })
})

describe('startup deprecated OpenRouter catalog cleanup', () => {
  it('runs deprecated cleanup once and records an idempotency marker without sensitive payload', async () => {
    const store = createStore()
    const dbWorkerManager = {
      call: vi.fn(async () => ({
        deleted: { model_catalog: 2, models: 2, reasoning_model_index: 1 },
        deletedScopeCount: 0,
      })),
    } as any

    const result = await clearDeprecatedOpenRouterCatalogCacheOnce({
      store,
      dbWorkerManager,
      nowMs: 12345,
    })

    expect(result).toMatchObject({ ok: true, skipped: false })
    expect(dbWorkerManager.call).toHaveBeenCalledWith('modelCatalog.clearDeprecatedOpenRouterCatalogCache', {})
    expect(store.set).toHaveBeenCalledWith(OPENROUTER_DEPRECATED_CATALOG_CACHE_CLEARED_AT_MS_KEY, 12345)
    expect(JSON.stringify(dbWorkerManager.call.mock.calls)).not.toContain('sk-')
    expect(JSON.stringify(dbWorkerManager.call.mock.calls)).not.toContain('catalogScopeKey')
  })

  it('skips deprecated cleanup when idempotency marker exists', async () => {
    const dbWorkerManager = { call: vi.fn() } as any

    const result = await clearDeprecatedOpenRouterCatalogCacheOnce({
      store: createStore({ [OPENROUTER_DEPRECATED_CATALOG_CACHE_CLEARED_AT_MS_KEY]: 12345 }),
      dbWorkerManager,
      nowMs: 99999,
    })

    expect(result).toMatchObject({ ok: true, skipped: true })
    expect(dbWorkerManager.call).not.toHaveBeenCalled()
  })

  it('deprecated cleanup failure is non-fatal and does not set the marker', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = createStore()
    const dbWorkerManager = {
      call: vi.fn(async () => {
        throw new Error('db unavailable')
      }),
    } as any

    const result = await clearDeprecatedOpenRouterCatalogCacheOnce({
      store,
      dbWorkerManager,
      nowMs: 12345,
    })

    expect(result).toMatchObject({ ok: false, skipped: true, reason: 'cleanup_failed' })
    expect(store.set).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[catalog-cache-cleanup] deprecated OpenRouter cleanup failed (non-fatal)', expect.objectContaining({
      providerKey: 'openrouter',
    }))
    warn.mockRestore()
  })
})
