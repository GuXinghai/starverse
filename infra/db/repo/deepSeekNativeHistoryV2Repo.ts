import type BetterSqlite3 from 'better-sqlite3'
import {
  DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
  DEEPSEEK_NATIVE_HISTORY_CODEC_VERSION_V2,
  decodeDeepSeekNativeHistoryArtifactV2,
  type DeepSeekNativeHistoryArtifactV2,
  type DeepSeekNativeHistoryEntryV1,
} from '../../../src/next/generation-v2/providers/deepseek/nativeMessagesV1'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
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

const MAX_LINEAGE_DEPTH = 4_096

export class DeepSeekNativeHistoryV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_HISTORY_INPUT_INVALID'
    | 'GENERATION_V2_DEEPSEEK_HISTORY_NOT_FOUND'
    | 'GENERATION_V2_DEEPSEEK_HISTORY_STATE_INVALID'
    | 'GENERATION_V2_DEEPSEEK_HISTORY_LINEAGE_INVALID') {
    super(code)
    this.name = 'DeepSeekNativeHistoryV2RepoError'
  }
}

export type DeepSeekInitialSendHistoryRepositoryFactV2 = Readonly<{
  trust: 'deepseek_initial_send_history_repository_fact_v2'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  conversationId: GraphIdentity<'conversation_id'>
  questionId: GraphIdentity<'question_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  priorAnswerRootId: GraphIdentity<'answer_root_id'> | null
  priorArtifact: DeepSeekNativeHistoryArtifactV2 | null
  clientEntries: readonly DeepSeekNativeHistoryEntryV1[]
}>

type ArtifactRow = Readonly<{
  answer_root_id: unknown
  request_sequence: unknown
  operation_id: unknown
  artifact_kind: unknown
  codec_version: unknown
  artifact_json: unknown
  artifact_hash: unknown
  request_state: unknown
  operation_state: unknown
  message_status: unknown
  question_id: unknown
}>

const facts = new WeakSet<object>()
const factContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()

function invalidState(): never {
  throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_STATE_INVALID')
}

function decodeArtifactRow(row: ArtifactRow): Readonly<{
  answerRootId: string
  requestSequence: number
  operationId: string
  questionId: string
  artifact: DeepSeekNativeHistoryArtifactV2
}> {
  if (typeof row.answer_root_id !== 'string' || typeof row.operation_id !== 'string' ||
      typeof row.question_id !== 'string' || !Number.isSafeInteger(row.request_sequence) ||
      (row.request_sequence as number) < 1 || row.artifact_kind !== DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2 ||
      row.codec_version !== DEEPSEEK_NATIVE_HISTORY_CODEC_VERSION_V2 || typeof row.artifact_json !== 'string' ||
      typeof row.artifact_hash !== 'string' || row.request_state !== 'completed' ||
      row.operation_state !== 'completed' || row.message_status !== 'completed') invalidState()
  let artifact: DeepSeekNativeHistoryArtifactV2
  try { artifact = decodeDeepSeekNativeHistoryArtifactV2(JSON.parse(row.artifact_json)) } catch {
    throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_LINEAGE_INVALID')
  }
  if (artifact.artifactHash !== row.artifact_hash) {
    throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_LINEAGE_INVALID')
  }
  return Object.freeze({
    answerRootId: row.answer_root_id,
    requestSequence: row.request_sequence as number,
    operationId: row.operation_id,
    questionId: row.question_id,
    artifact,
  })
}

function exactPrefix(
  parent: DeepSeekNativeHistoryArtifactV2,
  child: DeepSeekNativeHistoryArtifactV2,
): boolean {
  return parent.orderedEntries.length < child.orderedEntries.length &&
    stableSerializeProviderRequestV2(parent.orderedEntries) ===
      stableSerializeProviderRequestV2(child.orderedEntries.slice(0, parent.orderedEntries.length))
}

export function isDeepSeekInitialSendHistoryRepositoryFactForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is DeepSeekInitialSendHistoryRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value) && factContexts.get(value) === context)
}

