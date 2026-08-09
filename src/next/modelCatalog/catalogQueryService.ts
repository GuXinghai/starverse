import {
  OPENROUTER_MODEL_CATEGORIES,
  type OpenRouterModelCategory,
} from './openRouterCategoryCache'
import { logModelCatalogEvent } from './modelCatalogObservability'
import type { ProviderFailureV2 } from '../../shared/provider/providerFailureV2'
import type {
  CatalogProviderModelObservationV2,
} from '../../shared/modelCatalog/providerModelObservationV2'
import { resolveModelCapabilitiesV2, type ResolvedModelCapabilitiesV2 } from './modelCapabilityResolverV2'

type GenerationV2ModelsApi = Readonly<{
  listOpenRouter?: (options?: unknown) => Promise<unknown>
  listOpenAIResponses?: (options?: unknown) => Promise<unknown>
  listAnthropic?: (options?: unknown) => Promise<unknown>
  listGoogleAIStudio?: (options?: unknown) => Promise<unknown>
  listDeepSeek?: (options?: unknown) => Promise<unknown>
  sync?: (options: unknown) => Promise<unknown>
  status?: (options: unknown) => Promise<unknown>
  clearCurrent?: (options: unknown) => Promise<unknown>
  clearAll?: (options: unknown) => Promise<unknown>
  applyPending?: (options: unknown) => Promise<unknown>
  discardPending?: (options: unknown) => Promise<unknown>
}>

export type CatalogQuerySortBy = 'name' | 'created_at' | 'context_length' | 'max_output_tokens'
export type CatalogQuerySortOrder = 'asc' | 'desc'
export type CatalogQueryContextBucket = 'small' | 'medium' | 'large' | 'xlarge' | 'unknown'
export type CatalogQueryPriceBucket = 'cheap' | 'standard' | 'expensive' | 'unknown'
export type CatalogQueryModality = 'text' | 'image' | 'audio' | 'video' | 'file'
export type CatalogQueryNumberRange = Readonly<{
  min?: number
  max?: number
}>
export type CatalogQueryCapabilitiesFilter = Readonly<{
  reasoning?: boolean
  tools?: boolean
  structuredOutputs?: boolean
  vision?: boolean
  longContext?: boolean
}>

export type CatalogQueryCursor = Readonly<{
  sortBy: CatalogQuerySortBy
  sortOrder: CatalogQuerySortOrder
  name?: string
  createdAtSec?: number
  contextLength?: number
  maxOutputTokens?: number
  modelKey: string
  /** Immutable catalog snapshot selected by the first page of a query. */
  snapshotDigest?: string
}>

export type CatalogQueryInput = Readonly<{
  /**
   * Source catalog provider dimension.
   * Examples: openrouter, openai-direct, anthropic-direct.
   */
  sourceProviderKey: string
  /** Immutable snapshot selected by the first page of a multi-page renderer query. */
  snapshotDigest?: string
  searchText?: string
  includeDescriptionInSearch?: boolean
  filter?: Readonly<{
    /**
     * Model vendor/author dimension. Mapped to models.vendor.
     */
    vendors?: string[]
    tags?: string[]
    contextBuckets?: CatalogQueryContextBucket[]
    contextLength?: CatalogQueryNumberRange
    maxOutputTokens?: CatalogQueryNumberRange
    expiringWithinDays?: number
    priceBuckets?: CatalogQueryPriceBucket[]
    hasPerRequestLimits?: boolean
    hasDefaultParameters?: boolean
    topProviderIsModerated?: boolean
    category?: OpenRouterModelCategory
    architectureModalities?: string[]
    tokenizers?: string[]
    instructTypes?: string[]
    modalities?: CatalogQueryModality[]
    inputModalities?: CatalogQueryModality[]
    outputModalities?: CatalogQueryModality[]
    supportedParameters?: string[]
    capabilities?: CatalogQueryCapabilitiesFilter
  }>
  sort?: Readonly<{
    by?: CatalogQuerySortBy
    order?: CatalogQuerySortOrder
  }>
  page?: Readonly<{
    limit?: number
    cursor?: CatalogQueryCursor | null
  }>
}>

export type CatalogQueryItem = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
  canonicalSlug: string | null
  displayName: string
  description: string | null
  vendor: string | null
  contextLength: number | null
  maxOutputTokens: number | null
  createdAtSec: number | null
  pricing: Readonly<{
    prompt: string | null
    completion: string | null
    request: string | null
    image: string | null
    webSearch?: string | null
    internalReasoning?: string | null
    inputCacheRead?: string | null
    inputCacheWrite?: string | null
  }>
  capabilities: Readonly<{
    reasoning: boolean
    tools: boolean
    structuredOutputs: boolean
    vision: boolean
    longContext: boolean
  }>
  observation?: CatalogProviderModelObservationV2 | null
  capabilityResolution?: ResolvedModelCapabilitiesV2 | null
  family?: string | null
  status?: string | null
  visibility?: string | null
  inputModalities?: string[]
  outputModalities?: string[]
  supportedParameters?: string[]
  tags?: string[]
  architectureModality?: string | null
  tokenizer?: string | null
  instructType?: string | null
  expirationDate?: string | null
  expirationAtSec?: number | null
  unknownExpiration?: boolean
  hasPerRequestLimits?: boolean
  hasDefaultParameters?: boolean
  perRequestLimitsJson?: string | null
  defaultParametersJson?: string | null
  topProviderContextLength?: number | null
  topProviderIsModerated?: boolean | null
  firstSeenAtMs?: number | null
  lastSeenAtMs?: number | null
  syncedAtMs?: number | null
  raw?: Readonly<{
    rawJson?: string | null
    inputModalitiesJson?: string | null
    outputModalitiesJson?: string | null
    supportedParametersJson?: string | null
    capabilitiesJson?: string | null
    pricingJson?: string | null
  }>
}>

