import { randomUUID } from 'node:crypto'
import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import { createElectronSessionProviderFetch, type ProviderFetch } from '../net/providerHttpTransport'
import type { OpenRouterCatalogCredentialStoreReader } from '../jobs/openRouterCatalogCredential'
import { resolveOpenRouterCatalogCredentialFromLegacyStore } from '../jobs/openRouterCatalogCredential'
import { mapErrorToSyncCode, mapMissingApiKeyToCode } from '../../src/shared/modelCatalog/catalogSyncErrorMapper'
import {
  DEFAULT_CATALOG_FRESHNESS_MS,
  normalizeCatalogFreshnessMs,
} from '../../src/shared/modelCatalog/catalogSyncSettings'
import { requireProviderCatalogSource } from '../../src/shared/modelCatalog/providerCatalogSourceRegistry'
import { mapProviderCatalogSnapshotToScopedWriterInput } from '../../src/shared/modelCatalog/providerCatalogSnapshotMapper'
import { resolveCurrentOpenRouterCatalogScope } from './providerCatalogScopeResolver'
import { CatalogSyncRunner, type CatalogSyncRunnerMeta, type CatalogSyncRunnerResult } from './catalogSyncRunner'

const CATALOG_META_SCHEMA_VERSION = 1

export type ProviderCatalogSyncJobInput = Readonly<{
  providerKey?: 'openrouter'
  store: Store
  credentialStore?: OpenRouterCatalogCredentialStoreReader
  dbWorkerManager: DbWorkerManager
  fetchImpl?: ProviderFetch
  force?: boolean
  freshnessMs?: number
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

function generateProviderCatalogSnapshotId(): string {
  return `catalog-${Date.now()}-${randomUUID()}`
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

export async function runProviderCatalogSyncJob(
  input: ProviderCatalogSyncJobInput,
): Promise<CatalogSyncRunnerResult> {
  const providerKey = input.providerKey ?? 'openrouter'
  const source = requireProviderCatalogSource(providerKey)
  const credentialResult = resolveOpenRouterCatalogCredentialFromLegacyStore(input.credentialStore ?? input.store)
  if (!credentialResult.ok) {
    return buildMissingApiKeyResult(providerKey)
  }
  const credential = credentialResult.credential
  const scope = resolveCurrentOpenRouterCatalogScope(input.store, input.credentialStore ?? input.store)
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
    runSync: async () => {
      const snapshot = await source.fetchSnapshot({
        providerKey,
        apiKey: credential.apiKey,
        baseUrl: scope.normalizedBaseUrl,
        fetchImpl: input.fetchImpl ?? createElectronSessionProviderFetch(),
        preferUserScopedModels: true,
      })
      const snapshotId = generateProviderCatalogSnapshotId()
      const scopedInput = mapProviderCatalogSnapshotToScopedWriterInput({
        snapshot,
        snapshotId,
        snapshotChecksum: snapshotId,
        syncedAtMs: Date.now(),
        schemaVersion: CATALOG_META_SCHEMA_VERSION,
      })
      await input.dbWorkerManager.call('modelCatalog.writeScopedSnapshot', {
        ...scopedInput,
        providerKey,
        catalogScopeKey: scope.catalogScopeKey,
        baseUrl: scope.normalizedBaseUrl,
        schemaVersion: CATALOG_META_SCHEMA_VERSION,
      })
      return {
        ok: true,
        snapshotId,
        modelCount: snapshot.models.length,
      }
    },
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
