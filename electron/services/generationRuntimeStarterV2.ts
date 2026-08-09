import type { GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import {
  GENERATION_OPERATION_RUNTIME_START_V2,
  isCoordinatedGenerationStreamProjectionSinkV2,
  type GenerationStreamProjectionSinkV2,
} from './generationStreamProjectionV2'

type StartableResultV2 = GenerationTextCommandResultV2 | Readonly<{
  kind: 'created' | 'idempotent_replay'
  execution: GenerationTextCommandResultV2['execution']
  preparedRequest: Readonly<{ operationId: string }>
}>

export class GenerationRuntimeStarterV2 {
  readonly #controllers = new Map<string, AbortController>()

  constructor(private readonly sink: GenerationStreamProjectionSinkV2 | undefined) {}

  start(
    result: StartableResultV2,
    run: (signal: AbortSignal) => Promise<unknown>,
  ): void {
    if (isCoordinatedGenerationStreamProjectionSinkV2(this.sink)) {
      this.sink[GENERATION_OPERATION_RUNTIME_START_V2](result, run)
      return
    }
    if (result.kind !== 'created' || this.#controllers.has(result.preparedRequest.operationId)) return
    const controller = new AbortController()
    this.#controllers.set(result.preparedRequest.operationId, controller)
    void run(controller.signal)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        console.error('[generation-v2] uncoordinated runner failed', {
          operationId: result.preparedRequest.operationId,
          message,
        })
      })
      .finally(() => this.#controllers.delete(result.preparedRequest.operationId))
  }

  abort(operationId: string): boolean {
    const controller = this.#controllers.get(operationId)
    if (!controller || controller.signal.aborted) return false
    controller.abort('user_cancelled')
    return true
  }
}