export type CatalogQueryResult = Readonly<{
  items: CatalogQueryItem[]
  nextCursor: CatalogQueryCursor | null
  authorityReadSucceeded?: boolean
  notice?: string | null
  status?: 'not_synced' | 'syncing' | 'synced' | 'failed'
  catalogRevision?: string | null
  scopeId?: string | null
  authorityRevision?: number
  pendingSnapshotDigest?: string | null
  modelCount?: number
  visibleModelCount?: number
  hiddenModelCount?: number
  lastSyncAtMs?: number
  errorCode?: string | null
  errorMessage?: string | null
  providerFailure?: ProviderFailureV2 | null
}>

function getGenerationV2ModelsApi(): GenerationV2ModelsApi | null {
  const root = (globalThis as { generationV2?: { models?: unknown } }).generationV2
  if (!root?.models || typeof root.models !== 'object') return null
  return root.models as GenerationV2ModelsApi
}

function normalizeStringArray(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const normalized = String(raw ?? '').trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out.length > 0 ? out : undefined
}

function normalizeNumberRange(input: unknown): CatalogQueryNumberRange | undefined {
  if (!input || typeof input !== 'object') return undefined
  const raw = input as Record<string, unknown>
  const min =
    typeof raw.min === 'number' && Number.isFinite(raw.min)
      ? raw.min
      : undefined
  const max =
    typeof raw.max === 'number' && Number.isFinite(raw.max)
      ? raw.max
      : undefined
  if (min === undefined && max === undefined) return undefined
  return { min, max }
}

function normalizeSingleCategory(input: unknown): OpenRouterModelCategory | undefined {
  const value = String(input ?? '').trim().toLowerCase()
  if (!value) return undefined
  const allowed = new Set<string>(OPENROUTER_MODEL_CATEGORIES)
  if (!allowed.has(value)) return undefined
  return value as OpenRouterModelCategory
}

function normalizeBooleanCapabilityFilters(input: unknown): CatalogQueryCapabilitiesFilter | undefined {
  if (!input || typeof input !== 'object') return undefined
  const raw = input as Record<string, unknown>
  const out: Partial<Record<keyof CatalogQueryCapabilitiesFilter, boolean>> = {}
  for (const key of ['reasoning', 'tools', 'structuredOutputs', 'vision', 'longContext']) {
    if (typeof raw[key] === 'boolean') out[key as keyof CatalogQueryCapabilitiesFilter] = raw[key]
  }
  return Object.keys(out).length > 0 ? out : undefined
}

function normalizeDirectStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.map((value) => String(value ?? '').trim()).filter(Boolean)
}

function summarizeFilter(input: CatalogQueryInput['filter']): Record<string, unknown> {
  const vendors = normalizeStringArray(input?.vendors)
  const tags = normalizeStringArray(input?.tags)
  const architectureModalities = normalizeStringArray(input?.architectureModalities)
  const tokenizers = normalizeStringArray(input?.tokenizers)
  const instructTypes = normalizeStringArray(input?.instructTypes)
  const modalities = normalizeStringArray(input?.modalities)
  const inputModalities = normalizeStringArray(input?.inputModalities)
  const outputModalities = normalizeStringArray(input?.outputModalities)
  const supportedParameters = normalizeStringArray(input?.supportedParameters)
  const contextBuckets = normalizeStringArray(input?.contextBuckets)
  const priceBuckets = normalizeStringArray(input?.priceBuckets)
  const category = normalizeSingleCategory(input?.category)
  return {
    vendorsCount: vendors?.length ?? 0,
    tagsCount: tags?.length ?? 0,
    contextBucketCount: contextBuckets?.length ?? 0,
    priceBucketCount: priceBuckets?.length ?? 0,
    architectureModalitiesCount: architectureModalities?.length ?? 0,
    tokenizersCount: tokenizers?.length ?? 0,
    instructTypesCount: instructTypes?.length ?? 0,
    modalitiesCount: modalities?.length ?? 0,
    inputModalitiesCount: inputModalities?.length ?? 0,
    outputModalitiesCount: outputModalities?.length ?? 0,
    supportedParametersCount: supportedParameters?.length ?? 0,
    capabilityFilterCount: Object.keys(normalizeBooleanCapabilityFilters(input?.capabilities) ?? {}).length,
    hasContextLengthRange: !!normalizeNumberRange(input?.contextLength),
    hasMaxOutputTokensRange: !!normalizeNumberRange(input?.maxOutputTokens),
    hasPerRequestLimits: typeof input?.hasPerRequestLimits === 'boolean',
    hasDefaultParameters: typeof input?.hasDefaultParameters === 'boolean',
    hasTopProviderIsModerated: typeof input?.topProviderIsModerated === 'boolean',
    hasExpiringWithinDays: typeof input?.expiringWithinDays === 'number',
    category: category ?? null,
  }
}

