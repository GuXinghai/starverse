import { describe, expect, it } from 'vitest'
import { GenericLocalOpenAIChatStreamAssemblerV1 } from '../../../../core/generation-v2/providers/generic-local-openai-chat/chatStreamV1'

const usage = { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }

describe('generic local OpenAI chat stream assembler', () => {
  it('accepts a usage-only chunk that arrives before the finish reason', () => {
    const assembler = new GenericLocalOpenAIChatStreamAssemblerV1()
    assembler.push({ id: 'c1', model: 'm', choices: [{ index: 0, delta: { role: 'assistant', content: 'Hi' } }] })
    assembler.push({ id: 'c1', model: 'm', choices: [], usage })
    assembler.push({ id: 'c1', model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
    expect(assembler.finish()).toMatchObject({ finishReason: 'stop', usage })
  })

  // P4a-04: the request sets `stream_options.include_usage`, and OpenAI-compatible
  // servers send that usage chunk after the finish-reason chunk. The assembler
  // rejects any chunk after the finish reason. Remove `.fails` when fixed.
  it('P4a-04: accepts the trailing usage-only chunk after the finish reason', () => {
    const assembler = new GenericLocalOpenAIChatStreamAssemblerV1()
    assembler.push({ id: 'c1', model: 'm', choices: [{ index: 0, delta: { role: 'assistant', content: 'Hi' } }] })
    assembler.push({ id: 'c1', model: 'm', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
    assembler.push({ id: 'c1', model: 'm', choices: [], usage })
    expect(assembler.finish()).toMatchObject({
      assistantMessage: { role: 'assistant', content: 'Hi' },
      finishReason: 'stop',
      usage,
    })
  })
})
