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
import { createAnthropicMessagesNativeContentAccumulator } from '@/next/provider/anthropic/anthropicMessagesNativeContentAccumulator'
import {
  buildAnthropicFinalThinkingDisplayEvents,
  buildAnthropicThinkingDeltaEvents,
  createAnthropicReasoningDisplayAssemblerState,
} from '@/next/provider/anthropic/anthropicReasoningDisplayAssembler'
import {
  ANTHROPIC_ASSISTANT_SNAPSHOT_KEY,
  ANTHROPIC_MESSAGES_SOURCE_API,
  ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY,
  assertFinalAnthropicProviderNativeSnapshot,
  cloneAnthropicNativeContentBlocks,
  normalizeAnthropicNativeContentBlocks,
  type AnthropicProviderNativeSnapshot,
} from '@/next/provider/anthropic/anthropicProviderNativeContent'
import { buildAnthropicUserContent } from '@/next/multimodal/providerRuntimeContentBlocks'

// ---------------------------------------------------------------------------
// Adapter types
// ---------------------------------------------------------------------------

export type AnthropicTransportOptions = Readonly<{
  baseUrl: string
  apiKey: string
  anthropicVersion?: string
  timeoutMs?: number
  captureSerializedRequest?: (serializedBody: string) => void
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

  let body: ReturnType<typeof buildAnthropicRequest>
  try {
    const messages = buildMessages(request)
    const system = extractSystemPrompt(request)
    body = buildAnthropicRequest({
      model: config.model,
      messages,
      config,
      ...(system ? { system } : {}),
    })
  } catch (err) {
    yield mapRequestBuildError(err)
    return
  }

  // Execute transport
  const url = `${transport.baseUrl.replace(/\/$/, '')}/messages`
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': transport.apiKey,
    'anthropic-version': transport.anthropicVersion ?? '2023-06-01',
  }

  let response: Response
  try {
    const serializedBody = JSON.stringify(body)
    try { transport.captureSerializedRequest?.(serializedBody) } catch { /* raw capture is non-fatal */ }
    response = await transport.fetch(url, {
      method: 'POST',
      headers,
      body: serializedBody,
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
  let eventOrdinal = 0
  const nativeAccumulator = createAnthropicMessagesNativeContentAccumulator({
    messageId: assistantMessageId,
  })
  const reasoningDisplayState = createAnthropicReasoningDisplayAssemblerState()

  for await (const sseEvent of decodeAnthropicSSE(sseStream)) {
    if (terminalEmitted) break

    if (sseEvent.type === 'event') {
      const nativeEvents = sseEvent.data?.type === 'error'
        ? nativeAccumulator.finalize('error')
        : nativeAccumulator.ingestEvent(sseEvent.data)
      const mapped = mapAnthropicStreamEventToStarverse(sseEvent.data, assistantMessageId, { eventOrdinal })
      const displayEvents = buildAnthropicThinkingDeltaEvents({
        event: sseEvent.data,
        messageId: assistantMessageId,
        state: reasoningDisplayState,
      })
      const finalNativeSnapshot = readFinalAnthropicNativeSnapshot(nativeEvents)
      const finalDisplayEvents = finalNativeSnapshot
        ? buildAnthropicFinalThinkingDisplayEvents({
            snapshot: finalNativeSnapshot,
            messageId: assistantMessageId,
            state: reasoningDisplayState,
          })
        : []
      eventOrdinal += 1

      const terminalEvents: StarverseStreamEvent[] = []
      for (const event of nativeEvents) {
        yield event
      }
      for (const event of mapped) {
        if (terminalEmitted) break

        if (event.type === 'stream.done' || event.type === 'stream.error') {
          terminalEvents.push(event)
        } else {
          yield event
        }
      }
      for (const event of displayEvents) yield event
      for (const event of finalDisplayEvents) yield event
      for (const event of terminalEvents) {
        yield event
        terminalEmitted = true
      }
    } else if (sseEvent.type === 'done') {
      // Defensive: Anthropic doesn't use [DONE], but handle it
      if (!terminalEmitted) {
        yield { type: 'stream.done' }
        terminalEmitted = true
      }
    } else if (sseEvent.type === 'parse_error') {
      for (const event of nativeAccumulator.finalize('error')) {
        yield event
      }
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
    for (const event of nativeAccumulator.finalize('error')) {
      yield event
    }
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

function readFinalAnthropicNativeSnapshot(events: readonly StarverseStreamEvent[]): AnthropicProviderNativeSnapshot | null {
  for (const event of events) {
    if (event.type !== 'message.provider_native_content_upsert') continue
    const snapshot = event.snapshot
    if (
      snapshot.providerKey === ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY &&
      snapshot.sourceApi === ANTHROPIC_MESSAGES_SOURCE_API &&
      snapshot.snapshotKey === ANTHROPIC_ASSISTANT_SNAPSHOT_KEY &&
      snapshot.status === 'final'
    ) {
      return snapshot as AnthropicProviderNativeSnapshot
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildMessages(request: ProviderStreamRequest): AnthropicMessage[] {
  const messages: AnthropicMessage[] = []

  // Context messages
  if (request.contextMessages) {
    for (const msg of request.contextMessages) {
      const message = buildAnthropicContextMessage(msg)
      if (message) messages.push(message)
    }
  }

  // Current user message
  messages.push({
    role: 'user',
    content: buildAnthropicUserContent(request.userText, request.currentUserContentBlocks),
  })

  validateAnthropicToolBoundary(messages)
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

export class AnthropicNativeHistoryError extends Error {
  constructor(
    readonly code:
      | 'anthropic_native_history_missing'
      | 'anthropic_native_history_not_final'
      | 'anthropic_native_history_unsupported'
      | 'anthropic_tool_continuation_unsupported',
    message: string,
  ) {
    super(message)
    this.name = 'AnthropicNativeHistoryError'
  }
}

function buildAnthropicContextMessage(msg: unknown): AnthropicMessage | null {
  if (!isAnthropicMessage(msg)) return null
  const record = msg as Record<string, unknown>
  if (record.role === 'assistant') {
    if (!isAnthropicAssistantRecord(record)) {
      throw new AnthropicNativeHistoryError(
        'anthropic_native_history_unsupported',
        'Anthropic Messages history cannot include non-Anthropic assistant messages.',
      )
    }
    const snapshot = selectFinalAnthropicNativeSnapshot(record)
    if (!snapshot) {
      throw new AnthropicNativeHistoryError(
        'anthropic_native_history_missing',
        'Anthropic assistant history is missing final native content.',
      )
    }
    return {
      role: 'assistant',
      content: cloneAnthropicNativeContentBlocks(snapshot.content),
    }
  }

  const userContent = normalizeAnthropicContextUserContent(record.content)
  if (userContent === null) return null
  return { role: 'user', content: userContent }
}

function isAnthropicAssistantRecord(record: Record<string, unknown>): boolean {
  const providerId = typeof record.providerId === 'string' ? record.providerId : undefined
  const providerKey = typeof record.providerKey === 'string' ? record.providerKey : undefined
  if (providerId === ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY || providerId === ANTHROPIC_MESSAGES_SOURCE_API) return true
  if (providerKey === ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY || providerKey === ANTHROPIC_MESSAGES_SOURCE_API) return true
  const direct = record.anthropicNativeContent
  if (
    direct &&
    typeof direct === 'object' &&
    (direct as Record<string, unknown>).providerKey === ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY &&
    (direct as Record<string, unknown>).sourceApi === ANTHROPIC_MESSAGES_SOURCE_API
  ) return true
  const raw = record.providerNativeContents
  return Array.isArray(raw) && raw.some((item) =>
    !!item &&
    typeof item === 'object' &&
    (item as Record<string, unknown>).providerKey === ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY &&
    (item as Record<string, unknown>).sourceApi === ANTHROPIC_MESSAGES_SOURCE_API
  )
}

function selectFinalAnthropicNativeSnapshot(record: Record<string, unknown>) {
  if (record.anthropicNativeContent !== undefined) {
    try {
      return assertFinalAnthropicProviderNativeSnapshot(record.anthropicNativeContent)
    } catch {
      throw new AnthropicNativeHistoryError(
        'anthropic_native_history_not_final',
        'Anthropic assistant history contains invalid native content.',
      )
    }
  }
  const raw = record.providerNativeContents
  if (!Array.isArray(raw)) return null
  let sawNonFinal = false
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const candidate = item as Record<string, unknown>
    if (candidate.providerKey !== ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY) continue
    if (candidate.sourceApi !== ANTHROPIC_MESSAGES_SOURCE_API) continue
    if (candidate.snapshotKey !== ANTHROPIC_ASSISTANT_SNAPSHOT_KEY) continue
    if (candidate.status !== 'final') {
      sawNonFinal = true
      continue
    }
    try {
      return assertFinalAnthropicProviderNativeSnapshot(candidate)
    } catch {
      throw new AnthropicNativeHistoryError(
        'anthropic_native_history_not_final',
        'Anthropic assistant history contains invalid native content.',
      )
    }
  }
  if (sawNonFinal) {
    throw new AnthropicNativeHistoryError(
      'anthropic_native_history_not_final',
      'Anthropic assistant history contains non-final native content.',
    )
  }
  return null
}

function normalizeAnthropicContextUserContent(content: unknown): AnthropicMessage['content'] | null {
  if (typeof content === 'string') {
    const text = content.trim()
    return text ? text : null
  }
  if (Array.isArray(content)) {
    const blocks = normalizeAnthropicNativeContentBlocks(content)
    return blocks.length > 0 ? blocks : null
  }
  return null
}

function validateAnthropicToolBoundary(messages: AnthropicMessage[]) {
  for (let index = 0; index < messages.length; index++) {
    const message = messages[index]
    if (message.role === 'user') validateUserToolResultOrder(message)
    if (message.role !== 'assistant') continue
    const toolUseIds = toolUseIdsFromContent(message.content)
    if (toolUseIds.length === 0) continue
    const next = messages[index + 1]
    if (!next || next.role !== 'user') {
      throw new AnthropicNativeHistoryError(
        'anthropic_tool_continuation_unsupported',
        'Anthropic tool_use history requires an immediate user tool_result message.',
      )
    }
    const toolResultIds = toolResultIdsFromContent(next.content)
    if (toolUseIds.some((id) => !toolResultIds.includes(id))) {
      throw new AnthropicNativeHistoryError(
        'anthropic_tool_continuation_unsupported',
        'Anthropic tool_use history is missing a matching user tool_result block.',
      )
    }
  }
}

function validateUserToolResultOrder(message: AnthropicMessage) {
  if (!Array.isArray(message.content)) return
  let sawNonToolResult = false
  for (const block of message.content) {
    if (block.type === 'tool_result') {
      if (sawNonToolResult) {
        throw new AnthropicNativeHistoryError(
          'anthropic_tool_continuation_unsupported',
          'Anthropic user tool_result blocks must precede all other user content blocks.',
        )
      }
      continue
    }
    sawNonToolResult = true
  }
}

function toolUseIdsFromContent(content: AnthropicMessage['content']): string[] {
  if (!Array.isArray(content)) return []
  return content
    .filter((block) => block.type === 'tool_use' && typeof block.id === 'string' && block.id.length > 0)
    .map((block) => String(block.id))
}

function toolResultIdsFromContent(content: AnthropicMessage['content']): string[] {
  if (!Array.isArray(content)) return []
  return content
    .filter((block) => block.type === 'tool_result' && typeof block.tool_use_id === 'string' && block.tool_use_id.length > 0)
    .map((block) => String(block.tool_use_id))
}

function mapRequestBuildError(err: unknown): StarverseStreamEvent {
  if (err instanceof AnthropicNativeHistoryError) {
    return {
      type: 'stream.error',
      error: {
        phase: 'request_build',
        provider: 'anthropic',
        category: 'bad_request',
        code: err.code,
        message: err.message,
      },
      terminal: true,
    }
  }
  return {
    type: 'stream.error',
    error: {
      phase: 'request_build',
      provider: 'anthropic',
      category: 'bad_request',
      code: 'anthropic_request_build_failed',
      message: err instanceof Error ? err.message : 'Anthropic Messages request build failed.',
      raw: err instanceof Error ? { name: err.name } : undefined,
    },
    terminal: true,
  }
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
