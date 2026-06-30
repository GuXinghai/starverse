import { describe, expect, it } from 'vitest'
import {
  deserializeChatSessionConfigFromConvoMeta,
  serializeChatSessionConfigToConvoMeta,
  type ChatSessionConfig,
} from './chatSessionConfig'

function createConfig(overrides: Partial<ChatSessionConfig> = {}): ChatSessionConfig {
  return {
    model: { selectedProviderId: null, selectedModelKey: null },
    reasoning: { enabled: false, effort: 'medium' },
    webSearch: {
      enabled: true,
      level: 'high',
      detail: null,
    },
    imageGeneration: {
      enabled: false,
      resolution: '1K',
      aspectRatio: '1:1',
      mode: 'default',
      detail: null,
    },
    samplingParams: {
      detail: null,
    },
    ...overrides,
  }
}

describe('chatSessionConfig', () => {
  it('serializes custom web-search depth without replacing it with the quick-control level', () => {
    const meta = serializeChatSessionConfigToConvoMeta({
      config: createConfig({
        webSearch: {
          enabled: true,
          level: 'high',
          detail: { searchMode: 'enable', searchDepth: 'custom', maxResults: 7 },
        },
      }),
      defaultModelKey: 'openrouter/auto',
    })

    expect(meta?.webSearchOverride).toEqual({
      searchMode: 'enable',
      searchDepth: 'custom',
      maxResults: 7,
    })
  })

  it('deserializes custom web-search depth back into detail and high-level quick state', () => {
    const config = deserializeChatSessionConfigFromConvoMeta({
      convoMeta: {
        webSearchOverride: { searchMode: 'enable', searchDepth: 'custom', maxResults: 7 },
      },
      defaultModelKey: 'openrouter/auto',
    })

    expect(config.webSearch.detail).toEqual({ searchMode: 'enable', searchDepth: 'custom', maxResults: 7 })
    expect(config.webSearch.enabled).toBe(true)
    expect(config.webSearch.level).toBe('high')
  })

  it('round-trips provider and model selection without using modelId-only meta', () => {
    const meta = serializeChatSessionConfigToConvoMeta({
      config: createConfig({
        model: {
          selectedProviderId: 'anthropic_messages',
          selectedModelKey: 'claude-haiku-4-5',
        },
      }),
      defaultProviderId: 'openrouter',
      defaultModelKey: 'openrouter/auto',
    })

    expect(meta).toMatchObject({
      selectedProviderId: 'anthropic_messages',
      selectedModelKey: 'claude-haiku-4-5',
    })

    const config = deserializeChatSessionConfigFromConvoMeta({
      convoMeta: meta,
      defaultProviderId: 'openrouter',
      defaultModelKey: 'openrouter/auto',
    })

    expect(config.model).toEqual({
      selectedProviderId: 'anthropic_messages',
      selectedModelKey: 'claude-haiku-4-5',
    })
  })

  it('keeps legacy model-only meta readable as OpenRouter selection', () => {
    const config = deserializeChatSessionConfigFromConvoMeta({
      convoMeta: { selectedModelKey: 'openai/gpt-4o-mini' },
      defaultProviderId: 'openrouter',
      defaultModelKey: 'openrouter/auto',
    })

    expect(config.model).toEqual({
      selectedProviderId: 'openrouter',
      selectedModelKey: 'openai/gpt-4o-mini',
    })
  })
})