function normalizeCursor(input: unknown): CatalogQueryCursor | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const modelKeyRaw = String(raw.modelKey ?? '').trim()
  const modelKey = modelKeyRaw
  if (!modelKey) return null

  const sortBy: CatalogQuerySortBy =
    raw.sortBy === 'created_at' ||
    raw.sortBy === 'context_length' ||
    raw.sortBy === 'max_output_tokens'
      ? raw.sortBy
      : 'name'
  const sortOrder: CatalogQuerySortOrder = raw.sortOrder === 'desc' ? 'desc' : 'asc'

  return {
    sortBy,
    sortOrder,
    ...(typeof raw.name === 'string' ? { name: raw.name } : {}),
    ...(typeof raw.createdAtSec === 'number' && Number.isFinite(raw.createdAtSec)
      ? { createdAtSec: raw.createdAtSec }
      : {}),
    ...(typeof raw.contextLength === 'number' && Number.isFinite(raw.contextLength)
      ? { contextLength: raw.contextLength }
      : {}),
    ...(typeof raw.maxOutputTokens === 'number' && Number.isFinite(raw.maxOutputTokens)
      ? { maxOutputTokens: raw.maxOutputTokens }
      : {}),
    modelKey,
    ...(typeof raw.snapshotDigest === 'string' && raw.snapshotDigest.trim()
      ? { snapshotDigest: raw.snapshotDigest.trim() }
      : {}),
  }
}

const V2_MODEL_LIST_METHOD_BY_SOURCE = Object.freeze({
  openrouter: 'listOpenRouter',
  openai_responses: 'listOpenAIResponses',
  anthropic_messages: 'listAnthropic',
  google_ai_studio: 'listGoogleAIStudio',
  deepseek: 'listDeepSeek',
} as const)

const MAX_IMMUTABLE_SNAPSHOT_CACHE_ENTRIES = 24
const immutableSnapshotResponses = new Map<string, Record<string, unknown>>()

function immutableSnapshotCacheKey(sourceProviderKey: string, category: OpenRouterModelCategory | undefined, digest: string): string {
  return `${sourceProviderKey}\u0000${category ?? ''}\u0000${digest}`
}

function rememberImmutableSnapshotResponse(
  sourceProviderKey: string,
  category: OpenRouterModelCategory | undefined,
  response: Record<string, unknown>,
): void {
  const digest = typeof response.responseDigest === 'string' && /^[0-9a-f]{64}$/u.test(response.responseDigest)
    ? response.responseDigest
    : null
  if (!digest) return
  const key = immutableSnapshotCacheKey(sourceProviderKey, category, digest)
  immutableSnapshotResponses.delete(key)
  immutableSnapshotResponses.set(key, response)
  while (immutableSnapshotResponses.size > MAX_IMMUTABLE_SNAPSHOT_CACHE_ENTRIES) {
    const oldest = immutableSnapshotResponses.keys().next().value as string | undefined
    if (!oldest) break
    immutableSnapshotResponses.delete(oldest)
  }
}

function forgetImmutableSnapshotResponses(sourceProviderKey: string): void {
  const prefix = `${sourceProviderKey}\u0000`
  for (const key of immutableSnapshotResponses.keys()) {
    if (key.startsWith(prefix)) immutableSnapshotResponses.delete(key)
  }
}

function readRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : null
}

