import type BetterSqlite3 from 'better-sqlite3'
import {
  OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1,
  decodeOpenRouterNativeHistoryArtifactV1,
  isOpenRouterNativeHistoryArtifactV1,
  type OpenRouterNativeHistoryArtifactV1,
  type OpenRouterNativeMessageV1,
} from '../../../src/next/generation-v2/providers/openrouter/nativeMessagesV1'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../../src/next/generation-v2/domain/conversationGraphV2'
import { GenerationV2Identity, type GenerationV2Identity as Identity } from '../../../src/next/generation-v2/domain/identityV2'
import {
  assertGenerationV2AuthorityTransactionContextV2,
  registerGenerationV2AuthorityTransactionParticipantV2,
  type GenerationV2AuthorityTransactionContextV2,
} from './generationV2AuthorityTransactionInternal'
import { GenerationContextProjectionV2Repo, type GenerationContextProjectionSnapshotV2 } from './generationContextProjectionV2Repo'
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
  isOpenRouterToolContinuationCommandV2,
  type OpenRouterToolContinuationCommandV2,
} from '../../../src/next/generation-v2/providers/openrouter/toolContinuationCommandV2'

export type OpenRouterRequestHistoryRepositoryFactV2 = Readonly<{
  trust: 'openrouter_chat_history_repository_fact_v2'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  conversationId: GraphIdentity<'conversation_id'>
  questionId: GraphIdentity<'question_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  priorArtifact: OpenRouterNativeHistoryArtifactV1 | null
  clientMessages: readonly OpenRouterNativeMessageV1[]
  contextProjection: GenerationContextProjectionSnapshotV2
  projectedPrefixMessages: readonly OpenRouterNativeMessageV1[] | null
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

export class OpenRouterNativeHistoryV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_HISTORY_INPUT_INVALID'
    | 'GENERATION_V2_OPENROUTER_HISTORY_NOT_FOUND'
    | 'GENERATION_V2_OPENROUTER_HISTORY_STATE_INVALID'
    | 'GENERATION_V2_OPENROUTER_HISTORY_LINEAGE_INVALID'
    | 'CONTEXT_TURN_NATIVE_BUNDLE_INCOMPLETE') {
    super(code)
    this.name = 'OpenRouterNativeHistoryV2RepoError'
  }
}

const facts = new WeakSet<object>()
const factContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()

function invalid(): never {
  throw new OpenRouterNativeHistoryV2RepoError('GENERATION_V2_OPENROUTER_HISTORY_STATE_INVALID')
}
function incompleteContextTurn(): never {
  throw new OpenRouterNativeHistoryV2RepoError('CONTEXT_TURN_NATIVE_BUNDLE_INCOMPLETE')
}

export function isOpenRouterRequestHistoryRepositoryFactForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is OpenRouterRequestHistoryRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value) && factContexts.get(value) === context)
}

