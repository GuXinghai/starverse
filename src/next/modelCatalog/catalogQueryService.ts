import {
  OPENROUTER_MODEL_CATEGORIES,
  type OpenRouterModelCategory,
} from './openRouterCategoryCache'
import { logModelCatalogEvent } from './modelCatalogObservability'

type GenerationV2ModelsApi = Readonly<{
  listOpenRouter?: (options?: unknown) => Promise<unknown>
  listOpenAIResponses?: (options?: unknown) => Promise<unknown>
  listAnthropic?: (options?: unknown) => Promise<unknown>
  listGoogleAIStudio?: (options?: unknown) => Promise<unknown>
  listDeepSeek?: (options?: unknown) => Promise<unknown>
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
  /**
   * @deprecated Legacy cursor payload fields.
   */
  providerKey?: string
  /**
   * @deprecated Legacy cursor payload fields.
   */
  modelId?: string
}>

export type CatalogQueryInput = Readonly<{
  /**
   * Source catalog provider dimension.
   * Examples: openrouter, openai-direct, anthropic-direct.
   */
  sourceProviderKey?: string
  /**
   * @deprecated Use sourceProviderKey. Kept for short-term compatibility.
   */
  providerKey?: string
  searchText?: string
  includeDescriptionInSearch?: boolean
  filter?: Readonly<{
    /**
     * Model vendor/author dimension. Mapped to models.vendor.
     */
    vendors?: string[]
    /**
     * @deprecated Use vendors. Kept for short-term compatibility.
     * Note: this is vendor/author filtering, not source provider filtering.
     */
    providers?: string[]
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
    /**
     * @deprecated Use category. Legacy multi-value field is downgraded to first value.
     */
    categories?: OpenRouterModelCategory[]
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
  family?: string | null
  status?: string | null
  visibility?: string | null
  inputModalities?: string[]
  outputModalities?: string[]
  supportedParameters?: string[]
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
  notice?: string | null
  status?: 'not_synced' | 'syncing' | 'synced' | 'failed'
  catalogRevision?: string | null
  modelCount?: number
  visibleModelCount?: number
  hiddenModelCount?: number
  lastSyncAtMs?: number
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

function normalizeCategoryArray(input: unknown): OpenRouterModelCategory[] | undefined {
  if (!Array.isArray(input)) return undefined
  const allowed = new Set<string>(OPENROUTER_MODEL_CATEGORIES)
  const out = Array.from(
    new Set(
      input
        .map((value) => String(value ?? '').trim().toLowerCase())
        .filter((value) => allowed.has(value))
    )
  ) as OpenRouterModelCategory[]
  return out.length > 0 ? out : undefined
}

function normalizeSingleCategory(input: unknown): OpenRouterModelCategory | undefined {
  const value = String(input ?? '').trim().toLowerCase()
  if (!value) return undefined
  const allowed = new Set<string>(OPENROUTER_MODEL_CATEGORIES)
  if (!allowed.has(value)) return undefined
  return value as OpenRouterModelCategory
}

function mergeUniqueStrings(...inputs: unknown[]): string[] | undefined {
  const merged: string[] = []
  for (const input of inputs) {
    const normalized = normalizeStringArray(input)
    if (normalized) merged.push(...normalized)
  }
  if (merged.length === 0) return undefined
  return Array.from(new Set(merged))
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
  const vendors = mergeUniqueStrings(input?.vendors, input?.providers)
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
  const legacyCategories = normalizeCategoryArray(input?.categories)
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
    legacyCategoriesCount: legacyCategories?.length ?? 0,
  }
}

function normalizeCursor(input: unknown): CatalogQueryCursor | null {
  if (!input || typeof input !== 'object') return null
  const raw = input as Record<string, unknown>
  const modelKeyRaw = String(raw.modelKey ?? '').trim()
  const providerKeyRaw = String(raw.providerKey ?? '').trim()
  const modelIdRaw = String(raw.modelId ?? '').trim()
  const modelKey =
    modelKeyRaw.length > 0
      ? modelKeyRaw
      : providerKeyRaw.length > 0 && modelIdRaw.length > 0
        ? `${providerKeyRaw}::${modelIdRaw}`
        : ''
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
    ...(providerKeyRaw ? { providerKey: providerKeyRaw } : {}),
    ...(modelIdRaw ? { modelId: modelIdRaw } : {}),
  }
}

