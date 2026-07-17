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
}>

const pendingTurns = new WeakSet<object>()
const pendingTurnContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()

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

  getBranchProjection(branchIdValue: string, questionIdValue: string): BranchProjectionV2 {
    if (this.#db.inTransaction) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    return this.#readProjection(branchIdValue, questionIdValue)
  }

  getInitialSendReplayProjection(operationIdValue: string): InitialSendReplayProjectionV2 {
    if (this.#db.inTransaction) {
      throw new ConversationGraphV2RepoError('GENERATION_V2_GRAPH_REPOSITORY_STATE_INVALID')
    }
    return this.#readInitialSendReplayProjection(operationIdValue)
  }

  getInitialSendReplayProjectionInTransaction(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
  ): InitialSendReplayProjectionV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    return this.#readInitialSendReplayProjection(operationIdValue)
  }

  #readInitialSendReplayProjection(operationIdValue: string): InitialSendReplayProjectionV2 {
    const operationId = GenerationV2Identity.create('operation_id', operationIdValue)
    const row = this.#db.prepare(`SELECT branch_id AS branchId, question_id AS questionId,
      result_answer_root_id AS resultAnswerRootId FROM generation_operation_v2
      WHERE operation_id=? AND action_kind='initial_send'`).get(operationId.value) as
      { branchId: unknown; questionId: unknown; resultAnswerRootId: unknown } | undefined
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
    return Object.freeze({
      resultAnswerRootId: ConversationGraphV2Identity.create('answer_root_id', row.resultAnswerRootId),
      branchProjection: projection,
      visibleCandidates,
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
