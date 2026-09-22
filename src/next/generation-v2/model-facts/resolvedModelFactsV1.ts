import {
  canonicalizeCanonicalFactValueV1,
  canonicalizeCanonicalModelSubjectV1,
  canonicalizeRawPayloadRefV1,
  canonicalSourceFactDigestV1,
  decodeCanonicalSourceRevisionRefV1,
  isCanonicalSemanticPathV1,
  type CanonicalFactValueV1,
  type CanonicalFactAssertionV1,
  type CanonicalFactProvenanceV1,
  type CanonicalModelSubjectV1,
  type CanonicalObservationProvenanceV1,
  type CanonicalSemanticPathV1,
  type CanonicalSourceKindV1,
  type CanonicalSubjectFactPayloadV1,
  type CanonicalSubjectFactRefV1,
  type SourceFieldRefV1,
} from './canonicalSourceFactsV1'
import { stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'

export const RESOLVED_MODEL_FACTS_SCHEMA_VERSION_V1 = 1 as const

export type ResolvedModelFactStateV1 = 'resolved' | 'unknown' | 'conflict'

export type ResolvedModelFactCompletenessV1 =
  | 'complete'
  | 'partial'
  | 'partial_bounds'
  | 'not_applicable'
  | 'unknown'

export type ResolvedModelFactSelectionReasonV1 =
  | 'no_effective_claim'
  | 'single_claim'
  | 'higher_priority_claim'
  | 'lower_priority_fill'
  | 'explicit_over_derived'
  | 'partial_supplementation'
  | 'equal_priority_conflict'

export type ModelFactsSourceAbsenceReasonV1 =
  | 'not_available'
  | 'not_configured'
  | 'no_exact_subject'
  | 'not_eligible'

export type ModelFactsSourceInputV1 =
  | Readonly<{
      kind: 'present'
      ref: CanonicalSubjectFactRefV1
      payload: CanonicalSubjectFactPayloadV1
    }>
  | Readonly<{
      kind: 'absent'
      reason: ModelFactsSourceAbsenceReasonV1
    }>

export type ModelFactsResolutionSourcesV1 = Readonly<{
  providerNative: ModelFactsSourceInputV1
  modelsDev: ModelFactsSourceInputV1
  capabilityRules: ModelFactsSourceInputV1
}>

export type ModelFactsResolutionInputV1 = Readonly<{
  schemaVersion: typeof RESOLVED_MODEL_FACTS_SCHEMA_VERSION_V1
  subject: CanonicalModelSubjectV1
  sources: ModelFactsResolutionSourcesV1
  sourcePriorityConfigRevision: string
  resolverRevision: string
  ontologyRevision: string
}>

export type ResolvedModelFactProvenanceV1 = Readonly<{
  sourceKind: CanonicalSourceKindV1
  sourceFactRef: CanonicalSubjectFactRefV1
  sourceAssertion: CanonicalFactAssertionV1
  sourcePriority: number
}>

export type ResolvedModelFactDiagnosticV1 = Readonly<{
  sourceKind: CanonicalSourceKindV1
  sourceFactRef: CanonicalSubjectFactRefV1
  path: CanonicalSemanticPathV1
  kind: 'missing' | 'invalid'
  errorCode?: string
  observationProvenance: CanonicalObservationProvenanceV1
}>

export type ResolvedModelFactCandidateV1 = Readonly<{
  value: CanonicalFactValueV1
  completenessDisposition: ResolvedModelFactCompletenessV1
  provenance: readonly ResolvedModelFactProvenanceV1[]
}>

export type ResolvedModelFactFieldV1 = Readonly<{
  path: CanonicalSemanticPathV1
  state: ResolvedModelFactStateV1
  selectedValue?: CanonicalFactValueV1
  completenessDisposition: ResolvedModelFactCompletenessV1
  selectionReason: ResolvedModelFactSelectionReasonV1
  supportingProvenance: readonly ResolvedModelFactProvenanceV1[]
  opposingProvenance: readonly ResolvedModelFactProvenanceV1[]
  overriddenProvenance: readonly ResolvedModelFactProvenanceV1[]
  diagnostics: readonly ResolvedModelFactDiagnosticV1[]
  candidates?: readonly ResolvedModelFactCandidateV1[]
}>

export type ResolvedModelFactsV1 = Readonly<{
  schemaVersion: typeof RESOLVED_MODEL_FACTS_SCHEMA_VERSION_V1
  input: ModelFactsResolutionInputV1
  fields: readonly ResolvedModelFactFieldV1[]
  capabilityRevision: string
}>

export class ResolvedModelFactsV1Error extends Error {
  constructor(readonly code: 'GENERATION_V2_RESOLVED_MODEL_FACTS_INVALID') {
    super(code)
    this.name = 'ResolvedModelFactsV1Error'
  }
}

const SOURCE_KIND_BY_SLOT = Object.freeze({
  providerNative: 'provider_native',
  modelsDev: 'models_dev',
  capabilityRules: 'capability_rule',
} as const)

const SOURCE_ABSENCE_REASONS = new Set<ModelFactsSourceAbsenceReasonV1>([
  'not_available', 'not_configured', 'no_exact_subject', 'not_eligible',
])

const COMPLETENESS_VALUES = new Set<ResolvedModelFactCompletenessV1>([
  'complete', 'partial', 'partial_bounds', 'not_applicable', 'unknown',
])

const SELECTION_REASONS = new Set<ResolvedModelFactSelectionReasonV1>([
  'no_effective_claim', 'single_claim', 'higher_priority_claim', 'lower_priority_fill',
  'explicit_over_derived', 'partial_supplementation', 'equal_priority_conflict',
])

const DIGEST_PATTERN = /^[a-f0-9]{64}$/u
const SOURCE_FACT_REVISION_PATTERN = /^canonical-subject-fact-v1:[a-f0-9]{64}$/u

function invalid(): never {
  throw new ResolvedModelFactsV1Error('GENERATION_V2_RESOLVED_MODEL_FACTS_INVALID')
}

function plainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null))
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  const actual = Object.keys(value).sort()
  const expected = [...allowed].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) invalid()
}

