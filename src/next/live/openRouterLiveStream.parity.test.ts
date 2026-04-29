/* eslint-disable max-lines-per-function */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DomainEvent } from '@/next/state/types'
import { streamOpenRouterChatAsEvents } from '@/next/live/openRouterLiveStream'
import { DEFAULT_OPENROUTER_TEST_MODEL } from '@/next/openrouter/openRouterTestModels'

const testModel = DEFAULT_OPENROUTER_TEST_MODEL

/**
 * Comparison scope (stable summary):
 * - Compare: DomainEvent type sequence, terminal type/count, completionClass, endReason,
 *   normalized appError(appPhase/category/grade), final MetaDelta finish_reason/native_finish_reason,
 *   TimingSnapshot appearance order.
 * - Ignore: raw/debug payloads, absolute timestamps, full headers, provider-specific raw details.
 */

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

function streamFromText(text: string, chunkSize = 19): ReadableStream<Uint8Array> {
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

function splitText(text: string, chunkSize = 23): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += chunkSize) {
    out.push(text.slice(i, i + chunkSize))
  }
  return out
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

function assertSummaryParity(input: Readonly<{ fixture: string; fetchSummary: StableSummary; ipcSummary: StableSummary }>) {
  try {
    expect(input.ipcSummary).toEqual(input.fetchSummary)
  } catch {
    throw new Error(
      [
        `parity mismatch for fixture: ${input.fixture}`,
        `fetch summary: ${JSON.stringify(input.fetchSummary, null, 2)}`,
        `ipc summary:   ${JSON.stringify(input.ipcSummary, null, 2)}`,
      ].join('\n')
    )
  }
}

async function collectViaFetch(fixtureText: string, fixtureName: string): Promise<DomainEvent[]> {
  const originalFetch = globalThis.fetch
  const originalElectronStore = (globalThis as any).electronStore
  try {
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
      requestId: `fetch_${fixtureName}`,
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
  }
}

async function collectViaIpc(fixtureText: string, fixtureName: string): Promise<DomainEvent[]> {
  const originalElectronStore = (globalThis as any).electronStore
  const originalIpcRenderer = (globalThis as any).ipcRenderer
  const listeners = new Map<string, Set<(...args: any[]) => void>>()

  const emitTo = (channel: string, ...args: any[]) => {
    const set = listeners.get(channel)
    if (!set) return
    for (const listener of set) listener(...args)
  }

  try {
    ;(globalThis as any).electronStore = {
      get: vi.fn(async (key: string) => {
        if (key === 'netExp.streamInMainProcess') return true
        if (key === 'netExp.tcpKeepAliveIdleMs') return 60000
        return false
      }),
      set: vi.fn(async () => undefined),
    }

    ;(globalThis as any).ipcRenderer = {
      on: vi.fn((channel: string, listener: (...args: any[]) => void) => {
        if (!listeners.has(channel)) listeners.set(channel, new Set())
        listeners.get(channel)?.add(listener)
      }),
      off: vi.fn((channel: string, listener: (...args: any[]) => void) => {
        listeners.get(channel)?.delete(listener)
      }),
      invoke: vi.fn(async (channel: string, payload?: any) => {
        if (channel === 'openrouter:abort') return true
        if (channel !== 'openrouter:stream-chat') return { ok: true }

        const requestId = String(payload?.requestId ?? '')
        const chunkChannel = `openrouter:chunk:${requestId}`
        const endChannel = `openrouter:end:${requestId}`
        const chunkParts = splitText(fixtureText, 23)

        queueMicrotask(() => {
          emitTo(chunkChannel, {}, { type: 'responseMeta', status: 200, requestId, headers: {} })
          for (const part of chunkParts) {
            emitTo(chunkChannel, {}, { type: 'chunk', data: part })
          }
          if (fixtureName === 'wire_end_race.txt') {
            emitTo(chunkChannel, {}, { type: 'end' })
            emitTo(chunkChannel, {}, { type: 'end' })
            emitTo(endChannel, {})
            queueMicrotask(() => {
              emitTo(chunkChannel, {}, { type: 'chunk', data: 'data: {"id":"late"}\n\n' })
            })
            return
          }
          emitTo(chunkChannel, {}, { type: 'end' })
          emitTo(endChannel, {})
        })

        return { ok: true }
      }),
    }

    const events: DomainEvent[] = []
    for await (const event of streamOpenRouterChatAsEvents({
      requestId: `ipc_${fixtureName}`,
      assistantMessageId: 'assistant_fixture',
      userText: 'hello',
      config: { apiKey: 'k', model: testModel, requestedReasoningMode: 'auto' },
    })) {
      events.push(event)
    }
    return events
  } finally {
    ;(globalThis as any).electronStore = originalElectronStore
    ;(globalThis as any).ipcRenderer = originalIpcRenderer
  }
}

describe('streamOpenRouterChatAsEvents parity harness', () => {
  const originalDbBridge = (globalThis as any).dbBridge

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
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
    'keeps stable summary equivalent across fetch/ipc for %s',
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
      ;(globalThis as any).dbBridge = {
        invoke: vi.fn(async (method: string) => {
          if (method === 'settings.getOpenRouterProviderRequireParameters') return { value: false }
          return undefined
        }),
      }

      const fixtureText = readFixtureText(fixture)
      const fetchEvents = await collectViaFetch(fixtureText, fixture)
      const ipcEvents = await collectViaIpc(fixtureText, fixture)
      const fetchSummary = summarize(fetchEvents)
      const ipcSummary = summarize(ipcEvents)

      assertSummaryParity({ fixture, fetchSummary, ipcSummary })

      expect(fetchSummary.terminalCount).toBeLessThanOrEqual(1)
      expect(ipcSummary.terminalCount).toBeLessThanOrEqual(1)
      if (expectedTerminalType !== null) {
        expect(fetchSummary.terminalCount).toBe(1)
        expect(ipcSummary.terminalCount).toBe(1)
      }
      expect(fetchSummary.terminalType).toBe(expectedTerminalType)
      expect(fetchSummary.terminalCount).toBe(expectedTerminalCount)
      expect(fetchSummary.completionClass).toBe(expectedCompletionClass)
      expect(fetchSummary.finalEndReason).toBe(expectedEndReason)
      expect(fetchSummary.appError.appPhase).toBe(expectedAppPhase)
      expect(fetchSummary.appError.category).toBe(expectedCategory)
      expect(fetchSummary.appError.grade).toBe(expectedGrade)
      expect(ipcSummary.terminalType).toBe(expectedTerminalType)
      expect(ipcSummary.terminalCount).toBe(expectedTerminalCount)
      expect(ipcSummary.completionClass).toBe(expectedCompletionClass)
      expect(ipcSummary.finalEndReason).toBe(expectedEndReason)
      expect(ipcSummary.appError.appPhase).toBe(expectedAppPhase)
      expect(ipcSummary.appError.category).toBe(expectedCategory)
      expect(ipcSummary.appError.grade).toBe(expectedGrade)
    }
  )
})
/* eslint-enable max-lines-per-function */
