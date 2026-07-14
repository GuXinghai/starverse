export const OPENROUTER_IMAGE_REFRESH_AFTER_DEFAULT_MS = 6 * 60 * 60 * 1_000
export const OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_DEFAULT_MS = 24 * 60 * 60 * 1_000

export const OPENROUTER_IMAGE_REFRESH_AFTER_PRESETS_MS = Object.freeze([
  15 * 60 * 1_000,
  60 * 60 * 1_000,
  6 * 60 * 60 * 1_000,
  24 * 60 * 60 * 1_000,
  7 * 24 * 60 * 60 * 1_000,
])
export const OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_PRESETS_MS = Object.freeze([
  60 * 60 * 1_000,
  6 * 60 * 60 * 1_000,
  24 * 60 * 60 * 1_000,
  7 * 24 * 60 * 60 * 1_000,
  30 * 24 * 60 * 60 * 1_000,
])

export type OpenRouterImageDescriptorFreshness = Readonly<{
  refreshAfterMs: number
  hardExpireAfterMs: number
  restoredDefaults: boolean
}>

export function normalizeOpenRouterImageDescriptorFreshness(
  refreshAfterMs: unknown,
  hardExpireAfterMs: unknown,
): OpenRouterImageDescriptorFreshness {
  const refresh = Number(refreshAfterMs)
  const hard = Number(hardExpireAfterMs)
  const valid = OPENROUTER_IMAGE_REFRESH_AFTER_PRESETS_MS.includes(refresh)
    && OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_PRESETS_MS.includes(hard)
    && refresh < hard
  return valid
    ? { refreshAfterMs: refresh, hardExpireAfterMs: hard, restoredDefaults: false }
    : {
        refreshAfterMs: OPENROUTER_IMAGE_REFRESH_AFTER_DEFAULT_MS,
        hardExpireAfterMs: OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_DEFAULT_MS,
        restoredDefaults: true,
      }
}
