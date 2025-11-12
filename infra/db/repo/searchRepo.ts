import BetterSqlite3 from 'better-sqlite3'
import type { FulltextQueryParams, FulltextResult } from '../../db/types'

type SqlDatabase = BetterSqlite3.Database

export class SearchRepo {
  constructor(private db: SqlDatabase) {}

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
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)
