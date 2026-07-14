export const OPENROUTER_IMAGE_REFRESH_AFTER_DEFAULT_MS_V2 = 6 * 60 * 60 * 1_000
export const OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_DEFAULT_MS_V2 = 24 * 60 * 60 * 1_000

export const OPENROUTER_IMAGE_REFRESH_AFTER_PRESETS_MS_V2 = Object.freeze([
  15 * 60 * 1_000,
  60 * 60 * 1_000,
  6 * 60 * 60 * 1_000,
  24 * 60 * 60 * 1_000,
  7 * 24 * 60 * 60 * 1_000,
] as const)

export const OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_PRESETS_MS_V2 = Object.freeze([
  60 * 60 * 1_000,
  6 * 60 * 60 * 1_000,
  24 * 60 * 60 * 1_000,
  7 * 24 * 60 * 60 * 1_000,
  30 * 24 * 60 * 60 * 1_000,
] as const)

export type OpenRouterImageDescriptorFreshnessPairV2 = Readonly<{
  refreshAfterMs: number
  hardExpireAfterMs: number
}>

export class OpenRouterImageDescriptorFreshnessSettingsV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_FRESHNESS_INVALID_SHAPE'
    | 'GENERATION_V2_OPENROUTER_FRESHNESS_INVALID_VALUE') {
    super(code)
    this.name = 'OpenRouterImageDescriptorFreshnessSettingsV2Error'
  }
}

export const DEFAULT_OPENROUTER_IMAGE_DESCRIPTOR_FRESHNESS_PAIR_V2: OpenRouterImageDescriptorFreshnessPairV2 =
  Object.freeze({
    refreshAfterMs: OPENROUTER_IMAGE_REFRESH_AFTER_DEFAULT_MS_V2,
    hardExpireAfterMs: OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_DEFAULT_MS_V2,
  })

export function decodeOpenRouterImageDescriptorFreshnessPairV2(
  value: unknown,
): OpenRouterImageDescriptorFreshnessPairV2 {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new OpenRouterImageDescriptorFreshnessSettingsV2Error('GENERATION_V2_OPENROUTER_FRESHNESS_INVALID_SHAPE')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const expected = ['refreshAfterMs', 'hardExpireAfterMs']
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== expected.sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    throw new OpenRouterImageDescriptorFreshnessSettingsV2Error('GENERATION_V2_OPENROUTER_FRESHNESS_INVALID_SHAPE')
  }
  const refreshAfterMs = descriptors.refreshAfterMs.value
  const hardExpireAfterMs = descriptors.hardExpireAfterMs.value
  if (typeof refreshAfterMs !== 'number' || !Number.isSafeInteger(refreshAfterMs) ||
      typeof hardExpireAfterMs !== 'number' || !Number.isSafeInteger(hardExpireAfterMs) ||
      !(OPENROUTER_IMAGE_REFRESH_AFTER_PRESETS_MS_V2 as readonly number[]).includes(refreshAfterMs) ||
      !(OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_PRESETS_MS_V2 as readonly number[]).includes(hardExpireAfterMs) ||
      refreshAfterMs >= hardExpireAfterMs) {
    throw new OpenRouterImageDescriptorFreshnessSettingsV2Error('GENERATION_V2_OPENROUTER_FRESHNESS_INVALID_VALUE')
  }
  return Object.freeze({ refreshAfterMs, hardExpireAfterMs })
}