function normalizeItem(input: unknown): CatalogQueryItem | null {
  if (!input || typeof input !== 'object') return null
  const row = input as Record<string, unknown>
  const providerKey = String(row.providerKey ?? '').trim()
  const modelId = String(row.modelId ?? '').trim()
  const modelKey = String(row.modelKey ?? '').trim()
  const displayName = String(row.displayName ?? '').trim()
  if (!providerKey || !modelId || !modelKey || !displayName) return null
  const numberOrNull = (value: unknown): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
  const pricing = readRecord(row.pricing)
  const capabilities = readRecord(row.capabilities)
  const observation = readCatalogObservation(row.raw)
  const capabilityResolution = observation ? resolveModelCapabilitiesV2(observation) : null
  const raw = readRecord(row.raw)
  return {
    providerKey, modelId, modelKey,
    canonicalSlug: typeof row.canonicalSlug === 'string' ? row.canonicalSlug : null,
    displayName, description: typeof row.description === 'string' ? row.description : null,
    vendor: typeof row.vendor === 'string' ? row.vendor : null,
    family: typeof row.family === 'string' ? row.family : null,
    status: typeof row.status === 'string' ? row.status : null,
    visibility: typeof row.visibility === 'string' ? row.visibility : null,
    contextLength: numberOrNull(row.contextLength), maxOutputTokens: numberOrNull(row.maxOutputTokens),
    createdAtSec: numberOrNull(row.createdAtSec),
    inputModalities: normalizeDirectStringArray(row.inputModalities),
    outputModalities: normalizeDirectStringArray(row.outputModalities),
    supportedParameters: normalizeDirectStringArray(row.supportedParameters),
    tags: normalizeDirectStringArray(row.tags),
    architectureModality: typeof row.architectureModality === 'string' ? row.architectureModality : null,
    tokenizer: typeof row.tokenizer === 'string' ? row.tokenizer : null,
    instructType: typeof row.instructType === 'string' ? row.instructType : null,
    expirationDate: typeof row.expirationDate === 'string' ? row.expirationDate : null,
    expirationAtSec: numberOrNull(row.expirationAtSec), unknownExpiration: row.unknownExpiration === true || row.unknownExpiration === 1,
    hasPerRequestLimits: row.hasPerRequestLimits === true || row.hasPerRequestLimits === 1,
    hasDefaultParameters: row.hasDefaultParameters === true || row.hasDefaultParameters === 1,
    perRequestLimitsJson: typeof row.perRequestLimitsJson === 'string' ? row.perRequestLimitsJson : null,
    defaultParametersJson: typeof row.defaultParametersJson === 'string' ? row.defaultParametersJson : null,
    topProviderContextLength: numberOrNull(row.topProviderContextLength),
    topProviderIsModerated: typeof row.topProviderIsModerated === 'boolean' ? row.topProviderIsModerated
      : row.topProviderIsModerated === 1 ? true : row.topProviderIsModerated === 0 ? false : null,
    pricing: {
      prompt: typeof pricing?.prompt === 'string' ? pricing.prompt : typeof row.pricePrompt === 'string' ? row.pricePrompt : null,
      completion: typeof pricing?.completion === 'string' ? pricing.completion : typeof row.priceCompletion === 'string' ? row.priceCompletion : null,
      request: typeof pricing?.request === 'string' ? pricing.request : typeof row.priceRequest === 'string' ? row.priceRequest : null,
      image: typeof pricing?.image === 'string' ? pricing.image : typeof row.priceImage === 'string' ? row.priceImage : null,
      webSearch: typeof pricing?.webSearch === 'string' ? pricing.webSearch : null,
      internalReasoning: typeof pricing?.internalReasoning === 'string' ? pricing.internalReasoning : null,
      inputCacheRead: typeof pricing?.inputCacheRead === 'string' ? pricing.inputCacheRead : null,
      inputCacheWrite: typeof pricing?.inputCacheWrite === 'string' ? pricing.inputCacheWrite : null,
    },
    capabilities: {
      reasoning: capabilityResolution?.reasoning.enabled ?? (capabilities?.reasoning === true || row.capReasoning === 1),
      tools: capabilityResolution?.tools.enabled ?? (capabilities?.tools === true || row.capTools === 1),
      structuredOutputs: capabilityResolution?.structuredOutputs.enabled ?? (capabilities?.structuredOutputs === true || row.capStructuredOutputs === 1),
      vision: capabilityResolution?.vision.enabled ?? (capabilities?.vision === true || row.capVision === 1),
      longContext: capabilities?.longContext === true || row.capLongContext === 1,
    },
    observation,
    capabilityResolution,
    firstSeenAtMs: numberOrNull(row.firstSeenAtMs), lastSeenAtMs: numberOrNull(row.lastSeenAtMs), syncedAtMs: numberOrNull(row.syncedAtMs),
    raw: raw ? { rawJson: typeof raw.rawJson === 'string' ? raw.rawJson : null,
      inputModalitiesJson: typeof raw.inputModalitiesJson === 'string' ? raw.inputModalitiesJson : null,
      outputModalitiesJson: typeof raw.outputModalitiesJson === 'string' ? raw.outputModalitiesJson : null,
      supportedParametersJson: typeof raw.supportedParametersJson === 'string' ? raw.supportedParametersJson : null,
      capabilitiesJson: typeof raw.capabilitiesJson === 'string' ? raw.capabilitiesJson : null,
      pricingJson: typeof raw.pricingJson === 'string' ? raw.pricingJson : null } : undefined,
  }
}

function readFiniteNumber(input: unknown): number | null {
  return typeof input === 'number' && Number.isFinite(input) ? input : null
}

function readCatalogObservation(rawValue: unknown): CatalogProviderModelObservationV2 | null {
  const raw = readRecord(rawValue)
  const buckets = Array.isArray(raw?.buckets) ? raw.buckets : []
  for (const bucketValue of buckets) {
    const bucket = readRecord(bucketValue)
    const payload = readRecord(bucket?.payload)
    const candidate = readRecord(bucket?.observation) ?? readRecord(payload?.observation)
    if (candidate?.schemaVersion !== 2 || typeof candidate.providerKey !== 'string' ||
        typeof candidate.nativeModelId !== 'string' || typeof candidate.observedAtMs !== 'number' ||
        !readRecord(candidate.rawProviderRecord) || !readRecord(candidate.facts) || !readRecord(candidate.provenance)) continue
    return candidate as CatalogProviderModelObservationV2
  }
  return null
}

function v2AvailabilityItemToCatalogItem(sourceProviderKey: string, input: unknown, observedAtMs: number | null): CatalogQueryItem | null {
  const row = readRecord(input)
  if (!row) return null
  // A provider authority may return the complete reviewed catalog projection;
  // retain it instead of collapsing it to the smaller availability seed. The
  // availability projection below remains valid for providers whose official
  // model-list contract exposes only identity/capability fields.
  const complete = normalizeItem({ ...row, providerKey: sourceProviderKey })
  if (complete) return complete
  // The first-party OpenRouter authority owns the complete catalog projection.
  // Accepting an identity-only row here would silently erase the rich model
  // picker/detail capabilities that this contract promises.
  if (sourceProviderKey === 'openrouter') return null
  const modelId = String(row.modelId ?? row.nativeModelId ?? '').trim()
  if (!modelId) return null
  const inputModalities = normalizeDirectStringArray(row.inputModalities)
  const outputModalities = normalizeDirectStringArray(row.outputModalities)
  const observation = readCatalogObservation(row.raw) ?? readRecord(row.observation) as CatalogProviderModelObservationV2 | null
  const capabilityResolution = observation ? resolveModelCapabilitiesV2(observation) : null
  const reasoning = capabilityResolution?.reasoning.enabled === true
  const tools = capabilityResolution?.tools.enabled === true
  const structuredOutputs = capabilityResolution?.structuredOutputs.enabled === true
  const vision = capabilityResolution?.vision.enabled === true
  return {
    providerKey: sourceProviderKey,
    modelId,
    modelKey: `${sourceProviderKey}::${modelId}`,
    canonicalSlug: sourceProviderKey === 'openrouter' ? modelId : null,
    displayName: String(row.name ?? row.displayName ?? modelId).trim() || modelId,
    description: typeof row.description === 'string' ? row.description : null,
    vendor: typeof row.vendor === 'string' ? row.vendor : null,
    status: typeof row.status === 'string' ? row.status : 'visible',
    contextLength: readFiniteNumber(row.contextLength),
    maxOutputTokens: readFiniteNumber(row.maxOutputTokens),
    createdAtSec: null,
    inputModalities,
    outputModalities,
    supportedParameters: normalizeDirectStringArray(row.supportedParameters),
    pricing: { prompt: null, completion: null, request: null, image: null },
    capabilities: { reasoning, tools, structuredOutputs, vision, longContext: false },
    observation,
    capabilityResolution,
    firstSeenAtMs: null,
    lastSeenAtMs: observedAtMs,
    syncedAtMs: observedAtMs,
  }
}

