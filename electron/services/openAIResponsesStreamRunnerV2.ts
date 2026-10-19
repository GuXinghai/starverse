import { GenerationInterruptedReplayV2Repo } from '../../infra/db/repo/generationInterruptedReplayV2Repo'
import type { InterruptedNativeSnapshotV1 } from '../../src/core/generation-v2/providers/interruptedReplayV1'
import { session } from 'electron'
import { randomUUID } from 'node:crypto'
import { Buffer } from 'node:buffer'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { GenerationImageOutputV2Repo } from '../../infra/db/repo/generationImageOutputV2Repo'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { OpenAIResponsesArtifactsV2Repo } from '../../infra/db/repo/openAIResponsesArtifactsV2Repo'
import { OpenAIResponsesNativeHistoryV2Repo } from '../../infra/db/repo/openAIResponsesNativeHistoryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { PROVIDER_ERROR_RESPONSE_BODY_MAX_BYTES_V2, readBoundedResponseTextV2 } from '../net/boundedResponseBodyV2'
import {
  isEpoch2RuntimeCredentialLease,
  type Epoch2RuntimeCredentialService,
} from '../credentials/epoch2RuntimeCredentialService'
import { completeOpenAIResponsesProjectedRequestV2, completeOpenAIResponsesRequestV2 } from '../../src/core/generation-v2/providers/openai-responses/continuationArtifactV2'
import {
  OpenAIResponsesStreamAssemblerV1,
  OpenAIResponsesStreamV1Error,
  OpenAIResponsesTypedSseDecoderV1,
  isOpenAIResponsesTerminalResultV1,
  type OpenAIResponsesTerminalResultV1,
} from '../../src/core/generation-v2/providers/openai-responses/responsesStreamV1'
import { createOpenAIResponsesTerminalArtifactV1 } from '../../src/core/generation-v2/providers/openai-responses/terminalArtifactV1'
import type { OpenAIResponsesReturnedItemV1 } from '../../src/core/generation-v2/providers/openai-responses/nativeItemsV1'
import {
  createOpenAIResponsesCompletionReceiptV1,
  restoreOpenAIResponsesCompletionReceiptV1,
  type OpenAIResponsesCompletionReceiptV1,
} from '../../src/core/generation-v2/providers/openai-responses/completionReceiptV1'
import { isPreparedProviderRequestV2 } from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'
import { isGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import {
  publishGenerationStreamProjectionV2,
  type GenerationStreamProjectionSinkV2,
} from './generationStreamProjectionV2'
import { createGenerationTextBodyCheckpointV2 } from './generationBodyCheckpointV2'
import {
  createProviderFailureV2,
  ProviderFailureErrorV2,
  providerFailureFromUnknownV2,
  providerFailurePrimaryMessageV2,
  type ProviderFailureV2,
} from '../../src/shared/provider/providerFailureV2'
import { createGenerationAbortScope, isValidGenerationTotalTimeoutMsV2 } from './generationTimeoutPolicyV2'
import {
  hasPendingGenerationNativeCompletionForOperationV2,
  isGenerationNativeCompletionMaterializationPendingV2Error,
  materializeNewGenerationNativeCompletionV2,
  persistGenerationNativeCompletionReceiptV2,
  preserveGenerationNativeCompletionPendingFailureV2,
  registerGenerationNativeCompletionMaterializerV2,
} from './generationNativeCompletionV2'


export type OpenAIResponsesStreamRunResultV2 = Readonly<{
  operationId: string
  answerRootId: string
  state: 'awaiting_tool' | 'completed' | 'failed' | 'cancelled'
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


async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort))
  })
}

function hasUnresolvedFunctionCall(terminal: OpenAIResponsesTerminalResultV1): boolean {
  return terminal.output.some((item) => 'type' in item && item.type === 'function_call')
}

