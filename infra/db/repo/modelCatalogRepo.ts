import BetterSqlite3 from 'better-sqlite3'

type SqlDatabase = BetterSqlite3.Database
const MODEL_HIDE_GUARD_RATIO = 0.7
const MODEL_HIDE_GUARD_MIN_BASELINE = 20
const QUERY_MODEL_ID_IN_THRESHOLD = 800
const MODEL_CATALOG_SEARCH_MAX_TOKENS = 8
const MODEL_CATALOG_SEARCH_MAX_TOKEN_LENGTH = 64

export type CatalogCoreQuerySortBy = 'name' | 'created_at' | 'context_length' | 'max_output_tokens'
export type CatalogCoreQuerySortOrder = 'asc' | 'desc'
export type CatalogCoreQueryContextBucket = 'small' | 'medium' | 'large' | 'xlarge' | 'unknown'
export type CatalogCoreQueryPriceBucket = 'cheap' | 'standard' | 'expensive' | 'unknown'
export type CatalogCoreQueryModality = 'text' | 'image' | 'audio' | 'video' | 'file'

export type CatalogCoreQueryNumberRange = Readonly<{
  min?: number
  max?: number
}>

export type CatalogCoreQueryCursor = Readonly<{
  sortBy: CatalogCoreQuerySortBy
  sortOrder: CatalogCoreQuerySortOrder
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

export type CatalogCoreQueryInput = Readonly<{
  /**
   * Source catalog provider dimension.
   */
  providerKey: string
  searchText?: string
  includeDescriptionInSearch?: boolean
  /**
   * Model vendor/author dimension. Mapped to models.vendor.
   */
  vendors?: string[]
  /**
   * @deprecated Use vendors. Kept for short-term compatibility.
   * Note: this is vendor/author filtering, not source provider filtering.
   */
  providers?: string[]
  modelIds?: string[]
  tags?: string[]
  contextBuckets?: CatalogCoreQueryContextBucket[]
  contextLength?: CatalogCoreQueryNumberRange
  maxOutputTokens?: CatalogCoreQueryNumberRange
  expiringWithinDays?: number
  priceBuckets?: CatalogCoreQueryPriceBucket[]
  hasPerRequestLimits?: boolean
  hasDefaultParameters?: boolean
  topProviderIsModerated?: boolean
  architectureModalities?: string[]
  tokenizers?: string[]
  instructTypes?: string[]
  modalities?: CatalogCoreQueryModality[]
  inputModalities?: CatalogCoreQueryModality[]
  outputModalities?: CatalogCoreQueryModality[]
  supportedParameters?: string[]
  sortBy?: CatalogCoreQuerySortBy
  sortOrder?: CatalogCoreQuerySortOrder
  limit?: number
  cursor?: CatalogCoreQueryCursor | null
}>

export type CatalogCoreQueryRow = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
  canonicalSlug: string | null
  displayName: string
  description: string | null
  vendor: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength: number | null
  maxOutputTokens: number | null
  createdAtSec: number | null
  pricePrompt: string | null
  priceCompletion: string | null
  priceRequest: string | null
  priceImage: string | null
  capReasoning: 0 | 1
  capTools: 0 | 1
  capStructuredOutputs: 0 | 1
  capVision: 0 | 1
  capLongContext: 0 | 1
}>

export type CatalogCoreQueryResult = Readonly<{
  items: CatalogCoreQueryRow[]
  nextCursor: CatalogCoreQueryCursor | null
}>

export type CatalogModelUpsertInput = Readonly<{
  modelId: string
  routerSource: string
  vendor: string
  name: string
  description?: string | null
  contextLength?: number | null
  supportedParametersJson?: string | null
  rawJson?: string | null
}>

export type CatalogCoreProviderUpsertInput = Readonly<{
  providerKey: string
  displayName: string
  slug?: string | null
  privacyPolicyUrl?: string | null
  termsOfServiceUrl?: string | null
  statusPageUrl?: string | null
  updatedAtMs: number
  rawJson?: string | null
}>

export type CatalogCoreModelUpsertInput = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
  canonicalSlug?: string | null
  displayName: string
  description?: string | null
  vendor?: string | null
  family?: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength?: number | null
  maxOutputTokens?: number | null
  architectureModality?: string | null
  inputModalitiesJson: string
  outputModalitiesJson: string
  tokenizer?: string | null
  instructType?: string | null
  supportedParametersJson: string
  capabilitiesJson: string
  capReasoning: 0 | 1
  capTools: 0 | 1
  capStructuredOutputs: 0 | 1
  capVision: 0 | 1
  capLongContext: 0 | 1
  pricingJson?: string | null
  pricePrompt?: string | null
  priceCompletion?: string | null
  priceRequest?: string | null
  priceImage?: string | null
  priceWebSearch?: string | null
  priceInternalReasoning?: string | null
  priceInputCacheRead?: string | null
  priceInputCacheWrite?: string | null
  createdAtSec?: number | null
  expirationDate?: string | null
  expirationAtSec?: number | null
  unknownExpiration?: 0 | 1
  perRequestLimitsJson?: string | null
  defaultParametersJson?: string | null
  hasPerRequestLimits?: 0 | 1
  hasDefaultParameters?: 0 | 1
  hasTools?: 0 | 1
  hasStructuredOutputs?: 0 | 1
  hasReasoning?: 0 | 1
  hasSeed?: 0 | 1
  inModalityImage?: 0 | 1
  topProviderContextLength?: number | null
  topProviderIsModerated?: 0 | 1 | null
  firstSeenAtMs: number
  lastSeenAtMs: number
  syncedAtMs: number
  rawJson?: string | null
}>

export type CatalogCoreTagUpsertInput = Readonly<{
  providerKey: string
  modelId: string
  tagKey: string
  tagLabel: string
  tagType: 'capability' | 'category' | 'vendor' | 'status' | 'custom'
  confidence: number
  source: 'derived' | 'provider' | 'manual'
  updatedAtMs: number
}>

export type CatalogCoreMetaUpsertInput = Readonly<{
  providerKey: string
  schemaVersion: number
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  baseUrl: string
  snapshotId: string
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  providerCount?: number | null
  lastCountProbe?: number | null
  lastCountProbeAtMs?: number | null
  lastSyncAtMs: number
  ttlSeconds: number
  syncState: 'idle' | 'syncing' | 'ok' | 'error'
  lastErrorCode?: string | null
  lastErrorMessage?: string | null
  rawRetentionPolicyJson: string
}>

export type CatalogCoreSyncSnapshotInput = Readonly<{
  providerKey: string
  snapshotId: string
  providers: CatalogCoreProviderUpsertInput[]
  models: CatalogCoreModelUpsertInput[]
  tags: CatalogCoreTagUpsertInput[]
  meta: CatalogCoreMetaUpsertInput
}>

export type CatalogCoreMetaRecord = Readonly<{
  providerKey: string
  schemaVersion: number
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  baseUrl: string
  snapshotId: string
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  providerCount: number | null
  lastCountProbe: number | null
  lastCountProbeAtMs: number | null
  lastSyncAtMs: number
  ttlSeconds: number
  syncState: 'idle' | 'syncing' | 'ok' | 'error'
  lastErrorCode: string | null
  lastErrorMessage: string | null
}>

export type CatalogScopedMetaUpsertInput = Readonly<{
  providerKey: string
  catalogScopeKey: string
  baseUrl: string
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  activeSnapshotId?: string | null
  syncState: 'idle' | 'syncing' | 'ok' | 'error'
  lastSyncAtMs?: number
  lastUsedAtMs: number
  modelCount?: number
  visibleModelCount?: number
  hiddenModelCount?: number
  lastErrorCode?: string | null
  lastErrorMessage?: string | null
  lastValidatedAtMs?: number | null
  lastRepairAttemptAtMs?: number | null
  repairAttemptCount?: number
  snapshotChecksum?: string | null
  schemaVersion: number
}>

export type CatalogScopedMetaRecord = Readonly<{
  providerKey: string
  catalogScopeKey: string
  baseUrl: string
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  activeSnapshotId: string | null
  syncState: 'idle' | 'syncing' | 'ok' | 'error'
  lastSyncAtMs: number
  lastUsedAtMs: number
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  lastErrorCode: string | null
  lastErrorMessage: string | null
  lastValidatedAtMs: number | null
  lastRepairAttemptAtMs: number | null
  repairAttemptCount: number
  snapshotChecksum: string | null
  schemaVersion: number
}>

export type CatalogScopedModelUpsertInput = Readonly<{
  modelId: string
  modelKey: string
  canonicalSlug?: string | null
  displayName: string
  description?: string | null
  vendor?: string | null
  family?: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength?: number | null
  maxOutputTokens?: number | null
  inputModalitiesJson?: string
  outputModalitiesJson?: string
  supportedParametersJson?: string
  capabilitiesJson?: string
  pricingJson?: string | null
  rawJson?: string | null
  createdAtSec?: number | null
  firstSeenAtMs: number
  lastSeenAtMs: number
  syncedAtMs: number
}>

export type CatalogScopedModelRecord = Readonly<{
  providerKey: string
  catalogScopeKey: string
  snapshotId: string
  modelId: string
  modelKey: string
  canonicalSlug: string | null
  displayName: string
  description: string | null
  vendor: string | null
  family: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength: number | null
  maxOutputTokens: number | null
  inputModalitiesJson: string
  outputModalitiesJson: string
  supportedParametersJson: string
  capabilitiesJson: string
  pricingJson: string | null
  rawJson: string | null
  createdAtSec: number | null
  firstSeenAtMs: number
  lastSeenAtMs: number
  syncedAtMs: number
}>

export type CatalogScopedClearResult = Readonly<{
  deleted: Record<string, number>
}>

export type CatalogScopedQueryCursor = Readonly<{
  sortBy: CatalogCoreQuerySortBy
  sortOrder: CatalogCoreQuerySortOrder
  name?: string
  createdAtSec?: number
  contextLength?: number
  maxOutputTokens?: number
  modelKey: string
}>

export type CatalogScopedQueryInput = Readonly<{
  providerKey: string
  catalogScopeKey: string
  searchText?: string
  includeDescriptionInSearch?: boolean
  category?: string
  vendors?: string[]
  providers?: string[]
  modelIds?: string[]
  capabilities?: Readonly<{
    reasoning?: boolean
    tools?: boolean
    structuredOutputs?: boolean
    vision?: boolean
    longContext?: boolean
  }>
  contextLength?: CatalogCoreQueryNumberRange
  maxOutputTokens?: CatalogCoreQueryNumberRange
  modalities?: CatalogCoreQueryModality[]
  inputModalities?: CatalogCoreQueryModality[]
  outputModalities?: CatalogCoreQueryModality[]
  supportedParameters?: string[]
  sortBy?: CatalogCoreQuerySortBy
  sortOrder?: CatalogCoreQuerySortOrder
  limit?: number
  cursor?: CatalogScopedQueryCursor | null
}>

export type CatalogScopedQueryResult = Readonly<{
  items: CatalogScopedModelRecord[]
  nextCursor: CatalogScopedQueryCursor | null
}>

export type CatalogScopedSnapshotWriteInput = Readonly<{
  providerKey: string
  catalogScopeKey: string
  baseUrl: string
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  snapshotId: string
  snapshotChecksum?: string | null
  models: readonly CatalogScopedModelUpsertInput[]
  syncedAtMs: number
  schemaVersion: number
  pruneOldSnapshots?: boolean
}>

export type CatalogScopedMetaErrorInput = Readonly<{
  providerKey: string
  catalogScopeKey: string
  baseUrl: string
  dataSource: 'models_user_primary' | 'models_fallback' | 'mixed'
  lastErrorCode: string
  lastErrorMessage: string
  atMs: number
  schemaVersion: number
}>

export type CatalogScopedSnapshotWriteResult = Readonly<{
  providerKey: string
  catalogScopeKey: string
  activeSnapshotId: string
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
}>

export type CatalogScopedSnapshotValidationResult =
  | Readonly<{
      ok: true
      meta: CatalogScopedMetaRecord | null
      modelCount: number
    }>
  | Readonly<{
      ok: false
      code: 'cache_corrupted'
      message: string
    }>

export class CatalogScopedSnapshotValidationError extends Error {
  readonly code = 'cache_corrupted'

  constructor(message: string) {
    super(message)
    this.name = 'CatalogScopedSnapshotValidationError'
  }
}

export type CatalogCoreModelDetailRecord = Readonly<{
  providerKey: string
  modelId: string
  modelKey: string
  canonicalSlug: string | null
  displayName: string
  description: string | null
  vendor: string | null
  family: string | null
  status: 'active' | 'deprecated' | 'archived'
  visibility: 'visible' | 'hidden'
  contextLength: number | null
  maxOutputTokens: number | null
  architectureModality: string | null
  inputModalitiesJson: string
  outputModalitiesJson: string
  tokenizer: string | null
  instructType: string | null
  supportedParametersJson: string
  capabilitiesJson: string
  capReasoning: 0 | 1
  capTools: 0 | 1
  capStructuredOutputs: 0 | 1
  capVision: 0 | 1
  capLongContext: 0 | 1
  pricingJson: string | null
  pricePrompt: string | null
  priceCompletion: string | null
  priceRequest: string | null
  priceImage: string | null
  priceWebSearch: string | null
  priceInternalReasoning: string | null
  priceInputCacheRead: string | null
  priceInputCacheWrite: string | null
  createdAtSec: number | null
  expirationDate: string | null
  expirationAtSec: number | null
  unknownExpiration: 0 | 1
  perRequestLimitsJson: string | null
  defaultParametersJson: string | null
  hasPerRequestLimits: 0 | 1
  hasDefaultParameters: 0 | 1
  hasTools: 0 | 1
  hasStructuredOutputs: 0 | 1
  hasReasoning: 0 | 1
  hasSeed: 0 | 1
  inModalityImage: 0 | 1
  topProviderContextLength: number | null
  topProviderIsModerated: 0 | 1 | null
  firstSeenAtMs: number
  lastSeenAtMs: number
  syncedAtMs: number
  rawJson: string | null
}>

