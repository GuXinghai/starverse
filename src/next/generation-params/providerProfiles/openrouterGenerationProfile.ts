import type { GenerationParamCapability, ProviderGenerationParamProfile } from '../generationParamTypes'

const numberParam = (wireKey: string, min?: number, max?: number): GenerationParamCapability => ({
  supported: true,
  wireKey,
  valueType: 'number',
  range: { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) },
  status: 'stable',
  ui: { visibleByDefault: true, editable: true },
})

const integerParam = (wireKey: string, min?: number): GenerationParamCapability => ({
  supported: true,
  wireKey,
  valueType: 'integer',
  range: { ...(min !== undefined ? { min } : {}), integer: true },
  status: 'stable',
  ui: { visibleByDefault: true, editable: true },
})

export const openrouterGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'openrouter',
  profileId: 'openrouter_generation_v1',
  wireProtocol: 'openrouter-chat',
  params: {
    temperature: { ...numberParam('temperature', 0, 2), conflictGroup: 'temperatureOrTopP' },
    topP: { ...numberParam('top_p', 0, 1), conflictGroup: 'temperatureOrTopP' },
    topK: integerParam('top_k', 0),
    minP: { ...numberParam('min_p', 0, 1), ui: { visibleByDefault: false, editable: true } },
    topA: { ...numberParam('top_a', 0, 1), ui: { visibleByDefault: false, editable: true } },
    frequencyPenalty: numberParam('frequency_penalty', -2, 2),
    presencePenalty: numberParam('presence_penalty', -2, 2),
    repetitionPenalty: { ...numberParam('repetition_penalty', 0, 2), ui: { visibleByDefault: false, editable: true } },
    seed: { ...integerParam('seed', 0), ui: { visibleByDefault: false, editable: true } },
    maxOutputTokens: integerParam('max_tokens', 1),
    reasoningEffort: {
      supported: true,
      wirePath: ['reasoning', 'effort'],
      valueType: 'enum',
      enumValues: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'],
      status: 'providerSpecific',
      ui: { visibleByDefault: true, editable: true },
    },
    verbosity: {
      supported: true,
      wireKey: 'verbosity',
      valueType: 'enum',
      enumValues: ['low', 'medium', 'high', 'xhigh', 'max'],
      status: 'providerSpecific',
      ui: { visibleByDefault: false, editable: true },
    },
  },
}
