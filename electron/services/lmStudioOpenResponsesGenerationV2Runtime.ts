import type BetterSqlite3 from 'better-sqlite3'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import type { GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import type { GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { createLmStudioOpenResponsesGenerationV2Coordinator } from './lmStudioOpenResponsesGenerationV2Coordinator'
import { createLmStudioOpenResponsesStreamRunnerV2 } from './lmStudioOpenResponsesStreamRunnerV2'
import { createLmStudioOpenResponsesToolContinuationCoordinatorV2 } from './lmStudioOpenResponsesToolContinuationCoordinatorV2'
import { GenerationRuntimeStarterV2 } from './generationRuntimeStarterV2'

export type LmStudioOpenResponsesGenerationV2Runtime = Readonly<{
  submitInitial: (command: unknown) => Promise<GenerationTextCommandResultV2>
  retry: (command: unknown) => Promise<GenerationTextCommandResultV2>
  regenerate: (command: unknown) => Promise<GenerationTextCommandResultV2>
  editResend: (command: unknown) => Promise<GenerationTextCommandResultV2>
  continueTool: (command: unknown) => Promise<GenerationTextCommandResultV2>
  abort: (operationId: string) => boolean
}>
export function createLmStudioOpenResponsesGenerationV2Runtime(input: Readonly<{
  db: BetterSqlite3.Database; rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>; nowMs?: () => number
}>): LmStudioOpenResponsesGenerationV2Runtime {
  const coordinator = createLmStudioOpenResponsesGenerationV2Coordinator(input)
  const runner = createLmStudioOpenResponsesStreamRunnerV2(input)
  const continuation = createLmStudioOpenResponsesToolContinuationCoordinatorV2(input)
  const starter = new GenerationRuntimeStarterV2(input.streamProjectionSink)
  function start(result: GenerationTextCommandResultV2): void {
    starter.start(result, (signal) => runner.run(result, signal))
  }
  async function submit(promise: Promise<GenerationTextCommandResultV2>) {
    const result = await promise; start(result); return result
  }
  return Object.freeze({ submitInitial: (command: unknown) => submit(coordinator.submitInitial(command)),
    retry: (command: unknown) => submit(coordinator.retry(command)),
    regenerate: (command: unknown) => submit(coordinator.regenerate(command)),
    editResend: (command: unknown) => submit(coordinator.editResend(command)),
    continueTool: (command: unknown) => submit(continuation.submit(command)),
    abort: (operationId: string) => starter.abort(operationId),
  })
}
