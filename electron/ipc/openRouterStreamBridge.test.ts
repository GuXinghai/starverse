import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OPENROUTER_STREAM_WIRE_VERSION } from '../../src/shared/ipc/openRouterStreamWire'
import type { OpenRouterStreamWireEvent } from '../../src/shared/ipc/openRouterStreamWire'

const electronMock = vi.hoisted(() => {
  const handlers = new Map<string, (event: unknown, payload: unknown) => Promise<unknown> | unknown>()
  const requestCalls: Array<{
    options: unknown
    headers: Record<string, string>
    body: string[]
  }> = []
  const responseQueue: Array<{
    statusCode?: number
    statusMessage?: string
    headers?: Record<string, string | string[] | undefined>
    chunks?: Uint8Array[]
  }> = []

  const ipcMain = {
    handle: vi.fn((channel: string, handler: (event: unknown, payload: unknown) => Promise<unknown> | unknown) => {
      handlers.set(channel, handler)
    }),
  }

  const net = {
    request: vi.fn((options: unknown) => {
      const listeners = new Map<string, (payload: unknown) => void>()
      const call = {
        options,
        headers: {} as Record<string, string>,
        body: [] as string[],
      }
      requestCalls.push(call)

      return {
        setHeader: vi.fn((key: string, value: string) => {
          call.headers[key] = value
        }),
        once: vi.fn((eventName: string, listener: (payload: unknown) => void) => {
          listeners.set(eventName, listener)
        }),
        write: vi.fn((chunk: string) => {
          call.body.push(chunk)
        }),
        end: vi.fn(() => {
          queueMicrotask(() => {
            const queuedResponse = responseQueue.shift()
            listeners.get('response')?.({
              statusCode: queuedResponse?.statusCode ?? 200,
              statusMessage: queuedResponse?.statusMessage,
              headers: queuedResponse?.headers ?? {},
              async *[Symbol.asyncIterator]() {
                for (const chunk of queuedResponse?.chunks ?? []) {
                  yield chunk
                }
              },
            })
          })
        }),
        abort: vi.fn(),
      }
    }),
  }

  return { handlers, ipcMain, net, requestCalls, responseQueue }
})

vi.mock('electron', () => ({
  ipcMain: electronMock.ipcMain,
  net: electronMock.net,
}))

import {
  cleanupOpenRouterStreams,
  forwardOpenRouterResponseAsWireEvents,
  registerOpenRouterStreamBridge,
  validateOpenRouterStreamRequest,
} from './openRouterStreamBridge'

type TestResponseLike = AsyncIterable<Uint8Array> & {
  statusCode?: number
  statusMessage?: string
  headers: Record<string, string | string[] | undefined>
}

type RendererDrainStep =
  | Readonly<{ type: 'wire'; event: OpenRouterStreamWireEvent }>
  | Readonly<{ type: 'end_signal' }>

function responseFromChunks(input: Readonly<{
  statusCode: number
  statusMessage?: string
  headers?: Record<string, string | string[] | undefined>
  chunks: Uint8Array[]
  throwAfterChunks?: Error & { code?: string }
}>): TestResponseLike {
  const response = {
    statusCode: input.statusCode,
    statusMessage: input.statusMessage,
    headers: input.headers ?? {},
    async *[Symbol.asyncIterator]() {
      for (const chunk of input.chunks) {
        yield chunk
      }
      if (input.throwAfterChunks) {
        throw input.throwAfterChunks
      }
    },
  }
  return response
}

function createStore(initial: Record<string, unknown>) {
  const data = new Map<string, unknown>(Object.entries(initial))
  return {
    get: vi.fn((key: string) => data.get(key)),
  } as any
}

function createCredentialService(apiKey?: string) {
  return {
    readApiKey: vi.fn(() => apiKey
      ? { ok: true, providerKey: 'openrouter', apiKey, source: 'secure_store', backend: 'electron_safe_storage', migratedFromLegacy: false, warnings: [] }
      : { ok: false, providerKey: 'openrouter', code: 'credential_missing', message: 'missing', source: 'missing', backend: 'electron_safe_storage', warnings: [] }),
  } as any
}

/**
 * Simulates renderer-side drain behavior in openRouterLiveStream:
 * - consume wire queue in-order
 * - first `end` or an external `end_signal` closes consumption
 * - any later wire chunk is ignored once closed
 */
