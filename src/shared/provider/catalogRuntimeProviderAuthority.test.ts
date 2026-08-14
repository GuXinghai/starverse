import { describe, expect, it } from 'vitest'
import type { ProviderCatalogKnownProviderKey } from '../modelCatalog/providerCatalogContracts'
import { RUNTIME_PROVIDER_IDS } from './runtimeProviderId'
import {
  catalogProviderKeyForRuntimeProvider,
  runtimeProviderIdForCatalogProvider,
} from './catalogRuntimeProviderAuthority'

describe('Catalog/Runtime provider conversion authority', () => {
  it('maps every registered Catalog provider explicitly to its Runtime route identity', () => {
    const catalogProviders: readonly ProviderCatalogKnownProviderKey[] = [
      'openrouter', 'google_ai_studio', 'anthropic_messages', 'openai_responses', 'deepseek',
    ]
    expect(catalogProviders.map(runtimeProviderIdForCatalogProvider)).toEqual(catalogProviders)
  })

  it('is total over Runtime identities and does not manufacture Catalog identities for local routes', () => {
    expect(RUNTIME_PROVIDER_IDS.map((providerId) => [providerId, catalogProviderKeyForRuntimeProvider(providerId)]))
      .toEqual([
        ['openrouter', 'openrouter'],
        ['openai_responses', 'openai_responses'],
        ['google_ai_studio', 'google_ai_studio'],
        ['anthropic_messages', 'anthropic_messages'],
        ['deepseek', 'deepseek'],
        ['lm_studio', null],
        ['ollama_local', null],
        ['local_endpoint', null],
      ])
  })
})
