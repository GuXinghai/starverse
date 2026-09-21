import {
  canonicalSourceFactDigestV1,
  canonicalizeCanonicalModelSubjectV1,
  type CanonicalSourceRevisionRefV1,
  type CanonicalSubjectFactPayloadV1,
  type CanonicalSubjectFactRefV1,
  type RawSourceSnapshotRefV1,
  type SourceRecordIndexV1,
} from './canonicalSourceFactsV1'
import {
  buildSourceRevisionForAdapterV1,
  publishCanonicalSubjectFactV1,
  type CanonicalModelFactSourceAdapterV1,
} from './sourceAdapterV1'
import { stableSerializeProviderRequestV2 } from '../compiler/stableSerialize'

export type CanonicalEnumerableSourcePublicationV1 = Readonly<{
  sourceRevision: CanonicalSourceRevisionRefV1
  recordIndex: SourceRecordIndexV1
  subjectFacts: readonly Readonly<{
    payload: CanonicalSubjectFactPayloadV1
    ref: CanonicalSubjectFactRefV1
  }>[]
  publicationDigest: string
}>

export type CanonicalStoredSourceRevisionV1 = Readonly<{
  sourceRevision: CanonicalSourceRevisionRefV1
  rawSnapshot: RawSourceSnapshotRefV1
  subjectIndexMode: 'complete'
}>

export class SourceSnapshotBuilderV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_SOURCE_SNAPSHOT_BUILDER_INVALID'
    | 'GENERATION_V2_SOURCE_SNAPSHOT_DUPLICATE_SUBJECT') {
    super(code)
    this.name = 'SourceSnapshotBuilderV1Error'
  }
}

function subjectKey(subject: CanonicalSubjectFactRefV1['subject']): string {
  return stableSerializeProviderRequestV2(subject)
}

export function buildEnumerableSourcePublicationV1(input: Readonly<{
  adapter: CanonicalModelFactSourceAdapterV1
  rawSnapshot: RawSourceSnapshotRefV1
  previousSourceRevision?: string
  previousSubjectFact?(subjectKey: string): CanonicalSubjectFactPayloadV1 | null
}>): CanonicalEnumerableSourcePublicationV1 {
  if (input.adapter.subjectDiscovery !== 'enumerable') {
    throw new SourceSnapshotBuilderV1Error('GENERATION_V2_SOURCE_SNAPSHOT_BUILDER_INVALID')
  }
  const sourceRevision = buildSourceRevisionForAdapterV1({ adapter: input.adapter,
    rawSnapshot: input.rawSnapshot,
    ...(input.previousSourceRevision === undefined ? {} : {
      previousLkgSourceRevision: input.previousSourceRevision,
    }) })

  // An index failure means the response envelope/source identity is not trustworthy. The caller
  // must leave the existing current pointer untouched. Individual malformed records belong in
  // invalidRecordRefs and do not reach this failure boundary.
  const indexed = input.adapter.indexRawRecords(input.rawSnapshot)
  if (indexed.sourceScopeId !== input.rawSnapshot.sourceScopeId ||
      indexed.recordSetCompleteness !== input.rawSnapshot.recordSetCompleteness &&
      input.rawSnapshot.recordSetCompleteness !== 'not_applicable') {
    throw new SourceSnapshotBuilderV1Error('GENERATION_V2_SOURCE_SNAPSHOT_BUILDER_INVALID')
  }
  const subjects = indexed.exactSubjects.map(canonicalizeCanonicalModelSubjectV1)
    .sort((left, right) => subjectKey(left).localeCompare(subjectKey(right), 'en'))
  if (new Set(subjects.map(subjectKey)).size !== subjects.length) {
    throw new SourceSnapshotBuilderV1Error('GENERATION_V2_SOURCE_SNAPSHOT_DUPLICATE_SUBJECT')
  }

  const subjectFacts = subjects.map((subject) => publishCanonicalSubjectFactV1({
    adapter: input.adapter,
    rawSnapshot: input.rawSnapshot,
    sourceRevision,
    subject,
    ...(input.previousSubjectFact === undefined ? {} : {
      previous: input.previousSubjectFact(subjectKey(subject)),
    }),
  }))
  const recordIndex = Object.freeze({ sourceScopeId: indexed.sourceScopeId,
    recordSetCompleteness: indexed.recordSetCompleteness,
    exactSubjects: Object.freeze(subjects),
    invalidRecordRefs: Object.freeze([...indexed.invalidRecordRefs].sort((left, right) =>
      `${left.storeId}\0${left.recordKey}`.localeCompare(`${right.storeId}\0${right.recordKey}`, 'en'))) })
  const projection = Object.freeze({ canonicalSourceRevision: sourceRevision.canonicalSourceRevision,
    recordIndex, subjectFactRefs: Object.freeze(subjectFacts.map((entry) => entry.ref)) })
  return Object.freeze({ sourceRevision, recordIndex, subjectFacts: Object.freeze(subjectFacts),
    publicationDigest: `canonical-source-publication-v1:${canonicalSourceFactDigestV1(projection)}` })
}
