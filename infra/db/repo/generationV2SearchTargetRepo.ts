import type BetterSqlite3 from 'better-sqlite3'
import { BranchRouteResolverV2, BranchRouteResolverV2Error } from './branchRouteResolverV2'
import { ConversationReadV2Repo, ConversationReadV2RepoError, type ConversationBranchViewV2 } from './conversationReadV2Repo'

export type GenerationV2SearchTargetUnavailableReason =
  | 'message_missing' | 'message_unsupported' | 'conversation_hidden'
  | 'no_visible_route' | 'projection_unavailable'
export type GenerationV2SearchTargetResult = Readonly<{
  status: 'ready'
  projectId: string
  conversationId: string
  branchId: string
  messageId: string
  view: ConversationBranchViewV2
}> | Readonly<{ status: 'unavailable'; reason: GenerationV2SearchTargetUnavailableReason }>

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && value.trim() === value
}
function unavailable(reason: GenerationV2SearchTargetUnavailableReason): GenerationV2SearchTargetResult {
  return Object.freeze({ status: 'unavailable', reason })
}

/** Reads current graph authority and the exact bounded transcript projection in one read snapshot. */
export class GenerationV2SearchTargetRepo {
  constructor(private readonly db: BetterSqlite3.Database) {}

  read(input: Readonly<{ messageId: string; preferredBranchId: string | null; limit: number }>): GenerationV2SearchTargetResult {
    if (!identifier(input.messageId) || (input.preferredBranchId !== null && !identifier(input.preferredBranchId)) ||
        !Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 50) {
      throw new Error('GENERATION_V2_SEARCH_TARGET_INPUT_INVALID')
    }
    return this.db.transaction(() => this.readSnapshot(input)).deferred()
  }

  private readSnapshot(input: Readonly<{ messageId: string; preferredBranchId: string | null; limit: number }>): GenerationV2SearchTargetResult {
    const target = this.db.prepare(`SELECT message.role, message.answer_root_id AS answerRootId,
      conversation.conversation_id AS conversationId, conversation.project_id AS projectId,
      EXISTS(SELECT 1 FROM system_chat_template_v2 AS template
        WHERE template.conversation_id=conversation.conversation_id) AS hidden
      FROM message_v2 AS message JOIN conversation_v2 AS conversation
        ON conversation.conversation_id=message.conversation_id
      WHERE message.message_id=?`).get(input.messageId) as
      { role: string; answerRootId: string | null; conversationId: string; projectId: string; hidden: number } | undefined
    if (!target) return unavailable('message_missing')
    if (target.hidden !== 0) return unavailable('conversation_hidden')
    if (target.role !== 'user' && (target.role !== 'assistant' || target.answerRootId !== input.messageId)) {
      return unavailable('message_unsupported')
    }
    const branches = this.db.prepare(`SELECT branch_id AS branchId FROM branch_v2
      WHERE conversation_id=? AND deleted_at_ms IS NULL
      ORDER BY CASE WHEN branch_id=? THEN 0 ELSE 1 END, branch_id ASC`)
      .all(target.conversationId, input.preferredBranchId) as { branchId: string }[]
    const routes = new BranchRouteResolverV2(this.db), read = new ConversationReadV2Repo(this.db)
    let eligibleProjectionMissing = false
    for (const { branchId } of branches) {
      try {
        const route = routes.resolve(branchId)
        const index = route.turns.findIndex(turn => !route.hiddenQuestionIds.has(turn.questionId) &&
          (target.role === 'user' ? turn.questionId === input.messageId :
            turn.selectedAnswerId === input.messageId && !route.hiddenAnswerIds.has(input.messageId)))
        if (index < 0) continue
        eligibleProjectionMissing = true
        const view = read.readBranch(branchId, route.turns[index + 1]?.questionId ?? null, input.limit)
        const projected = view.turns.some(turn => target.role === 'user' ? turn.questionId === input.messageId :
          turn.chosenAnswerRootId === input.messageId && turn.answers.some(answer => answer.chosen && answer.answerRootId === input.messageId))
        if (!projected || view.projectId !== target.projectId || view.conversationId !== target.conversationId) continue
        return Object.freeze({ status: 'ready', projectId: target.projectId, conversationId: target.conversationId,
          branchId, messageId: input.messageId, view })
      } catch (error) {
        if (!(error instanceof BranchRouteResolverV2Error) && !(error instanceof ConversationReadV2RepoError)) throw error
      }
    }
    return unavailable(eligibleProjectionMissing ? 'projection_unavailable' : 'no_visible_route')
  }
}
