import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { ensureFilePipelineSchema } from './ensureFilePipelineSchema'
import { ensureP4C1DerivedKindSchema } from './ensureP4C1DerivedKindSchema'
import { canOpenBetterSqliteForSuite } from '../../testUtils/betterSqliteGate'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('ensureP4C1DerivedKindSchema') ? describe : describe.skip

describeIfBetterSqlite('ensureP4C1DerivedKindSchema', () => {
  it('upgrades legacy derived_kind CHECK constraints to include new P4-C1 values', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE message (
        id TEXT PRIMARY KEY
      )
    `)

    ensureFilePipelineSchema(db)

    const fdBefore = db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'file_derivatives'
    `).get() as { sql?: string } | undefined
    expect(fdBefore?.sql ?? '').toContain('converted_markdown')
    expect(fdBefore?.sql ?? '').toContain('rendered_images')
    expect(fdBefore?.sql ?? '').toContain('selected_frames')
    expect(fdBefore?.sql ?? '').toContain('extracted_audio')

    const djBefore = db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'derivative_jobs'
    `).get() as { sql?: string } | undefined
    expect(djBefore?.sql ?? '').toContain('converted_markdown')
    expect(djBefore?.sql ?? '').toContain('rendered_images')
    expect(djBefore?.sql ?? '').toContain('selected_frames')
    expect(djBefore?.sql ?? '').toContain('extracted_audio')
  })

  it('is idempotent across multiple calls', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(`CREATE TABLE message (id TEXT PRIMARY KEY)`)

    ensureFilePipelineSchema(db)
    ensureP4C1DerivedKindSchema(db)
    ensureP4C1DerivedKindSchema(db)

    const fdRow = db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'file_derivatives'
    `).get() as { sql?: string } | undefined
    expect(fdRow?.sql ?? '').toContain('converted_markdown')

    const djRow = db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'derivative_jobs'
    `).get() as { sql?: string } | undefined
    expect(djRow?.sql ?? '').toContain('extracted_audio')
  })

  it('correctly upgrades old schema without new DerivedKind values', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE message (id TEXT PRIMARY KEY);

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
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      CREATE TABLE file_derivatives (
        id TEXT PRIMARY KEY,
        parent_asset_id TEXT NOT NULL REFERENCES file_assets(id),
        derived_kind TEXT NOT NULL CHECK (derived_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'send_optimized', 'preview_optimized', 'embedding_vector')),
        mime TEXT,
        storage_uri TEXT NOT NULL,
        generator TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed', 'deleted')),
        meta_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      CREATE TABLE derivative_jobs (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES file_assets(id),
        derivative_kind TEXT NOT NULL CHECK (derivative_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'send_optimized', 'preview_optimized', 'embedding_vector')),
        task_family TEXT NOT NULL,
        status TEXT NOT NULL,
        generator TEXT NOT NULL,
        provider TEXT,
        model_id TEXT,
        input_snapshot_json TEXT,
        config_json TEXT,
        output_derivative_id TEXT REFERENCES file_derivatives(id) ON DELETE SET NULL,
        error_code TEXT,
        error_message TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER
      );
    `)

    ensureP4C1DerivedKindSchema(db)

    const fdRow = db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'file_derivatives'
    `).get() as { sql?: string } | undefined
    const fdSql = fdRow?.sql ?? ''
    expect(fdSql).toContain('converted_markdown')
    expect(fdSql).toContain('rendered_images')
    expect(fdSql).toContain('selected_frames')
    expect(fdSql).toContain('extracted_audio')

    const djRow = db.prepare(`
      SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'derivative_jobs'
    `).get() as { sql?: string } | undefined
    const djSql = djRow?.sql ?? ''
    expect(djSql).toContain('converted_markdown')
    expect(djSql).toContain('rendered_images')
    expect(djSql).toContain('selected_frames')
    expect(djSql).toContain('extracted_audio')
  })

  it('preserves existing data through the migration', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE message (id TEXT PRIMARY KEY);

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
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      INSERT INTO file_assets (id, sha256, filename, extension, mime, size_bytes, asset_kind, source_kind, storage_backend, storage_uri, ingest_status, preview_status, created_at, updated_at)
      VALUES ('test-asset', 'abc123', 'test.pdf', 'pdf', 'application/pdf', 100, 'document', 'url_import', 'remote_url', 'https://example.test/test.pdf', 'stored', 'not_requested', 1, 1);

      CREATE TABLE file_derivatives (
        id TEXT PRIMARY KEY,
        parent_asset_id TEXT NOT NULL REFERENCES file_assets(id),
        derived_kind TEXT NOT NULL CHECK (derived_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'send_optimized', 'preview_optimized', 'embedding_vector')),
        mime TEXT,
        storage_uri TEXT NOT NULL,
        generator TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed', 'deleted')),
        meta_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      INSERT INTO file_derivatives (id, parent_asset_id, derived_kind, mime, storage_uri, generator, status, created_at, updated_at)
      VALUES ('deriv-1', 'test-asset', 'extracted_text', 'text/plain', '/deriv/deriv-1.txt', 'internal', 'ready', 2, 2);

      CREATE TABLE derivative_jobs (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES file_assets(id),
        derivative_kind TEXT NOT NULL CHECK (derivative_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'send_optimized', 'preview_optimized', 'embedding_vector')),
        task_family TEXT NOT NULL,
        status TEXT NOT NULL,
        generator TEXT NOT NULL,
        provider TEXT,
        model_id TEXT,
        input_snapshot_json TEXT,
        config_json TEXT,
        output_derivative_id TEXT REFERENCES file_derivatives(id) ON DELETE SET NULL,
        error_code TEXT,
        error_message TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        started_at INTEGER,
        finished_at INTEGER
      );

      INSERT INTO derivative_jobs (id, asset_id, derivative_kind, task_family, status, generator, attempt_count, created_at, updated_at)
      VALUES ('job-1', 'test-asset', 'extracted_text', 'chat_context', 'ready', 'internal', 1, 3, 3);
    `)

    ensureP4C1DerivedKindSchema(db)

    const fdRow = db.prepare('SELECT derived_kind FROM file_derivatives WHERE id = ?').get('deriv-1') as { derived_kind?: string } | undefined
    expect(fdRow?.derived_kind).toBe('extracted_text')

    const djRow = db.prepare('SELECT derivative_kind, status FROM derivative_jobs WHERE id = ?').get('job-1') as { derivative_kind?: string; status?: string } | undefined
    expect(djRow?.derivative_kind).toBe('extracted_text')
    expect(djRow?.status).toBe('ready')
  })
})
