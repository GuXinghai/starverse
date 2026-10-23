import { GenerationInterruptedReplayV2Repo } from '../../infra/db/repo/generationInterruptedReplayV2Repo'
import type { InterruptedNativeSnapshotV1 } from '../../src/core/generation-v2/providers/interruptedReplayV1'
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
} from '../../src/core/generation-v2/providers/anthropic/chatStreamV1'
import type { AnthropicProviderNativeSnapshot } from '@/shared/provider/providerNativeContracts'
import { createAnthropicNativeHistoryArtifactV1 } from '../../src/core/generation-v2/providers/anthropic/nativeContentBlocksV1'
import { isPreparedProviderRequestV2 } from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'
import {
  isGenerationTextCommandResultV2,
  type GenerationTextCommandResultV2,
} from './generationTextCommandResultV2'
import {
  publishGenerationStreamProjectionV2,
  type GenerationStreamProjectionSinkV2,
} from './generationStreamProjectionV2'
import { createGenerationTextBodyCheckpointV2 } from './generationBodyCheckpointV2'
import { createGenerationAbortScope, isValidGenerationTotalTimeoutMsV2 } from './generationTimeoutPolicyV2'
import {
  hasPendingGenerationNativeCompletionForOperationV2,
  isGenerationNativeCompletionMaterializationPendingV2Error,
  materializeNewGenerationNativeCompletionV2,
  persistGenerationNativeCompletionReceiptV2,
  preserveGenerationNativeCompletionPendingFailureV2,
  registerGenerationNativeCompletionMaterializerV2,
} from './generationNativeCompletionV2'
import { incompleteProviderFinishV2 } from './generationProviderFinishV2'

const MAX_WIRE_BYTES = 64 * 1_024 * 1_024

export type AnthropicMessagesStreamRunResultV2 = Readonly<{
  operationId: string
  answerRootId: string
  state: 'awaiting_tool' | 'completed' | 'failed' | 'cancelled'
  errorCode: string | null
  errorMessage: string | null
}>

export const ANTHROPIC_PAUSE_TURN_ERROR_CODE = 'GENERATION_V2_ANTHROPIC_PAUSE_TURN_UNSUPPORTED'
const ANTHROPIC_PAUSE_TURN_ERROR_MESSAGE = 'The provider paused this turn before it finished. Continuing a paused turn is not supported.'

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

