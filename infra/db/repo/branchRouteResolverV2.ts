import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Identity } from '../../../src/next/generation-v2/domain/conversationGraphV2'

type Row = Readonly<Record<string, unknown>>

export type BranchRouteMessageV2 = Readonly<{
  messageId: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  status: 'streaming' | 'completed' | 'failed' | 'cancelled'
  parentMessageId: string | null
  questionId: string | null
  answerRootId: string | null
  introducedInBranchId: string
  ordinal: number
}>

export type BranchRouteTurnV2 = Readonly<{
  questionId: string
  selectedAnswerId: string | null
}>

export type ResolvedBranchRouteV2 = Readonly<{
  branchId: string
  conversationId: string
  parentBranchId: string | null
  branchAncestry: readonly string[]
  headMessageId: string | null
  messages: readonly BranchRouteMessageV2[]
  turns: readonly BranchRouteTurnV2[]
  hiddenAnswerIds: ReadonlySet<string>
  hiddenQuestionIds: ReadonlySet<string>
}>

export class BranchRouteResolverV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_BRANCH_ROUTE_NOT_FOUND'
    | 'GENERATION_V2_BRANCH_ROUTE_INVALID'
    | 'GENERATION_V2_BRANCH_ROUTE_CHOICE_CONFLICT'
    | 'GENERATION_V2_BRANCH_ROUTE_HIDDEN_SELECTED') {
    super(code)
    this.name = 'BranchRouteResolverV2Error'
  }
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new BranchRouteResolverV2Error('GENERATION_V2_BRANCH_ROUTE_INVALID')
  return value
}

function nullableText(value: unknown): string | null {
  if (value === null) return null
  return text(value)
}

function integer(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new BranchRouteResolverV2Error('GENERATION_V2_BRANCH_ROUTE_INVALID')
  }
  return value as number
}

export class BranchRouteResolverV2 {
  constructor(private readonly db: BetterSqlite3.Database) {}

  resolveMessageLineage(
    conversationIdValue: string,
    headMessageIdValue: string | null,
  ): readonly BranchRouteMessageV2[] {
    const conversationId = ConversationGraphV2Identity.create('conversation_id', conversationIdValue).value
    const headMessageId = headMessageIdValue === null ? null
      : ConversationGraphV2Identity.create('message_id', headMessageIdValue).value
    const routeRows = headMessageId === null ? [] : this.db.prepare(`WITH RECURSIVE lineage(
      message_id,role,status,parent_message_id,question_id,answer_root_id,introduced_in_branch_id,
      ordinal,path,cycle,depth
    ) AS (
      SELECT message_id,role,status,parent_message_id,question_id,answer_root_id,introduced_in_branch_id,ordinal,
        char(31)||message_id||char(31),0,0
      FROM message_v2 WHERE message_id=? AND conversation_id=?
      UNION ALL
      SELECT parent.message_id,parent.role,parent.status,parent.parent_message_id,parent.question_id,
        parent.answer_root_id,parent.introduced_in_branch_id,parent.ordinal,
        child.path||parent.message_id||char(31),
        instr(child.path,char(31)||parent.message_id||char(31))<>0,child.depth+1
      FROM message_v2 AS parent JOIN lineage AS child ON child.parent_message_id=parent.message_id
      WHERE parent.conversation_id=? AND child.cycle=0
    )
    SELECT message_id AS messageId,role,status,parent_message_id AS parentMessageId,
      question_id AS questionId,answer_root_id AS answerRootId,
      introduced_in_branch_id AS introducedInBranchId,ordinal,cycle,depth
    FROM lineage ORDER BY depth DESC`).all(headMessageId, conversationId, conversationId) as Row[]
    if (headMessageId !== null && (routeRows.length === 0 || routeRows.some((row) => row.cycle !== 0))) {
      throw new BranchRouteResolverV2Error('GENERATION_V2_BRANCH_ROUTE_INVALID')
    }
    const messages = Object.freeze(routeRows.map((row): BranchRouteMessageV2 => {
      const role = text(row.role)
      const status = text(row.status)
      if (!['system', 'user', 'assistant', 'tool'].includes(role) ||
          !['streaming', 'completed', 'failed', 'cancelled'].includes(status)) {
        throw new BranchRouteResolverV2Error('GENERATION_V2_BRANCH_ROUTE_INVALID')
      }
      return Object.freeze({
        messageId: text(row.messageId),
        role: role as BranchRouteMessageV2['role'],
        status: status as BranchRouteMessageV2['status'],
        parentMessageId: nullableText(row.parentMessageId),
        questionId: nullableText(row.questionId),
        answerRootId: nullableText(row.answerRootId),
        introducedInBranchId: text(row.introducedInBranchId),
        ordinal: integer(row.ordinal),
      })
    }))
    for (let index = 1; index < messages.length; index += 1) {
      if (messages[index]?.parentMessageId !== messages[index - 1]?.messageId) {
        throw new BranchRouteResolverV2Error('GENERATION_V2_BRANCH_ROUTE_INVALID')
      }
    }
    return messages
  }

