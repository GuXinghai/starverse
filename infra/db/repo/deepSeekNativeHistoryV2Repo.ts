import type BetterSqlite3 from 'better-sqlite3'
import {
  DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
  DEEPSEEK_NATIVE_HISTORY_CODEC_VERSION_V2,
  decodeDeepSeekNativeHistoryArtifactV2,
  isDeepSeekNativeHistoryArtifactV2,
  serializeDeepSeekNativeHistoryArtifactV2,
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
import {
  isGenerationExecutionOperationBundleForContextV2,
  type GenerationExecutionOperationBundleV2,
} from './generationExecutionV2Repo'
import {
  isGenerationRequestRepositoryFactForContextV2,
  type GenerationRequestRepositoryFactV2,
} from './generationRequestV2Repo'
import {
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from './toolRegistryV2Repo'
import {
  isDeepSeekToolContinuationCommandV2,
  type DeepSeekToolContinuationCommandV2,
} from '../../../src/next/generation-v2/providers/deepseek/toolContinuationCommandV2'

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

export type DeepSeekRequestHistoryRepositoryFactV2 = Readonly<{
  trust: 'deepseek_initial_send_history_repository_fact_v2'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  conversationId: GraphIdentity<'conversation_id'>
  questionId: GraphIdentity<'question_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  priorAnswerRootId: GraphIdentity<'answer_root_id'> | null
  priorArtifact: DeepSeekNativeHistoryArtifactV2 | null
  clientEntries: readonly DeepSeekNativeHistoryEntryV1[]
  requestSequence: number
  toolOutputRecords: readonly Readonly<{
    outputIndex: number
    toolCallId: string
    toolId: string
    content: string
    sideEffectPolicy: 'none' | 'confirmation_required_each_execution'
    confirmationState: 'not_required' | 'user_confirmed'
    confirmedAtMs: number | null
  }>[]
}>
export type DeepSeekInitialSendHistoryRepositoryFactV2 = DeepSeekRequestHistoryRepositoryFactV2

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

function decodeArtifactRow(row: ArtifactRow, allowActive = false): Readonly<{
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
      !((row.operation_state === 'completed' && row.message_status === 'completed') ||
        (allowActive && row.operation_state === 'streaming' && row.message_status === 'streaming'))) invalidState()
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

export function isDeepSeekRequestHistoryRepositoryFactForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is DeepSeekRequestHistoryRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value) && factContexts.get(value) === context)
}

export const isDeepSeekInitialSendHistoryRepositoryFactForContextV2 =
  isDeepSeekRequestHistoryRepositoryFactForContextV2

export class DeepSeekNativeHistoryV2Repo {
  readonly #db: BetterSqlite3.Database

