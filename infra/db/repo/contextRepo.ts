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
        b.body
      FROM message m
      LEFT JOIN message_body b ON b.message_id = m.id
      WHERE m.answer_root_id = @answerRootId
        AND m.question_id = @questionId
        AND m.role IN ('assistant','tool')
      ORDER BY m.seq ASC
    `)
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
        }
        messages.push(row)
        includedIds.push(row.id)
      }
    }

    return {
      messages: messages.map((m) => ({
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
      })),
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
        }
        filtered.push(row)
        includedIds.push(row.id)
      }
    }

    return {
      messages: filtered.map((m) => ({
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
      })),
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