  resolve(branchIdValue: string): ResolvedBranchRouteV2 {
    const branchId = ConversationGraphV2Identity.create('branch_id', branchIdValue).value
    const branch = this.db.prepare(`SELECT branch_id AS branchId,conversation_id AS conversationId,
      parent_branch_id AS parentBranchId,head_message_id AS headMessageId
      FROM branch_v2 WHERE branch_id=? AND deleted_at_ms IS NULL`).get(branchId) as Row | undefined
    if (!branch) throw new BranchRouteResolverV2Error('GENERATION_V2_BRANCH_ROUTE_NOT_FOUND')
    const conversationId = text(branch.conversationId)
    const parentBranchId = nullableText(branch.parentBranchId)
    const headMessageId = nullableText(branch.headMessageId)

    const ancestryRows = this.db.prepare(`WITH RECURSIVE ancestry(branch_id,parent_branch_id,path,cycle) AS (
      SELECT branch_id,parent_branch_id,char(31)||branch_id||char(31),0
      FROM branch_v2 WHERE branch_id=? AND conversation_id=?
      UNION ALL
      SELECT parent.branch_id,parent.parent_branch_id,
        child.path||parent.branch_id||char(31),
        instr(child.path,char(31)||parent.branch_id||char(31))<>0
      FROM branch_v2 AS parent JOIN ancestry AS child ON child.parent_branch_id=parent.branch_id
      WHERE parent.conversation_id=? AND child.cycle=0
    )
    SELECT branch_id AS branchId,parent_branch_id AS parentBranchId,cycle FROM ancestry`).all(
      branchId, conversationId, conversationId,
    ) as Row[]
    if (ancestryRows.length === 0 || ancestryRows.some((row) => row.cycle !== 0)) {
      throw new BranchRouteResolverV2Error('GENERATION_V2_BRANCH_ROUTE_INVALID')
    }
    const branchAncestry = Object.freeze(ancestryRows.map((row) => text(row.branchId)))
    if (new Set(branchAncestry).size !== branchAncestry.length ||
        ancestryRows[ancestryRows.length - 1]?.parentBranchId !== null) {
      throw new BranchRouteResolverV2Error('GENERATION_V2_BRANCH_ROUTE_INVALID')
    }

    const messages = this.resolveMessageLineage(conversationId, headMessageId)
    const placeholders = branchAncestry.map(() => '?').join(',')

    const answerByQuestion = new Map<string, string>()
    for (const message of messages) {
      if (message.role === 'assistant' && message.answerRootId === message.messageId &&
          message.questionId !== null) {
        answerByQuestion.set(message.questionId, message.messageId)
      }
    }
    const turns = Object.freeze(messages.filter((message) => message.role === 'user').map((message) =>
      Object.freeze({ questionId: message.messageId, selectedAnswerId: answerByQuestion.get(message.messageId) ?? null })))

    const choices = this.db.prepare(`SELECT branch_id AS branchId,question_id AS questionId,
      chosen_answer_root_id AS selectedAnswerId FROM branch_choice_v2
      WHERE conversation_id=? AND branch_id=?`).all(
      conversationId, branchId,
    ) as Row[]
    const routeTurns = new Map(turns.map((turn) => [turn.questionId, turn.selectedAnswerId]))
    for (const choice of choices) {
      const questionId = text(choice.questionId)
      if (!routeTurns.has(questionId) || routeTurns.get(questionId) !== text(choice.selectedAnswerId)) {
        throw new BranchRouteResolverV2Error('GENERATION_V2_BRANCH_ROUTE_CHOICE_CONFLICT')
      }
    }

    const hiddenRows = branchAncestry.length === 0 ? [] : this.db.prepare(
      `SELECT DISTINCT answer_root_id AS answerId FROM branch_answer_hide_v2
       WHERE conversation_id=? AND branch_id IN (${placeholders})`,
    ).all(conversationId, ...branchAncestry) as Row[]
    const hiddenAnswerIds = new Set(hiddenRows.map((row) => text(row.answerId)))
    if (turns.some((turn) => turn.selectedAnswerId !== null && hiddenAnswerIds.has(turn.selectedAnswerId))) {
      throw new BranchRouteResolverV2Error('GENERATION_V2_BRANCH_ROUTE_HIDDEN_SELECTED')
    }
    const hiddenQuestionRows = branchAncestry.length === 0 ? [] : this.db.prepare(
      `SELECT DISTINCT question_id AS questionId FROM branch_question_hide_v2
       WHERE conversation_id=? AND branch_id IN (${placeholders})`,
    ).all(conversationId, ...branchAncestry) as Row[]
    const hiddenQuestionIds = new Set(hiddenQuestionRows.map((row) => text(row.questionId)))

    return Object.freeze({
      branchId,
      conversationId,
      parentBranchId,
      branchAncestry,
      headMessageId,
      messages,
      turns,
      hiddenAnswerIds,
      hiddenQuestionIds,
    })
  }
}
