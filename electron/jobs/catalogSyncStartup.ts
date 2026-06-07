import type Store from 'electron-store'
import { syncOpenRouterModelCatalog } from '../modelCatalog/catalogSyncJob'
import { CatalogSyncRunner, type CatalogSyncRunnerMeta, type CatalogSyncRunnerResult } from '../modelCatalog/catalogSyncRunner'
import type { DbWorkerManager } from '../db/workerManager'
import { mapErrorToSyncCode, mapMissingApiKeyToCode } from '../../src/shared/modelCatalog/catalogSyncErrorMapper'
import { deriveCatalogScopeFromStore, type CatalogScopeDataSource } from '../modelCatalog/catalogScope'
import {
  DEFAULT_CATALOG_FRESHNESS_MS,
  normalizeCatalogFreshnessMs,
} from '../../src/shared/modelCatalog/catalogSyncSettings'

const CATALOG_META_SCHEMA_VERSION = 1
const OPENROUTER_CURRENT_SCOPE_SOURCE: CatalogScopeDataSource = 'models_user_primary'

export type OpenRouterCatalogScopeContext = Readonly<{
  providerKey: 'openrouter'
  apiKey: string
  normalizedBaseUrl: string
  catalogScopeKey: string
  scopeDataSource: CatalogScopeDataSource
}>

function normalizeScopedMeta(raw: unknown, freshnessMs: number): CatalogSyncRunnerMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const modelCount = Number(row.modelCount ?? 0)
  const visibleModelCount = Number(row.visibleModelCount ?? 0)
  const hiddenModelCount = Number(row.hiddenModelCount ?? 0)
  const lastSyncAtMs = Number(row.lastSyncAtMs ?? 0)
  const schemaVersion = Number(row.schemaVersion ?? 0)
  const ttlSeconds = Math.floor(freshnessMs / 1000)
  const providerKey = String(row.providerKey ?? '').trim()
  const dataSource = String(row.dataSource ?? '').trim()
  const syncState = String(row.syncState ?? '').trim()
  const baseUrl = String(row.baseUrl ?? '').trim()
  const snapshotId = String(row.activeSnapshotId ?? '').trim()

  if (!providerKey || !baseUrl) return null
  if (!Number.isFinite(modelCount) || !Number.isFinite(visibleModelCount) || !Number.isFinite(hiddenModelCount)) return null
  if (!Number.isFinite(lastSyncAtMs) || !Number.isFinite(schemaVersion)) return null
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

export function resolveCurrentOpenRouterCatalogScope(store: Store): OpenRouterCatalogScopeContext | null {
  const providerKey = 'openrouter'
  const apiKey = String(store.get('openRouterApiKey') ?? '').trim()
  if (!apiKey) return null
  const baseUrl = String(store.get('openRouterBaseUrl') ?? '').trim() || null
  const scope = deriveCatalogScopeFromStore({
    store,
    providerKey,
    apiKey,
    baseUrl,
    dataSource: OPENROUTER_CURRENT_SCOPE_SOURCE,
  })
  return {
    providerKey,
    apiKey,
    normalizedBaseUrl: scope.normalizedBaseUrl,
    catalogScopeKey: scope.catalogScopeKey,
    scopeDataSource: scope.dataSource,
  }
}

function buildMissingApiKeyResult(providerKey: 'openrouter'): CatalogSyncRunnerResult {
  const nowMs = Date.now()
  return {
    providerKey,
    startedAtMs: nowMs,
    finishedAtMs: nowMs,
    durationMs: 0,
    hadCache: false,
    staleCache: false,
    syncAttempted: true,
    syncSucceeded: false,
    usedCacheFallback: false,
    force: false,
    reason: 'missing_api_key_no_cache',
    source: 'none',
    modelCountBefore: 0,
    modelCountAfter: 0,
    lastSyncAtMs: 0,
    failureMessage: 'missing_api_key',
  }
}

export async function runCatalogSyncAtStartup(input: Readonly<{
  store: Store
  dbWorkerManager: DbWorkerManager
  force?: boolean
  freshnessMs?: number
}>): Promise<CatalogSyncRunnerResult> {
  const providerKey = 'openrouter'
  const scope = resolveCurrentOpenRouterCatalogScope(input.store)
  if (!scope) {
    return buildMissingApiKeyResult(providerKey)
  }
  const freshnessMs = normalizeCatalogFreshnessMs(input.freshnessMs ?? DEFAULT_CATALOG_FRESHNESS_MS)

  const runner = new CatalogSyncRunner({
    providerKey,
    expectedSchemaVersion: CATALOG_META_SCHEMA_VERSION,
    fixedTtlMs: freshnessMs,
    readMeta: async (targetProviderKey) => {
      const raw = await input.dbWorkerManager.call('modelCatalog.getScopedMeta', {
        providerKey: targetProviderKey,
        catalogScopeKey: scope.catalogScopeKey,
      })
      const meta = normalizeScopedMeta(raw, freshnessMs)
      if (!meta) return null
      if (meta.syncState === 'ok') {
        const validation = await input.dbWorkerManager.call('modelCatalog.validateActiveScopedSnapshot', {
          providerKey: targetProviderKey,
          catalogScopeKey: scope.catalogScopeKey,
        }) as { ok?: boolean }
        if (validation?.ok !== true) return null
      }
      return meta
    },
    runSync: async () =>
      syncOpenRouterModelCatalog({
        apiKey: scope.apiKey,
        baseUrl: scope.normalizedBaseUrl,
        writer: {
          syncSnapshot: async () => { },
          writeScopedSnapshot: (params) => input.dbWorkerManager.call('modelCatalog.writeScopedSnapshot', {
            ...params,
            providerKey,
            catalogScopeKey: scope.catalogScopeKey,
            baseUrl: scope.normalizedBaseUrl,
            schemaVersion: CATALOG_META_SCHEMA_VERSION,
          }).then(() => { }),
        },
      }),
    logger: console,
    force: input.force === true,
    proceedOnMetaReadFailure: false,
  })

  const result = await runner.run()
  if (!result.syncSucceeded && result.syncAttempted) {
    const errorCode = result.reason.includes('missing_api_key')
      ? mapMissingApiKeyToCode()
      : mapErrorToSyncCode(new Error(result.failureMessage ?? 'unknown error'))

    try {
      await input.dbWorkerManager.call('modelCatalog.updateScopedMetaSyncError', {
        providerKey,
        catalogScopeKey: scope.catalogScopeKey,
        baseUrl: scope.normalizedBaseUrl,
        dataSource: scope.scopeDataSource,
        lastErrorCode: errorCode.code,
        lastErrorMessage: errorCode.message,
        atMs: Date.now(),
        schemaVersion: CATALOG_META_SCHEMA_VERSION,
      })
    } catch (writeErr) {
      console.warn('[CatalogSyncRunner] failed to write sync error to meta', { writeErr })
    }

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
