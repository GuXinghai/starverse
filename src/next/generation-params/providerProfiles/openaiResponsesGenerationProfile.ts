import type { ProviderGenerationParamProfile } from '../generationParamTypes'

/** Identity only. Capability and wire legality are resolved by Generation V2. */
export const openaiResponsesGenerationProfile: ProviderGenerationParamProfile = {
  providerId: 'openai_responses',
  profileId: 'openai_responses_generation_v1',
  wireProtocol: 'openai-responses',
}
