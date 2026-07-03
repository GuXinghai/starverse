import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import type { ProviderCatalogKey } from '../../src/shared/modelCatalog/providerCatalogContracts'
import { readProviderCatalogSettings } from '../../src/shared/modelCatalog/providerCatalogSettings'

export type CatalogCleanupRunResult = Readonly<{
  ok: boolean
  skipped: boolean
  reason: 'retention_never' | 'cleanup_failed' | null
  deletedScopeCount: number
  deleted: Record<string, number>
}>

export async function cleanupExpiredProviderScopedCatalogCaches(input: Readonly<{
  store: Store
  dbWorkerManager: DbWorkerManager
  providerKey?: ProviderCatalogKey
  nowMs?: number
}>): Promise<CatalogCleanupRunResult> {
  const providerKey = input.providerKey ?? 'openrouter'
  try {
    const retentionMs = readProviderCatalogSettings(input.store, providerKey).retentionMs
    if (retentionMs === 'never') {
      return { ok: true, skipped: true, reason: 'retention_never', deletedScopeCount: 0, deleted: {} }
    }

    const result = await input.dbWorkerManager.call('modelCatalog.cleanupExpiredScopedCatalogCaches', {
      providerKey,
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
      providerKey,
      errorName: error instanceof Error ? error.name : typeof error,
      errorCode: (error as any)?.code ?? null,
    })
    return { ok: false, skipped: true, reason: 'cleanup_failed', deletedScopeCount: 0, deleted: {} }
  }
}
