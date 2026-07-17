import { session } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { DeepSeekNativeHistoryV2Repo } from '../../infra/db/repo/deepSeekNativeHistoryV2Repo'
import { DeepSeekTerminalArtifactV2Repo } from '../../infra/db/repo/deepSeekTerminalArtifactV2Repo'
import {
  GenerationExecutionV2Repo,
  GenerationExecutionV2RepoError,
} from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import {
  isEpoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import {
  DeepSeekStableChatStreamAssemblerV1,
  DeepSeekStableSseDecoderV1,
  isDeepSeekStableStreamResultV1,
  type DeepSeekStableStreamDeltaV1,
  type DeepSeekStableStreamResultV1,
} from '../../src/next/generation-v2/providers/deepseek/chatStreamV1'
import { completeDeepSeekNativeRequestV2 } from '../../src/next/generation-v2/providers/deepseek/nativeMessagesV1'
import { createDeepSeekStableTerminalArtifactV1 } from '../../src/next/generation-v2/providers/deepseek/terminalArtifactV1'
import { isPreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import {
  isDeepSeekPlainTextInitialSendResultV2,
  type DeepSeekPlainTextInitialSendResultV2,
} from './deepSeekPlainTextInitialSendCoordinatorV2'

const DEFAULT_TIMEOUT_MS = 5 * 60_000
const MAX_WIRE_BYTES = 64 * 1024 * 1024

export type DeepSeekInitialStreamRunResultV2 = Readonly<{
  operationId: string
  answerRootId: string
  state: 'completed' | 'failed' | 'cancelled'
  errorCode: string | null
  errorMessage: string | null
}>

export class DeepSeekInitialStreamRunnerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_DEEPSEEK_RUNNER_AUTHORITY_INVALID'
    | 'GENERATION_V2_DEEPSEEK_RUNNER_ALREADY_STARTED'
    | 'GENERATION_V2_DEEPSEEK_RUNNER_CREDENTIAL_INVALID'
    | 'GENERATION_V2_DEEPSEEK_RUNNER_TRANSPORT_FAILED'
    | 'GENERATION_V2_DEEPSEEK_RUNNER_HTTP_FAILED'
    | 'GENERATION_V2_DEEPSEEK_RUNNER_RESPONSE_INVALID'
    | 'GENERATION_V2_DEEPSEEK_RUNNER_TIMEOUT') {
    super(code)
    this.name = 'DeepSeekInitialStreamRunnerV2Error'
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

function abortScope(external: AbortSignal | undefined, timeoutMs: number): Readonly<{
  signal: AbortSignal
  timedOut: () => boolean
  dispose: () => void
}> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30 * 60_000) {
    throw new DeepSeekInitialStreamRunnerV2Error('GENERATION_V2_DEEPSEEK_RUNNER_AUTHORITY_INVALID')
  }
  const controller = new AbortController()
  let timeout = false
  const onExternalAbort = () => controller.abort('user_cancelled')
  if (external?.aborted) controller.abort('user_cancelled')
  else external?.addEventListener('abort', onExternalAbort, { once: true })
  const timer = setTimeout(() => {
    timeout = true
    controller.abort('timeout')
  }, timeoutMs)
  ;(timer as NodeJS.Timeout).unref?.()
  return Object.freeze({
    signal: controller.signal,
    timedOut: () => timeout,
    dispose: () => {
      clearTimeout(timer)
      external?.removeEventListener('abort', onExternalAbort)
    },
  })
}

async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function failureMessage(error: unknown): string {
  if (error instanceof DeepSeekInitialStreamRunnerV2Error) return error.code
  return 'DeepSeek generation failed.'
}

function terminalCode(error: unknown, timedOut: boolean): string {
  if (timedOut) return 'GENERATION_V2_DEEPSEEK_RUNNER_TIMEOUT'
  if (error instanceof DeepSeekInitialStreamRunnerV2Error) return error.code
  return 'GENERATION_V2_DEEPSEEK_RUNNER_TRANSPORT_FAILED'
}

