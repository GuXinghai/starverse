import BetterSqlite3 from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { BranchRecord, BranchCandidate, EffectiveFilterResult, QuestionCandidate } from '../types'
import { mergeMetaWithReasoning, safeParseMessageMeta } from './shared/messageMetaMerge'

type SqlDatabase = BetterSqlite3.Database

const mapBranchRow = (row: any): BranchRecord => ({
  id: String(row.id),
  convoId: String(row.convo_id),
  headMessageId: row.head_message_id ? String(row.head_message_id) : null,
  name: row.name ? String(row.name) : null,
  createdAt: Number(row.created_at),
  updatedAt: Number(row.updated_at),
  deletedAt: row.deleted_at === null || row.deleted_at === undefined ? null : Number(row.deleted_at),
})

export type BranchPathMessage = Readonly<{
  id: string
  convoId: string
  role: string
  seq: number
  createdAt: number
  parentId: string | null
  status: string
  answerRootId: string | null
  questionId: string | null
  body: string
  meta: Record<string, unknown> | null
}>

const mapPathRow = (row: any): BranchPathMessage => {
  const meta = row.meta ? safeParseMessageMeta(String(row.meta)) : null
  const mergedMeta = mergeMetaWithReasoning(
    meta,
    row.reasoningDetailsFinalJson,
    row.requestReasoningConfigJson,
    row.annotationsJson,
    row.reasoningDurationMs ?? null,
    row.reasoningEndReason ?? null,
    row.reasoningDurationIsFallback ?? null,
  )

  return {
    id: String(row.id),
    convoId: String(row.convo_id),
    role: String(row.role),
    seq: Number(row.seq),
    createdAt: Number(row.created_at),
    parentId: row.parent_id ? String(row.parent_id) : null,
    status: String(row.status ?? 'final'),
    answerRootId: row.answer_root_id ? String(row.answer_root_id) : null,
    questionId: row.question_id ? String(row.question_id) : null,
    body: typeof row.body === 'string' ? row.body : String(row.body ?? ''),
    meta: mergedMeta,
  }
}

export class BranchRepo {
  private findAliveBranchStmt: BetterSqlite3.Statement
  private insertBranchStmt: BetterSqlite3.Statement
  private softDeleteBranchStmt: BetterSqlite3.Statement
  private hasAnyBranchForConvoStmt: BetterSqlite3.Statement
  private listBranchStmt: BetterSqlite3.Statement
  private listBranchWithDeletedStmt: BetterSqlite3.Statement
  private getBranchStmt: BetterSqlite3.Statement
  private getBranchConvoStmt: BetterSqlite3.Statement
  private getAliveBranchConvoStmt: BetterSqlite3.Statement
  private isMessageInConvoStmt: BetterSqlite3.Statement
  private isUserMessageInConvoStmt: BetterSqlite3.Statement
  private isMessageOnBranchPathStmt: BetterSqlite3.Statement
  private copyChoicesFromAncestorChainStmt: BetterSqlite3.Statement
  private copyFiltersFromAncestorChainStmt: BetterSqlite3.Statement
  private isAnswerRootForQuestionStmt: BetterSqlite3.Statement
  private selectDeepestDescendantStmt: BetterSqlite3.Statement
  private getLastMessageIdStmt: BetterSqlite3.Statement
  private getPathMessagesStmt: BetterSqlite3.Statement
  private getCandidatesStmt: BetterSqlite3.Statement
  private getQuestionCandidatesStmt: BetterSqlite3.Statement
  private getQuestionFilterStmt: BetterSqlite3.Statement
  private getAnswerFilterStmt: BetterSqlite3.Statement
  private updateBranchHeadStmt: BetterSqlite3.Statement
  private upsertChoiceStmt: BetterSqlite3.Statement
  private upsertAnswerHideStmt: BetterSqlite3.Statement
  private upsertFilterStmt: BetterSqlite3.Statement
  private deleteFilterStmt: BetterSqlite3.Statement
  private findChoiceStmt: BetterSqlite3.Statement
  private findHeadAnswerRootStmt: BetterSqlite3.Statement
  private hasUserChildInAnswerGroupStmt: BetterSqlite3.Statement
  private selectDefaultAnswerRootFinalStmt: BetterSqlite3.Statement
  private selectDefaultAnswerRootAnyStmt: BetterSqlite3.Statement
  private getUserQuestionParentStmt: BetterSqlite3.Statement

