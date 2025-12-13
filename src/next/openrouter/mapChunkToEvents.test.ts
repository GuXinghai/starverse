import { describe, expect, it } from 'vitest'
import { mapChunkToEvents } from './mapChunkToEvents'

describe('mapChunkToEvents', () => {
  it('maps delta.content to MessageDeltaText', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: {
        id: 'gen_1',
        model: 'openrouter/auto',
        choices: [{ index: 0, delta: { content: 'hi' } }],
      },
    })
    expect(events.some((e) => e.type === 'MetaDelta')).toBe(true)
    expect(events).toContainEqual({ type: 'MessageDeltaText', messageId: 'm1', choiceIndex: 0, text: 'hi' })
  })

  it('maps delta.reasoning_details to MessageDeltaReasoningDetail (append-only)', () => {
    const details = [{ type: 'reasoning.text', text: 'a' }, { type: 'reasoning.text', text: 'b' }]
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: {
        choices: [{ index: 0, delta: { reasoning_details: details } }],
      },
    })
    const mapped = events.filter((e) => e.type === 'MessageDeltaReasoningDetail')
    expect(mapped.map((e: any) => e.detail)).toEqual(details)
  })

  it('maps non-stream message.reasoning_details', () => {
    const details = [{ type: 'reasoning.text', text: 'x' }]
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: {
        choices: [{ index: 0, message: { content: 'final', reasoning_details: details } }],
      },
    })
    expect(events).toContainEqual({ type: 'MessageDeltaText', messageId: 'm1', choiceIndex: 0, text: 'final' })
    expect(events).toContainEqual({
      type: 'MessageDeltaReasoningDetail',
      messageId: 'm1',
      choiceIndex: 0,
      detail: details[0],
    })
  })

  it('maps usage with empty choices (stream tail)', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { choices: [], usage: { total_tokens: 123 } },
    })
    expect(events).toContainEqual({ type: 'UsageDelta', usage: { total_tokens: 123 } })
  })

  it('maps top-level error to StreamError terminal and does not infer other semantics', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { error: { message: 'oops', code: 'upstream_error' }, choices: [{ finish_reason: 'error' }] },
    })
    expect(events).toContainEqual({
      type: 'StreamError',
      error: { message: 'oops', code: 'upstream_error' },
      terminal: true,
    })
  })

  it('tolerates debug chunk with choices=[] (does not assume choices[0])', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { id: 'gen_dbg_1', model: 'openrouter/auto', choices: [], debug: { echo_upstream_body: { stream: true } } },
    })
    // observable: at minimum, keep generation metadata if present
    expect(events.some((e) => e.type === 'MetaDelta')).toBe(true)
  })

  it('tolerates reasoning_details elements missing text/summary/data (keeps raw object)', () => {
    const detail = { type: 'reasoning.summary', format: 'json', index: 0 }
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { choices: [{ index: 0, delta: { reasoning_details: [detail] } }] },
    })
    expect(events).toContainEqual({
      type: 'MessageDeltaReasoningDetail',
      messageId: 'm1',
      choiceIndex: 0,
      detail,
    })
  })
})
