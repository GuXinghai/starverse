import {
  CANONICAL_MODEL_FACT_PATHS_V1,
  canonicalizeCanonicalFactValueV1,
  canonicalSourceFactDigestV1,
  type CanonicalFactAssertionV1,
  type CanonicalFactValueV1,
  type CanonicalSemanticPathV1,
  type CanonicalSourceKindV1,
} from './canonicalSourceFactsV1'
import {
  buildResolvedModelFactsV1,
  canonicalizeModelFactsResolutionInputV1,
  type ModelFactsResolutionInputV1,
  type ModelFactsSourceInputV1,
  type ResolvedModelFactCompletenessV1,
  type ResolvedModelFactFieldV1,
  type ResolvedModelFactProvenanceV1,
} from './resolvedModelFactsV1'
import {
  decodeSourcePriorityConfigV1,
  type SourcePriorityConfigV1,
} from './sourcePriorityConfigV1'

export class ModelFactsResolverV1Error extends Error {
  constructor(readonly code: 'GENERATION_V2_MODEL_FACTS_RESOLUTION_INVALID') {
    super(code)
    this.name = 'ModelFactsResolverV1Error'
  }
}

export type ResolveModelFactsV1Input = Readonly<{
  resolutionInput: ModelFactsResolutionInputV1
  sourcePriorityConfig: SourcePriorityConfigV1
}>

type SourceSlot = Readonly<{
  kind: CanonicalSourceKindV1
  input: ModelFactsSourceInputV1
  priority: number
}>

type Claim = Readonly<{
  assertion: CanonicalFactAssertionV1
  provenance: ResolvedModelFactProvenanceV1
  completenessDisposition: ResolvedModelFactCompletenessV1
}>

const SOURCE_SLOTS = Object.freeze([
  Object.freeze({ key: 'providerNative' as const, kind: 'provider_native' as const }),
  Object.freeze({ key: 'modelsDev' as const, kind: 'models_dev' as const }),
  Object.freeze({ key: 'capabilityRules' as const, kind: 'capability_rule' as const }),
])

function invalid(): never {
  throw new ModelFactsResolverV1Error('GENERATION_V2_MODEL_FACTS_RESOLUTION_INVALID')
}

function valueKey(value: CanonicalFactValueV1): string {
  return canonicalSourceFactDigestV1(value)
}

function completeness(value: CanonicalFactValueV1): ResolvedModelFactCompletenessV1 {
  if (value.kind === 'native_string_set' || value.kind === 'media_kind_set' ||
      value.kind === 'operation_kind_set' || value.kind === 'aspect_ratio_set' ||
      value.kind === 'dimensions_set') return value.completeness
  if (value.kind === 'integer_domain') return value.completeness
  return 'complete'
}

function sourceSlots(input: ModelFactsResolutionInputV1, config: SourcePriorityConfigV1): readonly SourceSlot[] {
  return Object.freeze(SOURCE_SLOTS.map((slot) => Object.freeze({
    kind: slot.kind,
    input: input.sources[slot.key],
    priority: config.priorities[slot.kind],
  })))
}

function claimsForPath(slot: SourceSlot, path: CanonicalSemanticPathV1): readonly Claim[] {
  if (slot.input.kind === 'absent') return Object.freeze([])
  const claims: Claim[] = []
  for (const outcome of slot.input.payload.outcomes) {
    if (outcome.path !== path || !outcome.effectiveAssertion) continue
    claims.push(Object.freeze({
      assertion: outcome.effectiveAssertion,
      provenance: Object.freeze({
        sourceKind: slot.kind,
        sourceFactRef: slot.input.ref,
        sourceAssertion: outcome.effectiveAssertion,
        sourcePriority: slot.priority,
      }),
      completenessDisposition: completeness(outcome.effectiveAssertion.value),
    }))
  }
  return Object.freeze(claims)
}

