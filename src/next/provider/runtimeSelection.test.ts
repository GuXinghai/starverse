import { describe, expect, it } from 'vitest'
import {
  deriveCurrentRuntimeSelection,
  formatRuntimeCapabilitySummaryLite,
  getRuntimeCapabilitySummaryLite,
  getRuntimeTextChatBlockReason,
  resolveRuntimeTextSendRoute,
  type CurrentRuntimeSelection,
  type RuntimeProviderKey,
} from './runtimeSelection'

const baseSessionConfig = {
  webSearch: { enabled: false },
  reasoning: { enabled: false },
  imageGeneration: { enabled: false },
  tools: { enabled: false },
  structuredOutput: { enabled: false },
} as const

function selected(providerKey: RuntimeProviderKey, modelKey = `${providerKey}-model`): CurrentRuntimeSelection {
  return {
    state: 'selected',
    providerKey,
    endpointId: `${providerKey}-endpoint`,
    profileId: `${providerKey}-profile`,
    modelKey,
    source: providerKey === 'openrouter' ? 'explicit_user_selection' : 'legacy_experimental_flag',
    mode: providerKey === 'openrouter' ? 'production' : 'experimental',
  }
}

describe('CurrentRuntimeSelection', () => {
  it('returns unset when no provider is explicitly selected', () => {
    expect(deriveCurrentRuntimeSelection({})).toEqual({ state: 'unset', source: 'unset' })
  })

  it('selects OpenRouter only from explicit OpenRouter selection', () => {
    expect(deriveCurrentRuntimeSelection({
      openrouter: { selected: true, modelKey: 'openrouter/auto', credentialStatus: 'configured' },
    })).toEqual({
      state: 'selected',
      providerKey: 'openrouter',
      endpointId: 'openrouter-official',
      profileId: 'openrouter_v1_chat',
      modelKey: 'openrouter/auto',
      nativeModelId: null,
      source: 'explicit_user_selection',
      mode: 'production',
      credentialStatus: 'configured',
    })
  })

  it('selects LocalEndpoint from its explicit experimental flag', () => {
    expect(deriveCurrentRuntimeSelection({
      localEndpoint: {
        selected: true,
        endpointId: 'http://localhost:1234/v1',
        modelKey: 'local-model',
        credentialStatus: 'not_required',
      },
    })).toMatchObject({
      state: 'selected',
      providerKey: 'local_endpoint',
      endpointId: 'http://localhost:1234/v1',
      profileId: 'local_endpoint_openai_compat_text_v1',
      modelKey: 'local-model',
      source: 'legacy_experimental_flag',
      mode: 'experimental',
      credentialStatus: 'not_required',
    })
  })

  it('selects LM Studio Local from its explicit experimental flag', () => {
    expect(deriveCurrentRuntimeSelection({
      lmStudio: {
        selected: true,
        endpointId: 'http://127.0.0.1:1234',
        profileId: 'lm_studio_openai_chat_completions_v1',
        modelKey: 'openai/gpt-oss-20b',
        credentialStatus: 'not_required',
      },
    })).toMatchObject({
      state: 'selected',
      providerKey: 'lm_studio',
      endpointId: 'http://127.0.0.1:1234',
      profileId: 'lm_studio_openai_chat_completions_v1',
      modelKey: 'openai/gpt-oss-20b',
      source: 'legacy_experimental_flag',
      mode: 'experimental',
      credentialStatus: 'not_required',
    })
  })

  it('selects OpenAI Responses from its explicit experimental flag', () => {
    expect(deriveCurrentRuntimeSelection({
      openAIResponses: { selected: true, modelKey: 'gpt-4.1-mini' },
    })).toMatchObject({
      state: 'selected',
      providerKey: 'openai_responses',
      endpointId: 'openai-responses-official',
      profileId: 'openai_responses_v1',
      modelKey: 'gpt-4.1-mini',
      source: 'legacy_experimental_flag',
      mode: 'experimental',
    })
  })

  it('selects Google AI Studio from its explicit experimental flag', () => {
    expect(deriveCurrentRuntimeSelection({
      googleAIStudio: { selected: true, modelKey: 'gemini-2.5-flash' },
    })).toMatchObject({
      state: 'selected',
      providerKey: 'google_ai_studio',
      profileId: 'gemini_api_v1',
      modelKey: 'gemini-2.5-flash',
    })
  })

  it('selects Anthropic Messages from its explicit experimental flag', () => {
    expect(deriveCurrentRuntimeSelection({
      anthropic: { selected: true, modelKey: 'claude-sonnet-4-5' },
    })).toMatchObject({
      state: 'selected',
      providerKey: 'anthropic_messages',
      profileId: 'anthropic_messages_v1',
      modelKey: 'claude-sonnet-4-5',
    })
  })

  it('selects DeepSeek official from its explicit experimental flag', () => {
    expect(deriveCurrentRuntimeSelection({
      deepSeek: { selected: true, modelKey: 'deepseek-chat' },
    })).toMatchObject({
      state: 'selected',
      providerKey: 'deepseek',
      profileId: 'deepseek_official_openai_compat',
      modelKey: 'deepseek-chat',
    })
  })

  it('uses deterministic conflict priority when multiple experimental flags are set', () => {
    expect(deriveCurrentRuntimeSelection({
      openrouter: { selected: true, modelKey: 'openrouter/auto' },
      localEndpoint: { selected: true, modelKey: 'local-model' },
      openAIResponses: { selected: true, modelKey: 'gpt-4.1-mini' },
      googleAIStudio: { selected: true, modelKey: 'gemini-2.5-flash' },
      anthropic: { selected: true, modelKey: 'claude-sonnet-4-5' },
      deepSeek: { selected: true, modelKey: 'deepseek-chat' },
      lmStudio: { selected: true, modelKey: 'openai/gpt-oss-20b' },
    })).toMatchObject({
      state: 'selected',
      providerKey: 'deepseek',
      source: 'legacy_experimental_flag',
    })
  })

  it('prioritizes LM Studio above the older generic LocalEndpoint flag', () => {
    expect(deriveCurrentRuntimeSelection({
      localEndpoint: { selected: true, modelKey: 'local-model' },
      lmStudio: { selected: true, modelKey: 'openai/gpt-oss-20b' },
    })).toMatchObject({
      state: 'selected',
      providerKey: 'lm_studio',
      modelKey: 'openai/gpt-oss-20b',
    })
  })
})

