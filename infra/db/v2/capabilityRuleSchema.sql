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
