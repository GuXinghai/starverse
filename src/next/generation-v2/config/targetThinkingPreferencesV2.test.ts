import { describe, expect, it } from 'vitest'
import { rememberTargetThinkingV2, selectTargetThinkingV2, thinkingTargetKeyV2 } from '../../../core/generation-v2/config/targetThinkingPreferencesV2'
import { decodeGenerationConfigLayerV2, projectGenerationConfigLayerV2 } from '../../../core/generation-v2/config/generationConfigLayerV2'
import { mergeGenerationConfigLayersV2 } from '../../../core/generation-v2/config/resolveGenerationConfigV2'

const target = { providerId: 'google_ai_studio', endpointProfileId: 'gemini-developer-api-v1beta', protocolContractId: 'gemini-generate-content-v1beta', operation: 'text', modelId: 'gemini-2.5-flash' }
const budget = { schemaVersion: 2, reasoning: { mode: 'disabled' }, providerExtension: { kind: 'gemini_generate_content', thinkingMode: 'budget', thinkingBudget: 0, includeThoughts: 'provider_default' } }
const level = { schemaVersion: 2, reasoning: { mode: 'enabled' }, providerExtension: { kind: 'gemini_generate_content', thinkingMode: 'level', thinkingLevel: 'high', includeThoughts: 'enabled' } }
describe('binding scoped native thinking preferences', () => {
  it('restores an independently saved off/budget choice after editing a required Level target', () => {
    const pro = { ...target, modelId: 'gemini-3.1-pro-preview' }
    const first = rememberTargetThinkingV2({ schemaVersion: 2 }, budget, target)
    const second = rememberTargetThinkingV2(first, level, pro)
    const restored = projectGenerationConfigLayerV2(decodeGenerationConfigLayerV2(JSON.parse(JSON.stringify(second))))
    expect(selectTargetThinkingV2(restored, target)).toMatchObject(budget)
    expect(selectTargetThinkingV2(restored, pro)).toMatchObject(level)
    expect(mergeGenerationConfigLayersV2([decodeGenerationConfigLayerV2(restored)], target).reasoning).toEqual({ mode: 'disabled' })
    expect(restored.targetThinkingPreferences).toMatchObject({ currentKey: thinkingTargetKeyV2(pro), values: { [thinkingTargetKeyV2(target)]: { reasoning: { mode: 'disabled' } } } })
  })
  it('isolates protocol, operation, and endpoint; preserves unscoped originals without guessing origin', () => {
    const persisted = rememberTargetThinkingV2(level, budget, target)
    expect(persisted.targetThinkingPreferences.unscoped).toMatchObject({ providerExtension: level.providerExtension })
    for (const binding of [{ ...target, protocolContractId: 'gemini-interactions-v1beta', operation: 'image_generate' }, { ...target, endpointProfileId: 'other' }]) {
      expect(selectTargetThinkingV2(persisted, binding).providerExtension).toEqual({ kind: 'none' })
    }
    expect(() => decodeGenerationConfigLayerV2({ ...persisted, targetThinkingPreferences: { currentKey: '__proto__', values: {} } })).toThrow()
  })
})
