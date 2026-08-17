import { describe, expect, it } from 'vitest'
import {
  GENERATION_PARAM_PROVIDER_PROFILES,
  getDefaultGenerationParamProfile,
  getGenerationParamProfileById,
} from './generationParamProfiles'
import { geminiGenerationProfile } from './providerProfiles/geminiGenerationProfile'
import { geminiImageGenerationProfile } from './providerProfiles/geminiImageGenerationProfile'

describe('generationParamProfiles', () => {
  it('keeps profiles as identity metadata rather than capability sources', () => {
    expect(GENERATION_PARAM_PROVIDER_PROFILES.every((profile) =>
      Object.keys(profile).sort().join(',') === 'profileId,providerId,wireProtocol')).toBe(true)
    expect(getGenerationParamProfileById(geminiGenerationProfile.profileId)).toEqual(geminiGenerationProfile)
  })

  it('selects only the protocol identity for the requested operation', () => {
    expect(getDefaultGenerationParamProfile('google_ai_studio')?.profileId).toBe(geminiGenerationProfile.profileId)
    expect(getDefaultGenerationParamProfile('google_ai_studio', { requestKind: 'image_generation' })?.profileId)
      .toBe(geminiImageGenerationProfile.profileId)
  })
})