function boundedString(value: unknown, max = 512): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value ||
      /[\u0000-\u001f\u007f]/u.test(value)) invalid()
  return value
}

function sortedByCanonicalJson<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values].sort((left, right) =>
    stableSerializeProviderRequestV2(left).localeCompare(stableSerializeProviderRequestV2(right), 'en')))
}

function canonicalizeSubject(value: unknown): CanonicalModelSubjectV1 {
  return canonicalizeCanonicalModelSubjectV1(value)
}

function sameSubject(left: CanonicalModelSubjectV1, right: CanonicalModelSubjectV1): boolean {
  return stableSerializeProviderRequestV2(left) === stableSerializeProviderRequestV2(right)
}

function canonicalizeSourceFieldRef(value: unknown): SourceFieldRefV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['rawPayloadRef', 'sourceRecordIdentity', 'sourceFieldPath', 'observedPresence'])
  if (value.observedPresence !== 'present' && value.observedPresence !== 'expected_missing') invalid()
  return Object.freeze({
    rawPayloadRef: canonicalizeRawPayloadRefV1(value.rawPayloadRef),
    sourceRecordIdentity: boundedString(value.sourceRecordIdentity, 1024),
    sourceFieldPath: boundedString(value.sourceFieldPath, 1024),
    observedPresence: value.observedPresence,
  })
}

function canonicalizeObservationProvenance(
  value: unknown,
  sourceKind: CanonicalSourceKindV1,
  sourceRevision: string,
): CanonicalObservationProvenanceV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['sourceKind', 'canonicalSourceRevision', 'sourceFieldRefs', 'adapterId', 'adapterRevision', 'mappingId'])
  if (value.sourceKind !== sourceKind || value.canonicalSourceRevision !== sourceRevision ||
      !Array.isArray(value.sourceFieldRefs) || value.sourceFieldRefs.length > 64) invalid()
  return Object.freeze({
    sourceKind,
    canonicalSourceRevision: sourceRevision,
    sourceFieldRefs: Object.freeze(value.sourceFieldRefs.map(canonicalizeSourceFieldRef)),
    adapterId: boundedString(value.adapterId, 256),
    adapterRevision: boundedString(value.adapterRevision, 256),
    mappingId: boundedString(value.mappingId, 512),
  })
}

