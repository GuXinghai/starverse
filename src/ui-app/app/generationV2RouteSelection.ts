import type { GenerationV2Route } from '@/next/generation-v2/renderer/generationV2CommandClient'

export function selectGeminiGenerationV2RouteV2(imageGenerationEnabled: boolean): GenerationV2Route {
  return imageGenerationEnabled
    ? Object.freeze({ kind: 'gemini_interactions_image' })
    : Object.freeze({ kind: 'gemini_generate_content' })
}
