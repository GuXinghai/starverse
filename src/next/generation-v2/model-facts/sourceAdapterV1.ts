import {
  buildCanonicalSourceRevisionRefV1,
  buildCanonicalSubjectFactV1,
  canonicalSourceFactDigestV1,
  canonicalizeCanonicalFactValueV1,
  type CanonicalFactAssertionV1,
  type CanonicalFactProvenanceV1,
  type CanonicalFactValueV1,
  type CanonicalFieldOutcomeV1,
  type CanonicalModelSubjectV1,
  type CanonicalObservationProvenanceV1,
  type CanonicalSemanticPathV1,
  type CanonicalSourceRevisionRefV1,
  type CanonicalSubjectFactCandidateV1,
  type CanonicalSubjectFactPayloadV1,
  type CanonicalSubjectFactRefV1,
  type RawSourceSnapshotRefV1,
  type SourceFieldRefV1,
  type SourceRecordIndexV1,
} from './canonicalSourceFactsV1'
import type { RawPayloadReaderV1 } from './rawSourceSnapshotV1'
import type { SourceMappingCoverageManifestV1 } from './sourceCoverageManifestV1'
import { PROVIDER_AUTHORITY_REGISTRY_REVISION_V1 } from './providerAuthorityRegistryV1'

export interface CanonicalModelFactSourceAdapterV1 {
  readonly sourceKind: 'provider_native' | 'models_dev' | 'capability_rule'
  readonly adapterId: string
  readonly adapterRevision: string
  readonly coverageManifest: SourceMappingCoverageManifestV1
  readonly subjectDiscovery: 'enumerable' | 'query_bound'

  indexRawRecords?(rawSnapshot: RawSourceSnapshotRefV1): SourceRecordIndexV1

  adaptExactSubject(input: Readonly<{
    rawSnapshot: RawSourceSnapshotRefV1
    sourceRevision: CanonicalSourceRevisionRefV1
    subject: CanonicalModelSubjectV1
  }>): CanonicalSubjectFactCandidateV1
}

export type SourceAdapterContextV1 = Readonly<{
  rawPayloadReader: RawPayloadReaderV1
}>

export function buildSourceRevisionForAdapterV1(input: Readonly<{
  adapter: CanonicalModelFactSourceAdapterV1
  rawSnapshot: RawSourceSnapshotRefV1
  previousLkgSourceRevision?: string
}>): CanonicalSourceRevisionRefV1 {
  if (input.adapter.sourceKind !== input.rawSnapshot.sourceKind ||
      input.adapter.coverageManifest.sourceSurfaceId.length < 1) {
    throw new Error('GENERATION_V2_CANONICAL_SOURCE_ADAPTER_SCOPE_INVALID')
  }
  return buildCanonicalSourceRevisionRefV1({
    sourceKind: input.adapter.sourceKind,
    sourceScopeId: input.rawSnapshot.sourceScopeId,
    rawSourceSnapshotRevision: input.rawSnapshot.rawSourceSnapshotRevision,
    adapterRevision: input.adapter.adapterRevision,
    coverageManifestRevision: input.adapter.coverageManifest.manifestRevision,
    providerAuthorityRegistryRevision: PROVIDER_AUTHORITY_REGISTRY_REVISION_V1,
    ...(input.previousLkgSourceRevision === undefined ? {} : {
      previousLkgSourceRevision: input.previousLkgSourceRevision,
    }),
  })
}

export function buildObservationProvenanceV1(input: Readonly<{
  sourceRevision: CanonicalSourceRevisionRefV1
  sourceFieldRefs: readonly SourceFieldRefV1[]
  adapterId: string
  adapterRevision: string
  mappingId: string
}>): CanonicalObservationProvenanceV1 {
  return Object.freeze({ sourceKind: input.sourceRevision.sourceKind,
    canonicalSourceRevision: input.sourceRevision.canonicalSourceRevision,
    sourceFieldRefs: Object.freeze([...input.sourceFieldRefs]), adapterId: input.adapterId,
    adapterRevision: input.adapterRevision, mappingId: input.mappingId })
}

export function buildExplicitAssertionV1(input: Readonly<{
  subject: CanonicalModelSubjectV1
  sourceRevision: CanonicalSourceRevisionRefV1
  path: CanonicalSemanticPathV1
  value: CanonicalFactValueV1
  sourceClaimIdentity: string
  evidenceRefs: readonly string[]
  observationProvenance: CanonicalObservationProvenanceV1
  ruleClaim?: CanonicalFactProvenanceV1['ruleClaim']
}>): CanonicalFactAssertionV1 {
  const value = canonicalizeCanonicalFactValueV1(input.path, input.value)
  const claimProjection = Object.freeze({ canonicalSourceRevision: input.sourceRevision.canonicalSourceRevision,
    subject: input.subject, sourceClaimIdentity: input.sourceClaimIdentity, path: input.path, value })
  const provenance = Object.freeze({ ...input.observationProvenance,
    claimId: `canonical-claim-v1:${canonicalSourceFactDigestV1(claimProjection)}`,
    sourceClaimIdentity: input.sourceClaimIdentity, assertionKind: 'explicit' as const,
    evidenceRefs: Object.freeze([...input.evidenceRefs].sort()),
    ...(input.ruleClaim === undefined ? {} : { ruleClaim: input.ruleClaim }) })
  return Object.freeze({ path: input.path, value, provenance })
}

