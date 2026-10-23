import { GenerationInterruptedReplayV2Repo } from '../../infra/db/repo/generationInterruptedReplayV2Repo'
import { session } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { LmStudioOpenResponsesNativeHistoryV2Repo } from '../../infra/db/repo/lmStudioOpenResponsesNativeHistoryV2Repo'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { isPreparedProviderRequestV2 } from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'
import { LmStudioOpenResponsesStreamV1Error, LmStudioOpenResponsesTypedSseDecoderV1,
  restoreLmStudioOpenResponsesStreamResultV1,
  type LmStudioOpenResponsesStreamResultV1 } from '../../src/core/generation-v2/providers/lmstudio-openresponses/responsesStreamV1'
import { isGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { publishGenerationStreamProjectionV2, type GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import { createGenerationTextBodyCheckpointV2 } from './generationBodyCheckpointV2'
import { abortableGenerationReadV2, createGenerationAbortScope } from './generationTimeoutPolicyV2'
import {
  hasPendingGenerationNativeCompletionForOperationV2,
  isGenerationNativeCompletionMaterializationPendingV2Error,
  materializeNewGenerationNativeCompletionV2,
  persistGenerationNativeCompletionReceiptV2,
  preserveGenerationNativeCompletionPendingFailureV2,
  registerGenerationNativeCompletionMaterializerV2,
} from './generationNativeCompletionV2'

export class LmStudioOpenResponsesStreamRunnerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_LMSTUDIO_RUNNER_AUTHORITY_INVALID'
    | 'GENERATION_V2_LMSTUDIO_RUNNER_ALREADY_STARTED'
    | 'GENERATION_V2_LMSTUDIO_RUNNER_PROFILE_STALE'
    | 'GENERATION_V2_LMSTUDIO_RUNNER_HTTP_FAILED'
    | 'GENERATION_V2_LMSTUDIO_RUNNER_PROVIDER_FAILED'
    | 'GENERATION_V2_LMSTUDIO_RUNNER_TRANSPORT_FAILED'
    | 'GENERATION_V2_LMSTUDIO_RUNNER_TIMEOUT') {
    super(code); this.name = 'LmStudioOpenResponsesStreamRunnerV2Error'
  }
}

const receivedLocalWireFacts = new WeakMap<object, unknown[]>()

