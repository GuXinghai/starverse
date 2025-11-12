import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { AppendMessageInput, ListMessageParams, MessageRecord } from '../../db/types'

type SqlDatabase = BetterSqlite3.Database

const safeParse = (input: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

const mapRow = (row: any): MessageRecord => ({
  id: row.id,
  convoId: row.convo_id,
  role: row.role,
  seq: row.seq,
  createdAt: row.created_at,
  body: row.body,
  meta: row.meta ? safeParse(row.meta) : null
})

export class MessageRepo {
  private nextSeqStmt: BetterSqlite3.Statement
  private insertStmt: BetterSqlite3.Statement
  private insertBodyStmt: BetterSqlite3.Statement
  private insertFtsStmt: BetterSqlite3.Statement
  private touchConvoStmt: BetterSqlite3.Statement
  private deleteByConvoStmt: BetterSqlite3.Statement
  private appendTxn: (input: AppendMessageInput) => MessageRecord

  constructor(private db: SqlDatabase) {
    this.nextSeqStmt = this.db.prepare(`
      SELECT COALESCE(MAX(seq), 0) as seq FROM message WHERE convo_id = @convoId
    `)

    this.insertStmt = this.db.prepare(`
      INSERT INTO message(id, convo_id, role, created_at, seq, meta)
      VALUES (@id, @convoId, @role, @createdAt, @seq, @meta)
    `)

    this.insertBodyStmt = this.db.prepare(`
      INSERT INTO message_body(message_id, body)
      VALUES (@messageId, @body)
    `)

    this.insertFtsStmt = this.db.prepare(`
      INSERT INTO message_fts(message_id, convo_id, body)
      VALUES (@messageId, @convoId, @body)
    `)

    this.touchConvoStmt = this.db.prepare(`
      UPDATE convo SET updated_at = @updatedAt WHERE id = @id
    `)

    this.deleteByConvoStmt = this.db.prepare(`
      DELETE FROM message WHERE convo_id = @convoId
    `)

    this.appendTxn = this.db.transaction((input: AppendMessageInput) => {
      return this.insertMessageRecord(input)
    })
  }

  append(input: AppendMessageInput): MessageRecord {
    return this.appendTxn(input)
  }

  replaceForConvo(convoId: string, messages: AppendMessageInput[]) {
    const replaceTxn = this.db.transaction((payloads: AppendMessageInput[]) => {
      this.deleteByConvoStmt.run({ convoId })
      payloads.forEach((message, index) => {
        this.insertMessageRecord({
          ...message,
          convoId,
          seq: message.seq ?? index + 1
        })
      })
    })
    replaceTxn(messages)
  }

  list(params: ListMessageParams): MessageRecord[] {
    const limit = params.limit ?? 200
    const direction = params.direction === 'desc' ? 'DESC' : 'ASC'
    const sql = `
      SELECT m.id, m.convo_id, m.role, m.seq, m.created_at, m.meta, b.body
      FROM message m
      JOIN message_body b ON b.message_id = m.id
      WHERE m.convo_id = @convoId
        ${params.fromSeq !== undefined ? 'AND m.seq >= @fromSeq' : ''}
      ORDER BY m.seq ${direction}
      LIMIT @limit
    `

    const stmt = this.db.prepare(sql)
    return stmt.all({
      convoId: params.convoId,
      fromSeq: params.fromSeq ?? null,
      limit
    }).map(mapRow)
  }

  private nextSeq(convoId: string): number {
    const row = this.nextSeqStmt.get({ convoId }) as { seq: number } | undefined
    return row?.seq ?? 0
  }

  private insertMessageRecord(input: AppendMessageInput): MessageRecord {
    const now = input.createdAt ?? Date.now()
    const id = randomUUID()
    const seq = input.seq ?? this.nextSeq(input.convoId) + 1

    this.insertStmt.run({
      id,
      convoId: input.convoId,
      role: input.role,
      createdAt: now,
      seq,
      meta: input.meta ? JSON.stringify(input.meta) : null
    })

    this.insertBodyStmt.run({
      messageId: id,
      body: input.body
    })

    this.insertFtsStmt.run({
      messageId: id,
      convoId: input.convoId,
      body: input.body
    })

    this.touchConvoStmt.run({ id: input.convoId, updatedAt: now })

    return {
      id,
      convoId: input.convoId,
      role: input.role,
      seq,
      createdAt: now,
      body: input.body,
      meta: input.meta ?? null
    }
  }
}
