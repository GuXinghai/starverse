import { describe, expect, it } from 'vitest'
import {
  formatOpenAIResponsesAutoReasoningLabel,
  getOpenAIResponsesReasoningEffortOptions,
  getOpenAIResponsesReasoningSpec,
  hasExplicitOpenAIResponsesReasoningEffort,
  isKnownOpenAIResponsesNonReasoningModel,
  supportsOpenAIResponsesReasoningEffort,
} from './openaiResponsesReasoningPolicy'

describe('openAIResponsesReasoningPolicy', () => {
  it.each([
    ['gpt-5.5-pro', ['medium', 'high', 'xhigh'], 'high'],
    ['gpt-5.5', ['none', 'low', 'medium', 'high', 'xhigh'], 'medium'],
    ['gpt-5.4-pro', ['medium', 'high', 'xhigh'], 'medium'],
    ['gpt-5.4-nano', ['none', 'low', 'medium', 'high', 'xhigh'], 'none'],
    ['gpt-5.3-codex', ['low', 'medium', 'high', 'xhigh'], undefined],
    ['gpt-5.2-pro', ['medium', 'high', 'xhigh'], undefined],
    ['gpt-5.2-codex', ['low', 'medium', 'high', 'xhigh'], undefined],
    ['gpt-5.2', ['none', 'low', 'medium', 'high', 'xhigh'], 'none'],
    ['gpt-5.1', ['none', 'low', 'medium', 'high'], 'none'],
    ['gpt-5-pro', ['high'], 'high'],
    ['gpt-5', ['minimal', 'low', 'medium', 'high'], undefined],
    ['o3', ['low', 'medium', 'high'], undefined],
  ])('resolves %s reasoning effort policy', (modelId, efforts, autoHint) => {
    const spec = getOpenAIResponsesReasoningSpec(modelId)

    expect(spec?.efforts).toEqual(efforts)
    expect(spec?.providerAutoHint).toBe(autoHint)
    expect(getOpenAIResponsesReasoningEffortOptions(modelId)).toEqual(['auto', ...efforts])
  })

  it('uses ordered model family matching so codex/pro variants are not swallowed by broad rules', () => {
    expect(getOpenAIResponsesReasoningSpec('gpt-5.2-codex-2026-01-01')?.efforts).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(getOpenAIResponsesReasoningSpec('gpt-5.2-pro-2026-01-01')?.efforts).toEqual(['medium', 'high', 'xhigh'])
    expect(getOpenAIResponsesReasoningSpec('gpt-5.1-codex-2026-01-01')).toBeNull()
  })

  it('supports models/ prefixes and snapshot suffixes', () => {
    expect(getOpenAIResponsesReasoningSpec('models/gpt-5.4-nano-2026-04-21')?.efforts).toEqual([
      'none',
      'low',
      'medium',
      'high',
      'xhigh',
    ])
  })

  it('does not enable explicit reasoning effort for unsupported or unknown models', () => {
    expect(hasExplicitOpenAIResponsesReasoningEffort('gpt-4.1-mini')).toBe(false)
    expect(hasExplicitOpenAIResponsesReasoningEffort('gpt-image-2')).toBe(false)
    expect(hasExplicitOpenAIResponsesReasoningEffort('future-model')).toBe(false)
    expect(getOpenAIResponsesReasoningEffortOptions('future-model')).toEqual(['auto'])
    expect(supportsOpenAIResponsesReasoningEffort('future-model', 'high')).toBe(false)
    expect(supportsOpenAIResponsesReasoningEffort('future-model', 'auto')).toBe(true)
  })

  it('distinguishes known non-reasoning families from unknown models', () => {
    expect(isKnownOpenAIResponsesNonReasoningModel('gpt-4.1-mini')).toBe(true)
    expect(isKnownOpenAIResponsesNonReasoningModel('gpt-image-2-2026-04-21')).toBe(true)
    expect(isKnownOpenAIResponsesNonReasoningModel('text-embedding-3-large')).toBe(true)
    expect(isKnownOpenAIResponsesNonReasoningModel('future-model')).toBe(false)
  })

  it('formats documented provider auto hints without making them wire values', () => {
    expect(formatOpenAIResponsesAutoReasoningLabel('gpt-5.4-nano')).toBe('Auto (none)')
    expect(formatOpenAIResponsesAutoReasoningLabel('gpt-5')).toBe('Auto')
  })
})
