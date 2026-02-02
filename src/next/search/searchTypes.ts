export type SearchEntityType = 'project' | 'convo' | 'message'

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
