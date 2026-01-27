import BetterSqlite3 from 'better-sqlite3'
import { randomUUID, createHash } from 'node:crypto'
import type { AppendMessageInput, ListMessageParams, MessageRecord, AppendReasoningDetailSegmentsInput, FinalizeReasoningDetailsInput, SetReasoningRequestConfigInput } from '../../db/types'
import { buildReasoningDetailsArray, stableStringifyReasoningDetails, type ReasoningDetailSegmentRow } from './reasoningDetailsAggregator'

type SqlDatabase = BetterSqlite3.Database

const safeParse = (input: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

const mergeMetaWithReasoning = (meta: Record<string, unknown> | null, reasoningJson: unknown, requestJson: unknown) => {
  const next: Record<string, unknown> = meta ? { ...meta } : {}

  if (typeof reasoningJson === 'string' && reasoningJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(reasoningJson)
      if (Array.isArray(parsed) && !next.reasoningDetailsRaw) {
        next.reasoningDetailsRaw = parsed
      }
    } catch {
      // ignore parse errors
    }
  }

  if (typeof requestJson === 'string' && requestJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(requestJson)
      if (parsed && typeof parsed === 'object') {
        next.requestReasoningConfig = parsed
      }
    } catch {
      // ignore parse errors
    }
  }

  return Object.keys(next).length > 0 ? next : null
}

