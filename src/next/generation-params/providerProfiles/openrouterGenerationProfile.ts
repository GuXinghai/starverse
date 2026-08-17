import type { ProviderGenerationParamProfile } from '../generationParamTypes'

/** Identity only. Capability and wire legality are resolved by Generation V2. */
export const openrouterGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'openrouter',
  profileId: 'openrouter_generation_v1',
  wireProtocol: 'openrouter-chat',
}