function matchesStringSet(available: readonly string[], requested: readonly string[] | undefined): boolean {
  return !requested?.length || requested.every((value) => available.includes(value))
}

function matchesRange(value: number | null, range: CatalogQueryNumberRange | undefined): boolean {
  if (!range) return true
  return value !== null && (range.min === undefined || value >= range.min) && (range.max === undefined || value <= range.max)
}

function matchesContextBucket(value: number | null, requested: readonly string[] | undefined): boolean {
  if (!requested?.length) return true
  const bucket = value === null || value <= 0 ? 'unknown' : value < 8_192 ? 'small'
    : value < 32_768 ? 'medium' : value < 128_000 ? 'large' : 'xlarge'
  return requested.includes(bucket)
}

function matchesArchitecture(item: CatalogQueryItem, requested: readonly string[] | undefined): boolean {
  if (!requested?.length) return true
  return requested.some((raw) => {
    const [inputPart, outputPart, ...rest] = raw.toLocaleLowerCase().split('->')
    if (!outputPart || rest.length > 0) return (item.architectureModality ?? '').toLocaleLowerCase() === raw.toLocaleLowerCase()
    const requiredInput = inputPart.split('+').map((value) => value.trim()).filter(Boolean)
    const requiredOutput = outputPart.split('+').map((value) => value.trim()).filter(Boolean)
    const availableInput = (item.inputModalities ?? []).map((value) => value.toLocaleLowerCase())
    const availableOutput = (item.outputModalities ?? []).map((value) => value.toLocaleLowerCase())
    return requiredInput.every((value) => availableInput.includes(value)) && requiredOutput.every((value) => availableOutput.includes(value))
  })
}

function compareCatalogItems(a: CatalogQueryItem, b: CatalogQueryItem, sortBy: CatalogQuerySortBy, sortOrder: CatalogQuerySortOrder): number {
  const direction = sortOrder === 'asc' ? 1 : -1
  const value = (item: CatalogQueryItem): string | number => {
    if (sortBy === 'context_length') return item.contextLength ?? -1
    if (sortBy === 'max_output_tokens') return item.maxOutputTokens ?? -1
    if (sortBy === 'created_at') return item.createdAtSec ?? -1
    return item.displayName.toLocaleLowerCase()
  }
  const left = value(a)
  const right = value(b)
  if (left < right) return -1 * direction
  if (left > right) return 1 * direction
  return a.modelKey.localeCompare(b.modelKey) * direction
}

function cursorFor(
  item: CatalogQueryItem,
  sortBy: CatalogQuerySortBy,
  sortOrder: CatalogQuerySortOrder,
  snapshotDigest: string | null,
): CatalogQueryCursor {
  return { sortBy, sortOrder, name: item.displayName, createdAtSec: item.createdAtSec ?? undefined,
    contextLength: item.contextLength ?? undefined, maxOutputTokens: item.maxOutputTokens ?? undefined, modelKey: item.modelKey,
    ...(snapshotDigest ? { snapshotDigest } : {}) }
}

