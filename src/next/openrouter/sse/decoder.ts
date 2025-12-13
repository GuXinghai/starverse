export type SSEDecodedEvent =
  | Readonly<{ type: 'comment'; text: string }>
  | Readonly<{ type: 'done' }>
  | Readonly<{ type: 'json'; value: unknown; raw: string }>
  | Readonly<{ type: 'terminal_error'; error: unknown; raw: unknown; message: string }>
  | Readonly<{ type: 'protocol_error'; message: string; raw?: string }>

export type DecodeSSEOptions = Readonly<{
  emitComments?: boolean
  /**
   * When true (default), attempts JSON.parse on each SSE `data:` payload and:
   * - yields `terminal_error` and stops if parsed object contains top-level `error`
   * - yields `protocol_error` and stops if JSON.parse fails
   */
  parseJsonData?: boolean
}>

function isReadableStream(value: unknown): value is ReadableStream<Uint8Array> {
  return !!value && typeof value === 'object' && 'getReader' in (value as any)
}

async function* iterateReadableStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader()
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) return
      if (value) yield value
    }
  } finally {
    reader.releaseLock()
  }
}

function tryParseJson(raw: string): { ok: true; value: unknown } | { ok: false; message: string } {
  try {
    return { ok: true, value: JSON.parse(raw) }
  } catch (err: any) {
    return { ok: false, message: err?.message ? String(err.message) : 'JSON parse failed' }
  }
}

/**
 * Decode a byte stream into SSE events and enforce protocol boundaries:
 * - `:` comment lines are emitted (optional) and never JSON-parsed
 * - `data: [DONE]` terminates the stream
 * - `data: <json>` is parsed into `json` events
 * - mid-stream error: top-level `error` in parsed JSON emits `terminal_error` and terminates
 */
export async function* decodeOpenRouterSSE(
  input: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
  options: DecodeSSEOptions = {}
): AsyncGenerator<SSEDecodedEvent> {
  const emitComments = options.emitComments ?? true
  const parseJsonData = options.parseJsonData ?? true

  const byteIterable: AsyncIterable<Uint8Array> = isReadableStream(input) ? iterateReadableStream(input) : input

  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines: string[] = []

  const flushEvent = async function* (): AsyncGenerator<SSEDecodedEvent> {
    if (dataLines.length === 0) return
    const data = dataLines.join('\n')
    dataLines = []

    if (data === '[DONE]') {
      yield { type: 'done' }
      return
    }

    if (!parseJsonData) {
      yield { type: 'protocol_error', message: 'parseJsonData=false is not supported for OpenRouter chunk mapping', raw: data }
      return
    }

    const parsed = tryParseJson(data)
    if (!parsed.ok) {
      yield { type: 'protocol_error', message: parsed.message, raw: data }
      return
    }

    const value = parsed.value
    yield { type: 'json', value, raw: data }

    if (value && typeof value === 'object' && 'error' in (value as any) && (value as any).error) {
      yield {
        type: 'terminal_error',
        error: (value as any).error,
        raw: value,
        message: 'mid-stream error',
      }
      return
    }
  }

  for await (const chunk of byteIterable) {
    buffer += decoder.decode(chunk, { stream: true })

    while (true) {
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex === -1) break

      const rawLine = buffer.slice(0, newlineIndex).replace(/\r$/, '')
      buffer = buffer.slice(newlineIndex + 1)

      if (rawLine === '') {
        const events = flushEvent()
        for await (const ev of events) {
          yield ev
          if (ev.type === 'done' || ev.type === 'terminal_error' || ev.type === 'protocol_error') return
        }
        continue
      }

      if (rawLine.startsWith(':')) {
        if (emitComments) yield { type: 'comment', text: rawLine.slice(1).trimStart() }
        continue
      }

      if (rawLine.startsWith('data:')) {
        dataLines.push(rawLine.slice('data:'.length).trimStart())
        continue
      }
    }
  }

  // EOF: flush any pending event (OpenRouter normally ends with [DONE], but be tolerant)
  const events = flushEvent()
  for await (const ev of events) {
    yield ev
  }
}
