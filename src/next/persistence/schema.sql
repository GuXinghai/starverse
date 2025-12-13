-- Next pipeline persistence schema (Gate 3→4)
-- Stores serialized reducer snapshots; persistence does not infer business semantics.

CREATE TABLE IF NOT EXISTS next_session_snapshots (
  session_id TEXT PRIMARY KEY,
  snapshot_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  updated_at_ms INTEGER NOT NULL
);

