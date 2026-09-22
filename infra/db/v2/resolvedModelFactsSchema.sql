-- Generation Compiler V2 resolved model-facts publication and current pointer.

CREATE TABLE IF NOT EXISTS resolved_model_facts_snapshot_v1 (
  resolved_snapshot_revision TEXT PRIMARY KEY CHECK (
    length(resolved_snapshot_revision) = 97
    AND resolved_snapshot_revision GLOB 'resolved-model-facts-snapshot-v1:*'
  ),
  provider_authority_id TEXT NOT NULL CHECK (length(provider_authority_id) BETWEEN 1 AND 1024),
  endpoint_profile_id TEXT NOT NULL CHECK (length(endpoint_profile_id) BETWEEN 1 AND 1024),
  native_model_id TEXT NOT NULL CHECK (length(native_model_id) BETWEEN 1 AND 1024),
  source_scope_selection_json TEXT NOT NULL CHECK (
    length(CAST(source_scope_selection_json AS BLOB)) BETWEEN 2 AND 8192
    AND json_valid(source_scope_selection_json)
    AND json_type(source_scope_selection_json) = 'object'
  ),
  source_priority_config_revision TEXT NOT NULL CHECK (length(source_priority_config_revision) BETWEEN 1 AND 256),
  resolver_revision TEXT NOT NULL CHECK (length(resolver_revision) BETWEEN 1 AND 256),
  ontology_revision TEXT NOT NULL CHECK (length(ontology_revision) BETWEEN 1 AND 256),
  capability_revision TEXT NOT NULL CHECK (
    length(capability_revision) = 87
    AND capability_revision GLOB 'capability-revision-v1:*'
  ),
  resolved_json TEXT NOT NULL CHECK (
    length(CAST(resolved_json AS BLOB)) BETWEEN 2 AND 16777216
    AND json_valid(resolved_json)
    AND json_type(resolved_json) = 'object'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (provider_authority_id, endpoint_profile_id, native_model_id, resolved_snapshot_revision)
);

CREATE TABLE IF NOT EXISTS resolved_model_facts_current_v1 (
  provider_authority_id TEXT NOT NULL CHECK (length(provider_authority_id) BETWEEN 1 AND 1024),
  endpoint_profile_id TEXT NOT NULL CHECK (length(endpoint_profile_id) BETWEEN 1 AND 1024),
  native_model_id TEXT NOT NULL CHECK (length(native_model_id) BETWEEN 1 AND 1024),
  resolved_snapshot_revision TEXT NOT NULL,
  pointer_revision INTEGER NOT NULL CHECK (pointer_revision BETWEEN 1 AND 9007199254740991),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  PRIMARY KEY (provider_authority_id, endpoint_profile_id, native_model_id),
  FOREIGN KEY (resolved_snapshot_revision)
    REFERENCES resolved_model_facts_snapshot_v1(resolved_snapshot_revision) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS resolved_model_facts_snapshot_v1_immutable
BEFORE UPDATE ON resolved_model_facts_snapshot_v1
BEGIN
  SELECT RAISE(ABORT, 'RESOLVED_MODEL_FACTS_SNAPSHOT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS resolved_model_facts_snapshot_v1_no_delete
BEFORE DELETE ON resolved_model_facts_snapshot_v1
BEGIN
  SELECT RAISE(ABORT, 'RESOLVED_MODEL_FACTS_SNAPSHOT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS resolved_model_facts_current_v1_identity_immutable
BEFORE UPDATE OF provider_authority_id, endpoint_profile_id, native_model_id ON resolved_model_facts_current_v1
BEGIN
  SELECT RAISE(ABORT, 'RESOLVED_MODEL_FACTS_CURRENT_IDENTITY_IMMUTABLE');
END;
