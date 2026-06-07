import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import {
  OPENROUTER_DEPRECATED_CATALOG_CACHE_CLEARED_AT_MS_KEY,
  OPENROUTER_CATALOG_RETENTION_MS_KEY,
  normalizeCatalogRetentionMs,
} from '../../src/shared/modelCatalog/catalogSyncSettings'

export type CatalogCleanupRunResult = Readonly<{
  ok: boolean
  skipped: boolean
  reason: 'retention_never' | 'cleanup_failed' | null
  deletedScopeCount: number
  deleted: Record<string, number>
}>

export async function cleanupExpiredOpenRouterScopedCatalogCaches(input: Readonly<{
  store: Store
  dbWorkerManager: DbWorkerManager
  nowMs?: number
}>): Promise<CatalogCleanupRunResult> {
  try {
    const retentionMs = normalizeCatalogRetentionMs(input.store.get(OPENROUTER_CATALOG_RETENTION_MS_KEY))
    if (retentionMs === 'never') {
      return { ok: true, skipped: true, reason: 'retention_never', deletedScopeCount: 0, deleted: {} }
    }

    const result = await input.dbWorkerManager.call('modelCatalog.cleanupExpiredScopedCatalogCaches', {
      providerKey: 'openrouter',
      nowMs: input.nowMs ?? Date.now(),
      retentionMs,
    }) as { deleted?: Record<string, number>; deletedScopeCount?: number } | null
    return {
      ok: true,
      skipped: false,
      reason: null,
      deletedScopeCount: Number(result?.deletedScopeCount ?? 0),
      deleted: result?.deleted && typeof result.deleted === 'object' ? result.deleted : {},
    }
  } catch (error) {
    console.warn('[catalog-cache-cleanup] scoped cleanup failed (non-fatal)', {
      providerKey: 'openrouter',
      errorName: error instanceof Error ? error.name : typeof error,
      errorCode: (error as any)?.code ?? null,
    })
    return { ok: false, skipped: true, reason: 'cleanup_failed', deletedScopeCount: 0, deleted: {} }
  }
}

export async function clearDeprecatedOpenRouterCatalogCacheOnce(input: Readonly<{
  store: Store
  dbWorkerManager: DbWorkerManager
  nowMs?: number
}>): Promise<CatalogCleanupRunResult> {
  try {
    const clearedAtMs = Number(input.store.get(OPENROUTER_DEPRECATED_CATALOG_CACHE_CLEARED_AT_MS_KEY) ?? 0)
    if (Number.isFinite(clearedAtMs) && clearedAtMs > 0) {
      return { ok: true, skipped: true, reason: null, deletedScopeCount: 0, deleted: {} }
    }

    const result = await input.dbWorkerManager.call('modelCatalog.clearDeprecatedOpenRouterCatalogCache', {}) as {
      deleted?: Record<string, number>
      deletedScopeCount?: number
    } | null
    input.store.set(OPENROUTER_DEPRECATED_CATALOG_CACHE_CLEARED_AT_MS_KEY, input.nowMs ?? Date.now())
    return {
      ok: true,
      skipped: false,
      reason: null,
      deletedScopeCount: Number(result?.deletedScopeCount ?? 0),
      deleted: result?.deleted && typeof result.deleted === 'object' ? result.deleted : {},
    }
  } catch (error) {
    console.warn('[catalog-cache-cleanup] deprecated OpenRouter cleanup failed (non-fatal)', {
      providerKey: 'openrouter',
      errorName: error instanceof Error ? error.name : typeof error,
      errorCode: (error as any)?.code ?? null,
    })
    return { ok: false, skipped: true, reason: 'cleanup_failed', deletedScopeCount: 0, deleted: {} }
  }
}
