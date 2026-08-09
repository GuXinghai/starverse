import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import {
  isReviewedProviderContractDefinitionV2,
  listReviewedProviderContractDefinitionsV2,
  type ReviewedProviderContractDefinitionV2,
} from '../../contracts/providerContractRegistryV2'
import { GenerationV2Digest, GenerationV2Identity } from '../../domain/identityV2'

/**
 * The only V2 first-party OpenRouter endpoint profile. It deliberately owns
 * identity, provenance and the runtime-credential requirement only. Operation
 * implementations remain separate: selecting this profile never selects a
 * request codec, runner or decoder based on load or request shape.
 */
export type OpenRouterFirstPartyOperationV2 = 'chat_completions' | 'image_generate'

export const OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2 = 'openrouter-first-party-v1' as const

export type VerifiedOpenRouterFirstPartyEndpointProfileV2 = Readonly<{
  classification: 'verified_first_party_endpoint_profile'
  trust: 'verified_openrouter_first_party_endpoint_profile'
  usage: 'provider_binding_and_runtime_authorization'
  executionAuthority: 'runtime_credential_lease_required'
  providerId: GenerationV2Identity<'provider_id'>
  endpointProfileId: GenerationV2Identity<'endpoint_profile_id'>
  endpointSetRevision: GenerationV2Identity<'endpoint_set_revision'>
  credentialScope: Readonly<{
    credentialProviderId: 'openrouter'
    source: 'runtime_credential_lease'
  }>
  operations: Readonly<{
    chat_completions: Readonly<{
      operation: 'chat_completions'
      contract: ReviewedProviderContractDefinitionV2
      url: 'https://openrouter.ai/api/v1/chat/completions'
      modelsUrl: 'https://openrouter.ai/api/v1/models'
      descriptor: Readonly<{
        endpointId: GenerationV2Identity<'endpoint_id'>
        descriptorRevision: GenerationV2Identity<'descriptor_revision'>
        descriptorDigest: GenerationV2Digest<'descriptor_digest'>
      }>
    }>
    image_generate: Readonly<{
      operation: 'image_generate'
      contract: ReviewedProviderContractDefinitionV2
      url: 'https://openrouter.ai/api/v1/images'
    }>
  }>
}>

export class OpenRouterFirstPartyEndpointProfileV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENROUTER_FIRST_PARTY_PROFILE_CONTRACT_INVALID') {
    super(code)
    this.name = 'OpenRouterFirstPartyEndpointProfileV2Error'
  }
}

const authorities = new WeakSet<object>()

function requiredContract(protocolContractId: string, operation: 'text' | 'image_generate'):
  ReviewedProviderContractDefinitionV2 {
  const definition = listReviewedProviderContractDefinitionsV2().find((candidate) =>
    candidate.protocolContractId.value === protocolContractId,
  )
  if (!definition || !isReviewedProviderContractDefinitionV2(definition) ||
      definition.providerId.value !== 'openrouter' || !definition.operations.includes(operation)) {
    throw new OpenRouterFirstPartyEndpointProfileV2Error(
      'GENERATION_V2_OPENROUTER_FIRST_PARTY_PROFILE_CONTRACT_INVALID',
    )
  }
  return definition
}

