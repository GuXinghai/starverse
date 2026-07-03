import { describe, expect, it } from 'vitest'
import {
  buildGeminiNativeThinkingConfig,
  normalizeGeminiThinkingConfig,
  resolveGeminiThinkingCapability,
} from './geminiThinkingPolicy'

describe('geminiThinkingPolicy', () => {
  it('allows thinkingBudget for Gemini 2.5 models', () => {
    expect(resolveGeminiThinkingCapability({ model: 'models/gemini-2.5-flash' })).toMatchObject({
      kind: 'budget',
      minBudget: 1,
      maxBudget: 24576,
    })
    expect(resolveGeminiThinkingCapability({ model: 'gemini-2.5-pro' })).toMatchObject({
      kind: 'budget',
      maxBudget: 32768,
    })
  })

  it('allows thinkingLevel for Gemini 3 models', () => {
    expect(resolveGeminiThinkingCapability({ model: 'gemini-3-pro' })).toMatchObject({
      kind: 'level',
      levels: ['minimal', 'low', 'medium', 'high'],
    })
  })

  it('denies non-chat families and models without generateContent support', () => {
    expect(resolveGeminiThinkingCapability({ model: 'embedding-001' })).toMatchObject({ kind: 'unsupported' })
    expect(resolveGeminiThinkingCapability({ model: 'gemini-1.5-pro' })).toMatchObject({ kind: 'unsupported' })
    expect(resolveGeminiThinkingCapability({
      model: 'gemini-2.5-flash',
      supportedGenerationMethods: ['countTokens'],
    })).toMatchObject({ kind: 'unsupported', reason: 'unsupported_generation_method' })
  })

  it('normalizes unsupported and legacy none-like config to auto without native thinking config', () => {
    const config = normalizeGeminiThinkingConfig({
      model: 'gemini-2.5-flash',
      config: { mode: 'none' as any, thinkingBudget: 1234 },
    })

    expect(config.mode).toBe('auto')
    expect(buildGeminiNativeThinkingConfig({ model: 'gemini-2.5-flash', config })).toBeUndefined()
  })

  it('builds native includeThoughts independently from budget or level', () => {
    expect(buildGeminiNativeThinkingConfig({
      model: 'gemini-2.5-flash',
      config: { mode: 'auto', includeThoughts: true },
    })).toEqual({ includeThoughts: true })
    expect(buildGeminiNativeThinkingConfig({
      model: 'gemini-3-pro',
      config: { mode: 'level', thinkingLevel: 'high', includeThoughts: false },
    })).toEqual({ thinkingLevel: 'high', includeThoughts: false })
  })
})
