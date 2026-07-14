import { describe, expect, it } from 'vitest'
import {
  normalizeOpenRouterImageDescriptorFreshness,
  OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_DEFAULT_MS,
  OPENROUTER_IMAGE_REFRESH_AFTER_DEFAULT_MS,
} from './descriptorSettings'

describe('OpenRouter Images descriptor freshness settings', () => {
  it('accepts only preset pairs with refresh strictly before hard expiry', () => {
    expect(normalizeOpenRouterImageDescriptorFreshness(60 * 60 * 1_000, 24 * 60 * 60 * 1_000))
      .toMatchObject({ restoredDefaults: false })
    expect(normalizeOpenRouterImageDescriptorFreshness(24 * 60 * 60 * 1_000, 24 * 60 * 60 * 1_000))
      .toEqual({
        refreshAfterMs: OPENROUTER_IMAGE_REFRESH_AFTER_DEFAULT_MS,
        hardExpireAfterMs: OPENROUTER_IMAGE_HARD_EXPIRE_AFTER_DEFAULT_MS,
        restoredDefaults: true,
      })
  })
})
