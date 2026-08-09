import { describe, expect, it } from 'vitest'
import { buildGeminiImageGenerationInteractionRequest, buildGeminiRequest, type GeminiContent } from '@/next/provider/gemini/geminiRequestBuilder'
import type { ProviderStreamConfig } from '@/next/provider/providerTypes'

const baseMessages: GeminiContent[] = [
  { role: 'user', parts: [{ text: 'Hello' }] },
]

function baseConfig(overrides?: Partial<ProviderStreamConfig>): ProviderStreamConfig {
  return {
    model: 'gemini-2.5-pro',
    requestedReasoningMode: 'auto',
    ...overrides,
  }
}

describe('buildGeminiRequest', () => {
  it('builds minimal contents request', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.contents).toEqual(baseMessages)
    expect(req.generationConfig).toBeUndefined()
  })

  it('rejects the removed candidateCount field', () => {
    expect(() => buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ generationParams: { generationConfig: { candidateCount: 2 } } }),
    })).toThrow(/does not expose candidateCount/)
  })

  it('preserves Gemini native signed parts without flattening', () => {
    const messages: GeminiContent[] = [
      {
        role: 'model',
        parts: [
          { text: 'thought', thought: true, thoughtSignature: 'sig-1' } as any,
          { text: 'answer' },
        ],
      },
      { role: 'user', parts: [{ text: 'continue' }] },
    ]
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages,
      config: baseConfig(),
    })

    expect(req.contents).toEqual(messages)
    expect((req.contents[0].parts[0] as any).thoughtSignature).toBe('sig-1')
  })

  it('maps role/content parts correctly', () => {
    const messages: GeminiContent[] = [
      { role: 'user', parts: [{ text: 'Hi' }] },
      { role: 'model', parts: [{ text: 'Hello!' }] },
      { role: 'user', parts: [{ text: 'How are you?' }] },
    ]
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages,
      config: baseConfig(),
    })

    expect(req.contents).toEqual(messages)
    expect(req.contents).toHaveLength(3)
  })

  it('includes systemInstruction when present', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig(),
      systemInstruction: 'You are helpful.',
    })

    expect(req.systemInstruction).toEqual({ parts: [{ text: 'You are helpful.' }] })
  })

  it('does not include systemInstruction when absent', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.systemInstruction).toBeUndefined()
  })

  it('maps temperature when present', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ generationParams: { generationConfig: { temperature: 0.7 } } }),
    })

    expect((req.generationConfig as any).temperature).toBe(0.7)
  })

  it('maps topP when present', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ generationParams: { generationConfig: { topP: 0.9 } } }),
    })

    expect((req.generationConfig as any).topP).toBe(0.9)
  })

  it('maps maxOutputTokens when present', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ generationParams: { generationConfig: { maxOutputTokens: 4096 } } }),
    })

    expect((req.generationConfig as any).maxOutputTokens).toBe(4096)
  })

  it('omits generationConfig when no Google-specific generation field is configured', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.generationConfig).toBeUndefined()
  })

  it('includes native thinkingBudget from generationParams', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-flash',
      messages: baseMessages,
      config: baseConfig({
        generationParams: {
          generationConfig: {
            thinkingConfig: { thinkingBudget: 1234, includeThoughts: true },
          },
        },
      }),
    })

    expect((req.generationConfig as any).thinkingConfig).toEqual({
      thinkingBudget: 1234,
      includeThoughts: true,
    })
  })

  it('includes native thinkingLevel from generationParams', () => {
    const req = buildGeminiRequest({
      model: 'gemini-3-pro',
      messages: baseMessages,
      config: baseConfig({
        generationParams: {
          generationConfig: {
            thinkingConfig: { thinkingLevel: 'minimal', includeThoughts: false },
          },
        },
      }),
    })

    expect((req.generationConfig as any).thinkingConfig).toEqual({
      thinkingLevel: 'minimal',
      includeThoughts: false,
    })
  })

  it('serializes Gemini 3 thinking level and thought summaries from generationParams', () => {
    const req = buildGeminiRequest({
      model: 'gemini-3.1-flash-lite',
      messages: baseMessages,
      config: baseConfig({
        generationParams: {
          generationConfig: {
            thinkingConfig: { thinkingLevel: 'medium', includeThoughts: true },
          },
        },
      }),
    })

    expect(req.generationConfig).toEqual({
      thinkingConfig: { thinkingLevel: 'medium', includeThoughts: true },
    })
  })

  it('ignores generic reasoning effort for Gemini native requests', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: 'high' }),
    })

    expect(req.generationConfig).toBeUndefined()
  })

  it('includes tools when present and non-empty', () => {
    const tools = [{ name: 'get_weather', parameters: { type: 'object' } }]
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ tools }),
    })

    expect(req.tools).toEqual([{ functionDeclarations: tools }])
  })

  it('does not include tools when empty', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ tools: [] }),
    })

    expect(req.tools).toBeUndefined()
  })

  it('does not include OpenRouter-specific fields', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({
        webSearch: { requestPatch: { plugins: [{ id: 'web' }] } },
        additionalPlugins: [{ id: 'file-parser' }],
      }),
    })

    expect((req as any).plugins).toBeUndefined()
    expect((req as any).provider).toBeUndefined()
  })

  it('does not include DeepSeek-specific fields', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect((req as any).reasoning_effort).toBeUndefined()
    expect((req as any).reasoning).toBeUndefined()
  })

  it('does not include Anthropic-specific fields', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect((req as any).max_tokens).toBeUndefined()
    expect((req as any).system).toBeUndefined()
    expect((req as any).thinking).toBeUndefined()
  })
})

