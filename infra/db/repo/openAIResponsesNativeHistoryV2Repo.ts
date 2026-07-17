import type BetterSqlite3 from 'better-sqlite3'
import {
  OPENAI_RESPONSES_ARTIFACT_CODEC_VERSION_V2,
  OPENAI_RESPONSES_ARTIFACT_KIND_V2,
  decodeOpenAIResponsesContinuationArtifactV2,
  type OpenAIResponsesContinuationArtifactV2,
} from '../../../src/next/generation-v2/providers/openai-responses/continuationArtifactV2'
import type { OpenAIResponsesClientItemV1 } from '../../../src/next/generation-v2/providers/openai-responses/nativeItemsV1'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../../src/next/generation-v2/domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../../src/next/generation-v2/domain/identityV2'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  registerGenerationV2AuthorityTransactionParticipantV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'

const MAX_LINEAGE_DEPTH = 4_096

export class OpenAIResponsesNativeHistoryV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_HISTORY_NOT_FOUND'
    | 'GENERATION_V2_OPENAI_HISTORY_STATE_INVALID'
    | 'GENERATION_V2_OPENAI_HISTORY_LINEAGE_INVALID') {
    super(code)
    this.name = 'OpenAIResponsesNativeHistoryV2RepoError'
  }
}

export type OpenAIResponsesRequestHistoryFactV2 = Readonly<{
  trust: 'openai_responses_request_history_repository_fact_v2'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  conversationId: GraphIdentity<'conversation_id'>
  questionId: GraphIdentity<'question_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  priorAnswerRootId: GraphIdentity<'answer_root_id'> | null
  priorArtifact: OpenAIResponsesContinuationArtifactV2 | null
  clientItems: readonly OpenAIResponsesClientItemV1[]
  requestSequence: 1
  lineageDepth: number
}>

type ArtifactRow = Readonly<{
  answerRootId: unknown
  requestSequence: unknown
  operationId: unknown
  artifactKind: unknown
  codecVersion: unknown
  artifactJson: unknown
  artifactHash: unknown
  completionScope: unknown
  requestState: unknown
  operationState: unknown
  answerStatus: unknown
  questionId: unknown
  questionParentMessageId: unknown
}>

const facts = new WeakSet<object>()
const contexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()

function invalid(lineage = false): never {
  throw new OpenAIResponsesNativeHistoryV2RepoError(lineage
    ? 'GENERATION_V2_OPENAI_HISTORY_LINEAGE_INVALID'
    : 'GENERATION_V2_OPENAI_HISTORY_STATE_INVALID')
}

export function isOpenAIResponsesRequestHistoryFactForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is OpenAIResponsesRequestHistoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value) && contexts.get(value) === context)
}

function decodeRow(row: ArtifactRow, requireOperationTerminal: boolean): Readonly<{
  answerRootId: string
  requestSequence: number
  operationId: string
  questionId: string
  questionParentMessageId: string | null
  artifact: OpenAIResponsesContinuationArtifactV2
}> {
  if (typeof row.answerRootId !== 'string' || typeof row.operationId !== 'string' ||
      typeof row.questionId !== 'string' || (row.questionParentMessageId !== null && typeof row.questionParentMessageId !== 'string') ||
      !Number.isSafeInteger(row.requestSequence) || (row.requestSequence as number) < 1 ||
      row.artifactKind !== OPENAI_RESPONSES_ARTIFACT_KIND_V2 ||
      row.codecVersion !== OPENAI_RESPONSES_ARTIFACT_CODEC_VERSION_V2 ||
      typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string' ||
      row.requestState !== 'completed' ||
      (requireOperationTerminal && (row.completionScope !== 'operation_terminal' ||
        row.operationState !== 'completed' || row.answerStatus !== 'completed'))) invalid()
  let artifact: OpenAIResponsesContinuationArtifactV2
  try { artifact = decodeOpenAIResponsesContinuationArtifactV2(JSON.parse(row.artifactJson)) } catch { return invalid(true) }
  if (artifact.artifactHash !== row.artifactHash) return invalid(true)
  return Object.freeze({
    answerRootId: row.answerRootId, requestSequence: row.requestSequence as number,
    operationId: row.operationId, questionId: row.questionId,
    questionParentMessageId: row.questionParentMessageId as string | null, artifact,
  })
}

function exactPrefix(parent: OpenAIResponsesContinuationArtifactV2, child: OpenAIResponsesContinuationArtifactV2): boolean {
  return parent.orderedItems.length < child.orderedItems.length &&
    stableSerializeProviderRequestV2(parent.orderedItems) ===
      stableSerializeProviderRequestV2(child.orderedItems.slice(0, parent.orderedItems.length))
}

export class OpenAIResponsesNativeHistoryV2Repo {
  readonly #db: BetterSqlite3.Database

