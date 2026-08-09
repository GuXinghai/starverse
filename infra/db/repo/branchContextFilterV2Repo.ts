import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Identity } from '../../../src/next/generation-v2/domain/conversationGraphV2'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

export class BranchContextFilterV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CONTEXT_FILTER_INPUT_INVALID'
    | 'GENERATION_V2_CONTEXT_FILTER_BRANCH_NOT_FOUND'
    | 'GENERATION_V2_CONTEXT_FILTER_TARGET_INVALID') {
    super(code)
    this.name = 'BranchContextFilterV2RepoError'
  }
}

export type BranchContextFilterModeV2 = 'include' | 'exclude'
export type BranchTurnContextFilterV2 = Readonly<{
  questionMode: BranchContextFilterModeV2
  answerMode: BranchContextFilterModeV2
  effectiveMode: BranchContextFilterModeV2
  lockedByQuestionExclude: boolean
}>

const include = Object.freeze({ questionMode: 'include' as const, answerMode: 'include' as const,
  effectiveMode: 'include' as const, lockedByQuestionExclude: false })

function invalid(code: BranchContextFilterV2RepoError['code']): never {
  throw new BranchContextFilterV2RepoError(code)
}
function mode(value: unknown): BranchContextFilterModeV2 {
  if (value === 'include' || value === 'exclude') return value
  return invalid('GENERATION_V2_CONTEXT_FILTER_INPUT_INVALID')
}

export class BranchContextFilterV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) invalid('GENERATION_V2_CONTEXT_FILTER_TARGET_INVALID')
  }

  readForTurns(branchIdValue: string, turns: readonly Readonly<{ questionId: string; chosenAnswerRootId: string }>[]): ReadonlyMap<string, BranchTurnContextFilterV2> {
    const branchId = ConversationGraphV2Identity.create('branch_id', branchIdValue).value
    if (turns.length === 0) return new Map()
    const branch = this.db.prepare(`SELECT 1 AS present FROM branch_v2 WHERE branch_id=? AND deleted_at_ms IS NULL`).get(branchId) as { present?: unknown } | undefined
    if (branch?.present !== 1) invalid('GENERATION_V2_CONTEXT_FILTER_BRANCH_NOT_FOUND')
    const entries = new Map<string, BranchTurnContextFilterV2>()
    const questionModes = new Map<string, BranchContextFilterModeV2>()
    const answerModes = new Map<string, BranchContextFilterModeV2>()
    const rows = this.db.prepare(`SELECT target_type AS targetType,target_id AS targetId,mode
      FROM branch_context_filter_v2 WHERE branch_id=?`).all(branchId) as readonly Readonly<Record<string, unknown>>[]
    for (const row of rows) {
      if (typeof row.targetId !== 'string' || (row.targetType !== 'question' && row.targetType !== 'answer') ||
          (row.mode !== 'include' && row.mode !== 'exclude')) invalid('GENERATION_V2_CONTEXT_FILTER_TARGET_INVALID')
      if (row.targetType === 'question') questionModes.set(row.targetId, row.mode)
      else answerModes.set(row.targetId, row.mode)
    }
    for (const turn of turns) {
      const questionMode = questionModes.get(turn.questionId) ?? 'include'
      const answerMode = answerModes.get(turn.chosenAnswerRootId) ?? 'include'
      entries.set(turn.questionId, questionMode === 'exclude'
        ? Object.freeze({ questionMode, answerMode, effectiveMode: 'exclude' as const, lockedByQuestionExclude: true })
        : Object.freeze({ questionMode, answerMode, effectiveMode: answerMode, lockedByQuestionExclude: false }))
    }
    return entries
  }

  set(
    context: GenerationV2AuthorityTransactionContextV2,
    input: Readonly<{ branchId: string; targetType: 'question' | 'answer'; targetId: string; mode: BranchContextFilterModeV2; updatedAtMs: number }>,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const branchId = ConversationGraphV2Identity.create('branch_id', input.branchId).value
    const targetId = ConversationGraphV2Identity.create(input.targetType === 'question' ? 'question_id' : 'answer_root_id', input.targetId).value
    const selectedMode = mode(input.mode)
    if (!Number.isSafeInteger(input.updatedAtMs) || input.updatedAtMs < 0) invalid('GENERATION_V2_CONTEXT_FILTER_INPUT_INVALID')
    const branch = this.db.prepare(`SELECT conversation_id AS conversationId FROM branch_v2 WHERE branch_id=? AND deleted_at_ms IS NULL`).get(branchId) as { conversationId?: unknown } | undefined
    if (typeof branch?.conversationId !== 'string') invalid('GENERATION_V2_CONTEXT_FILTER_BRANCH_NOT_FOUND')
    try {
      this.db.prepare(`INSERT INTO branch_context_filter_v2(branch_id,conversation_id,target_type,target_id,mode,updated_at_ms)
        VALUES(?,?,?,?,?,?) ON CONFLICT(branch_id,target_type,target_id) DO UPDATE SET mode=excluded.mode,updated_at_ms=excluded.updated_at_ms`).run(
        branchId, branch.conversationId, input.targetType, targetId, selectedMode, input.updatedAtMs,
      )
    } catch (error) {
      if (error instanceof Error && error.message.includes('GENERATION_V2_CONTEXT_FILTER_')) invalid('GENERATION_V2_CONTEXT_FILTER_TARGET_INVALID')
      throw error
    }
  }

  clear(
    context: GenerationV2AuthorityTransactionContextV2,
    input: Readonly<{ branchId: string; targetType: 'question' | 'answer'; targetId: string }>,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const branchId = ConversationGraphV2Identity.create('branch_id', input.branchId).value
    const targetId = ConversationGraphV2Identity.create(input.targetType === 'question' ? 'question_id' : 'answer_root_id', input.targetId).value
    const exists = this.db.prepare(`SELECT 1 AS present FROM branch_v2 WHERE branch_id=? AND deleted_at_ms IS NULL`).get(branchId) as { present?: unknown } | undefined
    if (exists?.present !== 1) invalid('GENERATION_V2_CONTEXT_FILTER_BRANCH_NOT_FOUND')
    this.db.prepare(`DELETE FROM branch_context_filter_v2 WHERE branch_id=? AND target_type=? AND target_id=?`).run(
      branchId, input.targetType, targetId,
    )
  }
}

export function defaultBranchTurnContextFilterV2(): BranchTurnContextFilterV2 { return include }
