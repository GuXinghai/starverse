import { decodeOpenRouterSSE } from './sse/decoder'
import { mapChunkToEvents } from './mapChunkToEvents'
import type { DomainEvent } from '../state/types'

export type FixtureStreamOptions = Readonly<{
  assistantMessageId: string
  delayMs?: number
  signal?: AbortSignal | null
}>

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function* chunkText(text: string): AsyncGenerator<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  for (let i = 0; i < bytes.length; i += 11) {
    yield bytes.slice(i, i + 11)
  }
}

/**
 * Replay an SSE fixture text as DomainEvents (decoder + mapper), suitable for UI demo and deterministic tests.
 * This is NOT UI code; it enforces the "UI doesn't parse OpenRouter JSON" boundary.
 */
export async function* replayOpenRouterSSEFixtureAsEvents(
  fixtureText: string,
  options: FixtureStreamOptions
): AsyncGenerator<DomainEvent> {
  const delayMs = options.delayMs ?? 0
  const signal = options.signal ?? null

  if (signal?.aborted) {
    yield { type: 'StreamAbort', reason: 'aborted' }
    return
  }

  const onAbort = () => {
    // no-op; checked in loop
  }
  if (signal) signal.addEventListener('abort', onAbort, { once: true })

  try {
    for await (const ev of decodeOpenRouterSSE(chunkText(fixtureText))) {
      if (signal?.aborted) {
        yield { type: 'StreamAbort', reason: 'aborted' }
        return
      }

      if (ev.type === 'comment') {
        yield { type: 'StreamComment', text: ev.text }
      } else if (ev.type === 'done') {
        yield { type: 'StreamDone' }
        return
      } else if (ev.type === 'protocol_error') {
        yield { type: 'StreamError', error: { message: ev.message, raw: ev.raw }, terminal: true }
        return
      } else if (ev.type === 'terminal_error') {
        // The error JSON chunk has already been emitted and mapped; end the stream here.
        return
      } else if (ev.type === 'json') {
        const mapped = mapChunkToEvents({
          chunk: ev.value as any,
          messageId: options.assistantMessageId,
        }) as any as DomainEvent[]
        for (const m of mapped) yield m
      }

      if (delayMs > 0) await sleep(delayMs)
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}

