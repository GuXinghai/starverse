import { describe, expect, it, vi } from 'vitest'
import { streamViaOpenAIResponses, type ResponsesFetchFn } from '@/next/provider/openai-responses/openaiResponsesAdapter'
import type { ProviderStreamRequest, StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseFixture(...lines: string[]): string {
  return lines.join('\n') + '\n'
}

function textDeltaSse(delta: string, seq = 1): string {
  return `event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta, item_id: 'i1', content_index: 0, output_index: 0, sequence_number: seq })}`
}

function reasoningSummaryDeltaSse(delta: string, seq = 1): string {
  return `event: response.reasoning_summary_text.delta\ndata: ${JSON.stringify({ type: 'response.reasoning_summary_text.delta', delta, item_id: 'i0', output_index: 0, summary_index: 0, sequence_number: seq })}`
}

function completedSse(response: Record<string, unknown>, seq = 10): string {
  return `event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response, sequence_number: seq })}`
}

function failedSse(response: Record<string, unknown>, seq = 10): string {
  return `event: response.failed\ndata: ${JSON.stringify({ type: 'response.failed', response, sequence_number: seq })}`
}

function incompleteSse(response: Record<string, unknown>, seq = 10): string {
  return `event: response.incomplete\ndata: ${JSON.stringify({ type: 'response.incomplete', response, sequence_number: seq })}`
}

function errorSse(error: Record<string, unknown>): string {
  return `event: error\ndata: ${JSON.stringify({ type: 'error', error, sequence_number: 0 })}`
}

function makeSseResponse(...lines: string[]): Response {
  const body = sseFixture(...lines, '', 'data: [DONE]', '')
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

function makeRawSseResponse(...lines: string[]): Response {
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
      model: 'o3',
      requestedReasoningMode: 'auto',
      ...overrides,
    },
  }
}

