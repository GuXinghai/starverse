import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CATALOG_FRESHNESS_MS,
  OPENROUTER_CATALOG_FRESHNESS_MS_KEY,
  OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY,
} from '../../src/shared/modelCatalog/catalogSyncSettings'
import { runStartupBackgroundJobs, startStartupBackgroundJobs } from './startupBackgroundJobs'

function createStore(values: Record<string, unknown> = {}) {
  return {
    get: vi.fn((key: string) => values[key]),
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

    const result = await runStartupBackgroundJobs({
      store: createStore(),
      dbWorkerManager: {} as any,
      runCatalogSync,
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
  })

  it('startup policy always forces sync with normalized freshness', async () => {
    const runCatalogSync = vi.fn(async () => makeSyncResult())

    await runStartupBackgroundJobs({
      store: createStore({
        [OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY]: 'always',
        [OPENROUTER_CATALOG_FRESHNESS_MS_KEY]: 15 * 60 * 1000,
      }),
      dbWorkerManager: {} as any,
      runCatalogSync,
    })

    expect(runCatalogSync).toHaveBeenCalledWith(expect.objectContaining({
      force: true,
      freshnessMs: 15 * 60 * 1000,
    }))
  })

  it('startup policy never skips catalog sync', async () => {
    const runCatalogSync = vi.fn(async () => makeSyncResult())

    const result = await runStartupBackgroundJobs({
      store: createStore({ [OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY]: 'never' }),
      dbWorkerManager: {} as any,
      runCatalogSync,
    })

    expect(runCatalogSync).not.toHaveBeenCalled()
    expect(result.postWindowNotifications).toEqual([])
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
