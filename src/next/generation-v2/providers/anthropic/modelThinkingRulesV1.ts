export type AnthropicThinkingModeV1 = 'disabled' | 'manual' | 'adaptive'
export type AnthropicThinkingDisplayDefaultV1 = 'summarized' | 'omitted'
export type AnthropicEffortV1 = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export type AnthropicModelThinkingRuleV1 = Readonly<{
  modelId: string
  thinkingModes: readonly AnthropicThinkingModeV1[]
  defaultThinkingMode: AnthropicThinkingModeV1
  recommendedEnabledThinkingMode: Exclude<AnthropicThinkingModeV1, 'disabled'> | null
  alwaysThinking: boolean
  displayDefault: AnthropicThinkingDisplayDefaultV1
  supportedEfforts: readonly AnthropicEffortV1[]
  rejectsExplicitSampling: boolean
  evidence: readonly string[]
}>

export const ANTHROPIC_MODEL_THINKING_RULES_V1_VERIFIED_AT = '2026-07-18' as const

const EXTENDED_THINKING = 'https://platform.claude.com/docs/en/build-with-claude/extended-thinking'
const ADAPTIVE_THINKING = 'https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking'
const EFFORT = 'https://platform.claude.com/docs/en/build-with-claude/effort'
const MODELS = 'https://platform.claude.com/docs/en/about-claude/models/overview'
const ALL_EFFORTS = Object.freeze(['low', 'medium', 'high', 'xhigh', 'max'] as const)
const NO_XHIGH_EFFORTS = Object.freeze(['low', 'medium', 'high', 'max'] as const)
const BASIC_EFFORTS = Object.freeze(['low', 'medium', 'high'] as const)
const NO_EFFORTS = Object.freeze([] as const)

function rule(
  modelId: string,
  thinkingModes: readonly AnthropicThinkingModeV1[],
  defaultThinkingMode: AnthropicThinkingModeV1,
  recommendedEnabledThinkingMode: Exclude<AnthropicThinkingModeV1, 'disabled'> | null,
  alwaysThinking: boolean,
  displayDefault: AnthropicThinkingDisplayDefaultV1,
  supportedEfforts: readonly AnthropicEffortV1[],
  rejectsExplicitSampling: boolean,
): AnthropicModelThinkingRuleV1 {
  return Object.freeze({
    modelId,
    thinkingModes: Object.freeze([...thinkingModes]),
    defaultThinkingMode,
    recommendedEnabledThinkingMode,
    alwaysThinking,
    displayDefault,
    supportedEfforts: Object.freeze([...supportedEfforts]),
    rejectsExplicitSampling,
    evidence: Object.freeze([EXTENDED_THINKING, ADAPTIVE_THINKING, EFFORT, MODELS]),
  })
}

/**
 * This table intentionally has no wildcard, family-prefix or regex matching.
 * The Anthropic Models API exposes visibility, not a complete per-model wire
 * capability schema; a dynamically discovered model without a reviewed exact
 * entry is therefore unavailable to V2 compilation.
 */
export const ANTHROPIC_MODEL_THINKING_RULES_V1 = Object.freeze([
  rule('claude-fable-5', ['adaptive'], 'adaptive', 'adaptive', true, 'omitted', ALL_EFFORTS, true),
  rule('claude-mythos-5', ['adaptive'], 'adaptive', 'adaptive', true, 'omitted', ALL_EFFORTS, true),
  rule('claude-mythos-preview', ['manual', 'adaptive'], 'adaptive', 'adaptive', true, 'omitted', ALL_EFFORTS, true),
  rule('claude-opus-4-8', ['disabled', 'adaptive'], 'disabled', null, false, 'omitted', ALL_EFFORTS, true),
  rule('claude-opus-4-7', ['disabled', 'adaptive'], 'disabled', null, false, 'omitted', ALL_EFFORTS, true),
  rule('claude-opus-4-6', ['disabled', 'manual', 'adaptive'], 'disabled', null, false, 'summarized', NO_XHIGH_EFFORTS, false),
  rule('claude-sonnet-5', ['disabled', 'adaptive'], 'adaptive', 'adaptive', false, 'omitted', ALL_EFFORTS, true),
  rule('claude-sonnet-4-6', ['disabled', 'manual', 'adaptive'], 'disabled', null, false, 'summarized', NO_XHIGH_EFFORTS, false),
  rule('claude-opus-4-5', ['disabled', 'manual'], 'disabled', null, false, 'summarized', BASIC_EFFORTS, false),
  rule('claude-sonnet-4-5', ['disabled', 'manual'], 'disabled', null, false, 'summarized', NO_EFFORTS, false),
  rule('claude-haiku-4-5', ['disabled', 'manual'], 'disabled', null, false, 'summarized', NO_EFFORTS, false),
  rule('claude-haiku-4-5-20251001', ['disabled', 'manual'], 'disabled', null, false, 'summarized', NO_EFFORTS, false),
] as const)

const rulesByModelId = new Map(ANTHROPIC_MODEL_THINKING_RULES_V1.map((entry) => [entry.modelId, entry]))

if (rulesByModelId.size !== ANTHROPIC_MODEL_THINKING_RULES_V1.length) {
  throw new Error('GENERATION_V2_ANTHROPIC_DUPLICATE_MODEL_RULE')
}

export function resolveAnthropicModelThinkingRuleV1(modelId: string): AnthropicModelThinkingRuleV1 | null {
  if (typeof modelId !== 'string') return null
  return rulesByModelId.get(modelId) ?? null
}
