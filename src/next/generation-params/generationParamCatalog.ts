import type { GenerationParamKey, GenerationParamValueType } from './generationParamTypes'

export type GenerationParamSpec = Readonly<{
  key: GenerationParamKey
  label: string
  valueType: GenerationParamValueType
  description: string
}>

export const GENERATION_PARAM_SPECS: readonly GenerationParamSpec[] = [
  { key: 'temperature', label: 'temperature', valueType: 'number', description: 'Sampling randomness.' },
  { key: 'topP', label: 'topP', valueType: 'number', description: 'Nucleus sampling threshold.' },
  { key: 'topK', label: 'topK', valueType: 'integer', description: 'Top-k token candidate limit.' },
  { key: 'minP', label: 'minP', valueType: 'number', description: 'Minimum probability sampling threshold.' },
  { key: 'topA', label: 'topA', valueType: 'number', description: 'Adaptive sampling threshold.' },
  { key: 'frequencyPenalty', label: 'frequencyPenalty', valueType: 'number', description: 'Frequency penalty.' },
  { key: 'presencePenalty', label: 'presencePenalty', valueType: 'number', description: 'Presence penalty.' },
  { key: 'repetitionPenalty', label: 'repetitionPenalty', valueType: 'number', description: 'Repetition penalty.' },
  { key: 'seed', label: 'seed', valueType: 'integer', description: 'Best-effort deterministic seed.' },
  { key: 'maxOutputTokens', label: 'maxOutputTokens', valueType: 'integer', description: 'Output token limit.' },
  { key: 'reasoningEffort', label: 'reasoningEffort', valueType: 'enum', description: 'Provider reasoning effort.' },
  { key: 'reasoningSummary', label: 'reasoningSummary', valueType: 'enum', description: 'Reasoning summary request.' },
  { key: 'thinkingEnabled', label: 'thinkingEnabled', valueType: 'boolean', description: 'Provider thinking toggle.' },
  { key: 'thinkingBudget', label: 'thinkingBudget', valueType: 'integer', description: 'Provider thinking budget.' },
  { key: 'thinkingLevel', label: 'thinkingLevel', valueType: 'enum', description: 'Provider thinking level.' },
  { key: 'thoughtSummaryMode', label: 'thoughtSummaryMode', valueType: 'enum', description: 'Gemini thought summary request.' },
  { key: 'stopSequences', label: 'stopSequences', valueType: 'stringArray', description: 'Provider stop sequences.' },
  { key: 'googleSearch', label: 'googleSearch', valueType: 'boolean', description: 'Gemini Google Search grounding.' },
  { key: 'imageSearch', label: 'imageSearch', valueType: 'boolean', description: 'Gemini Image Search grounding.' },
  { key: 'verbosity', label: 'verbosity', valueType: 'enum', description: 'Output verbosity.' },
]

export const GENERATION_PARAM_KEYS: readonly GenerationParamKey[] = GENERATION_PARAM_SPECS.map((spec) => spec.key)

export const GENERATION_PARAM_SPEC_MAP: Readonly<Record<GenerationParamKey, GenerationParamSpec>> = Object.freeze(
  Object.fromEntries(GENERATION_PARAM_SPECS.map((spec) => [spec.key, spec])) as Record<GenerationParamKey, GenerationParamSpec>,
)
