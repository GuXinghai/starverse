import { describe, expect, it } from 'vitest'
import {
  ANTHROPIC_MODEL_THINKING_RULES_V1,
  ANTHROPIC_MODEL_THINKING_RULES_V1_VERIFIED_AT,
  resolveAnthropicModelThinkingRuleV1,
} from './modelThinkingRulesV1'

describe('Anthropic exact model thinking rules V1', () => {
  it('uses only reviewed exact model IDs and freezes the official evidence set', () => {
    expect(ANTHROPIC_MODEL_THINKING_RULES_V1_VERIFIED_AT).toBe('2026-07-18')
    expect(ANTHROPIC_MODEL_THINKING_RULES_V1.map((rule) => rule.modelId)).toEqual([
      'claude-fable-5', 'claude-mythos-5', 'claude-mythos-preview',
      'claude-opus-4-8', 'claude-opus-4-7', 'claude-opus-4-6',
      'claude-sonnet-5', 'claude-sonnet-4-6', 'claude-opus-4-5',
      'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-haiku-4-5-20251001',
    ])
    expect(ANTHROPIC_MODEL_THINKING_RULES_V1.every((rule) => Object.isFrozen(rule) &&
      Object.isFrozen(rule.thinkingModes) && Object.isFrozen(rule.supportedEfforts) &&
      Object.isFrozen(rule.evidence))).toBe(true)
    expect(ANTHROPIC_MODEL_THINKING_RULES_V1[0]?.evidence).toEqual([
      'https://platform.claude.com/docs/en/build-with-claude/extended-thinking',
      'https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking',
      'https://platform.claude.com/docs/en/build-with-claude/effort',
      'https://platform.claude.com/docs/en/about-claude/models/overview',
    ])
  })

  it('distinguishes manual, adaptive and always-on models without family matching', () => {
    expect(resolveAnthropicModelThinkingRuleV1('claude-sonnet-4-5')).toMatchObject({
      thinkingModes: ['disabled', 'manual'], displayDefault: 'summarized', supportedEfforts: [],
    })
    expect(resolveAnthropicModelThinkingRuleV1('claude-opus-4-8')).toMatchObject({
      thinkingModes: ['disabled', 'adaptive'], displayDefault: 'omitted', rejectsExplicitSampling: true,
    })
    expect(resolveAnthropicModelThinkingRuleV1('claude-fable-5')).toMatchObject({
      thinkingModes: ['adaptive'], defaultThinkingMode: 'adaptive', recommendedEnabledThinkingMode: 'adaptive', alwaysThinking: true,
    })
    expect(resolveAnthropicModelThinkingRuleV1('claude-opus-4-6')?.recommendedEnabledThinkingMode).toBeNull()
    expect(resolveAnthropicModelThinkingRuleV1('claude-sonnet-4-5-preview')).toBeNull()
    expect(resolveAnthropicModelThinkingRuleV1('claude-unknown-99')).toBeNull()
  })

  it('keeps dated and alias Haiku 4.5 entries explicit and semantically identical', () => {
    const alias = resolveAnthropicModelThinkingRuleV1('claude-haiku-4-5')
    const dated = resolveAnthropicModelThinkingRuleV1('claude-haiku-4-5-20251001')
    expect(alias).not.toBeNull()
    expect(dated).not.toBeNull()
    expect({ ...alias, modelId: 'same' }).toEqual({ ...dated, modelId: 'same' })
  })
})