const mapRow = (row: any): MessageRecord => {
  const meta = mergeMetaWithReasoning(
    row.meta ? safeParse(row.meta) : null,
    row.reasoningDetailsFinalJson,
    row.requestReasoningConfigJson
  )

  return {
    id: row.id,
    convoId: row.convo_id,
    role: row.role,
    seq: row.seq,
    createdAt: row.created_at,
    body: row.body,
    meta,
  }
}

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
  private insertReasoningSegmentStmt: BetterSqlite3.Statement
  private listReasoningSegmentsStmt: BetterSqlite3.Statement
  private updateReasoningFinalStmt: BetterSqlite3.Statement
  private updateReasoningRequestConfigStmt: BetterSqlite3.Statement
  private getReasoningSegmentsStatsStmt: BetterSqlite3.Statement
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

    this.insertReasoningSegmentStmt = this.db.prepare(`
      INSERT OR IGNORE INTO message_reasoning_detail_segments (
        message_id,
        detail_id,
        format,
        detail_index,
        type,
        payload,
        delta_text,
        delta_data,
        delta_summary,
        created_at,
        segment_fingerprint
      )
      VALUES (
        @messageId,
        @detailId,
        @format,
        @detailIndex,
        @type,
        @payload,
        @deltaText,
        @deltaData,
        @deltaSummary,
        @createdAt,
        @fingerprint
      )
    `)

    this.listReasoningSegmentsStmt = this.db.prepare(`
      SELECT
        segment_id AS segmentId,
        detail_id AS detailId,
        format,
        detail_index AS "index",
        type,
        payload,
        delta_text AS deltaText,
        delta_data AS deltaData,
        delta_summary AS deltaSummary
      FROM message_reasoning_detail_segments
      WHERE message_id = @messageId
      ORDER BY segment_id ASC
    `)

    this.updateReasoningFinalStmt = this.db.prepare(`
      UPDATE message
      SET reasoning_details_final_json = @finalJson,
          reasoning_segments_count = @segmentsCount,
          reasoning_last_segment_id = @lastSegmentId,
          reasoning_details_final_sha256 = @sha256,
          reasoning_details_final_bytes = @bytes
      WHERE id = @messageId
    `)

    this.updateReasoningRequestConfigStmt = this.db.prepare(`
      UPDATE message
      SET request_reasoning_config_json = @requestJson
      WHERE id = @messageId
    `)

    this.getReasoningSegmentsStatsStmt = this.db.prepare(`
      SELECT COUNT(*) AS cnt,
             COALESCE(SUM(LENGTH(delta_text)), 0) + COALESCE(SUM(LENGTH(delta_summary)), 0) + COALESCE(SUM(LENGTH(delta_data)), 0) AS sumLen
      FROM message_reasoning_detail_segments
      WHERE message_id = @messageId
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
      SELECT
        m.id,
        m.convo_id,
        m.role,
        m.seq,
        m.created_at,
        m.meta,
        m.reasoning_details_final_json AS reasoningDetailsFinalJson,
        m.request_reasoning_config_json AS requestReasoningConfigJson,
        b.body
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

  appendReasoningDetailSegments(input: AppendReasoningDetailSegmentsInput) {
    const messageId = String(input.messageId ?? '').trim()
    if (!messageId) throw new Error('Missing messageId')

    const details = Array.isArray(input.details) ? input.details : []
    if (details.length === 0) return { ok: true, received: 0, inserted: 0, skipped: 0 }

    const now = Date.now()
    let inserted = 0
    let skipped = 0
    let ignored = 0
    let sumDeltaLenInserted = 0
    const txn = this.db.transaction(() => {
      for (const detail of details) {
        const d = detail as any
        // 构建 payload 时排除内部字段
        const payloadObj = { ...d }
        delete payloadObj.__deltaText
        delete payloadObj.__deltaSummary
        delete payloadObj.__deltaData
        delete payloadObj.__isSnapshot
        delete payloadObj.__hasNewMetadata
        delete payloadObj.__key
        delete payloadObj.__offsetBefore
        delete payloadObj.__offsetAfter
        delete payloadObj.__metadataDigest
        delete payloadObj.__chunkNo
        const payload = JSON.stringify(payloadObj ?? null)

        const detailId = d && typeof d === 'object' && 'id' in d ? String(d.id ?? '') : null
        const format = d && typeof d === 'object' && 'format' in d ? String(d.format ?? '') : null
        const index = d && typeof d === 'object' && 'index' in d && typeof d.index === 'number'
          ? Number(d.index)
          : null
        const type = d && typeof d === 'object' && 'type' in d ? String(d.type ?? '') : 'unknown'

        // 优先使用 Merger 计算的真正增量 __deltaText，否则回退到完整 text（兼容非 Merger 路径）
        const deltaText = typeof d.__deltaText === 'string' ? d.__deltaText
          : (typeof d.text === 'string' ? d.text : null)
        const deltaData = typeof d.__deltaData === 'string' ? d.__deltaData
          : (typeof d.data === 'string' ? d.data : null)
        const deltaSummary = typeof d.__deltaSummary === 'string' ? d.__deltaSummary
          : (typeof d.summary === 'string' ? d.summary : null)

        // 提取 Merger 传递的 offset 和 metadata 信息
        const key = typeof d.__key === 'string' ? d.__key : `${detailId ?? ''}|${index ?? ''}|${type}|${format ?? ''}`
        const offsetBefore = typeof d.__offsetBefore === 'number' ? d.__offsetBefore : -1
        const metadataDigest = typeof d.__metadataDigest === 'string' ? d.__metadataDigest : ''

        // 判断是否有实际增量或新 metadata
        const hasAnyDelta = (deltaText !== null && deltaText.length > 0) ||
          (deltaData !== null && deltaData.length > 0) ||
          (deltaSummary !== null && deltaSummary.length > 0)
        const hasNewMetadata = d.__hasNewMetadata === true

        // 【修复风险2】只有当快照语义、无增量、且无新 metadata 时才跳过
        // 否则必须落库（保留 signature 等字段）
        if (d.__isSnapshot === true && !hasAnyDelta && !hasNewMetadata) {
          skipped++
          console.log('[DB-seg] SKIPPED (no delta/metadata)', { key, offsetBefore, type })
          continue
        }

        // 【幂等 fingerprint】基于稳定逻辑位置：key + offsetBefore + delta 内容 + metadataDigest
        // @see docs/architecture/REASONING_IDEMPOTENCY_CONTRACT.md
        // - 连续相同 deltaText（如"好""好"）offsetBefore 不同，都能插入
        // - 同一事件重传（完全相同）第二次被 UNIQUE 约束拒绝
        const fingerprintInput = [
          key,
          String(offsetBefore),
          deltaText ?? '',
          deltaSummary ?? '',
          deltaData ?? '',
          metadataDigest,
        ].join('\n')
        const fingerprint = createHash('sha256').update(fingerprintInput).digest('hex')

        const result = this.insertReasoningSegmentStmt.run({
          messageId,
          detailId: detailId && detailId.length > 0 ? detailId : null,
          format: format && format.length > 0 ? format : null,
          detailIndex: index,
          type: type && type.length > 0 ? type : 'unknown',
          payload,
          deltaText,
          deltaData,
          deltaSummary,
          createdAt: now,
          fingerprint,
        })
        // INSERT OR IGNORE: changes === 0 表示被 fingerprint 唯一约束拒绝
        // 统计所有 delta 字段长度 (支持 encrypted 模型的 deltaData)
        const deltaLen = (deltaText?.length ?? 0) + (deltaSummary?.length ?? 0) + (deltaData?.length ?? 0)
        if (result.changes > 0) {
          inserted++
          sumDeltaLenInserted += deltaLen
          console.log('[DB-seg] inserted', { key, offsetBefore, type, deltaLen, fp: fingerprint.slice(0, 8) })
        } else {
          ignored++
          console.log('[DB-seg] IGNORED (fingerprint collision)', {
            key,
            offsetBefore,
            messageId: messageId.slice(0, 8),
            type,
            deltaLen,
            fingerprint: fingerprint.slice(0, 16),
          })
        }
      }
    })

    txn()
    console.log('[DB] appendReasoningDetailSegments: batch completed', {
      messageId: messageId.slice(0, 8),
      received: details.length,
      inserted,
      skipped,
      ignored,
      sumDeltaLenInserted,
    })
    return { ok: true, received: details.length, inserted, skipped, ignored, sumDeltaLenInserted }
  }

  finalizeReasoningDetails(input: FinalizeReasoningDetailsInput) {
    const messageId = String(input.messageId ?? '').trim()
    if (!messageId) throw new Error('Missing messageId')

    const txn = this.db.transaction(() => {
      const rows = this.listReasoningSegmentsStmt.all({ messageId }) as ReasoningDetailSegmentRow[]
      const segmentsCount = rows.length
      const lastSegmentId = segmentsCount > 0 ? rows[segmentsCount - 1]?.segmentId ?? null : null

      if (segmentsCount === 0) {
        console.log('[DB] finalizeReasoningDetails: no segments found', { messageId: messageId.slice(0, 8) })
        this.updateReasoningFinalStmt.run({
          messageId,
          finalJson: null,
          segmentsCount: 0,
          lastSegmentId: null,
          sha256: null,
          bytes: 0,
        })
        return
      }

      const details = buildReasoningDetailsArray(rows)
      const { json, sha256, bytes } = stableStringifyReasoningDetails(details)

      // 计算 segments 中各 deltaText 的总长度（用于诊断）
      let totalDeltaTextLen = 0
      for (const row of rows) {
        if (row.deltaText) totalDeltaTextLen += row.deltaText.length
      }

      // 计算 details 中各 text 的总长度（Merger 重放后）
      let totalMergedTextLen = 0
      for (const d of details) {
        const text = (d as any)?.text
        if (typeof text === 'string') totalMergedTextLen += text.length
      }

      console.log('[DB] finalizeReasoningDetails: aggregation completed', {
        messageId: messageId.slice(0, 8),
        segmentsCount,
        detailsCount: details.length,
        totalDeltaTextLen,
        totalMergedTextLen,
        bytes,
      })

      this.updateReasoningFinalStmt.run({
        messageId,
        finalJson: json,
        segmentsCount,
        lastSegmentId,
        sha256,
        bytes,
      })
    })

    txn()
    return { ok: true }
  }

  setReasoningRequestConfig(input: SetReasoningRequestConfigInput) {
    const messageId = String(input.messageId ?? '').trim()
    if (!messageId) throw new Error('Missing messageId')
    const requestJson = JSON.stringify(input.value ?? null)
    this.updateReasoningRequestConfigStmt.run({ messageId, requestJson })
    return { ok: true }
  }

  /** 获取 reasoning segments 的 DB 统计（用于诊断恒等式验证） */
  getReasoningSegmentsStats(input: { messageId: string }): { cnt: number; sumLen: number } {
    const messageId = String(input.messageId ?? '').trim()
    if (!messageId) throw new Error('Missing messageId')
    const row = this.getReasoningSegmentsStatsStmt.get({ messageId }) as { cnt: number; sumLen: number } | undefined
    return { cnt: row?.cnt ?? 0, sumLen: row?.sumLen ?? 0 }
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
