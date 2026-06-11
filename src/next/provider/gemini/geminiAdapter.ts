/**
 * Gemini API RuntimeProviderAdapter — Phase 9 integration.
 *
 * Accepts a provider-neutral request, builds a Gemini generateContent request body,
 * executes transport via an injectable fetch function, decodes SSE via the
 * Gemini-local decoder, maps events through mapGeminiStreamChunkToStarverse,
 * and yields StarverseStreamEvent.
 *
 * Terminal coordination:
 * - finishReason yields exactly one final stream.done
 * - error yields exactly one terminal stream.error
 * - No events after terminal outcome
 *
 * @see https://ai.google.dev/api/generate-content
 */

import type { ProviderStreamRequest, StarverseStreamEvent, StarverseProviderError } from '@/next/provider/providerTypes'
import type { RuntimeProviderStreamAdapter } from '@/next/provider/runtimeProviderAdapter'
import { buildGeminiRequest, type GeminiContent } from '@/next/provider/gemini/geminiRequestBuilder'
import { decodeGeminiSSE } from '@/next/provider/gemini/geminiSseDecoder'
import { mapGeminiStreamChunkToStarverse } from '@/next/provider/gemini/geminiStreamMapper'

// ---------------------------------------------------------------------------
// Adapter types
// ---------------------------------------------------------------------------

export type GeminiTransportOptions = Readonly<{
  baseUrl: string
  apiKey: string
  model?: string
  timeoutMs?: number
}>

export type GeminiFetchFn = (
  url: string,
  init: RequestInit,
) => Promise<Response>

// ---------------------------------------------------------------------------
// streamViaGemini — main adapter entry point
// ---------------------------------------------------------------------------

/**
 * Execute a Gemini generateContent stream.
 *
 * @param request - Provider-neutral stream request
 * @param transport - Transport options and injectable fetch function
 * @yields StarverseStreamEvent — provider-neutral stream events
 */
export const streamViaGemini: RuntimeProviderStreamAdapter = async function* streamViaGemini(
  request: ProviderStreamRequest,
  transport: GeminiTransportOptions & { fetch: GeminiFetchFn },
): AsyncGenerator<StarverseStreamEvent> {
  const { assistantMessageId, config, signal } = request

  // Build messages from request
  const messages = buildMessages(request)
  const systemInstruction = extractSystemPrompt(request)

  // Build Gemini request body
  const body = buildGeminiRequest({
    model: config.model,
    messages,
    config,
    ...(systemInstruction ? { systemInstruction } : {}),
  })

  // Execute transport
  // Gemini uses streamGenerateContent endpoint with SSE
  const model = config.model
  const url = `${transport.baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:streamGenerateContent?alt=sse`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-goog-api-key': transport.apiKey,
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
        phase: 'stream',
        provider: 'gemini',
        category: 'protocol',
        message: 'Response body is null',
      },
      terminal: true,
    }
    return
  }

  // Stream SSE → chunks → StarverseStreamEvent
  // Terminal coordination: exactly one terminal outcome
  let terminalEmitted = false

  for await (const sseEvent of decodeGeminiSSE(sseStream)) {
    if (terminalEmitted) break

    if (sseEvent.type === 'chunk') {
      const mapped = mapGeminiStreamChunkToStarverse(sseEvent.data, assistantMessageId)
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
      // Defensive: Gemini doesn't typically use [DONE], but handle it
      if (!terminalEmitted) {
        yield { type: 'stream.done' }
        terminalEmitted = true
      }
    } else if (sseEvent.type === 'parse_error') {
      yield {
        type: 'stream.error',
        error: {
          phase: 'stream',
          provider: 'gemini',
          category: 'protocol',
          message: sseEvent.message,
        },
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
        provider: 'gemini',
        category: 'protocol',
        message: 'Unexpected end of stream',
      },
      terminal: true,
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildMessages(request: ProviderStreamRequest): GeminiContent[] {
  const messages: GeminiContent[] = []

  // Context messages
  if (request.contextMessages) {
    for (const msg of request.contextMessages) {
      if (isGeminiContent(msg)) {
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
    messages.push({ role: 'user', parts: textParts.map((t) => ({ text: t })) })
  } else {
    messages.push({ role: 'user', parts: [{ text: request.userText }] })
  }

  return messages
}

function extractSystemPrompt(request: ProviderStreamRequest): string | undefined {
  if (request.contextMessages) {
    for (const msg of request.contextMessages) {
      if (msg && typeof msg === 'object' && (msg as any).role === 'system') {
        const content = (msg as any).content
        return typeof content === 'string' ? content : undefined
      }
    }
  }
  return undefined
}

function isGeminiContent(msg: unknown): msg is GeminiContent {
  if (!msg || typeof msg !== 'object') return false
  const role = (msg as any).role
  return (role === 'user' || role === 'model') && Array.isArray((msg as any).parts)
}

async function* mapTransportError(err: any): AsyncGenerator<StarverseStreamEvent> {
  if (err?.name === 'AbortError') {
    yield {
      type: 'stream.abort',
      reason: 'aborted',
      error: {
        phase: 'abort',
        provider: 'gemini',
        category: 'aborted',
        message: err?.message ?? 'Request aborted',
      },
    }
    return
  }

  yield {
    type: 'stream.error',
    error: {
      phase: 'transport',
      provider: 'gemini',
      category: 'network',
      message: err?.message ?? 'Network error',
    },
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
  const code = error?.code ?? `http_${response.status}`
  const message = error?.message ?? response.statusText

  const category: StarverseProviderError['category'] =
    response.status === 401 || response.status === 403
      ? 'auth'
      : response.status === 429
        ? 'rate_limit'
        : response.status >= 400 && response.status < 500
          ? 'bad_request'
          : 'http'

  yield {
    type: 'stream.error',
    error: {
      phase: 'http',
      provider: 'gemini',
      category,
      message: String(message),
      code: String(code),
      httpStatus: response.status,
      raw: errorBody,
    },
    terminal: true,
  }
}
