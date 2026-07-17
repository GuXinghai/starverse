import type BetterSqlite3 from 'better-sqlite3'
import {
  ConversationGraphV2Identity,
  type ConversationGraphV2Identity as GraphIdentity,
} from '../../../src/next/generation-v2/domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../../src/next/generation-v2/domain/identityV2'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  registerGenerationV2AuthorityTransactionParticipantV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

const MAX_BODY_BYTES = 20 * 1024 * 1024

export class ConversationGraphV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID'
    | 'GENERATION_V2_GRAPH_REPOSITORY_NOT_FOUND'
    | 'GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD'
    | 'STALE_CHOSEN_ANSWER'
    | 'GENERATION_V2_GRAPH_REPOSITORY_CONFLICT'
    | 'GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID') {
    super(code)
    this.name = 'ConversationGraphV2RepoError'
  }
}

export type PendingInitialTurnV2 = Readonly<{
  trust: 'pending_initial_turn_v2'
  operationId: Identity<'operation_id'>
  projectId: GraphIdentity<'project_id'>
  conversationId: GraphIdentity<'conversation_id'>
  branchId: GraphIdentity<'branch_id'>
  questionId: GraphIdentity<'question_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'> | null
  userBody: string
  questionOrdinal: number
  answerOrdinal: number
  createdAtMs: number
}>

export type PendingAnswerActionV2 = Readonly<{
  trust: 'pending_answer_action_v2'
  operationId: Identity<'operation_id'>
  actionKind: 'regenerate_question' | 'retry_as_new' | 'retry_replace'
  conversationId: GraphIdentity<'conversation_id'>
  branchId: GraphIdentity<'branch_id'>
  questionId: GraphIdentity<'question_id'>
  targetAnswerRootId: GraphIdentity<'answer_root_id'> | null
  expectedHeadMessageId: GraphIdentity<'message_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  answerOrdinal: number
  createdAtMs: number
}>

export type PendingEditedTurnV2 = Readonly<{
  trust: 'pending_edited_turn_v2'
  operationId: Identity<'operation_id'>
  mode: 'fork' | 'replace'
  conversationId: GraphIdentity<'conversation_id'>
  branchId: GraphIdentity<'branch_id'>
  sourceQuestionId: GraphIdentity<'question_id'>
  sourceAnswerRootId: GraphIdentity<'answer_root_id'>
  expectedHeadMessageId: GraphIdentity<'message_id'>
  questionId: GraphIdentity<'question_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  userBody: string
  questionOrdinal: number
  answerOrdinal: number
  createdAtMs: number
}>

export type BranchProjectionV2 = Readonly<{
  branchId: GraphIdentity<'branch_id'>
  conversationId: GraphIdentity<'conversation_id'>
  questionId: GraphIdentity<'question_id'>
  headMessageId: GraphIdentity<'message_id'> | null
  chosenAnswerRootId: GraphIdentity<'answer_root_id'> | null
  deletedAtMs: number | null
}>

export type InitialSendReplayProjectionV2 = Readonly<{
  resultAnswerRootId: GraphIdentity<'answer_root_id'>
  branchProjection: BranchProjectionV2
  visibleCandidates: readonly GraphIdentity<'answer_root_id'>[]
  visibleQuestionCandidates: readonly GraphIdentity<'question_id'>[]
}>
export type GenerationReplayProjectionV2 = InitialSendReplayProjectionV2

const pendingTurns = new WeakSet<object>()
const pendingTurnContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()
const pendingAnswerActions = new WeakSet<object>()
const pendingAnswerActionContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()
const pendingEditedTurns = new WeakSet<object>()
const pendingEditedTurnContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()

function closedObject(value: unknown, expected: readonly string[]): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== [...expected].sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable ||
        !('value' in descriptor) || descriptor.value === undefined)) {
    throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
  }
  return Object.freeze(Object.fromEntries(expected.map((key) => [key, descriptors[key].value])))
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
  }
  return value
}

function boundedText(value: unknown, maxBytes: number): string {
  if (typeof value !== 'string' || new TextEncoder().encode(value).byteLength > maxBytes) {
    throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
  }
  return value
}

function safeTime(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
  }
  return value as number
}

function mapConstraint(error: unknown): never {
  const code = (error as { code?: unknown })?.code
  if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
    throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_CONFLICT')
  }
  throw error
}

export function isPendingInitialTurnV2(value: unknown): value is PendingInitialTurnV2 {
  return Boolean(value && typeof value === 'object' && pendingTurns.has(value))
}

export function isPendingInitialTurnForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is PendingInitialTurnV2 {
  return isPendingInitialTurnV2(value) && pendingTurnContexts.get(value) === context
}

export function isPendingAnswerActionForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is PendingAnswerActionV2 {
  return Boolean(value && typeof value === 'object' && pendingAnswerActions.has(value) &&
    pendingAnswerActionContexts.get(value) === context)
}

export function isPendingEditedTurnForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is PendingEditedTurnV2 {
  return Boolean(value && typeof value === 'object' && pendingEditedTurns.has(value) &&
    pendingEditedTurnContexts.get(value) === context)
}

export class ConversationGraphV2Repo {
  readonly #db: BetterSqlite3.Database

  constructor(db: BetterSqlite3.Database) {
    this.#db = db
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
  }

