import { describe, expect, it } from 'vitest'
import { decodeGenericSSE, type GenericSSEEvent } from '@/next/provider/generic/genericSseDecoder'

async function collectEvents(input: string): Promise<GenericSSEEvent[]> {
  const events: GenericSSEEvent[] = []
  for await (const ev of decodeGenericSSE(input)) {
    events.push(ev)
  }
  return events
}

describe('decodeGenericSSE', () => {
  it('decodes single data chunk', async () => {
    const chunk = { choices: [{ index: 0, delta: { content: 'Hi' } }] }
    const input = `data: ${JSON.stringify(chunk)}\n\n`
    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('chunk')
    if (events[0].type === 'chunk') {
      expect(events[0].data.choices?.[0]?.delta?.content).toBe('Hi')
    }
  })

  it('decodes multiple data chunks', async () => {
    const c1 = { choices: [{ delta: { content: 'Hello' } }] }
    const c2 = { choices: [{ delta: { content: ' world' } }] }
    const input = `data: ${JSON.stringify(c1)}\n\ndata: ${JSON.stringify(c2)}\n\ndata: [DONE]\n\n`
    const events = await collectEvents(input)
    const chunks = events.filter((e) => e.type === 'chunk')
    const done = events.filter((e) => e.type === 'done')
    expect(chunks).toHaveLength(2)
    expect(done).toHaveLength(1)
  })

  it('handles [DONE]', async () => {
    const input = 'data: [DONE]\n\n'
    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('done')
  })

  it('handles comment lines', async () => {
    const chunk = { choices: [{ delta: { content: 'Hi' } }] }
    const input = `: comment\ndata: ${JSON.stringify(chunk)}\n\n`
    const events = await collectEvents(input)
    expect(events.filter((e) => e.type === 'comment')).toHaveLength(1)
    expect(events.filter((e) => e.type === 'chunk')).toHaveLength(1)
  })

  it('handles blank lines', async () => {
    const chunk = { choices: [{ delta: { content: 'Hi' } }] }
    const input = `\n\ndata: ${JSON.stringify(chunk)}\n\n\n\n`
    const events = await collectEvents(input)
    expect(events.filter((e) => e.type === 'chunk')).toHaveLength(1)
  })

  it('handles JSON parse errors', async () => {
    const input = 'data: {invalid}\n\n'
    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('parse_error')
  })

  it('handles data without space after colon', async () => {
    const chunk = { choices: [{ delta: { content: 'Hi' } }] }
    const input = `data:${JSON.stringify(chunk)}\n\n`
    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('chunk')
  })

  it('decodes chunk with usage', async () => {
    const chunk = {
      choices: [{ delta: { content: 'Hi' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    }
    const input = `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`
    const events = await collectEvents(input)
    const chunks = events.filter((e) => e.type === 'chunk')
    expect(chunks).toHaveLength(1)
    if (chunks[0].type === 'chunk') {
      expect(chunks[0].data.usage?.prompt_tokens).toBe(10)
    }
  })

  it('decodes chunk with finish_reason', async () => {
    const chunk = { choices: [{ delta: {}, finish_reason: 'stop' }] }
    const input = `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`
    const events = await collectEvents(input)
    const chunks = events.filter((e) => e.type === 'chunk')
    if (chunks[0].type === 'chunk') {
      expect(chunks[0].data.choices?.[0]?.finish_reason).toBe('stop')
    }
  })

  it('full Chat Completions SSE fixture', async () => {
    const input = [
      `data: ${JSON.stringify({ choices: [{ delta: { role: 'assistant' } }] })}`,
      '',
      `data: ${JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] })}`,
      '',
      `data: ${JSON.stringify({ choices: [{ delta: { content: '!' } }] })}`,
      '',
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 2, total_tokens: 7 } })}`,
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    expect(events.filter((e) => e.type === 'chunk')).toHaveLength(4)
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1)
  })
})
