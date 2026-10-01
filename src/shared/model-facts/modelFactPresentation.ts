/**
 * Presentation-only mapping from Goal 3 resolved Model Facts to the shared user-facing vocabulary.
 *
 * Reads existing resolver output (state, selectionReason, provenance, diagnostics); it never picks a
 * winner, never resolves, and nothing here feeds capabilityRevision or the publication path.
 * Inspector, capability-aware controls, and Source Priority UI must reuse this instead of
 * re-interpreting resolved facts.
 */

export type ModelFactPresentationState =
  | 'supported'
  | 'unsupported'
  | 'unknown'
  | 'conflict'
  | 'data_gap'
  | 'no_source_coverage'

export const MODEL_FACT_PRESENTATION_STATES: readonly ModelFactPresentationState[] = Object.freeze([
  'supported', 'unsupported', 'unknown', 'conflict', 'data_gap', 'no_source_coverage',
])

export type ModelFactPresentationTone = 'positive' | 'negative' | 'neutral' | 'warning' | 'attention'

const TONE_BY_STATE: Readonly<Record<ModelFactPresentationState, ModelFactPresentationTone>> = Object.freeze({
  supported: 'positive',
  unsupported: 'negative',
  unknown: 'neutral',
  conflict: 'warning',
  data_gap: 'attention',
  no_source_coverage: 'neutral',
})

const KNOWN_SELECTION_REASONS = Object.freeze([
  'no_effective_claim', 'single_claim', 'higher_priority_claim', 'lower_priority_fill',
  'explicit_over_derived', 'partial_supplementation', 'equal_priority_conflict',
] as const)

const KNOWN_COMPLETENESS = Object.freeze(['complete', 'partial', 'partial_bounds', 'not_applicable', 'unknown'] as const)

const I18N_PREFIX = 'settings.modelsCapabilities.facts'

/** Structural subset of ResolvedModelFactFieldV1; kept local so the renderer imports no resolver code. */
export type PresentableProvenance = Readonly<{
  sourceKind?: string
  sourcePriority?: number
  sourceAssertion?: Readonly<{ value?: unknown; provenance?: Readonly<{ assertionKind?: string; claimId?: string }> }>
}>
export type PresentableDiagnostic = Readonly<{ sourceKind?: string; path?: string; kind?: string; errorCode?: string }>
export type PresentableCandidate = Readonly<{ value?: unknown; provenance?: readonly PresentableProvenance[] }>
export type PresentableResolvedField = Readonly<{
  path: string
  state: string
  selectedValue?: unknown
  completenessDisposition: string
  selectionReason: string
  supportingProvenance: readonly PresentableProvenance[]
  opposingProvenance: readonly PresentableProvenance[]
  overriddenProvenance: readonly PresentableProvenance[]
  diagnostics: readonly PresentableDiagnostic[]
  candidates?: readonly PresentableCandidate[]
}>

/** Source-local coverage for one path, supplied by the caller from already-published source rows. */
export type ModelFactSourceCoverage = Readonly<{ coveredBySource: boolean }>

export function modelFactPresentationState(
  field: Pick<PresentableResolvedField, 'state' | 'selectedValue' | 'diagnostics' | 'supportingProvenance' | 'opposingProvenance'>,
  coverage?: ModelFactSourceCoverage,
): ModelFactPresentationState {
  if (field.state === 'conflict') return 'conflict'
  if (field.state === 'resolved') {
    const value = field.selectedValue as { kind?: string; value?: unknown } | undefined
    return value?.kind === 'support' && value.value === 'unsupported' ? 'unsupported' : 'supported'
  }
  // Anything the resolver did not resolve is unknown; diagnostics / coverage only refine the explanation.
  if (field.diagnostics.length > 0) return 'data_gap'
  if (coverage && !coverage.coveredBySource) return 'no_source_coverage'
  return 'unknown'
}

export function modelFactPresentationTone(state: ModelFactPresentationState): ModelFactPresentationTone {
  return TONE_BY_STATE[state]
}

export function modelFactStateKey(state: ModelFactPresentationState): string {
  return `${I18N_PREFIX}.state.${state}`
}

export function modelFactStateExplanationKey(state: ModelFactPresentationState): string {
  return `${I18N_PREFIX}.stateExplanation.${state}`
}

export function modelFactSelectionReasonKey(reason: string): string {
  return `${I18N_PREFIX}.selectionReason.${(KNOWN_SELECTION_REASONS as readonly string[]).includes(reason) ? reason : 'unrecognized'}`
}

export function modelFactCompletenessKey(completeness: string): string {
  return `${I18N_PREFIX}.completeness.${(KNOWN_COMPLETENESS as readonly string[]).includes(completeness) ? completeness : 'unrecognized'}`
}

export function modelFactSourceKindKey(sourceKind: string | undefined): string {
  return `${I18N_PREFIX}.sourceKind.${sourceKind === 'provider_native' || sourceKind === 'models_dev' || sourceKind === 'capability_rule' ? sourceKind : 'unrecognized'}`
}

export function modelFactDiagnosticKindKey(kind: string | undefined): string {
  return `${I18N_PREFIX}.diagnosticKind.${kind === 'missing' || kind === 'invalid' ? kind : 'unrecognized'}`
}

export function modelFactAssertionKindKey(kind: string | undefined): string {
  return `${I18N_PREFIX}.assertionKind.${kind === 'explicit' || kind === 'derived' ? kind : 'unrecognized'}`
}

export function modelFactValueText(value: unknown): string | null {
  if (value === undefined) return null
  try { return JSON.stringify(value) } catch { return String(value) }
}

export type ModelFactFilter = 'all' | 'conflict' | 'unknown' | 'diagnostics'

/** Filters a resolved field by its resolver-derived presentation state; no value comparison. */
export function modelFactMatchesFilter(
  filter: ModelFactFilter,
  field: Pick<PresentableResolvedField, 'state' | 'selectedValue' | 'diagnostics' | 'supportingProvenance' | 'opposingProvenance'>,
  coverage?: ModelFactSourceCoverage,
): boolean {
  if (filter === 'all') return true
  if (filter === 'diagnostics') return field.diagnostics.length > 0
  const state = modelFactPresentationState(field, coverage)
  if (filter === 'conflict') return state === 'conflict'
  return state === 'unknown' || state === 'data_gap' || state === 'no_source_coverage'
}
