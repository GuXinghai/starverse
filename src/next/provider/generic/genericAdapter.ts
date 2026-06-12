/**
 * Generic OpenAI-compatible Chat Completions adapter — fixture integration.
 *
 * Conservative capability: text chat + basic streaming + basic error.
 * Unsupported by default: tools, files, vision, reasoning, web search,
 * structured output, image generation, parallel tool calls, multimodal.
 */

import type { ProviderStreamRequest, StarverseStreamEvent, StarverseProviderError } from '@/next/provider/providerTypes'
import type { RuntimeProviderStreamAdapter, ProviderStreamTransport } from '@/next/provider/runtimeProviderAdapter'
import { buildGenericRequest, type GenericMessage } from '@/next/provider/generic/genericRequestBuilder'
import { decodeGenericSSE } from '@/next/provider/generic/genericSseDecoder'
import {
  createBearerCredential,
  buildAuthHeader,
  isCredentialError,
} from '@/next/provider/credentials/providerCredential'

export type GenericFetchFn = (url: string, init: RequestInit) => Promise<Response>

export const streamViaGeneric: RuntimeProviderStreamAdapter = async function* streamViaGeneric(
  request: ProviderStreamRequest,
  transport: ProviderStreamTransport,
): AsyncGenerator<StarverseStreamEvent> {
  const { assistantMessageId, config, signal } = request

  // Credential boundary: create and validate credential from transport
  const cred = createBearerCredential(transport.apiKey)
  if (isCredentialError(cred)) {
    yield {
      type: 'stream.error',
      error: {
        phase: 'transport',
        provider: 'generic',
        category: 'auth',
        message: cred.message,
        code: cred.code,
      } satisfies StarverseProviderError,
      terminal: true,
    }
    return
  }

  const authHeader = buildAuthHeader(cred)
  if (isCredentialError(authHeader)) {
    yield {
      type: 'stream.error',
      error: {
        phase: 'transport',
        provider: 'generic',
        category: 'auth',
        message: authHeader.message,
        code: authHeader.code,
      } satisfies StarverseProviderError,
      terminal: true,
    }
    return
  }

  const messages = buildMessages(request)
  const body = buildGenericRequest({ model: config.model, messages, config })

  const url = `${transport.baseUrl.replace(/\/$/, '')}/chat/completions`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...authHeader,
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

  const sseStream = response.body
  if (!sseStream) {
    yield {
      type: 'stream.error',
      error: {
        phase: 'transport',
        provider: 'generic',
        category: 'protocol',
        message: 'Response body is null',
      } satisfies StarverseProviderError,
      terminal: true,
    }
    return
  }

  let terminalEmitted = false

  for await (const sseEvent of decodeGenericSSE(sseStream)) {
    if (terminalEmitted) break

    if (sseEvent.type === 'chunk') {
      const chunk = sseEvent.data

      // Error in chunk
      if (chunk.error) {
        yield {
          type: 'stream.error',
          error: {
            phase: 'provider',
            provider: 'generic',
            category: 'provider_error',
            message: chunk.error.message ?? 'Provider error',
            code: String(chunk.error.code ?? chunk.error.type ?? 'error'),
          } satisfies StarverseProviderError,
          terminal: true,
        }
        terminalEmitted = true
        break
      }

      // Process choices
      const choices = chunk.choices
      if (choices && choices.length > 0) {
        const choice = choices[0]
        const delta = choice.delta

        // Text content — only non-empty string content becomes visible text
        if (delta?.content && typeof delta.content === 'string' && delta.content.length > 0) {
          yield {
            type: 'message.text_delta',
            messageId: assistantMessageId,
            choiceIndex: 0,
            text: delta.content,
          }
        }

        // tool_calls / function_call / reasoning_content in delta — ignored (conservative)
        // role-only delta — ignored

        // Finish reason
        if (choice.finish_reason) {
          yield {
            type: 'meta.delta',
            meta: {
              finish_reason: normalizeFinishReason(choice.finish_reason),
              native_finish_reason: choice.finish_reason,
            },
          }
        }
      }

      // Usage
      if (chunk.usage) {
        yield { type: 'usage.delta', usage: chunk.usage }
      }
    } else if (sseEvent.type === 'done') {
      if (!terminalEmitted) {
        yield { type: 'stream.done' }
        terminalEmitted = true
      }
    } else if (sseEvent.type === 'parse_error') {
      yield {
        type: 'stream.error',
        error: {
          phase: 'sse_decode',
          provider: 'generic',
          category: 'protocol',
          message: sseEvent.message,
        } satisfies StarverseProviderError,
        terminal: true,
      }
      terminalEmitted = true
    }
  }

  // EOF hardening
  if (!terminalEmitted) {
    yield {
      type: 'stream.error',
      error: {
        phase: 'stream',
        provider: 'generic',
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

function buildMessages(request: ProviderStreamRequest): GenericMessage[] {
  const messages: GenericMessage[] = []

  if (request.contextMessages) {
    for (const msg of request.contextMessages) {
      if (isGenericMessage(msg)) {
        messages.push(msg)
      }
    }
  }

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

function isGenericMessage(msg: unknown): msg is GenericMessage {
  if (!msg || typeof msg !== 'object') return false
  const role = (msg as any).role
  return (role === 'system' || role === 'user' || role === 'assistant') && typeof (msg as any).content === 'string'
}

const KNOWN_FINISH_REASONS = new Set(['stop', 'length', 'tool_calls', 'content_filter', 'function_call'])

function normalizeFinishReason(native: string): string {
  return KNOWN_FINISH_REASONS.has(native) ? native : 'unknown'
}

async function* mapTransportError(err: any): AsyncGenerator<StarverseStreamEvent> {
  if (err?.name === 'AbortError') {
    yield {
      type: 'stream.abort',
      reason: 'aborted',
      error: {
        phase: 'abort',
        provider: 'generic',
        category: 'aborted',
        message: err?.reason?.toString() ?? 'aborted',
      } satisfies StarverseProviderError,
    }
    return
  }

  yield {
    type: 'stream.error',
    error: {
      phase: 'transport',
      provider: 'generic',
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

  const errorObj = (errorBody as any)?.error
  const code = typeof errorObj?.code === 'string' ? errorObj.code : String(response.status)
  const message = typeof errorObj?.message === 'string' ? errorObj.message : response.statusText

  const category = response.status === 401
    ? 'auth' as const
    : response.status === 429
      ? 'rate_limit' as const
      : response.status >= 400 && response.status < 500
        ? 'bad_request' as const
        : 'http' as const

  yield {
    type: 'stream.error',
    error: {
      phase: 'http',
      provider: 'generic',
      category,
      message,
      code,
      httpStatus: response.status,
    } satisfies StarverseProviderError,
    terminal: true,
  }
}
