import type { ModelGenerationCapability } from '../types/generation'

const capabilityMap = new Map<string, ModelGenerationCapability>()

export function registerCapability(modelId: string, cap: ModelGenerationCapability) {
  capabilityMap.set(modelId, cap)
}

export function getCapability(modelId: string | null): ModelGenerationCapability | null {
  if (!modelId) return null
  return capabilityMap.get(modelId) ?? null
}

export function getSamplingSupport(modelId: string | null): Set<string> {
  const cap = getCapability(modelId)
  if (!cap) return new Set()
  const s = new Set<string>()
  const m = cap.sampling
  if (m.temperature) s.add('temperature')
  if (m.top_p) s.add('top_p')
  if (m.top_k) s.add('top_k')
  if (m.min_p) s.add('min_p')
  if (m.top_a) s.add('top_a')
  if (m.frequency_penalty) s.add('frequency_penalty')
  if (m.presence_penalty) s.add('presence_penalty')
  if (m.repetition_penalty) s.add('repetition_penalty')
  if (m.seed) s.add('seed')
  if (m.logit_bias) s.add('logit_bias')
  return s
}

export function getReasoningSupport(modelId: string | null) {
  const cap = getCapability(modelId)
  if (!cap) return null
  return {
    supportsReasoning: cap.reasoning.supportsReasoningParam,
    supportsEffort: cap.reasoning.supportsReasoningParam,
    supportsMaxTokens: cap.reasoning.supportsMaxReasoningTokens,
    returnsVisible: cap.reasoning.returnsVisibleReasoning !== 'no',
  }
}
