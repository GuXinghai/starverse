import { describe, expect, it } from 'vitest'
import { decodeProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import { listReviewedProviderContractDefinitionsV2 } from '../../contracts/providerContractRegistryV2'
import { decodeCanonicalOpenRouterImageDescriptorSetV2 } from './canonicalDescriptorV2'
import { compileOpenRouterImageRequestV1 } from './imageRequestV1'

const definition = listReviewedProviderContractDefinitionsV2()
  .find((item) => item.protocolContractId.value === 'openrouter-images-v1')!

function descriptorSet() {
  return decodeCanonicalOpenRouterImageDescriptorSetV2({
    id: 'google/gemini-3.1-flash-image',
    endpoints: [{
      provider_name: 'Google AI Studio', provider_tag: 'google-ai-studio', provider_slug: 'google-ai-studio',
      supported_parameters: {
        n: { type: 'range', min: 1, max: 1 },
        resolution: { type: 'enum', values: ['512', '1K'] },
        aspect_ratio: { type: 'enum', values: ['1:1'] },
        input_references: { type: 'range', min: 0, max: 2 },
      },
      allowed_passthrough_parameters: ['cachedContent'],
      supports_streaming: false,
    }],
  })
}

function binding(set = descriptorSet()) {
  const descriptor = set.descriptors[0]
  return decodeProviderBindingRecordV2({
    credentialScopeId: 'scope:openrouter', providerId: 'openrouter', endpointProfileId: 'openrouter-images-v1',
    endpointBinding: { kind: 'pinned', selector: {
      kind: 'openrouter_images_v1', providerTag: descriptor.providerTag.value,
      providerSlug: descriptor.providerSlug.value, descriptorRevision: descriptor.descriptorRevision.value,
      descriptorDigest: descriptor.descriptorDigest.value, selectedBy: 'user', selectedAt: '2026-07-18T00:00:00.000Z',
    } },
    protocolContractId: definition.protocolContractId.value, contractRevision: definition.contractRevision.value,
    contractDefinitionDigest: definition.definitionDigest.value, registryRevision: definition.registryRevision.value,
    modelId: set.modelId.value, operation: 'image_generate',
  })
}

function intent(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 2,
    generation: { candidateCount: 1 },
    image: { mode: 'generate', resolution: '512', aspectRatio: '1:1' },
    ...overrides,
  }
}

describe('OpenRouter Images V1 exact request compiler', () => {
  it('uses the persisted selected descriptor only and emits the documented exact pin', () => {
    const set = descriptorSet()
    const request = compileOpenRouterImageRequestV1({
      prompt: 'A single red apple centered on a plain white background.', intent: intent(),
      modelId: set.modelId.value, providerTag: 'google-ai-studio', providerSlug: 'google-ai-studio', descriptorSet: set,
    })
    expect(request.preparedBody.copyUtf8Text()).toBe(
      '{"aspect_ratio":"1:1","model":"google/gemini-3.1-flash-image","n":1,"prompt":"A single red apple centered on a plain white background.","provider":{"allow_fallbacks":false,"only":["google-ai-studio"]},"resolution":"512"}',
    )
    expect(request.preparedBody.copyUtf8Text()).not.toContain('provider_tag')
  })

  it('puts only allowlisted provider options under the selected provider slug and preserves image references', () => {
    const set = descriptorSet()
    const request = compileOpenRouterImageRequestV1({
      prompt: 'edit',
      intent: intent({
        attachments: [{
          kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64), include: true,
          sendAs: 'image_reference', conversion: 'none',
        }],
      }),
      modelId: set.modelId.value, providerTag: 'google-ai-studio', providerSlug: 'google-ai-studio', descriptorSet: set,
      inputReferences: ['https://example.test/reference.png'],
      providerOptions: { cachedContent: 'cache-key' },
    })
    expect(JSON.parse(request.preparedBody.copyUtf8Text())).toMatchObject({
      input_references: [{ type: 'image_url', image_url: { url: 'https://example.test/reference.png' } }],
      provider: {
        only: ['google-ai-studio'], allow_fallbacks: false,
        options: { 'google-ai-studio': { cachedContent: 'cache-key' } },
      },
    })
  })

  it('rejects descriptor capability mismatch, unsupported options and unrepresentable references before bytes exist', () => {
    const set = descriptorSet()
    const selected = binding(set)
    const changed = decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'google/gemini-3.1-flash-image', endpoints: [{
        provider_name: 'Google AI Studio', provider_tag: 'google-ai-studio', provider_slug: 'google-ai-studio',
        supported_parameters: { n: { type: 'range', min: 1, max: 1 } },
        allowed_passthrough_parameters: [], supports_streaming: false,
      }],
    })
    expect(() => compileOpenRouterImageRequestV1({
      prompt: 'x', intent: intent(), modelId: selected.modelId.value,
      providerTag: selected.endpointBinding.kind === 'pinned' ? selected.endpointBinding.selector.providerTag.value : '',
      providerSlug: selected.endpointBinding.kind === 'pinned' ? selected.endpointBinding.selector.providerSlug.value : '', descriptorSet: changed,
    }))
      .toThrow('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_CAPABILITY_MISMATCH')
    expect(() => compileOpenRouterImageRequestV1({
      prompt: 'x', intent: intent(), modelId: selected.modelId.value, providerTag: 'google-ai-studio',
      providerSlug: 'google-ai-studio', descriptorSet: set, providerOptions: { unknown: true },
    })).toThrow('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_OPTION_UNSUPPORTED')
    expect(() => compileOpenRouterImageRequestV1({
      prompt: 'x', intent: intent({ attachments: [{
        kind: 'managed_file', assetId: 'asset:1', assetRevisionId: 'revision:1', assetSha256: 'a'.repeat(64), include: true,
        sendAs: 'image_reference', conversion: 'none',
      }]}), modelId: selected.modelId.value, providerTag: 'google-ai-studio', providerSlug: 'google-ai-studio',
      descriptorSet: set, inputReferences: ['data:image/png;base64,AAAA'],
    })).toThrow('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_REFERENCE_INVALID')
  })

  it('rejects n greater than one before a request exists until multi-image wire association is defined', () => {
    const set = decodeCanonicalOpenRouterImageDescriptorSetV2({
      id: 'google/gemini-3.1-flash-image', endpoints: [{
        provider_name: 'Google AI Studio', provider_tag: 'google-ai-studio', provider_slug: 'google-ai-studio',
        supported_parameters: {
          n: { type: 'range', min: 1, max: 2 },
          resolution: { type: 'enum', values: ['512'] },
          aspect_ratio: { type: 'enum', values: ['1:1'] },
        },
        allowed_passthrough_parameters: [], supports_streaming: false,
      }],
    })
    expect(() => compileOpenRouterImageRequestV1({
      prompt: 'two images', intent: intent({ generation: { candidateCount: 2 } }),
      modelId: set.modelId.value, providerTag: 'google-ai-studio', providerSlug: 'google-ai-studio', descriptorSet: set,
    })).toThrow('GENERATION_V2_OPENROUTER_IMAGE_REQUEST_RESULT_CARDINALITY_UNSUPPORTED')
  })
})
