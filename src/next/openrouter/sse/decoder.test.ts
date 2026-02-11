import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { decodeOpenRouterSSE } from './decoder'

function readFixtureText(fileName: string) {
  const fullPath = path.join(process.cwd(), 'src/next/openrouter/sse/fixtures', fileName)
  return fs.readFileSync(fullPath, 'utf8')
}

async function collect(fileName: string) {
  const text = readFixtureText(fileName)
  const bytes = new TextEncoder().encode(text)

  async function* chunks() {
    // Split into small chunks to exercise boundary handling
    for (let i = 0; i < bytes.length; i += 13) {
      yield bytes.slice(i, i + 13)
    }
  }

  const out: any[] = []
  for await (const ev of decodeOpenRouterSSE(chunks())) out.push(ev)
  return out
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function collectWithRandomChunking(fileName: string, seed: number) {
  const text = readFixtureText(fileName)
  const bytes = new TextEncoder().encode(text)
  const rnd = mulberry32(seed)

  async function* chunks() {
    let i = 0
    while (i < bytes.length) {
      const remaining = bytes.length - i
      const size = Math.max(1, Math.min(remaining, Math.floor(rnd() * 17) + 1))
      yield bytes.slice(i, i + size)
      i += size
    }
  }

  const out: any[] = []
  for await (const ev of decodeOpenRouterSSE(chunks())) out.push(ev)
  return out
}

describe('decodeOpenRouterSSE', () => {
  it('emits comment, parses json, and terminates on [DONE]', async () => {
    const events = await collect('comment_done.txt')
    expect(events[0]).toEqual({ type: 'comment', text: 'OPENROUTER PROCESSING' })
    expect(events.some((e) => e.type === 'json')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('recognizes mid-stream error as terminal and stops (but still emits the error json)', async () => {
    const events = await collect('midstream_error.txt')
    const terminal = events.find((e) => e.type === 'terminal_error')
    expect(terminal).toBeTruthy()
    expect(events.at(-1)?.type).toBe('terminal_error')
    expect(events.some((e) => e.type === 'json' && e.raw && String(e.raw).includes('"error"'))).toBe(true)
  })

  it('treats JSON parse failure as protocol_error and stops', async () => {
    const events = await collect('json_parse_error.txt')
    const protocol = events.find((e) => e.type === 'protocol_error')
    expect(protocol).toBeTruthy()
    expect(events.at(-1)?.type).toBe('protocol_error')
  })

  it('handles debug chunk with choices=[] (no crash)', async () => {
    const events = await collect('debug_choices_empty.txt')
    expect(events.some((e) => e.type === 'json')).toBe(true)
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('random chunking produces identical event sequence (unicode-safe)', async () => {
    const baseline = await collect('unicode_fragmentation.txt')
    const randomized = await collectWithRandomChunking('unicode_fragmentation.txt', 1337)
    expect(randomized).toEqual(baseline)
  })

  it('joins multi data lines with newline and parses as one JSON payload (lock current behavior)', async () => {
    const events = await collect('event_multidata_comments.txt')
    const firstJson = events.find((event) => event.type === 'json') as any
    expect(firstJson).toBeTruthy()
    expect(String(firstJson.raw)).toContain('\n')
    expect(firstJson.value?.choices?.[0]?.delta?.content).toBe('joined')
  })

  it('keeps comment events when comments are interleaved between data events (lock current behavior)', async () => {
    const events = await collect('event_multidata_comments.txt')
    const comments = events
      .filter((event) => event.type === 'comment')
      .map((event) => String((event as any).text))
    expect(comments).toEqual(['OPENROUTER PROCESSING', 'COMMENT INTERLEAVED'])
  })

  it('parses SSE event: lines and keeps them visible without affecting data parsing', async () => {
    const events = await collect('event_multidata_comments.txt')
    const eventNames = events
      .filter((event) => event.type === 'event')
      .map((event) => String((event as any).name))
    expect(eventNames).toEqual(['message', 'usage'])
    expect(events.some((event) => event.type === 'protocol_error')).toBe(false)
    expect(events.filter((event) => event.type === 'json')).toHaveLength(2)
    expect(events.at(-1)).toEqual({ type: 'done' })
  })

  it('emits protocol_error when EOF happens before [DONE]', async () => {
    const events = await collect('missing_done_eof.txt')
    expect(events.some((event) => event.type === 'done')).toBe(false)
    const protocol = events.at(-1) as any
    expect(protocol?.type).toBe('protocol_error')
    expect(String(protocol?.message ?? '')).toContain('[DONE]')
  })
})
