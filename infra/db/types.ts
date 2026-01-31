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
}

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
}

export type DbMethod =
  | 'db.reset'
  | 'health.ping'
  | 'project.create'
  | 'project.save'
  | 'project.list'
  | 'project.delete'
  | 'project.findById'
  | 'project.findByName'
  | 'project.countConversations'
  | 'project.countConversationsBatch'
  | 'project.getInbox'
  | 'convo.create'
  | 'convo.save'
  | 'convo.saveWithMessages'
  | 'convo.list'
  | 'convo.delete'
  | 'convo.deleteMany'
  | 'convo.archive'
  | 'convo.archiveMany'
  | 'convo.restore'
  | 'convo.setProject'
  | 'convo.setProjectMany'
  | 'convo.listArchived'
  | 'message.append'
  | 'message.appendDelta'
  | 'message.list'
  | 'message.replace'
  | 'message.setStatus'
  | 'message.appendReasoningDetailSegments'
  | 'message.finalizeReasoningDetails'
  | 'message.setReasoningRequestConfig'
  | 'message.getReasoningSegmentsStats'
  | 'branch.ensureDefault'
  | 'branch.list'
  | 'branch.createFromMessage'
  | 'branch.delete'
  | 'branch.beginTurn'
  | 'branch.switchCandidate'
  | 'branch.regenerateFromQuestion'
  | 'branch.getPathMessages'
  | 'branch.getCandidates'
  | 'branch.getQuestionCandidates'
  | 'branch.getEffectiveFilters'
  | 'branch.setHead'
  | 'branchChoice.set'
  | 'branchAnswerHide.set'
  | 'branch.retryReplaceAnswer'
  | 'branch.switchQuestionCandidate'
  | 'branch.forkQuestion'
  | 'branch.retryReplaceQuestion'
  | 'branchFilter.set'
  | 'branchFilter.clear'
  | 'context.buildForBranch'
  | 'context.getRenderableTurns'
  | 'search.fulltext'
  | 'search.query'
  | 'search.rebuildIndex'
  | 'maintenance.optimize'
  | 'health.stats'
  | 'usage.log'
  | 'usage.getProjectStats'
  | 'usage.getConvoStats'
  | 'usage.getModelStats'
  | 'usage.getDateRangeStats'
  | 'usage.aggregate'
  | 'usage.drillDown'
  | 'usage.reasoningTrend'
  | 'usage.reasoningModelComparison'
  | 'prefs.save'
  | 'prefs.list'
  | 'prefs.delete'
  | 'prefs.default'
  | 'modelCatalog.syncSnapshot'
  | 'modelCatalog.list'
  | 'reasoningIndex.syncFromCatalog'
  | 'reasoningIndex.list'
  | 'settings.getOpenRouterProviderRequireParameters'
  | 'settings.setOpenRouterProviderRequireParameters'
  | 'settings.getReasoningPrefs'
  | 'settings.setReasoningPrefs'

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

export type ModelCatalogListParams = Readonly<{
  routerSource: string
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
