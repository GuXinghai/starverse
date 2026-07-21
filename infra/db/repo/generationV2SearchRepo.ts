import type BetterSqlite3 from 'better-sqlite3'

export type GenerationV2SearchEntityType = 'project' | 'convo' | 'message'

export type GenerationV2SearchQueryInput = Readonly<{
  q: string
  scope: Readonly<{ projectName: boolean; convoName: boolean; convoContent: boolean }>
  projectId?: string | null
  convoId?: string | null
  timeFromSec?: number
  timeToSec?: number
  limit?: number
  offset?: number
  mode?: 'exact' | 'fuzzy'
}>

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

function typesFor(scope: GenerationV2SearchQueryInput['scope']): GenerationV2SearchEntityType[] {
  const types: GenerationV2SearchEntityType[] = []
  if (scope.projectName) types.push('project')
  if (scope.convoName) types.push('convo')
  if (scope.convoContent) types.push('message')
  return types
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

  query(input: GenerationV2SearchQueryInput): readonly GenerationV2SearchHit[] {
    const types = typesFor(input.scope)
    const query = buildFtsQuery(input.q, input.mode ?? 'fuzzy')
    if (types.length === 0 || !query) return Object.freeze([])
    const limit = clamp(input.limit ?? 50, 1, 200)
    const offset = Math.max(0, input.offset ?? 0)
    const bind: Record<string, unknown> = {
      query,
      projectId: input.projectId ?? null,
      convoId: input.convoId ?? null,
      timeFromMs: input.timeFromSec == null ? null : clamp(input.timeFromSec, 0, MAX_SAFE_SECONDS) * 1000,
      timeToMs: input.timeToSec == null ? null : clamp(input.timeToSec, 0, MAX_SAFE_SECONDS) * 1000,
      limit,
      offset,
    }
    const placeholders = types.map((type, index) => {
      bind[`type${index}`] = type
      return `@type${index}`
    }).join(', ')
    const select = `SELECT entity_type AS entityType, entity_id AS entityId, project_id AS projectId,
      conversation_id AS convoId, created_at_ms AS createdAtMs, bm25(generation_v2_search_fts) AS score,
      CASE WHEN length(body) > 0 THEN snippet(generation_v2_search_fts, 6, '${HIGHLIGHT_START}', '${HIGHLIGHT_END}', '…', 12)
        ELSE snippet(generation_v2_search_fts, 5, '${HIGHLIGHT_START}', '${HIGHLIGHT_END}', '…', 12) END AS snippet
      FROM generation_v2_search_fts
      WHERE generation_v2_search_fts MATCH @query
        AND entity_type IN (${placeholders})
        AND (@projectId IS NULL OR project_id = @projectId)
        AND (@convoId IS NULL OR conversation_id = @convoId)
        AND (@timeFromMs IS NULL OR created_at_ms >= @timeFromMs)
        AND (@timeToMs IS NULL OR created_at_ms < @timeToMs)
      ORDER BY score ASC, created_at_ms DESC, entity_id ASC LIMIT @limit OFFSET @offset`
    try {
      return this.readHits(this.db.prepare(select).all(bind) as Row[])
    } catch {
      const fallback = buildFallbackFtsQuery(input.q)
      if (!fallback) return Object.freeze([])
      bind.query = fallback
      try {
        return this.readHits(this.db.prepare(select).all(bind) as Row[])
      } catch {
        return Object.freeze([])
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