function normalizeItem(input: unknown): CatalogQueryItem | null {
  if (!input || typeof input !== 'object') return null
  const row = input as Record<string, unknown>
  const providerKey = String(row.providerKey ?? '').trim()
  const modelId = String(row.modelId ?? '').trim()
  const modelKey = String(row.modelKey ?? '').trim()
  const displayName = String(row.displayName ?? '').trim()
  if (!providerKey || !modelId || !modelKey || !displayName) return null

  const numberOrNull = (value: unknown): number | null => {
    if (typeof value !== 'number') return null
    return Number.isFinite(value) ? value : null
  }
  const pricing = row.pricing && typeof row.pricing === 'object' ? row.pricing as Record<string, unknown> : null
  const capabilities = row.capabilities && typeof row.capabilities === 'object' ? row.capabilities as Record<string, unknown> : null
  const raw = row.raw && typeof row.raw === 'object' ? row.raw as Record<string, unknown> : null

  return {
    providerKey,
    modelId,
    modelKey,
    canonicalSlug: typeof row.canonicalSlug === 'string' ? row.canonicalSlug : null,
    displayName,
    description: typeof row.description === 'string' ? row.description : null,
    vendor: typeof row.vendor === 'string' ? row.vendor : null,
    family: typeof row.family === 'string' ? row.family : null,
    status: typeof row.status === 'string' ? row.status : null,
    visibility: typeof row.visibility === 'string' ? row.visibility : null,
    contextLength: numberOrNull(row.contextLength),
    maxOutputTokens: numberOrNull(row.maxOutputTokens),
    createdAtSec: numberOrNull(row.createdAtSec),
    inputModalities: normalizeDirectStringArray(row.inputModalities),
    outputModalities: normalizeDirectStringArray(row.outputModalities),
    supportedParameters: normalizeDirectStringArray(row.supportedParameters),
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
      reasoning: capabilities?.reasoning === true || row.capReasoning === 1,
      tools: capabilities?.tools === true || row.capTools === 1,
      structuredOutputs: capabilities?.structuredOutputs === true || row.capStructuredOutputs === 1,
      vision: capabilities?.vision === true || row.capVision === 1,
      longContext: capabilities?.longContext === true || row.capLongContext === 1,
    },
    firstSeenAtMs: numberOrNull(row.firstSeenAtMs),
    lastSeenAtMs: numberOrNull(row.lastSeenAtMs),
    syncedAtMs: numberOrNull(row.syncedAtMs),
    raw: raw
      ? {
          rawJson: typeof raw.rawJson === 'string' ? raw.rawJson : null,
          inputModalitiesJson: typeof raw.inputModalitiesJson === 'string' ? raw.inputModalitiesJson : null,
          outputModalitiesJson: typeof raw.outputModalitiesJson === 'string' ? raw.outputModalitiesJson : null,
          supportedParametersJson: typeof raw.supportedParametersJson === 'string' ? raw.supportedParametersJson : null,
          capabilitiesJson: typeof raw.capabilitiesJson === 'string' ? raw.capabilitiesJson : null,
          pricingJson: typeof raw.pricingJson === 'string' ? raw.pricingJson : null,
        }
      : undefined,
  }
}

const V2_MODEL_LIST_METHOD_BY_SOURCE = Object.freeze({
  openrouter: 'listOpenRouter',
  openai_responses: 'listOpenAIResponses',
  anthropic_messages: 'listAnthropic',
  google_ai_studio: 'listGoogleAIStudio',
  deepseek: 'listDeepSeek',
} as const)

function readRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : null
}

function readFiniteNumber(input: unknown): number | null {
  return typeof input === 'number' && Number.isFinite(input) ? input : null
}

function readCapabilitySeed(input: unknown): Record<string, unknown> | null {
  const record = readRecord(input)
  return record && readRecord(record.capabilitySeed) ? readRecord(record.capabilitySeed) : null
}

