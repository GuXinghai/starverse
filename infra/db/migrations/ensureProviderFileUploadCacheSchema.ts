import type BetterSqlite3 from 'better-sqlite3'

export function ensureProviderFileUploadCacheSchema(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS provider_file_upload_cache (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL CHECK (provider IN ('openai_responses', 'anthropic_messages', 'google_ai_studio')),
      endpoint_family TEXT NOT NULL,
      normalized_base_url TEXT NOT NULL,
      credential_fingerprint TEXT NOT NULL,
      asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
      revision_id TEXT NOT NULL REFERENCES file_asset_revisions(id) ON DELETE CASCADE,
      blob_sha256 TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      asset_kind TEXT NOT NULL CHECK (asset_kind IN ('image', 'pdf')),
      upload_purpose TEXT NOT NULL,
      provider_file_id TEXT,
      provider_file_uri TEXT,
      provider_file_name TEXT,
      status TEXT NOT NULL CHECK (status IN ('uploading', 'ready', 'failed', 'invalidated')),
      expires_at_ms INTEGER,
      upload_started_at_ms INTEGER NOT NULL,
      uploaded_at_ms INTEGER,
      invalidated_at_ms INTEGER,
      last_error_code TEXT,
      last_error_message TEXT,
      metadata_json TEXT,
      created_at_ms INTEGER NOT NULL,
      updated_at_ms INTEGER NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_file_upload_cache_key
      ON provider_file_upload_cache (
        provider,
        endpoint_family,
        normalized_base_url,
        credential_fingerprint,
        asset_id,
        revision_id,
        blob_sha256,
        mime_type,
        size_bytes,
        asset_kind,
        upload_purpose
      );

    CREATE INDEX IF NOT EXISTS idx_provider_file_upload_cache_asset_revision
      ON provider_file_upload_cache(asset_id, revision_id, status);

    CREATE INDEX IF NOT EXISTS idx_provider_file_upload_cache_expiry
      ON provider_file_upload_cache(provider, status, expires_at_ms);
  `)
}
