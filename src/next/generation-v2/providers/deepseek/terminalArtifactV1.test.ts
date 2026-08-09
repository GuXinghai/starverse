import { describe, expect, it } from 'vitest'
import { DeepSeekStableChatStreamAssemblerV1 } from './chatStreamV1'
import {
  createDeepSeekStableTerminalArtifactV1,
  decodeDeepSeekStableTerminalArtifactV1,
  isDeepSeekStableTerminalArtifactV1,
  serializeDeepSeekStableTerminalArtifactV1,
} from './terminalArtifactV1'

function result() {
  const assembler = new DeepSeekStableChatStreamAssemblerV1('enabled')
  const metadata = {
    id: 'response:1', model: 'deepseek-v4-pro', created: 1,
    system_fingerprint: 'fp:1', object: 'chat.completion.chunk',
  }
  assembler.pushChunk({ ...metadata, choices: [{
    index: 0, delta: { role: 'assistant', reasoning_content: 'reason', content: 'answer' },
    finish_reason: 'stop', logprobs: null,
  }] })
  assembler.pushChunk({ ...metadata, choices: [], usage: {
    prompt_tokens: 2, completion_tokens: 3, total_tokens: 5,
    prompt_cache_hit_tokens: 1, completion_tokens_details: { reasoning_tokens: 2 },
  } })
  return assembler.acceptDone()
}

describe('DeepSeek stable terminal artifact V1', () => {
  it('round-trips the complete assembled provider response', () => {
    const artifact = createDeepSeekStableTerminalArtifactV1(result())
    const decoded = decodeDeepSeekStableTerminalArtifactV1(JSON.parse(
      serializeDeepSeekStableTerminalArtifactV1(artifact),
    ))
    expect(decoded).toEqual(artifact)
    expect(decoded).not.toBe(artifact)
    expect(isDeepSeekStableTerminalArtifactV1(decoded)).toBe(true)
    expect(decoded).toMatchObject({
      assistantMessage: { role: 'assistant', content: 'answer', reasoning_content: 'reason' },
      finishReason: 'stop', generatedWithThinking: 'enabled',
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
      responseMetadata: { id: 'response:1', model: 'deepseek-v4-pro', created: 1, systemFingerprint: 'fp:1' },
    })
  })

  it('rejects tampering, unknown fields and unbranded inputs', () => {
    const json = JSON.parse(serializeDeepSeekStableTerminalArtifactV1(
      createDeepSeekStableTerminalArtifactV1(result()),
    ))
    expect(() => decodeDeepSeekStableTerminalArtifactV1({ ...json, finishReason: 'length' }))
      .toThrow('GENERATION_V2_DEEPSEEK_TERMINAL_ARTIFACT_INVALID')
    expect(() => decodeDeepSeekStableTerminalArtifactV1({ ...json, extra: true }))
      .toThrow('GENERATION_V2_DEEPSEEK_TERMINAL_ARTIFACT_INVALID')
    expect(() => serializeDeepSeekStableTerminalArtifactV1(json))
      .toThrow('GENERATION_V2_DEEPSEEK_TERMINAL_ARTIFACT_INVALID')
  })
})
