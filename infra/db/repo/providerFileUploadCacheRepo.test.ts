import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { ProviderFileUploadCacheRepo } from './providerFileUploadCacheRepo'
import { ensureProviderFileUploadCacheSchema } from '../migrations/ensureProviderFileUploadCacheSchema'
import type { ProviderFileUploadCacheKey } from '../types'

const SHA_A = 'a'.repeat(64)
const SHA_B = 'b'.repeat(64)
const CRED_A = 'c'.repeat(64)
const CRED_B = 'd'.repeat(64)

function createRepo() {
  const db = new BetterSqlite3(':memory:')
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE file_assets (
      id TEXT PRIMARY KEY,
      sha256 TEXT,
      filename TEXT NOT NULL,
      extension TEXT,
      mime TEXT,
      size_bytes INTEGER NOT NULL,
      asset_kind TEXT NOT NULL,
      source_kind TEXT NOT NULL,
      storage_backend TEXT NOT NULL,
      storage_uri TEXT NOT NULL,
      ingest_status TEXT NOT NULL,
      preview_status TEXT NOT NULL,
      source_meta_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );
    CREATE TABLE file_blobs (
      id TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL UNIQUE,
      size_bytes INTEGER NOT NULL,
      mime TEXT,
      storage_backend TEXT NOT NULL,
      storage_uri TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE file_asset_revisions (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
      blob_id TEXT NOT NULL REFERENCES file_blobs(id),
      parent_revision_id TEXT REFERENCES file_asset_revisions(id) ON DELETE SET NULL,
      cause TEXT NOT NULL,
      derived_from_asset_id TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
      created_at INTEGER NOT NULL
    );
  `)
  ensureProviderFileUploadCacheSchema(db)
  db.prepare(`
    INSERT INTO file_assets (
      id, sha256, filename, extension, mime, size_bytes, asset_kind, source_kind,
      storage_backend, storage_uri, ingest_status, preview_status, created_at, updated_at
    ) VALUES (
      'asset-1', @sha, 'fixture.pdf', 'pdf', 'application/pdf', 100, 'document', 'local_upload',
      'local_fs', 'assets/original/fixture.pdf', 'stored', 'not_requested', 1, 1
    )
  `).run({ sha: SHA_A })
  db.prepare(`
    INSERT INTO file_blobs (id, sha256, size_bytes, mime, storage_backend, storage_uri, created_at)
    VALUES ('blob-1', @sha, 100, 'application/pdf', 'local_fs', 'assets/original/fixture.pdf', 1)
  `).run({ sha: SHA_A })
  db.prepare(`
    INSERT INTO file_asset_revisions (id, asset_id, blob_id, cause, created_at)
    VALUES ('rev-1', 'asset-1', 'blob-1', 'imported', 1)
  `).run()
  return { db, repo: new ProviderFileUploadCacheRepo(db) }
}

function baseKey(overrides: Partial<ProviderFileUploadCacheKey> = {}): ProviderFileUploadCacheKey {
  return {
    provider: 'openai_responses',
    endpointFamily: 'openai_responses',
    normalizedBaseUrl: 'https://api.openai.com/v1',
    credentialFingerprint: CRED_A,
    assetId: 'asset-1',
    revisionId: 'rev-1',
    blobSha256: SHA_A,
    mimeType: 'application/pdf',
    sizeBytes: 100,
    assetKind: 'pdf',
    uploadPurpose: 'user_data',
    ...overrides,
  }
}

describe('ProviderFileUploadCacheRepo', () => {
  it('reuses a ready cache record for the same provider credential endpoint and revision key', () => {
    const { repo } = createRepo()
    const reserve = repo.reserve({ ...baseKey(), id: 'cache-1', nowMs: 10 })
    expect(reserve.status).toBe('reserved')
    const ready = repo.markReady({
      id: 'cache-1',
      providerFileId: 'file-openai-1',
      nowMs: 20,
    })
    expect(ready?.status).toBe('ready')

    const second = repo.reserve({ ...baseKey(), id: 'cache-2', nowMs: 30 })
    expect(second.status).toBe('ready')
    if (second.status !== 'ready') throw new Error('expected ready cache reuse')
    expect(second.record.id).toBe('cache-1')
    expect(second.record.providerFileId).toBe('file-openai-1')
  })

  it('does not reuse when revision blob credential or base URL differs', () => {
    const { repo } = createRepo()
    repo.reserve({ ...baseKey(), id: 'cache-1', nowMs: 10 })
    repo.markReady({ id: 'cache-1', providerFileId: 'file-openai-1', nowMs: 20 })

    expect(repo.findReusable(baseKey({ revisionId: 'rev-2' }), 30)).toBeNull()
    expect(repo.findReusable(baseKey({ blobSha256: SHA_B }), 30)).toBeNull()
    expect(repo.findReusable(baseKey({ credentialFingerprint: CRED_B }), 30)).toBeNull()
    expect(repo.findReusable(baseKey({ normalizedBaseUrl: 'https://proxy.example.test/v1' }), 30)).toBeNull()
  })

  it('treats expired Gemini cache as not reusable', () => {
    const { repo } = createRepo()
    const key = baseKey({
      provider: 'google_ai_studio',
      endpointFamily: 'google_ai_studio',
      normalizedBaseUrl: 'https://generativelanguage.googleapis.com',
      uploadPurpose: 'generate_content',
    })
    repo.reserve({ ...key, id: 'cache-gemini', nowMs: 10 })
    repo.markReady({
      id: 'cache-gemini',
      providerFileUri: 'https://generativelanguage.googleapis.com/v1beta/files/file-a',
      expiresAtMs: 100,
      nowMs: 20,
    })

    expect(repo.findReusable(key, 99)?.id).toBe('cache-gemini')
    expect(repo.findReusable(key, 101)).toBeNull()
  })

  it('re-reserves an expired Gemini cache row instead of leaving the unique key blocked', () => {
    const { repo } = createRepo()
    const key = baseKey({
      provider: 'google_ai_studio',
      endpointFamily: 'google_ai_studio',
      normalizedBaseUrl: 'https://generativelanguage.googleapis.com',
      uploadPurpose: 'generate_content',
    })
    repo.reserve({ ...key, id: 'cache-gemini', nowMs: 10 })
    repo.markReady({
      id: 'cache-gemini',
      providerFileUri: 'https://generativelanguage.googleapis.com/v1beta/files/file-a',
      expiresAtMs: 100,
      nowMs: 20,
    })

    const reserved = repo.reserve({ ...key, id: 'cache-gemini-new', nowMs: 101 })

    expect(reserved.status).toBe('reserved')
    if (reserved.status !== 'reserved') throw new Error('expected expired cache re-reservation')
    expect(reserved.record.id).toBe('cache-gemini')
    expect(reserved.record.status).toBe('uploading')
    expect(reserved.record.providerFileUri).toBeNull()
    expect(reserved.record.expiresAtMs).toBeNull()
  })

  it('re-reserves failed and invalidated rows for the same key', () => {
    const { repo } = createRepo()
    repo.reserve({ ...baseKey(), id: 'cache-1', nowMs: 10 })
    repo.markFailed({ id: 'cache-1', errorCode: 'upload_failed', errorMessage: 'safe failure', nowMs: 20 })

    const afterFailed = repo.reserve({ ...baseKey(), id: 'cache-2', nowMs: 30 })
    expect(afterFailed.status).toBe('reserved')
    if (afterFailed.status !== 'reserved') throw new Error('expected failed cache re-reservation')
    expect(afterFailed.record.id).toBe('cache-1')
    repo.markReady({ id: 'cache-1', providerFileId: 'file-openai-1', nowMs: 40 })
    repo.invalidate({ id: 'cache-1', errorCode: 'provider_file_reference_invalid', errorMessage: 'invalidated', nowMs: 50 })

    const afterInvalidated = repo.reserve({ ...baseKey(), id: 'cache-3', nowMs: 60 })
    expect(afterInvalidated.status).toBe('reserved')
    if (afterInvalidated.status !== 'reserved') throw new Error('expected invalidated cache re-reservation')
    expect(afterInvalidated.record.id).toBe('cache-1')
    expect(afterInvalidated.record.providerFileId).toBeNull()
    expect(afterInvalidated.record.lastErrorCode).toBeNull()
  })

  it('returns a safe conflict for a concurrent duplicate reservation', () => {
    const { repo } = createRepo()
    const first = repo.reserve({ ...baseKey(), id: 'cache-1', nowMs: 10 })
    expect(first.status).toBe('reserved')
    const second = repo.reserve({ ...baseKey(), id: 'cache-2', nowMs: 11 })
    expect(second.status).toBe('conflict')
    if (second.status !== 'conflict') throw new Error('expected upload conflict')
    expect(second.retryable).toBe(true)
    expect(second.record?.id).toBe('cache-1')
  })

  it('reclaims stale uploading reservations for the same key', () => {
    const { repo } = createRepo()
    const first = repo.reserve({ ...baseKey(), id: 'cache-1', nowMs: 10 })
    expect(first.status).toBe('reserved')

    const second = repo.reserve({ ...baseKey(), id: 'cache-2', nowMs: 10 + 10 * 60 * 1000 })

    expect(second.status).toBe('reserved')
    if (second.status !== 'reserved') throw new Error('expected stale upload reservation reclaim')
    expect(second.record.id).toBe('cache-1')
    expect(second.record.uploadStartedAtMs).toBe(10 + 10 * 60 * 1000)
  })

  it('invalidates provider cache without deleting the Starverse file asset', () => {
    const { db, repo } = createRepo()
    repo.reserve({ ...baseKey(), id: 'cache-1', nowMs: 10 })
    repo.markReady({ id: 'cache-1', providerFileId: 'file-openai-1', nowMs: 20 })
    const invalidated = repo.invalidate({ id: 'cache-1', errorCode: 'manual', errorMessage: 'manual invalidation', nowMs: 30 })
    expect(invalidated?.status).toBe('invalidated')
    expect(db.prepare('SELECT COUNT(*) AS count FROM file_assets WHERE id=?').get('asset-1')).toEqual({ count: 1 })
  })
})
