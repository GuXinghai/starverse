import { PROVIDERS } from '../../constants/providers'
import {
  OPENROUTER_MODEL_CATEGORIES,
  resolveOpenRouterCategoryMembership,
  type OpenRouterModelCategory,
} from './openRouterCategoryCache'
import { logModelCatalogEvent } from './modelCatalogObservability'

type DbBridge = Readonly<{
  invoke: (method: string, params?: unknown) => Promise<any>
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
  }>
  capabilities: Readonly<{
    reasoning: boolean
    tools: boolean
    structuredOutputs: boolean
    vision: boolean
    longContext: boolean
  }>
}>

export type CatalogQueryResult = Readonly<{
  items: CatalogQueryItem[]
  nextCursor: CatalogQueryCursor | null
  notice?: string | null
}>

function getDbBridge(): DbBridge | null {
  const bridge = (globalThis as any).dbBridge as DbBridge | undefined
  return bridge && typeof bridge.invoke === 'function' ? bridge : null
}

function getElectronStoreBridge():
  | Readonly<{ get?: (key: string) => Promise<unknown> }>
  | null {
  const store = (globalThis as any).electronStore as
    | Readonly<{ get?: (key: string) => Promise<unknown> }>
    | undefined
  if (!store || typeof store !== 'object') return null
  return store
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

function appendNotice(current: string | null, next: string): string {
  return current ? `${current} ${next}` : next
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

  return {
    providerKey,
    modelId,
    modelKey,
    canonicalSlug: typeof row.canonicalSlug === 'string' ? row.canonicalSlug : null,
    displayName,
    description: typeof row.description === 'string' ? row.description : null,
    vendor: typeof row.vendor === 'string' ? row.vendor : null,
    contextLength: numberOrNull(row.contextLength),
    maxOutputTokens: numberOrNull(row.maxOutputTokens),
    createdAtSec: numberOrNull(row.createdAtSec),
    pricing: {
      prompt: typeof row.pricePrompt === 'string' ? row.pricePrompt : null,
      completion: typeof row.priceCompletion === 'string' ? row.priceCompletion : null,
      request: typeof row.priceRequest === 'string' ? row.priceRequest : null,
      image: typeof row.priceImage === 'string' ? row.priceImage : null,
    },
    capabilities: {
      reasoning: row.capReasoning === 1,
      tools: row.capTools === 1,
      structuredOutputs: row.capStructuredOutputs === 1,
      vision: row.capVision === 1,
      longContext: row.capLongContext === 1,
    },
  }
}

export class CatalogQueryService {
  static async query(input: CatalogQueryInput = {}): Promise<CatalogQueryResult> {
    const startedAtMs = Date.now()
    const sourceProviderKey =
      String(input.sourceProviderKey ?? input.providerKey ?? PROVIDERS.OPENROUTER).trim() || PROVIDERS.OPENROUTER
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
      ...filterSummary,
    }

    const bridge = getDbBridge()
    if (!bridge) {
      logModelCatalogEvent('query', 'query_degraded', {
        ...querySummary,
        stage: 'precondition',
        reason: 'missing_dbBridge',
        durationMs: Date.now() - startedAtMs,
      })
      return { items: [], nextCursor: null, notice: null }
    }

    try {
      let categoryNotice: string | null = null
      let modelIdsByCategory: string[] | undefined
      let categoryCacheState: 'none' | 'hit' | 'miss' | 'stale' | 'unresolved' = 'none'
      const legacyCategories = normalizeCategoryArray(input.filter?.categories)
      const singleCategory = normalizeSingleCategory(input.filter?.category)
      const effectiveCategory = singleCategory ?? legacyCategories?.[0]
      if (Array.isArray(input.filter?.categories)) {
        categoryNotice = appendNotice(
          categoryNotice,
          'Deprecated filter.categories detected; category filter is single-select and uses the first category.'
        )
      }

      if (effectiveCategory) {
        if (sourceProviderKey !== PROVIDERS.OPENROUTER) {
          const notice = appendNotice(
            categoryNotice,
            'Category filter currently supports openrouter source only.'
          )
          logModelCatalogEvent('query', 'query_degraded', {
            ...querySummary,
            stage: 'category_resolution',
            reason: 'unsupported_source_provider_for_category',
            category: effectiveCategory,
            notice,
            durationMs: Date.now() - startedAtMs,
          })
          return {
            items: [],
            nextCursor: null,
            notice,
          }
        }

        const store = getElectronStoreBridge()
        const apiKey =
          store?.get && typeof store.get === 'function'
            ? String((await store.get('openRouterApiKey')) ?? '').trim()
            : ''
        const baseUrlFromStore =
          store?.get && typeof store.get === 'function'
            ? String((await store.get('openRouterBaseUrl')) ?? '').trim()
            : ''
        let baseUrlFromMeta = ''
        try {
          const rawMeta = await bridge.invoke('modelCatalog.getCoreMeta', {
            providerKey: sourceProviderKey,
          })
          baseUrlFromMeta = String(rawMeta?.baseUrl ?? '').trim()
        } catch {
          // ignore meta read failure and fallback to settings value
        }
        const baseUrl = baseUrlFromMeta.length > 0 ? baseUrlFromMeta : baseUrlFromStore

        const categoryResult = await resolveOpenRouterCategoryMembership({
          category: effectiveCategory,
          apiKey: apiKey.length > 0 ? apiKey : null,
          baseUrl: baseUrl.length > 0 ? baseUrl : null,
        })
        categoryCacheState = categoryResult.cacheHit
          ? 'hit'
          : categoryResult.usedStaleCache
            ? 'stale'
            : categoryResult.unresolved
              ? 'unresolved'
              : 'miss'

        if (categoryResult.unresolved) {
          const notice = appendNotice(
            categoryNotice,
            'Category filter requires online refresh. Please reconnect and retry.'
          )
          logModelCatalogEvent('query', 'query_degraded', {
            ...querySummary,
            stage: 'category_resolution',
            reason: 'category_membership_unresolved',
            category: effectiveCategory,
            categoryCacheState,
            baseUrl: baseUrl.length > 0 ? baseUrl : null,
            notice,
            durationMs: Date.now() - startedAtMs,
          })
          return {
            items: [],
            nextCursor: null,
            notice,
          }
        }

        modelIdsByCategory = Array.from(categoryResult.modelIds)
        if (modelIdsByCategory.length === 0) {
          const notice = appendNotice(
            categoryNotice,
            `No models are currently available for category "${effectiveCategory}" on the selected source/base URL.`
          )
          logModelCatalogEvent('query', 'query_degraded', {
            ...querySummary,
            stage: 'category_resolution',
            reason: 'empty_category_membership',
            category: effectiveCategory,
            categoryCacheState,
            baseUrl: baseUrl.length > 0 ? baseUrl : null,
            notice,
            durationMs: Date.now() - startedAtMs,
          })
          return {
            items: [],
            nextCursor: null,
            notice,
          }
        }
        if (categoryResult.usedStaleCache) {
          categoryNotice = appendNotice(
            categoryNotice,
            'Category filter is using stale cache due to network failure.'
          )
        }
      }

      const payload = {
        providerKey: sourceProviderKey,
        searchText: typeof input.searchText === 'string' ? input.searchText : undefined,
        vendors: mergeUniqueStrings(input.filter?.vendors, input.filter?.providers),
        tags: normalizeStringArray(input.filter?.tags),
        modelIds: modelIdsByCategory,
        contextBuckets: normalizeStringArray(input.filter?.contextBuckets),
        contextLength: normalizeNumberRange(input.filter?.contextLength),
        maxOutputTokens: normalizeNumberRange(input.filter?.maxOutputTokens),
        expiringWithinDays:
          typeof input.filter?.expiringWithinDays === 'number' && Number.isFinite(input.filter.expiringWithinDays)
            ? Math.max(0, Math.floor(input.filter.expiringWithinDays))
            : undefined,
        priceBuckets: normalizeStringArray(input.filter?.priceBuckets),
        hasPerRequestLimits:
          typeof input.filter?.hasPerRequestLimits === 'boolean'
            ? input.filter.hasPerRequestLimits
            : undefined,
        hasDefaultParameters:
          typeof input.filter?.hasDefaultParameters === 'boolean'
            ? input.filter.hasDefaultParameters
            : undefined,
        topProviderIsModerated:
          typeof input.filter?.topProviderIsModerated === 'boolean'
            ? input.filter.topProviderIsModerated
            : undefined,
        architectureModalities: normalizeStringArray(input.filter?.architectureModalities),
        tokenizers: normalizeStringArray(input.filter?.tokenizers),
        instructTypes: normalizeStringArray(input.filter?.instructTypes),
        modalities: normalizeStringArray(input.filter?.modalities),
        inputModalities: normalizeStringArray(input.filter?.inputModalities),
        outputModalities: normalizeStringArray(input.filter?.outputModalities),
        supportedParameters: normalizeStringArray(input.filter?.supportedParameters),
        sortBy,
        sortOrder,
        limit,
        cursor: normalizeCursor(input.page?.cursor),
      }

      const raw = await bridge.invoke('modelCatalog.queryCore', payload)
      const rawItems = Array.isArray(raw?.items) ? raw.items : []
      const items = rawItems.map((row: unknown) => normalizeItem(row)).filter((row): row is CatalogQueryItem => row !== null)
      const nextCursor = normalizeCursor(raw?.nextCursor)
      let finalNotice = categoryNotice
      if (effectiveCategory && items.length === 0) {
        finalNotice = appendNotice(
          finalNotice,
          `No models matched category "${effectiveCategory}" with current local filters.`
        )
      }
      logModelCatalogEvent('query', 'query_success', {
        ...querySummary,
        category: effectiveCategory ?? null,
        categoryMembershipCount: modelIdsByCategory?.length ?? null,
        categoryCacheState,
        resultCount: items.length,
        hasNextCursor: nextCursor !== null,
        hasNotice: !!finalNotice,
        durationMs: Date.now() - startedAtMs,
      })
      return {
        items,
        nextCursor,
        notice: finalNotice,
      }
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