function completedImages(terminal: OpenAIResponsesTerminalResultV1) {
  const items = terminal.output.filter((item) => item.type === 'image_generation_call' && item.status === 'completed')
  if (items.length > 10) throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_RESPONSE_INVALID')
  return items.map((item, outputIndex) => {
    if (item.type !== 'image_generation_call' || !item.result ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(item.result)) {
      throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_RESPONSE_INVALID')
    }
    const bytes = Buffer.from(item.result, 'base64')
    if (bytes.length === 0 || bytes.toString('base64') !== item.result) {
      throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_RESPONSE_INVALID')
    }
    // The returned item has no MIME field. Use the actual image signature,
    // including on receipt recovery, rather than a mutable request preference.
    const format = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? 'png'
      : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'jpeg'
        : bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' ? 'webp'
          : null
    if (!format) throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_RESPONSE_INVALID')
    return { outputIndex, bytes, mime: `image/${format}`, filename: `generated.${format}` }
  })
}

export function createOpenAIResponsesStreamRunnerV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
  rawGenerationRequestStore?: RawGenerationRequestStore
  fetchImpl?: Fetch
  nowMs?: () => number
  timeoutMs?: number
  streamProjectionSink?: GenerationStreamProjectionSinkV2
}>) {
  const nowMs = input.nowMs ?? Date.now
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  const timeoutMs = input.timeoutMs
  if (!isValidGenerationTotalTimeoutMsV2(timeoutMs) || typeof fetchImpl !== 'function') {
    throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
  }
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const historyRepo = new OpenAIResponsesNativeHistoryV2Repo(input.db)
  const artifactRepo = new OpenAIResponsesArtifactsV2Repo(input.db)
  const assetRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const outputRepo = new GenerationImageOutputV2Repo(input.db, nowMs)

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

  const interruptedSnapshots = new WeakMap<GenerationTextCommandResultV2, InterruptedNativeSnapshotV1>()
  const replayOutputs = new WeakMap<GenerationTextCommandResultV2, readonly OpenAIResponsesReturnedItemV1[]>()
  const completionReceipts = new WeakMap<GenerationTextCommandResultV2, OpenAIResponsesCompletionReceiptV1>()
  function persistInterrupted(context: Parameters<GenerationInterruptedReplayV2Repo['insert']>[0], command: GenerationTextCommandResultV2) {
    const native = interruptedSnapshots.get(command)
    if (!native) return
    const bytes = command.preparedRequest.body.copyBytes()
    try {
      new GenerationInterruptedReplayV2Repo(input.db).insert(context, {
        answerRootId: command.preparedRequest.answerRootId, operationId: command.preparedRequest.operationId,
        requestSequence: command.preparedRequest.requestSequence, protocol: 'openai_responses',
        requestBody: JSON.parse(new TextDecoder().decode(bytes)), native,
      })
    } finally { bytes.fill(0) }
  }

  function finalize(
    command: GenerationTextCommandResultV2,
    state: 'completed' | 'failed' | 'cancelled',
    terminal: OpenAIResponsesTerminalResultV1 | null,
    terminalErrorCode: string | null,
    terminalErrorMessage: string | null,
    phase: 'pre_stream' | 'mid_stream',
    terminalErrorFact: ProviderFailureV2 | null = null,
  ): OpenAIResponsesStreamRunResultV2 {
    const at = nowMs()
    let resultState: OpenAIResponsesStreamRunResultV2['state'] = state
    const images = state === 'completed' && terminal ? completedImages(terminal) : []
    const committedImages: Array<Readonly<{ outputIndex: number; assetId: string; assetRevisionId: string; mime: string }>> = []
    for (const image of images) {
      if (!input.attachmentBlobStore) throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
      input.attachmentBlobStore.persist(image.bytes)
    }
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      const history = state === 'completed'
        ? historyRepo.loadPersistedRequestHistory(
            context, command.preparedRequest.operationId, command.preparedRequest.requestSequence,
          )
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
        const replayOutput = replayOutputs.get(command)
        if (!terminal || !history || !replayOutput || !isOpenAIResponsesTerminalResultV1(terminal) || terminal.terminalKind !== 'completed') {
          throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_RESPONSE_INVALID')
        }
        const continuation = history.projectedPrefixItems === null
          ? completeOpenAIResponsesRequestV2({
            priorArtifact: history.priorArtifact, lineageDepth: history.lineageDepth,
            clientItems: history.clientItems, returnedItems: replayOutput,
          })
          : completeOpenAIResponsesProjectedRequestV2({
            projectedPrefixItems: history.projectedPrefixItems,
            clientItems: history.clientItems, returnedItems: replayOutput,
          })
        for (const image of images) {
          const blob = assetRepo.recordBlobFromBytesInAuthorityTransaction(context, image.bytes, image.mime)
          const assetId = `asset:${randomUUID()}`
          const assetRevisionId = `asset-revision:${randomUUID()}`
          const revision = assetRepo.createGeneratedImageAssetInAuthorityTransaction(context, {
            assetId, assetRevisionId, filename: image.filename, blob,
          })
          outputRepo.insertCompletedOutput(context, execution, terminalRequest, {
            outputIndex: image.outputIndex, partialImageIndex: image.outputIndex, revision,
            providerCreatedAtMs: terminal.completedAt === null ? null : terminal.completedAt * 1000,
            providerUsage: terminal.usage ?? {},
          })
          committedImages.push({ outputIndex: image.outputIndex, assetId, assetRevisionId, mime: image.mime })
        }
        if (hasUnresolvedFunctionCall(terminal)) {
          resultState = 'awaiting_tool'
          artifactRepo.insertRequestTerminal(context, execution, terminalRequest, continuation, at)
          artifactRepo.insertRequestTerminal(
            context, execution, terminalRequest, createOpenAIResponsesTerminalArtifactV1(terminal), at,
          )
        } else {
          graphRepo.terminalizeAssistantMessage(
            context, command.preparedRequest.answerRootId, 'completed', terminal.visibleText, at,
          )
          const terminalExecution = executionRepo.terminalizeOperation(context, execution, {
            state: 'completed', errorCode: null, errorMessage: null,
          }, at)
          artifactRepo.insertOperationTerminal(context, terminalExecution, terminalRequest, continuation, at)
          artifactRepo.insertOperationTerminal(
            context, terminalExecution, terminalRequest, createOpenAIResponsesTerminalArtifactV1(terminal), at,
          )
        }
        if (resultState === 'awaiting_tool') persistInterrupted(context, command)
      } else {
        if (terminal && terminal.visibleText.length > 0) {
          const currentBody = input.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
            .get(command.preparedRequest.answerRootId) as { body: unknown } | undefined
          if (typeof currentBody?.body !== 'string') {
            throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
          }
          if (currentBody.body !== terminal.visibleText) {
            graphRepo.compareAndSetStreamingAssistantBody(context, command.preparedRequest.answerRootId,
              currentBody.body, terminal.visibleText, at)
          }
        }
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, at)
        executionRepo.terminalizeOperation(context, execution, {
          state, errorCode: terminalErrorCode, errorMessage: terminalErrorMessage, errorFact: terminalErrorFact,
        }, at)
        persistInterrupted(context, command)
      }
    })
    interruptedSnapshots.delete(command)
    replayOutputs.delete(command)
    completionReceipts.delete(command)
    const terminalProjection = Object.freeze({
      operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId,
      state: resultState, errorCode: terminalErrorCode, errorMessage: terminalErrorMessage,
      ...(terminalErrorFact ? { errorFact: terminalErrorFact } : {}),
    })
    for (const image of committedImages) publishGenerationStreamProjectionV2(input.streamProjectionSink, {
      type: 'image_output', operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, ...image,
    })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, {
      type: 'terminal', operationId: terminalProjection.operationId, answerRootId: terminalProjection.answerRootId,
      state: terminalProjection.state, errorCode: terminalProjection.errorCode, errorMessage: terminalProjection.errorMessage,
    })
    return terminalProjection
  }

  function providerFailureForTerminal(command: GenerationTextCommandResultV2,
    terminal: OpenAIResponsesTerminalResultV1): ProviderFailureV2 {
    const providerCode = terminal.terminalKind === 'failed' ? 'provider_failed' : 'provider_incomplete'
    const providerMessage = terminal.error?.message ?? terminal.incompleteReason ?? providerCode
    return createProviderFailureV2({
      context: {
        origin: 'provider_runtime', phase: 'response_body',
        provider: { namespace: 'generation_execution', id: command.preparedRequest.providerId },
        contractId: command.preparedRequest.contractId,
        operationId: command.preparedRequest.operationId,
        requestSequence: command.preparedRequest.requestSequence,
        starverseDiagnosticCode: 'PROVIDER_RESPONSE_HTTP_ERROR',
      },
      body: { error: { code: terminal.error?.code ?? providerCode, message: providerMessage } },
    })
  }

  function materializeProviderTerminal(command: GenerationTextCommandResultV2,
    terminal: OpenAIResponsesTerminalResultV1): OpenAIResponsesStreamRunResultV2 {
    if (terminal.terminalKind === 'completed') {
      return finalize(command, 'completed', terminal, null, null, 'mid_stream')
    }
    const failure = providerFailureForTerminal(command, terminal)
    return finalize(command, 'failed', terminal, failure.starverseDiagnosticCode,
      providerFailurePrimaryMessageV2(failure), 'mid_stream', failure)
  }

  async function receive(
    command: GenerationTextCommandResultV2,
    response: Response,
    signal: AbortSignal,
    onStarted: () => void,
  ): Promise<OpenAIResponsesTerminalResultV1> {
    if (response.status !== 200 || !response.body ||
        response.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase() !== 'text/event-stream') {
      let bodyText: string | null = null
      try {
        bodyText = response.body
          ? (await readBoundedResponseTextV2(response, PROVIDER_ERROR_RESPONSE_BODY_MAX_BYTES_V2)).text
          : null
      } catch { /* preserve the HTTP status if reading the diagnostic body fails */ }
      throw new ProviderFailureErrorV2(createProviderFailureV2({
        context: {
          origin: response.status === 200 ? 'response_decoder' : 'http_response',
          phase: response.status === 200 ? 'response_headers' : 'response_body',
          provider: { namespace: 'generation_execution', id: command.preparedRequest.providerId },
          contractId: command.preparedRequest.contractId,
          operationId: command.preparedRequest.operationId,
          requestSequence: command.preparedRequest.requestSequence,
          starverseDiagnosticCode: response.status === 200
            ? 'PROVIDER_RESPONSE_DECODE_FAILED' : 'PROVIDER_RESPONSE_HTTP_ERROR',
        },
        httpStatus: response.status,
        httpStatusText: response.statusText,
        bodyText,
        headers: Object.fromEntries(response.headers.entries()),
      }))
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
    const checkpoint = createGenerationTextBodyCheckpointV2({
      db: input.db, graphRepo, command, initialBody: visible,
      streamProjectionSink: input.streamProjectionSink, nowMs,
      onFailure: (error) => { void reader.cancel(error).catch(() => undefined) },
    })
    let finalSnapshot: InterruptedNativeSnapshotV1 | null = null
    const accept = (events: readonly ReturnType<OpenAIResponsesTypedSseDecoderV1['push']>[number][]): void => {
      const reasoningBefore = assembler.readReasoningSummaryText()
      for (const event of events) assembler.push(event)
      const reasoningAfter = assembler.readReasoningSummaryText()
      if (reasoningAfter.length > reasoningBefore.length) {
        publishGenerationStreamProjectionV2(input.streamProjectionSink, {
          type: 'reasoning_detail', operationId: command.preparedRequest.operationId,
          answerRootId: command.preparedRequest.answerRootId,
          detail: Object.freeze({ provider: 'openai_responses', type: 'summary_text',
            text: reasoningAfter.slice(reasoningBefore.length) }),
        })
      }
      const next = assembler.readVisibleText()
      if (next !== visible) {
        visible = next
        checkpoint.update(next)
      }
    }
    const decode = (bytes?: Uint8Array): readonly ReturnType<OpenAIResponsesTypedSseDecoderV1['push']>[number][] => {
      try { return bytes === undefined ? decoder.finish() : decoder.push(bytes) } catch (error) {
        accept(decoder.takeParsedEventsAfterError())
        throw error
      }
    }
    try {
      while (true) {
        const item = await abortable(reader.read(), signal)
        if (item.done) break
        if (item.value.byteLength > 0) onStarted()
        accept(decode(item.value))
      }
      accept(decode())
      const terminal = assembler.finish()
      const replayOutput = assembler.readReplayOutput()
      finalSnapshot = assembler.interruptedSnapshot()
      const completionReceipt = createOpenAIResponsesCompletionReceiptV1({
        terminalResult: terminal, replayOutput, interruptedSnapshot: finalSnapshot,
      })
      replayOutputs.set(command, replayOutput)
      interruptedSnapshots.set(command, Object.freeze({ ...completionReceipt.interruptedSnapshot,
        terminalFact: completionReceipt.terminalResult }))
      completionReceipts.set(command, completionReceipt)
      persistGenerationNativeCompletionReceiptV2(input.db, command, completionReceipt, nowMs())
      if (terminal.visibleText !== visible) {
        visible = terminal.visibleText
        checkpoint.update(visible)
      }
      return terminal
    } finally {
      if (!interruptedSnapshots.has(command)) interruptedSnapshots.set(command, finalSnapshot ?? assembler.interruptedSnapshot())
      try { checkpoint.flush() } finally {
        checkpoint.dispose()
        try { await reader.cancel() } catch { /* best effort */ }
        reader.releaseLock()
      }
    }
  }

  registerGenerationNativeCompletionMaterializerV2(input.db, 'openai-responses-v1', (_receipt, command, value) => {
    const completionReceipt = restoreOpenAIResponsesCompletionReceiptV1(value)
    const terminal = completionReceipt.terminalResult
    replayOutputs.set(command, completionReceipt.replayOutput)
    interruptedSnapshots.set(command, Object.freeze({ ...completionReceipt.interruptedSnapshot,
      terminalFact: terminal }))
    return materializeProviderTerminal(command, terminal)
  }, (command, value) => {
    const completionReceipt = restoreOpenAIResponsesCompletionReceiptV1(value)
    const terminal = completionReceipt.terminalResult
    if (!isOpenAIResponsesTerminalResultV1(terminal)) {
      throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_RESPONSE_INVALID')
    }
    createOpenAIResponsesTerminalArtifactV1(terminal)
    if (terminal.terminalKind === 'completed' && hasUnresolvedFunctionCall(terminal) &&
        command.execution.snapshot.semanticIntent.tools.mode !== 'enabled') {
      throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_RESPONSE_INVALID')
    }
  })

  return Object.freeze({
    run: async (command: GenerationTextCommandResultV2, signal?: AbortSignal):
      Promise<OpenAIResponsesStreamRunResultV2> => {
      const credentialPlan = command.preparedRequest?.headersPlan.credential
      if (!isGenerationTextCommandResultV2(command) || !isPreparedProviderRequestV2(command.preparedRequest) ||
          command.preparedRequest.providerId !== 'openai_responses' || command.preparedRequest.requestSequence < 1 ||
          credentialPlan?.kind !== 'bearer_authorization' ||
          command.preparedRequest.answerRootId !== command.execution.operation.targetAnswerId.value ||
          command.request.preparedBodySha256 !== command.preparedRequest.bodySha256) {
        throw new OpenAIResponsesStreamRunnerV2Error('GENERATION_V2_OPENAI_RUNNER_AUTHORITY_INVALID')
      }
      begin(command)
      const scope = createGenerationAbortScope(signal, timeoutMs)
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
                [credentialPlan.headerName]: `${credentialPlan.scheme} ${lease.credential}`,
              },
              body: Buffer.from(command.preparedRequest.body.copyBytes()),
              redirect: 'error', signal: scope.signal,
            }), scope.signal)
            return receive(command, response, scope.signal, () => { responseStarted = true })
          },
        })
        for (const outputItem of terminal.output) {
          const item = outputItem as unknown as Readonly<Record<string, unknown>>
          if (item.type !== 'reasoning' || typeof item.encrypted_content !== 'string' ||
              item.encrypted_content.length === 0) continue
          publishGenerationStreamProjectionV2(input.streamProjectionSink, {
            type: 'reasoning_detail',
            operationId: command.preparedRequest.operationId,
            answerRootId: command.preparedRequest.answerRootId,
            detail: Object.freeze({
              provider: 'openai_responses',
              type: 'reasoning.encrypted',
              ...(typeof item.id === 'string' ? { id: item.id } : {}),
              ...(typeof item.status === 'string' ? { status: item.status } : {}),
            }),
          })
        }
        return materializeNewGenerationNativeCompletionV2({
          db: input.db, command, nativeResult: completionReceipts.get(command) ?? terminal, nowMs,
          materialize: () => materializeProviderTerminal(command, terminal),
        })
      } catch (error) {
        if (isGenerationNativeCompletionMaterializationPendingV2Error(error)) throw error
        if (hasPendingGenerationNativeCompletionForOperationV2(input.db, command.preparedRequest.operationId)) {
          throw preserveGenerationNativeCompletionPendingFailureV2(input.db, command, error)
        }
        const cancelled = signal?.aborted === true && !scope.timedOut()
        const failureContext = {
          origin: error instanceof OpenAIResponsesStreamV1Error ? 'response_decoder'
            : responseStarted ? 'response_stream' : 'network_transport',
          phase: error instanceof OpenAIResponsesStreamV1Error ? 'stream_decode'
            : responseStarted ? 'stream_read' : 'request_open',
          provider: { namespace: 'generation_execution', id: command.preparedRequest.providerId },
          contractId: command.preparedRequest.contractId,
          operationId: command.preparedRequest.operationId,
          requestSequence: command.preparedRequest.requestSequence,
          starverseDiagnosticCode: error instanceof OpenAIResponsesStreamV1Error
            ? 'PROVIDER_RESPONSE_DECODE_FAILED'
            : responseStarted ? 'PROVIDER_RESPONSE_STREAM_FAILED' : 'PROVIDER_REQUEST_OPEN_FAILED',
        } as const
        const failure = cancelled ? null : error instanceof OpenAIResponsesStreamV1Error && error.diagnostic
          ? createProviderFailureV2({ context: failureContext,
            body: { error: { code: error.code, message: error.message },
              streamDiagnostic: { stage: error.diagnostic.stage, eventType: error.diagnostic.eventType } },
            rawFrameExcerpt: error.diagnostic.rawFrameExcerpt })
          : providerFailureFromUnknownV2(error, failureContext)
        const code = cancelled ? 'user_cancelled' : failure!.starverseDiagnosticCode
        const message = cancelled ? 'Generation cancelled by user.' : providerFailurePrimaryMessageV2(failure!)
        return finalize(command, cancelled ? 'cancelled' : 'failed', null, code, message,
          responseStarted ? 'mid_stream' : 'pre_stream', failure)
      } finally {
        scope.dispose()
      }
    },
  })
}
