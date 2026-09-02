import Database from 'better-sqlite3'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildCanonicalSourceRevisionRefV1,
  buildCanonicalSubjectFactV1,
  type CanonicalSourceKindV1,
  type CanonicalSourceRevisionRefV1,
  type CanonicalSubjectFactPayloadV1,
} from '../../../src/next/generation-v2/model-facts/canonicalSourceFactsV1'
import {
  buildExplicitAssertionV1,
  buildObservationProvenanceV1,
  invalidOutcomeV1,
  missingOutcomeV1,
  presentOutcomeV1,
} from '../../../src/next/generation-v2/model-facts/sourceAdapterV1'
import {
  buildRawSourceSnapshotRefV1,
  sanitizeRawSourcePayloadV1,
} from '../../../src/next/generation-v2/model-facts/rawSourceSnapshotV1'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { CanonicalModelFactSourceV1Repo } from './canonicalModelFactSourceV1Repo'

const root = path.resolve(process.cwd())
const subject = Object.freeze({ providerAuthorityId: 'google-ai-studio',
  endpointProfileId: 'gemini-developer-api-v1beta', nativeModelId: 'models/gemini-test' })

function createDb() {
  const db = new Database(':memory:')
  applyGenerationV2SchemaForTest(db, root)
  return db
}

function sourceFixture(input: Readonly<{
  scope: string
  marker: string
  sourceKind?: CanonicalSourceKindV1
  previous?: string
}>) {
  const sourceKind = input.sourceKind ?? 'provider_native'
  const raw = sanitizeRawSourcePayloadV1({ recordKey: subject.nativeModelId,
    payload: { marker: input.marker, thinking: true, apiKey: 'must-not-persist' } })
  const rawSnapshot = buildRawSourceSnapshotRefV1({ sourceKind, sourceScopeId: input.scope,
    recordSetCompleteness: sourceKind === 'capability_rule' ? 'not_applicable' : 'complete',
    rawEnvelopeRefs: [raw.ref] })
  const sourceRevision = buildCanonicalSourceRevisionRefV1({ sourceKind, sourceScopeId: input.scope,
    rawSourceSnapshotRevision: rawSnapshot.rawSourceSnapshotRevision,
    adapterRevision: `adapter:${input.marker}`, coverageManifestRevision: 'coverage:v1',
    providerAuthorityRegistryRevision: 'registry:v1',
    ...(input.previous === undefined ? {} : { previousLkgSourceRevision: input.previous }) })
  return { raw, rawSnapshot, sourceRevision }
}

function presentFact(sourceRevision: CanonicalSourceRevisionRefV1, rawRef: ReturnType<typeof sanitizeRawSourcePayloadV1>['ref']) {
  const provenance = buildObservationProvenanceV1({ sourceRevision, sourceFieldRefs: [{ rawPayloadRef: rawRef,
    sourceRecordIdentity: subject.nativeModelId, sourceFieldPath: 'thinking', observedPresence: 'present' }],
  adapterId: 'provider-native:test', adapterRevision: sourceRevision.adapterRevision, mappingId: 'thinking.v1' })
  const assertion = buildExplicitAssertionV1({ subject, sourceRevision, path: 'reasoning.support',
    value: { kind: 'support', value: 'supported' }, sourceClaimIdentity: 'thinking:true',
    evidenceRefs: ['evidence:test'], observationProvenance: provenance })
  return buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision,
    recordOutcome: 'present', outcomes: [presentOutcomeV1({ assertion })], unmappedSourceFields: [] })
}

function emptyFact(sourceRevision: CanonicalSourceRevisionRefV1) {
  return buildCanonicalSubjectFactV1({ schemaVersion: 1, subject, sourceRevision,
    recordOutcome: 'no_matching_claims', outcomes: [], unmappedSourceFields: [] })
}

