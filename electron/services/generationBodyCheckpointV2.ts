const DEFAULT_INTERVAL_MS = 50
const DEFAULT_BYTE_THRESHOLD = 4 * 1024

export class GenerationBodyCheckpointV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_BODY_CHECKPOINT_SEQUENCE_INVALID'
    | 'GENERATION_V2_BODY_CHECKPOINT_CLOSED'
    | 'GENERATION_V2_BODY_CHECKPOINT_FAILED', options?: ErrorOptions) {
    super(code, options)
    this.name = 'GenerationBodyCheckpointV2Error'
  }
}

export class GenerationBodyCheckpointV2 {
  #persisted: string
  #latest: string
  #timer: ReturnType<typeof setTimeout> | null = null
  #failure: unknown = null
  #closed = false

  constructor(private readonly input: Readonly<{
    initialBody: string
    persist: (expected: string, next: string) => void
    publish: (content: string) => void
    onFailure: (error: unknown) => void
    intervalMs?: number
    byteThreshold?: number
  }>) {
    this.#persisted = input.initialBody
    this.#latest = input.initialBody
  }

  update(next: string): void {
    this.#throwIfFailed()
    if (this.#closed) throw new GenerationBodyCheckpointV2Error('GENERATION_V2_BODY_CHECKPOINT_CLOSED')
    if (!next.startsWith(this.#latest)) {
      throw new GenerationBodyCheckpointV2Error('GENERATION_V2_BODY_CHECKPOINT_SEQUENCE_INVALID')
    }
    if (next === this.#latest) return
    this.#latest = next
    const deltaBytes = new TextEncoder().encode(this.#latest.slice(this.#persisted.length)).byteLength
    if (deltaBytes >= (this.input.byteThreshold ?? DEFAULT_BYTE_THRESHOLD)) {
      this.flush()
      return
    }
    if (this.#timer) return
    this.#timer = setTimeout(() => {
      this.#timer = null
      try {
        this.#flushCurrent()
      } catch (error) {
        this.#failure = error
        this.input.onFailure(error)
      }
    }, this.input.intervalMs ?? DEFAULT_INTERVAL_MS)
    this.#timer.unref?.()
  }

  flush(): void {
    this.#throwIfFailed()
    if (this.#timer) {
      clearTimeout(this.#timer)
      this.#timer = null
    }
    this.#flushCurrent()
  }

  close(): void {
    this.flush()
    this.#closed = true
  }

  dispose(): void {
    if (this.#timer) clearTimeout(this.#timer)
    this.#timer = null
    this.#closed = true
  }

  #flushCurrent(): void {
    if (this.#latest === this.#persisted) return
    const expected = this.#persisted
    const next = this.#latest
    try {
      this.input.persist(expected, next)
      this.#persisted = next
      this.input.publish(next)
    } catch (error) {
      this.#failure = error
      throw new GenerationBodyCheckpointV2Error('GENERATION_V2_BODY_CHECKPOINT_FAILED', { cause: error })
    }
  }

  #throwIfFailed(): void {
    if (this.#failure !== null) {
      throw new GenerationBodyCheckpointV2Error('GENERATION_V2_BODY_CHECKPOINT_FAILED', {
        cause: this.#failure,
      })
    }
  }
}

export function createGenerationTextBodyCheckpointV2(input: Readonly<{
  db: BetterSqlite3.Database
  graphRepo: ConversationGraphV2Repo
  command: GenerationTextCommandResultV2
  initialBody: string
  streamProjectionSink?: GenerationStreamProjectionSinkV2
  nowMs: () => number
  onFailure: (error: unknown) => void
  intervalMs?: number
  byteThreshold?: number
}>): GenerationBodyCheckpointV2 {
  return new GenerationBodyCheckpointV2({
    initialBody: input.initialBody,
    persist: (expected, next) => {
      runGenerationV2AuthorityTransactionOnOwnedConnectionV2(input.db, (context) => {
        input.graphRepo.compareAndSetStreamingAssistantBody(
          context,
          input.command.preparedRequest.answerRootId,
          expected,
          next,
          input.nowMs(),
        )
      })
    },
    publish: (content) => publishGenerationStreamProjectionV2(input.streamProjectionSink, {
      type: 'assistant_body',
      operationId: input.command.preparedRequest.operationId,
      answerRootId: input.command.preparedRequest.answerRootId,
      content,
    }),
    onFailure: input.onFailure,
    ...(input.intervalMs === undefined ? {} : { intervalMs: input.intervalMs }),
    ...(input.byteThreshold === undefined ? {} : { byteThreshold: input.byteThreshold }),
  })
}
import type BetterSqlite3 from 'better-sqlite3'
import type { ConversationGraphV2Repo } from '../../infra/db/repo/conversationGraphV2Repo'
import { runGenerationV2AuthorityTransactionOnOwnedConnectionV2 } from '../../infra/db/repo/generationV2AuthorityTransactionInternal'
import type { GenerationTextCommandResultV2 } from './generationTextCommandResultV2'
import { publishGenerationStreamProjectionV2, type GenerationStreamProjectionSinkV2 } from './generationStreamProjectionV2'
