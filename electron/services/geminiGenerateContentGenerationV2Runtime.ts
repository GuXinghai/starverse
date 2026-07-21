import type BetterSqlite3 from 'better-sqlite3'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import type { GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import type { GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import { createGeminiGenerateContentStreamRunnerV2 } from './geminiGenerateContentStreamRunnerV2'
import { createGeminiPlainTextEditResendCoordinatorV2 } from './geminiPlainTextEditResendCoordinatorV2'
import { createGeminiPlainTextInitialSendCoordinatorV2 } from './geminiPlainTextInitialSendCoordinatorV2'
import { createGeminiPlainTextRegenerateCoordinatorV2 } from './geminiPlainTextRegenerateCoordinatorV2'
import { createGeminiPlainTextRetryCoordinatorV2 } from './geminiPlainTextRetryCoordinatorV2'
import { createGeminiToolContinuationCoordinatorV2 } from './geminiToolContinuationCoordinatorV2'

export class GeminiGenerateContentGenerationV2RuntimeError extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_RUNTIME_CREDENTIAL_INVALID') {
    super(code)
    this.name = 'GeminiGenerateContentGenerationV2RuntimeError'
  }
}

type CredentialExpectation = Readonly<{ revision: number; credentialScopeId: CredentialScopeIdV2 }>
export type GeminiGenerateContentGenerationV2Runtime = Readonly<{
  submitInitial: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  retry: (command: unknown) => Promise<GenerationTextCommandResultV2>
  regenerate: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  editResend: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  continueTool: (command: unknown) => Promise<GenerationTextCommandResultV2>
  abort: (operationId: string) => boolean
}>

/** GenerateContent owns this text runtime. Interactions is never dispatched through it. */
export function createGeminiGenerateContentGenerationV2Runtime(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  fetchImpl?: typeof fetch
  nowMs?: () => number
}>): GeminiGenerateContentGenerationV2Runtime {
  const initial = createGeminiPlainTextInitialSendCoordinatorV2(input)
  const retry = createGeminiPlainTextRetryCoordinatorV2(input)
  const regenerate = createGeminiPlainTextRegenerateCoordinatorV2(input)
  const editResend = createGeminiPlainTextEditResendCoordinatorV2(input)
  const toolContinuation = createGeminiToolContinuationCoordinatorV2(input)
  const runner = createGeminiGenerateContentStreamRunnerV2(input)
  const controllers = new Map<string, AbortController>()

  async function credential(): Promise<CredentialExpectation> {
    const status = await input.credentialService.getStatus('google_ai_studio')
    if (!status.configured || !status.credentialScopeId) {
      throw new GeminiGenerateContentGenerationV2RuntimeError('GENERATION_V2_GEMINI_RUNTIME_CREDENTIAL_INVALID')
    }
    return Object.freeze({ revision: status.revision, credentialScopeId: status.credentialScopeId })
  }
  function start(result: GenerationTextCommandResultV2): void {
    if (result.kind !== 'created' || controllers.has(result.preparedRequest.operationId)) return
    const controller = new AbortController()
    controllers.set(result.preparedRequest.operationId, controller)
    void runner.run(result, controller.signal).catch(() => undefined)
      .finally(() => controllers.delete(result.preparedRequest.operationId))
  }
  async function commitAndStart(promise: Promise<GenerationTextCommandResultV2>): Promise<GenerationTextCommandResultV2> {
    const result = await promise
    start(result)
    return result
  }
  async function currentConfigSubmit(
    submit: (request: Readonly<{ command: unknown; expectedCredentialRevision: number;
      expectedCredentialScopeId: CredentialScopeIdV2; signal?: AbortSignal }>) => Promise<GenerationTextCommandResultV2>,
    command: unknown,
    signal?: AbortSignal,
  ): Promise<GenerationTextCommandResultV2> {
    const expected = await credential()
    return commitAndStart(submit({ command, expectedCredentialRevision: expected.revision,
      expectedCredentialScopeId: expected.credentialScopeId, signal }))
  }

  return Object.freeze({
    submitInitial: (command: unknown, signal?: AbortSignal) => currentConfigSubmit(initial.submit, command, signal),
    retry: (command: unknown) => commitAndStart(retry.submit(command)),
    regenerate: (command: unknown, signal?: AbortSignal) => currentConfigSubmit(regenerate.submit, command, signal),
    editResend: (command: unknown, signal?: AbortSignal) => currentConfigSubmit(editResend.submit, command, signal),
    continueTool: (command: unknown) => commitAndStart(toolContinuation.submit(command)),
    abort: (operationId: string) => {
      const controller = controllers.get(operationId)
      if (!controller || controller.signal.aborted) return false
      controller.abort('user_cancelled')
      return true
    },
  })
}
