import { describe, expect, it } from 'vitest'
import { mapDeepSeekChunkToEvents, type DeepSeekChunk } from '@/next/provider/deepseek/deepSeekStreamMapper'
import type { StarverseStreamEvent } from '@/next/provider/providerTypes'

// ---------------------------------------------------------------------------
// DeepSeek stream mapper — fixture-based tests
//
// These tests verify DeepSeek-specific quirks:
// - reasoning_content → reasoning event (NEVER visible text)
// - content → visible text event
// - Order preservation for mixed reasoning + text
// - finish_reason → meta + done semantics
// ---------------------------------------------------------------------------

function textChunk(id: string, model: string, content: string): DeepSeekChunk {
  return {
    id,
    model,
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  }
}

function reasoningChunk(id: string, model: string, reasoning_content: string): DeepSeekChunk {
  return {
    id,
    model,
    choices: [{ index: 0, delta: { reasoning_content }, finish_reason: null }],
  }
}

function mixedChunk(id: string, model: string, reasoning_content: string, content: string): DeepSeekChunk {
  return {
    id,
    model,
    choices: [{ index: 0, delta: { reasoning_content, content }, finish_reason: null }],
  }
}

function finishChunk(id: string, model: string, finish_reason: string): DeepSeekChunk {
  return {
    id,
    model,
    choices: [{ index: 0, delta: {}, finish_reason }],
  }
}

function usageChunk(id: string, model: string, usage: DeepSeekChunk['usage']): DeepSeekChunk {
  return { id, model, usage }
}