export type CatalogEndpointMetaUpsertInput = Readonly<{
  providerKey: string
  baseUrl: string
  modelId: string
  endpointKey: string
  providerName?: string | null
  tag?: string | null
  quantization?: string | null
  contextLength?: number | null
  maxCompletionTokens?: number | null
  maxPromptTokens?: number | null
  supportedParametersJson?: string | null
  supportsImplicitCaching?: 0 | 1 | null
  status?: number | null
  rawJson?: string | null
}>

export type CatalogEndpointMetaReplaceInput = Readonly<{
  providerKey: string
  baseUrl: string
  modelId: string
  fetchedAtMs: number
  endpoints: ReadonlyArray<CatalogEndpointMetaUpsertInput>
}>

export type CatalogEndpointMetaRecord = Readonly<{
  providerKey: string
  baseUrl: string
  modelId: string
  endpointKey: string
  providerName: string | null
  tag: string | null
  quantization: string | null
  contextLength: number | null
  maxCompletionTokens: number | null
  maxPromptTokens: number | null
  supportedParametersJson: string | null
  supportsImplicitCaching: 0 | 1 | null
  status: number | null
  rawJson: string | null
  fetchedAtMs: number
  updatedAtMs: number
}>

const CONTEXT_BUCKET_SQL: Readonly<Record<CatalogCoreQueryContextBucket, string>> = {
  small: '(models.context_length IS NOT NULL AND models.context_length > 0 AND models.context_length < 8192)',
  medium: '(models.context_length >= 8192 AND models.context_length < 32768)',
  large: '(models.context_length >= 32768 AND models.context_length < 128000)',
  xlarge: '(models.context_length >= 128000)',
  unknown: '(models.context_length IS NULL OR models.context_length <= 0)',
}

const PRICE_BUCKET_TAG_KEY: Readonly<Record<CatalogCoreQueryPriceBucket, string>> = {
  cheap: 'category:cheap_bucket:cheap',
  standard: 'category:cheap_bucket:standard',
  expensive: 'category:cheap_bucket:expensive',
  unknown: 'category:cheap_bucket:unknown',
}

const MODALITY_FILTER_SET = new Set<string>(['text', 'image', 'audio', 'video', 'file'])

function normalizeStringArray(input: readonly string[] | undefined): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const normalized = String(raw ?? '').trim()
    if (!normalized) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

function normalizeLowercaseArray(input: readonly string[] | undefined): string[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const normalized = String(raw ?? '').trim().toLowerCase()
    if (!normalized) continue
    if (seen.has(normalized)) continue
    seen.add(normalized)
    out.push(normalized)
  }
  return out
}

const SCOPED_CATEGORY_TERMS: Record<string, readonly string[]> = {
  programming: ['programming', 'coding', 'code', 'developer', 'software'],
  roleplay: ['roleplay', 'role play', 'character', 'storytelling'],
  marketing: ['marketing', 'copywriting', 'advertising'],
  'marketing/seo': ['seo', 'search engine optimization'],
  technology: ['technology', 'tech'],
  science: ['science', 'scientific', 'research'],
  translation: ['translation', 'translate', 'translator'],
  legal: ['legal', 'law', 'lawyer'],
  finance: ['finance', 'financial', 'accounting'],
  health: ['health', 'medical', 'medicine'],
  trivia: ['trivia', 'quiz'],
  academia: ['academia', 'academic', 'scholar', 'research'],
}

function normalizeScopedCategory(input: unknown): string | null {
  const normalized = String(input ?? '').trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(SCOPED_CATEGORY_TERMS, normalized) ? normalized : null
}

function pushScopedTextDerivedCategoryWhere(
  where: string[],
  params: Record<string, unknown>,
  category: string,
) {
  const terms = SCOPED_CATEGORY_TERMS[category] ?? [category]
  const termConditions: string[] = []
  terms.forEach((term, index) => {
    const key = `scopedCategoryTerm${index}`
    params[key] = `%${escapeSqlLike(term.toLowerCase())}%`
    termConditions.push(`
      (
        LOWER(models.model_id) LIKE @${key} ESCAPE '\\'
        OR LOWER(models.model_key) LIKE @${key} ESCAPE '\\'
        OR LOWER(COALESCE(models.canonical_slug, '')) LIKE @${key} ESCAPE '\\'
        OR LOWER(models.display_name) LIKE @${key} ESCAPE '\\'
        OR LOWER(COALESCE(models.description, '')) LIKE @${key} ESCAPE '\\'
        OR LOWER(COALESCE(models.vendor, '')) LIKE @${key} ESCAPE '\\'
        OR LOWER(COALESCE(models.family, '')) LIKE @${key} ESCAPE '\\'
        OR LOWER(COALESCE(models.raw_json, '')) LIKE @${key} ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM json_each(models.supported_parameters_json) scoped_category_param_${index}
          WHERE LOWER(TRIM(CAST(scoped_category_param_${index}.value AS TEXT))) LIKE @${key} ESCAPE '\\'
        )
        OR EXISTS (
          SELECT 1
          FROM json_each(models.input_modalities_json) scoped_category_input_${index}
          WHERE LOWER(TRIM(CAST(scoped_category_input_${index}.value AS TEXT))) LIKE @${key} ESCAPE '\\'
        )
        OR EXISTS (
          SELECT 1
          FROM json_each(models.output_modalities_json) scoped_category_output_${index}
          WHERE LOWER(TRIM(CAST(scoped_category_output_${index}.value AS TEXT))) LIKE @${key} ESCAPE '\\'
        )
      )
    `)
  })
  where.push(`(${termConditions.join('\n OR ')})`)
}

function pushScopedCapabilityWhere(
  where: string[],
  capability: 'reasoning' | 'tools' | 'structuredOutputs' | 'vision' | 'longContext',
  expected: boolean,
) {
  const jsonPath = `$.${capability}`
  if (expected) {
    where.push(`json_extract(models.capabilities_json, '${jsonPath}') = 1`)
    return
  }
  where.push(`COALESCE(json_extract(models.capabilities_json, '${jsonPath}'), 0) != 1`)
}

type ParsedArchitectureModalityFilter = Readonly<{
  inputModalities: string[]
  outputModalities: string[]
}>

function parseArchitectureModalityFilter(input: string): ParsedArchitectureModalityFilter | null {
  const raw = String(input ?? '').trim().toLowerCase()
  if (!raw) return null
  const parts = raw.split('->')
  if (parts.length !== 2) return null
  const inputModalities = normalizeLowercaseArray(parts[0]?.split('+'))
  const outputModalities = normalizeLowercaseArray(parts[1]?.split('+'))
  if (inputModalities.length === 0 || outputModalities.length === 0) return null
  if (inputModalities.some((value) => !MODALITY_FILTER_SET.has(value))) return null
  if (outputModalities.some((value) => !MODALITY_FILTER_SET.has(value))) return null
  return { inputModalities, outputModalities }
}

function normalizeNumberRange(
  input: CatalogCoreQueryNumberRange | undefined
): CatalogCoreQueryNumberRange | null {
  if (!input || typeof input !== 'object') return null
  const rawMin = input.min
  const rawMax = input.max
  const min =
    typeof rawMin === 'number' && Number.isFinite(rawMin)
      ? rawMin
      : undefined
  const max =
    typeof rawMax === 'number' && Number.isFinite(rawMax)
      ? rawMax
      : undefined
  if (min === undefined && max === undefined) return null
  return { min, max }
}

function pushRangeWhereClause(
  where: string[],
  params: Record<string, unknown>,
  columnSql: string,
  range: CatalogCoreQueryNumberRange | undefined,
  paramPrefix: string
) {
  const normalized = normalizeNumberRange(range)
  if (!normalized) return
  if (typeof normalized.min === 'number') {
    const minKey = `${paramPrefix}Min`
    where.push(`${columnSql} >= @${minKey}`)
    params[minKey] = normalized.min
  }
  if (typeof normalized.max === 'number') {
    const maxKey = `${paramPrefix}Max`
    where.push(`${columnSql} <= @${maxKey}`)
    params[maxKey] = normalized.max
  }
}

function toSearchTokens(searchText: string): string[] {
  const tokens = String(searchText ?? '')
    .toLowerCase()
    .match(/[\p{L}\p{N}_]+/gu) ?? []
  const out: string[] = []
  const seen = new Set<string>()
  for (const rawToken of tokens) {
    const token = rawToken.slice(0, MODEL_CATALOG_SEARCH_MAX_TOKEN_LENGTH)
    if (!token || seen.has(token)) continue
    seen.add(token)
    out.push(token)
    if (out.length >= MODEL_CATALOG_SEARCH_MAX_TOKENS) break
  }
  return out
}

function toFtsPrefixQuery(tokens: readonly string[], columnFilter: string): string | null {
  if (tokens.length === 0) return null
  return `${columnFilter} : ${tokens.map((token) => `${token}*`).join(' ')}`
}

function buildFtsExistsSql(paramName: string): string {
  return `EXISTS (
    SELECT 1
    FROM models_fts
    WHERE models_fts.rowid = models.rowid
      AND models_fts MATCH @${paramName}
  )`
}

function toCursor(
  row: CatalogCoreQueryRow,
  sortBy: CatalogCoreQuerySortBy,
  sortOrder: CatalogCoreQuerySortOrder
): CatalogCoreQueryCursor {
  const sortCursorField =
    sortBy === 'name'
      ? { name: row.displayName }
      : sortBy === 'created_at'
        ? { createdAtSec: Number(row.createdAtSec ?? 0) }
        : sortBy === 'context_length'
          ? { contextLength: Number(row.contextLength ?? 0) }
          : { maxOutputTokens: Number(row.maxOutputTokens ?? 0) }

  return {
    sortBy,
    sortOrder,
    ...sortCursorField,
    modelKey: row.modelKey,
    providerKey: row.providerKey,
    modelId: row.modelId,
  }
}

function toScopedCursor(
  row: CatalogScopedModelRecord,
  sortBy: CatalogCoreQuerySortBy,
  sortOrder: CatalogCoreQuerySortOrder
): CatalogScopedQueryCursor {
  const sortCursorField =
    sortBy === 'name'
      ? { name: row.displayName }
      : sortBy === 'created_at'
        ? { createdAtSec: Number(row.createdAtSec ?? 0) }
        : sortBy === 'context_length'
          ? { contextLength: Number(row.contextLength ?? 0) }
          : { maxOutputTokens: Number(row.maxOutputTokens ?? 0) }

  return {
    sortBy,
    sortOrder,
    ...sortCursorField,
    modelKey: row.modelKey,
  }
}

function escapeSqlLike(input: string): string {
  return input.replace(/[\\%_]/g, (value) => `\\${value}`)
}

function requireScopedText(value: unknown, fieldName: string): string {
  const text = String(value ?? '').trim()
  if (!text) {
    throw new CatalogScopedSnapshotValidationError(`cache_corrupted: scoped snapshot ${fieldName} is required`)
  }
  return text
}

function parseScopedJsonField(value: unknown, fieldName: string, required: boolean): void {
  if (value == null || value === '') {
    if (required) {
      throw new CatalogScopedSnapshotValidationError(`cache_corrupted: scoped snapshot ${fieldName} is required`)
    }
    return
  }
  try {
    JSON.parse(String(value))
  } catch {
    throw new CatalogScopedSnapshotValidationError(`cache_corrupted: scoped snapshot ${fieldName} is invalid JSON`)
  }
}

export function validateScopedSnapshotRows(input: Readonly<{
  providerKey: string
  catalogScopeKey: string
  snapshotId: string
  modelCount: number
  visibleModelCount: number
  hiddenModelCount: number
  rows: readonly Partial<CatalogScopedModelRecord>[]
}>): void {
  requireScopedText(input.providerKey, 'providerKey')
  requireScopedText(input.catalogScopeKey, 'catalogScopeKey')
  requireScopedText(input.snapshotId, 'snapshotId')

  const modelCount = Math.max(0, Math.floor(Number(input.modelCount)))
  const visibleModelCount = Math.max(0, Math.floor(Number(input.visibleModelCount)))
  const hiddenModelCount = Math.max(0, Math.floor(Number(input.hiddenModelCount)))
  if (input.rows.length !== modelCount) {
    throw new CatalogScopedSnapshotValidationError('cache_corrupted: scoped snapshot model count mismatch')
  }
  if (visibleModelCount + hiddenModelCount !== modelCount) {
    throw new CatalogScopedSnapshotValidationError('cache_corrupted: scoped snapshot visibility count mismatch')
  }

  const seenModelIds = new Set<string>()
  let actualVisibleCount = 0
  let actualHiddenCount = 0
  for (const row of input.rows) {
    const rowProviderKey = requireScopedText(row.providerKey ?? input.providerKey, 'row providerKey')
    const rowScopeKey = requireScopedText(row.catalogScopeKey ?? input.catalogScopeKey, 'row catalogScopeKey')
    const rowSnapshotId = requireScopedText(row.snapshotId ?? input.snapshotId, 'row snapshotId')
    const modelId = requireScopedText(row.modelId, 'row modelId')
    requireScopedText(row.modelKey, 'row modelKey')
    requireScopedText(row.displayName, 'row displayName')
    if (rowProviderKey !== input.providerKey || rowScopeKey !== input.catalogScopeKey || rowSnapshotId !== input.snapshotId) {
      throw new CatalogScopedSnapshotValidationError('cache_corrupted: scoped snapshot row scope mismatch')
    }
    if (seenModelIds.has(modelId)) {
      throw new CatalogScopedSnapshotValidationError('cache_corrupted: scoped snapshot duplicate modelId')
    }
    seenModelIds.add(modelId)
    if (row.visibility === 'visible') actualVisibleCount += 1
    if (row.visibility === 'hidden') actualHiddenCount += 1
    parseScopedJsonField(row.inputModalitiesJson ?? '[]', 'inputModalitiesJson', true)
    parseScopedJsonField(row.outputModalitiesJson ?? '[]', 'outputModalitiesJson', true)
    parseScopedJsonField(row.supportedParametersJson ?? '[]', 'supportedParametersJson', true)
    parseScopedJsonField(row.capabilitiesJson ?? '{}', 'capabilitiesJson', true)
    parseScopedJsonField(row.pricingJson, 'pricingJson', false)
    parseScopedJsonField(row.rawJson, 'rawJson', false)
  }

  if (actualVisibleCount !== visibleModelCount || actualHiddenCount !== hiddenModelCount) {
    throw new CatalogScopedSnapshotValidationError('cache_corrupted: scoped snapshot row visibility mismatch')
  }
}