async function queryGenerationV2Catalog(input: Readonly<{
  sourceProviderKey: string
  api: GenerationV2ModelsApi
  searchText: string | undefined
  includeDescriptionInSearch: boolean
  vendors: string[] | undefined
  capabilities: CatalogQueryCapabilitiesFilter | undefined
  contextLength: CatalogQueryNumberRange | undefined
  maxOutputTokens: CatalogQueryNumberRange | undefined
  modalities: string[] | undefined
  inputModalities: string[] | undefined
  outputModalities: string[] | undefined
  supportedParameters: string[] | undefined
  tags: string[] | undefined
  contextBuckets: string[] | undefined
  priceBuckets: string[] | undefined
  expiringWithinDays: number | undefined
  hasPerRequestLimits: boolean | undefined
  hasDefaultParameters: boolean | undefined
  topProviderIsModerated: boolean | undefined
  architectureModalities: string[] | undefined
  tokenizers: string[] | undefined
  instructTypes: string[] | undefined
  category: OpenRouterModelCategory | undefined
  snapshotDigest: string | undefined
  sortBy: CatalogQuerySortBy
  sortOrder: CatalogQuerySortOrder
  limit: number
  cursor: CatalogQueryCursor | null
}>): Promise<CatalogQueryResult> {
  const methodName = V2_MODEL_LIST_METHOD_BY_SOURCE[input.sourceProviderKey as keyof typeof V2_MODEL_LIST_METHOD_BY_SOURCE]
  const list = methodName ? input.api[methodName] : undefined
  if (!list) return { items: [], nextCursor: null, authorityReadSucceeded: false, notice: 'This provider catalog is not available in Generation V2.', status: 'failed',
    errorCode: 'provider_catalog_unavailable', errorMessage: null }
  const cached = input.snapshotDigest
    ? immutableSnapshotResponses.get(immutableSnapshotCacheKey(input.sourceProviderKey, input.category, input.snapshotDigest)) ?? null
    : null
  const response = cached ?? readRecord(await list({ timeoutMs: 30_000,
    ...(input.snapshotDigest ? { snapshotDigest: input.snapshotDigest } : {}),
    ...(input.sourceProviderKey === 'openrouter' && input.category ? { category: input.category } : {}) }))
  if (!response || response.ok !== true) return { items: [], nextCursor: null, authorityReadSucceeded: false, notice: 'Model list is unavailable.', status: 'failed',
    errorCode: typeof response?.code === 'string' ? response.code : 'PROVIDER_CATALOG_SYNC_FAILED',
    errorMessage: typeof response?.message === 'string' ? response.message : null,
    providerFailure: response?.providerFailure && typeof response.providerFailure === 'object'
      ? response.providerFailure as ProviderFailureV2 : null }
  const responseDigest = typeof response.responseDigest === 'string' ? response.responseDigest.trim() : ''
  if (input.snapshotDigest && responseDigest !== input.snapshotDigest) {
    return { items: [], nextCursor: null, authorityReadSucceeded: false,
      notice: 'The requested immutable model catalog snapshot is unavailable.', status: 'failed',
      errorCode: 'catalog_snapshot_digest_mismatch',
      errorMessage: `Requested ${input.snapshotDigest}; authority returned ${responseDigest || '(missing)'}.` }
  }
  rememberImmutableSnapshotResponse(input.sourceProviderKey, input.category, response)
  const observedAtMs = readFiniteNumber(response.observedAtMs)
  const candidates = Array.isArray(response.items) ? response.items : Array.isArray(response.models) ? response.models : []
  const searchTokens = input.searchText?.trim().toLocaleLowerCase().split(/\s+/u)
    .filter((token) => token.length > 0).slice(0, 8) ?? []
  const all = candidates.map((row) => v2AvailabilityItemToCatalogItem(input.sourceProviderKey, row, observedAtMs))
    .filter((row): row is CatalogQueryItem => row !== null)
    .filter((item) => {
      const haystack = `${item.displayName} ${item.modelId} ${input.includeDescriptionInSearch ? item.description ?? '' : ''}`.toLocaleLowerCase()
      if (searchTokens.length > 0 && !searchTokens.every((token) => haystack.includes(token))) return false
      if (input.vendors?.length && (!item.vendor || !input.vendors.includes(item.vendor))) return false
      if (!matchesStringSet(item.tags ?? [], input.tags)) return false
      if (!matchesContextBucket(item.contextLength, input.contextBuckets)) return false
      if (input.priceBuckets?.length && !input.priceBuckets.some((bucket) => (item.tags ?? []).includes(`category:cheap_bucket:${bucket}`))) return false
      if (!matchesRange(item.contextLength, input.contextLength) || !matchesRange(item.maxOutputTokens, input.maxOutputTokens)) return false
      if (!matchesStringSet(item.inputModalities ?? [], input.inputModalities) || !matchesStringSet(item.outputModalities ?? [], input.outputModalities)) return false
      if (!matchesStringSet([...(item.inputModalities ?? []), ...(item.outputModalities ?? [])], input.modalities)) return false
      if (!matchesStringSet(item.supportedParameters ?? [], input.supportedParameters)) return false
      if (input.expiringWithinDays !== undefined) {
        const limit = Math.floor(Date.now() / 1_000) + Math.max(0, Math.floor(input.expiringWithinDays)) * 86_400
        if (item.expirationAtSec === null || item.expirationAtSec === undefined || item.expirationAtSec > limit) return false
      }
      if (input.hasPerRequestLimits !== undefined && item.hasPerRequestLimits !== input.hasPerRequestLimits) return false
      if (input.hasDefaultParameters !== undefined && item.hasDefaultParameters !== input.hasDefaultParameters) return false
      if (input.topProviderIsModerated !== undefined && item.topProviderIsModerated !== input.topProviderIsModerated) return false
      if (!matchesArchitecture(item, input.architectureModalities)) return false
      if (input.tokenizers?.length && (!item.tokenizer || !input.tokenizers.map((value) => value.toLocaleLowerCase()).includes(item.tokenizer.toLocaleLowerCase()))) return false
      if (input.instructTypes?.length && (!item.instructType || !input.instructTypes.map((value) => value.toLocaleLowerCase()).includes(item.instructType.toLocaleLowerCase()))) return false
      return !input.capabilities || Object.entries(input.capabilities).every(([key, expected]) => item.capabilities[key as keyof CatalogQueryCapabilitiesFilter] === expected)
    })
    .sort((a, b) => compareCatalogItems(a, b, input.sortBy, input.sortOrder))
  const start = input.cursor ? Math.max(0, all.findIndex((item) => item.modelKey === input.cursor?.modelKey) + 1) : 0
  const items = all.slice(start, start + input.limit)
  const lastItem = items.length > 0 ? items[items.length - 1] : null
  const hasNextPage = start + items.length < all.length
  const revision = typeof response.responseDigest === 'string' ? response.responseDigest : observedAtMs === null ? null : `${input.sourceProviderKey}:${observedAtMs}`
  const status = response.status === 'not_synced' || response.status === 'syncing' || response.status === 'failed'
    ? response.status : 'synced'
  return { items, nextCursor: hasNextPage && lastItem ? cursorFor(lastItem, input.sortBy, input.sortOrder, revision) : null,
    authorityReadSucceeded: true,
    notice: status === 'not_synced' ? 'Model catalog has not been synchronized.' : null, status, catalogRevision: revision,
    scopeId: typeof response.scopeId === 'string' ? response.scopeId : null,
    authorityRevision: readFiniteNumber(response.authorityRevision) ?? 0,
    pendingSnapshotDigest: typeof response.pendingSnapshotDigest === 'string' ? response.pendingSnapshotDigest : null,
    modelCount: readFiniteNumber(response.modelCount) ?? all.length,
    visibleModelCount: readFiniteNumber(response.visibleModelCount) ?? all.length,
    hiddenModelCount: readFiniteNumber(response.hiddenModelCount) ?? 0,
    errorCode: typeof response.errorCode === 'string' ? response.errorCode : null,
    errorMessage: typeof response.errorMessage === 'string' ? response.errorMessage : null,
    providerFailure: response.providerFailure && typeof response.providerFailure === 'object'
      ? response.providerFailure as ProviderFailureV2 : null,
    ...(observedAtMs === null ? {} : { lastSyncAtMs: observedAtMs }) }
}

