import { randomUUID } from 'node:crypto'
import { session } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { AnswerReasoningProjectionV2Repo } from '../../infra/db/repo/answerReasoningProjectionV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GeminiInteractionsImageTerminalArtifactV2Repo } from '../../infra/db/repo/geminiInteractionsImageTerminalArtifactV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationImageOutputV2Repo } from '../../infra/db/repo/generationImageOutputV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { PROVIDER_ERROR_RESPONSE_BODY_MAX_BYTES_V2, readBoundedResponseTextV2 } from '../net/boundedResponseBodyV2'
// Approved main-process Gemini Interactions Generation V2 execution boundary.
import { isPreparedProviderRequestV2 } from '../../src/core/generation-v2/compiler/preparedProviderRequestV2'
import { GeminiInteractionsImageResultAssemblerV1, GeminiInteractionsImageSseDecoderV1,
  GeminiInteractionsImageStreamV1Error, type GeminiInteractionsImageResultV1 } from '../../src/core/generation-v2/providers/gemini/interactionsStreamV1'
import { createGeminiInteractionsImageTerminalArtifactV2 } from '../../src/core/generation-v2/providers/gemini/interactionsTerminalArtifactV2'
import { createProviderFailureV2, providerFailureFromUnknownV2, providerFailurePrimaryMessageV2,
  type ProviderFailureV2 } from '../../src/shared/provider/providerFailureV2'
import { publishGenerationStreamProjectionV2, type GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import type { GeminiInteractionsImageCommandResultV2 } from './geminiInteractionsImageInitialSendCoordinatorV2'
import { abortableGenerationReadV2, createGenerationAbortScope, isValidGenerationTotalTimeoutMsV2 } from './generationTimeoutPolicyV2'
import {
  hasPendingGenerationNativeCompletionForOperationV2,
  isGenerationNativeCompletionMaterializationPendingV2Error,
  materializeNewGenerationNativeCompletionV2,
  preserveGenerationNativeCompletionPendingFailureV2,
  registerGenerationNativeCompletionMaterializerV2,
} from './generationNativeCompletionV2'

type Fetch = (url: string, init: RequestInit) => Promise<Response>
const geminiStreamFailureResponseMetadata = new WeakMap<GeminiInteractionsImageStreamV1Error,
  Readonly<{ httpStatus: number; httpStatusText: string; headers: Readonly<Record<string, string>> }>>()

export class GeminiInteractionsImageStreamRunnerV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_AUTHORITY_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_ALREADY_STARTED' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_CREDENTIAL_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_HTTP_FAILED' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_RESPONSE_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_TRANSPORT_FAILED' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_TIMEOUT',
    readonly details: Readonly<{
      httpStatus?: number
      httpStatusText?: string
      bodyText?: string | null
      headers?: Readonly<Record<string, string>>
    }> = {}) { super(code); this.name = 'GeminiInteractionsImageStreamRunnerV2Error' }
}

async function responseBodyText(response: Response): Promise<string | null> {
  try {
    return (await readBoundedResponseTextV2(response, PROVIDER_ERROR_RESPONSE_BODY_MAX_BYTES_V2)).text
  } catch { return null }
}

function responseHeaders(response: Response): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(response.headers.entries()))
}

