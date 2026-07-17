-- Generation Compiler V2 immutable tool registry. Epoch-2 starverse.db only.
CREATE TABLE IF NOT EXISTS tool_registry_revision_v2 (
  registry_revision TEXT PRIMARY KEY CHECK (length(registry_revision) BETWEEN 1 AND 512),
  definitions_digest TEXT NOT NULL UNIQUE CHECK (
    length(definitions_digest) = 64 AND definitions_digest NOT GLOB '*[^0-9a-f]*'
  ),
  definitions_json TEXT NOT NULL CHECK (
    length(CAST(definitions_json AS BLOB)) BETWEEN 2 AND 1048576
    AND json_valid(definitions_json) AND json_type(definitions_json) = 'object'
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0)
);

CREATE TRIGGER IF NOT EXISTS trg_tool_registry_revision_v2_immutable
BEFORE UPDATE ON tool_registry_revision_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_TOOL_REGISTRY_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_tool_registry_revision_v2_referenced_delete
BEFORE DELETE ON tool_registry_revision_v2
WHEN EXISTS (
  SELECT 1 FROM assistant_generation_snapshot_v2 AS snapshot
  WHERE json_extract(snapshot.snapshot_json, '$.toolAuthority.kind') = 'registry'
    AND json_extract(snapshot.snapshot_json, '$.toolAuthority.toolRegistryRevision') = OLD.registry_revision
)
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_TOOL_REGISTRY_REFERENCED');
END;

CREATE TABLE IF NOT EXISTS tool_registry_head_v2 (
  singleton_id TEXT PRIMARY KEY CHECK (singleton_id = 'current'),
  registry_revision TEXT NOT NULL REFERENCES tool_registry_revision_v2(registry_revision),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0)
);

CREATE TRIGGER IF NOT EXISTS trg_tool_registry_head_v2_key_immutable
BEFORE UPDATE OF singleton_id ON tool_registry_head_v2
BEGIN
  SELECT RAISE(ABORT, 'GENERATION_V2_TOOL_REGISTRY_HEAD_KEY_IMMUTABLE');
END;
