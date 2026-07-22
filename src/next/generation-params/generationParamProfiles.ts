import type {
  GenerationParamCapability,
  GenerationParamKey,
  GenerationProviderId,
  ProviderGenerationParamProfile,
} from './generationParamTypes'
import type { ReasoningEffort } from '../state/types'
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
  params: {},
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

const SELECTABLE_REASONING_EFFORTS: readonly ReasoningEffort[] = [
  'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
]

export function getSelectableReasoningEfforts(
  profile: ProviderGenerationParamProfile | null,
  modelId?: string | null,
): readonly ReasoningEffort[] {
  if (!profile || profile.providerId === 'unset') return Object.freeze([])
  const capability = getEffectiveGenerationParamCapabilities(profile, modelId).reasoningEffort
  if (!capability) return SELECTABLE_REASONING_EFFORTS
  if (!capability.supported || capability.ui?.editable === false || capability.valueType !== 'enum') {
    return Object.freeze([])
  }
  const domain = new Set(capability.enumValues ?? [])
  return Object.freeze(SELECTABLE_REASONING_EFFORTS.filter((effort) => domain.has(effort)))
}

export function isReasoningEffortExplicitlyUnsupported(
  profile: ProviderGenerationParamProfile | null,
  modelId: string | null | undefined,
  effort: ReasoningEffort,
): boolean {
  if (!profile || profile.providerId === 'unset') return false
  const capability = getEffectiveGenerationParamCapabilities(profile, modelId).reasoningEffort
  if (!capability) return false
  if (!capability.supported) return true
  if (capability.valueType !== 'enum') return false
  return !(capability.enumValues ?? []).includes(effort)
}

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
