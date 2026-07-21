import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Identity } from '../../../src/next/generation-v2/domain/conversationGraphV2'
import { assertGenerationV2AuthorityTransactionContextV2, type GenerationV2AuthorityTransactionContextV2 } from './generationV2AuthorityTransactionInternal'

function title(value: unknown, max: number, allowEmpty: boolean): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.trim().length === 0)) throw new Error('GENERATION_V2_WORKSPACE_INPUT_INVALID')
  return value
}
function time(value: unknown): number { if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error('GENERATION_V2_WORKSPACE_INPUT_INVALID'); return value as number }

export class ConversationWorkspaceV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {}
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
    if (this.db.prepare(`UPDATE branch_v2 SET deleted_at_ms=?,updated_at_ms=? WHERE branch_id=? AND deleted_at_ms IS NULL AND updated_at_ms<=?`)
      .run(input.deletedAtMs, input.deletedAtMs, id.value, input.deletedAtMs).changes !== 1) throw new Error('GENERATION_V2_WORKSPACE_BRANCH_NOT_FOUND')
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
  selectQuestionCandidate(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{
    branchId: string; baseMessageId: string | null; expectedCurrentQuestionId: string;
    targetQuestionId: string; expectedHeadMessageId: string; updatedAtMs: number
  }>): Readonly<{ headMessageId: string; chosenAnswerRootId: string }> {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const branchId = ConversationGraphV2Identity.create('branch_id', input.branchId)
    const currentQuestionId = ConversationGraphV2Identity.create('question_id', input.expectedCurrentQuestionId)
    const targetQuestionId = ConversationGraphV2Identity.create('question_id', input.targetQuestionId)
    const expectedHead = ConversationGraphV2Identity.create('message_id', input.expectedHeadMessageId)
    const baseMessageId = input.baseMessageId === null ? null
      : ConversationGraphV2Identity.create('message_id', input.baseMessageId).value
    const at = time(input.updatedAtMs)
    const row = this.db.prepare(`WITH RECURSIVE lineage(message_id,parent_message_id) AS (
      SELECT message_id,parent_message_id FROM message_v2
        WHERE message_id=(SELECT head_message_id FROM branch_v2 WHERE branch_id=?)
      UNION ALL SELECT parent.message_id,parent.parent_message_id FROM message_v2 AS parent
        JOIN lineage AS child ON child.parent_message_id=parent.message_id)
      SELECT branch.conversation_id AS conversationId,branch.head_message_id AS headMessageId,
        branch.updated_at_ms AS branchUpdatedAtMs,conversation.updated_at_ms AS conversationUpdatedAtMs,
        current.parent_message_id AS currentParentMessageId,target.parent_message_id AS targetParentMessageId,
        choice.chosen_answer_root_id AS chosenAnswerRootId,current_lineage.message_id AS currentLineageId,
        target_hidden.question_id AS targetHiddenQuestionId,answer_hidden.answer_root_id AS answerHiddenRootId
      FROM branch_v2 AS branch JOIN conversation_v2 AS conversation ON conversation.conversation_id=branch.conversation_id
      JOIN message_v2 AS current ON current.message_id=? AND current.conversation_id=branch.conversation_id AND current.role='user'
      JOIN lineage AS current_lineage ON current_lineage.message_id=current.message_id
      JOIN message_v2 AS target ON target.message_id=? AND target.conversation_id=branch.conversation_id AND target.role='user'
      JOIN branch_choice_v2 AS choice ON choice.branch_id=branch.branch_id AND choice.question_id=target.message_id
      JOIN message_v2 AS chosen ON chosen.message_id=choice.chosen_answer_root_id
        AND chosen.conversation_id=branch.conversation_id AND chosen.question_id=target.message_id
        AND chosen.role='assistant' AND chosen.answer_root_id=chosen.message_id
      LEFT JOIN branch_question_hide_v2 AS target_hidden
        ON target_hidden.branch_id=branch.branch_id AND target_hidden.question_id=target.message_id
      LEFT JOIN branch_answer_hide_v2 AS answer_hidden
        ON answer_hidden.branch_id=branch.branch_id AND answer_hidden.question_id=target.message_id
        AND answer_hidden.answer_root_id=choice.chosen_answer_root_id
      WHERE branch.branch_id=? AND branch.deleted_at_ms IS NULL`).get(
      branchId.value, currentQuestionId.value, targetQuestionId.value, branchId.value,
    ) as Record<string, unknown> | undefined
    const sameSlot = row && row.currentParentMessageId === row.targetParentMessageId &&
      row.currentParentMessageId === baseMessageId
    if (!row || !sameSlot || row.headMessageId !== expectedHead.value || row.currentLineageId !== currentQuestionId.value ||
        row.targetHiddenQuestionId !== null || row.answerHiddenRootId !== null ||
        typeof row.conversationId !== 'string' || typeof row.chosenAnswerRootId !== 'string' ||
        !Number.isSafeInteger(row.branchUpdatedAtMs) || !Number.isSafeInteger(row.conversationUpdatedAtMs) ||
        at < (row.branchUpdatedAtMs as number) || at < (row.conversationUpdatedAtMs as number)) {
      throw new Error('GENERATION_V2_WORKSPACE_QUESTION_SELECTION_STALE')
    }
    if (this.db.prepare(`UPDATE branch_v2 SET head_message_id=?,updated_at_ms=?
      WHERE branch_id=? AND head_message_id=? AND deleted_at_ms IS NULL AND updated_at_ms<=?`)
      .run(row.chosenAnswerRootId, at, branchId.value, expectedHead.value, at).changes !== 1) {
      throw new Error('GENERATION_V2_WORKSPACE_QUESTION_SELECTION_STALE')
    }
    this.db.prepare('UPDATE conversation_v2 SET updated_at_ms=? WHERE conversation_id=? AND updated_at_ms<=?')
      .run(at, row.conversationId, at)
    return Object.freeze({ headMessageId: row.chosenAnswerRootId, chosenAnswerRootId: row.chosenAnswerRootId })
  }
  forkBranch(context: GenerationV2AuthorityTransactionContextV2, input: Readonly<{ sourceBranchId: string; branchId: string;
    headMessageId: string; name: string | null; createdAtMs: number }>): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db); const source = ConversationGraphV2Identity.create('branch_id', input.sourceBranchId)
    const branch = ConversationGraphV2Identity.create('branch_id', input.branchId); const head = ConversationGraphV2Identity.create('message_id', input.headMessageId)
    const at = time(input.createdAtMs); const name = input.name === null ? null : title(input.name, 4096, true)
    const sourceRow = this.db.prepare(`SELECT branch.conversation_id AS conversationId,message.role FROM branch_v2 branch
      JOIN message_v2 message ON message.message_id=? AND message.conversation_id=branch.conversation_id
      WHERE branch.branch_id=? AND branch.deleted_at_ms IS NULL`).get(head.value, source.value) as Record<string, unknown> | undefined
    if (!sourceRow || typeof sourceRow.conversationId !== 'string' || (sourceRow.role !== 'assistant' && sourceRow.role !== 'tool')) throw new Error('GENERATION_V2_WORKSPACE_BRANCH_FORK_INVALID')
    this.db.prepare('INSERT INTO branch_v2 VALUES(?,?,?,?,?,?,NULL)').run(branch.value, sourceRow.conversationId, head.value, name, at, at)
    this.db.prepare(`WITH RECURSIVE lineage(message_id,parent_message_id) AS (
      SELECT message_id,parent_message_id FROM message_v2 WHERE message_id=? AND conversation_id=? UNION ALL
      SELECT parent.message_id,parent.parent_message_id FROM message_v2 parent JOIN lineage child ON child.parent_message_id=parent.message_id
      WHERE parent.conversation_id=?)
      INSERT INTO branch_choice_v2(branch_id,conversation_id,question_id,chosen_answer_root_id,updated_at_ms)
      SELECT ?,choice.conversation_id,choice.question_id,choice.chosen_answer_root_id,? FROM branch_choice_v2 choice
      JOIN lineage ON lineage.message_id=choice.question_id WHERE choice.branch_id=?`).run(head.value, sourceRow.conversationId,
      sourceRow.conversationId, branch.value, at, source.value)
    this.db.prepare(`INSERT INTO branch_answer_hide_v2(branch_id,conversation_id,question_id,answer_root_id,hidden_at_ms)
      SELECT ?,conversation_id,question_id,answer_root_id,? FROM branch_answer_hide_v2 WHERE branch_id=?
      AND question_id IN(SELECT question_id FROM branch_choice_v2 WHERE branch_id=?)`).run(branch.value, at, source.value, branch.value)
    this.db.prepare(`INSERT INTO branch_question_hide_v2(branch_id,conversation_id,question_id,hidden_at_ms)
      SELECT ?,conversation_id,question_id,? FROM branch_question_hide_v2 WHERE branch_id=?
      AND question_id IN(SELECT question_id FROM branch_choice_v2 WHERE branch_id=?)`).run(branch.value, at, source.value, branch.value)
  }
}
