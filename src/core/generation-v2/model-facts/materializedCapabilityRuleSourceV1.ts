import {
  evaluateCapabilityRuleActivationV1,
  projectCapabilityRuleOwnershipSnapshotV1,
  type CapabilityRuleDefaultActivationPolicyV1,
  type CapabilityRuleOwnershipSnapshotV1,
  type ProjectedCapabilityRuleOwnershipSnapshotV1,
} from '../capability-rules/capabilityRuleCoreV1'
import {
  projectCapabilityRuleOwnershipSnapshotV2,
  type CapabilityRuleOwnershipSnapshotV2,
  type ProjectedCapabilityRuleOwnershipSnapshotV2,
} from '../capability-rules/capabilityRuleCoreV2'
import { stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import {
  buildAuthoritativeModelSubjectSetV1,
  type AuthoritativeModelSubjectSetV1,
} from './authoritativeModelSubjectSetV1'
import {
  canonicalizeCanonicalModelSubjectV1,
  canonicalSourceFactDigestV1,
  type CanonicalModelSubjectV1,
  type CanonicalFactValueV1,
  type CanonicalSemanticPathV1,
  type CanonicalSourceRevisionRefV1,
  type CanonicalSubjectFactCandidateV1,
  type RawPayloadRefV1,
  type RawSourceSnapshotRefV1,
  type RuleClaimContextV1,
  type SourceRecordIndexV1,
} from './canonicalSourceFactsV1'
import {
  buildDerivedAssertionV1,
  buildExplicitAssertionV1,
  buildObservationProvenanceV1,
  presentOutcomeV1,
  type CanonicalModelFactSourceAdapterV1,
} from './sourceAdapterV1'
import { MATERIALIZED_CAPABILITY_RULE_COVERAGE_MANIFEST_V1 } from './sourceCoverageManifestV1'
import {
  buildRawSourceSnapshotRefV1,
  sanitizeRawSourcePayloadV1,
  type RawPayloadReaderV1,
  type SanitizedRawPayloadV1,
} from './rawSourceSnapshotV1'
import { buildEnumerableSourcePublicationV1 } from './sourceSnapshotBuilderV1'

export const MATERIALIZED_CAPABILITY_RULE_ADAPTER_REVISION_V1 =
  'materialized-capability-rule-source-adapter-v1:20260921-1' as const

export type CapabilityRuleDefaultActivationPoliciesV1 = Readonly<{
  cloud: CapabilityRuleDefaultActivationPolicyV1
  user: CapabilityRuleDefaultActivationPolicyV1
}>

export type MaterializedCapabilityRuleOwnerSnapshotV1 = Readonly<{
  snapshotRevision: string
  snapshot: CapabilityRuleOwnershipSnapshotV1 | CapabilityRuleOwnershipSnapshotV2
}>

export type CapabilityRuleProjectedOwnerSnapshotV1V2 =
  | ProjectedCapabilityRuleOwnershipSnapshotV1
  | ProjectedCapabilityRuleOwnershipSnapshotV2

type ProjectedCapabilityRuleOwnershipSnapshot = CapabilityRuleProjectedOwnerSnapshotV1V2

export type MaterializedCapabilityRuleSourcePayloadV1 = Readonly<{
  schemaVersion: 1
  authoritativeSubjectSetRevision: string
  subjects: readonly CanonicalModelSubjectV1[]
  defaultActivationPolicies: CapabilityRuleDefaultActivationPoliciesV1
  ownershipSnapshots: readonly MaterializedCapabilityRuleOwnerSnapshotV1[]
}>

export type PreparedCapabilityRuleMaterializationV1 = Readonly<{
  sourceScopeId: string
  ruleDefinitionRevision: string
  authoritativeSubjectSetRevision: string
  ownerSnapshotRevisions: readonly Readonly<{
    ownership: 'cloud' | 'user'
    ownerId: string
    snapshotRevision: string
  }>[]
  rawPayload: SanitizedRawPayloadV1
  rawSnapshot: RawSourceSnapshotRefV1
  publication: ReturnType<typeof buildEnumerableSourcePublicationV1>
  materializationRevision: string
}>

export type CapabilityRuleDefinitionSetProjectionV1 = Readonly<{
  ruleDefinitionRevision: string
  ownerSnapshotRevisions: PreparedCapabilityRuleMaterializationV1['ownerSnapshotRevisions']
  defaultActivationPolicies: CapabilityRuleDefaultActivationPoliciesV1
}>

function invalid(): never {
  throw new Error('GENERATION_V2_CAPABILITY_RULE_MATERIALIZATION_INVALID')
}

function subjectKey(subject: CanonicalModelSubjectV1): string {
  return stableSerializeProviderRequestV2(subject)
}

/** Resolves stale dual-version owner rows deterministically; V2 is the active representation when both exist. */
export function mergeCapabilityRuleOwnershipSnapshotsV1V2(
  values: readonly CapabilityRuleProjectedOwnerSnapshotV1V2[],
): readonly CapabilityRuleProjectedOwnerSnapshotV1V2[] {
  const selected = new Map<string, CapabilityRuleProjectedOwnerSnapshotV1V2>()
  for (const value of values) {
    const key = `${value.definition.ownership}\0${value.definition.ownerId}`
    const existing = selected.get(key)
    if (!existing) {
      selected.set(key, value)
      continue
    }
    if (existing.definition.schemaVersion === value.definition.schemaVersion) invalid()
    if (value.definition.schemaVersion === 2) selected.set(key, value)
  }
  return Object.freeze([...selected.values()].sort((left, right) =>
    `${left.definition.ownership}\0${left.definition.ownerId}`.localeCompare(
      `${right.definition.ownership}\0${right.definition.ownerId}`, 'en')))
}

function boundedRevision(value: unknown, prefix: string): string {
  if (typeof value !== 'string' || value.length < prefix.length + 64 || value.length > 256 ||
      !value.startsWith(prefix)) invalid()
  return value
}

function defaultPolicies(value: CapabilityRuleDefaultActivationPoliciesV1): CapabilityRuleDefaultActivationPoliciesV1 {
  if (!value || (value.cloud !== 'enabled' && value.cloud !== 'disabled') ||
      (value.user !== 'enabled' && value.user !== 'disabled')) invalid()
  return Object.freeze({ cloud: value.cloud, user: value.user })
}

function canonicalOwnerSnapshots(
  values: readonly MaterializedCapabilityRuleOwnerSnapshotV1[],
): readonly MaterializedCapabilityRuleOwnerSnapshotV1[] {
  if (!Array.isArray(values) || values.length > 10_000) invalid()
  const snapshots = mergeCapabilityRuleOwnershipSnapshotsV1V2(values.map((value) => {
    const projected = value.snapshot.schemaVersion === 1
      ? projectCapabilityRuleOwnershipSnapshotV1(value.snapshot)
      : value.snapshot.schemaVersion === 2
        ? projectCapabilityRuleOwnershipSnapshotV2(value.snapshot)
        : invalid()
    if (projected.snapshotRevision !== value.snapshotRevision) invalid()
    return projected
  })).map(projected => Object.freeze({ snapshotRevision: projected.snapshotRevision,
    snapshot: projected.definition }))
  return Object.freeze(snapshots)
}

function canonicalSubjects(values: readonly CanonicalModelSubjectV1[]): readonly CanonicalModelSubjectV1[] {
  if (!Array.isArray(values) || values.length > 100_000) invalid()
  const subjects = values.map(canonicalizeCanonicalModelSubjectV1)
    .sort((left, right) => subjectKey(left).localeCompare(subjectKey(right), 'en'))
  if (new Set(subjects.map(subjectKey)).size !== subjects.length) invalid()
  return Object.freeze(subjects)
}

function canonicalPayload(value: MaterializedCapabilityRuleSourcePayloadV1): MaterializedCapabilityRuleSourcePayloadV1 {
  if (!value || value.schemaVersion !== 1) invalid()
  return Object.freeze({ schemaVersion: 1 as const,
    authoritativeSubjectSetRevision: boundedRevision(value.authoritativeSubjectSetRevision,
      'authoritative-model-subject-set-v1:'),
    subjects: canonicalSubjects(value.subjects),
    defaultActivationPolicies: defaultPolicies(value.defaultActivationPolicies),
    ownershipSnapshots: canonicalOwnerSnapshots(value.ownershipSnapshots) })
}

function payloadForSnapshot(
  subjectSet: AuthoritativeModelSubjectSetV1,
  snapshots: readonly ProjectedCapabilityRuleOwnershipSnapshot[],
  policies: CapabilityRuleDefaultActivationPoliciesV1,
): MaterializedCapabilityRuleSourcePayloadV1 {
  const rebuilt = buildAuthoritativeModelSubjectSetV1(subjectSet.records.flatMap((record) =>
    record.proofs.map((proof) => Object.freeze({ subject: record.subject, proof }))))
  if (stableSerializeProviderRequestV2(rebuilt) !== stableSerializeProviderRequestV2(subjectSet)) invalid()
  return canonicalPayload({ schemaVersion: 1,
    authoritativeSubjectSetRevision: subjectSet.subjectSetRevision,
    subjects: subjectSet.records.map((record) => record.subject),
    defaultActivationPolicies: policies,
    ownershipSnapshots: snapshots.map((snapshot) => Object.freeze({
      snapshotRevision: snapshot.snapshotRevision,
      snapshot: snapshot.definition,
    })) })
}

export function projectCapabilityRuleDefinitionSetV1(input: Readonly<{
  ownershipSnapshots: readonly ProjectedCapabilityRuleOwnershipSnapshot[]
  defaultActivationPolicies: CapabilityRuleDefaultActivationPoliciesV1
}>): CapabilityRuleDefinitionSetProjectionV1 {
  const policies = defaultPolicies(input.defaultActivationPolicies)
  const snapshots = canonicalOwnerSnapshots(input.ownershipSnapshots.map((snapshot) => Object.freeze({
    snapshotRevision: snapshot.snapshotRevision,
    snapshot: snapshot.definition,
  })))
  const ownerSnapshotRevisions = Object.freeze(snapshots.map((owner) => Object.freeze({
    ownership: owner.snapshot.ownership, ownerId: owner.snapshot.ownerId,
    snapshotRevision: owner.snapshotRevision,
  })))
  return Object.freeze({ ownerSnapshotRevisions, defaultActivationPolicies: policies,
    ruleDefinitionRevision: `capability-rule-definition-set-v1:${canonicalSourceFactDigestV1({
      ownerSnapshotRevisions, defaultActivationPolicies: policies,
    })}` })
}

function readPayload(
  reader: RawPayloadReaderV1,
  rawSnapshot: RawSourceSnapshotRefV1,
): Readonly<{ payload: MaterializedCapabilityRuleSourcePayloadV1; rawRef: RawPayloadRefV1 }> {
  if (rawSnapshot.sourceKind !== 'capability_rule' || rawSnapshot.recordSetCompleteness !== 'complete' ||
      rawSnapshot.rawEnvelopeRefs.length !== 1) invalid()
  const rawRef = rawSnapshot.rawEnvelopeRefs[0]!
  return Object.freeze({ payload: canonicalPayload(reader.readRawPayload(rawRef) as MaterializedCapabilityRuleSourcePayloadV1),
    rawRef })
}

function selectorMatches(selector: CapabilityRuleOwnershipSnapshotV1['packs'][number]['rules'][number]['selector'],
  nativeModelId: string): boolean {
  if (selector.kind === 'exact') return selector.nativeModelIds.includes(nativeModelId)
  return new RegExp(selector.pattern, 'u').test(nativeModelId)
}

function ruleClaimContext(input: Readonly<{
  ownership: 'cloud' | 'user'
  ownerId: string
  packId: string
  packRevision: string
  packPriority: number
  ruleId: string
  ruleRevision: string
  rulePriority: number
  selectorKind: 'exact' | 'regex'
}>): RuleClaimContextV1 {
  return Object.freeze({ ownerKind: input.ownership === 'cloud' && input.ownerId === 'bundled-gemini-thinking-v2' ? 'built_in' : input.ownership, ownerId: input.ownerId,
    packId: input.packId, ruleId: input.ruleId, packRevision: input.packRevision,
    ruleRevision: input.ruleRevision, selectorKind: input.selectorKind,
    // The regex/exact selector definition remains in the source-native raw payload. Canonical facts
    // retain only the stable materialized match identity for this exact subject.
    selectorRef: `materialized-rule-match-v1:${input.ruleRevision}`,
    packPriority: input.packPriority, rulePriority: input.rulePriority,
    effectiveRulePriority: input.packPriority + input.rulePriority,
    prioritySemanticsRevision: 'capability-rule-priority-metadata-v1:pack-plus-rule' })
}

export function createMaterializedCapabilityRuleSourceAdapterV1(
  input: Readonly<{ rawPayloadReader: RawPayloadReaderV1 }>,
): CanonicalModelFactSourceAdapterV1 {
  // One immutable source publication is enumerated across every exact subject.
  // Reuse its validated payload and owner projections within this adapter only.
  const snapshots = new Map<string, Readonly<{
    payload: MaterializedCapabilityRuleSourcePayloadV1
    rawRef: RawPayloadRefV1
    owners: readonly ProjectedCapabilityRuleOwnershipSnapshot[]
    subjectKeys: ReadonlySet<string>
  }>>()
  const prepareSnapshot = (rawSnapshot: RawSourceSnapshotRefV1) => {
    const key = stableSerializeProviderRequestV2(rawSnapshot)
    const existing = snapshots.get(key)
    if (existing) return existing
    const parsed = readPayload(input.rawPayloadReader, rawSnapshot)
    const prepared = Object.freeze({ ...parsed,
      owners: Object.freeze(parsed.payload.ownershipSnapshots.map(owner => owner.snapshot.schemaVersion === 1
        ? projectCapabilityRuleOwnershipSnapshotV1(owner.snapshot)
        : owner.snapshot.schemaVersion === 2
          ? projectCapabilityRuleOwnershipSnapshotV2(owner.snapshot)
          : invalid())),
      subjectKeys: new Set(parsed.payload.subjects.map(subjectKey)),
    })
    snapshots.set(key, prepared)
    return prepared
  }
  return Object.freeze({
    sourceKind: 'capability_rule' as const,
    adapterId: 'materialized-capability-rule-source-adapter-v1',
    adapterRevision: MATERIALIZED_CAPABILITY_RULE_ADAPTER_REVISION_V1,
    coverageManifest: MATERIALIZED_CAPABILITY_RULE_COVERAGE_MANIFEST_V1,
    subjectDiscovery: 'enumerable' as const,
    indexRawRecords(rawSnapshot: RawSourceSnapshotRefV1): SourceRecordIndexV1 {
      const { payload } = prepareSnapshot(rawSnapshot)
      return Object.freeze({ sourceScopeId: rawSnapshot.sourceScopeId,
        recordSetCompleteness: 'complete' as const, exactSubjects: payload.subjects,
        invalidRecordRefs: Object.freeze([]) })
    },
    adaptExactSubject(adapterInput: Readonly<{
      rawSnapshot: RawSourceSnapshotRefV1
      sourceRevision: CanonicalSourceRevisionRefV1
      subject: CanonicalModelSubjectV1
    }>): CanonicalSubjectFactCandidateV1 {
      const subject = canonicalizeCanonicalModelSubjectV1(adapterInput.subject)
      const { payload, rawRef, owners, subjectKeys } = prepareSnapshot(adapterInput.rawSnapshot)
      if (!subjectKeys.has(subjectKey(subject))) {
        return Object.freeze({ schemaVersion: 1 as const, subject, sourceRevision: adapterInput.sourceRevision,
          recordOutcome: 'absent_in_complete_snapshot' as const, outcomes: Object.freeze([]),
          unmappedSourceFields: Object.freeze([]) })
      }
      const outcomes = []
      for (const projected of owners) {
        const owner = projected.definition
        for (const pack of projected.packs) {
          for (const projectedRule of pack.rules) {
            const rule = projectedRule.definition
            if (rule.providerAuthorityId !== subject.providerAuthorityId ||
                rule.endpointProfileId !== subject.endpointProfileId ||
                !selectorMatches(rule.selector, subject.nativeModelId)) continue
            const activation = evaluateCapabilityRuleActivationV1({ mode: pack.definition.mode,
              target: pack.definition.target, configured: rule.configured,
              defaultPolicy: payload.defaultActivationPolicies[owner.ownership] })
            if (!activation.enabled) continue
            let factPath: CanonicalSemanticPathV1
            let factValue: CanonicalFactValueV1
            let mappingId: string
            let sourceFieldPath: string
            if ('assertion' in rule) {
              factPath = rule.assertion.path
              factValue = rule.assertion.value
              mappingId = `materialized-rules.direct.${factPath}.v1`
              sourceFieldPath = `rule.${rule.ruleId}.assertion`
            } else {
              if (rule.when !== null || (rule.effect.kind !== 'fact_assertion' &&
                  rule.effect.kind !== 'fact_default')) continue
              factPath = rule.effect.path
              factValue = rule.effect.value
              mappingId = `materialized-rules.fact-v2.${rule.effect.kind}.${factPath}.v2`
              sourceFieldPath = `rule.${rule.ruleId}.effect.${rule.effect.kind}`
            }
            const observationProvenance = buildObservationProvenanceV1({ sourceRevision: adapterInput.sourceRevision,
              sourceFieldRefs: [Object.freeze({ rawPayloadRef: rawRef,
                sourceRecordIdentity: `${owner.ownership}:${owner.ownerId}:${rule.ruleId}`,
                sourceFieldPath, observedPresence: 'present' as const })],
              adapterId: 'materialized-capability-rule-source-adapter-v1',
              adapterRevision: MATERIALIZED_CAPABILITY_RULE_ADAPTER_REVISION_V1, mappingId })
            const context = ruleClaimContext({ ownership: owner.ownership,
              ownerId: owner.ownerId, packId: pack.definition.packId,
              packRevision: pack.packRevision, packPriority: pack.definition.priority,
              ruleId: rule.ruleId, ruleRevision: projectedRule.ruleRevision,
              rulePriority: rule.priority, selectorKind: rule.selector.kind })
            const evidenceRefs = rule.evidence === null ? [] : [...new Set([
              rule.evidence.evidenceSourceRef, rule.evidence.identityEvidenceSourceRef,
            ])]
            const common = { subject, sourceRevision: adapterInput.sourceRevision,
              path: factPath, value: factValue,
              sourceClaimIdentity: `${owner.ownership}:${owner.ownerId}:${projectedRule.ruleRevision}`,
              evidenceRefs, observationProvenance, ruleClaim: context }
            const assertion = rule.evidence?.derivation
              ? buildDerivedAssertionV1({ ...common, derivation: rule.evidence.derivation })
              : buildExplicitAssertionV1(common)
            outcomes.push(presentOutcomeV1({ assertion }))
          }
        }
      }
      return Object.freeze({ schemaVersion: 1 as const, subject, sourceRevision: adapterInput.sourceRevision,
        recordOutcome: outcomes.length === 0 ? 'no_matching_claims' as const : 'present' as const,
        outcomes: Object.freeze(outcomes), unmappedSourceFields: Object.freeze([]) })
    },
  })
}

export function prepareCapabilityRuleMaterializationV1(input: Readonly<{
  sourceScopeId: string
  subjectSet: AuthoritativeModelSubjectSetV1
  ownershipSnapshots: readonly ProjectedCapabilityRuleOwnershipSnapshot[]
  defaultActivationPolicies: CapabilityRuleDefaultActivationPoliciesV1
}>): PreparedCapabilityRuleMaterializationV1 {
  const definitionSet = projectCapabilityRuleDefinitionSetV1(input)
  const payload = payloadForSnapshot(input.subjectSet, input.ownershipSnapshots,
    definitionSet.defaultActivationPolicies)
  const rawPayload = sanitizeRawSourcePayloadV1({ recordKey: 'materialized-capability-rules-v1', payload })
  const rawSnapshot = buildRawSourceSnapshotRefV1({ sourceKind: 'capability_rule',
    sourceScopeId: input.sourceScopeId, recordSetCompleteness: 'complete',
    rawEnvelopeRefs: [rawPayload.ref] })
  const adapter = createMaterializedCapabilityRuleSourceAdapterV1({ rawPayloadReader: {
    readRawPayload: (ref) => {
      if (ref.storeId !== rawPayload.ref.storeId || ref.recordKey !== rawPayload.ref.recordKey) invalid()
      return rawPayload.persistedPayload
    },
  } })
  const publication = buildEnumerableSourcePublicationV1({ adapter, rawSnapshot })
  const ownerSnapshotRevisions = definitionSet.ownerSnapshotRevisions
  const ruleDefinitionRevision = definitionSet.ruleDefinitionRevision
  const materializationRevision = `capability-rule-materialization-v1:${canonicalSourceFactDigestV1({
    sourceScopeId: input.sourceScopeId, ruleDefinitionRevision,
    authoritativeSubjectSetRevision: payload.authoritativeSubjectSetRevision,
    canonicalSourceRevision: publication.sourceRevision.canonicalSourceRevision,
  })}`
  return Object.freeze({ sourceScopeId: input.sourceScopeId, ruleDefinitionRevision,
    authoritativeSubjectSetRevision: payload.authoritativeSubjectSetRevision,
    ownerSnapshotRevisions, rawPayload, rawSnapshot, publication, materializationRevision })
}
