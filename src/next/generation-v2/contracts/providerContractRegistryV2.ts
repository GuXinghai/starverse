import { sha256Hex } from '../../../shared/crypto/sha256Hex'
import { stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import { GenerationV2Digest, GenerationV2Identity } from '../domain/identityV2'
import {
  createGenerationExecutionProviderIdentityV2,
  type GenerationExecutionProviderId,
  type GenerationExecutionProviderIdentityV2,
} from '../domain/generationExecutionProviderId'
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
import type { OpenRouterChatRegistrySurfaceV2 } from './openRouterChatApiContractV2'
import {
  readOpenRouterChatApiContractV2,
  readOpenRouterChatRegistrySurfaceV2,
} from './openRouterChatApiContractV2'
import type { OpenAIResponsesApiSurfaceDefinitionV2 } from './openAIResponsesApiContractV2'
import { readOpenAIResponsesApiContractV2 } from './openAIResponsesApiContractV2'
import type { ContractEvidenceStabilityV2 } from './contractEvidenceV2'

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
  | OpenRouterChatRegistrySurfaceV2
  | Extract<OpenAIResponsesApiSurfaceDefinitionV2, { surfaceId: 'openai-responses-v1' }>
  | {
    kind: 'generic_local_openai_chat_completions'
    requestPath: '/v1/chat/completions'
  }
  | {
    kind: 'ollama_native_chat'
    requestPath: '/api/chat'
  }
  | {
    kind: 'lmstudio_openresponses'
    requestPath: '/v1/responses'
  }
  | {
    kind: 'openai_chat_compatible'
    requestPath: '/v1/chat/completions'
    modelsPath: '/v1/models'
    responseProtocols: readonly ['sse', 'json']
  }
>

type ModelBindingPolicyV2 = 'descriptor_model_id' | 'runtime_capability_resolver' | 'explicit_local_profile'
type EndpointBindingPolicyV2 = 'exact_descriptor_pin' | 'first_party_profile_authority_required' | 'explicit_local_profile'
type ContinuationPolicyV2 =
  | 'none'
  | 'ordered_native_content_blocks_with_signatures'
  | Extract<GeminiDeveloperApiSurfaceDefinitionV2, { continuationFamily: string }>['continuationFamily']
  | DeepSeekStableChatRegistrySurfaceV2['continuationFamily']
  | OpenRouterChatRegistrySurfaceV2['continuationFamily']
  | Extract<OpenAIResponsesApiSurfaceDefinitionV2, { surfaceId: 'openai-responses-v1' }>['continuationPolicy']
  | 'complete_ordered_messages'
type ContextProjectionPolicyV2 = 'complete_turn_client_managed_replay' | 'unsupported'

function readGeminiContinuationFamily(
  surface: GeminiDeveloperApiRegistrySurfaceV2,
): Extract<GeminiDeveloperApiRegistrySurfaceV2, { continuationFamily: string }>['continuationFamily'] {
  if (!('continuationFamily' in surface)) throw new Error('GENERATION_V2_GEMINI_CONTINUATION_SURFACE_INVALID')
  return surface.continuationFamily
}

export type ReviewedProviderContractDefinitionV2 = Readonly<{
  classification: 'reviewed_definition'
  executionAuthority: 'none'
  registrySchemaVersion: 1
  registryRevision: GenerationV2Identity<'registry_revision'>
  protocolContractId: GenerationV2Identity<'protocol_contract_id'>
  contractRevision: GenerationV2Identity<'contract_revision'>
  definitionDigest: GenerationV2Digest<'contract_digest'>
  providerId: GenerationExecutionProviderIdentityV2
  operations: readonly ProviderContractOperationV2[]
  apiSurface: ProviderContractApiSurfaceV2
  modelBindingPolicy: ModelBindingPolicyV2
  endpointBindingPolicy: EndpointBindingPolicyV2
  continuationPolicy: ContinuationPolicyV2
  contextProjectionPolicy: ContextProjectionPolicyV2
  implementationStatus: 'definition_only'
  evidence: Readonly<{
    verifiedAt: string
    reviewAfter: string
    stability: ContractEvidenceStabilityV2
    sources: readonly Readonly<{ url: string; retrievedAt: string; digest: string }>[]
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
  providerId: GenerationExecutionProviderId
  operations: readonly ProviderContractOperationV2[]
  apiSurface: ProviderContractApiSurfaceV2
  modelBindingPolicy: ModelBindingPolicyV2
  endpointBindingPolicy: EndpointBindingPolicyV2
  continuationPolicy: ContinuationPolicyV2
  contextProjectionPolicy: ContextProjectionPolicyV2
  implementationStatus: 'definition_only'
  evidence: Readonly<{
    verifiedAt: string
    reviewAfter?: string
    stability?: ContractEvidenceStabilityV2
    sources?: readonly Readonly<{ url: string; retrievedAt: string; digest: string }>[]
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
  contextProjectionPolicy: 'unsupported',
  implementationStatus: 'definition_only',
  evidence: Object.freeze({
    verifiedAt: '2026-07-18',
    openApiSha256: '043b816d0cd67a9474ee69169803efb3654485978c180bf94f58ff7a89e5a880',
    provenanceUrls: Object.freeze([
      'https://openrouter.ai/docs/guides/overview/multimodal/image-generation',
      'https://openrouter.ai/docs/guides/routing/provider-selection',
    ]),
    localArtifacts: Object.freeze([
      Object.freeze({
        id: 'openrouter-images-provider-only-smoke-20260714',
        path: 'docs/architecture/generation-compiler-v2/evidence/openrouter-images-provider-only-smoke-20260714.json',
        sha256: '31002268f86ba7e08fe5af0622ce346e129f40c1900bd62b173a58b97ec4709f',
      }),
      Object.freeze({
        id: 'openrouter-images-streaming-contract-20260718',
        path: 'docs/architecture/generation-compiler-v2/evidence/openrouter-images-streaming-contract-20260718.json',
        sha256: '97c2eb3e990bc30a295c4fabfa806c1c2dec4dd3968555d793e7b7e268725df4',
      }),
    ]),
  }),
})

const openRouterChatApiContract = readOpenRouterChatApiContractV2()
const openRouterChatSurface = readOpenRouterChatRegistrySurfaceV2()
const OPENROUTER_CHAT_PROJECTION: DefinitionProjection = Object.freeze({
  protocolContractId: 'openrouter-chat-completions-v1',
  providerId: openRouterChatApiContract.providerId,
  operations: Object.freeze(['text', 'tool_continue'] as const),
  apiSurface: openRouterChatSurface,
  modelBindingPolicy: 'runtime_capability_resolver',
  endpointBindingPolicy: 'first_party_profile_authority_required',
  continuationPolicy: openRouterChatSurface.continuationFamily,
  contextProjectionPolicy: 'complete_turn_client_managed_replay',
  implementationStatus: 'definition_only',
  evidence: Object.freeze({
    verifiedAt: openRouterChatApiContract.evidence.verifiedAt,
    openApiSha256: null,
    provenanceUrls: openRouterChatApiContract.evidence.provenanceUrls,
    localArtifacts: Object.freeze([Object.freeze({
      id: 'openrouter-chat-api-contract-20260715',
      path: 'docs/architecture/generation-compiler-v2/evidence/openrouter-chat-api-contract-20260715.json',
      sha256: '85ecd0b97ef9b6371e710797f072968a7718d837ef683526d9b5750dd8ce72b2',
    })]),
  }),
})

const geminiDeveloperApiContract = readGeminiDeveloperApiContractV2()
const geminiEvidenceArtifact = Object.freeze({
  id: 'gemini-developer-api-contract-20260718',
  path: 'docs/architecture/generation-compiler-v2/evidence/gemini-developer-api-contract-20260718.json',
  sha256: '446bcbd2c00cfaa40190d4ea99bd02b0e6ec211ec525498eb9ed47b3901e765c',
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
  continuationPolicy: readGeminiContinuationFamily(readGeminiDeveloperApiRegistrySurfaceV2('gemini-generate-content-v1beta')),
  contextProjectionPolicy: 'complete_turn_client_managed_replay',
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
  continuationPolicy: readGeminiContinuationFamily(readGeminiDeveloperApiRegistrySurfaceV2('gemini-interactions-v1beta')),
  contextProjectionPolicy: 'unsupported',
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
  contextProjectionPolicy: 'complete_turn_client_managed_replay',
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
  contextProjectionPolicy: 'complete_turn_client_managed_replay',
  implementationStatus: 'definition_only',
  evidence: Object.freeze({
    verifiedAt: deepSeekStableApiContract.evidence.verifiedAt,
    openApiSha256: null,
    provenanceUrls: deepSeekStableApiContract.evidence.provenanceUrls,
    localArtifacts: Object.freeze([
      Object.freeze({
        id: 'deepseek-stable-api-contract-20260715',
        path: 'docs/architecture/generation-compiler-v2/evidence/deepseek-stable-api-contract-20260715.json',
        sha256: '0022edabf76e51ce88fc6d45310ad889b8a84fd037c72c287944449ba8a42cc7',
      }),
      Object.freeze({
        id: 'deepseek-stable-owner-capability-policy-v2-20260717',
        path: 'docs/architecture/generation-compiler-v2/evidence/deepseek-stable-owner-capability-policy-v2-20260717.json',
        sha256: 'b8750879b09cca9dfd7d78dfeb4f122142289da169e4c770af090db1e05c8ce0',
      }),
    ]),
  }),
})

const openAIResponsesApiContract = readOpenAIResponsesApiContractV2()
const openAIResponsesSurface = openAIResponsesApiContract.surfaces.find(
  (surface): surface is Extract<OpenAIResponsesApiSurfaceDefinitionV2, { surfaceId: 'openai-responses-v1' }> =>
    surface.surfaceId === 'openai-responses-v1',
)
if (!openAIResponsesSurface) {
  throw new ProviderContractRegistryV2Error('GENERATION_V2_CONTRACT_REGISTRY_INVALID')
}
const OPENAI_RESPONSES_PROJECTION: DefinitionProjection = Object.freeze({
  protocolContractId: 'openai-responses-v1',
  providerId: openAIResponsesApiContract.providerId,
  operations: Object.freeze(['text', 'tool_continue'] as const),
  apiSurface: openAIResponsesSurface,
  modelBindingPolicy: 'runtime_capability_resolver',
  endpointBindingPolicy: 'first_party_profile_authority_required',
  continuationPolicy: openAIResponsesSurface.continuationPolicy,
  contextProjectionPolicy: 'complete_turn_client_managed_replay',
  implementationStatus: 'definition_only',
  evidence: Object.freeze({
    verifiedAt: openAIResponsesApiContract.evidence.verifiedAt,
    openApiSha256: null,
    provenanceUrls: openAIResponsesApiContract.evidence.provenanceUrls,
    localArtifacts: Object.freeze([
      Object.freeze({
        id: 'openai-responses-api-contract-20260715',
        path: 'docs/architecture/generation-compiler-v2/evidence/openai-responses-api-contract-20260715.json',
        sha256: 'a150fe708e6beff2af8c7c82ed9d79aecd7e6f71bd13fcb9dc4e5e9338165169',
      }),
      Object.freeze({
        id: 'openai-responses-gpt-5.6-capabilities-20260717',
        path: 'docs/architecture/generation-compiler-v2/evidence/openai-responses-gpt-5.6-capabilities-20260717.json',
        sha256: '41071866d51384c2b70ce2b429dcab65106e97c6b43c0252b93292c4855d2e83',
      }),
    ]),
  }),
})

const GENERIC_LOCAL_OPENAI_CHAT_PROJECTION: DefinitionProjection = Object.freeze({
  protocolContractId: 'generic-local-openai-chat-completions',
  providerId: 'generic_local',
  operations: Object.freeze(['text'] as const),
  apiSurface: Object.freeze({ kind: 'generic_local_openai_chat_completions' as const, requestPath: '/v1/chat/completions' as const }),
  modelBindingPolicy: 'explicit_local_profile',
  endpointBindingPolicy: 'explicit_local_profile',
  continuationPolicy: 'complete_ordered_messages',
  contextProjectionPolicy: 'complete_turn_client_managed_replay',
  implementationStatus: 'definition_only',
  evidence: Object.freeze({ verifiedAt: '2026-07-19', openApiSha256: null,
    provenanceUrls: Object.freeze([]), localArtifacts: Object.freeze([]) }),
})

const OLLAMA_CHAT_PROJECTION: DefinitionProjection = Object.freeze({
  protocolContractId: 'ollama-chat-v1',
  providerId: 'ollama',
  operations: Object.freeze(['text'] as const),
  apiSurface: Object.freeze({ kind: 'ollama_native_chat' as const, requestPath: '/api/chat' as const }),
  modelBindingPolicy: 'explicit_local_profile',
  endpointBindingPolicy: 'explicit_local_profile',
  continuationPolicy: 'complete_ordered_messages',
  contextProjectionPolicy: 'complete_turn_client_managed_replay',
  implementationStatus: 'definition_only',
  evidence: Object.freeze({ verifiedAt: '2026-07-19', openApiSha256: null,
    provenanceUrls: Object.freeze([]), localArtifacts: Object.freeze([]) }),
})

const LMSTUDIO_OPENRESPONSES_PROJECTION: DefinitionProjection = Object.freeze({
  protocolContractId: 'lmstudio-openresponses',
  providerId: 'lmstudio',
  operations: Object.freeze(['text', 'tool_continue'] as const),
  apiSurface: Object.freeze({ kind: 'lmstudio_openresponses' as const, requestPath: '/v1/responses' as const }),
  modelBindingPolicy: 'explicit_local_profile',
  endpointBindingPolicy: 'explicit_local_profile',
  continuationPolicy: 'complete_ordered_messages',
  contextProjectionPolicy: 'complete_turn_client_managed_replay',
  implementationStatus: 'definition_only',
  evidence: Object.freeze({ verifiedAt: '2026-07-19', openApiSha256: null,
    provenanceUrls: Object.freeze([]), localArtifacts: Object.freeze([]) }),
})

/**
 * A user-owned endpoint family, deliberately distinct from every first-party
 * provider. Its sole protocol contract is Chat Completions: selection never
 * probes another endpoint or changes a protocol after a failed request.
 */
const OPENAI_CHAT_COMPATIBLE_PROJECTION: DefinitionProjection = Object.freeze({
  protocolContractId: 'openai_chat_compatible',
  providerId: 'openai_compatible',
  operations: Object.freeze(['text'] as const),
  apiSurface: Object.freeze({
    kind: 'openai_chat_compatible' as const,
    requestPath: '/v1/chat/completions' as const,
    modelsPath: '/v1/models' as const,
    responseProtocols: Object.freeze(['sse', 'json'] as const),
  }),
  modelBindingPolicy: 'explicit_local_profile',
  endpointBindingPolicy: 'explicit_local_profile',
  continuationPolicy: 'complete_ordered_messages',
  contextProjectionPolicy: 'complete_turn_client_managed_replay',
  implementationStatus: 'definition_only',
  evidence: Object.freeze({
    verifiedAt: '2026-07-20',
    openApiSha256: null,
    provenanceUrls: Object.freeze([]),
    localArtifacts: Object.freeze([]),
  }),
})

function digest(value: unknown): string {
  return sha256Hex(stableSerializeProviderRequestV2(value))
}

const definitionProjections = Object.freeze([
  OPENROUTER_IMAGES_PROJECTION,
  OPENROUTER_CHAT_PROJECTION,
  GEMINI_GENERATE_CONTENT_PROJECTION,
  GEMINI_INTERACTIONS_PROJECTION,
  ANTHROPIC_MESSAGES_PROJECTION,
  DEEPSEEK_STABLE_CHAT_PROJECTION,
  OPENAI_RESPONSES_PROJECTION,
  GENERIC_LOCAL_OPENAI_CHAT_PROJECTION,
  OLLAMA_CHAT_PROJECTION,
  LMSTUDIO_OPENRESPONSES_PROJECTION,
  OPENAI_CHAT_COMPATIBLE_PROJECTION,
])
const registryRevisionValue = `provider-contract-registry-v1:${digest(definitionProjections)}`
const registryRevision = GenerationV2Identity.create('registry_revision', registryRevisionValue)
const reviewedDefinitions = new WeakSet<object>()

function createDefinition(projection: DefinitionProjection): ReviewedProviderContractDefinitionV2 {
  const definitionDigestValue = digest(projection)
  const verifiedAt = projection.evidence.verifiedAt
  const reviewAfter = projection.evidence.reviewAfter ?? new Date(Date.parse(`${verifiedAt}T00:00:00Z`) + 90 * 24 * 60 * 60 * 1000).toISOString()
  const sources = projection.evidence.sources ?? projection.evidence.provenanceUrls.map((url) => ({
    url, retrievedAt: verifiedAt, digest: projection.evidence.openApiSha256 ?? definitionDigestValue,
  }))
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
    providerId: createGenerationExecutionProviderIdentityV2(projection.providerId),
    operations: projection.operations,
    apiSurface: projection.apiSurface,
    modelBindingPolicy: projection.modelBindingPolicy,
    endpointBindingPolicy: projection.endpointBindingPolicy,
    continuationPolicy: projection.continuationPolicy,
    contextProjectionPolicy: projection.contextProjectionPolicy,
    implementationStatus: projection.implementationStatus,
    evidence: Object.freeze({
      ...projection.evidence,
      reviewAfter,
      stability: projection.evidence.stability ?? (projection.protocolContractId.includes('beta') ? 'beta' : 'stable'),
      sources: Object.freeze(sources),
    }),
  })
  reviewedDefinitions.add(definition)
  return definition
}

