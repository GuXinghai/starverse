import { session } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { GeminiGenerateContentNativeHistoryV2Repo } from '../../infra/db/repo/geminiGenerateContentNativeHistoryV2Repo'
import { GenerationExecutionV2Repo, GenerationExecutionV2RepoError } from '../../infra/db/repo/generationExecutionV2Repo'
import { GenerationRequestV2Repo } from '../../infra/db/repo/generationRequestV2Repo'
import { ToolRegistryV2Repo } from '../../infra/db/repo/toolRegistryV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { isEpoch2RuntimeCredentialLease, type Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { isPreparedProviderRequestV2 } from '../../src/next/generation-v2/compiler/preparedProviderRequestV2'
import {
  GeminiGenerateContentChatStreamV1,
  GeminiGenerateContentStreamV1Error,
  type GeminiGenerateContentStreamResultV1,
} from '../../src/next/generation-v2/providers/gemini/generateContentStreamV1'
import { isGenerationTextCommandResultV2, type GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { publishGenerationStreamProjectionV2, type GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import { createGenerationTextBodyCheckpointV2 } from './generationBodyCheckpointV2'
import { loadGenerationSnapshotToolRegistryAuthorityV2 } from './generationToolRegistryAuthorityV2'
import {
  createProviderFailureV2,
  providerFailureFromUnknownV2,
  providerFailurePrimaryMessageV2,
  type ProviderFailureV2,
} from '../../src/shared/provider/providerFailureV2'

const DEFAULT_TIMEOUT_MS = 5 * 60_000
export type GeminiGenerateContentStreamRunResultV2 = Readonly<{
  operationId: string
  answerRootId: string
  state: 'awaiting_tool' | 'completed' | 'failed' | 'cancelled'
  errorCode: string | null
  errorMessage: string | null
}>

export class GeminiGenerateContentStreamRunnerV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_RUNNER_AUTHORITY_INVALID'
    | 'GENERATION_V2_GEMINI_RUNNER_ALREADY_STARTED'
    | 'GENERATION_V2_GEMINI_RUNNER_CREDENTIAL_INVALID'
    | 'GENERATION_V2_GEMINI_RUNNER_TRANSPORT_FAILED'
    | 'GENERATION_V2_GEMINI_RUNNER_HTTP_FAILED'
    | 'GENERATION_V2_GEMINI_RUNNER_RESPONSE_INVALID'
    | 'GENERATION_V2_GEMINI_RUNNER_TIMEOUT') {
    super(code)
    this.name = 'GeminiGenerateContentStreamRunnerV2Error'
  }
}

