import { describe, expect, it } from 'vitest'
import { openrouterGenerationProfile } from './providerProfiles/openrouterGenerationProfile'
import {
  extractConvoGenerationParamsOverride,
  extractProjectGenerationParamsDefaults,
  mergeConvoGenerationParamsOverrideMeta,
  mergeProjectGenerationParamsDefaultsMeta,
  normalizeStoredGenerationParamsLayer,
  resolveGenerationParamsFromStoredLayers,
} from './generationParamPersistence'

describe('generationParamPersistence', () => {
  it('stores versioned generation params and keeps omit/custom settings', () => {
    expect(normalizeStoredGenerationParamsLayer({
      temperature: { mode: 'inherit' },
      topP: { mode: 'custom', value: 0.9 },
      maxOutputTokens: { mode: 'omit' },
    })).toEqual({
      version: 1,
      params: {
        topP: { mode: 'custom', value: 0.9 },
        maxOutputTokens: { mode: 'omit' },
      },
    })
  })

  it('extracts only new generation params meta keys', () => {
    const project = extractProjectGenerationParamsDefaults({
      samplingParamsDefaults: { temperature: { mode: 'custom', value: 0.1 } },
      generationParamsDefaults: {
        version: 1,
        params: { temperature: { mode: 'custom', value: 0.7 } },
      },
    })
    const convo = extractConvoGenerationParamsOverride({
      samplingParamsOverride: { top_p: { mode: 'custom', value: 0.3 } },
      generationParamsOverride: {
        version: 1,
        params: { topP: { mode: 'omit' } },
      },
    })

    expect(project).toEqual({ temperature: { mode: 'custom', value: 0.7 } })
    expect(convo).toEqual({ topP: { mode: 'omit' } })
  })

  it('merge helpers keep unrelated keys and remove empty layers', () => {
    const projectMeta = mergeProjectGenerationParamsDefaultsMeta(
      { keep: 1, generationParamsDefaults: { version: 1, params: { temperature: { mode: 'custom', value: 0.4 } } } },
      { temperature: { mode: 'inherit' } },
    )
    const convoMeta = mergeConvoGenerationParamsOverrideMeta(
      { keep: 2 },
      {
        topK: { mode: 'custom', value: 7 },
        topP: { mode: 'inherit' },
      },
    )

    expect(projectMeta).toEqual({ keep: 1 })
    expect(convoMeta).toEqual({
      keep: 2,
      generationParamsOverride: {
        version: 1,
        params: {
          topK: { mode: 'custom', value: 7 },
        },
      },
    })
  })

  it('resolves hierarchy from stored new keys and ignores old sampling keys', () => {
    const resolved = resolveGenerationParamsFromStoredLayers({
      profile: openrouterGenerationProfile,
      convoMeta: {
        samplingParamsOverride: {
          temperature: { mode: 'custom', value: 2 },
        },
        generationParamsOverride: {
          version: 1,
          params: {
            topP: { mode: 'custom', value: 0.91 },
          },
        },
      },
      projectMeta: {
        samplingParamsDefaults: {
          top_p: { mode: 'custom', value: 0.12 },
        },
        generationParamsDefaults: {
          version: 1,
          params: {
            temperature: { mode: 'custom', value: 0.43 },
            topP: { mode: 'custom', value: 0.55 },
          },
        },
      },
      globalDefaults: {
        version: 1,
        params: {
          maxOutputTokens: { mode: 'custom', value: 900 },
        },
      },
    })

    expect(resolved.errors).toEqual([])
    expect(resolved.requestParams).toEqual({
      temperature: 0.43,
      topP: 0.91,
      maxOutputTokens: 900,
    })
  })
})
