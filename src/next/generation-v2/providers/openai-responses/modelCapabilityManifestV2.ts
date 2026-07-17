import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../../compiler/stableSerialize'
import {
  isReviewedProviderContractDefinitionV2,
  readReviewedOpenAIResponsesDefinitionV2,
} from '../../contracts/providerContractRegistryV2'
import { GenerationV2Digest, GenerationV2Identity } from '../../domain/identityV2'
import {
  isDecodedOpenAIResponsesModelsEvidenceV2,
  type DecodedOpenAIResponsesModelsEvidenceV2,
} from './modelsEvidenceV2'
import {
  isVerifiedOpenAIResponsesEndpointProfileV2,
  readVerifiedOpenAIResponsesEndpointProfileV2,
} from './verifiedEndpointProfileV2'

const CAPABILITY_ARTIFACT_ID = 'openai-responses-gpt-5.6-capabilities-20260717' as const
const CAPABILITY_ARTIFACT_SHA256 = '41071866d51384c2b70ce2b429dcab65106e97c6b43c0252b93292c4855d2e83' as const
const REASONING_EFFORTS = Object.freeze(['none', 'low', 'medium', 'high', 'xhigh', 'max'] as const)

type ExactCapability = Readonly<{
  family: 'gpt-5.6-sol' | 'gpt-5.6-terra' | 'gpt-5.6-luna'
  reasoningEfforts: typeof REASONING_EFFORTS
  maxOutputTokens: 128000
  inputModalities: readonly ['text', 'image']
  outputModalities: readonly ['text']
  streaming: true
  functionCalling: true
  structuredOutputs: true
  webSearchTool: true
  imageGenerationTool: true
}>

const exactCapabilities = new Map<string, ExactCapability>()
function register(modelIds: readonly string[], family: ExactCapability['family']): void {
  const capability = Object.freeze({
    family,
    reasoningEfforts: REASONING_EFFORTS,
    maxOutputTokens: 128000 as const,
    inputModalities: Object.freeze(['text', 'image'] as const),
    outputModalities: Object.freeze(['text'] as const),
    streaming: true as const,
    functionCalling: true as const,
    structuredOutputs: true as const,
    webSearchTool: true as const,
    imageGenerationTool: true as const,
  })
  for (const modelId of modelIds) exactCapabilities.set(modelId, capability)
}
register(['gpt-5.6', 'gpt-5.6-sol'], 'gpt-5.6-sol')
register(['gpt-5.6-terra'], 'gpt-5.6-terra')
register(['gpt-5.6-luna'], 'gpt-5.6-luna')

export type ResolvedOpenAIResponsesModelCapabilityV2 = Readonly<{
  trust: 'verified_openai_exact_model_capability_policy'
  usage: 'runtime_capability_resolution_input_only'
  executionAuthority: 'none'
  providerId: GenerationV2Identity<'provider_id'>
  endpointProfileId: GenerationV2Identity<'endpoint_profile_id'>
  modelId: GenerationV2Identity<'model_id'>
  modelsEvidenceRevision: string
  capabilityEvidenceId: typeof CAPABILITY_ARTIFACT_ID
  capabilityEvidenceDigest: GenerationV2Digest<'evidence_digest'>
  capability: ExactCapability
  capabilityRevision: string
}>

export class OpenAIResponsesModelCapabilityV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENAI_MODEL_CAPABILITY_INPUT_INVALID'
    | 'GENERATION_V2_OPENAI_MODEL_NOT_VISIBLE'
    | 'GENERATION_V2_OPENAI_MODEL_CAPABILITY_UNAVAILABLE') {
    super(code)
    this.name = 'OpenAIResponsesModelCapabilityV2Error'
  }
}

const authorities = new WeakSet<object>()

export function isResolvedOpenAIResponsesModelCapabilityV2(
  value: unknown,
): value is ResolvedOpenAIResponsesModelCapabilityV2 {
  return Boolean(value && typeof value === 'object' && authorities.has(value))
}

export function resolveOpenAIResponsesModelCapabilityV2(input: Readonly<{
  modelEvidence: DecodedOpenAIResponsesModelsEvidenceV2
  modelId: string
}>): ResolvedOpenAIResponsesModelCapabilityV2 {
  const profile = readVerifiedOpenAIResponsesEndpointProfileV2()
  const definition = readReviewedOpenAIResponsesDefinitionV2()
  if (!isDecodedOpenAIResponsesModelsEvidenceV2(input.modelEvidence) ||
      !isVerifiedOpenAIResponsesEndpointProfileV2(profile) ||
      !isReviewedProviderContractDefinitionV2(definition) ||
      definition.providerId.value !== profile.providerId.value ||
      definition.protocolContractId.value !== 'openai-responses-v1' ||
      typeof input.modelId !== 'string' || input.modelId.trim() !== input.modelId || input.modelId.length === 0) {
    throw new OpenAIResponsesModelCapabilityV2Error('GENERATION_V2_OPENAI_MODEL_CAPABILITY_INPUT_INVALID')
  }
  if (!input.modelEvidence.models.some((model) => model.modelId.value === input.modelId)) {
    throw new OpenAIResponsesModelCapabilityV2Error('GENERATION_V2_OPENAI_MODEL_NOT_VISIBLE')
  }
  const capability = exactCapabilities.get(input.modelId)
  if (!capability) {
    throw new OpenAIResponsesModelCapabilityV2Error('GENERATION_V2_OPENAI_MODEL_CAPABILITY_UNAVAILABLE')
  }
  const projection = Object.freeze({
    providerId: profile.providerId.value,
    endpointProfileId: profile.endpointProfileId.value,
    modelId: input.modelId,
    modelsEvidenceRevision: input.modelEvidence.responseRevision,
    capabilityEvidenceId: CAPABILITY_ARTIFACT_ID,
    capabilityEvidenceDigest: CAPABILITY_ARTIFACT_SHA256,
    capability,
  })
  const digest = createHash('sha256').update(stableSerializeProviderRequestV2(projection), 'utf8').digest('hex')
  const resolved = Object.freeze({
    trust: 'verified_openai_exact_model_capability_policy' as const,
    usage: 'runtime_capability_resolution_input_only' as const,
    executionAuthority: 'none' as const,
    providerId: profile.providerId,
    endpointProfileId: profile.endpointProfileId,
    modelId: GenerationV2Identity.create('model_id', input.modelId),
    modelsEvidenceRevision: input.modelEvidence.responseRevision,
    capabilityEvidenceId: CAPABILITY_ARTIFACT_ID,
    capabilityEvidenceDigest: GenerationV2Digest.create('evidence_digest', CAPABILITY_ARTIFACT_SHA256),
    capability,
    capabilityRevision: `openai-responses-exact-model-capability-v1:${digest}`,
  })
  authorities.add(resolved)
  return resolved
}
