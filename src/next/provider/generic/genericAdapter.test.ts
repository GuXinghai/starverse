import { describe, expect, it, vi } from 'vitest'
import { streamViaGeneric, streamViaGenericConfig, type GenericFetchFn } from '@/next/provider/generic/genericAdapter'
import type { ProviderStreamRequest, StarverseStreamEvent } from '@/next/provider/providerTypes'
import { GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID } from '@/next/provider/generic/genericEndpointDescriptor'
import { createBearerCredential } from '@/next/provider/credentials/providerCredential'
import { providerCredentialResolutionFromCredential } from '@/next/provider/credentials/providerCredentialResolver'
import type { GenericEndpointConfig, GenericCredentialRef, ResolveGenericCredential } from '@/next/provider/generic/genericEndpointConfig'

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

function visibleText(events: StarverseStreamEvent[]): string {
  return events
    .filter((e): e is Extract<StarverseStreamEvent, { type: 'message.text_delta' }> => e.type === 'message.text_delta')
    .map((e) => e.text)
    .join('')
}

function eventTypes(events: StarverseStreamEvent[]): string[] {
  return events.map((e) => e.type)
}

function expectTerminalErrorWithoutDone(events: StarverseStreamEvent[]): void {
  const errorEvents = events.filter((e) => e.type === 'stream.error')
  const doneEvents = events.filter((e) => e.type === 'stream.done')
  expect(errorEvents).toHaveLength(1)
  expect(doneEvents).toHaveLength(0)
  expect(events[events.length - 1].type).toBe('stream.error')
  if (errorEvents[0].type === 'stream.error') {
    expect(errorEvents[0].terminal).toBe(true)
  }
}

