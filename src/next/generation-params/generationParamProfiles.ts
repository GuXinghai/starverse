import type {
  GenerationParamCapability,
  GenerationParamKey,
  GenerationProviderId,
  ProviderGenerationParamProfile,
} from './generationParamTypes'
import { anthropicGenerationProfile } from './providerProfiles/anthropicGenerationProfile'
import { deepseekGenerationProfile } from './providerProfiles/deepseekGenerationProfile'
import { geminiGenerationProfile } from './providerProfiles/geminiGenerationProfile'
import { geminiImageGenerationProfile } from './providerProfiles/geminiImageGenerationProfile'
import {
  genericOpenAICompatibleLegacyGenerationProfile,
  genericOpenAICompatibleModernGenerationProfile,
} from './providerProfiles/genericOpenAICompatibleGenerationProfile'
import { openaiResponsesGenerationProfile } from './providerProfiles/openaiResponsesGenerationProfile'
import { openrouterGenerationProfile } from './providerProfiles/openrouterGenerationProfile'

export const GENERATION_PARAM_PROVIDER_PROFILES: readonly ProviderGenerationParamProfile[] = [
  openrouterGenerationProfile,
  geminiGenerationProfile,
  geminiImageGenerationProfile,
  openaiResponsesGenerationProfile,
  anthropicGenerationProfile,
  deepseekGenerationProfile,
  genericOpenAICompatibleLegacyGenerationProfile,
  genericOpenAICompatibleModernGenerationProfile,
]

function modelMatches(modelId: string | null | undefined, pattern?: string, exactModelIds?: readonly string[]): boolean {
  const normalized = String(modelId ?? '').trim()
  if (!normalized) return false
  if (exactModelIds?.includes(normalized)) return true
  if (!pattern) return false
  try {
    return new RegExp(pattern, 'i').test(normalized)
  } catch {
    return false
  }
}

export function getEffectiveGenerationParamCapabilities(
  profile: ProviderGenerationParamProfile,
  modelId?: string | null,
): Partial<Record<GenerationParamKey, GenerationParamCapability>> {
  const params: Partial<Record<GenerationParamKey, GenerationParamCapability>> = { ...profile.params }
  for (const override of profile.modelOverrides ?? []) {
    if (override.match.providerId && override.match.providerId !== profile.providerId) continue
    if (!modelMatches(modelId, override.match.modelIdPattern, override.match.exactModelIds)) continue
    Object.assign(params, override.params ?? {})
  }
  return params
}

export function getGenerationParamProfileById(profileId: string): ProviderGenerationParamProfile | null {
  return GENERATION_PARAM_PROVIDER_PROFILES.find((profile) => profile.profileId === profileId) ?? null
}

export function getDefaultGenerationParamProfile(
  providerId: GenerationProviderId,
  options: Readonly<{
    genericProtocol?: 'legacy' | 'modern'
    requestKind?: 'text' | 'image_generation'
  }> = {},
): ProviderGenerationParamProfile | null {
  if (providerId === 'generic_openai_compatible') {
    return options.genericProtocol === 'modern'
      ? genericOpenAICompatibleModernGenerationProfile
      : genericOpenAICompatibleLegacyGenerationProfile
  }
  if (providerId === 'google_ai_studio' && options.requestKind === 'image_generation') {
    return geminiImageGenerationProfile
  }
  return GENERATION_PARAM_PROVIDER_PROFILES.find((profile) => profile.providerId === providerId) ?? null
}
