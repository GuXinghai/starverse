import { buildOpenRouterChatCompletionsRequest } from '@/next/openrouter/buildRequest'
import { decodeOpenRouterSSE } from '@/next/openrouter/sse/decoder'
import { mapChunkToEvents } from '@/next/openrouter/mapChunkToEvents'
import { openrouterFetch } from '@/next/transport/openrouterFetch'
import type { DomainEvent } from '@/next/state/types'

export type ReasoningEffort = 'xhigh' | 'high' | 'medium' | 'low' | 'minimal' | 'none'

export type LiveRequestConfig = Readonly<{
  apiKey: string
  model: string
  reasoningExclude?: boolean
  reasoningEffort?: ReasoningEffort
  /**
   * Tool definitions sent in every request when tool calling is supported.
   * For minimal compliance, callers may pass an empty array.
   */
  tools?: unknown[]
  timeoutMs?: number
  baseUrl?: string
}>

export type LiveStreamOptions = Readonly<{
  requestId: string
  assistantMessageId: string
  userText: string
  signal?: AbortSignal | null
  config: LiveRequestConfig
}>

function toStreamError(err: unknown): DomainEvent {
  return { type: 'StreamError', error: err, terminal: true }
}

/**
 * LIVE pipeline: openrouterFetch -> decodeOpenRouterSSE -> mapChunkToEvents.
 * This function does not mutate state; it only yields SSOT Domain Events.
 */
export async function* streamOpenRouterChatAsEvents(options: LiveStreamOptions): AsyncGenerator<DomainEvent> {
  const signal = options.signal ?? null
  if (signal?.aborted) {
    yield { type: 'StreamAbort', reason: 'aborted' }
    return
  }

  const { apiKey, model } = options.config

  const reasoning =
    options.config.reasoningEffort === undefined && options.config.reasoningExclude !== true
      ? undefined
      : {
          effort:
            options.config.reasoningEffort ??
            (options.config.reasoningExclude === true ? 'medium' : undefined),
          ...(options.config.reasoningExclude === true ? { exclude: true } : {}),
        }

  // Avoid sending an object with `effort: undefined` (when exclude is false and effort is omitted).
  const normalizedReasoning =
    reasoning && typeof (reasoning as any).effort === 'undefined' && options.config.reasoningExclude !== true
      ? undefined
      : reasoning

  const body = buildOpenRouterChatCompletionsRequest({
    model,
    messages: [{ role: 'user', content: options.userText }],
    stream: true,
    usage: { include: true },
    tools: options.config.tools ?? [],
    ...(normalizedReasoning ? { reasoning: normalizedReasoning } : {}),
  })

  let transport
  try {
    transport = await openrouterFetch({
      apiKey,
      body,
      requestId: options.requestId,
      signal,
      timeoutMs: options.config.timeoutMs,
      baseUrl: options.config.baseUrl,
    })
  } catch (err: any) {
    if (err?.type === 'aborted') {
      yield { type: 'StreamAbort', reason: 'aborted' }
      return
    }
    yield toStreamError(err)
    return
  }

  if (transport.generationId) {
    yield { type: 'MetaDelta', meta: { id: transport.generationId } }
  }

  const bodyStream = transport.response.body
  if (!bodyStream) {
    yield toStreamError({ message: 'Missing response body stream' })
    return
  }

  for await (const ev of decodeOpenRouterSSE(bodyStream)) {
    if (signal?.aborted) {
      yield { type: 'StreamAbort', reason: 'aborted' }
      return
    }

    if (ev.type === 'comment') {
      yield { type: 'StreamComment', text: ev.text }
      continue
    }

    if (ev.type === 'done') {
      yield { type: 'StreamDone' }
      return
    }

    if (ev.type === 'protocol_error') {
      yield toStreamError({ message: ev.message, raw: ev.raw })
      return
    }

    if (ev.type === 'terminal_error') {
      // StreamError is already emitted from the JSON chunk mapping; stop here.
      return
    }

    if (ev.type === 'json') {
      const mapped = mapChunkToEvents({
        chunk: ev.value as any,
        messageId: options.assistantMessageId,
      }) as any as DomainEvent[]
      for (const m of mapped) yield m
    }
  }
}
