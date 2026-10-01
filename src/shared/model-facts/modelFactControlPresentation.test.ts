import { describe, expect, it } from 'vitest'
import { modelFactControlKey, modelFactControlPresentation, type PresentableResolvedField } from './modelFactPresentation'
import { t } from '@/shared/i18n'

function field(path: string, overrides: Partial<PresentableResolvedField> = {}): PresentableResolvedField {
  return { path, state: 'unknown', completenessDisposition: 'unknown', selectionReason: 'no_effective_claim',
    supportingProvenance: [], opposingProvenance: [], overriddenProvenance: [], diagnostics: [], ...overrides }
}

const EFFORT_PATHS = ['reasoning.effort.nativeValues', 'generation.effort.nativeValues', 'reasoning.effort.providerDefault'] as const

function present(controlState: string | undefined, fields: readonly PresentableResolvedField[], covered: readonly string[] = EFFORT_PATHS) {
  const byPath = new Map(fields.map((item) => [item.path, item]))
  return modelFactControlPresentation({
    controlState,
    sourcePaths: EFFORT_PATHS,
    resolvedFieldFor: (path) => byPath.get(path),
    coverageFor: (path) => ({ coveredBySource: covered.includes(path) }),
  })
}

describe('model fact control presentation', () => {
  it('keeps the projection authoritative for unsupported and points at the deciding path', () => {
    const result = present('unsupported', [
      field('reasoning.effort.nativeValues'),
      field('generation.effort.nativeValues', { state: 'resolved', selectedValue: { kind: 'support', value: 'unsupported' } }),
    ])
    expect(result).toEqual({ state: 'unsupported', path: 'generation.effort.nativeValues', mapped: true })
  })

  it('presents conflict at the conflicting path even when another path has diagnostics', () => {
    const result = present('conflict', [
      field('reasoning.effort.nativeValues', { diagnostics: [{ kind: 'missing' }] }),
      field('reasoning.effort.providerDefault', { state: 'conflict' }),
    ])
    expect(result).toEqual({ state: 'conflict', path: 'reasoning.effort.providerDefault', mapped: true })
  })

  it('refines only unknown into data gap, no source coverage or unknown', () => {
    expect(present('unknown', [field('generation.effort.nativeValues', { diagnostics: [{ kind: 'invalid', errorCode: 'E' }] })]))
      .toEqual({ state: 'data_gap', path: 'generation.effort.nativeValues', mapped: true })
    expect(present('unknown', EFFORT_PATHS.map((path) => field(path)), []))
      .toEqual({ state: 'no_source_coverage', path: 'reasoning.effort.nativeValues', mapped: true })
    expect(present('unknown', EFFORT_PATHS.map((path) => field(path)), ['generation.effort.nativeValues']))
      .toEqual({ state: 'unknown', path: 'reasoning.effort.nativeValues', mapped: true })
    // Supported never becomes a data gap because of diagnostics on a sibling path.
    expect(present('supported', [
      field('reasoning.effort.nativeValues', { diagnostics: [{ kind: 'missing' }] }),
      field('reasoning.effort.providerDefault', { state: 'resolved', selectedValue: { kind: 'native_string', value: 'high' } }),
    ])).toEqual({ state: 'supported', path: 'reasoning.effort.providerDefault', mapped: true })
  })

  it('stays plain unknown without resolved fields and never guesses coverage', () => {
    expect(modelFactControlPresentation({ controlState: 'unknown', sourcePaths: EFFORT_PATHS }))
      .toEqual({ state: 'unknown', path: 'reasoning.effort.nativeValues', mapped: true })
    expect(modelFactControlPresentation({ controlState: 'missing', sourcePaths: EFFORT_PATHS }))
      .toEqual({ state: 'data_gap', path: 'reasoning.effort.nativeValues', mapped: true })
  })

  it('reports no Model Facts path for controls no source path feeds', () => {
    expect(modelFactControlPresentation({ controlState: 'unknown', sourcePaths: [] }))
      .toEqual({ state: 'unknown', path: null, mapped: false })
    expect(modelFactControlPresentation({ controlState: 'unsupported', sourcePaths: [] }))
      .toEqual({ state: 'unsupported', path: null, mapped: false })
  })

  it('has localized control strings', () => {
    for (const key of ['checking', 'refreshFailed', 'noModelFactsField', 'notInDomain', 'notVerified',
      'notVerifiedExplanation', 'inspect', 'unavailableSummary', 'reasonLine'] as const) {
      expect(t(modelFactControlKey(key))).not.toBe(modelFactControlKey(key))
    }
  })
})