function sourceLocalClaims(slot: SourceSlot, path: CanonicalSemanticPathV1): Readonly<{
  selected: readonly Claim[]
  overridden: readonly Claim[]
}> {
  const claims = claimsForPath(slot, path)
  if (claims.length < 2) return Object.freeze({ selected: claims, overridden: Object.freeze([]) })
  if (slot.kind === 'capability_rule') {
    const exact = claims.filter((claim) => claim.assertion.provenance.ruleClaim?.selectorKind === 'exact')
    const selectorClaims = exact.length > 0 ? exact : claims
    const maxRulePriority = Math.max(...selectorClaims.map((claim) =>
      claim.assertion.provenance.ruleClaim?.effectiveRulePriority ?? 0))
    const selected = selectorClaims.filter((claim) =>
      (claim.assertion.provenance.ruleClaim?.effectiveRulePriority ?? 0) === maxRulePriority)
    return Object.freeze({ selected: Object.freeze(selected),
      overridden: Object.freeze(claims.filter((claim) => !selected.includes(claim))) })
  }
  const explicit = claims.filter((claim) => claim.assertion.provenance.assertionKind === 'explicit')
  const selected = explicit.length > 0 ? explicit : claims
  return Object.freeze({ selected: Object.freeze(selected),
    overridden: Object.freeze(claims.filter((claim) => !selected.includes(claim))) })
}

function diagnosticForOutcome(
  slot: SourceSlot,
  path: CanonicalSemanticPathV1,
): ResolvedModelFactFieldV1['diagnostics'] {
  if (slot.input.kind === 'absent') return Object.freeze([])
  const diagnostics: ResolvedModelFactFieldV1['diagnostics'][number][] = []
  for (const outcome of slot.input.payload.outcomes) {
    if (outcome.path !== path || outcome.currentObservation.kind === 'present_valid') continue
    diagnostics.push(Object.freeze({
      sourceKind: slot.kind,
      sourceFactRef: slot.input.ref,
      path,
      kind: outcome.currentObservation.kind,
      ...(outcome.currentObservation.kind === 'invalid' ? { errorCode: outcome.currentObservation.errorCode } : {}),
      observationProvenance: outcome.currentObservation.provenance,
    }))
  }
  return Object.freeze(diagnostics)
}

function sortedClaims(claims: readonly Claim[]): readonly Claim[] {
  return Object.freeze([...claims].sort((left, right) => {
    const priorityDifference = right.provenance.sourcePriority - left.provenance.sourcePriority
    if (priorityDifference !== 0) return priorityDifference
    const explicitDifference = Number(left.assertion.provenance.assertionKind === 'derived') -
      Number(right.assertion.provenance.assertionKind === 'derived')
    if (explicitDifference !== 0) return explicitDifference
    return valueKey(left.assertion.value).localeCompare(valueKey(right.assertion.value), 'en')
  }))
}

