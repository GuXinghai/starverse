-- Generation Compiler V2 explicit fixed-protocol local endpoint profiles. Epoch-2 only.
CREATE TABLE IF NOT EXISTS local_endpoint_profile_v2 (
  endpoint_profile_id TEXT PRIMARY KEY CHECK (length(endpoint_profile_id) BETWEEN 1 AND 512),
  provider_id TEXT NOT NULL CHECK (provider_id IN ('lmstudio', 'ollama', 'generic_local')),
  protocol_contract_id TEXT NOT NULL CHECK (protocol_contract_id IN (
    'lmstudio-openresponses', 'lmstudio-openai-chat-completions',
    'ollama-chat-v1', 'generic-local-openai-chat-completions'
  )),
  base_url TEXT NOT NULL CHECK (length(base_url) BETWEEN 1 AND 4096),
  credential_mode TEXT NOT NULL CHECK (credential_mode = 'none'),
  protocol_config_json TEXT NOT NULL CHECK (length(protocol_config_json) BETWEEN 2 AND 65536),
  revision_generation INTEGER NOT NULL CHECK (revision_generation BETWEEN 1 AND 9007199254740991),
  profile_revision TEXT NOT NULL CHECK (
    profile_revision = 'local-profile-v2:' || revision_generation || ':' || profile_digest
  ),
  profile_digest TEXT NOT NULL CHECK (
    length(profile_digest) = 64 AND profile_digest NOT GLOB '*[^0-9a-f]*'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_local_endpoint_profile_v2_exact_binding
ON local_endpoint_profile_v2(provider_id, protocol_contract_id, base_url, protocol_config_json);

CREATE TRIGGER IF NOT EXISTS trg_local_endpoint_profile_v2_identity_immutable
BEFORE UPDATE OF endpoint_profile_id, provider_id, protocol_contract_id, base_url, credential_mode, protocol_config_json, created_at_ms
ON local_endpoint_profile_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_LOCAL_PROFILE_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_local_endpoint_profile_v2_revision_guard
BEFORE UPDATE OF revision_generation, profile_revision, profile_digest, updated_at_ms
ON local_endpoint_profile_v2
WHEN NEW.revision_generation <> OLD.revision_generation + 1
  OR NEW.profile_digest = OLD.profile_digest
  OR NEW.updated_at_ms < OLD.updated_at_ms
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_LOCAL_PROFILE_REVISION_INVALID');
END;
