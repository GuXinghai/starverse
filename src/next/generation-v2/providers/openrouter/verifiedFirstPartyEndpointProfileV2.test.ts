import { describe, expect, it } from 'vitest'
import {
  isVerifiedOpenRouterFirstPartyEndpointProfileV2,
  OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2,
  readOpenRouterFirstPartyProfileDigestV2,
  readVerifiedOpenRouterFirstPartyEndpointProfileV2,
  resolveOpenRouterFirstPartyOperationV2,
} from './verifiedFirstPartyEndpointProfileV2'

describe('OpenRouter first-party endpoint profile V2', () => {
  it('binds the Owner-selected permanent identity to separate reviewed operation contracts', () => {
    const profile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
    expect(profile.endpointProfileId.value).toBe(OPENROUTER_FIRST_PARTY_ENDPOINT_PROFILE_ID_V2)
    expect(profile.credentialScope).toEqual({ credentialProviderId: 'openrouter', source: 'runtime_credential_lease' })
    expect(resolveOpenRouterFirstPartyOperationV2(profile, 'chat_completions')).toMatchObject({
      url: 'https://openrouter.ai/api/v1/chat/completions',
      contract: { protocolContractId: { value: 'openrouter-chat-completions-v1' } },
    })
    expect(resolveOpenRouterFirstPartyOperationV2(profile, 'image_generate')).toMatchObject({
      url: 'https://openrouter.ai/api/v1/images',
      contract: { protocolContractId: { value: 'openrouter-images-v1' } },
    })
    expect(readOpenRouterFirstPartyProfileDigestV2(profile).value).toMatch(/^[a-f0-9]{64}$/)
  })

  it('does not accept copied profile-shaped values as authority', () => {
    const profile = readVerifiedOpenRouterFirstPartyEndpointProfileV2()
    expect(isVerifiedOpenRouterFirstPartyEndpointProfileV2(profile)).toBe(true)
    expect(isVerifiedOpenRouterFirstPartyEndpointProfileV2({ ...profile })).toBe(false)
    expect(() => resolveOpenRouterFirstPartyOperationV2({ ...profile } as never, 'image_generate')).toThrow(
      'GENERATION_V2_OPENROUTER_FIRST_PARTY_PROFILE_CONTRACT_INVALID',
    )
  })
})
