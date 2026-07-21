import { session } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { LmStudioOpenResponsesNativeHistoryV2Repo } from '../../infra/db/repo/lmStudioOpenResponsesNativeHistoryV2Repo'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { isPreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { LmStudioOpenResponsesStreamV1Error, LmStudioOpenResponsesTypedSseDecoderV1,
  type LmStudioOpenResponsesStreamResultV1 } from '../../src/next/generation-v2/providers/lmstudio-openresponses/responsesStreamV1'
import { isGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { publishGenerationStreamProjectionV2, type GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'

const DEFAULT_TIMEOUT_MS = 5 * 60_000
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
function abortScope(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController(); let timedOut = false
  const abort = () => controller.abort('user_cancelled')
  if (external?.aborted) abort(); else external?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort('timeout') }, timeoutMs); (timer as NodeJS.Timeout).unref?.()
  return Object.freeze({ signal: controller.signal, timedOut: () => timedOut, dispose: () => {
    clearTimeout(timer); external?.removeEventListener('abort', abort)
  } })
}

export function createLmStudioOpenResponsesStreamRunnerV2(input: Readonly<{
  db: BetterSqlite3.Database; rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>; nowMs?: () => number; timeoutMs?: number
}>) {
  const nowMs = input.nowMs ?? Date.now; const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
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
  function append(command: GenerationTextCommandResultV2, previous: string, next: string): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) =>
      graphRepo.compareAndSetStreamingAssistantBody(context, command.preparedRequest.answerRootId, previous, next, nowMs()))
    publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'assistant_body',
      operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId, content: next })
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
      if (state === 'completed' && result) {
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
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, nowMs())
        executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage }, nowMs())
      }
    })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'terminal',
      operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId,
      state: resultState, errorCode, errorMessage })
    return Object.freeze({ operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, state: resultState, errorCode, errorMessage })
  }

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
    begin(command); const scope = abortScope(signal, timeoutMs); let started = false; let visible = ''
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
      const decoder = new LmStudioOpenResponsesTypedSseDecoderV1(); const reader = response.body.getReader()
      try { while (true) { const item = await reader.read(); if (item.done) break; if (item.value.byteLength > 0) started = true
        for (const event of decoder.push(item.value)) if ('delta' in event) {
          if (event.type === 'output_text') { const previous = visible; visible += event.delta; append(command, previous, visible) }
          else if (event.type === 'reasoning_text') publishGenerationStreamProjectionV2(input.streamProjectionSink, {
            type: 'reasoning_detail', operationId: command.preparedRequest.operationId,
            answerRootId: command.preparedRequest.answerRootId, detail: Object.freeze({ type: 'thought', text: event.delta }) })
        } } } finally { try { await reader.cancel() } catch { /* release */ }; reader.releaseLock() }
      const result = decoder.finish()
      if (result.state !== 'completed' || result.model !== command.preparedRequest.modelId) {
        throw new LmStudioOpenResponsesStreamRunnerV2Error('GENERATION_V2_LMSTUDIO_RUNNER_PROVIDER_FAILED')
      }
      return terminal(command, 'completed', result, null, null, 'mid_stream')
    } catch (error) {
      const cancelled = signal?.aborted === true && !scope.timedOut()
      const code = cancelled ? 'user_cancelled' : scope.timedOut() ? 'GENERATION_V2_LMSTUDIO_RUNNER_TIMEOUT'
        : error instanceof LmStudioOpenResponsesStreamRunnerV2Error ? error.code
          : error instanceof LmStudioOpenResponsesStreamV1Error ? error.code : 'GENERATION_V2_LMSTUDIO_RUNNER_TRANSPORT_FAILED'
      return terminal(command, cancelled ? 'cancelled' : 'failed', null, code,
        cancelled ? 'Generation cancelled by user.' : code, started ? 'mid_stream' : 'pre_stream')
    } finally { scope.dispose() }
  } })
}
