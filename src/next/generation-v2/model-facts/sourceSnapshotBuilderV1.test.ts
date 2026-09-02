import { describe, expect, it } from 'vitest'
import {
  buildExplicitAssertionV1,
  buildObservationProvenanceV1,
  buildSourceRevisionForAdapterV1,
  invalidOutcomeV1,
  presentOutcomeV1,
  type CanonicalModelFactSourceAdapterV1,
} from './sourceAdapterV1'
import {
  buildEnumerableSourcePublicationV1,
  materializeQueryBoundSubjectFactV1,
  type CanonicalStoredSourceRevisionV1,
  type CanonicalSubjectFactPublicationV1,
} from './sourceSnapshotBuilderV1'
import { buildRawSourceSnapshotRefV1, sanitizeRawSourcePayloadV1 } from './rawSourceSnapshotV1'
import {
  CAPABILITY_RULE_COVERAGE_MANIFEST_V1,
  PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1,
} from './sourceCoverageManifestV1'

const raw = sanitizeRawSourcePayloadV1({ recordKey: 'root', payload: { data: [{ id: 'a' }, { id: 'b' }] } })
const rawSnapshot = buildRawSourceSnapshotRefV1({ sourceKind: 'provider_native', sourceScopeId: 'scope:test',
  recordSetCompleteness: 'complete', rawEnvelopeRefs: [raw.ref] })

function adapter(subjects = ['b', 'a']): CanonicalModelFactSourceAdapterV1 {
  return {
    sourceKind: 'provider_native', adapterId: 'test-adapter', adapterRevision: 'test-adapter-v1',
    coverageManifest: PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1['openai-models-v1'],
    subjectDiscovery: 'enumerable',
    indexRawRecords: () => ({ sourceScopeId: 'scope:test', recordSetCompleteness: 'complete',
      exactSubjects: subjects.map((nativeModelId) => ({ providerAuthorityId: 'openai',
        endpointProfileId: 'openai-api-v1', nativeModelId })), invalidRecordRefs: [] }),
    adaptExactSubject: ({ sourceRevision, subject }) => ({ schemaVersion: 1, subject, sourceRevision,
      recordOutcome: 'present', outcomes: [], unmappedSourceFields: [] }),
  }
}

