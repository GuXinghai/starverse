import { describe, expect, it } from 'vitest'
import { createOpenAIChatCompatibleNativeArtifactV1, decodeOpenAIChatCompatibleNativeArtifactV1 } from './nativeMessagesV1'

describe('OpenAI-compatible V2 native message artifact', () => {
  it('persists the exact complete assistant/tool bundle rather than visible text only', () => {
    const artifact = createOpenAIChatCompatibleNativeArtifactV1([
      { role: 'user', content: 'weather?' },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call:1', type: 'function', function: { name: 'weather', arguments: '{"city":"Shanghai"}' } }] },
      { role: 'tool', tool_call_id: 'call:1', content: '{"temp":30}' },
      { role: 'assistant', content: '30C' },
    ])
    expect(decodeOpenAIChatCompatibleNativeArtifactV1(JSON.parse(JSON.stringify(artifact)))).toEqual(artifact)
  })

  it('rejects a broken tool loop before it becomes a continuation artifact', () => {
    expect(() => createOpenAIChatCompatibleNativeArtifactV1([
      { role: 'assistant', content: null, tool_calls: [{ id: 'call:1', type: 'function', function: { name: 'weather', arguments: '{}' } }] },
      { role: 'user', content: 'next' },
    ])).toThrow('GENERATION_V2_OPENAI_COMPATIBLE_HISTORY_INVALID')
  })
})
