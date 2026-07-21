import { describe, expect, it } from 'vitest'
import {
  AnthropicMessagesChatStreamV1,
  AnthropicMessagesNamedSseDecoderV1,
  AnthropicMessagesStreamAssemblerV1,
} from './chatStreamV1'

const encoder = new TextEncoder()

function frame(type: string, value: Record<string, unknown> = { type }): string {
  return `event: ${type}\ndata: ${JSON.stringify({ ...value, type })}\n\n`
}

function startMessage() {
  return frame('message_start', {
    message: {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-5', content: [],
      stop_reason: null, stop_sequence: null,
      usage: {
        cache_creation: null, cache_creation_input_tokens: 4, cache_read_input_tokens: null,
        inference_geo: 'us', input_tokens: 9, output_tokens: 1, output_tokens_details: null,
        server_tool_use: null, service_tier: 'standard',
      },
    },
  })
}

function blockStart(index: number, content_block: Record<string, unknown>) {
  return frame('content_block_start', { index, content_block })
}

function blockDelta(index: number, delta: Record<string, unknown>) {
  return frame('content_block_delta', { index, delta })
}

function blockStop(index: number) { return frame('content_block_stop', { index }) }

function messageDelta(stopReason = 'end_turn') {
  return frame('message_delta', {
    delta: { stop_reason: stopReason, stop_sequence: null },
    usage: { output_tokens: 12 },
  })
}

function messageStop() { return frame('message_stop') }

function completeTextStream(text = 'hello') {
  return startMessage() +
    blockStart(0, { type: 'text', text: '', citations: null }) +
    blockDelta(0, { type: 'text_delta', text }) + blockStop(0) +
    messageDelta() + messageStop()
}

describe('Anthropic Messages named-SSE V1', () => {
  it('assembles a complete multi-block snapshot across arbitrary byte boundaries', () => {
    const stream = new AnthropicMessagesChatStreamV1()
    const wire = startMessage() +
      blockStart(0, { type: 'thinking', thinking: '', signature: '' }) +
      blockDelta(0, { type: 'thinking_delta', thinking: 'reason' }) +
      blockDelta(0, { type: 'signature_delta', signature: 'opaque-' }) +
      blockDelta(0, { type: 'signature_delta', signature: 'signature' }) + blockStop(0) +
      blockStart(1, { type: 'text', text: '', citations: null }) +
      blockDelta(1, { type: 'text_delta', text: 'answer' }) + blockStop(1) +
      blockStart(2, { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: {}, caller: { type: 'direct' } }) +
      blockDelta(2, { type: 'input_json_delta', partial_json: '{"q":' }) +
      blockDelta(2, { type: 'input_json_delta', partial_json: '"x"}' }) + blockStop(2) +
      messageDelta('tool_use') + messageStop()
    const bytes = encoder.encode(wire)
    for (let offset = 0; offset < bytes.length; offset += 7) stream.push(bytes.subarray(offset, offset + 7))

    const snapshot = stream.finish()

    expect(snapshot.status).toBe('final')
    expect(snapshot.model).toBe('claude-sonnet-4-5')
    expect(snapshot.stopReason).toBe('tool_use')
    expect(snapshot.usage).toEqual({
      cache_creation: null, cache_creation_input_tokens: 4, cache_read_input_tokens: null,
      inference_geo: 'us', input_tokens: 9, output_tokens: 12, output_tokens_details: null,
      server_tool_use: null, service_tier: 'standard',
    })
    expect(snapshot.content).toEqual([
      { type: 'thinking', thinking: 'reason', signature: 'opaque-signature' },
      { type: 'text', text: 'answer', citations: null },
      { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: { q: 'x' }, caller: { type: 'direct' } },
    ])
  })

  it('rejects duplicate message_start and duplicate/post-terminal message_stop', () => {
    const duplicateStart = new AnthropicMessagesChatStreamV1()
    expect(() => duplicateStart.push(encoder.encode(startMessage() + startMessage())))
      .toThrow('GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID')

    const duplicateStop = new AnthropicMessagesChatStreamV1()
    expect(() => duplicateStop.push(encoder.encode(completeTextStream() + messageStop())))
      .toThrow('GENERATION_V2_ANTHROPIC_STREAM_TERMINAL_INVALID')
  })

  it('rejects deltas after block stop, duplicate block stop, and index holes', () => {
    for (const suffix of [
      blockStart(0, { type: 'text', text: '' }) + blockStop(0) + blockDelta(0, { type: 'text_delta', text: 'late' }),
      blockStart(0, { type: 'text', text: '' }) + blockStop(0) + blockStop(0),
      blockStart(1, { type: 'text', text: '' }),
    ]) {
      const stream = new AnthropicMessagesChatStreamV1()
      expect(() => stream.push(encoder.encode(startMessage() + suffix)))
        .toThrow('GENERATION_V2_ANTHROPIC_STREAM_SEQUENCE_INVALID')
    }
  })

  it('rejects parse errors, DONE, event/data name mismatch, and unknown non-ping events', () => {
    for (const wire of [
      'event: message_start\ndata: {bad json}\n\n',
      'event: message_stop\ndata: [DONE]\n\n',
      'event: ping\ndata: {"type":"message_stop"}\n\n',
      'event: future_event\ndata: {"type":"future_event"}\n\n',
    ]) {
      const decoder = new AnthropicMessagesNamedSseDecoderV1()
      expect(() => decoder.push(encoder.encode(wire))).toThrow()
    }
  })

  it('allows ping before terminal but rejects every event after message_stop', () => {
    const valid = new AnthropicMessagesChatStreamV1()
    valid.push(encoder.encode(frame('ping') + completeTextStream()))
    expect(valid.finish().status).toBe('final')

    const postTerminal = new AnthropicMessagesChatStreamV1()
    expect(() => postTerminal.push(encoder.encode(completeTextStream() + frame('ping'))))
      .toThrow('GENERATION_V2_ANTHROPIC_STREAM_TERMINAL_INVALID')
  })

  it('rejects unexpected EOF and message_stop before an official stop reason', () => {
    const eof = new AnthropicMessagesChatStreamV1()
    eof.push(encoder.encode(startMessage() + blockStart(0, { type: 'text', text: '' }) + blockStop(0)))
    expect(() => eof.finish()).toThrow('GENERATION_V2_ANTHROPIC_SSE_PREMATURE_EOF')

    const noDelta = new AnthropicMessagesChatStreamV1()
    expect(() => noDelta.push(encoder.encode(
      startMessage() + blockStart(0, { type: 'text', text: '' }) + blockStop(0) + messageStop(),
    ))).toThrow('GENERATION_V2_ANTHROPIC_STREAM_TERMINAL_INVALID')
  })

  it('rejects malformed tool JSON instead of exposing an error/partial snapshot', () => {
    const assembler = new AnthropicMessagesStreamAssemblerV1()
    const decoder = new AnthropicMessagesNamedSseDecoderV1()
    const wire = startMessage() + blockStart(0, { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: {} }) +
      blockDelta(0, { type: 'input_json_delta', partial_json: '{"q":' }) + blockStop(0) +
      messageDelta('tool_use') + messageStop()
    expect(() => {
      for (const event of decoder.push(encoder.encode(wire))) assembler.push(event)
    }).toThrow('GENERATION_V2_ANTHROPIC_STREAM_TERMINAL_INVALID')
  })
})
