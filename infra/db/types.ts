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
  role: string
  body: string
  meta?: JsonObject | null
  createdAt?: number
  seq?: number
}

export type AppendMessageDeltaInput = {
  convoId: string
  seq: number
  appendBody: string
}

export type MessageSnapshot = {
  role: string
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
  | 'ERR_INTERNAL'
  | 'ERR_UNAVAILABLE'

export type DbErrorShape = {
  code: DbErrorCode
  message: string
  details?: unknown
}

export type DbHandler = (params: any) => any | Promise<any>
