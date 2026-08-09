import type BetterSqlite3 from 'better-sqlite3'
import {
  GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1,
  createGeminiGenerateContentNativeHistoryArtifactV1,
  decodeGeminiGenerateContentNativeHistoryArtifactV1,
  type GeminiGenerateContentNativeContentV1,
  type GeminiGenerateContentNativeHistoryArtifactV1,
} from '../../../src/next/generation-v2/providers/gemini/generateContentNativeHistoryV1'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { sha256PreparedBytesV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import type { GeminiGenerateContentStreamResultV1 } from '../../../src/next/generation-v2/providers/gemini/generateContentStreamV1'
import { ConversationGraphV2Identity, type ConversationGraphV2Identity as GraphIdentity } from '../../../src/next/generation-v2/domain/conversationGraphV2'
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
import { GenerationContextProjectionV2Repo } from './generationContextProjectionV2Repo'
import {
  isToolRegistryRepositoryFactForContextV2,
  type ToolRegistryRepositoryFactV2,
} from './toolRegistryV2Repo'
import {
  geminiFunctionCallAssociationKeyV2,
  isGeminiToolContinuationCommandV2,
  type GeminiToolContinuationCommandV2,
} from '../../../src/next/generation-v2/providers/gemini/toolContinuationCommandV2'

export type GeminiGenerateContentHistoryRepositoryFactV2 = Readonly<{
  trust: 'gemini_generate_content_history_repository_fact_v2'
  operationId: Identity<'operation_id'>
  branchId: GraphIdentity<'branch_id'>
  conversationId: GraphIdentity<'conversation_id'>
  questionId: GraphIdentity<'question_id'>
  answerRootId: GraphIdentity<'answer_root_id'>
  systemInstruction: string | null
  replayContents: readonly GeminiGenerateContentNativeContentV1[]
  requestSequence: number
  toolOutputRecords: readonly Readonly<{
    outputIndex: number
    associationKey: string
    toolId: string
    functionName: string
    response: Readonly<Record<string, unknown>>
    sideEffectPolicy: 'none' | 'confirmation_required_each_execution'
    confirmationState: 'not_required' | 'user_confirmed'
    confirmedAtMs: number | null
  }>[]
}>

export class GeminiGenerateContentNativeHistoryV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_HISTORY_NOT_FOUND'
    | 'GENERATION_V2_GEMINI_HISTORY_STATE_INVALID'
    | 'GENERATION_V2_GEMINI_HISTORY_LINEAGE_INVALID') {
    super(code)
    this.name = 'GeminiGenerateContentNativeHistoryV2RepoError'
  }
}

const facts = new WeakSet<object>()
const contexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()
export function isGeminiGenerateContentHistoryRepositoryFactForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is GeminiGenerateContentHistoryRepositoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value) && contexts.get(value) === context)
}
function invalid(): never { throw new GeminiGenerateContentNativeHistoryV2RepoError('GENERATION_V2_GEMINI_HISTORY_STATE_INVALID') }

