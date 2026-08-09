import type BetterSqlite3 from 'better-sqlite3'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import type { Epoch2RuntimeCredentialService } from '../credentials/epoch2RuntimeCredentialService'
import type { Epoch2AttachmentBlobStoreV2 } from '../data-epoch/epoch2AttachmentBlobStoreV2'
import { GenerationRuntimeStarterV2 } from './generationRuntimeStarterV2'
import type { GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import {
  createOpenRouterImageInitialSendCoordinatorV2,
  type OpenRouterImageInitialSendResultV2,
} from './openRouterImageInitialSendCoordinatorV2'
import { createOpenRouterImageInitialStreamRunnerV2 } from './openRouterImageInitialStreamRunnerV2'
import { createOpenRouterImageActionCoordinatorV2, type OpenRouterImageActionResultV2 } from './openRouterImageActionCoordinatorV2'

export class OpenRouterImageGenerationV2RuntimeError extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENROUTER_IMAGE_RUNTIME_CREDENTIAL_INVALID') {
    super(code); this.name = 'OpenRouterImageGenerationV2RuntimeError'
  }
}
export type OpenRouterImageGenerationV2Runtime = Readonly<{
  submitInitial: (command: unknown, signal?: AbortSignal) => Promise<OpenRouterImageInitialSendResultV2>
  retry: (command: unknown, signal?: AbortSignal) => Promise<OpenRouterImageActionResultV2>
  regenerate: (command: unknown, signal?: AbortSignal) => Promise<OpenRouterImageActionResultV2>
  editResend: (command: unknown, signal?: AbortSignal) => Promise<OpenRouterImageActionResultV2>
  abort: (operationId: string) => boolean
}>

/** Dedicated Images operation root. It never infers or dispatches Chat payloads. */
export function createOpenRouterImageGenerationV2Runtime(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: Epoch2RuntimeCredentialService
  attachmentBlobStore: Epoch2AttachmentBlobStoreV2
  rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  nowMs?: () => number
}>): OpenRouterImageGenerationV2Runtime {
  const coordinator = createOpenRouterImageInitialSendCoordinatorV2(input)
  const runner = createOpenRouterImageInitialStreamRunnerV2(input)
  const actions = createOpenRouterImageActionCoordinatorV2(input)
  const starter = new GenerationRuntimeStarterV2(input.streamProjectionSink)
  function start(result: OpenRouterImageInitialSendResultV2 | OpenRouterImageActionResultV2): void {
    starter.start(
      result as Parameters<GenerationRuntimeStarterV2['start']>[0],
      (signal) => runner.run(result, signal),
    )
  }
  return Object.freeze({
    submitInitial: async (command: unknown, signal?: AbortSignal) => {
      const status = await input.credentialService.getStatus('openrouter')
      if (!status.configured || !status.credentialScopeId) {
        throw new OpenRouterImageGenerationV2RuntimeError('GENERATION_V2_OPENROUTER_IMAGE_RUNTIME_CREDENTIAL_INVALID')
      }
      const result = await coordinator.submit({ command, expectedCredentialRevision: status.revision,
        expectedCredentialScopeId: status.credentialScopeId, signal })
      start(result)
      return result
    },
    retry: async (command: unknown, signal?: AbortSignal) => { const result = await actions.retry(command, signal); start(result); return result },
    regenerate: async (command: unknown, signal?: AbortSignal) => { const result = await actions.regenerate(command, signal); start(result); return result },
    editResend: async (command: unknown, signal?: AbortSignal) => { const result = await actions.editResend(command, signal); start(result); return result },
    abort: (operationId: string) => starter.abort(operationId),
  })
}
