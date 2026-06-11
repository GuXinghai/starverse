import { describe, expect, it } from 'vitest'
import { buildDeepSeekRequest, type DeepSeekMessage } from '@/next/provider/deepseek/deepSeekRequestBuilder'
import type { ProviderStreamConfig } from '@/next/provider/providerTypes'

const baseMessages: DeepSeekMessage[] = [
  { role: 'system', content: 'You are a helpful assistant.' },
  { role: 'user', content: 'Hello' },
]

function baseConfig(overrides?: Partial<ProviderStreamConfig>): ProviderStreamConfig {
  return {
    model: 'deepseek-chat',
    requestedReasoningMode: 'auto',
    ...overrides,
  }
}

describe('buildDeepSeekRequest', () => {
  it('builds minimal request body: model, messages, stream true', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-chat',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.model).toBe('deepseek-chat')
    expect(req.messages).toBe(baseMessages)
    expect(req.stream).toBe(true)
  })

  it('includes temperature when present', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-chat',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { temperature: 0.7 } }),
    })

    expect(req.temperature).toBe(0.7)
    expect(req.top_p).toBeUndefined()
    expect(req.max_tokens).toBeUndefined()
  })

  it('includes top_p when present', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-chat',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { top_p: 0.9 } }),
    })

    expect(req.top_p).toBe(0.9)
    expect(req.temperature).toBeUndefined()
  })

  it('includes max_tokens when present', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-chat',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { max_tokens: 4096 } }),
    })

    expect(req.max_tokens).toBe(4096)
  })

  it('includes multiple sampling params together', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-chat',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { temperature: 0.5, top_p: 0.8, max_tokens: 2048 } }),
    })

    expect(req.temperature).toBe(0.5)
    expect(req.top_p).toBe(0.8)
    expect(req.max_tokens).toBe(2048)
  })

  it('does not include sampling params when absent', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-chat',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.temperature).toBeUndefined()
    expect(req.top_p).toBeUndefined()
    expect(req.max_tokens).toBeUndefined()
  })

  it('includes tools when present and non-empty', () => {
    const tools = [{ type: 'function', function: { name: 'get_weather', parameters: {} } }]
    const req = buildDeepSeekRequest({
      model: 'deepseek-chat',
      messages: baseMessages,
      config: baseConfig({ tools }),
    })

    expect(req.tools).toEqual(tools)
  })

  it('does not include tools when empty array', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-chat',
      messages: baseMessages,
      config: baseConfig({ tools: [] }),
    })

    expect(req.tools).toBeUndefined()
  })

  it('does not include tools when absent', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-chat',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.tools).toBeUndefined()
  })

  it('includes reasoning_effort when mode is effort', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-reasoner',
      messages: baseMessages,
      config: baseConfig({
        requestedReasoningMode: 'effort',
        requestedReasoningEffort: 'high',
      }),
    })

    expect(req.reasoning_effort).toBe('high')
  })

  it('does not include reasoning_effort when mode is auto', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-reasoner',
      messages: baseMessages,
      config: baseConfig({
        requestedReasoningMode: 'auto',
        requestedReasoningEffort: 'high',
      }),
    })

    expect(req.reasoning_effort).toBeUndefined()
  })

  it('does not include reasoning_effort when effort is not set', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-reasoner',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort' }),
    })

    expect(req.reasoning_effort).toBeUndefined()
  })

  it('does not include OpenRouter-specific fields', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-chat',
      messages: baseMessages,
      config: baseConfig({
        webSearch: { requestPatch: { plugins: [{ id: 'web' }] } },
        additionalPlugins: [{ id: 'file-parser' }],
        imageGeneration: { capabilityClass: 'text-to-image' },
      }),
    })

    // No OpenRouter plugin fields
    expect((req as any).plugins).toBeUndefined()
    expect((req as any).provider).toBeUndefined()
    expect((req as any).web_search_options).toBeUndefined()
    expect((req as any).modalities).toBeUndefined()
    expect((req as any).image_config).toBeUndefined()
  })

  it('does not include reasoning.exclude', () => {
    const req = buildDeepSeekRequest({
      model: 'deepseek-reasoner',
      messages: baseMessages,
      config: baseConfig({
        requestedReasoningMode: 'effort',
        requestedReasoningEffort: 'high',
        requestedReasoningExclude: true,
      }),
    })

    expect((req as any).reasoning).toBeUndefined()
    expect((req as any).exclude).toBeUndefined()
    // reasoning_effort is still present (DeepSeek top-level param)
    expect(req.reasoning_effort).toBe('high')
  })
})
