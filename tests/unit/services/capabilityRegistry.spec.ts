import { describe, it, expect, beforeEach } from 'vitest'
import { registerCapability, getCapability, getSamplingSupport, getReasoningSupport } from '../../../src/services/capabilityRegistry'
import type { ModelGenerationCapability } from '../../../src/types/generation'

describe('capabilityRegistry', () => {
  const mockCapability: ModelGenerationCapability = {
    modelId: 'test-model',
    sampling: {
      temperature: true,
      top_p: true,
      top_k: false,
      min_p: true,
      top_a: false,
      frequency_penalty: true,
      presence_penalty: true,
      repetition_penalty: false,
      seed: true,
      logit_bias: false,
    },
    length: {
      max_tokens: true,
      stop: true,
      verbosity: false,
      maxCompletionTokens: 4096,
    },
    reasoning: {
      supportsReasoningParam: true,
      supportsIncludeReasoning: false,
      supportsMaxReasoningTokens: true,
      returnsVisibleReasoning: 'yes',
      maxCompletionTokens: 4096,
      internalReasoningPrice: null,
      family: 'openai',
      reasoningClass: 'A',
      maxTokensPolicy: 'effort-only',
    },
    other: {
      tools: true,
      response_format: true,
      structured_outputs: false,
      logprobs: true,
      top_logprobs: false,
      parallel_tool_calls: true,
    },
  }

  beforeEach(() => {
    // Clear registry before each test
    const registry = getCapability as any
    if (registry.__map) registry.__map.clear()
  })

  describe('registerCapability & getCapability', () => {
    it('registers and retrieves capability', () => {
      registerCapability('test-model', mockCapability)
      const result = getCapability('test-model')
      expect(result).toEqual(mockCapability)
    })

    it('returns null for unknown model', () => {
      const result = getCapability('unknown-model')
      expect(result).toBeNull()
    })

    it('returns null for null modelId', () => {
      const result = getCapability(null)
      expect(result).toBeNull()
    })
  })

  describe('getSamplingSupport', () => {
    it('returns correct sampling support set', () => {
      registerCapability('test-model', mockCapability)
      const support = getSamplingSupport('test-model')
      expect(support.has('temperature')).toBe(true)
      expect(support.has('top_p')).toBe(true)
      expect(support.has('top_k')).toBe(false)
      expect(support.has('min_p')).toBe(true)
      expect(support.has('seed')).toBe(true)
    })

    it('returns empty set for unknown model', () => {
      const support = getSamplingSupport('unknown')
      expect(support.size).toBe(0)
    })
  })

  describe('getReasoningSupport', () => {
    it('returns correct reasoning support', () => {
      registerCapability('test-model', mockCapability)
      const support = getReasoningSupport('test-model')
      expect(support?.supportsReasoning).toBe(true)
      expect(support?.supportsMaxTokens).toBe(true)
      expect(support?.returnsVisible).toBe(true)
    })

    it('returns null for unknown model', () => {
      const support = getReasoningSupport('unknown')
      expect(support).toBeNull()
    })

    it('correctly maps returnsVisibleReasoning no to false', () => {
      const cap = { ...mockCapability }
      cap.reasoning.returnsVisibleReasoning = 'no'
      registerCapability('no-visible', cap)
      const support = getReasoningSupport('no-visible')
      expect(support?.returnsVisible).toBe(false)
    })
  })
})
