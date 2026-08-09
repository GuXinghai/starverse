import { session } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import { GenericLocalOpenAIChatNativeHistoryV2Repo } from '../../infra/db/repo/genericLocalOpenAIChatNativeHistoryV2Repo'
import { LocalEndpointProfileV2Repo } from '../../infra/db/repo/localEndpointProfileV2Repo'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { isPreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { GenericLocalOpenAIChatSseDecoderV1, GenericLocalOpenAIChatStreamAssemblerV1,
  type GenericLocalOpenAIChatStreamResultV1 } from '../../src/next/generation-v2/providers/generic-local-openai-chat/chatStreamV1'
import { isGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { publishGenerationStreamProjectionV2, type GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import { createGenerationTextBodyCheckpointV2 } from './generationBodyCheckpointV2'

function abortScope(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController(); let timedOut = false; const abort = () => controller.abort('user_cancelled')
  if (external?.aborted) abort(); else external?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort('timeout') }, timeoutMs); (timer as NodeJS.Timeout).unref?.()
  return Object.freeze({ signal: controller.signal, timedOut: () => timedOut,
    dispose: () => { clearTimeout(timer); external?.removeEventListener('abort', abort) } })
}

export function createGenericLocalOpenAIChatStreamRunnerV2(input: Readonly<{ db: BetterSqlite3.Database;
  rawGenerationRequestStore?: RawGenerationRequestStore; streamProjectionSink?: GenerationStreamProjectionSinkV2;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>; nowMs?: () => number; timeoutMs?: number }>) {
  const nowMs = input.nowMs ?? Date.now; const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs); const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db); const historyRepo = new GenericLocalOpenAIChatNativeHistoryV2Repo(input.db)
  const profileRepo = new LocalEndpointProfileV2Repo(input.db, nowMs)
  function begin(command: GenerationTextCommandResultV2) { runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
    const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId); if (!execution) throw new Error('GENERATION_V2_GENERIC_LOCAL_RUNNER_AUTHORITY_INVALID')
    const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
    if (executionRepo.openAttempt(context, { operationId: command.preparedRequest.operationId, requestSequence: 1, attempt: 1 }, nowMs()).kind !== 'created') throw new Error('GENERATION_V2_GENERIC_LOCAL_RUNNER_ALREADY_STARTED')
    requestRepo.markStreaming(context, request, nowMs()); if (execution.operation.state === 'committed') executionRepo.markOperationStreaming(context, execution, nowMs()) }) }
  function terminal(command: GenerationTextCommandResultV2, state: 'completed'|'failed'|'cancelled', result: GenericLocalOpenAIChatStreamResultV1 | null,
    errorCode: string | null, errorMessage: string | null, phase: 'pre_stream'|'mid_stream') {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId); if (!execution) throw new Error('GENERATION_V2_GENERIC_LOCAL_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      executionRepo.terminalizeAttempt(context, { key: { operationId: command.preparedRequest.operationId, requestSequence: 1, attempt: 1 },
        outcome: state === 'completed' ? { kind: 'provider_completed', phase } : state === 'cancelled' ? { kind: 'user_cancelled', phase }
          : { kind: 'provider_failed', phase, failure: { code: errorCode!, message: errorMessage! } } }, nowMs())
      const terminalRequest = requestRepo.terminalize(context, request, state, nowMs())
      graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, state === 'completed' ? result!.assistantMessage.content : null, nowMs())
      const terminalExecution = executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage }, nowMs())
      if (state === 'completed' && result) { const fact = historyRepo.loadRequestHistory(context, command.preparedRequest.operationId)
        historyRepo.persistCompletedArtifact({ context, execution: terminalExecution, request: terminalRequest,
          requestMessages: fact.replayMessages, assistantMessage: result.assistantMessage, createdAtMs: nowMs() }) }
    })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'terminal', operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, state, errorCode, errorMessage })
    return Object.freeze({ operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId, state, errorCode, errorMessage })
  }
  return Object.freeze({ run: async (command: GenerationTextCommandResultV2, signal?: AbortSignal) => {
    if (!isGenerationTextCommandResultV2(command) || !isPreparedProviderRequestV2(command.preparedRequest) ||
        command.preparedRequest.providerId !== 'generic_local' || command.preparedRequest.contractId !== 'generic-local-openai-chat-completions' ||
        command.preparedRequest.headersPlan.credential.kind !== 'no_credential') throw new Error('GENERATION_V2_GENERIC_LOCAL_RUNNER_AUTHORITY_INVALID')
    const profile = profileRepo.get(command.preparedRequest.endpointProfileId); const endpointBinding = command.execution.snapshot.providerBinding.endpointBinding
    const revision = endpointBinding.kind === 'provider_managed_set' ? endpointBinding.endpointSetRevision.value : null
    if (profile.credentialScopeId !== command.preparedRequest.credentialScopeId || profile.profileRevision !== revision) throw new Error('GENERATION_V2_GENERIC_LOCAL_RUNNER_PROFILE_STALE')
    begin(command); const scope = abortScope(signal, input.timeoutMs ?? 5 * 60_000); let started = false; let visible = ''
    const checkpoint = createGenerationTextBodyCheckpointV2({
      db: input.db, graphRepo, command, initialBody: visible,
      streamProjectionSink: input.streamProjectionSink, nowMs,
      onFailure: () => undefined,
    })
    try {
      try { input.rawGenerationRequestStore?.tryPersistPreparedV2({ operationId: command.preparedRequest.operationId,
        answerRootId: command.preparedRequest.answerRootId, requestSequence: 1, providerId: 'generic_local', modelId: command.preparedRequest.modelId,
        conversationId: command.execution.operation.conversationId.value, branchId: command.execution.operation.branchId.value,
        questionId: command.execution.operation.questionId.value, actionKind: command.execution.operation.actionKind }, command.preparedRequest.body) } catch { /* debug is non-fatal */ }
      const bytes = command.preparedRequest.body.copyBytes(); let response: Response
      try { response = await fetchImpl(command.preparedRequest.endpoint, { method: 'POST', redirect: 'error', signal: scope.signal,
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' }, body: Buffer.from(bytes) }) } finally { bytes.fill(0) }
      if (!response.ok || !response.body) { try { await response.body?.cancel() } catch {}; throw new Error('GENERATION_V2_GENERIC_LOCAL_RUNNER_HTTP_FAILED') }
      const decoder = new GenericLocalOpenAIChatSseDecoderV1(); const assembler = new GenericLocalOpenAIChatStreamAssemblerV1(); const reader = response.body.getReader()
      try { while (true) { const item = await reader.read(); if (item.done) break; if (item.value.byteLength) started = true
        for (const chunk of decoder.push(item.value)) { const delta = assembler.push(chunk); if (delta) { visible += delta; checkpoint.update(visible) } } }
        for (const chunk of decoder.finish()) assembler.push(chunk)
      } finally { try { await reader.cancel() } catch {}; reader.releaseLock() }
      const result = assembler.finish(); if (result.model !== command.preparedRequest.modelId) throw new Error('GENERATION_V2_GENERIC_LOCAL_RUNNER_PROVIDER_FAILED')
      checkpoint.flush()
      return terminal(command, 'completed', result, null, null, 'mid_stream')
    } catch (error) { let failure: unknown = error; try { checkpoint.flush() } catch (checkpointError) { failure = checkpointError }
      const cancelled = signal?.aborted === true && !scope.timedOut(); const code = cancelled ? 'user_cancelled'
      : scope.timedOut() ? 'GENERATION_V2_GENERIC_LOCAL_RUNNER_TIMEOUT' : failure instanceof Error ? failure.message : 'GENERATION_V2_GENERIC_LOCAL_RUNNER_TRANSPORT_FAILED'
      return terminal(command, cancelled ? 'cancelled' : 'failed', null, code, cancelled ? 'Generation cancelled by user.' : code, started ? 'mid_stream' : 'pre_stream')
    } finally { checkpoint.dispose(); scope.dispose() }
  } })
}
