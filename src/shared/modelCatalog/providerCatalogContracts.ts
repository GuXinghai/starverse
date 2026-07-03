import type {
  CatalogModel,
  CatalogProvider,
  CatalogTimestampMs,
  ProviderAdapter,
} from './internalSchema'
import type {
  CatalogSyncRunnerMeta,
  CatalogSyncRunnerResult,
  CatalogSyncRunnerSyncResult,
} from './catalogSyncRunner'
import type { ProviderCatalogScopeDescriptor, ProviderCatalogScopeRequest } from './providerCatalogScope'

export type ProviderCatalogKnownProviderKey =
  | 'openrouter'
  | 'google_ai_studio'
  | 'anthropic_messages'
  | 'openai_responses'
  | 'deepseek'

export type ProviderCatalogKey = ProviderCatalogKnownProviderKey | (string & {})
export type ProviderCatalogDataSource = CatalogSyncRunnerMeta['dataSource']

export type ProviderCatalogCredentialMode = 'required' | 'optional' | 'none'

export type ProviderCatalogSourceCapabilities = Readonly<{
  models: true
  providerDictionary: boolean
  endpointDetails: boolean
  curatedMetadata: boolean
  countProbe: boolean
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
}>

export type ProviderCatalogSource = Readonly<{
  descriptor: ProviderCatalogSourceDescriptor
  adapter?: ProviderAdapter
  resolveScope?: (request: ProviderCatalogScopeRequest) => Promise<ProviderCatalogScopeDescriptor> | ProviderCatalogScopeDescriptor
  resolveCredential?: () => Promise<ProviderCatalogSourceCredential> | ProviderCatalogSourceCredential
  fetchSnapshot: (input: ProviderCatalogFetchInput) => Promise<ProviderCatalogSnapshot>
}>

export type ProviderCatalogSyncIntent = Readonly<{
  providerKey: ProviderCatalogKey
  force: boolean
  reason: 'startup' | 'model_picker_opened' | 'manual_refresh' | 'repair' | 'test'
  freshnessMs: number
}>

export type ProviderCatalogSyncCoreInput = Readonly<{
  source: ProviderCatalogSource
  scope: ProviderCatalogScopeDescriptor
  intent: ProviderCatalogSyncIntent
}>

export type ProviderCatalogSyncCoreResult = CatalogSyncRunnerResult
export type ProviderCatalogSourceSyncResult = CatalogSyncRunnerSyncResult