function sortedUniqueStrings(value: unknown, maxItems = 64): readonly string[] {
  if (!Array.isArray(value) || value.length > maxItems) invalid()
  const values = value.map((item) => boundedString(item, 1024)).sort((left, right) => left.localeCompare(right, 'en'))
  if (new Set(values).size !== values.length) invalid()
  return Object.freeze(values)
}

function canonicalizeRuleClaim(value: unknown): NonNullable<CanonicalFactProvenanceV1['ruleClaim']> {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['ownerKind', 'ownerId', 'packId', 'ruleId', 'packRevision', 'ruleRevision',
    'selectorKind', 'selectorRef', 'packPriority', 'rulePriority', 'effectiveRulePriority', 'prioritySemanticsRevision'])
  if ((value.ownerKind !== 'built_in' && value.ownerKind !== 'cloud' && value.ownerKind !== 'user') ||
      (value.selectorKind !== 'exact' && value.selectorKind !== 'regex') ||
      !Number.isSafeInteger(value.packPriority) || !Number.isSafeInteger(value.rulePriority) ||
      !Number.isSafeInteger(value.effectiveRulePriority)) invalid()
  return Object.freeze({
    ownerKind: value.ownerKind,
    ownerId: boundedString(value.ownerId, 256),
    packId: boundedString(value.packId, 256),
    ruleId: boundedString(value.ruleId, 256),
    packRevision: boundedString(value.packRevision, 256),
    ruleRevision: boundedString(value.ruleRevision, 256),
    selectorKind: value.selectorKind,
    selectorRef: boundedString(value.selectorRef, 1024),
    packPriority: value.packPriority as number,
    rulePriority: value.rulePriority as number,
    effectiveRulePriority: value.effectiveRulePriority as number,
    prioritySemanticsRevision: boundedString(value.prioritySemanticsRevision, 256),
  })
}

function canonicalizeDerivation(value: unknown): NonNullable<CanonicalFactProvenanceV1['derivation']> {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['derivationId', 'derivationRevision', 'inputClaimRefs', 'inputEvidenceRefs'])
  return Object.freeze({
    derivationId: boundedString(value.derivationId, 256),
    derivationRevision: boundedString(value.derivationRevision, 256),
    inputClaimRefs: sortedUniqueStrings(value.inputClaimRefs),
    inputEvidenceRefs: sortedUniqueStrings(value.inputEvidenceRefs),
  })
}

function canonicalizeSourceFactProvenance(
  value: unknown,
  sourceFactRef: CanonicalSubjectFactRefV1,
  expectedKind: CanonicalSourceKindV1,
): CanonicalFactProvenanceV1 {
  if (!plainObject(value)) invalid()
  const allowed = ['sourceKind', 'canonicalSourceRevision', 'sourceFieldRefs', 'adapterId', 'adapterRevision',
    'mappingId', 'claimId', 'sourceClaimIdentity', 'assertionKind', 'evidenceRefs']
  if (value.ruleClaim !== undefined) allowed.push('ruleClaim')
  if (value.derivation !== undefined) allowed.push('derivation')
  exactKeys(value, allowed)
  const allowedSourceRevisions = new Set([
    sourceFactRef.sourceRevision.canonicalSourceRevision,
    sourceFactRef.sourceRevision.previousLkgSourceRevision,
  ].filter((revision): revision is string => revision !== undefined))
  if (typeof value.canonicalSourceRevision !== 'string' ||
      value.sourceKind !== expectedKind || !allowedSourceRevisions.has(value.canonicalSourceRevision) ||
      value.assertionKind !== 'explicit' && value.assertionKind !== 'derived' ||
      expectedKind === 'capability_rule' && value.ruleClaim === undefined ||
      expectedKind !== 'capability_rule' && value.ruleClaim !== undefined) invalid()
  const observation = canonicalizeObservationProvenance({
    sourceKind: value.sourceKind,
    canonicalSourceRevision: value.canonicalSourceRevision,
    sourceFieldRefs: value.sourceFieldRefs,
    adapterId: value.adapterId,
    adapterRevision: value.adapterRevision,
    mappingId: value.mappingId,
  }, expectedKind, value.canonicalSourceRevision as string)
  const assertionKind = value.assertionKind as 'explicit' | 'derived'
  const derivation = value.derivation === undefined ? undefined : canonicalizeDerivation(value.derivation)
  if (assertionKind === 'derived' && derivation === undefined || assertionKind === 'explicit' && derivation !== undefined) invalid()
  return Object.freeze({
    ...observation,
    claimId: boundedString(value.claimId, 512),
    sourceClaimIdentity: boundedString(value.sourceClaimIdentity, 1024),
    assertionKind,
    evidenceRefs: sortedUniqueStrings(value.evidenceRefs),
    ...(value.ruleClaim === undefined ? {} : { ruleClaim: canonicalizeRuleClaim(value.ruleClaim) }),
    ...(derivation === undefined ? {} : { derivation }),
  })
}

