import { createHash } from 'node:crypto'
import { stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import { GenerationV2Digest, GenerationV2Identity } from '../domain/identityV2'
import type { AnthropicMessagesRegistrySurfaceV2 } from './anthropicDeveloperApiContractV2'
import {
  readAnthropicDeveloperApiContractV2,
  readAnthropicMessagesRegistrySurfaceV2,
} from './anthropicDeveloperApiContractV2'
import type { DeepSeekStableChatRegistrySurfaceV2 } from './deepSeekStableApiContractV2'
import {
  readDeepSeekStableApiContractV2,
  readDeepSeekStableChatRegistrySurfaceV2,
} from './deepSeekStableApiContractV2'
import type {
  GeminiDeveloperApiRegistrySurfaceV2,
  GeminiDeveloperApiSurfaceDefinitionV2,
} from './geminiDeveloperApiContractV2'
import {
  readGeminiDeveloperApiContractV2,
  readGeminiDeveloperApiRegistrySurfaceV2,
} from './geminiDeveloperApiContractV2'

export type ProviderContractOperationV2 = 'text' | 'image_generate' | 'image_edit' | 'tool_continue'

export type ProviderContractApiSurfaceV2 = Readonly<
  | {
    kind: 'openrouter_images'
    apiVersion: 'v1'
    requestPath: '/api/v1/images'
  }
  | AnthropicMessagesRegistrySurfaceV2
  | GeminiDeveloperApiRegistrySurfaceV2
  | DeepSeekStableChatRegistrySurfaceV2
>

type ModelBindingPolicyV2 = 'descriptor_model_id' | 'runtime_capability_resolver'
type EndpointBindingPolicyV2 = 'exact_descriptor_pin' | 'first_party_profile_authority_required'
type ContinuationPolicyV2 =
  | 'none'
  | 'ordered_native_content_blocks_with_signatures'
  | GeminiDeveloperApiSurfaceDefinitionV2['continuationFamily']
  | DeepSeekStableChatRegistrySurfaceV2['continuationFamily']

export type ReviewedProviderContractDefinitionV2 = Readonly<{
  classification: 'reviewed_definition'
  executionAuthority: 'none'
  registrySchemaVersion: 1
  registryRevision: GenerationV2Identity<'registry_revision'>
  protocolContractId: GenerationV2Identity<'protocol_contract_id'>
  contractRevision: GenerationV2Identity<'contract_revision'>
  definitionDigest: GenerationV2Digest<'contract_digest'>
  providerId: GenerationV2Identity<'provider_id'>
  operations: readonly ProviderContractOperationV2[]
  apiSurface: ProviderContractApiSurfaceV2
  modelBindingPolicy: ModelBindingPolicyV2
  endpointBindingPolicy: EndpointBindingPolicyV2
  continuationPolicy: ContinuationPolicyV2
  implementationStatus: 'definition_only'
  evidence: Readonly<{
    verifiedAt: string
    openApiSha256: string | null
    provenanceUrls: readonly string[]
    localArtifacts: readonly Readonly<{
      id: string
      path: string
      sha256: string
    }>[]
  }>
}>

export class ProviderContractRegistryV2Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_CONTRACT_LOOKUP_INVALID'
    | 'GENERATION_V2_CONTRACT_UNKNOWN'
    | 'GENERATION_V2_CONTRACT_REGISTRY_INVALID') {
    super(code)
    this.name = 'ProviderContractRegistryV2Error'
  }
}

type DefinitionProjection = Readonly<{
  protocolContractId: string
  providerId: string
  operations: readonly ProviderContractOperationV2[]
  apiSurface: ProviderContractApiSurfaceV2
  modelBindingPolicy: ModelBindingPolicyV2
  endpointBindingPolicy: EndpointBindingPolicyV2
  continuationPolicy: ContinuationPolicyV2
  implementationStatus: 'definition_only'
  evidence: Readonly<{
    verifiedAt: string
    openApiSha256: string | null
    provenanceUrls: readonly string[]
    localArtifacts: readonly Readonly<{
      id: string
      path: string
      sha256: string
    }>[]
  }>
}>

const OPENROUTER_IMAGES_PROJECTION: DefinitionProjection = Object.freeze({
  protocolContractId: 'openrouter-images-v1',
  providerId: 'openrouter',
  operations: Object.freeze(['image_generate'] as const),
  apiSurface: Object.freeze({
    kind: 'openrouter_images',
    apiVersion: 'v1',
    requestPath: '/api/v1/images',
  }),
  modelBindingPolicy: 'descriptor_model_id',
  endpointBindingPolicy: 'exact_descriptor_pin',
  continuationPolicy: 'none',
  implementationStatus: 'definition_only',
  evidence: Object.freeze({
    verifiedAt: '2026-07-14',
    openApiSha256: 'abaf90acc89dc3a2b4cd8824afcbf87734c8d0a5f4429ea85dca0d9eb02e353b',
    provenanceUrls: Object.freeze([
      'https://openrouter.ai/docs/guides/overview/multimodal/image-generation',
      'https://openrouter.ai/docs/guides/routing/provider-selection',
    ]),
    localArtifacts: Object.freeze([Object.freeze({
      id: 'openrouter-images-provider-only-smoke-20260714',
      path: 'docs/architecture/generation-compiler-v2/evidence/openrouter-images-provider-only-smoke-20260714.json',
      sha256: '31002268f86ba7e08fe5af0622ce346e129f40c1900bd62b173a58b97ec4709f',
    })]),
  }),
})

