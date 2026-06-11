/**
 * Anthropic Messages RuntimeProviderAdapter — Phase 7 integration.
 *
 * Accepts a provider-neutral request, builds an Anthropic Messages API request body,
 * executes transport via an injectable fetch function, decodes SSE via the
 * Anthropic-local decoder, maps events through mapAnthropicStreamEventToStarverse,
 * and yields StarverseStreamEvent.
 *
 * Terminal coordination:
 * - message_stop yields exactly one final stream.done
 * - error yields exactly one terminal stream.error
 * - No events after terminal outcome
 *
 * @see docs/architecture/provider-architecture/STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md §4.4
 */

import type { ProviderStreamRequest, StarverseProviderError, StarverseStreamEvent } from '@/next/provider/providerTypes'
import type { RuntimeProviderStreamAdapter } from '@/next/provider/runtimeProviderAdapter'
import { buildAnthropicRequest, type AnthropicMessage } from '@/next/provider/anthropic/anthropicRequestBuilder'
import { decodeAnthropicSSE } from '@/next/provider/anthropic/anthropicSseDecoder'
import { mapAnthropicStreamEventToStarverse } from '@/next/provider/anthropic/anthropicStreamMapper'

// ---------------------------------------------------------------------------
// Adapter types
// ---------------------------------------------------------------------------

export type AnthropicTransportOptions = Readonly<{
  baseUrl: string
  apiKey: string
  anthropicVersion?: string
  timeoutMs?: number
}>

export type AnthropicFetchFn = (
  url: string,
  init: RequestInit,
) => Promise<Response>

// ---------------------------------------------------------------------------
// streamViaAnthropic — main adapter entry point
// ---------------------------------------------------------------------------

/**
 * Execute an Anthropic Messages stream.
 *
 * @param request - Provider-neutral stream request
 * @param transport - Transport options and injectable fetch function
 * @yields StarverseStreamEvent — provider-neutral stream events
 */
export const streamViaAnthropic: RuntimeProviderStreamAdapter = async function* streamViaAnthropic(
  request: ProviderStreamRequest,
  transport: AnthropicTransportOptions & { fetch: AnthropicFetchFn },
): AsyncGenerator<StarverseStreamEvent> {
  const { assistantMessageId, config, signal } = request

  // Build messages from request
  const messages = buildMessages(request)
  const system = extractSystemPrompt(request)

  // Build Anthropic request body
  const body = buildAnthropicRequest({
    model: config.model,
    messages,
    config,
    ...(system ? { system } : {}),
  })

  // Execute transport
  const url = `${transport.baseUrl.replace(/\/$/, '')}/messages`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': transport.apiKey,
    'anthropic-version': transport.anthropicVersion ?? '2023-06-01',
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
    yield* mapTransportError(err)
    return
  }

  if (!response.ok) {
    yield* mapHttpError(response)
    return
  }

  // Decode SSE stream
  const sseStream = response.body
  if (!sseStream) {
    yield {
      type: 'stream.error',
      error: {
        phase: 'transport',
        provider: 'anthropic',
        category: 'network',
        message: 'Response body is null',
      } satisfies StarverseProviderError,
      terminal: true,
    }
    return
  }

  // Stream SSE → events → StarverseStreamEvent
  // Terminal coordination: exactly one terminal outcome
  let terminalEmitted = false

  for await (const sseEvent of decodeAnthropicSSE(sseStream)) {
    if (terminalEmitted) break

    if (sseEvent.type === 'event') {
      const mapped = mapAnthropicStreamEventToStarverse(sseEvent.data, assistantMessageId)
      for (const event of mapped) {
        if (terminalEmitted) break

        if (event.type === 'stream.done' || event.type === 'stream.error') {
          yield event
          terminalEmitted = true
        } else {
          yield event
        }
      }
    } else if (sseEvent.type === 'done') {
      // Defensive: Anthropic doesn't use [DONE], but handle it
      if (!terminalEmitted) {
        yield { type: 'stream.done' }
        terminalEmitted = true
      }
    } else if (sseEvent.type === 'parse_error') {
      yield {
        type: 'stream.error',
        error: {
          phase: 'sse_decode',
          provider: 'anthropic',
          category: 'protocol',
          message: sseEvent.message,
        } satisfies StarverseProviderError,
        terminal: true,
      }
      terminalEmitted = true
    }
    // comment events are ignored
  }

  // Fallback: if stream ended without terminal
  if (!terminalEmitted) {
    yield {
      type: 'stream.error',
      error: {
        phase: 'stream',
        provider: 'anthropic',
        category: 'protocol',
        message: 'Unexpected end of stream',
      } satisfies StarverseProviderError,
      terminal: true,
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildMessages(request: ProviderStreamRequest): AnthropicMessage[] {
  const messages: AnthropicMessage[] = []

  // Context messages
  if (request.contextMessages) {
    for (const msg of request.contextMessages) {
      if (isAnthropicMessage(msg)) {
        messages.push(msg)
      }
    }
  }

  // Current user message
  if (request.currentUserContentBlocks && request.currentUserContentBlocks.length > 0) {
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

function extractSystemPrompt(request: ProviderStreamRequest): string | undefined {
  // Look for system message in context messages
  if (request.contextMessages) {
    for (const msg of request.contextMessages) {
      if (msg && typeof msg === 'object' && (msg as any).role === 'system') {
        return typeof (msg as any).content === 'string' ? (msg as any).content : undefined
      }
    }
  }
  return undefined
}

function isAnthropicMessage(msg: unknown): msg is AnthropicMessage {
  if (!msg || typeof msg !== 'object') return false
  const role = (msg as any).role
  return role === 'user' || role === 'assistant'
}

async function* mapTransportError(err: any): AsyncGenerator<StarverseStreamEvent> {
  if (err?.name === 'AbortError') {
    yield {
      type: 'stream.abort',
      reason: 'aborted',
      error: {
        phase: 'abort',
        provider: 'anthropic',
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
      provider: 'anthropic',
      category: 'network',
      message: err?.message ?? 'Network error',
    } satisfies StarverseProviderError,
    terminal: true,
  }
}

async function* mapHttpError(response: Response): AsyncGenerator<StarverseStreamEvent> {
  let errorBody: unknown
  try {
    errorBody = await response.json()
  } catch {
    errorBody = null
  }

  const error = (errorBody as any)?.error
  const code = error?.type ?? `http_${response.status}`
  const message = error?.message ?? response.statusText

  yield {
    type: 'stream.error',
    error: {
      phase: 'http',
      provider: 'anthropic',
      category: response.status === 401 ? 'auth'
        : response.status === 429 ? 'rate_limit'
        : response.status === 400 ? 'bad_request'
        : 'http',
      message: String(message),
      code: String(code),
      httpStatus: response.status,
      raw: errorBody,
    } satisfies StarverseProviderError,
    terminal: true,
  }
}
