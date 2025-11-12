export type JsonRecord = Record<string, unknown>

// ========== Project Types ==========

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
  | 'convo.list'
  | 'convo.delete'
  | 'convo.deleteMany'
  | 'convo.archive'
  | 'convo.archiveMany'
  | 'convo.restore'
  | 'convo.listArchived'
  | 'message.append'
  | 'message.list'
  | 'message.replace'
  | 'search.fulltext'
  | 'maintenance.optimize'

export type HealthPingResult = {
  ok: boolean
  now: number
}
