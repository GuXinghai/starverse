import type BetterSqlite3 from 'better-sqlite3'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import { createDeepSeekInitialStreamRunnerV2 } from './deepSeekInitialStreamRunnerV2'
import { createDeepSeekPlainTextEditResendCoordinatorV2 } from './deepSeekPlainTextEditResendCoordinatorV2'
import { createDeepSeekPlainTextInitialSendCoordinatorV2 } from './deepSeekPlainTextInitialSendCoordinatorV2'
import { createDeepSeekPlainTextRegenerateCoordinatorV2 } from './deepSeekPlainTextRegenerateCoordinatorV2'
import { createDeepSeekPlainTextRetryCoordinatorV2 } from './deepSeekPlainTextRetryCoordinatorV2'
import { createDeepSeekToolContinuationCoordinatorV2 } from './deepSeekToolContinuationCoordinatorV2'
import type { GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import type { GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'

export class DeepSeekGenerationV2RuntimeError extends Error {
  constructor(readonly code: 'GENERATION_V2_DEEPSEEK_RUNTIME_CREDENTIAL_INVALID') {
    super(code)
    this.name = 'DeepSeekGenerationV2RuntimeError'
  }
}

type CurrentCredentialExpectation = Readonly<{
  revision: number
  credentialScopeId: CredentialScopeIdV2
}>

export type DeepSeekGenerationV2Runtime = Readonly<{
  submitInitial: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  retry: (command: unknown) => Promise<GenerationTextCommandResultV2>
  regenerate: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  editResend: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  continueTool: (command: unknown) => Promise<GenerationTextCommandResultV2>
  abort: (operationId: string) => boolean
}>

/**
 * The only intended main-process composition point for DeepSeek V2 actions.
 * It deliberately accepts V2 commands and returns V2 graph projections; it
 * never accepts legacy message arrays or renderer-owned provider parameters.
 */
export function createDeepSeekGenerationV2Runtime(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  fetchImpl?: typeof fetch
  rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  nowMs?: () => number
}>): DeepSeekGenerationV2Runtime {
  const initial = createDeepSeekPlainTextInitialSendCoordinatorV2({
    db: input.db, credentialService: input.credentialService, fetchImpl: input.fetchImpl, nowMs: input.nowMs,
  })
  const retry = createDeepSeekPlainTextRetryCoordinatorV2({
    db: input.db, credentialService: input.credentialService, nowMs: input.nowMs,
  })
  const regenerate = createDeepSeekPlainTextRegenerateCoordinatorV2({
    db: input.db, credentialService: input.credentialService, fetchImpl: input.fetchImpl, nowMs: input.nowMs,
  })
  const editResend = createDeepSeekPlainTextEditResendCoordinatorV2({
    db: input.db, credentialService: input.credentialService, fetchImpl: input.fetchImpl, nowMs: input.nowMs,
  })
  const toolContinuation = createDeepSeekToolContinuationCoordinatorV2({
    db: input.db, credentialService: input.credentialService, nowMs: input.nowMs,
  })
  const runner = createDeepSeekInitialStreamRunnerV2({
    db: input.db,
    credentialService: input.credentialService,
    fetchImpl: input.fetchImpl,
    rawGenerationRequestStore: input.rawGenerationRequestStore,
    streamProjectionSink: input.streamProjectionSink,
    nowMs: input.nowMs,
  })
  const activeControllers = new Map<string, AbortController>()

  async function currentCredentialExpectation(): Promise<CurrentCredentialExpectation> {
    const status = await input.credentialService.getStatus('deepseek')
    if (!status.configured || !status.credentialScopeId) {
      throw new DeepSeekGenerationV2RuntimeError('GENERATION_V2_DEEPSEEK_RUNTIME_CREDENTIAL_INVALID')
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
