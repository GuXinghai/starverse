import { describe, expect, it } from 'vitest'
import { buildGenericRequest, type GenericMessage } from '@/next/provider/generic/genericRequestBuilder'
import type { ProviderStreamConfig } from '@/next/provider/providerTypes'

const baseMessages: GenericMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello' },
]

function baseConfig(overrides?: Partial<ProviderStreamConfig>): ProviderStreamConfig {
  return {
    model: 'gpt-4o-mini',
    requestedReasoningMode: 'auto',
    ...overrides,
  }
}

describe('buildGenericRequest', () => {
  it('builds minimal body: model, messages, stream true', () => {
    const req = buildGenericRequest({
      model: 'gpt-4o-mini',
      messages: baseMessages,
      config: baseConfig(),
    })

    expect(req.model).toBe('gpt-4o-mini')
    expect(req.messages).toEqual(baseMessages)
    expect(req.stream).toBe(true)
  })

  it('includes temperature when present', () => {
    const req = buildGenericRequest({
      model: 'gpt-4o-mini',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { temperature: 0.7 } }),
    })
    expect(req.temperature).toBe(0.7)
    expect(req.top_p).toBeUndefined()
    expect(req.max_tokens).toBeUndefined()
  })

  it('includes top_p when present', () => {
    const req = buildGenericRequest({
      model: 'gpt-4o-mini',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { top_p: 0.9 } }),
    })
    expect(req.top_p).toBe(0.9)
  })

  it('includes max_tokens when present', () => {
    const req = buildGenericRequest({
      model: 'gpt-4o-mini',
      messages: baseMessages,
      config: baseConfig({ samplingParams: { max_tokens: 1024 } }),
    })
    expect(req.max_tokens).toBe(1024)
  })

  it('includes user when provided', () => {
    const req = buildGenericRequest({
      model: 'gpt-4o-mini',
      messages: baseMessages,
      config: baseConfig(),
      user: 'user-123',
    })
    expect(req.user).toBe('user-123')
  })

  it('does not include user when absent', () => {
    const req = buildGenericRequest({
      model: 'gpt-4o-mini',
      messages: baseMessages,
      config: baseConfig(),
    })
    expect(req.user).toBeUndefined()
  })

  it('does not include unsupported fields', () => {
    const req = buildGenericRequest({
      model: 'gpt-4o-mini',
      messages: baseMessages,
      config: baseConfig({
        tools: [{ type: 'function', function: { name: 'fn' } }],
        webSearch: { requestPatch: {} },
      }),
    })

    expect((req as any).tools).toBeUndefined()
    expect((req as any).functions).toBeUndefined()
    expect((req as any).response_format).toBeUndefined()
    expect((req as any).reasoning).toBeUndefined()
    expect((req as any).plugins).toBeUndefined()
  })

  it('does not include OpenRouter provider object', () => {
    const req = buildGenericRequest({
      model: 'gpt-4o-mini',
      messages: baseMessages,
      config: baseConfig(),
    })
    expect((req as any).provider).toBeUndefined()
  })

  it('does not include DeepSeek reasoning_effort', () => {
    const req = buildGenericRequest({
      model: 'gpt-4o-mini',
      messages: baseMessages,
      config: baseConfig({ requestedReasoningMode: 'effort', requestedReasoningEffort: 'high' }),
    })
    expect((req as any).reasoning_effort).toBeUndefined()
  })
})
