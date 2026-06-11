import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { DomainEvent } from '@/next/state/types'
import type { StarverseStreamEvent, ProviderStreamRequest } from '@/next/provider/providerTypes'
import { domainEventToStreamEvent, streamEventToDomainEvent } from '@/next/provider/streamEventBridge'
import { streamViaOpenRouter } from '@/next/provider/openrouter/openRouterAdapter'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'

// ---------------------------------------------------------------------------
// streamEventBridge — bidirectional mapping
// ---------------------------------------------------------------------------

describe('streamEventBridge', () => {
  const domainEvents: DomainEvent[] = [
    { type: 'StreamComment', text: 'processing' },
    { type: 'MetaDelta', meta: { id: 'gen_1', model: 'm', provider: 'p', finish_reason: 'stop', native_finish_reason: 'stop' } },
    { type: 'MessageDeltaText', messageId: 'msg_1', choiceIndex: 0, text: 'hello' },
    { type: 'MessageAppendContentBlock', messageId: 'msg_1', choiceIndex: 0, block: { type: 'image', url: 'https://example.com/img.png' } },
    { type: 'MessageDeltaToolCall', messageId: 'msg_1', choiceIndex: 0, mergeStrategy: 'append', toolCallDeltas: [{ index: 0, id: 'tc_1', function: { name: 'fn', arguments: '{}' } }] },
    { type: 'MessageDeltaAnnotationBatch', messageId: 'msg_1', choiceIndex: 0, mergeStrategy: 'append', annotations: [{ key: 'val' }] },
    { type: 'MessageDeltaReasoningDetail', messageId: 'msg_1', choiceIndex: 0, detail: { text: 'thinking' }, chunkNo: 5 },
    { type: 'MessageDeltaReasoningDetailBatch', messageId: 'msg_1', choiceIndex: 0, details: [{ text: 'a' }, { text: 'b' }] },
    { type: 'UsageDelta', usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } },
    { type: 'StreamDone' },
  ]

  it('domainEventToStreamEvent maps all DomainEvent types to StarverseStreamEvent', () => {
    const expectedTypes: StarverseStreamEvent['type'][] = [
      'stream.comment',
      'meta.delta',
      'message.text_delta',
      'message.content_block_append',
      'message.tool_call_delta',
      'message.annotation_batch',
      'message.reasoning_detail',
      'message.reasoning_detail_batch',
      'usage.delta',
      'stream.done',
    ]

    for (let i = 0; i < domainEvents.length; i++) {
      const mapped = domainEventToStreamEvent(domainEvents[i])
      expect(mapped.type).toBe(expectedTypes[i])
    }
  })

  it('streamEventToDomainEvent maps all StarverseStreamEvent types to DomainEvent', () => {
    const streamEvents: StarverseStreamEvent[] = [
      { type: 'stream.comment', text: 'c' },
      { type: 'meta.delta', meta: { id: 'g' } },
      { type: 'message.text_delta', messageId: 'm', choiceIndex: 0, text: 't' },
      { type: 'message.content_block_append', messageId: 'm', choiceIndex: 0, block: { type: 'image', url: 'u' } },
      { type: 'message.tool_call_delta', messageId: 'm', choiceIndex: 0, mergeStrategy: 'append', toolCallDeltas: [] },
      { type: 'message.annotation_batch', messageId: 'm', choiceIndex: 0, mergeStrategy: 'replace', annotations: [] },
      { type: 'message.reasoning_detail', messageId: 'm', choiceIndex: 0, detail: {} },
      { type: 'message.reasoning_detail_batch', messageId: 'm', choiceIndex: 0, details: [] },
      { type: 'usage.delta', usage: {} },
      { type: 'stream.done' },
      { type: 'stream.error', error: {} as any, terminal: true },
      { type: 'stream.abort', reason: 'user', envelope: {} as any },
      { type: 'stream.timing', tRequestStart: 1, tAck: 2, tEnd: 3, endReason: 'normal_complete' },
    ]

    const expectedTypes: DomainEvent['type'][] = [
      'StreamComment',
      'MetaDelta',
      'MessageDeltaText',
      'MessageAppendContentBlock',
      'MessageDeltaToolCall',
      'MessageDeltaAnnotationBatch',
      'MessageDeltaReasoningDetail',
      'MessageDeltaReasoningDetailBatch',
      'UsageDelta',
      'StreamDone',
      'StreamError',
      'StreamAbort',
      'TimingSnapshot',
    ]

    for (let i = 0; i < streamEvents.length; i++) {
      const mapped = streamEventToDomainEvent(streamEvents[i])
      expect(mapped.type).toBe(expectedTypes[i])
    }
  })

  it('roundtrip preserves field values for text delta', () => {
    const original: DomainEvent = { type: 'MessageDeltaText', messageId: 'msg_42', choiceIndex: 2, text: 'hello world' }
    const streamEvent = domainEventToStreamEvent(original)
    const roundtripped = streamEventToDomainEvent(streamEvent)
    expect(roundtripped).toEqual(original)
  })

  it('roundtrip preserves field values for usage delta', () => {
    const original: DomainEvent = { type: 'UsageDelta', usage: { prompt_tokens: 5, completion_tokens: 10 } }
    const streamEvent = domainEventToStreamEvent(original)
    const roundtripped = streamEventToDomainEvent(streamEvent)
    expect(roundtripped).toEqual(original)
  })

  it('roundtrip preserves field values for meta delta', () => {
    const original: DomainEvent = { type: 'MetaDelta', meta: { id: 'g1', model: 'm1', provider: 'p1', finish_reason: 'stop', native_finish_reason: 'stop' } }
    const streamEvent = domainEventToStreamEvent(original)
    const roundtripped = streamEventToDomainEvent(streamEvent)
    expect(roundtripped).toEqual(original)
  })

  it('roundtrip preserves terminal error flag', () => {
    const original: DomainEvent = { type: 'StreamError', error: { phase: 'mid_stream', completionClass: 'error', openrouter: { code: 'e' }, truncated: false } as any, terminal: true }
    const streamEvent = domainEventToStreamEvent(original)
    expect(streamEvent.type).toBe('stream.error')
    if (streamEvent.type === 'stream.error') {
      expect(streamEvent.terminal).toBe(true)
    }
    const roundtripped = streamEventToDomainEvent(streamEvent)
    expect(roundtripped).toEqual(original)
  })

  it('roundtrip preserves reasoning detail chunkNo', () => {
    const original: DomainEvent = { type: 'MessageDeltaReasoningDetail', messageId: 'm', choiceIndex: 0, detail: { text: 't' }, chunkNo: 7 }
    const streamEvent = domainEventToStreamEvent(original)
    const roundtripped = streamEventToDomainEvent(streamEvent)
    expect(roundtripped).toEqual(original)
  })
})

