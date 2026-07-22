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
import { isPreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { GeminiInteractionsImageResultAssemblerV1, GeminiInteractionsImageSseDecoderV1,
  type GeminiInteractionsImageResultV1 } from '../../src/next/generation-v2/providers/gemini/interactionsStreamV1'
import { createGeminiInteractionsImageTerminalArtifactV1 } from '../../src/next/generation-v2/providers/gemini/interactionsTerminalArtifactV1'
import { isGeminiInteractionsImageModelIdV1 } from '../../src/next/generation-v2/providers/gemini/interactionsImageCapabilityPolicyV1'
import { publishGenerationStreamProjectionV2, type GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import type { GeminiInteractionsImageCommandResultV2 } from './geminiInteractionsImageInitialSendCoordinatorV2'

const DEFAULT_TIMEOUT_MS = 5 * 60_000
type Fetch = (url: string, init: RequestInit) => Promise<Response>

export class GeminiInteractionsImageStreamRunnerV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_AUTHORITY_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_ALREADY_STARTED' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_CREDENTIAL_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_HTTP_FAILED' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_RESPONSE_INVALID' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_TRANSPORT_FAILED' |
    'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_TIMEOUT') { super(code); this.name = 'GeminiInteractionsImageStreamRunnerV2Error' }
}

function abortScope(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController(); let timedOut = false
  const onAbort = () => controller.abort('user_cancelled')
  if (external?.aborted) controller.abort('user_cancelled')
  else external?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort('timeout') }, timeoutMs)
  ;(timer as NodeJS.Timeout).unref?.()
  return Object.freeze({ signal: controller.signal, timedOut: () => timedOut,
    dispose: () => { clearTimeout(timer); external?.removeEventListener('abort', onAbort) } })
}
async function readResult(response: Response, expectedModel: string): Promise<GeminiInteractionsImageResultV1> {
  if (!response.ok || !response.body) {
    try { await response.body?.cancel() } catch { /* best effort */ }
    throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_HTTP_FAILED')
  }
  if (response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'text/event-stream') {
    try { await response.body.cancel() } catch { /* best effort */ }
    throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_RESPONSE_INVALID')
  }
  const decoder = new GeminiInteractionsImageSseDecoderV1()
  const assembler = new GeminiInteractionsImageResultAssemblerV1(expectedModel)
  const reader = response.body.getReader()
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      for (const event of decoder.push(item.value)) assembler.push(event)
    }
    for (const event of decoder.finish()) assembler.push(event)
    return assembler.finish()
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
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30 * 60_000 || typeof fetchImpl !== 'function') {
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
    errorCode: string | null, errorMessage: string | null): void {
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
          createGeminiInteractionsImageTerminalArtifactV1(result), nowMs())
        for (const detail of result.reasoningDetails) {
          reasoningRepo.appendInAuthorityTransaction(context, command.preparedRequest.answerRootId,
            reasoningProjectionDetail(detail))
        }
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, 'completed', result.text, nowMs())
        executionRepo.terminalizeOperation(context, execution, { state: 'completed', errorCode: null, errorMessage: null }, nowMs())
        image = Object.freeze({ assetId, assetRevisionId, mime: result.mime })
      } else {
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, nowMs())
        executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage }, nowMs())
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
    if (committedImage) publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'image_output',
      operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId,
      outputIndex: 0, ...committedImage })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, { type: 'terminal',
      operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId,
      state, errorCode, errorMessage })
  }

  return Object.freeze({ run: async (command: GeminiInteractionsImageCommandResultV2, signal?: AbortSignal) => {
    if (command.kind !== 'created' || !command.preparedRequest || !isPreparedProviderRequestV2(command.preparedRequest) ||
        command.preparedRequest.providerId !== 'google_ai_studio' || command.preparedRequest.contractId !== 'gemini-interactions-v1beta' ||
        !isGeminiInteractionsImageModelIdV1(command.preparedRequest.modelId) ||
        command.preparedRequest.headersPlan.credential.kind !== 'google_x_goog_api_key') {
      throw new GeminiInteractionsImageStreamRunnerV2Error('GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_AUTHORITY_INVALID')
    }
    const created = command as Required<Pick<GeminiInteractionsImageCommandResultV2, 'preparedRequest' | 'execution' | 'request'>>
    begin(created)
    const scope = abortScope(signal, timeoutMs)
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
          return readResult(response, created.preparedRequest.modelId)
        } })
      terminal(created, 'completed', result, null, null)
    } catch (error) {
      const cancelled = signal?.aborted === true && !scope.timedOut()
      const code = cancelled ? 'user_cancelled' : scope.timedOut()
        ? 'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_TIMEOUT'
        : error instanceof GeminiInteractionsImageStreamRunnerV2Error ? error.code
          : error instanceof Error ? error.message : 'GENERATION_V2_GEMINI_INTERACTIONS_RUNNER_TRANSPORT_FAILED'
      terminal(created, cancelled ? 'cancelled' : 'failed', null, code,
        cancelled ? 'Generation cancelled by user.' : code)
    } finally { scope.dispose() }
  } })
}
