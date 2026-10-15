import {
  decodeOpenRouterImageDescriptorFreshnessPairV2,
  type OpenRouterImageDescriptorFreshnessPairV2,
} from './descriptorFreshnessSettingsV2'

export type OpenRouterImageDescriptorFreshnessDecisionV2 = Readonly<
  | { kind: 'use_cached'; ageMs: number; settings: OpenRouterImageDescriptorFreshnessPairV2 }
  | { kind: 'refresh_soft'; ageMs: number; settings: OpenRouterImageDescriptorFreshnessPairV2 }
  | {
      kind: 'refresh_required'
      reason: 'cache_missing' | 'hard_expired'
      ageMs: number | null
      settings: OpenRouterImageDescriptorFreshnessPairV2
    }
>

export class OpenRouterImageDescriptorFreshnessDecisionV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_FRESHNESS_DECISION_INVALID_SHAPE'
    | 'GENERATION_V2_OPENROUTER_FRESHNESS_DECISION_INVALID_TIME'
    | 'GENERATION_V2_OPENROUTER_FRESHNESS_CLOCK_REGRESSION') {
    super(code)
    this.name = 'OpenRouterImageDescriptorFreshnessDecisionV2Error'
  }
}

type DecisionInput = Readonly<{
  nowMs: unknown
  fetchedAtMs: unknown
  settings: unknown
}>

function closedInput(value: unknown): DecisionInput {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new OpenRouterImageDescriptorFreshnessDecisionV2Error(
      'GENERATION_V2_OPENROUTER_FRESHNESS_DECISION_INVALID_SHAPE',
    )
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const expected = ['fetchedAtMs', 'nowMs', 'settings']
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== expected.join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new OpenRouterImageDescriptorFreshnessDecisionV2Error(
      'GENERATION_V2_OPENROUTER_FRESHNESS_DECISION_INVALID_SHAPE',
    )
  }
  return Object.freeze({
    fetchedAtMs: descriptors.fetchedAtMs.value,
    nowMs: descriptors.nowMs.value,
    settings: descriptors.settings.value,
  })
}

function safeTime(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new OpenRouterImageDescriptorFreshnessDecisionV2Error(
      'GENERATION_V2_OPENROUTER_FRESHNESS_DECISION_INVALID_TIME',
    )
  }
  return value
}

export function decideOpenRouterImageDescriptorFreshnessV2(
  value: unknown,
): OpenRouterImageDescriptorFreshnessDecisionV2 {
  const input = closedInput(value)
  const nowMs = safeTime(input.nowMs)
  const settings = decodeOpenRouterImageDescriptorFreshnessPairV2(input.settings)
  if (input.fetchedAtMs === null) {
    return Object.freeze({ kind: 'refresh_required', reason: 'cache_missing', ageMs: null, settings })
  }
  const fetchedAtMs = safeTime(input.fetchedAtMs)
  if (nowMs < fetchedAtMs) {
    throw new OpenRouterImageDescriptorFreshnessDecisionV2Error(
      'GENERATION_V2_OPENROUTER_FRESHNESS_CLOCK_REGRESSION',
    )
  }
  const ageMs = nowMs - fetchedAtMs
  if (ageMs < settings.refreshAfterMs) {
    return Object.freeze({ kind: 'use_cached', ageMs, settings })
  }
  if (ageMs < settings.hardExpireAfterMs) {
    return Object.freeze({ kind: 'refresh_soft', ageMs, settings })
  }
  return Object.freeze({ kind: 'refresh_required', reason: 'hard_expired', ageMs, settings })
}