  constructor(private db: SqlDatabase) {
    this.findAliveBranchStmt = this.db.prepare(`
      SELECT id, convo_id, head_message_id, name, created_at, updated_at, deleted_at
      FROM branch
      WHERE convo_id = @convoId AND deleted_at IS NULL
      ORDER BY updated_at DESC
      LIMIT 1
    `)

    this.insertBranchStmt = this.db.prepare(`
      INSERT INTO branch(id, convo_id, head_message_id, name, created_at, updated_at, deleted_at)
      VALUES (@id, @convoId, @headMessageId, @name, @createdAt, @updatedAt, NULL)
    `)

    this.hasAnyBranchForConvoStmt = this.db.prepare(`
      SELECT 1
      FROM branch
      WHERE convo_id = @convoId
      LIMIT 1
    `)

    this.softDeleteBranchStmt = this.db.prepare(`
      UPDATE branch
      SET deleted_at = @deletedAt,
          updated_at = @updatedAt
      WHERE id = @branchId AND deleted_at IS NULL
    `)

    this.listBranchStmt = this.db.prepare(`
      SELECT id, convo_id, head_message_id, name, created_at, updated_at, deleted_at
      FROM branch
      WHERE convo_id = @convoId AND deleted_at IS NULL
      ORDER BY updated_at DESC
    `)

    this.listBranchWithDeletedStmt = this.db.prepare(`
      SELECT id, convo_id, head_message_id, name, created_at, updated_at, deleted_at
      FROM branch
      WHERE convo_id = @convoId
      ORDER BY updated_at DESC
    `)

    this.getBranchStmt = this.db.prepare(`
      SELECT id, convo_id, head_message_id, name, created_at, updated_at, deleted_at
      FROM branch
      WHERE id = @branchId
      LIMIT 1
    `)

    this.getBranchConvoStmt = this.db.prepare(`SELECT convo_id AS convoId, head_message_id AS headMessageId FROM branch WHERE id=@branchId LIMIT 1`)
    this.getAliveBranchConvoStmt = this.db.prepare(
      `SELECT convo_id AS convoId, head_message_id AS headMessageId FROM branch WHERE id=@branchId AND deleted_at IS NULL LIMIT 1`
    )

    this.isMessageInConvoStmt = this.db.prepare(`
      SELECT 1
      FROM message
      WHERE id = @messageId AND convo_id = @convoId
      LIMIT 1
    `)

    this.isUserMessageInConvoStmt = this.db.prepare(`
      SELECT 1
      FROM message
      WHERE id = @messageId AND convo_id = @convoId AND role = 'user'
      LIMIT 1
    `)

    this.isMessageOnBranchPathStmt = this.db.prepare(`
      WITH RECURSIVE chain(id, parent_id, depth) AS (
        SELECT m.id, m.parent_id, 0 AS depth
        FROM message m
        WHERE m.id = @headId
        UNION ALL
        SELECT m.id, m.parent_id, c.depth + 1
        FROM message m
        JOIN chain c ON m.id = c.parent_id
        WHERE c.parent_id IS NOT NULL AND c.depth < @maxDepth
      )
      SELECT 1
      FROM chain
      WHERE id = @baseId
      LIMIT 1
    `)

    this.isAnswerRootForQuestionStmt = this.db.prepare(`
      SELECT 1
      FROM message
      WHERE id = @answerRootId
        AND convo_id = @convoId
        AND role = 'assistant'
        AND answer_root_id = id
        AND question_id = @questionId
      LIMIT 1
    `)

    // Given a root message, find the latest (max seq) descendant in the same conversation.
    // This lets switchCandidate/switchQuestionCandidate jump back into an existing continuation
    // under the selected answer root (instead of truncating to the answer group's tail).
    this.selectDeepestDescendantStmt = this.db.prepare(`
      WITH RECURSIVE descendants(id, seq, depth, role) AS (
        SELECT id, seq, 0, role
        FROM message
        WHERE convo_id = @convoId
          AND id = @rootId
        UNION ALL
        SELECT m.id, m.seq, d.depth + 1, m.role
        FROM message m
        JOIN descendants d ON m.parent_id = d.id
        WHERE m.convo_id = @convoId
          AND d.depth < @maxDepth
      )
      SELECT id, seq, depth
      FROM descendants
      WHERE role != 'tool'
      ORDER BY depth DESC, seq DESC
      LIMIT 1
    `)

    this.copyChoicesFromAncestorChainStmt = this.db.prepare(`
      WITH RECURSIVE chain(id, parent_id) AS (
        SELECT m.id, m.parent_id
        FROM message m
        WHERE m.id = @baseId
        UNION ALL
        SELECT m.id, m.parent_id
        FROM message m
        JOIN chain c ON m.id = c.parent_id
        WHERE c.parent_id IS NOT NULL
      ),
      questions AS (
        SELECT m.id AS questionId
        FROM chain c
        JOIN message m ON m.id = c.id
        WHERE m.role = 'user'
      )
      INSERT INTO branch_choice(branch_id, question_id, chosen_answer_root_id, updated_at)
      SELECT @newBranchId, bc.question_id, bc.chosen_answer_root_id, @now
      FROM branch_choice bc
      JOIN questions q ON q.questionId = bc.question_id
      WHERE bc.branch_id = @sourceBranchId
    `)

    this.copyFiltersFromAncestorChainStmt = this.db.prepare(`
      WITH RECURSIVE chain(id, parent_id) AS (
        SELECT m.id, m.parent_id
        FROM message m
        WHERE m.id = @baseId
        UNION ALL
        SELECT m.id, m.parent_id
        FROM message m
        JOIN chain c ON m.id = c.parent_id
        WHERE c.parent_id IS NOT NULL
      ),
      questions AS (
        SELECT m.id AS questionId
        FROM chain c
        JOIN message m ON m.id = c.id
        WHERE m.role = 'user'
      ),
      chosen AS (
        SELECT bc.chosen_answer_root_id AS answerRootId
        FROM branch_choice bc
        JOIN questions q ON q.questionId = bc.question_id
        WHERE bc.branch_id = @sourceBranchId
      )
      INSERT INTO branch_filter(branch_id, target_type, target_id, mode, updated_at)
      SELECT @newBranchId, bf.target_type, bf.target_id, bf.mode, @now
      FROM branch_filter bf
      WHERE bf.branch_id = @sourceBranchId
        AND (
          (bf.target_type = 'question' AND bf.target_id IN (SELECT questionId FROM questions))
          OR (bf.target_type = 'answer' AND bf.target_id IN (SELECT answerRootId FROM chosen))
        )
    `)

    this.getLastMessageIdStmt = this.db.prepare(`
      SELECT id
      FROM message
      WHERE convo_id = @convoId
      ORDER BY seq DESC
      LIMIT 1
    `)

    this.getPathMessagesStmt = this.db.prepare(`
      WITH RECURSIVE chain(id, parent_id, depth) AS (
        SELECT m.id, m.parent_id, 0 AS depth
        FROM message m
        WHERE m.id = @headId
        UNION ALL
        SELECT m.id, m.parent_id, c.depth + 1
        FROM message m
        JOIN chain c ON m.id = c.parent_id
        WHERE c.parent_id IS NOT NULL AND c.depth < @maxDepth
      )
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
        chain.depth
      FROM chain
      JOIN message m ON m.id = chain.id
      LEFT JOIN message_body b ON b.message_id = m.id
      ORDER BY chain.depth DESC
    `)

    this.getCandidatesStmt = this.db.prepare(`
      SELECT
        m.id AS answerRootId,
        m.created_at AS createdAt,
        m.status AS status
      FROM message m
      LEFT JOIN branch_answer_hide h
        ON h.branch_id = @branchId
       AND h.question_id = @questionId
       AND h.answer_root_id = m.id
       AND h.hidden = 1
      WHERE m.convo_id = @convoId
        AND m.role = 'assistant'
        AND m.question_id = @questionId
        AND m.answer_root_id = m.id
        AND h.answer_root_id IS NULL
      ORDER BY m.created_at DESC, m.seq DESC
      LIMIT @limit
    `)

    this.getQuestionCandidatesStmt = this.db.prepare(`
      SELECT
        m.id AS questionId,
        m.created_at AS createdAt,
        m.status AS status
      FROM message m
      LEFT JOIN branch_question_hide h
        ON h.branch_id = @branchId
       AND h.question_id = m.id
       AND h.hidden = 1
      WHERE m.convo_id = @convoId
        AND m.role = 'user'
        AND (
          (@baseMessageId IS NULL AND m.parent_id IS NULL)
          OR (m.parent_id = @baseMessageId)
        )
        AND h.question_id IS NULL
      ORDER BY m.created_at DESC, m.seq DESC
      LIMIT @limit
    `)

    this.getQuestionFilterStmt = this.db.prepare(`
      SELECT mode
      FROM branch_filter
      WHERE branch_id = @branchId AND target_type = 'question' AND target_id = @questionId
      LIMIT 1
    `)

    this.getAnswerFilterStmt = this.db.prepare(`
      SELECT mode
      FROM branch_filter
      WHERE branch_id = @branchId AND target_type = 'answer' AND target_id = @answerRootId
      LIMIT 1
    `)

    this.updateBranchHeadStmt = this.db.prepare(`
      UPDATE branch
      SET head_message_id = @headMessageId,
          updated_at = @updatedAt
      WHERE id = @branchId AND deleted_at IS NULL
    `)

    this.upsertChoiceStmt = this.db.prepare(`
      INSERT INTO branch_choice(branch_id, question_id, chosen_answer_root_id, updated_at)
      VALUES (@branchId, @questionId, @chosenAnswerRootId, @updatedAt)
      ON CONFLICT(branch_id, question_id)
      DO UPDATE SET
        chosen_answer_root_id = excluded.chosen_answer_root_id,
        updated_at = excluded.updated_at
    `)

    this.upsertAnswerHideStmt = this.db.prepare(`
      INSERT INTO branch_answer_hide(branch_id, question_id, answer_root_id, hidden, updated_at)
      VALUES (@branchId, @questionId, @answerRootId, @hidden, @updatedAt)
      ON CONFLICT(branch_id, question_id, answer_root_id)
      DO UPDATE SET
        hidden = excluded.hidden,
        updated_at = excluded.updated_at
    `)

    this.upsertFilterStmt = this.db.prepare(`
      INSERT INTO branch_filter(branch_id, target_type, target_id, mode, updated_at)
      VALUES (@branchId, @targetType, @targetId, @mode, @updatedAt)
      ON CONFLICT(branch_id, target_type, target_id)
      DO UPDATE SET
        mode = excluded.mode,
        updated_at = excluded.updated_at
    `)

    this.deleteFilterStmt = this.db.prepare(`
      DELETE FROM branch_filter
      WHERE branch_id = @branchId AND target_type = @targetType AND target_id = @targetId
    `)

    this.findChoiceStmt = this.db.prepare(`
      SELECT chosen_answer_root_id AS chosenAnswerRootId
      FROM branch_choice
      WHERE branch_id = @branchId AND question_id = @questionId
      LIMIT 1
    `)

    this.findHeadAnswerRootStmt = this.db.prepare(`
      SELECT m.answer_root_id AS answerRootId
      FROM branch b
      JOIN message m ON m.id = b.head_message_id
      WHERE b.id = @branchId AND b.deleted_at IS NULL
      LIMIT 1
    `)

    this.hasUserChildInAnswerGroupStmt = this.db.prepare(`
      SELECT 1
      FROM message u
      WHERE u.role = 'user'
        AND u.parent_id IN (SELECT id FROM message WHERE answer_root_id = @answerRootId)
      LIMIT 1
    `)

    this.selectDefaultAnswerRootFinalStmt = this.db.prepare(`
      SELECT m.id AS answerRootId
      FROM message m
      LEFT JOIN branch_answer_hide h
        ON h.branch_id = @branchId
       AND h.question_id = @questionId
       AND h.answer_root_id = m.id
       AND h.hidden = 1
      WHERE m.convo_id = @convoId
        AND m.role = 'assistant'
        AND m.question_id = @questionId
        AND m.answer_root_id = m.id
        AND m.status = 'final'
        AND h.answer_root_id IS NULL
      ORDER BY m.created_at DESC, m.seq DESC
      LIMIT 1
    `)

    this.selectDefaultAnswerRootAnyStmt = this.db.prepare(`
      SELECT m.id AS answerRootId
      FROM message m
      LEFT JOIN branch_answer_hide h
        ON h.branch_id = @branchId
       AND h.question_id = @questionId
       AND h.answer_root_id = m.id
       AND h.hidden = 1
      WHERE m.convo_id = @convoId
        AND m.role = 'assistant'
        AND m.question_id = @questionId
        AND m.answer_root_id = m.id
        AND h.answer_root_id IS NULL
      ORDER BY m.created_at DESC, m.seq DESC
      LIMIT 1
    `)

    this.getUserQuestionParentStmt = this.db.prepare(`
      SELECT parent_id AS parentId
      FROM message
      WHERE id = @questionId
        AND convo_id = @convoId
        AND role = 'user'
      LIMIT 1
    `)
  }

