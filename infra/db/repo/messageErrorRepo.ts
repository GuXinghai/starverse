import BetterSqlite3 from 'better-sqlite3'
import type { MessageErrorRecord, UpsertMessageErrorInput, ListMessageErrorByIdsInput } from '../types'

type SqlDatabase = BetterSqlite3.Database

const mapRow = (row: any): MessageErrorRecord => {
  return {
    messageId: String(row.messageId ?? ''),
    envelopeJson: String(row.envelopeJson ?? ''),
    envelopeBytes: Number(row.envelopeBytes ?? 0),
    isTruncated: Boolean(row.isTruncated),
    createdAt: Number(row.createdAt ?? 0),
    updatedAt: Number(row.updatedAt ?? 0),
  }
}

export class MessageErrorRepo {
  private upsertStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.upsertStmt = this.db.prepare(`
      INSERT INTO message_error(
        message_id,
        envelope_json,
        envelope_bytes,
        is_truncated,
        created_at,
        updated_at
      )
      VALUES (
        @messageId,
        @envelopeJson,
        @envelopeBytes,
        @isTruncated,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(message_id) DO UPDATE SET
        envelope_json = excluded.envelope_json,
        envelope_bytes = excluded.envelope_bytes,
        is_truncated = excluded.is_truncated,
        updated_at = excluded.updated_at
    `)
  }

  upsert(input: UpsertMessageErrorInput) {
    const messageId = String(input.messageId ?? '').trim()
    if (!messageId) throw new Error('Missing messageId')
    const envelopeJson = String(input.envelopeJson ?? '').trim()
    if (!envelopeJson) throw new Error('Missing envelopeJson')

    const envelopeBytes = Number(input.envelopeBytes ?? NaN)
    if (!Number.isFinite(envelopeBytes) || envelopeBytes < 0) throw new Error('Invalid envelopeBytes')

    const now = Date.now()
    const createdAt = typeof input.createdAt === 'number' && Number.isFinite(input.createdAt) ? input.createdAt : now
    const updatedAt = typeof input.updatedAt === 'number' && Number.isFinite(input.updatedAt) ? input.updatedAt : now

    this.upsertStmt.run({
      messageId,
      envelopeJson,
      envelopeBytes,
      isTruncated: input.isTruncated ? 1 : 0,
      createdAt,
      updatedAt,
    })

    return { ok: true }
  }

  listByMessageIds(input: ListMessageErrorByIdsInput): MessageErrorRecord[] {
    const ids = Array.isArray(input.messageIds)
      ? input.messageIds.map((id) => String(id ?? '').trim()).filter((id) => id.length > 0)
      : []

    if (ids.length === 0) return []

    const placeholders = ids.map((_, idx) => `@id${idx}`).join(', ')
    const stmt = this.db.prepare(`
      SELECT
        message_id AS messageId,
        envelope_json AS envelopeJson,
        envelope_bytes AS envelopeBytes,
        is_truncated AS isTruncated,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM message_error
      WHERE message_id IN (${placeholders})
    `)

    const params: Record<string, string> = {}
    ids.forEach((id, idx) => {
      params[`id${idx}`] = id
    })

    return stmt.all(params).map(mapRow)
  }
}
