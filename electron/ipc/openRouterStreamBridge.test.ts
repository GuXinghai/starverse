import { describe, expect, it } from 'vitest'
import { forwardOpenRouterResponseAsWireEvents, validateOpenRouterStreamRequest } from './openRouterStreamBridge'
import { OPENROUTER_STREAM_WIRE_VERSION } from '../../src/shared/ipc/openRouterStreamWire'
import type { OpenRouterStreamWireEvent } from '../../src/shared/ipc/openRouterStreamWire'

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
})
/* eslint-enable max-lines-per-function */
