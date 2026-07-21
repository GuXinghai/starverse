import { describe, expect, it } from 'vitest'
import { createOpenAIChatCompatibleNativeArtifactV2, decodeOpenAIChatCompatibleNativeArtifactV2 } from './nativeMessagesV2'

describe('OpenAI-compatible native messages V2', () => {
  it('pins base messages and independently replayable reasoning facts', () => {
    const artifact = createOpenAIChatCompatibleNativeArtifactV2({ messages: [
      { role: 'user', content: 'hello' }, { role: 'assistant', content: 'answer' },
    ], reasoningReplay: [{ assistantMessageIndex: 1, reasoning: 'native reasoning', hasCompleteToolChain: false }] })
    expect(decodeOpenAIChatCompatibleNativeArtifactV2(JSON.parse(JSON.stringify(artifact)))).toEqual(artifact)
  })

  it('rejects replay facts not attached to an assistant message', () => {
    expect(() => createOpenAIChatCompatibleNativeArtifactV2({ messages: [{ role: 'user', content: 'hello' }],
      reasoningReplay: [{ assistantMessageIndex: 0, reasoning: 'invalid', hasCompleteToolChain: false }] })).toThrow('GENERATION_V2_OPENAI_COMPATIBLE_HISTORY_INVALID')
  })
})
