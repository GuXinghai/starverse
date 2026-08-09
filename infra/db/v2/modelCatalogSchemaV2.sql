-- Generation Compiler V2 scoped model catalog authority.

CREATE TABLE IF NOT EXISTS model_catalog_scope_v2 (
  scope_id TEXT PRIMARY KEY CHECK (length(scope_id) > 0),
  provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
  credential_scope_id TEXT NOT NULL CHECK (length(credential_scope_id) > 0),
  endpoint_profile_id TEXT NOT NULL CHECK (length(endpoint_profile_id) > 0),
  operation_contract_id TEXT NOT NULL CHECK (length(operation_contract_id) > 0),
  category_key TEXT NOT NULL DEFAULT '',
  authority_revision INTEGER NOT NULL CHECK (
    authority_revision > 0 AND authority_revision <= 9007199254740991
  ),
  active_snapshot_digest TEXT CHECK (
    active_snapshot_digest IS NULL OR (
      length(active_snapshot_digest) = 64 AND active_snapshot_digest NOT GLOB '*[^0-9a-f]*'
    )
  ),
  pending_snapshot_digest TEXT CHECK (
    pending_snapshot_digest IS NULL OR (
      length(pending_snapshot_digest) = 64 AND pending_snapshot_digest NOT GLOB '*[^0-9a-f]*'
    )
  ),
  sync_state TEXT NOT NULL CHECK (sync_state IN ('idle', 'syncing', 'ok', 'error')),
  active_attempt_id TEXT,
  last_attempted_at_ms INTEGER,
  last_succeeded_at_ms INTEGER,
  last_failure_json TEXT CHECK (last_failure_json IS NULL OR (length(CAST(last_failure_json AS BLOB)) <= 1048576 AND json_valid(last_failure_json))),
  model_count INTEGER NOT NULL DEFAULT 0 CHECK (model_count >= 0),
  visible_model_count INTEGER NOT NULL DEFAULT 0 CHECK (visible_model_count >= 0),
  hidden_model_count INTEGER NOT NULL DEFAULT 0 CHECK (hidden_model_count >= 0),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE (provider_key, credential_scope_id, endpoint_profile_id, operation_contract_id, category_key),
  CHECK ((active_snapshot_digest IS NULL AND model_count = 0 AND visible_model_count = 0 AND hidden_model_count = 0)
      OR active_snapshot_digest IS NOT NULL),
  CHECK ((sync_state = 'syncing' AND active_attempt_id IS NOT NULL)
      OR (sync_state != 'syncing' AND active_attempt_id IS NULL)),
  CHECK (active_snapshot_digest IS NULL OR pending_snapshot_digest IS NULL OR active_snapshot_digest != pending_snapshot_digest)
);

CREATE TABLE IF NOT EXISTS model_catalog_snapshot_v2 (
  scope_id TEXT NOT NULL REFERENCES model_catalog_scope_v2(scope_id) ON DELETE CASCADE,
  category_key TEXT NOT NULL DEFAULT '',
  snapshot_digest TEXT NOT NULL CHECK (
    length(snapshot_digest) = 64 AND snapshot_digest NOT GLOB '*[^0-9a-f]*'
  ),
  observed_at_ms INTEGER NOT NULL,
  model_count INTEGER NOT NULL CHECK (model_count >= 0),
  visible_model_count INTEGER NOT NULL CHECK (visible_model_count >= 0),
  hidden_model_count INTEGER NOT NULL CHECK (hidden_model_count >= 0),
  codec_version INTEGER NOT NULL CHECK (codec_version BETWEEN 1 AND 2147483647),
  completeness TEXT NOT NULL CHECK (completeness = 'complete'),
  adapter_revision TEXT NOT NULL CHECK (length(adapter_revision) BETWEEN 1 AND 512),
  aggregate_evidence_json TEXT NOT NULL CHECK (
    length(CAST(aggregate_evidence_json AS BLOB)) <= 1048576
    AND json_valid(aggregate_evidence_json)
    AND json_type(aggregate_evidence_json) = 'object'
    AND json_type(aggregate_evidence_json, '$.schemaVersion') = 'integer'
    AND json_type(aggregate_evidence_json, '$.completeness') = 'text'
    AND json_type(aggregate_evidence_json, '$.modelCount') = 'integer'
    AND json_type(aggregate_evidence_json, '$.visibleModelCount') = 'integer'
    AND json_type(aggregate_evidence_json, '$.hiddenModelCount') = 'integer'
    AND json_type(aggregate_evidence_json, '$.itemsDigest') = 'text'
    AND json_extract(aggregate_evidence_json, '$.schemaVersion') = 1
    AND json_extract(aggregate_evidence_json, '$.completeness') = 'complete'
    AND json_extract(aggregate_evidence_json, '$.modelCount') = model_count
    AND json_extract(aggregate_evidence_json, '$.visibleModelCount') = visible_model_count
    AND json_extract(aggregate_evidence_json, '$.hiddenModelCount') = hidden_model_count
    AND length(json_extract(aggregate_evidence_json, '$.itemsDigest')) = 64
    AND json_extract(aggregate_evidence_json, '$.itemsDigest') NOT GLOB '*[^0-9a-f]*'
  ),
  items_json TEXT NOT NULL CHECK (
    length(items_json) > 1 AND json_valid(items_json) AND json_type(items_json) = 'array'
    AND json_array_length(items_json) = model_count
  ),
  created_at_ms INTEGER NOT NULL,
  CHECK (visible_model_count + hidden_model_count = model_count),
  PRIMARY KEY (scope_id, category_key, snapshot_digest)
);

CREATE INDEX IF NOT EXISTS idx_model_catalog_scope_v2_provider
  ON model_catalog_scope_v2(provider_key, updated_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_model_catalog_snapshot_v2_retention
  ON model_catalog_snapshot_v2(scope_id, created_at_ms DESC);

CREATE TRIGGER IF NOT EXISTS model_catalog_snapshot_v2_no_update
BEFORE UPDATE ON model_catalog_snapshot_v2
BEGIN
  SELECT RAISE(ABORT, 'model_catalog_snapshot_v2_immutable');
END;
