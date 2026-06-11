import { describe, expect, it, vi } from 'vitest'
import { streamViaGemini, type GeminiFetchFn } from '@/next/provider/gemini/geminiAdapter'
import type { ProviderStreamRequest, StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseFixture(...lines: string[]): string {
  return lines.join('\n') + '\n'
}

function textChunkSse(text: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }], role: 'model' } }] })}`
}

function thoughtChunkSse(text: string): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text, thought: true }], role: 'model' } }] })}`
}

function functionCallChunkSse(name: string, args?: unknown): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name, args } }], role: 'model' } }] })}`
}

function finishChunkSse(finishReason: string, usage?: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason }], ...(usage ? { usageMetadata: usage } : {}) })}`
}

function usageChunkSse(usage: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ usageMetadata: usage })}`
}

function errorChunkSse(code: number, message: string): string {
  return `data: ${JSON.stringify({ error: { code, message } })}`
}

function promptFeedbackChunkSse(blockReason: string): string {
  return `data: ${JSON.stringify({ promptFeedback: { blockReason } })}`
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
      model: 'gemini-2.5-pro',
      requestedReasoningMode: 'auto',
      ...overrides,
    },
  }
}

function mockFetch(response: Response): GeminiFetchFn {
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

describe('streamViaGemini', () => {
  it('mocked fetch receives correct endpoint/method/headers/body', async () => {
    const response = makeSseResponse(textChunkSse('Hi'), finishChunkSse('STOP'))
    const fetch = mockFetch(response)

    await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (fetch as any).mock.calls[0]
    expect(url).toContain('/v1beta/models/gemini-2.5-pro:streamGenerateContent')
    expect(url).toContain('alt=sse')
    expect(init.method).toBe('POST')
    expect(init.headers['x-goog-api-key']).toBe('test-key')

    const body = JSON.parse(init.body)
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'Hello' }] }])
  })

  it('text part yields visible text', async () => {
    const response = makeSseResponse(
      textChunkSse('Hello! '),
      textChunkSse('How can I help?'),
      finishChunkSse('STOP'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(2)
    if (textEvents[0].type === 'message.text_delta') expect(textEvents[0].text).toBe('Hello! ')
    if (textEvents[1].type === 'message.text_delta') expect(textEvents[1].text).toBe('How can I help?')
  })

  it('thought part yields reasoning only, never visible text', async () => {
    const response = makeSseResponse(
      thoughtChunkSse('Let me think...'),
      thoughtChunkSse(' Okay.'),
      finishChunkSse('STOP'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(reasoningEvents).toHaveLength(2)
    expect(textEvents).toHaveLength(0)
  })

  it('functionCall part yields no visible text', async () => {
    const response = makeSseResponse(
      functionCallChunkSse('get_weather', { city: 'NYC' }),
      finishChunkSse('STOP'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(0)
  })

  it('promptFeedback/safety yields no visible text', async () => {
    const response = makeSseResponse(promptFeedbackChunkSse('SAFETY'))
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(0)
    // meta.delta with block reason
    const metaEvents = events.filter((e) => e.type === 'meta.delta')
    expect(metaEvents).toHaveLength(1)
    if (metaEvents[0].type === 'meta.delta') {
      expect(metaEvents[0].meta.native_finish_reason).toBe('BLOCKED:SAFETY')
    }
  })

  it('usageMetadata yields usage.delta', async () => {
    const response = makeSseResponse(
      textChunkSse('hi'),
      usageChunkSse({ promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15, thoughtsTokenCount: 3 }),
      finishChunkSse('STOP'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    const usageEvents = events.filter((e) => e.type === 'usage.delta')
    expect(usageEvents).toHaveLength(1)
    if (usageEvents[0].type === 'usage.delta') {
      expect((usageEvents[0].usage as any).thoughtsTokenCount).toBe(3)
    }
  })

  it('finishReason yields meta.delta + exactly one stream.done', async () => {
    const response = makeSseResponse(
      textChunkSse('answer'),
      finishChunkSse('STOP', { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    const metaEvents = events.filter((e) => e.type === 'meta.delta')
    const doneEvents = events.filter((e) => e.type === 'stream.done')

    const stopMeta = metaEvents.find((e) => e.type === 'meta.delta' && e.meta.finish_reason === 'stop')
    expect(stopMeta).toBeTruthy()
    expect(doneEvents).toHaveLength(1)
    expect(events[events.length - 1].type).toBe('stream.done')
  })

  it('error yields terminal stream.error and no stream.done', async () => {
    const response = makeSseResponse(errorChunkSse(429, 'Too many requests'))
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
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

  it('no event after terminal outcome', async () => {
    const response = makeSseResponse(
      textChunkSse('answer'),
      finishChunkSse('STOP'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    const terminalIdx = events.findIndex((e) => e.type === 'stream.done')
    expect(terminalIdx).toBeGreaterThanOrEqual(0)
    expect(terminalIdx).toBe(events.length - 1)
  })

  it('HTTP non-200 yields terminal stream.error', async () => {
    const response = new Response(
      JSON.stringify({ error: { code: 401, message: 'Invalid API key' } }),
      { status: 401, statusText: 'Unauthorized' },
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
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
    const fetch: GeminiFetchFn = vi.fn(async () => { throw new TypeError('fetch failed') })

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].terminal).toBe(true)
    }
  })

  it('error followed by later finish/data produces no later events', async () => {
    const response = makeSseResponse(
      errorChunkSse(429, 'Too many requests'),
      textChunkSse('should not appear'),
      finishChunkSse('STOP'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    // Only the error event, nothing after
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('stream.error')
    // No stream.done after terminal error
    const doneEvents = events.filter((e) => e.type === 'stream.done')
    expect(doneEvents).toHaveLength(0)
  })

  it('abort signal yields stream.abort', async () => {
    const controller = new AbortController()
    controller.abort()

    const fetch: GeminiFetchFn = vi.fn(async (_url, init) => {
      if (init.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      return makeSseResponse(textChunkSse('Hi'))
    })

    const events = await collectEvents(streamViaGemini(
      { ...makeRequest(), signal: controller.signal },
      { baseUrl: 'https://generativelanguage.googleapis.com', apiKey: 'test-key', fetch },
    ))

    expect(events.some((e) => e.type === 'stream.abort')).toBe(true)
  })

  it('does not make live API calls (uses injected fetch)', async () => {
    const originalFetch = globalThis.fetch
    const response = makeSseResponse(textChunkSse('Hi'), finishChunkSse('STOP'))
    const fetch = mockFetch(response)

    try {
      await collectEvents(streamViaGemini(makeRequest(), {
        baseUrl: 'https://generativelanguage.googleapis.com',
        apiKey: 'test-key',
        fetch,
      }))
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('full Gemini thinking flow: thought → text → finishReason → usage → done', async () => {
    const response = makeSseResponse(
      thoughtChunkSse('Let me analyze this...'),
      thoughtChunkSse(' The answer is 42.'),
      textChunkSse('The answer is 42.'),
      finishChunkSse('STOP', { promptTokenCount: 10, candidatesTokenCount: 40, totalTokenCount: 50, thoughtsTokenCount: 30 }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest({ model: 'gemini-2.5-pro' }), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    const usageEvents = events.filter((e) => e.type === 'usage.delta')
    const doneEvents = events.filter((e) => e.type === 'stream.done')

    // Exact counts
    expect(reasoningEvents).toHaveLength(2)
    expect(textEvents).toHaveLength(1)
    expect(usageEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(1)

    // stream.done is last
    expect(events[events.length - 1].type).toBe('stream.done')

    // Reasoning never leaks into text
    if (textEvents[0].type === 'message.text_delta') {
      expect(textEvents[0].text).toBe('The answer is 42.')
    }

    // Usage includes thought tokens
    if (usageEvents[0].type === 'usage.delta') {
      expect((usageEvents[0].usage as any).thoughtsTokenCount).toBe(30)
    }
  })

  it('satisfies RuntimeProviderStreamAdapter interface', async () => {
    // Type-level check: streamViaGemini is annotated as RuntimeProviderStreamAdapter
    // This test verifies the function exists and is callable with the expected signature
    const response = makeSseResponse(textChunkSse('Hi'), finishChunkSse('STOP'))
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGemini(makeRequest(), {
      baseUrl: 'https://generativelanguage.googleapis.com',
      apiKey: 'test-key',
      fetch,
    }))

    expect(events.length).toBeGreaterThan(0)
  })
})
