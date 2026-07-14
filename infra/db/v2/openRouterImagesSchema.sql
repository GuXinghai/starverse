-- Generation Compiler V2 only. This file is intentionally not executed by
-- the legacy chat.db runtime; epoch-2 will apply it to starverse.db.
CREATE TABLE IF NOT EXISTS openrouter_image_endpoint_descriptor_sets (
  credential_scope_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation = 'image_generate'),
  row_generation INTEGER NOT NULL CHECK (row_generation > 0 AND row_generation <= 9007199254740991),
  endpoint_set_revision TEXT NOT NULL,
  fetched_at_ms INTEGER NOT NULL CHECK (fetched_at_ms >= 0),
  descriptor_response_json TEXT NOT NULL CHECK (
    length(CAST(descriptor_response_json AS BLOB)) <= 1048576
    AND
    json_valid(descriptor_response_json)
    AND json_type(descriptor_response_json) = 'object'
    AND json_extract(descriptor_response_json, '$.id') = model_id
  ),
  PRIMARY KEY (credential_scope_id, model_id, operation)
);

CREATE TABLE IF NOT EXISTS openrouter_image_endpoint_descriptor_history (
  credential_scope_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation = 'image_generate'),
  row_generation INTEGER NOT NULL CHECK (row_generation > 0 AND row_generation <= 9007199254740991),
  endpoint_set_revision TEXT NOT NULL,
  fetched_at_ms INTEGER NOT NULL CHECK (fetched_at_ms >= 0),
  descriptor_response_json TEXT NOT NULL CHECK (
    length(CAST(descriptor_response_json AS BLOB)) <= 1048576
    AND
    json_valid(descriptor_response_json)
    AND json_type(descriptor_response_json) = 'object'
    AND json_extract(descriptor_response_json, '$.id') = model_id
  ),
  PRIMARY KEY (credential_scope_id, model_id, operation, row_generation)
);

CREATE TABLE IF NOT EXISTS openrouter_image_endpoint_descriptor_generation_clock (
  credential_scope_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation = 'image_generate'),
  last_generation INTEGER NOT NULL CHECK (last_generation > 0 AND last_generation <= 9007199254740991),
  PRIMARY KEY (credential_scope_id, model_id, operation)
);

CREATE INDEX IF NOT EXISTS idx_openrouter_image_descriptor_history_retention
  ON openrouter_image_endpoint_descriptor_history(fetched_at_ms);

CREATE TABLE IF NOT EXISTS openrouter_image_endpoint_settings (
  setting_id TEXT PRIMARY KEY CHECK (setting_id = 'endpoint_descriptor_freshness'),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  refresh_after_ms INTEGER NOT NULL CHECK (refresh_after_ms IN (900000, 3600000, 21600000, 86400000, 604800000)),
  hard_expire_after_ms INTEGER NOT NULL CHECK (hard_expire_after_ms IN (3600000, 21600000, 86400000, 604800000, 2592000000)),
  revision INTEGER NOT NULL CHECK (revision > 0 AND revision <= 9007199254740991),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  CHECK (refresh_after_ms < hard_expire_after_ms)
);

CREATE TABLE IF NOT EXISTS openrouter_image_endpoint_settings_revision_clock (
  setting_id TEXT PRIMARY KEY CHECK (setting_id = 'endpoint_descriptor_freshness'),
  last_revision INTEGER NOT NULL CHECK (last_revision >= 0 AND last_revision <= 9007199254740991)
);

INSERT OR IGNORE INTO openrouter_image_endpoint_settings_revision_clock (setting_id, last_revision)
VALUES ('endpoint_descriptor_freshness', 0);

CREATE TABLE IF NOT EXISTS openrouter_image_endpoint_bindings (
  credential_scope_id TEXT NOT NULL CHECK (length(credential_scope_id) BETWEEN 1 AND 512),
  model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 512),
  operation TEXT NOT NULL CHECK (operation = 'image_generate'),
  binding_generation INTEGER NOT NULL CHECK (binding_generation > 0 AND binding_generation <= 9007199254740991),
  provider_id TEXT NOT NULL CHECK (provider_id = 'openrouter'),
  endpoint_profile_id TEXT NOT NULL CHECK (length(endpoint_profile_id) BETWEEN 1 AND 512),
  provider_tag TEXT NOT NULL CHECK (length(provider_tag) BETWEEN 1 AND 512),
  provider_slug TEXT NOT NULL CHECK (length(provider_slug) BETWEEN 1 AND 512),
  descriptor_revision TEXT NOT NULL,
  descriptor_digest TEXT NOT NULL CHECK (
    length(descriptor_digest) = 64 AND descriptor_digest NOT GLOB '*[^0-9a-f]*'
  ),
  selected_by TEXT NOT NULL CHECK (selected_by IN ('user', 'sole_eligible')),
  selected_at_ms INTEGER NOT NULL CHECK (selected_at_ms >= 0),
  protocol_contract_id TEXT NOT NULL CHECK (protocol_contract_id = 'openrouter-images-v1'),
  contract_revision TEXT NOT NULL,
  contract_definition_digest TEXT NOT NULL CHECK (
    length(contract_definition_digest) = 64 AND contract_definition_digest NOT GLOB '*[^0-9a-f]*'
  ),
  registry_revision TEXT NOT NULL CHECK (
    length(registry_revision) = 94
    AND substr(registry_revision, 1, 30) = 'provider-contract-registry-v1:'
    AND substr(registry_revision, 31) NOT GLOB '*[^0-9a-f]*'
  ),
  source_descriptor_row_generation INTEGER NOT NULL CHECK (
    source_descriptor_row_generation > 0 AND source_descriptor_row_generation <= 9007199254740991
  ),
  source_endpoint_set_revision TEXT NOT NULL CHECK (
    length(source_endpoint_set_revision) = 89
    AND substr(source_endpoint_set_revision, 1, 25) = 'openrouter-images-set-v1:'
    AND substr(source_endpoint_set_revision, 26) NOT GLOB '*[^0-9a-f]*'
  ),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= selected_at_ms),
  CHECK (descriptor_revision = 'openrouter-images-descriptor-v1:' || descriptor_digest),
  CHECK (contract_revision = protocol_contract_id || ':' || contract_definition_digest),
  PRIMARY KEY (credential_scope_id, model_id, operation)
);

CREATE TABLE IF NOT EXISTS openrouter_image_endpoint_binding_generation_clock (
  credential_scope_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation = 'image_generate'),
  last_generation INTEGER NOT NULL CHECK (last_generation > 0 AND last_generation <= 9007199254740991),
  PRIMARY KEY (credential_scope_id, model_id, operation)
);
