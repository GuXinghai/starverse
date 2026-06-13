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

  it('characterizes main IPC bridge legacy Authorization and baseUrl request behavior', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const rawKey = 'sk-or-ipc-bridge-legacy-secret'
    const baseUrl = 'https://openrouter-proxy.example.test/custom/v1/'
    const sender = { send: vi.fn() }

    try {
      expect(registerOpenRouterStreamBridge()).toEqual(['openrouter:stream-chat', 'openrouter:abort'])
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
          apiKey: rawKey,
          baseUrl,
          model: 'openrouter/test-model',
          requestedReasoningMode: 'auto',
        },
      })

      expect(result).toEqual({ ok: true })
      expect(electronMock.requestCalls).toHaveLength(1)
      expect((electronMock.requestCalls[0]?.options as any)?.url).toBe(
        'https://openrouter-proxy.example.test/custom/v1/chat/completions'
      )
      expect(electronMock.requestCalls[0]?.headers.Authorization).toBe(`Bearer ${rawKey}`)
      expect(electronMock.requestCalls[0]?.headers['Content-Type']).toBe('application/json')
      expect(electronMock.requestCalls[0]?.headers['HTTP-Referer']).toBe('https://github.com/GuXinghai/starverse')
      expect(electronMock.requestCalls[0]?.headers['X-Title']).toBe('Starverse')

      await vi.waitFor(() => expect(sender.send).toHaveBeenCalled())
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

  it('keeps non-empty IPC SSE wire chunks and bridge logs free of raw credential material', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const encoder = new TextEncoder()
    const rawKey = 'sk-or-ipc-bridge-nonempty-secret'
    const sender = { send: vi.fn() }
    electronMock.responseQueue.push({
      statusCode: 200,
      headers: { 'x-openrouter-generation-id': 'gen_nonempty' },
      chunks: [
        encoder.encode('data: {"id":"gen_nonempty","choices":[{"delta":{"content":"hi"}}]}\n\n'),
        encoder.encode('data: [DONE]\n\n'),
      ],
    })

    try {
      expect(registerOpenRouterStreamBridge()).toEqual(['openrouter:stream-chat', 'openrouter:abort'])
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
          apiKey: rawKey,
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