export function createLmStudioOpenResponsesStreamRunnerV2(input: Readonly<{
  db: BetterSqlite3.Database; rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>; nowMs?: () => number; timeoutMs?: number
}>) {
  const nowMs = input.nowMs ?? Date.now; const timeoutMs = input.timeoutMs
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs); const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db); const historyRepo = new LmStudioOpenResponsesNativeHistoryV2Repo(input.db)
  const profileRepo = new LocalEndpointProfileV2Repo(input.db, nowMs)

  function begin(command: GenerationTextCommandResultV2): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new LmStudioOpenResponsesStreamRunnerV2Error('GENERATION_V2_LMSTUDIO_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      if (executionRepo.openAttempt(context, { operationId: command.preparedRequest.operationId,
        requestSequence: command.preparedRequest.requestSequence, attempt: 1 }, nowMs()).kind !== 'created') {
        throw new LmStudioOpenResponsesStreamRunnerV2Error('GENERATION_V2_LMSTUDIO_RUNNER_ALREADY_STARTED')
      }
      requestRepo.markStreaming(context, request, nowMs())
      if (execution.operation.state === 'committed') executionRepo.markOperationStreaming(context, execution, nowMs())
    })
  }
  function terminal(command: GenerationTextCommandResultV2, state: 'completed' | 'failed' | 'cancelled',
    result: LmStudioOpenResponsesStreamResultV1 | null, errorCode: string | null, errorMessage: string | null, phase: 'pre_stream' | 'mid_stream') {
    let resultState: 'awaiting_tool' | 'completed' | 'failed' | 'cancelled' = state
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new LmStudioOpenResponsesStreamRunnerV2Error('GENERATION_V2_LMSTUDIO_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      executionRepo.terminalizeAttempt(context, { key: { operationId: command.preparedRequest.operationId,
        requestSequence: command.preparedRequest.requestSequence, attempt: 1 }, outcome: state === 'completed' ? { kind: 'provider_completed', phase }
          : state === 'cancelled' ? { kind: 'user_cancelled', phase }
            : { kind: 'provider_failed', phase, failure: { code: errorCode!, message: errorMessage! } } }, nowMs())
      const terminalRequest = requestRepo.terminalize(context, request, state, nowMs())
      if (state === 'completed') {
        if (!result || result.state !== 'completed') {
          throw new LmStudioOpenResponsesStreamRunnerV2Error('GENERATION_V2_LMSTUDIO_RUNNER_AUTHORITY_INVALID')
        }
        const history = command.preparedRequest.requestSequence === 1
          ? historyRepo.loadRequestHistory(context, command.preparedRequest.operationId)
          : historyRepo.loadPersistedRequestHistory(context, command.preparedRequest.operationId,
              command.preparedRequest.requestSequence)
        const hasFunctionCall = result.returnedItems.some((item) => item.type === 'function_call')
        if (hasFunctionCall) {
          resultState = 'awaiting_tool'
          historyRepo.persistTerminalArtifact({ context, execution, request: terminalRequest,
            history, returnedItems: result.returnedItems, createdAtMs: nowMs(), completionScope: 'request_terminal' })
        } else {
          graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, 'completed',
            result.returnedItems.filter((item) => item.type === 'message')
              .flatMap((item) => item.content.map((part) => part.text)).join(''), nowMs())
          const terminalExecution = executionRepo.terminalizeOperation(context, execution,
            { state: 'completed', errorCode: null, errorMessage: null }, nowMs())
          historyRepo.persistTerminalArtifact({ context, execution: terminalExecution, request: terminalRequest,
            history, returnedItems: result.returnedItems, createdAtMs: nowMs(), completionScope: 'operation_terminal' })
        }
      } else {
        const terminalText = result?.returnedItems.flatMap((item) => item.type === 'message'
          ? item.content.map((part) => part.text) : []).join('') ?? ''
        if (terminalText.length > 0) {
          const currentBody = input.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
            .get(command.preparedRequest.answerRootId) as { body: unknown } | undefined
          if (typeof currentBody?.body !== 'string') {
            throw new LmStudioOpenResponsesStreamRunnerV2Error('GENERATION_V2_LMSTUDIO_RUNNER_AUTHORITY_INVALID')
          }
          if (currentBody.body !== terminalText) graphRepo.compareAndSetStreamingAssistantBody(context,
            command.preparedRequest.answerRootId, currentBody.body, terminalText, nowMs())
        }
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, nowMs())
        executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage }, nowMs())
        new GenerationInterruptedReplayV2Repo(input.db).insertLocalCheckpoint(context, { answerRootId: command.preparedRequest.answerRootId, operationId: command.preparedRequest.operationId, requestSequence: command.preparedRequest.requestSequence, protocol: 'lmstudio', requestBody: JSON.parse(command.preparedRequest.body.copyUtf8Text()), wireEvents: receivedLocalWireFacts.get(command) ?? [], ...(result ? { terminalResult: result } : {}) })
      }
    })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'terminal',
      operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId,
      state: resultState, errorCode, errorMessage })
    return Object.freeze({ operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, state: resultState, errorCode, errorMessage })
  }

  function materializeProviderTerminal(command: GenerationTextCommandResultV2,
    result: LmStudioOpenResponsesStreamResultV1) {
    if (result.state === 'completed') return terminal(command, 'completed', result, null, null, 'mid_stream')
    const code = 'GENERATION_V2_LMSTUDIO_RUNNER_PROVIDER_FAILED'
    return terminal(command, 'failed', result, code, code, 'mid_stream')
  }

  registerGenerationNativeCompletionMaterializerV2(input.db, 'lmstudio-openresponses', (_receipt, command, value) => {
    return materializeProviderTerminal(command, restoreLmStudioOpenResponsesStreamResultV1(value))
  }, (command, value) => {
    const result = restoreLmStudioOpenResponsesStreamResultV1(value)
    if (result.state === 'completed' && result.returnedItems.some((item) => item.type === 'function_call') &&
        command.execution.snapshot.semanticIntent.tools.mode !== 'enabled') {
      throw new Error('GENERATION_V2_LMSTUDIO_RUNNER_RESPONSE_INVALID')
    }
  })

  return Object.freeze({ run: async (command: GenerationTextCommandResultV2, signal?: AbortSignal) => {
    if (!isGenerationTextCommandResultV2(command) || !isPreparedProviderRequestV2(command.preparedRequest) ||
        command.preparedRequest.providerId !== 'lmstudio' || command.preparedRequest.contractId !== 'lmstudio-openresponses' ||
        command.preparedRequest.headersPlan.credential.kind !== 'no_credential') {
      throw new LmStudioOpenResponsesStreamRunnerV2Error('GENERATION_V2_LMSTUDIO_RUNNER_AUTHORITY_INVALID')
    }
    const profile = profileRepo.get(command.preparedRequest.endpointProfileId)
    const endpointBinding = command.execution.snapshot.providerBinding.endpointBinding
    const expectedProfileRevision = endpointBinding.kind === 'provider_managed_set'
      ? endpointBinding.endpointSetRevision.value : null
    if (profile.credentialScopeId !== command.preparedRequest.credentialScopeId ||
        profile.profileRevision !== expectedProfileRevision) {
      throw new LmStudioOpenResponsesStreamRunnerV2Error('GENERATION_V2_LMSTUDIO_RUNNER_PROFILE_STALE')
    }
    receivedLocalWireFacts.set(command, []); begin(command); const scope = createGenerationAbortScope(signal, timeoutMs); let started = false; let visible = ''
    const checkpoint = createGenerationTextBodyCheckpointV2({
      db: input.db, graphRepo, command, initialBody: visible,
      streamProjectionSink: input.streamProjectionSink, nowMs,
      onFailure: () => undefined,
    })
    try {
      try { input.rawGenerationRequestStore?.tryPersistPreparedV2({ operationId: command.preparedRequest.operationId,
        answerRootId: command.preparedRequest.answerRootId, requestSequence: command.preparedRequest.requestSequence, providerId: 'lmstudio',
        modelId: command.preparedRequest.modelId, conversationId: command.execution.operation.conversationId.value,
        branchId: command.execution.operation.branchId.value, questionId: command.execution.operation.questionId.value,
        actionKind: command.execution.operation.actionKind }, command.preparedRequest.body) } catch { /* non-fatal debug */ }
      const bytes = command.preparedRequest.body.copyBytes()
      let response: Response
      try { response = await fetchImpl(command.preparedRequest.endpoint, { method: 'POST', redirect: 'error', signal: scope.signal,
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: Buffer.from(bytes) }) } finally { bytes.fill(0) }
      if (!response.ok || !response.body) { try { await response.body?.cancel() } catch { /* best effort */ }
        throw new LmStudioOpenResponsesStreamRunnerV2Error('GENERATION_V2_LMSTUDIO_RUNNER_HTTP_FAILED') }
      const decoder = new LmStudioOpenResponsesTypedSseDecoderV1(event => receivedLocalWireFacts.get(command)!.push(event)); const reader = response.body.getReader()
      try { while (true) { const item = await abortableGenerationReadV2(reader.read(), scope.signal); if (item.done) break; if (item.value.byteLength > 0) started = true
        for (const event of decoder.push(item.value)) if ('delta' in event) {
          if (event.type === 'output_text') { visible += event.delta; checkpoint.update(visible) }
          else if (event.type === 'reasoning_text') publishGenerationStreamProjectionV2(input.streamProjectionSink, {
            type: 'reasoning_detail', operationId: command.preparedRequest.operationId,
            answerRootId: command.preparedRequest.answerRootId, detail: Object.freeze({ type: 'thought', text: event.delta }) })
        } } } finally { try { await reader.cancel() } catch { /* release */ }; reader.releaseLock() }
      const result = decoder.finish()
      // result.model is reported provenance; a mismatch with the requested model ID is not a failure
      persistGenerationNativeCompletionReceiptV2(input.db, command, result, nowMs())
      checkpoint.flush()
      return materializeNewGenerationNativeCompletionV2({
        db: input.db, command, nativeResult: result, nowMs,
        materialize: () => materializeProviderTerminal(command, result),
      })
    } catch (error) {
      if (isGenerationNativeCompletionMaterializationPendingV2Error(error)) throw error
      if (hasPendingGenerationNativeCompletionForOperationV2(input.db, command.preparedRequest.operationId)) {
        throw preserveGenerationNativeCompletionPendingFailureV2(input.db, command, error)
      }
      let failure: unknown = error
      try { checkpoint.flush() } catch (checkpointError) { failure = checkpointError }
      const cancelled = signal?.aborted === true && !scope.timedOut()
      const code = cancelled ? 'user_cancelled' : scope.timedOut() ? 'GENERATION_V2_LMSTUDIO_RUNNER_TIMEOUT'
        : failure instanceof LmStudioOpenResponsesStreamRunnerV2Error ? failure.code
          : failure instanceof LmStudioOpenResponsesStreamV1Error ? failure.code
            : failure instanceof Error ? failure.message : 'GENERATION_V2_LMSTUDIO_RUNNER_TRANSPORT_FAILED'
      return terminal(command, cancelled ? 'cancelled' : 'failed', null, code,
        cancelled ? 'Generation cancelled by user.' : code, started ? 'mid_stream' : 'pre_stream')
    } finally { receivedLocalWireFacts.delete(command); checkpoint.dispose(); scope.dispose() }
  } })
}
