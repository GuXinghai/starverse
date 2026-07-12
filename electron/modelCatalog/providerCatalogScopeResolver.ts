import type Store from 'electron-store'
import type {
  ProviderCredentialKey,
  ProviderCredentialService,
} from '../credentials/providerCredentialService'
import type { OpenRouterCatalogCredentialStoreReader } from '../jobs/openRouterCatalogCredential'
import {
  type OpenRouterCatalogLegacyCredential,
  resolveOpenRouterCatalogCredentialFromLegacyStore,
} from '../jobs/openRouterCatalogCredential'
import type {
  ProviderCatalogKey,
  ProviderCatalogKnownProviderKey,
} from '../../src/shared/modelCatalog/providerCatalogContracts'
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

export function providerCredentialKeyForCatalog(
  providerKey: ProviderCatalogKnownProviderKey,
): ProviderCredentialKey | null {
  if (providerKey === 'google_ai_studio') return 'google_ai_studio'
  if (providerKey === 'openai_responses') return 'openai_responses'
  if (providerKey === 'deepseek') return 'deepseek'
  if (providerKey === 'anthropic_messages') return 'anthropic'
  return null
}

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

export function resolveCurrentProviderCatalogScope(input: Readonly<{
  store: Store
  providerKey: ProviderCatalogKnownProviderKey
  credentialStore?: OpenRouterCatalogCredentialStoreReader
  credentialService?: ProviderCredentialService
}>): ProviderCatalogScopeContext | null {
  if (input.providerKey === 'openrouter') {
    return resolveCurrentOpenRouterCatalogScope(input.store, input.credentialStore ?? input.store)
  }

  const credentialKey = providerCredentialKeyForCatalog(input.providerKey)
  if (!credentialKey || !input.credentialService) return null
  const credentialResult = input.credentialService.readApiKey(credentialKey)
  if (!credentialResult.ok) return null
  const descriptor = requireProviderCatalogSourceDescriptor(input.providerKey)
  const scope = deriveCatalogScopeFromStore({
    store: input.store,
    providerKey: input.providerKey,
    apiKey: credentialResult.apiKey,
    baseUrl: descriptor.defaultBaseUrl,
    dataSource: descriptor.defaultDataSource,
  })
  return {
    providerKey: input.providerKey,
    normalizedBaseUrl: scope.normalizedBaseUrl,
    catalogScopeKey: scope.catalogScopeKey,
    scopeDataSource: scope.dataSource,
  }
}
