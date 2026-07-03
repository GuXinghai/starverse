import { describe, expect, it } from 'vitest'
import { streamEventToDomainEvent } from './streamEventBridge'

describe('streamEventBridge', () => {
  it('preserves non-OpenRouter provider identity in fallback error envelopes', () => {
    const event = streamEventToDomainEvent({
      type: 'stream.error',
      terminal: true,
      error: {
        phase: 'stream',
        provider: 'google-ai-studio',
        category: 'provider_error',
        code: '400',
        message: 'Bad request',
      },
    })

    expect(event.type).toBe('StreamError')
    if (event.type === 'StreamError') {
      expect(event.error.phase).toBe('mid_stream')
      expect(event.error.openrouter.provider).toBe('google-ai-studio')
      expect(event.error.openrouter.metadata?.provider_name).toBe('google-ai-studio')
    }
  })
})
