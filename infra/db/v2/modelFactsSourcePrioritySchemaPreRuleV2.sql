-- Generation Compiler V2 source-priority configuration persistence.

CREATE TABLE IF NOT EXISTS model_facts_source_priority_v1 (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  source_priority_config_revision TEXT NOT NULL CHECK (
    length(source_priority_config_revision) = 90
    AND source_priority_config_revision GLOB 'source-priority-config-v1:*'
  ),
  semantic_json TEXT NOT NULL CHECK (
    length(CAST(semantic_json AS BLOB)) BETWEEN 1 AND 65536
    AND json_valid(semantic_json)
    AND json_type(semantic_json) = 'object'
  ),
  semantic_hash TEXT NOT NULL CHECK (
    length(semantic_hash) = 64
    AND semantic_hash NOT GLOB '*[^0-9a-f]*'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  CHECK (source_priority_config_revision = 'source-priority-config-v1:' || semantic_hash)
);

INSERT OR IGNORE INTO model_facts_source_priority_v1 (
  singleton_id, schema_version, source_priority_config_revision,
  semantic_json, semantic_hash, created_at_ms, updated_at_ms
) VALUES (
  1,
  1,
  'source-priority-config-v1:7a9d26087a8c59524515118084e871ba713028c058e08029882d36f1572c13c7',
  '{"priorities":{"capability_rule":1,"models_dev":2,"provider_native":3},"schemaVersion":1}',
  '7a9d26087a8c59524515118084e871ba713028c058e08029882d36f1572c13c7',
  0,
  0
);

CREATE TRIGGER IF NOT EXISTS model_facts_source_priority_v1_identity_immutable
BEFORE UPDATE ON model_facts_source_priority_v1
BEGIN
  SELECT RAISE(ABORT, 'MODEL_FACTS_SOURCE_PRIORITY_IDENTITY_IMMUTABLE')
  WHERE NEW.singleton_id <> OLD.singleton_id
    OR NEW.schema_version <> OLD.schema_version
    OR NEW.created_at_ms <> OLD.created_at_ms;
END;
