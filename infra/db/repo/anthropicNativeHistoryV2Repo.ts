import type BetterSqlite3 from 'better-sqlite3'
import {
  ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1,
  ANTHROPIC_NATIVE_HISTORY_CODEC_VERSION_V1,
  deserializeAnthropicNativeHistoryArtifactV1,
  isAnthropicNativeHistoryArtifactV1,
  serializeAnthropicNativeHistoryArtifactV1,
  type AnthropicNativeHistoryArtifactV1,
} from '../../../src/next/generation-v2/providers/anthropic/nativeContentBlocksV1'
import type { AnthropicMessagesRequestMessageV1 } from '../../../src/next/generation-v2/providers/anthropic/messagesRequestV1'
import {
  createAnthropicToolResultMessageV1,
  type AnthropicToolResultMessageV1,
} from '../../../src/next/generation-v2/providers/anthropic/toolContinuationContentV1'
import {
  isAnthropicToolContinuationCommandV2,
  type AnthropicToolContinuationCommandV2,
} from '../../../src/next/generation-v2/providers/anthropic/toolContinuationCommandV2'
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
import { GenerationContextProjectionV2Repo } from './generationContextProjectionV2Repo'

export class AnthropicNativeHistoryV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_HISTORY_NOT_FOUND'
    | 'GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID'
    | 'GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID'
    | 'GENERATION_V2_ANTHROPIC_HISTORY_CONFLICT') {
    super(code)
    this.name = 'AnthropicNativeHistoryV2RepoError'
  }
}

export type AnthropicCompletedAnswerArtifactRepositoryFactV2 = Readonly<{
  trust: 'anthropic_completed_answer_artifact_repository_fact_v2'
  operationId: Identity<'operation_id'>
  questionId: GraphIdentity<'question_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  requestSequence: number
  artifact: AnthropicNativeHistoryArtifactV1
}>

export type AnthropicRequestHistoryRepositoryFactV2 = Readonly<{
  trust: 'anthropic_request_history_repository_fact_v2'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  conversationId: GraphIdentity<'conversation_id'>
  questionId: GraphIdentity<'question_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  system: string | null
  messages: readonly (AnthropicMessagesRequestMessageV1 | AnthropicToolResultMessageV1)[]
  requestSequence: number
  toolOutputRecords: readonly Readonly<{
    outputIndex: number
    toolUseId: string
    toolId: string
    content: string
    isError: boolean
    sideEffectPolicy: 'none' | 'confirmation_required_each_execution'
    confirmationState: 'not_required' | 'user_confirmed'
    confirmedAtMs: number | null
  }>[]
}>

type JoinedArtifactRow = Readonly<{
  answerRootId: unknown
  requestSequence: unknown
  operationId: unknown
  artifactKind: unknown
  codecVersion: unknown
  artifactJson: unknown
  artifactHash: unknown
  completionScope: unknown
  requestState: unknown
  requestAnswerRootId: unknown
  requestProviderId: unknown
  operationState: unknown
  operationAnswerRootId: unknown
  questionId: unknown
  messageStatus: unknown
  messageRole: unknown
  messageQuestionId: unknown
  messageAnswerRootId: unknown
}>

const facts = new WeakSet<object>()
const factContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()
const requestFacts = new WeakSet<object>()
const requestFactContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()

function fail(code: AnthropicNativeHistoryV2RepoError['code']): never {
  throw new AnthropicNativeHistoryV2RepoError(code)
}

function statusIsAllowed(
  operationState: unknown,
  messageStatus: unknown,
  artifact: AnthropicNativeHistoryArtifactV1,
  allowActive: boolean,
): boolean {
  if (operationState === 'completed' && messageStatus === 'completed') return true
  return allowActive && operationState === 'streaming' && messageStatus === 'streaming' &&
    artifact.stopReason === 'tool_use'
}

export function isAnthropicCompletedAnswerArtifactRepositoryFactForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is AnthropicCompletedAnswerArtifactRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value) && factContexts.get(value) === context)
}

export function isAnthropicRequestHistoryRepositoryFactForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is AnthropicRequestHistoryRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && requestFacts.has(value) && requestFactContexts.get(value) === context)
}

export class AnthropicNativeHistoryV2Repo {
  readonly #db: BetterSqlite3.Database

