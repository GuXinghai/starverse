import type BetterSqlite3 from 'better-sqlite3'
import {
  buildLmStudioOpenResponsesReplayInputV1,
  completeLmStudioOpenResponsesRequestV1,
  completeLmStudioOpenResponsesProjectedRequestV1,
  decodeLmStudioOpenResponsesContinuationArtifactV1,
  serializeLmStudioOpenResponsesContinuationArtifactV1,
  type LmStudioOpenResponsesContinuationArtifactV1,
} from '../../../src/next/generation-v2/providers/lmstudio-openresponses/continuationArtifactV1'
import type { LmStudioOpenResponsesAssistantMessageItemV1, LmStudioOpenResponsesClientItemV1, LmStudioOpenResponsesReplayItemV1,
  LmStudioOpenResponsesUserInputItemV1,
  LmStudioOpenResponsesReturnedItemV1 } from '../../../src/next/generation-v2/providers/lmstudio-openresponses/nativeItemsV1'
import { isLmStudioOpenResponsesToolContinuationCommandV2,
  type LmStudioOpenResponsesToolContinuationCommandV2 } from '../../../src/next/generation-v2/providers/lmstudio-openresponses/toolContinuationCommandV2'
import { stableSerializeProviderRequestV2 } from '../../../src/next/generation-v2/compiler/stableSerialize'
import { assertGenerationV2AuthorityTransactionContextV2, registerGenerationV2AuthorityTransactionParticipantV2,
  type GenerationV2AuthorityTransactionContextV2 } from './generationV2AuthorityTransactionInternal'
import { isGenerationExecutionOperationBundleForContextV2, type GenerationExecutionOperationBundleV2 } from './generationExecutionV2Repo'
import { isGenerationRequestRepositoryFactForContextV2, type GenerationRequestRepositoryFactV2 } from './generationRequestV2Repo'
import { GenerationContextProjectionV2Repo } from './generationContextProjectionV2Repo'
import { isToolRegistryRepositoryFactForContextV2, type ToolRegistryRepositoryFactV2 } from './toolRegistryV2Repo'

const ARTIFACT_KIND = 'lmstudio_openresponses_native_items'

function isUserInputItem(item: LmStudioOpenResponsesReplayItemV1 | undefined): item is LmStudioOpenResponsesUserInputItemV1 {
  return item !== undefined && 'role' in item && item.role === 'user'
}

function isAssistantMessageItem(item: LmStudioOpenResponsesReplayItemV1 | undefined): item is LmStudioOpenResponsesAssistantMessageItemV1 {
  return item !== undefined && 'type' in item && item.type === 'message'
}
export type LmStudioOpenResponsesRequestHistoryFactV2 = Readonly<{
  priorArtifact: LmStudioOpenResponsesContinuationArtifactV1 | null
  clientItems: readonly LmStudioOpenResponsesClientItemV1[]
  projectedReplayItems: readonly LmStudioOpenResponsesReplayItemV1[]
  requestSequence: number
  toolOutputRecords: readonly Readonly<{ outputIndex: number; toolCallId: string; toolId: string; content: string;
    sideEffectPolicy: 'none' | 'confirmation_required_each_execution'; confirmationState: 'not_required' | 'user_confirmed';
    confirmedAtMs: number | null }>[]
}>
const facts = new WeakSet<object>()
const factContexts = new WeakMap<object, GenerationV2AuthorityTransactionContextV2>()
export function isLmStudioOpenResponsesRequestHistoryFactForContextV2(
  value: unknown,
  context: GenerationV2AuthorityTransactionContextV2,
): value is LmStudioOpenResponsesRequestHistoryFactV2 {
  return Boolean(value && typeof value === 'object' && facts.has(value) && factContexts.get(value) === context)
}
export class LmStudioOpenResponsesNativeHistoryV2RepoError extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID'
    | 'GENERATION_V2_LMSTUDIO_HISTORY_MISSING'
    | 'GENERATION_V2_LMSTUDIO_HISTORY_CONFLICT') {
    super(code); this.name = 'LmStudioOpenResponsesNativeHistoryV2RepoError'
  }
}

