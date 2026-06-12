import { describe, expect, it, vi } from 'vitest'
import { streamViaGeneric, type GenericFetchFn } from '@/next/provider/generic/genericAdapter'
import type { ProviderStreamRequest, StarverseStreamEvent } from '@/next/provider/providerTypes'

function sseFixture(...lines: string[]): string {
  return lines.join('\n') + '\n'
}

function textChunkJson(content: string): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}`
}

function finishChunkJson(finishReason: string, usage?: Record<string, unknown>): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: finishReason }], ...(usage ? { usage } : {}) })}`
}

function errorChunkJson(code: string, message: string): string {
  return `data: ${JSON.stringify({ error: { code, message } })}`
}

function toolCallChunkJson(): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: 'fn', arguments: '{}' } }] } }] })}`
}

function reasoningChunkJson(): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { reasoning_content: 'thinking...' } }] })}`
}

function roleOnlyChunkJson(): string {
  return `data: ${JSON.stringify({ choices: [{ index: 0, delta: { role: 'assistant' } }] })}`
}

function makeSseResponseWithDone(...lines: string[]): Response {
  const body = sseFixture(...lines, '', 'data: [DONE]', '')
  return makeResponseFromText(body)
}

function makeSseResponseNoDone(...lines: string[]): Response {
  const body = sseFixture(...lines)
  return makeResponseFromText(body)
}

function makeResponseFromText(body: string): Response {
  const bytes = new TextEncoder().encode(body)
  let offset = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) { controller.close(); return }
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
    config: { model: 'gpt-4o-mini', requestedReasoningMode: 'auto', ...overrides },
  }
}

function mockFetch(response: Response): GenericFetchFn {
  return vi.fn(async () => response)
}

const VALID_API_KEY = 'sk-test'

async function collectEvents(gen: AsyncGenerator<StarverseStreamEvent>): Promise<StarverseStreamEvent[]> {
  const events: StarverseStreamEvent[] = []
  for await (const ev of gen) { events.push(ev) }
  return events
}