function normalizeAnthropicTerminalSnapshot(value: unknown): AnthropicProviderNativeSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_RESPONSE_INVALID')
  }
  const snapshot = value as Record<string, unknown>
  const usage = snapshot.usage
  if (!usage || typeof usage !== 'object' || Array.isArray(usage) || Object.getPrototypeOf(usage) !== Object.prototype) {
    throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_RESPONSE_INVALID')
  }
  // The Messages SSE terminal delta commonly sends only output_tokens. Store a
  // closed, complete provider snapshot so restart materialization uses the same
  // strict native artifact codec as the live path.
  const rawUsage = usage as Record<string, unknown>
  const completeUsage = Object.freeze({
    ...rawUsage,
    cache_creation: rawUsage.cache_creation ?? null,
    cache_creation_input_tokens: rawUsage.cache_creation_input_tokens ?? null,
    cache_read_input_tokens: rawUsage.cache_read_input_tokens ?? null,
    inference_geo: rawUsage.inference_geo ?? null,
    output_tokens_details: rawUsage.output_tokens_details ?? null,
    server_tool_use: rawUsage.server_tool_use ?? null,
    service_tier: rawUsage.service_tier ?? null,
  })
  const normalized = Object.freeze({ ...snapshot, usage: completeUsage }) as AnthropicProviderNativeSnapshot
  createAnthropicNativeHistoryArtifactV1(normalized)
  return normalized
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
  const timeoutMs = input.timeoutMs
  if (typeof fetchImpl !== 'function' || !isValidGenerationTotalTimeoutMsV2(timeoutMs)) {
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

  const interruptedSnapshots = new WeakMap<GenerationTextCommandResultV2, InterruptedNativeSnapshotV1>()
  function persistInterrupted(context: Parameters<GenerationInterruptedReplayV2Repo['insert']>[0], command: GenerationTextCommandResultV2) {
    const native = interruptedSnapshots.get(command)
    if (!native) return
    const bytes = command.preparedRequest.body.copyBytes()
    try {
      new GenerationInterruptedReplayV2Repo(input.db).insert(context, {
        answerRootId: command.preparedRequest.answerRootId, operationId: command.preparedRequest.operationId,
        requestSequence: command.preparedRequest.requestSequence, protocol: 'anthropic',
        requestBody: JSON.parse(new TextDecoder().decode(bytes)), native,
      })
    } finally { bytes.fill(0) }
  }

  function finalize(
    command: GenerationTextCommandResultV2,
    state: 'completed' | 'failed' | 'cancelled',
    nativeSnapshot: unknown | null,
    errorCode: string | null,
    errorMessage: string | null,
    phase: 'pre_stream' | 'mid_stream',
  ): AnthropicMessagesStreamRunResultV2 {
    if (state === 'completed') {
      const stopReason = createAnthropicNativeHistoryArtifactV1(nativeSnapshot).stopReason
      // pause_turn asks the client to continue the turn, which is not supported, so
      // the paused turn is not complete and must not be stored as one (P4a-07).
      // max_tokens and refusal are not completed answers either (P4a-15).
      const incomplete = stopReason === 'pause_turn'
        ? { code: ANTHROPIC_PAUSE_TURN_ERROR_CODE, message: ANTHROPIC_PAUSE_TURN_ERROR_MESSAGE }
        : incompleteProviderFinishV2(stopReason)
      if (incomplete) {
        state = 'failed'
        errorCode = incomplete.code
        errorMessage = incomplete.message
      }
    }
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
        if (artifact.stopReason === 'tool_use' && tools.mode !== 'enabled') {
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
        if (resultState === 'awaiting_tool') persistInterrupted(context, command)
      } else {
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, at)
        executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage }, at)
        persistInterrupted(context, command)
      }
    })
    interruptedSnapshots.delete(command)
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
  ): Promise<AnthropicProviderNativeSnapshot> {
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
    const checkpoint = createGenerationTextBodyCheckpointV2({
      db: input.db, graphRepo, command, initialBody: visibleContent,
      streamProjectionSink: input.streamProjectionSink, nowMs,
      onFailure: (error) => { void reader.cancel(error).catch(() => undefined) },
    })
    let wireBytes = 0
    let completed = false
    const accept = (deltas: readonly AnthropicMessagesVisibleDeltaV1[]) => {
      const text = deltas.filter((delta) => delta.type === 'text').map((delta) => delta.text).join('')
      const thinking = deltas.filter((delta) => delta.type === 'thinking').map((delta) => delta.text).join('')
      if (text.length > 0) {
        visibleContent += text
        checkpoint.update(visibleContent)
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
      const snapshot = normalizeAnthropicTerminalSnapshot(stream.finish())
      // The completed body is read back from the checkpoint, so it must be durable
      // before the receipt makes the completion recoverable (P4a-08).
      checkpoint.flush()
      persistGenerationNativeCompletionReceiptV2(input.db, command, snapshot, nowMs())
      completed = true
      return snapshot
    } finally {
      // A failing snapshot must not skip the cleanup below or mask the stream error (P4a-12).
      try { interruptedSnapshots.set(command, stream.interruptedSnapshot()) } catch { /* cleanup continues */ }
      try { checkpoint.flush() } finally {
        checkpoint.dispose()
        if (!completed) {
          try { await reader.cancel() } catch { /* best effort */ }
        }
        try { reader.releaseLock() } catch { /* best effort */ }
      }
    }
  }

  registerGenerationNativeCompletionMaterializerV2(input.db, 'anthropic-messages-2023-06-01', (_receipt, command, value) => {
    const nativeSnapshot = normalizeAnthropicTerminalSnapshot(value)
    const artifact = createAnthropicNativeHistoryArtifactV1(nativeSnapshot)
    const items = JSON.parse(JSON.stringify(artifact.assistantMessage.content)) as Readonly<Record<string, unknown>>[]
    interruptedSnapshots.set(command, Object.freeze({ items: Object.freeze(items),
      completeIndexes: Object.freeze(items.map((_, index) => index)), text: '', complete: true }))
    return finalize(command, 'completed', nativeSnapshot, null, null, 'mid_stream')
  }, (command, value) => {
    const artifact = createAnthropicNativeHistoryArtifactV1(normalizeAnthropicTerminalSnapshot(value))
    const tools = command.execution.snapshot.semanticIntent.tools ?? { mode: 'disabled' as const }
    if (artifact.stopReason === 'tool_use' && tools.mode !== 'enabled') {
      throw new AnthropicMessagesStreamRunnerV2Error('GENERATION_V2_ANTHROPIC_RUNNER_RESPONSE_INVALID')
    }
  })

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
      const scope = createGenerationAbortScope(signal, timeoutMs)
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
                ...(plan.ordinaryHeaders ?? []).reduce<Record<string, string>>((headers, header) => {
                  headers[header.name] = header.value
                  return headers
                }, {}),
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
        for (const nativeBlock of nativeSnapshot.content) {
          if (nativeBlock.type === 'redacted_thinking') {
            publishGenerationStreamProjectionV2(input.streamProjectionSink, {
              type: 'reasoning_detail',
              operationId: command.preparedRequest.operationId,
              answerRootId: command.preparedRequest.answerRootId,
              detail: Object.freeze({ provider: 'anthropic', type: 'redacted_thinking' }),
            })
          } else if (nativeBlock.type === 'thinking' && nativeBlock.thinking === '' &&
              typeof nativeBlock.signature === 'string' && nativeBlock.signature.length > 0) {
            publishGenerationStreamProjectionV2(input.streamProjectionSink, {
              type: 'reasoning_detail',
              operationId: command.preparedRequest.operationId,
              answerRootId: command.preparedRequest.answerRootId,
              detail: Object.freeze({ provider: 'anthropic', type: 'thinking_omitted' }),
            })
          }
        }
        return materializeNewGenerationNativeCompletionV2({
          db: input.db, command, nativeResult: nativeSnapshot, nowMs,
          materialize: () => finalize(command, 'completed', nativeSnapshot, null, null, 'mid_stream'),
        })
      } catch (error) {
        if (isGenerationNativeCompletionMaterializationPendingV2Error(error)) throw error
        if (hasPendingGenerationNativeCompletionForOperationV2(input.db, command.preparedRequest.operationId)) {
          throw preserveGenerationNativeCompletionPendingFailureV2(input.db, command, error)
        }
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
