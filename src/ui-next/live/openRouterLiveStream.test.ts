import { describe, expect, it, vi } from 'vitest'
import { streamOpenRouterChatAsEvents } from './openRouterLiveStream'

function streamFromText(text: string, chunkSize = 17): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text)
  let offset = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      const next = bytes.slice(offset, offset + chunkSize)
      offset += chunkSize
      controller.enqueue(next)
    },
  })
}

describe('streamOpenRouterChatAsEvents (smoke)', () => {
  const fixture = [
    ': OPENROUTER PROCESSING',
    '',
    'data: {"id":"gen_1","model":"openrouter/auto","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}',
    '',
    'data: {"id":"gen_1","usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3},"choices":[]}',
    '',
    'data: [DONE]',
    '',
  ].join('\n')

  it('yields events for a streamed response (handles usage tail + empty choices)', async () => {
    const originalFetch = globalThis.fetch

    globalThis.fetch = vi.fn(async () => {
      const body = streamFromText(fixture)
      return new Response(body as any, {
        status: 200,
        headers: { 'x-openrouter-generation-id': 'gen_header' },
      })
    }) as any

    try {
      const events = []
      for await (const ev of streamOpenRouterChatAsEvents({
        requestId: 'rid',
        assistantMessageId: 'assistant_1',
        userText: 'hello',
        config: {
          apiKey: 'k',
          model: 'openrouter/auto',
        },
      })) {
        events.push(ev)
      }

      expect(events.some((e) => e.type === 'StreamComment')).toBe(true)
      expect(events.some((e) => e.type === 'MessageDeltaText')).toBe(true)
      expect(events.some((e) => e.type === 'UsageDelta')).toBe(true)
      expect(events.some((e) => e.type === 'StreamDone')).toBe(true)
      expect(events.find((e) => e.type === 'MetaDelta' && (e as any).meta?.id === 'gen_header')).toBeTruthy()
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('builds request body with product-default reasoning=none (effort="none")', async () => {
    const originalFetch = globalThis.fetch
    const calls: any[] = []

    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url, init })
      const body = streamFromText(fixture)
      return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
    }) as any

    try {
      for await (const _ of streamOpenRouterChatAsEvents({
        requestId: 'rid',
        assistantMessageId: 'assistant_1',
        userText: 'hello',
        config: {
          apiKey: 'k',
          model: 'openrouter/auto',
          reasoningEffort: 'none',
        },
      })) {
        // consume
      }

      const init = calls[0]?.init
      const bodyText = String(init.body ?? '')
      expect(bodyText).toMatch(/"tools"\s*:\s*\[/)
      expect(bodyText).toMatch(/"reasoning"\s*:\s*\{\s*"effort"\s*:\s*"none"/)
      expect(bodyText).not.toMatch(/"enabled"\s*:/)
      expect(bodyText).not.toMatch(/"effort"\s*:\s*"low"/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('omits reasoning field for auto(omit)', async () => {
    const originalFetch = globalThis.fetch
    const calls: any[] = []

    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url, init })
      const body = streamFromText(fixture)
      return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
    }) as any

    try {
      for await (const _ of streamOpenRouterChatAsEvents({
        requestId: 'rid',
        assistantMessageId: 'assistant_1',
        userText: 'hello',
        config: {
          apiKey: 'k',
          model: 'openrouter/auto',
          // reasoningEffort undefined + exclude false => omit reasoning
        },
      })) {
        // consume
      }

      const init = calls[0]?.init
      const bodyText = String(init.body ?? '')
      expect(bodyText).toMatch(/"tools"\s*:\s*\[/)
      expect(bodyText).not.toMatch(/"reasoning"\s*:/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('uses medium as the enable-default (and exclude-only defaults to medium)', async () => {
    const originalFetch = globalThis.fetch
    const calls: any[] = []

    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url, init })
      const body = streamFromText(fixture)
      return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
    }) as any

    try {
      // Explicit enable: medium
      for await (const _ of streamOpenRouterChatAsEvents({
        requestId: 'rid1',
        assistantMessageId: 'assistant_1',
        userText: 'hello',
        config: {
          apiKey: 'k',
          model: 'openrouter/auto',
          reasoningEffort: 'medium',
        },
      })) {
        // consume
      }

      const b1Text = String(calls[0].init.body ?? '')
      expect(b1Text).toMatch(/"tools"\s*:\s*\[/)
      expect(b1Text).toMatch(/"reasoning"\s*:\s*\{\s*"effort"\s*:\s*"medium"/)
      expect(b1Text).not.toMatch(/"enabled"\s*:/)

      // Exclude only: default medium effort + exclude=true
      for await (const _ of streamOpenRouterChatAsEvents({
        requestId: 'rid2',
        assistantMessageId: 'assistant_2',
        userText: 'hello',
        config: {
          apiKey: 'k',
          model: 'openrouter/auto',
          reasoningExclude: true,
        },
      })) {
        // consume
      }

      const b2Text = String(calls[1].init.body ?? '')
      expect(b2Text).toMatch(/"tools"\s*:\s*\[/)
      expect(b2Text).toMatch(/"reasoning"\s*:\s*\{\s*"effort"\s*:\s*"medium"\s*,\s*"exclude"\s*:\s*true/)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