const geminiDeveloperApiContract = readGeminiDeveloperApiContractV2()
const geminiEvidenceArtifact = Object.freeze({
  id: 'gemini-developer-api-contract-20260715',
  path: 'docs/architecture/generation-compiler-v2/evidence/gemini-developer-api-contract-20260715.json',
  sha256: '8fc121063a6591c2e624b779f4793c16dcd0b69c625b152a652f8d034c7cecac',
})
const geminiGenerateContentEvidence = Object.freeze({
  verifiedAt: geminiDeveloperApiContract.evidence.verifiedAt,
  openApiSha256: null,
  provenanceUrls: Object.freeze([
    'https://ai.google.dev/api/generate-content',
    'https://ai.google.dev/gemini-api/docs/api-versions',
  ]),
  localArtifacts: Object.freeze([geminiEvidenceArtifact]),
})
const geminiInteractionsEvidence = Object.freeze({
  verifiedAt: geminiDeveloperApiContract.evidence.verifiedAt,
  openApiSha256: geminiDeveloperApiContract.evidence.interactionsOpenApiSha256,
  provenanceUrls: Object.freeze([
    'https://ai.google.dev/api/interactions-api',
    'https://ai.google.dev/static/api/interactions.openapi.json',
    'https://ai.google.dev/gemini-api/docs/api-versions',
  ]),
  localArtifacts: Object.freeze([geminiEvidenceArtifact]),
})

const GEMINI_GENERATE_CONTENT_PROJECTION: DefinitionProjection = Object.freeze({
  protocolContractId: 'gemini-generate-content-v1beta',
  providerId: geminiDeveloperApiContract.providerId,
  operations: Object.freeze(['text', 'tool_continue'] as const),
  apiSurface: readGeminiDeveloperApiRegistrySurfaceV2('gemini-generate-content-v1beta'),
  modelBindingPolicy: 'runtime_capability_resolver',
  endpointBindingPolicy: 'first_party_profile_authority_required',
  continuationPolicy: readGeminiDeveloperApiRegistrySurfaceV2('gemini-generate-content-v1beta').continuationFamily,
  implementationStatus: 'definition_only',
  evidence: geminiGenerateContentEvidence,
})

const GEMINI_INTERACTIONS_PROJECTION: DefinitionProjection = Object.freeze({
  protocolContractId: 'gemini-interactions-v1beta',
  providerId: geminiDeveloperApiContract.providerId,
  operations: Object.freeze(['image_generate'] as const),
  apiSurface: readGeminiDeveloperApiRegistrySurfaceV2('gemini-interactions-v1beta'),
  modelBindingPolicy: 'runtime_capability_resolver',
  endpointBindingPolicy: 'first_party_profile_authority_required',
  continuationPolicy: readGeminiDeveloperApiRegistrySurfaceV2('gemini-interactions-v1beta').continuationFamily,
  implementationStatus: 'definition_only',
  evidence: geminiInteractionsEvidence,
})

const anthropicDeveloperApiContract = readAnthropicDeveloperApiContractV2()
const anthropicMessagesSurface = readAnthropicMessagesRegistrySurfaceV2()
const ANTHROPIC_MESSAGES_PROJECTION: DefinitionProjection = Object.freeze({
  protocolContractId: 'anthropic-messages-2023-06-01',
  providerId: anthropicDeveloperApiContract.providerId,
  operations: Object.freeze(['text', 'tool_continue'] as const),
  apiSurface: anthropicMessagesSurface,
  modelBindingPolicy: 'runtime_capability_resolver',
  endpointBindingPolicy: 'first_party_profile_authority_required',
  continuationPolicy: anthropicMessagesSurface.continuationFamily,
  implementationStatus: 'definition_only',
  evidence: Object.freeze({
    verifiedAt: anthropicDeveloperApiContract.evidence.verifiedAt,
    openApiSha256: null,
    provenanceUrls: anthropicDeveloperApiContract.evidence.provenanceUrls,
    localArtifacts: Object.freeze([Object.freeze({
      id: 'anthropic-developer-api-contract-20260715',
      path: 'docs/architecture/generation-compiler-v2/evidence/anthropic-developer-api-contract-20260715.json',
      sha256: '9ff68f8cfd7a7a500ccac5f889f8f6cc5125577a0e550f9839e155ea5bdb5111',
    })]),
  }),
})

