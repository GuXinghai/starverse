import { describe, expect, it } from 'vitest'
import { decodeResolvedGenerationIntentV2 } from '../../domain/resolvedGenerationIntentV2'
import { projectAnthropicThinkingDisplayIntentV1 } from './thinkingDisplayIntentProjectionV1'

function resolve(value: unknown) {
  return decodeResolvedGenerationIntentV2({
    schemaVersion: 2,
    generation: {},
    web: { mode: 'disabled' },
    image: { mode: 'disabled' },
    tools: { mode: 'disabled' },
    attachments: [],
    ...value as object,
  }).value
}

describe('Anthropic thinking display intent projection V1', () => {
  it('omits display exactly when the user selected the provider default', () => {
    const result = projectAnthropicThinkingDisplayIntentV1(resolve({
      reasoning: { mode: 'enabled' },
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'manual', manualThinkingBudgetTokens: 1024 },
    }), 'claude-sonnet-4-5')
    expect(result.thinking).toEqual({ type: 'enabled', budgetTokens: 1024 })
    expect(result.dispositions).toEqual([
      { semanticPath: 'providerExtension.kind', outcome: 'accepted_no_wire' },
      { semanticPath: 'providerExtension.manualThinkingBudgetTokens', outcome: 'encoded', wireKey: 'thinking.budget_tokens', value: 1024 },
      { semanticPath: 'providerExtension.thinkingDisplay', outcome: 'accepted_no_wire' },
      { semanticPath: 'providerExtension.thinkingMode', outcome: 'encoded', wireKey: 'thinking.type', value: 'enabled' },
    ])
  })

  it.each(['summarized', 'omitted'] as const)('encodes the selected %s display without changing it', (display) => {
    const result = projectAnthropicThinkingDisplayIntentV1(resolve({
      reasoning: { mode: 'enabled' },
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: display, thinkingMode: 'adaptive' },
    }), 'claude-opus-4-8')
    expect(result.thinking).toEqual({ type: 'adaptive', display })
    expect(result.dispositions).toContainEqual({
      semanticPath: 'providerExtension.thinkingDisplay', outcome: 'encoded', wireKey: 'thinking.display', value: display,
    })
  })

  it('preserves the disabled-control setting but omits display when thinking is disabled', () => {
    const result = projectAnthropicThinkingDisplayIntentV1(resolve({
      reasoning: { mode: 'disabled' },
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'manual', manualThinkingBudgetTokens: 1024 },
    }), 'claude-sonnet-4-5')
    expect(result.issues).toEqual([])
    expect(result.dispositions).toEqual([
      { semanticPath: 'providerExtension.kind', outcome: 'accepted_no_wire' },
      { semanticPath: 'providerExtension.manualThinkingBudgetTokens', outcome: 'accepted_no_wire' },
      { semanticPath: 'providerExtension.thinkingDisplay', outcome: 'accepted_no_wire' },
      { semanticPath: 'providerExtension.thinkingMode', outcome: 'accepted_no_wire' },
    ])
    expect(result.thinking).toEqual({ type: 'disabled' })
  })

  it('rejects another provider extension rather than interpreting it as Anthropic configuration', () => {
    const result = projectAnthropicThinkingDisplayIntentV1(resolve({
      reasoning: { mode: 'enabled' },
      providerExtension: { kind: 'openai_responses', verbosity: 'high' },
    }), 'claude-opus-4-8')
    expect(result.issues).toEqual([
      { semanticPath: 'providerExtension.kind', code: 'ANTHROPIC_PROVIDER_EXTENSION_UNSUPPORTED' },
    ])
  })

  it('requires an explicit Anthropic extension instead of silently omitting enabled thinking', () => {
    const result = projectAnthropicThinkingDisplayIntentV1(resolve({
      reasoning: { mode: 'enabled' },
      providerExtension: { kind: 'none' },
    }), 'claude-sonnet-4-5')
    expect(result.issues).toEqual([
      { semanticPath: 'providerExtension.kind', code: 'ANTHROPIC_PROVIDER_EXTENSION_UNSUPPORTED' },
    ])
    expect(result).not.toHaveProperty('thinking')
  })

  it('fails closed for an unreviewed model or a model that cannot disable thinking', () => {
    expect(projectAnthropicThinkingDisplayIntentV1(resolve({
      reasoning: { mode: 'enabled' },
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'manual', manualThinkingBudgetTokens: 1024 },
    }), 'claude-sonnet-4-5-preview').issues).toEqual([
      { semanticPath: 'modelId', code: 'ANTHROPIC_MODEL_RULE_UNAVAILABLE' },
    ])
    expect(projectAnthropicThinkingDisplayIntentV1(resolve({
      reasoning: { mode: 'disabled' },
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'adaptive' },
    }), 'claude-fable-5').issues).toEqual([
      { semanticPath: 'reasoning.mode', code: 'ANTHROPIC_THINKING_DISABLED_UNSUPPORTED' },
    ])
  })

  it('never guesses an enabled mode when the reviewed rule has no recommendation', () => {
    const unavailableRecommendation = projectAnthropicThinkingDisplayIntentV1(resolve({
      reasoning: { mode: 'enabled' },
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'summarized', thinkingMode: 'model_recommended' },
    }), 'claude-sonnet-4-5')
    expect(unavailableRecommendation.issues).toEqual([
      { semanticPath: 'providerExtension.thinkingMode', code: 'ANTHROPIC_THINKING_MODE_RECOMMENDATION_UNAVAILABLE' },
    ])
    expect(unavailableRecommendation).not.toHaveProperty('thinking')

    const unsupportedAdaptive = projectAnthropicThinkingDisplayIntentV1(resolve({
      reasoning: { mode: 'enabled' },
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'omitted', thinkingMode: 'adaptive' },
    }), 'claude-sonnet-4-5')
    expect(unsupportedAdaptive.issues).toEqual([
      { semanticPath: 'providerExtension.thinkingMode', code: 'ANTHROPIC_THINKING_MODE_UNSUPPORTED' },
    ])
    expect(unsupportedAdaptive).not.toHaveProperty('thinking')
  })

  it('uses a reviewed recommendation only when the exact model rule contains one', () => {
    const result = projectAnthropicThinkingDisplayIntentV1(resolve({
      reasoning: { mode: 'enabled' },
      providerExtension: { kind: 'anthropic_messages', thinkingDisplay: 'omitted', thinkingMode: 'model_recommended' },
    }), 'claude-sonnet-5')
    expect(result.issues).toEqual([])
    expect(result.thinking).toEqual({ type: 'adaptive', display: 'omitted' })
  })
})
