-- Generation Compiler V2 immutable local attachment provenance. Epoch-2 starverse.db only.
CREATE TABLE IF NOT EXISTS file_blob_v2 (
  blob_id TEXT PRIMARY KEY CHECK (blob_id = 'blob-v2:' || sha256),
  sha256 TEXT NOT NULL UNIQUE CHECK (
    length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  size_bytes INTEGER NOT NULL CHECK (size_bytes BETWEEN 0 AND 9007199254740991),
  mime TEXT NOT NULL CHECK (
    length(mime) BETWEEN 3 AND 255
    AND mime = lower(mime)
    AND mime NOT GLOB '*[^a-z0-9!#$&^_.+*/-]*'
    AND instr(mime, '/') > 1
    AND instr(substr(mime, instr(mime, '/') + 1), '/') = 0
  ),
  storage_ref TEXT NOT NULL UNIQUE CHECK (
    storage_ref = 'sha256/' || substr(sha256, 1, 2) || '/' || sha256
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0)
);

CREATE TABLE IF NOT EXISTS file_asset_v2 (
  asset_id TEXT PRIMARY KEY CHECK (length(asset_id) BETWEEN 1 AND 512),
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('file', 'image')),
  filename TEXT NOT NULL CHECK (
    length(filename) BETWEEN 1 AND 4096
    AND filename NOT GLOB '*[' || char(0) || '-' || char(31) || char(127) || ']*'
  ),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('user_import', 'url_import', 'generated', 'derived')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  retired_at_ms INTEGER CHECK (retired_at_ms IS NULL OR retired_at_ms >= created_at_ms)
);

CREATE TABLE IF NOT EXISTS asset_revision_v2 (
  asset_revision_id TEXT PRIMARY KEY CHECK (length(asset_revision_id) BETWEEN 1 AND 512),
  asset_id TEXT NOT NULL REFERENCES file_asset_v2(asset_id) ON DELETE RESTRICT,
  blob_id TEXT NOT NULL REFERENCES file_blob_v2(blob_id) ON DELETE RESTRICT,
  parent_asset_revision_id TEXT REFERENCES asset_revision_v2(asset_revision_id) ON DELETE RESTRICT,
  revision_kind TEXT NOT NULL CHECK (revision_kind IN ('source', 'derived')),
  conversion_kind TEXT NOT NULL CHECK (conversion_kind IN ('none', 'pdf', 'plain_text', 'images')),
  conversion_contract_id TEXT,
  conversion_revision TEXT,
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (asset_revision_id, asset_id),
  CHECK (
    (revision_kind = 'source' AND parent_asset_revision_id IS NULL
      AND conversion_kind = 'none' AND conversion_contract_id IS NULL AND conversion_revision IS NULL)
    OR
    (revision_kind = 'derived' AND parent_asset_revision_id IS NOT NULL
      AND conversion_kind <> 'none'
      AND length(conversion_contract_id) BETWEEN 1 AND 512
      AND length(conversion_revision) BETWEEN 1 AND 512)
  )
);

CREATE INDEX IF NOT EXISTS idx_asset_revision_v2_asset_created
  ON asset_revision_v2(asset_id, created_at_ms, asset_revision_id);

