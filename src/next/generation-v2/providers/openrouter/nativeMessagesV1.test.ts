import { describe, expect, it } from 'vitest'
import {
  buildOpenRouterProjectedNativeRequestHistoryV1,
  completeOpenRouterProjectedNativeHistoryV1,
} from './nativeMessagesV1'

describe('OpenRouter selected native history projection V1', () => {
  it('preserves a complete selected tool turn and creates no hidden parent artifact', () => {
    const history = buildOpenRouterProjectedNativeRequestHistoryV1({
      replayMessages: [
        { role: 'system', content: 'You are precise.' },
        { role: 'user', content: 'selected first' },
        { role: 'assistant', content: 'checking', reasoning_details: [{ type: 'reasoning.text', text: 'use weather' }],
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'weather', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'call_1', content: 'sunny' },
        { role: 'assistant', content: 'sunny' },
        { role: 'user', content: 'current third' },
      ],
    })
    expect(history.map((message) => message.role)).toEqual(['system', 'user', 'assistant', 'tool', 'assistant', 'user'])
    const artifact = completeOpenRouterProjectedNativeHistoryV1({
      projectedPrefixMessages: history.slice(0, -1), clientMessages: [history.at(-1)!],
      assistantMessage: { role: 'assistant', content: 'third answer' },
    })
    expect(artifact).toMatchObject({ lineageDepth: 1, parentArtifactHash: null })
    expect(artifact.orderedMessages.map((message) => message.role)).toEqual([
      'system', 'user', 'assistant', 'tool', 'assistant', 'user', 'assistant',
    ])
  })
})
