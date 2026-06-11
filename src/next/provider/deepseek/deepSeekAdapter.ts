/**
 * DeepSeek RuntimeProviderAdapter — Phase 3 integration.
 *
 * Accepts a provider-neutral request, builds a DeepSeek-compatible request body,
 * executes transport via an injectable fetch function, decodes SSE via the
 * DeepSeek-local decoder, maps chunks through mapDeepSeekChunkToEvents,
 * and yields StarverseStreamEvent.
 *
 * This adapter does NOT read credentials from renderer/store/settings.
 * Credentials are injected via the transport options (test-only pattern).
 * No live API calls. No UI exposure.
 *
 * @see docs/architecture/provider-architecture/STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md §4.5
 */

import type { ProviderStreamRequest, StarverseProviderError, StarverseStreamEvent } from '@/next/provider/providerTypes'
import type { RuntimeProviderStreamAdapter } from '@/next/provider/runtimeProviderAdapter'
import { buildDeepSeekRequest, type DeepSeekMessage } from '@/next/provider/deepseek/deepSeekRequestBuilder'
import { decodeDeepSeekSSE } from '@/next/provider/deepseek/deepSeekSseDecoder'
import { mapDeepSeekChunkToEvents } from '@/next/provider/deepseek/deepSeekStreamMapper'

// ---------------------------------------------------------------------------
// Adapter types
// ---------------------------------------------------------------------------

export type DeepSeekTransportOptions = Readonly<{
  baseUrl: string
  apiKey: string
  timeoutMs?: number
}>

export type DeepSeekFetchFn = (
  url: string,
  init: RequestInit,
) => Promise<Response>

// ---------------------------------------------------------------------------
// streamViaDeepSeek — main adapter entry point
// ---------------------------------------------------------------------------

/**
 * Execute a DeepSeek chat completion stream.
 *
 * @param request - Provider-neutral stream request
 * @param transport - Transport options and injectable fetch function
 * @yields StarverseStreamEvent — provider-neutral stream events
 */