export function buildDerivedAssertionV1(input: Readonly<{
  subject: CanonicalModelSubjectV1
  sourceRevision: CanonicalSourceRevisionRefV1
  path: CanonicalSemanticPathV1
  value: CanonicalFactValueV1
  sourceClaimIdentity: string
  evidenceRefs: readonly string[]
  observationProvenance: CanonicalObservationProvenanceV1
  derivation: NonNullable<CanonicalFactProvenanceV1['derivation']>
  ruleClaim?: CanonicalFactProvenanceV1['ruleClaim']
}>): CanonicalFactAssertionV1 {
  const value = canonicalizeCanonicalFactValueV1(input.path, input.value)
  const derivation = Object.freeze({ ...input.derivation,
    inputClaimRefs: Object.freeze([...input.derivation.inputClaimRefs].sort()),
    inputEvidenceRefs: Object.freeze([...input.derivation.inputEvidenceRefs].sort()) })
  const claimProjection = Object.freeze({ canonicalSourceRevision: input.sourceRevision.canonicalSourceRevision,
    subject: input.subject, sourceClaimIdentity: input.sourceClaimIdentity, path: input.path, value,
    assertionKind: 'derived', derivation })
  const provenance = Object.freeze({ ...input.observationProvenance,
    claimId: `canonical-claim-v1:${canonicalSourceFactDigestV1(claimProjection)}`,
    sourceClaimIdentity: input.sourceClaimIdentity, assertionKind: 'derived' as const,
    evidenceRefs: Object.freeze([...input.evidenceRefs].sort()), derivation,
    ...(input.ruleClaim === undefined ? {} : { ruleClaim: input.ruleClaim }) })
  return Object.freeze({ path: input.path, value, provenance })
}

export function presentOutcomeV1(input: Readonly<{
  assertion: CanonicalFactAssertionV1
  observationIdentity?: string
}>): CanonicalFieldOutcomeV1 {
  const observationId = input.observationIdentity ?? `canonical-observation-v1:${canonicalSourceFactDigestV1({
    claimId: input.assertion.provenance.claimId,
  })}`
  return Object.freeze({ observationId, path: input.assertion.path,
    currentObservation: Object.freeze({ kind: 'present_valid' as const, assertion: input.assertion }),
    effectiveAssertion: input.assertion, disposition: 'current' as const })
}

export function missingOutcomeV1(input: Readonly<{
  path: CanonicalSemanticPathV1
  provenance: CanonicalObservationProvenanceV1
}>): CanonicalFieldOutcomeV1 {
  return Object.freeze({ observationId: `canonical-observation-v1:${canonicalSourceFactDigestV1({
    path: input.path, provenance: input.provenance, kind: 'missing',
  })}`, path: input.path,
  currentObservation: Object.freeze({ kind: 'missing' as const, provenance: input.provenance }),
  disposition: 'none' as const })
}

export function invalidOutcomeV1(input: Readonly<{
  path: CanonicalSemanticPathV1
  provenance: CanonicalObservationProvenanceV1
  errorCode: string
}>): CanonicalFieldOutcomeV1 {
  return Object.freeze({ observationId: `canonical-observation-v1:${canonicalSourceFactDigestV1({
    path: input.path, provenance: input.provenance, kind: 'invalid', errorCode: input.errorCode,
  })}`, path: input.path,
  currentObservation: Object.freeze({ kind: 'invalid' as const, errorCode: input.errorCode,
    provenance: input.provenance }), disposition: 'none' as const })
}

export function publishCanonicalSubjectFactV1(input: Readonly<{
  adapter: CanonicalModelFactSourceAdapterV1
  rawSnapshot: RawSourceSnapshotRefV1
  sourceRevision: CanonicalSourceRevisionRefV1
  subject: CanonicalModelSubjectV1
  previous?: CanonicalSubjectFactPayloadV1 | null
}>): Readonly<{ payload: CanonicalSubjectFactPayloadV1; ref: CanonicalSubjectFactRefV1 }> {
  if (input.adapter.sourceKind !== input.rawSnapshot.sourceKind ||
      input.sourceRevision.sourceKind !== input.adapter.sourceKind ||
      input.sourceRevision.sourceScopeId !== input.rawSnapshot.sourceScopeId ||
      input.sourceRevision.rawSourceSnapshotRevision !== input.rawSnapshot.rawSourceSnapshotRevision ||
      input.sourceRevision.adapterRevision !== input.adapter.adapterRevision ||
      input.sourceRevision.coverageManifestRevision !== input.adapter.coverageManifest.manifestRevision ||
      input.sourceRevision.providerAuthorityRegistryRevision !== PROVIDER_AUTHORITY_REGISTRY_REVISION_V1) {
    throw new Error('GENERATION_V2_CANONICAL_SOURCE_ADAPTER_SCOPE_INVALID')
  }
  return buildCanonicalSubjectFactV1(input.adapter.adaptExactSubject({ rawSnapshot: input.rawSnapshot,
    sourceRevision: input.sourceRevision, subject: input.subject }), input.previous)
}
