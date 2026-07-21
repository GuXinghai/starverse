import { describe, expect, it } from 'vitest'
import {
  hasReviewedGeminiGenerateContentReasoningWebCapabilityV2,
  hasReviewedGeminiGenerateContentToolCapabilityV2,
} from './toolCapabilityPolicyV2'

describe('reviewed Gemini GenerateContent capability gate V2', () => {
  it('opens only the exact reviewed Flash Lite model', () => {
    expect(hasReviewedGeminiGenerateContentToolCapabilityV2('gemini-3.1-flash-lite')).toBe(true)
    expect(hasReviewedGeminiGenerateContentReasoningWebCapabilityV2('gemini-3.1-flash-lite')).toBe(true)
    expect(hasReviewedGeminiGenerateContentToolCapabilityV2('gemini-3.1-flash-image')).toBe(false)
    expect(hasReviewedGeminiGenerateContentToolCapabilityV2('gemini-3.1-flash-lite-latest')).toBe(false)
    expect(hasReviewedGeminiGenerateContentToolCapabilityV2('gemini-3.1-flash')).toBe(false)
  })
})
