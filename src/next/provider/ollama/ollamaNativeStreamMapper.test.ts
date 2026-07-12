import { describe, expect, it } from 'vitest'
import { mapOllamaNativeChunkToEvents } from './ollamaNativeStreamMapper'

const baseInput = {
  messageId: 'assistant_ollama',
  choiceIndex: 0,
  chunkNo: 7,
} as const

describe('mapOllamaNativeChunkToEvents', () => {
  it('maps native structured thinking to raw reasoning and display blocks', () => {
    const events = mapOllamaNativeChunkToEvents({
      ...baseInput,
      chunk: {
        model: 'llama3.2:latest',
        choices: [{
          index: 0,
          delta: { thinking: 'checking locally', content: 'OK' },
          finish_reason: null,
        }],
      },
    })

    expect(events).toContainEqual({
      type: 'MessageDeltaReasoningDetail',
      messageId: 'assistant_ollama',
      choiceIndex: 0,
      detail: { type: 'ollama_native_thinking', thinking: 'checking locally' },
      chunkNo: 7,
    })
    expect(events).toContainEqual({
      type: 'MessageAppendReasoningDisplayBlock',
      messageId: 'assistant_ollama',
      choiceIndex: 0,
      block: expect.objectContaining({
        ordinal: 7,
        type: 'text',
        text: 'checking locally',
        semanticRole: 'thinking',
        providerKey: 'ollama_local',
        sourceEventType: 'ollama_native.thinking',
      }),
    })
    expect(events).toContainEqual({
      type: 'MessageDeltaText',
      messageId: 'assistant_ollama',
      choiceIndex: 0,
      text: 'OK',
    })
  })

  it('does not strip think tags from visible content by default', () => {
    const events = mapOllamaNativeChunkToEvents({
      ...baseInput,
      chunk: {
        choices: [{
          index: 0,
          delta: { content: '<think>hidden</think>visible' },
          finish_reason: null,
        }],
      },
    })

    expect(events).toEqual([{
      type: 'MessageDeltaText',
      messageId: 'assistant_ollama',
      choiceIndex: 0,
      text: '<think>hidden</think>visible',
    }])
  })

  it('maps finish reason and usage without displaying unknown reasoning fields', () => {
    const events = mapOllamaNativeChunkToEvents({
      ...baseInput,
      chunk: {
        usage: { total_tokens: 3 },
        choices: [{
          index: 0,
          delta: { reasoning_content: 'ignored', content: 'done' },
          finish_reason: 'stop',
        }],
      },
    })

    expect(events.some((event) => event.type === 'MessageDeltaReasoningDetail')).toBe(false)
    expect(events.some((event) => event.type === 'MessageAppendReasoningDisplayBlock')).toBe(false)
    expect(events).toContainEqual({
      type: 'MetaDelta',
      meta: { finish_reason: 'stop', native_finish_reason: 'stop' },
    })
    expect(events).toContainEqual({ type: 'UsageDelta', usage: { total_tokens: 3 } })
  })

  it('returns a terminal safe stream error for native provider errors', () => {
    const events = mapOllamaNativeChunkToEvents({
      ...baseInput,
      chunk: { error: { code: 'bad_request', message: 'bad request' } },
    })

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      type: 'StreamError',
      terminal: true,
      error: {
        openrouter: {
          code: 'bad_request',
          message: 'bad request',
          provider: 'ollama_local',
        },
      },
    })
  })
})
