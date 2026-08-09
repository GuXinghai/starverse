-- Generation Compiler V2 composer drafts. Epoch-2 starverse.db only.
CREATE TABLE IF NOT EXISTS composer_draft_v2 (
  conversation_id TEXT PRIMARY KEY REFERENCES conversation_v2(conversation_id) ON DELETE CASCADE,
  draft_text TEXT NOT NULL DEFAULT '' CHECK (length(CAST(draft_text AS BLOB)) <= 20971520),
  draft_mode TEXT NOT NULL DEFAULT 'compose' CHECK (draft_mode IN ('compose', 'edit')),
  editing_source_question_id TEXT REFERENCES message_v2(message_id) ON DELETE SET NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision BETWEEN 0 AND 9007199254740991),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  CHECK ((draft_mode = 'compose' AND editing_source_question_id IS NULL)
    OR (draft_mode = 'edit' AND editing_source_question_id IS NOT NULL))
);

CREATE TRIGGER IF NOT EXISTS trg_composer_draft_v2_validate_edit_source_insert
AFTER INSERT ON composer_draft_v2
WHEN NEW.editing_source_question_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2
    WHERE message_id = NEW.editing_source_question_id
      AND conversation_id = NEW.conversation_id
      AND role = 'user' AND status = 'completed'
  ) THEN RAISE(ABORT, 'GENERATION_V2_DRAFT_EDIT_SOURCE_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_composer_draft_v2_validate_edit_source_update
AFTER UPDATE OF conversation_id, draft_mode, editing_source_question_id ON composer_draft_v2
WHEN NEW.editing_source_question_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2
    WHERE message_id = NEW.editing_source_question_id
      AND conversation_id = NEW.conversation_id
      AND role = 'user' AND status = 'completed'
  ) THEN RAISE(ABORT, 'GENERATION_V2_DRAFT_EDIT_SOURCE_INVALID') END;
END;

CREATE TABLE IF NOT EXISTS composer_draft_attachment_v2 (
  conversation_id TEXT NOT NULL REFERENCES composer_draft_v2(conversation_id) ON DELETE CASCADE,
  attachment_kind TEXT NOT NULL CHECK (attachment_kind IN ('managed_file', 'url_reference')),
  asset_id TEXT,
  asset_revision_id TEXT,
  asset_sha256 TEXT CHECK (asset_sha256 IS NULL OR (
    length(asset_sha256) = 64 AND asset_sha256 NOT GLOB '*[^0-9a-f]*'
  )),
  url_reference_id TEXT,
  url_reference_revision TEXT,
  attachment_order INTEGER NOT NULL CHECK (attachment_order BETWEEN 0 AND 65535),
  include_in_next_request INTEGER NOT NULL CHECK (include_in_next_request IN (0, 1)),
  send_as TEXT NOT NULL CHECK (send_as IN ('provider_file', 'inline_text', 'image_reference', 'converted_document', 'url_reference')),
  conversion_kind TEXT NOT NULL CHECK (conversion_kind IN ('none', 'pdf', 'plain_text', 'images')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  PRIMARY KEY (conversation_id, attachment_order),
  UNIQUE (conversation_id, asset_revision_id),
  UNIQUE (conversation_id, url_reference_revision),
  UNIQUE (conversation_id, attachment_order),
  FOREIGN KEY (asset_revision_id, asset_id)
    REFERENCES asset_revision_v2(asset_revision_id, asset_id) ON DELETE RESTRICT,
  FOREIGN KEY (url_reference_revision, url_reference_id)
    REFERENCES url_attachment_reference_v2(reference_revision, reference_id) ON DELETE RESTRICT,
  CHECK ((attachment_kind = 'managed_file'
    AND asset_id IS NOT NULL AND asset_revision_id IS NOT NULL AND asset_sha256 IS NOT NULL
    AND url_reference_id IS NULL AND url_reference_revision IS NULL
    AND send_as <> 'url_reference')
    OR (attachment_kind = 'url_reference'
    AND asset_id IS NULL AND asset_revision_id IS NULL AND asset_sha256 IS NULL
    AND url_reference_id IS NOT NULL AND url_reference_revision IS NOT NULL
    AND send_as = 'url_reference' AND conversion_kind = 'none'))
);

CREATE TRIGGER IF NOT EXISTS trg_composer_draft_attachment_v2_validate_insert
AFTER INSERT ON composer_draft_attachment_v2
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM asset_revision_v2 AS revision
    JOIN file_blob_v2 AS blob ON blob.blob_id = revision.blob_id
    JOIN file_asset_v2 AS asset ON asset.asset_id = revision.asset_id
    WHERE NEW.attachment_kind = 'managed_file'
      AND revision.asset_revision_id = NEW.asset_revision_id
      AND revision.asset_id = NEW.asset_id
      AND revision.conversion_kind = NEW.conversion_kind
      AND blob.sha256 = NEW.asset_sha256
      AND asset.retired_at_ms IS NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM url_attachment_reference_v2 AS reference
    WHERE NEW.attachment_kind = 'url_reference'
      AND reference.reference_id = NEW.url_reference_id
      AND reference.reference_revision = NEW.url_reference_revision
  ) THEN RAISE(ABORT, 'GENERATION_V2_DRAFT_ATTACHMENT_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_composer_draft_attachment_v2_validate_update
AFTER UPDATE ON composer_draft_attachment_v2
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM asset_revision_v2 AS revision
    JOIN file_blob_v2 AS blob ON blob.blob_id = revision.blob_id
    JOIN file_asset_v2 AS asset ON asset.asset_id = revision.asset_id
    WHERE NEW.attachment_kind = 'managed_file'
      AND revision.asset_revision_id = NEW.asset_revision_id
      AND revision.asset_id = NEW.asset_id
      AND revision.conversion_kind = NEW.conversion_kind
      AND blob.sha256 = NEW.asset_sha256
      AND asset.retired_at_ms IS NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM url_attachment_reference_v2 AS reference
    WHERE NEW.attachment_kind = 'url_reference'
      AND reference.reference_id = NEW.url_reference_id
      AND reference.reference_revision = NEW.url_reference_revision
  ) THEN RAISE(ABORT, 'GENERATION_V2_DRAFT_ATTACHMENT_INVALID') END;