export class ModelCatalogRepo {
  private upsertStmt: BetterSqlite3.Statement
  private hideMissingStmt: BetterSqlite3.Statement
  private listByRouterSourceStmt: BetterSqlite3.Statement
  private coreProviderUpsertStmt: BetterSqlite3.Statement
  private coreEnsurePrimaryProviderStmt: BetterSqlite3.Statement
  private coreModelUpsertStmt: BetterSqlite3.Statement
  private coreDeleteTagsByProviderStmt: BetterSqlite3.Statement
  private coreTagUpsertStmt: BetterSqlite3.Statement
  private coreMetaUpsertStmt: BetterSqlite3.Statement
  private coreMarkMissingHiddenStmt: BetterSqlite3.Statement
  private coreClearSeenTempTableStmt: BetterSqlite3.Statement
  private coreInsertSeenModelStmt: BetterSqlite3.Statement
  private coreCountByVisibilityStmt: BetterSqlite3.Statement
  private coreCountModelsStmt: BetterSqlite3.Statement
  private coreGetMetaStmt: BetterSqlite3.Statement
  private coreGetModelDetailStmt: BetterSqlite3.Statement
  private coreClearQueryModelIdsTempTableStmt: BetterSqlite3.Statement
  private coreInsertQueryModelIdStmt: BetterSqlite3.Statement
  private corePopulateQueryModelIdsTx: (modelIds: readonly string[]) => void
  private endpointMetaDeleteByModelStmt: BetterSqlite3.Statement
  private endpointMetaUpsertStmt: BetterSqlite3.Statement
  private endpointMetaListByModelStmt: BetterSqlite3.Statement
  private coreUpdateSyncErrorStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.upsertStmt = this.db.prepare(`
      INSERT INTO model_catalog(
        model_id,
        router_source,
        vendor,
        name,
        description,
        context_length,
        supported_parameters_json,
        raw_json,
        last_seen_snapshot_id,
        is_hidden,
        created_at_ms,
        updated_at_ms
      )
      VALUES (
        @modelId,
        @routerSource,
        @vendor,
        @name,
        @description,
        @contextLength,
        @supportedParametersJson,
        @rawJson,
        @snapshotId,
        0,
        @nowMs,
        @nowMs
      )
      ON CONFLICT(model_id) DO UPDATE SET
        router_source = excluded.router_source,
        vendor = excluded.vendor,
        name = excluded.name,
        description = excluded.description,
        context_length = excluded.context_length,
        supported_parameters_json = excluded.supported_parameters_json,
        raw_json = excluded.raw_json,
        last_seen_snapshot_id = excluded.last_seen_snapshot_id,
        is_hidden = 0,
        updated_at_ms = excluded.updated_at_ms
    `)

    this.hideMissingStmt = this.db.prepare(`
      UPDATE model_catalog
      SET is_hidden = 1,
          updated_at_ms = @nowMs
      WHERE router_source = @routerSource
        AND (
          last_seen_snapshot_id IS NULL
          OR last_seen_snapshot_id != @snapshotId
        )
    `)

    this.listByRouterSourceStmt = this.db.prepare(`
      SELECT
        model_id AS modelId,
        name,
        vendor,
        description,
        context_length AS contextLength,
        supported_parameters_json AS supportedParametersJson,
        last_seen_snapshot_id AS lastSeenSnapshotId,
        is_hidden AS isHidden,
        created_at_ms AS createdAtMs,
        updated_at_ms AS updatedAtMs
      FROM model_catalog
      WHERE router_source = @routerSource
      ORDER BY name COLLATE NOCASE ASC, model_id ASC
    `)
    this.db.exec(`
      CREATE TEMP TABLE IF NOT EXISTS catalog_sync_seen_models(
        model_id TEXT PRIMARY KEY
      )
    `)
    this.db.exec(`
      CREATE TEMP TABLE IF NOT EXISTS catalog_query_model_ids(
        model_id TEXT PRIMARY KEY
      )
    `)

    this.coreProviderUpsertStmt = this.db.prepare(`
      INSERT INTO providers(
        provider_key,
        display_name,
        slug,
        privacy_policy_url,
        terms_of_service_url,
        status_page_url,
        updated_at_ms,
        raw_json
      )
      VALUES(
        @providerKey,
        @displayName,
        @slug,
        @privacyPolicyUrl,
        @termsOfServiceUrl,
        @statusPageUrl,
        @updatedAtMs,
        @rawJson
      )
      ON CONFLICT(provider_key) DO UPDATE SET
        display_name = excluded.display_name,
        slug = excluded.slug,
        privacy_policy_url = excluded.privacy_policy_url,
        terms_of_service_url = excluded.terms_of_service_url,
        status_page_url = excluded.status_page_url,
        updated_at_ms = excluded.updated_at_ms,
        raw_json = excluded.raw_json
    `)

    this.coreEnsurePrimaryProviderStmt = this.db.prepare(`
      INSERT OR IGNORE INTO providers(
        provider_key,
        display_name,
        updated_at_ms
      )
      VALUES(
        @providerKey,
        @displayName,
        @updatedAtMs
      )
    `)

    this.coreModelUpsertStmt = this.db.prepare(`
      INSERT INTO models(
        provider_key,
        model_id,
        model_key,
        canonical_slug,
        display_name,
        description,
        vendor,
        family,
        status,
        visibility,
        context_length,
        max_output_tokens,
        architecture_modality,
        input_modalities_json,
        output_modalities_json,
        tokenizer,
        instruct_type,
        supported_parameters_json,
        capabilities_json,
        cap_reasoning,
        cap_tools,
        cap_structured_outputs,
        cap_vision,
        cap_long_context,
        pricing_json,
        price_prompt,
        price_completion,
        price_request,
        price_image,
        price_web_search,
        price_internal_reasoning,
        price_input_cache_read,
        price_input_cache_write,
        created_at_sec,
        expiration_date,
        expiration_at_sec,
        unknown_expiration,
        per_request_limits_json,
        default_parameters_json,
        has_per_request_limits,
        has_default_parameters,
        has_tools,
        has_structured_outputs,
        has_reasoning,
        has_seed,
        in_modality_image,
        top_provider_context_length,
        top_provider_is_moderated,
        first_seen_at_ms,
        last_seen_at_ms,
        synced_at_ms,
        raw_json
      )
      VALUES(
        @providerKey,
        @modelId,
        @modelKey,
        @canonicalSlug,
        @displayName,
        @description,
        @vendor,
        @family,
        @status,
        @visibility,
        @contextLength,
        @maxOutputTokens,
        @architectureModality,
        @inputModalitiesJson,
        @outputModalitiesJson,
        @tokenizer,
        @instructType,
        @supportedParametersJson,
        @capabilitiesJson,
        @capReasoning,
        @capTools,
        @capStructuredOutputs,
        @capVision,
        @capLongContext,
        @pricingJson,
        @pricePrompt,
        @priceCompletion,
        @priceRequest,
        @priceImage,
        @priceWebSearch,
        @priceInternalReasoning,
        @priceInputCacheRead,
        @priceInputCacheWrite,
        @createdAtSec,
        @expirationDate,
        @expirationAtSec,
        @unknownExpiration,
        @perRequestLimitsJson,
        @defaultParametersJson,
        @hasPerRequestLimits,
        @hasDefaultParameters,
        @hasTools,
        @hasStructuredOutputs,
        @hasReasoning,
        @hasSeed,
        @inModalityImage,
        @topProviderContextLength,
        @topProviderIsModerated,
        @firstSeenAtMs,
        @lastSeenAtMs,
        @syncedAtMs,
        @rawJson
      )
      ON CONFLICT(provider_key, model_id) DO UPDATE SET
        model_key = excluded.model_key,
        canonical_slug = excluded.canonical_slug,
        display_name = excluded.display_name,
        description = excluded.description,
        vendor = excluded.vendor,
        family = excluded.family,
        status = excluded.status,
        visibility = excluded.visibility,
        context_length = excluded.context_length,
        max_output_tokens = excluded.max_output_tokens,
        architecture_modality = excluded.architecture_modality,
        input_modalities_json = excluded.input_modalities_json,
        output_modalities_json = excluded.output_modalities_json,
        tokenizer = excluded.tokenizer,
        instruct_type = excluded.instruct_type,
        supported_parameters_json = excluded.supported_parameters_json,
        capabilities_json = excluded.capabilities_json,
        cap_reasoning = excluded.cap_reasoning,
        cap_tools = excluded.cap_tools,
        cap_structured_outputs = excluded.cap_structured_outputs,
        cap_vision = excluded.cap_vision,
        cap_long_context = excluded.cap_long_context,
        pricing_json = excluded.pricing_json,
        price_prompt = excluded.price_prompt,
        price_completion = excluded.price_completion,
        price_request = excluded.price_request,
        price_image = excluded.price_image,
        price_web_search = excluded.price_web_search,
        price_internal_reasoning = excluded.price_internal_reasoning,
        price_input_cache_read = excluded.price_input_cache_read,
        price_input_cache_write = excluded.price_input_cache_write,
        created_at_sec = excluded.created_at_sec,
        expiration_date = excluded.expiration_date,
        expiration_at_sec = excluded.expiration_at_sec,
        unknown_expiration = excluded.unknown_expiration,
        per_request_limits_json = excluded.per_request_limits_json,
        default_parameters_json = excluded.default_parameters_json,
        has_per_request_limits = excluded.has_per_request_limits,
        has_default_parameters = excluded.has_default_parameters,
        has_tools = excluded.has_tools,
        has_structured_outputs = excluded.has_structured_outputs,
        has_reasoning = excluded.has_reasoning,
        has_seed = excluded.has_seed,
        in_modality_image = excluded.in_modality_image,
        top_provider_context_length = excluded.top_provider_context_length,
        top_provider_is_moderated = excluded.top_provider_is_moderated,
        first_seen_at_ms = MIN(models.first_seen_at_ms, excluded.first_seen_at_ms),
        last_seen_at_ms = excluded.last_seen_at_ms,
        synced_at_ms = excluded.synced_at_ms,
        raw_json = excluded.raw_json
    `)

    this.coreDeleteTagsByProviderStmt = this.db.prepare(`
      DELETE FROM model_tags WHERE provider_key = @providerKey
    `)

    this.coreTagUpsertStmt = this.db.prepare(`
      INSERT INTO model_tags(
        provider_key,
        model_id,
        tag_key,
        tag_label,
        tag_type,
        confidence,
        source,
        updated_at_ms
      )
      VALUES(
        @providerKey,
        @modelId,
        @tagKey,
        @tagLabel,
        @tagType,
        @confidence,
        @source,
        @updatedAtMs
      )
      ON CONFLICT(provider_key, model_id, tag_key) DO UPDATE SET
        tag_label = excluded.tag_label,
        tag_type = excluded.tag_type,
        confidence = excluded.confidence,
        source = excluded.source,
        updated_at_ms = excluded.updated_at_ms
    `)

    this.coreMetaUpsertStmt = this.db.prepare(`
      INSERT INTO catalog_meta(
        provider_key,
        schema_version,
        data_source,
        base_url,
        snapshot_id,
        model_count,
        visible_model_count,
        hidden_model_count,
        provider_count,
        last_count_probe,
        last_count_probe_at_ms,
        last_sync_at_ms,
        ttl_seconds,
        sync_state,
        last_error_code,
        last_error_message,
        raw_retention_policy_json
      )
      VALUES(
        @providerKey,
        @schemaVersion,
        @dataSource,
        @baseUrl,
        @snapshotId,
        @modelCount,
        @visibleModelCount,
        @hiddenModelCount,
        @providerCount,
        @lastCountProbe,
        @lastCountProbeAtMs,
        @lastSyncAtMs,
        @ttlSeconds,
        @syncState,
        @lastErrorCode,
        @lastErrorMessage,
        @rawRetentionPolicyJson
      )
      ON CONFLICT(provider_key) DO UPDATE SET
        schema_version = excluded.schema_version,
        data_source = excluded.data_source,
        base_url = excluded.base_url,
        snapshot_id = excluded.snapshot_id,
        model_count = excluded.model_count,
        visible_model_count = excluded.visible_model_count,
        hidden_model_count = excluded.hidden_model_count,
        provider_count = excluded.provider_count,
        last_count_probe = excluded.last_count_probe,
        last_count_probe_at_ms = excluded.last_count_probe_at_ms,
        last_sync_at_ms = excluded.last_sync_at_ms,
        ttl_seconds = excluded.ttl_seconds,
        sync_state = excluded.sync_state,
        last_error_code = excluded.last_error_code,
        last_error_message = excluded.last_error_message,
        raw_retention_policy_json = excluded.raw_retention_policy_json
    `)

    this.coreClearSeenTempTableStmt = this.db.prepare(`
      DELETE FROM catalog_sync_seen_models
    `)

    this.coreInsertSeenModelStmt = this.db.prepare(`
      INSERT OR IGNORE INTO catalog_sync_seen_models(model_id)
      VALUES(@modelId)
    `)

    this.coreMarkMissingHiddenStmt = this.db.prepare(`
      UPDATE models
      SET
        visibility = 'hidden',
        synced_at_ms = @syncedAtMs
      WHERE provider_key = @providerKey
        AND model_id NOT IN (SELECT model_id FROM catalog_sync_seen_models)
    `)

    this.coreCountByVisibilityStmt = this.db.prepare(`
      SELECT COUNT(1) AS count
      FROM models
      WHERE provider_key = @providerKey
        AND visibility = @visibility
    `)

    this.coreCountModelsStmt = this.db.prepare(`
      SELECT COUNT(1) AS count
      FROM models
      WHERE provider_key = @providerKey
    `)

