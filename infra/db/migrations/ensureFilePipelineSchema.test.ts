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
          'dfc_option_generation_states',
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
      'dfc_option_generation_states',
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

    const generationColumns = db.prepare(`PRAGMA table_info(dfc_option_generation_states)`).all() as Array<{ name: string }>
    expect(generationColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'asset_id',
      'target_kind',
      'derived_kind',
      'exposure_mode',
      'conversion_settings_hash',
      'status',
      'retryable',
      'derivative_job_id',
      'output_derivative_id',
      'error_code',
      'attempt_count',
    ]))
    const generationIndexes = db.prepare(`PRAGMA index_list(dfc_option_generation_states)`).all() as Array<{ name: string }>
    expect(generationIndexes.map((row) => row.name)).toEqual(expect.arrayContaining([
      'idx_dfc_option_generation_asset',
      'idx_dfc_option_generation_status',
    ]))
  })

  it('adds DFC binding columns and clears only legacy attachment rows during upgrade', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE message (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE convo (
        id TEXT PRIMARY KEY
      );

      CREATE TABLE file_assets (
        id TEXT PRIMARY KEY,
        sha256 TEXT,
        filename TEXT NOT NULL,
        extension TEXT,
        mime TEXT,
        size_bytes INTEGER NOT NULL,
        asset_kind TEXT NOT NULL CHECK (asset_kind IN ('image', 'document', 'text', 'audio', 'video', 'archive', 'binary')),
        source_kind TEXT NOT NULL CHECK (source_kind IN ('local_upload', 'url_import', 'generated', 'derived')),
        storage_backend TEXT NOT NULL,
        storage_uri TEXT NOT NULL,
        ingest_status TEXT NOT NULL CHECK (ingest_status IN ('pending', 'probing', 'materializing', 'registered', 'stored', 'probe_failed', 'materialization_failed', 'failed', 'deleted')),
        preview_status TEXT NOT NULL CHECK (preview_status IN ('not_requested', 'pending', 'ready', 'failed')),
        source_meta_json TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );

      CREATE TABLE message_attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL REFERENCES file_assets(id),
        ai_payload_kind TEXT NOT NULL CHECK (ai_payload_kind IN ('image', 'pdf', 'text', 'audio', 'video', 'binary')),
        processing_status TEXT NOT NULL CHECK (processing_status IN ('native_supported', 'convertible', 'local_only', 'unsupported')),
        include_in_next_request INTEGER NOT NULL DEFAULT 1 CHECK (include_in_next_request IN (0, 1)),
        excluded_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE conversation_drafts (
        conversation_id TEXT PRIMARY KEY REFERENCES convo(id) ON DELETE CASCADE,
        draft_text TEXT NOT NULL DEFAULT '',
        draft_mode TEXT NOT NULL DEFAULT 'compose' CHECK (draft_mode IN ('compose', 'edit')),
        editing_source_message_id TEXT REFERENCES message(id) ON DELETE SET NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE draft_attachments (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversation_drafts(conversation_id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL REFERENCES file_assets(id),
        attachment_order INTEGER NOT NULL,
        ai_payload_kind TEXT NOT NULL CHECK (ai_payload_kind IN ('image', 'pdf', 'text', 'audio', 'video', 'binary')),
        processing_status TEXT NOT NULL CHECK (processing_status IN ('native_supported', 'convertible', 'local_only', 'unsupported')),
        include_in_next_request INTEGER NOT NULL DEFAULT 1 CHECK (include_in_next_request IN (0, 1)),
        excluded_reason TEXT,
        preferred_send_mode TEXT CHECK (preferred_send_mode IN ('default', 'auto', 'url_ref', 'inline_base64')),
        url_retention_mode TEXT CHECK (url_retention_mode IN ('default', 'link_only', 'link_and_file')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (conversation_id, asset_id),
        UNIQUE (conversation_id, attachment_order)
      );

      INSERT INTO convo(id) VALUES ('c1');
      INSERT INTO message(id) VALUES ('m1');
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
        source_meta_json,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        'asset-legacy',
        'sha-legacy',
        'legacy.txt',
        'txt',
        'text/plain',
        12,
        'text',
        'local_upload',
        'local_fs',
        'assets/original/as/asset-legacy.txt',
        'stored',
        'not_requested',
        NULL,
        1,
        1,
        NULL
      );
      INSERT INTO conversation_drafts(conversation_id, draft_text, draft_mode, editing_source_message_id, updated_at)
      VALUES ('c1', 'draft', 'compose', NULL, 1);
      INSERT INTO draft_attachments(
        id,
        conversation_id,
        asset_id,
        attachment_order,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        preferred_send_mode,
        url_retention_mode,
        created_at,
        updated_at
      ) VALUES (
        'draft-legacy',
        'c1',
        'asset-legacy',
        0,
        'text',
        'native_supported',
        1,
        NULL,
        'inline_base64',
        'link_and_file',
        1,
        1
      );
      INSERT INTO message_attachments(
        id,
        message_id,
        asset_id,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        created_at,
        updated_at
      ) VALUES (
        'message-legacy',
        'm1',
        'asset-legacy',
        'text',
        'native_supported',
        1,
        NULL,
        1,
        1
      );
    `)

    ensureFilePipelineSchema(db)
    ensureFilePipelineSchema(db)

    const draftColumns = db.prepare(`PRAGMA table_info(draft_attachments)`).all() as Array<{ name: string }>
    const messageColumns = db.prepare(`PRAGMA table_info(message_attachments)`).all() as Array<{ name: string }>
    expect(draftColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'dfc_managed',
      'selected_option_id',
      'selected_asset_refs_json',
    ]))
    expect(messageColumns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'dfc_managed',
      'used_option_id',
      'used_asset_refs_json',
      'target_kind',
      'send_strategy',
    ]))
    expect(db.prepare(`SELECT COUNT(*) AS count FROM draft_attachments`).get()).toEqual({ count: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM message_attachments`).get()).toEqual({ count: 0 })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM file_assets`).get()).toEqual({ count: 1 })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM conversation_drafts`).get()).toEqual({ count: 1 })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM message`).get()).toEqual({ count: 1 })
  })

  it('does not clear DFC-capable attachment rows on idempotent schema checks', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE message (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE convo (
        id TEXT PRIMARY KEY
      );
    `)
    ensureFilePipelineSchema(db)
    db.exec(`
      INSERT INTO convo(id) VALUES ('c1');
      INSERT INTO message(id) VALUES ('m1');
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
        source_meta_json,
        created_at,
        updated_at,
        deleted_at
      ) VALUES (
        'asset-dfc',
        'sha-dfc',
        'dfc.txt',
        'txt',
        'text/plain',
        12,
        'text',
        'local_upload',
        'local_fs',
        'assets/original/as/asset-dfc.txt',
        'stored',
        'not_requested',
        NULL,
        1,
        1,
        NULL
      );
      INSERT INTO conversation_drafts(conversation_id, draft_text, draft_mode, editing_source_message_id, updated_at)
      VALUES ('c1', 'draft', 'compose', NULL, 1);
      INSERT INTO draft_attachments(
        id,
        conversation_id,
        asset_id,
        attachment_order,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        preferred_send_mode,
        url_retention_mode,
        dfc_managed,
        selected_option_id,
        selected_asset_refs_json,
        created_at,
        updated_at
      ) VALUES (
        'draft-dfc',
        'c1',
        'asset-dfc',
        0,
        'text',
        'native_supported',
        1,
        NULL,
        NULL,
        NULL,
        1,
        'option-plain-text',
        '[{"kind":"derived_asset","assetId":"derivative-plain-text"}]',
        1,
        1
      );
      INSERT INTO message_attachments(
        id,
        message_id,
        asset_id,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        dfc_managed,
        used_option_id,
        used_asset_refs_json,
        target_kind,
        send_strategy,
        created_at,
        updated_at
      ) VALUES (
        'message-dfc',
        'm1',
        'asset-dfc',
        'text',
        'native_supported',
        1,
        NULL,
        1,
        'option-plain-text',
        '[{"kind":"derived_asset","assetId":"derivative-plain-text"}]',
        'plain_text',
        'text_in_prompt',
        1,
        1
      );
    `)

    ensureFilePipelineSchema(db)

    expect(db.prepare(`SELECT COUNT(*) AS count FROM draft_attachments`).get()).toEqual({ count: 1 })
    expect(db.prepare(`SELECT COUNT(*) AS count FROM message_attachments`).get()).toEqual({ count: 1 })
  })

  it('preserves DFC-capable message rows when only draft attachments need destructive upgrade', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE message (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE convo (
        id TEXT PRIMARY KEY
      );
    `)
    ensureFilePipelineSchema(db)
    insertDfcMigrationFixture(db)
    db.exec(`
      INSERT INTO message_attachments(
        id,
        message_id,
        asset_id,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        dfc_managed,
        used_option_id,
        used_asset_refs_json,
        target_kind,
        send_strategy,
        created_at,
        updated_at
      ) VALUES (
        'message-dfc',
        'm1',
        'asset-dfc',
        'text',
        'native_supported',
        1,
        NULL,
        1,
        'option-message',
        '[{"kind":"derived_asset","assetId":"derivative-message"}]',
        'plain_text',
        'text_in_prompt',
        1,
        1
      );
      PRAGMA foreign_keys = OFF;
      DROP TABLE draft_attachments;
      CREATE TABLE draft_attachments (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversation_drafts(conversation_id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL REFERENCES file_assets(id),
        attachment_order INTEGER NOT NULL,
        ai_payload_kind TEXT NOT NULL CHECK (ai_payload_kind IN ('image', 'pdf', 'text', 'audio', 'video', 'binary')),
        processing_status TEXT NOT NULL CHECK (processing_status IN ('native_supported', 'convertible', 'local_only', 'unsupported')),
        include_in_next_request INTEGER NOT NULL DEFAULT 1 CHECK (include_in_next_request IN (0, 1)),
        excluded_reason TEXT,
        preferred_send_mode TEXT CHECK (preferred_send_mode IN ('default', 'auto', 'url_ref', 'inline_base64')),
        url_retention_mode TEXT CHECK (url_retention_mode IN ('default', 'link_only', 'link_and_file')),
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (conversation_id, asset_id),
        UNIQUE (conversation_id, attachment_order)
      );
      PRAGMA foreign_keys = ON;
      INSERT INTO draft_attachments(
        id,
        conversation_id,
        asset_id,
        attachment_order,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        preferred_send_mode,
        url_retention_mode,
        created_at,
        updated_at
      ) VALUES (
        'draft-legacy',
        'c1',
        'asset-dfc',
        0,
        'text',
        'native_supported',
        1,
        NULL,
        'inline_base64',
        NULL,
        1,
        1
      );
    `)

    ensureFilePipelineSchema(db)

    expect(db.prepare(`SELECT COUNT(*) AS count FROM draft_attachments`).get()).toEqual({ count: 0 })
    expect(db.prepare(`
      SELECT used_option_id AS usedOptionId,
             used_asset_refs_json AS usedAssetRefsJson
      FROM message_attachments
      WHERE id = 'message-dfc'
    `).get()).toEqual({
      usedOptionId: 'option-message',
      usedAssetRefsJson: '[{"kind":"derived_asset","assetId":"derivative-message"}]',
    })
  })

  it('preserves DFC-capable draft rows when only message attachments need destructive upgrade', () => {
    const db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE message (
        id TEXT PRIMARY KEY
      );
      CREATE TABLE convo (
        id TEXT PRIMARY KEY
      );
    `)
    ensureFilePipelineSchema(db)
    insertDfcMigrationFixture(db)
    db.exec(`
      INSERT INTO draft_attachments(
        id,
        conversation_id,
        asset_id,
        attachment_order,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        preferred_send_mode,
        url_retention_mode,
        dfc_managed,
        selected_option_id,
        selected_asset_refs_json,
        created_at,
        updated_at
      ) VALUES (
        'draft-dfc',
        'c1',
        'asset-dfc',
        0,
        'text',
        'native_supported',
        1,
        NULL,
        NULL,
        NULL,
        1,
        'option-draft',
        '[{"kind":"derived_asset","assetId":"derivative-draft"}]',
        1,
        1
      );
      PRAGMA foreign_keys = OFF;
      DROP TABLE message_attachments;
      CREATE TABLE message_attachments (
        id TEXT PRIMARY KEY,
        message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
        asset_id TEXT NOT NULL REFERENCES file_assets(id),
        ai_payload_kind TEXT NOT NULL CHECK (ai_payload_kind IN ('image', 'pdf', 'text', 'audio', 'video', 'binary')),
        processing_status TEXT NOT NULL CHECK (processing_status IN ('native_supported', 'convertible', 'local_only', 'unsupported')),
        include_in_next_request INTEGER NOT NULL DEFAULT 1 CHECK (include_in_next_request IN (0, 1)),
        excluded_reason TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      PRAGMA foreign_keys = ON;
      INSERT INTO message_attachments(
        id,
        message_id,
        asset_id,
        ai_payload_kind,
        processing_status,
        include_in_next_request,
        excluded_reason,
        created_at,
        updated_at
      ) VALUES (
        'message-legacy',
        'm1',
        'asset-dfc',
        'text',
        'native_supported',
        1,
        NULL,
        1,
        1
      );
    `)

    ensureFilePipelineSchema(db)

    expect(db.prepare(`SELECT COUNT(*) AS count FROM message_attachments`).get()).toEqual({ count: 0 })
    expect(db.prepare(`
      SELECT selected_option_id AS selectedOptionId,
             selected_asset_refs_json AS selectedAssetRefsJson
      FROM draft_attachments
      WHERE id = 'draft-dfc'
    `).get()).toEqual({
      selectedOptionId: 'option-draft',
      selectedAssetRefsJson: '[{"kind":"derived_asset","assetId":"derivative-draft"}]',
    })
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

function insertDfcMigrationFixture(db: BetterSqlite3.Database): void {
  db.exec(`
    INSERT INTO convo(id) VALUES ('c1');
    INSERT INTO message(id) VALUES ('m1');
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
      source_meta_json,
      created_at,
      updated_at,
      deleted_at
    ) VALUES (
      'asset-dfc',
      'sha-dfc',
      'dfc.txt',
      'txt',
      'text/plain',
      12,
      'text',
      'local_upload',
      'local_fs',
      'assets/original/as/asset-dfc.txt',
      'stored',
      'not_requested',
      NULL,
      1,
      1,
      NULL
    );
    INSERT INTO conversation_drafts(conversation_id, draft_text, draft_mode, editing_source_message_id, updated_at)
    VALUES ('c1', 'draft', 'compose', NULL, 1);
  `)
}
