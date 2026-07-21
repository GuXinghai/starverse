import { describe, expect, it } from 'vitest'
import { compileLmStudioOpenResponsesRequestV1 } from './responsesRequestV1'

const user = Object.freeze({ role: 'user' as const,
  content: Object.freeze([Object.freeze({ type: 'input_text' as const, text: 'add 2 and 3' })]) })
const tool = Object.freeze({ type: 'function' as const, name: 'add_numbers', description: 'Add two integers.',
  parameters: Object.freeze({ type: 'object', properties: Object.freeze({
    a: Object.freeze({ type: 'integer' }), b: Object.freeze({ type: 'integer' }),
  }), required: Object.freeze(['a', 'b']), additionalProperties: false }), strict: true as const })

describe('LM Studio OpenResponses request codec', () => {
  it('encodes the verified sampling, reasoning, tool and client-managed history shape exactly', () => {
    const compiled = compileLmStudioOpenResponsesRequestV1({ model: 'gate0-qwen3-4b', replayItems: [user],
      generation: { temperature: 0.7, topP: 0.8, maxOutputTokens: 128, frequencyPenalty: 0, presencePenalty: 0 },
      reasoningEffort: 'low', tools: [tool], toolChoice: 'required' })
    expect(compiled.nativeRequest).toEqual({ model: 'gate0-qwen3-4b', input: [user], stream: true, store: false,
      temperature: 0.7, top_p: 0.8, max_output_tokens: 128, frequency_penalty: 0, presence_penalty: 0,
      reasoning: { effort: 'low' }, tools: [tool], tool_choice: 'required' })
    expect(JSON.parse(new TextDecoder().decode(compiled.preparedBody.copyBytes()))).not.toHaveProperty('previous_response_id')
  })

  it('rejects unverified explicit tool choice and non-strict tool shapes before fetch', () => {
    expect(() => compileLmStudioOpenResponsesRequestV1({ model: 'm', replayItems: [user], tools: [tool],
      toolChoice: 'auto' as never })).toThrow('GENERATION_V2_LMSTUDIO_REQUEST_UNSUPPORTED_EXPLICIT_FIELD')
    expect(() => compileLmStudioOpenResponsesRequestV1({ model: 'm', replayItems: [user],
      tools: [{ ...tool, strict: false }] })).toThrow('GENERATION_V2_LMSTUDIO_REQUEST_INVALID_VALUE')
  })
})