  createProject(context: GenerationV2AuthorityTransactionContextV2, value: unknown): GraphIdentity<'project_id'> {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const input = closedObject(value, ['projectId', 'name', 'createdAtMs'])
    const projectId = ConversationGraphV2Identity.create('project_id', requiredString(input.projectId))
    const name = boundedText(input.name, 4096)
    if (name.length === 0) throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
    const createdAtMs = safeTime(input.createdAtMs)
    try {
      this.#db.prepare('INSERT INTO project_v2 VALUES (?, ?, ?, ?)')
        .run(projectId.value, name, createdAtMs, createdAtMs)
    } catch (error) { mapConstraint(error) }
    return projectId
  }

  createConversationAndDefaultBranch(
    context: GenerationV2AuthorityTransactionContextV2,
    value: unknown,
  ): Readonly<{
    conversationId: GraphIdentity<'conversation_id'>
    branchId: GraphIdentity<'branch_id'>
  }> {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const input = closedObject(value, ['projectId', 'conversationId', 'branchId', 'title', 'branchName', 'createdAtMs'])
    const projectId = ConversationGraphV2Identity.create('project_id', requiredString(input.projectId))
    const conversationId = ConversationGraphV2Identity.create('conversation_id', requiredString(input.conversationId))
    const branchId = ConversationGraphV2Identity.create('branch_id', requiredString(input.branchId))
    const title = boundedText(input.title, 16384)
    const branchName = input.branchName === null ? null : boundedText(input.branchName, 4096)
    const createdAtMs = safeTime(input.createdAtMs)
    try {
      this.#db.prepare('INSERT INTO conversation_v2 VALUES (?, ?, ?, ?, ?)')
        .run(conversationId.value, projectId.value, title, createdAtMs, createdAtMs)
      this.#db.prepare('INSERT INTO branch_v2 VALUES (?, ?, NULL, ?, ?, ?, NULL)')
        .run(branchId.value, conversationId.value, branchName, createdAtMs, createdAtMs)
    } catch (error) { mapConstraint(error) }
    return Object.freeze({ conversationId, branchId })
  }

  beginInitialTurn(context: GenerationV2AuthorityTransactionContextV2, value: unknown): PendingInitialTurnV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const input = closedObject(value, [
      'operationId', 'branchId', 'expectedHeadMessageId', 'questionId', 'answerRootId', 'userBody', 'createdAtMs',
    ])
    const operationId = GenerationV2Identity.create('operation_id', requiredString(input.operationId))
    const branchId = ConversationGraphV2Identity.create('branch_id', requiredString(input.branchId))
    const questionId = ConversationGraphV2Identity.create('question_id', requiredString(input.questionId))
    const answerRootId = ConversationGraphV2Identity.create('answer_root_id', requiredString(input.answerRootId))
    const expectedHead = input.expectedHeadMessageId === null ? null :
      ConversationGraphV2Identity.create('message_id', requiredString(input.expectedHeadMessageId))
    const userBody = boundedText(input.userBody, MAX_BODY_BYTES)
    const createdAtMs = safeTime(input.createdAtMs)
    const branch = this.#db.prepare(`SELECT branch.conversation_id AS conversationId,
      branch.head_message_id AS headMessageId, branch.deleted_at_ms AS deletedAtMs,
      branch.updated_at_ms AS branchUpdatedAtMs, conversation.project_id AS projectId,
      conversation.updated_at_ms AS conversationUpdatedAtMs
      FROM branch_v2 AS branch
      JOIN conversation_v2 AS conversation ON conversation.conversation_id=branch.conversation_id
      WHERE branch.branch_id=?`).get(branchId.value) as {
        conversationId: unknown
        headMessageId: unknown
        deletedAtMs: unknown
        branchUpdatedAtMs: unknown
        projectId: unknown
        conversationUpdatedAtMs: unknown
      } | undefined
    if (!branch || typeof branch.conversationId !== 'string') {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_NOT_FOUND')
    }
    if (branch.deletedAtMs !== null || branch.headMessageId !== expectedHead?.value &&
        !(branch.headMessageId === null && expectedHead === null)) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD')
    }
    if (!Number.isSafeInteger(branch.branchUpdatedAtMs) || !Number.isSafeInteger(branch.conversationUpdatedAtMs) ||
        createdAtMs < (branch.branchUpdatedAtMs as number) || createdAtMs < (branch.conversationUpdatedAtMs as number) ||
        typeof branch.projectId !== 'string') {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
    }
    const conversationId = ConversationGraphV2Identity.create('conversation_id', branch.conversationId)
    const projectId = ConversationGraphV2Identity.create('project_id', branch.projectId)
    const ordinalRow = this.#db.prepare('SELECT MAX(ordinal) AS maxOrdinal FROM message_v2 WHERE conversation_id=?')
      .get(conversationId.value) as { maxOrdinal: unknown }
    const currentOrdinal = ordinalRow.maxOrdinal === null ? -1 : ordinalRow.maxOrdinal
    if (!Number.isSafeInteger(currentOrdinal) || (currentOrdinal as number) >= Number.MAX_SAFE_INTEGER - 1) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    const questionOrdinal = (currentOrdinal as number) + 1
    const answerOrdinal = questionOrdinal + 1
    try {
      const insert = this.#db.prepare(`INSERT INTO message_v2 (
        message_id, conversation_id, role, status, parent_message_id, question_id,
        answer_root_id, ordinal, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      insert.run(questionId.value, conversationId.value, 'user', 'completed', expectedHead?.value ?? null,
        null, null, questionOrdinal, createdAtMs, createdAtMs)
      this.#db.prepare('UPDATE message_body_v2 SET body_text=? WHERE message_id=?').run(userBody, questionId.value)
      insert.run(answerRootId.value, conversationId.value, 'assistant', 'streaming', questionId.value,
        questionId.value, answerRootId.value, answerOrdinal, createdAtMs, createdAtMs)
    } catch (error) { mapConstraint(error) }

