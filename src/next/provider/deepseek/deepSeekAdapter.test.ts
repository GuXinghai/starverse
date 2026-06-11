import { describe, expect, it, vi } from 'vitest'
import { streamViaDeepSeek, type DeepSeekFetchFn } from '@/next/provider/deepseek/deepSeekAdapter'
import type { ProviderStreamRequest, StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sseFixture(...lines: string[]): string {
  return lines.join('\n') + '\n'
}

function textSseChunk(id: string, model: string, content: string): string {
  return `data: ${JSON.stringify({ id, model, choices: [{ index: 0, delta: { content }, finish_reason: null }] })}`
}

function reasoningSseChunk(id: string, model: string, reasoning_content: string): string {
  return `data: ${JSON.stringify({ id, model, choices: [{ index: 0, delta: { reasoning_content }, finish_reason: null }] })}`
}

function finishSseChunk(id: string, model: string, finish_reason: string): string {
  return `data: ${JSON.stringify({ id, model, choices: [{ index: 0, delta: {}, finish_reason }] })}`
}

function usageSseChunk(id: string, model: string, usage: object): string {
  return `data: ${JSON.stringify({ id, model, usage })}`
}

function errorSseChunk(code: string, message: string): string {
  return `data: ${JSON.stringify({ error: { code, message } })}`
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

function makeRequest(overrides?: Partial<ProviderStreamRequest['config']>): ProviderStreamRequest {
  return {
    requestId: 'req_1',
    assistantMessageId: 'assistant_1',
    userText: 'Hello',
    config: {
      model: 'deepseek-chat',
      requestedReasoningMode: 'auto',
      ...overrides,
    },
  }
}

function mockFetch(response: Response): DeepSeekFetchFn {
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

describe('streamViaDeepSeek', () => {
  it('mocked fetch receives correct endpoint/method/headers/body', async () => {
    const response = makeSseResponse(
      textSseChunk('gen_1', 'deepseek-chat', 'hi'),
    )
    const fetch = mockFetch(response)

    await collectEvents(streamViaDeepSeek(makeRequest(), {
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (fetch as any).mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(init.headers['Authorization']).toBe('Bearer sk-test')
    expect(init.headers['Content-Type']).toBe('application/json')

    const body = JSON.parse(init.body)
    expect(body.model).toBe('deepseek-chat')
    expect(body.stream).toBe(true)
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('reasoning_content fixture yields reasoning events only', async () => {
    const response = makeSseResponse(
      reasoningSseChunk('gen_1', 'deepseek-r1', 'Let me think...'),
      reasoningSseChunk('gen_1', 'deepseek-r1', ' Okay.'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaDeepSeek(
      makeRequest({ model: 'deepseek-r1' }),
      { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test', fetch },
    ))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')

    expect(reasoningEvents).toHaveLength(2)
    expect(textEvents).toHaveLength(0)
  })

  it('visible content fixture yields text events', async () => {
    const response = makeSseResponse(
      textSseChunk('gen_1', 'deepseek-chat', 'Hello! '),
      textSseChunk('gen_1', 'deepseek-chat', 'How can I help?'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaDeepSeek(makeRequest(), {
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(2)
    if (textEvents[0].type === 'message.text_delta') {
      expect(textEvents[0].text).toBe('Hello! ')
    }
    if (textEvents[1].type === 'message.text_delta') {
      expect(textEvents[1].text).toBe('How can I help?')
    }
  })

  it('mixed reasoning + text order is preserved', async () => {
    const response = makeSseResponse(
      reasoningSseChunk('gen_1', 'deepseek-r1', 'thinking...'),
      textSseChunk('gen_1', 'deepseek-r1', 'visible answer'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaDeepSeek(
      makeRequest({ model: 'deepseek-r1' }),
      { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test', fetch },
    ))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')

    expect(reasoningEvents).toHaveLength(1)
    expect(textEvents).toHaveLength(1)

    // Reasoning appears before text in the event stream
    const reasoningIdx = events.indexOf(reasoningEvents[0])
    const textIdx = events.indexOf(textEvents[0])
    expect(reasoningIdx).toBeLessThan(textIdx)
  })

  it('finish_reason yields meta.delta + exactly one stream.done (last event)', async () => {
    const response = makeSseResponse(
      textSseChunk('gen_1', 'deepseek-chat', 'answer'),
      finishSseChunk('gen_1', 'deepseek-chat', 'stop'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaDeepSeek(makeRequest(), {
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const metaEvents = events.filter((e) => e.type === 'meta.delta')
    const doneEvents = events.filter((e) => e.type === 'stream.done')

    const finishMeta = metaEvents.find((e) => e.type === 'meta.delta' && e.meta.finish_reason === 'stop')
    expect(finishMeta).toBeTruthy()

    // Exactly one stream.done, and it is the last event
    expect(doneEvents).toHaveLength(1)
    expect(events[events.length - 1].type).toBe('stream.done')
  })

  it('finish without later usage emits exactly one stream.done', async () => {
    const response = makeSseResponse(
      textSseChunk('gen_1', 'deepseek-chat', 'answer'),
      finishSseChunk('gen_1', 'deepseek-chat', 'stop'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaDeepSeek(makeRequest(), {
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const doneEvents = events.filter((e) => e.type === 'stream.done')
    expect(doneEvents).toHaveLength(1)
    expect(events[events.length - 1].type).toBe('stream.done')
  })

  it('terminal error chunk does not emit stream.done even if [DONE] follows', async () => {
    const response = makeSseResponse(
      errorSseChunk('rate_limited', 'Too many requests'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaDeepSeek(makeRequest(), {
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    const doneEvents = events.filter((e) => e.type === 'stream.done')

    expect(errorEvents).toHaveLength(1)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].terminal).toBe(true)
    }
    // No stream.done after terminal error
    expect(doneEvents).toHaveLength(0)
    // Last event is the error
    expect(events[events.length - 1].type).toBe('stream.error')
  })

  it('usage fixture yields usage.delta', async () => {
    const response = makeSseResponse(
      textSseChunk('gen_1', 'deepseek-chat', 'hi'),
      usageSseChunk('gen_1', 'deepseek-chat', {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        completion_tokens_details: { reasoning_tokens: 15 },
      }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaDeepSeek(makeRequest(), {
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    const usageEvents = events.filter((e) => e.type === 'usage.delta')
    expect(usageEvents).toHaveLength(1)
    if (usageEvents[0].type === 'usage.delta') {
      expect((usageEvents[0].usage as any).completion_tokens_details.reasoning_tokens).toBe(15)
    }
  })

  it('error fixture yields terminal stream.error', async () => {
    const response = makeSseResponse(
      errorSseChunk('rate_limited', 'Too many requests'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaDeepSeek(makeRequest(), {
      baseUrl: 'https://api.deepseek.com/v1',
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

  it('HTTP non-200 yields terminal stream.error', async () => {
    const response = new Response(
      JSON.stringify({ error: { code: 'auth_error', message: 'Invalid API key' } }),
      { status: 401, statusText: 'Unauthorized' },
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaDeepSeek(makeRequest(), {
      baseUrl: 'https://api.deepseek.com/v1',
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
    const fetch: DeepSeekFetchFn = vi.fn(async () => {
      throw new TypeError('fetch failed')
    })

    const events = await collectEvents(streamViaDeepSeek(makeRequest(), {
      baseUrl: 'https://api.deepseek.com/v1',
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

    const fetch: DeepSeekFetchFn = vi.fn(async (_url, init) => {
      if (init.signal?.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError')
      }
      return makeSseResponse(textSseChunk('gen_1', 'deepseek-chat', 'hi'))
    })

    const events = await collectEvents(streamViaDeepSeek(
      { ...makeRequest(), signal: controller.signal },
      { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test', fetch },
    ))

    expect(events.some((e) => e.type === 'stream.abort')).toBe(true)
  })

  it('full DeepSeek R1 flow: reasoning → text → finish → usage → exactly one done', async () => {
    const response = makeSseResponse(
      reasoningSseChunk('gen_1', 'deepseek-r1', 'Let me analyze...'),
      reasoningSseChunk('gen_1', 'deepseek-r1', ' The answer is 42.'),
      textSseChunk('gen_1', 'deepseek-r1', 'The answer is 42.'),
      finishSseChunk('gen_1', 'deepseek-r1', 'stop'),
      usageSseChunk('gen_1', 'deepseek-r1', {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        completion_tokens_details: { reasoning_tokens: 15 },
      }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaDeepSeek(
      makeRequest({ model: 'deepseek-r1' }),
      { baseUrl: 'https://api.deepseek.com/v1', apiKey: 'sk-test', fetch },
    ))

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    const metaEvents = events.filter((e) => e.type === 'meta.delta')
    const usageEvents = events.filter((e) => e.type === 'usage.delta')
    const doneEvents = events.filter((e) => e.type === 'stream.done')
    const errorEvents = events.filter((e) => e.type === 'stream.error')

    // Exact counts
    expect(reasoningEvents).toHaveLength(2)
    expect(textEvents).toHaveLength(1)
    expect(metaEvents.length).toBeGreaterThanOrEqual(1)
    expect(usageEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(1)
    expect(errorEvents).toHaveLength(0)

    // Exactly one stream.done, and it is the very last event
    expect(events[events.length - 1].type).toBe('stream.done')

    // Usage arrives after finish metadata (order preserved)
    const finishMetaIdx = events.findIndex((e) => e.type === 'meta.delta' && e.meta.finish_reason === 'stop')
    const usageIdx = events.findIndex((e) => e.type === 'usage.delta')
    const doneIdx = events.findIndex((e) => e.type === 'stream.done')
    expect(finishMetaIdx).toBeGreaterThanOrEqual(0)
    expect(usageIdx).toBeGreaterThan(finishMetaIdx)
    expect(doneIdx).toBeGreaterThan(usageIdx)

    // Reasoning never leaks into text
    if (textEvents[0].type === 'message.text_delta') {
      expect(textEvents[0].text).toBe('The answer is 42.')
    }
  })

  it('does not make live API calls (uses injected fetch)', async () => {
    const originalFetch = globalThis.fetch
    const response = makeSseResponse(textSseChunk('gen_1', 'deepseek-chat', 'hi'))
    const fetch = mockFetch(response)

    try {
      await collectEvents(streamViaDeepSeek(makeRequest(), {
        baseUrl: 'https://api.deepseek.com/v1',
        apiKey: 'sk-test',
        fetch,
      }))

      // The injected fetch was called, not globalThis.fetch
      expect(fetch).toHaveBeenCalledTimes(1)
    } finally {
      // Restore globalThis.fetch in case it was accidentally used
      globalThis.fetch = originalFetch
    }
  })
})