// ---------------------------------------------------------------------------
// streamViaOpenRouter — adapter facade
// ---------------------------------------------------------------------------

describe('streamViaOpenRouter', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  beforeEach(() => {
    globalThis.localStorage?.removeItem('sv_debug_openrouter_echo_upstream_body')
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string) => {
        if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
        return undefined
      }),
    }
  })

  afterEach(() => {
    globalThis.localStorage?.removeItem('sv_debug_openrouter_echo_upstream_body')
    ;(globalThis as any).dbBridge = originalDbBridge
  })

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

  const fixture = [
    ': OPENROUTER PROCESSING',
    '',
    `data: {"id":"gen_1","model":"${DEFAULT_OPENROUTER_TEST_MODEL}","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}`,
    '',
    'data: {"id":"gen_1","usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3},"choices":[]}',
    '',
    'data: [DONE]',
    '',
  ].join('\n')

  it('yields StarverseStreamEvent types (not raw DomainEvent types)', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => {
      const body = streamFromText(fixture)
      return new Response(body as any, {
        status: 200,
        headers: { 'x-openrouter-generation-id': 'gen_header' },
      })
    }) as any

    try {
      const request: ProviderStreamRequest = {
        requestId: 'rid',
        assistantMessageId: 'assistant_1',
        userText: 'hello',
        config: {
          model: DEFAULT_OPENROUTER_TEST_MODEL,
          requestedReasoningMode: 'effort',
          requestedReasoningEffort: 'none',
        },
      }

      const events: StarverseStreamEvent[] = []
      for await (const ev of streamViaOpenRouter(request, { apiKey: 'k' })) {
        events.push(ev)
      }

      expect(events.some((e) => e.type === 'stream.comment')).toBe(true)
      expect(events.some((e) => e.type === 'message.text_delta')).toBe(true)
      expect(events.some((e) => e.type === 'usage.delta')).toBe(true)
      expect(events.some((e) => e.type === 'stream.done')).toBe(true)
      expect(events.find((e) => e.type === 'meta.delta' && e.meta?.id === 'gen_header')).toBeTruthy()

      // Verify no raw DomainEvent types leak through (proven at type level:
      // StarverseStreamEvent uses dot-separated discriminators, not PascalCase)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('preserves request body semantics (reasoning.effort=none)', async () => {
    const originalFetch = globalThis.fetch
    const calls: any[] = []
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url, init })
      const body = streamFromText(fixture)
      return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
    }) as any

    try {
      const request: ProviderStreamRequest = {
        requestId: 'rid',
        assistantMessageId: 'assistant_1',
        userText: 'hello',
        config: {
          model: DEFAULT_OPENROUTER_TEST_MODEL,
          requestedReasoningMode: 'effort',
          requestedReasoningEffort: 'none',
        },
      }

      for await (const _ of streamViaOpenRouter(request, { apiKey: 'k' })) {
        // consume
      }

      const bodyText = String(calls[0]?.init?.body ?? '')
      expect(bodyText).toContain('"reasoning":')
      expect(bodyText).toContain('"effort":"none"')
      expect(bodyText).not.toContain('"enabled":')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('preserves request body semantics (mode=auto omits reasoning)', async () => {
    const originalFetch = globalThis.fetch
    const calls: any[] = []
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url, init })
      const body = streamFromText(fixture)
      return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
    }) as any

    try {
      const request: ProviderStreamRequest = {
        requestId: 'rid',
        assistantMessageId: 'assistant_1',
        userText: 'hello',
        config: {
          model: DEFAULT_OPENROUTER_TEST_MODEL,
          requestedReasoningMode: 'auto',
        },
      }

      for await (const _ of streamViaOpenRouter(request, { apiKey: 'k' })) {
        // consume
      }

      const bodyText = String(calls[0]?.init?.body ?? '')
      expect(bodyText).not.toContain('"reasoning":')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('handles mid-stream error as stream.error terminal event', async () => {
    const errorFixture = [
      'data: {"error":{"code":"rate_limited","message":"Too many requests"}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => {
      return new Response(streamFromText(errorFixture) as any, { status: 200 })
    }) as any

    try {
      const request: ProviderStreamRequest = {
        requestId: 'rid',
        assistantMessageId: 'assistant_1',
        userText: 'hello',
        config: {
          model: DEFAULT_OPENROUTER_TEST_MODEL,
          requestedReasoningMode: 'effort',
          requestedReasoningEffort: 'none',
        },
      }

      const events: StarverseStreamEvent[] = []
      for await (const ev of streamViaOpenRouter(request, { apiKey: 'k' })) {
        events.push(ev)
      }

      const errorEvent = events.find((e) => e.type === 'stream.error')
      expect(errorEvent).toBeTruthy()
      if (errorEvent?.type === 'stream.error') {
        expect(errorEvent.terminal).toBe(true)
      }
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('handles abort as stream.abort event', async () => {
    const controller = new AbortController()
    controller.abort()

    const request: ProviderStreamRequest = {
      requestId: 'rid',
      assistantMessageId: 'assistant_1',
      userText: 'hello',
      signal: controller.signal,
      config: {
        model: DEFAULT_OPENROUTER_TEST_MODEL,
        requestedReasoningMode: 'effort',
        requestedReasoningEffort: 'none',
      },
    }

    const events: StarverseStreamEvent[] = []
    for await (const ev of streamViaOpenRouter(request, { apiKey: 'k' })) {
      events.push(ev)
    }

    expect(events.some((e) => e.type === 'stream.abort')).toBe(true)
  })
})
