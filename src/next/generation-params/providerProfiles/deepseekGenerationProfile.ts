import type { ProviderGenerationParamProfile } from '../generationParamTypes'

/** Identity only. Capability and wire legality are resolved by Generation V2. */
export const deepseekGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'deepseek',
  profileId: 'deepseek_generation_v1',
  wireProtocol: 'deepseek-chat',
}
