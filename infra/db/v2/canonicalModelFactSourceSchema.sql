-- Generation Compiler V2 frozen canonical model-fact source persistence.

CREATE TABLE IF NOT EXISTS canonical_model_fact_raw_payload_v1 (
  store_id TEXT PRIMARY KEY CHECK (length(store_id) = 81),
  persisted_payload_sha256 TEXT NOT NULL CHECK (
    length(persisted_payload_sha256) = 64
    AND persisted_payload_sha256 NOT GLOB '*[^0-9a-f]*'
    AND store_id = 'canonical-raw-v1:' || persisted_payload_sha256
  ),
  payload_json TEXT NOT NULL CHECK (
    length(CAST(payload_json AS BLOB)) BETWEEN 1 AND 16777216
    AND json_valid(payload_json)
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (store_id, persisted_payload_sha256)
);

CREATE TABLE IF NOT EXISTS canonical_model_fact_raw_snapshot_v1 (
  raw_source_snapshot_revision TEXT PRIMARY KEY CHECK (length(raw_source_snapshot_revision) BETWEEN 1 AND 256),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('provider_native', 'models_dev', 'capability_rule')),
  source_scope_id TEXT NOT NULL CHECK (length(source_scope_id) BETWEEN 1 AND 1024),
  record_set_completeness TEXT NOT NULL CHECK (
    record_set_completeness IN ('complete', 'partial', 'unknown', 'not_applicable')
  ),
  snapshot_json TEXT NOT NULL CHECK (
    length(CAST(snapshot_json AS BLOB)) BETWEEN 2 AND 1048576
    AND json_valid(snapshot_json)
    AND json_type(snapshot_json) = 'object'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (raw_source_snapshot_revision, source_kind, source_scope_id)
);

CREATE TABLE IF NOT EXISTS canonical_model_fact_raw_snapshot_payload_ref_v1 (
  raw_source_snapshot_revision TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 0 AND 63),
  store_id TEXT NOT NULL,
  persisted_payload_sha256 TEXT NOT NULL,
  record_key TEXT NOT NULL CHECK (length(record_key) BETWEEN 1 AND 1024),
  sanitizer_revision TEXT NOT NULL CHECK (length(sanitizer_revision) BETWEEN 1 AND 256),
  redacted_paths_json TEXT NOT NULL CHECK (
    length(CAST(redacted_paths_json AS BLOB)) <= 1048576
    AND json_valid(redacted_paths_json)
    AND json_type(redacted_paths_json) = 'array'
  ),
  network_payload_sha256 TEXT CHECK (
    network_payload_sha256 IS NULL OR (
      length(network_payload_sha256) = 64
      AND network_payload_sha256 NOT GLOB '*[^0-9a-f]*'
    )
  ),
  PRIMARY KEY (raw_source_snapshot_revision, ordinal),
  FOREIGN KEY (raw_source_snapshot_revision)
    REFERENCES canonical_model_fact_raw_snapshot_v1(raw_source_snapshot_revision) ON DELETE CASCADE,
  FOREIGN KEY (store_id, persisted_payload_sha256)
    REFERENCES canonical_model_fact_raw_payload_v1(store_id, persisted_payload_sha256) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS canonical_model_fact_source_revision_v1 (
  canonical_source_revision TEXT PRIMARY KEY CHECK (length(canonical_source_revision) BETWEEN 1 AND 256),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('provider_native', 'models_dev', 'capability_rule')),
  source_scope_id TEXT NOT NULL CHECK (length(source_scope_id) BETWEEN 1 AND 1024),
  raw_source_snapshot_revision TEXT NOT NULL,
  adapter_revision TEXT NOT NULL CHECK (length(adapter_revision) BETWEEN 1 AND 256),
  coverage_manifest_revision TEXT NOT NULL CHECK (length(coverage_manifest_revision) BETWEEN 1 AND 256),
  provider_authority_registry_revision TEXT NOT NULL CHECK (
    length(provider_authority_registry_revision) BETWEEN 1 AND 256
  ),
  previous_lkg_source_revision TEXT,
  subject_index_mode TEXT NOT NULL CHECK (subject_index_mode IN ('complete', 'query_bound')),
  subject_fact_count INTEGER NOT NULL CHECK (subject_fact_count BETWEEN 0 AND 1000000),
  subject_index_digest TEXT CHECK (
    subject_index_digest IS NULL OR (
      length(subject_index_digest) = 64 AND subject_index_digest NOT GLOB '*[^0-9a-f]*'
    )
  ),
  source_revision_json TEXT NOT NULL CHECK (
    length(CAST(source_revision_json AS BLOB)) BETWEEN 2 AND 65536
    AND json_valid(source_revision_json)
    AND json_type(source_revision_json) = 'object'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  CHECK (
    (subject_index_mode = 'complete' AND subject_index_digest IS NOT NULL)
    OR (subject_index_mode = 'query_bound' AND subject_fact_count = 0 AND subject_index_digest IS NULL)
  ),
  UNIQUE (canonical_source_revision, source_kind, source_scope_id),
  FOREIGN KEY (raw_source_snapshot_revision, source_kind, source_scope_id)
    REFERENCES canonical_model_fact_raw_snapshot_v1(
      raw_source_snapshot_revision, source_kind, source_scope_id
    ) ON DELETE RESTRICT,
  CHECK (previous_lkg_source_revision IS NULL OR length(previous_lkg_source_revision) BETWEEN 1 AND 256),
  FOREIGN KEY (previous_lkg_source_revision)
    REFERENCES canonical_model_fact_source_revision_v1(canonical_source_revision) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS canonical_model_fact_source_state_v1 (
  source_kind TEXT NOT NULL CHECK (source_kind IN ('provider_native', 'models_dev', 'capability_rule')),
  source_scope_id TEXT NOT NULL CHECK (length(source_scope_id) BETWEEN 1 AND 1024),
  canonical_source_revision TEXT,
  pointer_revision INTEGER NOT NULL CHECK (
    pointer_revision BETWEEN 0 AND 9007199254740991
  ),
  fetched_at_ms INTEGER CHECK (fetched_at_ms IS NULL OR fetched_at_ms >= 0),
  last_succeeded_at_ms INTEGER CHECK (last_succeeded_at_ms IS NULL OR last_succeeded_at_ms >= 0),
  last_attempted_at_ms INTEGER CHECK (last_attempted_at_ms IS NULL OR last_attempted_at_ms >= 0),
  stale_reason TEXT CHECK (stale_reason IS NULL OR length(stale_reason) BETWEEN 1 AND 1024),
  refresh_cadence_ms INTEGER CHECK (
    refresh_cadence_ms IS NULL OR refresh_cadence_ms BETWEEN 1000 AND 9007199254740991
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  PRIMARY KEY (source_kind, source_scope_id),
  CHECK (
    (canonical_source_revision IS NULL AND pointer_revision = 0 AND fetched_at_ms IS NULL
      AND last_succeeded_at_ms IS NULL)
    OR (canonical_source_revision IS NOT NULL AND pointer_revision > 0
      AND fetched_at_ms IS NOT NULL AND last_succeeded_at_ms IS NOT NULL)
  ),
  FOREIGN KEY (canonical_source_revision, source_kind, source_scope_id)
    REFERENCES canonical_model_fact_source_revision_v1(
      canonical_source_revision, source_kind, source_scope_id
    ) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS canonical_model_fact_subject_fact_v1 (
  canonical_subject_fact_revision TEXT PRIMARY KEY CHECK (
    length(canonical_subject_fact_revision) BETWEEN 1 AND 256
  ),
  canonical_source_revision TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('provider_native', 'models_dev', 'capability_rule')),
  source_scope_id TEXT NOT NULL CHECK (length(source_scope_id) BETWEEN 1 AND 1024),
  provider_authority_id TEXT NOT NULL CHECK (length(provider_authority_id) BETWEEN 1 AND 1024),
  endpoint_profile_id TEXT NOT NULL CHECK (length(endpoint_profile_id) BETWEEN 1 AND 1024),
  native_model_id TEXT NOT NULL CHECK (length(native_model_id) BETWEEN 1 AND 1024),
  subject_fact_payload_digest TEXT NOT NULL CHECK (
    length(subject_fact_payload_digest) = 64
    AND subject_fact_payload_digest NOT GLOB '*[^0-9a-f]*'
  ),
  previous_subject_fact_revision TEXT CHECK (
    previous_subject_fact_revision IS NULL OR length(previous_subject_fact_revision) BETWEEN 1 AND 256
  ),
  payload_json TEXT NOT NULL CHECK (
    length(CAST(payload_json AS BLOB)) BETWEEN 2 AND 4194304
    AND json_valid(payload_json)
    AND json_type(payload_json) = 'object'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (
    canonical_source_revision, provider_authority_id, endpoint_profile_id, native_model_id
  ),
  FOREIGN KEY (canonical_source_revision, source_kind, source_scope_id)
    REFERENCES canonical_model_fact_source_revision_v1(
      canonical_source_revision, source_kind, source_scope_id
    ) ON DELETE RESTRICT,
  FOREIGN KEY (previous_subject_fact_revision)
    REFERENCES canonical_model_fact_subject_fact_v1(canonical_subject_fact_revision) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS canonical_model_fact_subject_fact_source_ref_v1 (
  canonical_subject_fact_revision TEXT NOT NULL REFERENCES
    canonical_model_fact_subject_fact_v1(canonical_subject_fact_revision) ON DELETE CASCADE,
  canonical_source_revision TEXT NOT NULL REFERENCES
    canonical_model_fact_source_revision_v1(canonical_source_revision) ON DELETE RESTRICT,
  PRIMARY KEY (canonical_subject_fact_revision, canonical_source_revision)
);

CREATE TABLE IF NOT EXISTS canonical_model_fact_retention_pin_v1 (
  pin_id TEXT PRIMARY KEY CHECK (length(pin_id) BETWEEN 1 AND 256),
  owner_kind TEXT NOT NULL CHECK (length(owner_kind) BETWEEN 1 AND 128),
  owner_id TEXT NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 1024),
  target_kind TEXT NOT NULL CHECK (target_kind IN ('raw_payload', 'source_revision', 'subject_fact')),
  raw_store_id TEXT REFERENCES canonical_model_fact_raw_payload_v1(store_id) ON DELETE RESTRICT,
  canonical_source_revision TEXT REFERENCES
    canonical_model_fact_source_revision_v1(canonical_source_revision) ON DELETE RESTRICT,
  canonical_subject_fact_revision TEXT REFERENCES
    canonical_model_fact_subject_fact_v1(canonical_subject_fact_revision) ON DELETE RESTRICT,
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (owner_kind, owner_id, target_kind, raw_store_id, canonical_source_revision, canonical_subject_fact_revision),
  CHECK (
    (target_kind = 'raw_payload' AND raw_store_id IS NOT NULL
      AND canonical_source_revision IS NULL AND canonical_subject_fact_revision IS NULL)
    OR (target_kind = 'source_revision' AND raw_store_id IS NULL
      AND canonical_source_revision IS NOT NULL AND canonical_subject_fact_revision IS NULL)
    OR (target_kind = 'subject_fact' AND raw_store_id IS NULL
      AND canonical_source_revision IS NULL AND canonical_subject_fact_revision IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_canonical_model_fact_subject_fact_v1_source
  ON canonical_model_fact_subject_fact_v1(canonical_source_revision, created_at_ms);
CREATE INDEX IF NOT EXISTS idx_canonical_model_fact_source_revision_v1_retention
  ON canonical_model_fact_source_revision_v1(source_kind, source_scope_id, created_at_ms);
CREATE INDEX IF NOT EXISTS idx_canonical_model_fact_raw_payload_v1_retention
  ON canonical_model_fact_raw_payload_v1(created_at_ms);
CREATE INDEX IF NOT EXISTS idx_canonical_model_fact_retention_pin_v1_owner
  ON canonical_model_fact_retention_pin_v1(owner_kind, owner_id);

CREATE TRIGGER IF NOT EXISTS canonical_model_fact_raw_payload_v1_no_update
BEFORE UPDATE ON canonical_model_fact_raw_payload_v1
BEGIN
  SELECT RAISE(ABORT, 'canonical_model_fact_raw_payload_v1_immutable');
END;

CREATE TRIGGER IF NOT EXISTS canonical_model_fact_raw_snapshot_v1_no_update
BEFORE UPDATE ON canonical_model_fact_raw_snapshot_v1
BEGIN
  SELECT RAISE(ABORT, 'canonical_model_fact_raw_snapshot_v1_immutable');
END;

CREATE TRIGGER IF NOT EXISTS canonical_model_fact_raw_snapshot_payload_ref_v1_no_update
BEFORE UPDATE ON canonical_model_fact_raw_snapshot_payload_ref_v1
BEGIN
  SELECT RAISE(ABORT, 'canonical_model_fact_raw_snapshot_payload_ref_v1_immutable');
END;

CREATE TRIGGER IF NOT EXISTS canonical_model_fact_source_revision_v1_no_update
BEFORE UPDATE ON canonical_model_fact_source_revision_v1
BEGIN
  SELECT RAISE(ABORT, 'canonical_model_fact_source_revision_v1_immutable');
END;

CREATE TRIGGER IF NOT EXISTS canonical_model_fact_subject_fact_v1_no_update
BEFORE UPDATE ON canonical_model_fact_subject_fact_v1
BEGIN
  SELECT RAISE(ABORT, 'canonical_model_fact_subject_fact_v1_immutable');
END;

CREATE TRIGGER IF NOT EXISTS canonical_model_fact_subject_fact_source_ref_v1_no_update
BEFORE UPDATE ON canonical_model_fact_subject_fact_source_ref_v1
BEGIN
  SELECT RAISE(ABORT, 'canonical_model_fact_subject_fact_source_ref_v1_immutable');
END;

CREATE TRIGGER IF NOT EXISTS canonical_model_fact_retention_pin_v1_no_update
BEFORE UPDATE ON canonical_model_fact_retention_pin_v1
BEGIN
  SELECT RAISE(ABORT, 'canonical_model_fact_retention_pin_v1_immutable');
END;
