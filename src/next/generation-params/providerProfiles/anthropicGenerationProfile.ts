import type { ProviderGenerationParamProfile } from '../generationParamTypes'

/** Identity only. Capability and wire legality are resolved by Generation V2. */
export const anthropicGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'anthropic_messages',
  profileId: 'anthropic_generation_v1',
  wireProtocol: 'anthropic-messages',
}
