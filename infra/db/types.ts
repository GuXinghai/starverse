import type { DbMethod } from './dbMethodsRegistry'

export type JsonObject = Record<string, unknown>

// ========== Project Types ==========

export type ProjectRecord = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  meta: JsonObject | null
}

export type CreateProjectInput = {
  id?: string
  name: string
  meta?: JsonObject | null
  createdAt?: number
}

export type SaveProjectInput = {
  id: string
  name: string
  createdAt?: number
  updatedAt?: number
  meta?: JsonObject | null
}

export type DeleteProjectInput = {
  id: string
}

export type ListProjectParams = {
  limit?: number
  offset?: number
  order?: 'updatedAt' | 'createdAt' | 'name'
}

// ========== Conversation Types ==========

export type ConvoRecord = {
  id: string
  projectId: string | null
  title: string
  createdAt: number
  updatedAt: number
  meta: JsonObject | null
}

export type MessageRecord = {
  id: string
  convoId: string
  role: string
  seq: number
  createdAt: number
  body: string
  meta: JsonObject | null
}

export type MessageErrorRecord = {
  messageId: string
  envelopeJson: string
  envelopeBytes: number
  isTruncated: boolean
  createdAt: number
  updatedAt: number
}

export type AppendReasoningDetailSegmentsInput = Readonly<{
  messageId: string
  details: unknown[]
}>

export type FinalizeReasoningDetailsInput = Readonly<{
  messageId: string
}>

export type SetReasoningRequestConfigInput = Readonly<{
  messageId: string
  value?: unknown
}>

export type GetReasoningSegmentsStatsInput = Readonly<{
  messageId: string
}>

export type CreateConvoInput = {
  id?: string
  projectId?: string | null
  title: string
  meta?: JsonObject | null
}

export type SaveConvoInput = {
  id: string
  projectId?: string | null
  title: string
  createdAt?: number
  updatedAt?: number
  meta?: JsonObject | null
}

export type DeleteConvoInput = {
  id: string
}

export type SaveConvoWithMessagesInput = {
  convo: SaveConvoInput
  messages: MessageSnapshot[]
}

export type ListConvoParams = {
  projectId?: string | null
  limit?: number
  offset?: number
  order?: 'updatedAt' | 'createdAt'
}

export type ArchiveConvoInput = {
  id: string
}

export type RestoreConvoInput = {
  id: string
}

export type SetConvoProjectInput = {
  id: string
  projectId: string | null
}

export type SetConvoProjectManyInput = {
  ids: string[]
  projectId: string | null
}

export type SetConvoProjectManyResult = {
  moved: number
  failed: string[]
}

export type ListArchivedParams = {
  limit?: number
  offset?: number
}

export type ArchivedConvoRecord = {
  id: string
  snapshotAt: number
}

// ========== Message Types ==========

export type AppendMessageInput = {
  convoId: string
  role: 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter'
  body: string
  meta?: JsonObject | null
  createdAt?: number
  seq?: number
  parentId?: string | null
  status?: 'streaming' | 'final' | 'error'
  answerRootId?: string | null
  questionId?: string | null
}

export type AppendMessageDeltaInput = {
  convoId: string
  seq: number
  appendBody: string
}

export type SetMessageStatusInput = {
  messageId: string
  status: 'streaming' | 'final' | 'error'
  reasoningDurationMs?: number | null
  reasoningEndReason?: string | null
  reasoningDurationIsFallback?: boolean
  metaPatch?: JsonObject | null
}

export type SetMessageAnnotationsInput = Readonly<{
  messageId: string
  annotations?: unknown[] | null
}>

export type UpsertMessageErrorInput = {
  messageId: string
  envelopeJson: string
  envelopeBytes: number
  isTruncated: boolean
  createdAt?: number
  updatedAt?: number
  metaPatch?: JsonObject | null
}

export type ListMessageErrorByIdsInput = {
  messageIds: string[]
}

export type PersistMessageAssetsFromDataUrlsInput = Readonly<{
  messageId: string
  imageDataUrls: string[]
}>

