/* eslint-disable max-lines-per-function */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DomainEvent } from '@/next/state/types'
import {
  buildStreamErrorFromAppError,
  mapAppPhaseToEndReason,
  mapAppPhaseToEnvelopePhase,
  streamWireSemanticCore,
} from '@/next/streaming/core'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import type { OpenRouterStreamWireEvent } from '@/shared/ipc/openRouterStreamWire'

const testModel = DEFAULT_OPENROUTER_TEST_MODEL

function readFixtureText(fileName: string): string {
  const fullPath = path.join(process.cwd(), 'src/next/openrouter/sse/fixtures', fileName)
  return fs.readFileSync(fullPath, 'utf8')
}

function bridgeDecodeChunks(text: string, byteChunkSizes: number[]): string[] {
  const bytes = new TextEncoder().encode(text)
  const decoder = new TextDecoder()
  const out: string[] = []
  let offset = 0
  let i = 0
  while (offset < bytes.length) {
    const size = Math.max(1, byteChunkSizes[i % byteChunkSizes.length] ?? 1)
    const nextOffset = Math.min(bytes.length, offset + size)
    const part = decoder.decode(bytes.slice(offset, nextOffset), { stream: true })
    if (part.length > 0) out.push(part)
    offset = nextOffset
    i++
  }
  const tail = decoder.decode()
  if (tail.length > 0) out.push(tail)
  return out
}

function wireEventsFromText(
  text: string,
  options: Readonly<{ status?: number; headers?: Record<string, string>; byteChunkSizes?: number[]; includeEnd?: boolean }> = {}
): OpenRouterStreamWireEvent[] {
  const chunks = bridgeDecodeChunks(text, options.byteChunkSizes ?? [13, 5, 17])
  const out: OpenRouterStreamWireEvent[] = [
    {
      type: 'responseMeta',
      status: options.status ?? 200,
      headers: options.headers ?? {},
      requestId: 'rid_ipc_core',
    },
    ...chunks.map((data) => ({ type: 'chunk', data } satisfies OpenRouterStreamWireEvent)),
  ]
  if (options.includeEnd !== false) out.push({ type: 'end' })
  return out
}

function wireStream(events: readonly unknown[]): AsyncIterable<unknown> {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const event of events) {
        yield event
      }
    },
  }
}

async function collect(events: readonly unknown[]): Promise<DomainEvent[]> {
  const out: DomainEvent[] = []
  for await (const event of streamWireSemanticCore({
    wireEvents: wireStream(events),
    assistantMessageId: 'assistant_fixture',
    requestContext: { model: testModel, stream: true },
    tRequestStart: Date.now(),
    mapAppPhaseToEnvelopePhase,
    mapAppPhaseToEndReason,
    buildStreamErrorFromAppError,
  })) {
    out.push(event)
  }
  return out
}

function terminalEvents(events: DomainEvent[]): DomainEvent[] {
  return events.filter((event) =>
    event.type === 'StreamDone' || event.type === 'StreamAbort' || event.type === 'StreamError'
  )
}

function getFinalEndReason(events: DomainEvent[]): string | null {
  let last: string | null = null
  for (const event of events) {
    if (event.type !== 'TimingSnapshot') continue
    if (typeof event.endReason === 'string') last = event.endReason
  }
  return last
}

function expectSingleProtocolInvalidTerminal(events: DomainEvent[]) {
  const terminals = terminalEvents(events)
  expect(terminals).toHaveLength(1)
  expect(terminals[0]?.type).toBe('StreamError')
  expect(getFinalEndReason(events)).toBe('transport_error')

  const streamError = terminals[0] as Extract<DomainEvent, { type: 'StreamError' }>
  expect(streamError.error?.completionClass).toBe('error')
  expect(streamError.error?.normalized?.normalized?.appPhase).toBe('local_protocol_error')
  expect(streamError.error?.normalized?.normalized?.category).toBe('protocol_invalid')
  expect(streamError.error?.normalized?.normalized?.grade).toBe(3)
}

