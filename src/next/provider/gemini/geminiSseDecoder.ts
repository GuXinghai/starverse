/**
 * Gemini SSE decoder — local to Gemini provider.
 *
 * Parses Server-Sent Events from Gemini API streaming format.
 * Gemini uses plain SSE with data-only lines:
 *
 *   data: {"candidates":[...],"usageMetadata":{...}}
 *
 * Each data line is a full GenerateContentResponse JSON object.
 * This decoder does NOT import or modify other provider decoders.
 */

import type { GeminiStreamChunk } from '@/next/provider/gemini/geminiStreamMapper'

// ---------------------------------------------------------------------------
// Decoded event types
// ---------------------------------------------------------------------------

export type GeminiSSEEvent =
  | { type: 'chunk'; data: GeminiStreamChunk; raw: string }
  | { type: 'done' }
  | { type: 'comment'; text: string }
  | { type: 'parse_error'; message: string; raw: string }

// ---------------------------------------------------------------------------
// decodeGeminiSSE — async generator
// ---------------------------------------------------------------------------

/**
 * Decode SSE text into Gemini SSE events.
 *
 * Accepts ReadableStream<Uint8Array>, AsyncIterable<Uint8Array>, or string.
 *
 * Handles:
 * - `data: {...}` lines → JSON chunk
 * - `data: [DONE]` → done signal (defensive)
 * - `: comment` lines → comments
 * - Blank lines → flush accumulated data
 * - JSON parse errors → parse_error
 */
export async function* decodeGeminiSSE(
  input: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | string,
): AsyncGenerator<GeminiSSEEvent> {
  if (typeof input === 'string') {
    yield* parseGeminiSSEText(input)
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  for await (const chunk of input as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    const { events, remainder } = flushGeminiBuffer(buffer)
    for (const event of events) {
      yield event
    }
    buffer = remainder
  }

  buffer += decoder.decode()
  if (buffer.trim().length > 0) {
    const { events } = flushGeminiBuffer(buffer + '\n\n')
    for (const event of events) {
      yield event
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: text parser
// ---------------------------------------------------------------------------

function* parseGeminiSSEText(text: string): Generator<GeminiSSEEvent> {
  const lines = text.split('\n')
  const dataLines: string[] = []

  for (const line of lines) {
    if (line === '') {
      yield* flushData(dataLines)
      dataLines.length = 0
      continue
    }

    if (line.startsWith(':')) {
      yield { type: 'comment', text: line.slice(1).trimStart() }
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
    yield* flushData(dataLines)
  }
}

function* flushData(dataLines: string[]): Generator<GeminiSSEEvent> {
  if (dataLines.length === 0) return

  const joined = dataLines.join('\n')

  if (joined === '[DONE]') {
    yield { type: 'done' }
    return
  }

  try {
    const data = JSON.parse(joined) as GeminiStreamChunk
    yield { type: 'chunk', data, raw: joined }
  } catch {
    yield { type: 'parse_error', message: 'JSON parse failed', raw: joined }
  }
}

// ---------------------------------------------------------------------------
// Internal: stream buffer flush
// ---------------------------------------------------------------------------

function flushGeminiBuffer(buffer: string): { events: GeminiSSEEvent[]; remainder: string } {
  const events: GeminiSSEEvent[] = []
  const lines = buffer.split('\n')
  let lastNewlineIdx = lines.length - 1

  if (!buffer.endsWith('\n')) {
    lastNewlineIdx = lines.length - 2
  }

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
            const data = JSON.parse(joined) as GeminiStreamChunk
            events.push({ type: 'chunk', data, raw: joined })
          } catch {
            events.push({ type: 'parse_error', message: 'JSON parse failed', raw: joined })
          }
        }
        dataLines.length = 0
      }
      continue
    }

    if (line.startsWith(':')) {
      events.push({ type: 'comment', text: line.slice(1).trimStart() })
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
        const data = JSON.parse(joined) as GeminiStreamChunk
        events.push({ type: 'chunk', data, raw: joined })
      } catch {
        events.push({ type: 'parse_error', message: 'JSON parse failed', raw: joined })
      }
    }
  }

  const remainder = lastNewlineIdx >= 0 ? lines.slice(lastNewlineIdx + 1).join('\n') : buffer
  return { events, remainder }
}
