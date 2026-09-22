import {
  canonicalSourceFactDigestV1,
  type CanonicalFactValueV1,
  type CanonicalSemanticPathV1,
} from '../model-facts/canonicalSourceFactsV1'
import type { ResolvedModelFactFieldV1, ResolvedModelFactsV1 } from '../model-facts/resolvedModelFactsV1'
import {
  canonicalizeModelFactsV2,
  projectCanonicalModelIdentityV2,
  type CanonicalModelFactsV2,
} from './canonicalModelFactsV2'
import {
  MODEL_CAPABILITY_SEMANTIC_PATHS_V2,
  type ModelCapabilityDomainV2,
  type ModelCapabilityEvidenceEffectV2,
  type ModelCapabilityEvidenceKindV2,
  type ModelCapabilitySemanticPathV2,
  type PersistedModelCapabilityFieldV2,
} from './modelCapabilitySchemaV2'
import type { DecodedProviderBindingRecordV2 } from '../domain/providerBindingV2'

export class ResolvedModelFactsRuntimeProjectionV1Error extends Error {
  constructor(readonly code = 'GENERATION_V2_RESOLVED_MODEL_FACTS_RUNTIME_PROJECTION_INVALID') {
    super(code)
    this.name = 'ResolvedModelFactsRuntimeProjectionV1Error'
  }
}

type EvidenceDraft = Readonly<{
  evidenceId: string
  kind: ModelCapabilityEvidenceKindV2
  effect: ModelCapabilityEvidenceEffectV2
  sourceRef: string
  verifiedAt: string | null
  contentDigest: string
}>

type EvidenceRole = 'supporting' | 'opposing' | 'overridden'

type RuntimeProjectionRule = Readonly<{
  runtimePath: ModelCapabilitySemanticPathV2
  sourcePaths: readonly CanonicalSemanticPathV1[]
}>

const EPOCH = '1970-01-01T00:00:00.000Z'

/**
 * This is a closed, reviewed ontology projection, not a second resolver. The
 * ordered source paths are explicit because several source paths describe one
 * legacy runtime control. The first available path supplies the control value;
 * every available path still contributes its evidence and remains visible in
 * the persisted Goal 3 resolution.
 */
const RUNTIME_PROJECTION_RULES: readonly RuntimeProjectionRule[] = Object.freeze([
  { runtimePath: 'generation.maxOutputTokens', sourcePaths: ['limits.output.maxTokens'] },
  { runtimePath: 'reasoning.mode', sourcePaths: ['reasoning.support', 'reasoning.modes.nativeValues'] },
  { runtimePath: 'reasoning.effort', sourcePaths: [
    'reasoning.effort.nativeValues', 'generation.effort.nativeValues',
    'reasoning.effort.providerDefault', 'generation.effort.providerDefault',
  ] },
  { runtimePath: 'generation.temperature', sourcePaths: [
    'sampling.temperature.support', 'sampling.temperature.modelMaximum', 'sampling.temperature.providerDefault',
  ] },
  { runtimePath: 'generation.topP', sourcePaths: ['sampling.topP.providerDefault'] },
  { runtimePath: 'generation.topK', sourcePaths: ['sampling.topK.support', 'sampling.topK.providerDefault'] },
  { runtimePath: 'tools.mode', sourcePaths: ['tools.calling.support'] },
  { runtimePath: 'providerExtension.responseFormat', sourcePaths: ['structuredOutput.support'] },
  { runtimePath: 'image.mode', sourcePaths: ['image.generation.support'] },
  { runtimePath: 'image.aspectRatio', sourcePaths: ['image.generation.aspectRatios'] },
  { runtimePath: 'image.resolution', sourcePaths: [
    'image.generation.resolutionPresets.nativeValues', 'image.generation.resolutionPreset.providerDefault',
  ] },
  { runtimePath: 'web.mode', sourcePaths: ['search.web.support'] },
  { runtimePath: 'web.types', sourcePaths: ['search.image.support'] },
])

function digest(value: unknown): string {
  return canonicalSourceFactDigestV1(value)
}

function provenanceFor(field: ResolvedModelFactFieldV1, role: EvidenceRole) {
  if (role === 'supporting') return field.supportingProvenance
  if (role === 'opposing') return field.opposingProvenance
  return field.overriddenProvenance
}

