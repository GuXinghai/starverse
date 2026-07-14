-- Generation Compiler V2 only. This file is intentionally not executed by
-- the legacy chat.db runtime; epoch-2 will apply it to starverse.db.
CREATE TABLE IF NOT EXISTS openrouter_image_endpoint_descriptor_sets (
  credential_scope TEXT NOT NULL,
  model_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation = 'image-generation'),
  revision TEXT NOT NULL,
  fetched_at_ms INTEGER NOT NULL CHECK (fetched_at_ms >= 0),
  hard_expires_at_ms INTEGER NOT NULL CHECK (hard_expires_at_ms > fetched_at_ms),
  descriptors_json TEXT NOT NULL CHECK (json_valid(descriptors_json) AND json_type(descriptors_json) = 'array'),
  PRIMARY KEY (credential_scope, model_id, operation)
);

CREATE TABLE IF NOT EXISTS openrouter_image_endpoint_bindings (
  credential_scope TEXT NOT NULL,
  model_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation = 'image-generation'),
  provider_tag TEXT NOT NULL,
  provider_slug TEXT NOT NULL,
  descriptor_revision TEXT NOT NULL,
  selected_by TEXT NOT NULL CHECK (selected_by IN ('user', 'sole_eligible')),
  provider_options_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(provider_options_json) AND json_type(provider_options_json) = 'object'),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  PRIMARY KEY (credential_scope, model_id, operation)
);

CREATE TABLE IF NOT EXISTS openrouter_image_endpoint_descriptor_history (
  credential_scope TEXT NOT NULL,
  model_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation = 'image-generation'),
  revision TEXT NOT NULL,
  fetched_at_ms INTEGER NOT NULL CHECK (fetched_at_ms >= 0),
  hard_expires_at_ms INTEGER NOT NULL CHECK (hard_expires_at_ms > fetched_at_ms),
  descriptors_json TEXT NOT NULL CHECK (json_valid(descriptors_json) AND json_type(descriptors_json) = 'array'),
  PRIMARY KEY (credential_scope, model_id, operation, revision)
);

CREATE INDEX IF NOT EXISTS idx_openrouter_image_descriptor_history_retention
  ON openrouter_image_endpoint_descriptor_history(fetched_at_ms);
