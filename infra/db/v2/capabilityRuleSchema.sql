-- Generation Compiler V2 capability-rule packs and scoped identity selectors.

CREATE TABLE IF NOT EXISTS capability_rule_pack_v2 (
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('built_in', 'user')),
  pack_id TEXT NOT NULL CHECK (
    length(pack_id) BETWEEN 1 AND 256
    AND pack_id NOT GLOB '*[^A-Za-z0-9._:/-]*'
  ),
  owner_id TEXT NOT NULL CHECK (
    length(owner_id) BETWEEN 1 AND 256
    AND owner_id NOT GLOB '*[^A-Za-z0-9._:/-]*'
  ),
  pack_version INTEGER NOT NULL CHECK (pack_version BETWEEN 1 AND 9007199254740991),
  pack_revision TEXT NOT NULL CHECK (
    length(pack_revision) = 88
    AND pack_revision GLOB 'capability-rule-pack-v2:*'
  ),
  content_digest TEXT NOT NULL CHECK (
    length(content_digest) = 64 AND content_digest NOT GLOB '*[^0-9a-f]*'
  ),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  installed_at_ms INTEGER NOT NULL CHECK (installed_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= installed_at_ms),
  PRIMARY KEY (owner_kind, pack_id),
  UNIQUE (owner_kind, pack_id, pack_revision),
  UNIQUE (owner_kind, pack_id, content_digest)
);

CREATE TABLE IF NOT EXISTS capability_rule_v2 (
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('built_in', 'user')),
  pack_id TEXT NOT NULL,
  rule_id TEXT NOT NULL CHECK (
    length(rule_id) BETWEEN 1 AND 256
    AND rule_id NOT GLOB '*[^A-Za-z0-9._:/-]*'
  ),
  provider_id TEXT NOT NULL CHECK (
    length(provider_id) BETWEEN 1 AND 512
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
  semantic_path TEXT NOT NULL CHECK (length(semantic_path) BETWEEN 1 AND 256),
  capability_state TEXT NOT NULL CHECK (
    capability_state IN ('supported', 'unsupported', 'requires_confirmation', 'unknown')
  ),
  domain_json TEXT CHECK (domain_json IS NULL OR json_valid(domain_json)),
  constraints_json TEXT NOT NULL CHECK (json_valid(constraints_json)),
  default_value_json TEXT CHECK (default_value_json IS NULL OR json_valid(default_value_json)),
  priority INTEGER NOT NULL CHECK (priority BETWEEN -1000000 AND 1000000),
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  evidence_source_ref TEXT NOT NULL CHECK (
    length(evidence_source_ref) BETWEEN 1 AND 256
    AND evidence_source_ref NOT GLOB '*[^A-Za-z0-9._:/-]*'
  ),
  evidence_kind TEXT NOT NULL CHECK (
    evidence_kind IN ('explicit_provider', 'explicit_provider_series', 'derived_empirical')
  ),
  evidence_note TEXT NOT NULL CHECK (length(evidence_note) BETWEEN 1 AND 2048),
  identity_evidence_kind TEXT NOT NULL CHECK (
    identity_evidence_kind IN ('provider_archive', 'official_exact_model_doc', 'derived_selector')
  ),
  identity_evidence_source_ref TEXT NOT NULL CHECK (
    length(identity_evidence_source_ref) BETWEEN 1 AND 256
    AND identity_evidence_source_ref NOT GLOB '*[^A-Za-z0-9._:/-]*'
  ),
  provenance_url TEXT CHECK (
    provenance_url IS NULL OR (
      length(provenance_url) BETWEEN 8 AND 2048
      AND provenance_url GLOB 'https://*'
    )
  ),
  verified_at TEXT NOT NULL CHECK (
    length(verified_at) = 24
    AND verified_at GLOB '????-??-??T??:??:??.???Z'
  ),
  content_digest TEXT NOT NULL CHECK (
    length(content_digest) = 64 AND content_digest NOT GLOB '*[^0-9a-f]*'
  ),
  rule_revision TEXT NOT NULL CHECK (
    length(rule_revision) = 83
    AND rule_revision GLOB 'capability-rule-v2:*'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  PRIMARY KEY (owner_kind, pack_id, rule_id),
  UNIQUE (owner_kind, pack_id, rule_revision),
  FOREIGN KEY (owner_kind, pack_id)
    REFERENCES capability_rule_pack_v2(owner_kind, pack_id)
    ON UPDATE RESTRICT ON DELETE CASCADE,
  CHECK (
    (capability_state IN ('unsupported', 'unknown') AND domain_json IS NULL AND default_value_json IS NULL)
    OR capability_state IN ('supported', 'requires_confirmation')
  ),
  CHECK (
    (selector_kind = 'exact' AND selector_values_json IS NOT NULL AND selector_pattern IS NULL
      AND selector_positive_examples_json IS NULL AND selector_negative_examples_json IS NULL)
    OR
    (selector_kind = 'regex' AND selector_values_json IS NULL AND selector_pattern IS NOT NULL
      AND selector_positive_examples_json IS NOT NULL AND selector_negative_examples_json IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS capability_rule_model_selector_lookup_v2
  ON capability_rule_v2(provider_id, endpoint_profile_id, selector_kind, enabled, priority DESC);

CREATE TRIGGER IF NOT EXISTS capability_rule_builtin_pack_owner_immutable_v2
BEFORE UPDATE OF owner_kind, pack_id, owner_id ON capability_rule_pack_v2
BEGIN
  SELECT RAISE(ABORT, 'CAPABILITY_RULE_PACK_IDENTITY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS capability_rule_identity_immutable_v2
BEFORE UPDATE OF owner_kind, pack_id, rule_id, provider_id, endpoint_profile_id, selector_kind,
  selector_values_json, selector_pattern, semantic_path
ON capability_rule_v2
BEGIN
  SELECT RAISE(ABORT, 'CAPABILITY_RULE_IDENTITY_IMMUTABLE');
END;

-- Owner-frozen shared Cloud/User Pack and Rule core. These tables are intentionally
-- not read by the Goal 2C runtime authority; the Slice 3.5 cutover will make their
-- revision-bound materialized output authoritative and remove the tables above.

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
