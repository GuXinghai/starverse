import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { ModelCatalogV2Repo } from './modelCatalogV2Repo'
import { createProviderFailureV2 } from '../../../src/shared/provider/providerFailureV2'

const scope = Object.freeze({ providerKey: 'google_ai_studio', credentialScopeId: 'scope:google:1',
  endpointProfileId: 'gemini_api_v1', operationContractId: 'gemini-developer-api-models-v1beta', category: '' })

function failure(operationId: string, message = 'network error') {
  return createProviderFailureV2({
    context: { origin: 'network_transport', phase: 'request_open', providerId: scope.providerKey,
      contractId: scope.operationContractId, operationId, requestSequence: 1 },
    transportError: new Error(message),
  })
}

function createDb() {
  const db = new BetterSqlite3(':memory:')
  applyGenerationV2SchemaForTest(db, path.resolve(process.cwd()))
  return db
}

describe('ModelCatalogV2Repo', () => {
  it('persists immutable rich snapshots and keeps the active snapshot after a failed refresh', () => {
    const db = createDb()
    let now = 100
    const repo = new ModelCatalogV2Repo(db, () => now)
    try {
      repo.beginSync(scope, 'attempt:1')
      expect(repo.readStatus(scope)?.authorityRevision).toBe(1)
      const active = repo.commitSync({ scope, attemptId: 'attempt:1', responseDigest: '1'.repeat(64), observedAtMs: 90,
        applyMode: 'automatic',
        items: [{ providerKey: 'google_ai_studio', nativeModelId: 'gemini-3.1-flash-image',
          reportedFacts: { supportedGenerationMethods: { presence: 'present',
            value: ['generateContent'], rawPath: '$.supportedGenerationMethods' } },
          rawProviderRecord: { name: 'models/gemini-3.1-flash-image',
            supportedGenerationMethods: ['generateContent'] } }] })
      expect(active.items[0]).toMatchObject({ nativeModelId: 'gemini-3.1-flash-image',
        reportedFacts: { supportedGenerationMethods: { presence: 'present', value: ['generateContent'] } },
        rawProviderRecord: { name: 'models/gemini-3.1-flash-image' } })
      expect(active).toMatchObject({ codecVersion: 1, completeness: 'complete', adapterRevision: 'catalog-adapter-v1',
        aggregateEvidence: { schemaVersion: 1, completeness: 'complete', modelCount: 1 },
        status: { authorityRevision: 2 } })

      now = 200
      repo.beginSync(scope, 'attempt:2')
      const status = repo.failSync(scope, 'attempt:2', failure('attempt:2'))
      expect(status).toMatchObject({ authorityRevision: 4, syncState: 'error',
        errorCode: 'PROVIDER_REQUEST_OPEN_FAILED', activeSnapshotDigest: '1'.repeat(64) })
      expect(repo.readActive(scope)?.items).toEqual(active.items)
    } finally { db.close() }
  })

  it('persists raw sync failure facts while preserving the active snapshot', () => {
    const db = createDb()
    const repo = new ModelCatalogV2Repo(db, () => 200)
    try {
      repo.beginSync(scope, 'attempt:raw')
      repo.commitSync({ scope, attemptId: 'attempt:raw', responseDigest: 'e'.repeat(64), observedAtMs: 100,
        applyMode: 'automatic', items: [{ id: 'known-good' }] })
      repo.beginSync(scope, 'attempt:failure')
      const failure = createProviderFailureV2({
        context: { origin: 'http_response', phase: 'response_body', providerId: scope.providerKey, contractId: scope.operationContractId, operationId: 'attempt:failure', requestSequence: 1 },
        httpStatus: 401, httpStatusText: 'Unauthorized', body: { error: { code: 'invalid_api_key', message: 'Invalid API key' } },
      })
      const status = repo.failSync(scope, 'attempt:failure', failure)
      expect(status).toMatchObject({ errorCode: 'PROVIDER_RESPONSE_HTTP_ERROR', lastFailure: { httpStatus: 401, providerError: { code: 'invalid_api_key' } } })
      expect(repo.readActive(scope)?.items).toEqual([{ id: 'known-good' }])
    } finally { db.close() }
  })

  it('persists a bounded near-limit raw ProviderFailure without replacing its provider facts', () => {
    const db = createDb()
    const repo = new ModelCatalogV2Repo(db, () => 200)
    try {
      repo.beginSync(scope, 'attempt:large-failure')
      const largeFailure = createProviderFailureV2({
        context: { origin: 'http_response', phase: 'response_body', providerId: scope.providerKey,
          contractId: scope.operationContractId, operationId: 'attempt:large-failure', requestSequence: 1 },
        httpStatus: 400,
        bodyText: JSON.stringify({ error: { code: 'INVALID_ARGUMENT', message: 'x'.repeat(500_000) } }),
      })
      expect(repo.failSync(scope, 'attempt:large-failure', largeFailure)).toMatchObject({
        lastFailure: { httpStatus: 400, providerError: { code: 'INVALID_ARGUMENT' } },
      })
      const encoded = JSON.stringify(repo.readStatus(scope)?.lastFailure)
      expect(Buffer.byteLength(encoded, 'utf8')).toBeLessThanOrEqual(1024 * 1024)
    } finally { db.close() }
  })

  it('stores a manual snapshot without moving the active pointer and applies it explicitly', () => {
    const db = createDb()
    let now = 100
    const repo = new ModelCatalogV2Repo(db, () => now)
    try {
      repo.beginSync(scope, 'attempt:active')
      repo.commitSync({
        scope,
        attemptId: 'attempt:active',
        responseDigest: '1'.repeat(64),
        observedAtMs: 90,
        applyMode: 'automatic',
        items: [{ id: 'last-known-good' }],
      })

      now = 200
      repo.beginSync(scope, 'attempt:pending')
      const pending = repo.commitSync({
        scope,
        attemptId: 'attempt:pending',
        responseDigest: '2'.repeat(64),
        observedAtMs: 190,
        items: [{ id: 'pending' }],
        applyMode: 'manual',
      })

      expect(pending).toMatchObject({ snapshotDigest: '2'.repeat(64), items: [{ id: 'pending' }] })
      expect(repo.readActive(scope)).toMatchObject({
        status: { activeSnapshotDigest: '1'.repeat(64) },
        items: [{ id: 'last-known-good' }],
      })
      expect(repo.readPending(scope)?.snapshotDigest).toBe('2'.repeat(64))

      expect(repo.applyPendingSnapshot(scope, '2'.repeat(64))).toMatchObject({
        status: { authorityRevision: 5, activeSnapshotDigest: '2'.repeat(64), lastSucceededAtMs: 190 },
        items: [{ id: 'pending' }],
      })
      expect(repo.readPending(scope)).toBeNull()
    } finally { db.close() }
  })

  it('rejects stale attempts, removes inactive retained history, and supports scoped and provider clears', () => {
    const db = createDb()
    let now = 100
    const repo = new ModelCatalogV2Repo(db, () => now)
    try {
      repo.beginSync(scope, 'attempt:old')
      expect(() => repo.beginSync(scope, 'attempt:new')).toThrow('GENERATION_V2_MODEL_CATALOG_SYNC_IN_PROGRESS')
      repo.failSync(scope, 'attempt:old', failure('attempt:old'))
      repo.beginSync(scope, 'attempt:new')
      repo.commitSync({ scope, attemptId: 'attempt:new', responseDigest: 'b'.repeat(64), observedAtMs: 100,
        applyMode: 'automatic', items: [{ id: 'first' }] })
      now = 1_000
      repo.beginSync(scope, 'attempt:next')
      repo.commitSync({ scope, attemptId: 'attempt:next', responseDigest: 'c'.repeat(64), observedAtMs: 1_000,
        applyMode: 'automatic', items: [{ id: 'second' }] })
      expect(repo.cleanupInactiveSnapshots(scope, 500)).toBe(1)
      expect(repo.readActive(scope)?.items).toEqual([{ id: 'second' }])
      expect(repo.clearCurrent(scope)).toBe(1)
      expect(repo.readActive(scope)).toBeNull()
      expect(repo.readStatus(scope)).toMatchObject({ authorityRevision: 7, syncState: 'idle',
        activeSnapshotDigest: null, pendingSnapshotDigest: null, modelCount: 0 })

      repo.beginSync(scope, 'attempt:third')
      repo.commitSync({ scope, attemptId: 'attempt:third', responseDigest: 'd'.repeat(64), observedAtMs: 1_000,
        applyMode: 'automatic', items: [{ id: 'third' }] })
      expect(repo.clearAllScopes('google_ai_studio')).toBe(1)
      expect(repo.readStatus(scope)).toMatchObject({ authorityRevision: 10, syncState: 'idle' })
    } finally { db.close() }
  })

  it('rejects a snapshot digest collision instead of rebinding immutable evidence', () => {
    const db = createDb()
    const repo = new ModelCatalogV2Repo(db, () => 100)
    try {
      const digest = 'f'.repeat(64)
      repo.beginSync(scope, 'attempt:first')
      repo.commitSync({ scope, attemptId: 'attempt:first', responseDigest: digest, observedAtMs: 90,
        applyMode: 'automatic', items: [{ id: 'first' }] })

      repo.beginSync(scope, 'attempt:collision')
      expect(() => repo.commitSync({ scope, attemptId: 'attempt:collision', responseDigest: digest,
        observedAtMs: 100, applyMode: 'automatic', items: [{ id: 'different' }] }))
        .toThrow('GENERATION_V2_MODEL_CATALOG_STATE_INVALID')
      expect(repo.readActive(scope)?.items).toEqual([{ id: 'first' }])
    } finally { db.close() }
  })

  it('rejects incomplete snapshots before any snapshot evidence is published', () => {
    const db = createDb()
    const repo = new ModelCatalogV2Repo(db, () => 100)
    try {
      repo.beginSync(scope, 'attempt:incomplete')
      expect(() => repo.commitSync({ scope, attemptId: 'attempt:incomplete', responseDigest: '9'.repeat(64),
        observedAtMs: 100, applyMode: 'automatic', completeness: 'incomplete', items: [{ id: 'partial' }] }))
        .toThrow('GENERATION_V2_MODEL_CATALOG_INPUT_INVALID')
      expect(db.prepare('SELECT count(*) AS count FROM model_catalog_snapshot_v2').get()).toEqual({ count: 0 })
      expect(repo.readStatus(scope)).toMatchObject({ authorityRevision: 1, syncState: 'syncing' })
    } finally { db.close() }
  })
})