function partialSupplement(
  path: CanonicalSemanticPathV1,
  claims: readonly Claim[],
): Readonly<{ value: CanonicalFactValueV1; claims: readonly Claim[] }> | null {
  if (claims.length < 2 || claims.some((claim) =>
      claim.completenessDisposition !== 'partial' && claim.completenessDisposition !== 'partial_bounds' ||
      claim.assertion.provenance.assertionKind !== 'explicit')) return null
  const kinds = new Set(claims.map((claim) => claim.assertion.value.kind))
  if (kinds.size !== 1) return null
  const first = claims[0].assertion.value
  if (first.kind === 'native_string_set') {
    const values = [...new Set(claims.flatMap((claim) => claim.assertion.value.kind === 'native_string_set'
      ? claim.assertion.value.values : []))].sort()
    return Object.freeze({ value: canonicalizeCanonicalFactValueV1(path,
      { kind: 'native_string_set', values, completeness: 'partial' }), claims })
  }
  if (first.kind === 'media_kind_set') {
    const values = [...new Set(claims.flatMap((claim) => claim.assertion.value.kind === 'media_kind_set'
      ? claim.assertion.value.values : []))].sort()
    return Object.freeze({ value: canonicalizeCanonicalFactValueV1(path,
      { kind: 'media_kind_set', values, completeness: 'partial' }), claims })
  }
  if (first.kind === 'operation_kind_set') {
    const values = [...new Set(claims.flatMap((claim) => claim.assertion.value.kind === 'operation_kind_set'
      ? claim.assertion.value.values : []))].sort()
    return Object.freeze({ value: canonicalizeCanonicalFactValueV1(path,
      { kind: 'operation_kind_set', values, completeness: 'partial' }), claims })
  }
  if (first.kind === 'aspect_ratio_set') {
    const values = [...new Map(claims.flatMap((claim) => claim.assertion.value.kind === 'aspect_ratio_set'
      ? claim.assertion.value.values.map((value) => [`${value.width}:${value.height}`, value] as const) : [])).values()]
      .sort((left, right) => left.width - right.width || left.height - right.height)
    return Object.freeze({ value: canonicalizeCanonicalFactValueV1(path,
      { kind: 'aspect_ratio_set', values, completeness: 'partial' }), claims })
  }
  if (first.kind === 'dimensions_set') {
    const values = [...new Map(claims.flatMap((claim) => claim.assertion.value.kind === 'dimensions_set'
      ? claim.assertion.value.values.map((value) => [`${value.width}:${value.height}`, value] as const) : [])).values()]
      .sort((left, right) => left.width - right.width || left.height - right.height)
    return Object.freeze({ value: canonicalizeCanonicalFactValueV1(path,
      { kind: 'dimensions_set', values, completeness: 'partial' }), claims })
  }
  if (first.kind === 'integer_domain') {
    const domains = claims.map((claim) => claim.assertion.value).filter((value): value is Extract<CanonicalFactValueV1, { kind: 'integer_domain' }> =>
      value.kind === 'integer_domain')
    if (domains.length !== claims.length || new Set(domains.map((domain) => domain.unit ?? '')).size > 1) return null
    const minBounds = domains.flatMap((domain) => domain.interval?.min === undefined ? [] : [domain.interval.min])
    const maxBounds = domains.flatMap((domain) => domain.interval?.max === undefined ? [] : [domain.interval.max])
    if (new Set(minBounds).size > 1 || new Set(maxBounds).size > 1) return null
    const minDomain = domains.find((domain) => domain.interval?.min !== undefined)
    const maxDomain = domains.find((domain) => domain.interval?.max !== undefined)
    const includedValues = [...new Set(domains.flatMap((domain) => domain.includedValues ?? []))].sort((a, b) => a - b)
    const excludedValues = [...new Set(domains.flatMap((domain) => domain.excludedValues ?? []))].sort((a, b) => a - b)
    if (includedValues.some((value) => excludedValues.includes(value))) return null
    const symbolicNativeValues = [...new Set(domains.flatMap((domain) => domain.symbolicNativeValues ?? []))].sort()
    const interval = minDomain?.interval !== undefined || maxDomain?.interval !== undefined
      ? { ...(minBounds.length === 0 ? {} : { min: minBounds[0] }),
        ...(maxBounds.length === 0 ? {} : { max: maxBounds[0] }),
        minInclusive: minDomain?.interval?.minInclusive ?? true,
        maxInclusive: maxDomain?.interval?.maxInclusive ?? true }
      : undefined
    return Object.freeze({ value: canonicalizeCanonicalFactValueV1(path, {
      kind: 'integer_domain',
      ...(domains[0].unit === undefined ? {} : { unit: domains[0].unit }),
      ...(interval === undefined ? {} : { interval }),
      ...(includedValues.length === 0 ? {} : { includedValues }),
      ...(excludedValues.length === 0 ? {} : { excludedValues }),
      ...(symbolicNativeValues.length === 0 ? {} : { symbolicNativeValues }),
      completeness: 'partial_bounds',
    }), claims })
  }
  return null
}

function provenance(claims: readonly Claim[]): readonly ResolvedModelFactProvenanceV1[] {
  return Object.freeze(claims.map((claim) => claim.provenance))
}

