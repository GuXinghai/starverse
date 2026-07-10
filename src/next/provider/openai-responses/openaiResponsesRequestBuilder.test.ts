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

  it('does not derive reasoning config from legacy requested reasoning controls', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({
        requestedReasoningMode: 'effort',
        requestedReasoningEffort: 'high',
      }),
    })

    expect(req.reasoning).toBeUndefined()
  })

  it('includes reasoning config from generationParams only', () => {
    for (const effort of ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const) {
      const req = buildResponsesRequest({
        model: 'o3',
        messages: baseMessages,
        config: baseConfig({ generationParams: { reasoning: { effort, summary: 'concise' } } }),
      })
      expect(req.reasoning).toEqual({ effort, summary: 'concise' })
    }
  })

  it('rejects provider-native reasoning effort auto because auto must omit the wire field', () => {
    expect(() => buildResponsesRequest({
      model: 'gpt-5.4-nano',
      messages: baseMessages,
      config: baseConfig({ generationParams: { reasoning: { effort: 'auto' } } }),
    })).toThrow(/effort=auto is not a wire value/)
  })

  it('allows reasoning summary without explicit reasoning effort', () => {
    const req = buildResponsesRequest({
      model: 'gpt-5.4-nano',
      messages: baseMessages,
      config: baseConfig({ generationParams: { reasoning: { summary: 'concise' } } }),
    })

    expect(req.reasoning).toEqual({ summary: 'concise' })
  })

  it.each(['auto', 'concise', 'detailed'] as const)('allows reasoning summary %s as a wire value', (summary) => {
    const req = buildResponsesRequest({
      model: 'gpt-5.4-nano',
      messages: baseMessages,
      config: baseConfig({ generationParams: { reasoning: { summary } } }),
    })

    expect(req.reasoning).toEqual({ summary })
  })

  it.each(['none', 'off', null, false, 'verbose'] as const)('rejects provider-native reasoning summary %s', (summary) => {
    expect(() => buildResponsesRequest({
      model: 'gpt-5.4-nano',
      messages: baseMessages,
      config: baseConfig({ generationParams: { reasoning: { summary } } }),
    })).toThrow(/reasoning\.summary must be omitted or one of auto, concise, detailed/)
  })

  it('omits empty reasoning objects instead of sending reasoning: {}', () => {
    const req = buildResponsesRequest({
      model: 'gpt-5.4-nano',
      messages: baseMessages,
      config: baseConfig({ generationParams: { reasoning: {} } }),
    })

    expect(req.reasoning).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(req, 'reasoning')).toBe(false)
  })

  it('does not include reasoning when mode is auto', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'auto', requestedReasoningEffort: 'high' }),
    })

    expect(req.reasoning).toBeUndefined()
  })

  it('does not synthesize a default reasoning summary from legacy effort mode', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort' }),
    })

    expect(req.reasoning).toBeUndefined()
  })

  it('includes max_output_tokens from generationParams.max_output_tokens', () => {
    const req = buildResponsesRequest({
      model: 'o3',
      messages: baseMessages,
      config: baseConfig({ generationParams: { max_output_tokens: 4096 } }),
    })

    expect(req.max_output_tokens).toBe(4096)
  })

  it('includes provider-native generation params when present', () => {
    const req = buildResponsesRequest({
      model: 'gpt-5.1',
      messages: baseMessages,
      config: baseConfig({
        generationParams: {
          temperature: 0.4,
          top_p: 0.8,
          reasoning: { effort: 'low', summary: 'detailed' },
          text: { verbosity: 'high' },
        },
      }),
    })

    expect(req.temperature).toBe(0.4)
    expect(req.top_p).toBe(0.8)
    expect(req.reasoning).toEqual({ effort: 'low', summary: 'detailed' })
    expect(req.text).toEqual({ verbosity: 'high' })
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

  it('adds image_generation tool when image generation is enabled', () => {
    const req = buildResponsesRequest({
      model: 'gpt-5-mini',
      messages: baseMessages,
      config: baseConfig({
        imageGeneration: {
          outputMode: 'image_and_text',
          aspectRatio: '3:4',
          imageSize: '1K',
          imageConfig: { quality: 'high' },
        },
      }),
    })

    expect(req.tools).toEqual([
      {
        type: 'image_generation',
        quality: 'high',
        size: '1024x1536',
      },
    ])
  })

  it('appends image_generation after existing tools and does not emit OpenRouter aliases', () => {
    const req = buildResponsesRequest({
      model: 'gpt-5-mini',
      messages: baseMessages,
      config: baseConfig({
        tools: [{ type: 'function', name: 'lookup' }],
        imageGeneration: {
          aspectRatio: '1:1',
          imageSize: '4K',
          imageConfig: { aspect_ratio: '16:9', image_size: '2K', size: 'auto' },
        },
      }),
    })

    expect(req.tools).toEqual([
      { type: 'function', name: 'lookup' },
      { type: 'image_generation', size: 'auto' },
    ])
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
