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

CREATE INDEX IF NOT EXISTS idx_openrouter_image_descriptor_history_retention
  ON openrouter_image_endpoint_descriptor_history(fetched_at_ms);