describe('streamViaGeneric', () => {
  it('mocked fetch receives correct endpoint/method/headers/body', async () => {
    const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
    const fetch = mockFetch(response)

    await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      fetch,
    }))

    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = (fetch as any).mock.calls[0]
    expect(url).toBe('https://api.example.com/v1/chat/completions')
    expect(init.method).toBe('POST')
    expect(init.headers['Authorization']).toBe('Bearer sk-test')

    const body = JSON.parse(init.body)
    expect(body.model).toBe('gpt-4o-mini')
    expect(body.stream).toBe(true)
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('text delta yields visible text', async () => {
    const response = makeSseResponseWithDone(
      textChunkJson('Hello '),
      textChunkJson('world'),
      finishChunkJson('stop'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(2)
    if (textEvents[0].type === 'message.text_delta') expect(textEvents[0].text).toBe('Hello ')
    if (textEvents[1].type === 'message.text_delta') expect(textEvents[1].text).toBe('world')
  })

  it('role-only delta is ignored', async () => {
    const response = makeSseResponseWithDone(roleOnlyChunkJson(), finishChunkJson('stop'))
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(0)
  })

  it('tool_calls delta does not become visible text', async () => {
    const response = makeSseResponseWithDone(toolCallChunkJson(), finishChunkJson('stop'))
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(0)
  })

  it('reasoning_content delta does not become visible text', async () => {
    const response = makeSseResponseWithDone(reasoningChunkJson(), finishChunkJson('stop'))
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(0)
  })

  it('finish_reason + [DONE] yields exactly one stream.done', async () => {
    const response = makeSseResponseWithDone(
      textChunkJson('answer'),
      finishChunkJson('stop'),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch,
    }))

    const doneEvents = events.filter((e) => e.type === 'stream.done')
    expect(doneEvents).toHaveLength(1)
    expect(events[events.length - 1].type).toBe('stream.done')
  })

  it('usage passthrough', async () => {
    const response = makeSseResponseWithDone(
      textChunkJson('hi'),
      finishChunkJson('stop', { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch,
    }))

    const usageEvents = events.filter((e) => e.type === 'usage.delta')
    expect(usageEvents).toHaveLength(1)
    if (usageEvents[0].type === 'usage.delta') {
      expect((usageEvents[0].usage as any).prompt_tokens).toBe(10)
    }
  })

  it('provider error object yields terminal stream.error', async () => {
    const response = makeSseResponseWithDone(errorChunkJson('invalid_api_key', 'Bad key'))
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: 'sk-bad', fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].terminal).toBe(true)
      expect(errorEvents[0].error.category).toBe('provider_error')
    }
  })

  it('HTTP 401 yields terminal stream.error with auth category', async () => {
    const response = new Response(
      JSON.stringify({ error: { message: 'Unauthorized' } }),
      { status: 401, statusText: 'Unauthorized' },
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: 'sk-bad', fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].error.category).toBe('auth')
      expect(errorEvents[0].error.httpStatus).toBe(401)
    }
  })

  it('HTTP 429 yields terminal stream.error with rate_limit category', async () => {
    const response = new Response(null, { status: 429, statusText: 'Too Many Requests' })
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].error.category).toBe('rate_limit')
    }
  })

  it('network error yields terminal stream.error', async () => {
    const fetch: GenericFetchFn = vi.fn(async () => { throw new TypeError('fetch failed') })

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch,
    }))

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].error.category).toBe('network')
    }
  })

  it('unexpected EOF yields protocol stream.error and no stream.done', async () => {
    const response = makeSseResponseNoDone(textChunkJson('some text'))
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch,
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

  it('abort signal yields stream.abort', async () => {
    const controller = new AbortController()
    controller.abort()

    const fetch: GenericFetchFn = vi.fn(async (_url, init) => {
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      return makeSseResponseWithDone(textChunkJson('Hi'))
    })

    const events = await collectEvents(streamViaGeneric(
      { ...makeRequest(), signal: controller.signal },
      { baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch },
    ))

    expect(events.some((e) => e.type === 'stream.abort')).toBe(true)
  })

  it('does not make live API calls', async () => {
    const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
    const fetch = mockFetch(response)

    await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch,
    }))
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('full text flow: text �?finish �?usage �?done', async () => {
    const response = makeSseResponseWithDone(
      textChunkJson('The answer is '),
      textChunkJson('42.'),
      finishChunkJson('stop', { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }),
    )
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1', apiKey: VALID_API_KEY, fetch,
    }))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    const usageEvents = events.filter((e) => e.type === 'usage.delta')
    const doneEvents = events.filter((e) => e.type === 'stream.done')
    const metaEvents = events.filter((e) => e.type === 'meta.delta')

    expect(textEvents).toHaveLength(2)
    expect(usageEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(1)
    expect(metaEvents.some((e) => e.type === 'meta.delta' && e.meta.finish_reason === 'stop')).toBe(true)
    expect(events[events.length - 1].type).toBe('stream.done')
  })

  // ---------------------------------------------------------------------------
  // Credential boundary tests
  // ---------------------------------------------------------------------------

  describe('credential boundary', () => {
    it('empty apiKey yields auth stream.error and no fetch call', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: '',
        fetch,
      }))

      // No fetch call should be made
      expect(fetch).toHaveBeenCalledTimes(0)

      // Should emit auth error
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].terminal).toBe(true)
        expect(errorEvents[0].error.category).toBe('auth')
      }
    })

    it('whitespace apiKey yields auth stream.error', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: '   ',
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.category).toBe('auth')
        expect(errorEvents[0].error.code).toBe('empty_token')
      }
    })

    it('raw token does not appear in emitted error events', async () => {
      const rawToken = 'sk-super-secret-key-never-leak'

      // With valid cred, if fetch fails we should not leak the token
      const failingFetch: GenericFetchFn = vi.fn(async () => { throw new TypeError('connection refused') })

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: rawToken,
        fetch: failingFetch,
      }))

      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(rawToken)
    })

    it('raw token does not appear in auth error events', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: '',
        fetch,
      }))

      const serialized = JSON.stringify(events)
      // Error events should not contain raw key material
      expect(serialized).not.toContain('sk-')
    })

    it('Authorization header uses Bearer format from apiKey', async () => {
      const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
      const fetch = mockFetch(response)

      await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-my-token-123',
        fetch,
      }))

      const [, init] = (fetch as any).mock.calls[0]
      expect(init.headers['Authorization']).toBe('Bearer sk-my-token-123')
    })
  })

  // ---------------------------------------------------------------------------
  // Unsupported outbound content tests
  // ---------------------------------------------------------------------------

  describe('unsupported outbound content', () => {
    it('non-empty unsupported contextMessages fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        contextMessages: [{ role: 'tool', content: 'tool result' }],
      }, {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].terminal).toBe(true)
        expect(errorEvents[0].error.phase).toBe('request_build')
        expect(errorEvents[0].error.code).toBe('unsupported_context_message')
      }
    })

    it('unsupported currentUserContentBlocks fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        currentUserContentBlocks: [{ type: 'image_url', url: 'https://example.com/img.png' }],
      }, {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.phase).toBe('request_build')
        expect(errorEvents[0].error.code).toBe('unsupported_content_block')
      }
    })

    it('mixed text + unsupported block fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        currentUserContentBlocks: [
          { type: 'text', text: 'hello' },
          { type: 'file', url: 'https://example.com/doc.pdf' },
        ],
      }, {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('unsupported_content_block')
      }
    })

    it('all-unsupported blocks fails and does not send empty user message', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        currentUserContentBlocks: [
          { type: 'image_url', url: 'a.png' },
          { type: 'file', url: 'b.pdf' },
        ],
      }, {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      const doneEvents = events.filter((e) => e.type === 'stream.done')
      expect(doneEvents).toHaveLength(0)
    })

    it('unsupported content emits stream.error and no stream.done', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        contextMessages: [{ role: 'function', content: 'result' }],
      }, {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      const doneEvents = events.filter((e) => e.type === 'stream.done')
      expect(errorEvents).toHaveLength(1)
      expect(doneEvents).toHaveLength(0)
      expect(events[events.length - 1].type).toBe('stream.error')
    })

    it('unsupported content error does not leak raw token', async () => {
      const rawToken = 'sk-secret-leak-test'
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        currentUserContentBlocks: [{ type: 'image_url', url: 'img.png' }],
      }, {
        baseUrl: 'https://api.example.com/v1',
        apiKey: rawToken,
        fetch,
      }))

      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(rawToken)
    })

    it('valid contextMessages are accepted', async () => {
      const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
      const fetch = mockFetch(response)

      await collectEvents(streamViaGeneric({
        ...makeRequest(),
        contextMessages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      }, {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(1)
      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.messages).toHaveLength(4) // 3 context + 1 user
      expect(body.messages[0].role).toBe('system')
      expect(body.messages[3].role).toBe('user')
    })

    it('text-only currentUserContentBlocks are accepted', async () => {
      const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
      const fetch = mockFetch(response)

      await collectEvents(streamViaGeneric({
        ...makeRequest(),
        currentUserContentBlocks: [
          { type: 'text', text: 'part 1' },
          { type: 'text', text: 'part 2' },
        ],
      }, {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(1)
      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.messages[0].content).toBe('part 1\npart 2')
    })
  })

  // ---------------------------------------------------------------------------
  // Additional error category tests (Codex minors)
  // ---------------------------------------------------------------------------

  describe('error categories', () => {
    it('HTTP 500 yields terminal stream.error with http category', async () => {
      const response = new Response(null, { status: 500, statusText: 'Internal Server Error' })
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.category).toBe('http')
        expect(errorEvents[0].error.httpStatus).toBe(500)
      }
    })

    it('HTTP 403 yields terminal stream.error with bad_request category', async () => {
      const response = new Response(
        JSON.stringify({ error: { message: 'Forbidden' } }),
        { status: 403, statusText: 'Forbidden' },
      )
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.category).toBe('bad_request')
        expect(errorEvents[0].error.httpStatus).toBe(403)
      }
    })

    it('malformed JSON in SSE yields parse_error and no stream.done', async () => {
      const body = sseFixture('data: {invalid json}\n\n', 'data: [DONE]\n\n')
      const response = makeResponseFromText(body)
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      const doneEvents = events.filter((e) => e.type === 'stream.done')
      expect(errorEvents).toHaveLength(1)
      expect(doneEvents).toHaveLength(0)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.phase).toBe('sse_decode')
        expect(errorEvents[0].error.category).toBe('protocol')
      }
    })
  })
})
