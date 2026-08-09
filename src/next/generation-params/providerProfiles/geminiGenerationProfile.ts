import type { GenerationParamCapability, ProviderGenerationParamProfile } from '../generationParamTypes'

const generationConfigNumber = (field: string, min?: number, max?: number): GenerationParamCapability => ({
  supported: true,
  wirePath: ['generationConfig', field],
  valueType: 'number',
  range: { ...(min !== undefined ? { min } : {}), ...(max !== undefined ? { max } : {}) },
  status: 'stable',
  ui: { visibleByDefault: true, editable: true },
})

const generationConfigInteger = (field: string, min?: number): GenerationParamCapability => ({
  supported: true,
  wirePath: ['generationConfig', field],
  valueType: 'integer',
  range: { ...(min !== undefined ? { min } : {}), integer: true },
  status: 'stable',
  ui: { visibleByDefault: true, editable: true },
})

const unsupportedThinkingParam = (valueType: GenerationParamCapability['valueType']): GenerationParamCapability => ({
  supported: false,
  valueType,
  status: 'unsupported',
  ui: { visibleByDefault: false, editable: false },
})

const gemini3DeprecatedSampling = (field: string, valueType: 'number' | 'integer'): GenerationParamCapability => ({
  supported: true,
  wirePath: ['generationConfig', field],
  valueType,
  range: valueType === 'integer' ? { min: 1, integer: true } : { min: 0, max: 2 },
  status: 'deprecated',
  conflictGroup: field === 'temperature' || field === 'topP' ? 'temperatureOrTopP' : undefined,
  ui: {
    visibleByDefault: false,
    editable: true,
    warning: 'Gemini 3 sampling parameters are deprecated; omit them unless explicitly needed.',
  },
})

export const geminiGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'google_ai_studio',
  profileId: 'gemini_generation_v1',
  wireProtocol: 'gemini-generate-content',
  params: {
    temperature: { ...generationConfigNumber('temperature', 0, 2), conflictGroup: 'temperatureOrTopP' },
    topP: { ...generationConfigNumber('topP', 0, 1), conflictGroup: 'temperatureOrTopP' },
    topK: { ...generationConfigInteger('topK', 1), ui: { visibleByDefault: false, editable: true } },
    maxOutputTokens: generationConfigInteger('maxOutputTokens', 1),
    presencePenalty: { ...generationConfigNumber('presencePenalty', -2, 2), range: { min: -2, max: 2, exclusiveMax: true } },
    frequencyPenalty: { ...generationConfigNumber('frequencyPenalty', -2, 2), range: { min: -2, max: 2, exclusiveMax: true } },
    seed: { ...generationConfigInteger('seed'), ui: { visibleByDefault: false, editable: true, warning: 'Gemini seed is best effort.' } },
    thinkingBudget: unsupportedThinkingParam('integer'),
    thinkingLevel: unsupportedThinkingParam('enum'),
    includeThoughts: unsupportedThinkingParam('boolean'),
  },
  modelOverrides: [
    {
      match: { modelIdPattern: '(^|/)gemini-3' },
      params: {
        temperature: gemini3DeprecatedSampling('temperature', 'number'),
        topP: { ...gemini3DeprecatedSampling('topP', 'number'), range: { min: 0, max: 1 } },
        topK: gemini3DeprecatedSampling('topK', 'integer'),
      },
      notes: 'Gemini 3 deprecates explicit sampling controls; thinking controls come from the Models API resolver.',
    },
  ],
}
