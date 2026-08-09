import { randomUUID } from 'node:crypto'
import { session } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { AttachmentAssetV2Repo } from '../../infra/db/repo/attachmentAssetV2Repo'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GenerationExecutionV2Repo } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationImageOutputV2Repo } from '../../infra/db/repo/generationImageOutputV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { decodeOpenRouterImageBufferedResponseV1, OpenRouterImageSingleResultAssemblerV1, OpenRouterImageSseDecoderV1, type OpenRouterImageSingleResultV1 } from '../../src/next/generation-v2/providers/openrouter-images/imageStreamV1'
import { isPreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import { publishGenerationStreamProjectionV2, type GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import type { OpenRouterImageInitialSendResultV2 } from './openRouterImageInitialSendCoordinatorV2'
import type { OpenRouterImageActionResultV2 } from './openRouterImageActionCoordinatorV2'

const DEFAULT_TIMEOUT_MS = 5 * 60_000

type Fetch = (url: string, init: RequestInit) => Promise<Response>
type OpenRouterImageGenerationCommandResultV2 = OpenRouterImageInitialSendResultV2 | OpenRouterImageActionResultV2

export class OpenRouterImageInitialStreamRunnerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_IMAGE_RUNNER_AUTHORITY_INVALID'
    | 'GENERATION_V2_OPENROUTER_IMAGE_RUNNER_ALREADY_STARTED'
    | 'GENERATION_V2_OPENROUTER_IMAGE_RUNNER_CREDENTIAL_INVALID'
    | 'GENERATION_V2_OPENROUTER_IMAGE_RUNNER_HTTP_FAILED'
    | 'GENERATION_V2_OPENROUTER_IMAGE_RUNNER_RESPONSE_INVALID'
    | 'GENERATION_V2_OPENROUTER_IMAGE_RUNNER_TRANSPORT_FAILED'
    | 'GENERATION_V2_OPENROUTER_IMAGE_RUNNER_TIMEOUT') {
    super(code)
    this.name = 'OpenRouterImageInitialStreamRunnerV2Error'
  }
}

function abortScope(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const onAbort = () => controller.abort('user_cancelled')
  if (external?.aborted) controller.abort('user_cancelled')
  else external?.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort('timeout') }, timeoutMs)
  ;(timer as NodeJS.Timeout).unref?.()
  return Object.freeze({ signal: controller.signal, timedOut: () => timedOut, dispose: () => {
    clearTimeout(timer); external?.removeEventListener('abort', onAbort)
  } })
}