describe('streamWireSemanticCore', () => {
  it('handles normal wire stream and keeps terminal exactly once', async () => {
    const fixture = readFixtureText('event_multidata_comments.txt')
    const events = await collect(wireEventsFromText(fixture, { headers: { 'x-openrouter-generation-id': 'gen_header' } }))

    expect(events.some((event) => event.type === 'MetaDelta' && event.meta?.id === 'gen_header')).toBe(true)
    expect(events.some((event) => event.type === 'MessageDeltaText')).toBe(true)
    expect(events.some((event) => event.type === 'UsageDelta')).toBe(true)
    expect(terminalEvents(events)).toHaveLength(1)
    expect(terminalEvents(events)[0]?.type).toBe('StreamDone')
  })

  it('keeps wire error priority over EOF protocol_error and emits one terminal only', async () => {
    const fixture = readFixtureText('missing_done_eof.txt')
    const events = await collect([
      ...wireEventsFromText(fixture, { includeEnd: false }),
      { type: 'error', error: { kind: 'transport_error', message: 'socket closed', code: 'ECONNRESET' } },
      { type: 'end' },
    ])

    const terminals = terminalEvents(events)
    expect(terminals).toHaveLength(1)
    expect(terminals[0]?.type).toBe('StreamError')
    const streamError = terminals[0] as Extract<DomainEvent, { type: 'StreamError' }>
    expect(streamError.error?.normalized?.normalized?.appPhase).not.toBe('local_protocol_error')
  })

  it('treats duplicate end as idempotent and keeps one terminal', async () => {
    const fixture = readFixtureText('wire_end_race.txt')
    const events = await collect([...wireEventsFromText(fixture), { type: 'end' }])

    const terminals = terminalEvents(events)
    expect(terminals).toHaveLength(1)
    expect(terminals[0]?.type).toBe('StreamDone')
  })

  it('ignores late chunk after end and closes with protocol_invalid once', async () => {
    const events = await collect([
      {
        type: 'responseMeta',
        status: 200,
        requestId: 'rid_end_race',
        headers: {},
      },
      {
        type: 'chunk',
        data: `data: {"id":"gen_1","model":"${testModel}","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}\n\n`,
      },
      { type: 'end' },
      { type: 'chunk', data: 'data: [DONE]\n\n' },
    ])

    const terminals = terminalEvents(events)
    expect(terminals).toHaveLength(1)
    expect(terminals[0]?.type).toBe('StreamError')
    const streamError = terminals[0] as Extract<DomainEvent, { type: 'StreamError' }>
    expect(streamError.error?.normalized?.normalized?.appPhase).toBe('local_protocol_error')
    expect(streamError.error?.normalized?.normalized?.category).toBe('protocol_invalid')
    expect(streamError.error?.normalized?.normalized?.grade).toBe(3)
  })

  it.each([
    {
      name: 'unknown event type',
      events: [
        { type: 'responseMeta', status: 200, requestId: 'rid_unknown_type', headers: {} },
        { type: 'mystery', data: 'x' },
      ],
    },
    {
      name: 'chunk.data wrong type',
      events: [
        { type: 'responseMeta', status: 200, requestId: 'rid_bad_chunk', headers: {} },
        { type: 'chunk', data: 42 },
      ],
    },
    {
      name: 'responseMeta missing status',
      events: [
        { type: 'responseMeta', requestId: 'rid_missing_status', headers: {} },
      ],
    },
    {
      name: 'error.kind missing',
      events: [
        { type: 'responseMeta', status: 200, requestId: 'rid_error_missing_kind', headers: {} },
        { type: 'error', error: { message: 'oops' } },
      ],
    },
    {
      name: 'error.kind wrong type',
      events: [
        { type: 'responseMeta', status: 200, requestId: 'rid_error_bad_kind', headers: {} },
        { type: 'error', error: { kind: 1, message: 'oops' } },
      ],
    },
    {
      name: 'end arrives before responseMeta',
      events: [{ type: 'end' }],
    },
  ])('maps malformed wire payload to protocol_invalid ($name)', async ({ events }) => {
    const out = await collect(events)
    expectSingleProtocolInvalidTerminal(out)
  })

  it('maps missing responseMeta to protocol_invalid', async () => {
    const events = await collect([
      { type: 'chunk', data: 'data: {"id":"gen_1"}\n\n' },
      { type: 'end' },
    ])

    const terminals = terminalEvents(events)
    expect(terminals).toHaveLength(1)
    expect(terminals[0]?.type).toBe('StreamError')
    const streamError = terminals[0] as Extract<DomainEvent, { type: 'StreamError' }>
    expect(streamError.error?.normalized?.normalized?.appPhase).toBe('local_protocol_error')
    expect(streamError.error?.normalized?.normalized?.category).toBe('protocol_invalid')
    expect(streamError.error?.normalized?.normalized?.grade).toBe(3)
  })

  it('preserves unicode content across wire chunk boundaries', async () => {
    const fixture = readFixtureText('unicode_fragmentation.txt')
    const events = await collect(wireEventsFromText(fixture, { byteChunkSizes: [1, 2, 3, 4, 5] }))
    const textDelta = events.find((event) => event.type === 'MessageDeltaText') as Extract<DomainEvent, { type: 'MessageDeltaText' }> | undefined

    expect(textDelta?.text).toContain('你好🌍')
    expect(terminalEvents(events)).toHaveLength(1)
    expect(terminalEvents(events)[0]?.type).toBe('StreamDone')
  })
})
/* eslint-enable max-lines-per-function */