const definitions = Object.freeze(definitionProjections.map(createDefinition))
function requireReviewedDefinition(
  definition: ReviewedProviderContractDefinitionV2 | undefined,
): ReviewedProviderContractDefinitionV2 {
  if (!definition) {
    throw new ProviderContractRegistryV2Error('GENERATION_V2_CONTRACT_REGISTRY_INVALID')
  }
  return definition
}
const deepSeekStableChatDefinition = requireReviewedDefinition(definitions.find(
  (definition) => definition.protocolContractId.value === 'deepseek-stable-chat-v1',
))
const openRouterChatDefinition = requireReviewedDefinition(definitions.find(
  (definition) => definition.protocolContractId.value === 'openrouter-chat-completions-v1',
))
const anthropicMessagesDefinition = requireReviewedDefinition(definitions.find(
  (definition) => definition.protocolContractId.value === 'anthropic-messages-2023-06-01',
))
const openAIResponsesDefinition = requireReviewedDefinition(definitions.find(
  (definition) => definition.protocolContractId.value === 'openai-responses-v1',
))
const geminiGenerateContentDefinition = requireReviewedDefinition(definitions.find(
  (definition) => definition.protocolContractId.value === 'gemini-generate-content-v1beta',
))
const geminiInteractionsDefinition = requireReviewedDefinition(definitions.find(
  (definition) => definition.protocolContractId.value === 'gemini-interactions-v1beta',
))
const genericLocalOpenAIChatDefinition = requireReviewedDefinition(definitions.find(
  (definition) => definition.protocolContractId.value === 'generic-local-openai-chat-completions',
))
const ollamaChatDefinition = requireReviewedDefinition(definitions.find(
  (definition) => definition.protocolContractId.value === 'ollama-chat-v1',
))
const lmStudioOpenResponsesDefinition = requireReviewedDefinition(definitions.find(
  (definition) => definition.protocolContractId.value === 'lmstudio-openresponses',
))
const openAIChatCompatibleDefinition = requireReviewedDefinition(definitions.find(
  (definition) => definition.protocolContractId.value === 'openai_chat_compatible',
))
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

