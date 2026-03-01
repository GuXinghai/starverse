import type Store from 'electron-store'
import { syncOpenRouterModelCatalog } from '../modelCatalog/catalogSyncJob'
import { CatalogSyncRunner, type CatalogSyncRunnerMeta, type CatalogSyncRunnerResult } from '../modelCatalog/catalogSyncRunner'
import type { DbWorkerManager } from '../db/workerManager'

const CATALOG_META_SCHEMA_VERSION = 1
const CATALOG_SYNC_FIXED_TTL_MS = 60 * 60 * 1000

function normalizeCoreMeta(raw: unknown): CatalogSyncRunnerMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const modelCount = Number(row.modelCount ?? 0)
  const visibleModelCount = Number(row.visibleModelCount ?? 0)
  const hiddenModelCount = Number(row.hiddenModelCount ?? 0)
  const lastSyncAtMs = Number(row.lastSyncAtMs ?? 0)
  const schemaVersion = Number(row.schemaVersion ?? 0)
  const ttlSeconds = Number(row.ttlSeconds ?? 0)
  const providerKey = String(row.providerKey ?? '').trim()
  const dataSource = String(row.dataSource ?? '').trim()
  const syncState = String(row.syncState ?? '').trim()
  const baseUrl = String(row.baseUrl ?? '').trim()
  const snapshotId = String(row.snapshotId ?? '').trim()

  if (!providerKey || !baseUrl || !snapshotId) return null
  if (!Number.isFinite(modelCount) || !Number.isFinite(visibleModelCount) || !Number.isFinite(hiddenModelCount)) return null
  if (!Number.isFinite(lastSyncAtMs) || !Number.isFinite(schemaVersion) || !Number.isFinite(ttlSeconds)) return null
  if (dataSource !== 'models_user_primary' && dataSource !== 'models_fallback' && dataSource !== 'mixed') return null
  if (syncState !== 'idle' && syncState !== 'syncing' && syncState !== 'ok' && syncState !== 'error') return null

  return {
    providerKey,
    schemaVersion,
    dataSource,
    baseUrl,
    snapshotId,
    modelCount,
    visibleModelCount,
    hiddenModelCount,
    lastSyncAtMs,
    ttlSeconds,
    syncState,
  }
}

export async function runCatalogSyncAtStartup(input: Readonly<{
  store: Store
  dbWorkerManager: DbWorkerManager
}>): Promise<CatalogSyncRunnerResult> {
  const providerKey = 'openrouter'
  const apiKey = String(input.store.get('openRouterApiKey') ?? '').trim()
  const baseUrl = String(input.store.get('openRouterBaseUrl') ?? '').trim() || null

  const runner = new CatalogSyncRunner({
    providerKey,
    expectedSchemaVersion: CATALOG_META_SCHEMA_VERSION,
    fixedTtlMs: CATALOG_SYNC_FIXED_TTL_MS,
    readMeta: async (targetProviderKey) => {
      const raw = await input.dbWorkerManager.call('modelCatalog.getCoreMeta', { providerKey: targetProviderKey })
      return normalizeCoreMeta(raw)
    },
    runSync: async () =>
      syncOpenRouterModelCatalog({
        apiKey,
        baseUrl,
        writer: {
          syncSnapshot: (params) => input.dbWorkerManager.call('modelCatalog.syncSnapshot', params).then(() => { }),
          syncCoreSnapshot: (params) => input.dbWorkerManager.call('modelCatalog.syncCoreSnapshot', params).then(() => { }),
        },
      }),
    onSyncSuccess: async () => {
      await input.dbWorkerManager.call('reasoningIndex.syncFromCatalog', { routerSource: providerKey })
    },
    logger: console,
  })

  const result = await runner.run()
  if (!result.syncSucceeded && result.syncAttempted) {
    console.warn('[CatalogSyncRunner] startup sync degraded', {
      providerKey,
      reason: result.reason,
      usedCacheFallback: result.usedCacheFallback,
      modelCountBefore: result.modelCountBefore,
      failureMessage: result.failureMessage ?? null,
    })
  }
  return result
}