const deepSeekStableApiContract = readDeepSeekStableApiContractV2()
const deepSeekStableChatSurface = readDeepSeekStableChatRegistrySurfaceV2()
const DEEPSEEK_STABLE_CHAT_PROJECTION: DefinitionProjection = Object.freeze({
  protocolContractId: 'deepseek-stable-chat-v1',
  providerId: deepSeekStableApiContract.providerId,
  operations: Object.freeze(['text', 'tool_continue'] as const),
  apiSurface: deepSeekStableChatSurface,
  modelBindingPolicy: 'runtime_capability_resolver',
  endpointBindingPolicy: 'first_party_profile_authority_required',
  continuationPolicy: deepSeekStableChatSurface.continuationFamily,
  implementationStatus: 'definition_only',
  evidence: Object.freeze({
    verifiedAt: deepSeekStableApiContract.evidence.verifiedAt,
    openApiSha256: null,
    provenanceUrls: deepSeekStableApiContract.evidence.provenanceUrls,
    localArtifacts: Object.freeze([Object.freeze({
      id: 'deepseek-stable-api-contract-20260715',
      path: 'docs/architecture/generation-compiler-v2/evidence/deepseek-stable-api-contract-20260715.json',
      sha256: '0022edabf76e51ce88fc6d45310ad889b8a84fd037c72c287944449ba8a42cc7',
    })]),
  }),
})

function digest(value: unknown): string {
  return createHash('sha256').update(stableSerializeProviderRequestV2(value), 'utf8').digest('hex')
}

const definitionProjections = Object.freeze([
  OPENROUTER_IMAGES_PROJECTION,
  GEMINI_GENERATE_CONTENT_PROJECTION,
  GEMINI_INTERACTIONS_PROJECTION,
  ANTHROPIC_MESSAGES_PROJECTION,
  DEEPSEEK_STABLE_CHAT_PROJECTION,
])
const registryRevisionValue = `provider-contract-registry-v1:${digest(definitionProjections)}`
const registryRevision = GenerationV2Identity.create('registry_revision', registryRevisionValue)
const reviewedDefinitions = new WeakSet<object>()

function createDefinition(projection: DefinitionProjection): ReviewedProviderContractDefinitionV2 {
  const definitionDigestValue = digest(projection)
  const definition: ReviewedProviderContractDefinitionV2 = Object.freeze({
    classification: 'reviewed_definition',
    executionAuthority: 'none',
    registrySchemaVersion: 1,
    registryRevision,
    protocolContractId: GenerationV2Identity.create('protocol_contract_id', projection.protocolContractId),
    contractRevision: GenerationV2Identity.create(
      'contract_revision',
      `${projection.protocolContractId}:${definitionDigestValue}`,
    ),
    definitionDigest: GenerationV2Digest.create('contract_digest', definitionDigestValue),
    providerId: GenerationV2Identity.create('provider_id', projection.providerId),
    operations: projection.operations,
    apiSurface: projection.apiSurface,
    modelBindingPolicy: projection.modelBindingPolicy,
    endpointBindingPolicy: projection.endpointBindingPolicy,
    continuationPolicy: projection.continuationPolicy,
    implementationStatus: projection.implementationStatus,
    evidence: projection.evidence,
  })
  reviewedDefinitions.add(definition)
  return definition
}

const definitions = Object.freeze(definitionProjections.map(createDefinition))
const definitionsByKey = new Map(definitions.map((definition) => [
  `${definition.protocolContractId.value}\0${definition.contractRevision.value}`,
  definition,
]))

if (definitionsByKey.size !== definitions.length) {
  throw new ProviderContractRegistryV2Error('GENERATION_V2_CONTRACT_REGISTRY_INVALID')
}

function decodeLookup(value: unknown): Readonly<{ protocolContractId: string; contractRevision: string }> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new ProviderContractRegistryV2Error('GENERATION_V2_CONTRACT_LOOKUP_INVALID')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  const expected = ['protocolContractId', 'contractRevision']
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.keys(descriptors).sort().join('\0') !== expected.sort().join('\0') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor)) ||
      typeof descriptors.protocolContractId.value !== 'string' || typeof descriptors.contractRevision.value !== 'string') {
    throw new ProviderContractRegistryV2Error('GENERATION_V2_CONTRACT_LOOKUP_INVALID')
  }
  return Object.freeze({
    protocolContractId: descriptors.protocolContractId.value,
    contractRevision: descriptors.contractRevision.value,
  })
}

export function lookupReviewedProviderContractDefinitionV2(value: unknown): ReviewedProviderContractDefinitionV2 {
  const lookup = decodeLookup(value)
  const definition = definitionsByKey.get(`${lookup.protocolContractId}\0${lookup.contractRevision}`)
  if (!definition) throw new ProviderContractRegistryV2Error('GENERATION_V2_CONTRACT_UNKNOWN')
  return definition
}

export function listReviewedProviderContractDefinitionsV2(): readonly ReviewedProviderContractDefinitionV2[] {
  return definitions
}

export function isReviewedProviderContractDefinitionV2(value: unknown): value is ReviewedProviderContractDefinitionV2 {
  return Boolean(value && typeof value === 'object' && reviewedDefinitions.has(value))
}

export function readProviderContractRegistryRevisionV2(): GenerationV2Identity<'registry_revision'> {
  return registryRevision
}
