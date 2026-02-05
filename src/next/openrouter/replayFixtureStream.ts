import { decodeOpenRouterSSE } from './sse/decoder'
import { mapChunkToEvents } from './mapChunkToEvents'
import type { DomainEvent } from '../state/types'
import { buildAbortEnvelope, buildMidStreamSseErrorEnvelope, buildTransportErrorEnvelope } from '../errors/openRouterErrorEnvelope'
import { normalizeOpenRouterErrorFromSseChunkError, normalizeOpenRouterUnknownStreamingError } from '../errors/normalizeOpenRouterError'

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
  let lastMeta: { generationId?: string; model?: string; provider?: string; finishReason?: string; nativeFinishReason?: string } = {}
  let chunkNo = 0

  if (signal?.aborted) {
    const envelope = buildAbortEnvelope({ phase: 'pre_stream', completionClass: 'aborted', reason: 'aborted' })
    yield { type: 'StreamAbort', reason: 'aborted', envelope }
    return
  }

  const onAbort = () => {
    // no-op; checked in loop
  }
  if (signal) signal.addEventListener('abort', onAbort, { once: true })

  try {
    for await (const ev of decodeOpenRouterSSE(chunkText(fixtureText))) {
      if (signal?.aborted) {
        const envelope = buildAbortEnvelope({ phase: 'mid_stream', completionClass: 'aborted', reason: 'aborted' })
        yield { type: 'StreamAbort', reason: 'aborted', envelope }
        return
      }

      if (ev.type === 'comment') {
        yield { type: 'StreamComment', text: ev.text }
      } else if (ev.type === 'done') {
        yield { type: 'StreamDone' }
        return
      } else if (ev.type === 'protocol_error') {
        const normalized = normalizeOpenRouterUnknownStreamingError({ message: ev.message, details: { raw: ev.raw ? { raw: ev.raw } : {} } })
        const envelope = buildTransportErrorEnvelope({
          phase: 'mid_stream',
          completionClass: 'error',
          message: ev.message,
          normalized,
          kind: 'parse_error',
        })
        yield { type: 'StreamError', error: envelope, terminal: true }
        return
      } else if (ev.type === 'terminal_error') {
        // The error JSON chunk has already been emitted and mapped; end the stream here.
        return
      } else if (ev.type === 'json') {
        chunkNo++
        const mapped = mapChunkToEvents({
          chunk: ev.value as any,
          messageId: options.assistantMessageId,
          chunkNo,
        }) as any as DomainEvent[]
        for (const m of mapped) {
          if (m.type === 'MetaDelta') {
            lastMeta = {
              generationId: m.meta?.id ?? lastMeta.generationId,
              model: m.meta?.model ?? lastMeta.model,
              provider: m.meta?.provider ?? lastMeta.provider,
              finishReason: m.meta?.finish_reason ?? lastMeta.finishReason,
              nativeFinishReason: m.meta?.native_finish_reason ?? lastMeta.nativeFinishReason,
            }
            yield m
            continue
          }
          if (m.type === 'StreamError') {
            const normalized = normalizeOpenRouterErrorFromSseChunkError({
              chunkError: (m as any).error,
              meta: lastMeta,
            })
            const envelope = buildMidStreamSseErrorEnvelope({
              phase: 'mid_stream',
              completionClass: 'error',
              normalized,
              stream: {
                generation_id: lastMeta.generationId,
                model: lastMeta.model,
                provider: lastMeta.provider,
                finish_reason: lastMeta.finishReason,
                native_finish_reason: lastMeta.nativeFinishReason,
                chunk_no: chunkNo,
              },
            })
            yield { type: 'StreamError', error: envelope, terminal: true }
            return
          }
          yield m
        }
      }

      if (delayMs > 0) await sleep(delayMs)
    }
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort)
  }
}
