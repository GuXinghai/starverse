/* eslint-disable max-lines-per-function, complexity */
import BetterSqlite3 from 'better-sqlite3'
import { randomUUID, createHash } from 'node:crypto'
import type { AppendMessageInput, ListMessageParams, MessageRecord, AppendReasoningDetailSegmentsInput, AppendReasoningDisplayBlocksInput, FinalizeReasoningDetailsInput, FinalizeReasoningDisplayBlocksInput, ListReasoningDisplayBlocksByMessageIdsInput, ReasoningDisplayBlockRecord, SetReasoningRequestConfigInput, SetMessageAnnotationsInput, UpsertProviderNativeContentInput, ListProviderNativeContentsByMessageIdsInput, ProviderNativeContentRecord } from '../../db/types'
import { buildReasoningDetailsArray, stableStringifyReasoningDetails, type ReasoningDetailSegmentRow } from './reasoningDetailsAggregator'
import { mergeMetaWithReasoning, safeParseMessageMeta } from './shared/messageMetaMerge'
import {
  ANTHROPIC_MESSAGES_SOURCE_API,
  ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY,
  type AnthropicProviderNativeSnapshot,
} from '../../../src/next/provider/anthropic/anthropicProviderNativeContent'
import {
  GEMINI_GENERATE_CONTENT_SOURCE_API,
  GEMINI_PROVIDER_NATIVE_PROVIDER_KEY,
  type GeminiProviderNativeSnapshot,
} from '../../../src/next/provider/gemini/geminiProviderNativeContent'
import { normalizeProviderNativeSnapshot } from '../../../src/next/provider/providerNativeSnapshot'

type SqlDatabase = BetterSqlite3.Database

