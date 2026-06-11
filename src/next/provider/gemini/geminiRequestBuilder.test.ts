import { describe, expect, it } from 'vitest'
import { buildGeminiRequest, type GeminiContent } from '@/next/provider/gemini/geminiRequestBuilder'
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

  it('includes thinkingConfig when mode is effort', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: 'high' }),
    })

    expect((req.generationConfig as any).thinkingConfig).toEqual({ thinkingBudget: 16384 })
  })

  it('maps thinking budget levels correctly', () => {
    for (const [effort, budget] of [['low', 1024], ['minimal', 1024], ['medium', 4096], ['high', 16384], ['xhigh', 32768]] as const) {
      const req = buildGeminiRequest({
        model: 'gemini-2.5-pro',
        messages: baseMessages,
        config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: effort }),
      })
      expect((req.generationConfig as any).thinkingConfig.thinkingBudget).toBe(budget)
    }
  })

  it('does not include thinkingConfig when mode is auto', () => {
    const req = buildGeminiRequest({
      model: 'gemini-2.5-pro',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'auto', requestedReasoningEffort: 'high' }),
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
      config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: 'high' }),
    })

    expect((req as any).reasoning_effort).toBeUndefined()
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
