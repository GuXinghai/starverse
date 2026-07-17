-- Generation Compiler V2 provider-neutral execution facts. Epoch-2 starverse.db only.
CREATE TABLE IF NOT EXISTS app_meta_v2 (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  data_epoch INTEGER NOT NULL CHECK (data_epoch = 2),
  application_id TEXT NOT NULL CHECK (length(application_id) BETWEEN 1 AND 512),
  root_id TEXT NOT NULL CHECK (length(root_id) = 64 AND root_id NOT GLOB '*[^0-9a-f]*'),
  schema_digest TEXT NOT NULL CHECK (
    length(schema_digest) = 64 AND schema_digest NOT GLOB '*[^0-9a-f]*'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0)
);

CREATE TRIGGER IF NOT EXISTS trg_app_meta_v2_immutable
BEFORE UPDATE ON app_meta_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_APP_META_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_app_meta_v2_delete_forbidden
BEFORE DELETE ON app_meta_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_APP_META_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS epoch_scope_key_envelope_v2 (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  backend TEXT NOT NULL CHECK (backend = 'electron_safe_storage'),
  key_version INTEGER NOT NULL CHECK (key_version = 1),
  envelope_revision INTEGER NOT NULL CHECK (envelope_revision >= 1),
  ciphertext BLOB NOT NULL CHECK (
    typeof(ciphertext) = 'blob' AND length(ciphertext) BETWEEN 1 AND 1048576
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  FOREIGN KEY (singleton_id) REFERENCES app_meta_v2(singleton_id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS trg_epoch_scope_key_envelope_v2_rewrap_guard
BEFORE UPDATE ON epoch_scope_key_envelope_v2
WHEN NEW.singleton_id != OLD.singleton_id
  OR NEW.backend != OLD.backend
  OR NEW.key_version != OLD.key_version
  OR NEW.envelope_revision != OLD.envelope_revision + 1
  OR NEW.ciphertext = OLD.ciphertext
  OR NEW.created_at_ms != OLD.created_at_ms
  OR NEW.updated_at_ms < OLD.updated_at_ms
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_SCOPE_KEY_REWRAP_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS trg_epoch_scope_key_envelope_v2_delete_forbidden
BEFORE DELETE ON epoch_scope_key_envelope_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_SCOPE_KEY_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS generation_operation_v2 (
  operation_id TEXT PRIMARY KEY CHECK (length(operation_id) BETWEEN 1 AND 512),
  action_kind TEXT NOT NULL CHECK (action_kind IN (
    'initial_send', 'edit_resend', 'regenerate_question', 'retry_as_new', 'retry_replace'
  )),
  command_fingerprint TEXT NOT NULL CHECK (
    length(command_fingerprint) = 64 AND command_fingerprint NOT GLOB '*[^0-9a-f]*'
  ),
  branch_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  target_answer_root_id TEXT,
  result_answer_root_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('committed', 'streaming', 'completed', 'failed', 'cancelled')),
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 512),
  error_message TEXT CHECK (
    error_message IS NULL OR length(CAST(error_message AS BLOB)) <= 1048576
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  terminal_at_ms INTEGER CHECK (terminal_at_ms IS NULL OR terminal_at_ms >= created_at_ms),
  UNIQUE (operation_id, result_answer_root_id),
  UNIQUE (result_answer_root_id),
  FOREIGN KEY (branch_id, conversation_id)
    REFERENCES branch_v2(branch_id, conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (question_id, conversation_id)
    REFERENCES message_v2(message_id, conversation_id) ON DELETE CASCADE,
  FOREIGN KEY (target_answer_root_id, conversation_id)
    REFERENCES message_v2(message_id, conversation_id) ON DELETE RESTRICT,
  FOREIGN KEY (result_answer_root_id, conversation_id)
    REFERENCES message_v2(message_id, conversation_id) ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (operation_id, result_answer_root_id)
    REFERENCES assistant_generation_snapshot_v2(operation_id, answer_root_id)
    DEFERRABLE INITIALLY DEFERRED,
  CHECK (
    (action_kind IN ('retry_as_new', 'retry_replace') AND target_answer_root_id IS NOT NULL)
    OR (action_kind NOT IN ('retry_as_new', 'retry_replace') AND target_answer_root_id IS NULL)
  ),
  CHECK (
    (state IN ('committed', 'streaming') AND terminal_at_ms IS NULL
      AND error_code IS NULL AND error_message IS NULL)
    OR (state = 'completed' AND terminal_at_ms IS NOT NULL
      AND error_code IS NULL AND error_message IS NULL)
    OR (state IN ('failed', 'cancelled') AND terminal_at_ms IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_generation_operation_v2_active_question
  ON generation_operation_v2(branch_id, question_id)
  WHERE state IN ('committed', 'streaming');

CREATE TRIGGER IF NOT EXISTS trg_generation_operation_v2_question_body_immutable
BEFORE UPDATE OF body_text ON message_body_v2
WHEN EXISTS (
  SELECT 1 FROM generation_operation_v2 AS operation
  WHERE operation.action_kind IN ('initial_send', 'edit_resend')
    AND operation.question_id = OLD.message_id
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_OPERATION_QUESTION_BODY_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS runtime_capability_snapshot_v2 (
  capability_snapshot_hash TEXT PRIMARY KEY CHECK (
    length(capability_snapshot_hash) = 64
    AND capability_snapshot_hash NOT GLOB '*[^0-9a-f]*'
  ),
  capability_revision TEXT NOT NULL CHECK (length(capability_revision) BETWEEN 1 AND 512),
  schema_version INTEGER NOT NULL CHECK (schema_version = 2),
  canonical_json TEXT NOT NULL CHECK (
    length(CAST(canonical_json AS BLOB)) BETWEEN 2 AND 1048576
    AND json_valid(canonical_json)
    AND json_type(canonical_json) = 'object'
  ),
  evidence_digest TEXT NOT NULL CHECK (
    length(evidence_digest) = 64 AND evidence_digest NOT GLOB '*[^0-9a-f]*'
  ),
  semantic_fields_digest TEXT NOT NULL CHECK (
    length(semantic_fields_digest) = 64 AND semantic_fields_digest NOT GLOB '*[^0-9a-f]*'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (
    capability_snapshot_hash, capability_revision, evidence_digest, semantic_fields_digest
  )
);

CREATE INDEX IF NOT EXISTS ix_runtime_capability_snapshot_v2_revision
  ON runtime_capability_snapshot_v2(capability_revision);

CREATE TRIGGER IF NOT EXISTS trg_runtime_capability_snapshot_v2_immutable
BEFORE UPDATE ON runtime_capability_snapshot_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_CAPABILITY_SNAPSHOT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_runtime_capability_snapshot_v2_delete_forbidden
BEFORE DELETE ON runtime_capability_snapshot_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_CAPABILITY_SNAPSHOT_IMMUTABLE');
END;

CREATE TABLE IF NOT EXISTS assistant_generation_snapshot_v2 (
  answer_root_id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL UNIQUE,
  schema_version INTEGER NOT NULL CHECK (schema_version = 2),
  canonical_json TEXT NOT NULL CHECK (
    length(CAST(canonical_json AS BLOB)) BETWEEN 2 AND 1048576
    AND json_valid(canonical_json)
    AND json_type(canonical_json) = 'object'
  ),
  snapshot_hash TEXT NOT NULL CHECK (
    length(snapshot_hash) = 64 AND snapshot_hash NOT GLOB '*[^0-9a-f]*'
  ),
  capability_revision TEXT NOT NULL,
  capability_snapshot_hash TEXT NOT NULL CHECK (
    length(capability_snapshot_hash) = 64
    AND capability_snapshot_hash NOT GLOB '*[^0-9a-f]*'
  ),
  capability_evidence_digest TEXT NOT NULL CHECK (
    length(capability_evidence_digest) = 64
    AND capability_evidence_digest NOT GLOB '*[^0-9a-f]*'
  ),
  capability_semantic_fields_digest TEXT NOT NULL CHECK (
    length(capability_semantic_fields_digest) = 64
    AND capability_semantic_fields_digest NOT GLOB '*[^0-9a-f]*'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  UNIQUE (operation_id, answer_root_id),
  UNIQUE (operation_id, answer_root_id, snapshot_hash),
  FOREIGN KEY (answer_root_id) REFERENCES message_v2(message_id) ON DELETE CASCADE,
  FOREIGN KEY (operation_id, answer_root_id)
    REFERENCES generation_operation_v2(operation_id, result_answer_root_id)
    DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (
    capability_snapshot_hash, capability_revision,
    capability_evidence_digest, capability_semantic_fields_digest
  ) REFERENCES runtime_capability_snapshot_v2(
    capability_snapshot_hash, capability_revision, evidence_digest, semantic_fields_digest
  ) ON DELETE RESTRICT
);

CREATE TRIGGER IF NOT EXISTS trg_assistant_generation_snapshot_v2_validate_answer
AFTER INSERT ON assistant_generation_snapshot_v2
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2 AS answer
    WHERE answer.message_id = NEW.answer_root_id
      AND answer.role = 'assistant'
      AND answer.answer_root_id = answer.message_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_SNAPSHOT_ANSWER_INVALID') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM runtime_capability_snapshot_v2 AS capability
    WHERE capability.capability_snapshot_hash = NEW.capability_snapshot_hash
      AND capability.capability_revision = NEW.capability_revision
      AND capability.evidence_digest = NEW.capability_evidence_digest
      AND capability.semantic_fields_digest = NEW.capability_semantic_fields_digest
      AND json_extract(capability.canonical_json, '$.binding') IS NOT NULL
      AND json_extract(NEW.canonical_json, '$.providerBinding') IS NOT NULL
      AND json(json_extract(capability.canonical_json, '$.binding')) =
        json(json_extract(NEW.canonical_json, '$.providerBinding'))
  ) THEN RAISE(ABORT, 'GENERATION_V2_SNAPSHOT_CAPABILITY_BINDING_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_assistant_generation_snapshot_v2_immutable
BEFORE UPDATE ON assistant_generation_snapshot_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_SNAPSHOT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_operation_v2_validate_graph
AFTER INSERT ON generation_operation_v2
BEGIN
  SELECT CASE WHEN NEW.state <> 'committed'
    THEN RAISE(ABORT, 'GENERATION_V2_OPERATION_INITIAL_STATE_INVALID') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2 AS question
    WHERE question.message_id = NEW.question_id
      AND question.conversation_id = NEW.conversation_id
      AND question.role = 'user'
  ) THEN RAISE(ABORT, 'GENERATION_V2_OPERATION_QUESTION_INVALID') END;
  SELECT CASE WHEN NEW.target_answer_root_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM message_v2 AS target
    WHERE target.message_id = NEW.target_answer_root_id
      AND target.conversation_id = NEW.conversation_id
      AND target.role = 'assistant'
      AND target.answer_root_id = target.message_id
      AND target.question_id = NEW.question_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_OPERATION_TARGET_INVALID') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM message_v2 AS result
    WHERE result.message_id = NEW.result_answer_root_id
      AND result.conversation_id = NEW.conversation_id
      AND result.role = 'assistant'
      AND result.answer_root_id = result.message_id
      AND result.question_id = NEW.question_id
  ) THEN RAISE(ABORT, 'GENERATION_V2_OPERATION_RESULT_INVALID') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_operation_v2_structure_immutable
BEFORE UPDATE OF operation_id, action_kind, command_fingerprint, branch_id, conversation_id,
  question_id, target_answer_root_id, result_answer_root_id, created_at_ms
ON generation_operation_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_OPERATION_STRUCTURE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_operation_v2_state_transition
BEFORE UPDATE OF state ON generation_operation_v2
WHEN NOT (
  OLD.state = NEW.state
  OR (OLD.state = 'committed' AND NEW.state IN ('streaming', 'failed', 'cancelled'))
  OR (OLD.state = 'streaming' AND NEW.state IN ('completed', 'failed', 'cancelled'))
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_OPERATION_STATE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_operation_v2_terminal_once
BEFORE UPDATE ON generation_operation_v2
WHEN OLD.state IN ('completed', 'failed', 'cancelled') AND (
  NEW.state IS NOT OLD.state OR NEW.error_code IS NOT OLD.error_code
  OR NEW.error_message IS NOT OLD.error_message
  OR NEW.updated_at_ms IS NOT OLD.updated_at_ms
  OR NEW.terminal_at_ms IS NOT OLD.terminal_at_ms
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_OPERATION_TERMINAL_CONFLICT');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_operation_v2_terminal_requests
BEFORE UPDATE OF state ON generation_operation_v2
WHEN NEW.state IN ('completed', 'failed', 'cancelled') AND EXISTS (
  SELECT 1 FROM generation_request_v2 AS request
  WHERE request.operation_id = OLD.operation_id
    AND request.state IN ('prepared', 'streaming')
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_OPERATION_REQUEST_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_operation_v2_streaming_request
BEFORE UPDATE OF state ON generation_operation_v2
WHEN OLD.state = 'committed' AND NEW.state = 'streaming' AND NOT EXISTS (
  SELECT 1 FROM generation_request_v2 AS request
  WHERE request.operation_id = OLD.operation_id
    AND request.state = 'streaming'
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_OPERATION_STREAMING_REQUEST_REQUIRED');
END;

CREATE TABLE IF NOT EXISTS generation_request_v2 (
  operation_id TEXT NOT NULL,
  request_sequence INTEGER NOT NULL CHECK (
    request_sequence BETWEEN 1 AND 9007199254740991
  ),
  answer_root_id TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL CHECK (
    length(snapshot_hash) = 64 AND snapshot_hash NOT GLOB '*[^0-9a-f]*'
  ),
  provider_id TEXT NOT NULL CHECK (length(provider_id) BETWEEN 1 AND 512),
  endpoint_profile_id TEXT NOT NULL CHECK (length(endpoint_profile_id) BETWEEN 1 AND 512),
  credential_scope_id TEXT NOT NULL CHECK (length(credential_scope_id) BETWEEN 1 AND 512),
  contract_id TEXT NOT NULL CHECK (length(contract_id) BETWEEN 1 AND 512),
  model_id TEXT NOT NULL CHECK (length(model_id) BETWEEN 1 AND 4096),
  effective_endpoint_id TEXT NOT NULL CHECK (length(effective_endpoint_id) BETWEEN 1 AND 4096),
  capability_revision TEXT NOT NULL CHECK (length(capability_revision) BETWEEN 1 AND 512),
  compiler_ledger_json TEXT NOT NULL CHECK (
    length(CAST(compiler_ledger_json AS BLOB)) BETWEEN 2 AND 1048576
    AND json_valid(compiler_ledger_json)
    AND json_type(compiler_ledger_json) = 'array'
  ),
  compiler_ledger_hash TEXT NOT NULL CHECK (
    length(compiler_ledger_hash) = 64 AND compiler_ledger_hash NOT GLOB '*[^0-9a-f]*'
  ),
  prepared_body_sha256 TEXT NOT NULL CHECK (
    length(prepared_body_sha256) = 64 AND prepared_body_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  prepared_body_byte_length INTEGER NOT NULL CHECK (
    prepared_body_byte_length BETWEEN 2 AND 20971520
  ),
  state TEXT NOT NULL CHECK (state IN ('prepared', 'streaming', 'completed', 'failed', 'cancelled')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  terminal_at_ms INTEGER CHECK (terminal_at_ms IS NULL OR terminal_at_ms >= created_at_ms),
  PRIMARY KEY (operation_id, request_sequence),
  UNIQUE (operation_id, request_sequence, answer_root_id),
  FOREIGN KEY (operation_id, answer_root_id, snapshot_hash)
    REFERENCES assistant_generation_snapshot_v2(operation_id, answer_root_id, snapshot_hash)
    ON DELETE CASCADE,
  CHECK (
    (state IN ('prepared', 'streaming') AND terminal_at_ms IS NULL)
    OR (state IN ('completed', 'failed', 'cancelled') AND terminal_at_ms IS NOT NULL)
  )
);

CREATE TRIGGER IF NOT EXISTS trg_generation_request_v2_validate_operation
AFTER INSERT ON generation_request_v2
BEGIN
  SELECT CASE WHEN NEW.state <> 'prepared'
    THEN RAISE(ABORT, 'GENERATION_V2_REQUEST_INITIAL_STATE_INVALID') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM generation_operation_v2 AS operation
    WHERE operation.operation_id = NEW.operation_id
      AND operation.state IN ('committed', 'streaming')
  ) THEN RAISE(ABORT, 'GENERATION_V2_REQUEST_OPERATION_TERMINAL') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_request_v2_structure_immutable
BEFORE UPDATE OF operation_id, request_sequence, answer_root_id, snapshot_hash, provider_id,
  endpoint_profile_id, credential_scope_id, contract_id, model_id, effective_endpoint_id,
  capability_revision, compiler_ledger_json, compiler_ledger_hash, prepared_body_sha256,
  prepared_body_byte_length, created_at_ms
ON generation_request_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_REQUEST_STRUCTURE_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_request_v2_state_transition
BEFORE UPDATE OF state ON generation_request_v2
WHEN NOT (
  OLD.state = NEW.state
  OR (OLD.state = 'prepared' AND NEW.state IN ('streaming', 'failed', 'cancelled'))
  OR (OLD.state = 'streaming' AND NEW.state IN ('completed', 'failed', 'cancelled'))
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_REQUEST_STATE_INVALID');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_request_v2_terminal_once
BEFORE UPDATE ON generation_request_v2
WHEN OLD.state IN ('completed', 'failed', 'cancelled') AND (
  NEW.state IS NOT OLD.state OR NEW.updated_at_ms IS NOT OLD.updated_at_ms
  OR NEW.terminal_at_ms IS NOT OLD.terminal_at_ms
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_REQUEST_TERMINAL_CONFLICT');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_request_v2_reject_direct_delete
BEFORE DELETE ON generation_request_v2
WHEN EXISTS (
  SELECT 1 FROM generation_operation_v2
  WHERE operation_id = OLD.operation_id
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_REQUEST_DELETE_FORBIDDEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_request_v2_terminal_attempt
BEFORE UPDATE OF state ON generation_request_v2
WHEN NEW.state IN ('completed', 'failed', 'cancelled') AND EXISTS (
  SELECT 1 FROM generation_attempt_v2 AS attempt
  WHERE attempt.operation_id = OLD.operation_id
    AND attempt.request_sequence = OLD.request_sequence
    AND attempt.state = 'open'
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_REQUEST_ATTEMPT_OPEN');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_request_v2_completed_operation
BEFORE UPDATE OF state ON generation_request_v2
WHEN OLD.state = 'streaming' AND NEW.state = 'completed' AND NOT EXISTS (
  SELECT 1 FROM generation_operation_v2 AS operation
  WHERE operation.operation_id = OLD.operation_id
    AND operation.state = 'streaming'
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_REQUEST_OPERATION_NOT_STREAMING');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_request_v2_streaming_attempt
BEFORE UPDATE OF state ON generation_request_v2
WHEN OLD.state = 'prepared' AND NEW.state = 'streaming' AND NOT EXISTS (
  SELECT 1 FROM generation_attempt_v2 AS attempt
  WHERE attempt.operation_id = OLD.operation_id
    AND attempt.request_sequence = OLD.request_sequence
    AND attempt.state = 'open'
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_REQUEST_STREAMING_ATTEMPT_REQUIRED');
END;

CREATE TABLE IF NOT EXISTS generation_attempt_v2 (
  operation_id TEXT NOT NULL,
  request_sequence INTEGER NOT NULL,
  attempt INTEGER NOT NULL CHECK (attempt = 1),
  state TEXT NOT NULL CHECK (state IN ('open', 'terminal')),
  outcome_json TEXT,
  terminal_fingerprint TEXT,
  started_at_ms INTEGER NOT NULL CHECK (started_at_ms >= 0),
  terminal_at_ms INTEGER CHECK (terminal_at_ms IS NULL OR terminal_at_ms >= started_at_ms),
  PRIMARY KEY (operation_id, request_sequence, attempt),
  FOREIGN KEY (operation_id, request_sequence)
    REFERENCES generation_request_v2(operation_id, request_sequence) ON DELETE CASCADE,
  CHECK (
    (state = 'open' AND outcome_json IS NULL AND terminal_fingerprint IS NULL
      AND terminal_at_ms IS NULL)
    OR (state = 'terminal' AND outcome_json IS NOT NULL
      AND length(CAST(outcome_json AS BLOB)) BETWEEN 2 AND 1048576
      AND json_valid(outcome_json) AND json_type(outcome_json) = 'object'
      AND terminal_fingerprint IS NOT NULL
      AND length(terminal_fingerprint) = 64
      AND terminal_fingerprint NOT GLOB '*[^0-9a-f]*'
      AND terminal_at_ms IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_generation_attempt_v2_open_request
  ON generation_attempt_v2(operation_id, request_sequence)
  WHERE state = 'open';

CREATE TRIGGER IF NOT EXISTS trg_generation_attempt_v2_validate_request
AFTER INSERT ON generation_attempt_v2
BEGIN
  SELECT CASE WHEN NEW.state <> 'open'
    THEN RAISE(ABORT, 'GENERATION_V2_ATTEMPT_INITIAL_STATE_INVALID') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM generation_request_v2 AS request
    WHERE request.operation_id = NEW.operation_id
      AND request.request_sequence = NEW.request_sequence
      AND request.state IN ('prepared', 'streaming')
  ) THEN RAISE(ABORT, 'GENERATION_V2_ATTEMPT_REQUEST_TERMINAL') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_attempt_v2_key_immutable
BEFORE UPDATE OF operation_id, request_sequence, attempt, started_at_ms
ON generation_attempt_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ATTEMPT_KEY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_attempt_v2_terminal_once
BEFORE UPDATE ON generation_attempt_v2
WHEN OLD.state = 'terminal' AND (
  NEW.state <> OLD.state OR NEW.outcome_json <> OLD.outcome_json
  OR NEW.terminal_fingerprint <> OLD.terminal_fingerprint
  OR NEW.terminal_at_ms <> OLD.terminal_at_ms
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ATTEMPT_TERMINAL_CONFLICT');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_attempt_v2_reject_direct_delete
BEFORE DELETE ON generation_attempt_v2
WHEN EXISTS (
  SELECT 1 FROM generation_request_v2
  WHERE operation_id = OLD.operation_id
    AND request_sequence = OLD.request_sequence
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_ATTEMPT_DELETE_FORBIDDEN');
END;

CREATE TABLE IF NOT EXISTS generation_native_artifact_v2 (
  answer_root_id TEXT NOT NULL,
  request_sequence INTEGER NOT NULL CHECK (
    request_sequence BETWEEN 1 AND 9007199254740991
  ),
  operation_id TEXT NOT NULL,
  artifact_kind TEXT NOT NULL CHECK (length(artifact_kind) BETWEEN 1 AND 512),
  codec_version INTEGER NOT NULL CHECK (codec_version BETWEEN 1 AND 2147483647),
  artifact_json TEXT NOT NULL CHECK (
    length(CAST(artifact_json AS BLOB)) BETWEEN 2 AND 20971520
    AND json_valid(artifact_json)
    AND json_type(artifact_json) = 'object'
  ),
  artifact_hash TEXT NOT NULL CHECK (
    length(artifact_hash) = 64 AND artifact_hash NOT GLOB '*[^0-9a-f]*'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (answer_root_id, request_sequence, artifact_kind),
  FOREIGN KEY (operation_id, request_sequence, answer_root_id)
    REFERENCES generation_request_v2(operation_id, request_sequence, answer_root_id)
    ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS trg_generation_native_artifact_v2_validate_envelope
AFTER INSERT ON generation_native_artifact_v2
BEGIN
  SELECT CASE WHEN json_type(NEW.artifact_json, '$.artifactKind') <> 'text'
    OR json_extract(NEW.artifact_json, '$.artifactKind') <> NEW.artifact_kind
    OR json_type(NEW.artifact_json, '$.artifactCodecVersion') <> 'integer'
    OR json_extract(NEW.artifact_json, '$.artifactCodecVersion') <> NEW.codec_version
    OR json_type(NEW.artifact_json, '$.artifactHash') <> 'text'
    OR json_extract(NEW.artifact_json, '$.artifactHash') <> NEW.artifact_hash
    THEN RAISE(ABORT, 'GENERATION_V2_NATIVE_ARTIFACT_ENVELOPE_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM generation_request_v2 AS request
    JOIN generation_operation_v2 AS operation ON operation.operation_id=request.operation_id
    JOIN message_v2 AS answer ON answer.message_id=request.answer_root_id
    WHERE request.operation_id=NEW.operation_id
      AND request.request_sequence=NEW.request_sequence
      AND request.answer_root_id=NEW.answer_root_id
      AND request.state='completed' AND operation.state='completed'
      AND answer.status='completed'
  ) THEN RAISE(ABORT, 'GENERATION_V2_NATIVE_ARTIFACT_TERMINAL_STATE_REQUIRED') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_native_artifact_v2_immutable
BEFORE UPDATE ON generation_native_artifact_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_NATIVE_ARTIFACT_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_generation_native_artifact_v2_reject_direct_delete
BEFORE DELETE ON generation_native_artifact_v2
WHEN EXISTS (
  SELECT 1 FROM generation_request_v2
  WHERE operation_id = OLD.operation_id
    AND request_sequence = OLD.request_sequence
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_NATIVE_ARTIFACT_DELETE_FORBIDDEN');
END;
