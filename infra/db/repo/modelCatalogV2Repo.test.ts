import path from 'node:path'
import BetterSqlite3 from 'better-sqlite3'
import { describe, expect, it } from 'vitest'
import { applyGenerationV2SchemaForTest } from '../v2/testSchemaV2'
import { ModelCatalogV2Repo } from './modelCatalogV2Repo'
import { createProviderFailureV2 } from '../../../src/shared/provider/providerFailureV2'

const scope = Object.freeze({ providerKey: 'google_ai_studio', credentialScopeId: 'scope:google:1',
  endpointProfileId: 'gemini_api_v1', operationContractId: 'gemini-developer-api-models-v1beta' })

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
      const active = repo.commitSync({ scope, attemptId: 'attempt:1', responseDigest: '1'.repeat(64), observedAtMs: 90,
        items: [{ providerKey: 'google_ai_studio', nativeModelId: 'gemini-3.1-flash-image',
          capabilitySeed: { imageGeneration: true, aspectRatios: ['1:1', '16:9'], imageSizes: ['1K', '2K', '4K'] } }] })
      expect(active.items[0]).toMatchObject({ nativeModelId: 'gemini-3.1-flash-image',
        capabilitySeed: { imageGeneration: true, imageSizes: ['1K', '2K', '4K'] } })

      now = 200
      repo.beginSync(scope, 'attempt:2')
      const status = repo.failSync(scope, 'attempt:2', 'network_error')
      expect(status).toMatchObject({ syncState: 'error', errorCode: 'network_error', activeSnapshotDigest: '1'.repeat(64) })
      expect(repo.readActive(scope)?.items).toEqual(active.items)
    } finally { db.close() }
  })

  it('persists raw sync failure facts while preserving the active snapshot', () => {
    const db = createDb()
    const repo = new ModelCatalogV2Repo(db, () => 200)
    try {
      repo.beginSync(scope, 'attempt:raw')
      repo.commitSync({ scope, attemptId: 'attempt:raw', responseDigest: 'e'.repeat(64), observedAtMs: 100, items: [{ id: 'known-good' }] })
      repo.beginSync(scope, 'attempt:failure')
      const failure = createProviderFailureV2({
        context: { origin: 'http_response', phase: 'response_body', providerId: scope.providerKey, contractId: scope.operationContractId, operationId: 'attempt:failure', requestSequence: 1 },
        httpStatus: 401, httpStatusText: 'Unauthorized', body: { error: { code: 'invalid_api_key', message: 'Invalid API key' } },
      })
      const status = repo.failSync(scope, 'attempt:failure', failure)
      expect(status).toMatchObject({ errorCode: 'PROVIDER_RESPONSE_HTTP_ERROR', lastErrorFact: { httpStatus: 401, providerError: { code: 'invalid_api_key' } } })
      expect(repo.readActive(scope)?.items).toEqual([{ id: 'known-good' }])
    } finally { db.close() }
  })

  it('rejects stale attempts, removes inactive retained history, and supports scoped and provider clears', () => {
    const db = createDb()
    let now = 100
    const repo = new ModelCatalogV2Repo(db, () => now)
    try {
      repo.beginSync(scope, 'attempt:old')
      repo.beginSync(scope, 'attempt:new')
      expect(() => repo.commitSync({ scope, attemptId: 'attempt:old', responseDigest: 'a'.repeat(64), observedAtMs: 100,
        items: [{ id: 'stale' }] })).toThrow('GENERATION_V2_MODEL_CATALOG_STALE_ATTEMPT')
      repo.commitSync({ scope, attemptId: 'attempt:new', responseDigest: 'b'.repeat(64), observedAtMs: 100,
        items: [{ id: 'first' }] })
      now = 1_000
      repo.beginSync(scope, 'attempt:next')
      repo.commitSync({ scope, attemptId: 'attempt:next', responseDigest: 'c'.repeat(64), observedAtMs: 1_000,
        items: [{ id: 'second' }] })
      expect(repo.cleanupInactiveSnapshots(500)).toBe(1)
      expect(repo.readActive(scope)?.items).toEqual([{ id: 'second' }])
      expect(repo.clearCurrent(scope)).toBe(1)
      expect(repo.readActive(scope)).toBeNull()

      repo.beginSync(scope, 'attempt:third')
      repo.commitSync({ scope, attemptId: 'attempt:third', responseDigest: 'd'.repeat(64), observedAtMs: 1_000,
        items: [{ id: 'third' }] })
      expect(repo.clearAllScopes('google_ai_studio')).toBe(1)
    } finally { db.close() }
  })
})
