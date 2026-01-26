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
  private deleteFtsByConvoStmt: BetterSqlite3.Statement
  private findMessageIdBySeqStmt: BetterSqlite3.Statement
  private findMessageByIdStmt: BetterSqlite3.Statement
  private findLastUserByConvoStmt: BetterSqlite3.Statement
  private updateStatusStmt: BetterSqlite3.Statement
  private updateBodyStmt: BetterSqlite3.Statement
  private updateFtsBodyStmt: BetterSqlite3.Statement
  private appendTxn: (input: AppendMessageInput) => MessageRecord

  constructor(private db: SqlDatabase) {
    this.nextSeqStmt = this.db.prepare(`
      SELECT COALESCE(MAX(seq), 0) as seq FROM message WHERE convo_id = @convoId
    `)

    this.insertStmt = this.db.prepare(`
      INSERT INTO message(id, convo_id, role, created_at, seq, parent_id, status, answer_root_id, question_id, meta)
      VALUES (@id, @convoId, @role, @createdAt, @seq, @parentId, @status, @answerRootId, @questionId, @meta)
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
    this.deleteFtsByConvoStmt = this.db.prepare(`
      DELETE FROM message_fts WHERE convo_id = @convoId
    `)

    this.findMessageIdBySeqStmt = this.db.prepare(`
      SELECT id, role, status, question_id AS questionId, answer_root_id AS answerRootId
      FROM message
      WHERE convo_id = @convoId AND seq = @seq
      LIMIT 1
    `)

    this.findMessageByIdStmt = this.db.prepare(`
      SELECT id, convo_id, role, question_id AS questionId, answer_root_id AS answerRootId
      FROM message
      WHERE id = @id
      LIMIT 1
    `)

    this.updateStatusStmt = this.db.prepare(`
      UPDATE message
      SET status = @status
      WHERE id = @id
    `)

    this.findLastUserByConvoStmt = this.db.prepare(`
      SELECT id
      FROM message
      WHERE convo_id = @convoId AND role = 'user'
      ORDER BY seq DESC
      LIMIT 1
    `)

    this.updateBodyStmt = this.db.prepare(`
      UPDATE message_body SET body = body || @appendBody WHERE message_id = @messageId
    `)

    this.updateFtsBodyStmt = this.db.prepare(`
      UPDATE message_fts SET body = body || @appendBody WHERE message_id = @messageId
    `)

    this.appendTxn = this.db.transaction((input: AppendMessageInput) => {
      return this.insertMessageRecord(input)
    })
  }

  append(input: AppendMessageInput): MessageRecord {
    return this.appendTxn(input)
  }

  appendDelta(input: { convoId: string; seq: number; appendBody: string }) {
    const now = Date.now()
    const appendTxn = this.db.transaction((payload: { convoId: string; seq: number; appendBody: string }) => {
      const row = this.findMessageIdBySeqStmt.get({
        convoId: payload.convoId,
        seq: payload.seq
      }) as { id: string; status?: string } | undefined

      if (!row?.id) {
        throw new Error(`message not found for convo=${payload.convoId}, seq=${payload.seq}`)
      }

      const status = String((row as any).status ?? 'final')
      if (status !== 'streaming') {
        throw new Error(`appendDelta rejected: message status=${status} (must be streaming)`)
      }

      this.updateBodyStmt.run({ messageId: row.id, appendBody: payload.appendBody })
      this.updateFtsBodyStmt.run({ messageId: row.id, appendBody: payload.appendBody })

      this.touchConvoStmt.run({ id: payload.convoId, updatedAt: now })
    })

    appendTxn(input)
    return { ok: true }
  }

  replaceForConvo(convoId: string, messages: AppendMessageInput[]) {
    const replaceTxn = this.db.transaction((payloads: AppendMessageInput[]) => {
      this.deleteFtsByConvoStmt.run({ convoId })
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

    const parentId = this.deriveParentId(input, seq)
    const status = this.deriveStatus(input)
    const { questionId, answerRootId } = this.deriveAnswerGrouping(input, id, parentId)

    this.insertStmt.run({
      id,
      convoId: input.convoId,
      role: input.role,
      createdAt: now,
      seq,
      parentId,
      status,
      answerRootId,
      questionId,
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

  setStatus(input: { messageId: string; status: 'streaming' | 'final' | 'error' }) {
    const id = String(input.messageId ?? '').trim()
    if (!id) throw new Error('Missing messageId')

    const status = input.status
    if (status !== 'streaming' && status !== 'final' && status !== 'error') throw new Error('Invalid status')

    console.log('[DB] messageRepo.setStatus: starting', { messageId: id.slice(0, 8), status })
    const now = Date.now()
    const txn = this.db.transaction(() => {
      const row = this.findMessageByIdStmt.get({ id }) as { convo_id?: string } | undefined
      if (!row?.convo_id) throw new Error(`message not found: ${id}`)
      this.updateStatusStmt.run({ id, status })
      this.touchConvoStmt.run({ id: String(row.convo_id), updatedAt: now })
    })
    txn()
    console.log('[DB] messageRepo.setStatus: committed', { messageId: id.slice(0, 8), status })

    return { ok: true }
  }

  private deriveParentId(input: AppendMessageInput, seq: number): string | null {
    if (input.parentId !== undefined) {
      return input.parentId === null ? null : String(input.parentId ?? '').trim() || null
    }

    if (seq <= 1) return null
    const prev = this.findMessageIdBySeqStmt.get({ convoId: input.convoId, seq: seq - 1 }) as { id?: string } | undefined
    return prev?.id ? String(prev.id) : null
  }

  private deriveStatus(input: AppendMessageInput): 'streaming' | 'final' | 'error' {
    if (input.status === 'streaming' || input.status === 'final' || input.status === 'error') return input.status

    const body = typeof input.body === 'string' ? input.body : String(input.body ?? '')
    if (input.role === 'assistant' && body.length === 0) return 'streaming'
    return 'final'
  }

  private deriveAnswerGrouping(
    input: AppendMessageInput,
    newMessageId: string,
    parentId: string | null
  ): { questionId: string | null; answerRootId: string | null } {
    const questionIdExplicit = input.questionId !== undefined ? input.questionId : undefined
    const answerRootIdExplicit = input.answerRootId !== undefined ? input.answerRootId : undefined

    const role = String(input.role ?? '').trim()
    if (role === 'user') return { questionId: null, answerRootId: null }

    const normalize = (v: unknown): string | null => {
      if (v === null) return null
      if (typeof v === 'string') {
        const s = v.trim()
        return s.length > 0 ? s : null
      }
      return null
    }

    const explicitQuestionId = normalize(questionIdExplicit)
    const explicitAnswerRootId = normalize(answerRootIdExplicit)

    if (questionIdExplicit !== undefined || answerRootIdExplicit !== undefined) {
      return { questionId: explicitQuestionId, answerRootId: explicitAnswerRootId }
    }

    const parent = parentId
      ? (this.findMessageByIdStmt.get({ id: parentId }) as
          | { id: string; role: string; questionId?: string | null; answerRootId?: string | null }
          | undefined)
      : undefined

    if (parent) {
      const parentRole = String(parent.role ?? '').trim()
      const pq = normalize(parent.questionId)
      const par = normalize(parent.answerRootId)

      if (parentRole === 'user') {
        const qid = String(parent.id)
        if (role === 'assistant') return { questionId: qid, answerRootId: newMessageId }
        return { questionId: qid, answerRootId: null }
      }

      if (pq) {
        // Tool and assistant follow-up messages remain in the same answer group.
        // If an assistant follow-up starts a group without a known root, treat it as the root.
        if (role === 'assistant' && !par) return { questionId: pq, answerRootId: newMessageId }
        return { questionId: pq, answerRootId: par }
      }
    }

    const lastUser = this.findLastUserByConvoStmt.get({ convoId: input.convoId }) as { id?: string } | undefined
    const fallbackQid = lastUser?.id ? String(lastUser.id) : null
    if (!fallbackQid) return { questionId: null, answerRootId: null }

    if (role === 'assistant') return { questionId: fallbackQid, answerRootId: newMessageId }
    return { questionId: fallbackQid, answerRootId: null }
  }
}
