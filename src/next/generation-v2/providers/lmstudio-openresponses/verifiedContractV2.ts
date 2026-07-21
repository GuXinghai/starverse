import { decodeProviderBindingRecordV2, type DecodedProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import type { LocalEndpointProfileV2 } from '../../../../../infra/db/repo/localEndpointProfileV2Repo'
import { readReviewedLmStudioOpenResponsesDefinitionV2 } from '../../contracts/providerContractRegistryV2'

export const LMSTUDIO_OPENRESPONSES_PROTOCOL_CONTRACT_ID_V2 = 'lmstudio-openresponses' as const
export const LMSTUDIO_OPENRESPONSES_COMPLIANCE_EVIDENCE_SHA256_V2 =
  'd553ebeca66c21fc10884fcc835a4a85d8aed972d47fe732275cc0fda79bdee6' as const

const definition = readReviewedLmStudioOpenResponsesDefinitionV2()
export const LMSTUDIO_OPENRESPONSES_CONTRACT_DEFINITION_DIGEST_V2 = definition.definitionDigest.value
export const LMSTUDIO_OPENRESPONSES_REGISTRY_REVISION_V2 = definition.registryRevision.value

export function readLmStudioOpenResponsesEndpointV2(profile: LocalEndpointProfileV2): string {
  if (profile.providerId !== 'lmstudio' || profile.protocolContractId !== LMSTUDIO_OPENRESPONSES_PROTOCOL_CONTRACT_ID_V2 ||
      profile.credentialMode !== 'none') throw new Error('GENERATION_V2_LMSTUDIO_PROFILE_CONTRACT_INVALID')
  return new URL('/v1/responses', `${profile.baseUrl}/`).toString()
}

export function createLmStudioOpenResponsesProviderBindingV2(
  profile: LocalEndpointProfileV2,
  modelId: string,
): DecodedProviderBindingRecordV2 {
  readLmStudioOpenResponsesEndpointV2(profile)
  return decodeProviderBindingRecordV2({ credentialScopeId: profile.credentialScopeId, providerId: 'lmstudio',
    endpointProfileId: profile.endpointProfileId,
    endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: profile.profileRevision,
      descriptors: [{ endpointId: profile.endpointProfileId, descriptorRevision: profile.profileRevision }] },
    protocolContractId: LMSTUDIO_OPENRESPONSES_PROTOCOL_CONTRACT_ID_V2,
    contractRevision: definition.contractRevision.value,
    contractDefinitionDigest: definition.definitionDigest.value,
    registryRevision: definition.registryRevision.value,
    modelId, operation: 'text' })
}