export class CatalogQueryService {
  static invalidateProviderRuntimeCache(sourceProviderKey: string): void {
    forgetImmutableSnapshotResponses(String(sourceProviderKey ?? '').trim())
  }

  static async sync(input: Readonly<{
    sourceProviderKey: string
    category?: OpenRouterModelCategory
    timeoutMs?: number
    retentionMs?: number | 'never'
    applyMode?: 'automatic' | 'manual'
  }>): Promise<unknown> {
    const api = getGenerationV2ModelsApi()
    if (!api?.sync) return Object.freeze({ ok: false, code: 'model_catalog_authority_unavailable' })
    return api.sync({ providerKey: String(input.sourceProviderKey ?? '').trim(),
      ...(input.category ? { category: input.category } : {}),
      ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
      ...(input.retentionMs === undefined ? {} : { retentionMs: input.retentionMs }),
      ...(input.applyMode === undefined ? {} : { applyMode: input.applyMode }) })
  }

  static async applyPending(input: Readonly<{
    sourceProviderKey: string
    snapshotDigest: string
    category?: OpenRouterModelCategory
  }>): Promise<unknown> {
    const api = getGenerationV2ModelsApi()
    if (!api?.applyPending) return Object.freeze({ ok: false, code: 'model_catalog_authority_unavailable' })
    return api.applyPending({
      providerKey: String(input.sourceProviderKey ?? '').trim(),
      snapshotDigest: String(input.snapshotDigest ?? '').trim(),
      ...(input.category ? { category: input.category } : {}),
    })
  }

  static async discardPending(input: Readonly<{
    sourceProviderKey: string
    snapshotDigest: string
    category?: OpenRouterModelCategory
  }>): Promise<unknown> {
    const api = getGenerationV2ModelsApi()
    if (!api?.discardPending) return Object.freeze({ ok: false, code: 'model_catalog_authority_unavailable' })
    return api.discardPending({
      providerKey: String(input.sourceProviderKey ?? '').trim(),
      snapshotDigest: String(input.snapshotDigest ?? '').trim(),
      ...(input.category ? { category: input.category } : {}),
    })
  }

  static async status(input: Readonly<{ sourceProviderKey: string; category?: OpenRouterModelCategory }>): Promise<unknown> {
    const api = getGenerationV2ModelsApi()
    if (!api?.status) return Object.freeze({ ok: false, code: 'model_catalog_authority_unavailable' })
    return api.status({ providerKey: String(input.sourceProviderKey ?? '').trim(),
      ...(input.category ? { category: input.category } : {}) })
  }

  static async clearCurrent(input: Readonly<{ sourceProviderKey: string; category?: OpenRouterModelCategory }>): Promise<unknown> {
    const api = getGenerationV2ModelsApi()
    if (!api?.clearCurrent) return Object.freeze({ ok: false, code: 'model_catalog_authority_unavailable' })
    const sourceProviderKey = String(input.sourceProviderKey ?? '').trim()
    const result = await api.clearCurrent({ providerKey: sourceProviderKey,
      ...(input.category ? { category: input.category } : {}) })
    if (readRecord(result)?.ok === true) forgetImmutableSnapshotResponses(sourceProviderKey)
    return result
  }

  static async clearAll(input: Readonly<{ sourceProviderKey: string }>): Promise<unknown> {
    const api = getGenerationV2ModelsApi()
    if (!api?.clearAll) return Object.freeze({ ok: false, code: 'model_catalog_authority_unavailable' })
    const sourceProviderKey = String(input.sourceProviderKey ?? '').trim()
    const result = await api.clearAll({ providerKey: sourceProviderKey })
    if (readRecord(result)?.ok === true) forgetImmutableSnapshotResponses(sourceProviderKey)
    return result
  }

