import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import { resolveCurrentOpenRouterCatalogScope, runCatalogSyncAtStartup } from '../jobs/catalogSyncStartup'
import type { OpenRouterCatalogCredentialStoreReader } from '../jobs/openRouterCatalogCredential'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import { cleanupExpiredOpenRouterScopedCatalogCaches } from '../jobs/catalogCacheCleanup'
import { mapDbUnavailableToCode, mapErrorToSyncCode, mapMissingApiKeyToCode } from '../../src/shared/modelCatalog/catalogSyncErrorMapper'
import {
  catalogRevisionFromMeta,
  clearAllProviderCatalogCaches,
  clearCurrentProviderCatalogCache,
  freshnessMsFromStore,
  getProviderCatalogSyncStatus,
  modelCountsFromMeta,
  queryCurrentProviderCatalog,
  type CatalogClearResult,
  type ScopedQueryResult,
  type SyncStatusResult,
} from '../modelCatalog/providerCatalogQueryService'
import type { RegisterInvoke } from './types'

export const MODEL_CATALOG_SYNC_IPC_CHANNELS = [
  'modelCatalog.syncNow',
  'modelCatalog.getSyncStatus',
  'modelCatalog.queryScopedCurrent',
  'modelCatalog.repairCurrentScopedCache',
  'modelCatalog.clearCurrentScopedCache',
  'modelCatalog.clearAllOpenRouterScopedCaches',
  'modelCatalog.clearDeprecatedOpenRouterCatalogCache',
] as const

type SyncNowInput = Readonly<{
  providerKey?: string
  force?: boolean
  reason?: string
}>

type SyncNowResult = Readonly<{
  ok: boolean
  syncAttempted: boolean
  syncSucceeded: boolean
  providerKey: string
  modelCount: number
  visibleModelCount?: number
  hiddenModelCount?: number
  lastSyncAtMs: number
  errorCode: string | null
  errorMessage: string | null
  failureReasonCode: string | null
  catalogRevision: string | null
}>

const syncPromisesByScope = new Map<string, Promise<SyncNowResult>>()

async function runScopedCleanupAfterCatalogChange(input: Readonly<{
  store: Store
  dbWorkerManager: DbWorkerManager
}>): Promise<void> {
  try {
    await cleanupExpiredOpenRouterScopedCatalogCaches(input)
  } catch (error) {
    console.warn('[modelCatalog.syncNow] scoped cleanup failed after sync (non-fatal)', {
      providerKey: 'openrouter',
      errorName: error instanceof Error ? error.name : typeof error,
      errorCode: (error as any)?.code ?? null,
    })
  }
}