export class GeminiGenerateContentNativeHistoryV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {
    db.pragma('foreign_keys = ON')
    if (db.pragma('foreign_keys', { simple: true }) !== 1) invalid()
  }

  readAwaitingToolRecoveryFact(operationId: string): Readonly<{
    operationId: string
    answerRootId: string
    requestSequence: number
    artifactHash: string
    functionCallCount: number
  }> | null {
    const row = this.db.prepare(`SELECT request.answer_root_id AS answerRootId,
      request.request_sequence AS requestSequence, request.state AS requestState,
      operation.state AS operationState, answer.status AS answerStatus,
      artifact.artifact_json AS artifactJson, artifact.artifact_hash AS artifactHash
      FROM generation_request_v2 AS request
      JOIN generation_operation_v2 AS operation ON operation.operation_id=request.operation_id
      JOIN message_v2 AS answer ON answer.message_id=request.answer_root_id
      JOIN generation_native_artifact_v2 AS artifact ON artifact.operation_id=request.operation_id
        AND artifact.request_sequence=request.request_sequence AND artifact.answer_root_id=request.answer_root_id
        AND artifact.artifact_kind=? AND artifact.completion_scope='request_terminal'
      WHERE request.operation_id=? AND request.request_sequence=(
        SELECT MAX(request_sequence) FROM generation_request_v2 WHERE operation_id=?)`).get(
      GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1, operationId, operationId,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!row) return null
    if (row.requestState !== 'completed' || row.operationState !== 'streaming' || row.answerStatus !== 'streaming' ||
        typeof row.answerRootId !== 'string' || !Number.isSafeInteger(row.requestSequence) ||
        typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string') invalid()
    let artifact: GeminiGenerateContentNativeHistoryArtifactV1
    try { artifact = decodeGeminiGenerateContentNativeHistoryArtifactV1(JSON.parse(row.artifactJson)) } catch { invalid() }
    const assistant = artifact.orderedContents.at(-1)
    const functionCallCount = assistant?.role === 'model'
      ? assistant.parts.filter((part) => 'functionCall' in part).length : 0
    if (artifact.operationId !== operationId || artifact.answerRootId !== row.answerRootId ||
        artifact.requestSequence !== row.requestSequence || artifact.artifactHash !== row.artifactHash ||
        functionCallCount < 1) invalid()
    return Object.freeze({ operationId, answerRootId: row.answerRootId, requestSequence: row.requestSequence as number,
      artifactHash: row.artifactHash, functionCallCount })
  }

  #systemForQuestion(conversationId: string, questionId: string): string | null {
    const rows = this.db.prepare(`WITH RECURSIVE lineage(message_id,parent_message_id) AS (
      SELECT message_id,parent_message_id FROM message_v2 WHERE message_id=? AND conversation_id=?
      UNION ALL SELECT parent.message_id,parent.parent_message_id FROM message_v2 AS parent
      JOIN lineage AS child ON child.parent_message_id=parent.message_id WHERE parent.conversation_id=?
    ) SELECT body.body_text AS body FROM lineage JOIN message_v2 AS message ON message.message_id=lineage.message_id
      JOIN message_body_v2 AS body ON body.message_id=message.message_id WHERE message.role='system'`).all(
      questionId, conversationId, conversationId,
    ) as readonly Readonly<Record<string, unknown>>[]
    if (rows.length > 1 || (rows.length === 1 && typeof rows[0].body !== 'string')) invalid()
    return rows.length === 0 ? null : rows[0].body as string
  }

  #completeTurnContents(
    context: GenerationV2AuthorityTransactionContextV2,
    answerRootId: string,
  ): readonly GeminiGenerateContentNativeContentV1[] {
    const artifact = this.loadLatestCompletedArtifact(answerRootId)
    const operation = this.db.prepare(`SELECT operation.question_id AS questionId, operation.target_answer_id AS answerRootId
      FROM generation_operation_v2 AS operation WHERE operation.operation_id=?`).get(artifact.operationId) as
      Readonly<Record<string, unknown>> | undefined
    if (operation?.answerRootId !== answerRootId || typeof operation.questionId !== 'string' ||
        artifact.orderedContents.length < 2) invalid()
    const question = this.db.prepare(`SELECT body_text AS body FROM message_body_v2 WHERE message_id=?`).get(operation.questionId) as
      { body?: unknown } | undefined
    const ownProjection = new GenerationContextProjectionV2Repo(this.db).load(context, artifact.operationId)
    const current = ownProjection.turns.at(-1)
    const user = artifact.orderedContents.at(0)
    const assistant = artifact.orderedContents.at(-1)
    if (current?.questionId !== operation.questionId || current.answerRootId !== null || current.mode !== 'included' ||
        typeof question?.body !== 'string' || user?.role !== 'user' || assistant?.role !== 'model' ||
        user.parts.length !== 1 || !('text' in user.parts[0]) || user.parts[0].text !== question.body) invalid()
    return artifact.orderedContents
  }

  loadRequestHistory(context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string): GeminiGenerateContentHistoryRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const row = this.db.prepare(`SELECT operation.branch_id AS branchId, operation.conversation_id AS conversationId,
      operation.question_id AS questionId, operation.target_answer_id AS answerRootId,
      questionBody.body_text AS questionBody
      FROM generation_operation_v2 AS operation
      JOIN message_v2 AS question ON question.message_id=operation.question_id AND question.role='user'
      JOIN message_body_v2 AS questionBody ON questionBody.message_id=question.message_id
      WHERE operation.operation_id=?`).get(operationIdValue) as Readonly<Record<string, unknown>> | undefined
    if (!row || typeof row.branchId !== 'string' || typeof row.conversationId !== 'string' ||
        typeof row.questionId !== 'string' || typeof row.answerRootId !== 'string' || typeof row.questionBody !== 'string') invalid()
    const projection = new GenerationContextProjectionV2Repo(this.db).load(context, operationIdValue)
    if (projection.branchId !== row.branchId) invalid()
    const replayContents: GeminiGenerateContentNativeContentV1[] = []
    for (const turn of projection.turns) {
      if (turn.answerRootId === null) {
        if (turn.questionId !== row.questionId || turn.mode !== 'included') invalid()
        replayContents.push(Object.freeze({ role: 'user' as const,
          parts: Object.freeze([Object.freeze({ text: row.questionBody })]) }))
      } else if (turn.mode === 'included') {
        replayContents.push(...this.#completeTurnContents(context, turn.answerRootId))
      }
    }
    if (replayContents.length === 0 || replayContents.at(-1)?.role !== 'user') invalid()
    const fact = Object.freeze({
      trust: 'gemini_generate_content_history_repository_fact_v2' as const,
      operationId: GenerationV2Identity.create('operation_id', operationIdValue),
      branchId: ConversationGraphV2Identity.create('branch_id', row.branchId),
      conversationId: ConversationGraphV2Identity.create('conversation_id', row.conversationId),
      questionId: ConversationGraphV2Identity.create('question_id', row.questionId),
      answerRootId: ConversationGraphV2Identity.create('answer_root_id', row.answerRootId),
      systemInstruction: this.#systemForQuestion(row.conversationId, row.questionId),
      replayContents: Object.freeze(replayContents),
      requestSequence: 1 as const,
      toolOutputRecords: Object.freeze([]),
    })
    facts.add(fact); contexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.db, {
      preCommit: () => undefined,
      committed: () => { facts.delete(fact); contexts.delete(fact) },
      rolledBack: () => { facts.delete(fact); contexts.delete(fact) },
    })
    return fact
  }

  prepareToolContinuationHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    command: GeminiToolContinuationCommandV2,
    toolRegistry: ToolRegistryRepositoryFactV2,
    createdAtMs: number,
  ): GeminiGenerateContentHistoryRepositoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isGeminiToolContinuationCommandV2(command) ||
        !isToolRegistryRepositoryFactForContextV2(toolRegistry, context) ||
        execution.operation.state !== 'streaming' ||
        execution.operation.operationId.value !== command.operationId.value ||
        execution.operation.branchId.value !== command.branchId.value ||
        execution.operation.targetAnswerId.value !== command.answerRootId.value ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.updatedAtMs) invalid()
    const projection = this.db.prepare(`SELECT branch.head_message_id AS headMessageId,
      choice.chosen_answer_root_id AS chosenAnswerRootId, answer.status AS answerStatus,
      request.state AS requestState FROM branch_v2 AS branch
      JOIN branch_choice_v2 AS choice ON choice.branch_id=branch.branch_id AND choice.question_id=?
      JOIN message_v2 AS answer ON answer.message_id=?
      JOIN generation_request_v2 AS request ON request.operation_id=? AND request.request_sequence=?
        AND request.answer_root_id=answer.message_id WHERE branch.branch_id=?`).get(
      execution.operation.questionId.value, command.answerRootId.value, command.operationId.value,
      command.priorRequestSequence, command.branchId.value,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!projection || projection.headMessageId !== command.expectedHeadMessageId.value ||
        projection.chosenAnswerRootId !== command.answerRootId.value || projection.answerStatus !== 'streaming' ||
        projection.requestState !== 'completed') invalid()
    const prior = this.#loadArtifactForSequence(command.operationId.value, command.answerRootId.value,
      command.priorRequestSequence, true)
    const assistant = prior.orderedContents.at(-1)
    if (!assistant || assistant.role !== 'model') invalid()
    const calls = assistant.parts.map((part, partOrdinal) => ({ part, partOrdinal }))
      .filter((entry): entry is Readonly<{ part: Extract<GeminiGenerateContentNativeContentV1['parts'][number], { functionCall: unknown }>; partOrdinal: number }> =>
        'functionCall' in entry.part)
    if (calls.length === 0 || calls.length !== command.toolOutputs.length) invalid()
    const definitions = new Map(toolRegistry.selectedDefinitions.map((definition) => [definition.function.name, definition]))
    if (definitions.size !== toolRegistry.selectedDefinitions.length) invalid()
    const requestSequence = command.priorRequestSequence + 1
    const records = command.toolOutputs.map((output, outputIndex) => {
      const call = calls[outputIndex]
      const definition = definitions.get(call.part.functionCall.name)
      if (!definition || output.partOrdinal !== call.partOrdinal || output.functionName !== call.part.functionCall.name ||
          (definition.sideEffectPolicy === 'none' && output.userConfirmedExternalSideEffect) ||
          (definition.sideEffectPolicy === 'confirmation_required_each_execution' && !output.userConfirmedExternalSideEffect)) invalid()
      const associationKey = geminiFunctionCallAssociationKeyV2(
        command.priorRequestSequence, output.partOrdinal, output.functionName,
      )
      return Object.freeze({ outputIndex, associationKey, toolId: definition.toolId,
        functionName: output.functionName, response: output.response,
        sideEffectPolicy: definition.sideEffectPolicy,
        confirmationState: definition.sideEffectPolicy === 'none' ? 'not_required' as const : 'user_confirmed' as const,
        confirmedAtMs: definition.sideEffectPolicy === 'none' ? null : createdAtMs })
    })
    const replayContents = Object.freeze([...prior.orderedContents, Object.freeze({ role: 'user' as const,
      parts: Object.freeze(records.map((record) => Object.freeze({ functionResponse: Object.freeze({
        name: record.functionName, response: record.response,
      }) }))) })])
    return this.#issueFact(context, Object.freeze({
      trust: 'gemini_generate_content_history_repository_fact_v2' as const,
      operationId: execution.operation.operationId, branchId: execution.operation.branchId,
      conversationId: execution.operation.conversationId, questionId: execution.operation.questionId,
      answerRootId: execution.operation.targetAnswerId,
      systemInstruction: this.#systemForQuestion(execution.operation.conversationId.value, execution.operation.questionId.value),
      replayContents, requestSequence, toolOutputRecords: Object.freeze(records),
    }))
  }

  loadPersistedRequestHistory(context: GenerationV2AuthorityTransactionContextV2,
    operationIdValue: string, requestSequence: number): GeminiGenerateContentHistoryRepositoryFactV2 {
    if (requestSequence === 1) return this.loadRequestHistory(context, operationIdValue)
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!Number.isSafeInteger(requestSequence) || requestSequence < 2) invalid()
    const operation = this.db.prepare(`SELECT branch_id AS branchId, conversation_id AS conversationId,
      question_id AS questionId, target_answer_id AS answerRootId FROM generation_operation_v2 WHERE operation_id=?`)
      .get(operationIdValue) as Readonly<Record<string, unknown>> | undefined
    if (!operation || typeof operation.branchId !== 'string' || typeof operation.conversationId !== 'string' ||
        typeof operation.questionId !== 'string' || typeof operation.answerRootId !== 'string') invalid()
    const prior = this.#loadArtifactForSequence(operationIdValue, operation.answerRootId, requestSequence - 1, true)
    const assistant = prior.orderedContents.at(-1)
    if (!assistant || assistant.role !== 'model') invalid()
    const calls = assistant.parts.map((part, partOrdinal) => ({ part, partOrdinal }))
      .filter((entry) => 'functionCall' in entry.part)
    const rows = this.db.prepare(`SELECT output_index AS outputIndex, tool_call_id AS associationKey,
      tool_id AS toolId, content, side_effect_policy AS sideEffectPolicy,
      confirmation_state AS confirmationState, confirmed_at_ms AS confirmedAtMs
      FROM generation_tool_output_v2 WHERE operation_id=? AND request_sequence=? ORDER BY output_index`)
      .all(operationIdValue, requestSequence) as Readonly<Record<string, unknown>>[]
    if (calls.length === 0 || rows.length !== calls.length) invalid()
    const records = rows.map((row, index) => {
      const call = calls[index]
      if (!call || row.outputIndex !== index || typeof row.associationKey !== 'string' || typeof row.toolId !== 'string' ||
          typeof row.content !== 'string' ||
          row.associationKey !== geminiFunctionCallAssociationKeyV2(requestSequence - 1, call.partOrdinal,
            (call.part as { functionCall: { name: string } }).functionCall.name) ||
          (row.sideEffectPolicy !== 'none' && row.sideEffectPolicy !== 'confirmation_required_each_execution') ||
          (row.confirmationState !== 'not_required' && row.confirmationState !== 'user_confirmed')) invalid()
      let response: unknown
      try { response = JSON.parse(row.content) } catch { invalid() }
      return Object.freeze({ outputIndex: index, associationKey: row.associationKey, toolId: row.toolId,
        functionName: (call.part as { functionCall: { name: string } }).functionCall.name,
        response: response as Readonly<Record<string, unknown>>,
        sideEffectPolicy: row.sideEffectPolicy, confirmationState: row.confirmationState,
        confirmedAtMs: row.confirmedAtMs as number | null })
    })
    const replayContents = Object.freeze([...prior.orderedContents, Object.freeze({ role: 'user' as const,
      parts: Object.freeze(records.map((record) => Object.freeze({ functionResponse: Object.freeze({
        name: record.functionName, response: record.response,
      }) }))) })])
    return this.#issueFact(context, Object.freeze({ trust: 'gemini_generate_content_history_repository_fact_v2' as const,
      operationId: GenerationV2Identity.create('operation_id', operationIdValue),
      branchId: ConversationGraphV2Identity.create('branch_id', operation.branchId),
      conversationId: ConversationGraphV2Identity.create('conversation_id', operation.conversationId),
      questionId: ConversationGraphV2Identity.create('question_id', operation.questionId),
      answerRootId: ConversationGraphV2Identity.create('answer_root_id', operation.answerRootId),
      systemInstruction: this.#systemForQuestion(operation.conversationId, operation.questionId),
      replayContents, requestSequence, toolOutputRecords: Object.freeze(records) }))
  }

  persistToolContinuationOutputs(context: GenerationV2AuthorityTransactionContextV2,
    history: GeminiGenerateContentHistoryRepositoryFactV2, request: GenerationRequestRepositoryFactV2,
    createdAtMs: number, insert: boolean): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!isGeminiGenerateContentHistoryRepositoryFactForContextV2(history, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) || request.requestSequence !== history.requestSequence ||
        request.operationId !== history.operationId.value || request.answerRootId !== history.answerRootId.value ||
        history.requestSequence < 2 || !Number.isSafeInteger(createdAtMs) || createdAtMs < 0) invalid()
    for (const record of history.toolOutputRecords) {
      const content = stableSerializeProviderRequestV2(record.response)
      if (insert) this.db.prepare(`INSERT INTO generation_tool_output_v2 (operation_id, request_sequence,
        answer_root_id, output_index, tool_call_id, tool_id, content, is_error, side_effect_policy,
        confirmation_state, confirmed_at_ms, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`)
        .run(request.operationId, request.requestSequence, request.answerRootId, record.outputIndex,
          record.associationKey, record.toolId, content, record.sideEffectPolicy, record.confirmationState,
          record.confirmedAtMs, createdAtMs)
      const row = this.db.prepare(`SELECT tool_call_id AS associationKey, tool_id AS toolId, content,
        side_effect_policy AS sideEffectPolicy, confirmation_state AS confirmationState, confirmed_at_ms AS confirmedAtMs
        FROM generation_tool_output_v2 WHERE operation_id=? AND request_sequence=? AND output_index=?`)
        .get(request.operationId, request.requestSequence, record.outputIndex) as Readonly<Record<string, unknown>> | undefined
      if (!row || row.associationKey !== record.associationKey || row.toolId !== record.toolId || row.content !== content ||
          row.sideEffectPolicy !== record.sideEffectPolicy || row.confirmationState !== record.confirmationState ||
          row.confirmedAtMs !== record.confirmedAtMs) invalid()
    }
  }

  persistTerminalArtifact(context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2, request: GenerationRequestRepositoryFactV2,
    assistantContent: GeminiGenerateContentNativeContentV1, createdAtMs: number): GeminiGenerateContentNativeHistoryArtifactV1 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) ||
        request.operationId !== execution.operation.operationId.value ||
        request.answerRootId !== execution.operation.targetAnswerId.value) invalid()
    const history = this.loadPersistedRequestHistory(context, request.operationId, request.requestSequence)
    const parent = request.requestSequence === 1 ? null : this.#loadArtifactForSequence(
      request.operationId, request.answerRootId, request.requestSequence - 1, true,
    )
    const artifact = createGeminiGenerateContentNativeHistoryArtifactV1({
      operationId: request.operationId,
      answerRootId: request.answerRootId,
      requestSequence: request.requestSequence,
      lineageDepth: request.requestSequence,
      parentArtifactHash: parent?.artifactHash ?? null,
      orderedContents: Object.freeze([...history.replayContents, assistantContent]),
    })
    const canonical = stableSerializeProviderRequestV2(artifact)
    const existing = this.db.prepare(`SELECT artifact_json AS artifactJson, artifact_hash AS artifactHash
      FROM generation_native_artifact_v2 WHERE answer_root_id=? AND request_sequence=? AND artifact_kind=?`).get(
      request.answerRootId, request.requestSequence, GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1,
    ) as Readonly<Record<string, unknown>> | undefined
    if (existing) {
      if (existing.artifactJson !== canonical || existing.artifactHash !== artifact.artifactHash) {
        throw new GeminiGenerateContentNativeHistoryV2RepoError('GENERATION_V2_GEMINI_HISTORY_LINEAGE_INVALID')
      }
      return artifact
    }
    this.db.prepare(`INSERT INTO generation_native_artifact_v2 (
      answer_root_id, request_sequence, operation_id, artifact_kind, codec_version, artifact_json,
      artifact_hash, created_at_ms, completion_scope
    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, 'request_terminal')`).run(
      request.answerRootId, request.requestSequence, request.operationId, GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1,
      canonical, artifact.artifactHash, createdAtMs,
    )
    return artifact
  }

  persistResponseArtifact(context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2, request: GenerationRequestRepositoryFactV2,
    response: GeminiGenerateContentStreamResultV1, createdAtMs: number): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) ||
        request.operationId !== execution.operation.operationId.value) invalid()
    const projection = Object.freeze({
      schemaVersion: 1,
      artifactKind: 'gemini_generate_content_response_v1',
      artifactCodecVersion: 1,
      finishReason: response.finishReason,
      ...(response.finishMessage === undefined ? {} : { finishMessage: response.finishMessage }),
      ...(response.responseId === undefined ? {} : { responseId: response.responseId }),
      ...(response.modelVersion === undefined ? {} : { modelVersion: response.modelVersion }),
      ...(response.usageMetadata === undefined ? {} : { usageMetadata: response.usageMetadata }),
      ...(response.promptFeedback === undefined ? {} : { promptFeedback: response.promptFeedback }),
      candidateMetadata: response.candidateMetadata,
      rawChunks: response.rawChunks,
    })
    const digestInput = stableSerializeProviderRequestV2(projection)
    const hash = sha256PreparedBytesV2(new TextEncoder().encode(digestInput))
    const artifact = Object.freeze({ ...projection, artifactHash: hash })
    const canonical = stableSerializeProviderRequestV2(artifact)
    const existing = this.db.prepare(`SELECT artifact_json AS artifactJson, artifact_hash AS artifactHash
      FROM generation_native_artifact_v2 WHERE answer_root_id=? AND request_sequence=?
        AND artifact_kind='gemini_generate_content_response_v1'`).get(
      request.answerRootId, request.requestSequence,
    ) as Readonly<Record<string, unknown>> | undefined
    if (existing) {
      if (existing.artifactJson !== canonical || existing.artifactHash !== hash) {
        throw new GeminiGenerateContentNativeHistoryV2RepoError('GENERATION_V2_GEMINI_HISTORY_LINEAGE_INVALID')
      }
      return
    }
    this.db.prepare(`INSERT INTO generation_native_artifact_v2 (answer_root_id, request_sequence,
      operation_id, artifact_kind, codec_version, artifact_json, artifact_hash, created_at_ms, completion_scope)
      VALUES (?, ?, ?, 'gemini_generate_content_response_v1', 1, ?, ?, ?, 'request_terminal')`).run(
      request.answerRootId, request.requestSequence, request.operationId, canonical, hash, createdAtMs,
    )
  }

  private loadLatestCompletedArtifact(answerRootId: string): GeminiGenerateContentNativeHistoryArtifactV1 {
    const row = this.db.prepare(`SELECT artifact.artifact_json AS artifactJson, artifact.artifact_hash AS artifactHash
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id AND request.request_sequence=artifact.request_sequence
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
      WHERE artifact.answer_root_id=? AND artifact.artifact_kind=? AND request.state='completed'
        AND operation.state='completed' AND answer.status='completed'
      ORDER BY artifact.created_at_ms DESC LIMIT 1`).get(
      answerRootId, GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!row || typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string') {
      throw new GeminiGenerateContentNativeHistoryV2RepoError('GENERATION_V2_GEMINI_HISTORY_NOT_FOUND')
    }
    let artifact: GeminiGenerateContentNativeHistoryArtifactV1
    try { artifact = decodeGeminiGenerateContentNativeHistoryArtifactV1(JSON.parse(row.artifactJson)) } catch { invalid() }
    if (artifact.artifactHash !== row.artifactHash) invalid()
    return artifact
  }

  #loadArtifactForSequence(operationId: string, answerRootId: string, requestSequence: number,
    allowActive: boolean): GeminiGenerateContentNativeHistoryArtifactV1 {
    const row = this.db.prepare(`SELECT artifact.artifact_json AS artifactJson,
      artifact.artifact_hash AS artifactHash, operation.state AS operationState, answer.status AS answerStatus,
      request.state AS requestState FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id
        AND request.request_sequence=artifact.request_sequence
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
      WHERE artifact.operation_id=? AND artifact.answer_root_id=? AND artifact.request_sequence=?
        AND artifact.artifact_kind=? AND artifact.completion_scope='request_terminal'`).get(
      operationId, answerRootId, requestSequence, GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!row || row.requestState !== 'completed' ||
        !((row.operationState === 'completed' && row.answerStatus === 'completed') ||
          (allowActive && row.operationState === 'streaming' && row.answerStatus === 'streaming')) ||
        typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string') invalid()
    let artifact: GeminiGenerateContentNativeHistoryArtifactV1
    try { artifact = decodeGeminiGenerateContentNativeHistoryArtifactV1(JSON.parse(row.artifactJson)) } catch { invalid() }
    if (artifact.artifactHash !== row.artifactHash || artifact.operationId !== operationId ||
        artifact.answerRootId !== answerRootId || artifact.requestSequence !== requestSequence) invalid()
    return artifact
  }

  #issueFact(context: GenerationV2AuthorityTransactionContextV2,
    fact: GeminiGenerateContentHistoryRepositoryFactV2): GeminiGenerateContentHistoryRepositoryFactV2 {
    facts.add(fact); contexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.db, {
      preCommit: () => undefined,
      committed: () => { facts.delete(fact); contexts.delete(fact) },
      rolledBack: () => { facts.delete(fact); contexts.delete(fact) },
    })
    return fact
  }
}
