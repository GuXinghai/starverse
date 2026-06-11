import { describe, expect, it } from 'vitest'
import { buildResponsesRequest, type ResponsesInputMessage } from '@/next/provider/openai-responses/openaiResponsesRequestBuilder'
import type { ProviderStreamConfig } from '@/next/provider/providerTypes'

const baseMessages: ResponsesInputMessage[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello' },
]

function baseConfig(overrides?: Partial<ProviderStreamConfig>): ProviderStreamConfig {
  return {
    model: 'o3',
    requestedReasoningMode: 'auto',
    ...overrides,
  }
}

describe('buildResponsesRequest', () => {
  it('builds minimal request: model, input, stream true', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.model).toBe('o3')
    expect(req.input).toEqual(baseMessages)
    expect(req.stream).toBe(true)
  })

  it('includes instructions when present', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig(),
      instructions: 'Be concise.',
    })

    expect(req.instructions).toBe('Be concise.')
  })

  it('does not include instructions when absent', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.instructions).toBeUndefined()
  })

  it('includes reasoning config when mode is effort', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({
        requestedReasoningMode: 'effort',
        requestedReasoningEffort: 'high',
      }),
    })

    expect(req.reasoning).toBeDefined()
    expect((req.reasoning as any).effort).toBe('high')
    expect((req.reasoning as any).summary).toBe('concise')
  })

  it('maps reasoning effort levels correctly', () => {
    for (const [input, expected] of [['low', 'low'], ['minimal', 'low'], ['medium', 'medium'], ['high', 'high'], ['xhigh', 'high']] as const) {
      const req = buildResponsesRequest({
        model: 'o3',
        messages: baseMessages,
        config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: input }),
      })
      expect((req.reasoning as any).effort).toBe(expected)
    }
  })

  it('does not include reasoning when mode is auto', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'auto', requestedReasoningEffort: 'high' }),
    })

    expect(req.reasoning).toBeUndefined()
  })

  it('includes reasoning with summary only when mode is effort but no effort set', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort' }),
    })

    expect(req.reasoning).toBeDefined()
    expect((req.reasoning as any).effort).toBeUndefined()
    expect((req.reasoning as any).summary).toBe('concise')
  })

  it('includes max_output_tokens from samplingParams.max_tokens', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { max_tokens: 4096 } }),
    })

    expect(req.max_output_tokens).toBe(4096)
  })

  it('does not include max_output_tokens when absent', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.max_output_tokens).toBeUndefined()
  })

  it('includes tools when present and non-empty', () => {
    const tools = [{ type: 'function', function: { name: 'get_weather' } }]
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({ tools }),
    })

    expect(req.tools).toEqual(tools)
  })

  it('does not include tools when empty', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({ tools: [] }),
    })

    expect(req.tools).toBeUndefined()
  })

  it('does not include OpenRouter-specific fields', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({
        webSearch: { requestPatch: { plugins: [{ id: 'web' }] } },
        additionalPlugins: [{ id: 'file-parser' }],
        imageGeneration: { capabilityClass: 'text-to-image' },
      }),
    })

    expect((req as any).plugins).toBeUndefined()
    expect((req as any).provider).toBeUndefined()
    expect((req as any).web_search_options).toBeUndefined()
    expect((req as any).modalities).toBeUndefined()
    expect((req as any).image_config).toBeUndefined()
  })

  it('does not include DeepSeek-specific fields', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({
        requestedReasoningMode: 'effort',
        requestedReasoningEffort: 'high',
      }),
    })

    expect((req as any).reasoning_effort).toBeUndefined()
  })
})
