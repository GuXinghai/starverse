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