function v2AvailabilityItemToCatalogItem(sourceProviderKey: string, input: unknown, observedAtMs: number | null): CatalogQueryItem | null {
  const row = readRecord(input)
  if (!row) return null
  const modelId = String(row.modelId ?? row.nativeModelId ?? '').trim()
  if (!modelId) return null
  const capabilitySeed = readCapabilitySeed(row)
  const inputModalities = normalizeDirectStringArray(row.inputModalities)
  const outputModalities = normalizeDirectStringArray(row.outputModalities)
  const reasoning = capabilitySeed?.reasoning === 'supported' || capabilitySeed?.thinking === 'supported'
  const tools = capabilitySeed?.functionCalling === true || capabilitySeed?.toolUse === true
  const structuredOutputs = capabilitySeed?.structuredOutput === true
  const vision = inputModalities.includes('image') || capabilitySeed?.imageInput === true
  return {
    providerKey: sourceProviderKey,
    modelId,
    modelKey: `${sourceProviderKey}::${modelId}`,
    canonicalSlug: sourceProviderKey === 'openrouter' ? modelId : null,
    displayName: String(row.name ?? row.displayName ?? modelId).trim() || modelId,
    description: typeof row.description === 'string' ? row.description : null,
    vendor: typeof row.vendor === 'string' ? row.vendor : null,
    status: typeof row.status === 'string' ? row.status : 'visible',
    contextLength: readFiniteNumber(capabilitySeed?.contextLength),
    maxOutputTokens: readFiniteNumber(capabilitySeed?.maxOutputTokens),
    createdAtSec: null,
    inputModalities,
    outputModalities,
    supportedParameters: normalizeDirectStringArray(row.supportedParameters),
    pricing: { prompt: null, completion: null, request: null, image: null },
    capabilities: { reasoning, tools, structuredOutputs, vision, longContext: false },
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

function cursorFor(item: CatalogQueryItem, sortBy: CatalogQuerySortBy, sortOrder: CatalogQuerySortOrder): CatalogQueryCursor {
  return { sortBy, sortOrder, name: item.displayName, createdAtSec: item.createdAtSec ?? undefined,
    contextLength: item.contextLength ?? undefined, maxOutputTokens: item.maxOutputTokens ?? undefined, modelKey: item.modelKey }
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
  sortBy: CatalogQuerySortBy
  sortOrder: CatalogQuerySortOrder
  limit: number
  cursor: CatalogQueryCursor | null
}>): Promise<CatalogQueryResult> {
  const methodName = V2_MODEL_LIST_METHOD_BY_SOURCE[input.sourceProviderKey as keyof typeof V2_MODEL_LIST_METHOD_BY_SOURCE]
  const list = methodName ? input.api[methodName] : undefined
  if (!list) return { items: [], nextCursor: null, notice: 'This provider catalog is not available in Generation V2.', status: 'failed' }
  const response = readRecord(await list({ timeoutMs: 30_000 }))
  if (!response || response.ok !== true) return { items: [], nextCursor: null, notice: 'Model list is unavailable.', status: 'failed' }
  const observedAtMs = readFiniteNumber(response.observedAtMs)
  const candidates = Array.isArray(response.items) ? response.items : Array.isArray(response.models) ? response.models : []
  const searchNeedle = input.searchText?.trim().toLocaleLowerCase()
  const all = candidates.map((row) => v2AvailabilityItemToCatalogItem(input.sourceProviderKey, row, observedAtMs))
    .filter((row): row is CatalogQueryItem => row !== null)
    .filter((item) => {
      const haystack = `${item.displayName} ${item.modelId} ${input.includeDescriptionInSearch ? item.description ?? '' : ''}`.toLocaleLowerCase()
      if (searchNeedle && !haystack.includes(searchNeedle)) return false
      if (input.vendors?.length && (!item.vendor || !input.vendors.includes(item.vendor))) return false
      if (!matchesRange(item.contextLength, input.contextLength) || !matchesRange(item.maxOutputTokens, input.maxOutputTokens)) return false
      if (!matchesStringSet(item.inputModalities ?? [], input.inputModalities) || !matchesStringSet(item.outputModalities ?? [], input.outputModalities)) return false
      if (!matchesStringSet([...(item.inputModalities ?? []), ...(item.outputModalities ?? [])], input.modalities)) return false
      if (!matchesStringSet(item.supportedParameters ?? [], input.supportedParameters)) return false
      return !input.capabilities || Object.entries(input.capabilities).every(([key, expected]) => item.capabilities[key as keyof CatalogQueryCapabilitiesFilter] === expected)
    })
    .sort((a, b) => compareCatalogItems(a, b, input.sortBy, input.sortOrder))
  const start = input.cursor ? Math.max(0, all.findIndex((item) => item.modelKey === input.cursor?.modelKey) + 1) : 0
  const items = all.slice(start, start + input.limit)
  const lastItem = items.length > 0 ? items[items.length - 1] : null
  const hasNextPage = start + items.length < all.length
  const revision = typeof response.responseDigest === 'string' ? response.responseDigest : observedAtMs === null ? null : `${input.sourceProviderKey}:${observedAtMs}`
  return { items, nextCursor: hasNextPage && lastItem ? cursorFor(lastItem, input.sortBy, input.sortOrder) : null, status: 'synced', catalogRevision: revision,
    modelCount: all.length, visibleModelCount: all.length, hiddenModelCount: 0, ...(observedAtMs === null ? {} : { lastSyncAtMs: observedAtMs }) }
}

export class CatalogQueryService {
  static async query(input: CatalogQueryInput): Promise<CatalogQueryResult> {
    const startedAtMs = Date.now()
    const sourceProviderKey =
      String(input.sourceProviderKey ?? input.providerKey ?? '').trim()
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
      const legacyCategories = normalizeCategoryArray(input.filter?.categories)
      const singleCategory = normalizeSingleCategory(input.filter?.category)
      const effectiveCategory = singleCategory ?? legacyCategories?.[0]

      const unsupportedFilters = [
        ...(normalizeStringArray(input.filter?.tags)?.length ? ['tags'] : []),
        ...(normalizeStringArray(input.filter?.contextBuckets)?.length ? ['contextBuckets'] : []),
        ...(typeof input.filter?.expiringWithinDays === 'number' ? ['expiringWithinDays'] : []),
        ...(normalizeStringArray(input.filter?.priceBuckets)?.length ? ['priceBuckets'] : []),
        ...(typeof input.filter?.hasPerRequestLimits === 'boolean' ? ['hasPerRequestLimits'] : []),
        ...(typeof input.filter?.hasDefaultParameters === 'boolean' ? ['hasDefaultParameters'] : []),
        ...(typeof input.filter?.topProviderIsModerated === 'boolean' ? ['topProviderIsModerated'] : []),
        ...(normalizeStringArray(input.filter?.architectureModalities)?.length ? ['architectureModalities'] : []),
        ...(normalizeStringArray(input.filter?.tokenizers)?.length ? ['tokenizers'] : []),
        ...(normalizeStringArray(input.filter?.instructTypes)?.length ? ['instructTypes'] : []),
        ...(effectiveCategory ? ['category'] : []),
      ]
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

      const result = await queryGenerationV2Catalog({
        sourceProviderKey,
        api: catalogApi,
        searchText: typeof input.searchText === 'string' ? input.searchText : undefined,
        includeDescriptionInSearch: input.includeDescriptionInSearch === true,
        vendors: mergeUniqueStrings(input.filter?.vendors, input.filter?.providers),
        capabilities: normalizeBooleanCapabilityFilters(input.filter?.capabilities),
        contextLength: normalizeNumberRange(input.filter?.contextLength),
        maxOutputTokens: normalizeNumberRange(input.filter?.maxOutputTokens),
        modalities: normalizeStringArray(input.filter?.modalities),
        inputModalities: normalizeStringArray(input.filter?.inputModalities),
        outputModalities: normalizeStringArray(input.filter?.outputModalities),
        supportedParameters: normalizeStringArray(input.filter?.supportedParameters),
        sortBy,
        sortOrder,
        limit,
        cursor: normalizeCursor(input.page?.cursor),
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
        reason:
          typeof error?.message === 'string' && error.message.trim().length > 0
            ? error.message.trim()
            : 'unknown_error',
      })
      throw error
    }
  }
}
