import { session } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenAIResponsesArtifactsV2Repo } from '../../infra/db/repo/openAIResponsesArtifactsV2Repo'
import { OpenAIResponsesNativeHistoryV2Repo } from '../../infra/db/repo/openAIResponsesNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import {
  isEpoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import { completeOpenAIResponsesRequestV2 } from '../../src/next/generation-v2/providers/openai-responses/continuationArtifactV2'
import {
  OpenAIResponsesStreamAssemblerV1,
  OpenAIResponsesStreamV1Error,
  OpenAIResponsesTypedSseDecoderV1,
  isOpenAIResponsesTerminalResultV1,
  type OpenAIResponsesTerminalResultV1,
} from '../../src/next/generation-v2/providers/openai-responses/responsesStreamV1'
import { createOpenAIResponsesTerminalArtifactV1 } from '../../src/next/generation-v2/providers/openai-responses/terminalArtifactV1'
import { isPreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { isGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'

const DEFAULT_TIMEOUT_MS = 5 * 60_000

export type OpenAIResponsesStreamRunResultV2 = Readonly<{
  operationId: string
  answerRootId: string
  state: 'completed' | 'failed' | 'cancelled'
  errorCode: string | null
  errorMessage: string | null
}>

export class OpenAIResponsesStreamRunnerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENAI_RUNNER_ALREADY_STARTED'
    | 'GENERATION_V2_OPENAI_RUNNER_CREDENTIAL_INVALID'
    | 'GENERATION_V2_OPENAI_RUNNER_TRANSPORT_FAILED'
    | 'GENERATION_V2_OPENAI_RUNNER_HTTP_FAILED'
    | 'GENERATION_V2_OPENAI_RUNNER_RESPONSE_INVALID'
    | 'GENERATION_V2_OPENAI_RUNNER_PROVIDER_FAILED'
    | 'GENERATION_V2_OPENAI_RUNNER_PROVIDER_INCOMPLETE'
    | 'GENERATION_V2_OPENAI_RUNNER_TIMEOUT') {
    super(code)
    this.name = 'OpenAIResponsesStreamRunnerV2Error'
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

function abortScope(external: AbortSignal | undefined, timeoutMs: number): Readonly<{
  signal: AbortSignal
  timedOut: () => boolean
  dispose: () => void
}> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30 * 60_000) {
    throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
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

function errorCode(error: unknown, timedOut: boolean): string {
  if (timedOut) return 'GENERATION_V2_OPENAI_RUNNER_TIMEOUT'
  if (error instanceof OpenAIResponsesStreamRunnerV2Error || error instanceof OpenAIResponsesStreamV1Error) {
    return error.code
  }
  return 'GENERATION_V2_OPENAI_RUNNER_TRANSPORT_FAILED'
}

function errorMessage(error: unknown): string {
  if (error instanceof OpenAIResponsesStreamRunnerV2Error || error instanceof OpenAIResponsesStreamV1Error) {
    return error.code
  }
  return 'OpenAI Responses generation failed.'
}

export function createOpenAIResponsesStreamRunnerV2(input: Readonly<{
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
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30 * 60_000 || typeof fetchImpl !== 'function') {
    throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
  }
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const historyRepo = new OpenAIResponsesNativeHistoryV2Repo(input.db)
  const artifactRepo = new OpenAIResponsesArtifactsV2Repo(input.db)

  function begin(command: GenerationTextCommandResultV2): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      const attempt = executionRepo.openAttempt(context, {
        operationId: request.operationId, requestSequence: request.requestSequence, attempt: 1,
      }, nowMs())
      if (attempt.kind !== 'created') {
        throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_ALREADY_STARTED')
      }
      requestRepo.markStreaming(context, request, nowMs())
      if (execution.operation.state === 'committed') executionRepo.markOperationStreaming(context, execution, nowMs())
      else if (execution.operation.state !== 'streaming') {
        throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
      }
    })
  }

  function persistVisibleContent(command: GenerationTextCommandResultV2, expected: string, next: string): void {
    if (expected === next) return
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      graphRepo.compareAndSetStreamingAssistantBody(
        context, command.preparedRequest.answerRootId, expected, next, nowMs(),
      )
    })
  }

  function finalize(
    command: GenerationTextCommandResultV2,
    state: 'completed' | 'failed' | 'cancelled',
    terminal: OpenAIResponsesTerminalResultV1 | null,
    terminalErrorCode: string | null,
    terminalErrorMessage: string | null,
    phase: 'pre_stream' | 'mid_stream',
  ): OpenAIResponsesStreamRunResultV2 {
    const at = nowMs()
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      const history = state === 'completed'
        ? historyRepo.loadRequestHistory(context, command.preparedRequest.operationId)
        : null
      const attemptTransition = executionRepo.terminalizeAttempt(context, {
        key: { operationId: request.operationId, requestSequence: request.requestSequence, attempt: 1 },
        outcome: state === 'completed'
          ? { kind: 'provider_completed', phase: 'mid_stream' }
          : state === 'cancelled'
            ? { kind: 'user_cancelled', phase }
            : { kind: 'provider_failed', phase, failure: { code: terminalErrorCode!, message: terminalErrorMessage! } },
      }, at)
      if (attemptTransition.kind === 'conflict') {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_ATTEMPT_TERMINAL_CONFLICT')
      }
      const terminalRequest = requestRepo.terminalize(context, request, state, at)
      if (state === 'completed') {
        if (!terminal || !history || !isOpenAIResponsesTerminalResultV1(terminal) || terminal.terminalKind !== 'completed') {
          throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_RESPONSE_INVALID')
        }
        graphRepo.terminalizeAssistantMessage(
          context, command.preparedRequest.answerRootId, 'completed', terminal.visibleText, at,
        )
        const terminalExecution = executionRepo.terminalizeOperation(context, execution, {
          state: 'completed', errorCode: null, errorMessage: null,
        }, at)
        const continuation = completeOpenAIResponsesRequestV2({
          priorArtifact: history.priorArtifact, lineageDepth: history.lineageDepth,
          clientItems: history.clientItems, returnedItems: terminal.output,
        })
        artifactRepo.insertOperationTerminal(context, terminalExecution, terminalRequest, continuation, at)
        artifactRepo.insertOperationTerminal(
          context, terminalExecution, terminalRequest, createOpenAIResponsesTerminalArtifactV1(terminal), at,
        )
      } else {
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, at)
        executionRepo.terminalizeOperation(context, execution, {
          state, errorCode: terminalErrorCode, errorMessage: terminalErrorMessage,
        }, at)
      }
    })
    return Object.freeze({
      operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId,
      state, errorCode: terminalErrorCode, errorMessage: terminalErrorMessage,
    })
  }

  async function receive(
    command: GenerationTextCommandResultV2,
    response: Response,
    signal: AbortSignal,
    onStarted: () => void,
  ): Promise<OpenAIResponsesTerminalResultV1> {
    if (response.status !== 200 || !response.body ||
        response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'text/event-stream') {
      try { await response.body?.cancel() } catch { /* best effort */ }
      throw new OpenAIResponsesStreamRunnerV2Error(
        response.status === 200 ? 'GENERATION_V2_OPENAI_RUNNER_RESPONSE_INVALID' : 'GENERATION_V2_OPENAI_RUNNER_HTTP_FAILED',
      )
    }
    const decoder = new OpenAIResponsesTypedSseDecoderV1()
    const assembler = new OpenAIResponsesStreamAssemblerV1()
    const reader = response.body.getReader()
    const initial = input.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
      .get(command.preparedRequest.answerRootId) as { body: unknown } | undefined
    if (!initial || typeof initial.body !== 'string') {
      throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
    }
    let visible = initial.body
    const accept = (events: readonly ReturnType<OpenAIResponsesTypedSseDecoderV1['push']>[number][]): void => {
      for (const event of events) assembler.push(event)
      const next = assembler.readVisibleText()
      if (next !== visible) {
        const previous = visible
        visible = next
        persistVisibleContent(command, previous, next)
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
      const terminal = assembler.finish()
      if (terminal.visibleText !== visible) {
        const previous = visible
        visible = terminal.visibleText
        persistVisibleContent(command, previous, visible)
      }
      return terminal
    } finally {
      try { await reader.cancel() } catch { /* best effort */ }
      reader.releaseLock()
    }
  }

  return Object.freeze({
    run: async (command: GenerationTextCommandResultV2, signal?: AbortSignal):
      Promise<OpenAIResponsesStreamRunResultV2> => {
      if (!isGenerationTextCommandResultV2(command) || !isPreparedProviderRequestV2(command.preparedRequest) ||
          command.preparedRequest.providerId !== 'openai_responses' || command.preparedRequest.requestSequence !== 1 ||
          command.preparedRequest.answerRootId !== command.execution.operation.resultAnswerRootId.value ||
          command.request.preparedBodySha256 !== command.preparedRequest.bodySha256) {
        throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
      }
      begin(command)
      const scope = abortScope(signal, timeoutMs)
      let responseStarted = false
      try {
        if (scope.signal.aborted) throw scope.signal.reason
        const status = await input.credentialService.getStatus('openai_responses')
        if (!status.configured || status.credentialScopeId !== command.preparedRequest.credentialScopeId) {
          throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_CREDENTIAL_INVALID')
        }
        const terminal = await input.credentialService.withCredential({
          providerKey: 'openai_responses', expectedRevision: status.revision,
          expectedCredentialScopeId: status.credentialScopeId,
          consume: async (lease) => {
            if (!isEpoch2RuntimeCredentialLease(lease) || lease.providerKey !== 'openai_responses' ||
                lease.credentialScopeId !== command.preparedRequest.credentialScopeId) {
              throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_CREDENTIAL_INVALID')
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
            } catch { /* Raw Debug persistence is explicitly non-fatal. */ }
            const response = await abortable(fetchImpl(command.preparedRequest.endpoint, {
              method: command.preparedRequest.method,
              headers: {
                'content-type': command.preparedRequest.headersPlan.contentType,
                accept: command.preparedRequest.headersPlan.accept,
                authorization: `Bearer ${lease.credential}`,
              },
              body: Buffer.from(command.preparedRequest.body.copyBytes()),
              redirect: 'error', signal: scope.signal,
            }), scope.signal)
            return receive(command, response, scope.signal, () => { responseStarted = true })
          },
        })
        if (terminal.terminalKind === 'completed') {
          return finalize(command, 'completed', terminal, null, null, 'mid_stream')
        }
        const providerCode = terminal.terminalKind === 'failed'
          ? 'GENERATION_V2_OPENAI_RUNNER_PROVIDER_FAILED'
          : 'GENERATION_V2_OPENAI_RUNNER_PROVIDER_INCOMPLETE'
        const providerMessage = terminal.error?.message ?? terminal.incompleteReason ?? providerCode
        return finalize(command, 'failed', terminal, providerCode, providerMessage, 'mid_stream')
      } catch (error) {
        const cancelled = signal?.aborted === true && !scope.timedOut()
        const code = cancelled ? 'user_cancelled' : errorCode(error, scope.timedOut())
        const message = cancelled ? 'Generation cancelled by user.' : errorMessage(error)
        return finalize(command, cancelled ? 'cancelled' : 'failed', null, code, message,
          responseStarted ? 'mid_stream' : 'pre_stream')
      } finally {
        scope.dispose()
      }
    },
  })
}