// Low-level raw transport fixture compatibility path. Representative Generic
// credential/config behavior should prefer streamViaGenericConfig below.
describe('streamViaGeneric raw transport compatibility fixture', () => {
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
        expect(errorEvents[0].error.code).toBe('invalid_credential')
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
  // Descriptor integration tests
  // ---------------------------------------------------------------------------

  describe('endpoint descriptor', () => {
    it('adapter consumes descriptor-derived URL for fetch', async () => {
      const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
      const fetch = mockFetch(response)

      await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://custom.api.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      const [url] = (fetch as any).mock.calls[0]
      expect(url).toBe('https://custom.api.com/v1/chat/completions')
    })

    it('adapter uses descriptor model in request body', async () => {
      const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
      const fetch = mockFetch(response)

      await collectEvents(streamViaGeneric(makeRequest({ model: 'custom-model-7b' }), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      const body = JSON.parse((fetch as any).mock.calls[0][1].body)
      expect(body.model).toBe('custom-model-7b')
    })

    it('adapter normalizes trailing slash in baseUrl', async () => {
      const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
      const fetch = mockFetch(response)

      await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1/',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      const [url] = (fetch as any).mock.calls[0]
      expect(url).toBe('https://api.example.com/v1/chat/completions')
    })

    it('adapter does not double-append /chat/completions', async () => {
      const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
      const fetch = mockFetch(response)

      await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1/chat/completions',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      const [url] = (fetch as any).mock.calls[0]
      expect(url).toBe('https://api.example.com/v1/chat/completions')
    })

    it('invalid baseUrl fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'file:///etc/passwd',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('url_scheme_not_allowed')
      }
    })

    it('empty baseUrl fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: '',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('invalid_base_url')
      }
    })

    it('invalid model fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest({ model: '  ' }), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('invalid_model')
      }
    })

    it('URL with userinfo fails before fetch and does not leak credentials', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://admin:secretpass@api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain('secretpass')
      expect(serialized).not.toContain('admin')
    })

    it('descriptor validation failure emits stream.error and no stream.done', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'data:text/html,<h1>hi</h1>',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      const doneEvents = events.filter((e) => e.type === 'stream.done')
      expect(errorEvents).toHaveLength(1)
      expect(doneEvents).toHaveLength(0)
      expect(events[events.length - 1].type).toBe('stream.error')
    })

    it('descriptor validation failure does not leak raw token', async () => {
      const rawToken = 'sk-descriptor-leak-test'
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: '',
        apiKey: rawToken,
        fetch,
      }))

      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(rawToken)
    })
  })

  // ---------------------------------------------------------------------------
  // Capability gate tests
  // ---------------------------------------------------------------------------

  describe('capability gate', () => {
    it('request with tools fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest({
        tools: [{ type: 'function', function: { name: 'fn' } }],
      }), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('blocked_capability_override')
      }
    })

    it('request with webSearch fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest({
        webSearch: { requestPatch: {}, resolvedMode: 'enable' },
      }), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('blocked_capability_override')
      }
    })

    it('request with imageGeneration fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest({
        imageGeneration: { capabilityClass: 'text-to-image' },
      }), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('blocked_capability_override')
      }
    })

    it('request with additionalPlugins fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest({
        additionalPlugins: [{ id: 'file-parser' }],
      }), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('blocked_capability_override')
      }
    })

    it('request with reasoning mode effort fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest({
        requestedReasoningMode: 'effort',
        requestedReasoningEffort: 'high',
      }), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('blocked_capability_override')
      }
    })

    it('mixed valid text request plus unsupported feature fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        contextMessages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hello' },
        ],
        config: {
          model: 'gpt-4o-mini',
          requestedReasoningMode: 'auto',
          tools: [{ type: 'function', function: { name: 'fn' } }],
        },
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

    it('capability failure emits stream.error and no stream.done', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest({
        tools: [{ type: 'function', function: { name: 'fn' } }],
      }), {
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

    it('capability failure does not leak raw token', async () => {
      const rawToken = 'sk-capability-leak-test'
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric(makeRequest({
        tools: [{ type: 'function', function: { name: 'fn' } }],
      }), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: rawToken,
        fetch,
      }))

      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(rawToken)
    })

    it('valid text-only request with sampling params passes capability gate', async () => {
      const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest({
        samplingParams: { temperature: 0.7, max_tokens: 1024 },
      }), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(1)
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(1)
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

    it('text block without text field fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        currentUserContentBlocks: [
          { type: 'text', text: 'valid part' },
          { type: 'text' } as any,
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
        expect(errorEvents[0].error.code).toBe('malformed_text_block')
      }
    })

    it('text block with non-string text fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        currentUserContentBlocks: [
          { type: 'text', text: 'valid part' },
          { type: 'text', text: 123 },
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
        expect(errorEvents[0].error.code).toBe('malformed_text_block')
      }
    })

    it('text block with null text fails before fetch', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        currentUserContentBlocks: [
          { type: 'text', text: null },
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
        expect(errorEvents[0].error.code).toBe('malformed_text_block')
      }
    })

    it('all-malformed text blocks fail and do not send empty user message', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        currentUserContentBlocks: [
          { type: 'text' } as any,
          { type: 'text', text: 42 },
        ],
      }, {
        baseUrl: 'https://api.example.com/v1',
        apiKey: VALID_API_KEY,
        fetch,
      }))

      expect(fetch).toHaveBeenCalledTimes(0)
      const errorEvents = events.filter((e) => e.type === 'stream.error')
      const doneEvents = events.filter((e) => e.type === 'stream.done')
      expect(errorEvents).toHaveLength(1)
      expect(doneEvents).toHaveLength(0)
    })

    it('malformed text block validation emits stream.error and no stream.done', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        currentUserContentBlocks: [{ type: 'text', text: {} }],
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

    it('malformed text block validation does not leak raw token', async () => {
      const rawToken = 'sk-malformed-block-leak-test'
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        currentUserContentBlocks: [{ type: 'text', text: null }],
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

  // ---------------------------------------------------------------------------
  // Credential redaction tests
  // ---------------------------------------------------------------------------

  describe('credential redaction', () => {
    const SECRET_TOKEN = 'sk-super-secret-token-12345'

    it('provider SSE error echoing exact token is redacted', async () => {
      const response = makeSseResponseWithDone(
        errorChunkJson('invalid_key', `Invalid key: ${SECRET_TOKEN}`),
      )
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(SECRET_TOKEN)
      expect(serialized).toContain('[REDACTED_CREDENTIAL]')
    })

    it('provider SSE error echoing Bearer <token> is redacted', async () => {
      const response = makeSseResponseWithDone(
        errorChunkJson('auth_error', `Bad Authorization: Bearer ${SECRET_TOKEN}`),
      )
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(SECRET_TOKEN)
      expect(serialized).not.toContain('Bearer sk-')
    })

    it('HTTP error body echoing exact token is redacted', async () => {
      const response = new Response(
        JSON.stringify({ error: { message: `Invalid token: ${SECRET_TOKEN}` } }),
        { status: 401, statusText: 'Unauthorized' },
      )
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(SECRET_TOKEN)
      expect(serialized).toContain('[REDACTED_CREDENTIAL]')
    })

    it('HTTP error body echoing Authorization: Bearer <token> is redacted', async () => {
      const response = new Response(
        JSON.stringify({ error: { message: `Rejected: Authorization: Bearer ${SECRET_TOKEN}` } }),
        { status: 403, statusText: 'Forbidden' },
      )
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(SECRET_TOKEN)
      expect(serialized).not.toContain('Bearer sk-')
    })

    it('thrown fetch/network error echoing token is redacted', async () => {
      const fetch: GenericFetchFn = vi.fn(async () => {
        throw new TypeError(`Connection failed for token ${SECRET_TOKEN}`)
      })

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(SECRET_TOKEN)
      expect(serialized).toContain('[REDACTED_CREDENTIAL]')
    })

    it('abort reason echoing token is redacted', async () => {
      const controller = new AbortController()
      controller.abort()

      const fetch: GenericFetchFn = vi.fn(async (_url, init) => {
        if (init.signal?.aborted) {
          throw new DOMException(`Aborted with token ${SECRET_TOKEN}`, 'AbortError')
        }
        return makeSseResponseWithDone(textChunkJson('Hi'))
      })

      const events = await collectEvents(streamViaGeneric(
        { ...makeRequest(), signal: controller.signal },
        { baseUrl: 'https://api.example.com/v1', apiKey: SECRET_TOKEN, fetch },
      ))

      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(SECRET_TOKEN)
    })

    it('unsupported content validation error contains no raw token', async () => {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGeneric({
        ...makeRequest(),
        contextMessages: [{ role: 'tool', content: SECRET_TOKEN }],
      }, {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const serialized = JSON.stringify(events)
      // Validation error is a static message, should not contain token
      expect(serialized).not.toContain(SECRET_TOKEN)
    })

    it('all emitted events/errors/snapshots contain no raw token on any path', async () => {
      // Test multiple error paths with the same secret token
      const paths = [
        // Provider SSE error
        makeSseResponseWithDone(errorChunkJson('error', `Echo: ${SECRET_TOKEN}`)),
        // HTTP error
        new Response(JSON.stringify({ error: { message: `Echo: ${SECRET_TOKEN}` } }), { status: 401 }),
        // Network error
        (() => { const f: GenericFetchFn = vi.fn(async () => { throw new TypeError(`Echo: ${SECRET_TOKEN}`) }); return f })(),
      ]

      for (const pathOrResponse of paths) {
        const fetch = typeof pathOrResponse === 'function'
          ? pathOrResponse
          : mockFetch(pathOrResponse as Response)

        const events = await collectEvents(streamViaGeneric(makeRequest(), {
          baseUrl: 'https://api.example.com/v1',
          apiKey: SECRET_TOKEN,
          fetch,
        }))

        const serialized = JSON.stringify(events)
        expect(serialized).not.toContain(SECRET_TOKEN)
      }
    })

    it('provider SSE error code equal to raw token uses safe fallback', async () => {
      const response = makeSseResponseWithDone(
        `data: ${JSON.stringify({ error: { code: SECRET_TOKEN, message: 'bad key' } })}\n\n`,
      )
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('generic_provider_error')
        expect(errorEvents[0].error.code).not.toContain(SECRET_TOKEN)
      }
      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(SECRET_TOKEN)
    })

    it('provider SSE error type containing Bearer <token> uses safe fallback', async () => {
      const response = makeSseResponseWithDone(
        `data: ${JSON.stringify({ error: { type: `Bearer ${SECRET_TOKEN}`, message: 'auth failed' } })}\n\n`,
      )
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('generic_provider_error')
        expect(errorEvents[0].error.code).not.toContain(SECRET_TOKEN)
      }
      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(SECRET_TOKEN)
      expect(serialized).not.toContain('Bearer sk-')
    })

    it('HTTP error code equal to raw token uses safe fallback', async () => {
      const response = new Response(
        JSON.stringify({ error: { code: SECRET_TOKEN, message: 'bad' } }),
        { status: 401, statusText: 'Unauthorized' },
      )
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('generic_http_error')
        expect(errorEvents[0].error.code).not.toContain(SECRET_TOKEN)
      }
      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(SECRET_TOKEN)
    })

    it('HTTP error code containing Authorization: Bearer <token> uses safe fallback', async () => {
      const response = new Response(
        JSON.stringify({ error: { code: `Authorization: Bearer ${SECRET_TOKEN}`, message: 'rejected' } }),
        { status: 403, statusText: 'Forbidden' },
      )
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('generic_http_error')
      }
      const serialized = JSON.stringify(events)
      expect(serialized).not.toContain(SECRET_TOKEN)
      expect(serialized).not.toContain('Bearer sk-')
      expect(serialized).not.toContain('Authorization:')
    })

    it('safe provider error code is preserved', async () => {
      const response = makeSseResponseWithDone(
        errorChunkJson('rate_limit_exceeded', 'Too many requests'),
      )
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('rate_limit_exceeded')
      }
    })

    it('safe HTTP error code is preserved', async () => {
      const response = new Response(
        JSON.stringify({ error: { code: 'invalid_api_key', message: 'Bad key' } }),
        { status: 401, statusText: 'Unauthorized' },
      )
      const fetch = mockFetch(response)

      const events = await collectEvents(streamViaGeneric(makeRequest(), {
        baseUrl: 'https://api.example.com/v1',
        apiKey: SECRET_TOKEN,
        fetch,
      }))

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].error.code).toBe('invalid_api_key')
      }
    })
  })
})

