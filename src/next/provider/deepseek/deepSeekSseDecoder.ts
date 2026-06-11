/**
 * DeepSeek SSE decoder — local to DeepSeek provider.
 *
 * Parses Server-Sent Events from DeepSeek's OpenAI-compatible streaming
 * response format. This is a standalone decoder that does NOT import
 * or modify the OpenRouter SSE decoder.
 *
 * SSE format: https://html.spec.whatwg.org/multipage/server-sent-events.html
 * DeepSeek uses the same wire format as OpenAI Chat Completions streaming.
 *
 * @see src/next/openrouter/sse/decoder.ts — OpenRouter equivalent (untouched)
 */

import type { DeepSeekChunk } from '@/next/provider/deepseek/deepSeekStreamMapper'

// ---------------------------------------------------------------------------
// SSE decoded event types — local to DeepSeek
// ---------------------------------------------------------------------------

export type DeepSeekSSEEvent =
  | { type: 'json'; value: DeepSeekChunk; raw: string }
  | { type: 'done' }
  | { type: 'comment'; text: string }
  | { type: 'parse_error'; message: string; raw: string }

// ---------------------------------------------------------------------------
// decodeDeepSeekSSE — async generator over SSE text input
// ---------------------------------------------------------------------------

/**
 * Decode SSE text into DeepSeek SSE events.
 *
 * Accepts either a ReadableStream<Uint8Array>, AsyncIterable<Uint8Array>,
 * or a plain string (for test convenience).
 *
 * Handles:
 * - `data: {json}` lines → json event
 * - `data: [DONE]` → done event
 * - `: comment` lines → comment event (ignored by most consumers)
 * - Blank lines → flush accumulated data
 * - JSON parse errors → parse_error event
 */
export async function* decodeDeepSeekSSE(
  input: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | string,
): AsyncGenerator<DeepSeekSSEEvent> {
  // Normalize string input for test convenience
  if (typeof input === 'string') {
    yield* parseSSEText(input)
    return
  }

  // Stream input — accumulate bytes into text, then parse
  const decoder = new TextDecoder()
  let buffer = ''

  for await (const chunk of input as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    const { events, remainder } = flushSSEBuffer(buffer)
    for (const event of events) {
      yield event
    }
    buffer = remainder
  }

  // Flush remaining buffer
  buffer += decoder.decode()
  if (buffer.trim().length > 0) {
    const { events } = flushSSEBuffer(buffer + '\n\n')
    for (const event of events) {
      yield event
    }
  }
}

// ---------------------------------------------------------------------------
// Internal: parse SSE text (used by both string and stream paths)
// ---------------------------------------------------------------------------

function* parseSSEText(text: string): Generator<DeepSeekSSEEvent> {
  const lines = text.split('\n')
  const dataLines: string[] = []

  for (const line of lines) {
    if (line === '') {
      // Blank line → flush
      yield* flushDataLines(dataLines)
      dataLines.length = 0
      continue
    }

    if (line.startsWith(':')) {
      // Comment
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

    // Other lines (event:, id:, retry:) — ignored for now
  }

  // Flush any remaining data
  if (dataLines.length > 0) {
    yield* flushDataLines(dataLines)
  }
}

function* flushDataLines(dataLines: string[]): Generator<DeepSeekSSEEvent> {
  if (dataLines.length === 0) return

  const joined = dataLines.join('\n')

  if (joined === '[DONE]') {
    yield { type: 'done' }
    return
  }

  try {
    const value = JSON.parse(joined) as DeepSeekChunk
    yield { type: 'json', value, raw: joined }
  } catch {
    yield { type: 'parse_error', message: 'JSON parse failed', raw: joined }
  }
}

function flushSSEBuffer(buffer: string): { events: DeepSeekSSEEvent[]; remainder: string } {
  const events: DeepSeekSSEEvent[] = []
  const lines = buffer.split('\n')
  let lastNewlineIdx = lines.length - 1

  // Find the last complete line (followed by \n)
  // If buffer ends with \n, all lines are complete
  // If not, the last element is an incomplete line
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
            const value = JSON.parse(joined) as DeepSeekChunk
            events.push({ type: 'json', value, raw: joined })
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

  // Handle remaining data lines (no trailing blank line yet)
  if (dataLines.length > 0) {
    const joined = dataLines.join('\n')
    if (joined === '[DONE]') {
      events.push({ type: 'done' })
    } else {
      try {
        const value = JSON.parse(joined) as DeepSeekChunk
        events.push({ type: 'json', value, raw: joined })
      } catch {
        events.push({ type: 'parse_error', message: 'JSON parse failed', raw: joined })
      }
    }
  }

  // Remainder is the incomplete last line
  const remainder = lastNewlineIdx >= 0 ? lines.slice(lastNewlineIdx + 1).join('\n') : buffer

  return { events, remainder }
}
