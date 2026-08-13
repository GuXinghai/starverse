import { describe, expect, it } from 'vitest'
import { ProviderCatalogAuthorityRegistryV2 } from './providerCatalogAuthorityRegistryV2'

describe('ProviderCatalogAuthorityRegistryV2 identity mappings', () => {
  it('owns explicit Catalog, credential, and execution identities', () => {
    expect(ProviderCatalogAuthorityRegistryV2.list().map((entry) => ({
      providerKey: entry.providerKey,
      credentialKey: entry.credentialKey,
      executionProviderId: entry.executionProviderId,
      reviewedProviderId: entry.reviewedContract.providerId.value,
    }))).toEqual([
      { providerKey: 'openrouter', credentialKey: 'openrouter', executionProviderId: 'openrouter', reviewedProviderId: 'openrouter' },
      { providerKey: 'openai_responses', credentialKey: 'openai_responses', executionProviderId: 'openai_responses', reviewedProviderId: 'openai_responses' },
      { providerKey: 'google_ai_studio', credentialKey: 'google_ai_studio', executionProviderId: 'google_ai_studio', reviewedProviderId: 'google_ai_studio' },
      { providerKey: 'anthropic_messages', credentialKey: 'anthropic', executionProviderId: 'anthropic', reviewedProviderId: 'anthropic' },
      { providerKey: 'deepseek', credentialKey: 'deepseek', executionProviderId: 'deepseek', reviewedProviderId: 'deepseek' },
    ])
  })
})