  constructor(db: BetterSqlite3.Database) {
    this.#db = db
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }
  }

  #systemForQuestion(conversationId: string, questionId: string): string | null {
    const rows = this.#db.prepare(`WITH RECURSIVE lineage(message_id,parent_message_id) AS (
      SELECT message_id,parent_message_id FROM message_v2 WHERE message_id=? AND conversation_id=?
      UNION ALL SELECT parent.message_id,parent.parent_message_id FROM message_v2 AS parent
      JOIN lineage AS child ON child.parent_message_id=parent.message_id WHERE parent.conversation_id=?
    ) SELECT body.body_text AS body FROM lineage JOIN message_v2 AS message ON message.message_id=lineage.message_id
      JOIN message_body_v2 AS body ON body.message_id=message.message_id WHERE message.role='system'`).all(
      questionId, conversationId, conversationId,
    ) as readonly Readonly<Record<string, unknown>>[]
    if (rows.length > 1 || (rows.length === 1 && typeof rows[0].body !== 'string')) {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
    }
    return rows.length === 0 ? null : rows[0].body as string
  }

  #completeTurnMessages(
    context: GenerationV2AuthorityTransactionContextV2,
    answerRootId: string,
  ): readonly (AnthropicMessagesRequestMessageV1 | AnthropicToolResultMessageV1)[] {
    const final = this.loadCompletedAnswerArtifact(context, answerRootId)
    const operation = this.#loadOperationIdentity(final.operationId.value)
    if (operation.answerRootId !== answerRootId || operation.questionId !== final.questionId.value) {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
    }
    const question = this.#db.prepare(`SELECT body_text AS body FROM message_body_v2 WHERE message_id=?`).get(operation.questionId) as
      { body?: unknown } | undefined
    if (typeof question?.body !== 'string') fail('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
    const messages: (AnthropicMessagesRequestMessageV1 | AnthropicToolResultMessageV1)[] = [Object.freeze({
      role: 'user' as const, content: question.body,
    })]
    for (let sequence = 1; sequence <= final.requestSequence; sequence += 1) {
      const artifact = this.#loadArtifactForSequence(context, final.operationId.value, answerRootId, sequence, false).artifact
      messages.push(Object.freeze({ role: 'assistant' as const, content: artifact.assistantMessage.content }))
      if (sequence < final.requestSequence) {
        if (artifact.stopReason !== 'tool_use') fail('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
        messages.push(createAnthropicToolResultMessageV1(this.#loadToolOutputRecords(final.operationId.value, sequence + 1, artifact)))
      } else if (artifact.stopReason === 'tool_use' || artifact.stopReason === 'pause_turn') {
        fail('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
      }
    }
    return Object.freeze(messages)
  }

  loadRequestHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
  ): AnthropicRequestHistoryRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    let operationId: Identity<'operation_id'>
    try { operationId = GenerationV2Identity.create('operation_id', operationIdValue) } catch {
      return fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }
    const operation = this.#db.prepare(`SELECT operation.branch_id AS branchId,
      operation.conversation_id AS conversationId, operation.question_id AS questionId,
      operation.target_answer_id AS answerRootId, operation.state AS operationState,
      answer.status AS answerStatus, question.parent_message_id AS parentMessageId,
      questionBody.body_text AS questionBody
      FROM generation_operation_v2 AS operation
      JOIN branch_v2 AS branch ON branch.branch_id=operation.branch_id
        AND branch.conversation_id=operation.conversation_id
      JOIN message_v2 AS question ON question.message_id=operation.question_id
        AND question.conversation_id=operation.conversation_id AND question.role='user'
      JOIN message_body_v2 AS questionBody ON questionBody.message_id=question.message_id
      JOIN message_v2 AS answer ON answer.message_id=operation.target_answer_id
        AND answer.question_id=question.message_id AND answer.answer_root_id=answer.message_id
      WHERE operation.operation_id=?`).get(operationId.value) as Readonly<Record<string, unknown>> | undefined
    if (!operation || typeof operation.branchId !== 'string' || typeof operation.conversationId !== 'string' ||
        typeof operation.questionId !== 'string' || typeof operation.answerRootId !== 'string' ||
        typeof operation.questionBody !== 'string' ||
        !['committed', 'streaming', 'completed', 'failed', 'cancelled'].includes(operation.operationState as string) ||
        !['streaming', 'completed', 'failed', 'cancelled'].includes(operation.answerStatus as string) ||
        (operation.parentMessageId !== null && typeof operation.parentMessageId !== 'string')) {
      return fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }

    const projection = new GenerationContextProjectionV2Repo(this.#db).load(context, operationId.value)
    const messages: (AnthropicMessagesRequestMessageV1 | AnthropicToolResultMessageV1)[] = []
    for (const turn of projection.turns) {
      if (turn.answerRootId === null) {
        if (turn.questionId !== operation.questionId || turn.mode !== 'included') {
          return fail('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
        }
        messages.push(Object.freeze({ role: 'user' as const, content: operation.questionBody }))
      } else if (turn.mode === 'included') {
        messages.push(...this.#completeTurnMessages(context, turn.answerRootId))
      }
    }
    if (messages.length === 0 || (messages.at(-1) as { role?: unknown } | undefined)?.role !== 'user') {
      return fail('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
    }
    const system = this.#systemForQuestion(operation.conversationId, operation.questionId)
    const fact = Object.freeze({
      trust: 'anthropic_request_history_repository_fact_v2' as const,
      operationId,
      branchId: ConversationGraphV2Identity.create('branch_id', operation.branchId),
      conversationId: ConversationGraphV2Identity.create('conversation_id', operation.conversationId),
      questionId: ConversationGraphV2Identity.create('question_id', operation.questionId),
      answerRootId: ConversationGraphV2Identity.create('answer_root_id', operation.answerRootId),
      system,
      messages: Object.freeze(messages),
      requestSequence: 1,
      toolOutputRecords: Object.freeze([]),
    })
    requestFacts.add(fact)
    requestFactContexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => undefined,
      committed: () => { requestFacts.delete(fact); requestFactContexts.delete(fact) },
      rolledBack: () => { requestFacts.delete(fact); requestFactContexts.delete(fact) },
    })
    return fact
  }

  prepareToolContinuationHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    command: AnthropicToolContinuationCommandV2,
    toolRegistry: ToolRegistryRepositoryFactV2,
    createdAtMs: number,
  ): AnthropicRequestHistoryRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isAnthropicToolContinuationCommandV2(command) ||
        !isToolRegistryRepositoryFactForContextV2(toolRegistry, context) ||
        execution.operation.state !== 'streaming' ||
        execution.operation.operationId.value !== command.operationId.value ||
        execution.operation.branchId.value !== command.branchId.value ||
        execution.operation.targetAnswerId.value !== command.answerRootId.value ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.updatedAtMs) {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }
    const projection = this.#db.prepare(`SELECT branch.head_message_id AS headMessageId,
      choice.chosen_answer_root_id AS chosenAnswerRootId, answer.status AS answerStatus,
      request.state AS requestState
      FROM branch_v2 AS branch
      JOIN branch_choice_v2 AS choice ON choice.branch_id=branch.branch_id AND choice.question_id=?
      JOIN message_v2 AS answer ON answer.message_id=?
      JOIN generation_request_v2 AS request ON request.operation_id=?
        AND request.request_sequence=? AND request.answer_root_id=answer.message_id
      WHERE branch.branch_id=?`).get(
      execution.operation.questionId.value, command.answerRootId.value, command.operationId.value,
      command.priorRequestSequence, command.branchId.value,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!projection || projection.headMessageId !== command.expectedHeadMessageId.value ||
        projection.chosenAnswerRootId !== command.answerRootId.value ||
        projection.answerStatus !== 'streaming' || projection.requestState !== 'completed') {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }
    const prior = this.#loadArtifactForSequence(context, command.operationId.value, command.answerRootId.value,
      command.priorRequestSequence, true)
    if (prior.artifact.stopReason !== 'tool_use') fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    const toolUses = prior.artifact.assistantMessage.content.filter((block) => block.type === 'tool_use')
    if (toolUses.length !== command.toolOutputs.length) fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    const definitions = new Map(toolRegistry.selectedDefinitions.map((definition) => [definition.function.name, definition]))
    const requestSequence = command.priorRequestSequence + 1
    const records = command.toolOutputs.map((output, outputIndex) => {
      const toolUse = toolUses[outputIndex]
      const definition = definitions.get(toolUse.name)
      if (!definition || toolUse.id !== output.toolUseId ||
          (definition.sideEffectPolicy === 'none' && output.userConfirmedExternalSideEffect) ||
          (definition.sideEffectPolicy === 'confirmation_required_each_execution' && !output.userConfirmedExternalSideEffect)) {
        fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
      }
      const confirmationState = definition.sideEffectPolicy === 'none' ? 'not_required' as const : 'user_confirmed' as const
      const existing = this.#db.prepare(`SELECT tool_call_id AS toolUseId, tool_id AS toolId, content,
        is_error AS isError, side_effect_policy AS sideEffectPolicy, confirmation_state AS confirmationState,
        confirmed_at_ms AS confirmedAtMs FROM generation_tool_output_v2
        WHERE operation_id=? AND request_sequence=? AND output_index=?`).get(
        command.operationId.value, requestSequence, outputIndex,
      ) as Readonly<Record<string, unknown>> | undefined
      if (existing && (existing.toolUseId !== output.toolUseId || existing.toolId !== definition.toolId ||
          existing.content !== output.content || existing.isError !== Number(output.isError) ||
          existing.sideEffectPolicy !== definition.sideEffectPolicy || existing.confirmationState !== confirmationState ||
          (definition.sideEffectPolicy === 'none' && existing.confirmedAtMs !== null) ||
          (definition.sideEffectPolicy === 'confirmation_required_each_execution' &&
            (!Number.isSafeInteger(existing.confirmedAtMs) || (existing.confirmedAtMs as number) < 0)))) {
        fail('GENERATION_V2_ANTHROPIC_HISTORY_CONFLICT')
      }
      return Object.freeze({
        outputIndex,
        toolUseId: output.toolUseId,
        toolId: definition.toolId,
        content: output.content,
        isError: output.isError,
        sideEffectPolicy: definition.sideEffectPolicy,
        confirmationState,
        confirmedAtMs: definition.sideEffectPolicy === 'none' ? null : existing
          ? existing.confirmedAtMs as number : createdAtMs,
      })
    })
    const base = this.#loadContinuationMessages(context, command.operationId.value, command.priorRequestSequence)
    const fact = Object.freeze({
      trust: 'anthropic_request_history_repository_fact_v2' as const,
      operationId: execution.operation.operationId,
      branchId: execution.operation.branchId,
      conversationId: execution.operation.conversationId,
      questionId: execution.operation.questionId,
      answerRootId: execution.operation.targetAnswerId,
      system: base.system,
      messages: Object.freeze([...base.messages, Object.freeze({ role: 'assistant' as const, content: prior.artifact.assistantMessage.content }),
        createAnthropicToolResultMessageV1(records)]),
      requestSequence,
      toolOutputRecords: Object.freeze(records),
    })
    return this.#issueRequestFact(context, fact)
  }

  loadPersistedRequestHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
    requestSequence: number,
  ): AnthropicRequestHistoryRepositoryFactV2 {
    if (requestSequence === 1) return this.loadRequestHistory(context, operationIdValue)
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!Number.isSafeInteger(requestSequence) || requestSequence < 2) fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    const operation = this.#loadOperationIdentity(operationIdValue)
    const base = this.#loadContinuationMessages(context, operationIdValue, requestSequence - 1)
    const prior = this.#loadArtifactForSequence(context, operationIdValue, operation.answerRootId, requestSequence - 1, true)
    if (prior.artifact.stopReason !== 'tool_use') fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    const records = this.#loadToolOutputRecords(operationIdValue, requestSequence, prior.artifact)
    const fact = Object.freeze({
      trust: 'anthropic_request_history_repository_fact_v2' as const,
      operationId: GenerationV2Identity.create('operation_id', operationIdValue),
      branchId: ConversationGraphV2Identity.create('branch_id', operation.branchId),
      conversationId: ConversationGraphV2Identity.create('conversation_id', operation.conversationId),
      questionId: ConversationGraphV2Identity.create('question_id', operation.questionId),
      answerRootId: ConversationGraphV2Identity.create('answer_root_id', operation.answerRootId),
      system: base.system,
      messages: Object.freeze([...base.messages, Object.freeze({ role: 'assistant' as const, content: prior.artifact.assistantMessage.content }),
        createAnthropicToolResultMessageV1(records)]),
      requestSequence,
      toolOutputRecords: Object.freeze(records),
    })
    return this.#issueRequestFact(context, fact)
  }

  persistToolContinuationOutputs(
    context: GenerationV2AuthorityTransactionContextV2,
    history: AnthropicRequestHistoryRepositoryFactV2,
    request: GenerationRequestRepositoryFactV2,
    createdAtMs: number,
    allowInsert: boolean,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isAnthropicRequestHistoryRepositoryFactForContextV2(history, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) || history.requestSequence < 2 ||
        history.toolOutputRecords.length === 0 || request.operationId !== history.operationId.value ||
        request.answerRootId !== history.answerRootId.value || request.requestSequence !== history.requestSequence ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < 0) fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    for (const record of history.toolOutputRecords) {
      const existing = this.#db.prepare(`SELECT tool_call_id AS toolUseId, tool_id AS toolId, content,
        is_error AS isError, side_effect_policy AS sideEffectPolicy, confirmation_state AS confirmationState,
        confirmed_at_ms AS confirmedAtMs FROM generation_tool_output_v2
        WHERE operation_id=? AND request_sequence=? AND output_index=?`).get(
        request.operationId, request.requestSequence, record.outputIndex,
      ) as Readonly<Record<string, unknown>> | undefined
      const expected = {
        toolUseId: record.toolUseId, toolId: record.toolId, content: record.content,
        isError: Number(record.isError), sideEffectPolicy: record.sideEffectPolicy,
        confirmationState: record.confirmationState, confirmedAtMs: record.confirmedAtMs,
      }
      if (existing) {
        if (stableSerializeProviderRequestV2(existing) !== stableSerializeProviderRequestV2(expected)) {
          fail('GENERATION_V2_ANTHROPIC_HISTORY_CONFLICT')
        }
      } else {
        if (!allowInsert) fail('GENERATION_V2_ANTHROPIC_HISTORY_CONFLICT')
        this.#db.prepare(`INSERT INTO generation_tool_output_v2 (
          operation_id, request_sequence, answer_root_id, output_index, tool_call_id, tool_id,
          content, is_error, side_effect_policy, confirmation_state, confirmed_at_ms, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
          request.operationId, request.requestSequence, request.answerRootId, record.outputIndex,
          record.toolUseId, record.toolId, record.content, Number(record.isError), record.sideEffectPolicy,
          record.confirmationState, record.confirmedAtMs, createdAtMs,
        )
      }
    }
  }

  insertRequestTerminalArtifact(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    request: GenerationRequestRepositoryFactV2,
    artifact: AnthropicNativeHistoryArtifactV1,
    createdAtMs: number,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) ||
        !isAnthropicNativeHistoryArtifactV1(artifact) || request.providerId !== 'anthropic' ||
        request.operationId !== execution.operation.operationId.value ||
        request.answerRootId !== execution.operation.targetAnswerId.value ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.updatedAtMs) {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }

    const state = this.#db.prepare(`SELECT request.state AS requestState,
      operation.state AS operationState, message.status AS messageStatus,
      operation.question_id AS questionId, message.question_id AS messageQuestionId,
      message.answer_root_id AS messageAnswerRootId
      FROM generation_request_v2 AS request
      JOIN generation_operation_v2 AS operation ON operation.operation_id=request.operation_id
      JOIN message_v2 AS message ON message.message_id=request.answer_root_id
      WHERE request.operation_id=? AND request.request_sequence=? AND request.answer_root_id=?`).get(
      request.operationId, request.requestSequence, request.answerRootId,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!state || state.requestState !== 'completed' ||
        state.messageQuestionId !== state.questionId || state.messageAnswerRootId !== request.answerRootId ||
        !statusIsAllowed(state.operationState, state.messageStatus, artifact, true)) {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }

    const artifactJson = serializeAnthropicNativeHistoryArtifactV1(artifact)
    const existing = this.#db.prepare(`SELECT operation_id AS operationId,
      codec_version AS codecVersion, artifact_json AS artifactJson, artifact_hash AS artifactHash,
      completion_scope AS completionScope
      FROM generation_native_artifact_v2
      WHERE answer_root_id=? AND request_sequence=? AND artifact_kind=?`).get(
      request.answerRootId, request.requestSequence, ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1,
    ) as Readonly<Record<string, unknown>> | undefined
    if (existing) {
      if (existing.operationId !== request.operationId ||
          existing.codecVersion !== artifact.artifactCodecVersion ||
          existing.artifactJson !== artifactJson || existing.artifactHash !== artifact.artifactHash ||
          existing.completionScope !== 'request_terminal') {
        fail('GENERATION_V2_ANTHROPIC_HISTORY_CONFLICT')
      }
      return
    }
    this.#db.prepare(`INSERT INTO generation_native_artifact_v2 (
      answer_root_id, request_sequence, operation_id, artifact_kind, codec_version,
      artifact_json, artifact_hash, created_at_ms, completion_scope
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'request_terminal')`).run(
      request.answerRootId, request.requestSequence, request.operationId,
      artifact.artifactKind, artifact.artifactCodecVersion, artifactJson, artifact.artifactHash, createdAtMs,
    )
  }

  loadCompletedAnswerArtifact(
    context: GenerationV2AuthorityTransactionContextV2,
    answerRootIdValue: string,
    options: Readonly<{ allowActive?: boolean }> = {},
  ): AnthropicCompletedAnswerArtifactRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    let answerRootId: GraphIdentity<'answer_root_id'>
    try { answerRootId = ConversationGraphV2Identity.create('answer_root_id', answerRootIdValue) } catch {
      return fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }
    if (options.allowActive !== undefined && typeof options.allowActive !== 'boolean') {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }
    const rows = this.#db.prepare(`SELECT artifact.answer_root_id AS answerRootId,
      artifact.request_sequence AS requestSequence, artifact.operation_id AS operationId,
      artifact.artifact_kind AS artifactKind, artifact.codec_version AS codecVersion,
      artifact.artifact_json AS artifactJson, artifact.artifact_hash AS artifactHash,
      artifact.completion_scope AS completionScope, request.state AS requestState,
      request.answer_root_id AS requestAnswerRootId, request.provider_id AS requestProviderId,
      operation.state AS operationState, operation.target_answer_id AS operationAnswerRootId,
      operation.question_id AS questionId, message.status AS messageStatus,
      message.role AS messageRole, message.question_id AS messageQuestionId,
      message.answer_root_id AS messageAnswerRootId
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id
        AND request.request_sequence=artifact.request_sequence
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS message ON message.message_id=artifact.answer_root_id
      WHERE artifact.answer_root_id=? AND artifact.artifact_kind=?
        AND artifact.completion_scope='request_terminal'
      ORDER BY artifact.request_sequence DESC LIMIT 1`).all(
      answerRootId.value, ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1,
    ) as JoinedArtifactRow[]
    if (rows.length === 0) fail('GENERATION_V2_ANTHROPIC_HISTORY_NOT_FOUND')
    const row = rows[0]
    if (row.answerRootId !== answerRootId.value || !Number.isSafeInteger(row.requestSequence) ||
        (row.requestSequence as number) < 1 || typeof row.operationId !== 'string' ||
        typeof row.questionId !== 'string' ||
        row.artifactKind !== ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1 ||
        row.codecVersion !== ANTHROPIC_NATIVE_HISTORY_CODEC_VERSION_V1 ||
        typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string' ||
        row.completionScope !== 'request_terminal' || row.requestState !== 'completed' ||
        row.requestProviderId !== 'anthropic' || row.requestAnswerRootId !== answerRootId.value ||
        row.operationAnswerRootId !== answerRootId.value || row.messageRole !== 'assistant' ||
        row.messageQuestionId !== row.questionId || row.messageAnswerRootId !== answerRootId.value) {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }
    let artifact: AnthropicNativeHistoryArtifactV1
    try { artifact = deserializeAnthropicNativeHistoryArtifactV1(row.artifactJson) } catch {
      return fail('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
    }
    if (artifact.artifactHash !== row.artifactHash) {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
    }
    if (!statusIsAllowed(row.operationState, row.messageStatus, artifact, options.allowActive === true)) {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }
    const fact = Object.freeze({
      trust: 'anthropic_completed_answer_artifact_repository_fact_v2' as const,
      operationId: GenerationV2Identity.create('operation_id', row.operationId),
      questionId: ConversationGraphV2Identity.create('question_id', row.questionId),
      answerRootId,
      requestSequence: row.requestSequence as number,
      artifact,
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

  #issueRequestFact(
    context: GenerationV2AuthorityTransactionContextV2,
    fact: AnthropicRequestHistoryRepositoryFactV2,
  ): AnthropicRequestHistoryRepositoryFactV2 {
    requestFacts.add(fact)
    requestFactContexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.#db, {
      preCommit: () => undefined,
      committed: () => { requestFacts.delete(fact); requestFactContexts.delete(fact) },
      rolledBack: () => { requestFacts.delete(fact); requestFactContexts.delete(fact) },
    })
    return fact
  }

  #loadOperationIdentity(operationId: string): Readonly<{
    branchId: string
    conversationId: string
    questionId: string
    answerRootId: string
  }> {
    const row = this.#db.prepare(`SELECT branch_id AS branchId, conversation_id AS conversationId,
      question_id AS questionId, target_answer_id AS answerRootId
      FROM generation_operation_v2 WHERE operation_id=?`).get(operationId) as Readonly<Record<string, unknown>> | undefined
    if (!row || typeof row.branchId !== 'string' || typeof row.conversationId !== 'string' ||
        typeof row.questionId !== 'string' || typeof row.answerRootId !== 'string') {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }
    return Object.freeze({
      branchId: row.branchId, conversationId: row.conversationId, questionId: row.questionId, answerRootId: row.answerRootId,
    })
  }

  #loadArtifactForSequence(
    context: GenerationV2AuthorityTransactionContextV2,
    operationId: string,
    answerRootId: string,
    requestSequence: number,
    allowActive: boolean,
  ): AnthropicCompletedAnswerArtifactRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.#db)
    const rows = this.#db.prepare(`SELECT artifact.answer_root_id AS answerRootId,
      artifact.request_sequence AS requestSequence, artifact.operation_id AS operationId,
      artifact.artifact_kind AS artifactKind, artifact.codec_version AS codecVersion,
      artifact.artifact_json AS artifactJson, artifact.artifact_hash AS artifactHash,
      artifact.completion_scope AS completionScope, request.state AS requestState,
      request.answer_root_id AS requestAnswerRootId, request.provider_id AS requestProviderId,
      operation.state AS operationState, operation.target_answer_id AS operationAnswerRootId,
      operation.question_id AS questionId, message.status AS messageStatus,
      message.role AS messageRole, message.question_id AS messageQuestionId,
      message.answer_root_id AS messageAnswerRootId
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id
        AND request.request_sequence=artifact.request_sequence
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS message ON message.message_id=artifact.answer_root_id
      WHERE artifact.operation_id=? AND artifact.answer_root_id=? AND artifact.request_sequence=?
        AND artifact.artifact_kind=? AND artifact.completion_scope='request_terminal'`).all(
      operationId, answerRootId, requestSequence, ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1,
    ) as JoinedArtifactRow[]
    if (rows.length !== 1) fail('GENERATION_V2_ANTHROPIC_HISTORY_NOT_FOUND')
    const row = rows[0]
    if (row.answerRootId !== answerRootId || row.operationId !== operationId ||
        !Number.isSafeInteger(row.requestSequence) || row.requestSequence !== requestSequence ||
        typeof row.questionId !== 'string' || row.artifactKind !== ANTHROPIC_NATIVE_HISTORY_ARTIFACT_KIND_V1 ||
        row.codecVersion !== ANTHROPIC_NATIVE_HISTORY_CODEC_VERSION_V1 || typeof row.artifactJson !== 'string' ||
        typeof row.artifactHash !== 'string' || row.completionScope !== 'request_terminal' ||
        row.requestState !== 'completed' || row.requestProviderId !== 'anthropic' ||
        row.requestAnswerRootId !== answerRootId || row.operationAnswerRootId !== answerRootId ||
        row.messageRole !== 'assistant' || row.messageQuestionId !== row.questionId ||
        row.messageAnswerRootId !== answerRootId) fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    let artifact: AnthropicNativeHistoryArtifactV1
    try { artifact = deserializeAnthropicNativeHistoryArtifactV1(row.artifactJson) } catch {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_INTEGRITY_INVALID')
    }
    if (artifact.artifactHash !== row.artifactHash || !statusIsAllowed(row.operationState, row.messageStatus, artifact, allowActive)) {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }
    const fact = Object.freeze({
      trust: 'anthropic_completed_answer_artifact_repository_fact_v2' as const,
      operationId: GenerationV2Identity.create('operation_id', operationId),
      questionId: ConversationGraphV2Identity.create('question_id', row.questionId),
      answerRootId: ConversationGraphV2Identity.create('answer_root_id', answerRootId),
      requestSequence,
      artifact,
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

  #loadContinuationMessages(
    context: GenerationV2AuthorityTransactionContextV2,
    operationId: string,
    throughRequestSequence: number,
  ): Readonly<{
    system: string | null
    messages: readonly (AnthropicMessagesRequestMessageV1 | AnthropicToolResultMessageV1)[]
  }> {
    if (!Number.isSafeInteger(throughRequestSequence) || throughRequestSequence < 1) {
      fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    }
    const initial = this.loadRequestHistory(context, operationId)
    const messages: (AnthropicMessagesRequestMessageV1 | AnthropicToolResultMessageV1)[] = [...initial.messages]
    const operation = this.#loadOperationIdentity(operationId)
    for (let sequence = 1; sequence < throughRequestSequence; sequence += 1) {
      const artifact = this.#loadArtifactForSequence(context, operationId, operation.answerRootId, sequence, true).artifact
      if (artifact.stopReason !== 'tool_use') fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
      messages.push(Object.freeze({ role: 'assistant' as const, content: artifact.assistantMessage.content }))
      messages.push(createAnthropicToolResultMessageV1(this.#loadToolOutputRecords(operationId, sequence + 1, artifact)))
    }
    return Object.freeze({ system: initial.system, messages: Object.freeze(messages) })
  }

  #loadToolOutputRecords(
    operationId: string,
    requestSequence: number,
    priorArtifact: AnthropicNativeHistoryArtifactV1,
  ): readonly AnthropicRequestHistoryRepositoryFactV2['toolOutputRecords'][number][] {
    const toolUses = priorArtifact.assistantMessage.content.filter((block) => block.type === 'tool_use')
    if (priorArtifact.stopReason !== 'tool_use' || toolUses.length === 0) fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    const rows = this.#db.prepare(`SELECT output_index AS outputIndex, tool_call_id AS toolUseId, tool_id AS toolId,
      content, is_error AS isError, side_effect_policy AS sideEffectPolicy,
      confirmation_state AS confirmationState, confirmed_at_ms AS confirmedAtMs
      FROM generation_tool_output_v2 WHERE operation_id=? AND request_sequence=? ORDER BY output_index`).all(
      operationId, requestSequence,
    ) as Readonly<Record<string, unknown>>[]
    if (rows.length !== toolUses.length) fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
    return Object.freeze(rows.map((row, index) => {
      if (row.outputIndex !== index || row.toolUseId !== toolUses[index].id || typeof row.toolId !== 'string' ||
          typeof row.content !== 'string' || (row.isError !== 0 && row.isError !== 1) ||
          (row.sideEffectPolicy !== 'none' && row.sideEffectPolicy !== 'confirmation_required_each_execution') ||
          (row.confirmationState !== 'not_required' && row.confirmationState !== 'user_confirmed') ||
          (row.confirmedAtMs !== null && (!Number.isSafeInteger(row.confirmedAtMs) || (row.confirmedAtMs as number) < 0)) ||
          (row.sideEffectPolicy === 'none' && (row.confirmationState !== 'not_required' || row.confirmedAtMs !== null)) ||
          (row.sideEffectPolicy === 'confirmation_required_each_execution' &&
            (row.confirmationState !== 'user_confirmed' || row.confirmedAtMs === null))) {
        fail('GENERATION_V2_ANTHROPIC_HISTORY_STATE_INVALID')
      }
      return Object.freeze({
        outputIndex: index,
        toolUseId: row.toolUseId as string,
        toolId: row.toolId,
        content: row.content,
        isError: row.isError === 1,
        sideEffectPolicy: row.sideEffectPolicy,
        confirmationState: row.confirmationState,
        confirmedAtMs: row.confirmedAtMs as number | null,
      })
    }))
  }
}
