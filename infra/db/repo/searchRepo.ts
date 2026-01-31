import BetterSqlite3 from 'better-sqlite3'
import type {
  FulltextQueryParams,
  FulltextResult,
  SearchDocInput,
  SearchEntityType,
  SearchHit,
  SearchQueryParams
} from '../../db/types'

type SqlDatabase = BetterSqlite3.Database

export class SearchRepo {
  constructor(private db: SqlDatabase) {}

  upsertDoc(doc: SearchDocInput) {
    const payload = {
      entityType: doc.entityType,
      entityId: doc.entityId,
      projectId: doc.projectId ?? null,
      convoId: doc.convoId ?? null,
      createdAtSec: doc.createdAtSec,
      updatedAtSec: doc.updatedAtSec,
      mediaType: doc.mediaType ?? 'text',
      extraJson: doc.extraJson ?? null
    }

    this.db.prepare(`
      INSERT INTO search_docs(
        entity_type,
        entity_id,
        project_id,
        convo_id,
        created_at,
        updated_at,
        media_type,
        extra_json
      )
      VALUES (
        @entityType,
        @entityId,
        @projectId,
        @convoId,
        @createdAtSec,
        @updatedAtSec,
        @mediaType,
        @extraJson
      )
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET
        project_id = excluded.project_id,
        convo_id = excluded.convo_id,
        updated_at = excluded.updated_at,
        media_type = excluded.media_type,
        extra_json = excluded.extra_json
    `).run(payload)

    const row = this.db.prepare(`
      SELECT doc_id FROM search_docs
      WHERE entity_type = @entityType AND entity_id = @entityId
    `).get({ entityType: doc.entityType, entityId: doc.entityId }) as { doc_id: number } | undefined

    if (!row?.doc_id) return

    const title = doc.title ?? ''
    const body = doc.body ?? ''

    this.db.prepare(`DELETE FROM search_fts WHERE rowid = ?`).run(row.doc_id)
    this.db.prepare(`INSERT INTO search_fts(rowid, title, body) VALUES (?, ?, ?)`).run(row.doc_id, title, body)
  }

  deleteDoc(entityType: SearchEntityType, entityId: string) {
    const row = this.db.prepare(`
      SELECT doc_id FROM search_docs WHERE entity_type = ? AND entity_id = ?
    `).get(entityType, entityId) as { doc_id: number } | undefined

    if (!row?.doc_id) return

    this.db.prepare(`DELETE FROM search_fts WHERE rowid = ?`).run(row.doc_id)
    this.db.prepare(`DELETE FROM search_docs WHERE doc_id = ?`).run(row.doc_id)
  }

  deleteByConvoId(convoId: string, entityType?: SearchEntityType) {
    const bind: Record<string, unknown> = { convoId }
    let where = 'convo_id = @convoId'

    if (entityType) {
      where += ' AND entity_type = @entityType'
      bind.entityType = entityType
    }

    this.db.prepare(`
      DELETE FROM search_fts
      WHERE rowid IN (SELECT doc_id FROM search_docs WHERE ${where})
    `).run(bind)

    this.db.prepare(`DELETE FROM search_docs WHERE ${where}`).run(bind)
  }

  updateProjectForConvo(convoId: string, projectId: string | null, updatedAtSec: number) {
    this.db.prepare(`
      UPDATE search_docs
      SET project_id = @projectId,
          updated_at = @updatedAtSec
      WHERE convo_id = @convoId
    `).run({ convoId, projectId, updatedAtSec })
  }

  clearProjectId(projectId: string, updatedAtSec: number) {
    this.db.prepare(`
      UPDATE search_docs
      SET project_id = NULL,
          updated_at = @updatedAtSec
      WHERE project_id = @projectId
    `).run({ projectId, updatedAtSec })
  }

  rebuildIndex(loaders: {
    loadProjects: () => Iterable<SearchDocInput>
    loadConvos: () => Iterable<SearchDocInput>
    loadMessages: () => Iterable<SearchDocInput>
  }) {
    this.db.prepare(`DELETE FROM search_fts`).run()
    this.db.prepare(`DELETE FROM search_docs`).run()

    for (const it of [loaders.loadProjects(), loaders.loadConvos(), loaders.loadMessages()]) {
      for (const doc of it) this.upsertDoc(doc)
    }
  }

