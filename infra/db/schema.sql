-- ========================================================================
-- Starverse Database Schema (Baseline)
-- ========================================================================
-- IMPORTANT: This file contains ONLY table definitions.
-- ALL indexes are created by ensure* functions in worker.ts at runtime.
-- This ensures consistent initialization order and avoids column-missing errors.
-- ========================================================================

PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA mmap_size=268435456;
PRAGMA cache_size=-20000;
PRAGMA temp_store=MEMORY;

-- ========== Core Tables ==========

CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  meta TEXT,
  is_system INTEGER DEFAULT 0,
  system_key TEXT
);

CREATE TABLE IF NOT EXISTS convo (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES project(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS tag (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS convo_tag (
  convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE CASCADE,
  tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
  PRIMARY KEY (convo_id, tag_id)
);

CREATE TABLE IF NOT EXISTS message (
  id TEXT PRIMARY KEY,
  convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system', 'notice', 'openrouter')),
  created_at INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  parent_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'final' CHECK (status IN ('streaming', 'final', 'error')),
  answer_root_id TEXT NULL,
  question_id TEXT NULL,
  meta TEXT,
  reasoning_details_final_json TEXT,
  request_reasoning_config_json TEXT,
  reasoning_segments_count INTEGER DEFAULT 0,
  reasoning_last_segment_id INTEGER,
  reasoning_details_final_sha256 TEXT,
  reasoning_details_final_bytes INTEGER,
  UNIQUE (convo_id, seq)
);

CREATE TABLE IF NOT EXISTS message_body (
  message_id TEXT PRIMARY KEY REFERENCES message(id) ON DELETE CASCADE,
  body TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS message_reasoning_detail_segments (
  segment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  detail_id TEXT,
  format TEXT,
  detail_index INTEGER,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  delta_text TEXT,
  delta_data TEXT,
  delta_summary TEXT,
  created_at INTEGER NOT NULL,
  segment_fingerprint TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reasoning_segment_fingerprint
  ON message_reasoning_detail_segments (message_id, segment_fingerprint);

CREATE TABLE IF NOT EXISTS attachment (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  path TEXT,
  hash TEXT,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS archive_convo (
  id TEXT PRIMARY KEY,
  snapshot_at INTEGER NOT NULL,
  payload BLOB
);

-- FTS5 Virtual Table (no indexes needed, built-in)
CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
  message_id UNINDEXED,
  convo_id UNINDEXED,
  body,
  tokenize = 'unicode61',
  content = ''
);

CREATE TRIGGER IF NOT EXISTS trg_message_del AFTER DELETE ON message BEGIN
  INSERT INTO message_fts(message_fts, rowid, message_id, convo_id, body)
  VALUES('delete', (SELECT rowid FROM message_fts WHERE message_id = old.id), old.id, old.convo_id, '');
END;

-- ========== Search Documents (v0 Skeleton) ==========

CREATE TABLE IF NOT EXISTS search_docs (
  doc_id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  project_id TEXT,
  convo_id TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'text',
  extra_json TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  title,
  body,
  tokenize = 'unicode61'
);

-- ========== Branching Tables ==========

CREATE TABLE IF NOT EXISTS branch (
  id TEXT PRIMARY KEY,
  convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE CASCADE,
  head_message_id TEXT NULL REFERENCES message(id) ON DELETE SET NULL,
  name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER NULL
);

CREATE TABLE IF NOT EXISTS branch_choice (
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  chosen_answer_root_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (branch_id, question_id)
);

CREATE TABLE IF NOT EXISTS branch_filter (
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('question', 'answer')),
  target_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('include', 'exclude')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (branch_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS branch_answer_hide (
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  answer_root_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  hidden INTEGER NOT NULL DEFAULT 1 CHECK (hidden IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (branch_id, question_id, answer_root_id)
);

CREATE TABLE IF NOT EXISTS branch_question_hide (
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  base_message_id TEXT NOT NULL,
  question_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  hidden INTEGER NOT NULL DEFAULT 1 CHECK (hidden IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (branch_id, base_message_id, question_id)
);

-- ========== Usage Statistics Table ==========

CREATE TABLE IF NOT EXISTS usage_log (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES project(id) ON DELETE CASCADE,
  convo_id TEXT REFERENCES convo(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  tokens_input INTEGER NOT NULL,
  tokens_output INTEGER NOT NULL,
  tokens_cached INTEGER DEFAULT 0,
  tokens_reasoning INTEGER DEFAULT 0,
  cost REAL DEFAULT 0.0,
  request_id TEXT,
  attempt INTEGER DEFAULT 1,
  duration_ms INTEGER NOT NULL,
  ttft_ms INTEGER,
  timestamp INTEGER NOT NULL,
  status TEXT DEFAULT 'success',
  error_code TEXT,
  meta TEXT
);

-- ========== Model Data Table ==========

CREATE TABLE IF NOT EXISTS model_data (
  id TEXT PRIMARY KEY,
  router_source TEXT NOT NULL DEFAULT 'openrouter',
  vendor TEXT NOT NULL DEFAULT 'unknown',
  name TEXT NOT NULL,
  description TEXT,
  context_length INTEGER DEFAULT -1,
  pricing TEXT,
  capabilities TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  first_seen_at TEXT,
  last_seen_at TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  meta TEXT
);

-- ========== Model Catalog Table (Snapshot Sync) ==========

CREATE TABLE IF NOT EXISTS model_catalog (
  model_id TEXT PRIMARY KEY CHECK (length(model_id) > 0),
  router_source TEXT NOT NULL,
  vendor TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) > 0),
  description TEXT,
  context_length INTEGER NOT NULL DEFAULT -1,
  supported_parameters_json TEXT,
  raw_json TEXT,
  last_seen_snapshot_id TEXT,
  is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

-- ========== Reasoning Model Index ==========

CREATE TABLE IF NOT EXISTS reasoning_model_index (
  model_id TEXT PRIMARY KEY CHECK (length(model_id) > 0),
  name TEXT NOT NULL CHECK (length(name) > 0),
  status TEXT NOT NULL CHECK (status IN ('visible', 'hidden')),
  last_synced_snapshot TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

-- ========== Settings (KV, JSON) ==========

CREATE TABLE IF NOT EXISTS settings_kv (
  key TEXT PRIMARY KEY CHECK (length(key) > 0),
  value_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

-- ========== Dashboard Preferences ==========

CREATE TABLE IF NOT EXISTS user_dashboard_prefs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  view_id TEXT NOT NULL,
  name TEXT NOT NULL,
  layout_json TEXT NOT NULL,
  filters_json TEXT,
  is_default INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);
