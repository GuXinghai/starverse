import { session } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { AnthropicNativeHistoryV2Repo } from '../../infra/db/repo/anthropicNativeHistoryV2Repo'
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
  AnthropicMessagesChatStreamV1,
  type AnthropicMessagesVisibleDeltaV1,
} from '../../src/next/generation-v2/providers/anthropic/chatStreamV1'
import { createAnthropicNativeHistoryArtifactV1 } from '../../src/next/generation-v2/providers/anthropic/nativeContentBlocksV1'
import { isPreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import {
  isGenerationTextCommandResultV2,
  type GenerationTextCommandResultV2,
} from './generationTextCommandResultV2'
import {
  publishGenerationStreamProjectionV2,
  type GenerationStreamProjectionSinkV2,
} from './generationStreamProjectionV2'

const DEFAULT_TIMEOUT_MS = 5 * 60_000
const MAX_WIRE_BYTES = 64 * 1_024 * 1_024

export type AnthropicMessagesStreamRunResultV2 = Readonly<{
  operationId: string
  answerRootId: string
  state: 'awaiting_tool' | 'completed' | 'failed' | 'cancelled'
  errorCode: string | null
  errorMessage: string | null
}>

export class AnthropicMessagesStreamRunnerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_ANTHROPIC_RUNNER_AUTHORITY_INVALID'
    | 'GENERATION_V2_ANTHROPIC_RUNNER_ALREADY_STARTED'
    | 'GENERATION_V2_ANTHROPIC_RUNNER_CREDENTIAL_INVALID'
    | 'GENERATION_V2_ANTHROPIC_RUNNER_TRANSPORT_FAILED'
    | 'GENERATION_V2_ANTHROPIC_RUNNER_HTTP_FAILED'
    | 'GENERATION_V2_ANTHROPIC_RUNNER_RESPONSE_INVALID'
    | 'GENERATION_V2_ANTHROPIC_RUNNER_TIMEOUT') {
    super(code)
    this.name = 'AnthropicMessagesStreamRunnerV2Error'
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>

function abortScope(external: AbortSignal | undefined, timeoutMs: number) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30 * 60_000) {
    throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_AUTHORITY_INVALID')
  }
  const controller = new AbortController()
  let timeout = false
  const onExternalAbort = () => controller.abort('user_cancelled')
  if (external?.aborted) controller.abort('user_cancelled')
  else external?.addEventListener('abort', onExternalAbort, { once: true })
  const timer = setTimeout(() => { timeout = true; controller.abort('timeout') }, timeoutMs)
  ;(timer as NodeJS.Timeout).unref?.()
  return Object.freeze({
    signal: controller.signal,
    timedOut: () => timeout,
    dispose: () => { clearTimeout(timer); external?.removeEventListener('abort', onExternalAbort) },
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

function terminalCode(error: unknown, timedOut: boolean): string {
  if (timedOut) return 'GENERATION_V2_ANTHROPIC_RUNNER_TIMEOUT'
  if (error instanceof AnthropicMessagesStreamRunnerV2Error) return error.code
  return 'GENERATION_V2_ANTHROPIC_RUNNER_TRANSPORT_FAILED'
}

function failureMessage(error: unknown): string {
  return error instanceof AnthropicMessagesStreamRunnerV2Error
    ? error.code
    : 'Anthropic generation failed.'
}

export function createAnthropicMessagesStreamRunnerV2(input: Readonly<{
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
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 1 || timeoutMs > 30 * 60_000) {
    throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_AUTHORITY_INVALID')
  }
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const historyRepo = new AnthropicNativeHistoryV2Repo(input.db)

  function begin(command: GenerationTextCommandResultV2): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      const attempt = executionRepo.openAttempt(context, {
        operationId: command.preparedRequest.operationId,
        requestSequence: command.preparedRequest.requestSequence,
        attempt: 1,
      }, nowMs())
      if (attempt.kind !== 'created') {
        throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_ALREADY_STARTED')
      }
      requestRepo.markStreaming(context, request, nowMs())
      if (execution.operation.state === 'committed') executionRepo.markOperationStreaming(context, execution, nowMs())
      else if (execution.operation.state !== 'streaming') {
        throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_AUTHORITY_INVALID')
      }
    })
  }

  function persistVisibleContent(command: GenerationTextCommandResultV2, expected: string, next: string): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      graphRepo.compareAndSetStreamingAssistantBody(
        context, command.preparedRequest.answerRootId, expected, next, nowMs(),
      )
    })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, {
      type: 'assistant_body', operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, content: next,
    })
  }

  function finalize(
    command: GenerationTextCommandResultV2,
    state: 'completed' | 'failed' | 'cancelled',
    nativeSnapshot: unknown | null,
    errorCode: string | null,
    errorMessage: string | null,
    phase: 'pre_stream' | 'mid_stream',
  ): AnthropicMessagesStreamRunResultV2 {
    const at = nowMs()
    let resultState: AnthropicMessagesStreamRunResultV2['state'] = state
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      const attempt = executionRepo.terminalizeAttempt(context, {
        key: { operationId: request.operationId, requestSequence: request.requestSequence, attempt: 1 },
        outcome: state === 'completed'
          ? { kind: 'provider_completed', phase: 'mid_stream' }
          : state === 'cancelled'
            ? { kind: 'user_cancelled', phase }
            : { kind: 'provider_failed', phase, failure: { code: errorCode!, message: errorMessage! } },
      }, at)
      if (attempt.kind === 'conflict') {
        throw new GenerationExecutionV2RepoError('GENERATION_V2_EXECUTION_ATTEMPT_TERMINAL_CONFLICT')
      }
      const terminalRequest = requestRepo.terminalize(context, request, state, at)
      if (state === 'completed') {
        const artifact = createAnthropicNativeHistoryArtifactV1(nativeSnapshot)
        const tools = execution.snapshot.semanticIntent.tools ?? { mode: 'disabled' as const }
        if (artifact.stopReason === 'pause_turn' ||
            (artifact.stopReason === 'tool_use' && tools.mode !== 'enabled')) {
          throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_RESPONSE_INVALID')
        }
        if (artifact.stopReason === 'tool_use') {
          resultState = 'awaiting_tool'
          historyRepo.insertRequestTerminalArtifact(context, execution, terminalRequest, artifact, at)
        } else {
          const body = input.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
            .get(command.preparedRequest.answerRootId) as { body: unknown } | undefined
          if (!body || typeof body.body !== 'string') {
            throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_RESPONSE_INVALID')
          }
          graphRepo.terminalizeAssistantMessage(
            context, command.preparedRequest.answerRootId, 'completed', body.body, at,
          )
          const terminalExecution = executionRepo.terminalizeOperation(context, execution, {
            state: 'completed', errorCode: null, errorMessage: null,
          }, at)
          historyRepo.insertRequestTerminalArtifact(context, terminalExecution, terminalRequest, artifact, at)
        }
      } else {
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, at)
        executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage }, at)
      }
    })
    const terminal = Object.freeze({
      operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId,
      state: resultState,
      errorCode,
      errorMessage,
    })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, {
      type: 'terminal', operationId: terminal.operationId, answerRootId: terminal.answerRootId,
      state: terminal.state, errorCode: terminal.errorCode, errorMessage: terminal.errorMessage,
    })
    return terminal
  }

  async function receive(
    command: GenerationTextCommandResultV2,
    response: Response,
    signal: AbortSignal,
    onStreamStarted: () => void,
  ): Promise<unknown> {
    if (response.status !== 200 || !response.body ||
        response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'text/event-stream') {
      try { await response.body?.cancel() } catch { /* best effort */ }
      throw new AnthropicMessagesStreamRunnerV2Error(response.status === 200
        ? 'GENERATION_V2_ANTHROPIC_RUNNER_RESPONSE_INVALID'
        : 'GENERATION_V2_ANTHROPIC_RUNNER_HTTP_FAILED')
    }
    onStreamStarted()
    const stream = new AnthropicMessagesChatStreamV1()
    const reader = response.body.getReader()
    const initial = input.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
      .get(command.preparedRequest.answerRootId) as { body: unknown } | undefined
    if (!initial || typeof initial.body !== 'string') {
      throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_AUTHORITY_INVALID')
    }
    let visibleContent = initial.body
    let wireBytes = 0
    let completed = false
    const accept = (deltas: readonly AnthropicMessagesVisibleDeltaV1[]) => {
      const text = deltas.filter((delta) => delta.type === 'text').map((delta) => delta.text).join('')
      const thinking = deltas.filter((delta) => delta.type === 'thinking').map((delta) => delta.text).join('')
      if (text.length > 0) {
        const previous = visibleContent
        visibleContent += text
        persistVisibleContent(command, previous, visibleContent)
      }
      if (thinking.length > 0) {
        publishGenerationStreamProjectionV2(input.streamProjectionSink, {
          type: 'reasoning_detail', operationId: command.preparedRequest.operationId,
          answerRootId: command.preparedRequest.answerRootId,
          detail: Object.freeze({ provider: 'anthropic', type: 'thinking', text: thinking }),
        })
      }
    }
    try {
      while (true) {
        const item = await abortable(reader.read(), signal)
        if (item.done) break
        wireBytes += item.value.byteLength
        if (wireBytes > MAX_WIRE_BYTES) {
          throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_RESPONSE_INVALID')
        }
        accept(stream.push(item.value))
      }
      const snapshot = stream.finish()
      completed = true
      return snapshot
    } finally {
      if (!completed) {
        try { await reader.cancel() } catch { /* best effort */ }
      }
      try { reader.releaseLock() } catch { /* best effort */ }
    }
  }

  return Object.freeze({
    run: async (
      command: GenerationTextCommandResultV2,
      signal?: AbortSignal,
    ): Promise<AnthropicMessagesStreamRunResultV2> => {
      const credentialPlan = command?.preparedRequest?.headersPlan.credential
      if (!isGenerationTextCommandResultV2(command) ||
          !isPreparedProviderRequestV2(command.preparedRequest) ||
          command.preparedRequest.providerId !== 'anthropic' ||
          command.preparedRequest.contractId !== 'anthropic-messages-2023-06-01' ||
          credentialPlan?.kind !== 'anthropic_x_api_key') {
        throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_AUTHORITY_INVALID')
      }
      begin(command)
      const scope = abortScope(signal, timeoutMs)
      let responseStarted = false
      try {
        if (scope.signal.aborted) throw scope.signal.reason
        const status = await input.credentialService.getStatus('anthropic')
        if (!status.configured || status.credentialScopeId !== command.preparedRequest.credentialScopeId) {
          throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_CREDENTIAL_INVALID')
        }
        const nativeSnapshot = await input.credentialService.withCredential({
          providerKey: 'anthropic',
          expectedRevision: status.revision,
          expectedCredentialScopeId: status.credentialScopeId,
          consume: async (lease) => {
            if (!isEpoch2RuntimeCredentialLease(lease) || lease.providerKey !== 'anthropic' ||
                lease.credentialScopeId !== command.preparedRequest.credentialScopeId) {
              throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_CREDENTIAL_INVALID')
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
            } catch { /* Raw Debug persistence is non-fatal by Owner decision. */ }
            const plan = command.preparedRequest.headersPlan
            const response = await abortable(fetchImpl(command.preparedRequest.endpoint, {
              method: command.preparedRequest.method,
              headers: {
                'content-type': plan.contentType,
                accept: plan.accept,
                [credentialPlan.headerName]: lease.credential,
                [credentialPlan.apiVersion.headerName]: credentialPlan.apiVersion.value,
              },
              body: Buffer.from(command.preparedRequest.body.copyBytes()),
              redirect: 'error',
              signal: scope.signal,
            }), scope.signal)
            return receive(command, response, scope.signal, () => { responseStarted = true })
          },
        })
        return finalize(command, 'completed', nativeSnapshot, null, null, 'mid_stream')
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
