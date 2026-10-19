import { GenerationInterruptedReplayV2Repo } from '../../infra/db/repo/generationInterruptedReplayV2Repo'
import type { InterruptedNativeSnapshotV1 } from '../../src/core/generation-v2/providers/interruptedReplayV1'
import { session } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { OpenRouterNativeHistoryV2Repo } from '../../infra/db/repo/openRouterNativeHistoryV2Repo'
import { OpenRouterChatTerminalArtifactV2Repo } from '../../infra/db/repo/openRouterChatTerminalArtifactV2Repo'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2, type GenerationV2AuthorityTransactionContextV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { readBoundedResponseBodyV2 } from '../net/boundedResponseBodyV2'
import { isEpoch2RuntimeCredentialLease, type Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { isPreparedProviderRequestV2 } from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'
import { stableSerializeProviderRequestV2 } from '../../src/shared/serialization/canonicalJsonV2'
import {
  OpenRouterChatSseDecoderV1,
  OpenRouterChatProviderStreamErrorV1,
  OpenRouterChatStreamV1Error,
  OpenRouterChatStreamAssemblerV1,
  type OpenRouterChatStreamResultV1,
} from '../../src/core/generation-v2/providers/openrouter/chatStreamV1'
import { completeOpenRouterNativeHistoryV1, completeOpenRouterProjectedNativeHistoryV1,
  decodeOpenRouterNativeMessageV1 } from '../../src/core/generation-v2/providers/openrouter/nativeMessagesV1'
import { createOpenRouterChatTerminalArtifactV1 } from '../../src/core/generation-v2/providers/openrouter/terminalArtifactV1'
import { isGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { publishGenerationStreamProjectionV2, type GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import { createGenerationTextBodyCheckpointV2 } from './generationBodyCheckpointV2'
import { classifyProviderHttpTransportDiagnostic, ProviderHttpTransportError } from '../net/providerHttpTransport'
import { createGenerationAbortScope, isValidGenerationTotalTimeoutMsV2 } from './generationTimeoutPolicyV2'
import {
  hasPendingGenerationNativeCompletionForOperationV2,
  isGenerationNativeCompletionMaterializationPendingV2Error,
  materializeNewGenerationNativeCompletionV2,
  persistGenerationNativeCompletionReceiptV2,
  preserveGenerationNativeCompletionPendingFailureV2,
  registerGenerationNativeCompletionMaterializerV2,
} from './generationNativeCompletionV2'


export function formatOpenRouterChatTransportFailureMessage(error: unknown, responseReceived: boolean): string {
  if (error instanceof OpenRouterChatProviderStreamErrorV1) {
    return 'response_stream:provider_reported_error'
  }
  if (error instanceof OpenRouterChatStreamV1Error) {
    return `response_stream:${error.code}:${error.detailCode}`
  }
  if (error instanceof OpenRouterChatStreamRunnerV2Error) {
    return `${responseReceived ? 'response_stream' : 'pre_response'}:${error.diagnosticCode}`
  }
  const diagnostic = error instanceof ProviderHttpTransportError
    ? error.diagnosticCode
    : classifyProviderHttpTransportDiagnostic(error)
  return `${responseReceived ? 'response_stream' : 'pre_response'}:${diagnostic}`
}

export type OpenRouterChatStreamRunResultV2 = Readonly<{
  operationId: string
  answerRootId: string
  state: 'awaiting_tool' | 'completed' | 'failed' | 'cancelled'
  errorCode: string | null
  errorMessage: string | null
}>

export class OpenRouterChatStreamRunnerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_ALREADY_STARTED'
    | 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_CREDENTIAL_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_TRANSPORT_FAILED'
    | 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_HTTP_FAILED'
    | 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_RESPONSE_INVALID'
    | 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_TIMEOUT',
    readonly diagnosticCode: string = code) {
    super(code); this.name = 'OpenRouterChatStreamRunnerV2Error'
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

export function createOpenRouterChatStreamRunnerV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  rawGenerationRequestStore?: RawGenerationRequestStore
  fetchImpl?: Fetch
  nowMs?: () => number
  timeoutMs?: number
  streamProjectionSink?: GenerationStreamProjectionSinkV2
}>) {
  const nowMs = input.nowMs ?? Date.now
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  const timeoutMs = input.timeoutMs
  if (!isValidGenerationTotalTimeoutMsV2(timeoutMs)) {
    throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID')
  }
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const historyRepo = new OpenRouterNativeHistoryV2Repo(input.db)
  const terminalArtifactRepo = new OpenRouterChatTerminalArtifactV2Repo(input.db)

  function exactClientMessages(
    command: GenerationTextCommandResultV2,
    prefix: readonly Readonly<Record<string, unknown>>[],
  ) {
    const bytes = command.preparedRequest.body.copyBytes()
    try {
      const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Record<string, unknown>
      if (!Array.isArray(value.messages)) {
        throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID')
      }
      if (value.messages.length <= prefix.length ||
          stableSerializeProviderRequestV2(value.messages.slice(0, prefix.length)) !== stableSerializeProviderRequestV2(prefix)) {
        throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID')
      }
      return Object.freeze(value.messages.slice(prefix.length) as readonly Readonly<Record<string, unknown>>[])
    } catch (error) {
      if (error instanceof OpenRouterChatStreamRunnerV2Error) throw error
      throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID')
    } finally { bytes.fill(0) }
  }

  function begin(command: GenerationTextCommandResultV2): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      const attempt = executionRepo.openAttempt(context, { operationId: request.operationId, requestSequence: request.requestSequence, attempt: 1 }, nowMs())
      if (attempt.kind !== 'created') throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_ALREADY_STARTED')
      requestRepo.markStreaming(context, request, nowMs())
      if (execution.operation.state === 'committed') executionRepo.markOperationStreaming(context, execution, nowMs())
      else if (execution.operation.state !== 'streaming') throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID')
    })
  }

  const interruptedSnapshots = new WeakMap<GenerationTextCommandResultV2, InterruptedNativeSnapshotV1>()

  function completeNativeHistory(
    context: GenerationV2AuthorityTransactionContextV2,
    command: GenerationTextCommandResultV2,
    assistantMessage: unknown,
  ) {
    const history = historyRepo.loadPersistedRequestHistory(
      context, command.preparedRequest.operationId, command.preparedRequest.requestSequence,
    )
    const clientMessages = exactClientMessages(
      command,
      history.projectedPrefixMessages ?? history.priorArtifact?.orderedMessages ?? [],
    )
    return history.projectedPrefixMessages === null
      ? completeOpenRouterNativeHistoryV1({
        priorArtifact: history.priorArtifact, clientMessages, assistantMessage,
      })
      : completeOpenRouterProjectedNativeHistoryV1({
        projectedPrefixMessages: history.projectedPrefixMessages, clientMessages, assistantMessage,
      })
  }

  function assertOpenRouterCompletionResult(value: unknown): OpenRouterChatStreamResultV1 {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_RESPONSE_INVALID')
    }
    const raw = value as Record<string, unknown>
    let assistantMessage: Readonly<Record<string, unknown>>
    try { assistantMessage = decodeOpenRouterNativeMessageV1(raw.assistantMessage) } catch {
      throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_RESPONSE_INVALID')
    }
    if (assistantMessage.role !== 'assistant' || typeof raw.responseId !== 'string' ||
        typeof raw.model !== 'string' || typeof raw.finishReason !== 'string' ||
        (raw.provider !== null && typeof raw.provider !== 'string') ||
        (raw.usage !== null && (!raw.usage || typeof raw.usage !== 'object' || Array.isArray(raw.usage)))) {
      throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_RESPONSE_INVALID')
    }
    return Object.freeze({ ...raw, assistantMessage }) as OpenRouterChatStreamResultV1
  }

  function validateOpenRouterCompletion(
    command: GenerationTextCommandResultV2,
    value: unknown,
  ): OpenRouterChatStreamResultV1 {
    const result = assertOpenRouterCompletionResult(value)
    createOpenRouterChatTerminalArtifactV1(result)
    const calls = result.assistantMessage.tool_calls
    if (Array.isArray(calls) && calls.length > 0 && command.execution.snapshot.semanticIntent.tools.mode !== 'enabled') {
      throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_RESPONSE_INVALID')
    }
    return result
  }

  function setInterruptedSnapshot(command: GenerationTextCommandResultV2, result: OpenRouterChatStreamResultV1): void {
    const items = JSON.parse(JSON.stringify([result.assistantMessage])) as Readonly<Record<string, unknown>>[]
    const content = result.assistantMessage.content
    interruptedSnapshots.set(command, Object.freeze({ items: Object.freeze(items), completeIndexes: Object.freeze([0]),
      text: typeof content === 'string' ? content : '',
      complete: result.finishReason === 'stop' || result.finishReason === 'tool_calls' }))
  }

  function persistInterrupted(context: Parameters<GenerationInterruptedReplayV2Repo['insert']>[0], command: GenerationTextCommandResultV2) {
    const native = interruptedSnapshots.get(command)
    if (!native) return
    const bytes = command.preparedRequest.body.copyBytes()
    try {
      new GenerationInterruptedReplayV2Repo(input.db).insert(context, {
        answerRootId: command.preparedRequest.answerRootId, operationId: command.preparedRequest.operationId,
        requestSequence: command.preparedRequest.requestSequence, protocol: 'openrouter',
        requestBody: JSON.parse(new TextDecoder().decode(bytes)), native,
      })
    } finally { bytes.fill(0) }
  }

  function finalize(
    command: GenerationTextCommandResultV2,
    state: 'completed' | 'failed' | 'cancelled',
    stream: OpenRouterChatStreamResultV1 | null,
    errorCode: string | null,
    errorMessage: string | null,
    phase: 'pre_stream' | 'mid_stream',
  ): OpenRouterChatStreamRunResultV2 {
    let resultState: OpenRouterChatStreamRunResultV2['state'] = state
    const at = nowMs()
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      const attempt = executionRepo.terminalizeAttempt(context, {
        key: { operationId: request.operationId, requestSequence: request.requestSequence, attempt: 1 },
        outcome: state === 'completed' ? { kind: 'provider_completed', phase: 'mid_stream' }
          : state === 'cancelled' ? { kind: 'user_cancelled', phase }
            : { kind: 'provider_failed', phase, failure: { code: errorCode!, message: errorMessage! } },
      }, at)
      if (attempt.kind === 'conflict') throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_ATTEMPT_TERMINAL_CONFLICT')
      const terminalRequest = requestRepo.terminalize(context, request, state, at)
      if (state === 'completed') {
        if (!stream) throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_RESPONSE_INVALID')
        const artifact = completeNativeHistory(context, command, stream.assistantMessage)
        const terminalArtifact = createOpenRouterChatTerminalArtifactV1(stream)
        const nativeToolCalls = stream.assistantMessage.tool_calls
        if (Array.isArray(nativeToolCalls) && nativeToolCalls.length > 0) {
          resultState = 'awaiting_tool'
          historyRepo.persistTerminalArtifact(context, execution, terminalRequest, artifact, at)
          terminalArtifactRepo.insertRequestTerminal(context, execution, terminalRequest, terminalArtifact, at)
        } else {
          const body = input.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
            .get(command.preparedRequest.answerRootId) as { body?: unknown } | undefined
          if (!body || typeof body.body !== 'string') throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_RESPONSE_INVALID')
          graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, 'completed', body.body, at)
          const terminalExecution = executionRepo.terminalizeOperation(context, execution, {
            state: 'completed', errorCode: null, errorMessage: null,
          }, at)
          historyRepo.persistTerminalArtifact(context, terminalExecution, terminalRequest, artifact, at)
          terminalArtifactRepo.insertRequestTerminal(context, terminalExecution, terminalRequest, terminalArtifact, at)
        }
        if (resultState === 'awaiting_tool') persistInterrupted(context, command)
      } else {
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, at)
        executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage }, at)
        persistInterrupted(context, command)
      }
    })
    interruptedSnapshots.delete(command)
    const result = Object.freeze({ operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, state: resultState, errorCode, errorMessage })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'terminal', ...result })
    return result
  }

  async function receive(command: GenerationTextCommandResultV2, response: Response, signal: AbortSignal,
    onStarted: () => void): Promise<OpenRouterChatStreamResultV1> {
    const rawContext = {
      operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId,
      requestSequence: command.preparedRequest.requestSequence,
      providerId: command.preparedRequest.providerId,
      modelId: command.preparedRequest.modelId,
      conversationId: command.execution.operation.conversationId.value,
      branchId: command.execution.operation.branchId.value,
      questionId: command.execution.operation.questionId.value,
      actionKind: command.execution.operation.actionKind,
    } as const
    const contentType = response.headers.get('content-type')
    const providerRequestId = response.headers.get('x-generation-id')
    if (response.status !== 200 || !response.body ||
        contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'text/event-stream') {
      const body = await readBoundedResponseBodyV2(response, 8 * 1024 * 1024)
      try { input.rawGenerationRequestStore?.tryPersistProviderError(rawContext, {
        phase: 'http_response', httpStatus: response.status, contentType,
        providerRequestId, payload: body.bytes,
      }) } catch { /* Raw Debug is non-fatal. */ } finally { body.bytes.fill(0) }
      const statusDetail = `http_status:${response.status}`
      const bodyDetail = body.truncated ? `;response_body_truncated_after_${body.bytes.byteLength}_bytes` : ''
      throw new OpenRouterChatStreamRunnerV2Error(response.status === 200
        ? 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_RESPONSE_INVALID' : 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_HTTP_FAILED',
      response.status === 200 ? `invalid_response_contract;${statusDetail}${bodyDetail}` : `${statusDetail}${bodyDetail}`)
    }
    const decoder = new OpenRouterChatSseDecoderV1(); const assembler = new OpenRouterChatStreamAssemblerV1()
    const reader = response.body.getReader()
    const initial = input.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
      .get(command.preparedRequest.answerRootId) as { body?: unknown } | undefined
    if (!initial || typeof initial.body !== 'string') throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID')
    let visible = initial.body
    const checkpoint = createGenerationTextBodyCheckpointV2({
      db: input.db,
      graphRepo,
      command,
      initialBody: visible,
      streamProjectionSink: input.streamProjectionSink,
      nowMs,
      onFailure: (error) => { void reader.cancel(error).catch(() => undefined) },
    })
    const accept = (events: readonly ReturnType<OpenRouterChatSseDecoderV1['push']>[number][]) => {
      for (const event of events) {
        if (event.type === 'done') assembler.done()
        else if (event.type === 'json') {
          let delta: ReturnType<OpenRouterChatStreamAssemblerV1['push']>
          try { delta = assembler.push(event.value, event.rawData) } catch (error) {
            if (error instanceof OpenRouterChatProviderStreamErrorV1) {
              const payload = new TextEncoder().encode(error.rawPayload)
              try { input.rawGenerationRequestStore?.tryPersistProviderError(rawContext, {
                phase: 'sse_event', httpStatus: response.status, contentType,
                providerRequestId, payload,
              }) } catch { /* Raw Debug is non-fatal. */ } finally { payload.fill(0) }
            }
            throw error
          }
          if (delta.contentDelta) { visible += delta.contentDelta; checkpoint.update(visible) }
          for (const detail of delta.reasoningDetails ?? []) publishGenerationStreamProjectionV2(input.streamProjectionSink, {
            type: 'reasoning_detail', operationId: command.preparedRequest.operationId,
            answerRootId: command.preparedRequest.answerRootId, detail,
          })
        }
      }
    }
    try {
      while (true) {
        const item = await abortable(reader.read(), signal)
        if (item.done) break
        if (item.value.byteLength > 0) onStarted()
        accept(decoder.push(item.value))
      }
      accept(decoder.finish())
      const result = assembler.finish()
      persistGenerationNativeCompletionReceiptV2(input.db, command, result, nowMs())
      return result
    } finally {
      interruptedSnapshots.set(command, assembler.interruptedSnapshot())
      try { checkpoint.flush() } finally {
        checkpoint.dispose()
        try { await reader.cancel() } catch { /* best effort */ }
        reader.releaseLock()
      }
    }
  }

  registerGenerationNativeCompletionMaterializerV2(input.db, 'openrouter-chat-completions-v1', (_receipt, command, value) => {
    const result = assertOpenRouterCompletionResult(value)
    setInterruptedSnapshot(command, result)
    return finalize(command, 'completed', result, null, null, 'mid_stream')
  }, (command, value) => {
    validateOpenRouterCompletion(command, value)
  })

  return Object.freeze({
    run: async (command: GenerationTextCommandResultV2, signal?: AbortSignal): Promise<OpenRouterChatStreamRunResultV2> => {
      const credential = command.preparedRequest?.headersPlan.credential
      if (!isGenerationTextCommandResultV2(command) || !isPreparedProviderRequestV2(command.preparedRequest) ||
          command.preparedRequest.providerId !== 'openrouter' || credential?.kind !== 'bearer_authorization' ||
          command.request.preparedBodySha256 !== command.preparedRequest.bodySha256) {
        throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID')
      }
      begin(command)
      const scope = createGenerationAbortScope(signal, timeoutMs); let responseReceived = false; let started = false
      try {
        const status = await input.credentialService.getStatus('openrouter')
        if (!status.configured || !status.credentialScopeId || status.credentialScopeId !== command.preparedRequest.credentialScopeId) {
          throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_CREDENTIAL_INVALID')
        }
        const stream = await input.credentialService.withCredential({
          providerKey: 'openrouter', expectedRevision: status.revision, expectedCredentialScopeId: status.credentialScopeId,
          consume: async (lease) => {
            if (!isEpoch2RuntimeCredentialLease(lease)) throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_CREDENTIAL_INVALID')
            try { input.rawGenerationRequestStore?.tryPersistPreparedV2({
              operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId,
              requestSequence: command.preparedRequest.requestSequence, providerId: command.preparedRequest.providerId,
              modelId: command.preparedRequest.modelId, conversationId: command.execution.operation.conversationId.value,
              branchId: command.execution.operation.branchId.value, questionId: command.execution.operation.questionId.value,
              actionKind: command.execution.operation.actionKind,
            }, command.preparedRequest.body) } catch { /* Raw Debug is non-fatal. */ }
            const requestBody = Buffer.from(command.preparedRequest.body.copyBytes())
            let response: Response
            try {
              response = await abortable(fetchImpl(command.preparedRequest.endpoint, {
                method: command.preparedRequest.method,
                headers: { 'content-type': command.preparedRequest.headersPlan.contentType,
                  accept: command.preparedRequest.headersPlan.accept,
                  [credential.headerName]: `${credential.scheme} ${lease.credential}` },
                body: requestBody, redirect: 'error', signal: scope.signal,
              }), scope.signal)
              responseReceived = true
            } finally {
              requestBody.fill(0)
            }
            return receive(command, response, scope.signal, () => { started = true })
          },
        })
        return materializeNewGenerationNativeCompletionV2({
          db: input.db, command, nativeResult: stream, nowMs,
          materialize: () => finalize(command, 'completed', stream, null, null, 'mid_stream'),
        })
      } catch (error) {
        if (isGenerationNativeCompletionMaterializationPendingV2Error(error)) throw error
        if (hasPendingGenerationNativeCompletionForOperationV2(input.db, command.preparedRequest.operationId)) {
          throw preserveGenerationNativeCompletionPendingFailureV2(input.db, command, error)
        }
        const cancelled = signal?.aborted === true && !scope.timedOut()
        const code = cancelled ? 'user_cancelled' : scope.timedOut()
          ? 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_TIMEOUT'
          : error instanceof OpenRouterChatProviderStreamErrorV1 ? 'GENERATION_V2_PROVIDER_REPORTED_ERROR'
            : error instanceof OpenRouterChatStreamV1Error ? error.code
              : error instanceof OpenRouterChatStreamRunnerV2Error ? error.code
                : 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_TRANSPORT_FAILED'
        const failureMessage = cancelled ? 'Generation cancelled by user.'
          : formatOpenRouterChatTransportFailureMessage(error, responseReceived)
        return finalize(command, cancelled ? 'cancelled' : 'failed', null, code,
          failureMessage, started ? 'mid_stream' : 'pre_stream')
      } finally { scope.dispose() }
    },
  })
}
