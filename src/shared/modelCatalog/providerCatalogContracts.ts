import type {
  CatalogModel,
  CatalogProvider,
  CatalogTimestampMs,
  ProviderAdapter,
} from './internalSchema'
import type { ProviderCatalogScopeDescriptor, ProviderCatalogScopeRequest } from './providerCatalogScope'

export type ProviderCatalogKnownProviderKey =
  | 'openrouter'
  | 'google_ai_studio'
  | 'anthropic_messages'
  | 'openai_responses'
  | 'deepseek'

export type ProviderCatalogKey = ProviderCatalogKnownProviderKey | (string & {})
export type ProviderCatalogDataSource = 'models_user_primary' | 'models_fallback' | 'mixed'

export type ProviderCatalogCredentialMode = 'required' | 'optional' | 'none'

export type ProviderCatalogSourceCapabilities = Readonly<{
  models: true
  providerDictionary: boolean
  endpointDetails: boolean
  curatedMetadata: boolean
  countProbe: boolean
  remoteSync: boolean
  supportsStartupSync: boolean
  supportsPickerOpenSync: boolean
  supportsManualSync: boolean
  requiresCredential: boolean
  scopedByCredential: boolean
  scopedByBaseUrl: boolean
}>

export type ProviderCatalogSourceDescriptor = Readonly<{
  providerKey: ProviderCatalogKey
  displayName: string
  defaultBaseUrl: string
  defaultDataSource: ProviderCatalogDataSource
  credentialMode: ProviderCatalogCredentialMode
  capabilities: ProviderCatalogSourceCapabilities
}>

export type ProviderCatalogSourceCredential =
  | Readonly<{ ok: true; apiKey: string; source: 'secure_store' | 'legacy_store' | 'test' }>
  | Readonly<{ ok: false; code: 'missing_api_key' | 'credential_unavailable'; message: string }>

export type ProviderCatalogFetchInput = Readonly<{
  providerKey: ProviderCatalogKey
  baseUrl: string
  apiKey?: string
  fetchImpl?: typeof fetch
  signal?: AbortSignal | null
  preferUserScopedModels?: boolean
  category?: string
}>

export type ProviderCatalogSnapshot = Readonly<{
  providerKey: ProviderCatalogKey
  baseUrl: string
  dataSource: ProviderCatalogDataSource
  fetchedAtMs: CatalogTimestampMs
  models: ReadonlyArray<CatalogModel>
  providers?: ReadonlyArray<CatalogProvider>
  providerCount?: number | null
  countProbe?: Readonly<{ count: number; fetchedAtMs: CatalogTimestampMs }> | null
  degradedStages?: ReadonlyArray<Readonly<{ stage: string; error: unknown }>>
}>

export type ProviderCatalogSource = Readonly<{
  descriptor: ProviderCatalogSourceDescriptor
  adapter?: ProviderAdapter
  resolveScope?: (request: ProviderCatalogScopeRequest) => Promise<ProviderCatalogScopeDescriptor> | ProviderCatalogScopeDescriptor
  resolveCredential?: () => Promise<ProviderCatalogSourceCredential> | ProviderCatalogSourceCredential
  fetchSnapshot: (input: ProviderCatalogFetchInput) => Promise<ProviderCatalogSnapshot>
}>

export class ProviderCatalogPaginationIncompleteErrorV2 extends Error {
  readonly code = 'PROVIDER_CATALOG_PAGINATION_INCOMPLETE' as const

  constructor(
    readonly providerKey: ProviderCatalogKey,
    readonly pagesFetched: number,
    readonly nextPageCursor?: string,
  ) {
    super(`${providerKey} model catalog pagination is incomplete.`)
    this.name = 'ProviderCatalogPaginationIncompleteErrorV2'
  }
}
