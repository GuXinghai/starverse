import { describe, expect, it, vi } from 'vitest'
import { streamViaAnthropic, type AnthropicFetchFn } from '@/next/provider/anthropic/anthropicAdapter'
import type { ProviderStreamRequest, StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseFixture(...lines: string[]): string {
  return lines.join('\n') + '\n'
}

function textDeltaSse(text: string, index = 1): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } })}`
}

function thinkingDeltaSse(thinking: string, index = 0): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking } })}`
}

function signatureDeltaSse(signature: string, index = 0): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'signature_delta', signature } })}`
}

function inputJsonDeltaSse(partialJson: string, index = 2): string {
  return `event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: partialJson } })}`
}

function messageStartSse(message: Record<string, unknown>): string {
  return `event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message })}`
}

function messageDeltaSse(stopReason: string, usage?: Record<string, unknown>): string {
  return `event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: stopReason }, ...(usage ? { usage } : {}) })}`
}

function messageStopSse(): string {
  return `event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}`
}

function errorSse(error: Record<string, unknown>): string {
  return `event: error\ndata: ${JSON.stringify({ type: 'error', error })}`
}

function pingSse(): string {
  return `event: ping\ndata: ${JSON.stringify({ type: 'ping' })}`
}

function makeSseResponse(...lines: string[]): Response {
  const body = sseFixture(...lines)
  const bytes = new TextEncoder().encode(body)
  let offset = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      const next = bytes.slice(offset, offset + 50)
      offset += 50
      controller.enqueue(next)
    },
  })
  return new Response(stream as any, { status: 200 })
}

function makeRequest(overrides?: Partial<ProviderStreamRequest['config']>): ProviderStreamRequest {
  return {
    requestId: 'req_1',
    assistantMessageId: 'assistant_1',
    userText: 'Hello',
    config: {
      model: 'claude-sonnet-4-5',
      requestedReasoningMode: 'auto',
      ...overrides,
    },
  }
}

function mockFetch(response: Response): AnthropicFetchFn {
  return vi.fn(async () => response)
}

async function collectEvents(gen: AsyncGenerator<StarverseStreamEvent>): Promise<StarverseStreamEvent[]> {
  const events: StarverseStreamEvent[] = []
  for await (const ev of gen) {
    events.push(ev)
  }
  return events
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('streamViaAnthropic', () => {
  it('mocked fetch receives correct endpoint/method/headers/body', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (fetch as any).mock.calls[0]
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init.method).toBe('POST')
    expect(init.headers['x-api-key']).toBe('sk-ant-test')
    expect(init.headers['anthropic-version']).toBe('2023-06-01')
    expect(init.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(init.body)
    expect(body.model).toBe('claude-sonnet-4-5')
    expect(body.stream).toBe(true)
    expect(body.max_tokens).toBe(4096)
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('adds image content block for text plus image requests without leaking local paths', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    await collectEvents(streamViaAnthropic({
      ...makeRequest(),
      currentUserContentBlocks: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQSkZJRgABAQ==' },
          originalPath: 'D:\\Starverse\\fixtures\\tiny.jpg',
        } as any,
      ],
    }, {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const [, init] = (fetch as any).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: '/9j/4AAQSkZJRgABAQ==' },
          },
        ],
      },
    ])
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('originalPath')
    expect(serialized).not.toContain('D:\\Starverse')
    expect(serialized).not.toContain('storagePath')
  })

  it('adds document PDF content block for text plus PDF requests without leaking local metadata', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    await collectEvents(streamViaAnthropic({
      ...makeRequest(),
      currentUserContentBlocks: [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQK' },
          title: 'manual.pdf',
          originalPath: 'D:\\Starverse\\fixtures\\manual.pdf',
          originalUrl: 'https://cdn.example.test/manual.pdf?token=secret',
        } as any,
      ],
    }, {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const [, init] = (fetch as any).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: 'JVBERi0xLjQK' },
            title: 'manual.pdf',
          },
        ],
      },
    ])
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('originalPath')
    expect(serialized).not.toContain('originalUrl')
    expect(serialized).not.toContain('D:\\Starverse')
    expect(serialized).not.toContain('token=secret')
  })

  it('text_delta yields visible text', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
      textDeltaSse('Hello! '),
      textDeltaSse('How can I help?'),
      messageDeltaSse('end_turn', { output_tokens: 20 }),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(2)
    if (textEvents[0].type === 'message.text_delta') expect(textEvents[0].text).toBe('Hello! ')
    if (textEvents[1].type === 'message.text_delta') expect(textEvents[1].text).toBe('How can I help?')
  })

  it('thinking_delta yields reasoning only, never visible text', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
      thinkingDeltaSse('Step 1: analyze'),
      thinkingDeltaSse(' Step 2: conclude'),
      messageDeltaSse('end_turn', { output_tokens: 50 }),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(reasoningEvents).toHaveLength(2)
    expect(textEvents).toHaveLength(0)
  })

  it('signature_delta yields reasoning only', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
      thinkingDeltaSse('thinking...'),
      signatureDeltaSse('sig_abc123'),
      messageDeltaSse('end_turn'),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(reasoningEvents).toHaveLength(2) // thinking + signature
    expect(textEvents).toHaveLength(0)
  })

  it('input_json_delta does not yield visible text', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
      inputJsonDeltaSse('{"city":'),
      inputJsonDeltaSse('"NYC"}'),
      messageDeltaSse('tool_use'),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(0)
  })

  it('mixed thinking/signature/text order is preserved', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
      thinkingDeltaSse('thinking...'),
      signatureDeltaSse('sig123'),
      textDeltaSse('visible answer'),
      messageDeltaSse('end_turn', { output_tokens: 30 }),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(reasoningEvents).toHaveLength(2)
    expect(textEvents).toHaveLength(1)

    const reasoningIdx = events.indexOf(reasoningEvents[reasoningEvents.length - 1])
    const textIdx = events.indexOf(textEvents[0])
    expect(reasoningIdx).toBeLessThan(textIdx)
  })

  it('message_start/message_delta usage yields usage events', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 50, output_tokens: 0 } }),
      textDeltaSse('answer'),
      messageDeltaSse('end_turn', { output_tokens: 100, output_tokens_details: { thinking_tokens: 70 } }),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const usageEvents = events.filter((e) => e.type === 'usage.delta')
    expect(usageEvents).toHaveLength(2) // message_start + message_delta
    if (usageEvents[1].type === 'usage.delta') {
      expect((usageEvents[1].usage as any).output_tokens).toBe(100)
      expect((usageEvents[1].usage as any).output_tokens_details.thinking_tokens).toBe(70)
    }
  })

  it('message_delta stop_reason yields meta.delta', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
      textDeltaSse('answer'),
      messageDeltaSse('end_turn'),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const metaEvents = events.filter((e) => e.type === 'meta.delta')
    const stopMeta = metaEvents.find((e) => e.type === 'meta.delta' && e.meta.finish_reason === 'end_turn')
    expect(stopMeta).toBeTruthy()
  })

  it('message_stop yields exactly one stream.done', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
      textDeltaSse('answer'),
      messageDeltaSse('end_turn'),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const doneEvents = events.filter((e) => e.type === 'stream.done')
    expect(doneEvents).toHaveLength(1)
    expect(events[events.length - 1].type).toBe('stream.done')
  })

  it('error yields terminal stream.error and no stream.done afterward', async () => {
    const response = makeSseResponse(
      errorSse({ type: 'overloaded_error', message: 'Too many requests' }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    const doneEvents = events.filter((e) => e.type === 'stream.done')
    expect(errorEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(0)
    expect(events[events.length - 1].type).toBe('stream.error')
  })

  it('error followed by message_stop produces no later events', async () => {
    const response = makeSseResponse(
      errorSse({ type: 'overloaded_error', message: 'Too many requests' }),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    // Only the error event, nothing after
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('stream.error')
  })

  it('error followed by ping produces no later events', async () => {
    const response = makeSseResponse(
      errorSse({ type: 'overloaded_error', message: 'Too many requests' }),
      pingSse(),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('stream.error')
  })

  it('HTTP non-200 yields terminal stream.error', async () => {
    const response = new Response(
      JSON.stringify({ error: { type: 'authentication_error', message: 'Invalid API key' } }),
      { status: 401, statusText: 'Unauthorized' },
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'bad-key',
      fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].terminal).toBe(true)
    }
  })

  it('network error yields terminal stream.error', async () => {
    const fetch: AnthropicFetchFn = vi.fn(async () => { throw new TypeError('fetch failed') })

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].terminal).toBe(true)
    }
  })

  it('abort signal yields stream.abort', async () => {
    const controller = new AbortController()
    controller.abort()

    const fetch: AnthropicFetchFn = vi.fn(async (_url, init) => {
      if (init.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      return makeSseResponse(messageStopSse())
    })

    const events = await collectEvents(streamViaAnthropic(
      { ...makeRequest(), signal: controller.signal },
      { baseUrl: 'https://api.anthropic.com/v1', apiKey: 'sk-ant-test', fetch },
    ))

    expect(events.some((e) => e.type === 'stream.abort')).toBe(true)
  })

  it('does not make live API calls (uses injected fetch)', async () => {
    const originalFetch = globalThis.fetch
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 10, output_tokens: 0 } }),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    try {
      await collectEvents(streamViaAnthropic(makeRequest(), {
        baseUrl: 'https://api.anthropic.com/v1',
        apiKey: 'sk-ant-test',
        fetch,
      }))
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('unexpected EOF yields terminal stream.error with category protocol', async () => {
    const response = makeSseResponse(textDeltaSse('some text'))
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest(), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    const doneEvents = events.filter((e) => e.type === 'stream.done')
    expect(errorEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(0)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].terminal).toBe(true)
      expect(errorEvents[0].error.category).toBe('protocol')
    }
    expect(events[events.length - 1].type).toBe('stream.error')
  })

  it('full Claude thinking flow: thinking → signature → text → stop_reason → usage → done', async () => {
    const response = makeSseResponse(
      messageStartSse({ id: 'msg_1', model: 'claude-sonnet-4-5', usage: { input_tokens: 50, output_tokens: 0 } }),
      thinkingDeltaSse('Let me analyze this...'),
      thinkingDeltaSse(' The answer is 42.'),
      signatureDeltaSse('sig_abc123'),
      textDeltaSse('The answer is 42.'),
      messageDeltaSse('end_turn', { output_tokens: 100, output_tokens_details: { thinking_tokens: 70 } }),
      messageStopSse(),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaAnthropic(makeRequest({ model: 'claude-sonnet-4-5' }), {
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      fetch,
    }))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    const usageEvents = events.filter((e) => e.type === 'usage.delta')
    const doneEvents = events.filter((e) => e.type === 'stream.done')
    const errorEvents = events.filter((e) => e.type === 'stream.error')

    // Exact counts
    expect(reasoningEvents).toHaveLength(3) // 2 thinking + 1 signature
    expect(textEvents).toHaveLength(1)
    expect(usageEvents).toHaveLength(2) // message_start + message_delta
    expect(doneEvents).toHaveLength(1)
    expect(errorEvents).toHaveLength(0)

    // stream.done is last
    expect(events[events.length - 1].type).toBe('stream.done')

    // Reasoning never leaks into text
    if (textEvents[0].type === 'message.text_delta') {
      expect(textEvents[0].text).toBe('The answer is 42.')
    }
  })
})