  constructor(db: BetterSqlite3.Database) {
    this.#db = db
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) invalidState()
  }

  loadRequestHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
  ): DeepSeekRequestHistoryRepositoryFactV2 {
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
      WHERE operation.operation_id=?`).get(operationId.value) as
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
      requestSequence: 1,
      toolOutputRecords: Object.freeze([]),
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

  prepareToolContinuationHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    command: DeepSeekToolContinuationCommandV2,
    toolRegistry: ToolRegistryRepositoryFactV2,
    createdAtMs: number,
  ): DeepSeekRequestHistoryRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isDeepSeekToolContinuationCommandV2(command) ||
        !isToolRegistryRepositoryFactForContextV2(toolRegistry, context) ||
        execution.operation.state !== 'streaming' ||
        execution.operation.operationId.value !== command.operationId.value ||
        execution.operation.branchId.value !== command.branchId.value ||
        execution.operation.resultAnswerRootId.value !== command.answerRootId.value ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.updatedAtMs) invalidState()
    const projection = this.#db.prepare(`SELECT branch.head_message_id AS headMessageId,
      choice.chosen_answer_root_id AS chosenAnswerRootId, answer.status AS answerStatus,
      request.state AS requestState
      FROM branch_v2 AS branch
      JOIN branch_choice_v2 AS choice ON choice.branch_id=branch.branch_id
        AND choice.question_id=?
      JOIN message_v2 AS answer ON answer.message_id=?
      JOIN generation_request_v2 AS request ON request.operation_id=?
        AND request.request_sequence=? AND request.answer_root_id=answer.message_id
      WHERE branch.branch_id=?`).get(
      execution.operation.questionId.value, command.answerRootId.value, command.operationId.value,
      command.priorRequestSequence, command.branchId.value,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!projection || projection.headMessageId !== command.expectedHeadMessageId.value ||
        projection.chosenAnswerRootId !== command.answerRootId.value ||
        projection.answerStatus !== 'streaming' || projection.requestState !== 'completed') invalidState()

    const artifactRow = this.#db.prepare(`SELECT artifact.answer_root_id,
      artifact.request_sequence, artifact.operation_id, artifact.artifact_kind,
      artifact.codec_version, artifact.artifact_json, artifact.artifact_hash,
      request.state AS request_state, operation.state AS operation_state,
      answer.status AS message_status, operation.question_id AS question_id
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id
        AND request.request_sequence=artifact.request_sequence
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
      WHERE artifact.operation_id=? AND artifact.request_sequence=?
        AND artifact.answer_root_id=? AND artifact.artifact_kind=?`).get(
      command.operationId.value, command.priorRequestSequence, command.answerRootId.value,
      DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
    ) as ArtifactRow | undefined
    if (!artifactRow) invalidState()
    const decoded = decodeArtifactRow(artifactRow, true)
    this.#assertOperationArtifactLineage(
      context, command.operationId.value, command.answerRootId.value,
      command.priorRequestSequence, decoded.artifact,
    )
    const last = decoded.artifact.orderedEntries.at(-1)
    if (!last || last.kind !== 'assistant' || !last.message.tool_calls ||
        last.message.tool_calls.length !== command.toolOutputs.length) invalidState()
    const definitionsByName = new Map(toolRegistry.selectedDefinitions.map((tool) => [tool.function.name, tool]))
    const records = command.toolOutputs.map((output, outputIndex) => {
      const call = last.message.tool_calls![outputIndex]
      const definition = definitionsByName.get(call.function.name)
      if (!definition || call.id !== output.toolCallId ||
          (definition.sideEffectPolicy === 'confirmation_required_each_execution' &&
            !output.userConfirmedExternalSideEffect) ||
          (definition.sideEffectPolicy === 'none' && output.userConfirmedExternalSideEffect)) invalidState()
      const confirmationState = definition.sideEffectPolicy === 'none'
        ? 'not_required' as const
        : 'user_confirmed' as const
      const existing = this.#db.prepare(`SELECT tool_call_id AS toolCallId, tool_id AS toolId,
        content, side_effect_policy AS sideEffectPolicy, confirmation_state AS confirmationState,
        confirmed_at_ms AS confirmedAtMs FROM generation_tool_output_v2
        WHERE operation_id=? AND request_sequence=? AND output_index=?`).get(
        command.operationId.value, command.priorRequestSequence + 1, outputIndex,
      ) as Readonly<Record<string, unknown>> | undefined
      if (existing && (existing.toolCallId !== call.id || existing.toolId !== definition.toolId ||
          existing.content !== output.content || existing.sideEffectPolicy !== definition.sideEffectPolicy ||
          existing.confirmationState !== confirmationState ||
          (definition.sideEffectPolicy === 'none' && existing.confirmedAtMs !== null) ||
          (definition.sideEffectPolicy === 'confirmation_required_each_execution' &&
            (!Number.isSafeInteger(existing.confirmedAtMs) || (existing.confirmedAtMs as number) < 0)))) invalidState()
      return Object.freeze({
        outputIndex, toolCallId: call.id, toolId: definition.toolId, content: output.content,
        sideEffectPolicy: definition.sideEffectPolicy,
        confirmationState,
        confirmedAtMs: definition.sideEffectPolicy === 'none'
          ? null
          : existing ? existing.confirmedAtMs as number : createdAtMs,
      })
    })
    const clientEntries = Object.freeze(records.map((record) => Object.freeze({
      kind: 'client' as const,
      message: Object.freeze({ role: 'tool' as const, content: record.content, tool_call_id: record.toolCallId }),
    })))
    const fact = Object.freeze({
      trust: 'deepseek_initial_send_history_repository_fact_v2' as const,
      operationId: execution.operation.operationId,
      branchId: execution.operation.branchId,
      conversationId: execution.operation.conversationId,
      questionId: execution.operation.questionId,
      answerRootId: execution.operation.resultAnswerRootId,
      priorAnswerRootId: execution.operation.resultAnswerRootId,
      priorArtifact: decoded.artifact,
      clientEntries,
      requestSequence: command.priorRequestSequence + 1,
      toolOutputRecords: Object.freeze(records),
    })
    facts.add(fact)
    factContexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => undefined,
      committed: () => { facts.delete(fact); factContexts.delete(fact) },
      rolledBack: () => { facts.delete(fact); factContexts.delete(fact) },
    })
    return fact
  }

  loadPersistedRequestHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
    requestSequence: number,
  ): DeepSeekRequestHistoryRepositoryFactV2 {
    if (requestSequence === 1) return this.loadRequestHistory(context, operationIdValue)
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!Number.isSafeInteger(requestSequence) || requestSequence < 2) invalidState()
    const executionRow = this.#db.prepare(`SELECT branch_id AS branchId, conversation_id AS conversationId,
      question_id AS questionId, result_answer_root_id AS answerRootId
      FROM generation_operation_v2 WHERE operation_id=?`).get(operationIdValue) as
      Readonly<Record<string, unknown>> | undefined
    if (!executionRow || typeof executionRow.branchId !== 'string' ||
        typeof executionRow.conversationId !== 'string' || typeof executionRow.questionId !== 'string' ||
        typeof executionRow.answerRootId !== 'string') invalidState()
    const artifactRow = this.#db.prepare(`SELECT artifact.answer_root_id,
      artifact.request_sequence, artifact.operation_id, artifact.artifact_kind,
      artifact.codec_version, artifact.artifact_json, artifact.artifact_hash,
      request.state AS request_state, operation.state AS operation_state,
      answer.status AS message_status, operation.question_id AS question_id
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id
        AND request.request_sequence=artifact.request_sequence
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
      WHERE artifact.operation_id=? AND artifact.request_sequence=?
        AND artifact.answer_root_id=? AND artifact.artifact_kind=?`).get(
      operationIdValue, requestSequence - 1, executionRow.answerRootId,
      DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
    ) as ArtifactRow | undefined
    if (!artifactRow) invalidState()
    const priorArtifact = decodeArtifactRow(artifactRow, true).artifact
    this.#assertOperationArtifactLineage(
      context, operationIdValue, executionRow.answerRootId,
      requestSequence - 1, priorArtifact,
    )
    const rows = this.#db.prepare(`SELECT output_index AS outputIndex, tool_call_id AS toolCallId,
      tool_id AS toolId, content, side_effect_policy AS sideEffectPolicy,
      confirmation_state AS confirmationState, confirmed_at_ms AS confirmedAtMs
      FROM generation_tool_output_v2 WHERE operation_id=? AND request_sequence=?
      ORDER BY output_index`).all(operationIdValue, requestSequence) as Readonly<Record<string, unknown>>[]
    const pending = priorArtifact.orderedEntries.at(-1)
    if (!pending || pending.kind !== 'assistant' || !pending.message.tool_calls ||
        rows.length !== pending.message.tool_calls.length) invalidState()
    const records = rows.map((row, index) => {
      if (row.outputIndex !== index || row.toolCallId !== pending.message.tool_calls![index].id ||
          typeof row.toolId !== 'string' || typeof row.content !== 'string' ||
          (row.sideEffectPolicy !== 'none' && row.sideEffectPolicy !== 'confirmation_required_each_execution') ||
          (row.confirmationState !== 'not_required' && row.confirmationState !== 'user_confirmed') ||
          (row.confirmedAtMs !== null && (!Number.isSafeInteger(row.confirmedAtMs) || (row.confirmedAtMs as number) < 0)) ||
          (row.sideEffectPolicy === 'none' &&
            (row.confirmationState !== 'not_required' || row.confirmedAtMs !== null)) ||
          (row.sideEffectPolicy === 'confirmation_required_each_execution' &&
            (row.confirmationState !== 'user_confirmed' || row.confirmedAtMs === null))) {
        invalidState()
      }
      return Object.freeze({
        outputIndex: index, toolCallId: row.toolCallId as string, toolId: row.toolId as string,
        content: row.content as string, sideEffectPolicy: row.sideEffectPolicy,
        confirmationState: row.confirmationState, confirmedAtMs: row.confirmedAtMs as number | null,
      })
    })
    const fact = Object.freeze({
      trust: 'deepseek_initial_send_history_repository_fact_v2' as const,
      operationId: GenerationV2Identity.create('operation_id', operationIdValue),
      branchId: ConversationGraphV2Identity.create('branch_id', executionRow.branchId),
      conversationId: ConversationGraphV2Identity.create('conversation_id', executionRow.conversationId),
      questionId: ConversationGraphV2Identity.create('question_id', executionRow.questionId),
      answerRootId: ConversationGraphV2Identity.create('answer_root_id', executionRow.answerRootId),
      priorAnswerRootId: ConversationGraphV2Identity.create('answer_root_id', executionRow.answerRootId),
      priorArtifact,
      clientEntries: Object.freeze(records.map((record) => Object.freeze({
        kind: 'client' as const,
        message: Object.freeze({ role: 'tool' as const, content: record.content, tool_call_id: record.toolCallId }),
      }))),
      requestSequence,
      toolOutputRecords: Object.freeze(records),
    })
    facts.add(fact)
    factContexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => undefined,
      committed: () => { facts.delete(fact); factContexts.delete(fact) },
      rolledBack: () => { facts.delete(fact); factContexts.delete(fact) },
    })
    return fact
  }

  persistToolContinuationOutputs(
    context: GenerationV2AuthorityTransactionContextV2,
    history: DeepSeekRequestHistoryRepositoryFactV2,
    request: GenerationRequestRepositoryFactV2,
    createdAtMs: number,
    allowInsert: boolean,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isDeepSeekRequestHistoryRepositoryFactForContextV2(history, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) ||
        history.requestSequence < 2 || history.toolOutputRecords.length === 0 ||
        request.operationId !== history.operationId.value || request.answerRootId !== history.answerRootId.value ||
        request.requestSequence !== history.requestSequence) invalidState()
    for (const record of history.toolOutputRecords) {
      const existing = this.#db.prepare(`SELECT tool_call_id AS toolCallId, tool_id AS toolId,
        content, side_effect_policy AS sideEffectPolicy, confirmation_state AS confirmationState,
        confirmed_at_ms AS confirmedAtMs FROM generation_tool_output_v2
        WHERE operation_id=? AND request_sequence=? AND output_index=?`).get(
        request.operationId, request.requestSequence, record.outputIndex,
      ) as Readonly<Record<string, unknown>> | undefined
      const expected = {
        toolCallId: record.toolCallId, toolId: record.toolId, content: record.content,
        sideEffectPolicy: record.sideEffectPolicy, confirmationState: record.confirmationState,
        confirmedAtMs: record.confirmedAtMs,
      }
      if (existing) {
        if (stableSerializeProviderRequestV2(existing) !== stableSerializeProviderRequestV2(expected)) invalidState()
        continue
      }
      if (!allowInsert) invalidState()
      this.#db.prepare(`INSERT INTO generation_tool_output_v2 (
        operation_id, request_sequence, answer_root_id, output_index, tool_call_id, tool_id,
        content, side_effect_policy, confirmation_state, confirmed_at_ms, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        request.operationId, request.requestSequence, request.answerRootId, record.outputIndex,
        record.toolCallId, record.toolId, record.content, record.sideEffectPolicy,
        record.confirmationState, record.confirmedAtMs, createdAtMs,
      )
    }
  }

  loadInitialSendHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
  ): DeepSeekInitialSendHistoryRepositoryFactV2 {
    const fact = this.loadRequestHistory(context, operationIdValue)
    const row = this.#db.prepare('SELECT action_kind AS actionKind FROM generation_operation_v2 WHERE operation_id=?')
      .get(operationIdValue) as { actionKind: unknown } | undefined
    if (!row || row.actionKind !== 'initial_send') {
      throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_STATE_INVALID')
    }
    return fact
  }

  insertRequestTerminalHistoryArtifact(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    request: GenerationRequestRepositoryFactV2,
    artifact: DeepSeekNativeHistoryArtifactV2,
    createdAtMs: number,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) ||
        !isDeepSeekNativeHistoryArtifactV2(artifact) ||
        (execution.operation.state !== 'completed' && execution.operation.state !== 'streaming') ||
        request.operationId !== execution.operation.operationId.value ||
        request.answerRootId !== execution.operation.resultAnswerRootId.value ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.updatedAtMs) {
      throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_STATE_INVALID')
    }
    const canonicalJson = serializeDeepSeekNativeHistoryArtifactV2(artifact)
    const existing = this.#db.prepare(`SELECT operation_id AS operationId, artifact_json AS artifactJson,
      artifact_hash AS artifactHash, codec_version AS codecVersion
      FROM generation_native_artifact_v2
      WHERE answer_root_id=? AND request_sequence=? AND artifact_kind=?`).get(
      request.answerRootId, request.requestSequence, artifact.artifactKind,
    ) as { operationId: unknown; artifactJson: unknown; artifactHash: unknown; codecVersion: unknown } | undefined
    if (existing) {
      if (existing.operationId !== request.operationId || existing.artifactJson !== canonicalJson ||
          existing.artifactHash !== artifact.artifactHash ||
          existing.codecVersion !== artifact.artifactCodecVersion) {
        throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_LINEAGE_INVALID')
      }
      return
    }
    this.#db.prepare(`INSERT INTO generation_native_artifact_v2 (
      answer_root_id, request_sequence, operation_id, artifact_kind, codec_version,
      artifact_json, artifact_hash, created_at_ms, completion_scope
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'request_terminal')`).run(
      request.answerRootId, request.requestSequence, request.operationId, artifact.artifactKind,
      artifact.artifactCodecVersion, canonicalJson, artifact.artifactHash, createdAtMs,
    )
  }

  #assertOperationArtifactLineage(
    context: GenerationV2AuthorityTransactionContextV2,
    operationId: string,
    answerRootId: string,
    requestSequence: number,
    artifact: DeepSeekNativeHistoryArtifactV2,
  ): void {
    if (requestSequence === 1) {
      const base = this.loadRequestHistory(context, operationId)
      const prefix = [...(base.priorArtifact?.orderedEntries ?? []), ...base.clientEntries]
      if (artifact.lineageDepth !== (base.priorArtifact?.lineageDepth ?? 0) + 1 ||
          artifact.parentArtifactHash !== (base.priorArtifact?.artifactHash ?? null) ||
          artifact.orderedEntries.length !== prefix.length + 1 ||
          stableSerializeProviderRequestV2(prefix) !==
            stableSerializeProviderRequestV2(artifact.orderedEntries.slice(0, prefix.length)) ||
          artifact.orderedEntries.at(-1)?.kind !== 'assistant') {
        throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_LINEAGE_INVALID')
      }
      return
    }
    const predecessorRow = this.#db.prepare(`SELECT artifact.answer_root_id,
      artifact.request_sequence, artifact.operation_id, artifact.artifact_kind,
      artifact.codec_version, artifact.artifact_json, artifact.artifact_hash,
      request.state AS request_state, operation.state AS operation_state,
      answer.status AS message_status, operation.question_id AS question_id
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id
        AND request.request_sequence=artifact.request_sequence
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
      WHERE artifact.operation_id=? AND artifact.request_sequence=?
        AND artifact.answer_root_id=? AND artifact.artifact_kind=?`).get(
      operationId, requestSequence - 1, answerRootId, DEEPSEEK_NATIVE_HISTORY_ARTIFACT_KIND_V2,
    ) as ArtifactRow | undefined
    if (!predecessorRow) invalidState()
    const predecessor = decodeArtifactRow(predecessorRow, true).artifact
    this.#assertOperationArtifactLineage(context, operationId, answerRootId, requestSequence - 1, predecessor)
    if (artifact.lineageDepth !== predecessor.lineageDepth + 1 ||
        artifact.parentArtifactHash !== predecessor.artifactHash || !exactPrefix(predecessor, artifact)) {
      throw new DeepSeekNativeHistoryV2RepoError('GENERATION_V2_DEEPSEEK_HISTORY_LINEAGE_INVALID')
    }
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