function createProfile(): VerifiedOpenRouterFirstPartyEndpointProfileV2 {
  const chat = requiredContract('openrouter-chat-completions-v1', 'text')
  const images = requiredContract('openrouter-images-v1', 'image_generate')
  if (!('kind' in chat.apiSurface) || chat.apiSurface.kind !== 'openrouter_chat' || chat.apiSurface.apiOrigin !== 'https://openrouter.ai' ||
      chat.apiSurface.relativePathTemplate !== '/api/v1/chat/completions' ||
      !('kind' in images.apiSurface) || images.apiSurface.kind !== 'openrouter_images' || images.apiSurface.requestPath !== '/api/v1/images') {
    throw new OpenRouterFirstPartyEndpointProfileV2Error(
      'GENERATION_V2_OPENROUTER_FIRST_PARTY_PROFILE_CONTRACT_INVALID',
    )
  }
  const projection = Object.freeze({
    endpointProfileId: OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2,
    providerId: 'openrouter',
    credentialProviderId: 'openrouter',
    contracts: Object.freeze([
      Object.freeze({ id: chat.protocolContractId.value, revision: chat.contractRevision.value }),
      Object.freeze({ id: images.protocolContractId.value, revision: images.contractRevision.value }),
    ]),
  })
  const digest = createHash('sha256').update(stableSerializeProviderRequestV2(projection), 'utf8').digest('hex')
  const chatDescriptorProjection = Object.freeze({
    endpointProfileId: OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2,
    operation: 'chat_completions',
    requestUrl: 'https://openrouter.ai/api/v1/chat/completions',
    modelsUrl: 'https://openrouter.ai/api/v1/models',
    contractRevision: chat.contractRevision.value,
  })
  const chatDescriptorDigest = createHash('sha256')
    .update(stableSerializeProviderRequestV2(chatDescriptorProjection), 'utf8').digest('hex')
  const profile = Object.freeze({
    classification: 'verified_first_party_endpoint_profile' as const,
    trust: 'verified_openrouter_first_party_endpoint_profile' as const,
    usage: 'provider_binding_and_runtime_authorization' as const,
    executionAuthority: 'runtime_credential_lease_required' as const,
    providerId: GenerationV2Identity.create('provider_id', 'openrouter'),
    endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2),
    endpointSetRevision: GenerationV2Identity.create('endpoint_set_revision', `${OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2}:${digest}`),
    credentialScope: Object.freeze({
      credentialProviderId: 'openrouter' as const,
      source: 'runtime_credential_lease' as const,
    }),
    operations: Object.freeze({
      chat_completions: Object.freeze({
        operation: 'chat_completions' as const,
        contract: chat,
        url: 'https://openrouter.ai/api/v1/chat/completions' as const,
        modelsUrl: 'https://openrouter.ai/api/v1/models' as const,
        descriptor: Object.freeze({
          endpointId: GenerationV2Identity.create('endpoint_id', 'openrouter-first-party-chat-completions'),
          descriptorRevision: GenerationV2Identity.create(
            'descriptor_revision', `openrouter-first-party-chat-completions:${chatDescriptorDigest}`,
          ),
          descriptorDigest: GenerationV2Digest.create('descriptor_digest', chatDescriptorDigest),
        }),
      }),
      image_generate: Object.freeze({
        operation: 'image_generate' as const,
        contract: images,
        url: 'https://openrouter.ai/api/v1/images' as const,
      }),
    }),
  })
  authorities.add(profile)
  return profile
}

const profile = createProfile()

export function readVerifiedOpenRouterFirstPartyEndpointProfileV2(): VerifiedOpenRouterFirstPartyEndpointProfileV2 {
  return profile
}

export function isVerifiedOpenRouterFirstPartyEndpointProfileV2(
  value: unknown,
): value is VerifiedOpenRouterFirstPartyEndpointProfileV2 {
  return Boolean(value && typeof value === 'object' && authorities.has(value))
}

/** Explicit typed selection; callers cannot obtain a generic OpenRouter wire route. */
export function resolveOpenRouterFirstPartyOperationV2(
  endpointProfile: VerifiedOpenRouterFirstPartyEndpointProfileV2,
  operation: OpenRouterFirstPartyOperationV2,
): VerifiedOpenRouterFirstPartyEndpointProfileV2['operations'][OpenRouterFirstPartyOperationV2] {
  if (!isVerifiedOpenRouterFirstPartyEndpointProfileV2(endpointProfile)) {
    throw new OpenRouterFirstPartyEndpointProfileV2Error(
      'GENERATION_V2_OPENROUTER_FIRST_PARTY_PROFILE_CONTRACT_INVALID',
    )
  }
  return endpointProfile.operations[operation]
}

export function readOpenRouterFirstPartyProfileDigestV2(
  endpointProfile: VerifiedOpenRouterFirstPartyEndpointProfileV2,
): GenerationV2Digest<'endpoint_profile_digest'> {
  if (!isVerifiedOpenRouterFirstPartyEndpointProfileV2(endpointProfile)) {
    throw new OpenRouterFirstPartyEndpointProfileV2Error(
      'GENERATION_V2_OPENROUTER_FIRST_PARTY_PROFILE_CONTRACT_INVALID',
    )
  }
  const digest = endpointProfile.endpointSetRevision.value.split(':').at(-1)
  if (!digest || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new OpenRouterFirstPartyEndpointProfileV2Error(
      'GENERATION_V2_OPENROUTER_FIRST_PARTY_PROFILE_CONTRACT_INVALID',
    )
  }
  return GenerationV2Digest.create('endpoint_profile_digest', digest)
}