    this.coreGetMetaStmt = this.db.prepare(`
      SELECT
        provider_key AS providerKey,
        schema_version AS schemaVersion,
        data_source AS dataSource,
        base_url AS baseUrl,
        snapshot_id AS snapshotId,
        model_count AS modelCount,
        visible_model_count AS visibleModelCount,
        hidden_model_count AS hiddenModelCount,
        provider_count AS providerCount,
        last_count_probe AS lastCountProbe,
        last_count_probe_at_ms AS lastCountProbeAtMs,
        last_sync_at_ms AS lastSyncAtMs,
        ttl_seconds AS ttlSeconds,
        sync_state AS syncState,
        last_error_code AS lastErrorCode,
        last_error_message AS lastErrorMessage
      FROM catalog_meta
      WHERE provider_key = @providerKey
      LIMIT 1
    `)

    this.coreGetModelDetailStmt = this.db.prepare(`
      SELECT
        provider_key AS providerKey,
        model_id AS modelId,
        model_key AS modelKey,
        canonical_slug AS canonicalSlug,
        display_name AS displayName,
        description AS description,
        vendor AS vendor,
        family AS family,
        status AS status,
        visibility AS visibility,
        context_length AS contextLength,
        max_output_tokens AS maxOutputTokens,
        architecture_modality AS architectureModality,
        input_modalities_json AS inputModalitiesJson,
        output_modalities_json AS outputModalitiesJson,
        tokenizer AS tokenizer,
        instruct_type AS instructType,
        supported_parameters_json AS supportedParametersJson,
        capabilities_json AS capabilitiesJson,
        cap_reasoning AS capReasoning,
        cap_tools AS capTools,
        cap_structured_outputs AS capStructuredOutputs,
        cap_vision AS capVision,
        cap_long_context AS capLongContext,
        pricing_json AS pricingJson,
        price_prompt AS pricePrompt,
        price_completion AS priceCompletion,
        price_request AS priceRequest,
        price_image AS priceImage,
        price_web_search AS priceWebSearch,
        price_internal_reasoning AS priceInternalReasoning,
        price_input_cache_read AS priceInputCacheRead,
        price_input_cache_write AS priceInputCacheWrite,
        created_at_sec AS createdAtSec,
        expiration_date AS expirationDate,
        expiration_at_sec AS expirationAtSec,
        unknown_expiration AS unknownExpiration,
        per_request_limits_json AS perRequestLimitsJson,
        default_parameters_json AS defaultParametersJson,
        has_per_request_limits AS hasPerRequestLimits,
        has_default_parameters AS hasDefaultParameters,
        has_tools AS hasTools,
        has_structured_outputs AS hasStructuredOutputs,
        has_reasoning AS hasReasoning,
        has_seed AS hasSeed,
        in_modality_image AS inModalityImage,
        top_provider_context_length AS topProviderContextLength,
        top_provider_is_moderated AS topProviderIsModerated,
        first_seen_at_ms AS firstSeenAtMs,
        last_seen_at_ms AS lastSeenAtMs,
        synced_at_ms AS syncedAtMs,
        raw_json AS rawJson
      FROM models
      WHERE provider_key = @providerKey
        AND model_id = @modelId
      LIMIT 1
    `)

    this.coreClearQueryModelIdsTempTableStmt = this.db.prepare(`
      DELETE FROM catalog_query_model_ids
    `)

    this.coreInsertQueryModelIdStmt = this.db.prepare(`
      INSERT OR IGNORE INTO catalog_query_model_ids(model_id)
      VALUES(@modelId)
    `)

    this.corePopulateQueryModelIdsTx = this.db.transaction((modelIds: readonly string[]) => {
      this.coreClearQueryModelIdsTempTableStmt.run()
      for (const modelId of modelIds) {
        this.coreInsertQueryModelIdStmt.run({ modelId })
      }
    })

    this.endpointMetaDeleteByModelStmt = this.db.prepare(`
      DELETE FROM endpoint_meta
      WHERE provider_key = @providerKey
        AND base_url = @baseUrl
        AND model_id = @modelId
    `)

    this.endpointMetaUpsertStmt = this.db.prepare(`
      INSERT INTO endpoint_meta(
        provider_key,
        base_url,
        model_id,
        endpoint_key,
        provider_name,
        tag,
        quantization,
        context_length,
        max_completion_tokens,
        max_prompt_tokens,
        supported_parameters_json,
        supports_implicit_caching,
        status,
        raw_json,
        fetched_at_ms,
        updated_at_ms
      )
      VALUES(
        @providerKey,
        @baseUrl,
        @modelId,
        @endpointKey,
        @providerName,
        @tag,
        @quantization,
        @contextLength,
        @maxCompletionTokens,
        @maxPromptTokens,
        @supportedParametersJson,
        @supportsImplicitCaching,
        @status,
        @rawJson,
        @fetchedAtMs,
        @updatedAtMs
      )
      ON CONFLICT(provider_key, base_url, model_id, endpoint_key) DO UPDATE SET
        provider_name = excluded.provider_name,
        tag = excluded.tag,
        quantization = excluded.quantization,
        context_length = excluded.context_length,
        max_completion_tokens = excluded.max_completion_tokens,
        max_prompt_tokens = excluded.max_prompt_tokens,
        supported_parameters_json = excluded.supported_parameters_json,
        supports_implicit_caching = excluded.supports_implicit_caching,
        status = excluded.status,
        raw_json = excluded.raw_json,
        fetched_at_ms = excluded.fetched_at_ms,
        updated_at_ms = excluded.updated_at_ms
    `)

    this.endpointMetaListByModelStmt = this.db.prepare(`
      SELECT
        provider_key AS providerKey,
        base_url AS baseUrl,
        model_id AS modelId,
        endpoint_key AS endpointKey,
        provider_name AS providerName,
        tag,
        quantization,
        context_length AS contextLength,
        max_completion_tokens AS maxCompletionTokens,
        max_prompt_tokens AS maxPromptTokens,
        supported_parameters_json AS supportedParametersJson,
        supports_implicit_caching AS supportsImplicitCaching,
        status,
        raw_json AS rawJson,
        fetched_at_ms AS fetchedAtMs,
        updated_at_ms AS updatedAtMs
      FROM endpoint_meta
      WHERE provider_key = @providerKey
        AND base_url = @baseUrl
        AND model_id = @modelId
      ORDER BY endpoint_key ASC
    `)

