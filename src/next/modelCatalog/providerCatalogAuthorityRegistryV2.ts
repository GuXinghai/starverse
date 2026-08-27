import type { ProviderCatalogKnownProviderKey } from '../../shared/modelCatalog/providerCatalogContracts'
import { requireProviderCatalogSource } from '../../shared/modelCatalog/providerCatalogSourceRegistry'
import type { ProviderCatalogSource } from '../../shared/modelCatalog/providerCatalogContracts'
import {
  readReviewedAnthropicMessagesDefinitionV2,
  readReviewedDeepSeekStableChatDefinitionV2,
  readReviewedGeminiGenerateContentDefinitionV2,
  readReviewedOpenAIResponsesDefinitionV2,
  readReviewedOpenRouterChatDefinitionV2,
  type ReviewedProviderContractDefinitionV2,
} from '../generation-v2/contracts/providerContractRegistryV2'
import type { GenerationExecutionProviderId } from '../generation-v2/domain/generationExecutionProviderId'
import type { ProviderCredentialKey } from '../../shared/provider/providerCredentialKey'

export type ProviderCatalogAuthorityEntryV2 = Readonly<{
  providerKey: ProviderCatalogKnownProviderKey
  credentialKey: ProviderCredentialKey
  executionProviderId: GenerationExecutionProviderId
  endpointProfileId: string
  modelsContractId: string
  source: () => ProviderCatalogSource
  reviewedContract: ReviewedProviderContractDefinitionV2
  executionAuthority: 'none'
}>

function entry(
  providerKey: ProviderCatalogKnownProviderKey,
  credentialKey: ProviderCatalogAuthorityEntryV2['credentialKey'],
  executionProviderId: GenerationExecutionProviderId,
  endpointProfileId: string,
  modelsContractId: string,
  reviewedContract: ReviewedProviderContractDefinitionV2,
): ProviderCatalogAuthorityEntryV2 {
  if (reviewedContract.providerId.value !== executionProviderId) {
    throw new Error(`MODEL_CATALOG_AUTHORITY_PROVIDER_MISMATCH:${providerKey}`)
  }
  return Object.freeze({
    providerKey,
    credentialKey,
    executionProviderId,
    endpointProfileId,
    modelsContractId,
    source: () => requireProviderCatalogSource(providerKey),
    reviewedContract,
    executionAuthority: 'none' as const,
  })
}

const entries = Object.freeze([
  entry('openrouter', 'openrouter', 'openrouter', 'openrouter-first-party-v1', 'openrouter-chat-models-v1',
    readReviewedOpenRouterChatDefinitionV2()),
  entry('openai_responses', 'openai_responses', 'openai_responses', 'openai-api-v1', 'openai-models-v1',
    readReviewedOpenAIResponsesDefinitionV2()),
  entry('google_ai_studio', 'google_ai_studio', 'google_ai_studio', 'gemini-developer-api-v1beta', 'gemini-models-v1beta',
    readReviewedGeminiGenerateContentDefinitionV2()),
  entry('anthropic_messages', 'anthropic', 'anthropic', 'anthropic-developer-api-2023-06-01', 'anthropic-models-2023-06-01',
    readReviewedAnthropicMessagesDefinitionV2()),
  entry('deepseek', 'deepseek', 'deepseek', 'deepseek-stable-api-v1', 'deepseek-stable-models-v1',
    readReviewedDeepSeekStableChatDefinitionV2()),
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
