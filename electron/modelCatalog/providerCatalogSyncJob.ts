import { randomUUID } from 'node:crypto'
import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import { createElectronSessionProviderFetch, type ProviderFetch } from '../net/providerHttpTransport'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import type { OpenRouterCatalogCredentialStoreReader } from '../jobs/openRouterCatalogCredential'
import { resolveOpenRouterCatalogCredentialFromLegacyStore } from '../jobs/openRouterCatalogCredential'
import { mapErrorToSyncCode, mapMissingApiKeyToCode } from '../../src/shared/modelCatalog/catalogSyncErrorMapper'
import {
  DEFAULT_CATALOG_FRESHNESS_MS,
  normalizeCatalogFreshnessMs,
} from '../../src/shared/modelCatalog/catalogSyncSettings'
import { requireProviderCatalogSource } from '../../src/shared/modelCatalog/providerCatalogSourceRegistry'
import { requireProviderCatalogSourceDescriptor } from '../../src/shared/modelCatalog/providerCatalogRegistry'
import type { ProviderCatalogKnownProviderKey } from '../../src/shared/modelCatalog/providerCatalogContracts'
import { mapProviderCatalogSnapshotToScopedWriterInput } from '../../src/shared/modelCatalog/providerCatalogSnapshotMapper'
import {
  providerCredentialKeyForCatalog,
  resolveCurrentOpenRouterCatalogScope,
} from './providerCatalogScopeResolver'
import { deriveCatalogScopeFromStore } from './catalogScope'
import { CatalogSyncRunner, type CatalogSyncRunnerMeta, type CatalogSyncRunnerResult } from './catalogSyncRunner'

const CATALOG_META_SCHEMA_VERSION = 1

export type ProviderCatalogSyncJobInput = Readonly<{
  providerKey?: ProviderCatalogKnownProviderKey
  store: Store
  credentialStore?: OpenRouterCatalogCredentialStoreReader
  credentialService?: ProviderCredentialService
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

function buildMissingApiKeyResult(providerKey: ProviderCatalogKnownProviderKey): CatalogSyncRunnerResult {
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

type ResolvedProviderCatalogRuntime = Readonly<{
  apiKey: string
  normalizedBaseUrl: string
  catalogScopeKey: string
  scopeDataSource: CatalogSyncRunnerMeta['dataSource']
}>

function resolveProviderCatalogRuntime(
  input: ProviderCatalogSyncJobInput,
  providerKey: ProviderCatalogKnownProviderKey,
): ResolvedProviderCatalogRuntime | null {
  if (providerKey === 'openrouter') {
    const credentialResult = resolveOpenRouterCatalogCredentialFromLegacyStore(input.credentialStore ?? input.store)
    if (!credentialResult.ok) return null
    const scope = resolveCurrentOpenRouterCatalogScope(input.store, input.credentialStore ?? input.store)
    if (!scope) return null
    return {
      apiKey: credentialResult.credential.apiKey,
      normalizedBaseUrl: scope.normalizedBaseUrl,
      catalogScopeKey: scope.catalogScopeKey,
      scopeDataSource: scope.scopeDataSource,
    }
  }

  const credentialKey = providerCredentialKeyForCatalog(providerKey)
  if (!credentialKey || !input.credentialService) return null
  const credentialResult = input.credentialService.readApiKey(credentialKey)
  if (!credentialResult.ok) return null
  const descriptor = requireProviderCatalogSourceDescriptor(providerKey)
  const scope = deriveCatalogScopeFromStore({
    store: input.store,
    providerKey,
    apiKey: credentialResult.apiKey,
    baseUrl: descriptor.defaultBaseUrl,
    dataSource: descriptor.defaultDataSource,
  })
  return {
    apiKey: credentialResult.apiKey,
    normalizedBaseUrl: scope.normalizedBaseUrl,
    catalogScopeKey: scope.catalogScopeKey,
    scopeDataSource: scope.dataSource,
  }
}

export async function runProviderCatalogSyncJob(
  input: ProviderCatalogSyncJobInput,
): Promise<CatalogSyncRunnerResult> {
  const providerKey = input.providerKey ?? 'openrouter'
  const source = requireProviderCatalogSource(providerKey)
  const runtime = resolveProviderCatalogRuntime(input, providerKey)
  if (!runtime) {
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
        catalogScopeKey: runtime.catalogScopeKey,
      })
      const meta = normalizeScopedMeta(raw, freshnessMs)
      if (!meta) return null
      if (meta.syncState === 'ok') {
        const validation = await input.dbWorkerManager.call('modelCatalog.validateActiveScopedSnapshot', {
          providerKey: targetProviderKey,
          catalogScopeKey: runtime.catalogScopeKey,
        }) as { ok?: boolean }
        if (validation?.ok !== true) return null
      }
      return meta
    },
    runSync: async () => {
      const snapshot = await source.fetchSnapshot({
        providerKey,
        apiKey: runtime.apiKey,
        baseUrl: runtime.normalizedBaseUrl,
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
        catalogScopeKey: runtime.catalogScopeKey,
        baseUrl: runtime.normalizedBaseUrl,
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
        catalogScopeKey: runtime.catalogScopeKey,
        baseUrl: runtime.normalizedBaseUrl,
        dataSource: runtime.scopeDataSource,
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