    this.coreUpdateSyncErrorStmt = this.db.prepare(`
      UPDATE catalog_meta
      SET
        sync_state = @syncState,
        last_error_code = @lastErrorCode,
        last_error_message = @lastErrorMessage
      WHERE provider_key = @providerKey
    `)
  }

  /**
   * CatalogSyncJob writer (single transaction):
   * 1) UPSERT the snapshot models (full overwrite) and mark is_hidden=0.
   * 2) Mark models missing from this snapshot as is_hidden=1 (soft hidden).
   *
   * Any error will rollback the whole sync (no half-sync).
   */
  syncSnapshot(input: Readonly<{ snapshotId: string; routerSource: string; models: CatalogModelUpsertInput[] }>): void {
    const nowMs = Date.now()
    const tx = this.db.transaction(() => {
      for (const model of input.models) {
        this.upsertStmt.run({
          modelId: model.modelId,
          routerSource: model.routerSource,
          vendor: model.vendor,
          name: model.name,
          description: model.description ?? null,
          contextLength: model.contextLength ?? -1,
          supportedParametersJson: model.supportedParametersJson ?? null,
          rawJson: model.rawJson ?? null,
          snapshotId: input.snapshotId,
          nowMs,
        })
      }

      this.hideMissingStmt.run({
        routerSource: input.routerSource,
        snapshotId: input.snapshotId,
        nowMs,
      })
    })

    tx()
  }

  listByRouterSource(routerSource: string): Array<{
    modelId: string
    name: string
    vendor: string
    description: string | null
    contextLength: number
    supportedParametersJson: string | null
    lastSeenSnapshotId: string | null
    isHidden: 0 | 1
    createdAtMs: number
    updatedAtMs: number
  }> {
    return this.listByRouterSourceStmt.all({ routerSource }) as any
  }

  /**
   * Phase-1 catalog core snapshot writer:
   * - UPSERT providers/models/meta
   * - Replace tags for current provider
   * - Mark missing models as hidden
   * - All in one transaction (no half-sync)
   */
  syncCoreSnapshot(input: CatalogCoreSyncSnapshotInput): void {
    if (input.meta.providerKey !== input.providerKey) {
      throw new Error('Catalog core snapshot providerKey mismatch between payload and meta')
    }
    const seenModelIds = new Set(input.models.map((model) => model.modelId))
    const seenModelCount = seenModelIds.size

    const tx = this.db.transaction(() => {
      this.coreClearSeenTempTableStmt.run()
      const beforeRow = this.coreCountModelsStmt.get({
        providerKey: input.providerKey,
      }) as { count?: number } | undefined
      const previousModelCount = Number(beforeRow?.count ?? 0)

      const primaryProvider = input.providers.find((provider) => provider.providerKey === input.providerKey)
      const fallbackDisplayName =
        input.providerKey === 'openrouter'
          ? 'OpenRouter'
          : input.providerKey
      this.coreEnsurePrimaryProviderStmt.run({
        providerKey: input.providerKey,
        displayName: primaryProvider?.displayName ?? fallbackDisplayName,
        updatedAtMs: input.meta.lastSyncAtMs,
      })

      for (const provider of input.providers) {
        this.coreProviderUpsertStmt.run({
          providerKey: provider.providerKey,
          displayName: provider.displayName,
          slug: provider.slug ?? null,
          privacyPolicyUrl: provider.privacyPolicyUrl ?? null,
          termsOfServiceUrl: provider.termsOfServiceUrl ?? null,
          statusPageUrl: provider.statusPageUrl ?? null,
          updatedAtMs: provider.updatedAtMs,
          rawJson: provider.rawJson ?? null,
        })
      }

      for (const model of input.models) {
        this.coreModelUpsertStmt.run({
          providerKey: model.providerKey,
          modelId: model.modelId,
          modelKey: model.modelKey,
          canonicalSlug: model.canonicalSlug ?? null,
          displayName: model.displayName,
          description: model.description ?? null,
          vendor: model.vendor ?? null,
          family: model.family ?? null,
          status: model.status,
          visibility: model.visibility,
          contextLength: model.contextLength ?? null,
          maxOutputTokens: model.maxOutputTokens ?? null,
          architectureModality: model.architectureModality ?? null,
          inputModalitiesJson: model.inputModalitiesJson,
          outputModalitiesJson: model.outputModalitiesJson,
          tokenizer: model.tokenizer ?? null,
          instructType: model.instructType ?? null,
          supportedParametersJson: model.supportedParametersJson,
          capabilitiesJson: model.capabilitiesJson,
          capReasoning: model.capReasoning,
          capTools: model.capTools,
          capStructuredOutputs: model.capStructuredOutputs,
          capVision: model.capVision,
          capLongContext: model.capLongContext,
          pricingJson: model.pricingJson ?? null,
          pricePrompt: model.pricePrompt ?? null,
          priceCompletion: model.priceCompletion ?? null,
          priceRequest: model.priceRequest ?? null,
          priceImage: model.priceImage ?? null,
          priceWebSearch: model.priceWebSearch ?? null,
          priceInternalReasoning: model.priceInternalReasoning ?? null,
          priceInputCacheRead: model.priceInputCacheRead ?? null,
          priceInputCacheWrite: model.priceInputCacheWrite ?? null,
          createdAtSec: model.createdAtSec ?? null,
          expirationDate: model.expirationDate ?? null,
          expirationAtSec: model.expirationAtSec ?? null,
          unknownExpiration: model.unknownExpiration ?? 0,
          perRequestLimitsJson: model.perRequestLimitsJson ?? null,
          defaultParametersJson: model.defaultParametersJson ?? null,
          hasPerRequestLimits: model.hasPerRequestLimits ?? 0,
          hasDefaultParameters: model.hasDefaultParameters ?? 0,
          hasTools: model.hasTools ?? model.capTools,
          hasStructuredOutputs: model.hasStructuredOutputs ?? model.capStructuredOutputs,
          hasReasoning: model.hasReasoning ?? model.capReasoning,
          hasSeed: model.hasSeed ?? 0,
          inModalityImage: model.inModalityImage ?? 0,
          topProviderContextLength: model.topProviderContextLength ?? null,
          topProviderIsModerated: model.topProviderIsModerated ?? null,
          firstSeenAtMs: model.firstSeenAtMs,
          lastSeenAtMs: model.lastSeenAtMs,
          syncedAtMs: model.syncedAtMs,
          rawJson: model.rawJson ?? null,
        })
        this.coreInsertSeenModelStmt.run({ modelId: model.modelId })
      }

      const hideGuardThreshold = Math.ceil(previousModelCount * MODEL_HIDE_GUARD_RATIO)
      const shouldSkipHide =
        previousModelCount >= MODEL_HIDE_GUARD_MIN_BASELINE &&
        seenModelCount < hideGuardThreshold

      if (!shouldSkipHide) {
        this.coreMarkMissingHiddenStmt.run({
          providerKey: input.providerKey,
          syncedAtMs: input.meta.lastSyncAtMs,
        })
      }

      if (!shouldSkipHide) {
        this.coreDeleteTagsByProviderStmt.run({ providerKey: input.providerKey })
      }
      for (const tag of input.tags) {
        if (tag.providerKey !== input.providerKey) continue
        if (!seenModelIds.has(tag.modelId)) continue
        this.coreTagUpsertStmt.run({
          providerKey: tag.providerKey,
          modelId: tag.modelId,
          tagKey: tag.tagKey,
          tagLabel: tag.tagLabel,
          tagType: tag.tagType,
          confidence: tag.confidence,
          source: tag.source,
          updatedAtMs: tag.updatedAtMs,
        })
      }

      const visibleRow = this.coreCountByVisibilityStmt.get({
        providerKey: input.providerKey,
        visibility: 'visible',
      }) as { count?: number } | undefined
      const hiddenRow = this.coreCountByVisibilityStmt.get({
        providerKey: input.providerKey,
        visibility: 'hidden',
      }) as { count?: number } | undefined
      const visibleModelCount = Number(visibleRow?.count ?? 0)
      const hiddenModelCount = Number(hiddenRow?.count ?? 0)
      const modelCount = visibleModelCount + hiddenModelCount

      this.coreMetaUpsertStmt.run({
        providerKey: input.meta.providerKey,
        schemaVersion: input.meta.schemaVersion,
        dataSource: input.meta.dataSource,
        baseUrl: input.meta.baseUrl,
        snapshotId: input.meta.snapshotId,
        modelCount,
        visibleModelCount,
        hiddenModelCount,
        providerCount: input.meta.providerCount ?? null,
        lastCountProbe: input.meta.lastCountProbe ?? null,
        lastCountProbeAtMs: input.meta.lastCountProbeAtMs ?? null,
        lastSyncAtMs: input.meta.lastSyncAtMs,
        ttlSeconds: input.meta.ttlSeconds,
        syncState: input.meta.syncState,
        lastErrorCode: input.meta.lastErrorCode ?? null,
        lastErrorMessage: input.meta.lastErrorMessage ?? null,
        rawRetentionPolicyJson: input.meta.rawRetentionPolicyJson,
      })
    })

    tx()
  }

  getCoreMeta(providerKey: string): CatalogCoreMetaRecord | null {
    const row = this.coreGetMetaStmt.get({ providerKey }) as CatalogCoreMetaRecord | undefined
    return row ?? null
  }

  updateMetaSyncError(providerKey: string, syncState: 'error', lastErrorCode: string, lastErrorMessage: string): void {
    this.coreUpdateSyncErrorStmt.run({
      providerKey,
      syncState,
      lastErrorCode,
      lastErrorMessage,
    })
  }

  getScopedMeta(providerKey: string, catalogScopeKey: string): CatalogScopedMetaRecord | null {
    const row = this.db.prepare(`
      SELECT
        provider_key AS providerKey,
        catalog_scope_key AS catalogScopeKey,
        base_url AS baseUrl,
        data_source AS dataSource,
        active_snapshot_id AS activeSnapshotId,
        sync_state AS syncState,
        last_sync_at_ms AS lastSyncAtMs,
        last_used_at_ms AS lastUsedAtMs,
        model_count AS modelCount,
        visible_model_count AS visibleModelCount,
        hidden_model_count AS hiddenModelCount,
        last_error_code AS lastErrorCode,
        last_error_message AS lastErrorMessage,
        last_validated_at_ms AS lastValidatedAtMs,
        last_repair_attempt_at_ms AS lastRepairAttemptAtMs,
        repair_attempt_count AS repairAttemptCount,
        snapshot_checksum AS snapshotChecksum,
        schema_version AS schemaVersion
      FROM catalog_scope_meta
      WHERE provider_key = @providerKey
        AND catalog_scope_key = @catalogScopeKey
      LIMIT 1
    `).get({ providerKey, catalogScopeKey }) as CatalogScopedMetaRecord | undefined
    return row ?? null
  }

  upsertScopedMeta(input: CatalogScopedMetaUpsertInput): void {
    this.db.prepare(`
      INSERT INTO catalog_scope_meta(
        provider_key,
        catalog_scope_key,
        base_url,
        data_source,
        active_snapshot_id,
        sync_state,
        last_sync_at_ms,
        last_used_at_ms,
        model_count,
        visible_model_count,
        hidden_model_count,
        last_error_code,
        last_error_message,
        last_validated_at_ms,
        last_repair_attempt_at_ms,
        repair_attempt_count,
        snapshot_checksum,
        schema_version
      )
      VALUES(
        @providerKey,
        @catalogScopeKey,
        @baseUrl,
        @dataSource,
        @activeSnapshotId,
        @syncState,
        @lastSyncAtMs,
        @lastUsedAtMs,
        @modelCount,
        @visibleModelCount,
        @hiddenModelCount,
        @lastErrorCode,
        @lastErrorMessage,
        @lastValidatedAtMs,
        @lastRepairAttemptAtMs,
        @repairAttemptCount,
        @snapshotChecksum,
        @schemaVersion
      )
      ON CONFLICT(provider_key, catalog_scope_key) DO UPDATE SET
        base_url = excluded.base_url,
        data_source = excluded.data_source,
        active_snapshot_id = excluded.active_snapshot_id,
        sync_state = excluded.sync_state,
        last_sync_at_ms = excluded.last_sync_at_ms,
        last_used_at_ms = excluded.last_used_at_ms,
        model_count = excluded.model_count,
        visible_model_count = excluded.visible_model_count,
        hidden_model_count = excluded.hidden_model_count,
        last_error_code = excluded.last_error_code,
        last_error_message = excluded.last_error_message,
        last_validated_at_ms = excluded.last_validated_at_ms,
        last_repair_attempt_at_ms = excluded.last_repair_attempt_at_ms,
        repair_attempt_count = excluded.repair_attempt_count,
        snapshot_checksum = excluded.snapshot_checksum,
        schema_version = excluded.schema_version
    `).run({
      providerKey: input.providerKey,
      catalogScopeKey: input.catalogScopeKey,
      baseUrl: input.baseUrl,
      dataSource: input.dataSource,
      activeSnapshotId: input.activeSnapshotId ?? null,
      syncState: input.syncState,
      lastSyncAtMs: input.lastSyncAtMs ?? 0,
      lastUsedAtMs: input.lastUsedAtMs,
      modelCount: input.modelCount ?? 0,
      visibleModelCount: input.visibleModelCount ?? 0,
      hiddenModelCount: input.hiddenModelCount ?? 0,
      lastErrorCode: input.lastErrorCode ?? null,
      lastErrorMessage: input.lastErrorMessage ?? null,
      lastValidatedAtMs: input.lastValidatedAtMs ?? null,
      lastRepairAttemptAtMs: input.lastRepairAttemptAtMs ?? null,
      repairAttemptCount: input.repairAttemptCount ?? 0,
      snapshotChecksum: input.snapshotChecksum ?? null,
      schemaVersion: input.schemaVersion,
    })
  }

  insertScopedModelRows(input: Readonly<{
    providerKey: string
    catalogScopeKey: string
    snapshotId: string
    models: readonly CatalogScopedModelUpsertInput[]
  }>): void {
    validateScopedSnapshotRows({
      providerKey: input.providerKey,
      catalogScopeKey: input.catalogScopeKey,
      snapshotId: input.snapshotId,
      modelCount: input.models.length,
      visibleModelCount: input.models.filter((model) => model.visibility === 'visible').length,
      hiddenModelCount: input.models.filter((model) => model.visibility === 'hidden').length,
      rows: input.models.map((model) => ({
        providerKey: input.providerKey,
        catalogScopeKey: input.catalogScopeKey,
        snapshotId: input.snapshotId,
        ...model,
        inputModalitiesJson: model.inputModalitiesJson ?? '[]',
        outputModalitiesJson: model.outputModalitiesJson ?? '[]',
        supportedParametersJson: model.supportedParametersJson ?? '[]',
        capabilitiesJson: model.capabilitiesJson ?? '{}',
        pricingJson: model.pricingJson ?? null,
        rawJson: model.rawJson ?? null,
      })),
    })
    const tx = this.db.transaction(() => {
      this.insertScopedModelRowsUnchecked(input)
    })
    tx()
  }

  private insertScopedModelRowsUnchecked(input: Readonly<{
    providerKey: string
    catalogScopeKey: string
    snapshotId: string
    models: readonly CatalogScopedModelUpsertInput[]
  }>): void {
    const stmt = this.db.prepare(`
      INSERT INTO catalog_models(
        provider_key,
        catalog_scope_key,
        snapshot_id,
        model_id,
        model_key,
        canonical_slug,
        display_name,
        description,
        vendor,
        family,
        status,
        visibility,
        context_length,
        max_output_tokens,
        input_modalities_json,
        output_modalities_json,
        supported_parameters_json,
        capabilities_json,
        pricing_json,
        raw_json,
        created_at_sec,
        first_seen_at_ms,
        last_seen_at_ms,
        synced_at_ms
      )
      VALUES(
        @providerKey,
        @catalogScopeKey,
        @snapshotId,
        @modelId,
        @modelKey,
        @canonicalSlug,
        @displayName,
        @description,
        @vendor,
        @family,
        @status,
        @visibility,
        @contextLength,
        @maxOutputTokens,
        @inputModalitiesJson,
        @outputModalitiesJson,
        @supportedParametersJson,
        @capabilitiesJson,
        @pricingJson,
        @rawJson,
        @createdAtSec,
        @firstSeenAtMs,
        @lastSeenAtMs,
        @syncedAtMs
      )
      ON CONFLICT(provider_key, catalog_scope_key, snapshot_id, model_id) DO UPDATE SET
        model_key = excluded.model_key,
        canonical_slug = excluded.canonical_slug,
        display_name = excluded.display_name,
        description = excluded.description,
        vendor = excluded.vendor,
        family = excluded.family,
        status = excluded.status,
        visibility = excluded.visibility,
        context_length = excluded.context_length,
        max_output_tokens = excluded.max_output_tokens,
        input_modalities_json = excluded.input_modalities_json,
        output_modalities_json = excluded.output_modalities_json,
        supported_parameters_json = excluded.supported_parameters_json,
        capabilities_json = excluded.capabilities_json,
        pricing_json = excluded.pricing_json,
        raw_json = excluded.raw_json,
        created_at_sec = excluded.created_at_sec,
        first_seen_at_ms = excluded.first_seen_at_ms,
        last_seen_at_ms = excluded.last_seen_at_ms,
        synced_at_ms = excluded.synced_at_ms
    `)

    for (const model of input.models) {
      stmt.run({
        providerKey: input.providerKey,
        catalogScopeKey: input.catalogScopeKey,
        snapshotId: input.snapshotId,
        modelId: model.modelId,
        modelKey: model.modelKey,
        canonicalSlug: model.canonicalSlug ?? null,
        displayName: model.displayName,
        description: model.description ?? null,
        vendor: model.vendor ?? null,
        family: model.family ?? null,
        status: model.status,
        visibility: model.visibility,
        contextLength: model.contextLength ?? null,
        maxOutputTokens: model.maxOutputTokens ?? null,
        inputModalitiesJson: model.inputModalitiesJson ?? '[]',
        outputModalitiesJson: model.outputModalitiesJson ?? '[]',
        supportedParametersJson: model.supportedParametersJson ?? '[]',
        capabilitiesJson: model.capabilitiesJson ?? '{}',
        pricingJson: model.pricingJson ?? null,
        rawJson: model.rawJson ?? null,
        createdAtSec: model.createdAtSec ?? null,
        firstSeenAtMs: model.firstSeenAtMs,
        lastSeenAtMs: model.lastSeenAtMs,
        syncedAtMs: model.syncedAtMs,
      })
    }
  }

  writeScopedSnapshot(input: CatalogScopedSnapshotWriteInput): CatalogScopedSnapshotWriteResult {
    const providerKey = String(input.providerKey ?? '').trim()
    const catalogScopeKey = String(input.catalogScopeKey ?? '').trim()
    const baseUrl = String(input.baseUrl ?? '').trim()
    const dataSource = input.dataSource
    const snapshotId = String(input.snapshotId ?? '').trim()
    const syncedAtMs = Math.floor(Number(input.syncedAtMs))
    const schemaVersion = Math.floor(Number(input.schemaVersion))
    if (!providerKey || !catalogScopeKey || !baseUrl || !snapshotId || !Number.isFinite(syncedAtMs) || !Number.isFinite(schemaVersion)) {
      throw new CatalogScopedSnapshotValidationError('cache_corrupted: scoped snapshot write input is invalid')
    }

    const modelCount = input.models.length
    const visibleModelCount = input.models.filter((model) => model.visibility === 'visible').length
    const hiddenModelCount = input.models.filter((model) => model.visibility === 'hidden').length
    validateScopedSnapshotRows({
      providerKey,
      catalogScopeKey,
      snapshotId,
      modelCount,
      visibleModelCount,
      hiddenModelCount,
      rows: input.models.map((model) => ({
        providerKey,
        catalogScopeKey,
        snapshotId,
        ...model,
        inputModalitiesJson: model.inputModalitiesJson ?? '[]',
        outputModalitiesJson: model.outputModalitiesJson ?? '[]',
        supportedParametersJson: model.supportedParametersJson ?? '[]',
        capabilitiesJson: model.capabilitiesJson ?? '{}',
        pricingJson: model.pricingJson ?? null,
        rawJson: model.rawJson ?? null,
      })),
    })

    const tx = this.db.transaction(() => {
      const existingMeta = this.getScopedMeta(providerKey, catalogScopeKey)
      this.upsertScopedMeta({
        providerKey,
        catalogScopeKey,
        baseUrl,
        dataSource,
        activeSnapshotId: existingMeta?.activeSnapshotId ?? null,
        syncState: existingMeta?.syncState ?? 'idle',
        lastSyncAtMs: existingMeta?.lastSyncAtMs ?? 0,
        lastUsedAtMs: syncedAtMs,
        modelCount: existingMeta?.modelCount ?? 0,
        visibleModelCount: existingMeta?.visibleModelCount ?? 0,
        hiddenModelCount: existingMeta?.hiddenModelCount ?? 0,
        lastErrorCode: existingMeta?.lastErrorCode ?? null,
        lastErrorMessage: existingMeta?.lastErrorMessage ?? null,
        lastValidatedAtMs: existingMeta?.lastValidatedAtMs ?? null,
        lastRepairAttemptAtMs: existingMeta?.lastRepairAttemptAtMs ?? null,
        repairAttemptCount: existingMeta?.repairAttemptCount ?? 0,
        snapshotChecksum: existingMeta?.snapshotChecksum ?? null,
        schemaVersion,
      })

      this.db.prepare(`
        DELETE FROM catalog_models
        WHERE provider_key = @providerKey
          AND catalog_scope_key = @catalogScopeKey
          AND snapshot_id = @snapshotId
      `).run({ providerKey, catalogScopeKey, snapshotId })

      this.insertScopedModelRowsUnchecked({
        providerKey,
        catalogScopeKey,
        snapshotId,
        models: input.models,
      })

      const rows = this.selectScopedSnapshotRows(providerKey, catalogScopeKey, snapshotId)
      validateScopedSnapshotRows({
        providerKey,
        catalogScopeKey,
        snapshotId,
        modelCount,
        visibleModelCount,
        hiddenModelCount,
        rows,
      })

      this.db.prepare(`
        UPDATE catalog_scope_meta
        SET
          base_url = @baseUrl,
          data_source = @dataSource,
          active_snapshot_id = @snapshotId,
          sync_state = 'ok',
          last_sync_at_ms = @syncedAtMs,
          last_used_at_ms = @syncedAtMs,
          model_count = @modelCount,
          visible_model_count = @visibleModelCount,
          hidden_model_count = @hiddenModelCount,
          last_error_code = NULL,
          last_error_message = NULL,
          last_validated_at_ms = @syncedAtMs,
          snapshot_checksum = @snapshotChecksum,
          schema_version = @schemaVersion
        WHERE provider_key = @providerKey
          AND catalog_scope_key = @catalogScopeKey
      `).run({
        providerKey,
        catalogScopeKey,
        baseUrl,
        dataSource,
        snapshotId,
        syncedAtMs,
        modelCount,
        visibleModelCount,
        hiddenModelCount,
        snapshotChecksum: input.snapshotChecksum ?? null,
        schemaVersion,
      })

      if (input.pruneOldSnapshots === true) {
        this.db.prepare(`
          DELETE FROM catalog_models
          WHERE provider_key = @providerKey
            AND catalog_scope_key = @catalogScopeKey
            AND snapshot_id <> @snapshotId
        `).run({ providerKey, catalogScopeKey, snapshotId })
      }
    })
    tx()
    return {
      providerKey,
      catalogScopeKey,
      activeSnapshotId: snapshotId,
      modelCount,
      visibleModelCount,
      hiddenModelCount,
    }
  }

  validateActiveScopedSnapshot(providerKey: string, catalogScopeKey: string): CatalogScopedSnapshotValidationResult {
    const normalizedProviderKey = String(providerKey ?? '').trim()
    const normalizedScopeKey = String(catalogScopeKey ?? '').trim()
    if (!normalizedProviderKey || !normalizedScopeKey) {
      throw new Error('validateActiveScopedSnapshot requires providerKey/catalogScopeKey')
    }
    const meta = this.getScopedMeta(normalizedProviderKey, normalizedScopeKey)
    if (!meta) {
      return { ok: true, meta: null, modelCount: 0 }
    }
    const activeSnapshotId = String(meta.activeSnapshotId ?? '').trim()
    if (!activeSnapshotId) {
      if (meta.modelCount > 0) {
        return {
          ok: false,
          code: 'cache_corrupted',
          message: 'cache_corrupted: scoped active snapshot is missing',
        }
      }
      return { ok: true, meta, modelCount: 0 }
    }
    const rows = this.selectScopedSnapshotRows(normalizedProviderKey, normalizedScopeKey, activeSnapshotId)
    try {
      validateScopedSnapshotRows({
        providerKey: normalizedProviderKey,
        catalogScopeKey: normalizedScopeKey,
        snapshotId: activeSnapshotId,
        modelCount: meta.modelCount,
        visibleModelCount: meta.visibleModelCount,
        hiddenModelCount: meta.hiddenModelCount,
        rows,
      })
    } catch (error) {
      if (error instanceof CatalogScopedSnapshotValidationError) {
        return {
          ok: false,
          code: 'cache_corrupted',
          message: error.message,
        }
      }
      throw error
    }
    return { ok: true, meta, modelCount: rows.length }
  }

  updateScopedMetaSyncError(input: CatalogScopedMetaErrorInput): void {
    const providerKey = String(input.providerKey ?? '').trim()
    const catalogScopeKey = String(input.catalogScopeKey ?? '').trim()
    const baseUrl = String(input.baseUrl ?? '').trim()
    const lastErrorCode = String(input.lastErrorCode ?? '').trim()
    const lastErrorMessage = String(input.lastErrorMessage ?? '').trim()
    const atMs = Math.floor(Number(input.atMs))
    const schemaVersion = Math.floor(Number(input.schemaVersion))
    if (!providerKey || !catalogScopeKey || !baseUrl || !lastErrorCode || !Number.isFinite(atMs) || !Number.isFinite(schemaVersion)) {
      throw new Error('updateScopedMetaSyncError requires providerKey/catalogScopeKey/baseUrl/errorCode/atMs/schemaVersion')
    }
    const existingMeta = this.getScopedMeta(providerKey, catalogScopeKey)
    this.upsertScopedMeta({
      providerKey,
      catalogScopeKey,
      baseUrl,
      dataSource: input.dataSource,
      activeSnapshotId: existingMeta?.activeSnapshotId ?? null,
      syncState: 'error',
      lastSyncAtMs: existingMeta?.lastSyncAtMs ?? 0,
      lastUsedAtMs: atMs,
      modelCount: existingMeta?.modelCount ?? 0,
      visibleModelCount: existingMeta?.visibleModelCount ?? 0,
      hiddenModelCount: existingMeta?.hiddenModelCount ?? 0,
      lastErrorCode,
      lastErrorMessage,
      lastValidatedAtMs: existingMeta?.lastValidatedAtMs ?? null,
      lastRepairAttemptAtMs: existingMeta?.lastRepairAttemptAtMs ?? null,
      repairAttemptCount: existingMeta?.repairAttemptCount ?? 0,
      snapshotChecksum: existingMeta?.snapshotChecksum ?? null,
      schemaVersion,
    })
  }

  private selectScopedSnapshotRows(providerKey: string, catalogScopeKey: string, snapshotId: string): CatalogScopedModelRecord[] {
    return this.db.prepare(`
      SELECT
        provider_key AS providerKey,
        catalog_scope_key AS catalogScopeKey,
        snapshot_id AS snapshotId,
        model_id AS modelId,
        model_key AS modelKey,
        canonical_slug AS canonicalSlug,
        display_name AS displayName,
        description AS description,
        vendor AS vendor,
        family AS family,
        status AS status,
        visibility AS visibility,
        context_length AS contextLength,
        max_output_tokens AS maxOutputTokens,
        input_modalities_json AS inputModalitiesJson,
        output_modalities_json AS outputModalitiesJson,
        supported_parameters_json AS supportedParametersJson,
        capabilities_json AS capabilitiesJson,
        pricing_json AS pricingJson,
        raw_json AS rawJson,
        created_at_sec AS createdAtSec,
        first_seen_at_ms AS firstSeenAtMs,
        last_seen_at_ms AS lastSeenAtMs,
        synced_at_ms AS syncedAtMs
      FROM catalog_models
      WHERE provider_key = @providerKey
        AND catalog_scope_key = @catalogScopeKey
        AND snapshot_id = @snapshotId
      ORDER BY model_id ASC
    `).all({ providerKey, catalogScopeKey, snapshotId }) as CatalogScopedModelRecord[]
  }

  queryScopedActiveModels(input: CatalogScopedQueryInput): CatalogScopedQueryResult {
    const providerKey = String(input.providerKey ?? '').trim()
    const catalogScopeKey = String(input.catalogScopeKey ?? '').trim()
    if (!providerKey || !catalogScopeKey) {
      throw new Error('queryScopedActiveModels requires providerKey/catalogScopeKey')
    }

    const validation = this.validateActiveScopedSnapshot(providerKey, catalogScopeKey)
    if (!validation.ok) {
      throw new CatalogScopedSnapshotValidationError(validation.message)
    }
    const activeSnapshotId = validation.meta?.activeSnapshotId ?? null
    if (!validation.meta || !activeSnapshotId) {
      return { items: [], nextCursor: null }
    }

    const sortBy: CatalogCoreQuerySortBy =
      input.sortBy === 'created_at' ||
      input.sortBy === 'context_length' ||
      input.sortBy === 'max_output_tokens'
        ? input.sortBy
        : 'name'
    const sortOrder: CatalogCoreQuerySortOrder = input.sortOrder === 'desc' ? 'desc' : 'asc'
    const orderSql = sortOrder === 'desc' ? 'DESC' : 'ASC'
    const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit ?? 20))))
    const cursor = input.cursor ?? null
    const where: string[] = [
      'models.provider_key = @providerKey',
      'models.catalog_scope_key = @catalogScopeKey',
      'models.snapshot_id = @activeSnapshotId',
      "models.visibility = 'visible'",
      "models.status = 'active'",
    ]
    const params: Record<string, unknown> = {
      providerKey,
      catalogScopeKey,
      activeSnapshotId,
    }

    const searchText = String(input.searchText ?? '').trim()
    let searchRankSql: string | null = null
    if (searchText.length > 0) {
      params.searchExact = searchText.toLowerCase()
      params.searchLike = `%${escapeSqlLike(searchText.toLowerCase())}%`
      const searchConditions = [
        'LOWER(models.display_name) = @searchExact',
        'LOWER(models.model_id) = @searchExact',
        "LOWER(COALESCE(models.canonical_slug, '')) = @searchExact",
        "LOWER(models.display_name) LIKE @searchLike ESCAPE '\\'",
        "LOWER(models.model_id) LIKE @searchLike ESCAPE '\\'",
        "LOWER(COALESCE(models.canonical_slug, '')) LIKE @searchLike ESCAPE '\\'",
      ]
      if (input.includeDescriptionInSearch === true) {
        searchConditions.push("LOWER(COALESCE(models.description, '')) LIKE @searchLike ESCAPE '\\'")
      }
      searchRankSql = `
        CASE
          WHEN LOWER(models.display_name) = @searchExact THEN 0
          WHEN LOWER(models.model_id) = @searchExact THEN 1
          WHEN LOWER(COALESCE(models.canonical_slug, '')) = @searchExact THEN 2
          ELSE 3
        END
      `
      where.push(`(${searchConditions.join('\n OR ')})`)
    }

    const vendorFilters = normalizeLowercaseArray([
      ...(Array.isArray(input.vendors) ? input.vendors : []),
      ...(Array.isArray(input.providers) ? input.providers : []),
    ])
    if (vendorFilters.length > 0) {
      const placeholders: string[] = []
      vendorFilters.forEach((vendor, index) => {
        const key = `vendorFilter${index}`
        placeholders.push(`@${key}`)
        params[key] = vendor
      })
      where.push(`LOWER(COALESCE(models.vendor, '')) IN (${placeholders.join(', ')})`)
    }

    const modelIdFilters = normalizeStringArray(input.modelIds)
    if (modelIdFilters.length > 0) {
      const placeholders: string[] = []
      modelIdFilters.slice(0, QUERY_MODEL_ID_IN_THRESHOLD).forEach((modelId, index) => {
        const key = `modelIdFilter${index}`
        placeholders.push(`@${key}`)
        params[key] = modelId
      })
      where.push(`models.model_id IN (${placeholders.join(', ')})`)
    }

    const scopedCategory = normalizeScopedCategory(input.category)
    if (scopedCategory) {
      pushScopedTextDerivedCategoryWhere(where, params, scopedCategory)
    }

    const capabilityFilters = input.capabilities && typeof input.capabilities === 'object' ? input.capabilities : null
    if (capabilityFilters) {
      if (typeof capabilityFilters.reasoning === 'boolean') {
        pushScopedCapabilityWhere(where, 'reasoning', capabilityFilters.reasoning)
      }
      if (typeof capabilityFilters.tools === 'boolean') {
        pushScopedCapabilityWhere(where, 'tools', capabilityFilters.tools)
      }
      if (typeof capabilityFilters.structuredOutputs === 'boolean') {
        pushScopedCapabilityWhere(where, 'structuredOutputs', capabilityFilters.structuredOutputs)
      }
      if (typeof capabilityFilters.vision === 'boolean') {
        pushScopedCapabilityWhere(where, 'vision', capabilityFilters.vision)
      }
      if (typeof capabilityFilters.longContext === 'boolean') {
        pushScopedCapabilityWhere(where, 'longContext', capabilityFilters.longContext)
      }
    }

    pushRangeWhereClause(where, params, 'COALESCE(models.context_length, 0)', input.contextLength, 'scopedContextLength')
    pushRangeWhereClause(where, params, 'COALESCE(models.max_output_tokens, 0)', input.maxOutputTokens, 'scopedMaxOutputTokens')

    const anyModalityFilters = normalizeLowercaseArray(input.modalities)
    anyModalityFilters.forEach((modality, index) => {
      const key = `scopedAnyModality${index}`
      params[key] = modality
      where.push(`
        (
          EXISTS (
            SELECT 1
            FROM json_each(models.input_modalities_json) im_any_${index}
            WHERE LOWER(TRIM(CAST(im_any_${index}.value AS TEXT))) = @${key}
          )
          OR EXISTS (
            SELECT 1
            FROM json_each(models.output_modalities_json) om_any_${index}
            WHERE LOWER(TRIM(CAST(om_any_${index}.value AS TEXT))) = @${key}
          )
        )
      `)
    })

    const inputModalityFilters = normalizeLowercaseArray(input.inputModalities)
    inputModalityFilters.forEach((modality, index) => {
      const key = `scopedInputModality${index}`
      params[key] = modality
      where.push(`
        EXISTS (
          SELECT 1
          FROM json_each(models.input_modalities_json) im_only_${index}
          WHERE LOWER(TRIM(CAST(im_only_${index}.value AS TEXT))) = @${key}
        )
      `)
    })

    const outputModalityFilters = normalizeLowercaseArray(input.outputModalities)
    outputModalityFilters.forEach((modality, index) => {
      const key = `scopedOutputModality${index}`
      params[key] = modality
      where.push(`
        EXISTS (
          SELECT 1
          FROM json_each(models.output_modalities_json) om_only_${index}
          WHERE LOWER(TRIM(CAST(om_only_${index}.value AS TEXT))) = @${key}
        )
      `)
    })

    const supportedParameters = normalizeLowercaseArray(input.supportedParameters)
    supportedParameters.forEach((parameter, index) => {
      const key = `scopedSupportedParameter${index}`
      params[key] = parameter
      where.push(`
        EXISTS (
          SELECT 1
          FROM json_each(models.supported_parameters_json) sp_${index}
          WHERE LOWER(TRIM(CAST(sp_${index}.value AS TEXT))) = @${key}
        )
      `)
    })

    if (cursor) {
      if (cursor.sortBy !== sortBy || cursor.sortOrder !== sortOrder) {
        throw new Error('Scoped catalog query cursor mismatch with current sort')
      }
      const cursorModelKey = String(cursor.modelKey ?? '').trim()
      if (!cursorModelKey) {
        throw new Error('Scoped catalog query cursor requires modelKey')
      }
      params.cursorModelKey = cursorModelKey
      const op = sortOrder === 'desc' ? '<' : '>'
      if (sortBy === 'name') {
        params.cursorName = String(cursor.name ?? '')
        where.push(`
          (
            models.display_name COLLATE NOCASE ${op} @cursorName COLLATE NOCASE
            OR (
              models.display_name COLLATE NOCASE = @cursorName COLLATE NOCASE
              AND models.model_key ${op} @cursorModelKey
            )
          )
        `)
      } else if (sortBy === 'created_at') {
        params.cursorCreatedAtSec = Number(cursor.createdAtSec ?? 0)
        where.push(`
          (
            COALESCE(models.created_at_sec, 0) ${op} @cursorCreatedAtSec
            OR (
              COALESCE(models.created_at_sec, 0) = @cursorCreatedAtSec
              AND models.model_key ${op} @cursorModelKey
            )
          )
        `)
      } else if (sortBy === 'context_length') {
        params.cursorContextLength = Number(cursor.contextLength ?? 0)
        where.push(`
          (
            COALESCE(models.context_length, 0) ${op} @cursorContextLength
            OR (
              COALESCE(models.context_length, 0) = @cursorContextLength
              AND models.model_key ${op} @cursorModelKey
            )
          )
        `)
      } else {
        params.cursorMaxOutputTokens = Number(cursor.maxOutputTokens ?? 0)
        where.push(`
          (
            COALESCE(models.max_output_tokens, 0) ${op} @cursorMaxOutputTokens
            OR (
              COALESCE(models.max_output_tokens, 0) = @cursorMaxOutputTokens
              AND models.model_key ${op} @cursorModelKey
            )
          )
        `)
      }
    }

    const baseOrderBy =
      sortBy === 'created_at'
        ? `COALESCE(models.created_at_sec, 0) ${orderSql}, models.model_key ${orderSql}`
        : sortBy === 'context_length'
          ? `COALESCE(models.context_length, 0) ${orderSql}, models.model_key ${orderSql}`
          : sortBy === 'max_output_tokens'
            ? `COALESCE(models.max_output_tokens, 0) ${orderSql}, models.model_key ${orderSql}`
            : `models.display_name COLLATE NOCASE ${orderSql}, models.model_key ${orderSql}`
    const orderBy = searchRankSql ? `${searchRankSql} ASC, ${baseOrderBy}` : baseOrderBy
    params.limitPlusOne = limit + 1

    const rows = this.db.prepare(`
      SELECT
        models.provider_key AS providerKey,
        models.catalog_scope_key AS catalogScopeKey,
        models.snapshot_id AS snapshotId,
        models.model_id AS modelId,
        models.model_key AS modelKey,
        models.canonical_slug AS canonicalSlug,
        models.display_name AS displayName,
        models.description AS description,
        models.vendor AS vendor,
        models.family AS family,
        models.status AS status,
        models.visibility AS visibility,
        models.context_length AS contextLength,
        models.max_output_tokens AS maxOutputTokens,
        models.input_modalities_json AS inputModalitiesJson,
        models.output_modalities_json AS outputModalitiesJson,
        models.supported_parameters_json AS supportedParametersJson,
        models.capabilities_json AS capabilitiesJson,
        models.pricing_json AS pricingJson,
        models.raw_json AS rawJson,
        models.created_at_sec AS createdAtSec,
        models.first_seen_at_ms AS firstSeenAtMs,
        models.last_seen_at_ms AS lastSeenAtMs,
        models.synced_at_ms AS syncedAtMs
      FROM catalog_models models
      WHERE ${where.join('\n        AND ')}
      ORDER BY ${orderBy}
      LIMIT @limitPlusOne
    `).all(params) as CatalogScopedModelRecord[]
    const items = rows.slice(0, limit)
    return {
      items,
      nextCursor: rows.length > limit && items.length > 0 ? toScopedCursor(items[items.length - 1], sortBy, sortOrder) : null,
    }
  }

  clearScopedCatalog(providerKey: string, catalogScopeKey: string): CatalogScopedClearResult {
    const deleted: Record<string, number> = {}
    const tx = this.db.transaction(() => {
      deleted.catalog_models = Number(this.db.prepare(`
        DELETE FROM catalog_models
        WHERE provider_key = @providerKey
          AND catalog_scope_key = @catalogScopeKey
      `).run({ providerKey, catalogScopeKey }).changes ?? 0)
      deleted.catalog_scope_meta = Number(this.db.prepare(`
        DELETE FROM catalog_scope_meta
        WHERE provider_key = @providerKey
          AND catalog_scope_key = @catalogScopeKey
      `).run({ providerKey, catalogScopeKey }).changes ?? 0)
    })
    tx()
    return { deleted }
  }

  clearAllProviderScopedCatalog(providerKey: string): CatalogScopedClearResult {
    const deleted: Record<string, number> = {}
    const tx = this.db.transaction(() => {
      deleted.catalog_models = Number(this.db.prepare(`
        DELETE FROM catalog_models
        WHERE provider_key = @providerKey
      `).run({ providerKey }).changes ?? 0)
      deleted.catalog_scope_meta = Number(this.db.prepare(`
        DELETE FROM catalog_scope_meta
        WHERE provider_key = @providerKey
      `).run({ providerKey }).changes ?? 0)
    })
    tx()
    return { deleted }
  }

  clearDeprecatedOpenRouterCatalogCache(): CatalogScopedClearResult {
    const providerKey = 'openrouter'
    const deleted: Record<string, number> = {}
    const runDelete = (name: string, sql: string, params: Record<string, unknown> = { providerKey }) => {
      deleted[name] = Number(this.db.prepare(sql).run(params).changes ?? 0)
    }

    const tx = this.db.transaction(() => {
      runDelete('endpoint_meta', 'DELETE FROM endpoint_meta WHERE provider_key = @providerKey')
      runDelete('model_tags', 'DELETE FROM model_tags WHERE provider_key = @providerKey')
      runDelete('models_fts', 'DELETE FROM models_fts WHERE provider_key = @providerKey')
      runDelete('models', 'DELETE FROM models WHERE provider_key = @providerKey')
      runDelete('catalog_meta', 'DELETE FROM catalog_meta WHERE provider_key = @providerKey')
      runDelete('model_catalog', 'DELETE FROM model_catalog WHERE router_source = @providerKey')
      runDelete('reasoning_model_index', 'DELETE FROM reasoning_model_index', {})
      runDelete('providers', 'DELETE FROM providers WHERE provider_key = @providerKey')
    })
    tx()
    return { deleted }
  }

  getCoreModelDetail(providerKey: string, modelId: string): CatalogCoreModelDetailRecord | null {
    const normalizedProviderKey = String(providerKey ?? '').trim()
    const normalizedModelId = String(modelId ?? '').trim()
    if (!normalizedProviderKey || !normalizedModelId) return null
    const row = this.coreGetModelDetailStmt.get({
      providerKey: normalizedProviderKey,
      modelId: normalizedModelId,
    }) as CatalogCoreModelDetailRecord | undefined
    return row ?? null
  }

  replaceEndpointMetaByModel(input: CatalogEndpointMetaReplaceInput): void {
    const providerKey = String(input.providerKey ?? '').trim()
    const baseUrl = String(input.baseUrl ?? '').trim()
    const modelId = String(input.modelId ?? '').trim()
    if (!providerKey || !baseUrl || !modelId) {
      throw new Error('replaceEndpointMetaByModel requires providerKey/baseUrl/modelId')
    }
    const fetchedAtMs =
      typeof input.fetchedAtMs === 'number' && Number.isFinite(input.fetchedAtMs)
        ? Math.floor(input.fetchedAtMs)
        : Date.now()

    const tx = this.db.transaction(() => {
      this.endpointMetaDeleteByModelStmt.run({ providerKey, baseUrl, modelId })
      for (const endpoint of input.endpoints) {
        const endpointKey = String(endpoint.endpointKey ?? '').trim()
        if (!endpointKey) continue
        const rowProviderKey = String(endpoint.providerKey ?? providerKey).trim()
        const rowBaseUrl = String(endpoint.baseUrl ?? baseUrl).trim()
        const rowModelId = String(endpoint.modelId ?? modelId).trim()
        if (rowProviderKey !== providerKey || rowBaseUrl !== baseUrl || rowModelId !== modelId) continue
        this.endpointMetaUpsertStmt.run({
          providerKey,
          baseUrl,
          modelId,
          endpointKey,
          providerName: endpoint.providerName ?? null,
          tag: endpoint.tag ?? null,
          quantization: endpoint.quantization ?? null,
          contextLength: endpoint.contextLength ?? null,
          maxCompletionTokens: endpoint.maxCompletionTokens ?? null,
          maxPromptTokens: endpoint.maxPromptTokens ?? null,
          supportedParametersJson: endpoint.supportedParametersJson ?? null,
          supportsImplicitCaching:
            endpoint.supportsImplicitCaching === 0 || endpoint.supportsImplicitCaching === 1
              ? endpoint.supportsImplicitCaching
              : null,
          status:
            typeof endpoint.status === 'number' && Number.isFinite(endpoint.status)
              ? endpoint.status
              : null,
          rawJson: endpoint.rawJson ?? null,
          fetchedAtMs,
          updatedAtMs: Date.now(),
        })
      }
    })

    tx()
  }

  listEndpointMetaByModel(providerKey: string, baseUrl: string, modelId: string): CatalogEndpointMetaRecord[] {
    const normalizedProviderKey = String(providerKey ?? '').trim()
    const normalizedBaseUrl = String(baseUrl ?? '').trim()
    const normalizedModelId = String(modelId ?? '').trim()
    if (!normalizedProviderKey || !normalizedBaseUrl || !normalizedModelId) return []
    return this.endpointMetaListByModelStmt.all({
      providerKey: normalizedProviderKey,
      baseUrl: normalizedBaseUrl,
      modelId: normalizedModelId,
    }) as CatalogEndpointMetaRecord[]
  }

  queryCore(input: CatalogCoreQueryInput): CatalogCoreQueryResult {
    const providerKey = String(input.providerKey ?? '').trim()
    if (!providerKey) {
      throw new Error('Catalog query requires providerKey')
    }

    const sortBy: CatalogCoreQuerySortBy =
      input.sortBy === 'created_at' ||
      input.sortBy === 'context_length' ||
      input.sortBy === 'max_output_tokens'
        ? input.sortBy
        : 'name'
    const sortOrder: CatalogCoreQuerySortOrder = input.sortOrder === 'desc' ? 'desc' : 'asc'
    const orderSql = sortOrder === 'desc' ? 'DESC' : 'ASC'
    const limit = Math.max(1, Math.min(100, Math.floor(Number(input.limit ?? 20))))
    const cursor = input.cursor ?? null

    const where: string[] = [
      'models.provider_key = @providerKey',
      "models.visibility = 'visible'",
      "models.status = 'active'",
      '(models.expiration_at_sec IS NULL OR models.expiration_at_sec > @nowSec)',
    ]
    const params: Record<string, unknown> = {
      providerKey,
      nowSec: Math.floor(Date.now() / 1000),
    }
    let useTempModelIdsFilter = false

    const searchText = String(input.searchText ?? '').trim()
    const searchTokens = toSearchTokens(searchText)
    const includeDescriptionInSearch = input.includeDescriptionInSearch === true
    let searchRankSql: string | null = null
    if (searchText.length > 0) {
      params.searchExact = searchText.toLowerCase()
      const displayNameFtsQuery = toFtsPrefixQuery(searchTokens, 'display_name')
      const modelIdFtsQuery = toFtsPrefixQuery(searchTokens, 'model_id')
      const canonicalSlugFtsQuery = toFtsPrefixQuery(searchTokens, 'canonical_slug')
      const identityFtsQuery = toFtsPrefixQuery(searchTokens, '{display_name model_id canonical_slug}')
      const descriptionFtsQuery = includeDescriptionInSearch
        ? toFtsPrefixQuery(searchTokens, 'description')
        : null
      const displayNameFtsMatch = displayNameFtsQuery ? buildFtsExistsSql('displayNameSearchQuery') : null
      const modelIdFtsMatch = modelIdFtsQuery ? buildFtsExistsSql('modelIdSearchQuery') : null
      const canonicalSlugFtsMatch = canonicalSlugFtsQuery ? buildFtsExistsSql('canonicalSlugSearchQuery') : null
      const identityFtsMatch = identityFtsQuery ? buildFtsExistsSql('identitySearchQuery') : null
      const descriptionFtsMatch = descriptionFtsQuery ? buildFtsExistsSql('descriptionSearchQuery') : null
      if (displayNameFtsQuery) params.displayNameSearchQuery = displayNameFtsQuery
      if (modelIdFtsQuery) params.modelIdSearchQuery = modelIdFtsQuery
      if (canonicalSlugFtsQuery) params.canonicalSlugSearchQuery = canonicalSlugFtsQuery
      if (identityFtsQuery) params.identitySearchQuery = identityFtsQuery
      if (descriptionFtsQuery) params.descriptionSearchQuery = descriptionFtsQuery
      const searchConditions: string[] = [
        'LOWER(models.display_name) = @searchExact',
        'LOWER(models.model_id) = @searchExact',
        "LOWER(COALESCE(models.canonical_slug, '')) = @searchExact",
      ]
      if (identityFtsMatch) searchConditions.push(identityFtsMatch)
      if (includeDescriptionInSearch) {
        searchConditions.push("LOWER(COALESCE(models.description, '')) = @searchExact")
        if (descriptionFtsMatch) searchConditions.push(descriptionFtsMatch)
      }
      searchRankSql = `
        CASE
          WHEN LOWER(models.display_name) = @searchExact THEN 0
          WHEN ${displayNameFtsMatch ?? '0'} THEN 1
          WHEN LOWER(models.model_id) = @searchExact THEN 2
          WHEN ${modelIdFtsMatch ?? '0'} THEN 3
          WHEN LOWER(COALESCE(models.canonical_slug, '')) = @searchExact THEN 4
          WHEN ${canonicalSlugFtsMatch ?? '0'} THEN 5
          ${includeDescriptionInSearch ? "WHEN LOWER(COALESCE(models.description, '')) = @searchExact THEN 6" : ''}
          ${includeDescriptionInSearch && descriptionFtsMatch ? `WHEN ${descriptionFtsMatch} THEN 7` : ''}
          ELSE 8
        END
      `
      where.push(`(${searchConditions.join('\n OR ')})`)
    }

    const vendorFilters = normalizeLowercaseArray([
      ...(Array.isArray(input.vendors) ? input.vendors : []),
      ...(Array.isArray(input.providers) ? input.providers : []),
    ])
    if (vendorFilters.length > 0) {
      const vendorPlaceholders: string[] = []
      vendorFilters.forEach((vendor, index) => {
        const key = `vendorFilter${index}`
        vendorPlaceholders.push(`@${key}`)
        params[key] = vendor
      })
      where.push(`LOWER(COALESCE(models.vendor, '')) IN (${vendorPlaceholders.join(', ')})`)
    }

    const modelIdFilters = normalizeStringArray(input.modelIds)
    if (modelIdFilters.length > 0) {
      if (modelIdFilters.length <= QUERY_MODEL_ID_IN_THRESHOLD) {
        const modelIdPlaceholders: string[] = []
        modelIdFilters.forEach((modelId, index) => {
          const key = `modelIdFilter${index}`
          modelIdPlaceholders.push(`@${key}`)
          params[key] = modelId
        })
        where.push(`models.model_id IN (${modelIdPlaceholders.join(', ')})`)
      } else {
        this.corePopulateQueryModelIdsTx(modelIdFilters)
        useTempModelIdsFilter = true
        where.push(`
          EXISTS (
            SELECT 1
            FROM catalog_query_model_ids cq_model_ids
            WHERE cq_model_ids.model_id = models.model_id
          )
        `)
      }
    }

    const tags = normalizeStringArray(input.tags)
    tags.forEach((tag, index) => {
      const key = `tagKey${index}`
      params[key] = tag
      where.push(`
        EXISTS (
          SELECT 1
          FROM model_tags mt${index}
          WHERE mt${index}.provider_key = models.provider_key
            AND mt${index}.model_id = models.model_id
            AND mt${index}.tag_key = @${key}
        )
      `)
    })

    const contextBuckets = normalizeStringArray(input.contextBuckets as readonly string[] | undefined)
      .filter((bucket): bucket is CatalogCoreQueryContextBucket => bucket in CONTEXT_BUCKET_SQL)
    if (contextBuckets.length > 0) {
      where.push(`(${contextBuckets.map((bucket) => CONTEXT_BUCKET_SQL[bucket]).join(' OR ')})`)
    }
    pushRangeWhereClause(where, params, 'COALESCE(models.context_length, 0)', input.contextLength, 'contextLength')

    pushRangeWhereClause(where, params, 'COALESCE(models.max_output_tokens, 0)', input.maxOutputTokens, 'maxOutputTokens')

    const priceBuckets = normalizeStringArray(input.priceBuckets as readonly string[] | undefined)
      .filter((bucket): bucket is CatalogCoreQueryPriceBucket => bucket in PRICE_BUCKET_TAG_KEY)
    if (priceBuckets.length > 0) {
      const placeholders: string[] = []
      priceBuckets.forEach((bucket, index) => {
        const key = `priceBucketTag${index}`
        placeholders.push(`@${key}`)
        params[key] = PRICE_BUCKET_TAG_KEY[bucket]
      })
      where.push(`
        EXISTS (
          SELECT 1
          FROM model_tags mt_price
          WHERE mt_price.provider_key = models.provider_key
            AND mt_price.model_id = models.model_id
            AND mt_price.tag_key IN (${placeholders.join(', ')})
        )
      `)
    }

    if (typeof input.hasPerRequestLimits === 'boolean') {
      where.push('models.has_per_request_limits = @hasPerRequestLimits')
      params.hasPerRequestLimits = input.hasPerRequestLimits ? 1 : 0
    }

    if (typeof input.hasDefaultParameters === 'boolean') {
      where.push('models.has_default_parameters = @hasDefaultParameters')
      params.hasDefaultParameters = input.hasDefaultParameters ? 1 : 0
    }

    const expiringWithinDays =
      typeof input.expiringWithinDays === 'number' && Number.isFinite(input.expiringWithinDays)
        ? Math.max(0, Math.floor(input.expiringWithinDays))
        : null
    if (expiringWithinDays !== null) {
      params.expiringWithinSec = Number(params.nowSec) + expiringWithinDays * 86400
      where.push('models.expiration_at_sec IS NOT NULL')
      where.push('models.expiration_at_sec <= @expiringWithinSec')
    }

    if (typeof input.topProviderIsModerated === 'boolean') {
      where.push(`models.top_provider_is_moderated = @topProviderIsModerated`)
      params.topProviderIsModerated = input.topProviderIsModerated ? 1 : 0
    }

    const architectureModalityFilters = normalizeLowercaseArray(input.architectureModalities)
    if (architectureModalityFilters.length > 0) {
      const clauses: string[] = []
      architectureModalityFilters.forEach((modality, index) => {
        const parsedFilter = parseArchitectureModalityFilter(modality)
        if (!parsedFilter) {
          const key = `architectureModalityExact${index}`
          params[key] = modality
          clauses.push(`LOWER(COALESCE(models.architecture_modality, '')) = @${key}`)
          return
        }

        const requiredClauses: string[] = []
        parsedFilter.inputModalities.forEach((inputModality, inputIndex) => {
          const key = `architectureInputModality${index}_${inputIndex}`
          params[key] = inputModality
          requiredClauses.push(`
            EXISTS (
              SELECT 1
              FROM json_each(models.input_modalities_json) am_in_${index}_${inputIndex}
              WHERE LOWER(TRIM(CAST(am_in_${index}_${inputIndex}.value AS TEXT))) = @${key}
            )
          `)
        })
        parsedFilter.outputModalities.forEach((outputModality, outputIndex) => {
          const key = `architectureOutputModality${index}_${outputIndex}`
          params[key] = outputModality
          requiredClauses.push(`
            EXISTS (
              SELECT 1
              FROM json_each(models.output_modalities_json) am_out_${index}_${outputIndex}
              WHERE LOWER(TRIM(CAST(am_out_${index}_${outputIndex}.value AS TEXT))) = @${key}
            )
          `)
        })
        if (requiredClauses.length > 0) {
          clauses.push(`(${requiredClauses.join(' AND ')})`)
        }
      })
      if (clauses.length > 0) {
        where.push(`(${clauses.join(' OR ')})`)
      }
    }

    const tokenizerFilters = normalizeLowercaseArray(input.tokenizers)
    if (tokenizerFilters.length > 0) {
      const placeholders: string[] = []
      tokenizerFilters.forEach((tokenizer, index) => {
        const key = `tokenizerFilter${index}`
        placeholders.push(`@${key}`)
        params[key] = tokenizer
      })
      where.push(`
        COALESCE(models.tokenizer, '')
        IN (${placeholders.join(', ')})
      `)
    }

    const instructTypeFilters = normalizeLowercaseArray(input.instructTypes)
    if (instructTypeFilters.length > 0) {
      const placeholders: string[] = []
      instructTypeFilters.forEach((instructType, index) => {
        const key = `instructTypeFilter${index}`
        placeholders.push(`@${key}`)
        params[key] = instructType
      })
      where.push(`
        COALESCE(models.instruct_type, '')
        IN (${placeholders.join(', ')})
      `)
    }

    const anyModalityFilters = normalizeLowercaseArray(input.modalities)
    anyModalityFilters.forEach((modality, index) => {
      const key = `anyModality${index}`
      params[key] = modality
      where.push(`
        (
          EXISTS (
            SELECT 1
            FROM json_each(models.input_modalities_json) im_any_${index}
            WHERE LOWER(TRIM(CAST(im_any_${index}.value AS TEXT))) = @${key}
          )
          OR EXISTS (
            SELECT 1
            FROM json_each(models.output_modalities_json) om_any_${index}
            WHERE LOWER(TRIM(CAST(om_any_${index}.value AS TEXT))) = @${key}
          )
        )
      `)
    })

    const inputModalityFilters = normalizeLowercaseArray(input.inputModalities)
    inputModalityFilters.forEach((modality, index) => {
      const key = `inputModality${index}`
      params[key] = modality
      where.push(`
        EXISTS (
          SELECT 1
          FROM json_each(models.input_modalities_json) im_only_${index}
          WHERE LOWER(TRIM(CAST(im_only_${index}.value AS TEXT))) = @${key}
        )
      `)
    })

    const outputModalityFilters = normalizeLowercaseArray(input.outputModalities)
    outputModalityFilters.forEach((modality, index) => {
      const key = `outputModality${index}`
      params[key] = modality
      where.push(`
        EXISTS (
          SELECT 1
          FROM json_each(models.output_modalities_json) om_only_${index}
          WHERE LOWER(TRIM(CAST(om_only_${index}.value AS TEXT))) = @${key}
        )
      `)
    })

    const supportedParameters = normalizeLowercaseArray(input.supportedParameters)
    supportedParameters.forEach((parameter, index) => {
      const key = `supportedParameter${index}`
      params[key] = parameter
      where.push(`
        EXISTS (
          SELECT 1
          FROM json_each(models.supported_parameters_json) sp_${index}
          WHERE LOWER(TRIM(CAST(sp_${index}.value AS TEXT))) = @${key}
        )
      `)
    })

    if (cursor) {
      if (cursor.sortBy !== sortBy || cursor.sortOrder !== sortOrder) {
        throw new Error('Catalog query cursor mismatch with current sort')
      }
      const cursorModelKey = String((cursor as any).modelKey ?? '').trim()
      const cursorProviderKey = String((cursor as any).providerKey ?? '').trim()
      const cursorModelId = String((cursor as any).modelId ?? '').trim()
      const resolvedCursorModelKey =
        cursorModelKey.length > 0
          ? cursorModelKey
          : cursorProviderKey.length > 0 && cursorModelId.length > 0
            ? `${cursorProviderKey}::${cursorModelId}`
            : ''
      if (!resolvedCursorModelKey) {
        throw new Error('Catalog query cursor requires modelKey')
      }
      params.cursorModelKey = resolvedCursorModelKey
      const op = sortOrder === 'desc' ? '<' : '>'

      if (sortBy === 'name') {
        params.cursorName = String(cursor.name ?? '')
        where.push(`
          (
            models.display_name COLLATE NOCASE ${op} @cursorName COLLATE NOCASE
            OR (
              models.display_name COLLATE NOCASE = @cursorName COLLATE NOCASE
              AND models.model_key ${op} @cursorModelKey
            )
          )
        `)
      } else if (sortBy === 'created_at') {
        params.cursorCreatedAtSec = Number(cursor.createdAtSec ?? 0)
        where.push(`
          (
            COALESCE(models.created_at_sec, 0) ${op} @cursorCreatedAtSec
            OR (
              COALESCE(models.created_at_sec, 0) = @cursorCreatedAtSec
              AND models.model_key ${op} @cursorModelKey
            )
          )
        `)
      } else if (sortBy === 'context_length') {
        params.cursorContextLength = Number(cursor.contextLength ?? 0)
        where.push(`
          (
            COALESCE(models.context_length, 0) ${op} @cursorContextLength
            OR (
              COALESCE(models.context_length, 0) = @cursorContextLength
              AND models.model_key ${op} @cursorModelKey
            )
          )
        `)
      } else {
        params.cursorMaxOutputTokens = Number(cursor.maxOutputTokens ?? 0)
        where.push(`
          (
            COALESCE(models.max_output_tokens, 0) ${op} @cursorMaxOutputTokens
            OR (
              COALESCE(models.max_output_tokens, 0) = @cursorMaxOutputTokens
              AND models.model_key ${op} @cursorModelKey
            )
          )
        `)
      }
    }

    const baseOrderBy =
      sortBy === 'created_at'
        ? `COALESCE(models.created_at_sec, 0) ${orderSql}, models.model_key ${orderSql}`
        : sortBy === 'context_length'
          ? `COALESCE(models.context_length, 0) ${orderSql}, models.model_key ${orderSql}`
          : sortBy === 'max_output_tokens'
            ? `COALESCE(models.max_output_tokens, 0) ${orderSql}, models.model_key ${orderSql}`
            : `models.display_name COLLATE NOCASE ${orderSql}, models.model_key ${orderSql}`
    const orderBy = searchRankSql
      ? `${searchRankSql} ASC, ${baseOrderBy}`
      : baseOrderBy

    params.limitPlusOne = limit + 1

    const sql = `
      SELECT
        models.provider_key AS providerKey,
        models.model_id AS modelId,
        models.model_key AS modelKey,
        models.canonical_slug AS canonicalSlug,
        models.display_name AS displayName,
        models.description AS description,
        models.vendor AS vendor,
        models.status AS status,
        models.visibility AS visibility,
        models.context_length AS contextLength,
        models.max_output_tokens AS maxOutputTokens,
        models.created_at_sec AS createdAtSec,
        models.price_prompt AS pricePrompt,
        models.price_completion AS priceCompletion,
        models.price_request AS priceRequest,
        models.price_image AS priceImage,
        models.cap_reasoning AS capReasoning,
        models.cap_tools AS capTools,
        models.cap_structured_outputs AS capStructuredOutputs,
        models.cap_vision AS capVision,
        models.cap_long_context AS capLongContext
      FROM models
      WHERE ${where.join('\n        AND ')}
      ORDER BY ${orderBy}
      LIMIT @limitPlusOne
    `

    let rows: CatalogCoreQueryRow[] = []
    try {
      rows = this.db.prepare(sql).all(params) as CatalogCoreQueryRow[]
    } finally {
      if (useTempModelIdsFilter) {
        this.coreClearQueryModelIdsTempTableStmt.run()
      }
    }
    const items = rows.slice(0, limit)
    const nextCursor =
      rows.length > limit && items.length > 0
        ? toCursor(items[items.length - 1], sortBy, sortOrder)
        : null
    return {
      items,
      nextCursor,
    }
  }
}
