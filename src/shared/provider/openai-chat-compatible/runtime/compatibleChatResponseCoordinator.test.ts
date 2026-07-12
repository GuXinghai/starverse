import { describe, expect, it } from 'vitest'
import { CompatibleChatResponseCoordinator } from './compatibleChatResponseCoordinator'

const route = {
  routeProvenanceId: 'ocp_route_12345678', providerInstanceId: 'ocp_provider_12345678',
  responseProfileId: 'ocp_response_profile_12345678', responseProfileVersion: 2,
  reasoningMappingId: 'ocp_reasoning_mapping_12345678', reasoningMappingVersion: 3,
  reasoningMode: 'custom_preferred_with_builtin_fallback' as const,
}

describe('CompatibleChatResponseCoordinator', () => {
  it('locks a pinned custom reasoning mapping, keeps it out of content, and terminalizes one durable block', () => {
    const coordinator = new CompatibleChatResponseCoordinator({
      route, choices: [{ choiceIndex: 0, messageId: 'assistant-1' }],
      reasoningMapping: {
        schemaVersion: 1, mode: route.reasoningMode,
        rules: [{ stream: { path: 'choices.*.delta.reasoning_content', mode: 'append' }, final: { path: 'choices.*.message.reasoning_content', mode: 'snapshot' }, semantic: 'text' }],
        replay: { format: 'disabled', scope: 'never' },
      },
      inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1, config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] } },
    })
    coordinator.apply({ kind: 'extension', source: 'stream', sequence: 0, candidate: { choiceIndex: 0, sourcePath: ['choices', 0, 'delta', 'reasoning_content'], value: 'think ' } })
    coordinator.apply({ kind: 'extension', source: 'stream', sequence: 1, candidate: { choiceIndex: 0, sourcePath: ['choices', 0, 'delta', 'reasoning_content'], value: 'more' } })
    coordinator.apply({ kind: 'choice_content', source: 'stream', sequence: 2, choiceIndex: 0, content: 'answer' })
    const terminal = coordinator.apply({ kind: 'choice_finish', source: 'stream', sequence: 3, choiceIndex: 0, finishReason: 'stop' })
    expect(terminal[0]).toMatchObject({
      status: 'streaming', reasoning: { lockedSource: 'custom' },
      blocks: [
        expect.objectContaining({ kind: 'reasoning', text: 'think more' }),
        expect.objectContaining({ kind: 'content', text: 'answer' }),
      ],
    })
    const final = coordinator.apply({ kind: 'terminal', source: 'stream', sequence: 4, outcome: 'done' })
    expect(final[0]).toMatchObject({ status: 'completed', reasoning: { lockedSource: 'custom' } })
    expect(coordinator.reasoningStates()[0]?.state).toMatchObject({ status: 'terminal', value: 'think more' })
    expect(coordinator.rawDrafts()).toEqual([
      expect.objectContaining({ semantic: 'reasoning', sourcePath: 'choices.0.delta.reasoning_content', value: '[redacted]' }),
    ])
  })

  it('uses builtin reasoning only when fallback mode permits it', () => {
    const coordinator = new CompatibleChatResponseCoordinator({
      route, choices: [{ choiceIndex: 0, messageId: 'assistant-1' }],
      reasoningMapping: { schemaVersion: 1, mode: route.reasoningMode, rules: [], replay: { format: 'disabled', scope: 'never' } },
      inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1, config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] } },
    })
    const snapshot = coordinator.apply({ kind: 'extension', source: 'stream', sequence: 0, candidate: { choiceIndex: 0, sourcePath: ['choices', 0, 'delta', 'thinking'], value: 'builtin' } })
    expect(snapshot[0]).toMatchObject({ reasoning: { lockedSource: 'thinking' }, blocks: [expect.objectContaining({ kind: 'reasoning', text: 'builtin' })] })
  })

  it('reports unmapped bounded fields for scoped discovery without exposing a raw preview', () => {
    const coordinator = new CompatibleChatResponseCoordinator({
      route, choices: [{ choiceIndex: 0, messageId: 'assistant-1' }],
      reasoningMapping: { schemaVersion: 1, mode: route.reasoningMode, rules: [], replay: { format: 'disabled', scope: 'never' } },
      inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1, config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] } },
    })
    coordinator.apply({ kind: 'extension', source: 'stream', sequence: 0, candidate: { choiceIndex: 0, sourcePath: ['choices', 0, 'delta', 'vendor_signal'], value: 'private-value' } })
    expect(coordinator.discoveryObservations()).toEqual([
      expect.objectContaining({ normalizedPath: 'choices.0.payload.vendor_signal', shape: 'string', nonEmpty: true }),
    ])
    expect(JSON.stringify(coordinator.rawDrafts())).not.toContain('private-value')
  })

  it('removes inline think tags from content and projects one inline reasoning source', () => {
    const coordinator = new CompatibleChatResponseCoordinator({
      route, choices: [{ choiceIndex: 0, messageId: 'assistant-1' }],
      reasoningMapping: { schemaVersion: 1, mode: route.reasoningMode, rules: [], replay: { format: 'disabled', scope: 'never' } },
      inlinePolicy: { inlinePolicyId: 'ocp_inline_policy_12345678', version: 1, config: { schemaVersion: 1, canonicalThinkTags: true, customTags: [] } },
    })
    coordinator.apply({ kind: 'choice_content', source: 'stream', sequence: 0, choiceIndex: 0, content: '<think>hidden' })
    coordinator.apply({ kind: 'choice_content', source: 'stream', sequence: 1, choiceIndex: 0, content: '</think>visible' })
    const final = coordinator.apply({ kind: 'terminal', source: 'stream', sequence: 2, outcome: 'done' })
    expect(final[0]).toMatchObject({
      reasoning: { lockedSource: 'inline' },
      blocks: [expect.objectContaining({ kind: 'reasoning', text: 'hidden' }), expect.objectContaining({ kind: 'content', text: 'visible' })],
    })
    expect(JSON.stringify(final)).not.toContain('<think>')
  })
})
