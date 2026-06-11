import { describe, expect, it } from 'vitest'
import { mapAnthropicStreamEventToStarverse, type AnthropicStreamEvent } from '@/next/provider/anthropic/anthropicStreamMapper'
import type { StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function messageStartEvent(message: Record<string, unknown>): AnthropicStreamEvent {
  return { type: 'message_start', message }
}

function textDeltaEvent(text: string, index = 0): AnthropicStreamEvent {
  return { type: 'content_block_delta', index, delta: { type: 'text_delta', text } }
}

function thinkingDeltaEvent(thinking: string, index = 0): AnthropicStreamEvent {
  return { type: 'content_block_delta', index, delta: { type: 'thinking_delta', thinking } }
}

function signatureDeltaEvent(signature: string, index = 0): AnthropicStreamEvent {
  return { type: 'content_block_delta', index, delta: { type: 'signature_delta', signature } }
}

function inputJsonDeltaEvent(partialJson: string, index = 0): AnthropicStreamEvent {
  return { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: partialJson } }
}

function messageDeltaEvent(delta: Record<string, unknown>, usage?: Record<string, unknown>): AnthropicStreamEvent {
  return { type: 'message_delta', delta, ...(usage ? { usage } : {}) }
}

function messageStopEvent(): AnthropicStreamEvent {
  return { type: 'message_stop' }
}

