import { describe, expect, it } from 'vitest'
import { canonicalizeOpenAIResponsesModelsEvidenceV2, decodeOpenAIResponsesModelsEvidenceV2 } from './modelsEvidenceV2'
import {
  isResolvedOpenAIResponsesModelCapabilityV2,
  resolveOpenAIResponsesModelCapabilityV2,
} from './modelCapabilityManifestV2'

function evidence(ids: readonly string[]) {
  return decodeOpenAIResponsesModelsEvidenceV2(canonicalizeOpenAIResponsesModelsEvidenceV2({
    object: 'list',
    data: ids.map((id, index) => ({ id, object: 'model', created: index + 1, owned_by: 'system' })),
  }))
}

describe('OpenAI Responses exact model capability manifest V2', () => {
  it('requires both credential-scoped model visibility and an exact reviewed model id', () => {
    const resolved = resolveOpenAIResponsesModelCapabilityV2({
      modelEvidence: evidence(['gpt-5.6', 'gpt-5.6-terra']),
      modelId: 'gpt-5.6',
    })
    expect(isResolvedOpenAIResponsesModelCapabilityV2(resolved)).toBe(true)
    expect(resolved.capability.family).toBe('gpt-5.6-sol')
    expect(resolved.capability.reasoningEfforts).toEqual(['none', 'low', 'medium', 'high', 'xhigh', 'max'])
    expect(resolved.capability.maxOutputTokens).toBe(128000)
  })

  it('does not infer capability for a visible unknown or adjacent model', () => {
    const models = evidence(['gpt-5.6-sol-2026-07-17', 'gpt-6'])
    for (const modelId of ['gpt-5.6-sol-2026-07-17', 'gpt-6']) {
      expect(() => resolveOpenAIResponsesModelCapabilityV2({ modelEvidence: models, modelId }))
        .toThrow('GENERATION_V2_OPENAI_MODEL_CAPABILITY_UNAVAILABLE')
    }
  })

  it('rejects a reviewed model id that is absent from current credential visibility', () => {
    expect(() => resolveOpenAIResponsesModelCapabilityV2({
      modelEvidence: evidence(['gpt-5.6-terra']), modelId: 'gpt-5.6-sol',
    })).toThrow('GENERATION_V2_OPENAI_MODEL_NOT_VISIBLE')
  })
})
