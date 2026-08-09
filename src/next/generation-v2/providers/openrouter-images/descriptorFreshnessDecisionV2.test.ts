import { describe, expect, it } from 'vitest'
import { decideOpenRouterImageDescriptorFreshnessV2 } from './descriptorFreshnessDecisionV2'

const settings = Object.freeze({ refreshAfterMs: 3_600_000, hardExpireAfterMs: 86_400_000 })

describe('OpenRouter Images V2 descriptor freshness decision', () => {
  it('uses exact refresh and hard-expiry boundaries', () => {
    expect(decideOpenRouterImageDescriptorFreshnessV2({ nowMs: 3_599_999, fetchedAtMs: 0, settings }))
      .toMatchObject({ kind: 'use_cached', ageMs: 3_599_999 })
    expect(decideOpenRouterImageDescriptorFreshnessV2({ nowMs: 3_600_000, fetchedAtMs: 0, settings }))
      .toMatchObject({ kind: 'refresh_soft', ageMs: 3_600_000 })
    expect(decideOpenRouterImageDescriptorFreshnessV2({ nowMs: 86_399_999, fetchedAtMs: 0, settings }))
      .toMatchObject({ kind: 'refresh_soft', ageMs: 86_399_999 })
    expect(decideOpenRouterImageDescriptorFreshnessV2({ nowMs: 86_400_000, fetchedAtMs: 0, settings }))
      .toMatchObject({ kind: 'refresh_required', reason: 'hard_expired', ageMs: 86_400_000 })
  })

  it('requires refresh when no successful cache exists', () => {
    expect(decideOpenRouterImageDescriptorFreshnessV2({ nowMs: 100, fetchedAtMs: null, settings }))
      .toEqual({ kind: 'refresh_required', reason: 'cache_missing', ageMs: null, settings })
  })

  it('fails closed on clock regression and unsafe time values', () => {
    expect(() => decideOpenRouterImageDescriptorFreshnessV2({ nowMs: 99, fetchedAtMs: 100, settings }))
      .toThrow('GENERATION_V2_OPENROUTER_FRESHNESS_CLOCK_REGRESSION')
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, '100']) {
      expect(() => decideOpenRouterImageDescriptorFreshnessV2({ nowMs: value, fetchedAtMs: null, settings }))
        .toThrow('GENERATION_V2_OPENROUTER_FRESHNESS_DECISION_INVALID_TIME')
      expect(() => decideOpenRouterImageDescriptorFreshnessV2({ nowMs: 100, fetchedAtMs: value, settings }))
        .toThrow('GENERATION_V2_OPENROUTER_FRESHNESS_DECISION_INVALID_TIME')
    }
  })

  it('rejects partial, extra, inherited and accessor-bearing inputs without invoking accessors', () => {
    for (const value of [
      { nowMs: 100, settings },
      { nowMs: 100, fetchedAtMs: null, settings, extra: true },
      Object.create({ nowMs: 100, fetchedAtMs: null, settings }),
    ]) expect(() => decideOpenRouterImageDescriptorFreshnessV2(value)).toThrow(
      'GENERATION_V2_OPENROUTER_FRESHNESS_DECISION_INVALID_SHAPE',
    )
    let calls = 0
    const accessor = Object.defineProperty({ fetchedAtMs: null, settings }, 'nowMs', {
      enumerable: true,
      get: () => { calls += 1; return 100 },
    })
    expect(() => decideOpenRouterImageDescriptorFreshnessV2(accessor)).toThrow(
      'GENERATION_V2_OPENROUTER_FRESHNESS_DECISION_INVALID_SHAPE',
    )
    expect(calls).toBe(0)
  })
})
