import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import {
  isOpenAIResponsesApiContractV2,
  readOpenAIResponsesApiContractV2,
  resolveOpenAIResponsesApiEndpointV2,
} from '../../contracts/openAIResponsesApiContractV2'
import { GenerationV2Digest, GenerationV2Identity } from '../../domain/identityV2'

export type VerifiedOpenAIResponsesEndpointProfileV2 = Readonly<{
  classification: 'verified_first_party_endpoint_profile_non_executable'
  trust: 'verified_openai_responses_endpoint_profile'
  usage: 'provider_binding_snapshot_only'
  executionAuthority: 'none'
  providerId: GenerationV2Identity<'provider_id'>
  endpointProfileId: GenerationV2Identity<'endpoint_profile_id'>
  endpointSetRevision: GenerationV2Identity<'endpoint_set_revision'>
  descriptor: Readonly<{
    endpointId: GenerationV2Identity<'endpoint_id'>
    descriptorRevision: GenerationV2Identity<'descriptor_revision'>
    descriptorDigest: GenerationV2Digest<'descriptor_digest'>
    apiOrigin: 'https://api.openai.com'
    responsesPath: '/v1/responses'
    modelsPath: '/v1/models'
    filesPath: '/v1/files'
    automaticFallback: 'forbidden'
  }>
}>

export class OpenAIResponsesEndpointProfileV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_OPENAI_PROFILE_CONTRACT_INVALID') {
    super(code)
    this.name = 'OpenAIResponsesEndpointProfileV2Error'
  }
}

const authorities = new WeakSet<object>()

function createProfile(): VerifiedOpenAIResponsesEndpointProfileV2 {
  const contract = readOpenAIResponsesApiContractV2()
  const responses = resolveOpenAIResponsesApiEndpointV2(contract, {
    surfaceId: 'openai-responses-v1', operation: 'create_response',
  })
  const models = resolveOpenAIResponsesApiEndpointV2(contract, {
    surfaceId: 'openai-models-v1', operation: 'list_models',
  })
  const files = resolveOpenAIResponsesApiEndpointV2(contract, {
    surfaceId: 'openai-files-v1', operation: 'list_files',
  })
  if (!isOpenAIResponsesApiContractV2(contract) || responses.url !== 'https://api.openai.com/v1/responses' ||
      models.url !== 'https://api.openai.com/v1/models' || files.url !== 'https://api.openai.com/v1/files') {
    throw new OpenAIResponsesEndpointProfileV2Error('GENERATION_V2_OPENAI_PROFILE_CONTRACT_INVALID')
  }
  const projection = Object.freeze({
    providerId: contract.providerId,
    endpointProfileId: contract.contractFamilyId,
    apiOrigin: contract.apiOrigin,
    responsesPath: '/v1/responses',
    modelsPath: '/v1/models',
    filesPath: '/v1/files',
    automaticFallback: 'forbidden',
  })
  const digest = createHash('sha256').update(stableSerializeProviderRequestV2(projection), 'utf8').digest('hex')
  const profile = Object.freeze({
    classification: 'verified_first_party_endpoint_profile_non_executable' as const,
    trust: 'verified_openai_responses_endpoint_profile' as const,
    usage: 'provider_binding_snapshot_only' as const,
    executionAuthority: 'none' as const,
    providerId: GenerationV2Identity.create('provider_id', contract.providerId),
    endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', contract.contractFamilyId),
    endpointSetRevision: GenerationV2Identity.create('endpoint_set_revision', `openai-responses-endpoint-set-v1:${digest}`),
    descriptor: Object.freeze({
      endpointId: GenerationV2Identity.create('endpoint_id', contract.contractFamilyId),
      descriptorRevision: GenerationV2Identity.create('descriptor_revision', `openai-responses-profile-v1:${digest}`),
      descriptorDigest: GenerationV2Digest.create('descriptor_digest', digest),
      apiOrigin: contract.apiOrigin,
      responsesPath: '/v1/responses' as const,
      modelsPath: '/v1/models' as const,
      filesPath: '/v1/files' as const,
      automaticFallback: 'forbidden' as const,
    }),
  })
  authorities.add(profile)
  return profile
}

const profile = createProfile()

export function readVerifiedOpenAIResponsesEndpointProfileV2(): VerifiedOpenAIResponsesEndpointProfileV2 {
  return profile
}

export function isVerifiedOpenAIResponsesEndpointProfileV2(
  value: unknown,
): value is VerifiedOpenAIResponsesEndpointProfileV2 {
  return Boolean(value && typeof value === 'object' && authorities.has(value))
}
