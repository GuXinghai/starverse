import type Store from 'electron-store'
import type { DbWorkerManager } from '../db/workerManager'
import type { ProviderFetch } from '../net/providerHttpTransport'
import { runProviderCatalogSyncJob } from '../modelCatalog/providerCatalogSyncJob'
import {
  resolveCurrentOpenRouterCatalogScope,
  type OpenRouterCatalogScopeContext,
} from '../modelCatalog/providerCatalogScopeResolver'
import type { CatalogSyncRunnerResult } from '../modelCatalog/catalogSyncRunner'
import type { OpenRouterCatalogCredentialStoreReader } from './openRouterCatalogCredential'

export type { OpenRouterCatalogScopeContext }
export { resolveCurrentOpenRouterCatalogScope }

export async function runCatalogSyncAtStartup(input: Readonly<{
  store: Store
  credentialStore?: OpenRouterCatalogCredentialStoreReader
  dbWorkerManager: DbWorkerManager
  fetchImpl?: ProviderFetch
  force?: boolean
  freshnessMs?: number
}>): Promise<CatalogSyncRunnerResult> {
  return runProviderCatalogSyncJob({
    providerKey: 'openrouter',
    ...input,
  })
}
