import { describe, expect, it } from 'vitest'
import { decodeProviderBindingRecordV2 } from './providerBindingV2'

const digest = 'a'.repeat(64)
const contractDigest = 'b'.repeat(64)
const registryDigest = 'c'.repeat(64)

function base(endpointBinding: unknown, operation = 'image_generate') {
  return {
    credentialScopeId: 'scope-1', providerId: 'openrouter', endpointProfileId: 'first-party',
    endpointBinding, protocolContractId: 'openrouter-images-v1',
    contractRevision: `openrouter-images-v1:${contractDigest}`, contractDefinitionDigest: contractDigest,
    registryRevision: `provider-contract-registry-v1:${registryDigest}`,
    modelId: 'google/gemini-3.1-flash-image', operation,
  }
}

describe('ProviderBindingV2 codec', () => {
  it('binds OpenRouter Images to the exact selected tag and descriptor provenance', () => {
    const binding = decodeProviderBindingRecordV2(base({
      kind: 'pinned',
      selector: {
        kind: 'openrouter_images_v1', providerTag: 'google-ai-studio', providerSlug: 'google-ai-studio',
        descriptorRevision: 'rev-1', descriptorDigest: digest, selectedBy: 'user', selectedAt: '2026-07-14T09:00:00.000Z',
      },
    }))
    expect(binding.endpointBinding.kind).toBe('pinned')
    expect(binding.operation).toBe('image_generate')
    expect(binding.trust).toBe('decoded_unverified')
    expect(binding.contractDefinitionDigest.value).toBe(contractDigest)
    expect(binding.registryRevision.value).toBe(`provider-contract-registry-v1:${registryDigest}`)
    expect(Object.isFrozen(binding)).toBe(true)
    expect(Object.isFrozen(binding.endpointBinding)).toBe(true)
  })

  it('canonicalizes provider-managed sets without creating a selection', () => {
    const binding = decodeProviderBindingRecordV2({ ...base({
      kind: 'provider_managed_set', endpointSetRevision: 'set-1', descriptors: [
        { endpointId: 'zeta', descriptorRevision: 'r2' },
        { endpointId: 'alpha', descriptorRevision: 'r1' },
      ],
    }, 'text'), providerId: 'openai', protocolContractId: 'openai-responses-v1',
    contractRevision: `openai-responses-v1:${contractDigest}` })
    expect(binding.trust).toBe('decoded_unverified')
    expect(binding.endpointBinding.kind === 'provider_managed_set' &&
      binding.endpointBinding.descriptors.map((item) => item.endpointId.value)).toEqual(['alpha', 'zeta'])
  })

  it('rejects duplicate, empty, stale-shaped and invalid operation inputs', () => {
    expect(() => decodeProviderBindingRecordV2(base({
      kind: 'provider_managed_set', endpointSetRevision: 'set-1', descriptors: [
        { endpointId: 'same', descriptorRevision: 'r1' },
        { endpointId: 'same', descriptorRevision: 'r2' },
      ],
    }))).toThrow('GENERATION_V2_BINDING_DUPLICATE_DESCRIPTOR')
    expect(() => decodeProviderBindingRecordV2(base({ kind: 'provider_managed_set', endpointSetRevision: 'set-1', descriptors: [] })))
      .toThrow('GENERATION_V2_BINDING_INVALID_VALUE')
    expect(() => decodeProviderBindingRecordV2(base({ kind: 'pinned', selector: { kind: 'openrouter_images_v1', providerTag: 'x' } })))
      .toThrow()
    expect(() => decodeProviderBindingRecordV2({ ...base({
      kind: 'pinned', selector: {
        kind: 'openrouter_images_v1', providerTag: 'google', providerSlug: 'google', descriptorRevision: 'r',
        descriptorDigest: digest, selectedBy: 'user', selectedAt: '2026-07-14T09:00:00.000Z',
      },
    }), providerId: 'openai' })).toThrow('GENERATION_V2_BINDING_INVALID_VALUE')
    expect(() => decodeProviderBindingRecordV2(base({
      kind: 'pinned', selector: {
        kind: 'contract_selector', contractId: 'anything', selectorId: 'selector', descriptorRevision: 'r', descriptorDigest: digest,
      },
    }))).toThrow('GENERATION_V2_BINDING_INVALID_VALUE')
    expect(() => decodeProviderBindingRecordV2(base({ kind: 'provider_managed_set', endpointSetRevision: 'set-1', descriptors: [] }, 'unknown')))
      .toThrow('GENERATION_V2_BINDING_INVALID_VALUE')
  })

  it('rejects unknown, undefined, accessor and sparse-array structure without invoking getters', () => {
    expect(() => decodeProviderBindingRecordV2({ ...base({ kind: 'provider_managed_set', endpointSetRevision: 's', descriptors: [] }), apiKey: 'secret' }))
      .toThrow('GENERATION_V2_BINDING_UNKNOWN_FIELD')
    expect(() => decodeProviderBindingRecordV2({ ...base({ kind: 'provider_managed_set', endpointSetRevision: 's', descriptors: [] }), modelId: undefined }))
      .toThrow('GENERATION_V2_BINDING_INVALID_SHAPE')
    let calls = 0
    const selector = Object.defineProperty({ kind: 'pinned' }, 'selector', {
      enumerable: true, get: () => { calls += 1; return {} },
    })
    expect(() => decodeProviderBindingRecordV2(base(selector))).toThrow('GENERATION_V2_BINDING_INVALID_SHAPE')
    expect(calls).toBe(0)
    expect(() => decodeProviderBindingRecordV2(base({
      kind: 'provider_managed_set', endpointSetRevision: 'set-1', descriptors: new Array(1),
    }))).toThrow('GENERATION_V2_BINDING_INVALID_SHAPE')
  })

  it('rejects independently edited contract digests, revisions and registry revisions', () => {
    const managed = {
      kind: 'provider_managed_set', endpointSetRevision: 'set-1',
      descriptors: [{ endpointId: 'a', descriptorRevision: 'r' }],
    }
    const openAi = { ...base(managed, 'text'), providerId: 'openai', protocolContractId: 'openai-responses-v1' }
    expect(() => decodeProviderBindingRecordV2(openAi)).toThrow('GENERATION_V2_BINDING_INVALID_VALUE')
    expect(() => decodeProviderBindingRecordV2({
      ...openAi,
      contractRevision: `openai-responses-v1:${contractDigest}`,
      contractDefinitionDigest: 'A'.repeat(64),
    })).toThrow('GENERATION_V2_BINDING_INVALID_VALUE')
    expect(() => decodeProviderBindingRecordV2({
      ...openAi,
      contractRevision: `openai-responses-v1:${contractDigest}`,
      registryRevision: 'provider-contract-registry-v1:stale',
    })).toThrow('GENERATION_V2_BINDING_INVALID_VALUE')
  })

  it('requires OpenRouter image generation to use the exact pinned contract in both directions', () => {
    const managed = { kind: 'provider_managed_set', endpointSetRevision: 'set-1', descriptors: [{ endpointId: 'a', descriptorRevision: 'r' }] }
    expect(() => decodeProviderBindingRecordV2(base(managed))).toThrow('GENERATION_V2_BINDING_INVALID_VALUE')
    expect(() => decodeProviderBindingRecordV2({ ...base(managed, 'text'), protocolContractId: 'openrouter-images-v1' }))
      .toThrow('GENERATION_V2_BINDING_INVALID_VALUE')
  })
})
