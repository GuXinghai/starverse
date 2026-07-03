import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import type { OpenRouterCatalogCredentialStoreReader } from '../jobs/openRouterCatalogCredential'
import { runCatalogSyncAtStartup } from '../jobs/catalogSyncStartup'
import type { CatalogSyncRunnerResult } from './catalogSyncRunner'
import { readProviderCatalogSettings } from '../../src/shared/modelCatalog/providerCatalogSettings'

export type ProviderCatalogStartupNotification = Readonly<{
  channel: 'db:modelCatalogSynced'
  payload: Readonly<{
    routerSource: string
    modelCount: number
    lastSyncAtMs: number
  }>
}>

export type ProviderCatalogStartupSyncInput = Readonly<{
  store: Store
  credentialStore: OpenRouterCatalogCredentialStoreReader
  dbWorkerManager: DbWorkerManager
  runCatalogSync?: typeof runCatalogSyncAtStartup
}>

export async function runProviderCatalogStartupSync(
  input: ProviderCatalogStartupSyncInput,
): Promise<ReadonlyArray<ProviderCatalogStartupNotification>> {
  const notifications: ProviderCatalogStartupNotification[] = []
  const providerKey = 'openrouter'
  const catalogSettings = readProviderCatalogSettings(input.store, providerKey)
  const policy = catalogSettings.startupSyncPolicy
  if (policy === 'never') {
    return notifications
  }

  const catalogSyncResult: CatalogSyncRunnerResult = await (input.runCatalogSync ?? runCatalogSyncAtStartup)({
    store: input.store,
    credentialStore: input.credentialStore,
    dbWorkerManager: input.dbWorkerManager,
    force: policy === 'always',
    freshnessMs: catalogSettings.freshnessMs,
  })

  if (catalogSyncResult.syncSucceeded && catalogSyncResult.syncAttempted) {
    notifications.push({
      channel: 'db:modelCatalogSynced',
      payload: {
        routerSource: providerKey,
        modelCount: catalogSyncResult.modelCountAfter,
        lastSyncAtMs: catalogSyncResult.lastSyncAtMs,
      },
    })
  }
  return notifications
}
