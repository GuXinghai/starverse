/**
 * Generic OpenAI-compatible SSE decoder — local to Generic provider.
 *
 * Parses Chat Completions SSE format:
 *   data: {"choices":[{"delta":{"content":"..."}}]}
 *   data: [DONE]
 *
 * Does NOT import other provider decoders.
 */

export type GenericChunk = Readonly<{
  id?: string
  model?: string
  choices?: ReadonlyArray<Readonly<{
    index?: number
    delta?: Readonly<{ role?: string; content?: string | null; tool_calls?: unknown }>
    finish_reason?: string | null
  }>>
  usage?: Readonly<{
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    [key: string]: unknown
  }>
  error?: Readonly<{ message?: string; type?: string; code?: string | number }>
}>

export type GenericSSEEvent =
  | { type: 'chunk'; data: GenericChunk; raw: string }
  | { type: 'done' }
  | { type: 'comment'; text: string }
  | { type: 'parse_error'; message: string; raw: string }

/**
 * Decode SSE text into Generic SSE events.
 * Accepts ReadableStream, AsyncIterable, or string.
 */
export async function* decodeGenericSSE(
  input: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | string,
): AsyncGenerator<GenericSSEEvent> {
  if (typeof input === 'string') {
    yield* parseGenericSSEText(input)
    return
  }

  const decoder = new TextDecoder()
  let buffer = ''

  for await (const chunk of input as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true })
    const { events, remainder } = flushGenericBuffer(buffer)
    for (const event of events) {
      yield event
    }
    buffer = remainder
  }

  buffer += decoder.decode()
  if (buffer.trim().length > 0) {
    const { events } = flushGenericBuffer(buffer + '\n\n')
    for (const event of events) {
      yield event
    }
  }
}

function* parseGenericSSEText(text: string): Generator<GenericSSEEvent> {
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

function* flushData(dataLines: string[]): Generator<GenericSSEEvent> {
  if (dataLines.length === 0) return
  const joined = dataLines.join('\n')
  if (joined === '[DONE]') {
    yield { type: 'done' }
    return
  }
  try {
    const data = JSON.parse(joined) as GenericChunk
    yield { type: 'chunk', data, raw: joined }
  } catch {
    yield { type: 'parse_error', message: 'JSON parse failed', raw: joined }
  }
}

function flushGenericBuffer(buffer: string): { events: GenericSSEEvent[]; remainder: string } {
  const events: GenericSSEEvent[] = []
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
            const data = JSON.parse(joined) as GenericChunk
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
        const data = JSON.parse(joined) as GenericChunk
        events.push({ type: 'chunk', data, raw: joined })
      } catch {
        events.push({ type: 'parse_error', message: 'JSON parse failed', raw: joined })
      }
    }
  }

  const remainder = lastNewlineIdx >= 0 ? lines.slice(lastNewlineIdx + 1).join('\n') : buffer
  return { events, remainder }
}