function evidenceFor(
  field: ResolvedModelFactFieldV1,
  role: EvidenceRole,
  effect: ModelCapabilityEvidenceEffectV2,
  evidence: Map<string, EvidenceDraft>,
): readonly string[] {
  const provenance = provenanceFor(field, role)
  if (provenance.length === 0) return Object.freeze([])
  const ids = provenance.map((item) => {
    const evidenceId = `goal3.${role}.${digest({ path: field.path, sourceKind: item.sourceKind,
      subjectFact: item.sourceFactRef.canonicalSubjectFactRevision, claim: item.sourceAssertion.provenance.claimId })}`
    if (!evidence.has(evidenceId)) evidence.set(evidenceId, Object.freeze({
      evidenceId,
      kind: item.sourceKind === 'capability_rule' ? 'capability_rule' : 'signed_provider_record',
      effect,
      sourceRef: `${item.sourceFactRef.canonicalSubjectFactRevision}:${role}`,
      verifiedAt: EPOCH,
      contentDigest: item.sourceFactRef.subjectFactPayloadDigest,
    }))
    return evidenceId
  })
  return Object.freeze([...new Set(ids)].sort())
}

function stringValues(value: CanonicalFactValueV1): readonly string[] | undefined {
  if (value.kind === 'native_string_set') return value.values
  if (value.kind === 'media_kind_set' || value.kind === 'operation_kind_set') return value.values
  if (value.kind === 'aspect_ratio_set') return value.values.map((item) => `${item.width}:${item.height}`)
  if (value.kind === 'native_string') return [value.value]
  return undefined
}

function domainFor(sourcePath: CanonicalSemanticPathV1, runtimePath: ModelCapabilitySemanticPathV2,
  value: CanonicalFactValueV1 | undefined): ModelCapabilityDomainV2 | undefined {
  if (!value) return undefined
  if (value.kind === 'native_string_set' || value.kind === 'media_kind_set' || value.kind === 'operation_kind_set' ||
      value.kind === 'aspect_ratio_set' || value.kind === 'native_string') {
    const values = stringValues(value)
    if (values && values.length > 0 && ['reasoning.mode', 'reasoning.effort', 'image.aspectRatio', 'image.resolution'].includes(runtimePath)) {
      return { kind: 'enum', values: [...new Set(values)] }
    }
  }
  if (value.kind === 'dimensions_set' && value.completeness === 'complete') {
    return { kind: 'dimensions_enum', values: value.values }
  }
  if (value.kind === 'integer_domain' && value.interval) {
    const min = value.interval.min ?? 0
    const max = value.interval.max ?? min
    return { kind: 'range', min, max, integer: true, ...(value.excludedValues === undefined ? {} : {
      excludedValues: value.excludedValues,
    }) }
  }
  if (sourcePath === 'limits.output.maxTokens' && value.kind === 'integer') {
    return { kind: 'range', min: 1, max: value.value, integer: true }
  }
  if (sourcePath === 'sampling.temperature.modelMaximum' &&
      (value.kind === 'decimal' || value.kind === 'integer')) {
    return { kind: 'range', min: 0, max: value.value, integer: false }
  }
  return undefined
}

function defaultValue(value: CanonicalFactValueV1 | undefined): string | number | boolean | undefined {
  if (!value) return undefined
  if (value.kind === 'native_string' || value.kind === 'integer' || value.kind === 'decimal' || value.kind === 'boolean') return value.value
  return undefined
}

function stateFor(fields: readonly ResolvedModelFactFieldV1[]): PersistedModelCapabilityFieldV2['state'] {
  const selected = fields.map((field) => field.selectedValue).filter((value): value is CanonicalFactValueV1 => value !== undefined)
  if (selected.some((value) => value.kind === 'support' && value.value === 'unsupported')) return 'unsupported'
  if (fields.some((field) => field.state === 'conflict')) return 'conflict'
  if (selected.some((value) => value.kind === 'support' && value.value === 'supported') ||
      selected.some((value) => value.kind !== 'support')) return 'supported'
  return 'unknown'
}

function evidenceEffectFor(field: ResolvedModelFactFieldV1, role: EvidenceRole): ModelCapabilityEvidenceEffectV2 {
  if (field.state === 'conflict' && role === 'opposing') return 'conflict'
  if (field.state === 'conflict' && role === 'overridden') return 'unknown'
  if (role === 'supporting' && field.selectedValue?.kind === 'support' && field.selectedValue.value === 'unsupported') {
    return 'rejects'
  }
  if (role === 'supporting') return 'supports'
  if (role === 'opposing') return 'rejects'
  return 'unknown'
}

