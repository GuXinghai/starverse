import { describe, expect, it } from 'vitest'
import {
  DEFAULT_IMAGE_GENERATION_USER_CONFIG,
  type ImageGenerationUserConfig,
  extractConvoImageGenerationCustom,
  extractConvoImageGenerationMode,
  mergeConvoImageGenerationMeta,
  mergeProjectImageGenerationDefaultMeta,
  normalizeImageGenerationUserConfig,
  resolveEffectiveImageGenerationConfig,
} from './imageGenerationSettingsPersistence'

describe('imageGenerationSettingsPersistence', () => {
  it('round trips a complete OpenAI tool configuration without overwriting Gemini fields', () => {
    const custom = { ...DEFAULT_IMAGE_GENERATION_USER_CONFIG, enabled: true, imageSize: '2K' as const, aspectRatio: '16:9',
      openAI: { toolModel: 'gpt-image-2', size: '1536x864', quality: 'high', format: 'webp' as const,
        background: 'transparent' as const, action: 'edit' as const, toolChoice: 'required' as const,
        outputCompression: 0, partialImages: 0, inputFidelity: 'high' as const, moderation: 'low' as const,
        maskAsset: { assetId: 'mask', assetRevisionId: 'rev', assetSha256: 'hash' } } }
    const stored = mergeConvoImageGenerationMeta({ other: true }, { mode: 'custom', custom })
    expect(extractConvoImageGenerationCustom(JSON.parse(JSON.stringify(stored)))).toEqual(custom)
    expect(normalizeImageGenerationUserConfig({ ...custom, openAI: { format: 'bogus', partialImages: 5, outputCompression: -1 } }).openAI).toBeUndefined()
    expect(normalizeImageGenerationUserConfig({ ...custom, openAI: { size: 'auto', toolChoice: 'auto' } }).openAI).toEqual({ size: 'auto', toolChoice: 'auto' })
  })
  it('normalizes config fields with safe defaults', () => {
    expect(normalizeImageGenerationUserConfig(null)).toEqual(DEFAULT_IMAGE_GENERATION_USER_CONFIG)
    expect(
      normalizeImageGenerationUserConfig({
        enabled: true,
        outputMode: 'image_only',
        aspectRatio: '16:9',
        imageSize: '2K',
        advancedJson: '{"seed":7}',
      })
    ).toEqual({
      enabled: true,
      outputMode: 'image_only',
      aspectRatio: '16:9',
      imageSize: '2K',
    })
  })

  it('normalizes legacy pixel imageSize to default empty value', () => {
    expect(
      normalizeImageGenerationUserConfig({
        enabled: true,
        outputMode: 'image_only',
        aspectRatio: '',
        imageSize: '1024x1024',
      })
    ).toEqual({
      enabled: true,
      outputMode: 'image_only',
      aspectRatio: '',
      imageSize: '',
    })
  })

  it('mergeConvoImageGenerationMeta writes/removes mode and custom snapshot', () => {
    const custom = {
      enabled: true,
      outputMode: 'image_and_text' as const,
      aspectRatio: '1:1',
      imageSize: '',
    } satisfies ImageGenerationUserConfig
    const merged = mergeConvoImageGenerationMeta({ customMarker: 'x' }, { mode: 'custom', custom })
    expect(merged).toEqual({
      customMarker: 'x',
      imageGenerationMode: 'custom',
      imageGenerationCustom: custom,
    })
    expect(extractConvoImageGenerationMode(merged)).toBe('custom')
    expect(extractConvoImageGenerationCustom(merged)).toEqual(custom)

    const backToDefault = mergeConvoImageGenerationMeta(merged, { mode: 'default', custom: null })
    expect(backToDefault).toEqual({ customMarker: 'x' })
    expect(extractConvoImageGenerationMode(backToDefault)).toBe('default')
  })

  it('resolveEffectiveImageGenerationConfig respects convo > project > global priority', () => {
    const globalDefault = {
      enabled: false,
      outputMode: 'auto',
      aspectRatio: '',
      imageSize: '',
    }
    const projectMeta = mergeProjectImageGenerationDefaultMeta(
      null,
      {
        mode: 'custom',
        custom: {
          enabled: true,
          outputMode: 'image_only',
          aspectRatio: '16:9',
          imageSize: '2K',
        },
      },
    )
    const convoMeta = mergeConvoImageGenerationMeta(
      null,
      {
        mode: 'custom',
        custom: {
          enabled: true,
          outputMode: 'image_and_text',
          aspectRatio: '3:2',
          imageSize: '4K',
        },
      },
    )

    const convoCustom = resolveEffectiveImageGenerationConfig({
      convoMeta,
      projectMeta,
      globalDefault,
    })
    expect(convoCustom.source).toBe('convo_custom')
    expect(convoCustom.effective.outputMode).toBe('image_and_text')

    const followDefault = resolveEffectiveImageGenerationConfig({
      convoMeta: null,
      projectMeta,
      globalDefault,
    })
    expect(followDefault.source).toBe('project_default')
    expect(followDefault.effective.outputMode).toBe('image_only')

    const globalFallback = resolveEffectiveImageGenerationConfig({
      convoMeta: null,
      projectMeta: null,
      globalDefault,
    })
    expect(globalFallback.source).toBe('global_default')
    expect(globalFallback.effective).toEqual(globalDefault)
  })
})