export class OpenRouterNativeHistoryV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) invalid()
  }

  private systemMessages(conversationId: string, questionId: string): readonly OpenRouterNativeMessageV1[] {
    const rows = this.db.prepare(`WITH RECURSIVE lineage(message_id,parent_message_id) AS (
      SELECT message_id,parent_message_id FROM message_v2 WHERE message_id=? AND conversation_id=?
      UNION ALL SELECT parent.message_id,parent.parent_message_id FROM message_v2 AS parent
      JOIN lineage AS child ON child.parent_message_id=parent.message_id WHERE parent.conversation_id=?
    ) SELECT body.body_text AS body FROM lineage JOIN message_v2 AS message ON message.message_id=lineage.message_id
      JOIN message_body_v2 AS body ON body.message_id=message.message_id WHERE message.role='system'`).all(
      questionId, conversationId, conversationId,
    ) as readonly Readonly<Record<string, unknown>>[]
    if (rows.length > 1 || (rows.length === 1 && typeof rows[0].body !== 'string')) return incompleteContextTurn()
    return rows.length === 0 ? Object.freeze([]) : Object.freeze([Object.freeze({ role: 'system', content: rows[0].body as string })])
  }

  private turnBundle(
    context: GenerationV2AuthorityTransactionContextV2,
    answerRootId: string,
    seen: Set<string>,
  ): readonly OpenRouterNativeMessageV1[] {
    if (seen.has(answerRootId) || seen.size >= 4_096) return incompleteContextTurn()
    seen.add(answerRootId)
    try {
      const operation = this.db.prepare(`SELECT operation_id AS operationId,question_id AS questionId,
        conversation_id AS conversationId,state FROM generation_operation_v2 WHERE target_answer_id=?`).get(answerRootId) as Record<string, unknown> | undefined
      if (!operation || typeof operation.operationId !== 'string' || typeof operation.questionId !== 'string' ||
          typeof operation.conversationId !== 'string' || operation.state !== 'completed') return incompleteContextTurn()
      const artifact = this.loadLatestCompletedArtifact(answerRootId)
      const projection = new GenerationContextProjectionV2Repo(this.db).load(context, operation.operationId)
      const prefix: OpenRouterNativeMessageV1[] = [...this.systemMessages(operation.conversationId, operation.questionId)]
      for (const turn of projection.turns) {
        if (turn.answerRootId === null) break
        if (turn.mode === 'included') prefix.push(...this.turnBundle(context, turn.answerRootId, seen))
      }
      if (prefix.length > artifact.orderedMessages.length ||
          stableSerializeProviderRequestV2(prefix) !== stableSerializeProviderRequestV2(artifact.orderedMessages.slice(0, prefix.length))) return incompleteContextTurn()
      const bundle = Object.freeze(artifact.orderedMessages.slice(prefix.length))
      if (bundle.length < 2 || bundle[0].role !== 'user' || bundle.slice(1).some((message) => message.role === 'user' || message.role === 'system') ||
          bundle.at(-1)?.role !== 'assistant') return incompleteContextTurn()
      const pending: string[] = []
      for (const message of bundle) {
        if (message.role === 'tool') {
          if (typeof message.tool_call_id !== 'string' || pending.shift() !== message.tool_call_id) return incompleteContextTurn()
          continue
        }
        if (pending.length > 0) return incompleteContextTurn()
        if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
          for (const call of message.tool_calls) {
            if (!call || typeof call !== 'object' || Array.isArray(call) || typeof (call as Record<string, unknown>).id !== 'string') return incompleteContextTurn()
            pending.push((call as Record<string, unknown>).id as string)
          }
        }
      }
      if (pending.length > 0) return incompleteContextTurn()
      return bundle
    } catch (error) {
      if (error instanceof OpenRouterNativeHistoryV2RepoError && error.code === 'CONTEXT_TURN_NATIVE_BUNDLE_INCOMPLETE') throw error
      return incompleteContextTurn()
    } finally { seen.delete(answerRootId) }
  }

  private projectedPrefix(
    context: GenerationV2AuthorityTransactionContextV2,
    projection: GenerationContextProjectionSnapshotV2,
    conversationId: string,
    questionId: string,
  ): readonly OpenRouterNativeMessageV1[] {
    const prefix: OpenRouterNativeMessageV1[] = [...this.systemMessages(conversationId, questionId)]
    for (const turn of projection.turns) {
      if (turn.answerRootId === null) break
      if (turn.mode === 'included') prefix.push(...this.turnBundle(context, turn.answerRootId, new Set()))
    }
    return Object.freeze(prefix)
  }

  loadRequestHistory(context: GenerationV2AuthorityTransactionContextV2, operationIdValue: string): OpenRouterRequestHistoryRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const row = this.db.prepare(`SELECT operation.branch_id AS branchId, operation.conversation_id AS conversationId,
      operation.question_id AS questionId, operation.target_answer_id AS answerRootId,
      operation.state AS operationState, question.parent_message_id AS parentMessageId,
      questionBody.body_text AS questionBody, parent.role AS parentRole,
      parent.answer_root_id AS priorAnswerRootId, answer.status AS answerStatus
      FROM generation_operation_v2 AS operation
      JOIN message_v2 AS question ON question.message_id=operation.question_id AND question.role='user'
      JOIN message_body_v2 AS questionBody ON questionBody.message_id=question.message_id
      JOIN message_v2 AS answer ON answer.message_id=operation.target_answer_id AND answer.role='assistant'
      LEFT JOIN message_v2 AS parent ON parent.message_id=question.parent_message_id AND parent.conversation_id=operation.conversation_id
      WHERE operation.operation_id=?`).get(operationIdValue) as Record<string, unknown> | undefined
    if (!row || typeof row.branchId !== 'string' || typeof row.conversationId !== 'string' ||
        typeof row.questionId !== 'string' || typeof row.answerRootId !== 'string' || typeof row.questionBody !== 'string' ||
        !['committed', 'streaming', 'completed', 'failed', 'cancelled'].includes(row.operationState as string) ||
        !['streaming', 'completed', 'failed', 'cancelled'].includes(row.answerStatus as string)) invalid()
    const contextProjection = new GenerationContextProjectionV2Repo(this.db).load(context, operationIdValue)
    const projectionActive = contextProjection.turns.some((turn) => turn.mode === 'excluded')
    const messages: OpenRouterNativeMessageV1[] = []
    let prior: OpenRouterNativeHistoryArtifactV1 | null = null
    if (row.parentMessageId === null) {
      if (row.parentRole !== null || row.priorAnswerRootId !== null) invalid()
    } else if (row.parentRole === 'system') {
      const system = this.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?').get(row.parentMessageId) as { body?: unknown } | undefined
      if (!system || typeof system.body !== 'string') invalid()
      messages.push(Object.freeze({ role: 'system', content: system.body }))
    } else if ((row.parentRole === 'assistant' || row.parentRole === 'tool') && typeof row.priorAnswerRootId === 'string') {
      prior = projectionActive ? null : this.loadLatestCompletedArtifact(row.priorAnswerRootId)
    } else invalid()
    messages.push(Object.freeze({ role: 'user', content: row.questionBody }))
    const fact = Object.freeze({
      trust: 'openrouter_chat_history_repository_fact_v2' as const,
      operationId: GenerationV2Identity.create('operation_id', operationIdValue),
      branchId: ConversationGraphV2Identity.create('branch_id', row.branchId),
      conversationId: ConversationGraphV2Identity.create('conversation_id', row.conversationId),
      questionId: ConversationGraphV2Identity.create('question_id', row.questionId),
      answerRootId: ConversationGraphV2Identity.create('answer_root_id', row.answerRootId),
      priorArtifact: prior,
      clientMessages: Object.freeze(messages),
      contextProjection,
      projectedPrefixMessages: projectionActive
        ? this.projectedPrefix(context, contextProjection, row.conversationId, row.questionId)
        : null,
      requestSequence: 1 as const,
      toolOutputRecords: Object.freeze([]),
    })
    facts.add(fact); factContexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.db, {
      preCommit: () => undefined,
      committed: () => { facts.delete(fact); factContexts.delete(fact) },
      rolledBack: () => { facts.delete(fact); factContexts.delete(fact) },
    })
    return fact
  }

  prepareToolContinuationHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    command: OpenRouterToolContinuationCommandV2,
    toolRegistry: ToolRegistryRepositoryFactV2,
    createdAtMs: number,
  ): OpenRouterRequestHistoryRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isOpenRouterToolContinuationCommandV2(command) ||
        !isToolRegistryRepositoryFactForContextV2(toolRegistry, context) ||
        execution.operation.state !== 'streaming' ||
        execution.operation.operationId.value !== command.operationId.value ||
        execution.operation.branchId.value !== command.branchId.value ||
        execution.operation.targetAnswerId.value !== command.answerRootId.value ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.updatedAtMs) invalid()
    const projection = this.db.prepare(`SELECT branch.head_message_id AS headMessageId,
      choice.chosen_answer_root_id AS chosenAnswerRootId, answer.status AS answerStatus,
      request.state AS requestState
      FROM branch_v2 AS branch
      JOIN branch_choice_v2 AS choice ON choice.branch_id=branch.branch_id AND choice.question_id=?
      JOIN message_v2 AS answer ON answer.message_id=?
      JOIN generation_request_v2 AS request ON request.operation_id=? AND request.request_sequence=?
        AND request.answer_root_id=answer.message_id
      WHERE branch.branch_id=?`).get(
      execution.operation.questionId.value, command.answerRootId.value, command.operationId.value,
      command.priorRequestSequence, command.branchId.value,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!projection || projection.headMessageId !== command.expectedHeadMessageId.value ||
        projection.chosenAnswerRootId !== command.answerRootId.value || projection.answerStatus !== 'streaming' ||
        projection.requestState !== 'completed') invalid()
    const priorArtifact = this.loadOperationArtifact(command.operationId.value, command.answerRootId.value,
      command.priorRequestSequence, true)
    const last = priorArtifact.orderedMessages.at(-1) as Record<string, unknown> | undefined
    const calls = last?.tool_calls
    if (!last || last.role !== 'assistant' || !Array.isArray(calls) || calls.length !== command.toolOutputs.length) invalid()
    const definitionsByName = new Map(toolRegistry.selectedDefinitions.map((tool) => [tool.function.name, tool]))
    const requestSequence = command.priorRequestSequence + 1
    const records = command.toolOutputs.map((output, outputIndex) => {
      const call = calls[outputIndex]
      if (!call || typeof call !== 'object' || Array.isArray(call)) invalid()
      const callRecord = call as Record<string, unknown>
      const fn = callRecord.function
      if (!fn || typeof fn !== 'object' || Array.isArray(fn) || typeof (fn as Record<string, unknown>).name !== 'string') invalid()
      const definition = definitionsByName.get((fn as Record<string, unknown>).name as string)
      if (!definition || callRecord.id !== output.toolCallId ||
          (definition.sideEffectPolicy === 'confirmation_required_each_execution') !== output.userConfirmedExternalSideEffect) invalid()
      const confirmationState = definition.sideEffectPolicy === 'none' ? 'not_required' as const : 'user_confirmed' as const
      const existing = this.db.prepare(`SELECT tool_call_id AS toolCallId, tool_id AS toolId, content,
        side_effect_policy AS sideEffectPolicy, confirmation_state AS confirmationState, confirmed_at_ms AS confirmedAtMs
        FROM generation_tool_output_v2 WHERE operation_id=? AND request_sequence=? AND output_index=?`).get(
        command.operationId.value, requestSequence, outputIndex,
      ) as Readonly<Record<string, unknown>> | undefined
      const confirmedAtMs = definition.sideEffectPolicy === 'none' ? null
        : existing ? existing.confirmedAtMs as number : createdAtMs
      const record = Object.freeze({ outputIndex, toolCallId: output.toolCallId, toolId: definition.toolId,
        content: output.content, sideEffectPolicy: definition.sideEffectPolicy, confirmationState, confirmedAtMs })
      if (existing && stableSerializeProviderRequestV2(existing) !== stableSerializeProviderRequestV2({
        toolCallId: record.toolCallId, toolId: record.toolId, content: record.content,
        sideEffectPolicy: record.sideEffectPolicy, confirmationState: record.confirmationState,
        confirmedAtMs: record.confirmedAtMs,
      })) invalid()
      return record
    })
    return this.issueFact(context, {
      operationId: execution.operation.operationId, branchId: execution.operation.branchId,
      conversationId: execution.operation.conversationId, questionId: execution.operation.questionId,
      answerRootId: execution.operation.targetAnswerId, priorArtifact,
      clientMessages: records.map((record) => Object.freeze({ role: 'tool', tool_call_id: record.toolCallId, content: record.content })),
      contextProjection: new GenerationContextProjectionV2Repo(this.db).load(context, command.operationId.value),
      projectedPrefixMessages: null,
      requestSequence, toolOutputRecords: records,
    })
  }

  loadPersistedRequestHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string,
    requestSequence: number,
  ): OpenRouterRequestHistoryRepositoryFactV2 {
    if (requestSequence === 1) return this.loadRequestHistory(context, operationIdValue)
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!Number.isSafeInteger(requestSequence) || requestSequence < 2) invalid()
    const row = this.db.prepare(`SELECT branch_id AS branchId, conversation_id AS conversationId,
      question_id AS questionId, target_answer_id AS answerRootId
      FROM generation_operation_v2 WHERE operation_id=?`).get(operationIdValue) as Readonly<Record<string, unknown>> | undefined
    if (!row || typeof row.branchId !== 'string' || typeof row.conversationId !== 'string' ||
        typeof row.questionId !== 'string' || typeof row.answerRootId !== 'string') invalid()
    const priorArtifact = this.loadOperationArtifact(operationIdValue, row.answerRootId, requestSequence - 1, true)
    const calls = (priorArtifact.orderedMessages.at(-1) as Record<string, unknown> | undefined)?.tool_calls
    const rows = this.db.prepare(`SELECT output_index AS outputIndex, tool_call_id AS toolCallId, tool_id AS toolId,
      content, side_effect_policy AS sideEffectPolicy, confirmation_state AS confirmationState,
      confirmed_at_ms AS confirmedAtMs FROM generation_tool_output_v2
      WHERE operation_id=? AND request_sequence=? ORDER BY output_index`).all(operationIdValue, requestSequence) as Readonly<Record<string, unknown>>[]
    if (!Array.isArray(calls) || rows.length !== calls.length) invalid()
    const records = rows.map((item, index) => {
      const call = calls[index] as Record<string, unknown> | undefined
      if (!call || item.outputIndex !== index || item.toolCallId !== call.id || typeof item.toolCallId !== 'string' ||
          typeof item.toolId !== 'string' || typeof item.content !== 'string' ||
          (item.sideEffectPolicy !== 'none' && item.sideEffectPolicy !== 'confirmation_required_each_execution') ||
          (item.confirmationState !== 'not_required' && item.confirmationState !== 'user_confirmed') ||
          (item.sideEffectPolicy === 'none' && (item.confirmationState !== 'not_required' || item.confirmedAtMs !== null)) ||
          (item.sideEffectPolicy === 'confirmation_required_each_execution' &&
            (item.confirmationState !== 'user_confirmed' || !Number.isSafeInteger(item.confirmedAtMs)))) invalid()
      return Object.freeze({ outputIndex: index, toolCallId: item.toolCallId, toolId: item.toolId,
        content: item.content, sideEffectPolicy: item.sideEffectPolicy, confirmationState: item.confirmationState,
        confirmedAtMs: item.confirmedAtMs as number | null })
    })
    return this.issueFact(context, {
      operationId: GenerationV2Identity.create('operation_id', operationIdValue),
      branchId: ConversationGraphV2Identity.create('branch_id', row.branchId),
      conversationId: ConversationGraphV2Identity.create('conversation_id', row.conversationId),
      questionId: ConversationGraphV2Identity.create('question_id', row.questionId),
      answerRootId: ConversationGraphV2Identity.create('answer_root_id', row.answerRootId),
      priorArtifact, clientMessages: records.map((record) => Object.freeze({ role: 'tool', tool_call_id: record.toolCallId, content: record.content })),
      contextProjection: new GenerationContextProjectionV2Repo(this.db).load(context, operationIdValue),
      projectedPrefixMessages: null,
      requestSequence, toolOutputRecords: records,
    })
  }

  persistToolContinuationOutputs(
    context: GenerationV2AuthorityTransactionContextV2,
    history: OpenRouterRequestHistoryRepositoryFactV2,
    request: GenerationRequestRepositoryFactV2,
    createdAtMs: number,
    allowInsert: boolean,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!isOpenRouterRequestHistoryRepositoryFactForContextV2(history, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) || history.requestSequence < 2 ||
        history.toolOutputRecords.length === 0 || request.operationId !== history.operationId.value ||
        request.answerRootId !== history.answerRootId.value || request.requestSequence !== history.requestSequence) invalid()
    for (const record of history.toolOutputRecords) {
      const existing = this.db.prepare(`SELECT tool_call_id AS toolCallId, tool_id AS toolId, content,
        side_effect_policy AS sideEffectPolicy, confirmation_state AS confirmationState, confirmed_at_ms AS confirmedAtMs
        FROM generation_tool_output_v2 WHERE operation_id=? AND request_sequence=? AND output_index=?`).get(
        request.operationId, request.requestSequence, record.outputIndex,
      ) as Readonly<Record<string, unknown>> | undefined
      const expected = { toolCallId: record.toolCallId, toolId: record.toolId, content: record.content,
        sideEffectPolicy: record.sideEffectPolicy, confirmationState: record.confirmationState, confirmedAtMs: record.confirmedAtMs }
      if (existing) { if (stableSerializeProviderRequestV2(existing) !== stableSerializeProviderRequestV2(expected)) invalid(); continue }
      if (!allowInsert) invalid()
      this.db.prepare(`INSERT INTO generation_tool_output_v2 (operation_id, request_sequence, answer_root_id,
        output_index, tool_call_id, tool_id, content, side_effect_policy, confirmation_state, confirmed_at_ms, created_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(request.operationId, request.requestSequence,
        request.answerRootId, record.outputIndex, record.toolCallId, record.toolId, record.content,
        record.sideEffectPolicy, record.confirmationState, record.confirmedAtMs, createdAtMs)
    }
  }

  persistTerminalArtifact(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    request: GenerationRequestRepositoryFactV2,
    artifact: OpenRouterNativeHistoryArtifactV1,
    createdAtMs: number,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) || !isOpenRouterNativeHistoryArtifactV1(artifact) ||
        request.operationId !== execution.operation.operationId.value || request.answerRootId !== execution.operation.targetAnswerId.value ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.updatedAtMs) invalid()
    const canonical = stableSerializeProviderRequestV2(artifact)
    const existing = this.db.prepare(`SELECT artifact_json AS artifactJson, artifact_hash AS artifactHash FROM generation_native_artifact_v2
      WHERE answer_root_id=? AND request_sequence=? AND artifact_kind=?`).get(
      request.answerRootId, request.requestSequence, OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1,
    ) as { artifactJson?: unknown; artifactHash?: unknown } | undefined
    if (existing) {
      if (existing.artifactJson !== canonical || existing.artifactHash !== artifact.artifactHash) {
        throw new OpenRouterNativeHistoryV2RepoError('GENERATION_V2_OPENROUTER_HISTORY_LINEAGE_INVALID')
      }
      return
    }
    this.db.prepare(`INSERT INTO generation_native_artifact_v2 (
      answer_root_id, request_sequence, operation_id, artifact_kind, codec_version, artifact_json, artifact_hash, created_at_ms, completion_scope
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'request_terminal')`).run(
      request.answerRootId, request.requestSequence, request.operationId,
      OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1, canonical, artifact.artifactHash, createdAtMs,
    )
  }

  private loadLatestCompletedArtifact(answerRootId: string): OpenRouterNativeHistoryArtifactV1 {
    const row = this.db.prepare(`SELECT artifact.operation_id AS operationId,
        artifact.request_sequence AS requestSequence
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id AND request.request_sequence=artifact.request_sequence
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
      WHERE artifact.answer_root_id=? AND artifact.artifact_kind=? AND request.state='completed'
        AND operation.state='completed' AND answer.status='completed'
      ORDER BY artifact.request_sequence DESC LIMIT 1`).get(answerRootId, OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1) as
      { operationId?: unknown; requestSequence?: unknown } | undefined
    if (!row || typeof row.operationId !== 'string' || !Number.isSafeInteger(row.requestSequence) ||
        Number(row.requestSequence) < 1) {
      throw new OpenRouterNativeHistoryV2RepoError('GENERATION_V2_OPENROUTER_HISTORY_NOT_FOUND')
    }
    return this.loadOperationArtifact(row.operationId, answerRootId, Number(row.requestSequence), false)
  }

  private loadOperationArtifact(operationId: string, answerRootId: string, requestSequence: number, allowActive: boolean): OpenRouterNativeHistoryArtifactV1 {
    const row = this.db.prepare(`SELECT artifact.artifact_json AS artifactJson, artifact.artifact_hash AS artifactHash,
      request.state AS requestState, operation.state AS operationState, answer.status AS answerStatus
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id AND request.request_sequence=artifact.request_sequence
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
      WHERE artifact.operation_id=? AND artifact.answer_root_id=? AND artifact.request_sequence=? AND artifact.artifact_kind=?`).get(
      operationId, answerRootId, requestSequence, OPENROUTER_NATIVE_HISTORY_ARTIFACT_KIND_V1,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!row || typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string' || row.requestState !== 'completed' ||
        !((row.operationState === 'completed' && row.answerStatus === 'completed') ||
          (allowActive && row.operationState === 'streaming' && row.answerStatus === 'streaming'))) invalid()
    let artifact: OpenRouterNativeHistoryArtifactV1
    try { artifact = decodeOpenRouterNativeHistoryArtifactV1(JSON.parse(row.artifactJson)) } catch { invalid() }
    if (artifact.artifactHash !== row.artifactHash) invalid()
    return artifact
  }

  private issueFact(
    context: GenerationV2AuthorityTransactionContextV2,
    value: Omit<OpenRouterRequestHistoryRepositoryFactV2, 'trust'>,
  ): OpenRouterRequestHistoryRepositoryFactV2 {
    const fact = Object.freeze({ trust: 'openrouter_chat_history_repository_fact_v2' as const,
      ...value, clientMessages: Object.freeze(value.clientMessages), toolOutputRecords: Object.freeze(value.toolOutputRecords) })
    facts.add(fact); factContexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.db, {
      preCommit: () => undefined,
      committed: () => { facts.delete(fact); factContexts.delete(fact) },
      rolledBack: () => { facts.delete(fact); factContexts.delete(fact) },
    })
    return fact
  }
}
