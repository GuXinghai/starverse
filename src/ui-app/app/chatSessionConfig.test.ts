import { describe, expect, it } from 'vitest'
import {
  deserializeChatSessionConfigFromConvoMeta,
  serializeChatSessionConfigToConvoMeta,
  type ChatSessionConfig,
} from './chatSessionConfig'

function createConfig(overrides: Partial<ChatSessionConfig> = {}): ChatSessionConfig {
  return {
    routeSelection: null,
    reasoning: { enabled: false, effort: 'medium' },
    webSearch: { enabled: true, level: 'high', detail: null },
    imageGeneration: {
      enabled: false,
      resolution: '1K',
      aspectRatio: '1:1',
      mode: 'default',
      detail: null,
    },
    generationParams: { detail: null },
    ...overrides,
  }
}

describe('chatSessionConfig', () => {
  it('preserves provider-default image resolution through storage instead of injecting 1K', () => {
    const empty = deserializeChatSessionConfigFromConvoMeta({})
    expect(empty.imageGeneration.resolution).toBe('')
    const config = createConfig({ imageGeneration: { ...empty.imageGeneration, enabled: true, mode: 'custom' } })
    const meta = serializeChatSessionConfigToConvoMeta({ config })
    expect(deserializeChatSessionConfigFromConvoMeta({ convoMeta: meta }).imageGeneration.resolution).toBe('')
    const explicit = createConfig({ imageGeneration: { ...config.imageGeneration, resolution: '1K' } })
    expect(deserializeChatSessionConfigFromConvoMeta({ convoMeta: serializeChatSessionConfigToConvoMeta({ config: explicit }) }).imageGeneration.resolution).toBe('1K')
  })

  it('preserves native mode-only absence and max20 without widening legacy serialization', () => {
    const config = createConfig({ webSearch: { enabled: true, level: 'high', detail: { searchMode: 'enable' } } })
    expect(serializeChatSessionConfigToConvoMeta({ config, preserveOptionalWebSearchFields: true })?.webSearchOverride).toEqual({ searchMode: 'enable' })
    expect(serializeChatSessionConfigToConvoMeta({ config })?.webSearchOverride).toEqual({ searchMode: 'enable', searchDepth: 'high' })
    const native = createConfig({ webSearch: { enabled: true, level: 'high', detail: { searchMode: 'enable', searchDepth: 'custom', maxResults: 20 } } })
    const meta = serializeChatSessionConfigToConvoMeta({ config: native, preserveOptionalWebSearchFields: true, webSearchNormalization: { preserveExplicitMaxResults: true } })
    expect(meta?.webSearchOverride).toEqual({ searchMode: 'enable', searchDepth: 'custom', maxResults: 20 })
    expect(deserializeChatSessionConfigFromConvoMeta({ convoMeta: meta }).webSearch.detail?.maxResults).toBe(20)
  })
  it('ignores all retired model-selection meta and leaves route selection unset', () => {
    const config = deserializeChatSessionConfigFromConvoMeta({
      convoMeta: {
        selectedProviderId: 'anthropic_messages',
        selectedModelKey: 'claude-haiku-4-5',
        compatibleConfigurationSelection: { modelId: 'legacy-compatible' },
      },
    })

    expect(config.routeSelection).toBeNull()
  })

  it('does not serialize route selection into conversation meta', () => {
    const meta = serializeChatSessionConfigToConvoMeta({
      config: createConfig({
        routeSelection: {
          schemaVersion: 1,
          kind: 'provider_model',
          providerId: 'anthropic_messages',
          modelId: 'claude-haiku-4-5',
        },
      }),
    })

    expect(meta).not.toHaveProperty('selectedProviderId')
    expect(meta).not.toHaveProperty('selectedModelKey')
    expect(meta).not.toHaveProperty('compatibleConfigurationSelection')
  })

  it('serializes custom web-search depth without replacing it with the quick-control level', () => {
    const meta = serializeChatSessionConfigToConvoMeta({
      config: createConfig({
        webSearch: {
          enabled: true,
          level: 'high',
          detail: { searchMode: 'enable', searchDepth: 'custom', maxResults: 7 },
        },
      }),
    })

    expect(meta?.webSearchOverride).toEqual({
      searchMode: 'enable',
      searchDepth: 'custom',
      maxResults: 7,
    })
  })

  it('removes legacy Google thinking meta and persists generation params instead', () => {
    const meta = serializeChatSessionConfigToConvoMeta({
      baseMeta: {
        googleAIStudioThinking: { mode: 'level', thinkingLevel: 'high', includeThoughts: true },
      },
      config: createConfig({
        generationParams: {
          detail: {
            thinkingLevel: { mode: 'custom', value: 'medium' },
            includeThoughts: { mode: 'custom', value: true },
          },
        },
      }),
    })

    expect(meta).not.toHaveProperty('googleAIStudioThinking')
    expect(deserializeChatSessionConfigFromConvoMeta({ convoMeta: meta }).generationParams.detail).toMatchObject({
      thinkingLevel: { mode: 'custom', value: 'medium' },
      includeThoughts: { mode: 'custom', value: true },
    })
  })

  it('round-trips versioned generation params override in conversation meta', () => {
    const meta = serializeChatSessionConfigToConvoMeta({
      config: createConfig({
        generationParams: {
          detail: {
            temperature: { mode: 'custom', value: 0.2 },
            maxOutputTokens: { mode: 'custom', value: 64 },
          },
        },
      }),
    })

    expect(deserializeChatSessionConfigFromConvoMeta({ convoMeta: meta }).generationParams.detail).toEqual({
      temperature: { mode: 'custom', value: 0.2 },
      maxOutputTokens: { mode: 'custom', value: 64 },
    })
  })
})
