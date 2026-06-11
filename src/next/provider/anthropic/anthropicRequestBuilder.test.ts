import { describe, expect, it } from 'vitest'
import { buildAnthropicRequest, type AnthropicMessage } from '@/next/provider/anthropic/anthropicRequestBuilder'
import type { ProviderStreamConfig } from '@/next/provider/providerTypes'

const baseMessages: AnthropicMessage[] = [
  { role: 'user', content: 'Hello' },
]

function baseConfig(overrides?: Partial<ProviderStreamConfig>): ProviderStreamConfig {
  return {
    model: 'claude-sonnet-4-5',
    requestedReasoningMode: 'auto',
    ...overrides,
  }
}

describe('buildAnthropicRequest', () => {
  it('builds minimal request: model, messages, max_tokens, stream true', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.model).toBe('claude-sonnet-4-5')
    expect(req.messages).toEqual(baseMessages)
    expect(req.max_tokens).toBe(4096)
    expect(req.stream).toBe(true)
  })

  it('uses custom maxTokens when provided', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig(),
      maxTokens: 8192,
    })

    expect(req.max_tokens).toBe(8192)
  })

  it('includes system when present', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig(),
      system: 'You are helpful.',
    })

    expect(req.system).toBe('You are helpful.')
  })

  it('does not include system when absent', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.system).toBeUndefined()
  })

  it('includes temperature when present', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { temperature: 0.7 } }),
    })

    expect(req.temperature).toBe(0.7)
  })

  it('includes top_p when present', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { top_p: 0.9 } }),
    })

    expect(req.top_p).toBe(0.9)
  })

  it('does not include sampling params when absent', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.temperature).toBeUndefined()
    expect(req.top_p).toBeUndefined()
  })

  it('includes tools when present and non-empty', () => {
    const tools = [{ type: 'custom', name: 'get_weather', input_schema: { type: 'object' } }]
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({ tools }),
    })

    expect(req.tools).toEqual(tools)
  })

  it('does not include tools when empty', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({ tools: [] }),
    })

    expect(req.tools).toBeUndefined()
  })

  it('includes thinking config when mode is effort', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: 'high' }),
    })

    expect(req.thinking).toEqual({ type: 'enabled', budget_tokens: 16384 })
    // max_tokens must exceed budget_tokens
    expect(req.max_tokens).toBeGreaterThan((req.thinking as any).budget_tokens)
  })

  it('maps thinking budget levels correctly', () => {
    for (const [effort, budget] of [['low', 1024], ['minimal', 1024], ['medium', 4096], ['high', 16384], ['xhigh', 32768]] as const) {
      const req = buildAnthropicRequest({
        model: 'claude-sonnet-4-5',
        messages: baseMessages,
        config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: effort }),
      })
      expect((req.thinking as any).budget_tokens).toBe(budget)
    }
  })

  it('default max_tokens always exceeds thinking budget for all effort levels', () => {
    for (const effort of ['low', 'minimal', 'medium', 'high', 'xhigh'] as const) {
      const req = buildAnthropicRequest({
        model: 'claude-sonnet-4-5',
        messages: baseMessages,
        config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: effort }),
      })
      expect(req.max_tokens).toBeGreaterThan((req.thinking as any).budget_tokens)
    }
  })

  it('medium effort raises max_tokens above budget (no longer equal)', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: 'medium' }),
    })

    expect((req.thinking as any).budget_tokens).toBe(4096)
    expect(req.max_tokens).toBe(4097) // budget + 1
  })

  it('explicit max_tokens greater than budget_tokens is preserved', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: 'high' }),
      maxTokens: 32768,
    })

    expect((req.thinking as any).budget_tokens).toBe(16384)
    expect(req.max_tokens).toBe(32768)
  })

  it('explicit max_tokens lower than budget is adjusted to budget + 1', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: 'high' }),
      maxTokens: 1000,
    })

    expect((req.thinking as any).budget_tokens).toBe(16384)
    expect(req.max_tokens).toBe(16385)
  })

  it('explicit max_tokens equal to budget is adjusted to budget + 1', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: 'high' }),
      maxTokens: 16384,
    })

    expect((req.thinking as any).budget_tokens).toBe(16384)
    expect(req.max_tokens).toBe(16385)
  })

  it('does not include thinking when mode is auto', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'auto', requestedReasoningEffort: 'high' }),
    })

    expect(req.thinking).toBeUndefined()
  })

  it('does not include OpenRouter-specific fields', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({
        webSearch: { requestPatch: { plugins: [{ id: 'web' }] } },
        additionalPlugins: [{ id: 'file-parser' }],
      }),
    })

    expect((req as any).plugins).toBeUndefined()
    expect((req as any).provider).toBeUndefined()
    expect((req as any).openrouter).toBeUndefined()
  })

  it('does not include DeepSeek-specific fields', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: 'high' }),
    })

    expect((req as any).reasoning_effort).toBeUndefined()
  })

  it('does not include OpenAI Responses-specific fields', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect((req as any).input).toBeUndefined()
    expect((req as any).reasoning).toBeUndefined()
  })
})
