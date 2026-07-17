import { describe, expect, it } from 'vitest'
import {
  isVerifiedOpenAIResponsesEndpointProfileV2,
  readVerifiedOpenAIResponsesEndpointProfileV2,
} from './verifiedEndpointProfileV2'

describe('OpenAI Responses V2 verified endpoint profile', () => {
  it('derives one fixed first-party profile from the reviewed contract', () => {
    const profile = readVerifiedOpenAIResponsesEndpointProfileV2()
    expect(profile).toMatchObject({
      classification: 'verified_first_party_endpoint_profile_non_executable',
      trust: 'verified_openai_responses_endpoint_profile',
      usage: 'provider_binding_snapshot_only',
      executionAuthority: 'none',
      descriptor: {
        apiOrigin: 'https://api.openai.com', responsesPath: '/v1/responses',
        modelsPath: '/v1/models', filesPath: '/v1/files', automaticFallback: 'forbidden',
      },
    })
    expect(profile.providerId.value).toBe('openai_responses')
    expect(profile.endpointProfileId.value).toBe('openai-api-v1')
    expect(profile.descriptor.descriptorDigest.value).toMatch(/^[0-9a-f]{64}$/u)
    expect(isVerifiedOpenAIResponsesEndpointProfileV2(profile)).toBe(true)
    expect(isVerifiedOpenAIResponsesEndpointProfileV2({ ...profile })).toBe(false)
    expect(Object.isFrozen(profile.descriptor)).toBe(true)
  })
})