export function createDeepSeekInitialStreamRunnerV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  rawGenerationRequestStore?: RawGenerationRequestStore
  fetchImpl?: Fetch
  nowMs?: () => number
  timeoutMs?: number
}>) {
  const nowMs = input.nowMs ?? Date.now
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30 * 60_000 ||
      typeof fetchImpl !== 'function') {
    throw new DeepSeekInitialStreamRunnerV2Error('GENERATION_V2_DEEPSEEK_RUNNER_AUTHORITY_INVALID')
  }
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const historyRepo = new DeepSeekNativeHistoryV2Repo(input.db)
  const terminalArtifactRepo = new DeepSeekTerminalArtifactV2Repo(input.db)

  function begin(result: DeepSeekPlainTextInitialSendResultV2): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, result.preparedRequest.operationId)
      if (!execution) throw new DeepSeekInitialStreamRunnerV2Error('GENERATION_V2_DEEPSEEK_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, result.preparedRequest)
      const attempt = executionRepo.openAttempt(context, {
        operationId: result.preparedRequest.operationId,
        requestSequence: result.preparedRequest.requestSequence,
        attempt: 1,
      }, nowMs())
      if (attempt.kind !== 'created') {
        throw new DeepSeekInitialStreamRunnerV2Error('GENERATION_V2_DEEPSEEK_RUNNER_ALREADY_STARTED')
      }
      requestRepo.markStreaming(context, request, nowMs())
      executionRepo.markOperationStreaming(context, execution, nowMs())
    })
  }

  function persistVisibleContent(
    result: DeepSeekPlainTextInitialSendResultV2,
    expected: string,
    next: string,
  ): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      graphRepo.compareAndSetStreamingAssistantBody(
        context, result.preparedRequest.answerRootId, expected, next, nowMs(),
      )
    })
  }

  function finalize(
    command: DeepSeekPlainTextInitialSendResultV2,
    state: 'completed' | 'failed' | 'cancelled',
    streamResult: DeepSeekStableStreamResultV1 | null,
    errorCode: string | null,
    errorMessage: string | null,
    phase: 'pre_stream' | 'mid_stream',
  ): DeepSeekInitialStreamRunResultV2 {
    const at = nowMs()
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new DeepSeekInitialStreamRunnerV2Error('GENERATION_V2_DEEPSEEK_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      const attemptTransition = executionRepo.terminalizeAttempt(context, {
        key: { operationId: command.preparedRequest.operationId, requestSequence: 1, attempt: 1 },
        outcome: state === 'completed'
          ? { kind: 'provider_completed', phase: 'mid_stream' }
          : state === 'cancelled'
            ? { kind: 'user_cancelled', phase }
            : { kind: 'provider_failed', phase, failure: { code: errorCode!, message: errorMessage! } },
      }, at)
      if (attemptTransition.kind === 'conflict') {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_ATTEMPT_TERMINAL_CONFLICT')
      }
      const terminalRequest = requestRepo.terminalize(context, request, state, at)
      const finalBody = state === 'completed' ? streamResult?.assistantMessage.content ?? '' : null
      graphRepo.terminalizeAssistantMessage(
        context, command.preparedRequest.answerRootId, state, finalBody, at,
      )
      const terminalExecution = executionRepo.terminalizeOperation(context, execution, {
        state, errorCode, errorMessage,
      }, at)
      if (state === 'completed') {
        if (!streamResult || !isDeepSeekStableStreamResultV1(streamResult)) {
          throw new DeepSeekInitialStreamRunnerV2Error('GENERATION_V2_DEEPSEEK_RUNNER_RESPONSE_INVALID')
        }
        const history = historyRepo.loadInitialSendHistory(context, command.preparedRequest.operationId)
        const artifact = completeDeepSeekNativeRequestV2({
          priorArtifact: history.priorArtifact,
          clientEntries: history.clientEntries,
          assistantMessage: streamResult.assistantMessage,
          generatedWithThinking: streamResult.generatedWithThinking,
        })
        historyRepo.insertCompletedHistoryArtifact(context, terminalExecution, terminalRequest, artifact, at)
        terminalArtifactRepo.insertCompleted(
          context, terminalExecution, terminalRequest,
          createDeepSeekStableTerminalArtifactV1(streamResult), at,
        )
      }
    })
    return Object.freeze({
      operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId,
      state,
      errorCode,
      errorMessage,
    })
  }

  async function receive(
    command: DeepSeekPlainTextInitialSendResultV2,
    response: Response,
    signal: AbortSignal,
    onStreamStarted: () => void,
  ): Promise<Readonly<{ result: DeepSeekStableStreamResultV1; visibleContent: string }>> {
    if (response.status !== 200 || !response.body ||
        response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'text/event-stream') {
      try { await response.body?.cancel() } catch { /* best-effort */ }
      throw new DeepSeekInitialStreamRunnerV2Error(
        response.status === 200
          ? 'GENERATION_V2_DEEPSEEK_RUNNER_RESPONSE_INVALID'
          : 'GENERATION_V2_DEEPSEEK_RUNNER_HTTP_FAILED',
      )
    }
    const thinkingMode = command.execution.snapshot.semanticIntent.reasoning.mode
    const decoder = new DeepSeekStableSseDecoderV1()
    const assembler = new DeepSeekStableChatStreamAssemblerV1(thinkingMode)
    const reader = response.body.getReader()
    let wireBytes = 0
    let visibleContent = ''
    const accept = (deltas: readonly DeepSeekStableStreamDeltaV1[]): void => {
      const content = deltas.map((delta) => delta.contentDelta ?? '').join('')
      if (content.length > 0) {
        const previous = visibleContent
        visibleContent += content
        persistVisibleContent(command, previous, visibleContent)
      }
    }
    const eventsToDeltas = (events: ReturnType<DeepSeekStableSseDecoderV1['push']>) => {
      const deltas: DeepSeekStableStreamDeltaV1[] = []
      for (const event of events) if (event.type === 'json') deltas.push(assembler.pushChunk(event.value))
      return Object.freeze(deltas)
    }
    try {
      while (true) {
        const item = await abortable(reader.read(), signal)
        if (item.done) break
        if (item.value.byteLength > 0) onStreamStarted()
        wireBytes += item.value.byteLength
        if (wireBytes > MAX_WIRE_BYTES) {
          throw new DeepSeekInitialStreamRunnerV2Error('GENERATION_V2_DEEPSEEK_RUNNER_RESPONSE_INVALID')
        }
        accept(eventsToDeltas(decoder.push(item.value)))
      }
      accept(eventsToDeltas(decoder.finish()))
      return Object.freeze({ result: assembler.acceptDone(), visibleContent })
    } finally {
      try { await reader.cancel() } catch { /* best-effort */ }
      reader.releaseLock()
    }
  }

  return Object.freeze({
    run: async (command: DeepSeekPlainTextInitialSendResultV2, signal?: AbortSignal):
      Promise<DeepSeekInitialStreamRunResultV2> => {
      if (!isDeepSeekPlainTextInitialSendResultV2(command) ||
          !isPreparedProviderRequestV2(command.preparedRequest) ||
          command.preparedRequest.providerId !== 'deepseek' || command.preparedRequest.requestSequence !== 1 ||
          command.preparedRequest.answerRootId !== command.execution.operation.resultAnswerRootId.value ||
          command.request.preparedBodySha256 !== command.preparedRequest.bodySha256) {
        throw new DeepSeekInitialStreamRunnerV2Error('GENERATION_V2_DEEPSEEK_RUNNER_AUTHORITY_INVALID')
      }
      begin(command)
      const scope = abortScope(signal, timeoutMs)
      let responseStarted = false
      try {
        if (scope.signal.aborted) throw scope.signal.reason
        const status = await input.credentialService.getStatus('deepseek')
        if (!status.configured || status.credentialScopeId !== command.preparedRequest.credentialScopeId) {
          throw new DeepSeekInitialStreamRunnerV2Error('GENERATION_V2_DEEPSEEK_RUNNER_CREDENTIAL_INVALID')
        }
        const received = await input.credentialService.withCredential({
          providerKey: 'deepseek',
          expectedRevision: status.revision,
          expectedCredentialScopeId: status.credentialScopeId,
          consume: async (lease) => {
            if (!isEpoch2RuntimeCredentialLease(lease) || lease.providerKey !== 'deepseek' ||
                lease.credentialScopeId !== command.preparedRequest.credentialScopeId) {
              throw new DeepSeekInitialStreamRunnerV2Error('GENERATION_V2_DEEPSEEK_RUNNER_CREDENTIAL_INVALID')
            }
            lease.assertCurrent()
            try {
              input.rawGenerationRequestStore?.tryPersistPreparedV2({
                operationId: command.preparedRequest.operationId,
                answerRootId: command.preparedRequest.answerRootId,
                requestSequence: command.preparedRequest.requestSequence,
                providerId: command.preparedRequest.providerId,
                modelId: command.preparedRequest.modelId,
                conversationId: command.execution.operation.conversationId.value,
                branchId: command.execution.operation.branchId.value,
                questionId: command.execution.operation.questionId.value,
                actionKind: command.execution.operation.actionKind,
              }, command.preparedRequest.body)
            } catch { /* Raw Debug is explicitly non-fatal. */ }
            const response = await abortable(fetchImpl(command.preparedRequest.endpoint, {
              method: command.preparedRequest.method,
              headers: {
                'content-type': command.preparedRequest.headersPlan.contentType,
                accept: command.preparedRequest.headersPlan.accept,
                authorization: `Bearer ${lease.credential}`,
              },
              body: Buffer.from(command.preparedRequest.body.copyBytes()),
              redirect: 'error',
              signal: scope.signal,
            }), scope.signal)
            return receive(command, response, scope.signal, () => { responseStarted = true })
          },
        })
        return finalize(command, 'completed', received.result, null, null, 'mid_stream')
      } catch (error) {
        const cancelled = signal?.aborted === true && !scope.timedOut()
        const code = cancelled ? 'user_cancelled' : terminalCode(error, scope.timedOut())
        const message = cancelled ? 'Generation cancelled by user.' : failureMessage(error)
        return finalize(command, cancelled ? 'cancelled' : 'failed', null, code, message,
          responseStarted ? 'mid_stream' : 'pre_stream')
      } finally {
        scope.dispose()
      }
    },
  })
}
