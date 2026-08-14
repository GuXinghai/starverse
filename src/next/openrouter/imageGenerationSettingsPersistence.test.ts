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
