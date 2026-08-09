import {
  isReviewedProviderContractDefinitionV2,
  listReviewedProviderContractDefinitionsV2,
} from '../../contracts/providerContractRegistryV2'
import { decodeProviderBindingRecordV2, type DecodedProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import { OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2 } from '../openrouter/verifiedFirstPartyEndpointProfileV2'
import type { CanonicalOpenRouterImageDescriptorV2 } from './canonicalDescriptorV2'

export class OpenRouterImageProviderBindingV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENROUTER_IMAGE_BINDING_ISSUE_INVALID') {
    super(code)
    this.name = 'OpenRouterImageProviderBindingV2Error'
  }
}

/**
 * The single issuer for V2 Images bindings. The selected descriptor is an
 * input fact; contract/profile identity is never accepted from callers.
 */
export function issueOpenRouterImageProviderBindingV2(input: Readonly<{
  credentialScopeId: string
  modelId: string
  descriptor: CanonicalOpenRouterImageDescriptorV2
  selectedBy: 'user' | 'sole_eligible'
  selectedAt: string
}>): DecodedProviderBindingRecordV2 {
  const definition = listReviewedProviderContractDefinitionsV2().find((candidate) =>
    candidate.protocolContractId.value === 'openrouter-images-v1',
  )
  if (!definition || !isReviewedProviderContractDefinitionV2(definition) ||
      definition.providerId.value !== 'openrouter' || !definition.operations.includes('image_generate') ||
      !('kind' in definition.apiSurface) || definition.apiSurface.kind !== 'openrouter_images' || definition.apiSurface.requestPath !== '/api/v1/images') {
    throw new OpenRouterImageProviderBindingV2Error('GENERATION_V2_OPENROUTER_IMAGE_BINDING_ISSUE_INVALID')
  }
  try {
    return decodeProviderBindingRecordV2({
      credentialScopeId: input.credentialScopeId,
      providerId: 'openrouter',
      endpointProfileId: OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2,
      endpointBinding: { kind: 'pinned', selector: {
        kind: 'openrouter_images_v1',
        providerTag: input.descriptor.providerTag.value,
        providerSlug: input.descriptor.providerSlug.value,
        descriptorRevision: input.descriptor.descriptorRevision.value,
        descriptorDigest: input.descriptor.descriptorDigest.value,
        selectedBy: input.selectedBy,
        selectedAt: input.selectedAt,
      } },
      protocolContractId: definition.protocolContractId.value,
      contractRevision: definition.contractRevision.value,
      contractDefinitionDigest: definition.definitionDigest.value,
      registryRevision: definition.registryRevision.value,
      modelId: input.modelId,
      operation: 'image_generate',
    })
  } catch (error) {
    if (error instanceof OpenRouterImageProviderBindingV2Error) throw error
    throw new OpenRouterImageProviderBindingV2Error('GENERATION_V2_OPENROUTER_IMAGE_BINDING_ISSUE_INVALID')
  }
}
