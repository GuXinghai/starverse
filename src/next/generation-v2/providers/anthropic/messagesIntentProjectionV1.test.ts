import { describe, expect, it } from 'vitest'
import { projectAnthropicMessagesIntentV1 } from './messagesIntentProjectionV1'

function intent(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    generation: { maxOutputTokens: 2_048 },
    reasoning: { mode: 'disabled' },
    web: { mode: 'disabled' },
    image: { mode: 'disabled' },
    tools: { mode: 'disabled' },
    attachments: [],
    providerExtension: {
      kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'model_recommended',
    },
    ...overrides,
  }
}

describe('projectAnthropicMessagesIntentV1', () => {
  it('omits provider_default display and preserves explicit summarized/omitted values', () => {
    const defaultProjection = projectAnthropicMessagesIntentV1(intent(), 'claude-opus-4-6')
    expect(defaultProjection.issues).toEqual([])
    expect(defaultProjection.request.thinking).toEqual({ type: 'disabled' })
    expect(defaultProjection.dispositions).toContainEqual(expect.objectContaining({
      semanticPath: 'providerExtension.thinkingDisplay', outcome: 'accepted_no_wire',
    }))

    for (const display of ['summarized', 'omitted'] as const) {
      const projection = projectAnthropicMessagesIntentV1(intent({
        reasoning: { mode: 'enabled' },
        providerExtension: { kind: 'anthropic_messages', thinkingDisplay: display, thinkingMode: 'manual', manualThinkingBudgetTokens: 1_024 },
      }), 'claude-opus-4-6')
      expect(projection.issues).toEqual([])
      expect(projection.request.thinking).toEqual({ type: 'enabled', budgetTokens: 1_024, display })
      expect(projection.dispositions).toContainEqual(expect.objectContaining({
        semanticPath: 'reasoning.mode', outcome: 'accepted_no_wire',
      }))
    }
  })

  it('requires explicit max tokens and enforces manual budget strictly below it without raising max', () => {
    const missing = projectAnthropicMessagesIntentV1(intent({ generation: {} }), 'claude-opus-4-6')
    expect(missing.issues).toContainEqual(expect.objectContaining({
      semanticPath: 'generation.maxOutputTokens', code: 'ANTHROPIC_MAX_OUTPUT_TOKENS_REQUIRED',
    }))
    const boundary = projectAnthropicMessagesIntentV1(intent({
      reasoning: { mode: 'enabled' },
      providerExtension: {
        kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'manual', manualThinkingBudgetTokens: 2_048,
      },
    }), 'claude-opus-4-6')
    expect(boundary.request.maxTokens).toBe(2_048)
    expect(boundary.request.thinking).toBeUndefined()
    expect(boundary.issues).toContainEqual(expect.objectContaining({
      code: 'ANTHROPIC_MANUAL_THINKING_BUDGET_NOT_BELOW_MAX_TOKENS',
    }))
    const belowMinimum = projectAnthropicMessagesIntentV1(intent({
      reasoning: { mode: 'enabled' },
      providerExtension: {
        kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'manual', manualThinkingBudgetTokens: 1_023,
      },
    }), 'claude-opus-4-6')
    expect(belowMinimum.issues).toContainEqual(expect.objectContaining({
      code: 'ANTHROPIC_MANUAL_THINKING_BUDGET_BELOW_MINIMUM',
    }))
  })

  it('applies exact-model sampling and effort policy', () => {
    const rejected = projectAnthropicMessagesIntentV1(intent({
      generation: { maxOutputTokens: 100, temperature: 0.3 },
      reasoning: { mode: 'enabled', effort: 'high' },
      providerExtension: {
        kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'adaptive',
      },
    }), 'claude-sonnet-5')
    expect(rejected.issues).toContainEqual(expect.objectContaining({
      semanticPath: 'generation.temperature', code: 'ANTHROPIC_EXPLICIT_SAMPLING_REJECTED_BY_MODEL',
    }))
    expect(rejected.request.effort).toBe('high')

    const noEffort = projectAnthropicMessagesIntentV1(intent({
      reasoning: { mode: 'enabled', effort: 'low' },
      providerExtension: {
        kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'manual', manualThinkingBudgetTokens: 1_024,
      },
    }), 'claude-sonnet-4-5')
    expect(noEffort.issues).toContainEqual(expect.objectContaining({ code: 'ANTHROPIC_EFFORT_UNSUPPORTED_BY_MODEL' }))
  })

  it('rejects every unsupported explicit semantic instead of silently dropping it', () => {
    const projection = projectAnthropicMessagesIntentV1(intent({
      generation: { maxOutputTokens: 100, seed: 7, candidateCount: 2 },
      reasoning: { mode: 'enabled', summary: 'auto' },
      web: { mode: 'provider_search', types: ['web'] },
      image: { mode: 'generate', quality: 'high' },
      tools: { mode: 'enabled', allowedToolIds: ['tool-a'], toolChoice: { mode: 'auto' }, sideEffectConfirmation: 'required_each_retry' },
      attachments: [{
        assetId: 'asset-a', assetRevisionId: 'revision-a', assetSha256: 'a'.repeat(64), include: true,
        sendAs: 'inline_text', conversion: 'plain_text',
      }],
      providerExtension: {
        kind: 'anthropic_messages', thinkingDisplay: 'provider_default', thinkingMode: 'manual', manualThinkingBudgetTokens: 1_024,
      },
    }), 'claude-opus-4-6')
    for (const path of [
      'generation.seed', 'generation.candidateCount', 'reasoning.summary', 'web.mode', 'web.types',
      'image.mode', 'image.quality',
      'attachments[0].include', 'attachments[0].sendAs', 'attachments[0].conversion',
    ]) {
      expect(projection.dispositions).toContainEqual(expect.objectContaining({ semanticPath: path, outcome: 'rejected' }))
    }
    expect(projection.dispositions).toContainEqual(expect.objectContaining({
      semanticPath: 'tools.sideEffectConfirmation', outcome: 'accepted_no_wire',
    }))
    expect(projection.dispositions).toContainEqual(expect.objectContaining({ semanticPath: 'tools.mode', outcome: 'encoded', wireKey: 'tools' }))
    expect(projection.dispositions).toContainEqual(expect.objectContaining({ semanticPath: 'tools.allowedToolIds', outcome: 'encoded', wireKey: 'tools' }))
    expect(projection.dispositions).toContainEqual(expect.objectContaining({ semanticPath: 'tools.toolChoice', outcome: 'encoded', wireKey: 'tool_choice' }))
  })

  it('accepts excluded attachments as descriptor-only no-wire semantics', () => {
    const projection = projectAnthropicMessagesIntentV1(intent({ attachments: [{
      assetId: 'asset-a', assetRevisionId: 'revision-a', assetSha256: 'a'.repeat(64), include: false,
      sendAs: 'inline_text', conversion: 'plain_text',
    }] }), 'claude-opus-4-6')
    expect(projection.issues).toEqual([])
    expect(projection.dispositions.filter((entry) => entry.semanticPath.startsWith('attachments[0]')))
      .toHaveLength(6)
    expect(projection.dispositions.filter((entry) => entry.semanticPath.startsWith('attachments[0]'))
      .every((entry) => entry.outcome === 'accepted_no_wire')).toBe(true)
  })
})
