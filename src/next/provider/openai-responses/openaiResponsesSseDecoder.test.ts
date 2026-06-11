import { describe, expect, it } from 'vitest'
import { decodeResponsesSSE, type ResponsesSSEEvent } from '@/next/provider/openai-responses/openaiResponsesSseDecoder'

async function collectEvents(input: string): Promise<ResponsesSSEEvent[]> {
  const events: ResponsesSSEEvent[] = []
  for await (const ev of decodeResponsesSSE(input)) {
    events.push(ev)
  }
  return events
}

describe('decodeResponsesSSE', () => {
  it('decodes event + data pair', async () => {
    const input = [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"Hello","item_id":"i1","content_index":0,"output_index":0,"sequence_number":1}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('event')
    if (events[0].type === 'event') {
      expect(events[0].eventType).toBe('response.output_text.delta')
      expect(events[0].data.type).toBe('response.output_text.delta')
      expect((events[0].data as any).delta).toBe('Hello')
    }
  })

  it('preserves event type from event: line', async () => {
    const input = [
      'event: response.completed',
      'data: {"type":"response.completed","response":{"id":"resp_1","model":"o3","status":"completed"},"sequence_number":10}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    if (events[0].type === 'event') {
      expect(events[0].eventType).toBe('response.completed')
    }
  })

  it('falls back to data.type when event: line is missing', async () => {
    const input = [
      'data: {"type":"response.output_text.delta","delta":"Hi"}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    if (events[0].type === 'event') {
      expect(events[0].eventType).toBe('response.output_text.delta')
    }
  })

  it('decodes multiple event + data pairs', async () => {
    const input = [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"Hello"}',
      '',
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":" world"}',
      '',
      'event: response.completed',
      'data: {"type":"response.completed","response":{"id":"resp_1","model":"o3","status":"completed"}}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const eventTypes = events.filter((e) => e.type === 'event')
    expect(eventTypes).toHaveLength(3)
  })

  it('recognizes [DONE]', async () => {
    const input = [
      'event: response.completed',
      'data: {"type":"response.completed","response":{"id":"r1","model":"o3","status":"completed"}}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const doneEvents = events.filter((e) => e.type === 'done')
    const eventEvents = events.filter((e) => e.type === 'event')
    expect(doneEvents).toHaveLength(1)
    expect(eventEvents).toHaveLength(1)
  })

  it('handles comment lines', async () => {
    const input = [
      ': this is a comment',
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"Hi"}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const commentEvents = events.filter((e) => e.type === 'comment')
    const eventEvents = events.filter((e) => e.type === 'event')
    expect(commentEvents).toHaveLength(1)
    if (commentEvents[0].type === 'comment') {
      expect(commentEvents[0].text).toBe('this is a comment')
    }
    expect(eventEvents).toHaveLength(1)
  })

  it('handles blank lines between events', async () => {
    const input = [
      '',
      '',
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"Hi"}',
      '',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const eventEvents = events.filter((e) => e.type === 'event')
    const doneEvents = events.filter((e) => e.type === 'done')
    expect(eventEvents).toHaveLength(1)
    expect(doneEvents).toHaveLength(1)
  })

  it('handles JSON parse errors predictably', async () => {
    const input = [
      'event: response.output_text.delta',
      'data: {invalid json}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const parseErrors = events.filter((e) => e.type === 'parse_error')
    expect(parseErrors).toHaveLength(1)
    if (parseErrors[0].type === 'parse_error') {
      expect(parseErrors[0].message).toBe('JSON parse failed')
    }
  })

  it('handles multi-line data (joined with newline)', async () => {
    const input = [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta",',
      'data: "delta":"Hello"}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    if (events[0].type === 'event') {
      expect((events[0].data as any).delta).toBe('Hello')
    }
  })

  it('full Responses API SSE fixture', async () => {
    const input = [
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":"Hello","item_id":"i1","content_index":0,"output_index":0,"sequence_number":1}',
      '',
      'event: response.reasoning_summary_text.delta',
      'data: {"type":"response.reasoning_summary_text.delta","delta":"Thinking...","item_id":"i0","output_index":0,"summary_index":0,"sequence_number":2}',
      '',
      'event: response.output_text.delta',
      'data: {"type":"response.output_text.delta","delta":" world","item_id":"i1","content_index":0,"output_index":0,"sequence_number":3}',
      '',
      'event: response.completed',
      'data: {"type":"response.completed","response":{"id":"resp_1","model":"o3","status":"completed","usage":{"input_tokens":10,"output_tokens":20,"total_tokens":30}},"sequence_number":4}',
      '',
      'data: [DONE]',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const eventEvents = events.filter((e) => e.type === 'event')
    const doneEvents = events.filter((e) => e.type === 'done')

    expect(eventEvents).toHaveLength(4)
    expect(doneEvents).toHaveLength(1)

    // Verify event types are preserved
    if (eventEvents[0].type === 'event') {
      expect(eventEvents[0].eventType).toBe('response.output_text.delta')
    }
    if (eventEvents[1].type === 'event') {
      expect(eventEvents[1].eventType).toBe('response.reasoning_summary_text.delta')
    }
    if (eventEvents[3].type === 'event') {
      expect(eventEvents[3].eventType).toBe('response.completed')
    }
  })

  it('handles data without space after colon', async () => {
    const input = [
      'event: response.output_text.delta',
      'data:{"type":"response.output_text.delta","delta":"Hi"}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    if (events[0].type === 'event') {
      expect((events[0].data as any).delta).toBe('Hi')
    }
  })
})