function canonicalizeSourceAssertion(
  value: unknown,
  sourceFactRef: CanonicalSubjectFactRefV1,
  expectedPath: CanonicalSemanticPathV1,
): CanonicalFactAssertionV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['path', 'value', 'provenance'])
  if (value.path !== expectedPath) invalid()
  return Object.freeze({
    path: expectedPath,
    value: canonicalizeCanonicalFactValueV1(expectedPath, value.value),
    provenance: canonicalizeSourceFactProvenance(value.provenance, sourceFactRef, sourceFactRef.sourceRevision.sourceKind),
  })
}

function canonicalizeSubjectFactRef(
  value: unknown,
  expectedKind: CanonicalSourceKindV1,
  expectedSubject: CanonicalModelSubjectV1,
): CanonicalSubjectFactRefV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['sourceRevision', 'subject', 'subjectFactPayloadDigest', 'canonicalSubjectFactRevision'])
  const sourceRevision = decodeCanonicalSourceRevisionRefV1(value.sourceRevision)
  const subject = canonicalizeSubject(value.subject)
  if (sourceRevision.sourceKind !== expectedKind || !sameSubject(subject, expectedSubject) ||
      !DIGEST_PATTERN.test(String(value.subjectFactPayloadDigest)) ||
      !SOURCE_FACT_REVISION_PATTERN.test(String(value.canonicalSubjectFactRevision))) invalid()
  const subjectFactPayloadDigest = value.subjectFactPayloadDigest as string
  const canonicalSubjectFactRevision = value.canonicalSubjectFactRevision as string
  return Object.freeze({
    sourceRevision,
    subject,
    subjectFactPayloadDigest,
    canonicalSubjectFactRevision,
  })
}

function canonicalizeSubjectFactPayload(
  value: unknown,
  expectedKind: CanonicalSourceKindV1,
  expectedSubject: CanonicalModelSubjectV1,
): CanonicalSubjectFactPayloadV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['schemaVersion', 'subject', 'sourceRevision', 'recordOutcome', 'outcomes',
    'unmappedSourceFields', 'subjectFactPayloadDigest'])
  const subject = canonicalizeSubject(value.subject)
  const sourceRevision = decodeCanonicalSourceRevisionRefV1(value.sourceRevision)
  if (value.schemaVersion !== 1 || sourceRevision.sourceKind !== expectedKind ||
      !sameSubject(subject, expectedSubject) || !Array.isArray(value.outcomes) ||
      !Array.isArray(value.unmappedSourceFields) || !DIGEST_PATTERN.test(String(value.subjectFactPayloadDigest)) ||
      !['present', 'no_matching_claims', 'absent_in_complete_snapshot',
         'indeterminate_in_incomplete_snapshot', 'invalid_identity'].includes(String(value.recordOutcome))) invalid()
  const recordOutcome = value.recordOutcome as CanonicalSubjectFactPayloadV1['recordOutcome']
  const subjectFactPayloadDigest = value.subjectFactPayloadDigest as string
  return Object.freeze({
    schemaVersion: 1,
    subject,
    sourceRevision,
    recordOutcome,
    outcomes: Object.freeze([...value.outcomes]) as CanonicalSubjectFactPayloadV1['outcomes'],
    unmappedSourceFields: Object.freeze([...value.unmappedSourceFields]) as CanonicalSubjectFactPayloadV1['unmappedSourceFields'],
    subjectFactPayloadDigest,
  })
}