export class DeepSeekNativeHistoryV2Repo {
  readonly #db: BetterSqlite3.Database

  constructor(db: BetterSqlite3.Database) {
    this.#db = db
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) invalidState()
  }

  loadInitialSendHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
  ): DeepSeekInitialSendHistoryRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const operationId = GenerationV2Identity.create('operation_id', operationIdValue)
    const row = this.#db.prepare(`SELECT operation.branch_id AS branchId,
      operation.conversation_id AS conversationId, operation.question_id AS questionId,
      operation.result_answer_root_id AS answerRootId, operation.state AS operationState,
      question.parent_message_id AS parentMessageId, questionBody.body_text AS questionBody,
      parent.role AS parentRole, parent.answer_root_id AS priorAnswerRootId,
      answer.status AS answerStatus
      FROM generation_operation_v2 AS operation
      JOIN message_v2 AS question ON question.message_id=operation.question_id
        AND question.conversation_id=operation.conversation_id AND question.role='user'
      JOIN message_body_v2 AS questionBody ON questionBody.message_id=question.message_id
      JOIN message_v2 AS answer ON answer.message_id=operation.result_answer_root_id
        AND answer.question_id=question.message_id AND answer.answer_root_id=answer.message_id
      JOIN branch_v2 AS branch ON branch.branch_id=operation.branch_id
        AND branch.conversation_id=operation.conversation_id
      LEFT JOIN message_v2 AS parent ON parent.message_id=question.parent_message_id
        AND parent.conversation_id=operation.conversation_id
      WHERE operation.operation_id=? AND operation.action_kind='initial_send'`).get(operationId.value) as
      Readonly<Record<string, unknown>> | undefined
    if (!row) throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_NOT_FOUND')
    if (typeof row.branchId !== 'string' || typeof row.conversationId !== 'string' ||
        typeof row.questionId !== 'string' || typeof row.answerRootId !== 'string' ||
        typeof row.questionBody !== 'string' ||
        !['committed', 'streaming', 'completed', 'failed', 'cancelled'].includes(row.operationState as string) ||
        !['streaming', 'completed', 'failed', 'cancelled'].includes(row.answerStatus as string)) invalidState()

    let priorAnswerRootId: string | null = null
    const clientEntries: DeepSeekNativeHistoryEntryV1[] = []
    if (row.parentMessageId === null) {
      if (row.parentRole !== null || row.priorAnswerRootId !== null) invalidState()
    } else if (typeof row.parentMessageId !== 'string') invalidState()
    else if (row.parentRole === 'system') {
      if (row.priorAnswerRootId !== null) invalidState()
      const systemBody = this.#db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
        .get(row.parentMessageId) as { body: unknown } | undefined
      if (!systemBody || typeof systemBody.body !== 'string') invalidState()
      clientEntries.push(Object.freeze({
        kind: 'client' as const,
        message: Object.freeze({ role: 'system' as const, content: systemBody.body }),
      }))
    } else if ((row.parentRole === 'assistant' || row.parentRole === 'tool') &&
        typeof row.priorAnswerRootId === 'string') {
      priorAnswerRootId = row.priorAnswerRootId
    } else invalidState()
    clientEntries.push(Object.freeze({
      kind: 'client' as const,
      message: Object.freeze({ role: 'user' as const, content: row.questionBody }),
    }))

    const priorArtifact = priorAnswerRootId === null ? null : this.#loadAndVerifyLineage(priorAnswerRootId)
    const fact = Object.freeze({
      trust: 'deepseek_initial_send_history_repository_fact_v2' as const,
      operationId,
      branchId: ConversationGraphV2Identity.create('branch_id', row.branchId),
      conversationId: ConversationGraphV2Identity.create('conversation_id', row.conversationId),
      questionId: ConversationGraphV2Identity.create('question_id', row.questionId),
      answerRootId: ConversationGraphV2Identity.create('answer_root_id', row.answerRootId),
      priorAnswerRootId: priorAnswerRootId === null ? null :
        ConversationGraphV2Identity.create('answer_root_id', priorAnswerRootId),
      priorArtifact,
      clientEntries: Object.freeze(clientEntries),
    })
    facts.add(fact)
    factContexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => undefined,
      committed: () => {
        facts.delete(fact)
        factContexts.delete(fact)
      },
      rolledBack: () => {
        facts.delete(fact)
        factContexts.delete(fact)
      },
    })
    return fact
  }

  #loadAndVerifyLineage(answerRootId: string): DeepSeekNativeHistoryArtifactV2 {
    const visited = new Set<string>()
    const verify = (currentAnswerRootId: string, expectedRequestSequence?: number): DeepSeekNativeHistoryArtifactV2 => {
      if (visited.size >= MAX_LINEAGE_DEPTH) {
        throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_LINEAGE_INVALID')
      }
      const row = expectedRequestSequence === undefined
        ? this.#db.prepare(`SELECT artifact.*, request.state AS request_state,
            operation.state AS operation_state, answer.status AS message_status,
            operation.question_id AS question_id
            FROM generation_native_artifact_v2 AS artifact
            JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id
              AND request.request_sequence=artifact.request_sequence
              AND request.answer_root_id=artifact.answer_root_id
            JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
              AND operation.result_answer_root_id=artifact.answer_root_id
            JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
            WHERE artifact.answer_root_id=? AND artifact.artifact_kind=?
            ORDER BY artifact.request_sequence DESC LIMIT 1`).get(
          currentAnswerRootId, DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
        ) as ArtifactRow | undefined
        : this.#db.prepare(`SELECT artifact.*, request.state AS request_state,
            operation.state AS operation_state, answer.status AS message_status,
            operation.question_id AS question_id
            FROM generation_native_artifact_v2 AS artifact
            JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id
              AND request.request_sequence=artifact.request_sequence
              AND request.answer_root_id=artifact.answer_root_id
            JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
              AND operation.result_answer_root_id=artifact.answer_root_id
            JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
            WHERE artifact.answer_root_id=? AND artifact.request_sequence=?
              AND artifact.artifact_kind=?`).get(
          currentAnswerRootId, expectedRequestSequence, DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
        ) as ArtifactRow | undefined
      if (!row) throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_NOT_FOUND')
      const decoded = decodeArtifactRow(row)
      const key = `${decoded.operationId}\0${decoded.requestSequence}\0${decoded.answerRootId}`
      if (visited.has(key)) {
        throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_LINEAGE_INVALID')
      }
      visited.add(key)

      let predecessor: DeepSeekNativeHistoryArtifactV2 | null
      if (decoded.requestSequence > 1) {
        predecessor = verify(decoded.answerRootId, decoded.requestSequence - 1)
      } else {
        const parent = this.#db.prepare(`SELECT parent.role AS parentRole,
          parent.answer_root_id AS priorAnswerRootId
          FROM message_v2 AS question
          LEFT JOIN message_v2 AS parent ON parent.message_id=question.parent_message_id
            AND parent.conversation_id=question.conversation_id
          WHERE question.message_id=? AND question.role='user'`).get(decoded.questionId) as
          { parentRole: unknown; priorAnswerRootId: unknown } | undefined
        if (!parent) invalidState()
        if (parent.parentRole === null || parent.parentRole === 'system') predecessor = null
        else if ((parent.parentRole === 'assistant' || parent.parentRole === 'tool') &&
            typeof parent.priorAnswerRootId === 'string') {
          predecessor = verify(parent.priorAnswerRootId)
        } else invalidState()
      }
      if (predecessor === null) {
        if (decoded.artifact.lineageDepth !== 1 || decoded.artifact.parentArtifactHash !== null) {
          throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_LINEAGE_INVALID')
        }
      } else if (decoded.artifact.lineageDepth !== predecessor.lineageDepth + 1 ||
          decoded.artifact.parentArtifactHash !== predecessor.artifactHash ||
          !exactPrefix(predecessor, decoded.artifact)) {
        throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_LINEAGE_INVALID')
      }
      return decoded.artifact
    }
    return verify(answerRootId)
  }
}
