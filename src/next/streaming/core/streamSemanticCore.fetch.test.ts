import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeOpenRouterSSE } from '@/next/openrouter/sse/decoder'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'
import type { DomainEvent } from '@/next/state/types'
import { streamOpenRouterChatAsEvents } from '@/next/live/openRouterLiveStream'
import {
  buildStreamErrorFromAppError,
  mapAppPhaseToEndReason,
  mapAppPhaseToEnvelopePhase,
  streamFetchSemanticCore,
} from '@/next/streaming/core'

const testModel = DEFAULT_OPENROUTER_TEST_MODEL

type TerminalType = 'StreamDone' | 'StreamAbort' | 'StreamError' | null

type StableSummary = Readonly<{
  eventTypes: string[]
  terminalType: TerminalType
  terminalCount: number
  completionClass: string | null
  finalEndReason: string | null
  timingOrder: string[]
  appError: Readonly<{
    appPhase: string | null
    category: string | null
    grade: number | null
  }>
  finalMeta: Readonly<{
    finish_reason: string | null
    native_finish_reason: string | null
  }>
}>

function readFixtureText(fileName: string): string {
  const fullPath = path.join(process.cwd(), 'src/next/openrouter/sse/fixtures', fileName)
  return fs.readFileSync(fullPath, 'utf8')
}

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

function timingMarker(event: DomainEvent): string | null {
  if (event.type !== 'TimingSnapshot') return null
  if (event.endReason) return `end:${event.endReason}`
  if (typeof event.tAck === 'number') return 'ack'
  if (typeof event.tRequestStart === 'number') return 'start'
  return 'timing'
}

function summarize(events: DomainEvent[]): StableSummary {
  const terminalEvents = events.filter((event) =>
    event.type === 'StreamDone' || event.type === 'StreamAbort' || event.type === 'StreamError'
  )
  const terminal = terminalEvents[0] as DomainEvent | undefined

  let terminalType: TerminalType = null
  let completionClass: string | null = null
  let appPhase: string | null = null
  let category: string | null = null
  let grade: number | null = null

  if (terminal?.type === 'StreamDone') {
    terminalType = 'StreamDone'
    completionClass = 'ok'
  } else if (terminal?.type === 'StreamAbort') {
    terminalType = 'StreamAbort'
    completionClass = terminal.envelope?.completionClass ?? null
    const normalized = terminal.envelope?.normalized?.normalized
    appPhase = normalized?.appPhase ?? null
    category = normalized?.category ?? null
    grade = typeof normalized?.grade === 'number' ? normalized.grade : null
  } else if (terminal?.type === 'StreamError') {
    terminalType = 'StreamError'
    completionClass = terminal.error?.completionClass ?? null
    const normalized = terminal.error?.normalized?.normalized
    appPhase = normalized?.appPhase ?? null
    category = normalized?.category ?? null
    grade = typeof normalized?.grade === 'number' ? normalized.grade : null
  }

  let finalFinishReason: string | null = null
  let finalNativeFinishReason: string | null = null
  for (const event of events) {
    if (event.type !== 'MetaDelta') continue
    if (typeof event.meta?.finish_reason === 'string') finalFinishReason = event.meta.finish_reason
    if (typeof event.meta?.native_finish_reason === 'string') finalNativeFinishReason = event.meta.native_finish_reason
  }

  let finalEndReason: string | null = null
  const timingOrder: string[] = []
  for (const event of events) {
    const marker = timingMarker(event)
    if (!marker) continue
    timingOrder.push(marker)
    if (event.type === 'TimingSnapshot' && typeof event.endReason === 'string') {
      finalEndReason = event.endReason
    }
  }

  return {
    eventTypes: events.map((event) => event.type),
    terminalType,
    terminalCount: terminalEvents.length,
    completionClass,
    finalEndReason,
    timingOrder,
    appError: {
      appPhase,
      category,
      grade,
    },
    finalMeta: {
      finish_reason: finalFinishReason,
      native_finish_reason: finalNativeFinishReason,
    },
  }
}

