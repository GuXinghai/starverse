import { describe, expect, it } from 'vitest'
import {
  isVerifiedAnthropicEndpointProfileV2,
  readVerifiedAnthropicEndpointProfileV2,
} from './verifiedEndpointProfileV2'

describe('Anthropic V2 verified endpoint profile', () => {
  it('derives the sole standard first-party profile from the reviewed provider contract', () => {
    const profile = readVerifiedAnthropicEndpointProfileV2()
    expect(profile).toMatchObject({
      classification: 'verified_first_party_endpoint_profile_non_executable',
      trust: 'verified_anthropic_endpoint_profile',
      usage: 'provider_binding_snapshot_only',
      executionAuthority: 'none',
      providerId: { value: 'anthropic' },
      endpointProfileId: { value: 'anthropic-developer-api-2023-06-01' },
      endpointSetRevision: { value: expect.stringMatching(/^anthropic-endpoint-set-v1:[0-9a-f]{64}$/u) },
      descriptor: {
        endpointId: { value: 'anthropic-developer-api-2023-06-01' },
        descriptorRevision: { value: expect.stringMatching(/^anthropic-profile-v1:[0-9a-f]{64}$/u) },
        descriptorDigest: { value: expect.stringMatching(/^[0-9a-f]{64}$/u) },
        apiOrigin: 'https://api.anthropic.com',
        messagesPath: '/v1/messages',
        modelsPath: '/v1/models',
        apiVersionHeader: { name: 'anthropic-version', value: '2023-06-01' },
        betaSurfaceAutomaticUse: 'forbidden',
        automaticFallback: 'forbidden',
      },
    })
    expect(isVerifiedAnthropicEndpointProfileV2(profile)).toBe(true)
    expect(isVerifiedAnthropicEndpointProfileV2({ ...profile })).toBe(false)
    expect(Object.isFrozen(profile.descriptor)).toBe(true)
    expect(Object.isFrozen(profile.descriptor.apiVersionHeader)).toBe(true)
  })

  it('does not introduce legacy aliases, alternate origins, or beta headers', () => {
    const serialized = JSON.stringify(readVerifiedAnthropicEndpointProfileV2())
    expect(serialized).not.toContain('anthropic_official')
    expect(serialized).not.toContain('api.anthropic.com/v1')
    expect(serialized).not.toContain('anthropic-beta')
    expect(serialized).not.toContain('files-api')
  })
})
