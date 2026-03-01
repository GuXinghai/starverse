import { describe, expect, it } from 'vitest'
import {
  hasSamplingParamsPatch,
  normalizeSamplingParamNumericValue,
  normalizeSamplingParamsLayer,
  resolveSamplingParams,
} from './samplingParamsResolver'

describe('samplingParamsResolver', () => {
  it('normalizes numeric values by type/range', () => {
    expect(normalizeSamplingParamNumericValue('temperature', 1.25)).toBe(1.25)
    expect(normalizeSamplingParamNumericValue('temperature', 3)).toBeNull()
    expect(normalizeSamplingParamNumericValue('top_k', 7.6)).toBe(8)
    expect(normalizeSamplingParamNumericValue('max_tokens', 0)).toBeNull()
    expect(normalizeSamplingParamNumericValue('seed', -1)).toBeNull()
  })

  it('normalizes layers and falls back invalid custom values to default mode', () => {
    const normalized = normalizeSamplingParamsLayer({
      temperature: { mode: 'custom', value: 1.1 },
      top_p: { mode: 'custom', value: 99 },
      top_k: { mode: 'custom', value: 5.4 },
      max_tokens: 512,
    })

    expect(normalized).toEqual({
      temperature: { mode: 'custom', value: 1.1 },
      top_p: { mode: 'default' },
      top_k: { mode: 'custom', value: 5 },
      max_tokens: { mode: 'custom', value: 512 },
    })
  })

  it('resolves precedence convo > project > global and only emits explicit custom values', () => {
    const resolved = resolveSamplingParams({
      convo: {
        temperature: { mode: 'default' },
        top_p: { mode: 'custom', value: 0.8 },
      },
      project: {
        temperature: { mode: 'custom', value: 0.4 },
        top_p: { mode: 'custom', value: 0.6 },
      },
      global: {
        temperature: { mode: 'custom', value: 0.2 },
        max_tokens: { mode: 'custom', value: 1200 },
      },
    })

    expect(resolved.requestPatch).toEqual({
      temperature: 0.4,
      top_p: 0.8,
      max_tokens: 1200,
    })
    expect(resolved.resolvedByKey.temperature).toMatchObject({ mode: 'custom', source: 'project', value: 0.4 })
    expect(resolved.resolvedByKey.top_p).toMatchObject({ mode: 'custom', source: 'convo', value: 0.8 })
    expect(resolved.resolvedByKey.max_tokens).toMatchObject({ mode: 'custom', source: 'global', value: 1200 })
    expect(resolved.resolvedByKey.seed).toMatchObject({ mode: 'default', source: 'openrouter_default' })
  })

  it('detects non-empty request patch', () => {
    expect(hasSamplingParamsPatch({})).toBe(false)
    expect(hasSamplingParamsPatch({ temperature: 0.9 })).toBe(true)
  })
})
