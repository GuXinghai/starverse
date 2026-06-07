import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import { runCatalogSyncAtStartup } from './catalogSyncStartup'
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
  dbWorkerManager: DbWorkerManager
  runCatalogSync?: typeof runCatalogSyncAtStartup
}>): Promise<StartupJobResult> {
  const postWindowNotifications: Array<Readonly<{ channel: string; payload: unknown }>> = []
  const policy = normalizeCatalogAutoSyncPolicy(input.store.get(OPENROUTER_CATALOG_STARTUP_SYNC_POLICY_KEY))
  if (policy === 'never') {
    return { postWindowNotifications }
  }

  const catalogSyncResult = await (input.runCatalogSync ?? runCatalogSyncAtStartup)({
    store: input.store,
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

  return { postWindowNotifications }
}

export function startStartupBackgroundJobs(input: Readonly<{
  store: Store
  dbWorkerManager: DbWorkerManager
  notifyRenderer: NotifyRenderer
  runJobs?: typeof runStartupBackgroundJobs
}>): void {
  const runJobs = input.runJobs ?? runStartupBackgroundJobs
  void Promise.resolve()
    .then(() => runJobs({
      store: input.store,
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
