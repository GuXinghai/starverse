import { buildOpenRouterChatCompletionsRequest } from '@/next/openrouter/buildRequest'
import { decodeOpenRouterSSE } from '@/next/openrouter/sse/decoder'
import { mapChunkToEvents } from '@/next/openrouter/mapChunkToEvents'
import { openrouterFetch } from '@/next/transport/openrouterFetch'
import { getOpenRouterProviderRequireParameters } from '@/next/settings/openRouterProviderSettingsClient'
import type { ReasoningEffort, RequestedReasoningMode } from '@/next/state/types'
import type { DomainEvent } from '@/next/state/types'
import { buildOpenRouterMessages, type ContextMode, type InternalMessage } from '@/next/context/buildMessages'
import {
  normalizeOpenRouterErrorFromHttpNon2xx,
  normalizeOpenRouterErrorFromSseChunkError,
  normalizeOpenRouterUnknownStreamingError,
} from '@/next/errors/normalizeOpenRouterError'

export type LiveRequestConfig = Readonly<{
  apiKey: string
  model: string
  requestedReasoningMode: RequestedReasoningMode
  requestedReasoningEffort?: ReasoningEffort
  requestedReasoningExclude?: boolean
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
  /**
   * Prior turns to include as request `messages[]` context.
   * Must NOT include the current user input (passed via `userText`).
   *
   * Keep this as InternalMessage[] to allow future multimodal/tool support without
   * pushing OpenRouter request-shaping into UI layers.
   */
  contextMessages?: ReadonlyArray<InternalMessage>
  contextMode?: ContextMode
  signal?: AbortSignal | null
  config: LiveRequestConfig
}>

function toStreamError(err: unknown): DomainEvent {
  const message =
    err && typeof err === 'object' && 'message' in (err as any) ? String((err as any).message ?? 'Error') : 'Error'
  return { type: 'StreamError', error: normalizeOpenRouterUnknownStreamingError({ message, details: { name: (err as any)?.name } }), terminal: true }
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

  const providerRequireParameters = await getOpenRouterProviderRequireParameters()

  const internalMessages: InternalMessage[] = [
    ...((options.contextMessages ?? []) as InternalMessage[]),
    { role: 'user', contentText: options.userText },
  ]

  const messages = buildOpenRouterMessages(internalMessages, { mode: options.contextMode ?? 'default' })

  const reasoning =
    options.config.requestedReasoningMode === 'auto'
      ? undefined
      : {
          effort: options.config.requestedReasoningEffort ?? 'none',
          ...(options.config.requestedReasoningExclude === true ? { exclude: true } : {}),
        }

  const body = buildOpenRouterChatCompletionsRequest({
    model,
    messages,
    stream: true,
    usage: { include: true },
    tools: options.config.tools ?? [],
    ...(providerRequireParameters === true ? { providerRequireParameters: true } : {}),
    ...(reasoning ? { reasoning } : {}),
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

    if (err?.type === 'http_error') {
      const env = normalizeOpenRouterErrorFromHttpNon2xx({
        status: Number(err.status),
        statusText: String(err.statusText ?? ''),
        bodyText: String(err.bodyText ?? ''),
        headers: (err.headers && typeof err.headers === 'object') ? (err.headers as any) : undefined,
      })
      yield { type: 'StreamError', error: env, terminal: true }
      return
    }

    yield toStreamError(err)
    return
  }

  let lastMeta: { generationId?: string; model?: string; provider?: string; finishReason?: string; nativeFinishReason?: string } = {}
  let chunkNo = 0  // 递增的 chunk 序号，用于诊断追踪

  if (transport.generationId) {
    yield { type: 'MetaDelta', meta: { id: transport.generationId } }
    lastMeta.generationId = transport.generationId
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
      yield {
        type: 'StreamError',
        error: normalizeOpenRouterUnknownStreamingError({ message: ev.message, details: { raw: ev.raw ? { raw: ev.raw } : {} } }),
        terminal: true
      }
      return
    }

    if (ev.type === 'terminal_error') {
      // StreamError is already emitted from the JSON chunk mapping; stop here.
      return
    }

    if (ev.type === 'json') {
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
          const env = normalizeOpenRouterErrorFromSseChunkError({
            chunkError: m.error,
            meta: lastMeta,
          })
          yield { type: 'StreamError', error: env, terminal: true }
          continue
        }

        yield m
      }
    }
  }
}