export function readReviewedDeepSeekStableChatDefinitionV2(): ReviewedProviderContractDefinitionV2 {
  return deepSeekStableChatDefinition
}

export function readReviewedOpenRouterChatDefinitionV2(): ReviewedProviderContractDefinitionV2 {
  return openRouterChatDefinition
}

export function readReviewedAnthropicMessagesDefinitionV2(): ReviewedProviderContractDefinitionV2 {
  return anthropicMessagesDefinition
}

export function readReviewedOpenAIResponsesDefinitionV2(): ReviewedProviderContractDefinitionV2 {
  return openAIResponsesDefinition
}

export function readReviewedGeminiGenerateContentDefinitionV2(): ReviewedProviderContractDefinitionV2 {
  return geminiGenerateContentDefinition
}

export function readReviewedGeminiInteractionsDefinitionV2(): ReviewedProviderContractDefinitionV2 {
  return geminiInteractionsDefinition
}

export function readReviewedGenericLocalOpenAIChatDefinitionV2(): ReviewedProviderContractDefinitionV2 {
  return genericLocalOpenAIChatDefinition
}

export function readReviewedOllamaChatDefinitionV2(): ReviewedProviderContractDefinitionV2 {
  return ollamaChatDefinition
}

export function readReviewedLmStudioOpenResponsesDefinitionV2(): ReviewedProviderContractDefinitionV2 {
  return lmStudioOpenResponsesDefinition
}

export function readReviewedOpenAIChatCompatibleDefinitionV2(): ReviewedProviderContractDefinitionV2 {
  return openAIChatCompatibleDefinition
}