export type ListMessageAssetsByMessageIdsInput = Readonly<{
  messageIds: string[]
}>

export type GetMessageAssetByIdInput = Readonly<{
  assetId: string
}>

export type MessageAssetRecord = Readonly<{
  messageId: string
  assetId: string
  ordinal: number
  hash: string
  mime: string
  width: number | null
  height: number | null
  bytes: number
  path: string
  fileUrl: string
  assetUrl: string
}>

// ========== Branching Types (Phase 4+) ==========

export type BranchRecord = {
  id: string
  convoId: string
  headMessageId: string | null
  name: string | null
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

export type EnsureDefaultBranchInput = {
  convoId: string
  name?: string | null
}

export type ListBranchParams = {
  convoId: string
  includeDeleted?: boolean
}

export type CreateBranchFromMessageInput = {
  sourceBranchId: string
  baseMessageId: string
  name?: string | null
  copyChoices?: boolean
  copyFilters?: boolean
  requireOnSourcePath?: boolean
}

export type DeleteBranchInput = {
  branchId: string
}

export type SwitchCandidateInput = {
  branchId: string
  questionId: string
  answerRootId: string
}

export type RegenerateFromQuestionInput = {
  branchId: string
  questionId: string
}

export type RegenerateFromQuestionResult = {
  ok: true
  newAnswerRootId: string
  newAssistantSeq: number
}

export type GetBranchPathParams = {
  branchId: string
  limit?: number
}

export type GetCandidatesParams = {
  branchId: string
  questionId: string
  limit?: number
}

export type BranchCandidate = {
  answerRootId: string
  createdAt: number
  status: string
}

export type GetQuestionCandidatesParams = {
  branchId: string
  baseMessageId: string | null
  limit?: number
}

export type QuestionCandidate = {
  questionId: string
  createdAt: number
  status: string
}

export type BranchFilterMode = 'include' | 'exclude'

export type EffectiveFilterParams = {
  branchId: string
  questionId: string
  chosenAnswerRootId: string
}

export type EffectiveFilterResult = {
  questionMode: BranchFilterMode
  answerMode: BranchFilterMode
  effectiveMode: BranchFilterMode
  lockedByQuestionExclude: boolean
}

export type BeginTurnInput = {
  branchId: string
  userBody: string
  userMeta?: JsonObject | null
}

export type BeginTurnResult = {
  ok: true
  convoId: string
  branchId: string
  questionId: string
  questionSeq: number
  assistantId: string
  assistantSeq: number
}

export type SetBranchHeadInput = {
  branchId: string
  headMessageId: string | null
}

export type SetBranchChoiceInput = {
  branchId: string
  questionId: string
  chosenAnswerRootId: string
}

export type SetBranchAnswerHideInput = {
  branchId: string
  questionId: string
  answerRootId: string
  hidden: boolean
}

export type RetryReplaceAnswerInput = {
  branchId: string
  questionId: string
  currentAnswerRootId: string
}

export type SwitchQuestionCandidateInput = {
  branchId: string
  baseMessageId: string | null
  questionId: string
}

export type SwitchQuestionCandidateResult = Readonly<{ ok: true; headMessageId: string }>

export type ForkQuestionInput = {
  branchId: string
  oldQuestionId: string
  newBody: string
}

export type ForkQuestionResult = Readonly<{
  ok: true
  branchId: string
  baseMessageId: string | null
  newQuestionId: string
  newQuestionSeq: number
  assistantId: string
  assistantSeq: number
}>

export type RetryReplaceQuestionInput = {
  branchId: string
  oldQuestionId: string
  newBody: string
}

export type RetryReplaceQuestionResult = ForkQuestionResult

export type SetBranchFilterInput = {
  branchId: string
  targetType: 'question' | 'answer'
  targetId: string
  mode: 'include' | 'exclude'
}

export type ClearBranchFilterInput = {
  branchId: string
  targetType: 'question' | 'answer'
  targetId: string
}

export type BuildContextForBranchInput = {
  branchId: string
  limit?: number
  debug?: boolean
}

export type BuildContextForBranchResult = Readonly<{
  messages: ReadonlyArray<
    Readonly<{
      id: string
      convoId: string
      role: string
      seq: number
      createdAt: number
      parentId: string | null
      status: string
      answerRootId: string | null
      questionId: string | null
      body: string
      meta: JsonObject | null
    }>
  >
  debug?: Readonly<{
    branchId: string
    excludedQuestionIds: string[]
    includedMessageIds: string[]
    chosenAnswerRootByQuestionId: Record<string, string>
  }>
}>

export type GetRenderableTurnsInput = {
  branchId: string
  limit?: number
  debug?: boolean
}

export type RenderableTurn = Readonly<{
  questionId: string
  chosenAnswerRootId: string | null
  questionMode: BranchFilterMode
  answerMode: BranchFilterMode
  effectiveMode: BranchFilterMode
  lockedByQuestionExclude: boolean
}>

export type GetRenderableTurnsResult = Readonly<{
  messages: BuildContextForBranchResult['messages']
  turns: ReadonlyArray<RenderableTurn>
  debug?: BuildContextForBranchResult['debug']
}>

export type MessageSnapshot = {
  role: 'user' | 'assistant' | 'tool' | 'notice' | 'openrouter'
  body: string
  createdAt?: number
  seq?: number
  meta?: JsonObject | null
}

export type ReplaceMessagesInput = {
  convoId: string
  messages: MessageSnapshot[]
}

export type ListMessageParams = {
  convoId: string
  fromSeq?: number
  limit?: number
  direction?: 'asc' | 'desc'
}

export type FulltextQueryParams = {
  query: string
  projectId?: string | null
  tagIds?: string[]
  after?: number
  before?: number
  limit?: number
  offset?: number
  highlight?: boolean
}

export type FulltextResult = {
  messageId: string
  convoId: string
  seq: number
  snippet: string | null
}

// ========== Search (v0 Skeleton) ==========

export type SearchEntityType = 'project' | 'convo' | 'message'

export type SearchDocInput = {
  entityType: SearchEntityType
  entityId: string
  projectId?: string | null
  convoId?: string | null
  createdAtSec: number
  updatedAtSec: number
  title?: string | null
  body?: string | null
  mediaType?: string | null
  extraJson?: string | null
}

export type SearchScope = {
  projectName: boolean
  convoName: boolean
  convoContent: boolean
}

export type SearchQueryParams = {
  q: string
  scope: SearchScope
  projectId?: string | null
  convoId?: string | null
  timeFromSec?: number
  timeToSec?: number
  limit?: number
  offset?: number
  mode?: 'exact' | 'fuzzy'
}

export type SearchHit = {
  entityType: SearchEntityType
  entityId: string
  projectId?: string | null
  convoId?: string | null
  createdAtSec: number
  /**
   * 纯文本片段，使用 \u0001 和 \u0002 标记高亮区间。
   * 前端必须按“文本方式”渲染并自行做高亮拆分，禁止 v-html。
   */
  snippet: string
  score: number
}

// ========== Usage Statistics Types ==========

export type UsageLogPayload = {
  project_id?: string | null
  convo_id?: string | null
  provider: string
  model: string
  tokens_input: number
  tokens_output: number
  tokens_cached?: number
  tokens_reasoning?: number
  cost?: number
  request_id?: string | null
  attempt?: number
  duration_ms: number
  ttft_ms?: number | null
  timestamp: number
  status?: 'success' | 'error' | 'canceled'
  error_code?: string | null
  meta?: JsonObject | null
}

export type ProjectUsageStats = {
  total: {
    total_input: number
    total_output: number
    total_cached: number
    total_reasoning: number
    total_cost: number
    request_count: number
    total_duration: number
  }
}

export type ConvoUsageStats = {
  total: {
    total_input: number
    total_output: number
    total_cached: number
    total_reasoning: number
    total_cost: number
    request_count: number
    total_duration: number
  }
}

export type ModelUsageStats = {
  total: {
    total_input: number
    total_output: number
    total_cached: number
    total_reasoning: number
    total_cost: number
    request_count: number
    total_duration: number
  }
}

export type DateRangeStats = {
  total: {
    total_input: number
    total_output: number
    total_cached: number
    total_reasoning: number
    total_cost: number
    request_count: number
    total_duration: number
  }
}

export type UsageAggregateFilters = {
  projectId?: string | null
  convoId?: string | null
  provider?: string | null
  model?: string | null
  status?: 'success' | 'error' | 'canceled' | null
  errorCode?: string | null
  startTime?: number
  endTime?: number
  meta?: Partial<Record<'feature' | 'entry' | 'experiment_id' | 'user_id', string | null>>
}

export type UsageAggregateBucket = 'hour' | 'day' | 'week'
export type UsageGroupByDimension =
  | 'project_id'
  | 'convo_id'
  | 'provider'
  | 'model'
  | 'status'
  | 'error_code'
  | 'meta.feature'
  | 'meta.entry'
  | 'meta.experiment_id'
  | 'meta.user_id'

export type UsageAggregateParams = {
  filters?: UsageAggregateFilters
  bucket?: UsageAggregateBucket | null
  groupBy?: UsageGroupByDimension[]
  timezoneOffsetMinutes?: number
  limit?: number
  offset?: number
  order?: 'asc' | 'desc'
}

export type UsageAggregateRow = {
  bucket_start?: number | null
  project_id?: string | null
  convo_id?: string | null
  provider?: string | null
  model?: string | null
  status?: 'success' | 'error' | 'canceled' | null
  error_code?: string | null
  meta_feature?: string | null
  meta_entry?: string | null
  meta_experiment_id?: string | null
  meta_user_id?: string | null
  tokens_input: number
  tokens_output: number
  tokens_cached: number
  tokens_reasoning: number
  tokens_total: number
  effective_tokens: number
  cost: number
  request_count: number
  avg_cost_per_req: number
  cost_per_1k_tokens: number
  avg_latency: number
  p50_latency: number | null
  p90_latency: number | null
  success_rate: number
  error_rate: number
  canceled_count: number
  canceled_rate: number
  // 推理相关扩展字段（可选，用于推理专项分析）
  reasoning_request_count?: number
  reasoning_ratio?: number
  reasoning_usage_rate?: number
  cost_per_1k_reasoning?: number
}

export type UsageAggregateResult = {
  data: UsageAggregateRow[]
  pagination: {
    limit: number
    offset: number
  }
}

export type UsageDrillDownSort = 'timestamp' | 'cost' | 'duration_ms'

export type UsageDrillDownParams = {
  filters?: UsageAggregateFilters
  limit?: number
  sort?: UsageDrillDownSort
  order?: 'asc' | 'desc'
  cursor?: {
    value: number
    id: string
  }
}

export type UsageDrillDownRow = {
  id: string
  project_id: string | null
  convo_id: string | null
  provider: string
  model: string
  tokens_input: number
  tokens_output: number
  tokens_cached: number
  tokens_reasoning: number
  cost: number
  request_id?: string | null
  attempt?: number
  duration_ms: number
  ttft_ms: number | null
  timestamp: number
  status: 'success' | 'error'
  error_code: string | null
  meta: JsonObject | null
}

export type UsageDrillDownResult = {
  data: UsageDrillDownRow[]
  nextCursor?: {
    value: number
    id: string
  }
  pagination: {
    limit: number
  }
}

// ========== Dashboard Prefs ==========
export type DashboardLayoutWidget = {
  id: string
  visible: boolean
  order: number
}

export type DashboardFilters = {
  days?: number
  provider?: string | null
  model?: string | null
  status?: 'success' | 'error' | 'canceled' | null
  projectId?: string | null
}

export type DashboardPrefRecord = {
  id: string
  userId: string
  viewId: string
  name: string
  layout: DashboardLayoutWidget[]
  filters: DashboardFilters | null
  isDefault: boolean
  updatedAt: number
}

export type SaveDashboardPrefInput = {
  id?: string
  userId: string
  viewId: string
  name: string
  layout: DashboardLayoutWidget[]
  filters?: DashboardFilters | null
  isDefault?: boolean
}

export type DeleteDashboardPrefInput = {
  userId: string
  viewId: string
}

export type DashboardPrefListResult = {
  items: DashboardPrefRecord[]
}

// ========== Batch Operation Types ==========

export type BatchDeleteResult = {
  deleted: number
}

export type BatchArchiveResult = {
  archived: number
  failed: string[]
}

export type BatchDeleteInput = {
  ids: string[]
}

// ========== Response Types ==========

export type HealthStatsResult = {
  pending: number
  oldestPendingMs: number | null
  restartAttempts: number
  isOnline: boolean
  workerThreadId?: number
}

export type WorkerInitConfig = {
  dbPath: string
  schemaPath?: string
  logSlowQueryMs?: number
  logDirectory?: string
  stampSchemaVersion?: boolean
  startupRebuildReason?: string
}

export type { DbMethod } from './dbMethodsRegistry'

export type ModelCatalogUpsertInput = Readonly<{
  modelId: string
  routerSource: string
  vendor: string
  name: string
  description?: string | null
  contextLength?: number | null
  supportedParametersJson?: string | null
  rawJson?: string | null
}>

export type ModelCatalogSyncSnapshotParams = Readonly<{
  snapshotId: string
  routerSource: string
  models: ModelCatalogUpsertInput[]
}>

export type ModelCatalogCoreProviderUpsertInput = Readonly<{
  providerKey: string
  displayName: string
  slug?: string | null
  privacyPolicyUrl?: string | null
  termsOfServiceUrl?: string | null
  statusPageUrl?: string | null
  updatedAtMs: number
  rawJson?: string | null
}>

export type ModelCatalogCoreModelUpsertInput = Readonly<{
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

export type ModelCatalogCoreTagUpsertInput = Readonly<{
  providerKey: string
  modelId: string
  tagKey: string
  tagLabel: string
  tagType: 'capability' | 'category' | 'vendor' | 'status' | 'custom'
  confidence: number
  source: 'derived' | 'provider' | 'manual'
  updatedAtMs: number
}>

export type ModelCatalogCoreMetaUpsertInput = Readonly<{
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

export type ModelCatalogSyncCoreSnapshotParams = Readonly<{
  providerKey: string
  snapshotId: string
  providers: ModelCatalogCoreProviderUpsertInput[]
  models: ModelCatalogCoreModelUpsertInput[]
  tags: ModelCatalogCoreTagUpsertInput[]
  meta: ModelCatalogCoreMetaUpsertInput
}>

export type ModelCatalogEndpointMetaUpsertInput = Readonly<{
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
  status?: null
  rawJson?: string | null
}>

export type ModelCatalogReplaceEndpointMetaParams = Readonly<{
  providerKey: string
  baseUrl: string
  modelId: string
  fetchedAtMs: number
  endpoints: ModelCatalogEndpointMetaUpsertInput[]
}>

export type ModelCatalogListEndpointMetaParams = Readonly<{
  providerKey: string
  baseUrl: string
  modelId: string
}>

export type ModelCatalogListParams = Readonly<{
  routerSource: string
}>

export type ModelCatalogGetCoreMetaParams = Readonly<{
  providerKey: string
}>

export type ModelCatalogGetModelDetailParams = Readonly<{
  providerKey: string
  modelId: string
}>

export type ModelCatalogModelDetailRow = Readonly<{
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

export type ModelCatalogQueryCoreSortBy = 'name' | 'created_at' | 'context_length' | 'max_output_tokens'
export type ModelCatalogQueryCoreSortOrder = 'asc' | 'desc'
export type ModelCatalogQueryCoreContextBucket = 'small' | 'medium' | 'large' | 'xlarge' | 'unknown'
export type ModelCatalogQueryCorePriceBucket = 'cheap' | 'standard' | 'expensive' | 'unknown'
export type ModelCatalogQueryCoreModality = 'text' | 'image' | 'audio' | 'video' | 'file'
export type ModelCatalogQueryCoreNumberRange = Readonly<{
  min?: number
  max?: number
}>

export type ModelCatalogQueryCoreCursor = Readonly<{
  sortBy: ModelCatalogQueryCoreSortBy
  sortOrder: ModelCatalogQueryCoreSortOrder
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

export type ModelCatalogQueryCoreParams = Readonly<{
  /**
   * Source catalog provider dimension.
   * Examples: openrouter, openai-direct, anthropic-direct.
   */
  sourceProviderKey?: string
  /**
   * Source catalog provider dimension used by DB query execution.
   * Deprecated alias of sourceProviderKey. Worker normalizes both.
   */
  providerKey?: string
  searchText?: string
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
  contextBuckets?: ModelCatalogQueryCoreContextBucket[]
  contextLength?: ModelCatalogQueryCoreNumberRange
  maxOutputTokens?: ModelCatalogQueryCoreNumberRange
  expiringWithinDays?: number
  priceBuckets?: ModelCatalogQueryCorePriceBucket[]
  hasPerRequestLimits?: boolean
  hasDefaultParameters?: boolean
  topProviderIsModerated?: boolean
  architectureModalities?: string[]
  tokenizers?: string[]
  instructTypes?: string[]
  modalities?: ModelCatalogQueryCoreModality[]
  inputModalities?: ModelCatalogQueryCoreModality[]
  outputModalities?: ModelCatalogQueryCoreModality[]
  supportedParameters?: string[]
  sortBy?: ModelCatalogQueryCoreSortBy
  sortOrder?: ModelCatalogQueryCoreSortOrder
  limit?: number
  cursor?: ModelCatalogQueryCoreCursor | null
}>

export type ModelCatalogQueryCoreRow = Readonly<{
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

export type ModelCatalogQueryCoreResult = Readonly<{
  items: ModelCatalogQueryCoreRow[]
  nextCursor: ModelCatalogQueryCoreCursor | null
}>

export type ReasoningIndexSyncFromCatalogParams = Readonly<{
  routerSource: string
}>

export type SetOpenRouterProviderRequireParametersParams = Readonly<{
  value: boolean
}>

export type SetReasoningPrefsParams = Readonly<{
  value: unknown
}>

export type SetWebSearchDefaultsParams = Readonly<{
  value: unknown
}>

export type SetUserMessageRenderDefaultParams = Readonly<{
  value: boolean
}>

// ========== Model Preferences (Favorites/Recents) ==========

export type ModelPrefsScopeType = 'global' | 'project' | 'conversation'

export type ModelPrefsScopeParams = Readonly<{
  scopeType?: ModelPrefsScopeType
  scopeId?: string | null
}>

export type ModelPrefsModelRefParams = Readonly<{
  providerKey?: string
  modelId?: string
  modelKey?: string
}>

export type ModelPrefsFavoriteRecord = Readonly<{
  scopeType: ModelPrefsScopeType
  scopeId: string
  providerKey: string
  modelId: string
  modelKey: string
  sortRank: number
  createdAtMs: number
  updatedAtMs: number
}>

export type ModelPrefsRecentRecord = Readonly<{
  scopeType: ModelPrefsScopeType
  scopeId: string
  providerKey: string
  modelId: string
  modelKey: string
  lastUsedAtMs: number
  useCount: number
  createdAtMs: number
  updatedAtMs: number
}>

export type ModelPrefsListFavoritesParams = ModelPrefsScopeParams

export type ModelPrefsAddFavoriteParams = Readonly<
  ModelPrefsScopeParams &
    ModelPrefsModelRefParams & {
      sortRank?: number
    }
>

export type ModelPrefsRemoveFavoriteParams = Readonly<
  ModelPrefsScopeParams &
    ModelPrefsModelRefParams
>

export type ModelPrefsReorderFavoritesParams = Readonly<
  ModelPrefsScopeParams & {
    orderedModelKeys: string[]
  }
>

export type ModelPrefsListRecentsParams = Readonly<
  ModelPrefsScopeParams & {
    limit?: number
  }
>

export type ModelPrefsRecordRecentParams = Readonly<
  ModelPrefsScopeParams &
    ModelPrefsModelRefParams & {
      usedAtMs?: number
    }
>

export type ModelPrefsRemoveFavoriteResult = Readonly<{
  removed: number
}>

export type WorkerRequestMessage = {
  id: string
  method: DbMethod
  params?: unknown
}

export type WorkerResponseMessage = {
  id: string
  ok: boolean
  result?: unknown
  error?: DbErrorShape
}

export type DbErrorCode =
  | 'ERR_NOT_FOUND'
  | 'ERR_VALIDATION'
  | 'ERR_INVALID'
  | 'ERR_INTERNAL'
  | 'ERR_FORBIDDEN'
  | 'ERR_UNAVAILABLE'
  | 'ERR_MUTATION_FORBIDDEN_ON_BRANCHING_CONVO'
  | 'ERR_DELETE_FORBIDDEN'

export type DbErrorShape = {
  code: DbErrorCode
  message: string
  details?: unknown
}

export type DbHandler = (params: any) => any | Promise<any>

// ========== Database Events ==========
// Worker -> Renderer 结构化事件类型

export type DbEvent =
  | { type: 'project.created'; projectId: string; name: string }
  | { type: 'project.updated'; projectId: string; name?: string }
  | { type: 'project.deleted'; projectId: string }
  | { type: 'conversation.moved'; convoId: string; fromProjectId: string | null; toProjectId: string | null }
  | { type: 'conversation.activity_updated'; convoId: string; updatedAt: number }

export type WorkerEventMessage = {
  type: 'event'
  event: DbEvent
}

// ========== Model Data Types ==========
// 参考规范：/docs/openrouter-model-sync-spec.md

/**
 * 模型能力映射（持久化结构）
 */
export type ModelCapabilitiesRecord = {
  hasReasoning: boolean
  hasTools: boolean
  hasJsonMode: boolean
  isMultimodal: boolean
}

/**
 * 模型价格信息（持久化结构）
 */
export type ModelPricingRecord = {
  prompt: string
  completion: string
  request: string
  image: string
  web_search: string
  internal_reasoning: string
  input_cache_read: string
  input_cache_write: string
}

/**
 * 模型数据记录（数据库持久化）
 */
export type ModelDataRecord = {
  id: string
  routerSource: string              // 接入来源: openrouter, openai_api, anthropic_api, local
  vendor: string                    // 模型厂商: openai, anthropic, google, deepseek 等
  name: string
  description?: string
  contextLength: number             // -1 表示未知
  pricing?: ModelPricingRecord
  capabilities?: ModelCapabilitiesRecord
  isArchived: boolean               // 软删除标记
  firstSeenAt?: string              // ISO8601
  lastSeenAt?: string               // ISO8601
  createdAt: number
  updatedAt: number
  meta?: Record<string, unknown>
}

/**
 * 保存模型数据输入
 */
export type SaveModelDataInput = {
  id: string
  routerSource?: string             // 默认 'openrouter'
  vendor?: string                   // 默认从 id 前缀解析
  name?: string
  description?: string
  contextLength?: number            // 默认 -1
  pricing?: ModelPricingRecord
  capabilities?: ModelCapabilitiesRecord
  isArchived?: boolean              // 默认 false
  firstSeenAt?: string
  lastSeenAt?: string
  createdAt?: number
  meta?: Record<string, unknown>
}

/**
 * 模型列表查询参数
 */
export type ListModelParams = {
  routerSource?: string
  vendor?: string
  includeArchived?: boolean         // 默认 false
  limit?: number
  offset?: number
}
