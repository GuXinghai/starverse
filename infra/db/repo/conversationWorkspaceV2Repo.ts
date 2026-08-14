import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Identity } from '../../../src/next/generation-v2/domain/conversationGraphV2'
import { BranchRouteResolverV2 } from './branchRouteResolverV2'
import { assertGenerationV2AuthorityTransactionContextV2, type GenerationV2AuthorityTransactionContextV2 } from './generationV2AuthorityTransactionInternal'

function title(value: unknown, max: number, allowEmpty: boolean): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.trim().length === 0)) throw new Error('GENERATION_V2_WORKSPACE_INPUT_INVALID')
  return value
}
function time(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('GENERATION_V2_WORKSPACE_INPUT_INVALID'); return value as number }

export class ConversationWorkspaceV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {}
  private assertBranchHasNoActiveGeneration(branchId: string): void {
    if (this.db.prepare(`SELECT 1 FROM generation_operation_v2
      WHERE branch_id=? AND state IN ('committed','streaming') LIMIT 1`).get(branchId)) {
      throw new Error('GENERATION_V2_WORKSPACE_BRANCH_HAS_ACTIVE_GENERATION')
    }
  }
  private assertNotSystemTemplate(conversationId: string): void {
    if (this.db.prepare('SELECT 1 FROM system_chat_template_v2 WHERE conversation_id=?').get(conversationId)) {
      throw new Error('GENERATION_V2_WORKSPACE_SYSTEM_TEMPLATE_MUTATION_FORBIDDEN')
    }
  }
  renameProject(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{ projectId: string; name: string; updatedAtMs: number }>): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db); const id = ConversationGraphV2Identity.create('project_id', input.projectId)
    const result = this.db.prepare('UPDATE project_v2 SET name=?, updated_at_ms=? WHERE project_id=? AND updated_at_ms<=?')
      .run(title(input.name, 4096, false), time(input.updatedAtMs), id.value, input.updatedAtMs)
    if (result.changes !== 1) throw new Error('GENERATION_V2_WORKSPACE_PROJECT_NOT_FOUND')
  }
  deleteProject(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{ projectId: string }>): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db); const id = ConversationGraphV2Identity.create('project_id', input.projectId)
    if (this.db.prepare(`SELECT 1 FROM system_chat_template_v2 AS template JOIN conversation_v2 AS conversation
      ON conversation.conversation_id=template.conversation_id WHERE conversation.project_id=?`).get(id.value)) {
      throw new Error('GENERATION_V2_WORKSPACE_SYSTEM_TEMPLATE_MUTATION_FORBIDDEN')
    }
    if (this.db.prepare(`SELECT 1 FROM generation_operation_v2 AS operation
      JOIN conversation_v2 AS conversation ON conversation.conversation_id=operation.conversation_id
      WHERE conversation.project_id=? AND operation.state IN ('committed','streaming') LIMIT 1`).get(id.value)) {
      throw new Error('GENERATION_V2_WORKSPACE_PROJECT_HAS_ACTIVE_GENERATION')
    }
    if (this.db.prepare('DELETE FROM project_v2 WHERE project_id=?').run(id.value).changes !== 1) throw new Error('GENERATION_V2_WORKSPACE_PROJECT_NOT_FOUND')
  }
  renameConversation(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{ conversationId: string; title: string; updatedAtMs: number }>): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db); const id = ConversationGraphV2Identity.create('conversation_id', input.conversationId)
    this.assertNotSystemTemplate(id.value)
    const result = this.db.prepare('UPDATE conversation_v2 SET title=?, updated_at_ms=? WHERE conversation_id=? AND updated_at_ms<=?')
      .run(title(input.title, 16384, true), time(input.updatedAtMs), id.value, input.updatedAtMs)
    if (result.changes !== 1) throw new Error('GENERATION_V2_WORKSPACE_CONVERSATION_NOT_FOUND')
  }
  moveConversation(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{ conversationId: string; projectId: string; updatedAtMs: number }>): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db); const conversationId = ConversationGraphV2Identity.create('conversation_id', input.conversationId)
    this.assertNotSystemTemplate(conversationId.value)
    const projectId = ConversationGraphV2Identity.create('project_id', input.projectId); time(input.updatedAtMs)
    if (!this.db.prepare('SELECT 1 FROM project_v2 WHERE project_id=?').get(projectId.value)) throw new Error('GENERATION_V2_WORKSPACE_PROJECT_NOT_FOUND')
    const result = this.db.prepare('UPDATE conversation_v2 SET project_id=?, updated_at_ms=? WHERE conversation_id=? AND updated_at_ms<=?')
      .run(projectId.value, input.updatedAtMs, conversationId.value, input.updatedAtMs)
    if (result.changes !== 1) throw new Error('GENERATION_V2_WORKSPACE_CONVERSATION_NOT_FOUND')
  }
  deleteConversation(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{ conversationId: string }>): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db); const id = ConversationGraphV2Identity.create('conversation_id', input.conversationId)
    this.assertNotSystemTemplate(id.value)
    if (this.db.prepare(`SELECT 1 FROM generation_operation_v2
      WHERE conversation_id=? AND state IN ('committed','streaming') LIMIT 1`).get(id.value)) {
      throw new Error('GENERATION_V2_WORKSPACE_CONVERSATION_HAS_ACTIVE_GENERATION')
    }
    if (this.db.prepare('DELETE FROM conversation_v2 WHERE conversation_id=?').run(id.value).changes !== 1) throw new Error('GENERATION_V2_WORKSPACE_CONVERSATION_NOT_FOUND')
  }
  renameBranch(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{ branchId: string; name: string | null; updatedAtMs: number }>): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db); const id = ConversationGraphV2Identity.create('branch_id', input.branchId)
    const name = input.name === null ? null : title(input.name, 4096, true); time(input.updatedAtMs)
    if (this.db.prepare(`UPDATE branch_v2 SET name=?,updated_at_ms=? WHERE branch_id=? AND deleted_at_ms IS NULL AND updated_at_ms<=?`)
      .run(name, input.updatedAtMs, id.value, input.updatedAtMs).changes !== 1) throw new Error('GENERATION_V2_WORKSPACE_BRANCH_NOT_FOUND')
  }
  deleteBranch(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{ branchId: string; deletedAtMs: number }>): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db); const id = ConversationGraphV2Identity.create('branch_id', input.branchId); time(input.deletedAtMs)
    const row = this.db.prepare('SELECT conversation_id AS conversationId FROM branch_v2 WHERE branch_id=? AND deleted_at_ms IS NULL').get(id.value) as { conversationId?: unknown } | undefined
    if (!row || typeof row.conversationId !== 'string') throw new Error('GENERATION_V2_WORKSPACE_BRANCH_NOT_FOUND')
    const count = this.db.prepare('SELECT count(*) AS count FROM branch_v2 WHERE conversation_id=? AND deleted_at_ms IS NULL').get(row.conversationId) as { count?: unknown }
    if (count.count === 1) throw new Error('GENERATION_V2_WORKSPACE_LAST_BRANCH_DELETE_FORBIDDEN')
    this.assertBranchHasNoActiveGeneration(id.value)
    if (this.db.prepare(`UPDATE branch_v2 SET deleted_at_ms=?,updated_at_ms=? WHERE branch_id=? AND deleted_at_ms IS NULL AND updated_at_ms<=?`)
      .run(input.deletedAtMs, input.deletedAtMs, id.value, input.deletedAtMs).changes !== 1) throw new Error('GENERATION_V2_WORKSPACE_BRANCH_NOT_FOUND')
  }

  hideAnswer(
    context: GenerationV2AuthorityTransactionContextV2,
    input: Readonly<{ branchId: string; answerId: string; hiddenAtMs: number }>,
  ): Readonly<{ created: boolean }> {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const branchId = ConversationGraphV2Identity.create('branch_id', input.branchId)
    const answerId = ConversationGraphV2Identity.create('answer_root_id', input.answerId)
    const hiddenAtMs = time(input.hiddenAtMs)
    const route = new BranchRouteResolverV2(this.db).resolve(branchId.value)
    if (route.hiddenAnswerIds.has(answerId.value)) return Object.freeze({ created: false })
    const answer = this.db.prepare(`SELECT question_id AS questionId FROM message_v2
      WHERE message_id=? AND conversation_id=? AND role='assistant' AND answer_root_id=message_id`).get(
      answerId.value, route.conversationId,
    ) as Record<string, unknown> | undefined
    if (!answer || typeof answer.questionId !== 'string') {
      throw new Error('GENERATION_V2_WORKSPACE_ANSWER_HIDE_INVALID')
    }
    const selectedByDescendant = this.db.prepare(`WITH RECURSIVE descendants(branch_id,head_message_id) AS (
      SELECT branch_id,head_message_id FROM branch_v2 WHERE branch_id=? AND conversation_id=?
      UNION ALL
      SELECT child.branch_id,child.head_message_id FROM branch_v2 AS child
      JOIN descendants AS parent ON child.parent_branch_id=parent.branch_id
      WHERE child.conversation_id=? AND child.deleted_at_ms IS NULL
    ), lineage(branch_id,message_id,parent_message_id) AS (
      SELECT descendants.branch_id,message.message_id,message.parent_message_id
      FROM descendants JOIN message_v2 AS message
        ON message.message_id=descendants.head_message_id AND message.conversation_id=?
      UNION ALL
      SELECT child.branch_id,parent.message_id,parent.parent_message_id
      FROM lineage AS child JOIN message_v2 AS parent ON parent.message_id=child.parent_message_id
      WHERE parent.conversation_id=?
    )
    SELECT 1 FROM lineage WHERE message_id=? LIMIT 1`).get(
      branchId.value, route.conversationId, route.conversationId,
      route.conversationId, route.conversationId, answerId.value,
    )
    if (selectedByDescendant) throw new Error('GENERATION_V2_WORKSPACE_ANSWER_HIDE_SELECTED')
    const result = this.db.prepare(`INSERT INTO branch_answer_hide_v2(
      branch_id,conversation_id,question_id,answer_root_id,hidden_at_ms
    ) VALUES(?,?,?,?,?) ON CONFLICT(branch_id,question_id,answer_root_id) DO NOTHING`).run(
      branchId.value, route.conversationId, answer.questionId, answerId.value, hiddenAtMs,
    )
    return Object.freeze({ created: result.changes === 1 })
  }
  truncateBranchFromQuestion(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{
    branchId: string; questionId: string; expectedHeadMessageId: string; updatedAtMs: number
  }>): Readonly<{ headMessageId: string | null }> {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const branchId = ConversationGraphV2Identity.create('branch_id', input.branchId)
    const questionId = ConversationGraphV2Identity.create('question_id', input.questionId)
    const expectedHead = ConversationGraphV2Identity.create('message_id', input.expectedHeadMessageId)
    const at = time(input.updatedAtMs)
    const row = this.db.prepare(`WITH RECURSIVE lineage(message_id,parent_message_id) AS (
      SELECT message_id,parent_message_id FROM message_v2 WHERE message_id=(SELECT head_message_id FROM branch_v2 WHERE branch_id=?)
      UNION ALL SELECT parent.message_id,parent.parent_message_id FROM message_v2 parent
      JOIN lineage child ON child.parent_message_id=parent.message_id)
      SELECT branch.conversation_id AS conversationId,branch.head_message_id AS headMessageId,
        question.parent_message_id AS parentMessageId,question.role,hidden.question_id AS hiddenQuestionId
      FROM branch_v2 branch JOIN message_v2 question ON question.message_id=? AND question.conversation_id=branch.conversation_id
      JOIN lineage ON lineage.message_id=question.message_id
      LEFT JOIN branch_question_hide_v2 hidden ON hidden.branch_id=branch.branch_id AND hidden.question_id=question.message_id
      WHERE branch.branch_id=? AND branch.deleted_at_ms IS NULL`).get(branchId.value, questionId.value, branchId.value) as Record<string, unknown> | undefined
    if (!row || row.role !== 'user' || row.headMessageId !== expectedHead.value || row.hiddenQuestionId !== null ||
        typeof row.conversationId !== 'string' || row.parentMessageId !== null && typeof row.parentMessageId !== 'string') {
      throw new Error('GENERATION_V2_WORKSPACE_QUESTION_TRUNCATE_STALE')
    }
    this.assertBranchHasNoActiveGeneration(branchId.value)
    this.db.prepare(`INSERT INTO branch_question_hide_v2(branch_id,conversation_id,question_id,hidden_at_ms)
      VALUES(?,?,?,?) ON CONFLICT(branch_id,question_id) DO NOTHING`).run(branchId.value, row.conversationId, questionId.value, at)
    if (this.db.prepare(`UPDATE branch_v2 SET head_message_id=?,updated_at_ms=?
      WHERE branch_id=? AND head_message_id=? AND deleted_at_ms IS NULL AND updated_at_ms<=?`)
      .run(row.parentMessageId, at, branchId.value, expectedHead.value, at).changes !== 1) {
      throw new Error('GENERATION_V2_WORKSPACE_QUESTION_TRUNCATE_STALE')
    }
    this.db.prepare('UPDATE conversation_v2 SET updated_at_ms=? WHERE conversation_id=? AND updated_at_ms<=?')
      .run(at, row.conversationId, at)
    return Object.freeze({ headMessageId: row.parentMessageId as string | null })
  }
  forkBranch(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{ sourceBranchId: string; branchId: string;
    headMessageId: string; name: string | null; createdAtMs: number }>): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db); const source = ConversationGraphV2Identity.create('branch_id', input.sourceBranchId)
    const branch = ConversationGraphV2Identity.create('branch_id', input.branchId); const head = ConversationGraphV2Identity.create('message_id', input.headMessageId)
    const at = time(input.createdAtMs); const name = input.name === null ? null : title(input.name, 4096, true)
    const route = new BranchRouteResolverV2(this.db).resolve(source.value)
    const routeHead = route.messages.find((message) => message.messageId === head.value)
    if (!routeHead || (routeHead.role !== 'assistant' && routeHead.role !== 'tool') ||
        routeHead.answerRootId !== null && route.hiddenAnswerIds.has(routeHead.answerRootId)) {
      throw new Error('GENERATION_V2_WORKSPACE_BRANCH_FORK_INVALID')
    }
    this.db.prepare('INSERT INTO branch_v2 VALUES(?,?,?,?,?,?,NULL,?)').run(
      branch.value, route.conversationId, head.value, name, at, at, source.value,
    )
  }
}
