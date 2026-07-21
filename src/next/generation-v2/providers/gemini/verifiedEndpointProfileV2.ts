import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import {
  isGeminiDeveloperApiContractV2,
  readGeminiDeveloperApiContractV2,
  resolveGeminiDeveloperApiEndpointV2,
} from '../../contracts/geminiDeveloperApiContractV2'
import { GenerationV2Digest, GenerationV2Identity } from '../../domain/identityV2'

export type VerifiedGeminiDeveloperApiEndpointProfileV2 = Readonly<{
  classification: 'verified_first_party_endpoint_profile_non_executable'
  trust: 'verified_gemini_developer_api_endpoint_profile'
  usage: 'provider_binding_snapshot_only'
  executionAuthority: 'none'
  providerId: GenerationV2Identity<'provider_id'>
  endpointProfileId: GenerationV2Identity<'endpoint_profile_id'>
  endpointSetRevision: GenerationV2Identity<'endpoint_set_revision'>
  apiOrigin: 'https://generativelanguage.googleapis.com'
  apiVersion: 'v1beta'
  authHeaderName: 'x-goog-api-key'
  descriptors: Readonly<{
    models: Readonly<{
      endpointId: GenerationV2Identity<'endpoint_id'>
      descriptorRevision: GenerationV2Identity<'descriptor_revision'>
      descriptorDigest: GenerationV2Digest<'descriptor_digest'>
      surfaceId: 'gemini-models-v1beta'
      protocolContractId: 'gemini-models-v1beta'
      endpoint: string
    }>
    generateContent: Readonly<{
      endpointId: GenerationV2Identity<'endpoint_id'>
      descriptorRevision: GenerationV2Identity<'descriptor_revision'>
      descriptorDigest: GenerationV2Digest<'descriptor_digest'>
      surfaceId: 'gemini-generate-content-v1beta'
      protocolContractId: 'gemini-generate-content-v1beta'
    }>
    interactions: Readonly<{
      endpointId: GenerationV2Identity<'endpoint_id'>
      descriptorRevision: GenerationV2Identity<'descriptor_revision'>
      descriptorDigest: GenerationV2Digest<'descriptor_digest'>
      surfaceId: 'gemini-interactions-v1beta'
      protocolContractId: 'gemini-interactions-v1beta'
    }>
  }>
  automaticFallback: 'forbidden'
}>

export class GeminiDeveloperApiEndpointProfileV2Error extends Error {
  constructor(readonly code: 'GENERATION_V2_GEMINI_PROFILE_CONTRACT_INVALID') {
    super(code)
    this.name = 'GeminiDeveloperApiEndpointProfileV2Error'
  }
}

const authorities = new WeakSet<object>()
export const GEMINI_DEVELOPER_API_ENDPOINT_PROFILE_ID_V2 = 'gemini-developer-api-v1beta'

function descriptor<const T extends 'gemini-generate-content-v1beta' | 'gemini-interactions-v1beta' | 'gemini-models-v1beta'>(surfaceId: T) {
  const projection = Object.freeze({
    surfaceId,
    apiOrigin: 'https://generativelanguage.googleapis.com',
    apiVersion: 'v1beta',
    authHeaderName: 'x-goog-api-key',
    automaticFallback: 'forbidden',
  })
  const digest = createHash('sha256').update(stableSerializeProviderRequestV2(projection), 'utf8').digest('hex')
  return Object.freeze({
    endpointId: GenerationV2Identity.create('endpoint_id', surfaceId),
    descriptorRevision: GenerationV2Identity.create('descriptor_revision', `${surfaceId}:${digest}`),
    descriptorDigest: GenerationV2Digest.create('descriptor_digest', digest),
    surfaceId,
    protocolContractId: surfaceId,
  })
}

function createProfile(): VerifiedGeminiDeveloperApiEndpointProfileV2 {
  const contract = readGeminiDeveloperApiContractV2()
  const generateContent = resolveGeminiDeveloperApiEndpointV2(contract, {
    surfaceId: 'gemini-generate-content-v1beta', modelId: 'profile-validation-model',
  })
  const interactions = resolveGeminiDeveloperApiEndpointV2(contract, {
    surfaceId: 'gemini-interactions-v1beta',
  })
  const models = resolveGeminiDeveloperApiEndpointV2(contract, {
    surfaceId: 'gemini-models-v1beta',
  })
  if (!isGeminiDeveloperApiContractV2(contract) || contract.apiVersion !== 'v1beta' ||
      !generateContent.url.startsWith(`${contract.apiOrigin}/v1beta/models/`) ||
      interactions.url !== `${contract.apiOrigin}/v1beta/interactions` ||
      models.url !== `${contract.apiOrigin}/v1beta/models`) {
    throw new GeminiDeveloperApiEndpointProfileV2Error('GENERATION_V2_GEMINI_PROFILE_CONTRACT_INVALID')
  }
  const generateDescriptor = descriptor('gemini-generate-content-v1beta')
  const interactionsDescriptor = descriptor('gemini-interactions-v1beta')
  const modelsDescriptor = Object.freeze({
    ...descriptor('gemini-models-v1beta'),
    endpoint: models.url,
  })
  const setDigest = createHash('sha256').update(stableSerializeProviderRequestV2({
    generateContent: generateDescriptor.descriptorDigest.value,
    interactions: interactionsDescriptor.descriptorDigest.value,
    models: modelsDescriptor.descriptorDigest.value,
  }), 'utf8').digest('hex')
  const profile = Object.freeze({
    classification: 'verified_first_party_endpoint_profile_non_executable' as const,
    trust: 'verified_gemini_developer_api_endpoint_profile' as const,
    usage: 'provider_binding_snapshot_only' as const,
    executionAuthority: 'none' as const,
    providerId: GenerationV2Identity.create('provider_id', 'google_ai_studio'),
    endpointProfileId: GenerationV2Identity.create('endpoint_profile_id', GEMINI_DEVELOPER_API_ENDPOINT_PROFILE_ID_V2),
    endpointSetRevision: GenerationV2Identity.create('endpoint_set_revision', `gemini-v1beta:${setDigest}`),
    apiOrigin: contract.apiOrigin,
    apiVersion: contract.apiVersion,
    authHeaderName: contract.auth.name,
    descriptors: Object.freeze({ models: modelsDescriptor, generateContent: generateDescriptor, interactions: interactionsDescriptor }),
    automaticFallback: 'forbidden' as const,
  })
  authorities.add(profile)
  return profile
}

const profile = createProfile()

export function readVerifiedGeminiDeveloperApiEndpointProfileV2(): VerifiedGeminiDeveloperApiEndpointProfileV2 {
  return profile
}

export function isVerifiedGeminiDeveloperApiEndpointProfileV2(
  value: unknown,
): value is VerifiedGeminiDeveloperApiEndpointProfileV2 {
  return Boolean(value && typeof value === 'object' && authorities.has(value))
}
