import type {
  GenerationProviderId,
  ProviderGenerationParamProfile,
} from './generationParamTypes'
import { anthropicGenerationProfile } from './providerProfiles/anthropicGenerationProfile'
import { deepseekGenerationProfile } from './providerProfiles/deepseekGenerationProfile'
import { geminiGenerationProfile } from './providerProfiles/geminiGenerationProfile'
import { geminiImageGenerationProfile } from './providerProfiles/geminiImageGenerationProfile'
import { openaiResponsesGenerationProfile } from './providerProfiles/openaiResponsesGenerationProfile'
import { openrouterGenerationProfile } from './providerProfiles/openrouterGenerationProfile'

export const unsetGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'unset',
  profileId: 'unset_generation_params',
  wireProtocol: 'none',
}

export const GENERATION_PARAM_PROVIDER_PROFILES: readonly ProviderGenerationParamProfile[] = [
  unsetGenerationProfile,
  openrouterGenerationProfile,
  geminiGenerationProfile,
  geminiImageGenerationProfile,
  openaiResponsesGenerationProfile,
  anthropicGenerationProfile,
  deepseekGenerationProfile,
]

export function getGenerationParamProfileById(profileId: string): ProviderGenerationParamProfile | null {
  return GENERATION_PARAM_PROVIDER_PROFILES.find((profile) => profile.profileId === profileId) ?? null
}

export function getDefaultGenerationParamProfile(
  providerId: GenerationProviderId,
  options: Readonly<{
    requestKind?: 'text' | 'image_generation'
  }> = {},
): ProviderGenerationParamProfile | null {
  if (providerId === 'google_ai_studio' && options.requestKind === 'image_generation') {
    return geminiImageGenerationProfile
  }
  return GENERATION_PARAM_PROVIDER_PROFILES.find((profile) => profile.providerId === providerId) ?? null
}