describe('Source Snapshot Builder V1', () => {
  it('builds a deterministic complete same-source publication', () => {
    const first = buildEnumerableSourcePublicationV1({ adapter: adapter(), rawSnapshot })
    const second = buildEnumerableSourcePublicationV1({ adapter: adapter(), rawSnapshot })
    expect(first).toEqual(second)
    expect(first.recordIndex.exactSubjects.map((subject) => subject.nativeModelId)).toEqual(['a', 'b'])
    expect(first.subjectFacts).toHaveLength(2)
  })

  it('rejects duplicate exact identities rather than making order-dependent output', () => {
    expect(() => buildEnumerableSourcePublicationV1({ adapter: adapter(['a', 'a']), rawSnapshot }))
      .toThrowError('GENERATION_V2_SOURCE_SNAPSHOT_DUPLICATE_SUBJECT')
  })

  it('replays an unqueried predecessor before applying field LKG for a query-bound subject', () => {
    const subject = { providerAuthorityId: 'openai', endpointProfileId: 'openai-api-v1',
      nativeModelId: 'gpt-test' }
    const firstRaw = sanitizeRawSourcePayloadV1({ recordKey: 'rules', payload: { marker: 'valid' } })
    const secondRaw = sanitizeRawSourcePayloadV1({ recordKey: 'rules', payload: { marker: 'invalid' } })
    const firstSnapshot = buildRawSourceSnapshotRefV1({ sourceKind: 'capability_rule',
      sourceScopeId: 'rules:test', recordSetCompleteness: 'not_applicable', rawEnvelopeRefs: [firstRaw.ref] })
    const secondSnapshot = buildRawSourceSnapshotRefV1({ sourceKind: 'capability_rule',
      sourceScopeId: 'rules:test', recordSetCompleteness: 'not_applicable', rawEnvelopeRefs: [secondRaw.ref] })
    const queryAdapter: CanonicalModelFactSourceAdapterV1 = {
      sourceKind: 'capability_rule', adapterId: 'query-test', adapterRevision: 'query-test-v1',
      coverageManifest: CAPABILITY_RULE_COVERAGE_MANIFEST_V1, subjectDiscovery: 'query_bound',
      adaptExactSubject: ({ rawSnapshot: snapshot, sourceRevision, subject: exactSubject }) => {
        const provenance = buildObservationProvenanceV1({ sourceRevision, sourceFieldRefs: [{
          rawPayloadRef: snapshot.rawEnvelopeRefs[0]!, sourceRecordIdentity: 'rules',
          sourceFieldPath: 'marker', observedPresence: 'present',
        }], adapterId: 'query-test', adapterRevision: 'query-test-v1', mappingId: 'marker.v1' })
        if (snapshot.rawSourceSnapshotRevision === secondSnapshot.rawSourceSnapshotRevision) {
          return { schemaVersion: 1, subject: exactSubject, sourceRevision, recordOutcome: 'present',
            outcomes: [invalidOutcomeV1({ path: 'reasoning.support', provenance,
              errorCode: 'invalid_marker' })], unmappedSourceFields: [] }
        }
        const assertion = buildExplicitAssertionV1({ subject: exactSubject, sourceRevision,
          path: 'reasoning.support', value: { kind: 'support', value: 'supported' },
          sourceClaimIdentity: 'marker:valid', evidenceRefs: ['evidence:test'],
          observationProvenance: provenance, ruleClaim: { ownerKind: 'built_in', ownerId: 'starverse',
            packId: 'test-pack', ruleId: 'test-rule', packRevision: 'pack:v1', ruleRevision: 'rule:v1',
            selectorKind: 'exact', selectorRef: 'exact:gpt-test', packPriority: 0, rulePriority: 0,
            effectiveRulePriority: 0, prioritySemanticsRevision: 'test-priority-v1' } })
        return { schemaVersion: 1, subject: exactSubject, sourceRevision, recordOutcome: 'present',
          outcomes: [presentOutcomeV1({ assertion })], unmappedSourceFields: [] }
      },
    }
    const firstRevision = buildSourceRevisionForAdapterV1({ adapter: queryAdapter, rawSnapshot: firstSnapshot })
    const secondRevision = buildSourceRevisionForAdapterV1({ adapter: queryAdapter, rawSnapshot: secondSnapshot,
      previousLkgSourceRevision: firstRevision.canonicalSourceRevision })
    const sources = new Map<string, CanonicalStoredSourceRevisionV1>([
      [firstRevision.canonicalSourceRevision, { sourceRevision: firstRevision,
        rawSnapshot: firstSnapshot, subjectIndexMode: 'query_bound' }],
      [secondRevision.canonicalSourceRevision, { sourceRevision: secondRevision,
        rawSnapshot: secondSnapshot, subjectIndexMode: 'query_bound' }],
    ])
    const createStore = () => {
      const facts = new Map<string, CanonicalSubjectFactPublicationV1>()
      return {
        readSourceRevision: (revision: string) => sources.get(revision) ?? null,
        readSubjectFact: ({ canonicalSourceRevision }: { canonicalSourceRevision: string }) =>
          facts.get(canonicalSourceRevision) ?? null,
        materializeSubjectFact: (fact: CanonicalSubjectFactPublicationV1) => {
          facts.set(fact.ref.sourceRevision.canonicalSourceRevision, fact)
          return fact
        },
      }
    }
    const directStore = createStore()
    const direct = materializeQueryBoundSubjectFactV1({ store: directStore,
      canonicalSourceRevision: secondRevision.canonicalSourceRevision, subject,
      resolveAdapter: () => queryAdapter })
    const orderedStore = createStore()
    materializeQueryBoundSubjectFactV1({ store: orderedStore,
      canonicalSourceRevision: firstRevision.canonicalSourceRevision, subject,
      resolveAdapter: () => queryAdapter })
    const ordered = materializeQueryBoundSubjectFactV1({ store: orderedStore,
      canonicalSourceRevision: secondRevision.canonicalSourceRevision, subject,
      resolveAdapter: () => queryAdapter })
    expect(direct).toEqual(ordered)
    expect(direct.payload.outcomes[0]).toMatchObject({ disposition: 'lkg_retained_after_invalid' })
  })
})