  ensureDefault(convoId: string, name?: string | null): BranchRecord {
    const cid = String(convoId ?? '').trim()
    if (!cid) throw new Error('Missing convoId')

    const existing = this.findAliveBranchStmt.get({ convoId: cid }) as any
    if (existing) return mapBranchRow(existing)

    const now = Date.now()
    const id = randomUUID()
    const headRow = this.getLastMessageIdStmt.get({ convoId: cid }) as { id?: string } | undefined
    const headMessageId = headRow?.id ? String(headRow.id) : null

    this.insertBranchStmt.run({
      id,
      convoId: cid,
      headMessageId,
      name: name ?? 'Main',
      createdAt: now,
      updatedAt: now,
    })

    return {
      id,
      convoId: cid,
      headMessageId,
      name: (name ?? 'Main') as string,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
  }

  hasAnyBranchForConvo(convoId: string): boolean {
    const cid = String(convoId ?? '').trim()
    if (!cid) return false
    return !!this.hasAnyBranchForConvoStmt.get({ convoId: cid })
  }

  switchCandidate(branchId: string, questionId: string, answerRootId: string) {
    const bid = String(branchId ?? '').trim()
    const qid = String(questionId ?? '').trim()
    const ar = String(answerRootId ?? '').trim()
    if (!bid || !qid || !ar) throw new Error('Missing branchId/questionId/answerRootId')

    const alive = this.getAliveBranchConvoStmt.get({ branchId: bid }) as { convoId?: string } | undefined
    const convoId = alive?.convoId ? String(alive.convoId) : ''
    if (!convoId) throw new Error(`Branch not found or deleted: ${bid}`)

    const qExists = this.isUserMessageInConvoStmt.get({ messageId: qid, convoId }) as any
    if (!qExists) throw new Error(`Question not found in conversation: ${qid}`)

    const aExists = this.isAnswerRootForQuestionStmt.get({ answerRootId: ar, convoId, questionId: qid }) as any
    if (!aExists) throw new Error(`Answer root does not belong to question: ${ar}`)

    // Prefer restoring an existing continuation under this answer root (deepest descendant in parent chain).
    // Tools are excluded so we don't accidentally move the branch head to a tool sibling and hide follow-up turns.
    const leafRow = this.selectDeepestDescendantStmt.get({ convoId, rootId: ar, maxDepth: 5000 }) as
      | { id?: string; seq?: number; depth?: number }
      | undefined
    const headMessageId = leafRow?.id ? String(leafRow.id) : ar

    const now = Date.now()
    const txn = this.db.transaction(() => {
      this.upsertChoiceStmt.run({ branchId: bid, questionId: qid, chosenAnswerRootId: ar, updatedAt: now })
      const r = this.updateBranchHeadStmt.run({ branchId: bid, headMessageId, updatedAt: now })
      if (!r.changes || r.changes <= 0) throw new Error(`Branch not found or deleted: ${bid}`)
    })
    txn()

    return { ok: true, headMessageId }
  }

  switchQuestionCandidate(branchId: string, baseMessageId: string | null, questionId: string) {
    const bid = String(branchId ?? '').trim()
    const qid = String(questionId ?? '').trim()
    const base = baseMessageId === null ? null : String(baseMessageId ?? '').trim() || null
    if (!bid || !qid) throw new Error('Missing branchId/questionId')

    const alive = this.getAliveBranchConvoStmt.get({ branchId: bid }) as { convoId?: string } | undefined
    const convoId = alive?.convoId ? String(alive.convoId) : ''
    if (!convoId) throw new Error(`Branch not found or deleted: ${bid}`)

    const qRow = this.getUserQuestionParentStmt.get({ convoId, questionId: qid }) as { parentId?: string | null } | undefined
    if (!qRow) throw new Error(`Question not found in conversation: ${qid}`)
    const actualParentId = qRow.parentId ? String(qRow.parentId) : null

    if (base === null) {
      if (actualParentId !== null) throw new Error('Question does not belong to root slot')
    } else {
      if (actualParentId !== base) throw new Error('Question does not belong to base message slot')
    }

    const now = Date.now()
    const txn = this.db.transaction(() => {
      const existing = this.findChoiceStmt.get({ branchId: bid, questionId: qid }) as { chosenAnswerRootId?: string } | undefined
      const chosen = existing?.chosenAnswerRootId ? String(existing.chosenAnswerRootId) : this.ensureChoice(bid, qid)

      if (chosen) {
        const leafRow = this.selectDeepestDescendantStmt.get({ convoId, rootId: chosen, maxDepth: 5000 }) as
          | { id?: string; seq?: number; depth?: number }
          | undefined
        const headMessageId = leafRow?.id ? String(leafRow.id) : chosen
        const r = this.updateBranchHeadStmt.run({ branchId: bid, headMessageId, updatedAt: now })
        if (!r.changes || r.changes <= 0) throw new Error(`Branch not found or deleted: ${bid}`)
        return { ok: true as const, headMessageId }
      }

      const r = this.updateBranchHeadStmt.run({ branchId: bid, headMessageId: qid, updatedAt: now })
      if (!r.changes || r.changes <= 0) throw new Error(`Branch not found or deleted: ${bid}`)
      return { ok: true as const, headMessageId: qid }
    })

    return txn()
  }

  computePreferredHeadForAnswerRoot(convoId: string, answerRootId: string): string {
    const cid = String(convoId ?? '').trim()
    const rootId = String(answerRootId ?? '').trim()
    if (!cid || !rootId) return rootId
    const row = this.selectDeepestDescendantStmt.get({ convoId: cid, rootId, maxDepth: 5000 }) as
      | { id?: string; seq?: number; depth?: number }
      | undefined
    return row?.id ? String(row.id) : rootId
  }

  createFromMessage(input: Readonly<{ sourceBranchId: string; baseMessageId: string; name?: string | null; copyChoices?: boolean; copyFilters?: boolean; requireOnSourcePath?: boolean }>): BranchRecord {
    const sourceBranchId = String(input.sourceBranchId ?? '').trim()
    const baseMessageId = String(input.baseMessageId ?? '').trim()
    if (!sourceBranchId || !baseMessageId) throw new Error('Missing sourceBranchId/baseMessageId')

    const source = this.getAliveBranchConvoStmt.get({ branchId: sourceBranchId }) as { convoId?: string; headMessageId?: string | null } | undefined
    const convoId = source?.convoId ? String(source.convoId) : ''
    if (!convoId) throw new Error(`Branch not found or deleted: ${sourceBranchId}`)

    const baseExists = this.isMessageInConvoStmt.get({ messageId: baseMessageId, convoId }) as any
    if (!baseExists) throw new Error(`Base message not found in conversation: ${baseMessageId}`)

    const requireOnSourcePath = input.requireOnSourcePath !== false
    if (requireOnSourcePath) {
      const headId = source?.headMessageId ? String(source.headMessageId) : ''
      if (!headId) throw new Error(`Cannot fork: source branch has no head: ${sourceBranchId}`)
      const onPath = this.isMessageOnBranchPathStmt.get({ headId, baseId: baseMessageId, maxDepth: 5000 }) as any
      if (!onPath) throw new Error(`Cannot fork: base message is not on source branch path: ${baseMessageId}`)
    }

    const now = Date.now()
    const id = randomUUID()
    const copyChoices = input.copyChoices !== false
    const copyFilters = input.copyFilters !== false
    const nameRaw = input.name === undefined ? null : input.name
    const fallbackName = `Fork ${now}`
    const branchName = nameRaw === null ? fallbackName : String(nameRaw ?? '').trim() || fallbackName

    const txn = this.db.transaction(() => {
      this.insertBranchStmt.run({
        id,
        convoId,
        headMessageId: baseMessageId,
        name: branchName,
        createdAt: now,
        updatedAt: now,
      })

      if (copyChoices) {
        this.copyChoicesFromAncestorChainStmt.run({ sourceBranchId, newBranchId: id, baseId: baseMessageId, now })
      }

      if (copyFilters) {
        this.copyFiltersFromAncestorChainStmt.run({ sourceBranchId, newBranchId: id, baseId: baseMessageId, now })
      }
    })

    txn()

    return {
      id,
      convoId,
      headMessageId: baseMessageId,
      name: branchName,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
  }

  delete(branchId: string) {
    const bid = String(branchId ?? '').trim()
    if (!bid) throw new Error('Missing branchId')
    const now = Date.now()
    const r = this.softDeleteBranchStmt.run({ branchId: bid, deletedAt: now, updatedAt: now })
    if (!r.changes || r.changes <= 0) throw new Error(`Branch not found or already deleted: ${bid}`)
    return { ok: true }
  }

  list(convoId: string, includeDeleted = false): BranchRecord[] {
    const cid = String(convoId ?? '').trim()
    if (!cid) return []
    const stmt = includeDeleted ? this.listBranchWithDeletedStmt : this.listBranchStmt
    return (stmt.all({ convoId: cid }) as any[]).map(mapBranchRow)
  }

  get(branchId: string): BranchRecord | null {
    const id = String(branchId ?? '').trim()
    if (!id) return null
    const row = this.getBranchStmt.get({ branchId: id }) as any
    return row ? mapBranchRow(row) : null
  }

  getPathMessages(branchId: string, limit = 5000): BranchPathMessage[] {
    const id = String(branchId ?? '').trim()
    if (!id) return []
    const branchRow = this.getBranchConvoStmt.get({ branchId: id }) as { convoId?: string; headMessageId?: string | null } | undefined
    if (!branchRow?.headMessageId) return []
    const rows = this.getPathMessagesStmt.all({
      headId: String(branchRow.headMessageId),
      maxDepth: Math.max(1, Math.min(5000, Number(limit) || 5000)),
    }) as any[]
    return rows.map(mapPathRow)
  }

  getCandidates(branchId: string, questionId: string, limit = 50): BranchCandidate[] {
    const bid = String(branchId ?? '').trim()
    const qid = String(questionId ?? '').trim()
    if (!bid || !qid) return []
    const branchRow = this.getBranchConvoStmt.get({ branchId: bid }) as { convoId?: string } | undefined
    const convoId = branchRow?.convoId ? String(branchRow.convoId) : ''
    if (!convoId) return []

    const rows = this.getCandidatesStmt.all({
      branchId: bid,
      convoId,
      questionId: qid,
      limit: Math.max(1, Math.min(200, Number(limit) || 50)),
    }) as any[]

    return rows.map((r) => ({
      answerRootId: String(r.answerRootId),
      createdAt: Number(r.createdAt),
      status: String(r.status ?? 'final'),
    }))
  }

  getQuestionCandidates(branchId: string, baseMessageId: string | null, limit = 50): QuestionCandidate[] {
    const bid = String(branchId ?? '').trim()
    const base = baseMessageId === null ? null : String(baseMessageId ?? '').trim() || null
    if (!bid) return []

    const branchRow = this.getBranchConvoStmt.get({ branchId: bid }) as { convoId?: string } | undefined
    const convoId = branchRow?.convoId ? String(branchRow.convoId) : ''
    if (!convoId) return []

    const rows = this.getQuestionCandidatesStmt.all({
      branchId: bid,
      convoId,
      baseMessageId: base,
      limit: Math.max(1, Math.min(200, Number(limit) || 50)),
    }) as any[]

    return rows
      .map((r) => {
        const questionId = String(r?.questionId ?? '').trim()
        if (!questionId) return null
        return { questionId, createdAt: Number(r?.createdAt ?? 0), status: String(r?.status ?? 'final') } satisfies QuestionCandidate
      })
      .filter((x): x is QuestionCandidate => !!x)
  }

  getEffectiveFilters(branchId: string, questionId: string, chosenAnswerRootId: string): EffectiveFilterResult {
    const bid = String(branchId ?? '').trim()
    const qid = String(questionId ?? '').trim()
    const aid = String(chosenAnswerRootId ?? '').trim()
    if (!bid || !qid || !aid) {
      return { questionMode: 'include', answerMode: 'include', effectiveMode: 'include', lockedByQuestionExclude: false }
    }

    const qRow = this.getQuestionFilterStmt.get({ branchId: bid, questionId: qid }) as { mode?: 'include' | 'exclude' } | undefined
    const questionMode: 'include' | 'exclude' = qRow?.mode === 'exclude' ? 'exclude' : 'include'

    const aRow = this.getAnswerFilterStmt.get({ branchId: bid, answerRootId: aid }) as { mode?: 'include' | 'exclude' } | undefined
    const answerMode: 'include' | 'exclude' = aRow?.mode === 'exclude' ? 'exclude' : 'include'

    if (questionMode === 'exclude') {
      return {
        questionMode,
        answerMode,
        effectiveMode: 'exclude',
        lockedByQuestionExclude: true,
      }
    }

    return {
      questionMode,
      answerMode,
      effectiveMode: answerMode,
      lockedByQuestionExclude: false,
    }
  }

  setHead(branchId: string, headMessageId: string | null) {
    const bid = String(branchId ?? '').trim()
    if (!bid) throw new Error('Missing branchId')
    const hid = headMessageId === null ? null : String(headMessageId ?? '').trim()
    const now = Date.now()

    const r = this.updateBranchHeadStmt.run({ branchId: bid, headMessageId: hid && hid.length > 0 ? hid : null, updatedAt: now })
    if (!r.changes || r.changes <= 0) throw new Error(`Branch not found or deleted: ${bid}`)
    return { ok: true }
  }

  setChoice(branchId: string, questionId: string, chosenAnswerRootId: string) {
    const bid = String(branchId ?? '').trim()
    const qid = String(questionId ?? '').trim()
    const aid = String(chosenAnswerRootId ?? '').trim()
    if (!bid || !qid || !aid) throw new Error('Missing branchId/questionId/chosenAnswerRootId')

    const alive = this.getAliveBranchConvoStmt.get({ branchId: bid }) as { convoId?: string } | undefined
    if (!alive?.convoId) throw new Error(`Branch not found or deleted: ${bid}`)

    const now = Date.now()
    const txn = this.db.transaction(() => {
      this.upsertChoiceStmt.run({ branchId: bid, questionId: qid, chosenAnswerRootId: aid, updatedAt: now })
    })
    txn()
    return { ok: true }
  }

  setAnswerHide(branchId: string, questionId: string, answerRootId: string, hidden: boolean) {
    const bid = String(branchId ?? '').trim()
    const qid = String(questionId ?? '').trim()
    const aid = String(answerRootId ?? '').trim()
    if (!bid || !qid || !aid) throw new Error('Missing branchId/questionId/answerRootId')

    const alive = this.getAliveBranchConvoStmt.get({ branchId: bid }) as { convoId?: string } | undefined
    if (!alive?.convoId) throw new Error(`Branch not found or deleted: ${bid}`)

    const now = Date.now()
    const txn = this.db.transaction(() => {
      this.upsertAnswerHideStmt.run({ branchId: bid, questionId: qid, answerRootId: aid, hidden: hidden ? 1 : 0, updatedAt: now })
    })
    txn()
    return { ok: true }
  }

  setFilter(branchId: string, targetType: 'question' | 'answer', targetId: string, mode: 'include' | 'exclude') {
    const bid = String(branchId ?? '').trim()
    const tid = String(targetId ?? '').trim()
    if (!bid || !tid) throw new Error('Missing branchId/targetId')
    if (targetType !== 'question' && targetType !== 'answer') throw new Error('Invalid targetType')
    if (mode !== 'include' && mode !== 'exclude') throw new Error('Invalid mode')

    const alive = this.getAliveBranchConvoStmt.get({ branchId: bid }) as { convoId?: string } | undefined
    if (!alive?.convoId) throw new Error(`Branch not found or deleted: ${bid}`)

    const now = Date.now()
    const txn = this.db.transaction(() => {
      this.upsertFilterStmt.run({ branchId: bid, targetType, targetId: tid, mode, updatedAt: now })
    })
    txn()
    return { ok: true }
  }

  clearFilter(branchId: string, targetType: 'question' | 'answer', targetId: string) {
    const bid = String(branchId ?? '').trim()
    const tid = String(targetId ?? '').trim()
    if (!bid || !tid) throw new Error('Missing branchId/targetId')
    if (targetType !== 'question' && targetType !== 'answer') throw new Error('Invalid targetType')

    const alive = this.getAliveBranchConvoStmt.get({ branchId: bid }) as { convoId?: string } | undefined
    if (!alive?.convoId) throw new Error(`Branch not found or deleted: ${bid}`)

    const txn = this.db.transaction(() => {
      this.deleteFilterStmt.run({ branchId: bid, targetType, targetId: tid })
    })
    txn()
    return { ok: true }
  }

  ensureChoice(branchId: string, questionId: string): string | null {
    const bid = String(branchId ?? '').trim()
    const qid = String(questionId ?? '').trim()
    if (!bid || !qid) return null

    const alive = this.getAliveBranchConvoStmt.get({ branchId: bid }) as { convoId?: string } | undefined
    const convoId = alive?.convoId ? String(alive.convoId) : ''
    if (!convoId) throw new Error(`Branch not found or deleted: ${bid}`)

    const existing = this.findChoiceStmt.get({ branchId: bid, questionId: qid }) as { chosenAnswerRootId?: string } | undefined
    if (existing?.chosenAnswerRootId) return String(existing.chosenAnswerRootId)

    const finalRow = this.selectDefaultAnswerRootFinalStmt.get({ branchId: bid, convoId, questionId: qid }) as { answerRootId?: string } | undefined
    const anyRow =
      finalRow?.answerRootId ? undefined : ((this.selectDefaultAnswerRootAnyStmt.get({ branchId: bid, convoId, questionId: qid }) as any) ?? undefined)
    const chosen = (finalRow?.answerRootId ?? anyRow?.answerRootId) ? String(finalRow?.answerRootId ?? anyRow?.answerRootId) : null
    if (!chosen) return null

    const now = Date.now()
    this.upsertChoiceStmt.run({ branchId: bid, questionId: qid, chosenAnswerRootId: chosen, updatedAt: now })
    return chosen
  }

  canRetryReplace(branchId: string, questionId: string, currentAnswerRootId: string): Readonly<{ ok: true }> {
    const bid = String(branchId ?? '').trim()
    const qid = String(questionId ?? '').trim()
    const ar = String(currentAnswerRootId ?? '').trim()
    if (!bid || !qid || !ar) throw new Error('Missing branchId/questionId/currentAnswerRootId')

    const choice = this.findChoiceStmt.get({ branchId: bid, questionId: qid }) as { chosenAnswerRootId?: string } | undefined
    if (!choice?.chosenAnswerRootId || String(choice.chosenAnswerRootId) !== ar) {
      throw new Error('RetryReplace not allowed: branch_choice mismatch')
    }

    const head = this.findHeadAnswerRootStmt.get({ branchId: bid }) as { answerRootId?: string | null } | undefined
    if (!head?.answerRootId || String(head.answerRootId) !== ar) {
      throw new Error('RetryReplace not allowed: branch head not within answer group')
    }

    const hasChild = this.hasUserChildInAnswerGroupStmt.get({ answerRootId: ar }) as any
    if (hasChild) {
      throw new Error('RetryReplace not allowed: answer group has follow-up user messages')
    }

    return { ok: true }
  }
}
