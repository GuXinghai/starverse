import { describe, expect, it } from 'vitest'
import { decodeProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import { listReviewedProviderContractDefinitionsV2 } from '../../contracts/providerContractRegistryV2'
import { decodeCanonicalOpenRouterImageDescriptorSetV2 } from './canonicalDescriptorV2'
import {
  composeOpenRouterImageRuntimeCapabilityV2,
  OpenRouterImageRuntimeCapabilityV2Error,
} from './imageRuntimeCapabilityV2'

const contract = listReviewedProviderContractDefinitionsV2().find((definition) =>
  definition.protocolContractId.value === 'openrouter-images-v1',
)
if (!contract) throw new Error('OpenRouter Images reviewed contract missing')
const descriptor = decodeCanonicalOpenRouterImageDescriptorSetV2({
  id: 'google/gemini-3.1-flash-image',
  endpoints: [{
    provider_name: 'Google AI Studio', provider_tag: 'google-ai-studio', provider_slug: 'google-ai-studio',
    supports_streaming: true,
    supported_parameters: {
      n: { type: 'range', min: 1, max: 1 },
      size: { type: 'enum', values: ['1536x1024', '1024x1024'] },
      output_format: { type: 'enum', values: ['png', 'jpeg', 'provider-only-format'] },
    },
    allowed_passthrough_parameters: [],
  }],
}).descriptors[0]

function binding() {
  return decodeProviderBindingRecordV2({
    credentialScopeId: 'scope:openrouter', providerId: 'openrouter', endpointProfileId: 'openrouter-first-party-v1',
    endpointBinding: { kind: 'pinned', selector: {
      kind: 'openrouter_images_v1', providerTag: descriptor.providerTag.value, providerSlug: descriptor.providerSlug.value,
      descriptorRevision: descriptor.descriptorRevision.value, descriptorDigest: descriptor.descriptorDigest.value,
      selectedBy: 'user', selectedAt: '2026-07-18T00:00:00.000Z',
    } },
    protocolContractId: contract.protocolContractId.value, contractRevision: contract.contractRevision.value,
    contractDefinitionDigest: contract.definitionDigest.value, registryRevision: contract.registryRevision.value,
    modelId: 'google/gemini-3.1-flash-image', operation: 'image_generate',
  })
}

function bindingRaw(providerTag: string) {
  return {
    credentialScopeId: 'scope:openrouter', providerId: 'openrouter', endpointProfileId: 'openrouter-first-party-v1',
    endpointBinding: { kind: 'pinned', selector: {
      kind: 'openrouter_images_v1', providerTag, providerSlug: descriptor.providerSlug.value,
      descriptorRevision: descriptor.descriptorRevision.value, descriptorDigest: descriptor.descriptorDigest.value,
      selectedBy: 'user', selectedAt: '2026-07-18T00:00:00.000Z',
    } },
    protocolContractId: contract.protocolContractId.value, contractRevision: contract.contractRevision.value,
    contractDefinitionDigest: contract.definitionDigest.value, registryRevision: contract.registryRevision.value,
    modelId: 'google/gemini-3.1-flash-image', operation: 'image_generate',
  }
}

describe('OpenRouter selected image runtime capability V2', () => {
  it('persists only descriptor-backed expressible fields without widening discrete size or format values', () => {
    const snapshot = composeOpenRouterImageRuntimeCapabilityV2({
      binding: binding(), descriptor, resolvedAt: '2026-07-18T00:00:01.000Z',
    })
    expect(snapshot.fields.find((field) => field.path === 'image.size')?.domain).toEqual({
      kind: 'dimensions_enum', values: [{ width: 1024, height: 1024 }, { width: 1536, height: 1024 }],
    })
    expect(snapshot.fields.find((field) => field.path === 'image.format')?.domain).toEqual({
      kind: 'enum', values: ['jpeg', 'png'],
    })
    expect(snapshot.fields.find((field) => field.path === 'generation.candidateCount')?.domain).toEqual({
      kind: 'range', min: 1, max: 1, integer: true,
    })
  })

  it('rejects a binding that does not identify the selected descriptor', () => {
    const invalid = decodeProviderBindingRecordV2(bindingRaw('other'))
    expect(() => composeOpenRouterImageRuntimeCapabilityV2({
      binding: invalid, descriptor, resolvedAt: '2026-07-18T00:00:01.000Z',
    })).toThrow(OpenRouterImageRuntimeCapabilityV2Error)
  })
})
