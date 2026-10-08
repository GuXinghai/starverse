import type BetterSqlite3 from 'better-sqlite3'

export type GenerationV2SearchEntityType = 'project' | 'convo' | 'message'

export type GenerationV2SearchScope = Readonly<{
  projectName: boolean
  convoName: boolean
  userMessages: boolean
  assistantMessages: boolean
}>

export type GenerationV2SearchQueryInput = Readonly<{
  q: string
  /**
   * Explicit, non-overlapping scopes. Message scopes match message bodies only;
   * conversation titles are matched solely through `convoName`.
   */
  scope: GenerationV2SearchScope
  projectId?: string | null
  convoId?: string | null
  timeFromSec?: number
  timeToSec?: number
  limit?: number
  offset?: number
  mode?: 'exact' | 'fuzzy'
  /**
   * `chronological` is oldest-first by creation time and index insertion order;
   * `reverse-chronological` is its exact mirror (newest first).
   */
  order?: GenerationV2SearchOrder
}>

export type GenerationV2SearchOrder = 'relevance' | 'chronological' | 'reverse-chronological'

/** One ordered window of a result set. `hasMore` is true iff at least one hit exists after the window. */
export type GenerationV2SearchPage = Readonly<{
  hits: readonly GenerationV2SearchHit[]
  hasMore: boolean
}>

/** Largest window one query may return; callers needing more issue several offset queries. */
export const GENERATION_V2_SEARCH_MAX_WINDOW = 1_000

export type GenerationV2SearchHit = Readonly<{
  entityType: GenerationV2SearchEntityType
  entityId: string
  projectId: string | null
  convoId: string | null
  createdAtSec: number
  snippet: string
  score: number
}>

type Row = Readonly<Record<string, unknown>>

const HIGHLIGHT_START = '\u0001'
const HIGHLIGHT_END = '\u0002'
const EMPTY_PAGE: GenerationV2SearchPage = Object.freeze({ hits: Object.freeze([]), hasMore: false })
const MAX_SAFE_SECONDS = Math.floor(Number.MAX_SAFE_INTEGER / 1000)

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function buildFtsQuery(raw: string, mode: 'exact' | 'fuzzy'): string {
  const q = String(raw ?? '').trim()
  if (!q) return ''
  if (mode === 'exact') return `"${q.replace(/"/gu, '""')}"`
  const tokens = q.split(/\s+/u).filter(Boolean)
  return tokens.map((token) => `${token.replace(/"/gu, '""')}*`).join(' AND ')
}

function buildFallbackFtsQuery(raw: string): string {
  const tokens = String(raw ?? '').replace(/["'`~!@#$%^&*()\-+=\[\]{}\\|;:,.<>/?]/gu, ' ')
    .split(/\s+/u).filter(Boolean)
  return tokens.map((token) => `${token.replace(/"/gu, '""')}*`).join(' AND ')
}

function messageRoles(scope: GenerationV2SearchScope): string[] {
  const roles: string[] = []
  if (scope.userMessages) roles.push('user')
  if (scope.assistantMessages) roles.push('assistant')
  return roles
}

function asString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('GENERATION_V2_SEARCH_STATE_INVALID')
  return value
}

function asNullableString(value: unknown): string | null {
  return value === null ? null : asString(value)
}

function asScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('GENERATION_V2_SEARCH_STATE_INVALID')
  return value
}

function asCreatedAtSec(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('GENERATION_V2_SEARCH_STATE_INVALID')
  return Math.floor((value as number) / 1000)
}

