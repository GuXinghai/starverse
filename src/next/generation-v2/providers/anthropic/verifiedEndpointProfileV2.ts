import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import {
  isAnthropicDeveloperApiContractV2,
  readAnthropicDeveloperApiContractV2,
  resolveAnthropicDeveloperApiEndpointV2,
  type AnthropicDeveloperApiContractV2,
  type AnthropicDeveloperApiSurfaceDefinitionV2,
} from '../../contracts/anthropicDeveloperApiContractV2'
import { GenerationV2Digest, GenerationV2Identity } from '../../domain/identityV2'

type MessagesSurface = Extract<AnthropicDeveloperApiSurfaceDefinitionV2, {
  surfaceId: 'anthropic-messages-2023-06-01'
}>
type ModelsSurface = Extract<AnthropicDeveloperApiSurfaceDefinitionV2, {
  surfaceId: 'anthropic-models-2023-06-01'
}>

export type VerifiedAnthropicEndpointProfileV2 = Readonly<{
  classification: 'verified_first_party_endpoint_profile_non_executable'
  trust: 'verified_anthropic_endpoint_profile'
  usage: 'provider_binding_snapshot_only'
  executionAuthority: 'none'
  providerId: GenerationV2Identity<'provider_id'>
  endpointProfileId: GenerationV2Identity<'endpoint_profile_id'>
  endpointSetRevision: GenerationV2Identity<'endpoint_set_revision'>
  descriptor: Readonly<{
    endpointId: GenerationV2Identity<'endpoint_id'>
    descriptorRevision: GenerationV2Identity<'descriptor_revision'>
    descriptorDigest: GenerationV2Digest<'descriptor_digest'>
    apiOrigin: AnthropicDeveloperApiContractV2['apiOrigin']
    messagesPath: MessagesSurface['relativePathTemplate']
    modelsPath: Extract<ModelsSurface['endpointOperations'][number], { operation: 'list_models' }>['relativePathTemplate']
    apiVersionHeader: AnthropicDeveloperApiContractV2['apiVersionHeader']
    betaSurfaceAutomaticUse: 'forbidden'
    automaticFallback: 'forbidden'
  }>
}>

export class AnthropicEndpointProfileV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_ANTHROPIC_PROFILE_CONTRACT_INVALID') {
    super(code)
    this.name = 'AnthropicEndpointProfileV2Error'
  }
}

const authorities = new WeakSet<object>()

function createProfile(): VerifiedAnthropicEndpointProfileV2 {
  const contract = readAnthropicDeveloperApiContractV2()
  const messages = resolveAnthropicDeveloperApiEndpointV2(contract, {
    surfaceId: 'anthropic-messages-2023-06-01', operation: 'create_message',
  })
  const models = resolveAnthropicDeveloperApiEndpointV2(contract, {
    surfaceId: 'anthropic-models-2023-06-01', operation: 'list_models',
  })
  if (!isAnthropicDeveloperApiContractV2(contract) ||
      messages.surface.surfaceId !== 'anthropic-messages-2023-06-01' ||
      models.surface.surfaceId !== 'anthropic-models-2023-06-01') {
    throw new AnthropicEndpointProfileV2Error('GENERATION_V2_ANTHROPIC_PROFILE_CONTRACT_INVALID')
  }
  const messagesPath = messages.surface.relativePathTemplate
  const modelsOperation = models.surface.endpointOperations.find((entry) => entry.operation === 'list_models')
  if (!modelsOperation || messages.url !== `${contract.apiOrigin}${messagesPath}` ||
      models.url !== `${contract.apiOrigin}${modelsOperation.relativePathTemplate}`) {
    throw new AnthropicEndpointProfileV2Error('GENERATION_V2_ANTHROPIC_PROFILE_CONTRACT_INVALID')
  }
  const projection = Object.freeze({
    providerId: contract.providerId,
    endpointProfileId: contract.contractFamilyId,
    apiOrigin: contract.apiOrigin,
    messagesPath,
    modelsPath: modelsOperation.relativePathTemplate,
    apiVersionHeader: contract.apiVersionHeader,
    betaSurfaceAutomaticUse: 'forbidden',
    automaticFallback: 'forbidden',
  })
  const digest = createHash('sha256')
    .update(stableSerializeProviderRequestV2(projection), 'utf8')
    .digest('hex')
  const profile = Object.freeze({
    classification: 'verified_first_party_endpoint_profile_non_executable' as const,
    trust: 'verified_anthropic_endpoint_profile' as const,
    usage: 'provider_binding_snapshot_only' as const,
    executionAuthority: 'none' as const,
    providerId: GenerationV2Identity.create('provider_id', contract.providerId),
    endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', contract.contractFamilyId),
    endpointSetRevision: GenerationV2Identity.create(
      'endpoint_set_revision', `anthropic-endpoint-set-v1:${digest}`,
    ),
    descriptor: Object.freeze({
      endpointId: GenerationV2Identity.create('endpoint_id', contract.contractFamilyId),
      descriptorRevision: GenerationV2Identity.create(
        'descriptor_revision', `anthropic-profile-v1:${digest}`,
      ),
      descriptorDigest: GenerationV2Digest.create('descriptor_digest', digest),
      apiOrigin: contract.apiOrigin,
      messagesPath,
      modelsPath: modelsOperation.relativePathTemplate,
      apiVersionHeader: contract.apiVersionHeader,
      betaSurfaceAutomaticUse: 'forbidden' as const,
      automaticFallback: 'forbidden' as const,
    }),
  })
  authorities.add(profile)
  return profile
}

const profile = createProfile()

export function readVerifiedAnthropicEndpointProfileV2(): VerifiedAnthropicEndpointProfileV2 {
  return profile
}

export function isVerifiedAnthropicEndpointProfileV2(
  value: unknown,
): value is VerifiedAnthropicEndpointProfileV2 {
  return Boolean(value && typeof value === 'object' && authorities.has(value))
}