async function readResult(response: Response): Promise<OpenRouterImageSingleResultV1> {
  if (!response.ok || !response.body) {
    try { await response.body?.cancel() } catch { /* best effort */ }
    throw new OpenRouterImageInitialStreamRunnerV2Error('GENERATION_V2_OPENROUTER_IMAGE_RUNNER_HTTP_FAILED')
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType === 'text/event-stream') {
    const decoder = new OpenRouterImageSseDecoderV1()
    const assembler = new OpenRouterImageSingleResultAssemblerV1()
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
  if (contentType !== 'application/json') {
    try { await response.body.cancel() } catch { /* best effort */ }
    throw new OpenRouterImageInitialStreamRunnerV2Error('GENERATION_V2_OPENROUTER_IMAGE_RUNNER_RESPONSE_INVALID')
  }
  let payload: unknown
  try { payload = JSON.parse(await response.text()) } catch {
    throw new OpenRouterImageInitialStreamRunnerV2Error('GENERATION_V2_OPENROUTER_IMAGE_RUNNER_RESPONSE_INVALID')
  }
  return decodeOpenRouterImageBufferedResponseV1(payload)
}

function extensionForMime(mime: string): string {
  if (mime === 'image/png') return 'png'
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/svg+xml') return 'svg'
  return 'img'
}

export function createOpenRouterImageInitialStreamRunnerV2(input: Readonly<{
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
    throw new OpenRouterImageInitialStreamRunnerV2Error('GENERATION_V2_OPENROUTER_IMAGE_RUNNER_AUTHORITY_INVALID')
  }
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const assetRepo = new AttachmentAssetV2Repo(input.db, nowMs)
  const outputRepo = new GenerationImageOutputV2Repo(input.db, nowMs)

  function begin(command: Required<Pick<OpenRouterImageGenerationCommandResultV2, 'preparedRequest' | 'execution' | 'request'>>): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new OpenRouterImageInitialStreamRunnerV2Error('GENERATION_V2_OPENROUTER_IMAGE_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      if (executionRepo.openAttempt(context, { operationId: command.preparedRequest.operationId, requestSequence: 1, attempt: 1 }, nowMs()).kind !== 'created') {
        throw new OpenRouterImageInitialStreamRunnerV2Error('GENERATION_V2_OPENROUTER_IMAGE_RUNNER_ALREADY_STARTED')
      }
      requestRepo.markStreaming(context, request, nowMs())
      if (execution.operation.state === 'committed') executionRepo.markOperationStreaming(context, execution, nowMs())
    })
  }

  function terminal(command: Required<Pick<OpenRouterImageGenerationCommandResultV2, 'preparedRequest' | 'execution' | 'request'>>,
    state: 'completed' | 'failed' | 'cancelled', result: OpenRouterImageSingleResultV1 | null, errorCode: string | null, errorMessage: string | null) {
    let image: Readonly<{ assetId: string; assetRevisionId: string; mime: string }> | null = null
    if (state === 'completed') {
      if (!result) throw new OpenRouterImageInitialStreamRunnerV2Error('GENERATION_V2_OPENROUTER_IMAGE_RUNNER_RESPONSE_INVALID')
      input.attachmentBlobStore.persist(result.bytes)
    }
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new OpenRouterImageInitialStreamRunnerV2Error('GENERATION_V2_OPENROUTER_IMAGE_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      executionRepo.terminalizeAttempt(context, {
        key: { operationId: command.preparedRequest.operationId, requestSequence: 1, attempt: 1 },
        outcome: state === 'completed' ? { kind: 'provider_completed', phase: 'mid_stream' } :
          state === 'cancelled' ? { kind: 'user_cancelled', phase: 'mid_stream' } :
            { kind: 'provider_failed', phase: 'mid_stream', failure: { code: errorCode!, message: errorMessage! } },
      }, nowMs())
      const terminalRequest = requestRepo.terminalize(context, request, state, nowMs())
      if (state === 'completed' && result) {
        const blob = assetRepo.recordBlobFromBytesInAuthorityTransaction(context, result.bytes, result.mime)
        const assetId = `asset:${randomUUID()}`
        const assetRevisionId = `asset-revision:${randomUUID()}`
        const revision = assetRepo.createGeneratedImageAssetInAuthorityTransaction(context, {
          assetId, assetRevisionId, filename: `generated.${extensionForMime(result.mime)}`, blob,
        })
        outputRepo.insertCompletedOutput(context, execution, terminalRequest, {
          outputIndex: 0, partialImageIndex: 0, revision,
          providerCreatedAtMs: result.createdAtMs, providerUsage: result.usage,
        })
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, 'completed', '', nowMs())
        executionRepo.terminalizeOperation(context, execution, { state: 'completed', errorCode: null, errorMessage: null }, nowMs())
        image = Object.freeze({ assetId, assetRevisionId, mime: result.mime })
      } else {
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, nowMs())
        executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage }, nowMs())
      }
    })
    const committedImage = image as Readonly<{ assetId: string; assetRevisionId: string; mime: string }> | null
    if (committedImage) publishGenerationStreamProjectionV2(input.streamProjectionSink, {
      type: 'image_output', operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, outputIndex: 0, ...committedImage,
    })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, {
      type: 'terminal', operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId,
      state, errorCode, errorMessage,
    })
  }

  return Object.freeze({
    run: async (command: OpenRouterImageGenerationCommandResultV2, signal?: AbortSignal) => {
      if (command.kind !== 'created' || !command.preparedRequest || !isPreparedProviderRequestV2(command.preparedRequest) ||
          command.preparedRequest.providerId !== 'openrouter' || command.preparedRequest.contractId !== 'openrouter-images-v1' ||
          command.preparedRequest.headersPlan.credential.kind !== 'bearer_authorization') {
        throw new OpenRouterImageInitialStreamRunnerV2Error('GENERATION_V2_OPENROUTER_IMAGE_RUNNER_AUTHORITY_INVALID')
      }
      const created = command as Required<Pick<OpenRouterImageGenerationCommandResultV2, 'preparedRequest' | 'execution' | 'request'>>
      begin(created)
      const scope = abortScope(signal, timeoutMs)
      try {
        const status = await input.credentialService.getStatus('openrouter')
        if (!status.configured || status.credentialScopeId !== created.preparedRequest.credentialScopeId) {
          throw new OpenRouterImageInitialStreamRunnerV2Error('GENERATION_V2_OPENROUTER_IMAGE_RUNNER_CREDENTIAL_INVALID')
        }
        const result = await input.credentialService.withCredential({
          providerKey: 'openrouter', expectedRevision: status.revision, expectedCredentialScopeId: status.credentialScopeId,
          consume: async (lease) => {
            lease.assertCurrent()
            try {
              input.rawGenerationRequestStore?.tryPersistPreparedV2({
                operationId: created.preparedRequest.operationId,
                answerRootId: created.preparedRequest.answerRootId,
                requestSequence: created.preparedRequest.requestSequence,
                providerId: created.preparedRequest.providerId,
                modelId: created.preparedRequest.modelId,
                conversationId: created.execution.operation.conversationId.value,
                branchId: created.execution.operation.branchId.value,
                questionId: created.execution.operation.questionId.value,
                actionKind: created.execution.operation.actionKind,
              }, created.preparedRequest.body)
            } catch { /* Raw Request Debug is explicitly non-fatal. */ }
            const response = await fetchImpl(created.preparedRequest.endpoint, {
              method: 'POST', redirect: 'error', signal: scope.signal,
              headers: { 'content-type': 'application/json', accept: created.preparedRequest.headersPlan.accept,
                authorization: `Bearer ${lease.credential}` },
              body: Buffer.from(created.preparedRequest.body.copyBytes()),
            })
            return readResult(response)
          },
        })
        terminal(created, 'completed', result, null, null)
      } catch (error) {
        const cancelled = signal?.aborted === true && !scope.timedOut()
        const code = cancelled ? 'user_cancelled' : scope.timedOut()
          ? 'GENERATION_V2_OPENROUTER_IMAGE_RUNNER_TIMEOUT'
          : error instanceof OpenRouterImageInitialStreamRunnerV2Error ? error.code
            : 'GENERATION_V2_OPENROUTER_IMAGE_RUNNER_TRANSPORT_FAILED'
        terminal(created, cancelled ? 'cancelled' : 'failed', null, code, cancelled ? 'Generation cancelled by user.' : code)
      } finally { scope.dispose() }
    },
  })
}