export class GenerationV2SearchRepo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  rebuild(): void {
    const rebuild = this.db.transaction(() => {
      this.db.prepare('DELETE FROM generation_v2_search_fts').run()
      this.db.prepare(`INSERT INTO generation_v2_search_fts (
        entity_type, entity_id, project_id, conversation_id, created_at_ms, title, body
      ) SELECT 'project', project_id, project_id, NULL, created_at_ms, name, '' FROM project_v2`).run()
      this.db.prepare(`INSERT INTO generation_v2_search_fts (
        entity_type, entity_id, project_id, conversation_id, created_at_ms, title, body
      ) SELECT 'convo', conversation_id, project_id, conversation_id, created_at_ms, title, '' FROM conversation_v2`).run()
      this.db.prepare(`INSERT INTO generation_v2_search_fts (
        entity_type, entity_id, project_id, conversation_id, created_at_ms, title, body
      ) SELECT 'message', message.message_id, conversation.project_id, message.conversation_id,
          message.created_at_ms, conversation.title, body.body_text
        FROM message_v2 AS message
        JOIN message_body_v2 AS body ON body.message_id = message.message_id
        JOIN conversation_v2 AS conversation ON conversation.conversation_id = message.conversation_id
        WHERE message.role IN ('user', 'assistant') AND message.status = 'completed'`).run()
    })
    rebuild()
  }

  query(input: GenerationV2SearchQueryInput): GenerationV2SearchPage {
    const query = buildFtsQuery(input.q, input.mode ?? 'fuzzy')
    const roles = messageRoles(input.scope)
    if (!query || (!input.scope.projectName && !input.scope.convoName && roles.length === 0)) return EMPTY_PAGE
    const limit = clamp(input.limit ?? 50, 1, GENERATION_V2_SEARCH_MAX_WINDOW)
    const offset = Math.max(0, input.offset ?? 0)
    const bind: Record<string, unknown> = {
      projectId: input.projectId ?? null,
      convoId: input.convoId ?? null,
      timeFromMs: input.timeFromSec == null ? null : clamp(input.timeFromSec, 0, MAX_SAFE_SECONDS) * 1000,
      timeToMs: input.timeToSec == null ? null : clamp(input.timeToSec, 0, MAX_SAFE_SECONDS) * 1000,
      // One extra row answers "is there anything after this window" without a COUNT over the whole set.
      limit: limit + 1,
      offset,
    }
    // Each branch matches exactly one FTS column so a message row can never match through its
    // denormalised conversation title, and carries a literal entity type for the scope it serves.
    const branch = (entityType: GenerationV2SearchEntityType, column: 'title' | 'body', extraWhere = '') => {
      const snippetColumn = column === 'title' ? 5 : 6
      return `SELECT entity_type AS entityType, entity_id AS entityId, project_id AS projectId,
        conversation_id AS convoId, created_at_ms AS createdAtMs, rowid AS ord, bm25(generation_v2_search_fts) AS score,
        snippet(generation_v2_search_fts, ${snippetColumn}, '${HIGHLIGHT_START}', '${HIGHLIGHT_END}', '…', 12) AS snippet
        FROM generation_v2_search_fts
        WHERE generation_v2_search_fts MATCH @query_${column}
          AND entity_type = '${entityType}'${extraWhere}
          AND (@projectId IS NULL OR project_id = @projectId)
          AND (@convoId IS NULL OR conversation_id = @convoId)
          AND (@timeFromMs IS NULL OR created_at_ms >= @timeFromMs)
          AND (@timeToMs IS NULL OR created_at_ms < @timeToMs)`
    }
    const branches: string[] = []
    if (input.scope.projectName) branches.push(branch('project', 'title'))
    if (input.scope.convoName) branches.push(branch('convo', 'title'))
    if (roles.length > 0) {
      const roleBinds = roles.map((role, index) => {
        bind[`role${index}`] = role
        return `@role${index}`
      }).join(', ')
      branches.push(branch('message', 'body', ` AND EXISTS (SELECT 1 FROM message_v2 AS m
        WHERE m.message_id = generation_v2_search_fts.entity_id AND m.role IN (${roleBinds}))`))
    }
    const orderBy = input.order === 'chronological'
      ? 'createdAtMs ASC, ord ASC'
      : input.order === 'reverse-chronological'
        ? 'createdAtMs DESC, ord DESC'
        : 'score ASC, createdAtMs DESC, entityId ASC, ord ASC'
    const select = `SELECT * FROM (${branches.join(' UNION ALL ')}) ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`
    const run = (ftsQuery: string) => {
      bind.query_title = `title : (${ftsQuery})`
      bind.query_body = `body : (${ftsQuery})`
      // better-sqlite3 rejects unused named parameters, so bind only what the branches reference.
      const used: Record<string, unknown> = { ...bind }
      if (!branches.some((entry) => entry.includes('@query_title'))) delete used.query_title
      if (!branches.some((entry) => entry.includes('@query_body'))) delete used.query_body
      const rows = this.db.prepare(select).all(used) as Row[]
      return Object.freeze({ hits: this.readHits(rows.slice(0, limit)), hasMore: rows.length > limit })
    }
    try {
      return run(query)
    } catch {
      const fallback = buildFallbackFtsQuery(input.q)
      if (!fallback) return EMPTY_PAGE
      try {
        return run(fallback)
      } catch {
        return EMPTY_PAGE
      }
    }
  }

  private readHits(rows: readonly Row[]): readonly GenerationV2SearchHit[] {
    return Object.freeze(rows.map((row) => Object.freeze({
      entityType: asString(row.entityType) as GenerationV2SearchEntityType,
      entityId: asString(row.entityId),
      projectId: asNullableString(row.projectId),
      convoId: asNullableString(row.convoId),
      createdAtSec: asCreatedAtSec(row.createdAtMs),
      snippet: asString(row.snippet),
      score: asScore(row.score),
    })))
  }
}
