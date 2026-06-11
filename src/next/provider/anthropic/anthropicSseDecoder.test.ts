import { describe, expect, it } from 'vitest'
import { decodeAnthropicSSE, type AnthropicSSEEvent } from '@/next/provider/anthropic/anthropicSseDecoder'

async function collectEvents(input: string): Promise<AnthropicSSEEvent[]> {
  const events: AnthropicSSEEvent[] = []
  for await (const ev of decodeAnthropicSSE(input)) {
    events.push(ev)
  }
  return events
}

describe('decodeAnthropicSSE', () => {
  it('decodes event + data pair', async () => {
    const input = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet-4-5","role":"assistant","content":[],"usage":{"input_tokens":10,"output_tokens":0}}}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('event')
    if (events[0].type === 'event') {
      expect(events[0].eventType).toBe('message_start')
      expect(events[0].data.type).toBe('message_start')
    }
  })

  it('preserves event type from event: line', async () => {
    const input = [
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    if (events[0].type === 'event') {
      expect(events[0].eventType).toBe('content_block_delta')
    }
  })

  it('falls back to data.type when event: line is missing', async () => {
    const input = [
      'data: {"type":"message_stop"}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    if (events[0].type === 'event') {
      expect(events[0].eventType).toBe('message_stop')
    }
  })

  it('decodes multiple event + data pairs', async () => {
    const input = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet-4-5"}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const eventEvents = events.filter((e) => e.type === 'event')
    expect(eventEvents).toHaveLength(3)
  })

  it('handles comment lines', async () => {
    const input = [
      ': this is a comment',
      'event: message_stop',
      'data: {"type":"message_stop"}',
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
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const eventEvents = events.filter((e) => e.type === 'event')
    expect(eventEvents).toHaveLength(1)
  })

  it('handles JSON parse errors predictably', async () => {
    const input = [
      'event: message_start',
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

  it('handles ping event', async () => {
    const input = [
      'event: ping',
      'data: {"type":"ping"}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    if (events[0].type === 'event') {
      expect(events[0].eventType).toBe('ping')
    }
  })

  it('handles error event', async () => {
    const input = [
      'event: error',
      'data: {"type":"error","error":{"type":"overloaded_error","message":"Too many requests"}}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
    if (events[0].type === 'event') {
      expect(events[0].eventType).toBe('error')
    }
  })

  it('handles data without space after colon', async () => {
    const input = [
      'event: message_stop',
      'data:{"type":"message_stop"}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    expect(events).toHaveLength(1)
  })

  it('full Anthropic SSE fixture', async () => {
    const input = [
      'event: message_start',
      'data: {"type":"message_start","message":{"id":"msg_1","model":"claude-sonnet-4-5","role":"assistant","content":[],"usage":{"input_tokens":50,"output_tokens":0}}}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let me think..."}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","thinking":"sig123"}}',
      '',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":0}',
      '',
      'event: content_block_start',
      'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}',
      '',
      'event: content_block_delta',
      'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"The answer is 42."}}',
      '',
      'event: content_block_stop',
      'data: {"type":"content_block_stop","index":1}',
      '',
      'event: message_delta',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":100,"output_tokens_details":{"thinking_tokens":70}}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n')

    const events = await collectEvents(input)
    const eventEvents = events.filter((e) => e.type === 'event')
    expect(eventEvents).toHaveLength(10)

    // Verify first and last event types
    const first = eventEvents[0]
    const last = eventEvents[eventEvents.length - 1]
    if (first.type === 'event') expect(first.eventType).toBe('message_start')
    if (last.type === 'event') expect(last.eventType).toBe('message_stop')
  })
})
