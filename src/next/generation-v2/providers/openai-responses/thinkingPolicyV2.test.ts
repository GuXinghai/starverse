import { describe, expect, it } from 'vitest'
import type { ResolvedCapabilityV2 } from '../../../../core/generation-v2/capability/resolvedCapabilityV2'
import { compileOpenAIResponsesRequestV1 } from '../../../../core/generation-v2/providers/openai-responses/responsesRequestV1'
import { resolveOpenAIResponsesRequestIntentV2 } from '../../../../core/generation-v2/providers/openai-responses/thinkingPolicyV2'
import type { GenerationIntentLayerV2 } from '../../../../core/generation-v2/domain/generationIntentV2'

function capability(modelId: string, efforts: readonly string[] | null, modeState: 'unsupported' | 'unknown' = 'unsupported'): ResolvedCapabilityV2 {
  const fields = efforts === null
    ? [{ path: 'reasoning.mode', state: modeState, constraints: [] },
      { path: 'reasoning.effort', state: 'unsupported' as const, constraints: [] }]
    : [{ path: 'reasoning.mode', state: 'supported' as const,
      domain: { kind: 'enum' as const, values: efforts.includes('none') ? ['enabled', 'disabled'] : ['enabled'] },
      defaultValue: 'enabled', constraints: [] },
      { path: 'reasoning.effort', state: 'supported' as const, domain: { kind: 'enum' as const, values: efforts },
        ...(modelId === 'gpt-6-astra' ? {} : { defaultValue: 'medium' }), constraints: [] }]
  return { modelFacts: { fields }, executionContext: { binding: { protocolContractId: { value: 'openai-responses-v1' },
    modelId: { value: modelId } } } } as unknown as ResolvedCapabilityV2
}

function intent(reasoning: GenerationIntentLayerV2['reasoning'], generation: GenerationIntentLayerV2['generation'] = {}): GenerationIntentLayerV2 {
  return Object.freeze({ schemaVersion: 2, reasoning, generation, providerExtension: { kind: 'openai_responses' as const } })
}

describe('OpenAI Responses reasoning request policy', () => {
  it('encodes user off as effort none only when the exact capability domain permits it', () => {
    const requested = intent({ mode: 'disabled', effort: 'high' }, { temperature: 0.7, topP: 0.9 })
    const resolved = resolveOpenAIResponsesRequestIntentV2(requested, capability('gpt-6-luna',
      ['none', 'low', 'medium', 'high', 'xhigh', 'max']))
    expect(resolved.reasoning).toEqual({ mode: 'disabled', effort: 'none' })
    expect(resolved.generation).toEqual({ temperature: 0.7, topP: 0.9 })
    const off = compileOpenAIResponsesRequestV1({ model: 'gpt-6-luna', priorArtifact: null,
      clientItems: [{ role: 'user', content: [{ type: 'input_text', text: 'x' }] }], reasoning: { effort: resolved.reasoning.effort } })
    const on = compileOpenAIResponsesRequestV1({ model: 'gpt-6-luna', priorArtifact: null,
      clientItems: [{ role: 'user', content: [{ type: 'input_text', text: 'x' }] }], reasoning: { effort: 'medium' } })
    expect(off.nativeRequest.reasoning).toEqual({ effort: 'none' })
    expect(off.preparedBody.copyUtf8Text()).not.toBe(on.preparedBody.copyUtf8Text())
    expect(resolved.decisions).toContainEqual(expect.objectContaining({ reason: 'openai_disabled_preference_encoded_as_none' }))
  })

  it('keeps required models on a documented legal effort and defers sampling controls', () => {
    const resolved = resolveOpenAIResponsesRequestIntentV2(
      intent({ mode: 'disabled', effort: 'none' }, { temperature: 0.2, topP: 0.8 }),
      capability('gpt-6-astra', ['low', 'medium', 'high', 'xhigh', 'max']))
    expect(resolved.reasoning).toEqual({ mode: 'enabled' })
    expect(resolved.generation).toEqual({})
    expect(resolved.decisions).toContainEqual(expect.objectContaining({ reason: 'openai_reasoning_off_unavailable_for_model' }))
    expect(resolved.decisions).toContainEqual(expect.objectContaining({ path: 'reasoning.effort',
      reason: 'openai_required_reasoning_effort_uses_provider_default' }))
    expect(resolved.decisions).toContainEqual(expect.objectContaining({ path: 'generation.temperature',
      reason: 'openai_sampling_unavailable_with_non_none_reasoning_effort' }))
    expect(resolved.decisions).toContainEqual(expect.objectContaining({ path: 'generation.topP',
      reason: 'openai_sampling_unavailable_with_non_none_reasoning_effort' }))
  })

  it('replaces enabled plus none with the documented non-none default', () => {
    const resolved = resolveOpenAIResponsesRequestIntentV2(
      intent({ mode: 'enabled', effort: 'none' }, { temperature: 0.5 }),
      capability('gpt-6-sol', ['none', 'low', 'medium', 'high', 'xhigh', 'max']))
    expect(resolved.reasoning).toEqual({ mode: 'enabled', effort: 'medium' })
    expect(resolved.generation).toEqual({})
    expect(resolved.decisions).toContainEqual(expect.objectContaining({
      path: 'reasoning.effort', reason: 'openai_enabled_reasoning_uses_non_none_provider_default', source: 'none',
    }))
  })

  it('defers off for unknown models without inventing none or blocking the request', () => {
    const resolved = resolveOpenAIResponsesRequestIntentV2(
      intent({ mode: 'disabled', effort: 'high' }), capability('vendor-private-model', null, 'unknown'))
    expect(resolved.reasoning).toEqual({ mode: 'disabled' })
    expect(resolved.decisions).toContainEqual(expect.objectContaining({
      reason: 'openai_off_preference_domain_unresolved_provider_default',
    }))
  })

  it('leaves confirmed non-reasoning models off with no wire control', () => {
    const resolved = resolveOpenAIResponsesRequestIntentV2(
      intent({ mode: 'disabled' }), capability('gpt-4o-mini', null))
    expect(resolved.reasoning).toEqual({ mode: 'disabled' })
    expect(resolved.decisions).toEqual([])
  })
})
