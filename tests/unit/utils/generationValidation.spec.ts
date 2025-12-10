import { describe, it, expect, beforeEach } from 'vitest'
import { validateGenerationConfig } from '../../../src/utils/generationValidation'
import type { GenerationConfig } from '../../../src/types/generation'

describe('generationValidation', () => {
  describe('validateGenerationConfig', () => {
    it('accepts valid config', () => {
      const config: GenerationConfig = {
        sampling: {
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40,
        },
        length: {},
        reasoning: undefined,
      }
      const result = validateGenerationConfig(config)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('detects out-of-range temperature', () => {
      const config: GenerationConfig = {
        sampling: { temperature: 3.0 },
        length: {},
      }
      const result = validateGenerationConfig(config)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'sampling.temperature')).toBe(true)
    })

    it('detects negative top_k', () => {
      const config: GenerationConfig = {
        sampling: { top_k: -5 },
        length: {},
      }
      const result = validateGenerationConfig(config)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'sampling.top_k')).toBe(true)
    })

    it('detects null values (should be undefined)', () => {
      const config: any = {
        sampling: { temperature: null },
        length: {},
      }
      const result = validateGenerationConfig(config)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.message.includes('null'))).toBe(true)
    })

    it('allows undefined values', () => {
      const config: GenerationConfig = {
        sampling: { temperature: undefined, top_p: 0.9 },
        length: {},
      }
      const result = validateGenerationConfig(config)
      expect(result.valid).toBe(true)
    })

    it('detects frequency_penalty out of range', () => {
      const config: GenerationConfig = {
        sampling: { frequency_penalty: -3.0 },
        length: {},
      }
      const result = validateGenerationConfig(config)
      expect(result.valid).toBe(false)
      expect(result.errors.some(e => e.field === 'sampling.frequency_penalty')).toBe(true)
    })
  })
})