describe('RuntimeCapabilitySummaryLite', () => {
  it('summarizes OpenRouter existing capabilities without changing its advanced path', () => {
    const cap = getRuntimeCapabilitySummaryLite(selected('openrouter', 'openrouter/auto'))
    expect(cap).toMatchObject({
      textChat: true,
      streamingText: true,
      attachments: 'supported',
      webSearch: 'supported',
      tools: 'supported',
      reasoningArtifacts: 'supported',
      imageGeneration: 'supported',
      source: 'openrouter_existing',
    })
    expect(formatRuntimeCapabilitySummaryLite(cap)).toContain('attachments supported')
  })

  it('summarizes experimental provider text-only capabilities conservatively', () => {
    const cap = getRuntimeCapabilitySummaryLite(selected('openai_responses', 'gpt-4.1-mini'))
    expect(cap).toMatchObject({
      textChat: true,
      streamingText: true,
      attachments: 'blocked',
      webSearch: 'blocked',
      tools: 'blocked',
      reasoningArtifacts: 'filtered',
      imageGeneration: 'blocked',
      structuredOutput: 'blocked',
      source: 'experimental_text_only',
    })
  })

  it('summarizes LocalEndpoint as conservative loopback text chat', () => {
    const cap = getRuntimeCapabilitySummaryLite(selected('local_endpoint', 'local-model'))
    expect(cap).toMatchObject({
      textChat: true,
      streamingText: 'probe_required',
      attachments: 'blocked',
      webSearch: 'blocked',
      tools: 'blocked',
      reasoningArtifacts: 'blocked',
      imageGeneration: 'blocked',
      structuredOutput: 'blocked',
      source: 'local_probe',
    })
  })

  it('summarizes LM Studio as a separate conservative local provider', () => {
    const cap = getRuntimeCapabilitySummaryLite(selected('lm_studio', 'openai/gpt-oss-20b'))
    expect(cap).toMatchObject({
      textChat: true,
      streamingText: 'probe_required',
      attachments: 'blocked',
      webSearch: 'blocked',
      tools: 'blocked',
      reasoningArtifacts: 'blocked',
      imageGeneration: 'blocked',
      structuredOutput: 'blocked',
      source: 'lm_studio_local',
    })
    expect(cap.warnings.join('\n')).toContain('Native REST load/unload controls')
  })

  it('summarizes unset runtime as blocked', () => {
    const cap = getRuntimeCapabilitySummaryLite({ state: 'unset', source: 'unset' })
    expect(cap).toMatchObject({
      textChat: false,
      streamingText: false,
      attachments: 'blocked',
      source: 'unset',
    })
  })
})

