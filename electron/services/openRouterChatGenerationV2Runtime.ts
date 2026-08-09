import type BetterSqlite3 from 'better-sqlite3'
import type { CredentialScopeIdV2 } from '../../infra/security/credentialScopeV2Primitive'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import { GenerationRuntimeStarterV2 } from './generationRuntimeStarterV2'
import type { GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import type { GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import { createOpenRouterChatPlainTextEditResendCoordinatorV2 } from './openRouterChatPlainTextEditResendCoordinatorV2'
import { createOpenRouterChatPlainTextInitialSendCoordinatorV2 } from './openRouterChatPlainTextInitialSendCoordinatorV2'
import { createOpenRouterChatPlainTextRegenerateCoordinatorV2 } from './openRouterChatPlainTextRegenerateCoordinatorV2'
import { createOpenRouterChatPlainTextRetryCoordinatorV2 } from './openRouterChatPlainTextRetryCoordinatorV2'
import { createOpenRouterChatStreamRunnerV2 } from './openRouterChatStreamRunnerV2'
import { createOpenRouterChatToolContinuationCoordinatorV2 } from './openRouterChatToolContinuationCoordinatorV2'

export class OpenRouterChatGenerationV2RuntimeError extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENROUTER_CHAT_RUNTIME_CREDENTIAL_INVALID') {
    super(code); this.name = 'OpenRouterChatGenerationV2RuntimeError'
  }
}

type CredentialExpectation = Readonly<{ revision: number; credentialScopeId: CredentialScopeIdV2 }>
export type OpenRouterChatGenerationV2Runtime = Readonly<{
  submitInitial: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  retry: (command: unknown) => Promise<GenerationTextCommandResultV2>
  regenerate: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  editResend: (command: unknown, signal?: AbortSignal) => Promise<GenerationTextCommandResultV2>
  continueTool: (command: unknown) => Promise<GenerationTextCommandResultV2>
  abort: (operationId: string) => boolean
}>

/** OpenRouter Chat has its own typed command/codec/runner boundary; Images is not dispatched here. */
export function createOpenRouterChatGenerationV2Runtime(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  attachmentBlobStore?: Epoch2AttachmentBlobStoreV2
  rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  nowMs?: () => number
}>): OpenRouterChatGenerationV2Runtime {
  const initial = createOpenRouterChatPlainTextInitialSendCoordinatorV2(input)
  const retry = createOpenRouterChatPlainTextRetryCoordinatorV2(input)
  const regenerate = createOpenRouterChatPlainTextRegenerateCoordinatorV2(input)
  const editResend = createOpenRouterChatPlainTextEditResendCoordinatorV2(input)
  const continuation = createOpenRouterChatToolContinuationCoordinatorV2(input)
  const runner = createOpenRouterChatStreamRunnerV2(input)
  const starter = new GenerationRuntimeStarterV2(input.streamProjectionSink)

  async function credential(): Promise<CredentialExpectation> {
    const status = await input.credentialService.getStatus('openrouter')
    if (!status.configured || !status.credentialScopeId) {
      throw new OpenRouterChatGenerationV2RuntimeError('GENERATION_V2_OPENROUTER_CHAT_RUNTIME_CREDENTIAL_INVALID')
    }
    return Object.freeze({ revision: status.revision, credentialScopeId: status.credentialScopeId })
  }
  function start(result: GenerationTextCommandResultV2): void {
    starter.start(result, (signal) => runner.run(result, signal))
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
    continueTool: (command: unknown) => commitAndStart(continuation.submit(command)),
    abort: (operationId: string) => starter.abort(operationId),
  })
}
