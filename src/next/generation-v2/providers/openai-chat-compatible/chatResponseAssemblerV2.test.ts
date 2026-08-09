import { describe, expect, it } from 'vitest'
import { OpenAIChatCompatibleResponseAssemblerV2 } from './chatResponseAssemblerV2'

describe('OpenAI-compatible response assembler V2', () => {
  it('builds a complete assistant message from strict native stream events', () => {
    const assembler = new OpenAIChatCompatibleResponseAssemblerV2()
    assembler.push({ kind: 'response_meta', source: 'stream', sequence: 0, meta: { id: 'chatcmpl-1', model: 'model-x' } })
    assembler.push({ kind: 'choice_role', source: 'stream', sequence: 1, choiceIndex: 0, role: 'assistant' })
    expect(assembler.push({ kind: 'choice_content', source: 'stream', sequence: 2, choiceIndex: 0, content: 'hello' })).toBe('hello')
    assembler.push({ kind: 'choice_finish', source: 'stream', sequence: 3, choiceIndex: 0, finishReason: 'stop' })
    expect(assembler.finish()).toMatchObject({ model: 'model-x', assistantMessage: { role: 'assistant', content: 'hello' } })
  })

  it('preserves completed structured tool calls as native assistant state', () => {
    const assembler = new OpenAIChatCompatibleResponseAssemblerV2()
    assembler.push({ kind: 'response_meta', source: 'stream', sequence: 0, meta: { id: 'chatcmpl-1', model: 'model-x' } })
    assembler.push({ kind: 'choice_role', source: 'stream', sequence: 1, choiceIndex: 0, role: 'assistant' })
    assembler.push({ kind: 'tool_fragment', source: 'stream', sequence: 2, choiceIndex: 0,
      fragment: { toolIndex: 0, id: 'call-1', type: 'function', functionName: 'weather', argumentsFragment: '{"city":' } })
    assembler.push({ kind: 'tool_fragment', source: 'stream', sequence: 3, choiceIndex: 0, fragment: { toolIndex: 0, argumentsFragment: '"Shanghai"}' } })
    assembler.push({ kind: 'choice_finish', source: 'stream', sequence: 4, choiceIndex: 0, finishReason: 'tool_calls' })
    expect(assembler.finish().assistantMessage).toEqual({ role: 'assistant', content: null,
      tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'weather', arguments: '{"city":"Shanghai"}' } }] })
  })

  it('rejects a partially assembled tool call at terminal', () => {
    const assembler = new OpenAIChatCompatibleResponseAssemblerV2()
    assembler.push({ kind: 'response_meta', source: 'stream', sequence: 0, meta: { id: 'chatcmpl-1', model: 'model-x' } })
    assembler.push({ kind: 'tool_fragment', source: 'stream', sequence: 1, choiceIndex: 0, fragment: { toolIndex: 0, id: 'call-1' } })
    assembler.push({ kind: 'choice_finish', source: 'stream', sequence: 2, choiceIndex: 0, finishReason: 'tool_calls' })
    expect(() => assembler.finish()).toThrow('GENERATION_V2_OPENAI_COMPATIBLE_STREAM_TOOL_INVALID')
  })
})
