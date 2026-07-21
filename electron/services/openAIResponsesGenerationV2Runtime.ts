import type BetterSqlite3 from 'better-sqlite3'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { createOpenAIResponsesPlainTextEditResendCoordinatorV2 } from './openAIResponsesPlainTextEditResendCoordinatorV2'
import { createOpenAIResponsesPlainTextInitialSendCoordinatorV2 } from './openAIResponsesPlainTextInitialSendCoordinatorV2'
import { createOpenAIResponsesPlainTextRegenerateCoordinatorV2 } from './openAIResponsesPlainTextRegenerateCoordinatorV2'
import { createOpenAIResponsesPlainTextRetryCoordinatorV2 } from './openAIResponsesPlainTextRetryCoordinatorV2'
import { createOpenAIResponsesStreamRunnerV2 } from './openAIResponsesStreamRunnerV2'
import { createOpenAIResponsesToolContinuationCoordinatorV2 } from './openAIResponsesToolContinuationCoordinatorV2'
import type { GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import type { GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'

export class OpenAIResponsesGenerationV2RuntimeError extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_RUNTIME_CREDENTIAL_INVALID') {
    super(code)
    this.name = 'OpenAIResponsesGenerationV2RuntimeError'
  }
}

type CurrentCredentialExpectation = Readonly<{
  revision: number
  credentialScopeId: CredentialScopeIdV2
}>

export type OpenAIResponsesGenerationV2Runtime = Readonly<{
  submitInitial: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  retry: (command: unknown) => Promise<GenerationTextCommandResultV2>
  regenerate: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  editResend: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  continueTool: (command: unknown) => Promise<GenerationTextCommandResultV2>
  abort: (operationId: string) => boolean
}>

/**
 * The sole OpenAI Responses V2 command/stream composition point. It accepts
 * only strict V2 commands and returns graph projections, never legacy
 * renderer message arrays or renderer-owned provider parameters.
 */
export function createOpenAIResponsesGenerationV2Runtime(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
  rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  nowMs?: () => number
}>): OpenAIResponsesGenerationV2Runtime {
  const common = {
    db: input.db,
    credentialService: input.credentialService,
    fetchImpl: input.fetchImpl,
    attachmentBlobStore: input.attachmentBlobStore,
    nowMs: input.nowMs,
  }
  const initial = createOpenAIResponsesPlainTextInitialSendCoordinatorV2(common)
  const retry = createOpenAIResponsesPlainTextRetryCoordinatorV2({
    db: input.db, credentialService: input.credentialService, nowMs: input.nowMs,
  })
  const regenerate = createOpenAIResponsesPlainTextRegenerateCoordinatorV2(common)
  const editResend = createOpenAIResponsesPlainTextEditResendCoordinatorV2(common)
  const toolContinuation = createOpenAIResponsesToolContinuationCoordinatorV2({
    db: input.db, credentialService: input.credentialService, nowMs: input.nowMs,
  })
  const runner = createOpenAIResponsesStreamRunnerV2({
    db: input.db,
    credentialService: input.credentialService,
    fetchImpl: input.fetchImpl,
    rawGenerationRequestStore: input.rawGenerationRequestStore,
    streamProjectionSink: input.streamProjectionSink,
    nowMs: input.nowMs,
  })
  const activeControllers = new Map<string, AbortController>()

  async function currentCredentialExpectation(): Promise<CurrentCredentialExpectation> {
    const status = await input.credentialService.getStatus('openai_responses')
    if (!status.configured || !status.credentialScopeId) {
      throw new OpenAIResponsesGenerationV2RuntimeError('GENERATION_V2_OPENAI_RUNTIME_CREDENTIAL_INVALID')
    }
    return Object.freeze({ revision: status.revision, credentialScopeId: status.credentialScopeId })
  }

  function startCreated(result: GenerationTextCommandResultV2): void {
    if (result.kind !== 'created' || activeControllers.has(result.preparedRequest.operationId)) return
    const controller = new AbortController()
    activeControllers.set(result.preparedRequest.operationId, controller)
    void runner.run(result, controller.signal)
      .catch(() => undefined)
      .finally(() => activeControllers.delete(result.preparedRequest.operationId))
  }

  async function commitAndStart(result: Promise<GenerationTextCommandResultV2>): Promise<GenerationTextCommandResultV2> {
    const committed = await result
    startCreated(committed)
    return committed
  }

  return Object.freeze({
    submitInitial: async (command: unknown, signal?: AbortSignal) => {
      const credential = await currentCredentialExpectation()
      return commitAndStart(initial.submit({
        command,
        expectedCredentialRevision: credential.revision,
        expectedCredentialScopeId: credential.credentialScopeId,
        signal,
      }))
    },
    retry: (command: unknown) => commitAndStart(retry.submit(command)),
    regenerate: async (command: unknown, signal?: AbortSignal) => {
      const credential = await currentCredentialExpectation()
      return commitAndStart(regenerate.submit({
        command,
        expectedCredentialRevision: credential.revision,
        expectedCredentialScopeId: credential.credentialScopeId,
        signal,
      }))
    },
    editResend: async (command: unknown, signal?: AbortSignal) => {
      const credential = await currentCredentialExpectation()
      return commitAndStart(editResend.submit({
        command,
        expectedCredentialRevision: credential.revision,
        expectedCredentialScopeId: credential.credentialScopeId,
        signal,
      }))
    },
    continueTool: (command: unknown) => commitAndStart(toolContinuation.submit(command)),
    abort: (operationId: string): boolean => {
      const controller = activeControllers.get(operationId)
      if (!controller || controller.signal.aborted) return false
      controller.abort('user_cancelled')
      return true
    },
  })
}
