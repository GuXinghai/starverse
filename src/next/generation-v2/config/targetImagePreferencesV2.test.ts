import { describe, expect, it } from 'vitest'
import { rememberTargetImageV2, selectTargetImageV2 } from '../../../core/generation-v2/config/targetImagePreferencesV2'
import { decodeGenerationConfigLayerV2, projectGenerationConfigLayerV2 } from '../../../core/generation-v2/config/generationConfigLayerV2'
import { mergeGenerationConfigLayersV2 } from '../../../core/generation-v2/config/resolveGenerationConfigV2'
const openAI = { providerId: 'openai_responses', endpointProfileId: 'openai', protocolContractId: 'openai-responses-v1', operation: 'text', modelId: 'gpt-4.1-mini' }
const gemini = { providerId: 'google_ai_studio', endpointProfileId: 'google', protocolContractId: 'gemini-interactions-v1beta', operation: 'image_generate', modelId: 'gemini-3.1-flash-image-preview' }
const a = { schemaVersion: 2, image: { mode: 'generate', toolModel: 'gpt-image-1', size: 'auto', format: 'webp', outputCompression: 73, action: 'edit' } }
const g = { schemaVersion: 2, image: { mode: 'generate', resolution: '1K', aspectRatio: '16:9' } }
describe('provider image preference persistence', () => {
  it('roundtrips independent providers through strict config and request resolution', () => {
    const saved = rememberTargetImageV2(rememberTargetImageV2({ schemaVersion: 2 }, a, openAI), g, gemini)
    const layer = decodeGenerationConfigLayerV2(JSON.parse(JSON.stringify(saved)))
    const reloaded = projectGenerationConfigLayerV2(layer)
    expect(selectTargetImageV2(reloaded, openAI).image).toEqual(a.image)
    expect(selectTargetImageV2(reloaded, gemini).image).toEqual(g.image)
    expect(selectTargetImageV2(reloaded, { ...gemini, protocolContractId: 'gemini-generate-content-v1beta', operation: 'text' }).image).toEqual(g.image)
    expect(mergeGenerationConfigLayersV2([layer], openAI).image).toMatchObject(a.image)
    expect(mergeGenerationConfigLayersV2([layer], gemini).image).toMatchObject({ mode: 'generate', resolution: '1K' })
    expect(mergeGenerationConfigLayersV2([layer], gemini).image).not.toHaveProperty('toolModel')
  })
  it('preserves disabled settings and isolates unknown endpoints', () => {
    const saved = rememberTargetImageV2(rememberTargetImageV2({ schemaVersion: 2 }, a, openAI), { schemaVersion: 2, image: { mode: 'disabled' } }, openAI)
    expect(selectTargetImageV2(saved, openAI).image).toEqual({ mode: 'disabled' })
    expect(selectTargetImageV2(saved, { ...openAI, endpointProfileId: 'other' }).image).toEqual({ mode: 'disabled' })
    expect(JSON.stringify(saved)).toContain('gpt-image-1')
    expect(() => decodeGenerationConfigLayerV2({ ...saved, targetImagePreferences: { currentKey: '__proto__', values: {} } })).toThrow()
  })
})
