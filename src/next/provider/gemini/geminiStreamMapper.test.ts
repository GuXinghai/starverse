import { describe, expect, it } from 'vitest'
import { mapGeminiStreamChunkToStarverse, type GeminiStreamChunk } from '@/next/provider/gemini/geminiStreamMapper'
import type { StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function textChunk(text: string, modelVersion?: string): GeminiStreamChunk {
  return {
    candidates: [{ content: { parts: [{ text }], role: 'model' }, index: 0 }],
    ...(modelVersion ? { modelVersion } : {}),
  }
}

function thoughtChunk(text: string): GeminiStreamChunk {
  return {
    candidates: [{ content: { parts: [{ text, thought: true }], role: 'model' }, index: 0 }],
  }
}

function mixedChunk(thoughtText: string, visibleText: string): GeminiStreamChunk {
  return {
    candidates: [{
      content: {
        parts: [
          { text: thoughtText, thought: true },
          { text: visibleText },
        ],
        role: 'model',
      },
      index: 0,
    }],
  }
}

function finishChunk(finishReason: string): GeminiStreamChunk {
  return {
    candidates: [{ content: { parts: [] }, finishReason, index: 0 }],
  }
}

function usageChunk(usage: GeminiStreamChunk['usageMetadata']): GeminiStreamChunk {
  return { usageMetadata: usage }
}

function errorChunk(code: number, message: string, status?: string): GeminiStreamChunk {
  return { error: { code, message, ...(status ? { status } : {}) } }
}

function functionCallChunk(name: string, args?: unknown): GeminiStreamChunk {
  return {
    candidates: [{ content: { parts: [{ functionCall: { name, args } }], role: 'model' }, index: 0 }],
  }
}

function safetyChunk(): GeminiStreamChunk {
  return {
    candidates: [{
      content: { parts: [{ text: 'response text' }], role: 'model' },
      safetyRatings: [
        { category: 'HARM_CATEGORY_HARASSMENT', probability: 'NEGLIGIBLE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'LOW' },
      ],
      index: 0,
    }],
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mapGeminiStreamChunkToStarverse', () => {
  const msgId = 'assistant_1'

  // =========================================================================
  // Visible text
  // =========================================================================

  describe('visible text', () => {
    it('maps text part to message.text_delta', () => {
      const events = mapGeminiStreamChunkToStarverse(textChunk('Hello'), msgId)

      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(1)
      if (textEvents[0].type === 'message.text_delta') {
        expect(textEvents[0].text).toBe('Hello')
        expect(textEvents[0].messageId).toBe(msgId)
        expect(textEvents[0].choiceIndex).toBe(0)
      }
    })

    it('ignores empty text part', () => {
      const events = mapGeminiStreamChunkToStarverse(textChunk(''), msgId)
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)
    })

    it('handles multiple text parts in one chunk', () => {
      const chunk: GeminiStreamChunk = {
        candidates: [{
          content: { parts: [{ text: 'Hello ' }, { text: 'world' }], role: 'model' },
          index: 0,
        }],
      }
      const events = mapGeminiStreamChunkToStarverse(chunk, msgId)
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(2)
    })
  })

  // =========================================================================
  // Thinking / thought
  // =========================================================================

  describe('thinking / thought', () => {
    it('maps thought part to message.reasoning_detail', () => {
      const events = mapGeminiStreamChunkToStarverse(thoughtChunk('Let me think...'), msgId)

      const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
      expect(reasoningEvents).toHaveLength(1)
      if (reasoningEvents[0].type === 'message.reasoning_detail') {
        expect(reasoningEvents[0].detail).toEqual({ type: 'thought', text: 'Let me think...' })
        expect(reasoningEvents[0].messageId).toBe(msgId)
      }
    })

    it('thought NEVER becomes visible text', () => {
      const events = mapGeminiStreamChunkToStarverse(thoughtChunk('secret thinking'), msgId)
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)
    })

    it('ignores empty thought part', () => {
      const events = mapGeminiStreamChunkToStarverse(thoughtChunk(''), msgId)
      const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
      expect(reasoningEvents).toHaveLength(0)
    })

    it('preserves mixed thought + text order', () => {
      const events = mapGeminiStreamChunkToStarverse(mixedChunk('thinking...', 'visible answer'), msgId)

      const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
      const textEvents = events.filter((e) => e.type === 'message.text_delta')

      expect(reasoningEvents).toHaveLength(1)
      expect(textEvents).toHaveLength(1)

      // Reasoning comes before text
      const reasoningIdx = events.indexOf(reasoningEvents[0])
      const textIdx = events.indexOf(textEvents[0])
      expect(reasoningIdx).toBeLessThan(textIdx)
    })
  })

  // =========================================================================
  // Candidate handling
  // =========================================================================

  describe('candidate handling', () => {
    it('uses first candidate (candidates[0])', () => {
      const chunk: GeminiStreamChunk = {
        candidates: [
          { content: { parts: [{ text: 'first' }] }, index: 0 },
          { content: { parts: [{ text: 'second' }] }, index: 1 },
        ],
      }
      const events = mapGeminiStreamChunkToStarverse(chunk, msgId)
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(1)
      if (textEvents[0].type === 'message.text_delta') {
        expect(textEvents[0].text).toBe('first')
      }
    })

    it('handles missing candidates gracefully', () => {
      const events = mapGeminiStreamChunkToStarverse({ usageMetadata: { promptTokenCount: 10 } }, msgId)
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)
    })

    it('handles empty candidates array', () => {
      const events = mapGeminiStreamChunkToStarverse({ candidates: [] }, msgId)
      expect(events).toHaveLength(0)
    })

    it('handles candidate with no content', () => {
      const events = mapGeminiStreamChunkToStarverse({ candidates: [{ index: 0 }] }, msgId)
      expect(events).toHaveLength(0)
    })
  })

  // =========================================================================
  // Finish reason
  // =========================================================================

  describe('finish reason', () => {
    it('maps STOP to meta.delta + stream.done', () => {
      const events = mapGeminiStreamChunkToStarverse(finishChunk('STOP'), msgId)

      const metaEvents = events.filter((e) => e.type === 'meta.delta')
      const doneEvents = events.filter((e) => e.type === 'stream.done')

      expect(metaEvents).toHaveLength(1)
      if (metaEvents[0].type === 'meta.delta') {
        expect(metaEvents[0].meta.finish_reason).toBe('stop')
        expect(metaEvents[0].meta.native_finish_reason).toBe('STOP')
      }
      expect(doneEvents).toHaveLength(1)
    })

    it('maps MAX_TOKENS to meta.delta + stream.done', () => {
      const events = mapGeminiStreamChunkToStarverse(finishChunk('MAX_TOKENS'), msgId)

      const metaEvents = events.filter((e) => e.type === 'meta.delta')
      expect(metaEvents).toHaveLength(1)
      if (metaEvents[0].type === 'meta.delta') {
        expect(metaEvents[0].meta.finish_reason).toBe('max_tokens')
      }
    })

    it('maps SAFETY to meta.delta + stream.done', () => {
      const events = mapGeminiStreamChunkToStarverse(finishChunk('SAFETY'), msgId)

      const metaEvents = events.filter((e) => e.type === 'meta.delta')
      expect(metaEvents).toHaveLength(1)
      if (metaEvents[0].type === 'meta.delta') {
        expect(metaEvents[0].meta.finish_reason).toBe('safety')
      }
    })

    it('normalizes unknown finish reason', () => {
      const events = mapGeminiStreamChunkToStarverse(finishChunk('FUTURE_REASON'), msgId)

      const metaEvents = events.filter((e) => e.type === 'meta.delta')
      expect(metaEvents).toHaveLength(1)
      if (metaEvents[0].type === 'meta.delta') {
        expect(metaEvents[0].meta.finish_reason).toBe('unknown')
        expect(metaEvents[0].meta.native_finish_reason).toBe('FUTURE_REASON')
      }
    })

    it('finish chunk emits exactly one stream.done', () => {
      const events = mapGeminiStreamChunkToStarverse(finishChunk('STOP'), msgId)
      const doneEvents = events.filter((e) => e.type === 'stream.done')
      expect(doneEvents).toHaveLength(1)
    })
  })

  // =========================================================================
  // Usage metadata
  // =========================================================================

  describe('usage metadata', () => {
    it('maps usageMetadata to usage.delta', () => {
      const events = mapGeminiStreamChunkToStarverse(
        usageChunk({ promptTokenCount: 100, candidatesTokenCount: 50, totalTokenCount: 150 }),
        msgId,
      )

      const usageEvents = events.filter((e) => e.type === 'usage.delta')
      expect(usageEvents).toHaveLength(1)
      if (usageEvents[0].type === 'usage.delta') {
        expect(usageEvents[0].usage).toEqual({
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        })
      }
    })

    it('includes thoughtsTokenCount when present', () => {
      const events = mapGeminiStreamChunkToStarverse(
        usageChunk({ promptTokenCount: 10, candidatesTokenCount: 40, totalTokenCount: 50, thoughtsTokenCount: 30 }),
        msgId,
      )

      const usageEvents = events.filter((e) => e.type === 'usage.delta')
      expect(usageEvents).toHaveLength(1)
      if (usageEvents[0].type === 'usage.delta') {
        expect((usageEvents[0].usage as any).thoughtsTokenCount).toBe(30)
      }
    })

    it('handles missing usageMetadata', () => {
      const events = mapGeminiStreamChunkToStarverse(textChunk('hi'), msgId)
      const usageEvents = events.filter((e) => e.type === 'usage.delta')
      expect(usageEvents).toHaveLength(0)
    })
  })

  // =========================================================================
  // Safety / block metadata
  // =========================================================================

  describe('safety / block metadata', () => {
    it('safety ratings do not become visible text', () => {
      const events = mapGeminiStreamChunkToStarverse(safetyChunk(), msgId)

      // The text part should still be visible text
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(1)

      // Safety ratings are not mapped to events (no safety policy system)
      const metaEvents = events.filter((e) => e.type === 'meta.delta' && (e.meta as any).safetyRatings)
      expect(metaEvents).toHaveLength(0)
    })

    it('promptFeedback blockReason emits meta.delta and does not become visible text', () => {
      const chunk: GeminiStreamChunk = {
        promptFeedback: {
          blockReason: 'SAFETY',
          safetyRatings: [{ category: 'HARM_CATEGORY_HARASSMENT', probability: 'HIGH' }],
        },
      }
      const events = mapGeminiStreamChunkToStarverse(chunk, msgId)

      // No visible text
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)

      // Meta with block reason
      const metaEvents = events.filter((e) => e.type === 'meta.delta')
      expect(metaEvents).toHaveLength(1)
      if (metaEvents[0].type === 'meta.delta') {
        expect(metaEvents[0].meta.native_finish_reason).toBe('BLOCKED:SAFETY')
      }
    })

    it('promptFeedback without blockReason emits no meta', () => {
      const chunk: GeminiStreamChunk = {
        promptFeedback: {
          safetyRatings: [{ category: 'HARM_CATEGORY_HARASSMENT', probability: 'NEGLIGIBLE' }],
        },
      }
      const events = mapGeminiStreamChunkToStarverse(chunk, msgId)
      const metaEvents = events.filter((e) => e.type === 'meta.delta')
      expect(metaEvents).toHaveLength(0)
    })
  })

  // =========================================================================
  // Error
  // =========================================================================

  describe('error', () => {
    it('error chunk yields terminal stream.error', () => {
      const events = mapGeminiStreamChunkToStarverse(errorChunk(429, 'Too many requests', 'RESOURCE_EXHAUSTED'), msgId)

      const errorEvents = events.filter((e) => e.type === 'stream.error')
      expect(errorEvents).toHaveLength(1)
      if (errorEvents[0].type === 'stream.error') {
        expect(errorEvents[0].terminal).toBe(true)
      }
    })

    it('error chunk produces no other events', () => {
      const events = mapGeminiStreamChunkToStarverse(errorChunk(500, 'Internal error'), msgId)
      expect(events).toHaveLength(1)
      expect(events[0].type).toBe('stream.error')
    })

    it('error chunk does not emit stream.done', () => {
      const events = mapGeminiStreamChunkToStarverse(errorChunk(400, 'Bad request'), msgId)
      const doneEvents = events.filter((e) => e.type === 'stream.done')
      expect(doneEvents).toHaveLength(0)
    })
  })

  // =========================================================================
  // Tool / function-call parts
  // =========================================================================

  describe('tool / function-call parts', () => {
    it('functionCall part does not become visible text', () => {
      const events = mapGeminiStreamChunkToStarverse(
        functionCallChunk('get_weather', { city: 'NYC' }),
        msgId,
      )

      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)
    })

    it('functionCall part produces no events', () => {
      const events = mapGeminiStreamChunkToStarverse(
        functionCallChunk('get_weather'),
        msgId,
      )
      // No tool delta shape, no text, no reasoning
      const nonUsageEvents = events.filter((e) => e.type !== 'usage.delta')
      expect(nonUsageEvents).toHaveLength(0)
    })

    it('functionResponse part does not become visible text', () => {
      const chunk: GeminiStreamChunk = {
        candidates: [{
          content: { parts: [{ functionResponse: { name: 'get_weather', response: { temp: 72 } } }], role: 'model' },
          index: 0,
        }],
      }
      const events = mapGeminiStreamChunkToStarverse(chunk, msgId)
      const textEvents = events.filter((e) => e.type === 'message.text_delta')
      expect(textEvents).toHaveLength(0)
    })

    it('functionResponse part produces no events', () => {
      const chunk: GeminiStreamChunk = {
        candidates: [{
          content: { parts: [{ functionResponse: { name: 'get_weather', response: { temp: 72 } } }], role: 'model' },
          index: 0,
        }],
      }
      const events = mapGeminiStreamChunkToStarverse(chunk, msgId)
      expect(events).toHaveLength(0)
    })
  })

  // =========================================================================
  // Unknown events
  // =========================================================================

  describe('unknown / empty', () => {
    it('empty chunk produces no events', () => {
      const events = mapGeminiStreamChunkToStarverse({}, msgId)
      expect(events).toHaveLength(0)
    })

    it('chunk with only modelVersion produces no events', () => {
      const events = mapGeminiStreamChunkToStarverse({ modelVersion: 'gemini-2.5-pro' }, msgId)
      expect(events).toHaveLength(0)
    })
  })

  // =========================================================================
  // Full Gemini thinking flow
  // =========================================================================

  describe('full Gemini thinking flow', () => {
    it('thought → text → finishReason → usage → done', () => {
      const chunks: GeminiStreamChunk[] = [
        {
          candidates: [{
            content: { parts: [{ text: 'Let me analyze this...', thought: true }], role: 'model' },
            index: 0,
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 0, totalTokenCount: 10 },
        },
        {
          candidates: [{
            content: { parts: [{ text: ' The answer is 42.', thought: true }], role: 'model' },
            index: 0,
          }],
        },
        {
          candidates: [{
            content: { parts: [{ text: 'The answer is 42.' }], role: 'model' },
            index: 0,
          }],
        },
        {
          candidates: [{
            content: { parts: [] },
            finishReason: 'STOP',
            index: 0,
          }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 40, totalTokenCount: 50, thoughtsTokenCount: 30 },
        },
      ]

      const allEvents: StarverseStreamEvent[] = []
      for (const chunk of chunks) {
        allEvents.push(...mapGeminiStreamChunkToStarverse(chunk, msgId))
      }

      const reasoningEvents = allEvents.filter((e) => e.type === 'message.reasoning_detail')
      const textEvents = allEvents.filter((e) => e.type === 'message.text_delta')
      const usageEvents = allEvents.filter((e) => e.type === 'usage.delta')
      const metaEvents = allEvents.filter((e) => e.type === 'meta.delta')
      const doneEvents = allEvents.filter((e) => e.type === 'stream.done')

      // Exact counts
      expect(reasoningEvents).toHaveLength(2)
      expect(textEvents).toHaveLength(1)
      expect(usageEvents).toHaveLength(2) // two chunks with usage
      expect(doneEvents).toHaveLength(1)

      // Reasoning never leaks into text
      if (textEvents[0].type === 'message.text_delta') {
        expect(textEvents[0].text).toBe('The answer is 42.')
      }

      // Stop reason
      const stopMeta = metaEvents.find((e) => e.type === 'meta.delta' && e.meta.finish_reason === 'stop')
      expect(stopMeta).toBeTruthy()

      // Usage includes thought tokens
      const lastUsage = usageEvents[usageEvents.length - 1]
      if (lastUsage.type === 'usage.delta') {
        expect((lastUsage.usage as any).thoughtsTokenCount).toBe(30)
      }
    })
  })
})
