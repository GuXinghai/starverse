import { describe, expect, it } from 'vitest'
import {
  decodeOpenAIResponsesClientItemsV1,
  decodeOpenAIResponsesReplayItemsV1,
  decodeOpenAIResponsesReturnedItemsV1,
} from './nativeItemsV1'

const returnedItems = [
  {
    id: 'rs_1', type: 'reasoning', status: 'completed',
    summary: [{ type: 'summary_text', text: 'summary' }],
    content: [{ type: 'reasoning_text', text: 'private reasoning' }],
    encrypted_content: 'encrypted-native-reasoning',
  },
  {
    id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', phase: 'final_answer',
    content: [{
      type: 'output_text', text: 'answer',
      annotations: [{ type: 'url_citation', start_index: 0, end_index: 6, title: 'source', url: 'https://example.com' }],
      logprobs: [{ token: 'answer', bytes: [97], logprob: -0.1, top_logprobs: [] }],
    }],
  },
  { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'weather', arguments: '{"city":"Paris"}', status: 'completed' },
  {
    id: 'ws_1', type: 'web_search_call', status: 'completed',
    action: { type: 'search', query: 'weather Paris', queries: ['weather Paris'], sources: [{ type: 'url', url: 'https://example.com' }] },
  },
  { id: 'ig_1', type: 'image_generation_call', status: 'completed', result: 'base64-image-result' },
] as const

describe('OpenAI Responses V1 native replay items', () => {
  it('preserves ordered native reasoning, phase, citations, tools, web and image items', () => {
    const decoded = decodeOpenAIResponsesReturnedItemsV1(returnedItems)
    expect(decoded).toEqual(returnedItems)
    expect(decoded.map((item) => item.type)).toEqual([
      'reasoning', 'message', 'function_call', 'web_search_call', 'image_generation_call',
    ])
    expect(Object.isFrozen(decoded)).toBe(true)
    expect(Object.isFrozen((decoded[0] as any).summary)).toBe(true)
    expect(Object.isFrozen((decoded[1] as any).content[0].annotations)).toBe(true)
  })

  it('accepts only text user input and string function outputs on the initial executable surface', () => {
    const client = decodeOpenAIResponsesClientItemsV1([
      { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
      { type: 'function_call_output', call_id: 'call_1', output: 'sunny', status: 'completed' },
    ])
    expect(client).toEqual([
      { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
      { type: 'function_call_output', call_id: 'call_1', output: 'sunny', status: 'completed' },
    ])
    expect(() => decodeOpenAIResponsesClientItemsV1(returnedItems)).toThrow(
      'GENERATION_V2_OPENAI_NATIVE_ITEM_DIRECTION_INVALID',
    )
    expect(() => decodeOpenAIResponsesReturnedItemsV1([
      { role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
    ])).toThrow('GENERATION_V2_OPENAI_NATIVE_ITEM_DIRECTION_INVALID')
  })

  it('rejects missing encrypted reasoning, transient terminal items and unsupported native variants', () => {
    expect(() => decodeOpenAIResponsesReturnedItemsV1([{
      id: 'rs_1', type: 'reasoning', summary: [],
    }])).toThrow('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_SHAPE')
    expect(() => decodeOpenAIResponsesReturnedItemsV1([{
      id: 'msg_1', type: 'message', role: 'assistant', status: 'in_progress',
      content: [{ type: 'output_text', text: '', annotations: [], logprobs: [] }],
    }])).toThrow('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
    expect(() => decodeOpenAIResponsesReplayItemsV1([{
      id: 'x', type: 'computer_call', status: 'completed',
    }])).toThrow('GENERATION_V2_OPENAI_NATIVE_ITEM_UNKNOWN_TYPE')
    expect(() => decodeOpenAIResponsesClientItemsV1([{
      type: 'function_call_output', call_id: 'call_1', output: [{ type: 'input_text', text: 'not-yet-supported' }],
    }])).toThrow('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
  })

  it('rejects unknown fields, accessors, sparse arrays, symbols and invalid citation ranges', () => {
    expect(() => decodeOpenAIResponsesReplayItemsV1([{
      role: 'user', content: [{ type: 'input_text', text: 'hello', extra: true }],
    }])).toThrow('GENERATION_V2_OPENAI_NATIVE_ITEM_UNKNOWN_FIELD')
    expect(() => decodeOpenAIResponsesReplayItemsV1([Object.defineProperty({
      role: 'user',
    }, 'content', { enumerable: true, get: () => [{ type: 'input_text', text: 'hello' }] })]))
      .toThrow('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_SHAPE')
    const sparse = new Array(1)
    expect(() => decodeOpenAIResponsesReplayItemsV1(sparse)).toThrow('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_SHAPE')
    expect(() => decodeOpenAIResponsesReplayItemsV1([{
      role: 'user', content: [{ type: 'input_text', text: 'hello', [Symbol('x')]: true }],
    }])).toThrow('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_SHAPE')
    expect(() => decodeOpenAIResponsesReturnedItemsV1([{
      id: 'msg_1', type: 'message', role: 'assistant', status: 'completed',
      content: [{
        type: 'output_text', text: 'answer', logprobs: [],
        annotations: [{ type: 'url_citation', start_index: 6, end_index: 1, title: 'x', url: 'https://example.com' }],
      }],
    }])).toThrow('GENERATION_V2_OPENAI_NATIVE_ITEM_INVALID_VALUE')
  })
})
