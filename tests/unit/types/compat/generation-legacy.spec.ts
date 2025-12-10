import { describe, it, expect } from 'vitest'
import { toSamplingConfig, toReasoningResolved, buildUnifiedConfig } from '../../../../src/types/compat/generation-legacy'
import type { SamplingParameterSettings, ReasoningPreference } from '../../../../src/types/chat'

describe('generation-legacy compat layer', () => {
  describe('toSamplingConfig', () => {
    it('converts null to undefined', () => {
      const params: SamplingParameterSettings = {
        enabled: true,
        temperature: null,
        top_p: 0.9,
      }
      const result = toSamplingConfig(params)
      expect(result.temperature).toBeUndefined()
      expect(result.top_p).toBe(0.9)
    })

    it('preserves valid numbers', () => {
      const params: SamplingParameterSettings = {
        enabled: true,
        temperature: 0.7,
        top_k: 40,
        seed: 12345,
      }
      const result = toSamplingConfig(params)
      expect(result.temperature).toBe(0.7)
      expect(result.top_k).toBe(40)
      expect(result.seed).toBe(12345)
    })

    it('returns empty config for undefined input', () => {
      const result = toSamplingConfig(undefined)
      expect(result).toEqual({})
    })
  })

  describe('toReasoningResolved', () => {
    it('maps disabled visibility to disabled control mode', () => {
      const pref: ReasoningPreference = {
        visibility: 'off',
        effort: 'medium',
      }
      const result = toReasoningResolved(pref)
      expect(result?.controlMode).toBe('disabled')
      expect(result?.showReasoningContent).toBe(false)
    })

    it('maps custom mode with maxTokens to max_tokens control', () => {
      const pref: ReasoningPreference = {
        visibility: 'visible',
        effort: 'medium',
        mode: 'custom',
        maxTokens: 2000,
      }
      const result = toReasoningResolved(pref)
      expect(result?.controlMode).toBe('max_tokens')
      expect(result?.maxReasoningTokens).toBe(2000)
      expect(result?.showReasoningContent).toBe(true)
    })

    it('maps effort mode correctly', () => {
      const pref: ReasoningPreference = {
        visibility: 'hidden',
        effort: 'high',
        mode: 'high',
      }
      const result = toReasoningResolved(pref)
      expect(result?.controlMode).toBe('effort')
      expect(result?.effort).toBe('high')
      expect(result?.showReasoningContent).toBe(false)
    })
  })

  describe('buildUnifiedConfig', () => {
    it('builds complete unified config', () => {
      const params: SamplingParameterSettings = {
        enabled: true,
        temperature: 0.8,
        top_p: 0.95,
      }
      const pref: ReasoningPreference = {
        visibility: 'visible',
        effort: 'medium',
      }
      const config = buildUnifiedConfig(params, pref)
      expect(config.sampling?.temperature).toBe(0.8)
      expect(config.reasoning?.controlMode).toBe('effort')
      expect(config.length).toEqual({})
    })
  })
})
