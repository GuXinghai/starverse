import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import { runCatalogSyncAtStartup } from './catalogSyncStartup'

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
}>): Promise<StartupJobResult> {
  const postWindowNotifications: Array<Readonly<{ channel: string; payload: unknown }>> = []
  const catalogSyncResult = await runCatalogSyncAtStartup({
    store: input.store,
    dbWorkerManager: input.dbWorkerManager,
  })

  if (catalogSyncResult.syncSucceeded && catalogSyncResult.syncAttempted && catalogSyncResult.syncSnapshotId) {
    postWindowNotifications.push({
      channel: 'db:modelCatalogSynced',
      payload: {
        routerSource: 'openrouter',
        snapshotId: catalogSyncResult.syncSnapshotId,
        modelCount: catalogSyncResult.modelCountAfter,
      },
    })
  }

  return { postWindowNotifications }
}
