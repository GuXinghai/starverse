import type { GenerationParamCapability, ProviderGenerationParamProfile } from '../generationParamTypes'

const noEffectParam = (wireKey: string): GenerationParamCapability => ({
  supported: true,
  wireKey,
  valueType: 'number',
  status: 'noEffect',
  ui: {
    visibleByDefault: false,
    editable: false,
    warning: 'DeepSeek thinking mode ignores this parameter.',
  },
})

export const deepseekGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'deepseek',
  profileId: 'deepseek_generation_v1',
  wireProtocol: 'deepseek-chat',
  params: {
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
    maxOutputTokens: {
      supported: true,
      wireKey: 'max_tokens',
      valueType: 'integer',
      range: { min: 1, integer: true },
      status: 'stable',
      ui: { visibleByDefault: true, editable: true },
    },
    thinkingEnabled: {
      supported: true,
      wirePath: ['thinking', 'type'],
      valueType: 'boolean',
      status: 'stable',
      ui: { visibleByDefault: true, editable: true },
    },
    reasoningEffort: {
      supported: true,
      wireKey: 'reasoning_effort',
      valueType: 'enum',
      enumValues: ['high', 'max'],
      status: 'stable',
      ui: { visibleByDefault: true, editable: true },
    },
    presencePenalty: {
      supported: true,
      wireKey: 'presence_penalty',
      valueType: 'number',
      status: 'noEffect',
      ui: { visibleByDefault: false, editable: false, warning: 'DeepSeek marks presence_penalty deprecated/no-effect.' },
    },
    frequencyPenalty: {
      supported: true,
      wireKey: 'frequency_penalty',
      valueType: 'number',
      status: 'noEffect',
      ui: { visibleByDefault: false, editable: false, warning: 'DeepSeek marks frequency_penalty deprecated/no-effect.' },
    },
  },
  modelOverrides: [
    {
      match: { modelIdPattern: '(reasoner|thinking|v4)' },
      params: {
        temperature: noEffectParam('temperature'),
        topP: noEffectParam('top_p'),
        presencePenalty: noEffectParam('presence_penalty'),
        frequencyPenalty: noEffectParam('frequency_penalty'),
      },
      notes: 'Thinking models ignore sampling penalties and temperature/top_p.',
    },
  ],
}
