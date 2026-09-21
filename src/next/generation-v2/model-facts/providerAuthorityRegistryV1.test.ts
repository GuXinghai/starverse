import { describe, expect, it } from 'vitest'
import {
  ProviderAuthorityRegistryV1Error,
  modelsDevProviderKeyForAuthorityV1,
  providerAuthorityForCompatibleProviderInstanceV1,
  providerAuthorityForExecutionBindingV1,
  providerAuthorityForLocalProfileV1,
  providerAuthorityForModelsDevKeyV1,
  providerAuthorityForNativeSurfaceV1,
} from './providerAuthorityRegistryV1'

describe('Provider Authority Registry V1', () => {
  it('joins only explicit native, execution and models.dev bindings', () => {
    expect(providerAuthorityForNativeSurfaceV1('gemini-models-v1beta').providerAuthorityId)
      .toBe('google-ai-studio')
    expect(providerAuthorityForModelsDevKeyV1('google').providerAuthorityId).toBe('google-ai-studio')
    expect(providerAuthorityForExecutionBindingV1({ implementationProviderId: 'google_ai_studio',
      endpointProfileKind: 'gemini-developer-api-v1beta' }).providerAuthorityId).toBe('google-ai-studio')
    expect(modelsDevProviderKeyForAuthorityV1('openai')).toBe('openai')
  })

  it('fails closed instead of guessing compatible or local authority', () => {
    for (const binding of [
      { implementationProviderId: 'generic_local', endpointProfileKind: 'openai-compatible' },
      { implementationProviderId: 'lmstudio', endpointProfileKind: 'local-profile:abc' },
    ]) {
      expect(() => providerAuthorityForExecutionBindingV1(binding)).toThrowError(ProviderAuthorityRegistryV1Error)
    }
    expect(() => providerAuthorityForModelsDevKeyV1('OpenAI')).toThrowError(ProviderAuthorityRegistryV1Error)
  })

  it('assigns explicit isolated authorities to configured compatible instances and local profile kinds', () => {
    expect(providerAuthorityForCompatibleProviderInstanceV1('ocp_provider_12345678')).toMatchObject({
      providerAuthorityId: 'openai-compatible-provider-instance-v1:ocp_provider_12345678',
      endpointProfileId: 'ocp_provider_12345678',
    })
    expect(providerAuthorityForLocalProfileV1('lmstudio').providerAuthorityId).toBe('lmstudio-local')
    expect(providerAuthorityForLocalProfileV1('ollama').providerAuthorityId).toBe('ollama-local')
    expect(providerAuthorityForLocalProfileV1('generic_local').providerAuthorityId).toBe('generic-local')
  })
})
