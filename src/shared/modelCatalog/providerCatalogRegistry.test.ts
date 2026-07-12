import { describe, expect, it } from 'vitest'
import {
  getProviderCatalogSourceDescriptor,
  isProviderCatalogSourceKey,
  listProviderCatalogSourceDescriptors,
  requireProviderCatalogSourceDescriptor,
} from './providerCatalogRegistry'

describe('providerCatalogRegistry', () => {
  it('lists every first-class catalog provider with stable provider keys', () => {
    expect(listProviderCatalogSourceDescriptors().map((descriptor) => descriptor.providerKey)).toEqual([
      'openrouter',
      'google_ai_studio',
      'anthropic_messages',
      'openai_responses',
      'deepseek',
    ])
  })

  it('keeps OpenRouter as a provider source descriptor, not a separate catalog truth', () => {
    const descriptor = requireProviderCatalogSourceDescriptor('openrouter')

    expect(descriptor).toMatchObject({
      providerKey: 'openrouter',
      defaultBaseUrl: 'https://openrouter.ai/api/v1',
      defaultDataSource: 'models_user_primary',
      credentialMode: 'required',
      capabilities: {
        models: true,
        providerDictionary: true,
        endpointDetails: true,
        countProbe: true,
      },
    })
  })

  it('normalizes lookups without accepting unknown providers', () => {
    expect(isProviderCatalogSourceKey(' google_ai_studio ')).toBe(true)
    expect(getProviderCatalogSourceDescriptor('openai_responses')?.displayName).toBe('OpenAI Responses')
    expect(getProviderCatalogSourceDescriptor('google-ai-studio')).toBeNull()
    expect(() => requireProviderCatalogSourceDescriptor('google-ai-studio')).toThrow(
      'Unknown provider catalog source: google-ai-studio',
    )
  })

  it('does not duplicate registered provider keys', () => {
    const keys = listProviderCatalogSourceDescriptors().map((descriptor) => descriptor.providerKey)

    expect(new Set(keys).size).toBe(keys.length)
  })
})

