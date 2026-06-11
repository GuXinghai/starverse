import { describe, expect, it } from 'vitest'
import { decodeDeepSeekSSE, type DeepSeekSSEEvent } from '@/next/provider/deepseek/deepSeekSseDecoder'

async function collectEvents(input: string): Promise<DeepSeekSSEEvent[]> {
  const events: DeepSeekSSEEvent[] = []
  for await (const ev of decodeDeepSeekSSE(input)) {
    events.push(ev)
  }
  return events
}

describe('decodeDeepSeekSSE', () => {
  it('decodes a single JSON data event', async () => {
    const input = 'data: {"id":"gen_1","model":"deepseek-chat","choices":[]}\n\n'
    const events = await collectEvents(input)

    const jsonEvents = events.filter((e) => e.type === 'json')
    expect(jsonEvents).toHaveLength(1)
    if (jsonEvents[0].type === 'json') {
      expect(jsonEvents[0].value.id).toBe('gen_1')
      expect(jsonEvents[0].value.model).toBe('deepseek-chat')
    }
  })

  it('decodes multiple JSON data events', async () => {
    const input = [
      'data: {"id":"gen_1","choices":[{"index":0,"delta":{"content":"hi"},"finish_reason":null}]}',
      '',
      'data: {"id":"gen_1","choices":[{"index":0,"delta":{"content":" there"},"finish_reason":null}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const jsonEvents = events.filter((e) => e.type === 'json')
    const doneEvents = events.filter((e) => e.type === 'done')

    expect(jsonEvents).toHaveLength(2)
    expect(doneEvents).toHaveLength(1)
  })

  it('recognizes [DONE] as done event', async () => {
    const input = 'data: [DONE]\n\n'
    const events = await collectEvents(input)

    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('done')
  })

  it('ignores blank lines between events', async () => {
    const input = [
      '',
      '',
      'data: {"id":"gen_1","choices":[]}',
      '',
      '',
      'data: [DONE]',
      '',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const jsonEvents = events.filter((e) => e.type === 'json')
    const doneEvents = events.filter((e) => e.type === 'done')

    expect(jsonEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(1)
  })

  it('handles comment lines', async () => {
    const input = [
      ': this is a comment',
      'data: {"id":"gen_1","choices":[]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const commentEvents = events.filter((e) => e.type === 'comment')
    const jsonEvents = events.filter((e) => e.type === 'json')
    const doneEvents = events.filter((e) => e.type === 'done')

    expect(commentEvents).toHaveLength(1)
    if (commentEvents[0].type === 'comment') {
      expect(commentEvents[0].text).toBe('this is a comment')
    }
    expect(jsonEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(1)
  })

  it('handles JSON parse errors predictably', async () => {
    const input = 'data: {invalid json}\n\n'
    const events = await collectEvents(input)

    const parseErrors = events.filter((e) => e.type === 'parse_error')
    expect(parseErrors).toHaveLength(1)
    if (parseErrors[0].type === 'parse_error') {
      expect(parseErrors[0].message).toBe('JSON parse failed')
      expect(parseErrors[0].raw).toBe('{invalid json}')
    }
  })

  it('decodes DeepSeek chunk with reasoning_content', async () => {
    const chunk = {
      id: 'gen_1',
      model: 'deepseek-r1',
      choices: [{
        index: 0,
        delta: { reasoning_content: 'thinking...' },
        finish_reason: null,
      }],
    }
    const input = `data: ${JSON.stringify(chunk)}\n\n`
    const events = await collectEvents(input)

    const jsonEvents = events.filter((e) => e.type === 'json')
    expect(jsonEvents).toHaveLength(1)
    if (jsonEvents[0].type === 'json') {
      expect(jsonEvents[0].value.choices?.[0]?.delta?.reasoning_content).toBe('thinking...')
    }
  })

  it('decodes DeepSeek chunk with usage including reasoning_tokens', async () => {
    const chunk = {
      id: 'gen_1',
      model: 'deepseek-r1',
      usage: {
        prompt_tokens: 10,
        completion_tokens: 50,
        total_tokens: 60,
        completion_tokens_details: { reasoning_tokens: 30 },
      },
    }
    const input = `data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`
    const events = await collectEvents(input)

    const jsonEvents = events.filter((e) => e.type === 'json')
    expect(jsonEvents).toHaveLength(1)
    if (jsonEvents[0].type === 'json') {
      expect(jsonEvents[0].value.usage?.completion_tokens_details?.reasoning_tokens).toBe(30)
    }
  })

  it('handles data without space after colon', async () => {
    const input = 'data:{"id":"gen_1","choices":[]}\n\ndata: [DONE]\n\n'
    const events = await collectEvents(input)

    const jsonEvents = events.filter((e) => e.type === 'json')
    expect(jsonEvents).toHaveLength(1)
  })

  it('handles multi-line data fields (joined with newline)', async () => {
    const input = 'data: {"id":"gen_1",\ndata: "choices":[]}\n\ndata: [DONE]\n\n'
    const events = await collectEvents(input)

    const jsonEvents = events.filter((e) => e.type === 'json')
    expect(jsonEvents).toHaveLength(1)
    if (jsonEvents[0].type === 'json') {
      expect(jsonEvents[0].value.id).toBe('gen_1')
    }
  })

  it('full DeepSeek R1 SSE fixture', async () => {
    const input = [
      ': OPENROUTER PROCESSING',
      '',
      'data: {"id":"gen_1","model":"deepseek-r1","choices":[{"index":0,"delta":{"reasoning_content":"Let me think"},"finish_reason":null}]}',
      '',
      'data: {"id":"gen_1","model":"deepseek-r1","choices":[{"index":0,"delta":{"reasoning_content":" about it"},"finish_reason":null}]}',
      '',
      'data: {"id":"gen_1","model":"deepseek-r1","choices":[{"index":0,"delta":{"content":"The answer is 42"},"finish_reason":null}]}',
      '',
      'data: {"id":"gen_1","model":"deepseek-r1","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
      '',
      'data: {"id":"gen_1","model":"deepseek-r1","usage":{"prompt_tokens":10,"completion_tokens":20,"total_tokens":30}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const events = await collectEvents(input)

    const jsonEvents = events.filter((e) => e.type === 'json')
    const doneEvents = events.filter((e) => e.type === 'done')
    const commentEvents = events.filter((e) => e.type === 'comment')

    expect(jsonEvents).toHaveLength(5)
    expect(doneEvents).toHaveLength(1)
    expect(commentEvents).toHaveLength(1)
  })
})
