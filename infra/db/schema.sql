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
CREATE INDEX IF NOT EXISTS idx_tag_name ON tag(name);

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
