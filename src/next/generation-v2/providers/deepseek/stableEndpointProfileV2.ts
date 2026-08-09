import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import {
  isDeepSeekStableApiContractV2,
  readDeepSeekStableApiContractV2,
  resolveDeepSeekStableApiEndpointV2,
  type DeepSeekStableApiContractV2,
  type DeepSeekStableApiSurfaceDefinitionV2,
} from '../../contracts/deepSeekStableApiContractV2'
import { GenerationV2Digest, GenerationV2Identity } from '../../domain/identityV2'

type ChatSurface = Extract<DeepSeekStableApiSurfaceDefinitionV2, { surfaceId: 'deepseek-stable-chat-v1' }>
type ModelsSurface = Extract<DeepSeekStableApiSurfaceDefinitionV2, { surfaceId: 'deepseek-stable-models-v1' }>

export type VerifiedDeepSeekStableEndpointProfileV2 = Readonly<{
  classification: 'verified_first_party_endpoint_profile_non_executable'
  trust: 'verified_deepseek_stable_endpoint_profile'
  usage: 'provider_binding_snapshot_only'
  executionAuthority: 'none'
  providerId: GenerationV2Identity<'provider_id'>
  endpointProfileId: GenerationV2Identity<'endpoint_profile_id'>
  endpointSetRevision: GenerationV2Identity<'endpoint_set_revision'>
  descriptor: Readonly<{
    endpointId: GenerationV2Identity<'endpoint_id'>
    descriptorRevision: GenerationV2Identity<'descriptor_revision'>
    descriptorDigest: GenerationV2Digest<'descriptor_digest'>
    apiOrigin: DeepSeekStableApiContractV2['apiOrigin']
    chatPath: ChatSurface['relativePathTemplate']
    modelsPath: ModelsSurface['relativePathTemplate']
    stableMayUseV1Suffix: false
    stableMayUseBetaOrigin: false
    automaticFallback: 'forbidden'
  }>
}>

export class DeepSeekStableEndpointProfileV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_DEEPSEEK_STABLE_PROFILE_CONTRACT_INVALID') {
    super(code)
    this.name = 'DeepSeekStableEndpointProfileV2Error'
  }
}

const profileAuthorities = new WeakSet<object>()

function digest(value: unknown): string {
  return createHash('sha256').update(stableSerializeProviderRequestV2(value), 'utf8').digest('hex')
}

function createProfile(): VerifiedDeepSeekStableEndpointProfileV2 {
  const contract = readDeepSeekStableApiContractV2()
  const chat = resolveDeepSeekStableApiEndpointV2(contract, { surfaceId: 'deepseek-stable-chat-v1' })
  const models = resolveDeepSeekStableApiEndpointV2(contract, { surfaceId: 'deepseek-stable-models-v1' })
  if (!isDeepSeekStableApiContractV2(contract) ||
      chat.surface.surfaceId !== 'deepseek-stable-chat-v1' ||
      models.surface.surfaceId !== 'deepseek-stable-models-v1' ||
      contract.betaPolicy.stableMayUseBetaOrigin !== false || contract.betaPolicy.automaticSwitch !== 'forbidden') {
    throw new DeepSeekStableEndpointProfileV2Error('GENERATION_V2_DEEPSEEK_STABLE_PROFILE_CONTRACT_INVALID')
  }
  const projection = Object.freeze({
    providerId: contract.providerId,
    endpointProfileId: contract.contractFamilyId,
    endpointId: contract.contractFamilyId,
    apiOrigin: contract.apiOrigin,
    chatPath: chat.surface.relativePathTemplate,
    modelsPath: models.surface.relativePathTemplate,
    stableMayUseV1Suffix: false,
    stableMayUseBetaOrigin: contract.betaPolicy.stableMayUseBetaOrigin,
    automaticFallback: 'forbidden',
  })
  const descriptorDigest = digest(projection)
  const descriptor = Object.freeze({
    endpointId: GenerationV2Identity.create('endpoint_id', contract.contractFamilyId),
    descriptorRevision: GenerationV2Identity.create(
      'descriptor_revision', `deepseek-stable-profile-v1:${descriptorDigest}`,
    ),
    descriptorDigest: GenerationV2Digest.create('descriptor_digest', descriptorDigest),
    apiOrigin: contract.apiOrigin,
    chatPath: chat.surface.relativePathTemplate,
    modelsPath: models.surface.relativePathTemplate,
    stableMayUseV1Suffix: false as const,
    stableMayUseBetaOrigin: false as const,
    automaticFallback: 'forbidden' as const,
  })
  const profile = Object.freeze({
    classification: 'verified_first_party_endpoint_profile_non_executable' as const,
    trust: 'verified_deepseek_stable_endpoint_profile' as const,
    usage: 'provider_binding_snapshot_only' as const,
    executionAuthority: 'none' as const,
    providerId: GenerationV2Identity.create('provider_id', contract.providerId),
    endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', contract.contractFamilyId),
    endpointSetRevision: GenerationV2Identity.create(
      'endpoint_set_revision', `deepseek-stable-endpoint-set-v1:${descriptorDigest}`,
    ),
    descriptor,
  })
  profileAuthorities.add(profile)
  return profile
}

const profile = createProfile()

export function readVerifiedDeepSeekStableEndpointProfileV2(): VerifiedDeepSeekStableEndpointProfileV2 {
  return profile
}

export function isVerifiedDeepSeekStableEndpointProfileV2(
  value: unknown,
): value is VerifiedDeepSeekStableEndpointProfileV2 {
  return Boolean(value && typeof value === 'object' && profileAuthorities.has(value))
}
