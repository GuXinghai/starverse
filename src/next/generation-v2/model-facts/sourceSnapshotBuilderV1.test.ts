import { describe, expect, it } from 'vitest'
import { type CanonicalModelFactSourceAdapterV1 } from './sourceAdapterV1'
import { buildEnumerableSourcePublicationV1 } from './sourceSnapshotBuilderV1'
import { buildRawSourceSnapshotRefV1, sanitizeRawSourcePayloadV1 } from './rawSourceSnapshotV1'
import { PROVIDER_NATIVE_COVERAGE_MANIFESTS_V1 } from './sourceCoverageManifestV1'

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

})
