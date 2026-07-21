import type { LocalEndpointProfileV2 } from '../../../../../infra/db/repo/localEndpointProfileV2Repo'
import { decodeProviderBindingRecordV2, type DecodedProviderBindingRecordV2 } from '../../domain/providerBindingV2'
import { readReviewedOllamaChatDefinitionV2 } from '../../contracts/providerContractRegistryV2'
export const OLLAMA_CHAT_PROTOCOL_V2 = 'ollama-chat-v1' as const
const definition = readReviewedOllamaChatDefinitionV2()
export const OLLAMA_CHAT_CONTRACT_DIGEST_V2 = definition.definitionDigest.value
export function readOllamaChatEndpointV2(profile: LocalEndpointProfileV2): string {
  if (profile.providerId !== 'ollama' || profile.protocolContractId !== OLLAMA_CHAT_PROTOCOL_V2 || profile.credentialMode !== 'none') throw new Error('GENERATION_V2_OLLAMA_PROFILE_CONTRACT_INVALID')
  return new URL('/api/chat', `${profile.baseUrl}/`).toString()
}
export function readOllamaThinkingControlV2(profile: LocalEndpointProfileV2): 'boolean'|'effort' {
  readOllamaChatEndpointV2(profile); const value = profile.protocolConfig.thinkingControl
  if (value !== 'boolean' && value !== 'effort') throw new Error('GENERATION_V2_OLLAMA_PROFILE_CONTRACT_INVALID'); return value
}
export function createOllamaChatProviderBindingV2(profile: LocalEndpointProfileV2, modelId: string): DecodedProviderBindingRecordV2 {
  readOllamaThinkingControlV2(profile)
  if (profile.protocolConfig.modelId !== modelId) throw new Error('GENERATION_V2_OLLAMA_PROFILE_MODEL_MISMATCH')
  return decodeProviderBindingRecordV2({ credentialScopeId: profile.credentialScopeId, providerId: 'ollama', endpointProfileId: profile.endpointProfileId,
    endpointBinding: { kind: 'provider_managed_set', endpointSetRevision: profile.profileRevision,
      descriptors: [{ endpointId: profile.endpointProfileId, descriptorRevision: profile.profileRevision }] }, protocolContractId: OLLAMA_CHAT_PROTOCOL_V2,
    contractRevision: definition.contractRevision.value, contractDefinitionDigest: definition.definitionDigest.value,
    registryRevision: definition.registryRevision.value, modelId, operation: 'text' })
}
