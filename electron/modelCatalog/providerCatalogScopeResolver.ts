import type Store from 'electron-store'
import type { OpenRouterCatalogCredentialStoreReader } from '../jobs/openRouterCatalogCredential'
import {
  type OpenRouterCatalogLegacyCredential,
  resolveOpenRouterCatalogCredentialFromLegacyStore,
} from '../jobs/openRouterCatalogCredential'
import type { ProviderCatalogKey } from '../../src/shared/modelCatalog/providerCatalogContracts'
import { requireProviderCatalogSourceDescriptor } from '../../src/shared/modelCatalog/providerCatalogRegistry'
import {
  deriveCatalogScopeFromStore,
  type CatalogScopeDataSource,
} from './catalogScope'

const OPENROUTER_CURRENT_SCOPE_SOURCE: CatalogScopeDataSource = 'models_user_primary'

export type ProviderCatalogScopeContext = Readonly<{
  providerKey: ProviderCatalogKey
  normalizedBaseUrl: string
  catalogScopeKey: string
  scopeDataSource: CatalogScopeDataSource
}>

export type OpenRouterCatalogScopeContext = ProviderCatalogScopeContext & Readonly<{
  providerKey: 'openrouter'
}>

function resolveOpenRouterCatalogScopeFromCredential(
  store: Store,
  credential: OpenRouterCatalogLegacyCredential,
): OpenRouterCatalogScopeContext {
  const descriptor = requireProviderCatalogSourceDescriptor('openrouter')
  const scope = deriveCatalogScopeFromStore({
    store,
    providerKey: 'openrouter',
    apiKey: credential.apiKey,
    baseUrl: credential.baseUrl || descriptor.defaultBaseUrl,
    dataSource: OPENROUTER_CURRENT_SCOPE_SOURCE,
  })
  return {
    providerKey: 'openrouter',
    normalizedBaseUrl: scope.normalizedBaseUrl,
    catalogScopeKey: scope.catalogScopeKey,
    scopeDataSource: scope.dataSource,
  }
}

export function resolveCurrentOpenRouterCatalogScope(
  store: Store,
  credentialStore: OpenRouterCatalogCredentialStoreReader = store,
): OpenRouterCatalogScopeContext | null {
  const credentialResult = resolveOpenRouterCatalogCredentialFromLegacyStore(credentialStore)
  if (!credentialResult.ok) return null
  return resolveOpenRouterCatalogScopeFromCredential(store, credentialResult.credential)
}
