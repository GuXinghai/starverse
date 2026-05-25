import type BetterSqlite3 from 'better-sqlite3'

const FILE_ASSETS_COLUMNS_SQL = `
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
`

export function ensureFilePipelineSchema(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_assets (
${FILE_ASSETS_COLUMNS_SQL}
    );

    CREATE TABLE IF NOT EXISTS file_derivatives (
      id TEXT PRIMARY KEY,
      parent_asset_id TEXT NOT NULL REFERENCES file_assets(id),
      derived_kind TEXT NOT NULL CHECK (derived_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'converted_markdown', 'rendered_images', 'selected_frames', 'extracted_audio', 'send_optimized', 'preview_optimized', 'embedding_vector')),
      mime TEXT,
      storage_uri TEXT NOT NULL,
      generator TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed', 'deleted')),
      meta_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS derivative_jobs (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES file_assets(id),
      derivative_kind TEXT NOT NULL CHECK (derivative_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'converted_markdown', 'rendered_images', 'selected_frames', 'extracted_audio', 'send_optimized', 'preview_optimized', 'embedding_vector')),
      task_family TEXT NOT NULL CHECK (task_family IN ('chat_context', 'transcription', 'embeddings')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ready', 'failed', 'cancelled')),
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

    CREATE TABLE IF NOT EXISTS dfc_option_generation_states (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
      target_kind TEXT NOT NULL CHECK (target_kind IN ('plain_text', 'markdown', 'code', 'table_markdown', 'pdf_attachment')),
      derived_kind TEXT NOT NULL CHECK (derived_kind IN ('extracted_text', 'converted_pdf', 'converted_markdown')),
      exposure_mode TEXT NOT NULL CHECK (exposure_mode IN ('dfc')),
      generator TEXT NOT NULL,
      conversion_settings_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ready', 'failed', 'stale', 'blocked')),
      retryable INTEGER NOT NULL DEFAULT 1 CHECK (retryable IN (0, 1)),
      derivative_job_id TEXT REFERENCES derivative_jobs(id) ON DELETE SET NULL,
      output_derivative_id TEXT REFERENCES file_derivatives(id) ON DELETE SET NULL,
      error_code TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      UNIQUE (asset_id, target_kind, exposure_mode, conversion_settings_hash)
    );

    CREATE TABLE IF NOT EXISTS message_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES file_assets(id),
      ai_payload_kind TEXT NOT NULL CHECK (ai_payload_kind IN ('image', 'pdf', 'text', 'audio', 'video', 'binary')),
      processing_status TEXT NOT NULL CHECK (processing_status IN ('native_supported', 'convertible', 'local_only', 'unsupported')),
      include_in_next_request INTEGER NOT NULL DEFAULT 1 CHECK (include_in_next_request IN (0, 1)),
      excluded_reason TEXT,
      dfc_managed INTEGER NOT NULL DEFAULT 0 CHECK (dfc_managed IN (0, 1)),
      used_option_id TEXT,
      used_asset_refs_json TEXT,
      target_kind TEXT CHECK (target_kind IN ('original_file', 'plain_text', 'markdown', 'code', 'table_markdown', 'pdf_attachment')),
      send_strategy TEXT CHECK (send_strategy IN ('text_in_prompt', 'file_attachment')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversation_drafts (
      conversation_id TEXT PRIMARY KEY REFERENCES convo(id) ON DELETE CASCADE,
      draft_text TEXT NOT NULL DEFAULT '',
      draft_mode TEXT NOT NULL DEFAULT 'compose' CHECK (draft_mode IN ('compose', 'edit')),
      editing_source_message_id TEXT REFERENCES message(id) ON DELETE SET NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS draft_attachments (
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
      dfc_managed INTEGER NOT NULL DEFAULT 0 CHECK (dfc_managed IN (0, 1)),
      selected_option_id TEXT,
      selected_asset_refs_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE (conversation_id, asset_id),
      UNIQUE (conversation_id, attachment_order)
    );

    CREATE TABLE IF NOT EXISTS file_attachment_lifecycle (
      asset_id TEXT PRIMARY KEY REFERENCES file_assets(id) ON DELETE CASCADE,
      owner_kind TEXT NOT NULL CHECK (owner_kind IN ('detached', 'abandoned')),
      lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('detached', 'abandoned', 'soft_deleted')),
      reason TEXT,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS file_type_verdicts (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
      verdict_json TEXT NOT NULL,
      primary_format_id TEXT NOT NULL,
      primary_kind TEXT NOT NULL,
      confidence_level TEXT NOT NULL,
      schema_version TEXT NOT NULL,
      taxonomy_version TEXT NOT NULL,
      taxonomy_map_version TEXT NOT NULL,
      magic_table_version TEXT NOT NULL,
      merge_rules_version TEXT NOT NULL,
      container_probe_version TEXT NOT NULL,
      text_probe_version TEXT NOT NULL,
      magika_model_version TEXT,
      fingerprint_json TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
      stale_reason TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_file_assets_sha256 ON file_assets(sha256);
    CREATE INDEX IF NOT EXISTS idx_file_assets_deleted ON file_assets(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_file_derivatives_parent ON file_derivatives(parent_asset_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_derivative_jobs_asset_created ON derivative_jobs(asset_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_derivative_jobs_status_updated ON derivative_jobs(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_message_attachments_asset ON message_attachments(asset_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_message_attachments_message_asset ON message_attachments(message_id, asset_id);
    CREATE INDEX IF NOT EXISTS idx_draft_attachments_conversation_order ON draft_attachments(conversation_id, attachment_order);
    CREATE INDEX IF NOT EXISTS idx_draft_attachments_asset ON draft_attachments(asset_id);
    CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_asset_id ON file_type_verdicts(asset_id);
    CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_is_current ON file_type_verdicts(is_current);
    CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_primary_format_id ON file_type_verdicts(primary_format_id);
    CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_confidence_level ON file_type_verdicts(confidence_level);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_file_type_verdicts_asset_current ON file_type_verdicts(asset_id) WHERE is_current = 1;
  `)

  ensureFileAssetsCompatibility(db)
  ensureDraftAttachmentsCompatibility(db)
  ensureDfcAttachmentBindingSchema(db)
  ensureDfcOptionGenerationStateSchema(db)
  createFilePipelineIndexes(db)
}

function ensureFileAssetsCompatibility(db: BetterSqlite3.Database): void {
  const columns = db.prepare('PRAGMA table_info(file_assets)').all() as Array<{ name: string; notnull: number }>
  const columnNames = new Set(columns.map((column) => column.name))
  const tableSqlRow = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'file_assets'
    LIMIT 1
  `).get() as { sql?: string } | undefined
  const tableSql = tableSqlRow?.sql ?? ''
  const shaColumn = columns.find((column) => column.name === 'sha256')
  const needsRebuild =
    !columnNames.has('source_meta_json') ||
    Boolean(shaColumn?.notnull) ||
    !tableSql.includes('probe_failed') ||
    !tableSql.includes('materialization_failed')

  if (needsRebuild) rebuildFileAssetsTable(db, columnNames.has('source_meta_json'))
}

function ensureDraftAttachmentsCompatibility(db: BetterSqlite3.Database): void {
  const columns = db.prepare('PRAGMA table_info(draft_attachments)').all() as Array<{ name: string }>
  const columnNames = new Set(columns.map((column) => column.name))
  if (!columnNames.has('preferred_send_mode')) {
    db.exec(`ALTER TABLE draft_attachments ADD COLUMN preferred_send_mode TEXT CHECK (preferred_send_mode IN ('default', 'auto', 'url_ref', 'inline_base64'))`)
  }
  if (!columnNames.has('url_retention_mode')) {
    db.exec(`ALTER TABLE draft_attachments ADD COLUMN url_retention_mode TEXT CHECK (url_retention_mode IN ('default', 'link_only', 'link_and_file'))`)
  }
}

function ensureDfcAttachmentBindingSchema(db: BetterSqlite3.Database): void {
  const draftColumns = tableColumnNames(db, 'draft_attachments')
  const messageColumns = tableColumnNames(db, 'message_attachments')
  const draftMissing = ['dfc_managed', 'selected_option_id', 'selected_asset_refs_json']
    .some((column) => !draftColumns.has(column))
  const messageMissing = ['dfc_managed', 'used_option_id', 'used_asset_refs_json', 'target_kind', 'send_strategy']
    .some((column) => !messageColumns.has(column))

  if (!draftMissing && !messageMissing) return

  const migrate = db.transaction(() => {
    if (draftMissing) db.exec(`DELETE FROM draft_attachments;`)
    if (messageMissing) db.exec(`DELETE FROM message_attachments;`)

    if (!draftColumns.has('dfc_managed')) {
      db.exec(`ALTER TABLE draft_attachments ADD COLUMN dfc_managed INTEGER NOT NULL DEFAULT 0 CHECK (dfc_managed IN (0, 1))`)
    }
    if (!draftColumns.has('selected_option_id')) {
      db.exec(`ALTER TABLE draft_attachments ADD COLUMN selected_option_id TEXT`)
    }
    if (!draftColumns.has('selected_asset_refs_json')) {
      db.exec(`ALTER TABLE draft_attachments ADD COLUMN selected_asset_refs_json TEXT`)
    }
    if (!messageColumns.has('dfc_managed')) {
      db.exec(`ALTER TABLE message_attachments ADD COLUMN dfc_managed INTEGER NOT NULL DEFAULT 0 CHECK (dfc_managed IN (0, 1))`)
    }
    if (!messageColumns.has('used_option_id')) {
      db.exec(`ALTER TABLE message_attachments ADD COLUMN used_option_id TEXT`)
    }
    if (!messageColumns.has('used_asset_refs_json')) {
      db.exec(`ALTER TABLE message_attachments ADD COLUMN used_asset_refs_json TEXT`)
    }
    if (!messageColumns.has('target_kind')) {
      db.exec(`ALTER TABLE message_attachments ADD COLUMN target_kind TEXT CHECK (target_kind IN ('original_file', 'plain_text', 'markdown', 'code', 'table_markdown', 'pdf_attachment'))`)
    }
    if (!messageColumns.has('send_strategy')) {
      db.exec(`ALTER TABLE message_attachments ADD COLUMN send_strategy TEXT CHECK (send_strategy IN ('text_in_prompt', 'file_attachment'))`)
    }
  })
  migrate()
}

function tableColumnNames(db: BetterSqlite3.Database, tableName: string): Set<string> {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  return new Set(columns.map((column) => column.name))
}

function ensureDfcOptionGenerationStateSchema(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dfc_option_generation_states (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
      target_kind TEXT NOT NULL CHECK (target_kind IN ('plain_text', 'markdown', 'code', 'table_markdown', 'pdf_attachment')),
      derived_kind TEXT NOT NULL CHECK (derived_kind IN ('extracted_text', 'converted_pdf', 'converted_markdown')),
      exposure_mode TEXT NOT NULL CHECK (exposure_mode IN ('dfc')),
      generator TEXT NOT NULL,
      conversion_settings_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ready', 'failed', 'stale', 'blocked')),
      retryable INTEGER NOT NULL DEFAULT 1 CHECK (retryable IN (0, 1)),
      derivative_job_id TEXT REFERENCES derivative_jobs(id) ON DELETE SET NULL,
      output_derivative_id TEXT REFERENCES file_derivatives(id) ON DELETE SET NULL,
      error_code TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      UNIQUE (asset_id, target_kind, exposure_mode, conversion_settings_hash)
    );
  `)
}

function rebuildFileAssetsTable(db: BetterSqlite3.Database, hasSourceMetaJson: boolean): void {
  const sourceMetaSelect = hasSourceMetaJson ? 'source_meta_json' : 'NULL AS source_meta_json'
  db.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE IF EXISTS file_assets_next;
    CREATE TABLE file_assets_next (
${FILE_ASSETS_COLUMNS_SQL}
    );

    INSERT INTO file_assets_next (
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
    )
    SELECT
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
      ${sourceMetaSelect},
      created_at,
      updated_at,
      deleted_at
    FROM file_assets;

    DROP TABLE file_assets;
    ALTER TABLE file_assets_next RENAME TO file_assets;
    PRAGMA foreign_keys = ON;
  `)
}

function createFilePipelineIndexes(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_file_assets_sha256 ON file_assets(sha256);
    CREATE INDEX IF NOT EXISTS idx_file_assets_deleted ON file_assets(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_file_derivatives_parent ON file_derivatives(parent_asset_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_derivative_jobs_asset_created ON derivative_jobs(asset_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_derivative_jobs_status_updated ON derivative_jobs(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dfc_option_generation_asset ON dfc_option_generation_states(asset_id, target_kind, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dfc_option_generation_status ON dfc_option_generation_states(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_message_attachments_asset ON message_attachments(asset_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_message_attachments_message_asset ON message_attachments(message_id, asset_id);
    CREATE INDEX IF NOT EXISTS idx_draft_attachments_conversation_order ON draft_attachments(conversation_id, attachment_order);
    CREATE INDEX IF NOT EXISTS idx_draft_attachments_asset ON draft_attachments(asset_id);
    CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_asset_id ON file_type_verdicts(asset_id);
    CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_is_current ON file_type_verdicts(is_current);
    CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_primary_format_id ON file_type_verdicts(primary_format_id);
    CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_confidence_level ON file_type_verdicts(confidence_level);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_file_type_verdicts_asset_current ON file_type_verdicts(asset_id) WHERE is_current = 1;
  `)
}
