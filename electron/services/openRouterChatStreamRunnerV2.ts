import { session } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { OpenRouterNativeHistoryV2Repo } from '../../infra/db/repo/openRouterNativeHistoryV2Repo'
import { OpenRouterChatTerminalArtifactV2Repo } from '../../infra/db/repo/openRouterChatTerminalArtifactV2Repo'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { isEpoch2RuntimeCredentialLease, type Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { isPreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { stableSerializeProviderRequestV2 } from '../../src/next/generation-v2/compiler/stableSerialize'
import {
  OpenRouterChatSseDecoderV1,
  OpenRouterChatStreamAssemblerV1,
  type OpenRouterChatStreamResultV1,
} from '../../src/next/generation-v2/providers/openrouter/chatStreamV1'
import { completeOpenRouterNativeHistoryV1, completeOpenRouterProjectedNativeHistoryV1 } from '../../src/next/generation-v2/providers/openrouter/nativeMessagesV1'
import { createOpenRouterChatTerminalArtifactV1 } from '../../src/next/generation-v2/providers/openrouter/terminalArtifactV1'
import { isGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { publishGenerationStreamProjectionV2, type GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'

const DEFAULT_TIMEOUT_MS = 5 * 60_000

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
    | 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_TIMEOUT') {
    super(code); this.name = 'OpenRouterChatStreamRunnerV2Error'
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>
function abortScope(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController(); let timedOut = false
  const onAbort = () => controller.abort('user_cancelled')
  if (external?.aborted) controller.abort('user_cancelled'); else external?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort('timeout') }, timeoutMs)
  ;(timer as NodeJS.Timeout).unref?.()
  return Object.freeze({ signal: controller.signal, timedOut: () => timedOut, dispose: () => {
    clearTimeout(timer); external?.removeEventListener('abort', onAbort)
  } })
}
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
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30 * 60_000) {
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

  function persistBody(command: GenerationTextCommandResultV2, expected: string, next: string): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      graphRepo.compareAndSetStreamingAssistantBody(context, command.preparedRequest.answerRootId, expected, next, nowMs())
    })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, {
      type: 'assistant_body', operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, content: next,
    })
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
        const history = historyRepo.loadPersistedRequestHistory(
          context, command.preparedRequest.operationId, command.preparedRequest.requestSequence,
        )
        const clientMessages = exactClientMessages(
          command,
          history.projectedPrefixMessages ?? history.priorArtifact?.orderedMessages ?? [],
        )
        const artifact = history.projectedPrefixMessages === null
          ? completeOpenRouterNativeHistoryV1({
            priorArtifact: history.priorArtifact, clientMessages, assistantMessage: stream.assistantMessage,
          })
          : completeOpenRouterProjectedNativeHistoryV1({
            projectedPrefixMessages: history.projectedPrefixMessages, clientMessages, assistantMessage: stream.assistantMessage,
          })
        const terminalArtifact = createOpenRouterChatTerminalArtifactV1(stream)
        if (stream.finishReason === 'tool_calls') {
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
      } else {
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, at)
        executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage }, at)
      }
    })
    const result = Object.freeze({ operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, state: resultState, errorCode, errorMessage })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'terminal', ...result })
    return result
  }

  async function receive(command: GenerationTextCommandResultV2, response: Response, signal: AbortSignal,
    onStarted: () => void): Promise<OpenRouterChatStreamResultV1> {
    if (response.status !== 200 || !response.body ||
        response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'text/event-stream') {
      try { await response.body?.cancel() } catch { /* best effort */ }
      throw new OpenRouterChatStreamRunnerV2Error(response.status === 200
        ? 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_RESPONSE_INVALID' : 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_HTTP_FAILED')
    }
    const decoder = new OpenRouterChatSseDecoderV1(); const assembler = new OpenRouterChatStreamAssemblerV1()
    const reader = response.body.getReader()
    const initial = input.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
      .get(command.preparedRequest.answerRootId) as { body?: unknown } | undefined
    if (!initial || typeof initial.body !== 'string') throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID')
    let visible = initial.body
    const accept = (events: readonly ReturnType<OpenRouterChatSseDecoderV1['push']>[number][]) => {
      for (const event of events) {
        if (event.type === 'done') assembler.done()
        else if (event.type === 'json') {
          const delta = assembler.push(event.value)
          if (delta.contentDelta) { const previous = visible; visible += delta.contentDelta; persistBody(command, previous, visible) }
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
      return assembler.finish()
    } finally {
      try { await reader.cancel() } catch { /* best effort */ }
      reader.releaseLock()
    }
  }

  return Object.freeze({
    run: async (command: GenerationTextCommandResultV2, signal?: AbortSignal): Promise<OpenRouterChatStreamRunResultV2> => {
      const credential = command.preparedRequest?.headersPlan.credential
      if (!isGenerationTextCommandResultV2(command) || !isPreparedProviderRequestV2(command.preparedRequest) ||
          command.preparedRequest.providerId !== 'openrouter' || credential?.kind !== 'bearer_authorization' ||
          command.request.preparedBodySha256 !== command.preparedRequest.bodySha256) {
        throw new OpenRouterChatStreamRunnerV2Error('GENERATION_V2_OPENROUTER_CHAT_RUNNER_AUTHORITY_INVALID')
      }
      begin(command)
      const scope = abortScope(signal, timeoutMs); let started = false
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
            const response = await abortable(fetchImpl(command.preparedRequest.endpoint, {
              method: command.preparedRequest.method,
              headers: { 'content-type': command.preparedRequest.headersPlan.contentType,
                accept: command.preparedRequest.headersPlan.accept,
                [credential.headerName]: `${credential.scheme} ${lease.credential}` },
              body: Buffer.from(command.preparedRequest.body.copyBytes()), redirect: 'error', signal: scope.signal,
            }), scope.signal)
            return receive(command, response, scope.signal, () => { started = true })
          },
        })
        return finalize(command, 'completed', stream, null, null, 'mid_stream')
      } catch (error) {
        const cancelled = signal?.aborted === true && !scope.timedOut()
        const code = cancelled ? 'user_cancelled' : scope.timedOut()
          ? 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_TIMEOUT'
          : error instanceof OpenRouterChatStreamRunnerV2Error ? error.code : 'GENERATION_V2_OPENROUTER_CHAT_RUNNER_TRANSPORT_FAILED'
        return finalize(command, cancelled ? 'cancelled' : 'failed', null, code,
          cancelled ? 'Generation cancelled by user.' : code, started ? 'mid_stream' : 'pre_stream')
      } finally { scope.dispose() }
    },
  })
}
