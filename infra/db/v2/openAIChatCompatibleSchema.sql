-- Generation Compiler V2 OpenAI-compatible user-owned Chat Completions contract. Epoch-2 only.
-- Compatible credentials are workspace-scoped and committed with provider/endpoint state.
-- `electron_safe_storage` is the default backend; `plaintext` requires an explicit Linux user choice.
CREATE TABLE IF NOT EXISTS openai_compatible_provider_v2 (
  provider_instance_id TEXT PRIMARY KEY CHECK (length(provider_instance_id) BETWEEN 1 AND 256),
  protocol_contract_id TEXT NOT NULL CHECK (protocol_contract_id = 'openai_chat_compatible'),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 256),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= created_at_ms)
);

CREATE TABLE IF NOT EXISTS openai_compatible_config_revision_v2 (
  config_kind TEXT NOT NULL CHECK (config_kind IN (
    'request_profile', 'request_mapping', 'reasoning_mapping', 'inline_policy', 'response_profile'
  )),
  config_id TEXT NOT NULL CHECK (length(config_id) BETWEEN 1 AND 256),
  version INTEGER NOT NULL CHECK (version BETWEEN 1 AND 9007199254740991),
  payload_json TEXT NOT NULL CHECK (length(payload_json) BETWEEN 2 AND 524288),
  payload_digest TEXT NOT NULL CHECK (length(payload_digest) = 64 AND payload_digest NOT GLOB '*[^0-9a-f]*'),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (config_kind, config_id, version),
  UNIQUE (config_kind, config_id, payload_digest)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS openai_compatible_endpoint_revision_v2 (
  endpoint_revision_id TEXT PRIMARY KEY CHECK (length(endpoint_revision_id) BETWEEN 1 AND 256),
  provider_instance_id TEXT NOT NULL REFERENCES openai_compatible_provider_v2(provider_instance_id),
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  base_url TEXT NOT NULL CHECK (length(base_url) BETWEEN 8 AND 4096),
  security_policy TEXT NOT NULL CHECK (security_policy IN ('compatibility_first', 'strict_ssrf')),
  auth_json TEXT NOT NULL CHECK (length(auth_json) BETWEEN 2 AND 65536),
  ordinary_headers_json TEXT NOT NULL CHECK (length(ordinary_headers_json) BETWEEN 2 AND 65536),
  query_json TEXT NOT NULL CHECK (length(query_json) BETWEEN 2 AND 65536),
  request_profile_id TEXT NOT NULL CHECK (length(request_profile_id) BETWEEN 1 AND 256),
  request_profile_version INTEGER NOT NULL CHECK (request_profile_version >= 1),
  response_profile_id TEXT NOT NULL CHECK (length(response_profile_id) BETWEEN 1 AND 256),
  response_profile_version INTEGER NOT NULL CHECK (response_profile_version >= 1),
  endpoint_digest TEXT NOT NULL CHECK (length(endpoint_digest) = 64 AND endpoint_digest NOT GLOB '*[^0-9a-f]*'),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (provider_instance_id, revision),
  UNIQUE (provider_instance_id, endpoint_digest)
);

CREATE INDEX IF NOT EXISTS idx_openai_compatible_endpoint_revision_v2_latest
ON openai_compatible_endpoint_revision_v2(provider_instance_id, revision DESC);

CREATE TABLE IF NOT EXISTS openai_compatible_credential_v2 (
  credential_version_ref TEXT PRIMARY KEY CHECK (length(credential_version_ref) BETWEEN 1 AND 256),
  provider_instance_id TEXT NOT NULL REFERENCES openai_compatible_provider_v2(provider_instance_id),
  backend TEXT NOT NULL CHECK (backend IN ('electron_safe_storage', 'plaintext')),
  payload BLOB,
  revision INTEGER NOT NULL CHECK (revision BETWEEN 1 AND 9007199254740991),
  credential_scope_id TEXT,
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  configured INTEGER NOT NULL CHECK (configured IN (0, 1)),
  CHECK (
    (configured = 1 AND payload IS NOT NULL AND length(payload) BETWEEN 1 AND 1048576 AND credential_scope_id IS NOT NULL)
    OR
    (configured = 0 AND payload IS NULL AND credential_scope_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_openai_compatible_credential_v2_provider
ON openai_compatible_credential_v2(provider_instance_id);

CREATE TABLE IF NOT EXISTS openai_compatible_model_v2 (
  provider_instance_id TEXT NOT NULL REFERENCES openai_compatible_provider_v2(provider_instance_id),
  model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 512),
  source TEXT NOT NULL CHECK (source IN ('remote_sync', 'manual')),
  state TEXT NOT NULL CHECK (state IN ('active', 'stale')),
  metadata_json TEXT NOT NULL CHECK (length(metadata_json) BETWEEN 2 AND 131072),
  metadata_digest TEXT NOT NULL CHECK (length(metadata_digest) = 64 AND metadata_digest NOT GLOB '*[^0-9a-f]*'),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  PRIMARY KEY (provider_instance_id, model_id, source)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS openai_compatible_discovery_v2 (
  provider_instance_id TEXT NOT NULL REFERENCES openai_compatible_provider_v2(provider_instance_id),
  response_profile_id TEXT NOT NULL CHECK (length(response_profile_id) BETWEEN 1 AND 256),
  response_profile_version INTEGER NOT NULL CHECK (response_profile_version >= 1),
  stream_path TEXT NOT NULL CHECK (length(stream_path) BETWEEN 1 AND 1024),
  state TEXT NOT NULL CHECK (state IN ('candidate', 'ignored', 'confirmed')),
  aggregate_json TEXT NOT NULL CHECK (length(aggregate_json) BETWEEN 2 AND 65536),
  occurrence_count INTEGER NOT NULL CHECK (occurrence_count >= 1),
  first_observed_at_ms INTEGER NOT NULL CHECK (first_observed_at_ms >= 0),
  last_observed_at_ms INTEGER NOT NULL CHECK (last_observed_at_ms >= first_observed_at_ms),
  PRIMARY KEY (provider_instance_id, response_profile_id, response_profile_version, stream_path)
) WITHOUT ROWID;

CREATE TRIGGER IF NOT EXISTS trg_openai_compatible_config_revision_v2_immutable
BEFORE UPDATE ON openai_compatible_config_revision_v2
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_OPENAI_COMPATIBLE_CONFIG_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS trg_openai_compatible_endpoint_revision_v2_immutable
BEFORE UPDATE ON openai_compatible_endpoint_revision_v2
BEGIN SELECT RAISE(ABORT, 'GENERATION_V2_OPENAI_COMPATIBLE_ENDPOINT_IMMUTABLE'); END;
