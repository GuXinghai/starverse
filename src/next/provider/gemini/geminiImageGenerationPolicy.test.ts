import { describe, expect, it } from 'vitest'
import {
  resolveGeminiImageGenerationPolicy,
  validateGeminiImageGenerationImageSize,
} from './geminiImageGenerationPolicy'

describe('geminiImageGenerationPolicy', () => {
  it('matches legacy Nano Banana with hidden size control and no thought summaries', () => {
    expect(resolveGeminiImageGenerationPolicy('models/gemini-2.5-flash-image')).toMatchObject({
      kind: 'legacy_nano_banana',
      supportedImageSizes: ['512', '1K', '2K', '4K'],
      imageSizeMode: 'hidden',
      supportsThoughtSummaries: false,
      thinkingLevels: [],
      supportsGoogleSearch: false,
      supportsImageSearch: false,
    })
  })

  it('matches Nano Banana 2 Lite with locked 1K and managed summaries', () => {
    expect(resolveGeminiImageGenerationPolicy('gemini-3.1-flash-lite-image')).toMatchObject({
      kind: 'nano_banana_2_lite',
      supportedImageSizes: ['1K'],
      imageSizeMode: 'locked',
      supportsThoughtSummaries: true,
      thinkingLevels: ['minimal', 'high'],
      supportsGoogleSearch: false,
      supportsImageSearch: false,
    })
  })

  it('projects the exact stable model to the verified Interactions image slice', () => {
    expect(resolveGeminiImageGenerationPolicy('gemini-3.1-flash-image')).toMatchObject({
      kind: 'interactions_image_v1beta',
      supportedImageSizes: ['1K'],
      imageSizeMode: 'locked',
      supportedAspectRatios: ['1:1'],
      supportedOutputModes: ['image_only'],
      supportsThoughtSummaries: false,
      thinkingLevels: [],
      supportsGoogleSearch: false,
      supportsImageSearch: false,
    })
  })

  it('matches Nano Banana Pro preview ids with supported thinking levels', () => {
    expect(resolveGeminiImageGenerationPolicy('publishers/google/models/gemini-3-pro-image-preview-2026-07')).toMatchObject({
      kind: 'nano_banana_pro',
      supportedImageSizes: ['1K', '2K', '4K'],
      imageSizeMode: 'selectable',
      supportsThoughtSummaries: true,
      thinkingLevels: ['minimal', 'high'],
      supportsGoogleSearch: true,
      supportsImageSearch: false,
    })
  })

  it('does not match unknown non-preview suffixes', () => {
    expect(resolveGeminiImageGenerationPolicy('gemini-3.1-flash-image-alpha')).toMatchObject({
      kind: 'unsupported',
    })
  })

  it('rejects model-specific illegal image sizes without fallback', () => {
    expect(validateGeminiImageGenerationImageSize({
      model: 'gemini-3.1-flash-lite-image',
      imageSize: '4K',
    })).toEqual({ ok: false, supportedImageSizes: ['1K'] })
  })
})
