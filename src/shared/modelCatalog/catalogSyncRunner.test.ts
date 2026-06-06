import { describe, expect, it, vi } from 'vitest'
import { CatalogSyncRunner, type CatalogSyncRunnerMeta } from './catalogSyncRunner'

function buildMeta(partial: Partial<CatalogSyncRunnerMeta> = {}): CatalogSyncRunnerMeta {
  return {
    providerKey: 'openrouter',
    schemaVersion: 1,
    dataSource: 'models_user_primary',
    baseUrl: 'https://openrouter.ai/api/v1',
    snapshotId: 'snap_seed',
    modelCount: 100,
    visibleModelCount: 100,
    hiddenModelCount: 0,
    lastSyncAtMs: 1_000_000,
    ttlSeconds: 3600,
    syncState: 'ok',
    ...partial,
  }
}

describe('CatalogSyncRunner', () => {
  it('cold start without cache performs sync before ready', async () => {
    const readMeta = vi.fn(async () => null)
    const runSync = vi.fn(async () => ({ ok: true as const, snapshotId: 'snap_1', modelCount: 321 }))
    const onSyncSuccess = vi.fn()
    const runner = new CatalogSyncRunner({
      providerKey: 'openrouter',
      expectedSchemaVersion: 1,
      fixedTtlMs: 3600_000,
      readMeta,
      runSync,
      onSyncSuccess,
      now: () => 2_000_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    const result = await runner.run()
    expect(result).toMatchObject({
      hadCache: false,
      syncAttempted: true,
      syncSucceeded: true,
      reason: 'synced',
      modelCountBefore: 0,
      modelCountAfter: 321,
    })
    expect(runSync).toHaveBeenCalledTimes(1)
    expect(onSyncSuccess).toHaveBeenCalledWith({ snapshotId: 'snap_1', modelCount: 321 })
  })

  it('keeps old cache queryable when sync fails with cache', async () => {
    const readMeta = vi.fn(async () => buildMeta({ modelCount: 99, lastSyncAtMs: 0 }))
    const runSync = vi.fn(async () => {
      throw new Error('network down')
    })
    const runner = new CatalogSyncRunner({
      providerKey: 'openrouter',
      expectedSchemaVersion: 1,
      fixedTtlMs: 1,
      readMeta,
      runSync,
      now: () => 10_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    const result = await runner.run()
    expect(result).toMatchObject({
      hadCache: true,
      staleCache: true,
      syncAttempted: true,
      syncSucceeded: false,
      usedCacheFallback: true,
      reason: 'sync_failed_with_cache',
      modelCountBefore: 99,
      modelCountAfter: 99,
    })
  })

  it('skips sync when cache is fresh', async () => {
    const readMeta = vi.fn(async () => buildMeta({ lastSyncAtMs: 1_900_000 }))
    const runSync = vi.fn(async () => ({ ok: true as const, snapshotId: 'snap_unused', modelCount: 123 }))
    const runner = new CatalogSyncRunner({
      providerKey: 'openrouter',
      expectedSchemaVersion: 1,
      fixedTtlMs: 3600_000,
      readMeta,
      runSync,
      now: () => 2_000_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    const result = await runner.run()
    expect(result).toMatchObject({
      hadCache: true,
      staleCache: false,
      syncAttempted: false,
      reason: 'cache_fresh',
      modelCountBefore: 100,
      modelCountAfter: 100,
    })
    expect(runSync).not.toHaveBeenCalled()
  })

  it('detects schema mismatch cache as stale and retries sync', async () => {
    const readMeta = vi.fn(async () => buildMeta({ schemaVersion: 0 }))
    const runSync = vi.fn(async () => ({ ok: true as const, snapshotId: 'snap_schema', modelCount: 50 }))
    const runner = new CatalogSyncRunner({
      providerKey: 'openrouter',
      expectedSchemaVersion: 1,
      fixedTtlMs: 3600_000,
      readMeta,
      runSync,
      now: () => 2_000_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    const result = await runner.run()
    expect(result).toMatchObject({
      hadCache: true,
      staleCache: true,
      syncAttempted: true,
      syncSucceeded: true,
      reason: 'synced',
      modelCountBefore: 100,
      modelCountAfter: 50,
    })
  })

  it('force=true bypasses cache_fresh and performs sync', async () => {
    const readMeta = vi.fn(async () => buildMeta({ lastSyncAtMs: 1_900_000 }))
    const runSync = vi.fn(async () => ({ ok: true as const, snapshotId: 'snap_force', modelCount: 200 }))
    const runner = new CatalogSyncRunner({
      providerKey: 'openrouter',
      expectedSchemaVersion: 1,
      fixedTtlMs: 3600_000,
      readMeta,
      runSync,
      now: () => 2_000_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      force: true,
    })

    const result = await runner.run()
    expect(result).toMatchObject({
      hadCache: true,
      staleCache: false,
      syncAttempted: true,
      syncSucceeded: true,
      force: true,
      reason: 'synced',
      modelCountBefore: 100,
      modelCountAfter: 200,
    })
    expect(runSync).toHaveBeenCalledTimes(1)
  })

  it('force=false with fresh cache skips sync (default behavior)', async () => {
    const readMeta = vi.fn(async () => buildMeta({ lastSyncAtMs: 1_900_000 }))
    const runSync = vi.fn(async () => ({ ok: true as const, snapshotId: 'snap_unused', modelCount: 123 }))
    const runner = new CatalogSyncRunner({
      providerKey: 'openrouter',
      expectedSchemaVersion: 1,
      fixedTtlMs: 3600_000,
      readMeta,
      runSync,
      now: () => 2_000_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    const result = await runner.run()
    expect(result).toMatchObject({
      force: false,
      reason: 'cache_fresh',
    })
    expect(runSync).not.toHaveBeenCalled()
  })

  it('treats an explicit fresh empty catalog meta as cache_fresh', async () => {
    const readMeta = vi.fn(async () => buildMeta({ modelCount: 0, visibleModelCount: 0, hiddenModelCount: 0, lastSyncAtMs: 1_900_000 }))
    const runSync = vi.fn(async () => ({ ok: true as const, snapshotId: 'snap_unused', modelCount: 123 }))
    const runner = new CatalogSyncRunner({
      providerKey: 'openrouter',
      expectedSchemaVersion: 1,
      fixedTtlMs: 3600_000,
      readMeta,
      runSync,
      now: () => 2_000_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    const result = await runner.run()
    expect(result).toMatchObject({
      hadCache: false,
      syncAttempted: false,
      reason: 'cache_fresh',
      modelCountBefore: 0,
      modelCountAfter: 0,
    })
    expect(runSync).not.toHaveBeenCalled()
  })

  it('treats error meta as stale and retries sync', async () => {
    const readMeta = vi.fn(async () => buildMeta({ syncState: 'error', lastSyncAtMs: 1_900_000 }))
    const runSync = vi.fn(async () => ({ ok: true as const, snapshotId: 'snap_retry', modelCount: 123 }))
    const runner = new CatalogSyncRunner({
      providerKey: 'openrouter',
      expectedSchemaVersion: 1,
      fixedTtlMs: 3600_000,
      readMeta,
      runSync,
      now: () => 2_000_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    const result = await runner.run()
    expect(result).toMatchObject({
      staleCache: true,
      syncAttempted: true,
      reason: 'synced',
    })
    expect(runSync).toHaveBeenCalledTimes(1)
  })

  it('can propagate meta read failures for scoped DB unavailable handling', async () => {
    const readMeta = vi.fn(async () => {
      throw Object.assign(new Error('DB worker not initialized'), { code: 'ERR_UNAVAILABLE' })
    })
    const runSync = vi.fn(async () => ({ ok: true as const, snapshotId: 'snap_unused', modelCount: 123 }))
    const runner = new CatalogSyncRunner({
      providerKey: 'openrouter',
      expectedSchemaVersion: 1,
      fixedTtlMs: 3600_000,
      readMeta,
      runSync,
      now: () => 2_000_000,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      proceedOnMetaReadFailure: false,
    })

    await expect(runner.run()).rejects.toThrow('DB worker not initialized')
    expect(runSync).not.toHaveBeenCalled()
  })
})

