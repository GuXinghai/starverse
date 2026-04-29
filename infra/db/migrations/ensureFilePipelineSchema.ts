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

    CREATE TABLE IF NOT EXISTS derivative_jobs (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES file_assets(id),
      derivative_kind TEXT NOT NULL CHECK (derivative_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'send_optimized', 'preview_optimized', 'embedding_vector')),
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

    CREATE TABLE IF NOT EXISTS message_attachments (
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
  `)

  ensureFileAssetsCompatibility(db)
  ensureDraftAttachmentsCompatibility(db)
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
    CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_message_attachments_asset ON message_attachments(asset_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_message_attachments_message_asset ON message_attachments(message_id, asset_id);
    CREATE INDEX IF NOT EXISTS idx_draft_attachments_conversation_order ON draft_attachments(conversation_id, attachment_order);
    CREATE INDEX IF NOT EXISTS idx_draft_attachments_asset ON draft_attachments(asset_id);
  `)
}