  query(params: SearchQueryParams): SearchHit[] {
    const limit = clamp(params.limit ?? 50, 1, 200)
    const offset = Math.max(0, params.offset ?? 0)
    const mode = params.mode ?? 'fuzzy'

    const types: SearchEntityType[] = []
    if (params.scope?.projectName) types.push('project')
    if (params.scope?.convoName) types.push('convo')
    if (params.scope?.convoContent) types.push('message')
    if (types.length === 0) return []

    const ftsQuery = buildFtsQuery(params.q, mode)
    if (!ftsQuery) return []

    const bind: Record<string, unknown> = {
      query: ftsQuery,
      projectId: params.projectId ?? null,
      convoId: params.convoId ?? null,
      t0: params.timeFromSec ?? null,
      t1: params.timeToSec ?? null,
      limit,
      offset
    }

    const placeholders = types.map((_, idx) => `@type_${idx}`).join(',')
    types.forEach((t, idx) => {
      bind[`type_${idx}`] = t
    })

    const snippet = `CASE
      WHEN length(COALESCE(search_fts.body, '')) > 0
        THEN snippet(search_fts, 1, '${HIGHLIGHT_START}', '${HIGHLIGHT_END}', '…', 12)
      ELSE snippet(search_fts, 0, '${HIGHLIGHT_START}', '${HIGHLIGHT_END}', '…', 12)
    END AS snippet`

    const sql = `
      SELECT
        d.entity_type AS entityType,
        d.entity_id AS entityId,
        d.project_id AS projectId,
        d.convo_id AS convoId,
        d.created_at AS createdAtSec,
        bm25(search_fts) AS score,
        ${snippet}
      FROM search_fts
      JOIN search_docs d ON d.doc_id = search_fts.rowid
      WHERE search_fts MATCH @query
        AND d.entity_type IN (${placeholders})
        AND (@projectId IS NULL OR d.project_id = @projectId)
        AND (@convoId IS NULL OR d.convo_id = @convoId)
        AND (@t0 IS NULL OR d.created_at >= @t0)
        AND (@t1 IS NULL OR d.created_at < @t1)
      ORDER BY score ASC, d.created_at DESC
      LIMIT @limit OFFSET @offset
    `

    try {
      const stmt = this.db.prepare(sql)
      return stmt.all(bind).map((row: any) => ({
        entityType: row.entityType,
        entityId: row.entityId,
        projectId: row.projectId ?? null,
        convoId: row.convoId ?? null,
        createdAtSec: row.createdAtSec,
        snippet: row.snippet ?? '',
        score: row.score
      }))
    } catch {
      const fallbackQuery = buildFallbackFtsQuery(params.q)
      if (!fallbackQuery) return []
      bind.query = fallbackQuery
      try {
        const stmt = this.db.prepare(sql)
        return stmt.all(bind).map((row: any) => ({
          entityType: row.entityType,
          entityId: row.entityId,
          projectId: row.projectId ?? null,
          convoId: row.convoId ?? null,
          createdAtSec: row.createdAtSec,
          snippet: row.snippet ?? '',
          score: row.score
        }))
      } catch {
        return this.queryLikeFallback(params, types, bind)
      }
    }
  }

  private queryLikeFallback(params: SearchQueryParams, types: SearchEntityType[], bind: Record<string, unknown>): SearchHit[] {
    if (!shouldUseLikeFallback(params)) return []

    const likeQuery = buildLikeQuery(params.q)
    if (!likeQuery) return []

    const placeholders = types.map((_, idx) => `@type_${idx}`).join(',')
    types.forEach((t, idx) => {
      bind[`type_${idx}`] = t
    })

    const sql = `
      SELECT
        d.entity_type AS entityType,
        d.entity_id AS entityId,
        d.project_id AS projectId,
        d.convo_id AS convoId,
        d.created_at AS createdAtSec,
        0 AS score,
        CASE
          WHEN length(COALESCE(search_fts.body, '')) > 0
            THEN substr(search_fts.body, 1, 160)
          ELSE substr(search_fts.title, 1, 160)
        END AS snippet
      FROM search_fts
      JOIN search_docs d ON d.doc_id = search_fts.rowid
      WHERE (search_fts.title LIKE @likeQuery OR search_fts.body LIKE @likeQuery)
        AND d.entity_type IN (${placeholders})
        AND (@projectId IS NULL OR d.project_id = @projectId)
        AND (@convoId IS NULL OR d.convo_id = @convoId)
        AND (@t0 IS NULL OR d.created_at >= @t0)
        AND (@t1 IS NULL OR d.created_at < @t1)
      ORDER BY d.created_at DESC
      LIMIT @limit OFFSET @offset
    `

    const stmt = this.db.prepare(sql)
    return stmt.all({ ...bind, likeQuery }).map((row: any) => ({
      entityType: row.entityType,
      entityId: row.entityId,
      projectId: row.projectId ?? null,
      convoId: row.convoId ?? null,
      createdAtSec: row.createdAtSec,
      snippet: row.snippet ?? '',
      score: row.score
    }))
  }

