import type { ProviderId } from '../../constants/providers'

export type CatalogProviderKey = ProviderId | (string & {})
export type CatalogTimestampMs = number
export type CatalogModelId = string
export type CatalogCanonicalSlug = string
export type CatalogModelKey = `${string}::${string}`
export type DecimalString = string

export const CATALOG_MODEL_KEY_DELIMITER = '::' as const

export type CatalogModelStatus = 'active' | 'deprecated' | 'archived'
export type CatalogModelVisibility = 'visible' | 'hidden'

export type CatalogModality = 'text' | 'image' | 'audio' | 'video' | 'file'

export type CatalogModelCapabilities = Readonly<{
  reasoning: boolean
  tools: boolean
  structuredOutputs: boolean
  vision: boolean
  longContext: boolean
}>

export type CatalogPricing = Readonly<{
  prompt?: DecimalString | null
  completion?: DecimalString | null
  request?: DecimalString | null
  image?: DecimalString | null
  webSearch?: DecimalString | null
  internalReasoning?: DecimalString | null
  inputCacheRead?: DecimalString | null
  inputCacheWrite?: DecimalString | null
}>

export type JsonPrimitive = string | number | boolean | null
export interface JsonObject {
  readonly [key: string]: JsonValue
}
export interface JsonArray extends ReadonlyArray<JsonValue> {}
export type JsonValue = JsonPrimitive | JsonObject | JsonArray

export type CatalogRawBucket = Readonly<{
  source: 'models' | 'models_user' | 'providers' | 'endpoints'
  fetchedAtMs: CatalogTimestampMs
  baseUrl: string
  payload: JsonValue
}>

export type CatalogRawEnvelope = Readonly<{
  /**
   * Keep all source payloads that contributed to this entity so
   * newly introduced fields can be backfilled without mandatory full re-fetch.
   */
  buckets: ReadonlyArray<CatalogRawBucket>
  schemaVersion: number
}>

export type RawRetentionPolicy = Readonly<{
  retainRawPayload: boolean
  retainModelSnapshot: boolean
  maxRawBytesUnit: 'utf8_bytes'
  maxRawBytesPerEntity: number
  overflowStrategy: 'drop_raw' | 'truncate_raw'
  persistEncoding: 'json_string'
  redactPaths?: ReadonlyArray<string>
}>

export type CatalogProvider = Readonly<{
  providerKey: CatalogProviderKey
  displayName: string
  slug?: string | null
  privacyPolicyUrl?: string | null
  termsOfServiceUrl?: string | null
  statusPageUrl?: string | null
  updatedAtMs: CatalogTimestampMs
  raw?: CatalogRawEnvelope | null
}>

export type CatalogModelTagType = 'capability' | 'category' | 'vendor' | 'status' | 'custom'

export type CatalogModelTag = Readonly<{
  modelKey: CatalogModelKey
  key: string
  label: string
  type: CatalogModelTagType
  confidence: number
  source: 'derived' | 'provider' | 'manual'
  updatedAtMs: CatalogTimestampMs
}>

export type CatalogModel = Readonly<{
  modelKey: CatalogModelKey
  providerKey: CatalogProviderKey
  /**
   * Keep provider-native model identifier. For OpenRouter this is typically "author/slug".
   */
  modelId: CatalogModelId
  /**
   * Canonical slug is optional and distinct from modelId.
   */
  canonicalSlug?: CatalogCanonicalSlug | null
  displayName: string
  description?: string | null
  vendor?: string | null
  family?: string | null
  status: CatalogModelStatus
  visibility: CatalogModelVisibility
  contextLength?: number | null
  maxOutputTokens?: number | null
  architectureModality?: string | null
  inputModalities: ReadonlyArray<CatalogModality>
  outputModalities: ReadonlyArray<CatalogModality>
  tokenizer?: string | null
  instructType?: string | null
  supportedParameters: ReadonlyArray<string>
  capabilities: CatalogModelCapabilities
  pricing?: CatalogPricing | null
  perRequestLimits?: JsonValue | null
  defaultParameters?: JsonValue | null
  topProviderContextLength?: number | null
  topProviderIsModerated?: boolean | null
  createdAtSec?: number | null
  expirationDate?: string | null
  tags: ReadonlyArray<CatalogModelTag>
  firstSeenAtMs: CatalogTimestampMs
  lastSeenAtMs: CatalogTimestampMs
  syncedAtMs: CatalogTimestampMs
  raw?: CatalogRawEnvelope | null
}>

