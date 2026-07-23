import { describe, expect, it } from 'vitest'
import {
  compileDeepSeekStableChatRequestV1,
  DEEPSEEK_STABLE_REQUEST_MAX_BYTES_V1,
} from './chatRequestV1'
import { completeDeepSeekNativeRequestV2 } from './nativeMessagesV1'

const user = (content: string) => ({ kind: 'client', message: { role: 'user', content } }) as const
const functionTool = {
  type: 'function',
  function: {
    name: 'weather', description: 'Get weather',
    parameters: {
      type: 'object', properties: { city: { type: 'string' } },
      required: ['city'], additionalProperties: false,
    },
  },
} as const

describe('DeepSeek stable Chat request V1', () => {
  it('compiles the exact thinking+tools body and keeps absent tool_choice absent', () => {
    const result = compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user('杭州天气？')],
      thinking: { type: 'enabled', reasoningEffort: 'high' },
      generation: { maxTokens: 1024, stop: ['END'] },
      tools: [functionTool],
    })
    expect(result.executionAuthority).toBe('none')
    expect(result.nativeRequest).toEqual({
      model: 'deepseek-v4-pro',
      messages: [{ role: 'user', content: '杭州天气？' }],
      stream: true,
      stream_options: { include_usage: true },
      thinking: { type: 'enabled' },
      reasoning_effort: 'high',
      max_tokens: 1024,
      stop: ['END'],
      tools: [functionTool],
    })
    expect(result.nativeRequest).not.toHaveProperty('tool_choice')
    expect(Object.isFrozen(result.nativeRequest.tools?.[0].function.parameters)).toBe(true)
    expect(Object.isFrozen((result.nativeRequest.tools?.[0].function.parameters as any).properties)).toBe(true)
    expect(Object.isFrozen(result.nativeRequest.stop)).toBe(true)
    expect(result.preparedBody.copyUtf8Text()).toBe(
      '{"max_tokens":1024,"messages":[{"content":"杭州天气？","role":"user"}],"model":"deepseek-v4-pro","reasoning_effort":"high","stop":["END"],"stream":true,"stream_options":{"include_usage":true},"thinking":{"type":"enabled"},"tools":[{"function":{"description":"Get weather","name":"weather","parameters":{"additionalProperties":false,"properties":{"city":{"type":"string"}},"required":["city"],"type":"object"}},"type":"function"}]}',
    )
    expect(result.preparedBody.byteLength)
      .toBe(new TextEncoder().encode(result.preparedBody.copyUtf8Text()).byteLength)
  })

  it.each(['high', 'max'] as const)('encodes official thinking effort %s and JSON Output without dropping either field', (effort) => {
    const result = compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user('Return JSON.')],
      thinking: { type: 'enabled', reasoningEffort: effort },
      generation: { maxTokens: 256, responseFormat: 'json_object' },
    })
    expect(result.nativeRequest).toMatchObject({
      thinking: { type: 'enabled' },
      reasoning_effort: effort,
      response_format: { type: 'json_object' },
    })
    expect(JSON.parse(result.preparedBody.copyUtf8Text())).toMatchObject({
      model: 'deepseek-v4-pro',
      reasoning_effort: effort,
      response_format: { type: 'json_object' },
      thinking: { type: 'enabled' },
    })
  })

  it.each([
    'auto', 'none', 'required', { type: 'function', function: { name: 'weather' } },
  ])('rejects explicit thinking tool_choice %j before compilation', (toolChoice) => {
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user('x')],
      thinking: { type: 'enabled' }, tools: [functionTool], toolChoice,
    })).toThrow('DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED')
  })

  it.each([
    ['temperature', 0.5], ['topP', 0.9], ['frequencyPenalty', 0], ['presencePenalty', 0],
  ])('rejects explicit thinking sampling field %s', (field, value) => {
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user('x')],
      thinking: { type: 'enabled' }, generation: { [field]: value },
    })).toThrow('DEEPSEEK_THINKING_EXPLICIT_SAMPLING_UNSUPPORTED')
  })

  it.each([
    'auto', 'none', 'required', { type: 'function', function: { name: 'weather' } },
  ])('encodes formal disabled-thinking tool_choice %j', (toolChoice) => {
    const result = compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-flash', priorArtifact: null, clientEntries: [user('x')],
      thinking: { type: 'disabled' }, generation: { temperature: 0.5, topP: 0.8 },
      tools: [functionTool], toolChoice,
    })
    expect(result.nativeRequest.tool_choice).toEqual(toolChoice)
    expect(result.nativeRequest).toMatchObject({ thinking: { type: 'disabled' }, temperature: 0.5, top_p: 0.8 })
  })

  it.each(['frequencyPenalty', 'presencePenalty'])('rejects deprecated stable penalty %s when thinking is disabled', (field) => {
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-flash', priorArtifact: null, clientEntries: [user('x')],
      thinking: { type: 'disabled' }, generation: { [field]: 0 },
    })).toThrow('DEEPSEEK_EXPLICIT_DEPRECATED_PENALTY_UNSUPPORTED')
  })

  it('replays complete provider-native assistant reasoning and tool messages byte-for-byte', () => {
    const prior = completeDeepSeekNativeRequestV2({
      priorArtifact: null, clientEntries: [user('weather')],
      assistantMessage: {
        role: 'assistant', content: 'Checking', reasoning_content: 'Need weather tool',
        tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'weather', arguments: '{"city":"杭州"}' } }],
      },
      generatedWithThinking: 'enabled',
    })
    const result = compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: prior,
      clientEntries: [{ kind: 'client', message: { role: 'tool', tool_call_id: 'call_1', content: '20C' } }],
      thinking: { type: 'enabled', reasoningEffort: 'max' }, tools: [functionTool],
    })
    expect(result.nativeRequest.messages[1]).toEqual(prior.orderedEntries[1].message)
    expect(result.nativeRequest.messages[2]).toEqual({ role: 'tool', tool_call_id: 'call_1', content: '20C' })
    expect(result.preparedBody.copyUtf8Text()).toContain('"reasoning_content":"Need weather tool"')
  })

  it('compiles an explicit selected complete-turn replay without a parent artifact', () => {
    const result = compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro',
      replayEntries: [
        { kind: 'client', message: { role: 'user', content: 'selected first' } },
        { kind: 'assistant', generatedWithThinking: 'enabled', message: {
          role: 'assistant', content: 'first answer', reasoning_content: 'first reasoning',
        } },
        { kind: 'client', message: { role: 'user', content: 'current third' } },
      ],
      thinking: { type: 'enabled' },
    })
    expect(result.nativeRequest.messages).toEqual([
      { role: 'user', content: 'selected first' },
      { role: 'assistant', content: 'first answer', reasoning_content: 'first reasoning' },
      { role: 'user', content: 'current third' },
    ])
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user('x')], replayEntries: [user('x')],
      thinking: { type: 'disabled' },
    })).toThrow('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_SHAPE')
  })

  it('fails before prepared bytes for missing native reasoning, booleans, unknown fields and invalid named tools', () => {
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user('x')], thinking: { type: true },
    })).toThrow('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user('x')],
      thinking: { type: 'disabled' }, toolChoice: 'auto',
    })).toThrow('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user('x')],
      thinking: { type: 'disabled' }, extraBody: { path: '/v1' },
    })).toThrow('GENERATION_V2_DEEPSEEK_REQUEST_UNKNOWN_FIELD')
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user('x')],
      thinking: { type: 'disabled' }, tools: [functionTool],
      toolChoice: { type: 'function', function: { name: 'missing' } },
    })).toThrow('GENERATION_V2_DEEPSEEK_REQUEST_INVALID_VALUE')
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user('x')],
      thinking: { type: 'disabled' },
      tools: [{ type: 'function', function: { name: 'weather', strict: true } }],
    })).toThrow('GENERATION_V2_DEEPSEEK_REQUEST_UNKNOWN_FIELD')
  })

  it('bounds exact prepared bytes across escaping, cumulative history and tool schemas', () => {
    const escaping = '\u0000'.repeat(3_500_000)
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user(escaping)],
      thinking: { type: 'disabled' },
    })).toThrow('GENERATION_V2_DEEPSEEK_REQUEST_LIMIT_EXCEEDED')

    const large = 'x'.repeat(3_500_000)
    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null,
      clientEntries: Array.from({ length: 6 }, () => user(large)),
      thinking: { type: 'disabled' },
    })).toThrow('GENERATION_V2_DEEPSEEK_REQUEST_LIMIT_EXCEEDED')

    expect(() => compileDeepSeekStableChatRequestV1({
      model: 'deepseek-v4-pro', priorArtifact: null, clientEntries: [user('x')],
      thinking: { type: 'disabled' },
      tools: [{
        type: 'function',
        function: { name: 'large', parameters: { description: 'x'.repeat(DEEPSEEK_STABLE_REQUEST_MAX_BYTES_V1) } },
      }],
    })).toThrow('GENERATION_V2_DEEPSEEK_REQUEST_LIMIT_EXCEEDED')
  })
})
