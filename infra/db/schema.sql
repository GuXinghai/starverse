PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA foreign_keys=ON;
PRAGMA mmap_size=268435456;
PRAGMA cache_size=-20000;
PRAGMA temp_store=MEMORY;

CREATE TABLE IF NOT EXISTS project (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  meta TEXT
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
  -- Branching/graph fields (Phase 4+). Nullable for legacy linear history.
  parent_id TEXT NULL,
  status TEXT NOT NULL DEFAULT 'final' CHECK (status IN ('streaming', 'final', 'error')),
  answer_root_id TEXT NULL,
  question_id TEXT NULL,
  meta TEXT,
  UNIQUE (convo_id, seq)
);

CREATE TABLE IF NOT EXISTS message_body (
  message_id TEXT PRIMARY KEY REFERENCES message(id) ON DELETE CASCADE,
  body TEXT NOT NULL
);

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

CREATE INDEX IF NOT EXISTS idx_convo_project ON convo(project_id);
CREATE INDEX IF NOT EXISTS idx_convo_updated ON convo(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_convo_seq ON message(convo_id, seq);
-- NOTE: Indexes for branching/graph columns (parent_id/answer_root_id/question_id) are created by
-- `ensureBranchingSchema()` at runtime, after it has backfilled legacy DBs that may not yet have
-- these columns. Keeping them out of the baseline schema avoids SQLITE_ERROR on older DB files.
CREATE INDEX IF NOT EXISTS idx_tag_name ON tag(name);

-- ========== Branching Tables (Conversation-local) ==========
-- Note: These tables are additive and safe for legacy DBs. Runtime also runs an "ensure" migration for existing DB files.

CREATE TABLE IF NOT EXISTS branch (
  id TEXT PRIMARY KEY,
  convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE CASCADE,
  head_message_id TEXT NULL REFERENCES message(id) ON DELETE SET NULL,
  name TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER NULL
);

CREATE INDEX IF NOT EXISTS idx_branch_convo_alive ON branch(convo_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_branch_convo_updated ON branch(convo_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS branch_choice (
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  chosen_answer_root_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (branch_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_choice_branch ON branch_choice(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_choice_question ON branch_choice(question_id);

CREATE TABLE IF NOT EXISTS branch_filter (
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('question', 'answer')),
  target_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('include', 'exclude')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (branch_id, target_type, target_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_filter_branch ON branch_filter(branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_filter_target ON branch_filter(target_type, target_id);

CREATE TABLE IF NOT EXISTS branch_answer_hide (
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  answer_root_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  hidden INTEGER NOT NULL DEFAULT 1 CHECK (hidden IN (0, 1)),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (branch_id, question_id, answer_root_id)
);

CREATE INDEX IF NOT EXISTS idx_branch_answer_hide_branch_q ON branch_answer_hide(branch_id, question_id);

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
  status TEXT DEFAULT 'success',  -- 'success': AI正常完成 | 'error': 系统错误(网络/API) | 'canceled': 用户主动中止
  error_code TEXT,
  meta TEXT
);

CREATE INDEX IF NOT EXISTS idx_usage_project ON usage_log(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_convo ON usage_log(convo_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_model ON usage_log(model, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_timestamp ON usage_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_time_project ON usage_log(timestamp DESC, project_id);
CREATE INDEX IF NOT EXISTS idx_usage_time_provider_model ON usage_log(timestamp DESC, provider, model);
CREATE INDEX IF NOT EXISTS idx_usage_status ON usage_log(status, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_usage_request_attempt ON usage_log(request_id, attempt);

-- ========== Model Data Table ==========
-- 模型信息持久化表
-- 参考规范：/docs/openrouter-model-sync-spec.md
-- 用途：存储 AI 提供商的模型列表，支持软删除和时间戳追踪
CREATE TABLE IF NOT EXISTS model_data (
  id TEXT PRIMARY KEY,
  router_source TEXT NOT NULL DEFAULT 'openrouter',  -- 接入来源: openrouter, openai_api, anthropic_api, local
  vendor TEXT NOT NULL DEFAULT 'unknown',            -- 模型厂商: openai, anthropic, google, deepseek 等
  name TEXT NOT NULL,
  description TEXT,
  context_length INTEGER DEFAULT -1,                  -- -1 表示未知
  pricing TEXT,                                       -- JSON: ModelPricing 对象
  capabilities TEXT,                                  -- JSON: ModelCapabilities 对象
  is_archived INTEGER NOT NULL DEFAULT 0,            -- 软删除标记: 0=活跃, 1=已归档
  first_seen_at TEXT,                                -- ISO8601: 首次在远程列表中出现的时间
  last_seen_at TEXT,                                 -- ISO8601: 最后一次在远程列表中出现的时间
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  meta TEXT                                          -- JSON: 其他扩展字段
);

-- 保留旧索引以兼容（provider 映射到 vendor）
CREATE INDEX IF NOT EXISTS idx_model_provider ON model_data(vendor);
-- 新增索引
CREATE INDEX IF NOT EXISTS idx_model_router_source ON model_data(router_source);
CREATE INDEX IF NOT EXISTS idx_model_archived ON model_data(is_archived);
CREATE INDEX IF NOT EXISTS idx_model_last_seen ON model_data(last_seen_at);

-- ========== Model Catalog Table (Snapshot Sync) ==========
-- Purpose:
-- - New SSOT-compatible model catalog for full-field overwrite sync by model_id.
-- - Snapshot marker + soft hidden (never delete).
-- Note:
-- - This table intentionally does NOT replace model_data yet (phase A parallel write).
CREATE TABLE IF NOT EXISTS model_catalog (
  model_id TEXT PRIMARY KEY CHECK (length(model_id) > 0),
  router_source TEXT NOT NULL,
  vendor TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) > 0),
  description TEXT,
  context_length INTEGER NOT NULL DEFAULT -1,
  supported_parameters_json TEXT,             -- JSON: string[]
  raw_json TEXT,                              -- JSON: full remote model object (for audit/anti-corruption)
  last_seen_snapshot_id TEXT,
  is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_model_catalog_router_source ON model_catalog(router_source);
CREATE INDEX IF NOT EXISTS idx_model_catalog_hidden ON model_catalog(router_source, is_hidden);
CREATE INDEX IF NOT EXISTS idx_model_catalog_last_seen_snapshot ON model_catalog(router_source, last_seen_snapshot_id);

-- ========== Reasoning Model Index (Derived from model_catalog) ==========
-- Purpose:
-- - Settings/selection list reads ONLY this index (id/name/status).
-- - Derived by ReasoningIndexSyncJob from model_catalog (no OpenRouter JSON in UI).
-- - Never delete: if a model stops being reasoning-capable, mark status='hidden'.
CREATE TABLE IF NOT EXISTS reasoning_model_index (
  model_id TEXT PRIMARY KEY CHECK (length(model_id) > 0),
  name TEXT NOT NULL CHECK (length(name) > 0),
  status TEXT NOT NULL CHECK (status IN ('visible', 'hidden')),
  last_synced_snapshot TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reasoning_model_index_status ON reasoning_model_index(status);
CREATE INDEX IF NOT EXISTS idx_reasoning_model_index_last_synced ON reasoning_model_index(last_synced_snapshot);

-- ========== Settings (KV, JSON) ==========
-- Purpose:
-- - Persist global settings in SQLite (renderer reads via dbBridge; no UI parsing of provider JSON).
-- - Never delete user settings; callers may overwrite values by key.
CREATE TABLE IF NOT EXISTS settings_kv (
  key TEXT PRIMARY KEY CHECK (length(key) > 0),
  value_json TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_settings_kv_updated ON settings_kv(updated_at_ms DESC);

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
CREATE UNIQUE INDEX IF NOT EXISTS idx_prefs_user_view ON user_dashboard_prefs(user_id, view_id);
CREATE INDEX IF NOT EXISTS idx_prefs_user_default ON user_dashboard_prefs(user_id, is_default);