type Fetch = (url: string, init: RequestInit) => Promise<Response>
function abortScope(external: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController()
  let timedOut = false
  const abort = () => controller.abort('user_cancelled')
  if (external?.aborted) abort(); else external?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(() => { timedOut = true; controller.abort('timeout') }, timeoutMs)
  ;(timer as NodeJS.Timeout).unref?.()
  return Object.freeze({ signal: controller.signal, timedOut: () => timedOut, dispose: () => {
    clearTimeout(timer); external?.removeEventListener('abort', abort)
  } })
}
async function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw signal.reason
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason)
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function createGeminiGenerateContentStreamRunnerV2(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  fetchImpl?: Fetch
  nowMs?: () => number
  timeoutMs?: number
}>) {
  const nowMs = input.nowMs ?? Date.now
  const fetchImpl = input.fetchImpl ?? session.defaultSession.fetch.bind(session.defaultSession)
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const executionRepo = new GenerationExecutionV2Repo(input.db, nowMs)
  const requestRepo = new GenerationRequestV2Repo(input.db, nowMs)
  const graphRepo = new ConversationGraphV2Repo(input.db)
  const historyRepo = new GeminiGenerateContentNativeHistoryV2Repo(input.db)
  const toolRegistryRepo = new ToolRegistryV2Repo(input.db, nowMs)

  function begin(command: GenerationTextCommandResultV2): void {
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_AUTHORITY_INVALID')
      const request = requestRepo.replayPrepared(context, execution, command.preparedRequest)
      const attempt = executionRepo.openAttempt(context, {
        operationId: request.operationId, requestSequence: request.requestSequence, attempt: 1,
      }, nowMs())
      if (attempt.kind !== 'created') throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_ALREADY_STARTED')
      requestRepo.markStreaming(context, request, nowMs())
      if (execution.operation.state === 'committed') executionRepo.markOperationStreaming(context, execution, nowMs())
      else if (execution.operation.state !== 'streaming') {
        throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_AUTHORITY_INVALID')
      }
    })
  }

  function finalize(command: GenerationTextCommandResultV2, state: 'completed' | 'failed' | 'cancelled',
    stream: GeminiGenerateContentStreamResultV1 | null, errorCode: string | null, errorMessage: string | null,
    phase: 'pre_stream' | 'mid_stream', errorFact: ProviderFailureV2 | null = null): GeminiGenerateContentStreamRunResultV2 {
    const at = nowMs()
    let resultState: GeminiGenerateContentStreamRunResultV2['state'] = state
    runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
      const execution = executionRepo.findOperationInTransaction(context, command.preparedRequest.operationId)
      if (!execution) throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_AUTHORITY_INVALID')
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
        if (!stream) throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_RESPONSE_INVALID')
        const functionCalls = stream.assistantContent.parts.filter((part) => 'functionCall' in part)
        if (functionCalls.length > 0) {
          if (execution.snapshot.semanticIntent.tools.mode !== 'enabled') {
            throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_RESPONSE_INVALID')
          }
          const registry = loadGenerationSnapshotToolRegistryAuthorityV2(context, toolRegistryRepo, execution)
          const names = new Set(registry?.selectedDefinitions.map((tool) => tool.function.name) ?? [])
          if (functionCalls.some((part) => !names.has(part.functionCall.name))) {
            throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_RESPONSE_INVALID')
          }
          resultState = 'awaiting_tool'
          historyRepo.persistTerminalArtifact(context, execution, terminalRequest, stream.assistantContent, at)
          historyRepo.persistResponseArtifact(context, execution, terminalRequest, stream, at)
        } else {
          const body = input.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
            .get(command.preparedRequest.answerRootId) as { body?: unknown } | undefined
          if (!body || typeof body.body !== 'string') throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_RESPONSE_INVALID')
          graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, 'completed', body.body, at)
          const terminalExecution = executionRepo.terminalizeOperation(context, execution, {
            state: 'completed', errorCode: null, errorMessage: null,
          }, at)
          historyRepo.persistTerminalArtifact(context, terminalExecution, terminalRequest, stream.assistantContent, at)
          historyRepo.persistResponseArtifact(context, terminalExecution, terminalRequest, stream, at)
        }
      } else {
        graphRepo.terminalizeAssistantMessage(context, command.preparedRequest.answerRootId, state, null, at)
        executionRepo.terminalizeOperation(context, execution, { state, errorCode, errorMessage, errorFact }, at)
      }
    })
    const result = Object.freeze({ operationId: command.preparedRequest.operationId,
      answerRootId: command.preparedRequest.answerRootId, state: resultState, errorCode, errorMessage })
    publishGenerationStreamProjectionV2(input.streamProjectionSink, {
      type: 'terminal', ...result, ...(errorFact ? { errorFact } : {}),
    })
    return result
  }

  async function receive(command: GenerationTextCommandResultV2, response: Response, signal: AbortSignal,
    started: () => void): Promise<GeminiGenerateContentStreamResultV1> {
    if (response.status !== 200 || !response.body ||
        response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() !== 'text/event-stream') {
      try { await response.body?.cancel() } catch { /* release only */ }
      throw new GeminiGenerateContentStreamRunnerV2Error(response.status === 200
        ? 'GENERATION_V2_GEMINI_RUNNER_RESPONSE_INVALID' : 'GENERATION_V2_GEMINI_RUNNER_HTTP_FAILED')
    }
    const stream = new GeminiGenerateContentChatStreamV1()
    const reader = response.body.getReader()
    const initial = input.db.prepare('SELECT body_text AS body FROM message_body_v2 WHERE message_id=?')
      .get(command.preparedRequest.answerRootId) as { body?: unknown } | undefined
    if (!initial || typeof initial.body !== 'string') throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_AUTHORITY_INVALID')
    let visible = initial.body
    const checkpoint = createGenerationTextBodyCheckpointV2({
      db: input.db, graphRepo, command, initialBody: visible,
      streamProjectionSink: input.streamProjectionSink, nowMs,
      onFailure: (error) => { void reader.cancel(error).catch(() => undefined) },
    })
    try {
      while (true) {
        const item = await abortable(reader.read(), signal)
        if (item.done) break
        if (item.value.byteLength > 0) started()
        for (const delta of stream.push(item.value)) {
          if (delta.type === 'text') {
            visible += delta.text
            checkpoint.update(visible)
          } else if (delta.type === 'thought') {
            publishGenerationStreamProjectionV2(input.streamProjectionSink, {
              type: 'reasoning_detail', operationId: command.preparedRequest.operationId,
              answerRootId: command.preparedRequest.answerRootId,
              detail: Object.freeze({ type: 'thought', text: delta.text,
                ...(delta.thoughtSignature ? { thoughtSignature: delta.thoughtSignature } : {}) }),
            })
          }
        }
      }
      return stream.finish()
    } finally {
      try { checkpoint.flush() } finally {
        checkpoint.dispose()
        try { await reader.cancel() } catch { /* release only */ }
        reader.releaseLock()
      }
    }
  }

  return Object.freeze({
    run: async (command: GenerationTextCommandResultV2, signal?: AbortSignal): Promise<GeminiGenerateContentStreamRunResultV2> => {
      const credentialPlan = command.preparedRequest?.headersPlan.credential
      if (!isGenerationTextCommandResultV2(command) || !isPreparedProviderRequestV2(command.preparedRequest) ||
          command.preparedRequest.providerId !== 'google_ai_studio' || credentialPlan?.kind !== 'google_x_goog_api_key' ||
          command.request.preparedBodySha256 !== command.preparedRequest.bodySha256) {
        throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_AUTHORITY_INVALID')
      }
      begin(command)
      const scope = abortScope(signal, timeoutMs)
      let started = false
      try {
        const status = await input.credentialService.getStatus('google_ai_studio')
        if (!status.configured || !status.credentialScopeId ||
            status.credentialScopeId !== command.preparedRequest.credentialScopeId) {
          throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_CREDENTIAL_INVALID')
        }
        const response = await input.credentialService.withCredential({
          providerKey: 'google_ai_studio', expectedRevision: status.revision,
          expectedCredentialScopeId: status.credentialScopeId,
          consume: async (lease) => {
            if (!isEpoch2RuntimeCredentialLease(lease)) throw new GeminiGenerateContentStreamRunnerV2Error('GENERATION_V2_GEMINI_RUNNER_CREDENTIAL_INVALID')
            try { input.rawGenerationRequestStore?.tryPersistPreparedV2({
              operationId: command.preparedRequest.operationId, answerRootId: command.preparedRequest.answerRootId,
              requestSequence: command.preparedRequest.requestSequence,
              providerId: command.preparedRequest.providerId, modelId: command.preparedRequest.modelId,
              conversationId: command.execution.operation.conversationId.value, branchId: command.execution.operation.branchId.value,
              questionId: command.execution.operation.questionId.value, actionKind: command.execution.operation.actionKind,
            }, command.preparedRequest.body) } catch { /* Raw Data is non-fatal. */ }
            const bytes = command.preparedRequest.body.copyBytes()
            try {
              return await abortable(fetchImpl(command.preparedRequest.endpoint, {
                method: 'POST', headers: {
                  'content-type': command.preparedRequest.headersPlan.contentType,
                  accept: command.preparedRequest.headersPlan.accept,
                  [credentialPlan.headerName]: lease.credential,
                },
                body: Buffer.from(bytes), redirect: 'error', signal: scope.signal,
              }), scope.signal)
            } finally { bytes.fill(0) }
          },
        })
        const streamResult = await receive(command, response, scope.signal, () => { started = true })
        return finalize(command, 'completed', streamResult, null, null, 'mid_stream')
      } catch (error) {
        const cancelled = signal?.aborted === true && !scope.timedOut()
        if (error instanceof GeminiGenerateContentStreamV1Error &&
            error.diagnostic?.reason === 'native_content_invalid') {
          console.error('[generation-v2][gemini] native content decode failed', {
            operationId: command.preparedRequest.operationId,
            requestSequence: command.preparedRequest.requestSequence,
            modelId: command.preparedRequest.modelId,
            diagnostic: error.diagnostic,
          })
        }
        const failure = cancelled ? null : error instanceof GeminiGenerateContentStreamV1Error
          ? createProviderFailureV2({
            context: {
              origin: 'response_decoder', phase: 'stream_decode',
              providerId: command.preparedRequest.providerId,
              contractId: command.preparedRequest.contractId,
              operationId: command.preparedRequest.operationId,
              requestSequence: command.preparedRequest.requestSequence,
              starverseDiagnosticCode: 'PROVIDER_RESPONSE_DECODE_FAILED',
            },
            body: {
              error: {
                code: error.code,
                message: error.diagnostic
                  ? `Gemini stream validation failed: ${error.diagnostic.reason}`
                  : error.code,
              },
              geminiStreamDiagnostic: error.diagnostic,
            },
            rawFrameExcerpt: error.diagnostic?.rawChunk ? JSON.stringify(error.diagnostic.rawChunk) : null,
          })
          : providerFailureFromUnknownV2(error, {
            origin: error instanceof GeminiGenerateContentStreamV1Error ? 'response_decoder'
              : started ? 'response_stream' : 'network_transport',
            phase: error instanceof GeminiGenerateContentStreamV1Error ? 'stream_decode'
              : started ? 'stream_read' : 'request_open',
            providerId: command.preparedRequest.providerId,
            contractId: command.preparedRequest.contractId,
            operationId: command.preparedRequest.operationId,
            requestSequence: command.preparedRequest.requestSequence,
            starverseDiagnosticCode: error instanceof GeminiGenerateContentStreamV1Error
              ? 'PROVIDER_RESPONSE_DECODE_FAILED'
              : started ? 'PROVIDER_RESPONSE_STREAM_FAILED' : 'PROVIDER_REQUEST_OPEN_FAILED',
          })
        const code = cancelled ? 'user_cancelled' : failure?.starverseDiagnosticCode
          ?? (scope.timedOut() ? 'GENERATION_V2_GEMINI_RUNNER_TIMEOUT'
            : error instanceof GeminiGenerateContentStreamRunnerV2Error ? error.code : 'GENERATION_V2_GEMINI_RUNNER_TRANSPORT_FAILED')
        const message = cancelled ? 'Generation cancelled by user.'
          : failure ? providerFailurePrimaryMessageV2(failure) : code
        return finalize(command, cancelled ? 'cancelled' : 'failed', null, code, message,
          started ? 'mid_stream' : 'pre_stream', failure)
      } finally { scope.dispose() }
    },
  })
}