-- Immutable provider-native file handles. These are intentionally separate
-- from the legacy provider_file_upload_cache: a V2 answer snapshot owns one
-- exact OpenAI file id and retry may replay it, never refresh or substitute it.
CREATE TABLE IF NOT EXISTS openai_responses_file_descriptor_v2 (
  descriptor_id TEXT PRIMARY KEY CHECK (length(descriptor_id) BETWEEN 1 AND 512),
  descriptor_revision TEXT NOT NULL UNIQUE CHECK (length(descriptor_revision) BETWEEN 1 AND 512),
  descriptor_hash TEXT NOT NULL UNIQUE CHECK (
    length(descriptor_hash) = 64 AND descriptor_hash NOT GLOB '*[^0-9a-f]*'
  ),
  credential_scope_id TEXT NOT NULL CHECK (length(credential_scope_id) BETWEEN 1 AND 512),
  endpoint_profile_id TEXT NOT NULL CHECK (endpoint_profile_id = 'openai-api-v1'),
  asset_revision_id TEXT NOT NULL REFERENCES asset_revision_v2(asset_revision_id) ON DELETE RESTRICT,
  asset_sha256 TEXT NOT NULL CHECK (
    length(asset_sha256) = 64 AND asset_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  file_id TEXT NOT NULL CHECK (length(file_id) BETWEEN 1 AND 256),
  purpose TEXT NOT NULL CHECK (purpose = 'user_data'),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (credential_scope_id, endpoint_profile_id, asset_revision_id)
);

CREATE TRIGGER IF NOT EXISTS trg_openai_responses_file_descriptor_v2_insert_conflict_guard
BEFORE INSERT ON openai_responses_file_descriptor_v2
WHEN EXISTS (SELECT 1 FROM openai_responses_file_descriptor_v2
  WHERE descriptor_id = NEW.descriptor_id OR descriptor_revision = NEW.descriptor_revision
    OR descriptor_hash = NEW.descriptor_hash
    OR (credential_scope_id = NEW.credential_scope_id
      AND endpoint_profile_id = NEW.endpoint_profile_id
      AND asset_revision_id = NEW.asset_revision_id))
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_OPENAI_FILE_DESCRIPTOR_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_openai_responses_file_descriptor_v2_immutable
BEFORE UPDATE ON openai_responses_file_descriptor_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_OPENAI_FILE_DESCRIPTOR_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_openai_responses_file_descriptor_v2_delete_guard
BEFORE DELETE ON openai_responses_file_descriptor_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_OPENAI_FILE_DESCRIPTOR_IMMUTABLE');
END;

-- Anthropic Files API handles are immutable snapshot inputs, separate from the
-- OpenAI Responses descriptor family even though both use provider file ids.
CREATE TABLE IF NOT EXISTS anthropic_messages_file_descriptor_v2 (
  descriptor_id TEXT PRIMARY KEY CHECK (length(descriptor_id) BETWEEN 1 AND 512),
  descriptor_revision TEXT NOT NULL UNIQUE CHECK (length(descriptor_revision) BETWEEN 1 AND 512),
  descriptor_hash TEXT NOT NULL UNIQUE CHECK (
    length(descriptor_hash) = 64 AND descriptor_hash NOT GLOB '*[^0-9a-f]*'
  ),
  credential_scope_id TEXT NOT NULL CHECK (length(credential_scope_id) BETWEEN 1 AND 512),
  endpoint_profile_id TEXT NOT NULL CHECK (endpoint_profile_id = 'anthropic-messages-2023-06-01'),
  asset_revision_id TEXT NOT NULL REFERENCES asset_revision_v2(asset_revision_id) ON DELETE RESTRICT,
  asset_sha256 TEXT NOT NULL CHECK (
    length(asset_sha256) = 64 AND asset_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  file_id TEXT NOT NULL CHECK (length(file_id) BETWEEN 1 AND 256),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (credential_scope_id, endpoint_profile_id, asset_revision_id)
);

CREATE TRIGGER IF NOT EXISTS trg_anthropic_messages_file_descriptor_v2_insert_conflict_guard
BEFORE INSERT ON anthropic_messages_file_descriptor_v2
WHEN EXISTS (SELECT 1 FROM anthropic_messages_file_descriptor_v2
  WHERE descriptor_id = NEW.descriptor_id OR descriptor_revision = NEW.descriptor_revision
    OR descriptor_hash = NEW.descriptor_hash
    OR (credential_scope_id = NEW.credential_scope_id
      AND endpoint_profile_id = NEW.endpoint_profile_id
      AND asset_revision_id = NEW.asset_revision_id))
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_anthropic_messages_file_descriptor_v2_immutable
BEFORE UPDATE ON anthropic_messages_file_descriptor_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_anthropic_messages_file_descriptor_v2_delete_guard
BEFORE DELETE ON anthropic_messages_file_descriptor_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ANTHROPIC_FILE_DESCRIPTOR_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_file_blob_v2_insert_conflict_guard
BEFORE INSERT ON file_blob_v2
WHEN EXISTS (SELECT 1 FROM file_blob_v2 WHERE blob_id = NEW.blob_id OR sha256 = NEW.sha256)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ASSET_BLOB_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_file_asset_v2_insert_conflict_guard
BEFORE INSERT ON file_asset_v2
WHEN EXISTS (SELECT 1 FROM file_asset_v2 WHERE asset_id = NEW.asset_id)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ASSET_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_asset_revision_v2_insert_conflict_guard
BEFORE INSERT ON asset_revision_v2
WHEN EXISTS (SELECT 1 FROM asset_revision_v2 WHERE asset_revision_id = NEW.asset_revision_id)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ASSET_REVISION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_file_blob_v2_immutable
BEFORE UPDATE ON file_blob_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ASSET_BLOB_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_file_blob_v2_delete_guard
BEFORE DELETE ON file_blob_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ASSET_BLOB_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_file_asset_v2_update_guard
BEFORE UPDATE ON file_asset_v2
WHEN NEW.asset_id <> OLD.asset_id
  OR NEW.asset_kind <> OLD.asset_kind
  OR NEW.filename <> OLD.filename
  OR NEW.source_kind <> OLD.source_kind
  OR NEW.created_at_ms <> OLD.created_at_ms
  OR OLD.retired_at_ms IS NOT NULL
  OR NEW.retired_at_ms IS NULL
  OR NEW.retired_at_ms < OLD.created_at_ms
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ASSET_UPDATE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS trg_file_asset_v2_delete_guard
BEFORE DELETE ON file_asset_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ASSET_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_asset_revision_v2_immutable
BEFORE UPDATE ON asset_revision_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ASSET_REVISION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_asset_revision_v2_delete_guard
BEFORE DELETE ON asset_revision_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ASSET_REVISION_IMMUTABLE');
END;
