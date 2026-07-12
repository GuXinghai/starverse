import type BetterSqlite3 from 'better-sqlite3'
import type { BuildContextForBranchResult, GetRenderableTurnsResult, RenderableTurn } from '../types'
import { BranchRepo, type BranchPathMessage } from './branchRepo'

type SqlDatabase = BetterSqlite3.Database

const safeParse = (input: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

const mergeMetaWithReasoning = (
  meta: Record<string, unknown> | null,
  reasoningJson: unknown,
  requestJson: unknown,
  annotationsJson?: unknown,
  reasoningDurationMs?: number | null,
  reasoningEndReason?: string | null,
  reasoningDurationIsFallback?: number | null,
) => {
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

  if (typeof annotationsJson === 'string' && annotationsJson.trim().length > 0) {
    try {
      const parsed = JSON.parse(annotationsJson)
      if (Array.isArray(parsed) && !next.annotations) {
        next.annotations = parsed
      }
    } catch {
      // ignore parse errors
    }
  }

  if (typeof reasoningDurationMs === 'number' && Number.isFinite(reasoningDurationMs)) {
    next.reasoningDurationMs = reasoningDurationMs
  } else if (reasoningDurationMs === null) {
    next.reasoningDurationMs = null
  }

  if (typeof reasoningEndReason === 'string' && reasoningEndReason.trim().length > 0) {
    next.reasoningEndReason = reasoningEndReason
  }

  if (reasoningDurationIsFallback === 1) {
    next.reasoningDurationIsFallback = true
  }

  return Object.keys(next).length > 0 ? next : null
}

export class ContextRepo {
  private selectAnswerGroupStmt: BetterSqlite3.Statement
  private listProviderNativeContentsStmt: BetterSqlite3.Statement

  constructor(
    private db: SqlDatabase,
    private branchRepo: BranchRepo
  ) {
    this.selectAnswerGroupStmt = this.db.prepare(`
      SELECT
        m.id,
        m.convo_id,
        m.role,
        m.seq,
        m.created_at,
        m.parent_id,
        m.status,
        m.answer_root_id,
        m.question_id,
        m.meta,
        m.annotations_json AS annotationsJson,
        m.reasoning_details_final_json AS reasoningDetailsFinalJson,
        m.request_reasoning_config_json AS requestReasoningConfigJson,
        m.reasoning_duration_ms AS reasoningDurationMs,
        m.reasoning_end_reason AS reasoningEndReason,
        m.reasoning_duration_is_fallback AS reasoningDurationIsFallback,
        b.body,
        COALESCE(route_choice.route_provenance_id, request_route.route_provenance_id) AS routeProvenanceId,
        route_choice.choice_index AS choiceIndex
      FROM message m
      LEFT JOIN message_body b ON b.message_id = m.id
      LEFT JOIN compatible_route_provenance request_route ON request_route.request_message_id = m.id
      LEFT JOIN compatible_route_choices route_choice ON route_choice.message_id = m.id
      WHERE m.answer_root_id = @answerRootId
        AND m.question_id = @questionId
        AND m.role IN ('assistant','tool')
      ORDER BY m.seq ASC
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
  }

  private attachProviderNativeContents<T extends { id: string; meta: unknown }>(messages: T[], messageIds: string[]): T[] {
    const ids = Array.from(new Set(messageIds.map((id) => String(id ?? '').trim()).filter(Boolean)))
    if (ids.length === 0) return messages
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
    const byMessageId = new Map<string, unknown[]>()
    for (const row of rows) {
      try {
        const content = JSON.parse(row.contentJson)
        const usage = row.usageJson ? JSON.parse(row.usageJson) : undefined
        const snapshot = {
          providerKey: row.providerKey,
          sourceApi: row.sourceApi,
          snapshotKey: row.snapshotKey,
          ...(typeof row.candidateIndex === 'number' ? { candidateIndex: row.candidateIndex } : {}),
          status: row.status,
          content,
          ...(row.role ? { role: row.role } : {}),
          ...(row.finishReason ? { finishReason: row.finishReason } : {}),
          ...(row.stopReason ? { stopReason: row.stopReason } : {}),
          ...(row.stopSequence !== null ? { stopSequence: row.stopSequence } : {}),
          ...(usage !== undefined && row.providerKey === 'google_ai_studio' ? { usageMetadata: usage } : {}),
          ...(usage !== undefined && row.providerKey === 'anthropic' ? { usage } : {}),
          ...(row.model ? { model: row.model } : {}),
          ...(row.modelVersion ? { modelVersion: row.modelVersion } : {}),
        }
        const existing = byMessageId.get(row.messageId) ?? []
        existing.push(snapshot)
        byMessageId.set(row.messageId, existing)
      } catch {
        // Ignore corrupt rows at context boundary.
      }
    }
    if (byMessageId.size === 0) return messages
    return messages.map((message) => {
      const providerNativeContents = byMessageId.get(message.id)
      if (!providerNativeContents || providerNativeContents.length === 0) return message
      const meta = message.meta && typeof message.meta === 'object' && !Array.isArray(message.meta)
        ? { ...(message.meta as Record<string, unknown>) }
        : {}
      meta.providerNativeContents = providerNativeContents
      return { ...message, meta } as T
    })
  }

  getRenderableTurns(branchId: string, params?: Readonly<{ limit?: number; debug?: boolean }>): GetRenderableTurnsResult {
    const bid = String(branchId ?? '').trim()
    if (!bid) throw new Error('Missing branchId')

    const limit = typeof params?.limit === 'number' && Number.isFinite(params.limit) ? params.limit : undefined
    const debug = !!params?.debug

    const path = this.branchRepo.getPathMessages(bid, limit ?? 5000)
    if (path.length === 0) {
      return {
        messages: [],
        turns: [],
        ...(debug
          ? { debug: { branchId: bid, excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
          : {}),
      }
    }

    const turns: RenderableTurn[] = []
    const chosenAnswerRootByQuestionId: Record<string, string> = {}
    const excludedQuestionIds: string[] = []

    const prefix: BranchPathMessage[] = []
    for (const m of path) {
      const role = String(m.role ?? '').trim()
      if (role === 'user') break
      if (m.questionId == null && m.answerRootId == null) prefix.push(m)
    }

    const includedIds: string[] = []
    const messages: BranchPathMessage[] = []

    for (const m of prefix) {
      messages.push(m)
      includedIds.push(m.id)
    }

    const questionsInPath = path.filter((m) => String(m.role ?? '').trim() === 'user')
    for (const q of questionsInPath) {
      const qid = q.id
      const chosen = this.branchRepo.ensureChoice(bid, qid)
      if (chosen) chosenAnswerRootByQuestionId[qid] = chosen

      const effective = this.branchRepo.getEffectiveFilters(bid, qid, chosen ?? '')
      if (effective.effectiveMode === 'exclude') excludedQuestionIds.push(qid)

      turns.push({
        questionId: qid,
        chosenAnswerRootId: chosen ?? null,
        questionMode: effective.questionMode,
        answerMode: effective.answerMode,
        effectiveMode: effective.effectiveMode,
        lockedByQuestionExclude: effective.lockedByQuestionExclude,
      })

      messages.push(q)
      includedIds.push(q.id)

      if (!chosen) continue
      const rows = this.selectAnswerGroupStmt.all({ answerRootId: chosen, questionId: qid }) as any[]
      for (const r of rows) {
        const meta = mergeMetaWithReasoning(
          r.meta ? safeParse(String(r.meta)) : null,
          r.reasoningDetailsFinalJson,
          r.requestReasoningConfigJson,
          r.annotationsJson,
          r.reasoningDurationMs ?? null,
          r.reasoningEndReason ?? null,
          r.reasoningDurationIsFallback ?? null,
        )

        const row: BranchPathMessage = {
          id: String(r.id),
          convoId: String(r.convo_id),
          role: String(r.role),
          seq: Number(r.seq),
          createdAt: Number(r.created_at),
          parentId: r.parent_id ? String(r.parent_id) : null,
          status: String(r.status ?? 'final'),
          answerRootId: r.answer_root_id ? String(r.answer_root_id) : null,
          questionId: r.question_id ? String(r.question_id) : null,
          body: typeof r.body === 'string' ? r.body : String(r.body ?? ''),
          meta,
          routeProvenanceId: r.routeProvenanceId ? String(r.routeProvenanceId) : null,
          choiceIndex: typeof r.choiceIndex === 'number' ? r.choiceIndex : null,
        }
        messages.push(row)
        includedIds.push(row.id)
      }
    }

    const outputMessages = messages.map((m) => ({
        id: m.id,
        convoId: m.convoId,
        role: m.role,
        seq: m.seq,
        createdAt: m.createdAt,
        parentId: m.parentId,
        status: m.status,
        answerRootId: m.answerRootId,
        questionId: m.questionId,
        body: m.body,
        meta: (m.meta as any) ?? null,
        routeProvenanceId: m.routeProvenanceId,
        choiceIndex: m.choiceIndex,
      }))

    return {
      messages: this.attachProviderNativeContents(outputMessages, includedIds),
      turns,
      ...(debug
        ? {
            debug: {
              branchId: bid,
              excludedQuestionIds,
              includedMessageIds: includedIds,
              chosenAnswerRootByQuestionId,
            },
          }
        : {}),
    }
  }

  buildForBranch(branchId: string, params?: Readonly<{ limit?: number; debug?: boolean }>): BuildContextForBranchResult {
    const bid = String(branchId ?? '').trim()
    if (!bid) throw new Error('Missing branchId')

    const limit = typeof params?.limit === 'number' && Number.isFinite(params.limit) ? params.limit : undefined
    const debug = !!params?.debug

    const path = this.branchRepo.getPathMessages(bid, limit ?? 5000)
    if (path.length === 0) {
      return {
        messages: [],
        ...(debug
          ? { debug: { branchId: bid, excludedQuestionIds: [], includedMessageIds: [], chosenAnswerRootByQuestionId: {} } }
          : {})
      }
    }

    const questionsInPath = path.filter((m) => String(m.role ?? '').trim() === 'user')
    const excludedQuestionIds = new Set<string>()
    const chosenAnswerRootByQuestionId: Record<string, string> = {}

    for (const q of questionsInPath) {
      const qid = q.id
      const chosen = this.branchRepo.ensureChoice(bid, qid)
      if (chosen) chosenAnswerRootByQuestionId[qid] = chosen
      const effective = this.branchRepo.getEffectiveFilters(bid, qid, chosen ?? '')
      if (effective.effectiveMode === 'exclude') excludedQuestionIds.add(qid)
    }

    const filtered: BranchPathMessage[] = []
    const includedIds: string[] = []

    for (const q of questionsInPath) {
      const qid = q.id
      if (excludedQuestionIds.has(qid)) continue

      filtered.push(q)
      includedIds.push(q.id)

      const chosen = chosenAnswerRootByQuestionId[qid]
      if (!chosen) continue

      const rows = this.selectAnswerGroupStmt.all({ answerRootId: chosen, questionId: qid }) as any[]
      for (const r of rows) {
        const meta = mergeMetaWithReasoning(
          r.meta ? safeParse(String(r.meta)) : null,
          r.reasoningDetailsFinalJson,
          r.requestReasoningConfigJson,
          r.annotationsJson,
          r.reasoningDurationMs ?? null,
          r.reasoningEndReason ?? null,
          r.reasoningDurationIsFallback ?? null,
        )

        const row: BranchPathMessage = {
          id: String(r.id),
          convoId: String(r.convo_id),
          role: String(r.role),
          seq: Number(r.seq),
          createdAt: Number(r.created_at),
          parentId: r.parent_id ? String(r.parent_id) : null,
          status: String(r.status ?? 'final'),
          answerRootId: r.answer_root_id ? String(r.answer_root_id) : null,
          questionId: r.question_id ? String(r.question_id) : null,
          body: typeof r.body === 'string' ? r.body : String(r.body ?? ''),
          meta,
          routeProvenanceId: r.routeProvenanceId ? String(r.routeProvenanceId) : null,
          choiceIndex: typeof r.choiceIndex === 'number' ? r.choiceIndex : null,
        }
        filtered.push(row)
        includedIds.push(row.id)
      }
    }

    const outputMessages = filtered.map((m) => ({
        id: m.id,
        convoId: m.convoId,
        role: m.role,
        seq: m.seq,
        createdAt: m.createdAt,
        parentId: m.parentId,
        status: m.status,
        answerRootId: m.answerRootId,
        questionId: m.questionId,
        body: m.body,
        meta: (m.meta as any) ?? null,
        routeProvenanceId: m.routeProvenanceId,
        choiceIndex: m.choiceIndex,
      }))

    return {
      messages: this.attachProviderNativeContents(outputMessages, includedIds),
      ...(debug
        ? {
            debug: {
              branchId: bid,
              excludedQuestionIds: [...excludedQuestionIds],
              includedMessageIds: includedIds,
              chosenAnswerRootByQuestionId,
            },
          }
        : {}),
    }
  }
}