async function collectViaFetch(fixtureText: string, fixtureName: string): Promise<DomainEvent[]> {
  const originalFetch = globalThis.fetch
  const originalElectronStore = (globalThis as any).electronStore
  const originalDbBridge = (globalThis as any).dbBridge
  try {
    ;(globalThis as any).dbBridge = {
      invoke: vi.fn(async (method: string) => {
        if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
        return undefined
      }),
    }
    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'netExp.streamInMainProcess') return false
        if (key === 'netExp.tcpKeepAliveIdleMs') return 60000
        return false
      }),
      set: vi.fn(async () => undefined),
    }
    globalThis.fetch = vi.fn(async () => {
      const body = streamFromText(fixtureText)
      return new Response(body as any, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as any

    const events: DomainEvent[] = []
    for await (const event of streamOpenRouterChatAsEvents({
      requestId: `fetch_core_${fixtureName}`,
      assistantMessageId: 'assistant_fixture',
      userText: 'hello',
      config: { apiKey: 'k', model: testModel, requestedReasoningMode: 'auto' },
    })) {
      events.push(event)
    }
    return events
  } finally {
    globalThis.fetch = originalFetch
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).dbBridge = originalDbBridge
  }
}

async function collectViaCore(fixtureText: string): Promise<DomainEvent[]> {
  const events: DomainEvent[] = []
  for await (const event of streamFetchSemanticCore({
    decodedEvents: decodeOpenRouterSSE(streamFromText(fixtureText)),
    assistantMessageId: 'assistant_fixture',
    requestContext: { model: testModel, stream: true },
    tRequestStart: Date.now(),
    mapAppPhaseToEnvelopePhase,
    mapAppPhaseToEndReason,
    buildStreamErrorFromAppError,
  })) {
    events.push(event)
  }
  return events
}

describe('streamFetchSemanticCore (fetch parity baseline)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    {
      fixture: 'missing_done_eof.txt',
      expectedTerminalType: 'StreamError',
      expectedTerminalCount: 1,
      expectedCompletionClass: 'error',
      expectedEndReason: 'transport_error',
      expectedAppPhase: 'local_protocol_error',
      expectedCategory: 'protocol_invalid',
      expectedGrade: 3,
    },
    {
      fixture: 'event_multidata_comments.txt',
      expectedTerminalType: 'StreamDone',
      expectedTerminalCount: 1,
      expectedCompletionClass: 'ok',
      expectedEndReason: 'normal_complete',
      expectedAppPhase: null,
      expectedCategory: null,
      expectedGrade: null,
    },
    {
      fixture: 'wire_end_race.txt',
      expectedTerminalType: 'StreamDone',
      expectedTerminalCount: 1,
      expectedCompletionClass: 'ok',
      expectedEndReason: 'normal_complete',
      expectedAppPhase: null,
      expectedCategory: null,
      expectedGrade: null,
    },
  ])(
    'produces stable summary compatible with fetch path for %s',
    async ({
      fixture,
      expectedTerminalType,
      expectedTerminalCount,
      expectedCompletionClass,
      expectedEndReason,
      expectedAppPhase,
      expectedCategory,
      expectedGrade,
    }) => {
      const text = readFixtureText(fixture)
      const fetchEvents = await collectViaFetch(text, fixture)
      const coreEvents = await collectViaCore(text)

      const fetchSummary = summarize(fetchEvents)
      const coreSummary = summarize(coreEvents)
      expect(coreSummary).toEqual(fetchSummary)

      expect(coreSummary.terminalType).toBe(expectedTerminalType)
      expect(coreSummary.terminalCount).toBe(expectedTerminalCount)
      expect(coreSummary.completionClass).toBe(expectedCompletionClass)
      expect(coreSummary.finalEndReason).toBe(expectedEndReason)
      expect(coreSummary.appError.appPhase).toBe(expectedAppPhase)
      expect(coreSummary.appError.category).toBe(expectedCategory)
      expect(coreSummary.appError.grade).toBe(expectedGrade)
    }
  )
})
