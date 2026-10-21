import { describe, expect, it } from 'vitest'
import { executeGeminiReasoningRuleV2 } from '../../../core/generation-v2/capability-rules/operations/geminiReasoningV2'
import type { ResolvedCapabilityV2 } from '../../../core/generation-v2/capability/resolvedCapabilityV2'
import { canonicalizeResolvedCapabilityV2 } from '../../../core/generation-v2/capability/resolvedCapabilityV2'
import { MODEL_CAPABILITY_SEMANTIC_PATHS_V2 } from '../../../core/generation-v2/capability/modelCapabilitySchemaV2'
import { listReviewedProviderContractDefinitionsV2 } from '../../../core/generation-v2/contracts/providerContractRegistryV2'
import { decodeResolvedGenerationIntentV2 } from '../../../core/generation-v2/domain/resolvedGenerationIntentV2'

function capability(protocol: 'generate_content' | 'interactions', mode: 'unknown' | 'unsupported' | 'required', nativeBudget = false): ResolvedCapabilityV2 {
  const contract = listReviewedProviderContractDefinitionsV2().find(value => value.protocolContractId.value ===
    (protocol === 'generate_content' ? 'gemini-generate-content-v1beta' : 'gemini-interactions-v1beta'))!
  const evidenceIds = ['test:reasoning']
  return canonicalizeResolvedCapabilityV2({ binding: { providerId: contract.providerId.value,
    endpointProfileId: 'gemini-developer-api-v1beta', modelId: 'test-model', credentialScopeId: 'scope:test',
    operation: contract.operations.includes('text') ? 'text' : 'image_generate',
    protocolContractId: contract.protocolContractId.value, contractRevision: contract.contractRevision.value,
    contractDefinitionDigest: contract.definitionDigest.value, registryRevision: contract.registryRevision.value,
    endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: 'endpoint:1',
      descriptors: [{ endpointId: 'endpoint:test', descriptorRevision: 'descriptor:1' }] } },
    fields: MODEL_CAPABILITY_SEMANTIC_PATHS_V2.map(path => ({ path, state: 'unknown', constraints: [], evidenceIds: ['test:unknown'],
      ...(path === 'reasoning.mode' && mode === 'unsupported' ? { state: 'unsupported', evidenceIds: ['test:unsupported'] } : {}),
      ...(path === 'reasoning.mode' && mode === 'required' ? { state: 'supported', evidenceIds,
        domain: { kind: 'enum', values: ['enabled'] }, defaultValue: 'enabled' } : {}),
      ...(path === 'providerExtension.thinkingBudget' && nativeBudget ? { state: 'supported', evidenceIds,
        domain: { kind: 'range', min: 0, max: 4096, integer: true } } : {}),
    })), evidence: [{ evidenceId: evidenceIds[0], kind: 'official_documentation', effect: 'supports',
      sourceRef: 'https://example.test/reasoning', verifiedAt: '2026-10-17T00:00:00.000Z', contentDigest: 'a'.repeat(64) },
      { evidenceId: 'test:unknown', kind: 'contract_invariant', effect: 'unknown', sourceRef: 'test:unknown',
        verifiedAt: '2026-10-17T00:00:00.000Z', contentDigest: 'b'.repeat(64) },
      { evidenceId: 'test:unsupported', kind: 'official_documentation', effect: 'rejects', sourceRef: 'https://example.test/unsupported',
        verifiedAt: '2026-10-17T00:00:00.000Z', contentDigest: 'c'.repeat(64) }],
    continuation: { kind: 'none', evidenceIds } })
}

describe.each(['generate_content', 'interactions'] as const)('Gemini %s resolved behavior', protocol => {
  const intent = (mode: 'enabled' | 'disabled') => decodeResolvedGenerationIntentV2({ schemaVersion: 2, generation: {},
    reasoning: { mode }, web: { mode: 'disabled' }, image: { mode: 'disabled' }, tools: { mode: 'disabled' },
    attachments: [], providerExtension: protocol === 'generate_content'
      ? { kind: 'gemini_generate_content', thinkingMode: 'default', includeThoughts: 'provider_default' }
      : { kind: 'gemini_interactions' } }).value
  it.each(['enabled', 'disabled'] as const)('does not claim a native default satisfies unknown %s behavior', mode => {
    const original = intent(mode)
    expect(() => executeGeminiReasoningRuleV2(original, capability(protocol, 'unknown'), protocol))
      .toThrow('GENERATION_V2_RULE_REQUIRED_PARAMETER_UNRESOLVED')
    expect(original.reasoning?.mode).toBe(mode)
  })
  it('preserves a documented required default and the saved off preference', () => {
    const original = intent('disabled')
    expect(executeGeminiReasoningRuleV2(original, capability(protocol, 'required'), protocol).reasoning).toEqual({ mode: 'enabled' })
    expect(original.reasoning?.mode).toBe('disabled')
  })
  it('records unsupported thinking as disabled on both protocol paths', () => {
    expect(executeGeminiReasoningRuleV2(intent('enabled'), capability(protocol, 'unsupported'), protocol).reasoning)
      .toEqual({ mode: 'disabled' })
  })
  if (protocol === 'generate_content') it('uses a documented native zero to satisfy off without guessing a default', () => {
    const result = executeGeminiReasoningRuleV2(intent('disabled'), capability(protocol, 'unknown', true), protocol)
    expect(result.reasoning).toEqual({ mode: 'disabled' })
    expect(result.providerExtension).toMatchObject({ thinkingMode: 'budget', thinkingBudget: 0 })
  })
})
