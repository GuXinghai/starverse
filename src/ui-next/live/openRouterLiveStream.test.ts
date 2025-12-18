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
           requestedReasoningMode: 'effort',
           requestedReasoningEffort: 'none',
           requestedReasoningExclude: false,
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

  async function captureRequestBodyText(config: Parameters<typeof streamOpenRouterChatAsEvents>[0]['config']) {
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
        config,
      })) {
        // consume
      }

      const init = calls[0]?.init
      return String(init.body ?? '')
    } finally {
      globalThis.fetch = originalFetch
    }
  }

  it('Case1 default: mode=effort effort=none exclude=false => body.reasoning.effort==="none"', async () => {
    const bodyText = await captureRequestBodyText({
      apiKey: 'k',
      model: 'openrouter/auto',
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: 'none',
      requestedReasoningExclude: false,
    })

    expect(bodyText).toContain('"reasoning":')
    expect(bodyText).toContain('"effort":"none"')
    expect(bodyText).not.toContain('"enabled":')
  })

  it('Case2 mode=auto => body must omit reasoning field', async () => {
    const bodyText = await captureRequestBodyText({
      apiKey: 'k',
      model: 'openrouter/auto',
      requestedReasoningMode: 'auto',
    })

    expect(bodyText).not.toContain('"reasoning":')
  })

  it.each([
    ['minimal', 'minimal'],
    ['low', 'low'],
  ] as const)('Case3 effort=%s => body.reasoning.effort=%s', async (_label, effort) => {
    const bodyText = await captureRequestBodyText({
      apiKey: 'k',
      model: 'openrouter/auto',
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: effort,
    })

    expect(bodyText).toContain(`\"effort\":\"${effort}\"`)
    expect(bodyText).not.toContain('\"enabled\":')
  })

  it('Case4 exclude=true => body.reasoning.exclude===true', async () => {
    const bodyText = await captureRequestBodyText({
      apiKey: 'k',
      model: 'openrouter/auto',
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: 'high',
      requestedReasoningExclude: true,
    })

    expect(bodyText).toContain('"reasoning":{"effort":"high","exclude":true}')
    expect(bodyText).not.toContain('"enabled":')
  })

  it('Case5: never sends reasoning.enabled:true', async () => {
    const bodyText = await captureRequestBodyText({
      apiKey: 'k',
      model: 'openrouter/auto',
      requestedReasoningMode: 'effort',
      requestedReasoningEffort: 'medium',
    })

    expect(bodyText).not.toContain('"enabled":')
  })
})
