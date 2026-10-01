import { describe, expect, it } from 'vitest'
import {
  modelFactMatchesFilter, modelFactPresentationState, modelFactSelectionReasonKey, modelFactStateKey,
  MODEL_FACT_PRESENTATION_STATES, type PresentableResolvedField,
} from './modelFactPresentation'
import { t } from '@/shared/i18n'

function field(overrides: Partial<PresentableResolvedField>): PresentableResolvedField {
  return { path: 'reasoning.support', state: 'unknown', completenessDisposition: 'unknown', selectionReason: 'no_effective_claim',
    supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [], ...overrides }
}

describe('model fact presentation mapping', () => {
  it('maps resolver output to the six user-facing states', () => {
    expect(modelFactPresentationState(field({ state: 'resolved', selectedValue: { kind: 'support', value: 'supported' } }))).toBe('supported')
    expect(modelFactPresentationState(field({ state: 'resolved', selectedValue: { kind: 'support', value: 'unsupported' } }))).toBe('unsupported')
    expect(modelFactPresentationState(field({ state: 'resolved', selectedValue: { kind: 'integer', value: 4 } }))).toBe('supported')
    expect(modelFactPresentationState(field({ state: 'conflict' }))).toBe('conflict')
    expect(modelFactPresentationState(field({ state: 'unknown' }))).toBe('unknown')
    expect(modelFactPresentationState(field({ state: 'unknown', diagnostics: [{ kind: 'invalid', errorCode: 'X' }] }))).toBe('data_gap')
    expect(modelFactPresentationState(field({ state: 'unknown' }), { coveredBySource: false })).toBe('no_source_coverage')
    expect(modelFactPresentationState(field({ state: 'unknown' }), { coveredBySource: true })).toBe('unknown')
  })

  it('never lets diagnostics turn a resolved or conflict field into a different verdict', () => {
    const diagnostics = [{ kind: 'missing' }]
    expect(modelFactPresentationState(field({ state: 'resolved', selectedValue: { kind: 'support', value: 'supported' }, diagnostics }))).toBe('supported')
    expect(modelFactPresentationState(field({ state: 'conflict', diagnostics }))).toBe('conflict')
  })

  it('does not present a data gap or missing coverage as unsupported', () => {
    expect(modelFactPresentationState(field({ diagnostics: [{ kind: 'missing' }] }))).not.toBe('unsupported')
    expect(modelFactPresentationState(field({}), { coveredBySource: false })).not.toBe('unsupported')
  })

  it('has localized text for every state and selection reason in both locales', () => {
    for (const state of MODEL_FACT_PRESENTATION_STATES) {
      expect(t(modelFactStateKey(state))).not.toBe(modelFactStateKey(state))
    }
    for (const reason of ['higher_priority_claim', 'lower_priority_fill', 'explicit_over_derived', 'partial_supplementation',
      'equal_priority_conflict', 'no_effective_claim', 'single_claim', 'something_new']) {
      const key = modelFactSelectionReasonKey(reason)
      expect(t(key)).not.toBe(key)
      expect(t(key)).not.toBe(reason)
    }
  })

  it('filters by presentation state and diagnostics only', () => {
    const conflict = field({ state: 'conflict' })
    const gap = field({ diagnostics: [{ kind: 'invalid' }] })
    const supported = field({ state: 'resolved', selectedValue: { kind: 'support', value: 'supported' } })
    expect(modelFactMatchesFilter('conflict', conflict)).toBe(true)
    expect(modelFactMatchesFilter('conflict', supported)).toBe(false)
    expect(modelFactMatchesFilter('unknown', gap)).toBe(true)
    expect(modelFactMatchesFilter('unknown', field({}), { coveredBySource: false })).toBe(true)
    expect(modelFactMatchesFilter('unknown', supported)).toBe(false)
    expect(modelFactMatchesFilter('diagnostics', gap)).toBe(true)
    expect(modelFactMatchesFilter('diagnostics', conflict)).toBe(false)
    expect(modelFactMatchesFilter('all', supported)).toBe(true)
  })
})
