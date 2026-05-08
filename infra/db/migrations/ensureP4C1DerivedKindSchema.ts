import type BetterSqlite3 from 'better-sqlite3'

const NEW_DERIVED_KIND_VALUES = [
  'converted_markdown',
  'rendered_images',
  'selected_frames',
  'extracted_audio',
]

const UPDATED_FILE_DERIVATIVES_CHECK =
  "derived_kind TEXT NOT NULL CHECK (derived_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'converted_markdown', 'rendered_images', 'selected_frames', 'extracted_audio', 'send_optimized', 'preview_optimized', 'embedding_vector'))"

const UPDATED_DERIVATIVE_JOBS_CHECK =
  "derivative_kind TEXT NOT NULL CHECK (derivative_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'converted_markdown', 'rendered_images', 'selected_frames', 'extracted_audio', 'send_optimized', 'preview_optimized', 'embedding_vector'))"

export function ensureP4C1DerivedKindSchema(db: BetterSqlite3.Database): void {
  ensureFileDerivativesDerivedKind(db)
  ensureDerivativeJobsDerivativeKind(db)
}

function ensureFileDerivativesDerivedKind(db: BetterSqlite3.Database): void {
  if (derivedKindCheckHasNewValues(db, 'file_derivatives', 'derived_kind')) return

  db.exec(`
    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS file_derivatives_p4c1;
    CREATE TABLE file_derivatives_p4c1 (
      id TEXT PRIMARY KEY,
      parent_asset_id TEXT NOT NULL REFERENCES file_assets(id),
      ${UPDATED_FILE_DERIVATIVES_CHECK},
      mime TEXT,
      storage_uri TEXT NOT NULL,
      generator TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed', 'deleted')),
      meta_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    );

    INSERT INTO file_derivatives_p4c1 (
      id, parent_asset_id, derived_kind, mime, storage_uri,
      generator, status, meta_json, created_at, updated_at, deleted_at
    )
    SELECT
      id, parent_asset_id, derived_kind, mime, storage_uri,
      generator, status, meta_json, created_at, updated_at, deleted_at
    FROM file_derivatives;

    DROP TABLE file_derivatives;
    ALTER TABLE file_derivatives_p4c1 RENAME TO file_derivatives;

    CREATE INDEX IF NOT EXISTS idx_file_derivatives_parent ON file_derivatives(parent_asset_id, created_at);

    PRAGMA foreign_keys = ON;
  `)
}

function ensureDerivativeJobsDerivativeKind(db: BetterSqlite3.Database): void {
  if (derivedKindCheckHasNewValues(db, 'derivative_jobs', 'derivative_kind')) return

  db.exec(`
    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS derivative_jobs_p4c1;
    CREATE TABLE derivative_jobs_p4c1 (
      id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL REFERENCES file_assets(id),
      ${UPDATED_DERIVATIVE_JOBS_CHECK},
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

    INSERT INTO derivative_jobs_p4c1 (
      id, asset_id, derivative_kind, task_family, status,
      generator, provider, model_id, input_snapshot_json, config_json,
      output_derivative_id, error_code, error_message, attempt_count,
      created_at, updated_at, started_at, finished_at
    )
    SELECT
      id, asset_id, derivative_kind, task_family, status,
      generator, provider, model_id, input_snapshot_json, config_json,
      output_derivative_id, error_code, error_message, attempt_count,
      created_at, updated_at, started_at, finished_at
    FROM derivative_jobs;

    DROP TABLE derivative_jobs;
    ALTER TABLE derivative_jobs_p4c1 RENAME TO derivative_jobs;

    CREATE INDEX IF NOT EXISTS idx_derivative_jobs_asset_created ON derivative_jobs(asset_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_derivative_jobs_status_updated ON derivative_jobs(status, updated_at DESC);

    PRAGMA foreign_keys = ON;
  `)
}

function derivedKindCheckHasNewValues(
  db: BetterSqlite3.Database,
  tableName: string,
  _columnName: string
): boolean {
  const row = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName) as { sql?: string } | undefined

  const tableSql = row?.sql ?? ''
  if (!tableSql) return true

  return NEW_DERIVED_KIND_VALUES.every((value) => tableSql.includes(value))
}
