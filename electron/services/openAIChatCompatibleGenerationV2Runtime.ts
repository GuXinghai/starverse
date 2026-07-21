import type BetterSqlite3 from 'better-sqlite3'
import type { RawGenerationRequestStore } from '../debug/rawGenerationRequestStore'
import { createOpenAICompatibleCredentialV2Service } from '../credentials/openAICompatibleCredentialV2Service'
import type { GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
import type { GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { createOpenAIChatCompatibleGenerationV2Coordinator } from './openAIChatCompatibleGenerationV2Coordinator'
import { createOpenAIChatCompatibleStreamRunnerV2 } from './openAIChatCompatibleStreamRunnerV2'

type CredentialService = ReturnType<typeof createOpenAICompatibleCredentialV2Service>

export function createOpenAIChatCompatibleGenerationV2Runtime(input: Readonly<{
  db: BetterSqlite3.Database
  credentialService: CredentialService
  rawGenerationRequestStore?: RawGenerationRequestStore
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>
  nowMs?: () => number
  createQuestionId?: () => string
  createAnswerId?: () => string
}>) {
  const coordinator = createOpenAIChatCompatibleGenerationV2Coordinator(input)
  const runner = createOpenAIChatCompatibleStreamRunnerV2(input)
  const controllers = new Map<string, AbortController>()
  function start(result: GenerationTextCommandResultV2) {
    if (result.kind !== 'created' || controllers.has(result.preparedRequest.operationId)) return
    const controller = new AbortController(); controllers.set(result.preparedRequest.operationId, controller)
    void runner.run(result, controller.signal).catch(() => undefined).finally(() => controllers.delete(result.preparedRequest.operationId))
  }
  async function submit(promise: Promise<GenerationTextCommandResultV2>) { const result = await promise; start(result); return result }
  return Object.freeze({
    submitInitial: (command: unknown) => submit(coordinator.submitInitial(command)),
    retry: (command: unknown) => submit(coordinator.retry(command)),
    regenerate: (command: unknown) => submit(coordinator.regenerate(command)),
    editResend: (command: unknown) => submit(coordinator.editResend(command)),
    abort: (operationId: string) => {
      const controller = controllers.get(operationId)
      if (!controller || controller.signal.aborted) return false
      controller.abort('user_cancelled'); return true
    },
  })
}

export type OpenAIChatCompatibleGenerationV2Runtime = ReturnType<typeof createOpenAIChatCompatibleGenerationV2Runtime>
