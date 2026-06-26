import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import { runCatalogSyncAtStartup } from './catalogSyncStartup'
import type { OpenRouterCatalogCredentialStoreReader } from './openRouterCatalogCredential'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import {
  cleanupExpiredOpenRouterScopedCatalogCaches,
  clearDeprecatedOpenRouterCatalogCacheOnce,
} from './catalogCacheCleanup'
import {
  OPENROUTER_CATALOG_FRESHNESS_MS_KEY,
  OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY,
  normalizeCatalogAutoSyncPolicy,
  normalizeCatalogFreshnessMs,
} from '../../src/shared/modelCatalog/catalogSyncSettings'

type NotifyRenderer = (channel: string, payload: unknown) => void

export function wireDbEventsToRenderer(input: Readonly<{
  dbWorkerManager: DbWorkerManager
  notifyRenderer: NotifyRenderer
}>): void {
  input.dbWorkerManager.onEvent((event) => {
    input.notifyRenderer('db:event', event)
  })
}

export type StartupJobResult = Readonly<{
  postWindowNotifications: Array<Readonly<{ channel: string; payload: unknown }>>
}>

export async function runStartupBackgroundJobs(input: Readonly<{
  store: Store
  credentialService?: ProviderCredentialService
  dbWorkerManager: DbWorkerManager
  runCatalogSync?: typeof runCatalogSyncAtStartup
  cleanupExpiredScopedCaches?: typeof cleanupExpiredOpenRouterScopedCatalogCaches
  clearDeprecatedCatalogCacheOnce?: typeof clearDeprecatedOpenRouterCatalogCacheOnce
}>): Promise<StartupJobResult> {
  const postWindowNotifications: Array<Readonly<{ channel: string; payload: unknown }>> = []
  const credentialStore: OpenRouterCatalogCredentialStoreReader = {
    get: (key: string) => input.credentialService
      ? input.credentialService.getLegacyStoreValue(key)
      : input.store.get(key),
  }
  const policy = normalizeCatalogAutoSyncPolicy(input.store.get(OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY))
  if (policy !== 'never') {
    const catalogSyncResult = await (input.runCatalogSync ?? runCatalogSyncAtStartup)({
      store: input.store,
      credentialStore,
      dbWorkerManager: input.dbWorkerManager,
      force: policy === 'always',
      freshnessMs: normalizeCatalogFreshnessMs(input.store.get(OPENROUTER_CATALOG_FRESHNESS_MS_KEY)),
    })

    if (catalogSyncResult.syncSucceeded && catalogSyncResult.syncAttempted) {
      postWindowNotifications.push({
        channel: 'db:modelCatalogSynced',
        payload: {
          routerSource: 'openrouter',
          modelCount: catalogSyncResult.modelCountAfter,
          lastSyncAtMs: catalogSyncResult.lastSyncAtMs,
        },
      })
    }
  }

  try {
    await (input.cleanupExpiredScopedCaches ?? cleanupExpiredOpenRouterScopedCatalogCaches)({
      store: input.store,
      dbWorkerManager: input.dbWorkerManager,
    })
  } catch (error) {
    console.warn('[startup-jobs] catalog cleanup failed (non-fatal):', error)
  }

  try {
    await (input.clearDeprecatedCatalogCacheOnce ?? clearDeprecatedOpenRouterCatalogCacheOnce)({
      store: input.store,
      dbWorkerManager: input.dbWorkerManager,
    })
  } catch (error) {
    console.warn('[startup-jobs] deprecated catalog cleanup failed (non-fatal):', error)
  }

  return { postWindowNotifications }
}

export function startStartupBackgroundJobs(input: Readonly<{
  store: Store
  credentialService?: ProviderCredentialService
  dbWorkerManager: DbWorkerManager
  notifyRenderer: NotifyRenderer
  runJobs?: typeof runStartupBackgroundJobs
}>): void {
  const runJobs = input.runJobs ?? runStartupBackgroundJobs
  void Promise.resolve()
    .then(() => runJobs({
      store: input.store,
      credentialService: input.credentialService,
      dbWorkerManager: input.dbWorkerManager,
    }))
    .then((result) => {
      for (const notification of result.postWindowNotifications) {
        try {
          input.notifyRenderer(notification.channel, notification.payload)
        } catch (error) {
          console.warn('[startup-jobs] failed to notify renderer (non-fatal):', error)
        }
      }
    })
    .catch((error) => {
      console.warn('[startup-jobs] background jobs failed (non-fatal):', error)
    })
}
