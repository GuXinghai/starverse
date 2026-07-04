import { describe, expect, it } from 'vitest'
import {
  resolveGeminiImageGenerationPolicy,
  validateGeminiImageGenerationImageSize,
} from './geminiImageGenerationPolicy'

describe('geminiImageGenerationPolicy', () => {
  it('matches legacy Nano Banana with 1K only and no thought summaries', () => {
    expect(resolveGeminiImageGenerationPolicy('models/gemini-2.5-flash-image')).toMatchObject({
      kind: 'legacy_nano_banana',
      supportedImageSizes: ['1K'],
      supportsThoughtSummaries: false,
      thinkingLevels: [],
    })
  })

  it('matches Nano Banana 2 Lite with 1K only and managed summaries', () => {
    expect(resolveGeminiImageGenerationPolicy('gemini-3.1-flash-lite-image')).toMatchObject({
      kind: 'nano_banana_2_lite',
      supportedImageSizes: ['1K'],
      supportsThoughtSummaries: true,
      thinkingLevels: [],
    })
  })

  it('matches Nano Banana 2 with 512 through 4K and minimal/high levels', () => {
    expect(resolveGeminiImageGenerationPolicy('gemini-3.1-flash-image')).toMatchObject({
      kind: 'nano_banana_2',
      supportedImageSizes: ['512', '1K', '2K', '4K'],
      supportsThoughtSummaries: true,
      thinkingLevels: ['minimal', 'high'],
      defaultThinkingLevel: 'minimal',
    })
  })

  it('matches Nano Banana Pro ids without guessing thinking levels', () => {
    expect(resolveGeminiImageGenerationPolicy('gemini-3-pro-image-preview')).toMatchObject({
      kind: 'nano_banana_pro',
      supportedImageSizes: ['1K', '2K', '4K'],
      supportsThoughtSummaries: true,
      thinkingLevels: [],
    })
  })

  it('rejects model-specific illegal image sizes without fallback', () => {
    expect(validateGeminiImageGenerationImageSize({
      model: 'gemini-3.1-flash-lite-image',
      imageSize: '4K',
    })).toEqual({ ok: false, supportedImageSizes: ['1K'] })
  })
})