export function registerModelCatalogSyncIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  store: Store
  credentialService?: ProviderCredentialService
  dbWorkerManager: DbWorkerManager
  notifyRenderer: (channel: string, payload: unknown) => void
}>): string[] {
  const { registerInvoke, store, dbWorkerManager, notifyRenderer } = input
  const credentialStore: OpenRouterCatalogCredentialStoreReader = {
    get: (key: string) => input.credentialService
      ? input.credentialService.getLegacyStoreValue(key)
      : store.get(key),
  }

  const syncNowHandler = async (_event: unknown, options?: unknown): Promise<SyncNowResult> => {
    const opts = (options ?? {}) as SyncNowInput
    const providerKey = opts.providerKey ?? 'openrouter'
    const force = opts.force === true
    const scope = resolveCurrentOpenRouterCatalogScope(store, credentialStore)
    if (!scope) {
      const mapped = mapMissingApiKeyToCode()
      return {
        ok: false,
        syncAttempted: false,
        syncSucceeded: false,
        providerKey,
        modelCount: 0,
        lastSyncAtMs: 0,
        errorCode: mapped.code,
        errorMessage: mapped.message,
        failureReasonCode: mapped.code,
        catalogRevision: null,
      }
    }
    const lockKey = `${providerKey}:${scope.catalogScopeKey}`
    const existingPromise = syncPromisesByScope.get(lockKey)
    if (existingPromise) return existingPromise

    const doSync = async (): Promise<SyncNowResult> => {
      try {
        const result = await runCatalogSyncAtStartup({
          store,
          credentialStore,
          dbWorkerManager,
          force,
          freshnessMs: freshnessMsFromStore(store),
        })

        let currentMeta: Record<string, unknown> | null = null
        try {
          const rawMeta = await dbWorkerManager.call('modelCatalog.getScopedMeta', {
            providerKey,
            catalogScopeKey: scope.catalogScopeKey,
          })
          currentMeta = rawMeta && typeof rawMeta === 'object' ? rawMeta as Record<string, unknown> : null
        } catch {
          currentMeta = null
        }
        const catalogRevision = catalogRevisionFromMeta(currentMeta)
        const counts = modelCountsFromMeta(currentMeta, result.modelCountAfter)

        if (result.syncSucceeded && result.syncAttempted && result.syncSnapshotId) {
          notifyRenderer('db:modelCatalogSynced', {
            routerSource: providerKey,
            ...counts,
            lastSyncAtMs: result.lastSyncAtMs,
          })
          await runScopedCleanupAfterCatalogChange({ store, dbWorkerManager })
        }

        const isCacheFresh = !result.syncAttempted && !result.syncSucceeded && result.reason === 'cache_fresh'

        if (isCacheFresh) {
          return {
            ok: true,
            syncAttempted: false,
            syncSucceeded: true,
            providerKey,
            ...counts,
            lastSyncAtMs: result.lastSyncAtMs,
            errorCode: null,
            errorMessage: null,
            failureReasonCode: null,
            catalogRevision,
          }
        }

        let errorCode: string | null = null
        let errorMessage: string | null = null
        if (!result.syncSucceeded && result.syncAttempted) {
          if (result.reason.includes('missing_api_key')) {
            const mapped = mapMissingApiKeyToCode()
            errorCode = mapped.code
            errorMessage = mapped.message
          } else if (result.failureMessage) {
            const mapped = mapErrorToSyncCode(new Error(result.failureMessage))
            errorCode = mapped.code
            errorMessage = mapped.message || mapped.code
          }
        }

        return {
          ok: result.syncSucceeded,
          syncAttempted: result.syncAttempted,
          syncSucceeded: result.syncSucceeded,
          providerKey,
          ...counts,
          lastSyncAtMs: result.lastSyncAtMs,
          errorCode,
          errorMessage,
          failureReasonCode: errorCode,
          catalogRevision,
        }
      } catch (error) {
        const mapped = mapErrorToSyncCode(error)
        const safeErrorMessage = mapped.message || mapped.code
        console.warn('[modelCatalog.syncNow] sync exception', {
          stage: 'syncNow_handler',
          providerKey,
          force,
          errorName: error instanceof Error ? error.name : typeof error,
          errorCode: (error as any)?.code ?? null,
          errorClass: error?.constructor?.name ?? null,
          normalizedReasonCode: mapped.code,
        })
        return {
          ok: false,
          syncAttempted: true,
          syncSucceeded: false,
          providerKey,
          modelCount: 0,
          lastSyncAtMs: Date.now(),
          errorCode: mapped.code,
          errorMessage: safeErrorMessage,
          failureReasonCode: mapped.code,
          catalogRevision: null,
        }
      }
    }

    const promise = doSync()
    syncPromisesByScope.set(lockKey, promise)
    try {
      return await promise
    } finally {
      syncPromisesByScope.delete(lockKey)
    }
  }

  registerInvoke('modelCatalog.syncNow', syncNowHandler)

  registerInvoke('modelCatalog.repairCurrentScopedCache', async (event: unknown): Promise<SyncNowResult> =>
    syncNowHandler(event, { providerKey: 'openrouter', force: true, reason: 'manual_refresh' })
  )

  const queryServiceInput = {
    store,
    credentialStore,
    dbWorkerManager,
    notifyRenderer,
  } as const

  registerInvoke('modelCatalog.getSyncStatus', async (_event: unknown, options?: unknown): Promise<SyncStatusResult> => {
    return getProviderCatalogSyncStatus(queryServiceInput, options)
  })

  registerInvoke('modelCatalog.queryScopedCurrent', async (_event: unknown, options?: unknown): Promise<ScopedQueryResult> => {
    return queryCurrentProviderCatalog(queryServiceInput, options)
  })

  registerInvoke('modelCatalog.clearCurrentScopedCache', async (): Promise<CatalogClearResult> => {
    return clearCurrentProviderCatalogCache(queryServiceInput)
  })

  registerInvoke('modelCatalog.clearAllOpenRouterScopedCaches', async (): Promise<CatalogClearResult> => {
    return clearAllProviderCatalogCaches(queryServiceInput, 'openrouter')
  })

  registerInvoke('modelCatalog.clearDeprecatedOpenRouterCatalogCache', async (): Promise<CatalogClearResult> => {
    const providerKey = 'openrouter'
    try {
      const result = await dbWorkerManager.call('modelCatalog.clearDeprecatedOpenRouterCatalogCache', {}) as { deleted?: Record<string, number>; deletedScopeCount?: number } | null
      return {
        ok: true,
        providerKey,
        deleted: result?.deleted && typeof result.deleted === 'object' ? result.deleted : {},
        deletedScopeCount: Number(result?.deletedScopeCount ?? 0),
        errorCode: null,
        errorMessage: null,
      }
    } catch {
      const mapped = mapDbUnavailableToCode()
      return {
        ok: false,
        providerKey,
        deleted: {},
        deletedScopeCount: 0,
        errorCode: mapped.code,
        errorMessage: mapped.message,
      }
    }
  })

  return [...MODEL_CATALOG_SYNC_IPC_CHANNELS]
}