async function readResult(response: Response, expectedModel: string, onStreamBytes: () => void,
  signal: AbortSignal): Promise<GeminiInteractionsImageResultV1> {
  if (!response.ok) {
    const bodyText = await responseBodyText(response)
    throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_HTTP_FAILED', {
      httpStatus: response.status, httpStatusText: response.statusText, bodyText, headers: responseHeaders(response),
    })
  }
  if (!response.body) {
    throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_RESPONSE_INVALID', {
      httpStatus: response.status, httpStatusText: response.statusText, headers: responseHeaders(response),
    })
  }
  if (response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'text/event-stream') {
    const bodyText = await responseBodyText(response)
    throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_RESPONSE_INVALID', {
      httpStatus: response.status, httpStatusText: response.statusText, bodyText, headers: responseHeaders(response),
    })
  }
  const decoder = new GeminiInteractionsImageSseDecoderV1()
  const assembler = new GeminiInteractionsImageResultAssemblerV1(expectedModel)
  const reader = response.body.getReader()
  try {
    while (true) {
      const item = await abortableGenerationReadV2(reader.read(), signal)
      if (item.done) break
      if (item.value.byteLength > 0) onStreamBytes()
      let decodedEvents: ReturnType<typeof decoder.push> = []
      let decoderFailed = false
      let decoderError: unknown
      try { decodedEvents = decoder.push(item.value) } catch (error) { decoderFailed = true; decoderError = error }
      if (decoderFailed) {
        for (const event of decoder.takeParsedEventsAfterError()) assembler.push(event)
        throw decoderError
      }
      for (const event of decodedEvents) assembler.push(event)
    }
    let finalEvents: ReturnType<typeof decoder.finish> = []
    let finishFailed = false
    let finishError: unknown
    try { finalEvents = decoder.finish() } catch (error) { finishFailed = true; finishError = error }
    if (finishFailed) {
      for (const event of decoder.takeParsedEventsAfterError()) assembler.push(event)
      throw finishError
    }
    for (const event of finalEvents) assembler.push(event)
    return assembler.finish()
  } catch (error) {
    if (error instanceof GeminiInteractionsImageStreamV1Error) {
      geminiStreamFailureResponseMetadata.set(error, Object.freeze({
        httpStatus: response.status,
        httpStatusText: response.statusText,
        headers: responseHeaders(response),
      }))
    }
    throw error
  } finally {
    try { await reader.cancel() } catch { /* best effort */ }
    reader.releaseLock()
  }
}
function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/gif') return 'gif'
  return 'img'
}

function reasoningProjectionDetail(detail: GeminiInteractionsImageResultV1['reasoningDetails'][number]): Readonly<Record<string, unknown>> {
  if (detail.type === 'thought_signature') {
    return Object.freeze({ type: 'thought_signature', thought_signature: detail.signature })
  }
  return detail.type === 'thought_summary'
    ? Object.freeze({ type: 'thought_summary', summary: detail.text,
        ...(detail.thoughtSignature === undefined ? {} : { thought_signature: detail.thoughtSignature }) })
    : Object.freeze({ type: 'thought_image', image: {
        url: `data:${detail.mimeType};base64,${detail.data}`, mimeType: detail.mimeType,
      }, ...(detail.thoughtSignature === undefined ? {} : { thought_signature: detail.thoughtSignature }) })
}