    const pending = Object.freeze({
      trust: 'pending_initial_turn_v2' as const,
      operationId,
      projectId,
      conversationId,
      branchId,
      questionId,
      answerRootId,
      expectedHeadMessageId: expectedHead,
      userBody,
      questionOrdinal,
      answerOrdinal,
      createdAtMs,
    })
    pendingTurns.add(pending)
    pendingTurnContexts.set(pending, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => {
        const row = this.#db.prepare(`SELECT branch.head_message_id AS headMessageId,
          choice.chosen_answer_root_id AS chosenAnswerRootId,
          operation.action_kind AS actionKind,
          operation.branch_id AS operationBranchId,
          operation.conversation_id AS operationConversationId,
          operation.question_id AS operationQuestionId,
          operation.created_at_ms AS operationCreatedAtMs,
          snapshot.answer_root_id AS snapshotAnswerRootId
          FROM branch_v2 AS branch
          LEFT JOIN branch_choice_v2 AS choice
            ON choice.branch_id=branch.branch_id AND choice.question_id=?
          LEFT JOIN generation_operation_v2 AS operation
            ON operation.operation_id=? AND operation.result_answer_root_id=?
          LEFT JOIN assistant_generation_snapshot_v2 AS snapshot
            ON snapshot.operation_id=operation.operation_id AND snapshot.answer_root_id=operation.result_answer_root_id
          WHERE branch.branch_id=?`).get(
          questionId.value, operationId.value, answerRootId.value, branchId.value,
        ) as {
          headMessageId: unknown
          chosenAnswerRootId: unknown
          actionKind: unknown
          operationBranchId: unknown
          operationConversationId: unknown
          operationQuestionId: unknown
          operationCreatedAtMs: unknown
          snapshotAnswerRootId: unknown
        } | undefined
        if (!row || row.headMessageId !== answerRootId.value || row.chosenAnswerRootId !== answerRootId.value ||
            row.actionKind !== 'initial_send' || row.operationBranchId !== branchId.value ||
            row.operationConversationId !== conversationId.value || row.operationQuestionId !== questionId.value ||
            row.operationCreatedAtMs !== createdAtMs || row.snapshotAnswerRootId !== answerRootId.value) {
          throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
        }
      },
      committed: () => {
        pendingTurns.delete(pending)
        pendingTurnContexts.delete(pending)
      },
      rolledBack: () => {
        pendingTurns.delete(pending)
        pendingTurnContexts.delete(pending)
      },
    })
    return pending
  }

  commitInitialTurnProjection(
    context: GenerationV2AuthorityTransactionContextV2,
    pending: PendingInitialTurnV2,
  ): BranchProjectionV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isPendingInitialTurnV2(pending) || pendingTurnContexts.get(pending) !== context) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
    }
    try {
      this.#db.prepare(`INSERT INTO branch_choice_v2 (
        branch_id, conversation_id, question_id, chosen_answer_root_id, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?)`).run(
        pending.branchId.value, pending.conversationId.value, pending.questionId.value,
        pending.answerRootId.value, pending.createdAtMs,
      )
      const updated = this.#db.prepare(`UPDATE branch_v2 SET head_message_id=?, updated_at_ms=?
        WHERE branch_id=? AND conversation_id=? AND deleted_at_ms IS NULL`).run(
        pending.answerRootId.value, pending.createdAtMs, pending.branchId.value, pending.conversationId.value,
      )
      if (updated.changes !== 1) throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD')
      const conversationUpdated = this.#db.prepare(`UPDATE conversation_v2 SET updated_at_ms=?
        WHERE conversation_id=? AND updated_at_ms<=?`).run(
        pending.createdAtMs, pending.conversationId.value, pending.createdAtMs,
      )
      if (conversationUpdated.changes !== 1) {
        throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
      }
    } catch (error) {
      if (error instanceof ConversationGraphV2RepoError) throw error
      mapConstraint(error)
    }
    return this.#readProjection(pending.branchId.value, pending.questionId.value)
  }

  beginEditedTurn(
    context: GenerationV2AuthorityTransactionContextV2,
    value: unknown,
  ): PendingEditedTurnV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const input = closedObject(value, [
      'operationId', 'mode', 'branchId', 'sourceQuestionId', 'sourceAnswerRootId',
      'expectedHeadMessageId', 'questionId', 'answerRootId', 'userBody', 'createdAtMs',
    ])
    const operationId = GenerationV2Identity.create('operation_id', requiredString(input.operationId))
    if (input.mode !== 'fork' && input.mode !== 'replace') {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
    }
    const mode = input.mode
    const branchId = ConversationGraphV2Identity.create('branch_id', requiredString(input.branchId))
    const sourceQuestionId = ConversationGraphV2Identity.create(
      'question_id', requiredString(input.sourceQuestionId),
    )
    const sourceAnswerRootId = ConversationGraphV2Identity.create(
      'answer_root_id', requiredString(input.sourceAnswerRootId),
    )
    const expectedHeadMessageId = ConversationGraphV2Identity.create(
      'message_id', requiredString(input.expectedHeadMessageId),
    )
    const questionId = ConversationGraphV2Identity.create('question_id', requiredString(input.questionId))
    const answerRootId = ConversationGraphV2Identity.create('answer_root_id', requiredString(input.answerRootId))
    const userBody = boundedText(input.userBody, MAX_BODY_BYTES)
    const createdAtMs = safeTime(input.createdAtMs)
    const row = this.#db.prepare(`SELECT branch.conversation_id AS conversationId,
      branch.head_message_id AS headMessageId, branch.deleted_at_ms AS deletedAtMs,
      branch.updated_at_ms AS branchUpdatedAtMs, conversation.updated_at_ms AS conversationUpdatedAtMs,
      source.parent_message_id AS sourceParentMessageId, choice.chosen_answer_root_id AS chosenAnswerRootId,
      answer.status AS answerStatus, hidden.question_id AS hiddenQuestionId
      FROM branch_v2 AS branch
      JOIN conversation_v2 AS conversation ON conversation.conversation_id=branch.conversation_id
      JOIN message_v2 AS source ON source.message_id=? AND source.conversation_id=branch.conversation_id
        AND source.role='user' AND source.status='completed'
      JOIN branch_choice_v2 AS choice ON choice.branch_id=branch.branch_id
        AND choice.question_id=source.message_id AND choice.conversation_id=branch.conversation_id
      JOIN message_v2 AS answer ON answer.message_id=choice.chosen_answer_root_id
        AND answer.conversation_id=branch.conversation_id AND answer.question_id=source.message_id
        AND answer.role='assistant' AND answer.answer_root_id=answer.message_id
      LEFT JOIN branch_question_hide_v2 AS hidden ON hidden.branch_id=branch.branch_id
        AND hidden.question_id=source.message_id
      WHERE branch.branch_id=?`).get(sourceQuestionId.value, branchId.value) as
      Readonly<Record<string, unknown>> | undefined
    if (!row || typeof row.conversationId !== 'string') {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_NOT_FOUND')
    }
    if (row.chosenAnswerRootId !== sourceAnswerRootId.value) {
      throw new ConversationGraphV2RepoError('STALE_CHOSEN_ANSWER')
    }
    if (row.headMessageId !== expectedHeadMessageId.value || row.headMessageId !== sourceAnswerRootId.value ||
        row.deletedAtMs !== null || row.hiddenQuestionId !== null ||
        !['completed', 'failed', 'cancelled'].includes(row.answerStatus as string)) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD')
    }
    if ((row.sourceParentMessageId !== null && typeof row.sourceParentMessageId !== 'string') ||
        !Number.isSafeInteger(row.branchUpdatedAtMs) || !Number.isSafeInteger(row.conversationUpdatedAtMs) ||
        createdAtMs < (row.branchUpdatedAtMs as number) || createdAtMs < (row.conversationUpdatedAtMs as number)) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    const ordinalRow = this.#db.prepare('SELECT MAX(ordinal) AS maxOrdinal FROM message_v2 WHERE conversation_id=?')
      .get(row.conversationId) as { maxOrdinal: unknown }
    if (!Number.isSafeInteger(ordinalRow.maxOrdinal) || (ordinalRow.maxOrdinal as number) >= Number.MAX_SAFE_INTEGER - 1) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    const questionOrdinal = (ordinalRow.maxOrdinal as number) + 1
    const answerOrdinal = questionOrdinal + 1
    try {
      const insert = this.#db.prepare(`INSERT INTO message_v2 (
        message_id, conversation_id, role, status, parent_message_id, question_id,
        answer_root_id, ordinal, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      insert.run(questionId.value, row.conversationId, 'user', 'completed', row.sourceParentMessageId,
        null, null, questionOrdinal, createdAtMs, createdAtMs)
      this.#db.prepare('UPDATE message_body_v2 SET body_text=? WHERE message_id=?').run(userBody, questionId.value)
      insert.run(answerRootId.value, row.conversationId, 'assistant', 'streaming', questionId.value,
        questionId.value, answerRootId.value, answerOrdinal, createdAtMs, createdAtMs)
    } catch (error) { mapConstraint(error) }
    const pending = Object.freeze({
      trust: 'pending_edited_turn_v2' as const,
      operationId,
      mode,
      conversationId: ConversationGraphV2Identity.create('conversation_id', row.conversationId),
      branchId,
      sourceQuestionId,
      sourceAnswerRootId,
      expectedHeadMessageId,
      questionId,
      answerRootId,
      userBody,
      questionOrdinal,
      answerOrdinal,
      createdAtMs,
    })
    pendingEditedTurns.add(pending)
    pendingEditedTurnContexts.set(pending, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => {
        const exact = this.#db.prepare(`SELECT operation.action_kind AS actionKind,
          operation.question_id AS operationQuestionId,
          operation.result_answer_root_id AS resultAnswerRootId,
          snapshot.answer_root_id AS snapshotAnswerRootId,
          choice.chosen_answer_root_id AS chosenAnswerRootId,
          branch.head_message_id AS headMessageId,
          hidden.question_id AS hiddenQuestionId
          FROM generation_operation_v2 AS operation
          JOIN assistant_generation_snapshot_v2 AS snapshot ON snapshot.operation_id=operation.operation_id
            AND snapshot.answer_root_id=operation.result_answer_root_id
          JOIN branch_v2 AS branch ON branch.branch_id=operation.branch_id
          JOIN branch_choice_v2 AS choice ON choice.branch_id=operation.branch_id
            AND choice.question_id=operation.question_id
          LEFT JOIN branch_question_hide_v2 AS hidden ON hidden.branch_id=operation.branch_id
            AND hidden.question_id=?
          WHERE operation.operation_id=?`).get(sourceQuestionId.value, operationId.value) as
          Readonly<Record<string, unknown>> | undefined
        const hiddenExpected = mode === 'replace' ? sourceQuestionId.value : null
        if (!exact || exact.actionKind !== 'edit_resend' || exact.operationQuestionId !== questionId.value ||
            exact.resultAnswerRootId !== answerRootId.value || exact.snapshotAnswerRootId !== answerRootId.value ||
            exact.chosenAnswerRootId !== answerRootId.value || exact.headMessageId !== answerRootId.value ||
            exact.hiddenQuestionId !== hiddenExpected) {
          throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
        }
      },
      committed: () => {
        pendingEditedTurns.delete(pending)
        pendingEditedTurnContexts.delete(pending)
      },
      rolledBack: () => {
        pendingEditedTurns.delete(pending)
        pendingEditedTurnContexts.delete(pending)
      },
    })
    return pending
  }

  commitEditedTurnProjection(
    context: GenerationV2AuthorityTransactionContextV2,
    pending: PendingEditedTurnV2,
  ): BranchProjectionV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isPendingEditedTurnForContextV2(pending, context)) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
    }
    try {
      this.#db.prepare(`INSERT INTO branch_choice_v2 (
        branch_id, conversation_id, question_id, chosen_answer_root_id, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?)`).run(
        pending.branchId.value, pending.conversationId.value, pending.questionId.value,
        pending.answerRootId.value, pending.createdAtMs,
      )
      const branch = this.#db.prepare(`UPDATE branch_v2 SET head_message_id=?, updated_at_ms=?
        WHERE branch_id=? AND conversation_id=? AND head_message_id=? AND deleted_at_ms IS NULL`).run(
        pending.answerRootId.value, pending.createdAtMs, pending.branchId.value,
        pending.conversationId.value, pending.expectedHeadMessageId.value,
      )
      const conversation = this.#db.prepare(`UPDATE conversation_v2 SET updated_at_ms=?
        WHERE conversation_id=? AND updated_at_ms<=?`).run(
        pending.createdAtMs, pending.conversationId.value, pending.createdAtMs,
      )
      if (branch.changes !== 1 || conversation.changes !== 1) {
        throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
      }
      if (pending.mode === 'replace') {
        this.#db.prepare(`INSERT INTO branch_question_hide_v2 (
          branch_id, conversation_id, question_id, hidden_at_ms
        ) VALUES (?, ?, ?, ?)`).run(
          pending.branchId.value, pending.conversationId.value,
          pending.sourceQuestionId.value, pending.createdAtMs,
        )
      }
    } catch (error) {
      if (error instanceof ConversationGraphV2RepoError) throw error
      mapConstraint(error)
    }
    return this.#readProjection(pending.branchId.value, pending.questionId.value)
  }

  beginAnswerAction(
    context: GenerationV2AuthorityTransactionContextV2,
    value: unknown,
  ): PendingAnswerActionV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const input = closedObject(value, [
      'operationId', 'actionKind', 'branchId', 'questionId', 'targetAnswerRootId',
      'expectedHeadMessageId', 'answerRootId', 'createdAtMs',
    ])
    const operationId = GenerationV2Identity.create('operation_id', requiredString(input.operationId))
    if (input.actionKind !== 'regenerate_question' && input.actionKind !== 'retry_as_new' &&
        input.actionKind !== 'retry_replace') {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
    }
    const actionKind = input.actionKind
    const branchId = ConversationGraphV2Identity.create('branch_id', requiredString(input.branchId))
    const questionId = ConversationGraphV2Identity.create('question_id', requiredString(input.questionId))
    const targetAnswerRootId = input.targetAnswerRootId === null ? null :
      ConversationGraphV2Identity.create('answer_root_id', requiredString(input.targetAnswerRootId))
    const expectedHeadMessageId = ConversationGraphV2Identity.create(
      'message_id', requiredString(input.expectedHeadMessageId),
    )
    const answerRootId = ConversationGraphV2Identity.create('answer_root_id', requiredString(input.answerRootId))
    const createdAtMs = safeTime(input.createdAtMs)
    if ((actionKind === 'regenerate_question') !== (targetAnswerRootId === null)) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
    }
    const row = this.#db.prepare(`SELECT branch.conversation_id AS conversationId,
      branch.head_message_id AS headMessageId, branch.deleted_at_ms AS deletedAtMs,
      branch.updated_at_ms AS branchUpdatedAtMs, conversation.updated_at_ms AS conversationUpdatedAtMs,
      choice.chosen_answer_root_id AS chosenAnswerRootId, answer.status AS answerStatus,
      hidden.answer_root_id AS hiddenAnswerRootId, question_hidden.question_id AS hiddenQuestionId
      FROM branch_v2 AS branch
      JOIN conversation_v2 AS conversation ON conversation.conversation_id=branch.conversation_id
      JOIN message_v2 AS question ON question.message_id=? AND question.conversation_id=branch.conversation_id
        AND question.role='user' AND question.status='completed'
      JOIN branch_choice_v2 AS choice ON choice.branch_id=branch.branch_id
        AND choice.question_id=question.message_id AND choice.conversation_id=branch.conversation_id
      JOIN message_v2 AS answer ON answer.message_id=choice.chosen_answer_root_id
        AND answer.conversation_id=branch.conversation_id AND answer.question_id=question.message_id
        AND answer.role='assistant' AND answer.answer_root_id=answer.message_id
      LEFT JOIN branch_answer_hide_v2 AS hidden ON hidden.branch_id=branch.branch_id
        AND hidden.question_id=question.message_id AND hidden.answer_root_id=answer.answer_root_id
      LEFT JOIN branch_question_hide_v2 AS question_hidden ON question_hidden.branch_id=branch.branch_id
        AND question_hidden.question_id=question.message_id
      WHERE branch.branch_id=?`).get(questionId.value, branchId.value) as Readonly<Record<string, unknown>> | undefined
    if (!row || typeof row.conversationId !== 'string') {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_NOT_FOUND')
    }
    if (targetAnswerRootId && row.chosenAnswerRootId !== targetAnswerRootId.value) {
      throw new ConversationGraphV2RepoError('STALE_CHOSEN_ANSWER')
    }
    if (row.headMessageId !== expectedHeadMessageId.value) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD')
    }
    if (row.deletedAtMs !== null || row.hiddenAnswerRootId !== null || row.hiddenQuestionId !== null ||
        typeof row.chosenAnswerRootId !== 'string' || row.headMessageId !== row.chosenAnswerRootId ||
        !['completed', 'failed', 'cancelled'].includes(row.answerStatus as string)) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD')
    }
    if (!Number.isSafeInteger(row.branchUpdatedAtMs) || !Number.isSafeInteger(row.conversationUpdatedAtMs) ||
        createdAtMs < (row.branchUpdatedAtMs as number) || createdAtMs < (row.conversationUpdatedAtMs as number)) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
    }
    const ordinalRow = this.#db.prepare('SELECT MAX(ordinal) AS maxOrdinal FROM message_v2 WHERE conversation_id=?')
      .get(row.conversationId) as { maxOrdinal: unknown }
    if (!Number.isSafeInteger(ordinalRow.maxOrdinal) || (ordinalRow.maxOrdinal as number) >= Number.MAX_SAFE_INTEGER) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    const answerOrdinal = (ordinalRow.maxOrdinal as number) + 1
    try {
      this.#db.prepare(`INSERT INTO message_v2 (
        message_id, conversation_id, role, status, parent_message_id, question_id,
        answer_root_id, ordinal, created_at_ms, updated_at_ms
      ) VALUES (?, ?, 'assistant', 'streaming', ?, ?, ?, ?, ?, ?)`).run(
        answerRootId.value, row.conversationId, questionId.value, questionId.value,
        answerRootId.value, answerOrdinal, createdAtMs, createdAtMs,
      )
    } catch (error) { mapConstraint(error) }
    const pending = Object.freeze({
      trust: 'pending_answer_action_v2' as const,
      operationId,
      actionKind,
      conversationId: ConversationGraphV2Identity.create('conversation_id', row.conversationId),
      branchId,
      questionId,
      targetAnswerRootId,
      expectedHeadMessageId,
      answerRootId,
      answerOrdinal,
      createdAtMs,
    })
    pendingAnswerActions.add(pending)
    pendingAnswerActionContexts.set(pending, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => {
        const exact = this.#db.prepare(`SELECT operation.action_kind AS actionKind,
          operation.target_answer_root_id AS targetAnswerRootId,
          operation.result_answer_root_id AS resultAnswerRootId,
          snapshot.answer_root_id AS snapshotAnswerRootId,
          choice.chosen_answer_root_id AS chosenAnswerRootId,
          branch.head_message_id AS headMessageId,
          hidden.answer_root_id AS hiddenAnswerRootId
          FROM generation_operation_v2 AS operation
          JOIN assistant_generation_snapshot_v2 AS snapshot ON snapshot.operation_id=operation.operation_id
            AND snapshot.answer_root_id=operation.result_answer_root_id
          JOIN branch_v2 AS branch ON branch.branch_id=operation.branch_id
          JOIN branch_choice_v2 AS choice ON choice.branch_id=operation.branch_id
            AND choice.question_id=operation.question_id
          LEFT JOIN branch_answer_hide_v2 AS hidden ON hidden.branch_id=operation.branch_id
            AND hidden.question_id=operation.question_id
            AND hidden.answer_root_id=operation.target_answer_root_id
          WHERE operation.operation_id=?`).get(operationId.value) as Readonly<Record<string, unknown>> | undefined
        const hiddenExpected = actionKind === 'retry_replace' ? targetAnswerRootId?.value : null
        if (!exact || exact.actionKind !== actionKind ||
            (exact.targetAnswerRootId !== targetAnswerRootId?.value &&
              !(exact.targetAnswerRootId === null && targetAnswerRootId === null)) ||
            exact.resultAnswerRootId !== answerRootId.value || exact.snapshotAnswerRootId !== answerRootId.value ||
            exact.chosenAnswerRootId !== answerRootId.value || exact.headMessageId !== answerRootId.value ||
            exact.hiddenAnswerRootId !== hiddenExpected) {
          throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
        }
      },
      committed: () => {
        pendingAnswerActions.delete(pending)
        pendingAnswerActionContexts.delete(pending)
      },
      rolledBack: () => {
        pendingAnswerActions.delete(pending)
        pendingAnswerActionContexts.delete(pending)
      },
    })
    return pending
  }

  commitAnswerActionProjection(
    context: GenerationV2AuthorityTransactionContextV2,
    pending: PendingAnswerActionV2,
  ): BranchProjectionV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isPendingAnswerActionForContextV2(pending, context)) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
    }
    try {
      const choice = this.#db.prepare(`UPDATE branch_choice_v2 SET chosen_answer_root_id=?, updated_at_ms=?
        WHERE branch_id=? AND conversation_id=? AND question_id=?`).run(
        pending.answerRootId.value, pending.createdAtMs, pending.branchId.value,
        pending.conversationId.value, pending.questionId.value,
      )
      const branch = this.#db.prepare(`UPDATE branch_v2 SET head_message_id=?, updated_at_ms=?
        WHERE branch_id=? AND conversation_id=? AND deleted_at_ms IS NULL`).run(
        pending.answerRootId.value, pending.createdAtMs, pending.branchId.value, pending.conversationId.value,
      )
      const conversation = this.#db.prepare(`UPDATE conversation_v2 SET updated_at_ms=?
        WHERE conversation_id=? AND updated_at_ms<=?`).run(
        pending.createdAtMs, pending.conversationId.value, pending.createdAtMs,
      )
      if (choice.changes !== 1 || branch.changes !== 1 || conversation.changes !== 1) {
        throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
      }
      if (pending.actionKind === 'retry_replace') {
        this.#db.prepare(`INSERT INTO branch_answer_hide_v2 (
          branch_id, conversation_id, question_id, answer_root_id, hidden_at_ms
        ) VALUES (?, ?, ?, ?, ?)`).run(
          pending.branchId.value, pending.conversationId.value, pending.questionId.value,
          pending.targetAnswerRootId!.value, pending.createdAtMs,
        )
      }
    } catch (error) {
      if (error instanceof ConversationGraphV2RepoError) throw error
      mapConstraint(error)
    }
    return this.#readProjection(pending.branchId.value, pending.questionId.value)
  }

  getBranchProjection(branchIdValue: string, questionIdValue: string): BranchProjectionV2 {
    if (this.#db.inTransaction) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    return this.#readProjection(branchIdValue, questionIdValue)
  }

  compareAndSetStreamingAssistantBody(
    context: GenerationV2AuthorityTransactionContextV2,
    answerRootIdValue: string,
    expectedBody: string,
    nextBody: string,
    updatedAtMs: number,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const answerRootId = ConversationGraphV2Identity.create('answer_root_id', answerRootIdValue)
    const expected = boundedText(expectedBody, MAX_BODY_BYTES)
    const next = boundedText(nextBody, MAX_BODY_BYTES)
    const at = safeTime(updatedAtMs)
    const result = this.#db.prepare(`UPDATE message_body_v2 SET body_text=?
      WHERE message_id=? AND body_text=? AND EXISTS (
        SELECT 1 FROM message_v2 AS answer
        WHERE answer.message_id=message_body_v2.message_id
          AND answer.role='assistant' AND answer.answer_root_id=answer.message_id
          AND answer.status='streaming' AND answer.updated_at_ms<=?
      )`).run(next, answerRootId.value, expected, at)
    if (result.changes !== 1) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    const status = this.#db.prepare(`UPDATE message_v2 SET updated_at_ms=?
      WHERE message_id=? AND role='assistant' AND answer_root_id=message_id
        AND status='streaming' AND updated_at_ms<=?`).run(at, answerRootId.value, at)
    if (status.changes !== 1) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
  }

  terminalizeAssistantMessage(
    context: GenerationV2AuthorityTransactionContextV2,
    answerRootIdValue: string,
    status: 'completed' | 'failed' | 'cancelled',
    finalBody: string | null,
    updatedAtMs: number,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const answerRootId = ConversationGraphV2Identity.create('answer_root_id', answerRootIdValue)
    const at = safeTime(updatedAtMs)
    if (status === 'completed') {
      const body = boundedText(finalBody, MAX_BODY_BYTES)
      const bodyResult = this.#db.prepare(`UPDATE message_body_v2 SET body_text=?
        WHERE message_id=? AND EXISTS (
          SELECT 1 FROM message_v2 AS answer WHERE answer.message_id=message_body_v2.message_id
            AND answer.role='assistant' AND answer.answer_root_id=answer.message_id
            AND answer.status='streaming'
        )`).run(body, answerRootId.value)
      if (bodyResult.changes !== 1) {
        throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
      }
    } else if (finalBody !== null) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_INPUT_INVALID')
    }
    const result = this.#db.prepare(`UPDATE message_v2 SET status=?, updated_at_ms=?
      WHERE message_id=? AND role='assistant' AND answer_root_id=message_id
        AND status='streaming' AND updated_at_ms<=?`).run(status, at, answerRootId.value, at)
    if (result.changes !== 1) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
  }

  getInitialSendReplayProjection(operationIdValue: string): InitialSendReplayProjectionV2 {
    if (this.#db.inTransaction) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    return this.#readGenerationReplayProjection(operationIdValue, 'initial_send')
  }

  getInitialSendReplayProjectionInTransaction(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
  ): InitialSendReplayProjectionV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    return this.#readGenerationReplayProjection(operationIdValue, 'initial_send')
  }

  getGenerationReplayProjectionInTransaction(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
  ): GenerationReplayProjectionV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    return this.#readGenerationReplayProjection(operationIdValue)
  }

  #readGenerationReplayProjection(
    operationIdValue: string,
    requiredAction?: 'initial_send',
  ): GenerationReplayProjectionV2 {
    const operationId = GenerationV2Identity.create('operation_id', operationIdValue)
    const row = this.#db.prepare(`SELECT branch_id AS branchId, question_id AS questionId,
      result_answer_root_id AS resultAnswerRootId FROM generation_operation_v2
      WHERE operation_id=?`).get(operationId.value) as
      { branchId: unknown; questionId: unknown; resultAnswerRootId: unknown; actionKind?: unknown } | undefined
    if (requiredAction) {
      const action = this.#db.prepare('SELECT action_kind AS actionKind FROM generation_operation_v2 WHERE operation_id=?')
        .get(operationId.value) as { actionKind: unknown } | undefined
      if (!action || action.actionKind !== requiredAction) {
        throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_NOT_FOUND')
      }
    }
    if (!row || typeof row.branchId !== 'string' || typeof row.questionId !== 'string' ||
        typeof row.resultAnswerRootId !== 'string') {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_NOT_FOUND')
    }
    const projection = this.#readProjection(row.branchId, row.questionId)
    const candidates = this.#db.prepare(`SELECT answer.answer_root_id AS answerRootId
      FROM message_v2 AS answer
      LEFT JOIN branch_answer_hide_v2 AS hidden
        ON hidden.branch_id=? AND hidden.question_id=answer.question_id
       AND hidden.answer_root_id=answer.answer_root_id
      WHERE answer.conversation_id=? AND answer.question_id=? AND answer.role='assistant'
        AND answer.answer_root_id IS NOT NULL AND hidden.answer_root_id IS NULL
      ORDER BY answer.ordinal ASC, answer.answer_root_id ASC`).all(
      projection.branchId.value, projection.conversationId.value, projection.questionId.value,
    ) as { answerRootId: unknown }[]
    if (candidates.some((candidate) => typeof candidate.answerRootId !== 'string')) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    const visibleCandidates = Object.freeze(candidates.map((candidate) =>
      ConversationGraphV2Identity.create('answer_root_id', candidate.answerRootId as string)))
    const questionCandidates = this.#db.prepare(`SELECT candidate.message_id AS questionId
      FROM message_v2 AS selected
      JOIN message_v2 AS candidate ON candidate.conversation_id=selected.conversation_id
        AND candidate.role='user' AND candidate.status='completed'
        AND candidate.parent_message_id IS selected.parent_message_id
      LEFT JOIN branch_question_hide_v2 AS hidden
        ON hidden.branch_id=? AND hidden.question_id=candidate.message_id
      WHERE selected.message_id=? AND selected.conversation_id=? AND selected.role='user'
        AND hidden.question_id IS NULL
      ORDER BY candidate.ordinal ASC, candidate.message_id ASC`).all(
      projection.branchId.value, projection.questionId.value, projection.conversationId.value,
    ) as { questionId: unknown }[]
    if (questionCandidates.some((candidate) => typeof candidate.questionId !== 'string')) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    const visibleQuestionCandidates = Object.freeze(questionCandidates.map((candidate) =>
      ConversationGraphV2Identity.create('question_id', candidate.questionId as string)))
    return Object.freeze({
      resultAnswerRootId: ConversationGraphV2Identity.create('answer_root_id', row.resultAnswerRootId),
      branchProjection: projection,
      visibleCandidates,
      visibleQuestionCandidates,
    })
  }

  #readProjection(branchIdValue: string, questionIdValue: string): BranchProjectionV2 {
    const branchId = ConversationGraphV2Identity.create('branch_id', branchIdValue)
    const questionId = ConversationGraphV2Identity.create('question_id', questionIdValue)
    const row = this.#db.prepare(`SELECT branch.conversation_id AS conversationId,
      branch.head_message_id AS headMessageId, branch.deleted_at_ms AS deletedAtMs,
      choice.chosen_answer_root_id AS chosenAnswerRootId
      FROM branch_v2 AS branch
      JOIN message_v2 AS question
        ON question.message_id=? AND question.conversation_id=branch.conversation_id AND question.role='user'
      LEFT JOIN branch_choice_v2 AS choice
        ON choice.branch_id=branch.branch_id AND choice.question_id=?
      WHERE branch.branch_id=?`).get(questionId.value, questionId.value, branchId.value) as
      { conversationId: unknown; headMessageId: unknown; deletedAtMs: unknown; chosenAnswerRootId: unknown } | undefined
    if (!row) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_NOT_FOUND')
    }
    if (typeof row.conversationId !== 'string' ||
        (row.headMessageId !== null && typeof row.headMessageId !== 'string') ||
        (row.chosenAnswerRootId !== null && typeof row.chosenAnswerRootId !== 'string') ||
        (row.deletedAtMs !== null && (!Number.isSafeInteger(row.deletedAtMs) || (row.deletedAtMs as number) < 0))) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    return Object.freeze({
      branchId,
      conversationId: ConversationGraphV2Identity.create('conversation_id', row.conversationId),
      questionId,
      headMessageId: row.headMessageId === null ? null :
        ConversationGraphV2Identity.create('message_id', row.headMessageId),
      chosenAnswerRootId: row.chosenAnswerRootId === null ? null :
        ConversationGraphV2Identity.create('answer_root_id', row.chosenAnswerRootId),
      deletedAtMs: row.deletedAtMs as number | null,
    })
  }
}
