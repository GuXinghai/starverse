import { describe, expect, it } from 'vitest'
import {
  isVerifiedProviderContractReferenceV2,
  verifyProviderContractReferenceV2,
} from './providerContractReferenceAuthorityV2'
import {
  listReviewedProviderContractDefinitionsV2,
  type ReviewedProviderContractDefinitionV2,
} from './providerContractRegistryV2'

const descriptorDigest = 'd'.repeat(64)

function record(
  definition: ReviewedProviderContractDefinitionV2,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const isOpenRouterImages = definition.protocolContractId.value === 'openrouter-images-v1'
  return {
    credentialScopeId: 'credential-scope:unverified',
    providerId: definition.providerId.value,
    endpointProfileId: 'profile:unverified',
    endpointBinding: isOpenRouterImages
      ? {
          kind: 'pinned',
          selector: {
            kind: 'openrouter_images_v1',
            providerTag: 'google-ai-studio',
            providerSlug: 'google-ai-studio',
            descriptorRevision: 'descriptor:unverified',
            descriptorDigest,
            selectedBy: 'user',
            selectedAt: '2026-07-15T00:00:00.000Z',
          },
        }
      : {
          kind: 'provider_managed_set',
          endpointSetRevision: 'endpoint-set:unverified',
          descriptors: [{ endpointId: 'endpoint:unverified', descriptorRevision: 'descriptor:unverified' }],
        },
    protocolContractId: definition.protocolContractId.value,
    contractRevision: definition.contractRevision.value,
    contractDefinitionDigest: definition.definitionDigest.value,
    registryRevision: definition.registryRevision.value,
    modelId: 'model:unverified',
    operation: definition.operations[0],
    ...overrides,
  }
}

describe('Verified provider contract reference V2', () => {
  it('verifies only the reviewed contract subset for every current definition', () => {
    for (const definition of listReviewedProviderContractDefinitionsV2()) {
      const reference = verifyProviderContractReferenceV2(record(definition))
      expect(isVerifiedProviderContractReferenceV2(reference)).toBe(true)
      expect(reference).toMatchObject({
        classification: 'verified_provider_contract_reference_non_executable',
        trust: 'verified_provider_contract_reference',
        usage: 'snapshot_contract_provenance_only',
        executionAuthority: 'none',
        operation: definition.operations[0],
      })
      expect(reference.providerId).toBe(definition.providerId)
      expect(reference.protocolContractId).toBe(definition.protocolContractId)
      expect(reference.contractRevision).toBe(definition.contractRevision)
      expect(reference.contractDefinitionDigest).toBe(definition.definitionDigest)
      expect(reference.registryRevision).toBe(definition.registryRevision)
      expect(reference.reviewedDefinition).toBe(definition)
      expect(reference.reviewedDefinition.implementationStatus).toBe('definition_only')
      expect(reference.reviewedDefinition.executionAuthority).toBe('none')
      expect(Object.isFrozen(reference)).toBe(true)
    }
  })

  it('does not carry unverified credential, profile, model, endpoint or capability facts', () => {
    const definition = listReviewedProviderContractDefinitionsV2()[0]
    const reference = verifyProviderContractReferenceV2(record(definition))
    for (const key of [
      'credentialScopeId', 'endpointProfileId', 'modelId', 'endpointBinding',
      'capabilityRevision', 'evidenceDigest', 'semanticFieldsDigest',
    ]) {
      expect(reference, key).not.toHaveProperty(key)
    }
    expect(JSON.stringify(reference)).not.toContain('unverified')
  })

  it('rejects provider, operation and registry mismatches without selecting a fallback contract', () => {
    const definition = listReviewedProviderContractDefinitionsV2()
      .find((item) => item.protocolContractId.value === 'deepseek-stable-chat-v1')!
    expect(() => verifyProviderContractReferenceV2(record(definition, { providerId: 'openai_responses' })))
      .toThrow('GENERATION_V2_CONTRACT_REFERENCE_MISMATCH')
    expect(() => verifyProviderContractReferenceV2(record(definition, { operation: 'image_generate' })))
      .toThrow('GENERATION_V2_CONTRACT_REFERENCE_MISMATCH')
    expect(() => verifyProviderContractReferenceV2(record(definition, {
      registryRevision: `provider-contract-registry-v1:${'f'.repeat(64)}`,
    }))).toThrow('GENERATION_V2_CONTRACT_REFERENCE_MISMATCH')
  })

  it('limits OpenRouter Chat references to reviewed text and tool continuation operations', () => {
    const definition = listReviewedProviderContractDefinitionsV2()
      .find((item) => item.protocolContractId.value === 'openrouter-chat-completions-v1')!
    for (const operation of ['text', 'tool_continue'] as const) {
      expect(verifyProviderContractReferenceV2(record(definition, { operation })).operation)
        .toBe(operation)
    }
    expect(() => verifyProviderContractReferenceV2(record(definition, { operation: 'image_generate' })))
      .toThrow('GENERATION_V2_BINDING_INVALID_VALUE')
    expect(() => verifyProviderContractReferenceV2(record(definition, { operation: 'image_edit' })))
      .toThrow('GENERATION_V2_CONTRACT_REFERENCE_MISMATCH')
  })

  it('rejects unknown/stale contract revisions and definition digests', () => {
    const definition = listReviewedProviderContractDefinitionsV2()
      .find((item) => item.protocolContractId.value === 'deepseek-stable-chat-v1')!
    const staleDigest = 'e'.repeat(64)
    expect(() => verifyProviderContractReferenceV2(record(definition, {
      contractDefinitionDigest: staleDigest,
      contractRevision: `${definition.protocolContractId.value}:${staleDigest}`,
    }))).toThrow('GENERATION_V2_CONTRACT_UNKNOWN')
    expect(() => verifyProviderContractReferenceV2(record(definition, {
      protocolContractId: 'unknown-contract-v1',
      contractDefinitionDigest: staleDigest,
      contractRevision: `unknown-contract-v1:${staleDigest}`,
    }))).toThrow('GENERATION_V2_CONTRACT_UNKNOWN')
  })

  it('strictly decodes the untrusted binding and does not trust structural reference clones', () => {
    const definition = listReviewedProviderContractDefinitionsV2()[0]
    expect(() => verifyProviderContractReferenceV2({ ...record(definition), apiKey: 'secret' }))
      .toThrow('GENERATION_V2_BINDING_UNKNOWN_FIELD')
    let reads = 0
    const accessor = Object.defineProperty(record(definition), 'providerId', {
      enumerable: true,
      get: () => { reads += 1; return definition.providerId.value },
    })
    expect(() => verifyProviderContractReferenceV2(accessor))
      .toThrow('GENERATION_V2_BINDING_INVALID_SHAPE')
    expect(reads).toBe(0)
    const reference = verifyProviderContractReferenceV2(record(definition))
    expect(isVerifiedProviderContractReferenceV2({ ...reference })).toBe(false)
    expect(isVerifiedProviderContractReferenceV2(structuredClone(reference))).toBe(false)
  })
})