const mapRow = (row: any): MessageRecord => {
  const meta = mergeMetaWithReasoning(
    row.meta ? safeParseMessageMeta(row.meta) : null,
    row.reasoningDetailsFinalJson,
    row.requestReasoningConfigJson,
    row.annotationsJson,
    row.reasoningDurationMs ?? null,
    row.reasoningEndReason ?? null,
    row.reasoningDurationIsFallback ?? null,
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

type ProviderNativeRow = Readonly<{
  providerKey: string
  sourceApi: string
  snapshotKey: string
  candidateIndex: number | null
  status: string
  contentJson: string
  role: string | null
  finishReason: string | null
  stopReason: string | null
  stopSequence: string | null
  usageJson: string | null
  model: string | null
  modelVersion: string | null
}>

function providerNativeSnapshotToRow(snapshot: ReturnType<typeof normalizeProviderNativeSnapshot>) {
  if (snapshot.providerKey === GEMINI_PROVIDER_NATIVE_PROVIDER_KEY && snapshot.sourceApi === GEMINI_GENERATE_CONTENT_SOURCE_API) {
    const gemini = snapshot as GeminiProviderNativeSnapshot
    return {
      providerKey: gemini.providerKey,
      sourceApi: gemini.sourceApi,
      snapshotKey: gemini.snapshotKey,
      candidateIndex: gemini.candidateIndex,
      status: gemini.status,
      contentJson: JSON.stringify(gemini.content),
      role: gemini.content.role,
      finishReason: gemini.finishReason ?? null,
      stopReason: null,
      stopSequence: null,
      usageJson: gemini.usageMetadata ? JSON.stringify(gemini.usageMetadata) : null,
      model: null,
      modelVersion: gemini.modelVersion ?? null,
    }
  }
  if (snapshot.providerKey === ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY && snapshot.sourceApi === ANTHROPIC_MESSAGES_SOURCE_API) {
    const anthropic = snapshot as AnthropicProviderNativeSnapshot
    return {
      providerKey: anthropic.providerKey,
      sourceApi: anthropic.sourceApi,
      snapshotKey: anthropic.snapshotKey,
      candidateIndex: null,
      status: anthropic.status,
      contentJson: JSON.stringify(anthropic.content),
      role: anthropic.role,
      finishReason: null,
      stopReason: anthropic.stopReason ?? null,
      stopSequence: anthropic.stopSequence ?? null,
      usageJson: anthropic.usage !== undefined ? JSON.stringify(anthropic.usage) : null,
      model: anthropic.model ?? null,
      modelVersion: null,
    }
  }
  throw new Error('Unsupported provider native snapshot')
}

function providerNativeRowToSnapshot(row: ProviderNativeRow) {
  const content = JSON.parse(row.contentJson)
  const usage = row.usageJson ? JSON.parse(row.usageJson) : undefined
  if (row.providerKey === GEMINI_PROVIDER_NATIVE_PROVIDER_KEY && row.sourceApi === GEMINI_GENERATE_CONTENT_SOURCE_API) {
    return normalizeProviderNativeSnapshot({
      providerKey: row.providerKey,
      sourceApi: row.sourceApi,
      snapshotKey: row.snapshotKey,
      candidateIndex: typeof row.candidateIndex === 'number' ? row.candidateIndex : 0,
      status: row.status,
      content,
      ...(row.finishReason ? { finishReason: row.finishReason } : {}),
      ...(usage ? { usageMetadata: usage } : {}),
      ...(row.modelVersion ? { modelVersion: row.modelVersion } : {}),
    })
  }
  if (row.providerKey === ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY && row.sourceApi === ANTHROPIC_MESSAGES_SOURCE_API) {
    return normalizeProviderNativeSnapshot({
      providerKey: row.providerKey,
      sourceApi: row.sourceApi,
      snapshotKey: row.snapshotKey,
      role: row.role ?? 'assistant',
      status: row.status,
      content,
      ...(row.model ? { model: row.model } : {}),
      ...(row.stopReason ? { stopReason: row.stopReason } : {}),
      stopSequence: row.stopSequence,
      ...(usage !== undefined ? { usage } : {}),
    })
  }
  throw new Error('Unsupported provider native row')
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
  private updateMetaStmt: BetterSqlite3.Statement
  private updateAnnotationsStmt: BetterSqlite3.Statement
  private insertReasoningSegmentStmt: BetterSqlite3.Statement
  private listReasoningSegmentsStmt: BetterSqlite3.Statement
  private insertReasoningDisplayBlockStmt: BetterSqlite3.Statement
  private updateReasoningDisplayBlockStmt: BetterSqlite3.Statement
  private finalizeReasoningDisplayBlocksStmt: BetterSqlite3.Statement
  private listReasoningDisplayBlocksStmt: BetterSqlite3.Statement
  private upsertProviderNativeContentStmt: BetterSqlite3.Statement
  private listProviderNativeContentsStmt: BetterSqlite3.Statement
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
      SET status = @status,
          reasoning_duration_ms = COALESCE(reasoning_duration_ms, @reasoningDurationMs),
          reasoning_end_reason = COALESCE(reasoning_end_reason, @reasoningEndReason),
          reasoning_duration_is_fallback = MAX(COALESCE(reasoning_duration_is_fallback, 0), COALESCE(@reasoningDurationIsFallback, 0))
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

    this.updateMetaStmt = this.db.prepare(`
      UPDATE message SET meta = @meta WHERE id = @id
    `)

    this.updateAnnotationsStmt = this.db.prepare(`
      UPDATE message SET annotations_json = @annotationsJson WHERE id = @id
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

    this.insertReasoningDisplayBlockStmt = this.db.prepare(`
      INSERT OR IGNORE INTO message_reasoning_display_blocks (
        block_id,
        message_id,
        ordinal,
        block_type,
        text,
        semantic_role,
        asset_id,
        file_asset_id,
        url,
        mime,
        width,
        height,
        alt,
        label,
        warning,
        provider_key,
        source_event_type,
        source_raw_segment_id,
        payload_json,
        created_at,
        final_at,
        segment_fingerprint
      )
      VALUES (
        @blockId,
        @messageId,
        @ordinal,
        @blockType,
        @text,
        @semanticRole,
        @assetId,
        @fileAssetId,
        @url,
        @mime,
        @width,
        @height,
        @alt,
        @label,
        @warning,
        @providerKey,
        @sourceEventType,
        @sourceRawSegmentId,
        @payloadJson,
        @createdAt,
        NULL,
        @fingerprint
      )
    `)

    this.updateReasoningDisplayBlockStmt = this.db.prepare(`
      UPDATE message_reasoning_display_blocks
      SET ordinal = @ordinal,
          block_type = @blockType,
          text = @text,
          semantic_role = @semanticRole,
          asset_id = @assetId,
          file_asset_id = @fileAssetId,
          url = @url,
          mime = @mime,
          width = @width,
          height = @height,
          alt = @alt,
          label = @label,
          warning = @warning,
          provider_key = @providerKey,
          source_event_type = @sourceEventType,
          source_raw_segment_id = @sourceRawSegmentId,
          payload_json = @payloadJson,
          segment_fingerprint = @fingerprint
      WHERE block_id = @blockId
        AND message_id = @messageId
    `)

    this.finalizeReasoningDisplayBlocksStmt = this.db.prepare(`
      UPDATE message_reasoning_display_blocks
      SET final_at = @finalAt
      WHERE message_id = @messageId
        AND final_at IS NULL
    `)

    this.listReasoningDisplayBlocksStmt = this.db.prepare(`
      SELECT
        block_id AS blockId,
        message_id AS messageId,
        ordinal,
        block_type AS type,
        text,
        semantic_role AS semanticRole,
        asset_id AS assetId,
        file_asset_id AS fileAssetId,
        url,
        mime AS mimeType,
        width,
        height,
        alt,
        label,
        warning,
        provider_key AS providerKey,
        source_event_type AS sourceEventType,
        source_raw_segment_id AS sourceRawSegmentId,
        final_at AS finalAt
      FROM message_reasoning_display_blocks
      WHERE message_id IN (
        SELECT value FROM json_each(@messageIdsJson)
      )
      ORDER BY message_id ASC, ordinal ASC
    `)

    this.upsertProviderNativeContentStmt = this.db.prepare(`
      INSERT INTO message_provider_native_contents (
        message_id,
        provider_key,
        source_api,
        snapshot_key,
        candidate_index,
        status,
        content_json,
        role,
        finish_reason,
        stop_reason,
        stop_sequence,
        usage_json,
        model,
        model_version,
        created_at,
        updated_at
      )
      VALUES (
        @messageId,
        @providerKey,
        @sourceApi,
        @snapshotKey,
        @candidateIndex,
        @status,
        @contentJson,
        @role,
        @finishReason,
        @stopReason,
        @stopSequence,
        @usageJson,
        @model,
        @modelVersion,
        @createdAt,
        @updatedAt
      )
      ON CONFLICT(message_id, provider_key, source_api, snapshot_key) DO UPDATE SET
        candidate_index = excluded.candidate_index,
        status = excluded.status,
        content_json = excluded.content_json,
        role = excluded.role,
        finish_reason = excluded.finish_reason,
        stop_reason = excluded.stop_reason,
        stop_sequence = excluded.stop_sequence,
        usage_json = excluded.usage_json,
        model = excluded.model,
        model_version = excluded.model_version,
        updated_at = excluded.updated_at
    `)

    this.listProviderNativeContentsStmt = this.db.prepare(`
      SELECT
        message_id AS messageId,
        provider_key AS providerKey,
        source_api AS sourceApi,
        snapshot_key AS snapshotKey,
        candidate_index AS candidateIndex,
        status,
        content_json AS contentJson,
        role,
        finish_reason AS finishReason,
        stop_reason AS stopReason,
        stop_sequence AS stopSequence,
        usage_json AS usageJson,
        model,
        model_version AS modelVersion,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM message_provider_native_contents
      WHERE message_id IN (
        SELECT value FROM json_each(@messageIdsJson)
      )
      ORDER BY message_id ASC, provider_key ASC, source_api ASC, snapshot_key ASC
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
        m.annotations_json AS annotationsJson,
        m.reasoning_details_final_json AS reasoningDetailsFinalJson,
        m.request_reasoning_config_json AS requestReasoningConfigJson,
        m.reasoning_duration_ms AS reasoningDurationMs,
        m.reasoning_end_reason AS reasoningEndReason,
        m.reasoning_duration_is_fallback AS reasoningDurationIsFallback,
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

  setStatus(input: {
    messageId: string
    status: 'streaming' | 'final' | 'error'
    reasoningDurationMs?: number | null
    reasoningEndReason?: string | null
    reasoningDurationIsFallback?: boolean
    metaPatch?: Record<string, unknown> | null
  }) {
    const id = String(input.messageId ?? '').trim()
    if (!id) throw new Error('Missing messageId')

    const status = input.status
    if (status !== 'streaming' && status !== 'final' && status !== 'error') throw new Error('Invalid status')

    console.log('[DB] messageRepo.setStatus: starting', { messageId: id.slice(0, 8), status })
    const now = Date.now()
    const txn = this.db.transaction(() => {
      const row = this.findMessageByIdStmt.get({ id }) as { convo_id?: string } | undefined
      if (!row?.convo_id) throw new Error(`message not found: ${id}`)
      this.updateStatusStmt.run({
        id,
        status,
        reasoningDurationMs: input.reasoningDurationMs ?? null,
        reasoningEndReason: input.reasoningEndReason ?? null,
        reasoningDurationIsFallback: input.reasoningDurationIsFallback ? 1 : 0,
      })
      if (input.metaPatch && typeof input.metaPatch === 'object') {
        this.patchMeta({ messageId: id, patch: input.metaPatch })
      }
      this.touchConvoStmt.run({ id: String(row.convo_id), updatedAt: now })
    })
    txn()
    console.log('[DB] messageRepo.setStatus: committed', { messageId: id.slice(0, 8), status })

    return { ok: true }
  }

  patchMeta(input: { messageId: string; patch: Record<string, unknown> }) {
    const id = String(input.messageId ?? '').trim()
    if (!id) throw new Error('Missing messageId')
    const patch = input.patch ?? {}
    if (!patch || typeof patch !== 'object') throw new Error('Invalid meta patch')

    const row = this.db.prepare('SELECT meta FROM message WHERE id = @id').get({ id }) as { meta?: string | null } | undefined
    const base = row?.meta ? safeParseMessageMeta(row.meta) : null
    const next: Record<string, unknown> = { ...(base ?? {}), ...(patch as Record<string, unknown>) }
    this.updateMetaStmt.run({ id, meta: JSON.stringify(next) })
    return { ok: true }
  }

  setAnnotations(input: SetMessageAnnotationsInput) {
    const id = String(input.messageId ?? '').trim()
    if (!id) throw new Error('Missing messageId')

    const annotationsRaw = input.annotations
    if (annotationsRaw !== undefined && annotationsRaw !== null && !Array.isArray(annotationsRaw)) {
      throw new Error('Invalid annotations')
    }

    this.updateAnnotationsStmt.run({
      id,
      annotationsJson: Array.isArray(annotationsRaw) ? JSON.stringify(annotationsRaw) : null,
    })

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

  appendReasoningDisplayBlocks(input: AppendReasoningDisplayBlocksInput) {
    const messageId = String(input.messageId ?? '').trim()
    if (!messageId) throw new Error('Missing messageId')
    const blocks = Array.isArray(input.blocks) ? input.blocks : []
    if (blocks.length === 0) return { ok: true, received: 0, inserted: 0, updated: 0, ignored: 0 }

    const now = Date.now()
    let inserted = 0
    let updated = 0
    let ignored = 0
    const txn = this.db.transaction(() => {
      for (const block of blocks) {
        const blockId = String(block.blockId ?? '').trim()
        const ordinal = Number(block.ordinal)
        const type = String(block.type ?? '').trim()
        if (!blockId || !Number.isFinite(ordinal) || ordinal < 0) continue
        if (type !== 'text' && type !== 'image' && type !== 'opaque') continue
        const providerKey = String(block.providerKey ?? '').trim()
        if (!providerKey) throw new Error('Reasoning display block providerKey is required')
        const assetId = String(block.assetId ?? '').trim()
        const fileAssetId = String(block.fileAssetId ?? '').trim()

        const payloadJson = JSON.stringify(block)
        const fingerprint = createHash('sha256')
          .update([messageId, String(ordinal), type, payloadJson].join('\n'))
          .digest('hex')
        const payload = {
          blockId,
          messageId,
          ordinal,
          blockType: type,
          text: type === 'text' ? String(block.text ?? '') : null,
          semanticRole: block.semanticRole ?? null,
          assetId: type === 'image' && assetId ? assetId : null,
          fileAssetId: type === 'image' && fileAssetId ? fileAssetId : null,
          url: type === 'image' ? String(block.url ?? '') : null,
          mime: type === 'image' ? (block.mimeType ?? null) : null,
          width: typeof block.width === 'number' ? block.width : null,
          height: typeof block.height === 'number' ? block.height : null,
          alt: block.alt ?? null,
          label: type === 'opaque' ? String(block.label ?? '') : null,
          warning: block.warning ?? null,
          providerKey,
          sourceEventType: block.sourceEventType ?? null,
          sourceRawSegmentId: typeof block.sourceRawSegmentId === 'number' ? block.sourceRawSegmentId : null,
          payloadJson,
          createdAt: now,
          fingerprint,
        }
        const updateResult = this.updateReasoningDisplayBlockStmt.run(payload)
        if (updateResult.changes > 0) {
          updated++
          continue
        }
        const result = this.insertReasoningDisplayBlockStmt.run(payload)
        if (result.changes > 0) inserted++
        else ignored++
      }
    })
    txn()
    return { ok: true, received: blocks.length, inserted, updated, ignored }
  }

  finalizeReasoningDisplayBlocks(input: FinalizeReasoningDisplayBlocksInput) {
    const messageId = String(input.messageId ?? '').trim()
    if (!messageId) throw new Error('Missing messageId')

    const finalAt = Date.now()
    const result = this.finalizeReasoningDisplayBlocksStmt.run({ messageId, finalAt })
    return { ok: true, finalized: result.changes, finalAt }
  }

  listReasoningDisplayBlocksByMessageIds(input: ListReasoningDisplayBlocksByMessageIdsInput): ReasoningDisplayBlockRecord[] {
    const ids = Array.from(new Set(
      (Array.isArray(input.messageIds) ? input.messageIds : [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    ))
    if (ids.length === 0) return []
    return this.listReasoningDisplayBlocksStmt.all({ messageIdsJson: JSON.stringify(ids) }) as ReasoningDisplayBlockRecord[]
  }

  upsertProviderNativeContent(input: UpsertProviderNativeContentInput) {
    const messageId = String(input.messageId ?? '').trim()
    if (!messageId) throw new Error('Missing messageId')
    const snapshot = normalizeProviderNativeSnapshot(input.snapshot)
    const now = Date.now()
    const row = providerNativeSnapshotToRow(snapshot)
    this.upsertProviderNativeContentStmt.run({
      messageId,
      ...row,
      createdAt: now,
      updatedAt: now,
    })
    return { ok: true, status: snapshot.status }
  }

  listProviderNativeContentsByMessageIds(input: ListProviderNativeContentsByMessageIdsInput): ProviderNativeContentRecord[] {
    const ids = Array.from(new Set(
      (Array.isArray(input.messageIds) ? input.messageIds : [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean)
    ))
    if (ids.length === 0) return []
    const rows = this.listProviderNativeContentsStmt.all({ messageIdsJson: JSON.stringify(ids) }) as Array<{
      messageId: string
      providerKey: string
      sourceApi: string
      snapshotKey: string
      candidateIndex: number | null
      status: string
      contentJson: string
      role: string | null
      finishReason: string | null
      stopReason: string | null
      stopSequence: string | null
      usageJson: string | null
      model: string | null
      modelVersion: string | null
      createdAt: number
      updatedAt: number
    }>
    const out: ProviderNativeContentRecord[] = []
    for (const row of rows) {
      try {
        const snapshot = providerNativeRowToSnapshot(row)
        out.push({
          messageId: row.messageId,
          ...snapshot,
          createdAt: Number(row.createdAt),
          updatedAt: Number(row.updatedAt),
        })
      } catch {
        // Corrupt provider-native rows are diagnostic-only and must not enter continuation.
      }
    }
    return out
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
