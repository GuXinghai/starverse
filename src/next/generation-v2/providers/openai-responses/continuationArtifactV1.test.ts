import { describe, expect, it } from 'vitest'
import {
  buildOpenAIResponsesReplayInputV1,
  completeOpenAIResponsesRequestV1,
  decodeOpenAIResponsesContinuationArtifactV1,
  isOpenAIResponsesContinuationArtifactV1,
} from './continuationArtifactV1'

const user = (text: string) => ({ role: 'user', content: [{ type: 'input_text', text }] })
const reasoning = (id: string) => ({
  id, type: 'reasoning', status: 'completed', summary: [], encrypted_content: `encrypted-${id}`,
})

describe('OpenAI Responses V1 client-managed continuation artifact', () => {
  it('preserves complete output items and exact order across stateless requests', () => {
    const first = completeOpenAIResponsesRequestV1({
      priorArtifact: null,
      requestSequence: 1,
      clientItems: [user('weather?')],
      returnedItems: [
        reasoning('rs_1'),
        { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'weather', arguments: '{}', status: 'completed' },
      ],
    })
    const replay = buildOpenAIResponsesReplayInputV1({
      priorArtifact: first,
      clientItems: [{ type: 'function_call_output', call_id: 'call_1', output: 'sunny' }],
    })
    expect(replay.map((item) => 'role' in item ? item.role : item.type)).toEqual([
      'user', 'reasoning', 'function_call', 'function_call_output',
    ])
    expect((replay[1] as any).encrypted_content).toBe('encrypted-rs_1')

    const second = completeOpenAIResponsesRequestV1({
      priorArtifact: first,
      requestSequence: 2,
      clientItems: [{ type: 'function_call_output', call_id: 'call_1', output: 'sunny' }],
      returnedItems: [{
        id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', phase: 'final_answer',
        content: [{ type: 'output_text', text: 'It is sunny.', annotations: [], logprobs: [] }],
      }],
    })
    expect(second.parentArtifactHash).toBe(first.artifactHash)
    expect(second.requestSequence).toBe(2)
    expect(isOpenAIResponsesContinuationArtifactV1(second)).toBe(true)
    expect(decodeOpenAIResponsesContinuationArtifactV1(JSON.parse(JSON.stringify(second)))).toEqual(second)
  })

  it('rejects forged artifacts, sequence gaps, duplicate ids and unmatched or repeated tool outputs', () => {
    const first = completeOpenAIResponsesRequestV1({
      priorArtifact: null, requestSequence: 1, clientItems: [user('go')],
      returnedItems: [{ id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'go', arguments: '{}' }],
    })
    expect(() => completeOpenAIResponsesRequestV1({
      priorArtifact: first, requestSequence: 3, clientItems: [], returnedItems: [],
    })).toThrow('GENERATION_V2_OPENAI_CONTINUATION_SEQUENCE_INVALID')
    expect(() => buildOpenAIResponsesReplayInputV1({
      priorArtifact: first,
      clientItems: [
        { type: 'function_call_output', call_id: 'call_1', output: 'one' },
        { type: 'function_call_output', call_id: 'call_1', output: 'two' },
      ],
    })).toThrow('GENERATION_V2_OPENAI_CONTINUATION_SEQUENCE_INVALID')
    expect(() => buildOpenAIResponsesReplayInputV1({
      priorArtifact: first,
      clientItems: [{ type: 'function_call_output', call_id: 'unknown', output: 'x' }],
    })).toThrow('GENERATION_V2_OPENAI_CONTINUATION_SEQUENCE_INVALID')
    expect(() => completeOpenAIResponsesRequestV1({
      priorArtifact: null, requestSequence: 1, clientItems: [user('go')],
      returnedItems: [reasoning('same'), reasoning('same')],
    })).toThrow('GENERATION_V2_OPENAI_CONTINUATION_SEQUENCE_INVALID')
    expect(() => buildOpenAIResponsesReplayInputV1({ priorArtifact: { ...first }, clientItems: [] }))
      .toThrow('GENERATION_V2_OPENAI_CONTINUATION_UNBRANDED')
  })

  it('detects serialized artifact tampering', () => {
    const artifact = completeOpenAIResponsesRequestV1({
      priorArtifact: null, requestSequence: 1, clientItems: [user('hello')], returnedItems: [reasoning('rs_1')],
    })
    expect(() => decodeOpenAIResponsesContinuationArtifactV1({
      ...JSON.parse(JSON.stringify(artifact)), requestSequence: 2,
    })).toThrow('GENERATION_V2_OPENAI_CONTINUATION_HASH_MISMATCH')
  })
})
