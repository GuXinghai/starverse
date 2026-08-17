import type { LocalEndpointProfileV2 } from '../../../../../infra/db/repo/localEndpointProfileV2Repo'
import { decodeProviderBindingRecordV2, type DecodedProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import { readReviewedGenericLocalOpenAIChatDefinitionV2 } from '../../contracts/providerContractRegistryV2'

export const GENERIC_LOCAL_OPENAI_CHAT_PROTOCOL_V2 = 'generic-local-openai-chat-completions' as const
const definition = readReviewedGenericLocalOpenAIChatDefinitionV2()
export const GENERIC_LOCAL_OPENAI_CHAT_CONTRACT_DIGEST_V2 = definition.definitionDigest.value

export function readGenericLocalOpenAIChatEndpointV2(profile: LocalEndpointProfileV2): string {
  if (profile.providerId !== 'generic_local' || profile.protocolContractId !== GENERIC_LOCAL_OPENAI_CHAT_PROTOCOL_V2 || profile.credentialMode !== 'none') {
    throw new Error('GENERATION_V2_GENERIC_LOCAL_PROFILE_CONTRACT_INVALID')
  }
  return new URL('/v1/chat/completions', `${profile.baseUrl}/`).toString()
}
export function createGenericLocalOpenAIChatProviderBindingV2(profile: LocalEndpointProfileV2, modelId: string): DecodedProviderBindingRecordV2 {
  readGenericLocalOpenAIChatEndpointV2(profile)
  if (profile.protocolConfig.modelId !== modelId) {
    throw new Error('GENERATION_V2_GENERIC_LOCAL_PROFILE_MODEL_MISMATCH')
  }
  return decodeProviderBindingRecordV2({ credentialScopeId: profile.credentialScopeId, providerId: 'generic_local',
    endpointProfileId: profile.endpointProfileId, endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: profile.profileRevision,
      descriptors: [{ endpointId: profile.endpointProfileId, descriptorRevision: profile.profileRevision }] },
    protocolContractId: GENERIC_LOCAL_OPENAI_CHAT_PROTOCOL_V2,
    contractRevision: definition.contractRevision.value,
    contractDefinitionDigest: definition.definitionDigest.value, registryRevision: definition.registryRevision.value,
    modelId, operation: 'text' })
}