  static async query(input: CatalogQueryInput): Promise<CatalogQueryResult> {
    const startedAtMs = Date.now()
    const sourceProviderKey = String(input.sourceProviderKey ?? '').trim()
    const sortBy: CatalogQuerySortBy =
      input.sort?.by === 'created_at' ||
      input.sort?.by === 'context_length' ||
      input.sort?.by === 'max_output_tokens'
        ? input.sort.by
        : 'name'
    const sortOrder: CatalogQuerySortOrder = input.sort?.order === 'desc' ? 'desc' : 'asc'
    const limit = Math.max(1, Math.min(100, Math.floor(Number(input.page?.limit ?? 20))))
    const filterSummary = summarizeFilter(input.filter)
    const querySummary = {
      sourceProviderKey,
      sortBy,
      sortOrder,
      limit,
      hasCursor: input.page?.cursor != null,
      searchTextLength: typeof input.searchText === 'string' ? input.searchText.trim().length : 0,
      includeDescriptionInSearch: input.includeDescriptionInSearch === true,
      ...filterSummary,
    }

    if (!sourceProviderKey) {
      const notice = 'Model catalog source provider is required.'
      logModelCatalogEvent('query', 'query_degraded', {
        ...querySummary,
        stage: 'input_validation',
        reason: 'missing_source_provider_key',
        durationMs: Date.now() - startedAtMs,
      })
      return { items: [], nextCursor: null, notice }
    }

    const catalogApi = getGenerationV2ModelsApi()
    if (!catalogApi) {
      logModelCatalogEvent('query', 'query_degraded', {
        ...querySummary,
        stage: 'precondition',
        reason: 'missing_generation_v2_model_availability_ipc',
        durationMs: Date.now() - startedAtMs,
      })
      return { items: [], nextCursor: null, notice: 'Model availability bridge is unavailable.', status: 'failed' }
    }

    try {
      const singleCategory = normalizeSingleCategory(input.filter?.category)
      const effectiveCategory = singleCategory

      const unsupportedFilters = effectiveCategory && sourceProviderKey !== 'openrouter' ? ['category'] : []
      if (unsupportedFilters.length > 0) {
        const notice = 'Some filters are unavailable for the current catalog.'
        logModelCatalogEvent('query', 'query_degraded', {
          ...querySummary,
          stage: 'filter_normalization',
          reason: 'unsupported_scoped_filters',
          unsupportedFilters,
          durationMs: Date.now() - startedAtMs,
        })
        return {
          items: [],
          nextCursor: null,
          notice,
        }
      }

      const cursor = normalizeCursor(input.page?.cursor)
      const explicitSnapshotDigest = typeof input.snapshotDigest === 'string' ? input.snapshotDigest.trim() : ''
      if (explicitSnapshotDigest && cursor?.snapshotDigest && explicitSnapshotDigest !== cursor.snapshotDigest) {
        return { items: [], nextCursor: null, authorityReadSucceeded: false, status: 'failed',
          notice: 'The catalog page cursor belongs to a different immutable snapshot.',
          errorCode: 'catalog_snapshot_digest_mismatch', errorMessage: null }
      }
      const result = await queryGenerationV2Catalog({
        sourceProviderKey,
        api: catalogApi,
        searchText: typeof input.searchText === 'string' ? input.searchText : undefined,
        includeDescriptionInSearch: input.includeDescriptionInSearch === true,
        vendors: normalizeStringArray(input.filter?.vendors),
        capabilities: normalizeBooleanCapabilityFilters(input.filter?.capabilities),
        contextLength: normalizeNumberRange(input.filter?.contextLength),
        maxOutputTokens: normalizeNumberRange(input.filter?.maxOutputTokens),
        modalities: normalizeStringArray(input.filter?.modalities),
        inputModalities: normalizeStringArray(input.filter?.inputModalities),
        outputModalities: normalizeStringArray(input.filter?.outputModalities),
        supportedParameters: normalizeStringArray(input.filter?.supportedParameters),
        tags: normalizeStringArray(input.filter?.tags),
        contextBuckets: normalizeStringArray(input.filter?.contextBuckets),
        priceBuckets: normalizeStringArray(input.filter?.priceBuckets),
        expiringWithinDays: typeof input.filter?.expiringWithinDays === 'number' && Number.isFinite(input.filter.expiringWithinDays)
          ? input.filter.expiringWithinDays : undefined,
        hasPerRequestLimits: typeof input.filter?.hasPerRequestLimits === 'boolean' ? input.filter.hasPerRequestLimits : undefined,
        hasDefaultParameters: typeof input.filter?.hasDefaultParameters === 'boolean' ? input.filter.hasDefaultParameters : undefined,
        topProviderIsModerated: typeof input.filter?.topProviderIsModerated === 'boolean' ? input.filter.topProviderIsModerated : undefined,
        architectureModalities: normalizeStringArray(input.filter?.architectureModalities),
        tokenizers: normalizeStringArray(input.filter?.tokenizers),
        instructTypes: normalizeStringArray(input.filter?.instructTypes),
        category: sourceProviderKey === 'openrouter' ? effectiveCategory : undefined,
        snapshotDigest: explicitSnapshotDigest || cursor?.snapshotDigest || undefined,
        sortBy,
        sortOrder,
        limit,
        cursor,
      })
      logModelCatalogEvent('query', 'query_success', {
        ...querySummary,
        resultCount: result.items.length,
        hasNextCursor: result.nextCursor !== null,
        hasNotice: !!result.notice,
        durationMs: Date.now() - startedAtMs,
      })
      return result
    } catch (error: any) {
      logModelCatalogEvent('query', 'query_fail', {
        ...querySummary,
        stage: 'query_execution',
        durationMs: Date.now() - startedAtMs,
        reason: 'MODEL_CATALOG_QUERY_FAILED',
      })
      throw error
    }
  }
}
