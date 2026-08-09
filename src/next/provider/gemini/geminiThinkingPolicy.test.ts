import { describe, expect, it } from 'vitest'
import {
  isGeminiThinkingBudgetValid,
  resolveGeminiThinkingCapability,
} from './geminiThinkingPolicy'

const generateContent = ['generateContent']

function resolve(model: string, thinking?: unknown) {
  return resolveGeminiThinkingCapability({
    model,
    thinking: arguments.length > 1 ? thinking : true,
    thinkingOwnProperty: true,
    supportedGenerationMethods: generateContent,
  })
}

describe('geminiThinkingPolicy', () => {
  it('uses raw thinking === true as the only support gate', () => {
    expect(resolve('gemini-3.1-flash-lite', true)).toMatchObject({ kind: 'level', thinkingSupported: 'supported' })
    for (const value of [undefined, false, null, 'true', 1, {}, []]) {
      expect(resolve('gemini-3.1-flash-lite', value)).toMatchObject({
        kind: 'unsupported', thinkingSupported: 'unsupported', reason: 'thinking_not_true',
      })
    }
    expect(resolveGeminiThinkingCapability({ model: 'gemini-3.1-flash-lite', thinking: true })).toMatchObject({
      kind: 'unsupported', reason: 'unsupported_generation_method',
    })
  })

  it('classifies the level matrix after the support gate', () => {
    expect(resolve('gemini-3.6-flash')).toMatchObject({ kind: 'level', defaultLevel: 'medium', levels: ['minimal', 'low', 'medium', 'high'], highIsDynamic: true })
    expect(resolve('gemini-3.1-pro-preview')).toMatchObject({ kind: 'level', defaultLevel: 'high', levels: ['low', 'medium', 'high'] })
    expect(resolve('gemini-3.1-flash-lite')).toMatchObject({ kind: 'level', defaultLevel: 'minimal', matchedRule: 'gemini-3.1-flash-lite' })
    expect(resolve('gemini-3.1-flash-lite-image')).toMatchObject({ kind: 'level', levels: ['minimal', 'high'], defaultLevel: 'minimal' })
    expect(resolve('gemini-3.6-flash-preview-07-2026')).toMatchObject({ kind: 'level', defaultLevel: 'medium' })
    expect(resolve('gemini-3.5-flash-lite-preview-05-2026')).toMatchObject({ kind: 'level', defaultLevel: 'minimal' })
    expect(resolve('gemini-3.1-flash-lite-image-preview')).toMatchObject({ kind: 'level', levels: ['minimal', 'high'] })
    expect(resolve('gemini-3-flash-preview')).toMatchObject({ kind: 'level', defaultLevel: 'high' })
  })

  it('classifies the budget matrix and keeps sentinel values separate from fixed ranges', () => {
    const pro = resolve('gemini-2.5-pro')
    expect(pro).toMatchObject({ kind: 'budget', minBudget: 128, maxBudget: 32768, allowOff: false, defaultBudgetMode: 'dynamic' })
    expect(isGeminiThinkingBudgetValid(pro, 127)).toBe(false)
    expect(isGeminiThinkingBudgetValid(pro, 128)).toBe(true)
    expect(isGeminiThinkingBudgetValid(pro, 32768)).toBe(true)
    expect(isGeminiThinkingBudgetValid(pro, 32769)).toBe(false)
    expect(isGeminiThinkingBudgetValid(pro, 0)).toBe(false)
    expect(isGeminiThinkingBudgetValid(pro, -1)).toBe(true)

    const flash = resolve('gemini-2.5-flash')
    expect(isGeminiThinkingBudgetValid(flash, 0)).toBe(true)
    expect(isGeminiThinkingBudgetValid(flash, 1)).toBe(true)
    expect(isGeminiThinkingBudgetValid(flash, 24576)).toBe(true)
    expect(isGeminiThinkingBudgetValid(flash, 24577)).toBe(false)

    const lite = resolve('gemini-2.5-flash-lite')
    expect(lite).toMatchObject({ minBudget: 512, maxBudget: 24576, defaultBudgetMode: 'off' })
    expect(isGeminiThinkingBudgetValid(lite, 511)).toBe(false)
    expect(isGeminiThinkingBudgetValid(lite, 512)).toBe(true)
    expect(isGeminiThinkingBudgetValid(lite, 24576)).toBe(true)
    expect(isGeminiThinkingBudgetValid(lite, 24577)).toBe(false)
  })

  it('does not infer controls for specialized or unmapped models', () => {
    expect(resolve('gemini-2.5-flash-image')).toMatchObject({ kind: 'default-only', matchedRule: null })
    expect(resolve('gemini-2.5-flash-preview-tts')).toMatchObject({ kind: 'default-only', matchedRule: null })
    expect(resolve('gemini-3.1-pro-preview-customtools')).toMatchObject({ kind: 'default-only', matchedRule: null })
    expect(resolve('gemini-3.1-flash-tts-preview')).toMatchObject({ kind: 'default-only', matchedRule: null })
    expect(resolve('future-gemini-model')).toMatchObject({ kind: 'default-only', matchedRule: null })
  })
})
