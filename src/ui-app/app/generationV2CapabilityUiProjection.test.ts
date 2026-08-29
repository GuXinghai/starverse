import { describe, expect, it } from 'vitest'
import type { GenerationControlsProjectionV2 } from '@/next/generation-v2/capability/resolvedCapabilityV2'
import { projectGeminiThinkingCapabilityV2 } from './generationV2CapabilityUiProjection'

function projection(path: string, control: Readonly<Record<string, unknown>>): GenerationControlsProjectionV2 {
  return { schemaVersion: 2, binding: {}, capabilityRevision: 'capability-revision:test',
    controls: { [path]: control } } as unknown as GenerationControlsProjectionV2
}

describe('Generation V2 capability UI projection', () => {
  it('uses the canonical rule default instead of enum ordering', () => {
    const result = projectGeminiThinkingCapabilityV2(projection('providerExtension.thinkingLevel', {
      visibility: 'visible', state: 'supported', domain: { kind: 'enum', values: ['high', 'low', 'medium'] },
      defaultValue: 'medium', constraints: [], evidenceIds: ['rule'],
    }), 'gemini-exact')
    expect(result).toMatchObject({ kind: 'level', defaultLevel: 'medium' })
  })

  it('does not infer off from a range that explicitly excludes zero', () => {
    const result = projectGeminiThinkingCapabilityV2(projection('providerExtension.thinkingBudget', {
      visibility: 'visible', state: 'supported',
      domain: { kind: 'range', min: -1, max: 32768, integer: true, excludedValues: [0] },
      defaultValue: -1, constraints: [], evidenceIds: ['rule'],
    }), 'gemini-exact')
    expect(result).toMatchObject({ kind: 'budget', allowDynamic: true, allowOff: false,
      defaultBudgetMode: 'dynamic' })
  })
})