export class LmStudioOpenResponsesNativeHistoryV2Repo {
  constructor(private readonly db: BetterSqlite3.Database) {}
  readAwaitingToolRecoveryFact(operationId: string): Readonly<{
    operationId: string; answerRootId: string; requestSequence: number; artifactHash: string; functionCallCount: number
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
      ARTIFACT_KIND, operationId, operationId,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!row) return null
    if (row.requestState !== 'completed' || row.operationState !== 'streaming' || row.answerStatus !== 'streaming' ||
        typeof row.answerRootId !== 'string' || !Number.isSafeInteger(row.requestSequence) ||
        typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string') {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    let artifact: LmStudioOpenResponsesContinuationArtifactV1
    try { artifact = decodeLmStudioOpenResponsesContinuationArtifactV1(JSON.parse(row.artifactJson)) } catch {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    const pending = artifact.orderedItems.filter((item) => 'type' in item && item.type === 'function_call')
      .filter((call) => !artifact.orderedItems.some((item) => 'type' in item && item.type === 'function_call_output' &&
        item.call_id === call.call_id))
    if (artifact.requestSequence !== row.requestSequence || artifact.artifactHash !== row.artifactHash || pending.length < 1) {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    return Object.freeze({ operationId, answerRootId: row.answerRootId,
      requestSequence: row.requestSequence as number, artifactHash: row.artifactHash,
      functionCallCount: pending.length })
  }
  #registerFact(
    context: GenerationV2AuthorityTransactionContextV2,
    value: LmStudioOpenResponsesRequestHistoryFactV2,
  ): LmStudioOpenResponsesRequestHistoryFactV2 {
    const fact = Object.freeze(value)
    facts.add(fact); factContexts.set(fact, context)
    registerGenerationV2AuthorityTransactionParticipantV2(context, this.db, {
      preCommit: () => undefined,
      committed: () => { facts.delete(fact); factContexts.delete(fact) },
      rolledBack: () => { facts.delete(fact); factContexts.delete(fact) },
    })
    return fact
  }
  #completeTurnItems(context: GenerationV2AuthorityTransactionContextV2, answerRootId: string): readonly LmStudioOpenResponsesReplayItemV1[] {
    const row = this.db.prepare(`SELECT artifact.artifact_json AS artifactJson, artifact.artifact_hash AS artifactHash,
      operation.operation_id AS operationId, operation.question_id AS questionId, body.body_text AS questionBody
      FROM generation_native_artifact_v2 AS artifact
      JOIN generation_request_v2 AS request ON request.operation_id=artifact.operation_id AND request.request_sequence=artifact.request_sequence
        AND request.answer_root_id=artifact.answer_root_id
      JOIN generation_operation_v2 AS operation ON operation.operation_id=artifact.operation_id
      JOIN message_v2 AS answer ON answer.message_id=artifact.answer_root_id
      JOIN message_body_v2 AS body ON body.message_id=operation.question_id
      WHERE artifact.answer_root_id=? AND artifact.artifact_kind=? AND artifact.completion_scope='operation_terminal'
        AND request.state='completed' AND operation.state='completed' AND answer.status='completed'
      ORDER BY artifact.request_sequence DESC LIMIT 1`).get(answerRootId, ARTIFACT_KIND) as Readonly<Record<string, unknown>> | undefined
    if (!row || typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string' ||
        typeof row.operationId !== 'string' || typeof row.questionId !== 'string' || typeof row.questionBody !== 'string') {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_MISSING')
    }
    let artifact: LmStudioOpenResponsesContinuationArtifactV1
    try { artifact = decodeLmStudioOpenResponsesContinuationArtifactV1(JSON.parse(row.artifactJson)) } catch {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    const projection = new GenerationContextProjectionV2Repo(this.db).load(context, row.operationId)
    const current = projection.turns.at(-1)
    let userIndex = -1
    for (let index = artifact.orderedItems.length - 1; index >= 0; index -= 1) {
      const candidate = artifact.orderedItems[index]
      if (isUserInputItem(candidate) && candidate.content.length === 1 &&
          candidate.content[0]?.type === 'input_text' && candidate.content[0].text === row.questionBody) {
        userIndex = index; break
      }
    }
    const turnItems = userIndex < 0 ? [] : artifact.orderedItems.slice(userIndex)
    const user = turnItems[0]
    const assistant = turnItems.at(-1)
    if (artifact.artifactHash !== row.artifactHash || current?.questionId !== row.questionId || current.answerRootId !== null ||
        current.mode !== 'included' || !isUserInputItem(user) || user.content.length !== 1 ||
        user.content[0]?.type !== 'input_text' || user.content[0].text !== row.questionBody || !isAssistantMessageItem(assistant) ||
        turnItems.slice(1).some(isUserInputItem) || turnItems.some((item) => 'type' in item && item.type === 'function_call' &&
          !turnItems.some((candidate) => 'type' in candidate && candidate.type === 'function_call_output' &&
            candidate.call_id === item.call_id))) {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    return Object.freeze(turnItems)
  }
  loadRequestHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    operationId: string,
  ): LmStudioOpenResponsesRequestHistoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    const row = this.db.prepare(`SELECT operation.question_id AS questionId,
      question.parent_message_id AS parentMessageId, body.body_text AS userBody,
      request.provider_id AS providerId, request.contract_id AS contractId
      FROM generation_operation_v2 AS operation
      JOIN generation_request_v2 AS request ON request.operation_id=operation.operation_id AND request.request_sequence=1
      JOIN message_v2 AS question ON question.message_id=operation.question_id AND question.role='user'
      JOIN message_body_v2 AS body ON body.message_id=question.message_id
      WHERE operation.operation_id=?`).get(operationId) as Readonly<Record<string, unknown>> | undefined
    if (!row || typeof row.userBody !== 'string' || row.providerId !== 'lmstudio' || row.contractId !== 'lmstudio-openresponses') {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    if (typeof row.questionId !== 'string') throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    const projection = new GenerationContextProjectionV2Repo(this.db).load(context, operationId)
    const projectedReplayItems: LmStudioOpenResponsesReplayItemV1[] = []
    for (const turn of projection.turns) {
      if (turn.answerRootId === null) {
        if (turn.questionId !== row.questionId || turn.mode !== 'included') throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
        projectedReplayItems.push(Object.freeze({ role: 'user' as const,
          content: Object.freeze([Object.freeze({ type: 'input_text' as const, text: row.userBody })]) }))
      } else if (turn.mode === 'included') projectedReplayItems.push(...this.#completeTurnItems(context, turn.answerRootId))
    }
    if (!isUserInputItem(projectedReplayItems.at(-1))) throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    const clientItems = Object.freeze([{ role: 'user' as const,
      content: Object.freeze([{ type: 'input_text' as const, text: row.userBody }]) }])
    buildLmStudioOpenResponsesReplayInputV1({ priorArtifact: null, clientItems })
    return this.#registerFact(context, { priorArtifact: null, clientItems,
      projectedReplayItems: Object.freeze(projectedReplayItems), requestSequence: 1,
      toolOutputRecords: Object.freeze([]) })
  }

  prepareToolContinuationHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    execution: GenerationExecutionOperationBundleV2,
    command: LmStudioOpenResponsesToolContinuationCommandV2,
    toolRegistry: ToolRegistryRepositoryFactV2,
    createdAtMs: number,
  ): LmStudioOpenResponsesRequestHistoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!isGenerationExecutionOperationBundleForContextV2(execution, context) ||
        !isLmStudioOpenResponsesToolContinuationCommandV2(command) ||
        !isToolRegistryRepositoryFactForContextV2(toolRegistry, context) || execution.operation.state !== 'streaming' ||
        execution.operation.operationId.value !== command.operationId.value ||
        execution.operation.branchId.value !== command.branchId.value ||
        execution.operation.targetAnswerId.value !== command.answerRootId.value ||
        !Number.isSafeInteger(createdAtMs) || createdAtMs < execution.operation.updatedAtMs) {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    const state = this.db.prepare(`SELECT branch.head_message_id AS headMessageId,
      choice.chosen_answer_root_id AS chosenAnswerRootId, answer.status AS answerStatus,
      request.state AS requestState FROM branch_v2 AS branch
      JOIN branch_choice_v2 AS choice ON choice.branch_id=branch.branch_id AND choice.question_id=?
      JOIN message_v2 AS answer ON answer.message_id=?
      JOIN generation_request_v2 AS request ON request.operation_id=? AND request.request_sequence=?
        AND request.answer_root_id=answer.message_id WHERE branch.branch_id=?`).get(
      execution.operation.questionId.value, command.answerRootId.value, command.operationId.value,
      command.priorRequestSequence, command.branchId.value,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!state || state.headMessageId !== command.expectedHeadMessageId.value ||
        state.chosenAnswerRootId !== command.answerRootId.value || state.answerStatus !== 'streaming' ||
        state.requestState !== 'completed') {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    const row = this.db.prepare(`SELECT artifact_json AS artifactJson, artifact_hash AS artifactHash
      FROM generation_native_artifact_v2 WHERE operation_id=? AND answer_root_id=? AND request_sequence=?
        AND artifact_kind=? AND completion_scope='request_terminal'`).get(
      command.operationId.value, command.answerRootId.value, command.priorRequestSequence, ARTIFACT_KIND,
    ) as Readonly<Record<string, unknown>> | undefined
    if (!row || typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string') {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_MISSING')
    }
    let prior: LmStudioOpenResponsesContinuationArtifactV1
    try { prior = decodeLmStudioOpenResponsesContinuationArtifactV1(JSON.parse(row.artifactJson)) } catch {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    if (prior.artifactHash !== row.artifactHash || prior.requestSequence !== command.priorRequestSequence) {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    const pending = prior.orderedItems.filter((item): item is Extract<LmStudioOpenResponsesReturnedItemV1, { type: 'function_call' }> =>
      'type' in item && item.type === 'function_call').filter((call) => !prior.orderedItems.some((item) =>
        'type' in item && item.type === 'function_call_output' && item.call_id === call.call_id))
    if (pending.length !== command.toolOutputs.length) {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    const byName = new Map(toolRegistry.selectedDefinitions.map((tool) => [tool.function.name, tool]))
    const records = command.toolOutputs.map((output, index) => {
      const call = pending[index]; const tool = byName.get(call.name)
      if (!tool || output.toolCallId !== call.call_id ||
          (tool.sideEffectPolicy === 'none' && output.userConfirmedExternalSideEffect) ||
          (tool.sideEffectPolicy === 'confirmation_required_each_execution' && !output.userConfirmedExternalSideEffect)) {
        throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
      }
      return Object.freeze({ outputIndex: index, toolCallId: call.call_id, toolId: tool.toolId,
        content: output.content, sideEffectPolicy: tool.sideEffectPolicy,
        confirmationState: tool.sideEffectPolicy === 'none' ? 'not_required' as const : 'user_confirmed' as const,
        confirmedAtMs: tool.sideEffectPolicy === 'none' ? null : createdAtMs })
    })
    const clientItems = Object.freeze(records.map((record) => Object.freeze({
      type: 'function_call_output' as const, call_id: record.toolCallId, output: record.content,
    })))
    return this.#registerFact(context, { priorArtifact: prior, clientItems,
      projectedReplayItems: buildLmStudioOpenResponsesReplayInputV1({ priorArtifact: prior, clientItems }),
      requestSequence: command.priorRequestSequence + 1, toolOutputRecords: Object.freeze(records) })
  }

  loadPersistedRequestHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    operationId: string,
    requestSequence: number,
  ): LmStudioOpenResponsesRequestHistoryFactV2 {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!Number.isSafeInteger(requestSequence) || requestSequence < 2) {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    const row = this.db.prepare(`SELECT artifact_json AS artifactJson, artifact_hash AS artifactHash
      FROM generation_native_artifact_v2 WHERE operation_id=? AND request_sequence=? AND artifact_kind=?
        AND completion_scope='request_terminal'`).get(operationId, requestSequence - 1, ARTIFACT_KIND) as Readonly<Record<string, unknown>> | undefined
    const outputs = this.db.prepare(`SELECT output_index AS outputIndex, tool_call_id AS toolCallId, tool_id AS toolId,
      content, side_effect_policy AS sideEffectPolicy, confirmation_state AS confirmationState,
      confirmed_at_ms AS confirmedAtMs FROM generation_tool_output_v2 WHERE operation_id=? AND request_sequence=?
      ORDER BY output_index`).all(operationId, requestSequence) as readonly Readonly<Record<string, unknown>>[]
    if (!row || typeof row.artifactJson !== 'string' || typeof row.artifactHash !== 'string' || outputs.length === 0) {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_MISSING')
    }
    let prior: LmStudioOpenResponsesContinuationArtifactV1
    try { prior = decodeLmStudioOpenResponsesContinuationArtifactV1(JSON.parse(row.artifactJson)) } catch {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    if (prior.artifactHash !== row.artifactHash || prior.requestSequence !== requestSequence - 1) {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    const records = outputs.map((output, index) => {
      if (output.outputIndex !== index || typeof output.toolCallId !== 'string' || typeof output.toolId !== 'string' ||
          typeof output.content !== 'string' || (output.sideEffectPolicy !== 'none' &&
            output.sideEffectPolicy !== 'confirmation_required_each_execution') ||
          (output.confirmationState !== 'not_required' && output.confirmationState !== 'user_confirmed') ||
          (output.confirmedAtMs !== null && typeof output.confirmedAtMs !== 'number')) {
        throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
      }
      return Object.freeze({ outputIndex: index, toolCallId: output.toolCallId, toolId: output.toolId,
        content: output.content, sideEffectPolicy: output.sideEffectPolicy,
        confirmationState: output.confirmationState, confirmedAtMs: output.confirmedAtMs }) as LmStudioOpenResponsesRequestHistoryFactV2['toolOutputRecords'][number]
    })
    const clientItems = Object.freeze(records.map((record) => Object.freeze({ type: 'function_call_output' as const,
      call_id: record.toolCallId, output: record.content })))
    return this.#registerFact(context, { priorArtifact: prior, clientItems,
      projectedReplayItems: buildLmStudioOpenResponsesReplayInputV1({ priorArtifact: prior, clientItems }),
      requestSequence, toolOutputRecords: Object.freeze(records) })
  }

  persistToolContinuationOutputs(
    context: GenerationV2AuthorityTransactionContextV2,
    history: LmStudioOpenResponsesRequestHistoryFactV2,
    request: GenerationRequestRepositoryFactV2,
    createdAtMs: number,
    allowInsert: boolean,
  ): void {
    assertGenerationV2AuthorityTransactionContextV2(context, this.db)
    if (!isLmStudioOpenResponsesRequestHistoryFactForContextV2(history, context) ||
        !isGenerationRequestRepositoryFactForContextV2(request, context) || history.requestSequence < 2 ||
        history.toolOutputRecords.length === 0 || request.requestSequence !== history.requestSequence) {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    for (const record of history.toolOutputRecords) {
      const existing = this.db.prepare(`SELECT tool_call_id AS toolCallId, tool_id AS toolId, content,
        side_effect_policy AS sideEffectPolicy, confirmation_state AS confirmationState, confirmed_at_ms AS confirmedAtMs
        FROM generation_tool_output_v2 WHERE operation_id=? AND request_sequence=? AND output_index=?`).get(
        request.operationId, request.requestSequence, record.outputIndex,
      ) as Readonly<Record<string, unknown>> | undefined
      const expected = { toolCallId: record.toolCallId, toolId: record.toolId, content: record.content,
        sideEffectPolicy: record.sideEffectPolicy, confirmationState: record.confirmationState,
        confirmedAtMs: record.confirmedAtMs }
      if (existing) {
        if (stableSerializeProviderRequestV2(existing) !== stableSerializeProviderRequestV2(expected)) {
          throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_CONFLICT')
        }
      } else if (!allowInsert) throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_MISSING')
      else this.db.prepare(`INSERT INTO generation_tool_output_v2 (operation_id, request_sequence, answer_root_id,
        output_index, tool_call_id, tool_id, content, side_effect_policy, confirmation_state, confirmed_at_ms, created_at_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(request.operationId, request.requestSequence,
        request.answerRootId, record.outputIndex, record.toolCallId, record.toolId, record.content,
        record.sideEffectPolicy, record.confirmationState, record.confirmedAtMs, createdAtMs)
    }
  }

  persistTerminalArtifact(input: Readonly<{
    context: GenerationV2AuthorityTransactionContextV2
    execution: GenerationExecutionOperationBundleV2
    request: GenerationRequestRepositoryFactV2
    history: LmStudioOpenResponsesRequestHistoryFactV2
    returnedItems: readonly LmStudioOpenResponsesReturnedItemV1[]
    createdAtMs: number
    completionScope: 'request_terminal' | 'operation_terminal'
  }>): LmStudioOpenResponsesContinuationArtifactV1 {
    assertGenerationV2AuthorityTransactionContextV2(input.context, this.db)
    const requestState = this.db.prepare(`SELECT state FROM generation_request_v2
      WHERE operation_id=? AND request_sequence=?`).get(input.request.operationId, input.request.requestSequence) as { state?: unknown } | undefined
    if (!isGenerationExecutionOperationBundleForContextV2(input.execution, input.context) ||
        !isGenerationRequestRepositoryFactForContextV2(input.request, input.context) ||
        !isLmStudioOpenResponsesRequestHistoryFactForContextV2(input.history, input.context) ||
        requestState?.state !== 'completed' ||
        (input.completionScope === 'request_terminal' && input.execution.operation.state !== 'streaming') ||
        (input.completionScope === 'operation_terminal' && input.execution.operation.state !== 'completed') ||
        input.execution.snapshot.providerBinding.protocolContractId.value !== 'lmstudio-openresponses' ||
        input.request.operationId !== input.execution.operation.operationId.value ||
        input.request.answerRootId !== input.execution.operation.targetAnswerId.value) {
      throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_STATE_INVALID')
    }
    const artifact = input.history.requestSequence === 1
      ? completeLmStudioOpenResponsesProjectedRequestV1({ replayItems: input.history.projectedReplayItems,
          returnedItems: input.returnedItems })
      : completeLmStudioOpenResponsesRequestV1({ priorArtifact: input.history.priorArtifact,
          requestSequence: input.history.requestSequence, clientItems: input.history.clientItems,
          returnedItems: input.returnedItems })
    const artifactJson = serializeLmStudioOpenResponsesContinuationArtifactV1(artifact)
    const existing = this.db.prepare(`SELECT operation_id AS operationId, artifact_json AS artifactJson,
      artifact_hash AS artifactHash FROM generation_native_artifact_v2
      WHERE answer_root_id=? AND request_sequence=? AND artifact_kind=?`).get(
      input.request.answerRootId, input.request.requestSequence, ARTIFACT_KIND,
    ) as Readonly<Record<string, unknown>> | undefined
    if (existing) {
      if (existing.operationId !== input.request.operationId || existing.artifactJson !== artifactJson || existing.artifactHash !== artifact.artifactHash) {
        throw new LmStudioOpenResponsesNativeHistoryV2RepoError('GENERATION_V2_LMSTUDIO_HISTORY_CONFLICT')
      }
      return artifact
    }
    this.db.prepare(`INSERT INTO generation_native_artifact_v2 (answer_root_id, request_sequence, operation_id,
      artifact_kind, codec_version, artifact_json, artifact_hash, created_at_ms, completion_scope)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      input.request.answerRootId, input.request.requestSequence, input.request.operationId, ARTIFACT_KIND,
      artifact.artifactCodecVersion, artifactJson, artifact.artifactHash, input.createdAtMs, input.completionScope,
    )
    return artifact
  }
}