describe('getRuntimeTextChatBlockReason', () => {
  it('blocks unset selection before any runtime route can send', () => {
    const selection = { state: 'unset', source: 'unset' } as const
    expect(getRuntimeTextChatBlockReason({
      selection,
      capability: getRuntimeCapabilitySummaryLite(selection),
      text: 'hello',
      hasDraftAttachments: false,
      sessionConfig: baseSessionConfig,
    })).toBe('请选择运行供应商和模型后再发送。')
  })

  it('blocks empty text when there is no attachment payload', () => {
    const selection = selected('openrouter', 'openrouter/auto')
    expect(getRuntimeTextChatBlockReason({
      selection,
      capability: getRuntimeCapabilitySummaryLite(selection),
      text: '   ',
      hasDraftAttachments: false,
      sessionConfig: baseSessionConfig,
    })).toBe('请输入消息内容后再发送。')
  })

  it('blocks attachments for experimental text-only providers', () => {
    const selection = selected('openai_responses', 'gpt-4.1-mini')
    expect(getRuntimeTextChatBlockReason({
      selection,
      capability: getRuntimeCapabilitySummaryLite(selection),
      text: 'hello',
      hasDraftAttachments: true,
      sessionConfig: baseSessionConfig,
    })).toContain('text-only')
  })

  it('blocks web search for experimental text-only providers', () => {
    const selection = selected('google_ai_studio', 'gemini-2.5-flash')
    expect(getRuntimeTextChatBlockReason({
      selection,
      capability: getRuntimeCapabilitySummaryLite(selection),
      text: 'hello',
      hasDraftAttachments: false,
      sessionConfig: { ...baseSessionConfig, webSearch: { enabled: true } },
    })).toContain('does not support web search')
  })

  it('blocks tools for experimental text-only providers', () => {
    const selection = selected('anthropic_messages', 'claude-sonnet-4-5')
    expect(getRuntimeTextChatBlockReason({
      selection,
      capability: getRuntimeCapabilitySummaryLite(selection),
      text: 'hello',
      hasDraftAttachments: false,
      sessionConfig: baseSessionConfig,
      toolsRequested: true,
    })).toContain('does not support tools')
  })

  it('blocks reasoning controls for experimental text-only providers', () => {
    const selection = selected('deepseek', 'deepseek-chat')
    expect(getRuntimeTextChatBlockReason({
      selection,
      capability: getRuntimeCapabilitySummaryLite(selection),
      text: 'hello',
      hasDraftAttachments: false,
      sessionConfig: { ...baseSessionConfig, reasoning: { enabled: true } },
    })).toContain('does not support reasoning controls')
  })

  it('blocks image generation for experimental text-only providers', () => {
    const selection = selected('local_endpoint', 'local-model')
    expect(getRuntimeTextChatBlockReason({
      selection,
      capability: getRuntimeCapabilitySummaryLite(selection),
      text: 'hello',
      hasDraftAttachments: false,
      sessionConfig: { ...baseSessionConfig, imageGeneration: { enabled: true } },
    })).toContain('does not support image generation')
  })

  it('reserves structured output as a blocked experimental request even before explicit UI exists', () => {
    const selection = selected('openai_responses', 'gpt-4.1-mini')
    expect(getRuntimeTextChatBlockReason({
      selection,
      capability: getRuntimeCapabilitySummaryLite(selection),
      text: 'hello',
      hasDraftAttachments: false,
      sessionConfig: baseSessionConfig,
      structuredOutputRequested: true,
    })).toContain('does not support structured output')
  })

  it('does not downgrade OpenRouter advanced capability path', () => {
    const selection = selected('openrouter', 'openrouter/auto')
    expect(getRuntimeTextChatBlockReason({
      selection,
      capability: getRuntimeCapabilitySummaryLite(selection),
      text: 'hello',
      hasDraftAttachments: true,
      sessionConfig: {
        webSearch: { enabled: true },
        reasoning: { enabled: true },
        imageGeneration: { enabled: true },
        tools: { enabled: true },
        structuredOutput: { enabled: true },
      },
      toolsRequested: true,
      structuredOutputRequested: true,
    })).toBeNull()
  })
})

describe('resolveRuntimeTextSendRoute', () => {
  it('routes unset to none', () => {
    expect(resolveRuntimeTextSendRoute({ state: 'unset', source: 'unset' })).toEqual({
      kind: 'none',
      reason: '请选择运行供应商和模型后再发送。',
    })
  })

  it('routes selected OpenRouter to the existing OpenRouter path', () => {
    expect(resolveRuntimeTextSendRoute(selected('openrouter', 'openrouter/auto'))).toEqual({
      kind: 'openrouter_existing',
    })
  })

  it.each([
    'openai_responses',
    'google_ai_studio',
    'anthropic_messages',
    'deepseek',
    'lm_studio',
    'local_endpoint',
  ] as const)('routes %s to experimental text path', (providerKey) => {
    expect(resolveRuntimeTextSendRoute(selected(providerKey))).toEqual({
      kind: 'experimental_text',
      providerKey,
    })
  })

  it('does not route Generic OpenAI-compatible live traffic', () => {
    expect(resolveRuntimeTextSendRoute({
      state: 'selected',
      providerKey: 'generic_openai_compatible' as RuntimeProviderKey,
      endpointId: 'generic-fixture',
      profileId: 'generic_openai_compatible_fixture',
      modelKey: 'generic-model',
      source: 'explicit_user_selection',
      mode: 'experimental',
    })).toEqual({
      kind: 'none',
      reason: 'Generic OpenAI-compatible live routing is deferred.',
    })
  })
})
