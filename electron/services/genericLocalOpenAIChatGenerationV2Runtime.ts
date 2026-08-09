import type BetterSqlite3 from 'better-sqlite3'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import type { GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import type { GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { createGenericLocalOpenAIChatGenerationV2Coordinator } from './genericLocalOpenAIChatGenerationV2Coordinator'
import { createGenericLocalOpenAIChatStreamRunnerV2 } from './genericLocalOpenAIChatStreamRunnerV2'
import { GenerationRuntimeStarterV2 } from './generationRuntimeStarterV2'

export function createGenericLocalOpenAIChatGenerationV2Runtime(input: Readonly<{ db: BetterSqlite3.Database;
  rawGenerationRequestStore?: RawGenerationRequestStore; streamProjectionSink?: GenerationStreamProjectionSinkV2;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>; nowMs?: () => number }>) {
  const coordinator = createGenericLocalOpenAIChatGenerationV2Coordinator(input); const runner = createGenericLocalOpenAIChatStreamRunnerV2(input)
  const starter = new GenerationRuntimeStarterV2(input.streamProjectionSink)
  function start(result: GenerationTextCommandResultV2) { starter.start(result, (signal) => runner.run(result, signal)) }
  async function submit(promise: Promise<GenerationTextCommandResultV2>) { const result = await promise; start(result); return result }
  return Object.freeze({ submitInitial: (command: unknown) => submit(coordinator.submitInitial(command)),
    retry: (command: unknown) => submit(coordinator.retry(command)), regenerate: (command: unknown) => submit(coordinator.regenerate(command)),
    editResend: (command: unknown) => submit(coordinator.editResend(command)),
    abort: (operationId: string) => starter.abort(operationId) })
}
