import { describe, expect, it } from 'vitest'
import {
  extractConvoSamplingParamsOverride,
  extractProjectSamplingParamsDefaults,
  mergeConvoSamplingParamsOverrideMeta,
  mergeProjectSamplingParamsDefaultsMeta,
  resolveSamplingParamsFromStoredLayers,
} from './samplingParamsPersistence'

describe('samplingParamsPersistence', () => {
  it('extracts layer nodes from convo/project meta', () => {
    const project = extractProjectSamplingParamsDefaults({
      samplingParamsDefaults: {
        temperature: { mode: 'custom', value: 0.7 },
      },
    })
    const convo = extractConvoSamplingParamsOverride({
      samplingParamsOverride: {
        top_p: { mode: 'custom', value: 0.9 },
      },
    })

    expect(project).toEqual({
      temperature: { mode: 'custom', value: 0.7 },
    })
    expect(convo).toEqual({
      top_p: { mode: 'custom', value: 0.9 },
    })
  })

  it('merge helpers keep unrelated keys and drop all-default layers', () => {
    const projectMeta = mergeProjectSamplingParamsDefaultsMeta(
      { keep: 1, samplingParamsDefaults: { temperature: { mode: 'custom', value: 0.4 } } },
      { temperature: { mode: 'default' } }
    )
    const convoMeta = mergeConvoSamplingParamsOverrideMeta(
      { keep: 2 },
      {
        top_k: { mode: 'custom', value: 7 },
        top_p: { mode: 'default' },
      }
    )

    expect(projectMeta).toEqual({ keep: 1 })
    expect(convoMeta).toEqual({
      keep: 2,
      samplingParamsOverride: {
        top_k: { mode: 'custom', value: 7 },
      },
    })
  })

  it('resolves hierarchy from stored layers with inherit/default semantics', () => {
    const resolved = resolveSamplingParamsFromStoredLayers({
      convoMeta: {
        samplingParamsOverride: {
          temperature: { mode: 'default' },
          top_p: { mode: 'custom', value: 0.91 },
        },
      },
      projectMeta: {
        samplingParamsDefaults: {
          temperature: { mode: 'custom', value: 0.43 },
          top_p: { mode: 'custom', value: 0.55 },
        },
      },
      globalDefaults: {
        max_tokens: { mode: 'custom', value: 900 },
      },
    })

    expect(resolved.requestPatch).toEqual({
      temperature: 0.43,
      top_p: 0.91,
      max_tokens: 900,
    })
  })
})
