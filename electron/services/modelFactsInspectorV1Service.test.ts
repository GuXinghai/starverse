import path from 'node:path'
import Database from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../../infra/db/v2/testSchemaV2'
import { CanonicalModelFactSourceV1Repo } from '../../infra/db/repo/canonicalModelFactSourceV1Repo'
import { buildAuthoritativeModelSubjectSetV1 } from '../../src/next/generation-v2/model-facts/authoritativeModelSubjectSetV1'
import { buildCanonicalSourceRevisionRefV1, buildCanonicalSubjectFactV1 } from
  '../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import { buildExplicitAssertionV1, buildObservationProvenanceV1, presentOutcomeV1 } from
  '../../src/next/generation-v2/model-facts/sourceAdapterV1'
import { buildRawSourceSnapshotRefV1, sanitizeRawSourcePayloadV1 } from
  '../../src/next/generation-v2/model-facts/rawSourceSnapshotV1'
import { ModelFactsInspectorV1Service } from './modelFactsInspectorV1Service'

const root = path.resolve(process.cwd())
const subject = Object.freeze({ providerAuthorityId: 'local:ollama', endpointProfileId: 'profile:one',
  nativeModelId: 'qwen-test' })
const other = Object.freeze({ providerAuthorityId: 'local:ollama', endpointProfileId: 'profile:one',
  nativeModelId: 'not-authoritative' })

function createDb() {
  const db = new Database(':memory:')
  applyGenerationV2SchemaForTest(db, root)
  return db
}

function subjectSet() {
  return buildAuthoritativeModelSubjectSetV1([{ subject, proof: Object.freeze({ kind: 'local_profile_binding' as const,
    endpointProfileId: 'profile:one', providerId: 'ollama' as const, protocolContractId: 'ollama-chat',
    profileRevision: 'local-profile-v1:test' }) }])
}

function publishFact(db: Database.Database) {
  const repo = new CanonicalModelFactSourceV1Repo(db, () => 100)
  const raw = sanitizeRawSourcePayloadV1({ recordKey: subject.nativeModelId,
    payload: { secret: 'must-not-persist', thinking: { enabled: true } } })
  const rawSnapshot = buildRawSourceSnapshotRefV1({ sourceKind: 'provider_native', sourceScopeId: 'scope:ollama',
    recordSetCompleteness: 'complete', rawEnvelopeRefs: [raw.ref] })
  const sourceRevision = buildCanonicalSourceRevisionRefV1({ sourceKind: 'provider_native', sourceScopeId: 'scope:ollama',
    rawSourceSnapshotRevision: rawSnapshot.rawSourceSnapshotRevision, adapterRevision: 'adapter:test',
    coverageManifestRevision: 'coverage:test', providerAuthorityRegistryRevision: 'registry:test' })
  const provenance = buildObservationProvenanceV1({ sourceRevision, sourceFieldRefs: [{ rawPayloadRef: raw.ref,
    sourceRecordIdentity: subject.nativeModelId, sourceFieldPath: 'thinking.enabled', observedPresence: 'present' }],
  adapterId: 'native:test', adapterRevision: 'adapter:test', mappingId: 'reasoning.support.v1' })
  const assertion = buildExplicitAssertionV1({ subject, sourceRevision, path: 'reasoning.support',
    value: { kind: 'support', value: 'supported' }, sourceClaimIdentity: 'native:thinking',
    evidenceRefs: ['evidence:test'], observationProvenance: provenance })
  const fact = buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision, recordOutcome: 'present',
    outcomes: [presentOutcomeV1({ assertion })], unmappedSourceFields: [] })
  repo.publishSourceRevision({ rawSnapshot, sourceRevision, rawPayloads: [raw], subjectIndexMode: 'complete',
    subjectFacts: [fact], expectedCurrentRevision: null, fetchedAtMs: 90 })
  return { raw, set: subjectSet() }
}

describe('ModelFactsInspectorV1Service', () => {
  it('searches only the authoritative exact subject set and returns its revision', async () => {
    const db = createDb()
    try {
      const { set } = publishFact(db)
      const service = new ModelFactsInspectorV1Service(db, { readCurrent: async () => set })
      await expect(service.searchSubjects({ query: 'qwen', limit: 10 })).resolves.toEqual({
        subjectSetRevision: set.subjectSetRevision, records: [expect.objectContaining({ subject })], nextCursor: null,
      })
      await expect(service.searchSubjects({ query: 'missing', limit: 10 })).resolves.toMatchObject({ records: [] })
    } finally { db.close() }
  })

  it('returns separate source rows and refuses non-authoritative subjects', async () => {
    const db = createDb()
    try {
      const { set } = publishFact(db)
      const service = new ModelFactsInspectorV1Service(db, { readCurrent: async () => set })
      const result = await service.readInspectorSnapshot({ subject, expectedSubjectSetRevision: set.subjectSetRevision })
      expect(result.sources).toEqual([expect.objectContaining({ state: expect.objectContaining({
        sourceKind: 'provider_native', sourceScopeId: 'scope:ollama' }), subjectFact: expect.objectContaining({
        payload: expect.objectContaining({ subject }) }) })])
      await expect(service.readInspectorSnapshot({ subject: other })).rejects.toThrow(
        'GENERATION_V2_MODEL_FACTS_INSPECTOR_SUBJECT_NOT_FOUND')
    } finally { db.close() }
  })

  it('reads evidence slices and only persisted sanitized raw payloads', async () => {
    const db = createDb()
    try {
      const { raw, set } = publishFact(db)
      const service = new ModelFactsInspectorV1Service(db, { readCurrent: async () => set })
      await expect(service.readEvidenceSlice({ subject, sourceKind: 'provider_native', sourceScopeId: 'scope:ollama',
        path: 'reasoning.support' })).resolves.toMatchObject({ path: 'reasoning.support',
        currentObservation: { kind: 'present_valid' } })
      expect(service.readSanitizedRawPayload(raw.ref)).toEqual({ secret: '[redacted]', thinking: { enabled: true } })
    } finally { db.close() }
  })
})
