-- Generation Compiler V2 only. This file is intentionally not executed by
-- the legacy chat.db runtime; epoch-2 will apply it to starverse.db.
CREATE TABLE IF NOT EXISTS gemini_model_evidence_sets (
  credential_scope_id TEXT NOT NULL CHECK (length(credential_scope_id) BETWEEN 1 AND 512),
  endpoint_profile_id TEXT NOT NULL CHECK (endpoint_profile_id = 'gemini-developer-api-v1beta'),
  row_generation INTEGER NOT NULL CHECK (row_generation > 0 AND row_generation <= 9007199254740991),
  endpoint_set_revision TEXT NOT NULL,
  descriptor_revision TEXT NOT NULL,
  descriptor_digest TEXT NOT NULL CHECK (
    length(descriptor_digest) = 64 AND descriptor_digest NOT GLOB '*[^0-9a-f]*'
  ),
  observed_at_ms INTEGER NOT NULL CHECK (observed_at_ms >= 0),
  response_revision TEXT NOT NULL,
  response_digest TEXT NOT NULL CHECK (
    length(response_digest) = 64 AND response_digest NOT GLOB '*[^0-9a-f]*'
  ),
  response_json TEXT NOT NULL CHECK (
    length(CAST(response_json AS BLOB)) <= 8388608
    AND json_valid(response_json)
    AND json_type(response_json) = 'object'
    AND json_extract(response_json, '$.schemaVersion') = 1
    AND json_type(response_json, '$.models') = 'array'
  ),
  CHECK (descriptor_revision = 'gemini-models-v1beta:' || descriptor_digest),
  CHECK (response_revision = 'gemini-models-v1:' || response_digest),
  PRIMARY KEY (credential_scope_id, endpoint_profile_id)
);

CREATE TABLE IF NOT EXISTS gemini_model_evidence_generation_clock (
  credential_scope_id TEXT NOT NULL CHECK (length(credential_scope_id) BETWEEN 1 AND 512),
  endpoint_profile_id TEXT NOT NULL CHECK (endpoint_profile_id = 'gemini-developer-api-v1beta'),
  last_generation INTEGER NOT NULL CHECK (last_generation > 0 AND last_generation <= 9007199254740991),
  PRIMARY KEY (credential_scope_id, endpoint_profile_id)
);

CREATE TRIGGER IF NOT EXISTS gemini_model_evidence_no_delete
BEFORE DELETE ON gemini_model_evidence_sets
BEGIN
  SELECT RAISE(ABORT, 'Gemini model evidence is append-generation only');
END;
CREATE TRIGGER IF NOT EXISTS gemini_model_evidence_clock_no_delete
BEFORE DELETE ON gemini_model_evidence_generation_clock
BEGIN
  SELECT RAISE(ABORT, 'Gemini model evidence clock cannot be deleted');
END;

CREATE TRIGGER IF NOT EXISTS gemini_model_evidence_identity_immutable
BEFORE UPDATE OF credential_scope_id, endpoint_profile_id ON gemini_model_evidence_sets
BEGIN
  SELECT RAISE(ABORT, 'Gemini model evidence identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS gemini_model_evidence_clock_identity_immutable
BEFORE UPDATE OF credential_scope_id, endpoint_profile_id ON gemini_model_evidence_generation_clock
BEGIN
  SELECT RAISE(ABORT, 'Gemini model evidence clock identity is immutable');
END;
