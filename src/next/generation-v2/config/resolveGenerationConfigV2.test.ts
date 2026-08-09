import { describe, expect, it } from 'vitest'
import { decodeGenerationConfigLayerV2 } from './generationConfigLayerV2'
import {
  DEFAULT_RESOLVED_GENERATION_INTENT_V2,
  mergeGenerationConfigLayersV2,
} from './resolveGenerationConfigV2'

describe('Generation Config V2 scope semantics', () => {
  it('uses one complete default and replaces explicit top-level semantic groups atomically', () => {
    expect(DEFAULT_RESOLVED_GENERATION_INTENT_V2).toEqual({
      schemaVersion: 2,
      generation: {},
      reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' },
      image: { mode: 'disabled' },
      tools: { mode: 'disabled' },
      attachments: [],
      providerExtension: { kind: 'none' },
    })
    const resolved = mergeGenerationConfigLayersV2([
      decodeGenerationConfigLayerV2({
        schemaVersion: 2,
        generation: { temperature: 0.7, topP: 0.9, stop: ['GLOBAL'] },
        reasoning: { mode: 'enabled', effort: 'high' },
        image: { mode: 'generate', resolution: '2K', quality: 'high' },
      }),
      decodeGenerationConfigLayerV2({
        schemaVersion: 2,
        generation: {},
        reasoning: { mode: 'enabled', summary: 'concise' },
        image: { mode: 'generate', quality: 'low' },
      }),
      decodeGenerationConfigLayerV2({ schemaVersion: 2, reasoning: { mode: 'disabled' } }),
    ])
    expect(resolved.generation).toEqual({})
    expect(resolved.reasoning).toEqual({ mode: 'disabled' })
    expect(resolved.image).toEqual({ mode: 'generate', quality: 'low' })
  })

  it('treats arrays and toolChoice omitted as replacement values, never merge sentinels', () => {
    const resolved = mergeGenerationConfigLayersV2([
      decodeGenerationConfigLayerV2({
        schemaVersion: 2,
        generation: { stop: ['A', 'B'] },
        tools: {
          mode: 'enabled', allowedToolIds: ['tool:a'], toolChoice: { mode: 'required' },
          sideEffectConfirmation: 'required_each_retry',
        },
      }),
      decodeGenerationConfigLayerV2({
        schemaVersion: 2,
        generation: { stop: ['C'] },
        tools: {
          mode: 'enabled', allowedToolIds: ['tool:b'], toolChoice: { mode: 'omitted' },
          sideEffectConfirmation: 'required_each_retry',
        },
      }),
    ])
    expect(resolved.generation.stop).toEqual(['C'])
    expect(resolved.tools.mode === 'enabled' && resolved.tools.allowedToolIds.map((item) => item.value))
      .toEqual(['tool:b'])
    expect(resolved.tools.mode === 'enabled' && resolved.tools.toolChoice.mode).toBe('omitted')
  })

  it('forbids attachments in inherited scope configuration', () => {
    expect(() => decodeGenerationConfigLayerV2({ schemaVersion: 2, attachments: [] }))
      .toThrow('GENERATION_V2_CONFIG_ATTACHMENTS_NOT_SCOPE_CONFIG')
  })
})