  fulltext(params: FulltextQueryParams): FulltextResult[] {
    const limit = clamp(params.limit ?? 50, 1, 200)
    const offset = Math.max(0, params.offset ?? 0)

    const filters: string[] = []
    const bind: Record<string, unknown> = {
      query: params.query,
      limit,
      offset,
      projectId: params.projectId ?? null
    }

    if (params.projectId) {
      filters.push(`c.project_id = @projectId`)
    }

    if (params.tagIds && params.tagIds.length > 0) {
      const placeholders = params.tagIds.map((_, idx) => `@tag_${idx}`).join(',')
      params.tagIds.forEach((tagId, idx) => {
        bind[`tag_${idx}`] = tagId
      })
      filters.push(`EXISTS (
        SELECT 1 FROM convo_tag ct
        WHERE ct.convo_id = c.id
          AND ct.tag_id IN (${placeholders})
      )`)
    }

    if (typeof params.after === 'number') {
      filters.push(`m.created_at >= @after`)
      bind.after = params.after
    }

    if (typeof params.before === 'number') {
      filters.push(`m.created_at < @before`)
      bind.before = params.before
    }

    const whereClause = filters.length > 0 ? `AND ${filters.join(' AND ')}` : ''
    const snippet = params.highlight === false
      ? 'NULL as snippet'
      : `snippet(message_fts, 2, '<em>', '</em>', '…', 20) as snippet`

    const sql = `
      SELECT
        m.id AS messageId,
        m.convo_id AS convoId,
        m.seq AS seq,
        ${snippet},
        bm25(message_fts) AS rank,
        m.created_at AS createdAt
      FROM message_fts
      JOIN message m ON m.id = message_fts.message_id
      JOIN convo c ON c.id = m.convo_id
      WHERE message_fts.body MATCH @query
      ${whereClause}
      GROUP BY m.id
      ORDER BY rank, m.created_at DESC
      LIMIT @limit OFFSET @offset
    `

    const stmt = this.db.prepare(sql)
    return stmt.all(bind).map((row: any) => ({
      messageId: row.messageId,
      convoId: row.convoId,
      seq: row.seq,
      snippet: row.snippet ?? null,
      rank: row.rank,
      createdAt: row.createdAt
    }))
  }

  optimize() {
    this.db.prepare(`INSERT INTO message_fts(message_fts) VALUES('optimize')`).run()
    this.db.prepare(`INSERT INTO search_fts(search_fts) VALUES('optimize')`).run()
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

const HIGHLIGHT_START = '\u0001'
const HIGHLIGHT_END = '\u0002'

const buildFtsQuery = (raw: string, mode: 'exact' | 'fuzzy'): string => {
  const q = String(raw ?? '').trim()
  if (!q) return ''

  if (mode === 'exact') {
    const escaped = q.replace(/"/g, '""')
    return `"${escaped}"`
  }

  const tokens = q.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0)
  if (tokens.length === 0) return ''

  return tokens
    .map((token) => `${token.replace(/"/g, '""')}*`)
    .join(' AND ')
}

const buildFallbackFtsQuery = (raw: string): string => {
  const q = String(raw ?? '')
  if (!q.trim()) return ''
  const cleaned = q.replace(/[\"'`~!@#$%^&*()\-+=\[\]{}\\|;:,.<>/?]/g, ' ')
  const tokens = cleaned.split(/\s+/).map((t) => t.trim()).filter((t) => t.length > 0)
  if (tokens.length === 0) return ''
  return tokens.map((token) => `${token.replace(/"/g, '""')}*`).join(' AND ')
}

const buildLikeQuery = (raw: string): string => {
  const q = String(raw ?? '').trim()
  if (!q) return ''
  const escaped = q.replace(/[\\%_]/g, (m) => `\\${m}`)
  return `%${escaped}%`
}

const shouldUseLikeFallback = (params: SearchQueryParams): boolean => {
  const limit = params.limit ?? 50
  const hasBounds = params.projectId != null || params.convoId != null || params.timeFromSec != null || params.timeToSec != null
  return hasBounds && limit <= 50
}
