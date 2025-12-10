import type { SamplingConfig, GenerationConfig } from '../generation'
import type { ReasoningResolvedConfig } from '../reasoning'
import type { ReasoningPreference, SamplingParameterSettings } from '../chat'

// Normalize null to undefined for numbers
function nu<T extends number | null | undefined>(v: T): number | undefined {
  return v == null ? undefined : (v as number)
}

export function toSamplingConfig(params?: SamplingParameterSettings): SamplingConfig {
  if (!params) return {}
  const cfg: SamplingConfig = {}
  if (params.temperature != null) cfg.temperature = nu(params.temperature)
  if (params.top_p != null) cfg.top_p = nu(params.top_p)
  if (params.top_k != null) cfg.top_k = nu(params.top_k)
  if (params.min_p != null) cfg.min_p = nu(params.min_p)
  if (params.top_a != null) cfg.top_a = nu(params.top_a)
  if (params.frequency_penalty != null) cfg.frequency_penalty = nu(params.frequency_penalty)
  if (params.presence_penalty != null) cfg.presence_penalty = nu(params.presence_penalty)
  if (params.repetition_penalty != null) cfg.repetition_penalty = nu(params.repetition_penalty)
  if (params.seed != null) cfg.seed = nu(params.seed)
  return cfg
}

export function toReasoningResolved(pref: ReasoningPreference): ReasoningResolvedConfig | undefined {
  if (pref.visibility === 'off') {
    return {
      controlMode: 'disabled',
      maxReasoningTokens: undefined,
      maxCompletionTokens: undefined,
      showReasoningContent: false,
    }
  }
  if (pref.mode === 'custom' && typeof pref.maxTokens === 'number' && pref.maxTokens > 0) {
    return {
      controlMode: 'max_tokens',
      effort: 'medium',
      maxReasoningTokens: pref.maxTokens,
      maxCompletionTokens: undefined,
      showReasoningContent: pref.visibility === 'visible',
    }
  }
  return {
    controlMode: 'effort',
    effort: pref.effort || 'medium',
    maxReasoningTokens: undefined,
    maxCompletionTokens: undefined,
    showReasoningContent: pref.visibility === 'visible',
  }
}

export function buildUnifiedConfig(
  params: SamplingParameterSettings | undefined,
  pref: ReasoningPreference
): GenerationConfig {
  return {
    sampling: toSamplingConfig(params),
    length: {},
    reasoning: toReasoningResolved(pref),
  }
}