  constructor(db: BetterSqlite3.Database) {
    this.#db = db
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) invalid()
  }

  #artifactByHash(hash: string): ReturnType<typeof decodeRow> {
    const rows = this.#db.prepare(`SELECT artifact.answer_root_id AS answerRootId,
      artifact.request_sequence AS requestSequence, artifact.operation_id AS operationId,
      artifact.artifact_kind AS artifactKind, artifact.codec_version AS codecVersion,
      artifact.artifact_json AS artifactJson, artifact.artifact_hash AS artifactHash,
      artifact.completion_scope AS completionScope, request.state AS requestState,
      operation.state AS operationState, answer.status AS answerStatus,
      operation.question_id AS questionId, question.parent_message_id AS questionParentMessageId
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id
        AND request.request_sequence=artifact.request_sequence AND request.answer_root_id=artifact.answer_root_id
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
      JOIN message_v2 AS question ON question.message_id=operation.question_id
      WHERE artifact.artifact_kind=? AND artifact.artifact_hash=?`).all(
      OPENAI_RESPONSES_ARTIFACT_KIND_V2, hash,
    ) as ArtifactRow[]
    if (rows.length !== 1) return invalid(true)
    return decodeRow(rows[0], false)
  }

  #loadFinalArtifact(answerRootId: string): OpenAIResponsesContinuationArtifactV2 {
    const rows = this.#db.prepare(`SELECT artifact.answer_root_id AS answerRootId,
      artifact.request_sequence AS requestSequence, artifact.operation_id AS operationId,
      artifact.artifact_kind AS artifactKind, artifact.codec_version AS codecVersion,
      artifact.artifact_json AS artifactJson, artifact.artifact_hash AS artifactHash,
      artifact.completion_scope AS completionScope, request.state AS requestState,
      operation.state AS operationState, answer.status AS answerStatus,
      operation.question_id AS questionId, question.parent_message_id AS questionParentMessageId
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id
        AND request.request_sequence=artifact.request_sequence AND request.answer_root_id=artifact.answer_root_id
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
      JOIN message_v2 AS question ON question.message_id=operation.question_id
      WHERE artifact.answer_root_id=? AND artifact.artifact_kind=?
        AND artifact.completion_scope='operation_terminal'
      ORDER BY artifact.request_sequence DESC`).all(answerRootId, OPENAI_RESPONSES_ARTIFACT_KIND_V2) as ArtifactRow[]
    if (rows.length !== 1) return invalid(true)
    const final = decodeRow(rows[0], true)
    let child = final
    const seen = new Set<string>()
    while (true) {
      if (seen.has(child.artifact.artifactHash) || seen.size >= MAX_LINEAGE_DEPTH ||
          child.artifact.lineageDepth > MAX_LINEAGE_DEPTH) return invalid(true)
      seen.add(child.artifact.artifactHash)
      const parentHash = child.artifact.parentArtifactHash
      if (parentHash === null) {
        if (child.artifact.lineageDepth !== 1) return invalid(true)
        break
      }
      const parent = this.#artifactByHash(parentHash)
      if (parent.artifact.lineageDepth + 1 !== child.artifact.lineageDepth || !exactPrefix(parent.artifact, child.artifact)) {
        return invalid(true)
      }
      if (parent.answerRootId === child.answerRootId) {
        if (parent.operationId !== child.operationId || parent.requestSequence + 1 !== child.requestSequence) return invalid(true)
      } else if (child.requestSequence !== 1 || child.questionParentMessageId !== parent.answerRootId) return invalid(true)
      child = parent
    }
    return final.artifact
  }

  loadRequestHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
  ): OpenAIResponsesRequestHistoryFactV2 {
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
      WHERE operation.operation_id=?`).get(operationId.value) as Record<string, unknown> | undefined
    if (!row) throw new OpenAIResponsesNativeHistoryV2RepoError('GENERATION_V2_OPENAI_HISTORY_NOT_FOUND')
    if (typeof row.branchId !== 'string' || typeof row.conversationId !== 'string' ||
        typeof row.questionId !== 'string' || typeof row.answerRootId !== 'string' ||
        typeof row.questionBody !== 'string' ||
        !['committed', 'streaming', 'completed', 'failed', 'cancelled'].includes(row.operationState as string) ||
        !['streaming', 'completed', 'failed', 'cancelled'].includes(row.answerStatus as string) ||
        ((row.operationState === 'committed' || row.operationState === 'streaming') && row.answerStatus !== 'streaming') ||
        (['completed', 'failed', 'cancelled'].includes(row.operationState as string) && row.answerStatus !== row.operationState)) invalid()
    let priorAnswerRootId: string | null = null
    if (row.parentMessageId === null) {
      if (row.parentRole !== null || row.priorAnswerRootId !== null) invalid()
    } else if (row.parentRole === 'assistant' && typeof row.priorAnswerRootId === 'string' &&
        row.parentMessageId === row.priorAnswerRootId) priorAnswerRootId = row.priorAnswerRootId
    else invalid()
    const priorArtifact = priorAnswerRootId === null ? null : this.#loadFinalArtifact(priorAnswerRootId)
    const clientItems = Object.freeze([Object.freeze({
      role: 'user' as const,
      content: Object.freeze([Object.freeze({ type: 'input_text' as const, text: row.questionBody })]),
    })])
    const fact = Object.freeze({
      trust: 'openai_responses_request_history_repository_fact_v2' as const,
      operationId,
      branchId: ConversationGraphV2Identity.create('branch_id', row.branchId),
      conversationId: ConversationGraphV2Identity.create('conversation_id', row.conversationId),
      questionId: ConversationGraphV2Identity.create('question_id', row.questionId),
      answerRootId: ConversationGraphV2Identity.create('answer_root_id', row.answerRootId),
      priorAnswerRootId: priorAnswerRootId === null ? null : ConversationGraphV2Identity.create('answer_root_id', priorAnswerRootId),
      priorArtifact, clientItems, requestSequence: 1 as const,
      lineageDepth: (priorArtifact?.lineageDepth ?? 0) + 1,
    })
    facts.add(fact); contexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => undefined,
      committed: () => { facts.delete(fact); contexts.delete(fact) },
      rolledBack: () => { facts.delete(fact); contexts.delete(fact) },
    })
    return fact
  }
}
