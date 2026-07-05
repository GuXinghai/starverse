import { describe, expect, it } from 'vitest'
import { mapGenericOpenAICompatibleChunkToEvents } from '@/next/provider/generic/genericOpenAICompatibleStreamMapper'

describe('mapGenericOpenAICompatibleChunkToEvents', () => {
  const messageId = 'assistant_generic'

  it('maps string content to visible text only', () => {
    const events = mapGenericOpenAICompatibleChunkToEvents({
      messageId,
      chunk: {
        id: 'gen_1',
        model: 'generic-model',
        choices: [{ index: 0, delta: { content: 'hello' }, finish_reason: null }],
      },
    })

    expect(events).toContainEqual({
      type: 'MetaDelta',
      meta: { id: 'gen_1', model: 'generic-model' },
    })
    expect(events).toContainEqual({
      type: 'MessageDeltaText',
      messageId,
      choiceIndex: 0,
      text: 'hello',
    })
  })

  it('does not display or persist reasoning-like fields by default', () => {
    const events = mapGenericOpenAICompatibleChunkToEvents({
      messageId,
      chunk: {
        choices: [{
          index: 0,
          delta: {
            reasoning_content: 'hidden reasoning',
            reasoning: 'hidden reasoning',
            thinking: 'hidden thinking',
            content: 'visible',
          },
          finish_reason: null,
        }],
      },
    })

    expect(events).toContainEqual({
      type: 'MessageDeltaText',
      messageId,
      choiceIndex: 0,
      text: 'visible',
    })
    expect(events.some((event) => event.type === 'MessageDeltaReasoningDetail')).toBe(false)
    expect(events.some((event) => event.type === 'MessageAppendReasoningDisplayBlock')).toBe(false)
    expect(JSON.stringify(events)).not.toContain('hidden reasoning')
    expect(JSON.stringify(events)).not.toContain('hidden thinking')
  })

  it('ignores multimodal content arrays and images by default', () => {
    const events = mapGenericOpenAICompatibleChunkToEvents({
      messageId,
      chunk: {
        choices: [{
          index: 0,
          delta: {
            content: [
              { type: 'text', text: 'array text' },
              { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
            ],
            images: [{ image_url: { url: 'data:image/png;base64,BBBB' } }],
          },
          finish_reason: null,
        }],
      },
    })

    expect(events.some((event) => event.type === 'MessageDeltaText')).toBe(false)
    expect(events.some((event) => event.type === 'MessageAppendContentBlock')).toBe(false)
  })

  it('maps usage and finish metadata without making finish terminal', () => {
    const events = mapGenericOpenAICompatibleChunkToEvents({
      messageId,
      chunk: {
        usage: { total_tokens: 10 },
        choices: [{ index: 0, delta: {}, finish_reason: 'future_reason' }],
      },
    })

    expect(events).toContainEqual({ type: 'UsageDelta', usage: { total_tokens: 10 } })
    expect(events).toContainEqual({
      type: 'MetaDelta',
      meta: {
        finish_reason: 'unknown',
        native_finish_reason: 'future_reason',
      },
    })
    expect(events.some((event) => event.type === 'StreamDone')).toBe(false)
  })

  it('maps provider error chunks without inferring OpenRouter fields', () => {
    const events = mapGenericOpenAICompatibleChunkToEvents({
      messageId,
      chunk: { error: { code: 'bad_request', message: 'Bad request' } },
    })

    expect(events).toEqual([
      {
        type: 'StreamError',
        error: {
          phase: 'mid_stream',
          completionClass: 'error',
          openrouter: {
            code: 'bad_request',
            message: 'Bad request',
            provider: 'generic',
            metadata: { provider_name: 'generic' },
          },
          truncated: false,
        },
        terminal: true,
      },
    ])
  })
})