describe('CanonicalModelFactSourceV1Repo', () => {
  it('atomically stores sanitized immutable raw payloads, exact-subject facts, and freshness outside source identity', () => {
    const db = createDb()
    let now = 100
    try {
      const repo = new CanonicalModelFactSourceV1Repo(db, () => now)
      expect(repo.configureRefresh({ sourceKind: 'provider_native', sourceScopeId: 'scope:a',
        refreshCadenceMs: 60_000 })).toMatchObject({ currentSourceRevision: null, pointerRevision: 0,
        refreshCadenceMs: 60_000 })
      const fixture = sourceFixture({ scope: 'scope:a', marker: 'first' })
      const fact = presentFact(fixture.sourceRevision, fixture.raw.ref)
      const published = repo.publishSourceRevision({ ...fixture, rawPayloads: [fixture.raw],
        subjectIndexMode: 'complete', subjectFacts: [fact], expectedCurrentRevision: null,
        fetchedAtMs: 80, lastAttemptedAtMs: 90 })
      expect(published.state).toMatchObject({ currentSourceRevision: fixture.sourceRevision.canonicalSourceRevision,
        pointerRevision: 1, fetchedAtMs: 80, lastSucceededAtMs: 100, lastAttemptedAtMs: 90,
        staleReason: null, refreshCadenceMs: 60_000 })
      expect(repo.readRawPayload(fixture.raw.ref)).toEqual({ apiKey: '[redacted]', marker: 'first', thinking: true })
      expect(repo.readSubjectFact({ canonicalSourceRevision: fixture.sourceRevision.canonicalSourceRevision,
        subject })).toEqual(fact)
      expect(() => db.prepare(`UPDATE canonical_model_fact_raw_payload_v1
        SET payload_json='{}' WHERE store_id=?`).run(fixture.raw.ref.storeId)).toThrow(/immutable/u)

      now = 120
      const refreshed = repo.publishSourceRevision({ ...fixture, rawPayloads: [fixture.raw],
        subjectIndexMode: 'complete', subjectFacts: [fact],
        expectedCurrentRevision: fixture.sourceRevision.canonicalSourceRevision,
        fetchedAtMs: 110, lastAttemptedAtMs: 115 })
      expect(refreshed.source.sourceRevision).toEqual(fixture.sourceRevision)
      expect(refreshed.state).toMatchObject({ pointerRevision: 1, fetchedAtMs: 110,
        lastSucceededAtMs: 120, lastAttemptedAtMs: 115 })
    } finally { db.close() }
  })

  it('keeps refresh state and current pointers independent by source kind and scope', () => {
    const db = createDb()
    try {
      const repo = new CanonicalModelFactSourceV1Repo(db, () => 200)
      const native = sourceFixture({ scope: 'scope:shared', marker: 'native' })
      repo.publishSourceRevision({ ...native, rawPayloads: [native.raw], subjectIndexMode: 'complete',
        subjectFacts: [emptyFact(native.sourceRevision)], expectedCurrentRevision: null, fetchedAtMs: 180 })
      repo.configureRefresh({ sourceKind: 'models_dev', sourceScopeId: 'scope:shared', refreshCadenceMs: 300_000 })
      const failed = repo.recordRefreshFailure({ sourceKind: 'models_dev', sourceScopeId: 'scope:shared',
        attemptedAtMs: 190, staleReason: 'network_unavailable' })
      expect(failed).toMatchObject({ currentSourceRevision: null, pointerRevision: 0,
        lastAttemptedAtMs: 190, staleReason: 'network_unavailable', refreshCadenceMs: 300_000 })
      expect(repo.readSourceState('provider_native', 'scope:shared')).toMatchObject({
        currentSourceRevision: native.sourceRevision.canonicalSourceRevision, staleReason: null,
      })
    } finally { db.close() }
  })

  it('rolls back an invalid same-source publication without moving the current pointer', () => {
    const db = createDb()
    let now = 300
    try {
      const repo = new CanonicalModelFactSourceV1Repo(db, () => now)
      const first = sourceFixture({ scope: 'scope:atomic', marker: 'first' })
      const firstFact = emptyFact(first.sourceRevision)
      repo.publishSourceRevision({ ...first, rawPayloads: [first.raw], subjectIndexMode: 'complete',
        subjectFacts: [firstFact], expectedCurrentRevision: null, fetchedAtMs: 290 })
      const countBefore = db.prepare('SELECT count(*) AS count FROM canonical_model_fact_raw_payload_v1').get()
      now = 310
      const second = sourceFixture({ scope: 'scope:atomic', marker: 'second',
        previous: first.sourceRevision.canonicalSourceRevision })
      expect(() => repo.publishSourceRevision({ ...second, rawPayloads: [second.raw],
        subjectIndexMode: 'complete', subjectFacts: [firstFact],
        expectedCurrentRevision: first.sourceRevision.canonicalSourceRevision, fetchedAtMs: 305 })).toThrow(
        'GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_INPUT_INVALID',
      )
      expect(repo.readSourceRevision(second.sourceRevision.canonicalSourceRevision)).toBeNull()
      expect(db.prepare('SELECT count(*) AS count FROM canonical_model_fact_raw_payload_v1').get()).toEqual(countBefore)
      expect(repo.readSourceState('provider_native', 'scope:atomic')?.currentSourceRevision)
        .toBe(first.sourceRevision.canonicalSourceRevision)
    } finally { db.close() }
  })

  it('uses a savepoint when an outer transaction catches a failed publication and commits', () => {
    const db = createDb()
    try {
      const repo = new CanonicalModelFactSourceV1Repo(db, () => 400)
      const first = sourceFixture({ scope: 'scope:outer-atomic', marker: 'first' })
      const firstFact = emptyFact(first.sourceRevision)
      repo.publishSourceRevision({ ...first, rawPayloads: [first.raw], subjectIndexMode: 'complete',
        subjectFacts: [firstFact], expectedCurrentRevision: null, fetchedAtMs: 390 })
      const countBefore = db.prepare('SELECT count(*) AS count FROM canonical_model_fact_raw_payload_v1').get()
      const second = sourceFixture({ scope: 'scope:outer-atomic', marker: 'second',
        previous: first.sourceRevision.canonicalSourceRevision })

      db.exec('BEGIN IMMEDIATE')
      try {
        expect(() => repo.publishSourceRevision({ ...second, rawPayloads: [second.raw],
          subjectIndexMode: 'complete', subjectFacts: [firstFact],
          expectedCurrentRevision: first.sourceRevision.canonicalSourceRevision,
          fetchedAtMs: 395 })).toThrow('GENERATION_V2_CANONICAL_MODEL_FACT_SOURCE_INPUT_INVALID')
        db.exec('COMMIT')
      } catch (error) {
        if (db.inTransaction) db.exec('ROLLBACK')
        throw error
      }

      expect(repo.readSourceRevision(second.sourceRevision.canonicalSourceRevision)).toBeNull()
      expect(db.prepare('SELECT count(*) AS count FROM canonical_model_fact_raw_payload_v1').get()).toEqual(countBefore)
      expect(repo.readSourceState('provider_native', 'scope:outer-atomic')?.currentSourceRevision)
        .toBe(first.sourceRevision.canonicalSourceRevision)
    } finally { db.close() }
  })

  it('supports query-bound materialization and preserves only live pins and predecessor/LKG provenance', () => {
    const db = createDb()
    let now = 10
    try {
      const repo = new CanonicalModelFactSourceV1Repo(db, () => now)
      const first = sourceFixture({ scope: 'scope:retention', marker: 'first', sourceKind: 'capability_rule' })
      repo.publishSourceRevision({ ...first, rawPayloads: [first.raw], subjectIndexMode: 'query_bound',
        expectedCurrentRevision: null, fetchedAtMs: 5 })
      const firstFact = repo.materializeSubjectFact(emptyFact(first.sourceRevision))
      const pinId = repo.pinRetention({ ownerKind: 'runtime_snapshot', ownerId: 'request:1',
        target: { kind: 'subject_fact', canonicalSubjectFactRevision: firstFact.ref.canonicalSubjectFactRevision } })
      expect(pinId).toMatch(/^canonical-fact-pin-v1:[0-9a-f]{64}$/u)

      now = 20
      const second = sourceFixture({ scope: 'scope:retention', marker: 'second', sourceKind: 'capability_rule',
        previous: first.sourceRevision.canonicalSourceRevision })
      repo.publishSourceRevision({ ...second, rawPayloads: [second.raw], subjectIndexMode: 'query_bound',
        expectedCurrentRevision: first.sourceRevision.canonicalSourceRevision, fetchedAtMs: 15 })
      now = 30
      const third = sourceFixture({ scope: 'scope:retention', marker: 'third', sourceKind: 'capability_rule',
        previous: second.sourceRevision.canonicalSourceRevision })
      repo.publishSourceRevision({ ...third, rawPayloads: [third.raw], subjectIndexMode: 'query_bound',
        expectedCurrentRevision: second.sourceRevision.canonicalSourceRevision, fetchedAtMs: 25 })

      expect(repo.pruneRetainedData(100).deletedSubjectFactCount).toBe(0)
      expect(repo.readSubjectFactByRevision(firstFact.ref.canonicalSubjectFactRevision)).toEqual(firstFact)
      expect(repo.releaseRetentionPins('runtime_snapshot', 'request:1')).toBe(1)
      expect(repo.pruneRetainedData(100)).toMatchObject({ deletedSubjectFactCount: 1,
        deletedSourceRevisionCount: 0, deletedRawSnapshotCount: 0, deletedRawPayloadCount: 0 })
      expect(repo.readSubjectFactByRevision(firstFact.ref.canonicalSubjectFactRevision)).toBeNull()

      now = 40
      const fourth = sourceFixture({ scope: 'scope:retention', marker: 'fourth', sourceKind: 'capability_rule' })
      repo.publishSourceRevision({ ...fourth, rawPayloads: [fourth.raw], subjectIndexMode: 'query_bound',
        expectedCurrentRevision: third.sourceRevision.canonicalSourceRevision, fetchedAtMs: 35 })
      const pruned = repo.pruneRetainedData(100)
      expect(pruned).toMatchObject({ deletedSubjectFactCount: 0, deletedSourceRevisionCount: 3,
        deletedRawSnapshotCount: 3, deletedRawPayloadCount: 3 })
      expect(repo.readSubjectFactByRevision(firstFact.ref.canonicalSubjectFactRevision)).toBeNull()
      expect(repo.readSourceRevision(second.sourceRevision.canonicalSourceRevision)).toBeNull()
      expect(repo.readSourceRevision(third.sourceRevision.canonicalSourceRevision)).toBeNull()
      expect(repo.readSourceRevision(fourth.sourceRevision.canonicalSourceRevision)).not.toBeNull()
    } finally { db.close() }
  })

  it('persists a field-level invalid observation with an exact previous-source LKG assertion', () => {
    const db = createDb()
    let now = 50
    try {
      const repo = new CanonicalModelFactSourceV1Repo(db, () => now)
      const first = sourceFixture({ scope: 'scope:lkg', marker: 'valid' })
      const validFact = presentFact(first.sourceRevision, first.raw.ref)
      repo.publishSourceRevision({ ...first, rawPayloads: [first.raw], subjectIndexMode: 'complete',
        subjectFacts: [validFact], expectedCurrentRevision: null, fetchedAtMs: 40 })

      now = 60
      const second = sourceFixture({ scope: 'scope:lkg', marker: 'invalid',
        previous: first.sourceRevision.canonicalSourceRevision })
      const provenance = buildObservationProvenanceV1({ sourceRevision: second.sourceRevision,
        sourceFieldRefs: [{ rawPayloadRef: second.raw.ref, sourceRecordIdentity: subject.nativeModelId,
          sourceFieldPath: 'thinking', observedPresence: 'present' }], adapterId: 'provider-native:test',
        adapterRevision: second.sourceRevision.adapterRevision, mappingId: 'thinking.v1' })
      const invalidFact = buildCanonicalSubjectFactV1({ schemaVersion: 1, subject,
        sourceRevision: second.sourceRevision, recordOutcome: 'present',
        outcomes: [invalidOutcomeV1({ path: 'reasoning.support', provenance, errorCode: 'invalid_boolean' })],
        unmappedSourceFields: [] }, validFact.payload)
      repo.publishSourceRevision({ ...second, rawPayloads: [second.raw], subjectIndexMode: 'complete',
        subjectFacts: [invalidFact], expectedCurrentRevision: first.sourceRevision.canonicalSourceRevision,
        fetchedAtMs: 55 })
      const persisted = repo.readSubjectFact({ canonicalSourceRevision: second.sourceRevision.canonicalSourceRevision,
        subject })!
      expect(persisted.payload.outcomes[0]).toMatchObject({ disposition: 'lkg_retained_after_invalid',
        effectiveAssertion: validFact.payload.outcomes[0].effectiveAssertion })

      const third = sourceFixture({ scope: 'scope:lkg', marker: 'missing',
        previous: second.sourceRevision.canonicalSourceRevision })
      const missingProvenance = buildObservationProvenanceV1({ sourceRevision: third.sourceRevision,
        sourceFieldRefs: [{ rawPayloadRef: third.raw.ref, sourceRecordIdentity: subject.nativeModelId,
          sourceFieldPath: 'thinking', observedPresence: 'expected_missing' }], adapterId: 'provider-native:test',
        adapterRevision: third.sourceRevision.adapterRevision, mappingId: 'thinking.v1' })
      const missingFact = buildCanonicalSubjectFactV1({ schemaVersion: 1, subject,
        sourceRevision: third.sourceRevision, recordOutcome: 'present',
        outcomes: [missingOutcomeV1({ path: 'reasoning.support', provenance: missingProvenance })],
        unmappedSourceFields: [] }, persisted.payload as CanonicalSubjectFactPayloadV1)
      expect(missingFact.payload.outcomes[0]).not.toHaveProperty('effectiveAssertion')
    } finally { db.close() }
  })
})