export function createGeminiInteractionsImageStreamRunnerV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  attachmentBlobStore: Epoch2AttachmentBlobStoreV2
  fetchImpl?: Fetch
  nowMs?: () => number
  timeoutMs?: number
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  rawGenerationRequestStore?: RawGenerationRequestStore
}>) {
  const nowMs = input.nowMs ?? Date.now
  const timeoutMs = input.timeoutMs
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  if (!isValidGenerationTotalTimeoutMsV2(timeoutMs) || typeof fetchImpl !== 'function') {
    throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_AUTHORITY_INVALID')
  }
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const assetRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const outputRepo = new GenerationImageOutputV2Repo(input.db, nowMs)
  const artifactRepo = new GeminiInteractionsImageTerminalArtifactV2Repo(input.db)
  const reasoningRepo = new AnswerReasoningProjectionV2Repo(input.db, nowMs)

  function begin(command: Required<Pick<GeminiInteractionsImageCommandResultV2, 'preparedRequest' | 'execution' | 'request'>>): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      if (executionRepo.openAttempt(context, { operationId: command.preparedRequest.operationId,
        requestSequence: 1, attempt: 1 }, nowMs()).kind !== 'created') {
        throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_ALREADY_STARTED')
      }
      requestRepo.markStreaming(context, request, nowMs())
      if (execution.operation.state === 'committed') executionRepo.markOperationStreaming(context, execution, nowMs())
    })
  }
  function terminal(command: Required<Pick<GeminiInteractionsImageCommandResultV2, 'preparedRequest' | 'execution' | 'request'>>,
    state: 'completed' | 'failed' | 'cancelled', result: GeminiInteractionsImageResultV1 | null,
    errorCode: string | null, errorMessage: string | null, errorFact: ProviderFailureV2 | null = null): void {
    let image: Readonly<{ assetId: string; assetRevisionId: string; mime: string }> | null = null
    if (state === 'completed') {
      if (!result) throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_RESPONSE_INVALID')
      input.attachmentBlobStore.persist(result.bytes)
    }
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      executionRepo.terminalizeAttempt(context, { key: { operationId: command.preparedRequest.operationId,
        requestSequence: 1, attempt: 1 }, outcome: state === 'completed'
          ? { kind: 'provider_completed', phase: 'mid_stream' }
          : state === 'cancelled' ? { kind: 'user_cancelled', phase: 'mid_stream' }
            : { kind: 'provider_failed', phase: 'mid_stream', failure: { code: errorCode!, message: errorMessage! } } }, nowMs())
      const terminalRequest = requestRepo.terminalize(context, request, state, nowMs())
      if (state === 'completed' && result) {
        const blob = assetRepo.recordBlobFromBytesInAuthorityTransaction(context, result.bytes, result.mime)
        const assetId = `asset:${randomUUID()}`; const assetRevisionId = `asset-revision:${randomUUID()}`
        const revision = assetRepo.createGeneratedImageAssetInAuthorityTransaction(context, {
          assetId, assetRevisionId, filename: `generated.${extensionForMime(result.mime)}`, blob,
        })
          outputRepo.insertCompletedOutput(context, execution, terminalRequest, { outputIndex: 0, partialImageIndex: 0,
          revision, providerCreatedAtMs: null, providerUsage: result.usage })
        artifactRepo.insertRequestTerminal(context, execution, terminalRequest,
          createGeminiInteractionsImageTerminalArtifactV2(result), nowMs())
        for (const call of result.searchEvidence.calls) {
          reasoningRepo.appendInAuthorityTransaction(context, command.preparedRequest.answerRootId, Object.freeze({
            provider: 'google_ai_studio', type: 'google_search_call', id: call.id,
            arguments: call.arguments, signature: call.signature,
          }))
        }
        for (const searchResult of result.searchEvidence.results) {
          reasoningRepo.appendInAuthorityTransaction(context, command.preparedRequest.answerRootId, Object.freeze({
            provider: 'google_ai_studio', type: 'google_search_result', call_id: searchResult.callId,
            result: searchResult.result, is_error: searchResult.isError,
            search_suggestions: searchResult.searchSuggestions, signature: searchResult.signature,
          }))
        }
        for (const annotation of result.searchEvidence.annotations) {
          reasoningRepo.appendInAuthorityTransaction(context, command.preparedRequest.answerRootId, Object.freeze({
            provider: 'google_ai_studio', type: 'url_citation', url_citation: annotation,
          }))
        }
        for (const detail of result.reasoningDetails) {
          reasoningRepo.appendInAuthorityTransaction(context, command.preparedRequest.answerRootId,
            reasoningProjectionDetail(detail))
        }
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, 'completed', result.text, nowMs())
        executionRepo.terminalizeOperation(context, execution, { state: 'completed', errorCode: null, errorMessage: null }, nowMs())
        image = Object.freeze({ assetId, assetRevisionId, mime: result.mime })
      } else {
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, nowMs())
        executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage, errorFact }, nowMs())
      }
    })
    const committedImage = image as Readonly<{ assetId: string; assetRevisionId: string; mime: string }> | null
    if (state === 'completed' && result?.text) publishGenerationStreamProjectionV2(input.streamProjectionSink, {
      type: 'assistant_body', operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, content: result.text,
    })
    if (state === 'completed' && result) for (const detail of result.reasoningDetails) {
      publishGenerationStreamProjectionV2(input.streamProjectionSink, {
        type: 'reasoning_detail', operationId: command.preparedRequest.operationId,
        answerRootId: command.preparedRequest.answerRootId,
        detail: reasoningProjectionDetail(detail), persisted: true,
      })
    }
    if (state === 'completed' && result) {
      for (const call of result.searchEvidence.calls) {
        publishGenerationStreamProjectionV2(input.streamProjectionSink, {
          type: 'reasoning_detail', operationId: command.preparedRequest.operationId,
          answerRootId: command.preparedRequest.answerRootId,
          detail: { provider: 'google_ai_studio', type: 'google_search_call', id: call.id,
            arguments: call.arguments, signature: call.signature }, persisted: true,
        })
      }
      for (const searchResult of result.searchEvidence.results) {
        publishGenerationStreamProjectionV2(input.streamProjectionSink, {
          type: 'reasoning_detail', operationId: command.preparedRequest.operationId,
          answerRootId: command.preparedRequest.answerRootId,
          detail: { provider: 'google_ai_studio', type: 'google_search_result', call_id: searchResult.callId,
            result: searchResult.result, is_error: searchResult.isError,
            search_suggestions: searchResult.searchSuggestions, signature: searchResult.signature }, persisted: true,
        })
      }
      for (const annotation of result.searchEvidence.annotations) {
        publishGenerationStreamProjectionV2(input.streamProjectionSink, {
          type: 'reasoning_detail', operationId: command.preparedRequest.operationId,
          answerRootId: command.preparedRequest.answerRootId,
          detail: { provider: 'google_ai_studio', type: 'url_citation', url_citation: annotation }, persisted: true,
        })
      }
    }
    if (committedImage) publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'image_output',
      operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId,
      outputIndex: 0, ...committedImage })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'terminal',
      operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId,
      state, errorCode, errorMessage, ...(errorFact ? { errorFact } : {}) })
  }

  registerGenerationNativeCompletionMaterializerV2(input.db, 'gemini-interactions-v1beta', (_receipt, command, value) => {
    const result = value as GeminiInteractionsImageResultV1
    createGeminiInteractionsImageTerminalArtifactV2(result)
    return terminal(command, 'completed', result, null, null)
  }, (_command, value) => {
    createGeminiInteractionsImageTerminalArtifactV2(value as GeminiInteractionsImageResultV1)
  })

  return Object.freeze({ run: async (command: GeminiInteractionsImageCommandResultV2, signal?: AbortSignal) => {
    if (command.kind !== 'created' || !command.preparedRequest || !isPreparedProviderRequestV2(command.preparedRequest) ||
        command.preparedRequest.providerId !== 'google_ai_studio' || command.preparedRequest.contractId !== 'gemini-interactions-v1beta' ||
        command.preparedRequest.headersPlan.credential.kind !== 'google_x_goog_api_key') {
      throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_AUTHORITY_INVALID')
    }
    const created = command as Required<Pick<GeminiInteractionsImageCommandResultV2, 'preparedRequest' | 'execution' | 'request'>>
    begin(created)
    const scope = createGenerationAbortScope(signal, timeoutMs)
    let responseStarted = false
    let providerResultCompleted = false
    try {
      const status = await input.credentialService.getStatus('google_ai_studio')
      if (!status.configured || status.credentialScopeId !== created.preparedRequest.credentialScopeId) {
        throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_CREDENTIAL_INVALID')
      }
      const result = await input.credentialService.withCredential({ providerKey: 'google_ai_studio',
        expectedRevision: status.revision, expectedCredentialScopeId: status.credentialScopeId,
        consume: async (lease) => {
          lease.assertCurrent()
          try {
            input.rawGenerationRequestStore?.tryPersistPreparedV2({ operationId: created.preparedRequest.operationId,
              answerRootId: created.preparedRequest.answerRootId, requestSequence: created.preparedRequest.requestSequence,
              providerId: created.preparedRequest.providerId, modelId: created.preparedRequest.modelId,
              conversationId: created.execution.operation.conversationId.value,
              branchId: created.execution.operation.branchId.value, questionId: created.execution.operation.questionId.value,
              actionKind: created.execution.operation.actionKind }, created.preparedRequest.body)
          } catch { /* Raw Request Debug is explicitly non-fatal. */ }
          const response = await fetchImpl(created.preparedRequest.endpoint, { method: 'POST', redirect: 'error',
            signal: scope.signal, headers: { 'content-type': 'application/json', accept: created.preparedRequest.headersPlan.accept,
              'x-goog-api-key': lease.credential }, body: Buffer.from(created.preparedRequest.body.copyBytes()) })
          return readResult(response, created.preparedRequest.modelId, () => { responseStarted = true }, scope.signal)
        } })
      providerResultCompleted = true
      materializeNewGenerationNativeCompletionV2({
        db: input.db, command: created, nativeResult: result, nowMs,
        materialize: () => terminal(created, 'completed', result, null, null),
      })
    } catch (error) {
      if (isGenerationNativeCompletionMaterializationPendingV2Error(error)) throw error
      if (hasPendingGenerationNativeCompletionForOperationV2(input.db, created.preparedRequest.operationId)) {
        throw preserveGenerationNativeCompletionPendingFailureV2(input.db, created, error)
      }
      const cancelled = signal?.aborted === true && !scope.timedOut()
      const failure = cancelled ? null : error instanceof GeminiInteractionsImageStreamV1Error
        ? (() => {
          const responseMetadata = geminiStreamFailureResponseMetadata.get(error)
          const nativePayload = error.providerError ?? error.rawEvent ?? {
            code: error.code, message: error.message, eventType: error.eventType, stepType: error.stepType,
          }
          const body = error.diagnosticStage === null
            ? nativePayload
            : Object.assign({ streamDiagnostic: null }, nativePayload, { streamDiagnostic: {
              stage: error.diagnosticStage,
              fieldPath: error.fieldPath,
              reason: error.diagnosticReason,
              context: error.diagnosticContext,
            } })
          return createProviderFailureV2({
          context: { origin: error.code === 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_PROVIDER_FAILED'
              ? 'response_stream' : 'response_decoder',
            phase: error.code === 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_PROVIDER_FAILED'
              ? 'stream_read' : 'stream_decode', provider: { namespace: 'generation_execution', id: created.preparedRequest.providerId },
            contractId: created.preparedRequest.contractId, operationId: created.preparedRequest.operationId,
            requestSequence: created.preparedRequest.requestSequence,
            starverseDiagnosticCode: error.code === 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_PROVIDER_FAILED'
              ? error.code : 'PROVIDER_RESPONSE_DECODE_FAILED' },
          httpStatus: responseMetadata?.httpStatus,
          httpStatusText: responseMetadata?.httpStatusText,
          headers: responseMetadata?.headers,
          body,
          // Keep valid JSON intact until the failure factory has redacted it
          // and applied its byte limit (truncating first can hide JSON keys).
          rawFrameExcerpt: error.rawEvent ? JSON.stringify(error.rawEvent) : error.rawFrameExcerpt,
          })
        })()
        : providerResultCompleted
        ? createProviderFailureV2({
          context: { origin: 'starverse_internal', phase: 'terminal_persistence', provider: { namespace: 'generation_execution', id: created.preparedRequest.providerId },
            contractId: created.preparedRequest.contractId, operationId: created.preparedRequest.operationId,
            requestSequence: created.preparedRequest.requestSequence, starverseDiagnosticCode: 'PROVIDER_TERMINAL_PERSIST_FAILED' },
          transportError: error,
        })
        : error instanceof GeminiInteractionsImageStreamRunnerV2Error
        ? createProviderFailureV2({
          context: { origin: error.code === 'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_HTTP_FAILED' ? 'http_response' : 'response_decoder',
            phase: error.code === 'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_HTTP_FAILED' ? 'response_headers' : 'response_headers',
            provider: { namespace: 'generation_execution', id: created.preparedRequest.providerId }, contractId: created.preparedRequest.contractId,
            operationId: created.preparedRequest.operationId, requestSequence: created.preparedRequest.requestSequence,
            starverseDiagnosticCode: error.code === 'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_HTTP_FAILED'
              ? 'PROVIDER_RESPONSE_HTTP_ERROR' : 'PROVIDER_RESPONSE_DECODE_FAILED' },
          httpStatus: error.details.httpStatus, httpStatusText: error.details.httpStatusText,
          bodyText: error.details.bodyText, headers: error.details.headers,
        })
        : providerFailureFromUnknownV2(error, {
          origin: responseStarted ? 'response_stream' : 'network_transport',
          phase: responseStarted ? 'stream_read' : 'request_open', provider: { namespace: 'generation_execution', id: created.preparedRequest.providerId },
          contractId: created.preparedRequest.contractId, operationId: created.preparedRequest.operationId,
          requestSequence: created.preparedRequest.requestSequence,
          starverseDiagnosticCode: responseStarted ? 'PROVIDER_RESPONSE_STREAM_FAILED' : 'PROVIDER_REQUEST_OPEN_FAILED',
        })
      const code = cancelled ? 'user_cancelled' : scope.timedOut()
        ? 'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_TIMEOUT'
        : failure?.starverseDiagnosticCode ?? (error instanceof Error ? error.message : 'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_TRANSPORT_FAILED')
      const failureMessage = cancelled ? 'Generation cancelled by user.' : failure ? providerFailurePrimaryMessageV2(failure) : code
      const terminalFailureMessage = failureMessage.length <= 8192 ? failureMessage : code
      terminal(created, cancelled ? 'cancelled' : 'failed', null, code,
        terminalFailureMessage, failure)
    } finally { scope.dispose() }
  } })
}