function projectedField(rule: RuntimeProjectionRule, fields: readonly ResolvedModelFactFieldV1[],
  evidence: Map<string, EvidenceDraft>): PersistedModelCapabilityFieldV2 {
  const state = stateFor(fields)
  const selectedField = fields.find((field) => field.selectedValue !== undefined)
  const selected = selectedField?.selectedValue
  const effect: ModelCapabilityEvidenceEffectV2 = state === 'supported' ? 'supports'
    : state === 'unsupported' ? 'rejects' : state === 'conflict' ? 'conflict'
      : state === 'requires_confirmation' ? 'requires_confirmation' : 'unknown'
  for (const field of fields) {
    for (const role of ['supporting', 'opposing', 'overridden'] as const) {
      evidenceFor(field, role, evidenceEffectFor(field, role), evidence)
    }
  }
  const evidenceIds = [...new Set(fields.flatMap((field) => {
    if (state === 'supported') return evidenceFor(field, 'supporting', 'supports', evidence)
    if (state === 'unsupported') {
      return field.selectedValue?.kind === 'support' && field.selectedValue.value === 'unsupported'
        ? evidenceFor(field, 'supporting', 'rejects', evidence) : []
    }
    if (state === 'conflict') {
      return field.state === 'conflict' ? evidenceFor(field, 'opposing', 'conflict', evidence) : []
    }
    if (state === 'requires_confirmation') return evidenceFor(field, 'opposing', 'requires_confirmation', evidence)
    return []
  }))].sort()
  if (evidenceIds.length === 0) {
    const evidenceId = `goal3.unknown.${digest({ path: rule.runtimePath, state })}`
    if (!evidence.has(evidenceId)) evidence.set(evidenceId, Object.freeze({
      evidenceId, kind: 'contract_invariant', effect, sourceRef: 'goal3.resolved-model-facts', verifiedAt: EPOCH,
      contentDigest: digest({ path: rule.runtimePath, state }),
    }))
    evidenceIds.push(evidenceId)
  }
  const domainField = fields.find((field) => field.selectedValue !== undefined &&
    domainFor(field.path, rule.runtimePath, field.selectedValue) !== undefined)
  const domain = state === 'unknown' || state === 'unsupported' || state === 'conflict' ? undefined
    : domainFor(domainField?.path ?? rule.sourcePaths[0], rule.runtimePath, domainField?.selectedValue ?? selected) ??
      undefined
  const defaultCandidate = state === 'supported'
    ? defaultValue(fields.find((field) => field.path.endsWith('.providerDefault'))?.selectedValue ?? selected)
    : undefined
  return Object.freeze({ path: rule.runtimePath, state, ...(domain ? { domain } : {}),
    ...(defaultCandidate !== undefined ? { defaultValue: defaultCandidate } : {}), constraints: Object.freeze([]),
    evidenceIds: Object.freeze([...new Set(evidenceIds)].sort()) })
}

/** Projects only frozen Goal3 facts; protocol/execution metadata stays downstream. */
export function projectResolvedModelFactsToRuntimeV2(input: Readonly<{
  resolvedFacts: ResolvedModelFactsV1
  binding: DecodedProviderBindingRecordV2
}>): CanonicalModelFactsV2 {
  const fields = new Map(input.resolvedFacts.fields.map((field) => [field.path, field]))
  const evidence = new Map<string, EvidenceDraft>()
  const projected = RUNTIME_PROJECTION_RULES.map((rule) => projectedField(rule,
    rule.sourcePaths.map((path) => fields.get(path)).filter((field): field is ResolvedModelFactFieldV1 => field !== undefined), evidence))
  const projectedPaths = new Set(projected.map((field) => field.path))
  const unknownFields = MODEL_CAPABILITY_SEMANTIC_PATHS_V2
    .filter((path) => !projectedPaths.has(path))
    .map((path) => projectedField({ runtimePath: path, sourcePaths: ['reasoning.support'] }, [], evidence))
  return canonicalizeModelFactsV2({
    identity: projectCanonicalModelIdentityV2(input.binding),
    evidence: [...evidence.values()],
    fields: [...projected, ...unknownFields],
    capabilityRevision: input.resolvedFacts.capabilityRevision,
  })
}
