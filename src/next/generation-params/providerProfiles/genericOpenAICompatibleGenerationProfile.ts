import type { ProviderGenerationParamProfile } from '../generationParamTypes'

const baseParams: ProviderGenerationParamProfile['params'] = {
  temperature: {
    supported: true,
    wireKey: 'temperature',
    valueType: 'number',
    range: { min: 0, max: 2 },
    status: 'stable',
    conflictGroup: 'temperatureOrTopP',
    ui: { visibleByDefault: true, editable: true },
  },
  topP: {
    supported: true,
    wireKey: 'top_p',
    valueType: 'number',
    range: { min: 0, max: 1 },
    status: 'stable',
    conflictGroup: 'temperatureOrTopP',
    ui: { visibleByDefault: true, editable: true },
  },
  presencePenalty: {
    supported: true,
    wireKey: 'presence_penalty',
    valueType: 'number',
    range: { min: -2, max: 2 },
    status: 'stable',
    ui: { visibleByDefault: false, editable: true },
  },
  frequencyPenalty: {
    supported: true,
    wireKey: 'frequency_penalty',
    valueType: 'number',
    range: { min: -2, max: 2 },
    status: 'stable',
    ui: { visibleByDefault: false, editable: true },
  },
}

export const genericOpenAICompatibleLegacyGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'generic_openai_compatible',
  profileId: 'generic_openai_compatible_legacy_generation_v1',
  wireProtocol: 'openai-chat-compatible-legacy',
  params: {
    ...baseParams,
    maxOutputTokens: {
      supported: true,
      wireKey: 'max_tokens',
      valueType: 'integer',
      range: { min: 1, integer: true },
      status: 'stable',
      ui: { visibleByDefault: true, editable: true },
    },
  },
}

export const genericOpenAICompatibleModernGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'generic_openai_compatible',
  profileId: 'generic_openai_compatible_modern_generation_v1',
  wireProtocol: 'openai-chat-compatible-modern',
  params: {
    ...baseParams,
    maxOutputTokens: {
      supported: true,
      wireKey: 'max_completion_tokens',
      valueType: 'integer',
      range: { min: 1, integer: true },
      status: 'stable',
      ui: { visibleByDefault: true, editable: true },
    },
  },
}
