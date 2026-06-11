import { describe, expect, it } from 'vitest'
import { mapOpenAIResponsesEventToStarverse, type OpenAIResponsesStreamEvent } from '@/next/provider/openai-responses/openaiResponsesStreamMapper'
import type { StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function textDelta(delta: string): OpenAIResponsesStreamEvent {
  return { type: 'response.output_text.delta', delta, item_id: 'item_1', content_index: 0, output_index: 0, sequence_number: 1 }
}

function textDone(text: string): OpenAIResponsesStreamEvent {
  return { type: 'response.output_text.done', text, item_id: 'item_1', content_index: 0, output_index: 0, sequence_number: 2 }
}

function reasoningSummaryDelta(delta: string): OpenAIResponsesStreamEvent {
  return { type: 'response.reasoning_summary_text.delta', delta, item_id: 'item_0', output_index: 0, summary_index: 0, sequence_number: 1 }
}

function reasoningSummaryDone(text: string): OpenAIResponsesStreamEvent {
  return { type: 'response.reasoning_summary_text.done', text, item_id: 'item_0', output_index: 0, summary_index: 0, sequence_number: 2 }
}

function reasoningTextDelta(delta: string): OpenAIResponsesStreamEvent {
  return { type: 'response.reasoning_text.delta', delta, item_id: 'item_0', content_index: 0, output_index: 0, sequence_number: 1 }
}

function reasoningTextDone(text: string): OpenAIResponsesStreamEvent {
  return { type: 'response.reasoning_text.done', text, item_id: 'item_0', content_index: 0, output_index: 0, sequence_number: 2 }
}

function reasoningOutputItemDone(item: Record<string, unknown>): OpenAIResponsesStreamEvent {
  return { type: 'response.output_item.done', item, output_index: 0, sequence_number: 10 }
}

function completedEvent(response: Record<string, unknown>): OpenAIResponsesStreamEvent {
  return { type: 'response.completed', response, sequence_number: 20 }
}

function incompleteEvent(response: Record<string, unknown>): OpenAIResponsesStreamEvent {
  return { type: 'response.incomplete', response, sequence_number: 20 }
}

function failedEvent(response: Record<string, unknown>): OpenAIResponsesStreamEvent {
  return { type: 'response.failed', response, sequence_number: 20 }
}

function errorEvent(error: Record<string, unknown>): OpenAIResponsesStreamEvent {
  return { type: 'error', error, sequence_number: 0 }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mapOpenAIResponsesEventToStarverse', () => {
  const msgId = 'assistant_1'

  // =========================================================================
  // Visible text
  // =========================================================================

  describe('visible text', () => {
    it('maps output text delta to message.text_delta', () => {
      const events = mapOpenAIResponsesEventToStarverse(textDelta('Hello'), msgId)

      expect(events).toHaveLength(1)
      expect(events[0]).toEqual({
        type: 'message.text_delta',
        messageId: msgId,
        choiceIndex: 0,
        text: 'Hello',
      })
    })

    it('does not emit event for output text done', () => {
      const events = mapOpenAIResponsesEventToStarverse(textDone('Hello world'), msgId)
      expect(events).toHaveLength(0)
    })

    it('ignores empty text delta', () => {
      const events = mapOpenAIResponsesEventToStarverse(textDelta(''), msgId)
      expect(events).toHaveLength(0)
    })
  })

  // =========================================================================
  // Reasoning summary
  // =========================================================================

  describe('reasoning summary', () => {
    it('maps reasoning summary delta to message.reasoning_detail', () => {
      const events = mapOpenAIResponsesEventToStarverse(reasoningSummaryDelta('Let me think...'), msgId)

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('message.reasoning_detail')
      if (events[0].type === 'message.reasoning_detail') {
        expect(events[0].detail).toEqual({ type: 'reasoning_summary', text: 'Let me think...' })
        expect(events[0].messageId).toBe(msgId)
      }
    })

    it('does not emit event for reasoning summary done', () => {
      const events = mapOpenAIResponsesEventToStarverse(reasoningSummaryDone('Full summary'), msgId)
      expect(events).toHaveLength(0)
    })

    it('reasoning summary text NEVER becomes visible text', () => {
      const events = mapOpenAIResponsesEventToStarverse(reasoningSummaryDelta('secret reasoning'), msgId)
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)
    })
  })

  // =========================================================================
  // Reasoning text (full content)
  // =========================================================================

  describe('reasoning text', () => {
    it('maps reasoning text delta to message.reasoning_detail', () => {
      const events = mapOpenAIResponsesEventToStarverse(reasoningTextDelta('Step 1: analyze...'), msgId)

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('message.reasoning_detail')
      if (events[0].type === 'message.reasoning_detail') {
        expect(events[0].detail).toEqual({ type: 'reasoning_text', text: 'Step 1: analyze...' })
      }
    })

    it('does not emit event for reasoning text done', () => {
      const events = mapOpenAIResponsesEventToStarverse(reasoningTextDone('Full reasoning'), msgId)
      expect(events).toHaveLength(0)
    })

    it('reasoning text NEVER becomes visible text', () => {
      const events = mapOpenAIResponsesEventToStarverse(reasoningTextDelta('secret reasoning'), msgId)
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)
    })
  })

  // =========================================================================
  // Reasoning output item (opaque artifact)
  // =========================================================================

  describe('reasoning output item', () => {
    it('maps reasoning output item done to message.reasoning_detail', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        reasoningOutputItemDone({
          type: 'reasoning',
          id: 'reasoning_1',
          summary: [{ text: 'I thought about this', type: 'summary_text' }],
          status: 'completed',
        }),
        msgId,
      )

      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('message.reasoning_detail')
      if (events[0].type === 'message.reasoning_detail') {
        const detail = events[0].detail as any
        expect(detail.type).toBe('reasoning_item')
        expect(detail.id).toBe('reasoning_1')
        expect(detail.summary).toEqual([{ text: 'I thought about this', type: 'summary_text' }])
        expect(detail.status).toBe('completed')
      }
    })

    it('preserves encrypted_content in reasoning item artifact', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        reasoningOutputItemDone({
          type: 'reasoning',
          id: 'reasoning_2',
          summary: [],
          encrypted_content: 'base64encodedcontent',
          status: 'completed',
        }),
        msgId,
      )

      expect(events).toHaveLength(1)
      if (events[0].type === 'message.reasoning_detail') {
        const detail = events[0].detail as any
        expect(detail.encrypted_content).toBe('base64encodedcontent')
      }
    })

    it('reasoning item NEVER becomes visible text', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        reasoningOutputItemDone({ type: 'reasoning', id: 'r1', summary: [{ text: 's', type: 'summary_text' }] }),
        msgId,
      )
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)
    })

    it('ignores non-reasoning output item done', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        { type: 'response.output_item.done', item: { type: 'message', id: 'msg_1' }, output_index: 0, sequence_number: 5 },
        msgId,
      )
      expect(events).toHaveLength(0)
    })
  })

  // =========================================================================
  // Mixed ordering
  // =========================================================================

  describe('mixed ordering', () => {
    it('preserves reasoning summary + visible text event order', () => {
      const input: OpenAIResponsesStreamEvent[] = [
        reasoningSummaryDelta('Thinking step 1'),
        reasoningSummaryDelta(' Thinking step 2'),
        textDelta('Here is '),
        textDelta('the answer'),
      ]

      const allEvents: StarverseStreamEvent[] = []
      for (const ev of input) {
        allEvents.push(...mapOpenAIResponsesEventToStarverse(ev, msgId))
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

    it('preserves reasoning text + visible text event order', () => {
      const input: OpenAIResponsesStreamEvent[] = [
        reasoningTextDelta('Full reasoning step 1'),
        textDelta('Visible output'),
      ]

      const allEvents: StarverseStreamEvent[] = []
      for (const ev of input) {
        allEvents.push(...mapOpenAIResponsesEventToStarverse(ev, msgId))
      }

      expect(allEvents[0].type).toBe('message.reasoning_detail')
      expect(allEvents[1].type).toBe('message.text_delta')
    })
  })

  // =========================================================================
  // Usage
  // =========================================================================

  describe('usage', () => {
    it('maps response.completed with usage to usage.delta', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        completedEvent({
          id: 'resp_1',
          model: 'o3',
          status: 'completed',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            total_tokens: 150,
            output_tokens_details: { reasoning_tokens: 30 },
          },
        }),
        msgId,
      )

      const usageEvents = events.filter((e) => e.type === 'usage.delta')
      expect(usageEvents).toHaveLength(1)
      if (usageEvents[0].type === 'usage.delta') {
        expect(usageEvents[0].usage).toEqual({
          input_tokens: 100,
          output_tokens: 50,
          total_tokens: 150,
          output_tokens_details: { reasoning_tokens: 30 },
        })
      }
    })

    it('handles response.completed without usage', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        completedEvent({ id: 'resp_1', model: 'o3', status: 'completed' }),
        msgId,
      )

      const usageEvents = events.filter((e) => e.type === 'usage.delta')
      expect(usageEvents).toHaveLength(0)
    })
  })

  // =========================================================================
  // Completion
  // =========================================================================

  describe('completion', () => {
    it('response.completed emits stream.done', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        completedEvent({ id: 'resp_1', model: 'o3', status: 'completed' }),
        msgId,
      )

      expect(events.some((e) => e.type === 'stream.done')).toBe(true)
    })

    it('response.completed emits meta.delta with id and model', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        completedEvent({ id: 'resp_1', model: 'o3', status: 'completed' }),
        msgId,
      )

      const metaEvents = events.filter((e) => e.type === 'meta.delta')
      expect(metaEvents).toHaveLength(1)
      if (metaEvents[0].type === 'meta.delta') {
        expect(metaEvents[0].meta.id).toBe('resp_1')
        expect(metaEvents[0].meta.model).toBe('o3')
        expect(metaEvents[0].meta.finish_reason).toBe('stop')
      }
    })
  })

  // =========================================================================
  // Errors
  // =========================================================================

  describe('errors', () => {
    it('response.failed yields terminal stream.error', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        failedEvent({
          id: 'resp_1',
          status: 'failed',
          error: { code: 'server_error', message: 'Provider crashed' },
        }),
        msgId,
      )

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].terminal).toBe(true)
      }
    })

    it('response.incomplete yields terminal stream.error', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        incompleteEvent({
          id: 'resp_1',
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
        }),
        msgId,
      )

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].terminal).toBe(true)
      }
    })

    it('plain error event yields terminal stream.error', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        errorEvent({ code: 'invalid_api_key', message: 'bad key' }),
        msgId,
      )

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].terminal).toBe(true)
      }
    })
  })

  // =========================================================================
  // Unknown events
  // =========================================================================

  describe('unknown events', () => {
    it('silently ignores unknown event types', () => {
      const events = mapOpenAIResponsesEventToStarverse(
        { type: 'response.in_progress', response: { id: 'resp_1' } },
        msgId,
      )
      expect(events).toHaveLength(0)
    })

    it('silently ignores lifecycle events', () => {
      for (const type of ['response.created', 'response.queued', 'response.content_part.added', 'response.content_part.done']) {
        const events = mapOpenAIResponsesEventToStarverse({ type }, msgId)
        expect(events).toHaveLength(0)
      }
    })
  })

  // =========================================================================
  // Full o3 reasoning flow
  // =========================================================================

  describe('full o3 reasoning flow', () => {
    it('reasoning summary → text → completed with usage', () => {
      const input: OpenAIResponsesStreamEvent[] = [
        reasoningSummaryDelta('Step 1: '),
        reasoningSummaryDelta('analyze the problem'),
        textDelta('Based on my analysis, '),
        textDelta('the answer is 42.'),
        completedEvent({
          id: 'resp_1',
          model: 'o3',
          status: 'completed',
          usage: {
            input_tokens: 50,
            output_tokens: 100,
            total_tokens: 150,
            output_tokens_details: { reasoning_tokens: 70 },
          },
        }),
      ]

      const allEvents: StarverseStreamEvent[] = []
      for (const ev of input) {
        allEvents.push(...mapOpenAIResponsesEventToStarverse(ev, msgId))
      }

      const reasoningEvents = allEvents.filter((e) => e.type === 'message.reasoning_detail')
      const textEvents = allEvents.filter((e) => e.type === 'message.text_delta')
      const usageEvents = allEvents.filter((e) => e.type === 'usage.delta')
      const doneEvents = allEvents.filter((e) => e.type === 'stream.done')
      const metaEvents = allEvents.filter((e) => e.type === 'meta.delta')

      expect(reasoningEvents).toHaveLength(2)
      expect(textEvents).toHaveLength(2)
      expect(usageEvents).toHaveLength(1)
      expect(doneEvents).toHaveLength(1)
      expect(metaEvents).toHaveLength(1)

      // Reasoning never leaks into text
      for (const te of textEvents) {
        if (te.type === 'message.text_delta') {
          expect(te.text).not.toContain('Step 1')
          expect(te.text).not.toContain('analyze')
        }
      }

      // Usage preserved
      if (usageEvents[0].type === 'usage.delta') {
        expect((usageEvents[0].usage as any).output_tokens_details.reasoning_tokens).toBe(70)
      }
    })
  })
})
