/**
 * Anthropic SSE decoder — local to Anthropic provider.
 *
 * Parses Server-Sent Events from Anthropic Messages API streaming format.
 * Anthropic uses event-name-prefixed SSE:
 *
 *   event: message_start
 *   data: {"type":"message_start","message":{...}}
 *
 * This is the same wire format as OpenAI Responses.
 * This decoder does NOT import or modify OpenRouter, DeepSeek, or OpenAI decoders.
 */

import type { AnthropicStreamEvent } from '@/next/provider/anthropic/anthropicStreamMapper'

// ---------------------------------------------------------------------------
// Decoded event types
// ---------------------------------------------------------------------------

export type AnthropicSSEEvent =
  | { type: 'event'; eventType: string; data: AnthropicStreamEvent; raw: string }
  | { type: 'done' }
  | { type: 'comment'; text: string }
  | { type: 'parse_error'; message: string; raw: string }

// ---------------------------------------------------------------------------
// decodeAnthropicSSE — async generator
// ---------------------------------------------------------------------------

/**
 * Decode SSE text into Anthropic SSE events.
 *
 * Accepts ReadableStream<Uint8Array>, AsyncIterable<Uint8Array>, or string.
 *
 * Handles:
 * - `event: X` lines → event type name
 * - `data: {...}` lines → JSON payload
 * - `data: [DONE]` → done signal (not used by Anthropic, but handled defensively)
 * - `: comment` lines → comments
 * - Blank lines → flush accumulated event
 * - JSON parse errors → parse_error
 */
export async function* decodeAnthropicSSE(
  input: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | string,
): AsyncGenerator<AnthropicSSEEvent> {
  if (typeof input === 'string') {
    yield* parseAnthropicSSEText(input)
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  for await (const chunk of input as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    const { events, remainder } = flushAnthropicBuffer(buffer)
    for (const event of events) {
      yield event
    }
    buffer = remainder
  }

  buffer += decoder.decode()
  if (buffer.trim().length > 0) {
    const { events } = flushAnthropicBuffer(buffer + '\n\n')
    for (const event of events) {
      yield event
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: text parser
// ---------------------------------------------------------------------------

function* parseAnthropicSSEText(text: string): Generator<AnthropicSSEEvent> {
  const lines = text.split('\n')
  let currentEventType: string | undefined
  const dataLines: string[] = []

  for (const line of lines) {
    if (line === '') {
      yield* flush(currentEventType, dataLines)
      currentEventType = undefined
      dataLines.length = 0
      continue
    }

    if (line.startsWith(':')) {
      yield { type: 'comment', text: line.slice(1).trimStart() }
      continue
    }

    if (line.startsWith('event: ')) {
      currentEventType = line.slice(7)
      continue
    }

    if (line.startsWith('event:')) {
      currentEventType = line.slice(6)
      continue
    }

    if (line.startsWith('data: ')) {
      dataLines.push(line.slice(6))
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5))
      continue
    }
  }

  if (dataLines.length > 0) {
    yield* flush(currentEventType, dataLines)
  }
}

function* flush(eventType: string | undefined, dataLines: string[]): Generator<AnthropicSSEEvent> {
  if (dataLines.length === 0) return

  const joined = dataLines.join('\n')

  if (joined === '[DONE]') {
    yield { type: 'done' }
    return
  }

  try {
    const data = JSON.parse(joined) as AnthropicStreamEvent
    const resolvedType = eventType ?? (typeof data.type === 'string' ? data.type : 'unknown')
    yield { type: 'event', eventType: resolvedType, data, raw: joined }
  } catch {
    yield { type: 'parse_error', message: 'JSON parse failed', raw: joined }
  }
}

// ---------------------------------------------------------------------------
// Internal: stream buffer flush
// ---------------------------------------------------------------------------

function flushAnthropicBuffer(buffer: string): { events: AnthropicSSEEvent[]; remainder: string } {
  const events: AnthropicSSEEvent[] = []
  const lines = buffer.split('\n')
  let lastNewlineIdx = lines.length - 1

  if (!buffer.endsWith('\n')) {
    lastNewlineIdx = lines.length - 2
  }

  let currentEventType: string | undefined
  const dataLines: string[] = []

  for (let i = 0; i <= lastNewlineIdx; i++) {
    const line = lines[i]

    if (line === '') {
      if (dataLines.length > 0) {
        const joined = dataLines.join('\n')
        if (joined === '[DONE]') {
          events.push({ type: 'done' })
        } else {
          try {
            const data = JSON.parse(joined) as AnthropicStreamEvent
            const resolvedType = currentEventType ?? (typeof data.type === 'string' ? data.type : 'unknown')
            events.push({ type: 'event', eventType: resolvedType, data, raw: joined })
          } catch {
            events.push({ type: 'parse_error', message: 'JSON parse failed', raw: joined })
          }
        }
        dataLines.length = 0
      }
      currentEventType = undefined
      continue
    }

    if (line.startsWith(':')) {
      events.push({ type: 'comment', text: line.slice(1).trimStart() })
      continue
    }

    if (line.startsWith('event: ')) {
      currentEventType = line.slice(7)
      continue
    }

    if (line.startsWith('event:')) {
      currentEventType = line.slice(6)
      continue
    }

    if (line.startsWith('data: ')) {
      dataLines.push(line.slice(6))
      continue
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5))
      continue
    }
  }

  if (dataLines.length > 0) {
    const joined = dataLines.join('\n')
    if (joined === '[DONE]') {
      events.push({ type: 'done' })
    } else {
      try {
        const data = JSON.parse(joined) as AnthropicStreamEvent
        const resolvedType = currentEventType ?? (typeof data.type === 'string' ? data.type : 'unknown')
        events.push({ type: 'event', eventType: resolvedType, data, raw: joined })
      } catch {
        events.push({ type: 'parse_error', message: 'JSON parse failed', raw: joined })
      }
    }
  }

  const remainder = lastNewlineIdx >= 0 ? lines.slice(lastNewlineIdx + 1).join('\n') : buffer
  return { events, remainder }
}
