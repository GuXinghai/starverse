import { describe, expect, it } from 'vitest'
import { mapLocalOpenAIChatCompletionsChunkToEvents } from './localOpenAIChatCompletionsStreamMapper'

describe('mapLocalOpenAIChatCompletionsChunkToEvents', () => {
  const messageId = 'assistant_local'

  it('maps text, usage, metadata, and finish reason for local endpoints', () => {
    const events = mapLocalOpenAIChatCompletionsChunkToEvents({
      messageId,
      chunk: {
        id: 'local_1',
        model: 'local-model',
        usage: { total_tokens: 10 },
        choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: 'stop' }],
      },
    })

    expect(events).toContainEqual({ type: 'MetaDelta', meta: { id: 'local_1', model: 'local-model' } })
    expect(events).toContainEqual({ type: 'UsageDelta', usage: { total_tokens: 10 } })
    expect(events).toContainEqual({ type: 'MessageDeltaText', messageId, choiceIndex: 0, text: 'hello' })
    expect(events).toContainEqual({
      type: 'MetaDelta',
      meta: { finish_reason: 'stop', native_finish_reason: 'stop' },
    })
  })

  it('keeps reasoning-like and multimodal fields out of the existing local text contract', () => {
    const events = mapLocalOpenAIChatCompletionsChunkToEvents({
      messageId,
      chunk: {
        choices: [{
          index: 0,
          delta: {
            content: [{ type: 'text', text: 'array text' }],
            reasoning: 'hidden',
            reasoning_content: 'hidden',
            thinking: 'hidden',
          },
        }],
      },
    })

    expect(events.some((event) => event.type === 'MessageDeltaText')).toBe(false)
    expect(JSON.stringify(events)).not.toContain('hidden')
  })

  it('uses a local-only error identity', () => {
    const events = mapLocalOpenAIChatCompletionsChunkToEvents({
      messageId,
      chunk: { error: { code: 'bad_request', message: 'Bad request' } },
    })

    expect(events).toEqual([{
      type: 'StreamError',
      error: {
        phase: 'mid_stream',
        completionClass: 'error',
        openrouter: {
          code: 'bad_request',
          message: 'Bad request',
          provider: 'local_chat_completions',
          metadata: { provider_name: 'local_chat_completions' },
        },
        truncated: false,
      },
      terminal: true,
    }])
  })
})
