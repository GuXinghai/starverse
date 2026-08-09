import type { ProviderCatalogKnownProviderKey } from '../../shared/modelCatalog/providerCatalogContracts'
import { requireProviderCatalogSource } from '../../shared/modelCatalog/providerCatalogSourceRegistry'
import type { ProviderCatalogSource } from '../../shared/modelCatalog/providerCatalogContracts'
import type { ProviderModelCapabilityKeyV2 } from '../../shared/modelCatalog/providerModelObservationV2'
import {
  readReviewedAnthropicMessagesDefinitionV2,
  readReviewedDeepSeekStableChatDefinitionV2,
  readReviewedGeminiGenerateContentDefinitionV2,
  readReviewedGeminiInteractionsDefinitionV2,
  readReviewedOpenAIResponsesDefinitionV2,
  readReviewedOpenRouterChatDefinitionV2,
  type ReviewedProviderContractDefinitionV2,
} from '../generation-v2/contracts/providerContractRegistryV2'
import {
  resolveGeminiImageGenerationPolicy,
  type GeminiImageGenerationPolicy,
} from '../provider/gemini/geminiImageGenerationPolicy'

export type ReviewedProviderSpecificCapabilityV2 = Readonly<{
  kind: 'gemini_image_generation'
  source: 'verified_contract'
  protocolContractId: 'gemini-interactions-v1beta'
  contractRevision: string
  registryRevision: string
  policy: Exclude<GeminiImageGenerationPolicy, { kind: 'unsupported' }>
}> | null

export type ProviderCatalogAuthorityEntryV2 = Readonly<{
  providerKey: ProviderCatalogKnownProviderKey
  credentialKey: 'openrouter' | 'openai_responses' | 'google_ai_studio' | 'anthropic' | 'deepseek'
  endpointProfileId: string
  modelsContractId: string
  source: () => ProviderCatalogSource
  reviewedContract: ReviewedProviderContractDefinitionV2
  executionAuthority: 'none'
  missingFactSupplements: Readonly<Partial<Record<ProviderModelCapabilityKeyV2, boolean>>>
  wireImplementation: Readonly<Record<ProviderModelCapabilityKeyV2, boolean>>
  resolveProviderSpecificCapability: (modelId: string) => ReviewedProviderSpecificCapabilityV2
}>

function entry(
  providerKey: ProviderCatalogKnownProviderKey,
  credentialKey: ProviderCatalogAuthorityEntryV2['credentialKey'],
  endpointProfileId: string,
  modelsContractId: string,
  reviewedContract: ReviewedProviderContractDefinitionV2,
  wireImplementation: ProviderCatalogAuthorityEntryV2['wireImplementation'],
  resolveProviderSpecificCapability: ProviderCatalogAuthorityEntryV2['resolveProviderSpecificCapability'] = () => null,
): ProviderCatalogAuthorityEntryV2 {
  if (reviewedContract.providerId.value !== providerKey.replace('_messages', '')) {
    const accepted = providerKey === 'google_ai_studio' && reviewedContract.providerId.value === 'gemini'
    if (!accepted) throw new Error(`MODEL_CATALOG_AUTHORITY_PROVIDER_MISMATCH:${providerKey}`)
  }
  return Object.freeze({
    providerKey,
    credentialKey,
    endpointProfileId,
    modelsContractId,
    source: () => requireProviderCatalogSource(providerKey),
    reviewedContract,
    executionAuthority: 'none' as const,
    missingFactSupplements: Object.freeze({ textChat: reviewedContract.operations.includes('text') }),
    wireImplementation: Object.freeze(wireImplementation),
    resolveProviderSpecificCapability,
  })
}

function resolveGeminiProviderSpecificCapability(modelId: string): ReviewedProviderSpecificCapabilityV2 {
  const policy = resolveGeminiImageGenerationPolicy(modelId)
  if (policy.kind === 'unsupported') return null
  const contract = readReviewedGeminiInteractionsDefinitionV2()
  return Object.freeze({
    kind: 'gemini_image_generation' as const,
    source: 'verified_contract' as const,
    protocolContractId: 'gemini-interactions-v1beta' as const,
    contractRevision: contract.contractRevision.value,
    registryRevision: contract.registryRevision.value,
    policy,
  })
}

const BOOLEAN_WIRE_IMPLEMENTED = Object.freeze({
  textChat: true,
  reasoning: true,
  tools: true,
  structuredOutputs: true,
  vision: true,
})

const entries = Object.freeze([
  entry('openrouter', 'openrouter', 'openrouter-first-party-v1', 'openrouter-chat-models-v1',
    readReviewedOpenRouterChatDefinitionV2(), BOOLEAN_WIRE_IMPLEMENTED),
  entry('openai_responses', 'openai_responses', 'openai-api-v1', 'openai-models-v1',
    readReviewedOpenAIResponsesDefinitionV2(), BOOLEAN_WIRE_IMPLEMENTED),
  entry('google_ai_studio', 'google_ai_studio', 'gemini-developer-api-v1beta', 'gemini-models-v1beta',
    readReviewedGeminiGenerateContentDefinitionV2(), BOOLEAN_WIRE_IMPLEMENTED,
    resolveGeminiProviderSpecificCapability),
  entry('anthropic_messages', 'anthropic', 'anthropic-developer-api-2023-06-01', 'anthropic-models-2023-06-01',
    readReviewedAnthropicMessagesDefinitionV2(), BOOLEAN_WIRE_IMPLEMENTED),
  entry('deepseek', 'deepseek', 'deepseek-stable-api-v1', 'deepseek-stable-models-v1',
    readReviewedDeepSeekStableChatDefinitionV2(), Object.freeze({
    ...BOOLEAN_WIRE_IMPLEMENTED,
    vision: false,
  })),
])

const byProviderKey = new Map(entries.map((value) => [value.providerKey, value]))

export const ProviderCatalogAuthorityRegistryV2 = Object.freeze({
  executionAuthority: 'none' as const,
  list(): readonly ProviderCatalogAuthorityEntryV2[] {
    return entries
  },
  get(providerKey: ProviderCatalogKnownProviderKey): ProviderCatalogAuthorityEntryV2 | null {
    return byProviderKey.get(providerKey) ?? null
  },
})
