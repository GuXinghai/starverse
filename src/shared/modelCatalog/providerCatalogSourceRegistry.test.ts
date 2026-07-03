import { describe, expect, it } from 'vitest'
import { listProviderCatalogSources, requireProviderCatalogSource } from './providerCatalogSourceRegistry'

describe('providerCatalogSourceRegistry', () => {
  it('registers OpenRouter as the first provider catalog source', () => {
    const source = requireProviderCatalogSource('openrouter')

    expect(source.descriptor.providerKey).toBe('openrouter')
    expect(source.fetchSnapshot).toBeTypeOf('function')
    expect(listProviderCatalogSources().map((item) => item.descriptor.providerKey)).toContain('openrouter')
  })

  it('registers Google AI Studio as a parallel provider catalog source', () => {
    const source = requireProviderCatalogSource('google_ai_studio')

    expect(source.descriptor.providerKey).toBe('google_ai_studio')
    expect(source.fetchSnapshot).toBeTypeOf('function')
    expect(listProviderCatalogSources().map((item) => item.descriptor.providerKey)).toEqual(expect.arrayContaining([
      'openrouter',
      'google_ai_studio',
    ]))
  })

  it('rejects unknown provider sources instead of silently falling back to OpenRouter', () => {
    expect(() => requireProviderCatalogSource('unknown-provider')).toThrow('Unknown provider catalog source')
  })
})
