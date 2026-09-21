import {
  evaluateCapabilityRuleActivationV1,
  projectCapabilityRuleOwnershipSnapshotV1,
  type CapabilityRuleDefaultActivationPolicyV1,
  type CapabilityRuleOwnershipSnapshotV1,
  type ProjectedCapabilityRuleOwnershipSnapshotV1,
} from '../capability-rules/capabilityRuleCoreV1'
import { stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'
import {
  buildAuthoritativeModelSubjectSetV1,
  type AuthoritativeModelSubjectSetV1,
} from './authoritativeModelSubjectSetV1'
import {
  canonicalizeCanonicalModelSubjectV1,
  canonicalSourceFactDigestV1,
  type CanonicalModelSubjectV1,
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
  snapshot: CapabilityRuleOwnershipSnapshotV1
}>

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

function ownerKey(snapshot: MaterializedCapabilityRuleOwnerSnapshotV1): string {
  return `${snapshot.snapshot.ownership}\0${snapshot.snapshot.ownerId}`
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
  const snapshots = values.map((value) => {
    const projected = projectCapabilityRuleOwnershipSnapshotV1(value.snapshot)
    if (projected.snapshotRevision !== value.snapshotRevision) invalid()
    return Object.freeze({ snapshotRevision: projected.snapshotRevision, snapshot: projected.definition })
  }).sort((left, right) => ownerKey(left).localeCompare(ownerKey(right), 'en'))
  if (new Set(snapshots.map(ownerKey)).size !== snapshots.length) invalid()
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
  snapshots: readonly ProjectedCapabilityRuleOwnershipSnapshotV1[],
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
  ownershipSnapshots: readonly ProjectedCapabilityRuleOwnershipSnapshotV1[]
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
  return Object.freeze({ ownerKind: input.ownership, ownerId: input.ownerId,
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
  return Object.freeze({
    sourceKind: 'capability_rule' as const,
    adapterId: 'materialized-capability-rule-source-adapter-v1',
    adapterRevision: MATERIALIZED_CAPABILITY_RULE_ADAPTER_REVISION_V1,
    coverageManifest: MATERIALIZED_CAPABILITY_RULE_COVERAGE_MANIFEST_V1,
    subjectDiscovery: 'enumerable' as const,
    indexRawRecords(rawSnapshot: RawSourceSnapshotRefV1): SourceRecordIndexV1 {
      const { payload } = readPayload(input.rawPayloadReader, rawSnapshot)
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
      const { payload, rawRef } = readPayload(input.rawPayloadReader, adapterInput.rawSnapshot)
      if (!payload.subjects.some((candidate) => subjectKey(candidate) === subjectKey(subject))) {
        return Object.freeze({ schemaVersion: 1 as const, subject, sourceRevision: adapterInput.sourceRevision,
          recordOutcome: 'absent_in_complete_snapshot' as const, outcomes: Object.freeze([]),
          unmappedSourceFields: Object.freeze([]) })
      }
      const outcomes = []
      for (const owner of payload.ownershipSnapshots) {
        const projected = projectCapabilityRuleOwnershipSnapshotV1(owner.snapshot)
        for (const pack of projected.packs) {
          for (const projectedRule of pack.rules) {
            const rule = projectedRule.definition
            if (rule.providerAuthorityId !== subject.providerAuthorityId ||
                rule.endpointProfileId !== subject.endpointProfileId ||
                !selectorMatches(rule.selector, subject.nativeModelId)) continue
            const activation = evaluateCapabilityRuleActivationV1({ mode: pack.definition.mode,
              target: pack.definition.target, configured: rule.configured,
              defaultPolicy: payload.defaultActivationPolicies[owner.snapshot.ownership] })
            if (!activation.enabled) continue
            const mappingId = `materialized-rules.direct.${rule.assertion.path}.v1`
            const observationProvenance = buildObservationProvenanceV1({ sourceRevision: adapterInput.sourceRevision,
              sourceFieldRefs: [Object.freeze({ rawPayloadRef: rawRef,
                sourceRecordIdentity: `${owner.snapshot.ownership}:${owner.snapshot.ownerId}:${rule.ruleId}`,
                sourceFieldPath: `rule.${rule.ruleId}.assertion`, observedPresence: 'present' as const })],
              adapterId: 'materialized-capability-rule-source-adapter-v1',
              adapterRevision: MATERIALIZED_CAPABILITY_RULE_ADAPTER_REVISION_V1, mappingId })
            const context = ruleClaimContext({ ownership: owner.snapshot.ownership,
              ownerId: owner.snapshot.ownerId, packId: pack.definition.packId,
              packRevision: pack.packRevision, packPriority: pack.definition.priority,
              ruleId: rule.ruleId, ruleRevision: projectedRule.ruleRevision,
              rulePriority: rule.priority, selectorKind: rule.selector.kind })
            const evidenceRefs = rule.evidence === null ? [] : [...new Set([
              rule.evidence.evidenceSourceRef, rule.evidence.identityEvidenceSourceRef,
            ])]
            const common = { subject, sourceRevision: adapterInput.sourceRevision,
              path: rule.assertion.path, value: rule.assertion.value,
              sourceClaimIdentity: `${owner.snapshot.ownership}:${owner.snapshot.ownerId}:${projectedRule.ruleRevision}`,
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
  ownershipSnapshots: readonly ProjectedCapabilityRuleOwnershipSnapshotV1[]
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
