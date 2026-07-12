import type { GenerationParamCapability, ProviderGenerationParamProfile } from '../generationParamTypes'

const generationConfigNumber = (field: string, min: number, max: number): GenerationParamCapability => ({
  supported: true,
  wirePath: ['generation_config', field],
  valueType: 'number',
  range: { min, max },
  status: 'stable',
  ui: { visibleByDefault: true, editable: true },
})

const generationConfigInteger = (field: string, min: number, max: number): GenerationParamCapability => ({
  supported: true,
  wirePath: ['generation_config', field],
  valueType: 'integer',
  range: { min, max, integer: true },
  status: 'stable',
  ui: { visibleByDefault: true, editable: true },
})

const generationConfigEnum = (field: string, enumValues: readonly string[]): GenerationParamCapability => ({
  supported: true,
  wirePath: ['generation_config', field],
  valueType: 'enum',
  enumValues,
  status: 'stable',
  ui: { visibleByDefault: true, editable: true },
})

const unsupported = (
  valueType: GenerationParamCapability['valueType'],
  warning: string,
  extra: Partial<GenerationParamCapability> = {},
): GenerationParamCapability => ({
  supported: false,
  valueType,
  status: 'unsupported',
  ui: { visibleByDefault: false, editable: false, warning },
  ...extra,
})

export const geminiImageGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'google_ai_studio',
  profileId: 'gemini_image_generation_v1',
  wireProtocol: 'gemini-interactions-image',
  params: {
    temperature: generationConfigNumber('temperature', 0, 2),
    topP: generationConfigNumber('top_p', 0, 1),
    maxOutputTokens: generationConfigInteger('max_output_tokens', 0, 32768),
    stopSequences: {
      supported: true,
      wirePath: ['generation_config', 'stop_sequences'],
      valueType: 'stringArray',
      status: 'stable',
      ui: { visibleByDefault: false, editable: true },
    },
    thinkingLevel: generationConfigEnum('thinking_level', ['minimal', 'high']),
    thoughtSummaryMode: generationConfigEnum('thinking_summaries', ['none', 'auto']),
    googleSearch: {
      supported: true,
      wirePath: ['tools', 'google_search'],
      valueType: 'boolean',
      status: 'stable',
      ui: { visibleByDefault: false, editable: true },
    },
    imageSearch: {
      supported: true,
      wirePath: ['tools', 'image_search'],
      valueType: 'boolean',
      status: 'stable',
      ui: { visibleByDefault: false, editable: true },
    },
  },
  modelOverrides: [
    {
      match: { modelIdPattern: '(^|/|models/)gemini-3\\.1-flash-lite-image($|-preview($|-))' },
      params: {
        maxOutputTokens: generationConfigInteger('max_output_tokens', 0, 4096),
        googleSearch: unsupported('boolean', 'Nano Banana 2 Lite does not support Google Search grounding.'),
        imageSearch: unsupported('boolean', 'Nano Banana 2 Lite does not support Image Search grounding.'),
      },
      notes: 'Nano Banana 2 Lite locks resolution to 1K and has no search tools.',
    },
    {
      match: { modelIdPattern: '(^|/|models/)gemini-3-pro-image($|-preview($|-))' },
      params: {
        imageSearch: unsupported('boolean', 'Nano Banana Pro does not support Image Search grounding.'),
      },
      notes: 'Nano Banana Pro supports Google Search but not Image Search grounding.',
    },
    {
      match: { modelIdPattern: '(^|/|models/)gemini-2\\.5-flash-image($|-preview($|-))' },
      params: {
        thinkingLevel: unsupported('enum', 'Legacy Nano Banana does not expose thinking level.', { enumValues: ['minimal', 'high'] }),
        thoughtSummaryMode: unsupported('enum', 'Legacy Nano Banana does not expose thought summaries.', { enumValues: ['none', 'auto'] }),
        googleSearch: unsupported('boolean', 'Legacy Nano Banana does not support Google Search grounding.'),
        imageSearch: unsupported('boolean', 'Legacy Nano Banana does not support Image Search grounding.'),
      },
      notes: 'Legacy Nano Banana still supports image output controls except explicit resolution and thinking.',
    },
  ],
}