function fieldForPath(path: CanonicalSemanticPathV1, slots: readonly SourceSlot[]): ResolvedModelFactFieldV1 {
  const localClaims = slots.map((slot) => sourceLocalClaims(slot, path))
  const claims = sortedClaims(localClaims.flatMap((entry) => entry.selected))
  const locallyOverridden = localClaims.flatMap((entry) => entry.overridden)
  const diagnostics = Object.freeze(slots.flatMap((slot) => diagnosticForOutcome(slot, path)))
  if (claims.length === 0) {
    return Object.freeze({ path, state: 'unknown', completenessDisposition: 'unknown', selectionReason: 'no_effective_claim',
      supportingProvenance: Object.freeze([]), opposingProvenance: Object.freeze([]), overriddenProvenance: Object.freeze([]), diagnostics })
  }
  const highestPriority = claims[0].provenance.sourcePriority
  const priorityClaims = claims.filter((claim) => claim.provenance.sourcePriority === highestPriority)
  const eligibleClaims = priorityClaims
  const supplementClaims = eligibleClaims.every((claim) => (claim.completenessDisposition === 'partial' ||
    claim.completenessDisposition === 'partial_bounds') &&
    claim.assertion.provenance.assertionKind === 'explicit')
    ? claims.filter((claim) => (claim.completenessDisposition === 'partial' ||
      claim.completenessDisposition === 'partial_bounds') &&
      claim.assertion.provenance.assertionKind === 'explicit')
    : eligibleClaims
  const supplement = partialSupplement(path, supplementClaims)
  if (supplement) {
    const lower = claims.filter((claim) => !supplement.claims.includes(claim))
    return Object.freeze({ path, state: 'resolved', selectedValue: supplement.value,
      completenessDisposition: 'partial', selectionReason: 'partial_supplementation',
      supportingProvenance: provenance(supplement.claims), opposingProvenance: Object.freeze([]),
      overriddenProvenance: provenance([...locallyOverridden, ...lower.filter((claim) =>
        !locallyOverridden.includes(claim))]), diagnostics })
  }
  const groups = new Map<string, Claim[]>()
  for (const claim of eligibleClaims) {
    const key = valueKey(claim.assertion.value)
    const group = groups.get(key) ?? []
    group.push(claim)
    groups.set(key, group)
  }
  if (groups.size > 1) {
    const candidates = [...groups.values()].map((group) => Object.freeze({
      value: group[0].assertion.value,
      completenessDisposition: group[0].completenessDisposition,
      provenance: provenance(group),
    }))
    return Object.freeze({ path, state: 'conflict', completenessDisposition: 'unknown',
      selectionReason: 'equal_priority_conflict', supportingProvenance: Object.freeze([]),
      opposingProvenance: provenance(eligibleClaims),
      overriddenProvenance: provenance([...locallyOverridden, ...claims.filter((claim) =>
        claim.provenance.sourcePriority < highestPriority && !locallyOverridden.includes(claim))]),
      diagnostics, candidates: Object.freeze(candidates) })
  }
  const winner = eligibleClaims[0]
  const winningValueKey = valueKey(winner.assertion.value)
  const supporting = eligibleClaims.filter((claim) => valueKey(claim.assertion.value) === winningValueKey)
  const opposing = eligibleClaims.filter((claim) => valueKey(claim.assertion.value) !== winningValueKey)
  const lower = claims.filter((claim) => claim.provenance.sourcePriority < highestPriority)
  const higherSourcePresent = slots.some((slot) => slot.priority > highestPriority && slot.input.kind === 'present')
  const explicitOverDerived = locallyOverridden.some((claim) => claim.assertion.provenance.assertionKind === 'derived' &&
    supporting.some((candidate) => candidate.provenance.sourceKind === claim.provenance.sourceKind &&
      candidate.provenance.sourcePriority === claim.provenance.sourcePriority &&
      candidate.assertion.provenance.assertionKind === 'explicit'))
  const selectionReason = explicitOverDerived
    ? 'explicit_over_derived'
    : lower.length > 0 ? 'higher_priority_claim'
      : higherSourcePresent ? 'lower_priority_fill' : supporting.length === 1 ? 'single_claim' : 'single_claim'
  return Object.freeze({ path, state: 'resolved', selectedValue: winner.assertion.value,
    completenessDisposition: winner.completenessDisposition, selectionReason,
    supportingProvenance: provenance(supporting), opposingProvenance: provenance(opposing),
    overriddenProvenance: provenance([...locallyOverridden, ...lower.filter((claim) =>
      !locallyOverridden.includes(claim))]), diagnostics })
}

export function resolveModelFactsV1(input: ResolveModelFactsV1Input): ReturnType<typeof buildResolvedModelFactsV1> {
  let config: SourcePriorityConfigV1
  try { config = decodeSourcePriorityConfigV1(input.sourcePriorityConfig) } catch { return invalid() }
  const resolutionInput = canonicalizeModelFactsResolutionInputV1(input.resolutionInput)
  if (resolutionInput.sourcePriorityConfigRevision !== config.sourcePriorityConfigRevision) return invalid()
  const slots = sourceSlots(resolutionInput, config)
  const fields = CANONICAL_MODEL_FACT_PATHS_V1.map((path) => fieldForPath(path, slots))
  return buildResolvedModelFactsV1({ resolutionInput, fields })
}
