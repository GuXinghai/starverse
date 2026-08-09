import type BetterSqlite3 from 'better-sqlite3'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { GenerationRuntimeStarterV2 } from './generationRuntimeStarterV2'
import type { GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import { createGeminiInteractionsImageActionCoordinatorV2 } from './geminiInteractionsImageActionCoordinatorV2'
import { createGeminiInteractionsImageInitialSendCoordinatorV2, type GeminiInteractionsImageCommandResultV2 } from './geminiInteractionsImageInitialSendCoordinatorV2'
import { createGeminiInteractionsImageStreamRunnerV2 } from './geminiInteractionsImageStreamRunnerV2'

export class GeminiInteractionsImageGenerationV2RuntimeError extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_INTERACTIONS_RUNTIME_CREDENTIAL_INVALID') { super(code); this.name = 'GeminiInteractionsImageGenerationV2RuntimeError' }
}
export type GeminiInteractionsImageGenerationV2Runtime = Readonly<{
  submitInitial: (command: unknown, signal?: AbortSignal) => Promise<GeminiInteractionsImageCommandResultV2>
  retry: (command: unknown, signal?: AbortSignal) => Promise<GeminiInteractionsImageCommandResultV2>
  regenerate: (command: unknown, signal?: AbortSignal) => Promise<GeminiInteractionsImageCommandResultV2>
  editResend: (command: unknown, signal?: AbortSignal) => Promise<GeminiInteractionsImageCommandResultV2>
  abort: (operationId: string) => boolean
}>

/** Independent Interactions image runtime; it never accepts GenerateContent payloads. */
export function createGeminiInteractionsImageGenerationV2Runtime(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  attachmentBlobStore: Epoch2AttachmentBlobStoreV2
  rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  nowMs?: () => number
}>): GeminiInteractionsImageGenerationV2Runtime {
  const coordinator = createGeminiInteractionsImageInitialSendCoordinatorV2(input)
  const actions = createGeminiInteractionsImageActionCoordinatorV2(input)
  const runner = createGeminiInteractionsImageStreamRunnerV2(input)
  const starter = new GenerationRuntimeStarterV2(input.streamProjectionSink)
  function start(result: GeminiInteractionsImageCommandResultV2): void {
    starter.start(
      result as Parameters<GenerationRuntimeStarterV2['start']>[0],
      (signal) => runner.run(result, signal),
    )
  }
  return Object.freeze({
    submitInitial: async (command: unknown) => {
      const status = await input.credentialService.getStatus('google_ai_studio')
      if (!status.configured || !status.credentialScopeId) {
        throw new GeminiInteractionsImageGenerationV2RuntimeError('GENERATION_V2_GEMINI_INTERACTIONS_RUNTIME_CREDENTIAL_INVALID')
      }
      const result = await coordinator.submit({ command, expectedCredentialRevision: status.revision,
        expectedCredentialScopeId: status.credentialScopeId })
      start(result); return result
    },
    retry: async (command: unknown) => { const result = await actions.retry(command); start(result); return result },
    regenerate: async (command: unknown) => { const result = await actions.regenerate(command); start(result); return result },
    editResend: async (command: unknown) => { const result = await actions.editResend(command); start(result); return result },
    abort: (operationId: string) => starter.abort(operationId),
  })
}