// ---------------------------------------------------------------------------
// Preferred Generic fixture path: non-secret config + credentialRef + injected resolver.
// This remains fixture-only and does not imply non-OpenRouter live support.
// ---------------------------------------------------------------------------

const VALID_CREDENTIAL_REF: GenericCredentialRef = { kind: 'credential_ref', id: 'default' }
const VALID_RESOLVER: ResolveGenericCredential = () =>
  providerCredentialResolutionFromCredential(createBearerCredential('sk-config-test'))

function failingResolver(message?: string): ResolveGenericCredential {
  return () => ({
    ok: false,
    error: {
      code: 'credential_unresolved',
      message: message ?? 'Credential not found',
    },
  })
}

function validEndpointConfig(overrides?: Partial<GenericEndpointConfig>): GenericEndpointConfig {
  return {
    endpointId: 'ep-test',
    displayName: 'Test Endpoint',
    profileId: GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
    baseUrl: 'https://api.example.com/v1',
    model: 'gpt-4o-mini',
    credentialRef: VALID_CREDENTIAL_REF,
    ...overrides,
  }
}

describe('streamViaGenericConfig', () => {
  it('config → resolver → descriptor → adapter happy path streams text and done', async () => {
    const response = makeSseResponseWithDone(textChunkJson('Hello'), finishChunkJson('stop'))
    const fetch = mockFetch(response)

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      VALID_RESOLVER,
      fetch,
    ))

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    const doneEvents = events.filter((e) => e.type === 'stream.done')
    expect(textEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(1)
    expect(events[events.length - 1].type).toBe('stream.done')
  })

  it('config path and raw transport path share equivalent visible text and done behavior', async () => {
    const configFetch = mockFetch(makeSseResponseWithDone(
      textChunkJson('Hello '),
      textChunkJson('world'),
      finishChunkJson('stop'),
    ))
    const rawFetch = mockFetch(makeSseResponseWithDone(
      textChunkJson('Hello '),
      textChunkJson('world'),
      finishChunkJson('stop'),
    ))

    const configEvents = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      VALID_RESOLVER,
      configFetch,
    ))
    const rawEvents = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-config-test',
      fetch: rawFetch,
    }))

    expect(visibleText(configEvents)).toBe('Hello world')
    expect(visibleText(rawEvents)).toBe('Hello world')
    expect(eventTypes(configEvents)).toEqual(eventTypes(rawEvents))
    expect(configEvents[configEvents.length - 1].type).toBe('stream.done')
    expect(rawEvents[rawEvents.length - 1].type).toBe('stream.done')
  })

  it('config path and raw transport path share terminal provider error semantics', async () => {
    const configFetch = mockFetch(makeSseResponseWithDone(
      errorChunkJson('invalid_api_key', 'Bad key'),
      textChunkJson('must not emit'),
      finishChunkJson('stop'),
    ))
    const rawFetch = mockFetch(makeSseResponseWithDone(
      errorChunkJson('invalid_api_key', 'Bad key'),
      textChunkJson('must not emit'),
      finishChunkJson('stop'),
    ))

    const configEvents = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      VALID_RESOLVER,
      configFetch,
    ))
    const rawEvents = await collectEvents(streamViaGeneric(makeRequest(), {
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-config-test',
      fetch: rawFetch,
    }))

    expectTerminalErrorWithoutDone(configEvents)
    expectTerminalErrorWithoutDone(rawEvents)
    expect(visibleText(configEvents)).toBe('')
    expect(visibleText(rawEvents)).toBe('')
    expect(eventTypes(configEvents)).toEqual(eventTypes(rawEvents))
  })

  it('config uses resolved credential for Authorization header', async () => {
    const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
    const fetch = mockFetch(response)

    await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      () => providerCredentialResolutionFromCredential(createBearerCredential('sk-from-resolver')),
      fetch,
    ))

    const [, init] = (fetch as any).mock.calls[0]
    expect(init.headers['Authorization']).toBe('Bearer sk-from-resolver')
  })

  it('config uses descriptor-normalized URL', async () => {
    const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
    const fetch = mockFetch(response)

    await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig({ baseUrl: 'https://custom.api.com/v1/' }),
      VALID_RESOLVER,
      fetch,
    ))

    const [url] = (fetch as any).mock.calls[0]
    expect(url).toBe('https://custom.api.com/v1/chat/completions')
  })

  it('config uses descriptor model in request body', async () => {
    const response = makeSseResponseWithDone(textChunkJson('Hi'), finishChunkJson('stop'))
    const fetch = mockFetch(response)

    await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig({ model: 'custom-model-7b' }),
      VALID_RESOLVER,
      fetch,
    ))

    const body = JSON.parse((fetch as any).mock.calls[0][1].body)
    expect(body.model).toBe('custom-model-7b')
  })

  it('invalid config fails before fetch', async () => {
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig({ baseUrl: 'file:///etc/passwd' }),
      VALID_RESOLVER,
      fetch,
    ))

    expect(fetch).toHaveBeenCalledTimes(0)
    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    const doneEvents = events.filter((e) => e.type === 'stream.done')
    expect(doneEvents).toHaveLength(0)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].error.code).toBe('url_scheme_not_allowed')
    }
  })

  it('unresolved credential fails before fetch', async () => {
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      failingResolver('not found'),
      fetch,
    ))

    expect(fetch).toHaveBeenCalledTimes(0)
    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    const doneEvents = events.filter((e) => e.type === 'stream.done')
    expect(doneEvents).toHaveLength(0)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].error.code).toBe('credential_resolution_failed')
      expect(errorEvents[0].error.category).toBe('auth')
    }
  })

  it('invalid resolved credential fails before fetch', async () => {
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      () => providerCredentialResolutionFromCredential(createBearerCredential('')),
      fetch,
    ))

    expect(fetch).toHaveBeenCalledTimes(0)
    expectTerminalErrorWithoutDone(events)
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('headers')
    const errorEvents = events.filter((e) => e.type === 'stream.error')
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].error.code).toBe('credential_resolution_failed')
      expect(errorEvents[0].error.category).toBe('auth')
      expect(errorEvents[0].error.message).toBe('Credential material is invalid.')
    }
  })

  it('unsupported capability override fails before fetch', async () => {
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig({ capabilityOverride: { tools: true } }),
      VALID_RESOLVER,
      fetch,
    ))

    expect(fetch).toHaveBeenCalledTimes(0)
    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].error.code).toBe('blocked_capability_override')
    }
  })

  it('fixture config path rejects high-risk runtime feature requests before fetch', async () => {
    const cases = [
      { tools: [{ type: 'function', function: { name: 'tool' } }] },
      { webSearch: { enabled: true } },
      { imageGeneration: { enabled: true } },
      { additionalPlugins: ['plugin-a'] },
      { requestedReasoningMode: 'effort' },
    ]

    for (const configOverride of cases) {
      const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

      const events = await collectEvents(streamViaGenericConfig(
        makeRequest(configOverride as any),
        validEndpointConfig(),
        VALID_RESOLVER,
        fetch,
      ))

      expect(fetch).toHaveBeenCalledTimes(0)
      expectTerminalErrorWithoutDone(events)
      expect(JSON.stringify(events)).not.toContain('sk-')
      expect(JSON.stringify(events)).not.toContain('Authorization')
    }
  })

  it('validation failure emits stream.error and no stream.done', async () => {
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig({ model: '' }),
      VALID_RESOLVER,
      fetch,
    ))

    expectTerminalErrorWithoutDone(events)
  })

  it('config validation failure does not leak resolver credential material', async () => {
    const secretToken = 'sk-config-leak-test'
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig({ baseUrl: '' }),
      () => providerCredentialResolutionFromCredential(createBearerCredential(secretToken)),
      fetch,
    ))

    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain(secretToken)
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('headers')
  })

  it('unresolved credential error does not leak resolver internals', async () => {
    const fetch = mockFetch(makeSseResponseWithDone(textChunkJson('Hi')))

    const events = await collectEvents(streamViaGenericConfig(
      makeRequest(),
      validEndpointConfig(),
      () => ({
        ok: false,
        error: {
          code: 'credential_unresolved',
          message: 'Credential sk-secret-not-found',
        },
      }),
      fetch,
    ))

    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('sk-secret-not-found')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('headers')
  })
})