function simulateRendererWireDrain(steps: RendererDrainStep[]): string[] {
  const queue: OpenRouterStreamWireEvent[] = []
  const consumed: string[] = []
  let closed = false

  const drain = () => {
    while (!closed && queue.length > 0) {
      const event = queue.shift() as OpenRouterStreamWireEvent
      consumed.push(event.type)
      if (event.type === 'end') {
        closed = true
      }
    }
  }

  for (const step of steps) {
    if (closed) break
    if (step.type === 'wire') {
      queue.push(step.event)
      drain()
      continue
    }
    closed = true
  }

  return consumed
}

/* eslint-disable max-lines-per-function */
describe('forwardOpenRouterResponseAsWireEvents', () => {
  beforeEach(() => {
    electronMock.handlers.clear()
    electronMock.requestCalls.length = 0
    electronMock.responseQueue.length = 0
    electronMock.ipcMain.handle.mockClear()
    electronMock.net.request.mockClear()
    cleanupOpenRouterStreams()
  })

  it('emits responseMeta -> chunk(s) -> end for successful stream', async () => {
    const encoder = new TextEncoder()
    const response = responseFromChunks({
      statusCode: 200,
      headers: { 'x-openrouter-generation-id': 'gen_123', 'x-openrouter-provider': 'openai' },
      chunks: [encoder.encode('data: {"id":"gen_123"}\n\n'), encoder.encode('data: [DONE]\n\n')],
    })
    const events: OpenRouterStreamWireEvent[] = []
    const controller = new AbortController()

    await forwardOpenRouterResponseAsWireEvents({
      requestId: 'rid_ok',
      response,
      signal: controller.signal,
      emit: (event) => events.push(event),
    })

    expect(events[0]?.type).toBe('responseMeta')
    if (events[0]?.type === 'responseMeta') {
      expect(events[0].status).toBe(200)
      expect(events[0].requestId).toBe('rid_ok')
      expect(events[0].provider).toBe('openai')
    }
    expect(events.some((event) => event.type === 'chunk')).toBe(true)
    expect(events[events.length - 1]?.type).toBe('end')
  })

  it('emits responseMeta -> error(http_error) -> end for non-2xx', async () => {
    const encoder = new TextEncoder()
    const response = responseFromChunks({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      chunks: [encoder.encode('{"error":{"message":"invalid key"}}')],
    })
    const events: OpenRouterStreamWireEvent[] = []
    const controller = new AbortController()

    await forwardOpenRouterResponseAsWireEvents({
      requestId: 'rid_http_error',
      response,
      signal: controller.signal,
      emit: (event) => events.push(event),
    })

    expect(events.map((event) => event.type)).toEqual(['responseMeta', 'error', 'end'])
    const errorEvent = events[1]
    expect(errorEvent?.type).toBe('error')
    if (errorEvent?.type === 'error') {
      expect(errorEvent.error.kind).toBe('http_error')
      expect(errorEvent.error.status).toBe(401)
    }
  })

  it('emits transport error then end when stream reader throws', async () => {
    const encoder = new TextEncoder()
    const thrown = new Error('socket closed') as Error & { code?: string }
    thrown.code = 'ERR_CONNECTION_CLOSED'
    const response = responseFromChunks({
      statusCode: 200,
      chunks: [encoder.encode('data: {"id":"gen_1"}\n\n')],
      throwAfterChunks: thrown,
    })
    const events: OpenRouterStreamWireEvent[] = []
    const controller = new AbortController()

    await forwardOpenRouterResponseAsWireEvents({
      requestId: 'rid_transport_error',
      response,
      signal: controller.signal,
      emit: (event) => events.push(event),
    })

    expect(events[0]?.type).toBe('responseMeta')
    expect(events[1]?.type).toBe('chunk')
    expect(events[2]?.type).toBe('error')
    if (events[2]?.type === 'error') {
      expect(events[2].error.kind).toBe('transport_error')
      expect(events[2].error.code).toBe('ERR_CONNECTION_CLOSED')
    }
    expect(events[3]?.type).toBe('end')
  })

  it('accepts legacy payload without wireVersion', () => {
    const result = validateOpenRouterStreamRequest({
      requestId: 'rid_legacy',
      config: { apiKey: 'k' },
    })

    expect(result.ok).toBe(true)
  })

  it('accepts resolver-backed legacy_store payload without raw apiKey', () => {
    const result = validateOpenRouterStreamRequest({
      requestId: 'rid_legacy_store',
      wireVersion: OPENROUTER_STREAM_WIRE_VERSION,
      config: { credentialSource: 'legacy_store' },
    })

    expect(result.ok).toBe(true)
  })

  it('rejects unsupported wireVersion as protocol_invalid', () => {
    const result = validateOpenRouterStreamRequest({
      requestId: 'rid_v2',
      wireVersion: OPENROUTER_STREAM_WIRE_VERSION + 1,
      config: { apiKey: 'k' },
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('protocol_invalid')
      expect(result.error).toContain('Unsupported wireVersion')
    }
  })

  it('simulates duplicate end markers in current bridge contract (forward end + bridge tail end)', async () => {
    const encoder = new TextEncoder()
    const response = responseFromChunks({
      statusCode: 200,
      chunks: [encoder.encode('data: {"id":"gen_1"}\n\n')],
    })
    const events: OpenRouterStreamWireEvent[] = []
    const controller = new AbortController()

    await forwardOpenRouterResponseAsWireEvents({
      requestId: 'rid_duplicate_end',
      response,
      signal: controller.signal,
      emit: (event) => events.push(event),
    })

    const steps: RendererDrainStep[] = [
      ...events.map((event) => ({ type: 'wire' as const, event })),
      { type: 'wire', event: { type: 'end' } },
      { type: 'end_signal' },
    ]
    expect(events[events.length - 1]?.type).toBe('end')
    expect(simulateRendererWireDrain(steps)).toEqual(['responseMeta', 'chunk', 'end'])
  })

  it('simulates end/chunk race: once end signal is observed, late chunk is not consumed', async () => {
    const encoder = new TextEncoder()
    const response = responseFromChunks({
      statusCode: 200,
      chunks: [encoder.encode('data: {"id":"gen_1"}\n\n')],
    })
    const events: OpenRouterStreamWireEvent[] = []
    const controller = new AbortController()

    await forwardOpenRouterResponseAsWireEvents({
      requestId: 'rid_end_chunk_race',
      response,
      signal: controller.signal,
      emit: (event) => events.push(event),
    })

    const meta = events.find((event) => event.type === 'responseMeta')
    const chunk = events.find((event) => event.type === 'chunk')
    expect(meta?.type).toBe('responseMeta')
    expect(chunk?.type).toBe('chunk')

    const steps: RendererDrainStep[] = [
      { type: 'wire', event: meta as OpenRouterStreamWireEvent },
      { type: 'wire', event: chunk as OpenRouterStreamWireEvent },
      { type: 'end_signal' },
      { type: 'wire', event: { type: 'chunk', data: 'data: {"id":"late"}\n\n' } },
      { type: 'wire', event: { type: 'end' } },
    ]
    expect(simulateRendererWireDrain(steps)).toEqual(['responseMeta', 'chunk'])
  })

  it('rejects renderer raw credential payloads before net.request', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rawKey = 'sk-or-ipc-bridge-renderer-secret'
    const sender = { send: vi.fn() }

    try {
      expect(registerOpenRouterStreamBridge({
        credentialService: createCredentialService('sk-or-service-secret'),
      })).toEqual(['openrouter:stream-chat', 'openrouter:abort'])
      const handler = electronMock.handlers.get('openrouter:stream-chat')
      expect(handler).toBeTruthy()

      const result = await handler?.({ sender }, {
        requestId: 'rid_ipc_bridge_legacy',
        wireVersion: OPENROUTER_STREAM_WIRE_VERSION,
        userText: 'hello',
        requestBody: {
          model: 'openrouter/test-model',
          stream: true,
          messages: [{ role: 'user', content: 'hello' }],
        },
        config: {
          credentialSource: 'renderer_payload',
          apiKey: rawKey,
          Authorization: `Bearer ${rawKey}`,
          headers: { Authorization: `Bearer ${rawKey}` },
          model: 'openrouter/test-model',
          requestedReasoningMode: 'auto',
        },
      })

      expect(result).toEqual({
        ok: false,
        code: 'credential_source_rejected',
        error: 'Credential source is not allowed.',
        supportedWireVersion: OPENROUTER_STREAM_WIRE_VERSION,
      })
      expect(electronMock.requestCalls).toHaveLength(0)
      expect(sender.send).not.toHaveBeenCalled()

      const serializedLogs = warnSpy.mock.calls.map((call) => call.map(String).join(' ')).join('\n')
      expect(serializedLogs).not.toContain(rawKey)
      expect(serializedLogs).not.toContain(`Bearer ${rawKey}`)
    } finally {
      warnSpy.mockRestore()
      cleanupOpenRouterStreams()
    }
  })

  it('routes main IPC bridge C3 legacy_store credential source through ProviderCredentialService', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rawKey = 'sk-or-ipc-bridge-c3-resolved-secret'
    const store = createStore({
      openRouterBaseUrl: ' https://openrouter.ai/api/v1/ ',
    })
    const credentialService = createCredentialService(rawKey)
    const sender = { send: vi.fn() }

    try {
      expect(registerOpenRouterStreamBridge({ store, credentialService })).toEqual(['openrouter:stream-chat', 'openrouter:abort'])
      const handler = electronMock.handlers.get('openrouter:stream-chat')
      expect(handler).toBeTruthy()

      const result = await handler?.({ sender }, {
        requestId: 'rid_ipc_bridge_c3_resolved',
        wireVersion: OPENROUTER_STREAM_WIRE_VERSION,
        userText: 'hello',
        requestBody: {
          model: 'openrouter/test-model',
          stream: true,
          messages: [{ role: 'user', content: 'hello' }],
        },
        config: {
          credentialSource: 'legacy_store',
          apiKey: 'sk-openrouter-renderer-payload-ignored',
          Authorization: 'Bearer sk-openrouter-renderer-authorization-ignored',
          headers: { Authorization: 'Bearer sk-openrouter-renderer-header-ignored' },
          baseUrl: 'https://ignored-renderer-base.example.test/v1',
          model: 'openrouter/test-model',
          requestedReasoningMode: 'auto',
        },
      } as any)

      expect(result).toEqual({ ok: true })
      expect(credentialService.readApiKey).toHaveBeenCalledWith('openrouter')
      expect(store.get).not.toHaveBeenCalledWith('openRouterApiKey')
      expect(store.get).toHaveBeenCalledWith('openRouterBaseUrl')
      expect(electronMock.requestCalls).toHaveLength(1)
      expect((electronMock.requestCalls[0]?.options as any)?.url).toBe(
        'https://openrouter.ai/api/v1/chat/completions'
      )
      expect(electronMock.requestCalls[0]?.headers.Authorization).toBe(`Bearer ${rawKey}`)
      expect(electronMock.requestCalls[0]?.headers.Authorization).not.toContain('renderer')

      const serializedWireEvents = JSON.stringify(sender.send.mock.calls)
      expect(serializedWireEvents).not.toContain(rawKey)
      expect(serializedWireEvents).not.toContain(`Bearer ${rawKey}`)
      expect(serializedWireEvents).not.toContain('Authorization')
      expect(serializedWireEvents).not.toContain('sk-openrouter-renderer-payload-ignored')

      const serializedLogs = warnSpy.mock.calls.map((call) => call.map(String).join(' ')).join('\n')
      expect(serializedLogs).not.toContain(rawKey)
      expect(serializedLogs).not.toContain(`Bearer ${rawKey}`)
      expect(serializedLogs).toContain('API Key (REDACTED): sk-o...cret')
      expect(serializedLogs).toContain('Authorization: [REDACTED]')
    } finally {
      warnSpy.mockRestore()
      cleanupOpenRouterStreams()
    }
  })

  it('rejects untrusted OpenRouter baseUrl before net.request and never sends Authorization to attacker host', async () => {
    const rawKey = 'sk-or-ipc-bridge-attacker-secret'
    const store = createStore({
      openRouterBaseUrl: 'https://attacker.example.test/custom/v1',
    })
    const credentialService = createCredentialService(rawKey)
    const sender = { send: vi.fn() }

    try {
      expect(registerOpenRouterStreamBridge({ store, credentialService })).toEqual(['openrouter:stream-chat', 'openrouter:abort'])
      const handler = electronMock.handlers.get('openrouter:stream-chat')
      expect(handler).toBeTruthy()

      const result = await handler?.({ sender }, {
        requestId: 'rid_ipc_bridge_attacker_base',
        wireVersion: OPENROUTER_STREAM_WIRE_VERSION,
        requestBody: {
          model: 'openrouter/test-model',
          stream: true,
          messages: [{ role: 'user', content: 'hello' }],
        },
        config: {
          credentialSource: 'legacy_store',
          model: 'openrouter/test-model',
          requestedReasoningMode: 'auto',
        },
      })

      expect(result).toEqual({
        ok: false,
        code: 'base_url_untrusted',
        error: 'OpenRouter base URL is not trusted for the saved official credential.',
        supportedWireVersion: OPENROUTER_STREAM_WIRE_VERSION,
      })
      expect(electronMock.requestCalls).toHaveLength(0)
      expect(sender.send).not.toHaveBeenCalled()
      expect(JSON.stringify(result)).not.toContain(rawKey)
      expect(JSON.stringify(result)).not.toContain('Authorization')
    } finally {
      cleanupOpenRouterStreams()
    }
  })

  it('fails resolver-backed main IPC credential resolution before net.request without leaking raw store values', async () => {
    const rawKey = 'sk-or-ipc-bridge-missing-should-not-leak'
    const store = createStore({
      openRouterBaseUrl: `https://user:pass@example.test/${rawKey}`,
    })
    const credentialService = createCredentialService()
    const sender = { send: vi.fn() }

    try {
      expect(registerOpenRouterStreamBridge({ store, credentialService })).toEqual(['openrouter:stream-chat', 'openrouter:abort'])
      const handler = electronMock.handlers.get('openrouter:stream-chat')
      expect(handler).toBeTruthy()

      const result = await handler?.({ sender }, {
        requestId: 'rid_ipc_bridge_c3_missing',
        wireVersion: OPENROUTER_STREAM_WIRE_VERSION,
        requestBody: {
          model: 'openrouter/test-model',
          stream: true,
          messages: [{ role: 'user', content: 'hello' }],
        },
        config: {
          credentialSource: 'legacy_store',
          model: 'openrouter/test-model',
          requestedReasoningMode: 'auto',
        },
      })

      expect(result).toEqual({
        ok: false,
        code: 'credential_unresolved',
        error: 'Credential could not be resolved.',
        supportedWireVersion: OPENROUTER_STREAM_WIRE_VERSION,
      })
      expect(electronMock.requestCalls).toHaveLength(0)
      expect(sender.send).not.toHaveBeenCalled()
      const serialized = JSON.stringify(result)
      expect(serialized).not.toContain(rawKey)
      expect(serialized).not.toContain(`Bearer ${rawKey}`)
      expect(serialized).not.toContain('Authorization')
      expect(serialized).not.toContain('user:pass')
    } finally {
      cleanupOpenRouterStreams()
    }
  })

  it('keeps non-empty IPC SSE wire chunks and bridge logs free of raw credential material', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const encoder = new TextEncoder()
    const rawKey = 'sk-or-ipc-bridge-nonempty-secret'
    const sender = { send: vi.fn() }
    const credentialService = createCredentialService(rawKey)
    electronMock.responseQueue.push({
      statusCode: 200,
      headers: { 'x-openrouter-generation-id': 'gen_nonempty' },
      chunks: [
        encoder.encode('data: {"id":"gen_nonempty","choices":[{"delta":{"content":"hi"}}]}\n\n'),
        encoder.encode('data: [DONE]\n\n'),
      ],
    })

    try {
      expect(registerOpenRouterStreamBridge({ credentialService })).toEqual(['openrouter:stream-chat', 'openrouter:abort'])
      const handler = electronMock.handlers.get('openrouter:stream-chat')
      expect(handler).toBeTruthy()

      const result = await handler?.({ sender }, {
        requestId: 'rid_ipc_bridge_nonempty',
        wireVersion: OPENROUTER_STREAM_WIRE_VERSION,
        userText: 'hello',
        requestBody: {
          model: 'openrouter/test-model',
          stream: true,
          messages: [{ role: 'user', content: 'hello' }],
        },
        config: {
          credentialSource: 'legacy_store',
          model: 'openrouter/test-model',
          requestedReasoningMode: 'auto',
        },
      })

      expect(result).toEqual({ ok: true })
      await vi.waitFor(() => {
        expect(sender.send.mock.calls.some((call) => JSON.stringify(call).includes('gen_nonempty'))).toBe(true)
      })

      const chunkCalls = sender.send.mock.calls.filter((call) => {
        const event = call[1] as OpenRouterStreamWireEvent | undefined
        return event?.type === 'chunk'
      })
      expect(chunkCalls.length).toBeGreaterThanOrEqual(1)
      expect(JSON.stringify(chunkCalls)).toContain('gen_nonempty')

      const serializedWireEvents = JSON.stringify(sender.send.mock.calls)
      expect(serializedWireEvents).not.toContain(rawKey)
      expect(serializedWireEvents).not.toContain(`Bearer ${rawKey}`)
      expect(serializedWireEvents).not.toContain('Authorization')

      const serializedLogs = warnSpy.mock.calls.map((call) => call.map(String).join(' ')).join('\n')
      expect(serializedLogs).not.toContain(rawKey)
      expect(serializedLogs).not.toContain(`Bearer ${rawKey}`)
      expect(serializedLogs).toContain('API Key (REDACTED): sk-o...cret')
      expect(serializedLogs).toContain('Authorization: [REDACTED]')
    } finally {
      warnSpy.mockRestore()
      cleanupOpenRouterStreams()
    }
  })
})
/* eslint-enable max-lines-per-function */
