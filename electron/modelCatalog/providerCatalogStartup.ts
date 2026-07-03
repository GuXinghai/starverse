import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import type { OpenRouterCatalogCredentialStoreReader } from '../jobs/openRouterCatalogCredential'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'
import { runProviderCatalogSyncJob } from './providerCatalogSyncJob'
import type { CatalogSyncRunnerResult } from './catalogSyncRunner'
import { readProviderCatalogSettings } from '../../src/shared/modelCatalog/providerCatalogSettings'
import {
  isProviderCatalogSourceKey,
  listProviderCatalogSourceDescriptors,
} from '../../src/shared/modelCatalog/providerCatalogRegistry'
import type { ProviderCatalogKnownProviderKey } from '../../src/shared/modelCatalog/providerCatalogContracts'

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
  credentialService?: ProviderCredentialService
  dbWorkerManager: DbWorkerManager
  providerKeys?: ReadonlyArray<ProviderCatalogKnownProviderKey>
  runCatalogSync?: ProviderCatalogStartupRunSync
}>

export type ProviderCatalogStartupRunSync = (input: Readonly<{
  providerKey?: ProviderCatalogKnownProviderKey
  store: Store
  credentialStore?: OpenRouterCatalogCredentialStoreReader
  credentialService?: ProviderCredentialService
  dbWorkerManager: DbWorkerManager
  force?: boolean
  freshnessMs?: number
}>) => Promise<CatalogSyncRunnerResult>

function defaultStartupProviderKeys(input: ProviderCatalogStartupSyncInput): ReadonlyArray<ProviderCatalogKnownProviderKey> {
  if (input.providerKeys) return input.providerKeys
  if (!input.credentialService) return ['openrouter']
  return listProviderCatalogSourceDescriptors()
    .map((descriptor) => descriptor.providerKey)
    .filter((providerKey): providerKey is ProviderCatalogKnownProviderKey => isProviderCatalogSourceKey(providerKey))
}

export async function runProviderCatalogStartupSync(
  input: ProviderCatalogStartupSyncInput,
): Promise<ReadonlyArray<ProviderCatalogStartupNotification>> {
  const notifications: ProviderCatalogStartupNotification[] = []
  const runCatalogSync = input.runCatalogSync ?? runProviderCatalogSyncJob
  for (const providerKey of defaultStartupProviderKeys(input)) {
    const catalogSettings = readProviderCatalogSettings(input.store, providerKey)
    const policy = catalogSettings.startupSyncPolicy
    if (policy === 'never') continue

    const catalogSyncResult: CatalogSyncRunnerResult = await runCatalogSync({
      providerKey,
      store: input.store,
      credentialStore: input.credentialStore,
      credentialService: input.credentialService,
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
  }
  return notifications
}
