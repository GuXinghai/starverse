import type { GenerationParamCapability, ProviderGenerationParamProfile } from '../generationParamTypes'

const rejectedSampling = (wireKey: string): GenerationParamCapability => ({
  supported: true,
  wireKey,
  valueType: wireKey === 'top_k' ? 'integer' : 'number',
  status: 'rejected',
  ui: {
    visibleByDefault: false,
    editable: false,
    warning: 'This Claude model rejects non-default sampling parameters.',
  },
})

export const anthropicGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'anthropic_messages',
  profileId: 'anthropic_generation_v1',
  wireProtocol: 'anthropic-messages',
  params: {
    maxOutputTokens: {
      supported: true,
      wireKey: 'max_tokens',
      valueType: 'integer',
      range: { min: 1, integer: true },
      status: 'stable',
      ui: { visibleByDefault: true, editable: true },
    },
    temperature: {
      supported: true,
      wireKey: 'temperature',
      valueType: 'number',
      range: { min: 0, max: 1 },
      status: 'stable',
      ui: { visibleByDefault: false, editable: true },
    },
    topP: {
      supported: true,
      wireKey: 'top_p',
      valueType: 'number',
      range: { min: 0, max: 1 },
      status: 'stable',
      ui: { visibleByDefault: false, editable: true },
    },
    topK: {
      supported: true,
      wireKey: 'top_k',
      valueType: 'integer',
      range: { min: 1, integer: true },
      status: 'stable',
      ui: { visibleByDefault: false, editable: true },
    },
    thinkingEnabled: {
      supported: true,
      wirePath: ['thinking', 'type'],
      valueType: 'boolean',
      status: 'stable',
      ui: { visibleByDefault: false, editable: true },
    },
    thinkingBudget: {
      supported: true,
      wirePath: ['thinking', 'budget_tokens'],
      valueType: 'integer',
      range: { min: 1024, integer: true },
      status: 'stable',
      ui: { visibleByDefault: false, editable: true },
    },
    reasoningEffort: {
      supported: true,
      wirePath: ['output_config', 'effort'],
      valueType: 'enum',
      enumValues: ['low', 'medium', 'high'],
      status: 'stable',
      ui: { visibleByDefault: true, editable: true },
    },
  },
  modelOverrides: [
    {
      match: { modelIdPattern: '(sonnet-5|opus-4\\.(7|8))' },
      params: {
        temperature: rejectedSampling('temperature'),
        topP: rejectedSampling('top_p'),
        topK: rejectedSampling('top_k'),
        thinkingBudget: {
          supported: true,
          wirePath: ['thinking', 'budget_tokens'],
          valueType: 'integer',
          status: 'rejected',
          ui: { visibleByDefault: false, editable: false, warning: 'Use adaptive thinking effort for this Claude model.' },
        },
      },
    },
  ],
}
