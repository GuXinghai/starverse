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
      config: baseConfig({ samplingParams: { temperature: 0.7 } }),
    })

    expect((req.generationConfig as any).temperature).toBe(0.7)
  })

  it('maps topP when present', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { top_p: 0.9 } }),
    })

    expect((req.generationConfig as any).topP).toBe(0.9)
  })

  it('maps maxOutputTokens when present', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { max_tokens: 4096 } }),
    })

    expect((req.generationConfig as any).maxOutputTokens).toBe(4096)
  })

  it('does not include generationConfig when absent', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.generationConfig).toBeUndefined()
  })

  it('includes native thinkingBudget for Gemini 2.5 budget mode', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-flash',
      messages: baseMessages,
      config: baseConfig({
        geminiThinking: { mode: 'budget', thinkingBudget: 1234, includeThoughts: true },
      }),
    })

    expect((req.generationConfig as any).thinkingConfig).toEqual({
      thinkingBudget: 1234,
      includeThoughts: true,
    })
  })

  it('includes native thinkingLevel for Gemini 3 level mode', () => {
    const req = buildGeminiRequest({
      model: 'gemini-3-pro',
      messages: baseMessages,
      config: baseConfig({
        geminiThinking: { mode: 'level', thinkingLevel: 'minimal', includeThoughts: false },
      }),
    })

    expect((req.generationConfig as any).thinkingConfig).toEqual({
      thinkingLevel: 'minimal',
      includeThoughts: false,
    })
  })

  it('does not include thinkingConfig when Gemini thinking mode is auto', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ geminiThinking: { mode: 'auto', includeThoughts: false } }),
    })

    expect(req.generationConfig).toBeUndefined()
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
      config: baseConfig({ geminiThinking: { mode: 'budget', thinkingBudget: 2048 } }),
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
      response_format: {
        type: 'image',
        aspect_ratio: '16:9',
        image_size: '2K',
      },
    })
  })

  it('allows advanced response_format fields without writing OpenAI reasoning fields', () => {
    const req = buildGeminiImageGenerationInteractionRequest({
      model: 'models/gemini-3-pro-image-preview',
      messages: [
        { role: 'user', parts: [{ text: 'First' }] },
        { role: 'model', parts: [{ text: 'Second' }] },
      ],
      config: baseConfig({
        requestedReasoningMode: 'effort',
        requestedReasoningEffort: 'high',
        imageGeneration: {
          imageConfig: {
            response_format: { seed: 42 },
            aspect_ratio: '1:1',
          },
        },
      }),
    })

    expect(req.model).toBe('models/gemini-3-pro-image-preview')
    expect(req.input).toBe('First\n\nSecond')
    expect(req.stream).toBe(true)
    expect(req.response_format).toEqual({ type: 'image', seed: 42, aspect_ratio: '1:1' })
    expect((req as any).reasoning_effort).toBeUndefined()
    expect((req as any).reasoning).toBeUndefined()
  })

  it('includes Interactions generation_config for image generation reasoning summaries and supported levels', () => {
    const req = buildGeminiImageGenerationInteractionRequest({
      model: 'gemini-3.1-flash-image',
      messages: baseMessages,
      config: baseConfig({
        imageGeneration: { aspectRatio: '1:1' },
        geminiThinking: { mode: 'level', thinkingLevel: 'high', includeThoughts: true },
      }),
    })

    expect(req.generation_config).toEqual({
      thinking_level: 'high',
      thinking_summaries: 'auto',
    })
    expect((req as any).thinking_config).toBeUndefined()
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
})