function errorChunk(code: string, message: string): DeepSeekChunk {
  return { error: { code, message } }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('mapDeepSeekChunkToEvents', () => {
  const msgId = 'assistant_1'

  it('maps basic visible text delta to message.text_delta', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: textChunk('gen_1', 'deepseek-chat', 'Hello'),
      messageId: msgId,
    })

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(1)
    if (textEvents[0].type === 'message.text_delta') {
      expect(textEvents[0].text).toBe('Hello')
      expect(textEvents[0].messageId).toBe(msgId)
      expect(textEvents[0].choiceIndex).toBe(0)
    }
  })

  it('maps reasoning_content to message.reasoning_detail', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: reasoningChunk('gen_1', 'deepseek-r1', 'Let me think...'),
      messageId: msgId,
    })

    const reasoningEvents = events.filter((e) => e.type === 'message.reasoning_detail')
    expect(reasoningEvents).toHaveLength(1)
    if (reasoningEvents[0].type === 'message.reasoning_detail') {
      expect(reasoningEvents[0].detail).toEqual({ text: 'Let me think...', type: 'reasoning_content' })
      expect(reasoningEvents[0].messageId).toBe(msgId)
    }
  })

  it('reasoning_content NEVER becomes visible text', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: reasoningChunk('gen_1', 'deepseek-r1', 'This is reasoning, not visible text'),
      messageId: msgId,
    })

    const textEvents = events.filter((e) => e.type === 'message.text_delta')
    expect(textEvents).toHaveLength(0)
  })

  it('preserves mixed reasoning + visible text order', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: mixedChunk('gen_1', 'deepseek-r1', 'thinking...', 'visible answer'),
      messageId: msgId,
    })

    // reasoning comes first in the output (as it does in the delta)
    expect(events[0].type).toBe('meta.delta')
    expect(events[1].type).toBe('message.reasoning_detail')
    expect(events[2].type).toBe('message.text_delta')
  })

  it('preserves sequential reasoning then text chunks in order', () => {
    const chunks: DeepSeekChunk[] = [
      reasoningChunk('gen_1', 'deepseek-r1', 'step 1'),
      reasoningChunk('gen_1', 'deepseek-r1', ' step 2'),
      textChunk('gen_1', 'deepseek-r1', 'Here is '),
      textChunk('gen_1', 'deepseek-r1', 'the answer'),
    ]

    const allEvents: StarverseStreamEvent[] = []
    for (const chunk of chunks) {
      allEvents.push(...mapDeepSeekChunkToEvents({ chunk, messageId: msgId }))
    }

    const reasoningEvents = allEvents.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = allEvents.filter((e) => e.type === 'message.text_delta')

    expect(reasoningEvents).toHaveLength(2)
    expect(textEvents).toHaveLength(2)

    // Reasoning events come before text events in the sequence
    const lastReasoningIdx = allEvents.lastIndexOf(reasoningEvents[reasoningEvents.length - 1])
    const firstTextIdx = allEvents.indexOf(textEvents[0])
    expect(lastReasoningIdx).toBeLessThan(firstTextIdx)
  })

  it('maps finish_reason to meta.delta with normalized finish_reason', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: finishChunk('gen_1', 'deepseek-chat', 'stop'),
      messageId: msgId,
    })

    const metaEvents = events.filter((e) => e.type === 'meta.delta')
    expect(metaEvents.length).toBeGreaterThanOrEqual(1)
    const finishMeta = metaEvents.find((e) => e.type === 'meta.delta' && e.meta.finish_reason === 'stop')
    expect(finishMeta).toBeTruthy()
    if (finishMeta?.type === 'meta.delta') {
      expect(finishMeta.meta.native_finish_reason).toBe('stop')
    }
  })

  it('normalizes unknown finish_reason to unknown', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: finishChunk('gen_1', 'deepseek-chat', 'some_new_reason'),
      messageId: msgId,
    })

    const metaEvents = events.filter((e) => e.type === 'meta.delta')
    const finishMeta = metaEvents.find((e) => e.type === 'meta.delta' && e.meta.finish_reason !== undefined)
    expect(finishMeta).toBeTruthy()
    if (finishMeta?.type === 'meta.delta') {
      expect(finishMeta.meta.finish_reason).toBe('unknown')
      expect(finishMeta.meta.native_finish_reason).toBe('some_new_reason')
    }
  })

  it('maps finish_reason=tool_calls correctly', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: finishChunk('gen_1', 'deepseek-chat', 'tool_calls'),
      messageId: msgId,
    })

    const metaEvents = events.filter((e) => e.type === 'meta.delta')
    const finishMeta = metaEvents.find((e) => e.type === 'meta.delta' && e.meta.finish_reason === 'tool_calls')
    expect(finishMeta).toBeTruthy()
  })

  it('maps usage chunk to usage.delta', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: usageChunk('gen_1', 'deepseek-chat', {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        completion_tokens_details: { reasoning_tokens: 30 },
      }),
      messageId: msgId,
    })

    const usageEvents = events.filter((e) => e.type === 'usage.delta')
    expect(usageEvents).toHaveLength(1)
    if (usageEvents[0].type === 'usage.delta') {
      expect(usageEvents[0].usage).toEqual({
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        completion_tokens_details: { reasoning_tokens: 30 },
      })
    }
  })

  it('maps error chunk to stream.error terminal', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: errorChunk('rate_limited', 'Too many requests'),
      messageId: msgId,
    })

    const errorEvents = events.filter((e) => e.type === 'stream.error')
    expect(errorEvents).toHaveLength(1)
    if (errorEvents[0].type === 'stream.error') {
      expect(errorEvents[0].terminal).toBe(true)
    }
    // Error chunk should not produce other events
    expect(events).toHaveLength(1)
  })

  it('extracts meta (id, model) from chunk', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: textChunk('gen_123', 'deepseek-chat', 'hi'),
      messageId: msgId,
    })

    const metaEvents = events.filter((e) => e.type === 'meta.delta')
    expect(metaEvents.length).toBeGreaterThanOrEqual(1)
    const idMeta = metaEvents.find((e) => e.type === 'meta.delta' && e.meta.id === 'gen_123')
    expect(idMeta).toBeTruthy()
    if (idMeta?.type === 'meta.delta') {
      expect(idMeta.meta.model).toBe('deepseek-chat')
    }
  })

  it('handles empty choices gracefully', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: { id: 'gen_1', model: 'deepseek-chat', choices: [] },
      messageId: msgId,
    })

    // Should produce meta but no text/reasoning events
    expect(events.some((e) => e.type === 'message.text_delta')).toBe(false)
    expect(events.some((e) => e.type === 'message.reasoning_detail')).toBe(false)
  })

  it('handles null content and null reasoning_content gracefully', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: {
        id: 'gen_1',
        model: 'deepseek-chat',
        choices: [{ index: 0, delta: { content: null, reasoning_content: null }, finish_reason: null }],
      },
      messageId: msgId,
    })

    expect(events.some((e) => e.type === 'message.text_delta')).toBe(false)
    expect(events.some((e) => e.type === 'message.reasoning_detail')).toBe(false)
  })

  it('handles empty string content and reasoning_content gracefully', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: {
        id: 'gen_1',
        model: 'deepseek-chat',
        choices: [{ index: 0, delta: { content: '', reasoning_content: '' }, finish_reason: null }],
      },
      messageId: msgId,
    })

    expect(events.some((e) => e.type === 'message.text_delta')).toBe(false)
    expect(events.some((e) => e.type === 'message.reasoning_detail')).toBe(false)
  })

  it('maps tool_calls delta to message.tool_call_delta', () => {
    const events = mapDeepSeekChunkToEvents({
      chunk: {
        id: 'gen_1',
        model: 'deepseek-chat',
        choices: [{
          index: 0,
          delta: {
            tool_calls: [{
              index: 0,
              id: 'call_1',
              type: 'function',
              function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
            }],
          },
          finish_reason: null,
        }],
      },
      messageId: msgId,
    })

    const toolEvents = events.filter((e) => e.type === 'message.tool_call_delta')
    expect(toolEvents).toHaveLength(1)
    if (toolEvents[0].type === 'message.tool_call_delta') {
      expect(toolEvents[0].mergeStrategy).toBe('append')
      expect(toolEvents[0].toolCallDeltas[0].id).toBe('call_1')
    }
  })

  it('full DeepSeek R1 flow: reasoning → text → finish → usage', () => {
    const chunks: DeepSeekChunk[] = [
      reasoningChunk('gen_1', 'deepseek-r1', 'Let me analyze this...'),
      reasoningChunk('gen_1', 'deepseek-r1', ' The answer is 42.'),
      textChunk('gen_1', 'deepseek-r1', 'The answer is 42.'),
      finishChunk('gen_1', 'deepseek-r1', 'stop'),
      usageChunk('gen_1', 'deepseek-r1', {
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
        completion_tokens_details: { reasoning_tokens: 15 },
      }),
    ]

    const allEvents: StarverseStreamEvent[] = []
    for (const chunk of chunks) {
      allEvents.push(...mapDeepSeekChunkToEvents({ chunk, messageId: msgId }))
    }

    const reasoningEvents = allEvents.filter((e) => e.type === 'message.reasoning_detail')
    const textEvents = allEvents.filter((e) => e.type === 'message.text_delta')
    const metaEvents = allEvents.filter((e) => e.type === 'meta.delta')
    const usageEvents = allEvents.filter((e) => e.type === 'usage.delta')

    expect(reasoningEvents).toHaveLength(2)
    expect(textEvents).toHaveLength(1)
    expect(metaEvents.length).toBeGreaterThanOrEqual(1)
    expect(usageEvents).toHaveLength(1)

    // Verify reasoning content stays in reasoning channel only.
    // The reasoning chunks produce reasoning_detail, never text_delta.
    // The single text_delta comes only from the textChunk.
    expect(textEvents).toHaveLength(1)
    if (textEvents[0].type === 'message.text_delta') {
      expect(textEvents[0].text).toBe('The answer is 42.')
    }

    // Finish meta present
    const finishMeta = metaEvents.find((e) => e.type === 'meta.delta' && e.meta.finish_reason === 'stop')
    expect(finishMeta).toBeTruthy()
  })
})