export const streamViaDeepSeek: RuntimeProviderStreamAdapter = async function* streamViaDeepSeek(
  request: ProviderStreamRequest,
  transport: DeepSeekTransportOptions & { fetch: DeepSeekFetchFn },
): AsyncGenerator<StarverseStreamEvent> {
  const { assistantMessageId, config, signal } = request

  // Build messages from request (simplified — no reasoning injection)
  const messages = buildMessages(request)

  // Build DeepSeek request body
  const body = buildDeepSeekRequest({
    model: config.model,
    messages,
    config,
  })

  // Execute transport
  const url = `${transport.baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${transport.apiKey}`,
  }

  let response: Response
  try {
    response = await transport.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: signal ?? undefined,
    })
  } catch (err: any) {
    yield* mapTransportError(err, assistantMessageId)
    return
  }

  if (!response.ok) {
    yield* mapHttpError(response, assistantMessageId)
    return
  }

  // Decode SSE stream
  const sseStream = response.body
  if (!sseStream) {
    yield {
      type: 'stream.error',
      error: {
        phase: 'transport',
        provider: 'deepseek',
        category: 'network',
        message: 'Response body is null',
      } satisfies StarverseProviderError,
      terminal: true,
    }
    return
  }

  // Stream SSE → chunks → events
  // Terminal coordination:
  // - SSE [DONE] is the normal stream end signal
  // - We emit exactly one terminal: either stream.done or stream.error
  // - After any terminal, no further events are yielded
  let chunkNo = 0
  let terminalEmitted = false

  for await (const sseEvent of decodeDeepSeekSSE(sseStream)) {
    if (terminalEmitted) break

    if (sseEvent.type === 'json') {
      const events = mapDeepSeekChunkToEvents({
        chunk: sseEvent.value,
        messageId: assistantMessageId,
        chunkNo,
      })
      for (const event of events) {
        if (terminalEmitted) break

        if (event.type === 'stream.done') {
          // Defer: yield stream.done only on SSE [DONE]
        } else if (event.type === 'stream.error') {
          // Terminal error: yield and stop
          yield event
          terminalEmitted = true
        } else {
          yield event
        }
      }
      chunkNo++
    } else if (sseEvent.type === 'done') {
      // SSE [DONE]: emit stream.done if no terminal error occurred
      if (!terminalEmitted) {
        yield { type: 'stream.done' }
        terminalEmitted = true
      }
    } else if (sseEvent.type === 'parse_error') {
      yield {
        type: 'stream.error',
        error: {
          phase: 'sse_decode',
          provider: 'deepseek',
          category: 'protocol',
          message: sseEvent.message,
        } satisfies StarverseProviderError,
        terminal: true,
      }
      terminalEmitted = true
    }
    // comment events are ignored
  }

  // EOF hardening: if stream ended without any terminal event, emit protocol error
  if (!terminalEmitted) {
    yield {
      type: 'stream.error',
      error: {
        phase: 'stream',
        provider: 'deepseek',
        category: 'protocol',
        message: 'Unexpected EOF — no terminal event observed',
      } satisfies StarverseProviderError,
      terminal: true,
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildMessages(request: ProviderStreamRequest): DeepSeekMessage[] {
  const messages: DeepSeekMessage[] = []

  // Context messages (if provided as DeepSeekMessage-compatible)
  if (request.contextMessages) {
    for (const msg of request.contextMessages) {
      if (isDeepSeekMessage(msg)) {
        messages.push(msg)
      }
    }
  }

  // Current user message
  if (request.currentUserContentBlocks && request.currentUserContentBlocks.length > 0) {
    // For now, extract text blocks only (no multimodal in DeepSeek Phase 3)
    const textParts = request.currentUserContentBlocks
      .filter((b) => b.type === 'text')
      .map((b) => (b as any).text)
      .filter((t): t is string => typeof t === 'string')
    messages.push({ role: 'user', content: textParts.join('\n') })
  } else {
    messages.push({ role: 'user', content: request.userText })
  }

  return messages
}

function isDeepSeekMessage(msg: unknown): msg is DeepSeekMessage {
  if (!msg || typeof msg !== 'object') return false
  const role = (msg as any).role
  return role === 'system' || role === 'user' || role === 'assistant' || role === 'tool'
}

async function* mapTransportError(err: any, _messageId: string): AsyncGenerator<StarverseStreamEvent> {
  if (err?.name === 'AbortError') {
    yield {
      type: 'stream.abort',
      reason: 'aborted',
      error: {
        phase: 'abort',
        provider: 'deepseek',
        category: 'aborted',
        message: err?.message ?? 'Request aborted',
      } satisfies StarverseProviderError,
    }
    return
  }

  yield {
    type: 'stream.error',
    error: {
      phase: 'transport',
      provider: 'deepseek',
      category: 'network',
      message: err?.message ?? 'Network error',
    } satisfies StarverseProviderError,
    terminal: true,
  }
}

async function* mapHttpError(response: Response, _messageId: string): AsyncGenerator<StarverseStreamEvent> {
  let errorBody: unknown
  try {
    errorBody = await response.json()
  } catch {
    errorBody = null
  }

  const code = (errorBody as any)?.error?.code ?? `http_${response.status}`
  const message = (errorBody as any)?.error?.message ?? response.statusText

  let category: StarverseProviderError['category'] = 'http'
  if (response.status === 401 || response.status === 403) category = 'auth'
  else if (response.status === 429) category = 'rate_limit'
  else if (response.status === 400) category = 'bad_request'

  yield {
    type: 'stream.error',
    error: {
      phase: 'http',
      provider: 'deepseek',
      category,
      message: String(message),
      code: String(code),
      httpStatus: response.status,
    } satisfies StarverseProviderError,
    terminal: true,
  }
}
