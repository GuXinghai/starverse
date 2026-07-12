import { describe, expect, it } from 'vitest'
import { createAnthropicMessagesNativeContentAccumulator } from './anthropicMessagesNativeContentAccumulator'
import type { AnthropicProviderNativeSnapshot } from './anthropicProviderNativeContent'

function start(index: number, contentBlock: Record<string, unknown>) {
  return { type: 'content_block_start', index, content_block: contentBlock }
}

function delta(index: number, deltaBlock: Record<string, unknown>) {
  return { type: 'content_block_delta', index, delta: deltaBlock }
}

function stop(index: number) {
  return { type: 'content_block_stop', index }
}

function finalSnapshot(
  events: ReturnType<ReturnType<typeof createAnthropicMessagesNativeContentAccumulator>['ingestEvent']>,
): AnthropicProviderNativeSnapshot | null {
  const native = events.find((event) => event.type === 'message.provider_native_content_upsert')
  expect(native?.type).toBe('message.provider_native_content_upsert')
  return native && native.type === 'message.provider_native_content_upsert'
    ? native.snapshot as AnthropicProviderNativeSnapshot
    : null
}

describe('AnthropicMessagesNativeContentAccumulator', () => {
  it('preserves content block order across mixed indexed deltas', () => {
    const accumulator = createAnthropicMessagesNativeContentAccumulator({ messageId: 'assistant_1' })
    accumulator.ingestEvent({ type: 'message_start', message: { model: 'claude-sonnet-4-5', usage: { input_tokens: 3 } } })
    accumulator.ingestEvent(start(0, { type: 'thinking', thinking: '' }))
    accumulator.ingestEvent(start(1, { type: 'text', text: '' }))
    accumulator.ingestEvent(start(2, { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: {} }))
    accumulator.ingestEvent(delta(1, { type: 'text_delta', text: 'answer' }))
    accumulator.ingestEvent(delta(0, { type: 'thinking_delta', thinking: 'think' }))
    accumulator.ingestEvent(delta(2, { type: 'input_json_delta', partial_json: '{"q":"x"}' }))
    accumulator.ingestEvent(stop(0))
    accumulator.ingestEvent(stop(1))
    accumulator.ingestEvent(stop(2))
    accumulator.ingestEvent({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 7 } })

    const snapshot = finalSnapshot(accumulator.ingestEvent({ type: 'message_stop' }))

    expect(snapshot?.status).toBe('final')
    expect(snapshot?.content).toEqual([
      { type: 'thinking', thinking: 'think' },
      { type: 'text', text: 'answer' },
      { type: 'tool_use', id: 'toolu_1', name: 'lookup', input: { q: 'x' } },
    ])
    expect(snapshot?.model).toBe('claude-sonnet-4-5')
    expect(snapshot?.stopReason).toBe('tool_use')
    expect(snapshot?.usage).toEqual({ output_tokens: 7 })
  })

  it('appends thinking deltas and writes signature to the same thinking block', () => {
    const accumulator = createAnthropicMessagesNativeContentAccumulator({ messageId: 'assistant_1' })
    accumulator.ingestEvent(start(0, { type: 'thinking', thinking: '' }))
    accumulator.ingestEvent(delta(0, { type: 'thinking_delta', thinking: 'I ' }))
    accumulator.ingestEvent(delta(0, { type: 'thinking_delta', thinking: 'think.' }))
    accumulator.ingestEvent(delta(0, { type: 'signature_delta', signature: 'sig_1' }))
    accumulator.ingestEvent(stop(0))

    const snapshot = finalSnapshot(accumulator.ingestEvent({ type: 'message_stop' }))

    expect(snapshot?.status).toBe('final')
    expect(snapshot?.content).toEqual([
      { type: 'thinking', thinking: 'I think.', signature: 'sig_1' },
    ])
  })

  it('keeps a thinking block with only a signature', () => {
    const accumulator = createAnthropicMessagesNativeContentAccumulator({ messageId: 'assistant_1' })
    accumulator.ingestEvent(start(0, { type: 'thinking', thinking: '' }))
    accumulator.ingestEvent(delta(0, { type: 'signature_delta', signature: 'sig_only' }))
    accumulator.ingestEvent(stop(0))

    const snapshot = finalSnapshot(accumulator.ingestEvent({ type: 'message_stop' }))

    expect(snapshot?.status).toBe('final')
    expect(snapshot?.content).toEqual([
      { type: 'thinking', thinking: '', signature: 'sig_only' },
    ])
  })

  it('preserves redacted_thinking blocks losslessly', () => {
    const accumulator = createAnthropicMessagesNativeContentAccumulator({ messageId: 'assistant_1' })
    accumulator.ingestEvent(start(0, { type: 'redacted_thinking', data: 'opaque-redacted', extra: { keep: true } }))
    accumulator.ingestEvent(stop(0))

    const snapshot = finalSnapshot(accumulator.ingestEvent({ type: 'message_stop' }))

    expect(snapshot?.status).toBe('final')
    expect(snapshot?.content).toEqual([
      { type: 'redacted_thinking', data: 'opaque-redacted', extra: { keep: true } },
    ])
  })

  it('marks snapshot error and keeps partial JSON when tool input parsing fails', () => {
    const accumulator = createAnthropicMessagesNativeContentAccumulator({ messageId: 'assistant_1' })
    accumulator.ingestEvent(start(0, { type: 'tool_use', id: 'toolu_bad', name: 'lookup', input: {} }))
    accumulator.ingestEvent(delta(0, { type: 'input_json_delta', partial_json: '{"q":' }))
    accumulator.ingestEvent(stop(0))

    const snapshot = finalSnapshot(accumulator.ingestEvent({ type: 'message_stop' }))

    expect(snapshot?.status).toBe('error')
    expect(snapshot?.content).toEqual([
      {
        type: 'tool_use',
        id: 'toolu_bad',
        name: 'lookup',
        input: {},
        input_json_partial: '{"q":',
      },
    ])
    expect(snapshot?.diagnostics?.[0]?.type).toBe('input_json_parse_failed')
  })

  it('does not finalize when an index hole exists', () => {
    const accumulator = createAnthropicMessagesNativeContentAccumulator({ messageId: 'assistant_1' })
    accumulator.ingestEvent(start(1, { type: 'text', text: 'late' }))
    accumulator.ingestEvent(stop(1))

    const snapshot = finalSnapshot(accumulator.ingestEvent({ type: 'message_stop' }))

    expect(snapshot?.status).toBe('error')
    expect(snapshot?.diagnostics?.some((item: Record<string, unknown>) => item.type === 'content_block_index_hole')).toBe(true)
  })
})
