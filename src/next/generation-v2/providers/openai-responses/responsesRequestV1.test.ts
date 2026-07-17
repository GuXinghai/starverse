import { describe, expect, it } from 'vitest'
import { completeOpenAIResponsesRequestV1 } from './continuationArtifactV1'
import { compileOpenAIResponsesRequestV1 } from './responsesRequestV1'

const user = (text: string) => ({ role: 'user', content: [{ type: 'input_text', text }] })

describe('OpenAI Responses V1 exact-body compiler', () => {
  it('compiles stateless streaming with complete supported semantic fields and no hidden fallback', () => {
    const result = compileOpenAIResponsesRequestV1({
      model: 'gpt-5.4', priorArtifact: null, clientItems: [user('draw and research')],
      instructions: 'Be concise.',
      reasoning: { effort: 'medium', summary: 'detailed' },
      generation: { temperature: 0.4, topP: 0.8, maxOutputTokens: 2048, verbosity: 'low' },
      tools: [
        { type: 'function', name: 'weather', description: 'Weather', parameters: { type: 'object', properties: {} }, strict: true },
        { type: 'web_search', searchContextSize: 'medium', allowedDomains: ['example.com'] },
        { type: 'image_generation', action: 'auto', size: '1024x1024', quality: 'low', outputFormat: 'png', background: 'opaque', partialImages: 2 },
      ],
      toolChoice: 'auto',
      maxToolCalls: 8,
      parallelToolCalls: false,
      serviceTier: 'default',
    })
    expect(result.nativeRequest).toEqual({
      model: 'gpt-5.4', input: [user('draw and research')], stream: true, store: false,
      include: ['reasoning.encrypted_content'], instructions: 'Be concise.',
      reasoning: { effort: 'medium', summary: 'detailed' },
      temperature: 0.4, top_p: 0.8, max_output_tokens: 2048, text: { verbosity: 'low' },
      tools: [
        { type: 'function', name: 'weather', description: 'Weather', parameters: { properties: {}, type: 'object' }, strict: true },
        { type: 'web_search', search_context_size: 'medium', filters: { allowed_domains: ['example.com'] } },
        { type: 'image_generation', action: 'auto', size: '1024x1024', quality: 'low', output_format: 'png', background: 'opaque', partial_images: 2 },
      ],
      tool_choice: 'auto',
      max_tool_calls: 8,
      parallel_tool_calls: false,
      service_tier: 'default',
    })
    const exact = JSON.parse(result.preparedBody.copyUtf8Text())
    expect(exact).toEqual(result.nativeRequest)
    expect(exact).not.toHaveProperty('previous_response_id')
    expect(exact).not.toHaveProperty('conversation')
  })

  it('replays prior native reasoning, tool call and output byte-for-byte in input order', () => {
    const prior = completeOpenAIResponsesRequestV1({
      priorArtifact: null, requestSequence: 1, clientItems: [user('weather?')],
      returnedItems: [
        { id: 'rs_1', type: 'reasoning', status: 'completed', summary: [], encrypted_content: 'encrypted' },
        { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'weather', arguments: '{}', status: 'completed' },
      ],
    })
    const result = compileOpenAIResponsesRequestV1({
      model: 'gpt-5.4', priorArtifact: prior,
      clientItems: [{ type: 'function_call_output', call_id: 'call_1', output: 'sunny' }],
    })
    expect(result.nativeRequest.input).toEqual([
      user('weather?'),
      { id: 'rs_1', type: 'reasoning', status: 'completed', summary: [], encrypted_content: 'encrypted' },
      { id: 'fc_1', type: 'function_call', call_id: 'call_1', name: 'weather', arguments: '{}', status: 'completed' },
      { type: 'function_call_output', call_id: 'call_1', output: 'sunny' },
    ])
  })

  it('encodes the maximum reasoning effort without aliasing it', () => {
    const result = compileOpenAIResponsesRequestV1({
      model: 'gpt-5.6-sol', priorArtifact: null, clientItems: [user('x')],
      reasoning: { effort: 'max', summary: 'auto' },
    })
    expect(result.nativeRequest.reasoning).toEqual({ effort: 'max', summary: 'auto' })
  })

  it('rejects unknown fields, unsupported reasoning fields, unsafe tool schemas and invalid explicit choices', () => {
    expect(() => compileOpenAIResponsesRequestV1({
      model: 'gpt-5.4', priorArtifact: null, clientItems: [user('x')], reasoning: { effort: 'medium', mode: 'auto' },
    })).toThrow('GENERATION_V2_OPENAI_REQUEST_UNKNOWN_FIELD')
    expect(() => compileOpenAIResponsesRequestV1({
      model: 'gpt-5.4', priorArtifact: null, clientItems: [user('x')],
      tools: [{ type: 'function', name: 'x', parameters: { get value() { return 'x' } }, strict: true }],
    })).toThrow('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    expect(() => compileOpenAIResponsesRequestV1({
      model: 'gpt-5.4', priorArtifact: null, clientItems: [user('x')], toolChoice: 'required',
    })).toThrow('GENERATION_V2_OPENAI_REQUEST_INVALID_VALUE')
    expect(() => compileOpenAIResponsesRequestV1({
      model: 'gpt-5.4', priorArtifact: null, clientItems: [user('x')], previous_response_id: 'resp_1',
    })).toThrow('GENERATION_V2_OPENAI_REQUEST_UNKNOWN_FIELD')
  })
})
