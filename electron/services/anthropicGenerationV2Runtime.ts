import type BetterSqlite3 from 'better-sqlite3'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { createAnthropicMessagesStreamRunnerV2 } from './anthropicMessagesStreamRunnerV2'
import { createAnthropicPlainTextInitialSendCoordinatorV2 } from './anthropicPlainTextInitialSendCoordinatorV2'
import { createAnthropicPlainTextRetryCoordinatorV2 } from './anthropicPlainTextRetryCoordinatorV2'
import { createAnthropicPlainTextRegenerateCoordinatorV2 } from './anthropicPlainTextRegenerateCoordinatorV2'
import { createAnthropicPlainTextEditResendCoordinatorV2 } from './anthropicPlainTextEditResendCoordinatorV2'
import { createAnthropicToolContinuationCoordinatorV2 } from './anthropicToolContinuationCoordinatorV2'
import type { GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import type { GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'

export class AnthropicGenerationV2RuntimeError extends Error {
  constructor(readonly code: 'GENERATION_V2_ANTHROPIC_RUNTIME_CREDENTIAL_INVALID') {
    super(code)
    this.name = 'AnthropicGenerationV2RuntimeError'
  }
}

type CurrentCredentialExpectation = Readonly<{
  revision: number
  credentialScopeId: CredentialScopeIdV2
}>

export type AnthropicGenerationV2Runtime = Readonly<{
  submitInitial: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  submitRetry: (command: unknown) => Promise<GenerationTextCommandResultV2>
  submitRegenerate: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  submitEditResend: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  submitToolContinuation: (command: unknown) => Promise<GenerationTextCommandResultV2>
  abort: (operationId: string) => boolean
}>

/** Dormant main-process Anthropic V2 composition. No IPC or legacy command authority. */
export function createAnthropicGenerationV2Runtime(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  nowMs?: () => number
}>): AnthropicGenerationV2Runtime {
  const initial = createAnthropicPlainTextInitialSendCoordinatorV2({
    db: input.db,
    credentialService: input.credentialService,
    fetchImpl: input.fetchImpl,
    nowMs: input.nowMs,
  })
  const runner = createAnthropicMessagesStreamRunnerV2({
    db: input.db,
    credentialService: input.credentialService,
    fetchImpl: input.fetchImpl,
    rawGenerationRequestStore: input.rawGenerationRequestStore,
    streamProjectionSink: input.streamProjectionSink,
    nowMs: input.nowMs,
  })
  const retry = createAnthropicPlainTextRetryCoordinatorV2({
    db: input.db,
    credentialService: input.credentialService,
    nowMs: input.nowMs,
  })
  const regenerate = createAnthropicPlainTextRegenerateCoordinatorV2({
    db: input.db,
    credentialService: input.credentialService,
    fetchImpl: input.fetchImpl,
    nowMs: input.nowMs,
  })
  const editResend = createAnthropicPlainTextEditResendCoordinatorV2({
    db: input.db,
    credentialService: input.credentialService,
    fetchImpl: input.fetchImpl,
    nowMs: input.nowMs,
  })
  const continuation = createAnthropicToolContinuationCoordinatorV2({
    db: input.db, credentialService: input.credentialService, nowMs: input.nowMs,
  })
  const activeControllers = new Map<string, AbortController>()

  async function currentCredentialExpectation(): Promise<CurrentCredentialExpectation> {
    const status = await input.credentialService.getStatus('anthropic')
    if (!status.configured || !status.credentialScopeId) {
      throw new AnthropicGenerationV2RuntimeError('GENERATION_V2_ANTHROPIC_RUNTIME_CREDENTIAL_INVALID')
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

  return Object.freeze({
    submitInitial: async (command: unknown, signal?: AbortSignal) => {
      const credential = await currentCredentialExpectation()
      const committed = await initial.submit({
        command,
        expectedCredentialRevision: credential.revision,
        expectedCredentialScopeId: credential.credentialScopeId,
        signal,
      })
      startCreated(committed)
      return committed
    },
    submitRetry: async (command: unknown) => {
      const committed = await retry.submit(command)
      startCreated(committed)
      return committed
    },
    submitRegenerate: async (command: unknown, signal?: AbortSignal) => {
      const credential = await currentCredentialExpectation()
      const committed = await regenerate.submit({
        command,
        expectedCredentialRevision: credential.revision,
        expectedCredentialScopeId: credential.credentialScopeId,
        signal,
      })
      startCreated(committed)
      return committed
    },
    submitEditResend: async (command: unknown, signal?: AbortSignal) => {
      const credential = await currentCredentialExpectation()
      const committed = await editResend.submit({
        command,
        expectedCredentialRevision: credential.revision,
        expectedCredentialScopeId: credential.credentialScopeId,
        signal,
      })
      startCreated(committed)
      return committed
    },
    submitToolContinuation: async (command: unknown) => {
      const committed = await continuation.submit(command)
      startCreated(committed)
      return committed
    },
    abort: (operationId: string): boolean => {
      const controller = activeControllers.get(operationId)
      if (!controller || controller.signal.aborted) return false
      controller.abort('user_cancelled')
      return true
    },
  })
}
