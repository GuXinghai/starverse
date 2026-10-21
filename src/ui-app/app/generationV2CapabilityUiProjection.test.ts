import { describe, expect, it } from 'vitest'
import type { GenerationControlsProjectionV2 } from '@/core/generation-v2/capability/resolvedCapabilityV2'
import { projectAnthropicThinkingCapabilityV2, projectGeminiThinkingCapabilityV2,
  projectOpenAIResponsesThinkingCapabilityV2 } from './generationV2CapabilityUiProjection'

function projection(path: string, control: Readonly<Record<string, unknown>>): GenerationControlsProjectionV2 {
  return { schemaVersion: 2, binding: {}, capabilityRevision: 'capability-revision:test',
    controls: { [path]: control } } as unknown as GenerationControlsProjectionV2
}

describe('Generation V2 capability UI projection', () => {
  it('keeps required Anthropic thinking on and disables its control', () => {
    const input = projection('reasoning.mode', { state: 'supported', domain: { kind: 'enum', values: ['enabled'] },
      defaultValue: 'enabled', constraints: [] })
    expect(projectAnthropicThinkingCapabilityV2(input)).toEqual({ supported: true, required: true, canDisable: false })
  })

  it('derives OpenAI Responses required state from none support, not a model-name heuristic', () => {
    const required = { ...projection('reasoning.effort', { state: 'supported', domain: { kind: 'enum', values: ['low', 'medium', 'high'] },
      defaultValue: 'medium', constraints: [] }), controls: {
      'reasoning.mode': { state: 'supported', domain: { kind: 'enum', values: ['enabled'] }, defaultValue: 'enabled', constraints: [] },
      'reasoning.effort': { state: 'supported', domain: { kind: 'enum', values: ['low', 'medium', 'high'] },
        defaultValue: 'medium', constraints: [] },
    } } as unknown as GenerationControlsProjectionV2
    const optional = { ...required, controls: { ...required.controls,
      'reasoning.mode': { state: 'supported', domain: { kind: 'enum', values: ['enabled', 'disabled'] },
        defaultValue: 'enabled', constraints: [] },
      'reasoning.effort': { state: 'supported', domain: { kind: 'enum', values: ['none', 'low', 'medium', 'high'] },
        defaultValue: 'medium', constraints: [] },
    } } as unknown as GenerationControlsProjectionV2
    const unknownEffortOptional = { ...required, controls: { ...required.controls,
      'reasoning.mode': { state: 'supported', domain: { kind: 'enum', values: ['enabled', 'disabled'] },
        defaultValue: 'enabled', constraints: [] },
      'reasoning.effort': { state: 'unknown', constraints: [] },
    } } as unknown as GenerationControlsProjectionV2
    expect(projectOpenAIResponsesThinkingCapabilityV2(required)).toEqual({ supported: true, required: true, canDisable: false })
    expect(projectOpenAIResponsesThinkingCapabilityV2(optional)).toEqual({ supported: true, required: false, canDisable: true })
    expect(projectOpenAIResponsesThinkingCapabilityV2(unknownEffortOptional)).toEqual({ supported: true, required: false, canDisable: true })
    expect(projectOpenAIResponsesThinkingCapabilityV2(null)).toEqual({ supported: false, required: false, canDisable: true })
  })

  it('evaluates Anthropic disabled-effort constraints against the selected effort', () => {
    const input = { ...projection('reasoning.mode', { state: 'supported', domain: { kind: 'enum', values: ['enabled', 'disabled'] },
      defaultValue: 'enabled', constraints: [{ kind: 'forbids_value', path: 'reasoning.effort', values: ['max', 'xhigh'],
        whenValues: ['disabled'] }] }), controls: {
      'reasoning.mode': { state: 'supported', domain: { kind: 'enum', values: ['enabled', 'disabled'] },
        defaultValue: 'enabled', constraints: [{ kind: 'forbids_value', path: 'reasoning.effort', values: ['max', 'xhigh'],
          whenValues: ['disabled'] }] },
      'reasoning.effort': { state: 'supported', domain: { kind: 'enum', values: ['low', 'medium', 'high', 'xhigh', 'max'] },
        defaultValue: 'high', constraints: [] },
    } } as unknown as GenerationControlsProjectionV2
    expect(projectAnthropicThinkingCapabilityV2(input, 'high')).toEqual({ supported: true, required: false, canDisable: true })
    expect(projectAnthropicThinkingCapabilityV2(input, 'xhigh')).toEqual({ supported: true, required: true, canDisable: false })
  })

  it('preserves disjoint sentinels and required-on policy independently of the fixed-budget interval', () => {
    const input = projection('providerExtension.thinkingBudget', { state: 'supported',
      domain: { kind: 'range', min: 512, max: 24576, integer: true, includedValues: [-1, 0] }, defaultValue: 0 })
    expect(projectGeminiThinkingCapabilityV2(input, 'lite')).toMatchObject({ kind: 'budget', minBudget: 512, allowDynamic: true, allowOff: true, defaultBudgetMode: 'off' })
    const required = { ...input, controls: { ...input.controls, 'reasoning.mode': { state: 'supported', domain: { kind: 'enum', values: ['enabled'] } } } } as unknown as GenerationControlsProjectionV2
    expect(projectGeminiThinkingCapabilityV2(required, 'pro')).toMatchObject({ required: true, defaultEnabled: true, allowOff: false })
  })
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