function canonicalizeSourceInput(
  value: unknown,
  expectedKind: CanonicalSourceKindV1,
  subject: CanonicalModelSubjectV1,
): ModelFactsSourceInputV1 {
  if (!plainObject(value) || typeof value.kind !== 'string') invalid()
  if (value.kind === 'absent') {
    exactKeys(value, ['kind', 'reason'])
    if (!SOURCE_ABSENCE_REASONS.has(value.reason as ModelFactsSourceAbsenceReasonV1)) invalid()
    return Object.freeze({ kind: 'absent', reason: value.reason as ModelFactsSourceAbsenceReasonV1 })
  }
  if (value.kind !== 'present') invalid()
  exactKeys(value, ['kind', 'ref', 'payload'])
  const ref = canonicalizeSubjectFactRef(value.ref, expectedKind, subject)
  const payload = canonicalizeSubjectFactPayload(value.payload, expectedKind, subject)
  if (!sameSubject(payload.subject, ref.subject) ||
      stableSerializeProviderRequestV2(payload.sourceRevision) !== stableSerializeProviderRequestV2(ref.sourceRevision) ||
      payload.subjectFactPayloadDigest !== ref.subjectFactPayloadDigest) invalid()
  return Object.freeze({ kind: 'present', ref, payload })
}

function canonicalizeProvenance(
  value: unknown,
  subject: CanonicalModelSubjectV1,
  expectedPath?: CanonicalSemanticPathV1,
): ResolvedModelFactProvenanceV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['sourceKind', 'sourceFactRef', 'sourceAssertion', 'sourcePriority'])
  if (typeof value.sourceKind !== 'string' ||
      !['provider_native', 'models_dev', 'capability_rule'].includes(value.sourceKind) ||
      !Number.isSafeInteger(value.sourcePriority)) invalid()
  const sourceKind = value.sourceKind as CanonicalSourceKindV1
  const sourcePriority = value.sourcePriority as number
  const sourceFactRef = canonicalizeSubjectFactRef(value.sourceFactRef, sourceKind, subject)
  if (!plainObject(value.sourceAssertion) || !isCanonicalSemanticPathV1(value.sourceAssertion.path) ||
      expectedPath !== undefined && value.sourceAssertion.path !== expectedPath) invalid()
  return Object.freeze({
    sourceKind,
    sourceFactRef,
    sourceAssertion: canonicalizeSourceAssertion(value.sourceAssertion, sourceFactRef, value.sourceAssertion.path),
    sourcePriority,
  })
}

function canonicalizeDiagnostic(
  value: unknown,
  subject: CanonicalModelSubjectV1,
  expectedPath: CanonicalSemanticPathV1,
): ResolvedModelFactDiagnosticV1 {
  if (!plainObject(value)) invalid()
  const allowed = ['sourceKind', 'sourceFactRef', 'path', 'kind', 'observationProvenance']
  if (value.errorCode !== undefined) allowed.push('errorCode')
  exactKeys(value, allowed)
  if (!isCanonicalSemanticPathV1(value.path) || value.path !== expectedPath ||
      (value.sourceKind !== 'provider_native' && value.sourceKind !== 'models_dev' && value.sourceKind !== 'capability_rule') ||
      (value.kind !== 'missing' && value.kind !== 'invalid') ||
      value.kind === 'invalid' && value.errorCode === undefined ||
      value.kind === 'missing' && value.errorCode !== undefined) invalid()
  const sourceFactRef = canonicalizeSubjectFactRef(value.sourceFactRef, value.sourceKind, subject)
  const observationProvenance = canonicalizeObservationProvenance(
    value.observationProvenance,
    value.sourceKind,
    sourceFactRef.sourceRevision.canonicalSourceRevision,
  )
  return Object.freeze({
    sourceKind: value.sourceKind,
    sourceFactRef,
    path: expectedPath,
    kind: value.kind,
    ...(value.errorCode === undefined ? {} : { errorCode: boundedString(value.errorCode, 256) }),
    observationProvenance,
  })
}

