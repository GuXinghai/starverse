import { describe, expect, it } from 'vitest'
import {
  buildOpenAIResponsesReplayInputV1,
  completeOpenAIResponsesProjectedRequestV2,
  completeOpenAIResponsesRequestV2,
  decodeOpenAIResponsesContinuationArtifactV2,
  isOpenAIResponsesContinuationArtifactV2,
} from './continuationArtifactV2'

const user = (text: string) => ({ role: 'user', content: [{ type: 'input_text', text }] })
const reasoning = (id: string) => ({
  id, type: 'reasoning', status: 'completed', summary: [], encrypted_content: `encrypted-${id}`,
})

describe('OpenAI Responses V1 client-managed continuation artifact', () => {
  it('preserves complete output items and exact order across stateless requests', () => {
    const first = completeOpenAIResponsesRequestV2({
      priorArtifact: null,
      lineageDepth: 1,
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

    const second = completeOpenAIResponsesRequestV2({
      priorArtifact: first,
      lineageDepth: 2,
      clientItems: [{ type: 'function_call_output', call_id: 'call_1', output: 'sunny' }],
      returnedItems: [{
        id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', phase: 'final_answer',
        content: [{ type: 'output_text', text: 'It is sunny.', annotations: [], logprobs: [] }],
      }],
    })
    expect(second.parentArtifactHash).toBe(first.artifactHash)
    expect(second.lineageDepth).toBe(2)
    expect(isOpenAIResponsesContinuationArtifactV2(second)).toBe(true)
    expect(decodeOpenAIResponsesContinuationArtifactV2(JSON.parse(JSON.stringify(second)))).toEqual(second)
  })

  it('rejects forged artifacts, sequence gaps, duplicate ids and unmatched or repeated tool outputs', () => {
    const first = completeOpenAIResponsesRequestV2({
      priorArtifact: null, lineageDepth: 1, clientItems: [user('go')],
      returnedItems: [{ id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'go', arguments: '{}' }],
    })
    expect(() => completeOpenAIResponsesRequestV2({
      priorArtifact: first, lineageDepth: 3, clientItems: [], returnedItems: [],
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
    expect(() => completeOpenAIResponsesRequestV2({
      priorArtifact: null, lineageDepth: 1, clientItems: [user('go')],
      returnedItems: [reasoning('same'), reasoning('same')],
    })).toThrow('GENERATION_V2_OPENAI_CONTINUATION_SEQUENCE_INVALID')
    expect(() => buildOpenAIResponsesReplayInputV1({ priorArtifact: { ...first }, clientItems: [] }))
      .toThrow('GENERATION_V2_OPENAI_CONTINUATION_UNBRANDED')
  })

  it('detects serialized artifact tampering', () => {
    const artifact = completeOpenAIResponsesRequestV2({
      priorArtifact: null, lineageDepth: 1, clientItems: [user('hello')], returnedItems: [reasoning('rs_1')],
    })
    expect(() => decodeOpenAIResponsesContinuationArtifactV2({
      ...JSON.parse(JSON.stringify(artifact)), lineageDepth: 2,
    })).toThrow('GENERATION_V2_OPENAI_CONTINUATION_HASH_MISMATCH')
  })

  it('persists a projected request without a hidden parent while retaining its native tool bundle', () => {
    const projected = completeOpenAIResponsesProjectedRequestV2({
      projectedPrefixItems: [
        user('included first'),
        reasoning('rs_1'),
        { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'weather', arguments: '{}', status: 'completed' },
        { type: 'function_call_output', call_id: 'call_1', output: 'sunny' },
        { id: 'msg_1', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'first', annotations: [] }] },
      ],
      clientItems: [user('included third')],
      returnedItems: [
        { id: 'msg_3', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'third', annotations: [] }] },
      ],
    })
    expect(projected.parentArtifactHash).toBeNull()
    expect(projected.lineageDepth).toBe(1)
    expect(projected.orderedItems.map((item) => 'role' in item ? item.role : item.type)).toEqual([
      'user', 'reasoning', 'function_call', 'function_call_output', 'assistant', 'user', 'assistant',
    ])
  })
})