function mockFetch(response: Response): ResponsesFetchFn {
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

describe('streamViaOpenAIResponses', () => {
  it('mocked fetch receives correct endpoint/method/headers/body', async () => {
    const response = makeSseResponse(textDeltaSse('Hi'))
    const fetch = mockFetch(response)

    await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (fetch as any).mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/responses')
    expect(init.method).toBe('POST')
    expect(init.headers['Authorization']).toBe('Bearer sk-test')
    expect(init.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(init.body)
    expect(body.model).toBe('o3')
    expect(body.stream).toBe(true)
    expect(body.input).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('adds input_image content part for text plus image requests without leaking local paths', async () => {
    const response = makeSseResponse(textDeltaSse('Hi'))
    const fetch = mockFetch(response)

    await collectEvents(streamViaOpenAIResponses({
      ...makeRequest(),
      currentUserContentBlocks: [
        { type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgo=' },
        {
          type: 'input_image',
          image_url: 'data:image/png;base64,ignored',
          storagePath: 'D:\\Starverse\\storage\\image.png',
        } as any,
      ],
    }, {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const [, init] = (fetch as any).mock.calls[0]
    const body = JSON.parse(init.body)
    expect(body.input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Hello' },
          { type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgo=' },
          { type: 'input_image', image_url: 'data:image/png;base64,ignored' },
        ],
      },
    ])
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('storagePath')
    expect(serialized).not.toContain('D:\\Starverse')
    expect(serialized).not.toContain('blobId')
  })

  it('output_text delta yields visible text', async () => {
    const response = makeSseResponse(
      textDeltaSse('Hello! '),
      textDeltaSse('How can I help?', 2),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(2)
    if (textEvents[0].type === 'message.text_delta') expect(textEvents[0].text).toBe('Hello! ')
    if (textEvents[1].type === 'message.text_delta') expect(textEvents[1].text).toBe('How can I help?')
  })

  it('reasoning summary yields reasoning only, never visible text', async () => {
    const response = makeSseResponse(
      reasoningSummaryDeltaSse('Thinking step 1'),
      reasoningSummaryDeltaSse(' Thinking step 2', 2),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(reasoningEvents).toHaveLength(2)
    expect(textEvents).toHaveLength(0)
  })

  it('mixed reasoning + visible text order is preserved', async () => {
    const response = makeSseResponse(
      reasoningSummaryDeltaSse('thinking...'),
      textDeltaSse('visible answer'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(reasoningEvents).toHaveLength(1)
    expect(textEvents).toHaveLength(1)

    const reasoningIdx = events.indexOf(reasoningEvents[0])
    const textIdx = events.indexOf(textEvents[0])
    expect(reasoningIdx).toBeLessThan(textIdx)
  })

  it('response.completed yields usage/meta/stream.done exactly once', async () => {
    const response = makeSseResponse(
      textDeltaSse('answer'),
      completedSse({
        id: 'resp_1',
        model: 'o3',
        status: 'completed',
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30, output_tokens_details: { reasoning_tokens: 5 } },
      }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const usageEvents = events.filter((e) => e.type === 'usage.delta')
    const metaEvents = events.filter((e) => e.type === 'meta.delta')
    const doneEvents = events.filter((e) => e.type === 'stream.done')
    const errorEvents = events.filter((e) => e.type === 'stream.error')

    expect(usageEvents).toHaveLength(1)
    expect(metaEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(1)
    expect(errorEvents).toHaveLength(0)

    // stream.done is the last event
    expect(events[events.length - 1].type).toBe('stream.done')

    // Usage contains reasoning tokens
    if (usageEvents[0].type === 'usage.delta') {
      expect((usageEvents[0].usage as any).output_tokens_details.reasoning_tokens).toBe(5)
    }
  })

  it('response.failed yields terminal stream.error and no stream.done', async () => {
    const response = makeSseResponse(
      failedSse({
        id: 'resp_1',
        status: 'failed',
        error: { code: 'server_error', message: 'Provider crashed' },
      }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    const doneEvents = events.filter((e) => e.type === 'stream.done')

    expect(errorEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(0)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].terminal).toBe(true)
    }
    expect(events[events.length - 1].type).toBe('stream.error')
  })

  it('response.incomplete yields terminal stream.error and no stream.done', async () => {
    const response = makeSseResponse(
      incompleteSse({
        id: 'resp_1',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    const doneEvents = events.filter((e) => e.type === 'stream.done')

    expect(errorEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(0)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].terminal).toBe(true)
    }
  })

  it('top-level error yields terminal stream.error', async () => {
    const response = makeSseResponse(
      errorSse({ code: 'rate_limit_exceeded', message: 'slow down' }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].terminal).toBe(true)
    }
  })

  it('no event after terminal outcome', async () => {
    const response = makeSseResponse(
      textDeltaSse('answer'),
      completedSse({ id: 'resp_1', model: 'o3', status: 'completed', usage: { input_tokens: 5, output_tokens: 10, total_tokens: 15 } }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    // Find the terminal event (stream.done)
    const terminalIdx = events.findIndex((e) => e.type === 'stream.done')
    expect(terminalIdx).toBeGreaterThanOrEqual(0)
    // No events after terminal
    expect(terminalIdx).toBe(events.length - 1)
  })

  it('HTTP non-200 yields terminal stream.error', async () => {
    const response = new Response(
      JSON.stringify({ error: { code: 'auth_error', message: 'Invalid API key' } }),
      { status: 401, statusText: 'Unauthorized' },
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
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
    const fetch: ResponsesFetchFn = vi.fn(async () => { throw new TypeError('fetch failed') })

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
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

    const fetch: ResponsesFetchFn = vi.fn(async (_url, init) => {
      if (init.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      return makeSseResponse(textDeltaSse('Hi'))
    })

    const events = await collectEvents(streamViaOpenAIResponses(
      { ...makeRequest(), signal: controller.signal },
      { baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-test', fetch },
    ))

    expect(events.some((e) => e.type === 'stream.abort')).toBe(true)
  })

  it('does not make live API calls (uses injected fetch)', async () => {
    const originalFetch = globalThis.fetch
    const response = makeSseResponse(textDeltaSse('Hi'))
    const fetch = mockFetch(response)

    try {
      await collectEvents(streamViaOpenAIResponses(makeRequest(), {
        baseUrl: 'https://api.openai.com/v1',
        apiKey: 'sk-test',
        fetch,
      }))
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('unexpected EOF yields terminal stream.error with category protocol', async () => {
    const response = makeRawSseResponse(textDeltaSse('some text'))
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest(), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
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

  it('full o3 reasoning flow: reasoning → text → completed → done', async () => {
    const response = makeSseResponse(
      reasoningSummaryDeltaSse('Step 1: analyze'),
      reasoningSummaryDeltaSse(' Step 2: conclude', 2),
      textDeltaSse('The answer is 42.'),
      completedSse({
        id: 'resp_1',
        model: 'o3',
        status: 'completed',
        usage: { input_tokens: 50, output_tokens: 100, total_tokens: 150, output_tokens_details: { reasoning_tokens: 70 } },
      }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaOpenAIResponses(makeRequest({ model: 'o3' }), {
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    const usageEvents = events.filter((e) => e.type === 'usage.delta')
    const doneEvents = events.filter((e) => e.type === 'stream.done')
    const errorEvents = events.filter((e) => e.type === 'stream.error')

    // Exact counts
    expect(reasoningEvents).toHaveLength(2)
    expect(textEvents).toHaveLength(1)
    expect(usageEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(1)
    expect(errorEvents).toHaveLength(0)

    // stream.done is the last event
    expect(events[events.length - 1].type).toBe('stream.done')

    // Reasoning never leaks into text
    if (textEvents[0].type === 'message.text_delta') {
      expect(textEvents[0].text).toBe('The answer is 42.')
    }

    // Usage preserved
    if (usageEvents[0].type === 'usage.delta') {
      expect((usageEvents[0].usage as any).output_tokens_details.reasoning_tokens).toBe(70)
    }
  })
})
