-- Generation Compiler V2 scoped model catalog authority.

CREATE TABLE IF NOT EXISTS model_catalog_scope_v2 (
  scope_id TEXT PRIMARY KEY CHECK (length(scope_id) > 0),
  provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
  credential_scope_id TEXT NOT NULL CHECK (length(credential_scope_id) > 0),
  endpoint_profile_id TEXT NOT NULL CHECK (length(endpoint_profile_id) > 0),
  operation_contract_id TEXT NOT NULL CHECK (length(operation_contract_id) > 0),
  active_snapshot_digest TEXT,
  active_category_key TEXT NOT NULL DEFAULT '',
  sync_state TEXT NOT NULL CHECK (sync_state IN ('idle', 'syncing', 'ok', 'error')),
  active_attempt_id TEXT,
  last_attempt_at_ms INTEGER,
  last_success_at_ms INTEGER,
  last_error_code TEXT,
  last_error_message TEXT,
  last_error_fact_json TEXT CHECK (last_error_fact_json IS NULL OR (length(CAST(last_error_fact_json AS BLOB)) <= 1048576 AND json_valid(last_error_fact_json))),
  model_count INTEGER NOT NULL DEFAULT 0 CHECK (model_count >= 0),
  visible_model_count INTEGER NOT NULL DEFAULT 0 CHECK (visible_model_count >= 0),
  hidden_model_count INTEGER NOT NULL DEFAULT 0 CHECK (hidden_model_count >= 0),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE (provider_key, credential_scope_id, endpoint_profile_id, operation_contract_id, active_category_key),
  CHECK ((active_snapshot_digest IS NULL AND model_count = 0 AND visible_model_count = 0 AND hidden_model_count = 0)
      OR active_snapshot_digest IS NOT NULL),
  CHECK ((sync_state = 'syncing' AND active_attempt_id IS NOT NULL)
      OR (sync_state != 'syncing' AND active_attempt_id IS NULL))
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
  items_json TEXT NOT NULL CHECK (length(items_json) > 1),
  created_at_ms INTEGER NOT NULL,
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