function canonicalizeCandidate(
  value: unknown,
  subject: CanonicalModelSubjectV1,
  expectedPath: CanonicalSemanticPathV1,
): ResolvedModelFactCandidateV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['value', 'completenessDisposition', 'provenance'])
  if (!COMPLETENESS_VALUES.has(value.completenessDisposition as ResolvedModelFactCompletenessV1) ||
      !Array.isArray(value.provenance) || value.provenance.length > 4096) invalid()
  const provenance = value.provenance as readonly unknown[]
  return Object.freeze({
    value: canonicalizeCanonicalFactValueV1(expectedPath, value.value),
    completenessDisposition: value.completenessDisposition as ResolvedModelFactCompletenessV1,
    provenance: sortedByCanonicalJson(provenance.map((item) =>
      canonicalizeProvenance(item, subject, expectedPath))),
  })
}

export function canonicalizeResolvedModelFactFieldV1(
  value: unknown,
  subject: CanonicalModelSubjectV1,
): ResolvedModelFactFieldV1 {
  if (!plainObject(value)) invalid()
  const allowed = ['path', 'state', 'completenessDisposition', 'selectionReason',
    'supportingProvenance', 'opposingProvenance', 'overriddenProvenance', 'diagnostics']
  if (value.selectedValue !== undefined) allowed.push('selectedValue')
  if (value.candidates !== undefined) allowed.push('candidates')
  exactKeys(value, allowed)
  if (!isCanonicalSemanticPathV1(value.path) ||
      (value.state !== 'resolved' && value.state !== 'unknown' && value.state !== 'conflict') ||
      !COMPLETENESS_VALUES.has(value.completenessDisposition as ResolvedModelFactCompletenessV1) ||
      !SELECTION_REASONS.has(value.selectionReason as ResolvedModelFactSelectionReasonV1) ||
      !Array.isArray(value.supportingProvenance) || !Array.isArray(value.opposingProvenance) ||
      !Array.isArray(value.overriddenProvenance) || !Array.isArray(value.diagnostics) ||
      value.supportingProvenance.length > 4096 || value.opposingProvenance.length > 4096 ||
      value.overriddenProvenance.length > 4096 || value.diagnostics.length > 4096) invalid()
  if (value.state === 'resolved' && value.selectedValue === undefined ||
      value.state !== 'resolved' && value.selectedValue !== undefined ||
      value.state === 'conflict' && (!Array.isArray(value.candidates) || value.candidates.length < 2) ||
      value.state !== 'conflict' && value.candidates !== undefined) invalid()
  const path = value.path
  const state = value.state as ResolvedModelFactStateV1
  const candidates = value.candidates as readonly unknown[] | undefined
  return Object.freeze({
    path,
    state,
    ...(value.selectedValue === undefined ? {} : { selectedValue: canonicalizeCanonicalFactValueV1(path, value.selectedValue) }),
    completenessDisposition: value.completenessDisposition as ResolvedModelFactCompletenessV1,
    selectionReason: value.selectionReason as ResolvedModelFactSelectionReasonV1,
    supportingProvenance: sortedByCanonicalJson(value.supportingProvenance.map((item) =>
      canonicalizeProvenance(item, subject, path))),
    opposingProvenance: sortedByCanonicalJson(value.opposingProvenance.map((item) =>
      canonicalizeProvenance(item, subject, path))),
    overriddenProvenance: sortedByCanonicalJson(value.overriddenProvenance.map((item) =>
      canonicalizeProvenance(item, subject, path))),
    diagnostics: sortedByCanonicalJson(value.diagnostics.map((item) => canonicalizeDiagnostic(item, subject, path))),
    ...(candidates === undefined ? {} : {
      candidates: sortedByCanonicalJson(candidates.map((item) => canonicalizeCandidate(item, subject, path))),
    }),
  })
}

export function canonicalizeModelFactsResolutionInputV1(value: unknown): ModelFactsResolutionInputV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['schemaVersion', 'subject', 'sources', 'sourcePriorityConfigRevision', 'resolverRevision', 'ontologyRevision'])
  if (value.schemaVersion !== RESOLVED_MODEL_FACTS_SCHEMA_VERSION_V1 || !plainObject(value.sources)) invalid()
  exactKeys(value.sources, ['providerNative', 'modelsDev', 'capabilityRules'])
  const subject = canonicalizeSubject(value.subject)
  return Object.freeze({
    schemaVersion: RESOLVED_MODEL_FACTS_SCHEMA_VERSION_V1,
    subject,
    sources: Object.freeze({
      providerNative: canonicalizeSourceInput(value.sources.providerNative, SOURCE_KIND_BY_SLOT.providerNative, subject),
      modelsDev: canonicalizeSourceInput(value.sources.modelsDev, SOURCE_KIND_BY_SLOT.modelsDev, subject),
      capabilityRules: canonicalizeSourceInput(value.sources.capabilityRules, SOURCE_KIND_BY_SLOT.capabilityRules, subject),
    }),
    sourcePriorityConfigRevision: boundedString(value.sourcePriorityConfigRevision, 256),
    resolverRevision: boundedString(value.resolverRevision, 256),
    ontologyRevision: boundedString(value.ontologyRevision, 256),
  })
}