describe('buildGeminiImageGenerationInteractionRequest', () => {
  it('builds Gemini Interactions image request with response_format', () => {
    const req = buildGeminiImageGenerationInteractionRequest({
      model: 'gemini-3.1-flash-image',
      messages: baseMessages,
      config: baseConfig({
        imageGeneration: {
          outputMode: 'image_and_text',
          aspectRatio: '16:9',
          imageSize: '2K',
        },
      }),
    })

    expect(req).toEqual({
      model: 'models/gemini-3.1-flash-image',
      input: 'Hello',
      stream: true,
      response_format: [
        { type: 'text' },
        {
          type: 'image',
          aspect_ratio: '16:9',
          image_size: '2K',
        },
      ],
    })
  })

  it('does not write aspect_ratio for auto or image_size for legacy Nano Banana', () => {
    const req = buildGeminiImageGenerationInteractionRequest({
      model: 'publishers/google/models/gemini-2.5-flash-image',
      messages: [
        { role: 'user', parts: [{ text: 'First' }] },
        { role: 'model', parts: [{ text: 'Second' }] },
      ],
      config: baseConfig({
        requestedReasoningMode: 'effort',
        requestedReasoningEffort: 'high',
        imageGeneration: {
          outputMode: 'image_only',
          aspectRatio: 'auto',
          imageSize: '4K',
        },
      }),
    })

    expect(req.model).toBe('models/gemini-2.5-flash-image')
    expect(req.input).toBe('First\n\nSecond')
    expect(req.stream).toBe(true)
    expect(req.response_format).toEqual({ type: 'image' })
    expect((req as any).reasoning_effort).toBeUndefined()
    expect((req as any).reasoning).toBeUndefined()
    expect((req as any).imageConfig).toBeUndefined()
  })

  it('includes Interactions generation_config for image generation reasoning summaries and supported levels', () => {
    const req = buildGeminiImageGenerationInteractionRequest({
      model: 'gemini-3.1-flash-image',
      messages: baseMessages,
      config: baseConfig({
        imageGeneration: { aspectRatio: '1:1' },
        generationParams: {
          generation_config: {
            temperature: 1.5,
            top_p: 0.8,
            max_output_tokens: 4096,
            stop_sequences: ['STOP'],
            thinking_level: 'high',
            thinking_summaries: 'auto',
          },
        },
      }),
    })

    expect(req.generation_config).toEqual({
      temperature: 1.5,
      top_p: 0.8,
      max_output_tokens: 4096,
      stop_sequences: ['STOP'],
      thinking_level: 'high',
      thinking_summaries: 'auto',
    })
    expect((req as any).thinking_config).toBeUndefined()
  })

  it('omits thinking_summaries when thought summary mode is none', () => {
    const req = buildGeminiImageGenerationInteractionRequest({
      model: 'gemini-3.1-flash-lite-image',
      messages: baseMessages,
      config: baseConfig({
        imageGeneration: { imageSize: '1K' },
        generationParams: {
          generation_config: {
            thinking_level: 'minimal',
            thinking_summaries: 'none',
          },
        },
      }),
    })

    expect(req.generation_config).toEqual({
      thinking_level: 'minimal',
    })
  })

  it('maps Gemini image generation tools by model capability', () => {
    const req = buildGeminiImageGenerationInteractionRequest({
      model: 'gemini-3.1-flash-image',
      messages: baseMessages,
      config: baseConfig({
        imageGeneration: { imageSize: '512' },
        generationParams: {
          tools: {
            google_search: true,
            image_search: true,
          },
        },
      }),
    })

    expect(req.tools).toEqual([
      { google_search: {} },
      { image_search: {} },
    ])
  })

  it('rejects illegal model-specific image sizes without fallback', () => {
    expect(() => buildGeminiImageGenerationInteractionRequest({
      model: 'gemini-3.1-flash-lite-image',
      messages: baseMessages,
      config: baseConfig({
        imageGeneration: { imageSize: '4K' },
      }),
    })).toThrow('Supported sizes: 1K')
  })

  it('rejects unsupported tools before fetch', () => {
    expect(() => buildGeminiImageGenerationInteractionRequest({
      model: 'gemini-3-pro-image',
      messages: baseMessages,
      config: baseConfig({
        imageGeneration: { imageSize: '1K' },
        generationParams: {
          tools: {
            image_search: true,
          },
        },
      }),
    })).toThrow('does not support Image Search')
  })

  it('rejects Gemini image generation temperature above 2 before fetch', () => {
    expect(() => buildGeminiImageGenerationInteractionRequest({
      model: 'gemini-3.1-flash-image',
      messages: baseMessages,
      config: baseConfig({
        imageGeneration: { imageSize: '1K' },
        generationParams: {
          generation_config: {
            temperature: 2.1,
          },
        },
      }),
    })).toThrow('temperature must be between 0 and 2')
  })
})
