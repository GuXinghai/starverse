import { describe, expect, it } from 'vitest'
import {
  isVerifiedDeepSeekStableEndpointProfileV2,
  readVerifiedDeepSeekStableEndpointProfileV2,
} from './stableEndpointProfileV2'

describe('DeepSeek stable first-party endpoint profile V2', () => {
  it('uses the reviewed stable contract family as the sole profile and endpoint identity', () => {
    const profile = readVerifiedDeepSeekStableEndpointProfileV2()
    expect(profile).toMatchObject({
      classification: 'verified_first_party_endpoint_profile_non_executable',
      trust: 'verified_deepseek_stable_endpoint_profile',
      usage: 'provider_binding_snapshot_only',
      executionAuthority: 'none',
      providerId: { value: 'deepseek' },
      endpointProfileId: { value: 'deepseek-stable-api-v1' },
      endpointSetRevision: { value: expect.stringMatching(/^deepseek-stable-endpoint-set-v1:[0-9a-f]{64}$/u) },
      descriptor: {
        endpointId: { value: 'deepseek-stable-api-v1' },
        descriptorRevision: { value: expect.stringMatching(/^deepseek-stable-profile-v1:[0-9a-f]{64}$/u) },
        descriptorDigest: { value: expect.stringMatching(/^[0-9a-f]{64}$/u) },
        apiOrigin: 'https://api.deepseek.com',
        chatPath: '/chat/completions',
        modelsPath: '/models',
        stableMayUseV1Suffix: false,
        stableMayUseBetaOrigin: false,
        automaticFallback: 'forbidden',
      },
    })
    expect(isVerifiedDeepSeekStableEndpointProfileV2(profile)).toBe(true)
  })

  it('cannot be forged by copying or by reusing the legacy profile alias', () => {
    const profile = readVerifiedDeepSeekStableEndpointProfileV2()
    expect(isVerifiedDeepSeekStableEndpointProfileV2({ ...profile })).toBe(false)
    expect(JSON.stringify(profile)).not.toContain('deepseek_official_openai_compat')
    expect(JSON.stringify(profile)).not.toContain('https://api.deepseek.com/v1')
    expect(JSON.stringify(profile)).not.toContain('/beta')
  })
})
