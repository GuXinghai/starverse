import { describe, expect, it } from 'vitest'
import {
  deserializeChatSessionConfigFromConvoMeta,
  serializeChatSessionConfigToConvoMeta,
  type ChatSessionConfig,
} from './chatSessionConfig'
import { compatibleConfigurationSelectionSchema } from '@/next/provider/openai-chat-compatible/ui/compatibleConfigurationSelection'

function createConfig(overrides: Partial<ChatSessionConfig> = {}): ChatSessionConfig {
  return {
    model: { selectedProviderId: null, selectedModelKey: null, compatibleSelection: null },
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
    generationParams: {
      detail: null,
    },
    ...overrides,
  }
}

describe('chatSessionConfig', () => {
  it('round-trips a complete compatible configuration as conversation-scoped selection', () => {
    const compatibleSelection = compatibleConfigurationSelectionSchema.parse({
      kind: 'openai_chat_compatible_configuration' as const,
      providerInstanceId: 'ocp_provider_12345678', providerName: 'Example', modelId: 'same-model',
      endpointRevisionId: 'ocp_endpoint_12345678', credentialVersionRef: null,
      requestProfileId: 'ocp_request_profile_12345678', requestProfileVersion: 1,
      responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 1,
      reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 1,
      inlinePolicyId: 'ocp_inline_policy_12345678', inlinePolicyVersion: 1,
    })
    const meta = serializeChatSessionConfigToConvoMeta({
      config: createConfig({ model: { selectedProviderId: null, selectedModelKey: 'same-model', compatibleSelection } }),
      defaultModelKey: 'openrouter/auto',
    })
    expect(meta).not.toHaveProperty('selectedProviderId')
    expect(meta).not.toHaveProperty('selectedModelKey')
    expect(deserializeChatSessionConfigFromConvoMeta({ convoMeta: meta, defaultModelKey: 'openrouter/auto' }).model).toEqual({
      selectedProviderId: null, selectedModelKey: 'same-model', compatibleSelection,
    })
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
          compatibleSelection: null,
        },
      }),
      defaultModelKey: 'openrouter/auto',
    })

    expect(meta).toMatchObject({
      selectedProviderId: 'anthropic_messages',
      selectedModelKey: 'claude-haiku-4-5',
    })

    const config = deserializeChatSessionConfigFromConvoMeta({
      convoMeta: meta,
      defaultModelKey: 'openrouter/auto',
    })

    expect(config.model).toEqual({
      selectedProviderId: 'anthropic_messages',
      selectedModelKey: 'claude-haiku-4-5',
      compatibleSelection: null,
    })
  })

  it('keeps providerless model-only meta explicitly unset', () => {
    const config = deserializeChatSessionConfigFromConvoMeta({
      convoMeta: { selectedModelKey: 'openai/gpt-4o-mini' },
      defaultModelKey: 'openrouter/auto',
    })

    expect(config.model).toEqual({
      selectedProviderId: null,
      selectedModelKey: null,
      compatibleSelection: null,
    })
  })

  it('removes legacy Google thinking meta and persists generation params instead', () => {
    const meta = serializeChatSessionConfigToConvoMeta({
      baseMeta: {
        googleAIStudioThinking: { mode: 'level', thinkingLevel: 'high', includeThoughts: true },
      },
      config: createConfig({
        model: {
          selectedProviderId: 'google_ai_studio',
          selectedModelKey: 'gemini-2.5-flash',
          compatibleSelection: null,
        },
        generationParams: {
          detail: {
            thinkingLevel: { mode: 'custom', value: 'medium' },
            includeThoughts: { mode: 'custom', value: true },
          },
        },
      }),
      defaultModelKey: 'openrouter/auto',
    })

    expect(meta).not.toHaveProperty('googleAIStudioThinking')

    const config = deserializeChatSessionConfigFromConvoMeta({
      convoMeta: meta,
      defaultModelKey: 'openrouter/auto',
    })

    expect(config.generationParams.detail).toMatchObject({
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
      defaultModelKey: 'openrouter/auto',
    })

    expect(meta?.generationParamsOverride).toEqual({
      version: 1,
      params: {
        temperature: { mode: 'custom', value: 0.2 },
        maxOutputTokens: { mode: 'custom', value: 64 },
      },
    })

    const config = deserializeChatSessionConfigFromConvoMeta({
      convoMeta: meta,
      defaultModelKey: 'openrouter/auto',
    })

    expect(config.generationParams.detail).toEqual({
      temperature: { mode: 'custom', value: 0.2 },
      maxOutputTokens: { mode: 'custom', value: 64 },
    })
  })
})