END;

CREATE INDEX IF NOT EXISTS idx_composer_draft_attachment_v2_order
  ON composer_draft_attachment_v2(conversation_id, attachment_order);

-- A link-only URL is an immutable user-provided reference, not an imported
-- file.  No probe, redirect resolution, content discovery or managed bytes
-- are created by this record.
CREATE TABLE IF NOT EXISTS url_attachment_reference_v2 (
  reference_id TEXT PRIMARY KEY CHECK (length(reference_id) BETWEEN 1 AND 512),
  reference_revision TEXT NOT NULL UNIQUE CHECK (length(reference_revision) BETWEEN 1 AND 512),
  original_url TEXT NOT NULL CHECK (length(original_url) BETWEEN 1 AND 16384),
  url_digest TEXT NOT NULL CHECK (length(url_digest) = 64 AND url_digest NOT GLOB '*[^0-9a-f]*'),
  media_kind TEXT NOT NULL CHECK (media_kind IN ('image', 'document', 'audio', 'video', 'other')),
  declared_media_type TEXT CHECK (declared_media_type IS NULL OR (
    length(declared_media_type) BETWEEN 3 AND 255 AND declared_media_type = lower(declared_media_type)
    AND declared_media_type GLOB '*/*')),
  captured_at_ms INTEGER NOT NULL CHECK (captured_at_ms >= 0),
  provenance TEXT NOT NULL CHECK (provenance = 'user_supplied'),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (reference_revision, reference_id),
  CHECK (created_at_ms >= captured_at_ms)
);

CREATE TRIGGER IF NOT EXISTS trg_url_attachment_reference_v2_immutable_update
BEFORE UPDATE ON url_attachment_reference_v2
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_URL_REFERENCE_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS trg_url_attachment_reference_v2_immutable_delete
BEFORE DELETE ON url_attachment_reference_v2
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_URL_REFERENCE_IMMUTABLE'); END;

-- `link_and_file` owns stable bytes while retaining the user-supplied origin
-- for the existing attachment UI.  The origin is provenance only and is never
-- used to refresh, replace or otherwise mutate the managed revision.
CREATE TABLE IF NOT EXISTS managed_url_import_provenance_v2 (
  asset_revision_id TEXT PRIMARY KEY REFERENCES asset_revision_v2(asset_revision_id) ON DELETE RESTRICT,
  original_url TEXT NOT NULL CHECK (length(original_url) BETWEEN 1 AND 16384),
  url_digest TEXT NOT NULL CHECK (length(url_digest) = 64 AND url_digest NOT GLOB '*[^0-9a-f]*'),
  captured_at_ms INTEGER NOT NULL CHECK (captured_at_ms >= 0),
  provenance TEXT NOT NULL CHECK (provenance = 'user_supplied'),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= captured_at_ms)
);

CREATE TRIGGER IF NOT EXISTS trg_managed_url_import_provenance_v2_immutable_update
BEFORE UPDATE ON managed_url_import_provenance_v2
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_URL_IMPORT_PROVENANCE_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS trg_managed_url_import_provenance_v2_immutable_delete
BEFORE DELETE ON managed_url_import_provenance_v2
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_URL_IMPORT_PROVENANCE_IMMUTABLE'); END;
