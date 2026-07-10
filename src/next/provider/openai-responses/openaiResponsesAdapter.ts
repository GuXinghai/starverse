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

import type { ProviderStreamRequest, StarverseProviderError, StarverseStreamEvent } from '@/next/provider/providerTypes'
import type { RuntimeProviderStreamAdapter } from '@/next/provider/runtimeProviderAdapter'
import { buildResponsesRequest, type ResponsesInputMessage } from '@/next/provider/openai-responses/openaiResponsesRequestBuilder'
import { decodeResponsesSSE } from '@/next/provider/openai-responses/openaiResponsesSseDecoder'
import {
  mapOpenAIResponsesEventToStarverse,
  type OpenAIResponsesReasoningSummaryDedupeState,
} from '@/next/provider/openai-responses/openaiResponsesStreamMapper'
import { createOpenAIResponsesReasoningDisplayAssemblerState } from '@/next/provider/openai-responses/openaiResponsesReasoningDisplayAssembler'
import { buildOpenAIResponsesUserContent } from '@/next/multimodal/providerRuntimeContentBlocks'
import { buildNetworkErrorEnvelope } from '@/shared/network/networkErrorEnvelope'

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
        phase: 'transport',
        provider: 'openai-responses',
        category: 'protocol',
        message: 'Response body is null',
      } satisfies StarverseProviderError,
      terminal: true,
    }
    return
  }

  // Stream SSE → events → StarverseStreamEvent
  // Terminal coordination: exactly one terminal outcome
  let terminalEmitted = false
  const emittedImageUrls = new Set<string>()
  const reasoningSummaryDedupe: OpenAIResponsesReasoningSummaryDedupeState = {
    ...createOpenAIResponsesReasoningDisplayAssemblerState(),
  }
  let eventOrdinal = 0

  for await (const sseEvent of decodeResponsesSSE(sseStream)) {
    if (terminalEmitted) break

    if (sseEvent.type === 'event') {
      logOpenAIResponsesProviderErrorEvent({
        request,
        event: sseEvent.data,
      })
      const mapped = mapOpenAIResponsesEventToStarverse(sseEvent.data, assistantMessageId, {
        eventOrdinal,
        reasoningSummaryDedupe,
      })
      eventOrdinal += 1
      for (const event of mapped) {
        if (terminalEmitted) break
        if (isDuplicateImageContentBlock(event, emittedImageUrls)) continue

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
          phase: 'stream',
          provider: 'openai-responses',
          category: 'protocol',
          message: sseEvent.message,
        } satisfies StarverseProviderError,
        terminal: true,
      }
      terminalEmitted = true
    }
    // comment events are ignored
  }

  // Fallback: if stream ended without [DONE] and no terminal was emitted
  if (!terminalEmitted) {
    yield {
      type: 'stream.error',
      error: {
        phase: 'stream',
        provider: 'openai-responses',
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

function buildMessages(request: ProviderStreamRequest): ResponsesInputMessage[] {
  const messages: ResponsesInputMessage[] = []

  // Context messages
  if (request.contextMessages) {
    for (const msg of request.contextMessages) {
      const normalized = normalizeResponsesMessage(msg)
      if (normalized) messages.push(normalized)
    }
  }

  // Current user message
  messages.push({
    role: 'user',
    content: buildOpenAIResponsesUserContent(request.userText, request.currentUserContentBlocks),
  })

  return messages
}

function normalizeResponsesMessage(msg: unknown): ResponsesInputMessage | null {
  if (!msg || typeof msg !== 'object') return null
  const role = (msg as any).role
  if (role !== 'system' && role !== 'user' && role !== 'assistant' && role !== 'developer') return null
  const content = normalizeResponsesMessageContent(msg as Record<string, unknown>)
  const type = (msg as any).type
  if (content == null) return null
  return {
    role,
    content,
    ...(type === 'message' ? { type } : {}),
  }
}

function normalizeResponsesMessageContent(msg: Record<string, unknown>): ResponsesInputMessage['content'] | null {
  const content = msg.content
  if (typeof content === 'string' || Array.isArray(content)) return content as ResponsesInputMessage['content']
  if (typeof msg.contentText === 'string') return msg.contentText
  const blocks = msg.contentBlocks
  if (!Array.isArray(blocks)) return null
  const text = blocks
    .filter((block) => block && typeof block === 'object' && (block as any).type === 'text')
    .map((block) => String((block as any).text ?? ''))
    .join('')
  return text.length > 0 ? text : null
}

function isDuplicateImageContentBlock(event: StarverseStreamEvent, emittedImageUrls: Set<string>): boolean {
  if (event.type !== 'message.content_block_append') return false
  const block = event.block as Record<string, unknown>
  if (block.type !== 'image' || typeof block.url !== 'string') return false
  if (emittedImageUrls.has(block.url)) return true
  emittedImageUrls.add(block.url)
  return false
}

async function* mapTransportError(err: any): AsyncGenerator<StarverseStreamEvent> {
  if (err?.name === 'AbortError') {
    yield {
      type: 'stream.abort',
      reason: 'aborted',
      error: {
        phase: 'abort',
        provider: 'openai-responses',
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
      provider: 'openai-responses',
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

  logOpenAIResponsesHttpError({
    status: response.status,
    statusText: response.statusText,
    body: errorBody,
  })

  const code = (errorBody as any)?.error?.code ?? `http_${response.status}`
  const message = (errorBody as any)?.error?.message ?? response.statusText
  const providerDiagnostic = buildOpenAIResponsesProviderDiagnostic({
    status: response.status,
    statusText: response.statusText,
    body: errorBody,
  })
  const networkError = buildNetworkErrorEnvelope({
    requestPurpose: 'provider_stream',
    providerId: 'openai_responses',
    transportKind: 'electron_session_fetch',
    httpStatus: response.status,
    providerCode: code,
    providerMessage: message,
  })

  const category: StarverseProviderError['category'] =
    response.status === 401 ? 'auth' :
    response.status === 429 ? 'rate_limit' :
    response.status >= 400 && response.status < 500 ? 'bad_request' :
    'http'

  yield {
    type: 'stream.error',
    error: {
      phase: 'http',
      provider: 'openai-responses',
      category,
      message: String(message),
      code: String(code),
      httpStatus: response.status,
      networkError,
      raw: providerDiagnostic,
    } satisfies StarverseProviderError,
    terminal: true,
  }
}

function logOpenAIResponsesHttpError(input: Readonly<{
  status: number
  statusText: string
  body: unknown
}>): void {
  console.warn('[openai-responses][http-error-raw]', {
    status: input.status,
    statusText: input.statusText,
    body: redactOpenAIResponsesDiagnosticValue(input.body),
    rawJson: stringifyOpenAIResponsesDiagnosticJson(redactOpenAIResponsesDiagnosticValue(input.body)),
  })
}

function logOpenAIResponsesProviderErrorEvent(input: Readonly<{
  request: ProviderStreamRequest
  event: unknown
}>): void {
  if (!input.event || typeof input.event !== 'object') return
  const record = input.event as Record<string, unknown>
  const type = typeof record.type === 'string' ? record.type : ''
  if (type !== 'error' && type !== 'response.failed' && type !== 'response.incomplete') return

  console.warn('[openai-responses][stream-error-raw]', {
    requestId: input.request.requestId,
    assistantMessageId: input.request.assistantMessageId,
    model: input.request.config.model,
    type,
    event: input.event,
    rawJson: stringifyOpenAIResponsesDiagnosticJson(input.event),
  })
}

function stringifyOpenAIResponsesDiagnosticJson(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

function buildOpenAIResponsesProviderDiagnostic(input: Readonly<{
  status: number
  statusText: string
  body: unknown
}>): Record<string, unknown> {
  const body = redactOpenAIResponsesDiagnosticValue(input.body)
  return {
    provider: 'openai-responses',
    httpStatus: input.status,
    statusText: input.statusText,
    body,
    rawJson: stringifyOpenAIResponsesDiagnosticJson(body),
  }
}

function redactOpenAIResponsesDiagnosticValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return null
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactOpenAIResponsesDiagnosticString(value)
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.slice(0, 80).map((item) => redactOpenAIResponsesDiagnosticValue(item, depth + 1))
  if (typeof value !== 'object') return String(value)

  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
    const normalizedKey = key.toLowerCase()
    if (
      normalizedKey.includes('authorization') ||
      normalizedKey.includes('api_key') ||
      normalizedKey.includes('apikey') ||
      normalizedKey.includes('access_token') ||
      normalizedKey.includes('client_secret')
    ) {
      out[key] = '[REDACTED]'
      continue
    }
    out[key] = redactOpenAIResponsesDiagnosticValue(item, depth + 1)
  }
  return out
}

function redactOpenAIResponsesDiagnosticString(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9._-]+/g, 'sk-[REDACTED]')
    .replace(/([?&](?:key|api_key|token|access_token|client_secret)=)[^&\s]+/gi, '$1[REDACTED]')
}
