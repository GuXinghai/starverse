import { describe, expect, it } from 'vitest'
import {
  AnthropicMessagesRequestV1Error,
  compileAnthropicMessagesRequestV1,
} from './messagesRequestV1'

function intent(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    generation: { maxOutputTokens: 2_048, temperature: 0.4, topP: 0.8, topK: 20, stop: ['END'] },
    reasoning: { mode: 'enabled', effort: 'high' },
    web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' }, attachments: [],
    providerExtension: {
      kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'manual', manualThinkingBudgetTokens: 1_024,
    },
    ...overrides,
  }
}

const nativeBlocks = [
  { type: 'text', text: 'answer', citations: null },
  { type: 'thinking', thinking: 'private', signature: 'sig' },
  { type: 'redacted_thinking', data: 'redacted' },
  { type: 'tool_use', id: 'tool-1', name: 'lookup', input: { z: 1, a: [true, null] }, caller: { type: 'direct' } },
]

describe('compileAnthropicMessagesRequestV1', () => {
  it('produces the exact immutable standard Messages body and preserves ordered native blocks', () => {
    const result = compileAnthropicMessagesRequestV1({
      modelId: 'claude-opus-4-6',
      intent: intent(),
      system: 'Answer accurately.',
      messages: [{ role: 'user', content: 'question' }, { role: 'assistant', content: nativeBlocks }],
    })
    expect(result.issues).toEqual([])
    expect(result.nativeRequest).toEqual({
      model: 'claude-opus-4-6',
      messages: [{ role: 'user', content: 'question' }, { role: 'assistant', content: nativeBlocks }],
      system: 'Answer accurately.',
      max_tokens: 2_048,
      stream: true,
      temperature: 0.4,
      top_p: 0.8,
      top_k: 20,
      stop_sequences: ['END'],
      thinking: { type: 'enabled', budget_tokens: 1_024, display: 'summarized' },
      output_config: { effort: 'high' },
    })
    expect(result.preparedBody?.copyUtf8Text()).toBe(
      '{"max_tokens":2048,"messages":[{"content":"question","role":"user"},{"content":[{"citations":null,"text":"answer","type":"text"},{"signature":"sig","thinking":"private","type":"thinking"},{"data":"redacted","type":"redacted_thinking"},{"caller":{"type":"direct"},"id":"tool-1","input":{"a":[true,null],"z":1},"name":"lookup","type":"tool_use"}],"role":"assistant"}],"model":"claude-opus-4-6","output_config":{"effort":"high"},"stop_sequences":["END"],"stream":true,"system":"Answer accurately.","temperature":0.4,"thinking":{"budget_tokens":1024,"display":"summarized","type":"enabled"},"top_k":20,"top_p":0.8}',
    )
    expect(result.preparedBody?.verifyIntegrity()).toBe(true)
    expect(Object.isFrozen(result.nativeRequest)).toBe(true)
    expect(Object.isFrozen(result.nativeRequest?.messages[1].content)).toBe(true)
  })

  it('returns the semantic ledger but no request or body when any issue exists', () => {
    const result = compileAnthropicMessagesRequestV1({
      modelId: 'claude-sonnet-5',
      intent: intent({ generation: { maxOutputTokens: 100, temperature: 0.2 } }),
      messages: [{ role: 'user', content: 'question' }],
    })
    expect(result.issues).toContainEqual(expect.objectContaining({ code: 'ANTHROPIC_EXPLICIT_SAMPLING_REJECTED_BY_MODEL' }))
    expect(result.nativeRequest).toBeUndefined()
    expect(result.preparedBody).toBeUndefined()
  })

  it('encodes client tools and preserves tool_use followed immediately by the exact tool_result error block', () => {
    const result = compileAnthropicMessagesRequestV1({
      modelId: 'claude-opus-4-6',
      intent: intent({ tools: { mode: 'enabled', allowedToolIds: ['tool:lookup'], toolChoice: { mode: 'auto' }, sideEffectConfirmation: 'required_each_retry' } }),
      tools: [{ name: 'lookup', description: 'Lookup a value.', input_schema: { type: 'object', properties: { q: { type: 'string' } } } }],
      toolChoice: { type: 'auto' },
      messages: [
        { role: 'user', content: 'question' },
        { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'lookup', input: { q: 'x' }, caller: { type: 'direct' } }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'not found', is_error: true }] },
      ],
    })
    expect(result.issues).toEqual([])
    expect(result.nativeRequest?.messages.slice(-2)).toEqual([
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'lookup', input: { q: 'x' }, caller: { type: 'direct' } }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'not found', is_error: true }] },
    ])
    expect(result.nativeRequest?.tools).toEqual([{ name: 'lookup', description: 'Lookup a value.', input_schema: { type: 'object', properties: { q: { type: 'string' } } } }])
    expect(result.nativeRequest?.tool_choice).toEqual({ type: 'auto' })
  })

  it('rejects unknown request, message, and native block fields', () => {
    for (const value of [
      { modelId: 'claude-opus-4-6', intent: intent(), messages: [{ role: 'user', content: 'x' }], extra: true },
      { modelId: 'claude-opus-4-6', intent: intent(), messages: [{ role: 'user', content: 'x', name: 'n' }] },
      { modelId: 'claude-opus-4-6', intent: intent(), messages: [{ role: 'assistant', content: [{ type: 'text', text: 'x', citations: null, extra: true }] }] },
    ]) {
      expect(() => compileAnthropicMessagesRequestV1(value)).toThrowError(AnthropicMessagesRequestV1Error)
      try {
        compileAnthropicMessagesRequestV1(value)
      } catch (error) {
        expect((error as AnthropicMessagesRequestV1Error).code).toBe('GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_UNKNOWN_FIELD')
      }
    }
  })

  it('rejects non-text or empty user content and non-direct tool blocks', () => {
    expect(() => compileAnthropicMessagesRequestV1({
      modelId: 'claude-opus-4-6', intent: intent(), system: '', messages: [{ role: 'user', content: 'x' }],
    })).toThrowError(AnthropicMessagesRequestV1Error)
    for (const messages of [
      [{ role: 'user', content: '' }],
      [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
      [{ role: 'assistant', content: [{ type: 'tool_use', id: 'id', name: 'n', input: {}, caller: { type: 'server' } }] }],
    ]) {
      expect(() => compileAnthropicMessagesRequestV1({ modelId: 'claude-opus-4-6', intent: intent(), messages }))
        .toThrowError(AnthropicMessagesRequestV1Error)
    }
  })
})