function semanticSourceInput(value: ModelFactsSourceInputV1): unknown {
  return value.kind === 'absent'
    ? value
    : { kind: 'present', ref: value.ref }
}

function semanticPayload(
  input: ModelFactsResolutionInputV1,
  fields: readonly ResolvedModelFactFieldV1[],
): unknown {
  return Object.freeze({
    schemaVersion: RESOLVED_MODEL_FACTS_SCHEMA_VERSION_V1,
    subject: input.subject,
    sources: {
      providerNative: semanticSourceInput(input.sources.providerNative),
      modelsDev: semanticSourceInput(input.sources.modelsDev),
      capabilityRules: semanticSourceInput(input.sources.capabilityRules),
    },
    sourcePriorityConfigRevision: input.sourcePriorityConfigRevision,
    resolverRevision: input.resolverRevision,
    ontologyRevision: input.ontologyRevision,
    fields,
  })
}

export function resolvedModelFactsSemanticDigestV1(
  input: ModelFactsResolutionInputV1,
  fields: readonly ResolvedModelFactFieldV1[],
): string {
  return canonicalSourceFactDigestV1(semanticPayload(input, fields))
}

export function buildResolvedModelFactsV1(input: {
  resolutionInput: ModelFactsResolutionInputV1
  fields: readonly ResolvedModelFactFieldV1[]
}): ResolvedModelFactsV1 {
  const resolutionInput = canonicalizeModelFactsResolutionInputV1(input.resolutionInput)
  if (!Array.isArray(input.fields) || input.fields.length > 2048) invalid()
  const fields = Object.freeze(input.fields.map((field) =>
    canonicalizeResolvedModelFactFieldV1(field, resolutionInput.subject)).sort((left, right) =>
    left.path.localeCompare(right.path, 'en')))
  if (new Set(fields.map((field) => field.path)).size !== fields.length) invalid()
  const capabilityRevision = `capability-revision-v1:${resolvedModelFactsSemanticDigestV1(resolutionInput, fields)}`
  return Object.freeze({
    schemaVersion: RESOLVED_MODEL_FACTS_SCHEMA_VERSION_V1,
    input: resolutionInput,
    fields,
    capabilityRevision,
  })
}

export function decodeResolvedModelFactsV1(value: unknown): ResolvedModelFactsV1 {
  if (!plainObject(value)) invalid()
  exactKeys(value, ['schemaVersion', 'input', 'fields', 'capabilityRevision'])
  if (typeof value.capabilityRevision !== 'string' ||
      !/^capability-revision-v1:[a-f0-9]{64}$/u.test(value.capabilityRevision) ||
      !Array.isArray(value.fields)) invalid()
  const decoded = buildResolvedModelFactsV1({
    resolutionInput: canonicalizeModelFactsResolutionInputV1(value.input),
    fields: value.fields,
  })
  if (value.schemaVersion !== RESOLVED_MODEL_FACTS_SCHEMA_VERSION_V1 ||
      decoded.capabilityRevision !== value.capabilityRevision) invalid()
  return decoded
}

export const RESOLVED_MODEL_FACTS_ONTOLOGY_SCHEMA_DIGEST_V1 = canonicalSourceFactDigestV1({
  schemaVersion: RESOLVED_MODEL_FACTS_SCHEMA_VERSION_V1,
  states: ['resolved', 'unknown', 'conflict'],
  completeness: ['complete', 'partial', 'partial_bounds', 'not_applicable', 'unknown'],
  selectionReasons: [...SELECTION_REASONS].sort(),
  sourceAbsenceReasons: [...SOURCE_ABSENCE_REASONS].sort(),
})
