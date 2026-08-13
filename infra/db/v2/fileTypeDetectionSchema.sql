-- Generation Compiler V2 mutable file-type detection projection. Epoch-2 only.
-- The immutable asset revision remains the content authority; this table owns
-- asynchronous attempts and CAS-protected completion for that exact revision.
CREATE TABLE IF NOT EXISTS file_type_detection_v2 (
  asset_revision_id TEXT PRIMARY KEY
    REFERENCES asset_revision_v2(asset_revision_id) ON DELETE RESTRICT,
  asset_sha256 TEXT NOT NULL CHECK (
    length(asset_sha256) = 64 AND asset_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  attempt_id TEXT NOT NULL UNIQUE CHECK (length(attempt_id) BETWEEN 1 AND 512),
  revision INTEGER NOT NULL CHECK (revision >= 1),
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed')),
  detector_contract_revision TEXT NOT NULL CHECK (length(detector_contract_revision) BETWEEN 1 AND 512),
  verdict_json TEXT CHECK (verdict_json IS NULL OR json_valid(verdict_json)),
  static_policy_json TEXT CHECK (static_policy_json IS NULL OR json_valid(static_policy_json)),
  warning_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(warning_json)),
  error_code TEXT,
  error_detail TEXT,
  requested_at_ms INTEGER NOT NULL CHECK (requested_at_ms >= 0),
  completed_at_ms INTEGER CHECK (completed_at_ms IS NULL OR completed_at_ms >= requested_at_ms),
  CHECK (
    (status = 'pending' AND verdict_json IS NULL AND static_policy_json IS NULL
      AND error_code IS NULL AND error_detail IS NULL AND completed_at_ms IS NULL)
    OR
    (status = 'ready' AND verdict_json IS NOT NULL AND static_policy_json IS NOT NULL
      AND error_code IS NULL AND completed_at_ms IS NOT NULL)
    OR
    (status = 'failed' AND verdict_json IS NULL AND static_policy_json IS NULL
      AND error_code IS NOT NULL AND completed_at_ms IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_file_type_detection_v2_pending
  ON file_type_detection_v2(status, requested_at_ms, asset_revision_id);

CREATE TRIGGER IF NOT EXISTS trg_file_type_detection_v2_asset_fact_insert
BEFORE INSERT ON file_type_detection_v2
WHEN NOT EXISTS (
  SELECT 1 FROM asset_revision_v2 AS revision
  JOIN file_blob_v2 AS blob ON blob.blob_id = revision.blob_id
  WHERE revision.asset_revision_id = NEW.asset_revision_id
    AND revision.revision_kind = 'source'
    AND blob.sha256 = NEW.asset_sha256
)
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_FILE_DETECTION_ASSET_FACT_INVALID'); END;

CREATE TRIGGER IF NOT EXISTS trg_file_type_detection_v2_identity_update
BEFORE UPDATE ON file_type_detection_v2
WHEN NEW.asset_revision_id <> OLD.asset_revision_id
  OR NEW.asset_sha256 <> OLD.asset_sha256
  OR NEW.revision <> OLD.revision + 1
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_FILE_DETECTION_CAS_INVALID'); END;
