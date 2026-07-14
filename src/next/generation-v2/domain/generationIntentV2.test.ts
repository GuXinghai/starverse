import { describe, expect, it } from 'vitest'
import { decodeGenerationIntentLayerV2, readImageAspectRatioV2 } from './generationIntentV2'

const hash = 'a'.repeat(64)

describe('GenerationIntentLayerV2 codec', () => {
  it('preserves omitted inheritance and explicit disabled values', () => {
    const sparse = decodeGenerationIntentLayerV2({ schemaVersion: 2, reasoning: { mode: 'disabled' } })
    expect(sparse).toEqual({ schemaVersion: 2, reasoning: { mode: 'disabled' } })
    expect('web' in sparse).toBe(false)
    expect(Object.isFrozen(sparse)).toBe(true)
    expect(Object.isFrozen(sparse.reasoning)).toBe(true)
  })

  it('decodes closed semantic leaves into branded immutable references', () => {
    const intent = decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      generation: { temperature: 0.4, maxOutputTokens: 512, stop: ['END'] },
      reasoning: { mode: 'enabled', effort: 'medium', summary: 'auto' },
      web: { mode: 'provider_search', types: ['image', 'web'] },
      image: { mode: 'generate', aspectRatio: '1:1', resolution: '2K', quality: 'high', format: 'png', outputCompression: 80, stream: true },
      tools: { mode: 'enabled', allowedToolIds: ['search', 'calculator'], sideEffectConfirmation: 'required_each_retry' },
      attachments: [{
        assetId: 'asset-1', assetRevisionId: 'rev-1', assetSha256: hash, include: true,
        sendAs: 'provider_file', conversion: 'none',
      }],
      providerExtension: { kind: 'none' },
    })
    expect(intent.tools?.mode).toBe('enabled')
    expect(intent.attachments?.[0].assetId.value).toBe('asset-1')
    expect(intent.providerExtension?.kind).toBe('none')
    expect(intent.web).toEqual({ mode: 'provider_search', types: ['web', 'image'] })
    expect(intent.image?.mode === 'generate' && readImageAspectRatioV2(intent.image.aspectRatio!)).toBe('1:1')
    expect(intent.tools?.mode === 'enabled' && intent.tools.allowedToolIds.map((item) => item.value))
      .toEqual(['calculator', 'search'])
    expect(Object.isFrozen(intent.attachments)).toBe(true)
    expect(Object.isFrozen(intent.providerExtension)).toBe(true)
  })

  it('rejects unknown, legacy wire, null, accessor and invalid disabled fields', () => {
    for (const value of [
      { schemaVersion: 2, requestPatch: {} },
      { schemaVersion: 2, generation: { advancedJson: '{}' } },
      { schemaVersion: 2, reasoning: null },
      { schemaVersion: 2, reasoning: { mode: 'disabled', effort: 'low' } },
      { schemaVersion: 2, providerExtension: { kind: 'unknown' } },
      { schemaVersion: 2, providerExtension: { kind: 'openrouter_images', options: [{ key: 'apiKey', value: 'secret' }] } },
      { schemaVersion: 2, generation: { temperature: undefined } },
    ]) expect(() => decodeGenerationIntentLayerV2(value)).toThrow()
    let getterCalls = 0
    const input = Object.defineProperty({ schemaVersion: 2 }, 'reasoning', {
      enumerable: true,
      get: () => { getterCalls += 1; return { mode: 'enabled' } },
    })
    expect(() => decodeGenerationIntentLayerV2(input)).toThrow('GENERATION_V2_INTENT_INVALID_SHAPE')
    expect(getterCalls).toBe(0)
  })

  it('rejects duplicate tools, attachments and provider options', () => {
    expect(() => decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      tools: { mode: 'enabled', allowedToolIds: ['search', 'search'], sideEffectConfirmation: 'required_each_retry' },
    })).toThrow('GENERATION_V2_INTENT_DUPLICATE_VALUE')
    expect(() => decodeGenerationIntentLayerV2({
      schemaVersion: 2,
      attachments: [
        { assetId: 'a', assetRevisionId: 'r', assetSha256: hash, include: true, sendAs: 'provider_file', conversion: 'none' },
        { assetId: 'a', assetRevisionId: 'r', assetSha256: hash, include: false, sendAs: 'inline_text', conversion: 'plain_text' },
      ],
    })).toThrow('GENERATION_V2_INTENT_DUPLICATE_VALUE')
    expect(() => decodeGenerationIntentLayerV2({ schemaVersion: 2, generation: { stop: ['END', 'END'] } }))
      .toThrow('GENERATION_V2_INTENT_DUPLICATE_VALUE')
  })

  it('rejects sparse, accessor, extended and symbol-bearing arrays without invoking getters', () => {
    const sparse = new Array(1)
    const extended = ['web'] as unknown[] & { extra?: boolean }
    extended.extra = true
    const symbolArray = ['web'] as unknown[] & { [key: symbol]: boolean }
    symbolArray[Symbol('hidden')] = true
    let calls = 0
    const accessor: unknown[] = []
    Object.defineProperty(accessor, '0', { enumerable: true, get: () => { calls += 1; return 'web' } })
    Object.defineProperty(accessor, 'length', { value: 1, writable: true })
    for (const types of [sparse, extended, symbolArray, accessor]) {
      expect(() => decodeGenerationIntentLayerV2({ schemaVersion: 2, web: { mode: 'provider_search', types } }))
        .toThrow('GENERATION_V2_INTENT_INVALID_SHAPE')
    }
    expect(calls).toBe(0)
  })

  it('rejects invalid common numeric domains', () => {
    for (const generation of [
      { seed: 1.5 }, { seed: Number.MAX_SAFE_INTEGER + 1 }, { topP: -0.1 }, { topP: 1.1 },
      { temperature: -1 }, { repetitionPenalty: 0 },
    ]) expect(() => decodeGenerationIntentLayerV2({ schemaVersion: 2, generation })).toThrow('GENERATION_V2_INTENT_INVALID_VALUE')
    expect(() => decodeGenerationIntentLayerV2({ schemaVersion: 2, image: { mode: 'generate', outputCompression: 101 } }))
      .toThrow('GENERATION_V2_INTENT_INVALID_VALUE')
  })

  it('preserves descriptor-defined positive aspect ratios without a hardcoded value union', () => {
    for (const aspectRatio of ['auto', '1:2', '2:1', '9:21', '37:11']) {
      const intent = decodeGenerationIntentLayerV2({ schemaVersion: 2, image: { mode: 'generate', aspectRatio } })
      expect(intent.image?.mode === 'generate' && readImageAspectRatioV2(intent.image.aspectRatio!)).toBe(aspectRatio)
    }
    for (const aspectRatio of ['0:1', '1:0', '01:1', '1:01', '1', '1:2:3', '100000:1']) {
      expect(() => decodeGenerationIntentLayerV2({ schemaVersion: 2, image: { mode: 'generate', aspectRatio } }))
        .toThrow('GENERATION_V2_INTENT_INVALID_VALUE')
    }
  })
})
