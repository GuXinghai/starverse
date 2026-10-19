-- Generation Compiler V2 owner-frozen shared Cloud/User capability-rule core.

-- These tables are the shared authority input for revision-bound materialization.

CREATE TABLE IF NOT EXISTS capability_rule_owner_snapshot_v1 (
  ownership TEXT NOT NULL CHECK (ownership IN ('cloud', 'user')),
  owner_id TEXT NOT NULL CHECK (
    length(owner_id) BETWEEN 1 AND 256
    AND owner_id NOT GLOB '*[^A-Za-z0-9._:/-]*'
  ),
  snapshot_revision TEXT NOT NULL CHECK (
    length(snapshot_revision) BETWEEN 65 AND 128
    AND snapshot_revision GLOB 'capability-rule-owner-snapshot-v1:*'
  ),
  content_digest TEXT NOT NULL CHECK (
    length(content_digest) = 64 AND content_digest NOT GLOB '*[^0-9a-f]*'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  PRIMARY KEY (ownership, owner_id),
  UNIQUE (snapshot_revision),
  UNIQUE (ownership, owner_id, content_digest)
);

CREATE TABLE IF NOT EXISTS capability_rule_pack_core_v1 (
  ownership TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  pack_id TEXT NOT NULL CHECK (
    length(pack_id) BETWEEN 1 AND 256
    AND pack_id NOT GLOB '*[^A-Za-z0-9._:/-]*'
  ),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 256),
  description TEXT CHECK (description IS NULL OR length(description) BETWEEN 1 AND 4096),
  priority INTEGER NOT NULL CHECK (priority BETWEEN -1000000 AND 1000000),
  mode TEXT NOT NULL CHECK (mode IN ('override', 'default_only', 'no_control')),
  target TEXT NOT NULL CHECK (target IN ('enabled', 'disabled')),
  pack_revision TEXT NOT NULL CHECK (
    length(pack_revision) BETWEEN 65 AND 128
    AND pack_revision GLOB 'capability-rule-pack-core-v1:*'
  ),
  content_digest TEXT NOT NULL CHECK (
    length(content_digest) = 64 AND content_digest NOT GLOB '*[^0-9a-f]*'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  PRIMARY KEY (ownership, owner_id, pack_id),
  UNIQUE (ownership, owner_id, pack_revision),
  FOREIGN KEY (ownership, owner_id)
    REFERENCES capability_rule_owner_snapshot_v1(ownership, owner_id)
    ON UPDATE RESTRICT ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS capability_rule_core_v1 (
  ownership TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  rule_id TEXT NOT NULL CHECK (
    length(rule_id) BETWEEN 1 AND 256
    AND rule_id NOT GLOB '*[^A-Za-z0-9._:/-]*'
  ),
  pack_id TEXT NOT NULL,
  label TEXT CHECK (label IS NULL OR length(label) BETWEEN 1 AND 256),
  description TEXT CHECK (description IS NULL OR length(description) BETWEEN 1 AND 4096),
  priority INTEGER NOT NULL CHECK (priority BETWEEN -1000000 AND 1000000),
  configured TEXT NOT NULL CHECK (configured IN ('default', 'on', 'off')),
  provider_authority_id TEXT NOT NULL CHECK (
    length(provider_authority_id) BETWEEN 1 AND 256
    AND provider_authority_id NOT GLOB '*[^A-Za-z0-9._:/-]*'
  ),
  endpoint_profile_id TEXT NOT NULL CHECK (length(endpoint_profile_id) BETWEEN 1 AND 512),
  selector_kind TEXT NOT NULL CHECK (selector_kind IN ('exact', 'regex')),
  selector_values_json TEXT CHECK (
    selector_values_json IS NULL OR (
      json_valid(selector_values_json)
      AND json_type(selector_values_json) = 'array'
      AND json_array_length(selector_values_json) BETWEEN 1 AND 256
    )
  ),
  selector_pattern TEXT CHECK (selector_pattern IS NULL OR length(selector_pattern) BETWEEN 3 AND 256),
  selector_positive_examples_json TEXT CHECK (
    selector_positive_examples_json IS NULL OR json_valid(selector_positive_examples_json)
  ),
  selector_negative_examples_json TEXT CHECK (
    selector_negative_examples_json IS NULL OR json_valid(selector_negative_examples_json)
  ),
  canonical_path TEXT NOT NULL CHECK (length(canonical_path) BETWEEN 1 AND 256),
  canonical_value_json TEXT NOT NULL CHECK (json_valid(canonical_value_json)),
  evidence_json TEXT CHECK (evidence_json IS NULL OR json_valid(evidence_json)),
  rule_revision TEXT NOT NULL CHECK (
    length(rule_revision) BETWEEN 65 AND 128
    AND rule_revision GLOB 'capability-rule-core-v1:*'
  ),
  content_digest TEXT NOT NULL CHECK (
    length(content_digest) = 64 AND content_digest NOT GLOB '*[^0-9a-f]*'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  PRIMARY KEY (ownership, owner_id, rule_id),
  UNIQUE (ownership, owner_id, rule_revision),
  FOREIGN KEY (ownership, owner_id, pack_id)
    REFERENCES capability_rule_pack_core_v1(ownership, owner_id, pack_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CHECK (
    (selector_kind = 'exact' AND selector_values_json IS NOT NULL AND selector_pattern IS NULL
      AND selector_positive_examples_json IS NULL AND selector_negative_examples_json IS NULL)
    OR
    (selector_kind = 'regex' AND selector_values_json IS NULL AND selector_pattern IS NOT NULL
      AND selector_positive_examples_json IS NOT NULL AND selector_negative_examples_json IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS capability_rule_pack_core_priority_v1
  ON capability_rule_pack_core_v1(ownership, owner_id, priority DESC, updated_at_ms DESC, pack_id);

CREATE INDEX IF NOT EXISTS capability_rule_core_subject_v1
  ON capability_rule_core_v1(
    provider_authority_id, endpoint_profile_id, selector_kind,
    ownership, owner_id, priority DESC, rule_id
  );

CREATE INDEX IF NOT EXISTS capability_rule_core_pack_v1
  ON capability_rule_core_v1(ownership, owner_id, pack_id, priority DESC, updated_at_ms DESC, rule_id);

CREATE TRIGGER IF NOT EXISTS capability_rule_owner_snapshot_identity_immutable_v1
BEFORE UPDATE OF ownership, owner_id ON capability_rule_owner_snapshot_v1
BEGIN
  SELECT RAISE(ABORT, 'CAPABILITY_RULE_OWNER_SNAPSHOT_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS capability_rule_pack_core_identity_immutable_v1
BEFORE UPDATE OF ownership, owner_id, pack_id ON capability_rule_pack_core_v1
BEGIN
  SELECT RAISE(ABORT, 'CAPABILITY_RULE_PACK_CORE_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS capability_rule_core_identity_immutable_v1
BEFORE UPDATE OF ownership, owner_id, rule_id ON capability_rule_core_v1
BEGIN
  SELECT RAISE(ABORT, 'CAPABILITY_RULE_CORE_IDENTITY_IMMUTABLE');
END;

-- Fixed GuXinghai/starverse Cloud-managed Rules distribution state. This is
-- candidate acquisition state only; applying content into the shared Cloud
-- ownership snapshot is a later transaction boundary.
CREATE TABLE IF NOT EXISTS cloud_rules_distribution_state_v1 (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  state_revision INTEGER NOT NULL CHECK (state_revision >= 0),
  last_attempted_at_ms INTEGER CHECK (last_attempted_at_ms IS NULL OR last_attempted_at_ms >= 0),
  last_successful_check_at_ms INTEGER CHECK (
    last_successful_check_at_ms IS NULL OR last_successful_check_at_ms >= 0
  ),
  last_failure_code TEXT CHECK (
    last_failure_code IS NULL OR length(last_failure_code) BETWEEN 1 AND 128
  ),
  latest_release_version TEXT,
  latest_content_revision TEXT CHECK (
    latest_content_revision IS NULL OR (
      length(latest_content_revision) = 71
      AND latest_content_revision GLOB 'sha256:*'
      AND substr(latest_content_revision, 8) NOT GLOB '*[^0-9a-f]*'
    )
  ),
  latest_release_metadata_json TEXT CHECK (
    latest_release_metadata_json IS NULL OR (
      json_valid(latest_release_metadata_json)
      AND json_type(latest_release_metadata_json) = 'object'
    )
  ),
  candidate_record_revision TEXT CHECK (
    candidate_record_revision IS NULL OR (
      length(candidate_record_revision) = 89
      AND candidate_record_revision GLOB 'cloud-rules-candidate-v1:*'
      AND substr(candidate_record_revision, 26) NOT GLOB '*[^0-9a-f]*'
    )
  ),
  candidate_release_version TEXT,
  candidate_content_revision TEXT CHECK (
    candidate_content_revision IS NULL OR (
      length(candidate_content_revision) = 71
      AND candidate_content_revision GLOB 'sha256:*'
      AND substr(candidate_content_revision, 8) NOT GLOB '*[^0-9a-f]*'
    )
  ),
  candidate_release_metadata_json TEXT CHECK (
    candidate_release_metadata_json IS NULL OR (
      json_valid(candidate_release_metadata_json)
      AND json_type(candidate_release_metadata_json) = 'object'
    )
  ),
  candidate_document_json TEXT CHECK (
    candidate_document_json IS NULL OR (
      json_valid(candidate_document_json)
      AND json_type(candidate_document_json) = 'object'
    )
  ),
  candidate_document_sha256 TEXT CHECK (
    candidate_document_sha256 IS NULL OR (
      length(candidate_document_sha256) = 64
      AND candidate_document_sha256 NOT GLOB '*[^0-9a-f]*'
    )
  ),
  candidate_raw_asset_sha256 TEXT CHECK (
    candidate_raw_asset_sha256 IS NULL OR (
      length(candidate_raw_asset_sha256) = 64
      AND candidate_raw_asset_sha256 NOT GLOB '*[^0-9a-f]*'
    )
  ),
  candidate_fetched_at_ms INTEGER CHECK (
    candidate_fetched_at_ms IS NULL OR candidate_fetched_at_ms >= 0
  ),
  applied_content_revision TEXT CHECK (
    applied_content_revision IS NULL OR (
      length(applied_content_revision) = 71
      AND applied_content_revision GLOB 'sha256:*'
      AND substr(applied_content_revision, 8) NOT GLOB '*[^0-9a-f]*'
    )
  ),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  CHECK (
    (latest_release_version IS NULL AND latest_content_revision IS NULL
      AND latest_release_metadata_json IS NULL)
    OR
    (latest_release_version IS NOT NULL AND latest_content_revision IS NOT NULL
      AND latest_release_metadata_json IS NOT NULL)
  ),
  CHECK (
    (candidate_record_revision IS NULL AND candidate_release_version IS NULL
      AND candidate_content_revision IS NULL AND candidate_release_metadata_json IS NULL
      AND candidate_document_json IS NULL AND candidate_document_sha256 IS NULL
      AND candidate_raw_asset_sha256 IS NULL AND candidate_fetched_at_ms IS NULL)
    OR
    (candidate_record_revision IS NOT NULL AND candidate_release_version IS NOT NULL
      AND candidate_content_revision IS NOT NULL AND candidate_release_metadata_json IS NOT NULL
      AND candidate_document_json IS NOT NULL AND candidate_document_sha256 IS NOT NULL
      AND candidate_raw_asset_sha256 IS NOT NULL AND candidate_fetched_at_ms IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS cloud_rules_release_version_ledger_v1 (
  release_version TEXT PRIMARY KEY CHECK (length(release_version) BETWEEN 5 AND 64),
  content_revision TEXT NOT NULL CHECK (
    length(content_revision) = 71
    AND content_revision GLOB 'sha256:*'
    AND substr(content_revision, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  first_observed_at_ms INTEGER NOT NULL CHECK (first_observed_at_ms >= 0),
  last_observed_at_ms INTEGER NOT NULL CHECK (last_observed_at_ms >= first_observed_at_ms)
);

CREATE TRIGGER IF NOT EXISTS cloud_rules_release_version_binding_immutable_v1
BEFORE UPDATE OF release_version, content_revision ON cloud_rules_release_version_ledger_v1
BEGIN
  SELECT RAISE(ABORT, 'CLOUD_RULES_RELEASE_VERSION_BINDING_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS cloud_rules_release_version_ledger_permanent_v1
BEFORE DELETE ON cloud_rules_release_version_ledger_v1
BEGIN
  SELECT RAISE(ABORT, 'CLOUD_RULES_RELEASE_VERSION_LEDGER_PERMANENT');
END;

-- Slice 5 Cloud Apply persistence. The document stored here is the validated
-- remote baseline. Activation overrides are deliberately stored separately.
CREATE TABLE IF NOT EXISTS cloud_rules_apply_event_v1 (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_kind TEXT NOT NULL CHECK (event_kind IN ('apply', 'rollback')),
  release_version TEXT NOT NULL CHECK (length(release_version) BETWEEN 5 AND 64),
  content_revision TEXT NOT NULL CHECK (
    length(content_revision) = 71
    AND content_revision GLOB 'sha256:*'
    AND substr(content_revision, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  previous_content_revision TEXT CHECK (
    previous_content_revision IS NULL OR (
      length(previous_content_revision) = 71
      AND previous_content_revision GLOB 'sha256:*'
      AND substr(previous_content_revision, 8) NOT GLOB '*[^0-9a-f]*'
    )
  ),
  event_metadata_json TEXT NOT NULL CHECK (
    length(CAST(event_metadata_json AS BLOB)) BETWEEN 2 AND 65536
    AND json_valid(event_metadata_json)
    AND json_type(event_metadata_json) = 'object'
  ),
  occurred_at_ms INTEGER NOT NULL CHECK (occurred_at_ms >= 0),
  applied_record_revision INTEGER NOT NULL CHECK (applied_record_revision >= 1)
);

CREATE TABLE IF NOT EXISTS cloud_rules_applied_snapshot_v1 (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  applied_record_revision INTEGER NOT NULL CHECK (applied_record_revision >= 1),
  release_version TEXT NOT NULL CHECK (length(release_version) BETWEEN 5 AND 64),
  content_revision TEXT NOT NULL CHECK (
    length(content_revision) = 71
    AND content_revision GLOB 'sha256:*'
    AND substr(content_revision, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  release_metadata_json TEXT NOT NULL CHECK (
    length(CAST(release_metadata_json AS BLOB)) BETWEEN 2 AND 65536
    AND json_valid(release_metadata_json)
    AND json_type(release_metadata_json) = 'object'
  ),
  document_json TEXT NOT NULL CHECK (
    length(CAST(document_json AS BLOB)) BETWEEN 2 AND 16 * 1024 * 1024
    AND json_valid(document_json)
    AND json_type(document_json) = 'object'
  ),
  document_sha256 TEXT NOT NULL CHECK (
    length(document_sha256) = 64 AND document_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  raw_asset_sha256 TEXT NOT NULL CHECK (
    length(raw_asset_sha256) = 64 AND raw_asset_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  applied_at_ms INTEGER NOT NULL CHECK (applied_at_ms >= 0),
  applied_event_id INTEGER NOT NULL REFERENCES cloud_rules_apply_event_v1(event_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS cloud_rules_applied_history_v1 (
  history_id INTEGER PRIMARY KEY AUTOINCREMENT,
  applied_record_revision INTEGER NOT NULL UNIQUE CHECK (applied_record_revision >= 1),
  release_version TEXT NOT NULL CHECK (length(release_version) BETWEEN 5 AND 64),
  content_revision TEXT NOT NULL CHECK (
    length(content_revision) = 71
    AND content_revision GLOB 'sha256:*'
    AND substr(content_revision, 8) NOT GLOB '*[^0-9a-f]*'
  ),
  release_metadata_json TEXT NOT NULL CHECK (
    length(CAST(release_metadata_json AS BLOB)) BETWEEN 2 AND 65536
    AND json_valid(release_metadata_json)
    AND json_type(release_metadata_json) = 'object'
  ),
  document_json TEXT NOT NULL CHECK (
    length(CAST(document_json AS BLOB)) BETWEEN 2 AND 16 * 1024 * 1024
    AND json_valid(document_json)
    AND json_type(document_json) = 'object'
  ),
  document_sha256 TEXT NOT NULL CHECK (
    length(document_sha256) = 64 AND document_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  raw_asset_sha256 TEXT NOT NULL CHECK (
    length(raw_asset_sha256) = 64 AND raw_asset_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  applied_at_ms INTEGER NOT NULL CHECK (applied_at_ms >= 0),
  applied_event_id INTEGER NOT NULL REFERENCES cloud_rules_apply_event_v1(event_id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS cloud_rules_applied_history_order_v1
  ON cloud_rules_applied_history_v1(applied_record_revision DESC, history_id DESC);

CREATE TABLE IF NOT EXISTS cloud_rules_application_policy_v1 (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  policy_revision INTEGER NOT NULL CHECK (policy_revision >= 0),
  history_limit INTEGER NOT NULL CHECK (history_limit BETWEEN 0 AND 20),
  pinned_release_version TEXT,
  pinned_content_revision TEXT CHECK (
    pinned_content_revision IS NULL OR (
      length(pinned_content_revision) = 71
      AND pinned_content_revision GLOB 'sha256:*'
      AND substr(pinned_content_revision, 8) NOT GLOB '*[^0-9a-f]*'
    )
  ),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  CHECK ((pinned_release_version IS NULL AND pinned_content_revision IS NULL)
    OR (pinned_release_version IS NOT NULL AND pinned_content_revision IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS cloud_rules_activation_override_state_v1 (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  override_revision INTEGER NOT NULL CHECK (override_revision >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
);

CREATE TABLE IF NOT EXISTS cloud_rules_activation_override_v1 (
  identity_kind TEXT NOT NULL CHECK (identity_kind IN ('pack', 'rule')),
  identity_id TEXT NOT NULL CHECK (length(identity_id) BETWEEN 1 AND 256),
  field_name TEXT NOT NULL CHECK (field_name IN ('mode', 'target', 'configured')),
  field_value TEXT NOT NULL CHECK (
    field_value IN ('override', 'default_only', 'no_control', 'enabled', 'disabled', 'default', 'on', 'off')
  ),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  PRIMARY KEY (identity_kind, identity_id, field_name),
  CHECK ((identity_kind = 'pack' AND field_name IN ('mode', 'target'))
    OR (identity_kind = 'rule' AND field_name = 'configured'))
);

CREATE INDEX IF NOT EXISTS cloud_rules_activation_override_identity_v1
  ON cloud_rules_activation_override_v1(identity_kind, identity_id);

-- Slice 6 User Rules durable tab-scoped editing session. The draft contains a
-- complete shared User ownership snapshot and remains outside committed authority
-- until one batch Save transaction installs it.
CREATE TABLE IF NOT EXISTS user_capability_rule_editing_session_v1 (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  session_id TEXT NOT NULL CHECK (length(session_id) BETWEEN 1 AND 256),
  owner_id TEXT NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 256),
  base_snapshot_revision TEXT,
  base_content_digest TEXT NOT NULL CHECK (length(base_content_digest) = 64
    AND base_content_digest NOT GLOB '*[^0-9a-f]*'),
  draft_revision INTEGER NOT NULL CHECK (draft_revision >= 1),
  draft_snapshot_revision TEXT NOT NULL CHECK (length(draft_snapshot_revision) BETWEEN 1 AND 256),
  draft_content_digest TEXT NOT NULL CHECK (length(draft_content_digest) = 64
    AND draft_content_digest NOT GLOB '*[^0-9a-f]*'),
  draft_snapshot_json TEXT NOT NULL CHECK (
    length(CAST(draft_snapshot_json AS BLOB)) BETWEEN 2 AND 16 * 1024 * 1024
    AND json_valid(draft_snapshot_json)
    AND json_type(draft_snapshot_json) = 'object'
  ),
  draft_notes_json TEXT NOT NULL CHECK (
    length(CAST(draft_notes_json AS BLOB)) BETWEEN 2 AND 4 * 1024 * 1024
    AND json_valid(draft_notes_json)
    AND json_type(draft_notes_json) = 'array'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms)
);

CREATE TABLE IF NOT EXISTS user_capability_rule_note_v1 (
  owner_id TEXT NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 256),
  rule_id TEXT NOT NULL CHECK (length(rule_id) BETWEEN 1 AND 256),
  note TEXT NOT NULL CHECK (length(note) BETWEEN 1 AND 16384),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  PRIMARY KEY (owner_id, rule_id)
);

CREATE TABLE IF NOT EXISTS user_capability_rule_note_state_v1 (
  owner_id TEXT PRIMARY KEY CHECK (length(owner_id) BETWEEN 1 AND 256),
  note_revision INTEGER NOT NULL CHECK (note_revision >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
);
