import type { ProviderGenerationParamProfile } from '../generationParamTypes'

/** Identity only. Capability and wire legality are resolved by Generation V2. */
export const geminiGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'google_ai_studio',
  profileId: 'gemini_generation_v1',
  wireProtocol: 'gemini-generate-content',
}
