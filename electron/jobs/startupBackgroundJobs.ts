import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import type { OpenRouterCatalogCredentialStoreReader } from './openRouterCatalogCredential'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import {
  runProviderCatalogStartupSync,
  type ProviderCatalogStartupRunSync,
} from '../modelCatalog/providerCatalogStartup'
import { cleanupExpiredProviderScopedCatalogCaches } from '../modelCatalog/providerCatalogCacheCleanup'
import { listProviderCatalogSourceDescriptors } from '../../src/shared/modelCatalog/providerCatalogRegistry'
import {
  cleanupExpiredOpenRouterScopedCatalogCaches,
  clearDeprecatedOpenRouterCatalogCacheOnce,
} from './catalogCacheCleanup'

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
  runCatalogSync?: ProviderCatalogStartupRunSync
  cleanupExpiredScopedCaches?: typeof cleanupExpiredOpenRouterScopedCatalogCaches
  clearDeprecatedCatalogCacheOnce?: typeof clearDeprecatedOpenRouterCatalogCacheOnce
}>): Promise<StartupJobResult> {
  const postWindowNotifications: Array<Readonly<{ channel: string; payload: unknown }>> = []
  const credentialStore: OpenRouterCatalogCredentialStoreReader = {
    get: (key: string) => input.credentialService
      ? input.credentialService.getLegacyStoreValue(key)
      : input.store.get(key),
  }
  postWindowNotifications.push(...await runProviderCatalogStartupSync({
    store: input.store,
    credentialStore,
    credentialService: input.credentialService,
    dbWorkerManager: input.dbWorkerManager,
    runCatalogSync: input.runCatalogSync,
  }))

  try {
    if (input.cleanupExpiredScopedCaches) {
      await input.cleanupExpiredScopedCaches({
        store: input.store,
        dbWorkerManager: input.dbWorkerManager,
      })
    } else {
      for (const descriptor of listProviderCatalogSourceDescriptors()) {
        await cleanupExpiredProviderScopedCatalogCaches({
          store: input.store,
          dbWorkerManager: input.dbWorkerManager,
          providerKey: descriptor.providerKey,
        })
      }
    }
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
