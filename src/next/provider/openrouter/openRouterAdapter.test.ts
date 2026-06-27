import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { DomainEvent } from '@/next/state/types'
import type { StarverseStreamEvent, ProviderStreamRequest } from '@/next/provider/providerTypes'
import { domainEventToStreamEvent, streamEventToDomainEvent } from '@/next/provider/streamEventBridge'
import {
  streamViaOpenRouter,
  streamViaOpenRouterWithCredentialResolver,
  streamViaOpenRouterWithLegacyStoreCredentialSource,
} from '@/next/provider/openrouter/openRouterAdapter'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import { createBearerCredential } from '@/next/provider/credentials/providerCredential'
import {
  providerCredentialResolutionFromCredential,
  type ProviderCredentialRef,
  type ProviderCredentialResolver,
} from '@/next/provider/credentials/providerCredentialResolver'
import {
  providerCredentialResolverFromStore,
  providerCredentialStoreUnavailable,
} from '@/next/provider/credentials/providerCredentialStore'

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
      { type: 'stream.abort', reason: 'user', error: {} as any },
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
      expect(streamEvent.error.provider).toBe('openrouter')
      expect(streamEvent.error.code).toBe('e')
    }
    const roundtripped = streamEventToDomainEvent(streamEvent)
    expect(roundtripped.type).toBe('StreamError')
    if (roundtripped.type === 'StreamError') {
      expect(roundtripped.terminal).toBe(true)
    }
  })

  it('roundtrip losslessly preserves full ErrorEnvelope with truncated completionClass', () => {
    const envelope = {
      phase: 'mid_stream' as const,
      completionClass: 'truncated' as const,
      openrouter: { code: 'length', message: 'max tokens exceeded', metadata: { retry: true }, provider: 'openai' },
      http: { status: 200, statusText: 'OK', headers: { 'x-request-id': 'req_1' } },
      stream: { generation_id: 'gen_1', model: 'gpt-4', provider: 'openai', finish_reason: 'length', chunk_no: 42 },
      context: { model: 'gpt-4', stream: true },
      truncated: true,
      kind: 'mid_stream_sse' as const,
    }
    const original: DomainEvent = { type: 'StreamError', error: envelope as any, terminal: true }
    const streamEvent = domainEventToStreamEvent(original)
    const roundtripped = streamEventToDomainEvent(streamEvent)
    expect(roundtripped.type).toBe('StreamError')
    if (roundtripped.type === 'StreamError') {
      const rt = roundtripped.error as any
      expect(rt.completionClass).toBe('truncated')
      expect(rt.phase).toBe('mid_stream')
      expect(rt.openrouter.code).toBe('length')
      expect(rt.openrouter.message).toBe('max tokens exceeded')
      expect(rt.openrouter.metadata).toEqual({ retry: true })
      expect(rt.openrouter.provider).toBe('openai')
      expect(rt.http.status).toBe(200)
      expect(rt.http.statusText).toBe('OK')
      expect(rt.http.headers['x-request-id']).toBe('req_1')
      expect(rt.stream.generation_id).toBe('gen_1')
      expect(rt.stream.model).toBe('gpt-4')
      expect(rt.context.model).toBe('gpt-4')
      expect(rt.truncated).toBe(true)
      expect(rt.kind).toBe('mid_stream_sse')
    }
  })

  it('roundtrip is exact toEqual for full envelope with normalized', () => {
    const envelope = {
      phase: 'mid_stream' as const,
      completionClass: 'error' as const,
      openrouter: { code: 'rate_limit', message: 'slow down', provider: 'openai' },
      http: { status: 429, statusText: 'Too Many Requests' },
      truncated: false,
      kind: 'mid_stream_sse' as const,
      normalized: {
        normalized: {
          endpoint: 'openrouter',
          transport: 'sse',
          phase: 'mid_stream',
          httpStatus: 429,
          code: 'rate_limit',
          message: 'slow down',
          retryable: true,
          category: 'rate_limit',
          grade: 'error',
        },
      },
    }
    const original: DomainEvent = { type: 'StreamError', error: envelope as any, terminal: true }
    const roundtripped = streamEventToDomainEvent(domainEventToStreamEvent(original))
    expect(roundtripped).toEqual(original)
  })

  it('roundtrip losslessly preserves ErrorEnvelope with completionClass ok', () => {
    const envelope = {
      phase: 'pre_stream' as const,
      completionClass: 'ok' as const,
      openrouter: { code: '200' },
      truncated: false,
      kind: 'pre_stream_http' as const,
    }
    const original: DomainEvent = { type: 'StreamError', error: envelope as any, terminal: true }
    const roundtripped = streamEventToDomainEvent(domainEventToStreamEvent(original))
    if (roundtripped.type === 'StreamError') {
      const rt = roundtripped.error as any
      expect(rt.completionClass).toBe('ok')
      expect(rt.kind).toBe('pre_stream_http')
      expect(rt.truncated).toBe(false)
    }
  })

  it('roundtrip losslessly preserves abort ErrorEnvelope', () => {
    const envelope = {
      phase: 'pre_stream' as const,
      completionClass: 'aborted' as const,
      openrouter: { code: 'aborted', message: 'aborted: user' },
      truncated: false,
      kind: 'aborted' as const,
    }
    const original: DomainEvent = { type: 'StreamAbort', reason: 'user', envelope: envelope as any }
    const streamEvent = domainEventToStreamEvent(original)
    expect(streamEvent.type).toBe('stream.abort')
    const roundtripped = streamEventToDomainEvent(streamEvent)
    expect(roundtripped.type).toBe('StreamAbort')
    if (roundtripped.type === 'StreamAbort') {
      const rt = roundtripped.envelope as any
      expect(rt.completionClass).toBe('aborted')
      expect(rt.kind).toBe('aborted')
      expect(rt.openrouter.code).toBe('aborted')
    }
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
  const credentialRef: ProviderCredentialRef = { kind: 'credential_ref', id: 'openrouter-default' }

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

  function makeRequest(overrides?: Partial<ProviderStreamRequest['config']>): ProviderStreamRequest {
    return {
      requestId: 'rid',
      assistantMessageId: 'assistant_1',
      userText: 'hello',
      config: {
        model: DEFAULT_OPENROUTER_TEST_MODEL,
        requestedReasoningMode: 'auto',
        ...overrides,
      },
    }
  }

  function assertTerminalCredentialFailure(
    events: StarverseStreamEvent[],
    code: string,
  ): void {
    expect(events).toHaveLength(1)
    expect(events[0]?.type).toBe('stream.error')
    expect(events.some((event) => event.type === 'stream.done')).toBe(false)
    if (events[0]?.type === 'stream.error') {
      expect(events[0].terminal).toBe(true)
      expect(events[0].error.provider).toBe('openrouter')
      expect(events[0].error.category).toBe('auth')
      expect(events[0].error.phase).toBe('request_build')
      expect(events[0].error.code).toBe(code)
    }
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

  it('passes text plus image_url content blocks through the OpenRouter chat request body', async () => {
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
        userText: 'Describe this image.',
        currentUserContentBlocks: [
          { type: 'text', text: 'Describe this image.' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' },
            storagePath: 'D:\\Starverse\\storage\\tiny.png',
          } as any,
        ],
        config: {
          model: DEFAULT_OPENROUTER_TEST_MODEL,
          requestedReasoningMode: 'auto',
        },
      }

      for await (const _ of streamViaOpenRouter(request, { apiKey: 'k' })) {
        // consume
      }

      const body = JSON.parse(String(calls[0]?.init?.body ?? '{}'))
      const userMessage = body.messages?.at(-1)
      expect(userMessage?.role).toBe('user')
      expect(userMessage?.content).toEqual([
        { type: 'text', text: 'Describe this image.' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgo=' } },
      ])
      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain('storagePath')
      expect(serialized).not.toContain('D:\\Starverse')
      expect(serialized).not.toContain('blobId')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('preserves legacy Authorization header behavior through adapter facade', async () => {
    const originalFetch = globalThis.fetch
    const calls: any[] = []
    const rawKey = 'sk-or-adapter-legacy-secret'
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

      const events: StarverseStreamEvent[] = []
      for await (const event of streamViaOpenRouter(request, { apiKey: rawKey })) {
        events.push(event)
      }

      expect(calls).toHaveLength(1)
      expect(calls[0]?.init?.headers?.Authorization).toBe(`Bearer ${rawKey}`)
      const serializedEvents = JSON.stringify(events)
      expect(serializedEvents).not.toContain(rawKey)
      expect(serializedEvents).not.toContain(`Bearer ${rawKey}`)
      expect(serializedEvents).not.toContain('Authorization')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('preserves legacy empty-key Authorization behavior through adapter facade', async () => {
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

      const events: StarverseStreamEvent[] = []
      for await (const event of streamViaOpenRouter(request, { apiKey: '' })) {
        events.push(event)
      }

      expect(calls).toHaveLength(1)
      expect(calls[0]?.init?.headers?.Authorization).toBe('Bearer ')
      expect(events.some((event) => event.type === 'stream.done')).toBe(true)
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('preserves legacy baseUrl behavior through adapter facade', async () => {
    const originalFetch = globalThis.fetch
    const calls: any[] = []
    const rawKey = 'sk-or-adapter-baseurl-secret'
    const baseUrl = 'https://openrouter-proxy.example.test/custom/v1/'
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
          baseUrl,
        },
      }

      const events: StarverseStreamEvent[] = []
      for await (const event of streamViaOpenRouter(request, { apiKey: rawKey })) {
        events.push(event)
      }

      expect(calls).toHaveLength(1)
      expect(calls[0]?.url).toBe('https://openrouter-proxy.example.test/custom/v1/chat/completions')
      expect(calls[0]?.init?.headers?.Authorization).toBe(`Bearer ${rawKey}`)
      const serializedEvents = JSON.stringify(events)
      expect(serializedEvents).not.toContain(rawKey)
      expect(serializedEvents).not.toContain(`Bearer ${rawKey}`)
      expect(serializedEvents).not.toContain('Authorization')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('resolver seam sends the same legacy Authorization and baseUrl behavior as raw path', async () => {
    const originalFetch = globalThis.fetch
    const calls: any[] = []
    const rawKey = 'sk-or-openrouter-resolved-secret'
    const baseUrl = 'https://openrouter-proxy.example.test/custom/v1/'
    const resolver: ProviderCredentialResolver = () =>
      providerCredentialResolutionFromCredential(createBearerCredential(rawKey))
    globalThis.fetch = vi.fn(async (url: any, init: any) => {
      calls.push({ url, init })
      const body = streamFromText(fixture)
      return new Response(body as any, { status: 200, headers: { 'x-openrouter-generation-id': 'gen_header' } })
    }) as any

    try {
      const request = makeRequest({ baseUrl })
      const rawEvents: StarverseStreamEvent[] = []
      for await (const event of streamViaOpenRouter(request, { apiKey: rawKey })) {
        rawEvents.push(event)
      }

      const resolvedEvents: StarverseStreamEvent[] = []
      for await (const event of streamViaOpenRouterWithCredentialResolver(request, credentialRef, resolver)) {
        resolvedEvents.push(event)
      }

      expect(calls).toHaveLength(2)
      expect(calls[0]?.url).toBe('https://openrouter-proxy.example.test/custom/v1/chat/completions')
      expect(calls[1]?.url).toBe(calls[0]?.url)
      expect(calls[0]?.init?.headers?.Authorization).toBe(`Bearer ${rawKey}`)
      expect(calls[1]?.init?.headers?.Authorization).toBe(calls[0]?.init?.headers?.Authorization)
      expect(rawEvents.filter((event) => event.type === 'message.text_delta')).toEqual(
        resolvedEvents.filter((event) => event.type === 'message.text_delta'),
      )
      expect(rawEvents.some((event) => event.type === 'stream.done')).toBe(true)
      expect(resolvedEvents.some((event) => event.type === 'stream.done')).toBe(true)
      const serializedEvents = JSON.stringify([rawEvents, resolvedEvents])
      expect(serializedEvents).not.toContain(rawKey)
      expect(serializedEvents).not.toContain(`Bearer ${rawKey}`)
      expect(serializedEvents).not.toContain('Authorization')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('active C3 legacy_store source uses IPC credentialSource without raw apiKey or renderer baseUrl transport', async () => {
    const originalElectronStore = (globalThis as any).electronStore
    const originalElectronApi = (globalThis as any).electronAPI
    const listeners = new Map<string, (...args: any[]) => void>()
    const rawKey = 'sk-or-active-c3-chat-secret'
    const rendererBaseUrl = 'https://renderer-openrouter-proxy.example.test/custom/v1/'
    let startPayload: any = null

    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'netExp.streamInMainProcess') return false
        if (key === 'netExp.tcpKeepAliveIdleMs') return 60000
        return false
      }),
      set: vi.fn(async () => undefined),
    }
    ;(globalThis as any).electronAPI = {
      onOpenRouterChunk: vi.fn((requestId: string, listener: (payload: unknown) => void) => {
        listeners.set(`openrouter:chunk:${requestId}`, listener)
        return () => listeners.delete(`openrouter:chunk:${requestId}`)
      }),
      onOpenRouterEnd: vi.fn((requestId: string, listener: () => void) => {
        listeners.set(`openrouter:end:${requestId}`, listener)
        return () => listeners.delete(`openrouter:end:${requestId}`)
      }),
      startOpenRouterStream: vi.fn(async (payload: any) => {
        startPayload = payload
        queueMicrotask(() => {
          listeners.get(`openrouter:chunk:${payload.requestId}`)?.({
            type: 'responseMeta',
            status: 200,
            requestId: payload.requestId,
          })
          listeners.get(`openrouter:chunk:${payload.requestId}`)?.({
            type: 'chunk',
            data: `data: {"id":"gen_active_c3","model":"${DEFAULT_OPENROUTER_TEST_MODEL}","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}\n\n`,
          })
          listeners.get(`openrouter:chunk:${payload.requestId}`)?.({
            type: 'chunk',
            data: 'data: [DONE]\n\n',
          })
          listeners.get(`openrouter:end:${payload.requestId}`)?.()
        })
        return { ok: true }
      }),
      abortOpenRouterStream: vi.fn(async () => true),
    }

    try {
      const events: StarverseStreamEvent[] = []
      for await (const event of streamViaOpenRouterWithLegacyStoreCredentialSource(makeRequest({ baseUrl: rendererBaseUrl }))) {
        events.push(event)
      }

      expect(startPayload?.config?.credentialSource).toBe('legacy_store')
      expect(startPayload?.config).not.toHaveProperty('apiKey')
      expect(startPayload?.config).not.toHaveProperty('baseUrl')
      expect(JSON.stringify(startPayload)).not.toContain(rawKey)
      expect(JSON.stringify(startPayload)).not.toContain('Authorization')
      expect(events.some((event) => event.type === 'message.text_delta')).toBe(true)
      expect(events.some((event) => event.type === 'stream.done')).toBe(true)
      const serializedEvents = JSON.stringify(events)
      expect(serializedEvents).not.toContain(rawKey)
      expect(serializedEvents).not.toContain(`Bearer ${rawKey}`)
      expect(serializedEvents).not.toContain('Authorization')
    } finally {
      ;(globalThis as any).electronStore = originalElectronStore
      ;(globalThis as any).electronAPI = originalElectronApi
    }
  })

  it('active C3 legacy_store source credential failure emits terminal error and no done before fetch', async () => {
    const originalElectronStore = (globalThis as any).electronStore
    const originalElectronApi = (globalThis as any).electronAPI
    const rawKey = 'sk-or-active-c3-failure-secret'

    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'netExp.streamInMainProcess') return false
        if (key === 'netExp.tcpKeepAliveIdleMs') return 60000
        return false
      }),
      set: vi.fn(async () => undefined),
    }
    ;(globalThis as any).electronAPI = {
      onOpenRouterChunk: vi.fn(() => () => {}),
      onOpenRouterEnd: vi.fn(() => () => {}),
      startOpenRouterStream: vi.fn(async () => ({
        ok: false,
        code: 'credential_unresolved',
        error: `Credential could not be resolved. ${rawKey} Bearer ${rawKey} Authorization`,
      })),
      abortOpenRouterStream: vi.fn(async () => true),
    }

    try {
      const events: StarverseStreamEvent[] = []
      for await (const event of streamViaOpenRouterWithLegacyStoreCredentialSource(makeRequest())) {
        events.push(event)
      }

      expect((globalThis as any).electronAPI.startOpenRouterStream).toHaveBeenCalledTimes(1)
      expect(events.some((event) => event.type === 'stream.done')).toBe(false)
      const lastEvent = events[events.length - 1]
      expect(lastEvent?.type).toBe('stream.error')
      if (lastEvent?.type === 'stream.error') {
        expect(lastEvent.terminal).toBe(true)
      }
      const serializedEvents = JSON.stringify(events)
      expect(serializedEvents).not.toContain(rawKey)
      expect(serializedEvents).not.toContain(`Bearer ${rawKey}`)
      expect(serializedEvents).not.toContain('Authorization')
    } finally {
      ;(globalThis as any).electronStore = originalElectronStore
      ;(globalThis as any).electronAPI = originalElectronApi
    }
  })

  it('resolver seam unresolved credential fails before fetch and emits no done', async () => {
    const originalFetch = globalThis.fetch
    const rawKey = 'sk-or-unresolved-openrouter-secret'
    globalThis.fetch = vi.fn(async () => {
      throw new Error('fetch should not be called')
    }) as any

    try {
      const resolver: ProviderCredentialResolver = () => ({
        ok: false,
        error: {
          code: 'credential_unresolved',
          message: `missing token Authorization: Bearer ${rawKey} headers userinfo https://user:pass@example.test`,
        },
      })
      const events: StarverseStreamEvent[] = []
      for await (const event of streamViaOpenRouterWithCredentialResolver(makeRequest(), credentialRef, resolver)) {
        events.push(event)
      }

      expect(globalThis.fetch).not.toHaveBeenCalled()
      assertTerminalCredentialFailure(events, 'credential_unresolved')
      expect(events[0]?.type).toBe('stream.error')
      expect(events[0]?.type === 'stream.error' ? events[0].error.message : '').toBe('Credential could not be resolved.')
      const serializedEvents = JSON.stringify(events)
      expect(serializedEvents).not.toContain(rawKey)
      expect(serializedEvents).not.toContain(`Bearer ${rawKey}`)
      expect(serializedEvents).not.toContain('Authorization')
      expect(serializedEvents).not.toContain('headers')
      expect(serializedEvents).not.toContain('userinfo')
      expect(serializedEvents).not.toContain('user:pass')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('resolver seam invalid credential fails before fetch and emits no done', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => {
      throw new Error('fetch should not be called')
    }) as any

    try {
      const resolver: ProviderCredentialResolver = () =>
        providerCredentialResolutionFromCredential(createBearerCredential(''))
      const events: StarverseStreamEvent[] = []
      for await (const event of streamViaOpenRouterWithCredentialResolver(makeRequest(), credentialRef, resolver)) {
        events.push(event)
      }

      expect(globalThis.fetch).not.toHaveBeenCalled()
      assertTerminalCredentialFailure(events, 'credential_invalid')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('resolver seam store unavailable fails safely before fetch and emits no done', async () => {
    const originalFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => {
      throw new Error('fetch should not be called')
    }) as any

    try {
      const resolver = providerCredentialResolverFromStore({
        getCredential: () => providerCredentialStoreUnavailable(),
      })
      const events: StarverseStreamEvent[] = []
      for await (const event of streamViaOpenRouterWithCredentialResolver(makeRequest(), credentialRef, resolver)) {
        events.push(event)
      }

      expect(globalThis.fetch).not.toHaveBeenCalled()
      assertTerminalCredentialFailure(events, 'credential_unresolved')
    } finally {
      globalThis.fetch = originalFetch
    }
  })

  it('resolver seam thrown resolver errors fail safely before fetch and emit no done', async () => {
    const originalFetch = globalThis.fetch
    const rawKey = 'sk-or-thrown-openrouter-secret'
    globalThis.fetch = vi.fn(async () => {
      throw new Error('fetch should not be called')
    }) as any

    try {
      const resolver: ProviderCredentialResolver = () => {
        throw new Error(`resolver exploded with ${rawKey}`)
      }
      const events: StarverseStreamEvent[] = []
      for await (const event of streamViaOpenRouterWithCredentialResolver(makeRequest(), credentialRef, resolver)) {
        events.push(event)
      }

      expect(globalThis.fetch).not.toHaveBeenCalled()
      assertTerminalCredentialFailure(events, 'credential_unresolved')
      const serializedEvents = JSON.stringify(events)
      expect(serializedEvents).not.toContain(rawKey)
      expect(serializedEvents).not.toContain(`Bearer ${rawKey}`)
      expect(serializedEvents).not.toContain('Authorization')
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
