import { describe, expect, it } from 'vitest'
import { patchImageGenerationSemanticV2, projectImageSettingsToSemanticV2 } from './imageGenerationSemanticV2'
import { projectGenerationV2SemanticLayerToSessionConfig } from './generationV2SessionConfigProjection'
import { rememberTargetImageV2 } from '@/core/generation-v2/config/targetImagePreferencesV2'
import { decodeGenerationConfigLayerV2, projectGenerationConfigLayerV2 } from '@/core/generation-v2/config/generationConfigLayerV2'
const openAI = { providerId: 'openai_responses', endpointProfileId: 'openai', protocolContractId: 'openai-responses-v1', operation: 'text', modelId: 'gpt-4.1-mini' }
const gemini = { providerId: 'google_ai_studio', endpointProfileId: 'google', protocolContractId: 'gemini-interactions-v1beta', operation: 'image_generate', modelId: 'gemini-3.1-flash-image-preview' }
const config = { enabled: true, outputMode: 'image_and_text' as const, aspectRatio: '16:9', imageSize: '1K' as const, openAI: {
  toolModel: 'gpt-image-1', action: 'edit' as const, toolChoice: 'required' as const, size: '1536x1024', format: 'webp' as const, quality: 'high', background: 'transparent' as const,
  outputCompression: 76, partialImages: 2, inputFidelity: 'high' as const, moderation: 'low' as const,
} }
describe('image control semantic persistence bridge', () => {
  it('preserves canonical controls when an old conversation image setting is edited after reload', () => {
    const before = { schemaVersion: 2, generation: { temperature: 0.4 }, reasoning: { mode: 'disabled' },
      web: { mode: 'disabled' }, tools: { mode: 'disabled' }, providerExtension: { kind: 'openai_responses' },
      image: { mode: 'generate', format: 'webp' } }
    const hydrated = projectGenerationV2SemanticLayerToSessionConfig(JSON.parse(JSON.stringify(before)), 'openai_responses', openAI)
    expect(hydrated.patch.generationParams?.detail).not.toBeNull()
    const image = projectImageSettingsToSemanticV2({ ...config, openAI: { ...config.openAI, format: 'jpeg' } }, true)
    const saved = patchImageGenerationSemanticV2(before, image, openAI)
    expect(saved).not.toHaveProperty('requestedParameters')
    for (const key of ['generation', 'reasoning', 'web', 'tools', 'providerExtension'] as const) expect(saved[key]).toEqual(before[key])
    const explicit = { ...before, requestedParameters: { temperature: { mode: 'custom', value: 0.4, source: 'conversation' } } }
    expect(patchImageGenerationSemanticV2(explicit, image, openAI).requestedParameters).toEqual(explicit.requestedParameters)
  })

  it('restores Gemini protocol settings without recreating unrelated raw parameters', () => {
    const text = { ...gemini, protocolContractId: 'gemini-generate-content-v1beta', operation: 'text' }
    const before = { schemaVersion: 2, reasoning: { mode: 'enabled' },
      providerExtension: { kind: 'gemini_generate_content', thinkingMode: 'budget', thinkingBudget: 1024, includeThoughts: 'enabled' } }
    const savedImage = patchImageGenerationSemanticV2(before, { mode: 'generate', resolution: '1K' }, gemini, text)
    expect(savedImage.providerExtension).toEqual({ kind: 'gemini_interactions' })
    expect(savedImage.reasoning).toEqual(before.reasoning)
    expect(savedImage).not.toHaveProperty('requestedParameters')
    const restored = patchImageGenerationSemanticV2(savedImage, { mode: 'disabled' }, text)
    expect(restored.providerExtension).toEqual(before.providerExtension)
  })

  it('routes each provider’s controls and restores them after JSON reload and roundtrip switching', () => {
    const a = { schemaVersion: 2, image: projectImageSettingsToSemanticV2(config, true) }
    const g = { schemaVersion: 2, image: projectImageSettingsToSemanticV2(config, false) }
    expect(a.image).not.toHaveProperty('resolution')
    expect(g.image).not.toHaveProperty('toolModel')
    const saved = rememberTargetImageV2(rememberTargetImageV2({ schemaVersion: 2 }, a, openAI), g, gemini)
    const reloaded = projectGenerationConfigLayerV2(decodeGenerationConfigLayerV2(JSON.parse(JSON.stringify(saved))))
    const restoredA = projectGenerationV2SemanticLayerToSessionConfig(reloaded, 'openai_responses', openAI).patch.imageGeneration!
    const restoredG = projectGenerationV2SemanticLayerToSessionConfig(reloaded, 'google_ai_studio', gemini).patch.imageGeneration!
    expect(restoredA.detail?.openAI).toEqual(config.openAI)
    expect(restoredA.resolution).toBe('')
    expect(restoredG).toMatchObject({ enabled: true, resolution: '1K', aspectRatio: '16:9' })
    expect(projectImageSettingsToSemanticV2(restoredA.detail!, true)).toEqual(a.image)
    expect(projectImageSettingsToSemanticV2(restoredG.detail!, false)).toEqual(g.image)
  })
  it('omits default and preserves inactive compression preference for the encoder', () => {
    expect(projectImageSettingsToSemanticV2({ ...config, openAI: undefined }, true)).toEqual({ mode: 'generate' })
    expect(projectImageSettingsToSemanticV2({ ...config, openAI: { size: 'auto', format: 'png', outputCompression: 76 } }, true))
      .toEqual({ mode: 'generate', size: 'auto', format: 'png', outputCompression: 76 })
    expect(projectImageSettingsToSemanticV2({ ...config, enabled: false }, true)).toEqual({ mode: 'disabled' })
  })
})