export type Provider = CatalogProvider
export type Model = CatalogModel
export type ModelTag = CatalogModelTag

export type CatalogMeta = Readonly<{
  providerKey: CatalogProviderKey
  schemaVersion: number
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  baseUrl: string
  snapshotId: string
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  providerCount?: number | null
  lastCountProbe?: number | null
  lastCountProbeAtMs?: CatalogTimestampMs | null
  lastSyncAtMs: CatalogTimestampMs
  ttlSeconds: number
  syncState: 'idle' | 'syncing' | 'ok' | 'error'
  lastErrorCode?: string | null
  lastErrorMessage?: string | null
  rawRetentionPolicy: RawRetentionPolicy
}>

export type CatalogEndpointStatus = 0 | 1 | 2 | (number & {})

export type CatalogEndpointMetric = Readonly<{
  p50?: number
  p75?: number
  p90?: number
  p99?: number
}>

/**
 * Endpoints is a phase-1 in-memory contract only.
 * Storage is intentionally deferred to a later phase.
 */
export type CatalogModelEndpoint = Readonly<{
  providerName?: string | null
  tag?: string | null
  quantization?: string | null
  contextLength?: number | null
  maxCompletionTokens?: number | null
  maxPromptTokens?: number | null
  supportedParameters?: ReadonlyArray<string>
  uptimeLast30m?: number | null
  supportsImplicitCaching?: boolean | null
  latencyLast30m?: CatalogEndpointMetric | null
  throughputLast30m?: CatalogEndpointMetric | null
  status?: CatalogEndpointStatus | null
}>

export type CatalogModelEndpoints = Readonly<{
  providerKey: CatalogProviderKey
  modelId: CatalogModelId
  author: string
  slug: string
  fetchedAtMs: CatalogTimestampMs
  endpoints: ReadonlyArray<CatalogModelEndpoint>
  raw?: CatalogRawEnvelope | null
}>

export type AdapterListModelsInput = Readonly<{
  apiKey: string
  baseUrl: string
  preferUserScopedModels: boolean
  signal?: AbortSignal | null
}>

export type AdapterListProvidersInput = Readonly<{
  apiKey: string
  baseUrl: string
  signal?: AbortSignal | null
}>

export type AdapterGetModelEndpointsInput = Readonly<{
  apiKey: string
  baseUrl: string
  modelId: CatalogModelId
  author: string
  slug: string
  signal?: AbortSignal | null
}>

export type AdapterListModelsResult = Readonly<{
  models: ReadonlyArray<CatalogModel>
  meta: Readonly<{
    primarySource: 'models_user' | 'models'
    usedFallback: boolean
    requestedAtMs: CatalogTimestampMs
    completedAtMs: CatalogTimestampMs
  }>
}>

export interface ProviderAdapter {
  readonly providerKey: CatalogProviderKey
  readonly displayName: string

  /**
   * Required capability for phase-1 catalog core.
   */
  listModels(input: AdapterListModelsInput): Promise<AdapterListModelsResult>

  /**
   * Optional capability: provider metadata dictionary.
   */
  listProviders?(input: AdapterListProvidersInput): Promise<ReadonlyArray<CatalogProvider>>

  /**
   * Optional capability: model endpoint details.
   */
  getModelEndpoints?(input: AdapterGetModelEndpointsInput): Promise<CatalogModelEndpoints | null>
}

export function buildModelKey(providerKey: CatalogProviderKey, modelId: CatalogModelId): CatalogModelKey {
  return `${providerKey}${CATALOG_MODEL_KEY_DELIMITER}${modelId}` as CatalogModelKey
}

export function parseModelKey(modelKey: CatalogModelKey): Readonly<{
  providerKey: CatalogProviderKey
  modelId: CatalogModelId
}> | null {
  const index = modelKey.indexOf(CATALOG_MODEL_KEY_DELIMITER)
  if (index <= 0) {
    return null
  }
  const providerKey = modelKey.slice(0, index).trim()
  const modelId = modelKey.slice(index + CATALOG_MODEL_KEY_DELIMITER.length).trim()
  if (!providerKey || !modelId) {
    return null
  }
  return {
    providerKey: providerKey as CatalogProviderKey,
    modelId: modelId as CatalogModelId,
  }
}
