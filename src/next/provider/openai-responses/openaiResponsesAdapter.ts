/**
 * OpenAI Responses RuntimeProviderAdapter — Phase 5 integration.
 *
 * Accepts a provider-neutral request, builds an OpenAI Responses API request body,
 * executes transport via an injectable fetch function, decodes SSE via the
 * Responses-local decoder, maps events through mapOpenAIResponsesEventToStarverse,
 * and yields StarverseStreamEvent.
 *
 * Terminal coordination:
 * - response.completed yields exactly one final stream.done
 * - response.failed / response.incomplete / top-level error yields terminal stream.error
 * - No events after terminal outcome
 *
 * @see docs/architecture/provider-architecture/STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md §4.2
 */

import type { ProviderStreamRequest, StarverseStreamEvent } from '@/next/provider/providerTypes'
import type { RuntimeProviderStreamAdapter } from '@/next/provider/runtimeProviderAdapter'
import { buildResponsesRequest, type ResponsesInputMessage } from '@/next/provider/openai-responses/openaiResponsesRequestBuilder'
import { decodeResponsesSSE } from '@/next/provider/openai-responses/openaiResponsesSseDecoder'
import { mapOpenAIResponsesEventToStarverse } from '@/next/provider/openai-responses/openaiResponsesStreamMapper'

// ---------------------------------------------------------------------------
// Adapter types
// ---------------------------------------------------------------------------

export type ResponsesTransportOptions = Readonly<{
  baseUrl: string
  apiKey: string
  timeoutMs?: number
}>

export type ResponsesFetchFn = (
  url: string,
  init: RequestInit,
) => Promise<Response>

// ---------------------------------------------------------------------------
// streamViaOpenAIResponses — main adapter entry point
// ---------------------------------------------------------------------------

/**
 * Execute an OpenAI Responses stream.
 *
 * @param request - Provider-neutral stream request
 * @param transport - Transport options and injectable fetch function
 * @yields StarverseStreamEvent — provider-neutral stream events
 */
export const streamViaOpenAIResponses: RuntimeProviderStreamAdapter = async function* streamViaOpenAIResponses(
  request: ProviderStreamRequest,
  transport: ResponsesTransportOptions & { fetch: ResponsesFetchFn },
): AsyncGenerator<StarverseStreamEvent> {
  const { assistantMessageId, config, signal } = request

  // Build messages from request
  const messages = buildMessages(request)

  // Build Responses request body
  const body = buildResponsesRequest({
    model: config.model,
    messages,
    config,
  })

  // Execute transport
  const url = `${transport.baseUrl.replace(/\/$/, '')}/responses`
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
        phase: 'mid_stream',
        completionClass: 'error',
        openrouter: { code: 'no_body', message: 'Response body is null' },
        truncated: false,
      } as any,
      terminal: true,
    }
    return
  }

  // Stream SSE → events → StarverseStreamEvent
  // Terminal coordination: exactly one terminal outcome
  let terminalEmitted = false

  for await (const sseEvent of decodeResponsesSSE(sseStream)) {
    if (terminalEmitted) break

    if (sseEvent.type === 'event') {
      const mapped = mapOpenAIResponsesEventToStarverse(sseEvent.data, assistantMessageId)
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
      // SSE [DONE]: if no terminal was emitted yet, emit stream.done
      if (!terminalEmitted) {
        yield { type: 'stream.done' }
        terminalEmitted = true
      }
    } else if (sseEvent.type === 'parse_error') {
      yield {
        type: 'stream.error',
        error: {
          phase: 'mid_stream',
          completionClass: 'error',
          openrouter: { code: 'protocol_invalid', message: sseEvent.message },
          truncated: false,
        } as any,
        terminal: true,
      }
      terminalEmitted = true
    }
    // comment events are ignored
  }

  // Fallback: if stream ended without [DONE] and no terminal was emitted
  if (!terminalEmitted) {
    yield { type: 'stream.done' }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildMessages(request: ProviderStreamRequest): ResponsesInputMessage[] {
  const messages: ResponsesInputMessage[] = []

  // Context messages
  if (request.contextMessages) {
    for (const msg of request.contextMessages) {
      if (isResponsesMessage(msg)) {
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

function isResponsesMessage(msg: unknown): msg is ResponsesInputMessage {
  if (!msg || typeof msg !== 'object') return false
  const role = (msg as any).role
  return role === 'system' || role === 'user' || role === 'assistant' || role === 'developer'
}

async function* mapTransportError(err: any): AsyncGenerator<StarverseStreamEvent> {
  if (err?.name === 'AbortError') {
    yield {
      type: 'stream.abort',
      reason: 'aborted',
      envelope: {
        phase: 'pre_stream',
        completionClass: 'aborted',
        openrouter: { code: 'aborted' },
        truncated: false,
        kind: 'aborted',
      } as any,
    }
    return
  }

  yield {
    type: 'stream.error',
    error: {
      phase: 'pre_stream',
      completionClass: 'error',
      openrouter: {
        code: 'network_unreachable',
        message: err?.message ?? 'Network error',
      },
      truncated: false,
    } as any,
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

  const code = (errorBody as any)?.error?.code ?? `http_${response.status}`
  const message = (errorBody as any)?.error?.message ?? response.statusText

  yield {
    type: 'stream.error',
    error: {
      phase: 'pre_stream',
      completionClass: 'error',
      openrouter: {
        code: String(code),
        message: String(message),
      },
      http: { status: response.status, statusText: response.statusText },
      truncated: false,
    } as any,
    terminal: true,
  }
}