function errorEvent(error: Record<string, unknown>): AnthropicStreamEvent {
  return { type: 'error', error }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mapAnthropicStreamEventToStarverse', () => {
  const msgId = 'assistant_1'

  // =========================================================================
  // Text
  // =========================================================================

  describe('text', () => {
    it('maps text_delta to message.text_delta', () => {
      const events = mapAnthropicStreamEventToStarverse(textDeltaEvent('Hello'), msgId)

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({
        type: 'message.text_delta',
        messageId: msgId,
        choiceIndex: 0,
        text: 'Hello',
      })
    })

    it('ignores empty text_delta', () => {
      const events = mapAnthropicStreamEventToStarverse(textDeltaEvent(''), msgId)
      expect(events).toHaveLength(0)
    })
  })

  // =========================================================================
  // Thinking
  // =========================================================================

  describe('thinking', () => {
    it('maps thinking_delta to message.reasoning_detail', () => {
      const events = mapAnthropicStreamEventToStarverse(thinkingDeltaEvent('Let me think...'), msgId)

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('message.reasoning_detail')
      if (events[0].type === 'message.reasoning_detail') {
        expect(events[0].detail).toEqual({ type: 'thinking_delta', thinking: 'Let me think...' })
        expect(events[0].messageId).toBe(msgId)
      }
    })

    it('thinking NEVER becomes visible text', () => {
      const events = mapAnthropicStreamEventToStarverse(thinkingDeltaEvent('secret thinking'), msgId)
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)
    })

    it('ignores empty thinking_delta', () => {
      const events = mapAnthropicStreamEventToStarverse(thinkingDeltaEvent(''), msgId)
      expect(events).toHaveLength(0)
    })
  })

  // =========================================================================
  // Signature
  // =========================================================================

  describe('signature', () => {
    it('maps signature_delta to message.reasoning_detail', () => {
      const events = mapAnthropicStreamEventToStarverse(signatureDeltaEvent('abc123sig'), msgId)

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('message.reasoning_detail')
      if (events[0].type === 'message.reasoning_detail') {
        expect(events[0].detail).toEqual({ type: 'signature_delta', signature: 'abc123sig' })
      }
    })

    it('signature NEVER becomes visible text', () => {
      const events = mapAnthropicStreamEventToStarverse(signatureDeltaEvent('sig'), msgId)
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)
    })

    it('ignores empty signature_delta', () => {
      const events = mapAnthropicStreamEventToStarverse(signatureDeltaEvent(''), msgId)
      expect(events).toHaveLength(0)
    })
  })

  // =========================================================================
  // Mixed ordering
  // =========================================================================

  describe('mixed ordering', () => {
    it('preserves thinking_delta + text_delta event order', () => {
      const input: AnthropicStreamEvent[] = [
        thinkingDeltaEvent('Step 1'),
        thinkingDeltaEvent(' Step 2'),
        textDeltaEvent('Here is '),
        textDeltaEvent('the answer'),
      ]

      const allEvents: StarverseStreamEvent[] = []
      for (const ev of input) {
        allEvents.push(...mapAnthropicStreamEventToStarverse(ev, msgId))
      }

      const reasoningEvents = allEvents.filter((e) => e.type === 'message.reasoning_detail')
      const textEvents = allEvents.filter((e) => e.type === 'message.text_delta')

      expect(reasoningEvents).toHaveLength(2)
      expect(textEvents).toHaveLength(2)

      // Reasoning appears before text
      const lastReasoningIdx = allEvents.lastIndexOf(reasoningEvents[reasoningEvents.length - 1])
      const firstTextIdx = allEvents.indexOf(textEvents[0])
      expect(lastReasoningIdx).toBeLessThan(firstTextIdx)
    })

    it('preserves thinking + signature + text order', () => {
      const input: AnthropicStreamEvent[] = [
        thinkingDeltaEvent('thinking...'),
        signatureDeltaEvent('sig123'),
        textDeltaEvent('answer'),
      ]

      const allEvents: StarverseStreamEvent[] = []
      for (const ev of input) {
        allEvents.push(...mapAnthropicStreamEventToStarverse(ev, msgId))
      }

      expect(allEvents[0].type).toBe('message.reasoning_detail')
      expect(allEvents[1].type).toBe('message.reasoning_detail')
      expect(allEvents[2].type).toBe('message.text_delta')
    })
  })

  // =========================================================================
  // Usage
  // =========================================================================

  describe('usage', () => {
    it('message_start with usage emits usage.delta', () => {
      const events = mapAnthropicStreamEventToStarverse(
        messageStartEvent({
          id: 'msg_1',
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 100, output_tokens: 0 },
        }),
        msgId,
      )

      const usageEvents = events.filter((e) => e.type === 'usage.delta')
      expect(usageEvents).toHaveLength(1)
      if (usageEvents[0].type === 'usage.delta') {
        expect((usageEvents[0].usage as any).input_tokens).toBe(100)
      }
    })

    it('message_delta with usage emits usage.delta', () => {
      const events = mapAnthropicStreamEventToStarverse(
        messageDeltaEvent(
          { stop_reason: 'end_turn' },
          { output_tokens: 50, output_tokens_details: { thinking_tokens: 20 } },
        ),
        msgId,
      )

      const usageEvents = events.filter((e) => e.type === 'usage.delta')
      expect(usageEvents).toHaveLength(1)
      if (usageEvents[0].type === 'usage.delta') {
        expect((usageEvents[0].usage as any).output_tokens).toBe(50)
        expect((usageEvents[0].usage as any).output_tokens_details.thinking_tokens).toBe(20)
      }
    })

    it('both message_start and message_delta usage events are emitted', () => {
      const input: AnthropicStreamEvent[] = [
        messageStartEvent({
          id: 'msg_1',
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 100, output_tokens: 0 },
        }),
        messageDeltaEvent(
          { stop_reason: 'end_turn' },
          { output_tokens: 50 },
        ),
      ]

      const allEvents: StarverseStreamEvent[] = []
      for (const ev of input) {
        allEvents.push(...mapAnthropicStreamEventToStarverse(ev, msgId))
      }

      const usageEvents = allEvents.filter((e) => e.type === 'usage.delta')
      expect(usageEvents).toHaveLength(2)
    })
  })

  // =========================================================================
  // Stop reason / completion
  // =========================================================================

  describe('stop reason / completion', () => {
    it('message_delta with stop_reason emits meta.delta with normalized reason', () => {
      const events = mapAnthropicStreamEventToStarverse(
        messageDeltaEvent({ stop_reason: 'end_turn' }),
        msgId,
      )

      const metaEvents = events.filter((e) => e.type === 'meta.delta')
      expect(metaEvents).toHaveLength(1)
      if (metaEvents[0].type === 'meta.delta') {
        expect(metaEvents[0].meta.finish_reason).toBe('end_turn')
        expect(metaEvents[0].meta.native_finish_reason).toBe('end_turn')
      }
    })

    it('normalizes known stop reasons', () => {
      for (const reason of ['end_turn', 'max_tokens', 'stop_sequence', 'tool_use', 'pause_turn', 'refusal']) {
        const events = mapAnthropicStreamEventToStarverse(
          messageDeltaEvent({ stop_reason: reason }),
          msgId,
        )
        const meta = events.find((e) => e.type === 'meta.delta')
        expect(meta).toBeTruthy()
        if (meta?.type === 'meta.delta') {
          expect(meta.meta.finish_reason).toBe(reason)
        }
      }
    })

    it('normalizes unknown stop_reason to unknown', () => {
      const events = mapAnthropicStreamEventToStarverse(
        messageDeltaEvent({ stop_reason: 'future_reason' }),
        msgId,
      )

      const meta = events.find((e) => e.type === 'meta.delta')
      expect(meta).toBeTruthy()
      if (meta?.type === 'meta.delta') {
        expect(meta.meta.finish_reason).toBe('unknown')
        expect(meta.meta.native_finish_reason).toBe('future_reason')
      }
    })

    it('message_stop emits stream.done', () => {
      const events = mapAnthropicStreamEventToStarverse(messageStopEvent(), msgId)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('stream.done')
    })

    it('full completion: message_delta + message_stop emits exactly one stream.done', () => {
      const input: AnthropicStreamEvent[] = [
        messageDeltaEvent({ stop_reason: 'end_turn' }, { output_tokens: 10 }),
        messageStopEvent(),
      ]

      const allEvents: StarverseStreamEvent[] = []
      for (const ev of input) {
        allEvents.push(...mapAnthropicStreamEventToStarverse(ev, msgId))
      }

      const doneEvents = allEvents.filter((e) => e.type === 'stream.done')
      expect(doneEvents).toHaveLength(1)
    })
  })

  // =========================================================================
  // Error
  // =========================================================================

  describe('error', () => {
    it('error event yields terminal stream.error', () => {
      const events = mapAnthropicStreamEventToStarverse(
        errorEvent({ type: 'overloaded_error', message: 'Too many requests' }),
        msgId,
      )

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].terminal).toBe(true)
      }
    })

    it('error uses error.type as code when available', () => {
      const events = mapAnthropicStreamEventToStarverse(
        errorEvent({ type: 'overloaded_error', message: 'slow down' }),
        msgId,
      )

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      if (errorEvents[0].type === 'stream.error') {
        expect((errorEvents[0].error as any).openrouter.code).toBe('overloaded_error')
      }
    })

    it('error falls back to error.code when type is missing', () => {
      const events = mapAnthropicStreamEventToStarverse(
        errorEvent({ code: 'rate_limited', message: 'slow down' }),
        msgId,
      )

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      if (errorEvents[0].type === 'stream.error') {
        expect((errorEvents[0].error as any).openrouter.code).toBe('rate_limited')
      }
    })
  })

  // =========================================================================
  // Tool input JSON
  // =========================================================================

  describe('tool input JSON', () => {
    it('input_json_delta does not become visible text', () => {
      const events = mapAnthropicStreamEventToStarverse(
        inputJsonDeltaEvent('{"city":'),
        msgId,
      )

      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)
    })

    it('input_json_delta produces no events at all', () => {
      const events = mapAnthropicStreamEventToStarverse(
        inputJsonDeltaEvent('{"city":"NYC"}'),
        msgId,
      )
      expect(events).toHaveLength(0)
    })
  })

  // =========================================================================
  // Content block lifecycle
  // =========================================================================

  describe('content block lifecycle', () => {
    it('content_block_start produces no visible text', () => {
      const events = mapAnthropicStreamEventToStarverse(
        { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
        msgId,
      )
      expect(events).toHaveLength(0)
    })

    it('content_block_stop produces no visible text', () => {
      const events = mapAnthropicStreamEventToStarverse(
        { type: 'content_block_stop', index: 0 },
        msgId,
      )
      expect(events).toHaveLength(0)
    })
  })

  // =========================================================================
  // Unknown events
  // =========================================================================

  describe('unknown events', () => {
    it('silently ignores ping event', () => {
      const events = mapAnthropicStreamEventToStarverse({ type: 'ping' }, msgId)
      expect(events).toHaveLength(0)
    })

    it('silently ignores unknown event types', () => {
      const events = mapAnthropicStreamEventToStarverse({ type: 'future_event' }, msgId)
      expect(events).toHaveLength(0)
    })
  })

  // =========================================================================
  // Full Claude thinking flow
  // =========================================================================

  describe('full Claude thinking flow', () => {
    it('thinking → signature → text → stop_reason → usage → message_stop', () => {
      const input: AnthropicStreamEvent[] = [
        messageStartEvent({
          id: 'msg_1',
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 50, output_tokens: 0 },
        }),
        thinkingDeltaEvent('Let me analyze this...'),
        thinkingDeltaEvent(' The answer is 42.'),
        signatureDeltaEvent('sig_abc123'),
        textDeltaEvent('The answer is 42.'),
        messageDeltaEvent(
          { stop_reason: 'end_turn' },
          { output_tokens: 100, output_tokens_details: { thinking_tokens: 70 } },
        ),
        messageStopEvent(),
      ]

      const allEvents: StarverseStreamEvent[] = []
      for (const ev of input) {
        allEvents.push(...mapAnthropicStreamEventToStarverse(ev, msgId))
      }

      const reasoningEvents = allEvents.filter((e) => e.type === 'message.reasoning_detail')
      const textEvents = allEvents.filter((e) => e.type === 'message.text_delta')
      const usageEvents = allEvents.filter((e) => e.type === 'usage.delta')
      const metaEvents = allEvents.filter((e) => e.type === 'meta.delta')
      const doneEvents = allEvents.filter((e) => e.type === 'stream.done')

      // Exact counts
      expect(reasoningEvents).toHaveLength(3) // 2 thinking + 1 signature
      expect(textEvents).toHaveLength(1)
      expect(usageEvents).toHaveLength(2) // message_start + message_delta
      expect(doneEvents).toHaveLength(1)

      // Reasoning never leaks into text
      if (textEvents[0].type === 'message.text_delta') {
        expect(textEvents[0].text).toBe('The answer is 42.')
      }

      // Stop reason present
      const stopMeta = metaEvents.find((e) => e.type === 'meta.delta' && e.meta.finish_reason === 'end_turn')
      expect(stopMeta).toBeTruthy()

      // Usage has thinking tokens
      const deltaUsage = usageEvents.find((e) => e.type === 'usage.delta' && (e.usage as any).output_tokens_details)
      expect(deltaUsage).toBeTruthy()
      if (deltaUsage?.type === 'usage.delta') {
        expect((deltaUsage.usage as any).output_tokens_details.thinking_tokens).toBe(70)
      }
    })
  })
})
