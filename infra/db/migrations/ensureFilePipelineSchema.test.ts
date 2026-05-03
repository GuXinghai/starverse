import { describe, expect, it } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { FileAssetRepo } from '../repo/fileAssetRepo'
import { ensureFilePipelineSchema } from './ensureFilePipelineSchema'
import { canOpenBetterSqliteForSuite } from '../../testUtils/betterSqliteGate'

const describeIfBetterSqlite = canOpenBetterSqliteForSuite('ensureFilePipelineSchema') ? describe : describe.skip

const LEGACY_FILE_ASSETS_SQL = `
  CREATE TABLE message (
    id TEXT PRIMARY KEY
  );

  CREATE TABLE file_assets (
    id TEXT PRIMARY KEY,
    sha256 TEXT NOT NULL,
    filename TEXT NOT NULL,
    extension TEXT,
    mime TEXT,
    size_bytes INTEGER NOT NULL,
    asset_kind TEXT NOT NULL CHECK (asset_kind IN ('image', 'document', 'text', 'audio', 'video', 'archive', 'binary')),
    source_kind TEXT NOT NULL CHECK (source_kind IN ('local_upload', 'url_import', 'generated', 'derived')),
    storage_backend TEXT NOT NULL,
    storage_uri TEXT NOT NULL,
    ingest_status TEXT NOT NULL CHECK (ingest_status IN ('pending', 'registered', 'stored', 'failed', 'deleted')),
    preview_status TEXT NOT NULL CHECK (preview_status IN ('not_requested', 'pending', 'ready', 'failed')),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    deleted_at INTEGER
  );

  INSERT INTO file_assets(
    id,
    sha256,
    filename,
    extension,
    mime,
    size_bytes,
    asset_kind,
    source_kind,
    storage_backend,
    storage_uri,
    ingest_status,
    preview_status,
    created_at,
    updated_at,
    deleted_at
  )
  VALUES (
    'legacy-asset',
    'abc',
    'legacy.pdf',
    'pdf',
    'application/pdf',
    10,
    'document',
    'local_upload',
    'local_fs',
    'assets/original/le/legacy-asset.pdf',
    'stored',
    'not_requested',
    1,
    1,
    NULL
  );
`

describeIfBetterSqlite('ensureFilePipelineSchema', () => {
  it('creates file pipeline tables idempotently for existing databases', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE message (
        id TEXT PRIMARY KEY
      )
    `)

    ensureFilePipelineSchema(db)
    ensureFilePipelineSchema(db)

    const rows = db.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN (
          'file_assets',
          'file_derivatives',
          'message_attachments',
          'conversation_drafts',
          'draft_attachments',
          'file_attachment_lifecycle',
          'file_type_verdicts'
        )
      ORDER BY name ASC
    `).all() as Array<{ name: string }>

    expect(rows.map((row) => row.name)).toEqual([
      'conversation_drafts',
      'draft_attachments',
      'file_assets',
      'file_attachment_lifecycle',
      'file_derivatives',
      'file_type_verdicts',
      'message_attachments',
    ])

    const assetColumns = db.prepare(`PRAGMA table_info(file_assets)`).all() as Array<{ name: string }>
    expect(assetColumns.map((column) => column.name)).toContain('source_meta_json')

    const verdictColumns = db.prepare(`PRAGMA table_info(file_type_verdicts)`).all() as Array<{ name: string }>
    const verdictColumnNames = verdictColumns.map((column) => column.name)
    expect(verdictColumnNames).toEqual(expect.arrayContaining([
      'asset_id',
      'verdict_json',
      'primary_format_id',
      'primary_kind',
      'confidence_level',
      'schema_version',
      'taxonomy_version',
      'taxonomy_map_version',
      'magic_table_version',
      'merge_rules_version',
      'container_probe_version',
      'text_probe_version',
      'magika_model_version',
      'fingerprint_json',
      'is_current',
      'stale_reason',
    ]))

    const verdictIndexes = db.prepare(`PRAGMA index_list(file_type_verdicts)`).all() as Array<{ name: string }>
    expect(verdictIndexes.map((row) => row.name)).toEqual(expect.arrayContaining([
      'idx_file_type_verdicts_asset_id',
      'idx_file_type_verdicts_is_current',
      'idx_file_type_verdicts_primary_format_id',
      'idx_file_type_verdicts_confidence_level',
      'idx_file_type_verdicts_asset_current',
    ]))
  })

  it('upgrades legacy file_assets constraints for URL source records', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(LEGACY_FILE_ASSETS_SQL)

    ensureFilePipelineSchema(db)

    const repo = new FileAssetRepo(db)
    const asset = repo.create({
      id: 'url-asset',
      sha256: null,
      filename: 'file.pdf',
      extension: 'pdf',
      mime: 'application/pdf',
      sizeBytes: 0,
      assetKind: 'document',
      sourceKind: 'url_import',
      storageBackend: 'remote_url',
      storageUri: 'https://example.test/file.pdf',
      ingestStatus: 'probe_failed',
      sourceMetaJson: { probeStatus: 'probe_failed' },
      createdAt: 2,
      updatedAt: 2,
    })

    expect(repo.getById('legacy-asset')?.sha256).toBe('abc')
    expect(asset).toMatchObject({
      sha256: null,
      storageBackend: 'remote_url',
      ingestStatus: 'probe_failed',
      sourceMetaJson: { probeStatus: 'probe_failed' },
    })
  })
})
