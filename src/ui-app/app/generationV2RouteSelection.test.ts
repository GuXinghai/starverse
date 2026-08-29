import { describe, expect, it } from 'vitest'
import { selectGeminiGenerationV2RouteV2 } from './generationV2RouteSelection'

describe('Generation V2 Gemini route selection', () => {
  it('follows the current product image setting in both directions without a model projection input', () => {
    expect(selectGeminiGenerationV2RouteV2(false)).toEqual({ kind: 'gemini_generate_content' })
    expect(selectGeminiGenerationV2RouteV2(true)).toEqual({ kind: 'gemini_interactions_image' })
    expect(selectGeminiGenerationV2RouteV2(false)).toEqual({ kind: 'gemini_generate_content' })
  })
})
