export type JsonRecord = Record<string, unknown>

// ========== Project Types ==========
export type JsonObject = JsonRecord

export type ProjectRecord = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  meta: JsonRecord | null
}

export type CreateProjectPayload = {
  id?: string
  name: string
  meta?: JsonRecord | null
  createdAt?: number
}

export type SaveProjectPayload = {
  id: string
  name: string
  createdAt?: number
  updatedAt?: number
  meta?: JsonRecord | null
}

export type DeleteProjectPayload = {
  id: string
}

export type ProjectListParams = {
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
  meta: JsonRecord | null
}

export type MessageRecord = {
  id: string
  convoId: string
  role: string
  seq: number
  createdAt: number
  body: string
  meta: JsonRecord | null
}

export type CreateConvoPayload = {
  id?: string
  projectId?: string | null
  title: string
  meta?: JsonRecord | null
}

export type SaveConvoPayload = {
  id: string
  projectId?: string | null
  title: string
  createdAt?: number
  updatedAt?: number
  meta?: JsonRecord | null
}

export type DeleteConvoPayload = {
  id: string
}

export type SaveConvoWithMessagesPayload = {
  convo: SaveConvoPayload
  messages: MessageSnapshotPayload[]
}

export type ConvoListParams = {
  projectId?: string | null
  limit?: number
  offset?: number
  order?: 'updatedAt' | 'createdAt'
}

export type ArchivedConvoRecord = {
  id: string
  snapshotAt: number
}

export type ListArchivedParams = {
  limit?: number
  offset?: number
}

// ========== Message Types ==========

export type AppendMessagePayload = {
  convoId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  body: string
  meta?: JsonRecord | null
  createdAt?: number
  seq?: number
}

export type MessageSnapshotPayload = {
  role: 'user' | 'assistant' | 'system' | 'tool'
  body: string
  createdAt?: number
  seq?: number
  meta?: JsonRecord | null
}

export type ReplaceMessagesPayload = {
  convoId: string
  messages: MessageSnapshotPayload[]
}

export type AppendMessageDeltaPayload = {
  convoId: string
  seq: number
  appendBody: string
}

export type MessageListParams = {
  convoId: string
  fromSeq?: number
  limit?: number
  direction?: 'asc' | 'desc'
}

export type FulltextSearchParams = {
  query: string
  projectId?: string | null
  tagIds?: string[]
  after?: number
  before?: number
  limit?: number
  offset?: number
  highlight?: boolean
}

export type FulltextSearchResult = {
  messageId: string
  convoId: string
  seq: number
  snippet: string | null
  rank: number
  createdAt: number
}

export type HealthStatsResult = {
  pending: number
  oldestPendingMs: number | null
  restartAttempts: number
  isOnline: boolean
  workerThreadId?: number
}

export type DbMethod =
  | 'health.ping'
  | 'project.create'
  | 'project.save'
  | 'project.list'
  | 'project.delete'
  | 'project.findById'
  | 'project.findByName'
  | 'project.countConversations'
  | 'convo.create'
  | 'convo.save'
  | 'convo.saveWithMessages'
  | 'convo.list'
  | 'convo.delete'
  | 'convo.deleteMany'
  | 'convo.archive'
  | 'convo.archiveMany'
  | 'convo.restore'
  | 'convo.listArchived'
  | 'message.append'
  | 'message.appendDelta'
  | 'message.list'
  | 'message.replace'
  | 'search.fulltext'
  | 'maintenance.optimize'
  | 'health.stats'
  | 'usage.log'
  | 'usage.getProjectStats'
  | 'usage.getConvoStats'
  | 'usage.getModelStats'
  | 'usage.getDateRangeStats'
  | 'usage.aggregate'
  | 'usage.drillDown'
  | 'prefs.save'
  | 'prefs.list'
  | 'prefs.delete'
  | 'prefs.default'

export type HealthPingResult = {
  ok: boolean
  now: number
}

// ========== Usage Types ==========

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
  status: 'success' | 'error' | 'canceled'
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

export type GetProjectUsageStatsParams = {
  projectId: string
  days?: number
}

export type GetConvoUsageStatsParams = {
  convoId: string
  days?: number
}

export type GetModelUsageStatsParams = {
  model: string
  days?: number
}

export type GetDateRangeUsageStatsParams = {
  startTime: number
  endTime: number
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

export type SaveDashboardPrefPayload = {
  id?: string
  userId: string
  viewId: string
  name: string
  layout: DashboardLayoutWidget[]
  filters?: DashboardFilters | null
  isDefault?: boolean
}

export type DeleteDashboardPrefPayload = {
  userId: string
  viewId: string
}

export type DashboardPrefListResult = {
  items: DashboardPrefRecord[]
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
  status: 'success' | 'error' | 'canceled'
  error_code: string | null
  meta: JsonRecord | null
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
