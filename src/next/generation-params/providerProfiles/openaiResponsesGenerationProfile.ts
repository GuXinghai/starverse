import {
  OPENAI_RESPONSES_REASONING_RULES,
  OPENAI_RESPONSES_NON_REASONING_MODEL_ID_PATTERNS,
  type OpenAIResponsesReasoningSpec,
} from '@/next/provider/openai-responses/openaiResponsesReasoningPolicy'
import type { GenerationParamCapability, ModelGenerationParamOverride, ProviderGenerationParamProfile } from '../generationParamTypes'

function unsupportedReasoningParam(valueType: 'enum'): GenerationParamCapability {
  return {
    supported: false,
    valueType,
    enumValues: ['auto'],
    status: 'unsupported',
    ui: {
      visibleByDefault: false,
      editable: false,
      warning: 'This OpenAI Responses model does not expose explicit reasoning effort controls.',
    },
  }
}

function reasoningEffortCapability(spec: OpenAIResponsesReasoningSpec): GenerationParamCapability {
  return {
    supported: true,
    wirePath: ['reasoning', 'effort'],
    valueType: 'enum',
    enumValues: ['auto', ...spec.efforts],
    status: 'stable',
    ui: {
      visibleByDefault: true,
      editable: true,
      ...(spec.providerAutoHint ? { providerAutoHint: spec.providerAutoHint } : {}),
      providerAutoHintDocumented: spec.providerAutoHintDocumented,
    },
  }
}

const reasoningSummaryCapability: GenerationParamCapability = {
  supported: true,
  wirePath: ['reasoning', 'summary'],
  valueType: 'enum',
  enumValues: ['auto', 'concise', 'detailed'],
  status: 'stable',
  ui: { visibleByDefault: false, editable: true },
}

function reasoningOverride(rule: (typeof OPENAI_RESPONSES_REASONING_RULES)[number]): ModelGenerationParamOverride {
  return {
    match: { modelIdPattern: rule.modelIdPattern },
    params: {
      reasoningEffort: reasoningEffortCapability(rule.spec),
      reasoningSummary: reasoningSummaryCapability,
    },
  }
}

const unknownModelReasoningEffortCapability: GenerationParamCapability = {
  supported: true,
  wirePath: ['reasoning', 'effort'],
  valueType: 'enum',
  enumValues: ['auto', 'max'],
  status: 'stable',
  ui: { visibleByDefault: true, editable: true, providerAutoHintDocumented: false },
}

const nonReasoningOverrides: readonly ModelGenerationParamOverride[] =
  OPENAI_RESPONSES_NON_REASONING_MODEL_ID_PATTERNS.map((modelIdPattern) => ({
    match: { modelIdPattern },
    params: {
      reasoningEffort: unsupportedReasoningParam('enum'),
      reasoningSummary: unsupportedReasoningParam('enum'),
    },
  }))

export const openaiResponsesGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'openai_responses',
  profileId: 'openai_responses_generation_v1',
  wireProtocol: 'openai-responses',
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
      wireKey: 'max_output_tokens',
      valueType: 'integer',
      range: { min: 1, integer: true },
      status: 'stable',
      ui: { visibleByDefault: true, editable: true },
    },
    reasoningEffort: unknownModelReasoningEffortCapability,
    reasoningSummary: reasoningSummaryCapability,
    verbosity: {
      supported: true,
      wirePath: ['text', 'verbosity'],
      valueType: 'enum',
      enumValues: ['low', 'medium', 'high'],
      status: 'stable',
      ui: { visibleByDefault: true, editable: true },
    },
  },
  modelOverrides: [...OPENAI_RESPONSES_REASONING_RULES.map(reasoningOverride), ...nonReasoningOverrides],
}

