import { describe, expect, it } from 'vitest'
import { decodeGeminiSSE, type GeminiSSEEvent } from '@/next/provider/gemini/geminiSseDecoder'

async function collectEvents(input: string): Promise<GeminiSSEEvent[]> {
  const events: GeminiSSEEvent[] = []
  for await (const ev of decodeGeminiSSE(input)) {
    events.push(ev)
  }
  return events
}

describe('decodeGeminiSSE', () => {
  it('decodes single data chunk', async () => {
    const chunk = { candidates: [{ content: { parts: [{ text: 'Hi' }] } }] }
    const input = `data: ${JSON.stringify(chunk)}\n\n`
    const events = await collectEvents(input)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('chunk')
    if (events[0].type === 'chunk') {
      expect(events[0].data.candidates?.[0]?.content?.parts?.[0]?.text).toBe('Hi')
    }
  })

  it('decodes multiple data chunks', async () => {
    const c1 = { candidates: [{ content: { parts: [{ text: 'Hello' }] } }] }
    const c2 = { candidates: [{ content: { parts: [{ text: ' world' }] } }] }
    const input = `data: ${JSON.stringify(c1)}\n\ndata: ${JSON.stringify(c2)}\n\n`
    const events = await collectEvents(input)

    const chunks = events.filter((e) => e.type === 'chunk')
    expect(chunks).toHaveLength(2)
  })

  it('handles comment lines', async () => {
    const chunk = { candidates: [{ content: { parts: [{ text: 'Hi' }] } }] }
    const input = `: comment\ndata: ${JSON.stringify(chunk)}\n\n`
    const events = await collectEvents(input)

    const comments = events.filter((e) => e.type === 'comment')
    const chunks = events.filter((e) => e.type === 'chunk')
    expect(comments).toHaveLength(1)
    expect(chunks).toHaveLength(1)
  })

  it('handles blank lines between chunks', async () => {
    const chunk = { candidates: [{ content: { parts: [{ text: 'Hi' }] } }] }
    const input = `\n\ndata: ${JSON.stringify(chunk)}\n\n\n\n`
    const events = await collectEvents(input)

    const chunks = events.filter((e) => e.type === 'chunk')
    expect(chunks).toHaveLength(1)
  })

  it('handles JSON parse errors', async () => {
    const input = 'data: {invalid json}\n\n'
    const events = await collectEvents(input)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('parse_error')
    if (events[0].type === 'parse_error') {
      expect(events[0].message).toBe('JSON parse failed')
    }
  })

  it('handles data without space after colon', async () => {
    const chunk = { candidates: [{ content: { parts: [{ text: 'Hi' }] } }] }
    const input = `data:${JSON.stringify(chunk)}\n\n`
    const events = await collectEvents(input)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('chunk')
  })

  it('decodes chunk with usageMetadata', async () => {
    const chunk = {
      candidates: [{ content: { parts: [{ text: 'Hi' }] } }],
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
    }
    const input = `data: ${JSON.stringify(chunk)}\n\n`
    const events = await collectEvents(input)

    expect(events).toHaveLength(1)
    if (events[0].type === 'chunk') {
      expect(events[0].data.usageMetadata?.promptTokenCount).toBe(10)
    }
  })

  it('decodes chunk with thought part', async () => {
    const chunk = {
      candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }] } }],
    }
    const input = `data: ${JSON.stringify(chunk)}\n\n`
    const events = await collectEvents(input)

    expect(events).toHaveLength(1)
    if (events[0].type === 'chunk') {
      expect(events[0].data.candidates?.[0]?.content?.parts?.[0]?.thought).toBe(true)
    }
  })

  it('decodes error chunk', async () => {
    const chunk = { error: { code: 429, message: 'Too many requests', status: 'RESOURCE_EXHAUSTED' } }
    const input = `data: ${JSON.stringify(chunk)}\n\n`
    const events = await collectEvents(input)

    expect(events).toHaveLength(1)
    if (events[0].type === 'chunk') {
      expect(events[0].data.error?.code).toBe(429)
    }
  })

  it('full Gemini SSE fixture', async () => {
    const input = [
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'thinking...', thought: true }] } }], usageMetadata: { promptTokenCount: 10 } })}`,
      '',
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Hello!' }] } }] })}`,
      '',
      `data: ${JSON.stringify({ candidates: [{ content: { parts: [] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 } })}`,
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const chunks = events.filter((e) => e.type === 'chunk')
    expect(chunks).toHaveLength(3)
  })
})
