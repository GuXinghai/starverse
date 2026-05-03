-- ========================================================================
-- Starverse Database Schema (Baseline)
-- ========================================================================
-- IMPORTANT: This file is the single source of truth for baseline tables,
-- triggers, and catalog/search indexes used by fresh/rebuilt databases.
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
  annotations_json TEXT,
  reasoning_details_final_json TEXT,
  request_reasoning_config_json TEXT,
  reasoning_duration_ms INTEGER,
  reasoning_end_reason TEXT,
  reasoning_duration_is_fallback INTEGER DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS message_error (
  message_id TEXT PRIMARY KEY REFERENCES message(id) ON DELETE CASCADE,
  envelope_json TEXT NOT NULL,
  envelope_bytes INTEGER NOT NULL,
  is_truncated INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachment (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  path TEXT,
  hash TEXT,
  meta TEXT
);

CREATE TABLE IF NOT EXISTS asset (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  mime TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  bytes INTEGER NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS message_asset (
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_message_asset_message ON message_asset(message_id, ordinal);
CREATE INDEX IF NOT EXISTS idx_message_asset_asset ON message_asset(asset_id);

-- ========== File Pipeline (Phase 2) ==========

CREATE TABLE IF NOT EXISTS file_assets (
  id TEXT PRIMARY KEY,
  sha256 TEXT,
  filename TEXT NOT NULL,
  extension TEXT,
  mime TEXT,
  size_bytes INTEGER NOT NULL,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('image', 'document', 'text', 'audio', 'video', 'archive', 'binary')),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('local_upload', 'url_import', 'generated', 'derived')),
  storage_backend TEXT NOT NULL,
  storage_uri TEXT NOT NULL,
  ingest_status TEXT NOT NULL CHECK (ingest_status IN ('pending', 'probing', 'materializing', 'registered', 'stored', 'probe_failed', 'materialization_failed', 'failed', 'deleted')),
  preview_status TEXT NOT NULL CHECK (preview_status IN ('not_requested', 'pending', 'ready', 'failed')),
  source_meta_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS file_derivatives (
  id TEXT PRIMARY KEY,
  parent_asset_id TEXT NOT NULL REFERENCES file_assets(id),
  derived_kind TEXT NOT NULL CHECK (derived_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'send_optimized', 'preview_optimized', 'embedding_vector')),
  mime TEXT,
  storage_uri TEXT NOT NULL,
  generator TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'ready', 'failed', 'deleted')),
  meta_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS derivative_jobs (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES file_assets(id),
  derivative_kind TEXT NOT NULL CHECK (derivative_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'send_optimized', 'preview_optimized', 'embedding_vector')),
  task_family TEXT NOT NULL CHECK (task_family IN ('chat_context', 'transcription', 'embeddings')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ready', 'failed', 'cancelled')),
  generator TEXT NOT NULL,
  provider TEXT,
  model_id TEXT,
  input_snapshot_json TEXT,
  config_json TEXT,
  output_derivative_id TEXT REFERENCES file_derivatives(id) ON DELETE SET NULL,
  error_code TEXT,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);

CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES file_assets(id),
  ai_payload_kind TEXT NOT NULL CHECK (ai_payload_kind IN ('image', 'pdf', 'text', 'audio', 'video', 'binary')),
  processing_status TEXT NOT NULL CHECK (processing_status IN ('native_supported', 'convertible', 'local_only', 'unsupported')),
  include_in_next_request INTEGER NOT NULL DEFAULT 1 CHECK (include_in_next_request IN (0, 1)),
  excluded_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_drafts (
  conversation_id TEXT PRIMARY KEY REFERENCES convo(id) ON DELETE CASCADE,
  draft_text TEXT NOT NULL DEFAULT '',
  draft_mode TEXT NOT NULL DEFAULT 'compose' CHECK (draft_mode IN ('compose', 'edit')),
  editing_source_message_id TEXT REFERENCES message(id) ON DELETE SET NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS draft_attachments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversation_drafts(conversation_id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES file_assets(id),
  attachment_order INTEGER NOT NULL,
  ai_payload_kind TEXT NOT NULL CHECK (ai_payload_kind IN ('image', 'pdf', 'text', 'audio', 'video', 'binary')),
  processing_status TEXT NOT NULL CHECK (processing_status IN ('native_supported', 'convertible', 'local_only', 'unsupported')),
  include_in_next_request INTEGER NOT NULL DEFAULT 1 CHECK (include_in_next_request IN (0, 1)),
  excluded_reason TEXT,
  preferred_send_mode TEXT CHECK (preferred_send_mode IN ('default', 'auto', 'url_ref', 'inline_base64')),
  url_retention_mode TEXT CHECK (url_retention_mode IN ('default', 'link_only', 'link_and_file')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (conversation_id, asset_id),
  UNIQUE (conversation_id, attachment_order)
);

CREATE TABLE IF NOT EXISTS file_attachment_lifecycle (
  asset_id TEXT PRIMARY KEY REFERENCES file_assets(id) ON DELETE CASCADE,
  owner_kind TEXT NOT NULL CHECK (owner_kind IN ('detached', 'abandoned')),
  lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('detached', 'abandoned', 'soft_deleted')),
  reason TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_type_verdicts (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
  verdict_json TEXT NOT NULL,
  primary_format_id TEXT NOT NULL,
  primary_kind TEXT NOT NULL,
  confidence_level TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  taxonomy_version TEXT NOT NULL,
  taxonomy_map_version TEXT NOT NULL,
  magic_table_version TEXT NOT NULL,
  merge_rules_version TEXT NOT NULL,
  container_probe_version TEXT NOT NULL,
  text_probe_version TEXT NOT NULL,
  magika_model_version TEXT,
  fingerprint_json TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1 CHECK (is_current IN (0, 1)),
  stale_reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_assets_sha256 ON file_assets(sha256);
CREATE INDEX IF NOT EXISTS idx_file_assets_deleted ON file_assets(deleted_at);
CREATE INDEX IF NOT EXISTS idx_file_derivatives_parent ON file_derivatives(parent_asset_id, created_at);
CREATE INDEX IF NOT EXISTS idx_derivative_jobs_asset_created ON derivative_jobs(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_derivative_jobs_status_updated ON derivative_jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments(message_id, created_at);
CREATE INDEX IF NOT EXISTS idx_message_attachments_asset ON message_attachments(asset_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_message_attachments_message_asset ON message_attachments(message_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_draft_attachments_conversation_order ON draft_attachments(conversation_id, attachment_order);
CREATE INDEX IF NOT EXISTS idx_draft_attachments_asset ON draft_attachments(asset_id);
CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_asset_id ON file_type_verdicts(asset_id);
CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_is_current ON file_type_verdicts(is_current);
CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_primary_format_id ON file_type_verdicts(primary_format_id);
CREATE INDEX IF NOT EXISTS idx_file_type_verdicts_confidence_level ON file_type_verdicts(confidence_level);
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_type_verdicts_asset_current ON file_type_verdicts(asset_id) WHERE is_current = 1;

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

-- ========== Catalog Core (Provider-agnostic, Phase 1) ==========

CREATE TABLE IF NOT EXISTS providers (
  provider_key TEXT PRIMARY KEY CHECK (length(provider_key) > 0),
  display_name TEXT NOT NULL CHECK (length(display_name) > 0),
  slug TEXT,
  privacy_policy_url TEXT,
  terms_of_service_url TEXT,
  status_page_url TEXT,
  updated_at_ms INTEGER NOT NULL,
  raw_json TEXT
);

CREATE TABLE IF NOT EXISTS models (
  provider_key TEXT NOT NULL,
  model_id TEXT NOT NULL CHECK (length(model_id) > 0),
  model_key TEXT NOT NULL UNIQUE CHECK (length(model_key) > 0),
  canonical_slug TEXT,
  display_name TEXT NOT NULL CHECK (length(display_name) > 0),
  description TEXT,
  vendor TEXT,
  family TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'archived')),
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden')),
  context_length INTEGER,
  max_output_tokens INTEGER,
  architecture_modality TEXT,
  input_modalities_json TEXT NOT NULL DEFAULT '[]',
  output_modalities_json TEXT NOT NULL DEFAULT '[]',
  tokenizer TEXT,
  instruct_type TEXT,
  supported_parameters_json TEXT NOT NULL DEFAULT '[]',
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  cap_reasoning INTEGER NOT NULL DEFAULT 0 CHECK (cap_reasoning IN (0, 1)),
  cap_tools INTEGER NOT NULL DEFAULT 0 CHECK (cap_tools IN (0, 1)),
  cap_structured_outputs INTEGER NOT NULL DEFAULT 0 CHECK (cap_structured_outputs IN (0, 1)),
  cap_vision INTEGER NOT NULL DEFAULT 0 CHECK (cap_vision IN (0, 1)),
  cap_long_context INTEGER NOT NULL DEFAULT 0 CHECK (cap_long_context IN (0, 1)),
  pricing_json TEXT,
  price_prompt TEXT,
  price_completion TEXT,
  price_request TEXT,
  price_image TEXT,
  price_web_search TEXT,
  price_internal_reasoning TEXT,
  price_input_cache_read TEXT,
  price_input_cache_write TEXT,
  created_at_sec INTEGER,
  expiration_date TEXT,
  expiration_at_sec INTEGER,
  unknown_expiration INTEGER NOT NULL DEFAULT 0 CHECK (unknown_expiration IN (0, 1)),
  per_request_limits_json TEXT,
  default_parameters_json TEXT,
  has_per_request_limits INTEGER NOT NULL DEFAULT 0 CHECK (has_per_request_limits IN (0, 1)),
  has_default_parameters INTEGER NOT NULL DEFAULT 0 CHECK (has_default_parameters IN (0, 1)),
  has_tools INTEGER NOT NULL DEFAULT 0 CHECK (has_tools IN (0, 1)),
  has_structured_outputs INTEGER NOT NULL DEFAULT 0 CHECK (has_structured_outputs IN (0, 1)),
  has_reasoning INTEGER NOT NULL DEFAULT 0 CHECK (has_reasoning IN (0, 1)),
  has_seed INTEGER NOT NULL DEFAULT 0 CHECK (has_seed IN (0, 1)),
  in_modality_image INTEGER NOT NULL DEFAULT 0 CHECK (in_modality_image IN (0, 1)),
  top_provider_context_length INTEGER,
  top_provider_is_moderated INTEGER CHECK (top_provider_is_moderated IN (0, 1)),
  first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  synced_at_ms INTEGER NOT NULL,
  raw_json TEXT,
  PRIMARY KEY (provider_key, model_id),
  FOREIGN KEY(provider_key) REFERENCES providers(provider_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS model_tags (
  provider_key TEXT NOT NULL,
  model_id TEXT NOT NULL CHECK (length(model_id) > 0),
  tag_key TEXT NOT NULL CHECK (length(tag_key) > 0),
  tag_label TEXT NOT NULL DEFAULT '',
  tag_type TEXT NOT NULL CHECK (tag_type IN ('capability', 'category', 'vendor', 'status', 'custom')),
  confidence REAL NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  source TEXT NOT NULL CHECK (source IN ('derived', 'provider', 'manual')),
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (provider_key, model_id, tag_key),
  FOREIGN KEY(provider_key, model_id) REFERENCES models(provider_key, model_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_meta (
  provider_key TEXT PRIMARY KEY CHECK (length(provider_key) > 0),
  schema_version INTEGER NOT NULL,
  data_source TEXT NOT NULL CHECK (data_source IN ('models_user_primary', 'models_fallback', 'mixed')),
  base_url TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  model_count INTEGER NOT NULL DEFAULT 0,
  visible_model_count INTEGER NOT NULL DEFAULT 0,
  hidden_model_count INTEGER NOT NULL DEFAULT 0,
  provider_count INTEGER,
  last_count_probe INTEGER,
  last_count_probe_at_ms INTEGER,
  last_sync_at_ms INTEGER NOT NULL,
  ttl_seconds INTEGER NOT NULL,
  sync_state TEXT NOT NULL CHECK (sync_state IN ('idle', 'syncing', 'ok', 'error')),
  last_error_code TEXT,
  last_error_message TEXT,
  raw_retention_policy_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(provider_key) REFERENCES providers(provider_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS endpoint_meta (
  provider_key TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model_id TEXT NOT NULL CHECK (length(model_id) > 0),
  endpoint_key TEXT NOT NULL CHECK (length(endpoint_key) > 0),
  provider_name TEXT,
  tag TEXT,
  quantization TEXT,
  context_length INTEGER,
  max_completion_tokens INTEGER,
  max_prompt_tokens INTEGER,
  supported_parameters_json TEXT,
  supports_implicit_caching INTEGER CHECK (supports_implicit_caching IN (0, 1)),
  status INTEGER,
  raw_json TEXT,
  fetched_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (provider_key, base_url, model_id, endpoint_key),
  FOREIGN KEY(provider_key, model_id) REFERENCES models(provider_key, model_id) ON DELETE CASCADE
);

-- ========== Model Preferences (Scope-ready, Phase 3.1) ==========

CREATE TABLE IF NOT EXISTS model_favorites (
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'project', 'conversation')),
  scope_id TEXT NOT NULL DEFAULT '',
  provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
  model_id TEXT NOT NULL CHECK (length(model_id) > 0),
  model_key TEXT NOT NULL CHECK (length(model_key) > 0),
  sort_rank INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (scope_type, scope_id, provider_key, model_id),
  UNIQUE (scope_type, scope_id, model_key),
  CHECK ((scope_type = 'global' AND scope_id = '') OR (scope_type != 'global' AND length(scope_id) > 0)),
  CHECK (instr(model_key, '::') > 0),
  CHECK (model_key = provider_key || '::' || model_id)
);

CREATE TABLE IF NOT EXISTS model_recents (
  scope_type TEXT NOT NULL CHECK (scope_type IN ('global', 'project', 'conversation')),
  scope_id TEXT NOT NULL DEFAULT '',
  provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
  model_id TEXT NOT NULL CHECK (length(model_id) > 0),
  model_key TEXT NOT NULL CHECK (length(model_key) > 0),
  last_used_at_ms INTEGER NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1 CHECK (use_count >= 1),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (scope_type, scope_id, provider_key, model_id),
  UNIQUE (scope_type, scope_id, model_key),
  CHECK ((scope_type = 'global' AND scope_id = '') OR (scope_type != 'global' AND length(scope_id) > 0)),
  CHECK (instr(model_key, '::') > 0),
  CHECK (model_key = provider_key || '::' || model_id)
);

-- FTS for catalog search (display_name/model_id/canonical_slug/description).
CREATE VIRTUAL TABLE IF NOT EXISTS models_fts USING fts5(
  provider_key UNINDEXED,
  model_id UNINDEXED,
  display_name,
  canonical_slug,
  description,
  tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS trg_models_fts_ai
AFTER INSERT ON models
BEGIN
  INSERT INTO models_fts(rowid, provider_key, model_id, display_name, canonical_slug, description)
  VALUES (
    new.rowid,
    new.provider_key,
    new.model_id,
    coalesce(new.display_name, ''),
    coalesce(new.canonical_slug, ''),
    coalesce(new.description, '')
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_models_fts_au
AFTER UPDATE OF provider_key, model_id, display_name, canonical_slug, description ON models
BEGIN
  DELETE FROM models_fts WHERE rowid = old.rowid;
  INSERT INTO models_fts(rowid, provider_key, model_id, display_name, canonical_slug, description)
  VALUES (
    new.rowid,
    new.provider_key,
    new.model_id,
    coalesce(new.display_name, ''),
    coalesce(new.canonical_slug, ''),
    coalesce(new.description, '')
  );
END;

CREATE TRIGGER IF NOT EXISTS trg_models_fts_ad
AFTER DELETE ON models
BEGIN
  DELETE FROM models_fts WHERE rowid = old.rowid;
END;

CREATE INDEX IF NOT EXISTS idx_models_context_length ON models(context_length);
CREATE INDEX IF NOT EXISTS idx_models_price_prompt ON models(price_prompt);
CREATE INDEX IF NOT EXISTS idx_models_price_completion ON models(price_completion);
CREATE INDEX IF NOT EXISTS idx_models_price_request ON models(price_request);
CREATE INDEX IF NOT EXISTS idx_models_price_image ON models(price_image);
CREATE INDEX IF NOT EXISTS idx_models_price_web_search
  ON models(provider_key, visibility, status, price_web_search);
CREATE INDEX IF NOT EXISTS idx_models_price_internal_reasoning
  ON models(provider_key, visibility, status, price_internal_reasoning);
CREATE INDEX IF NOT EXISTS idx_models_price_input_cache_read
  ON models(provider_key, visibility, status, price_input_cache_read);
CREATE INDEX IF NOT EXISTS idx_models_price_input_cache_write
  ON models(provider_key, visibility, status, price_input_cache_write);
CREATE INDEX IF NOT EXISTS idx_models_capability_flags ON models(cap_reasoning, cap_tools, cap_structured_outputs, cap_vision, cap_long_context);
CREATE INDEX IF NOT EXISTS idx_models_provider_visibility_status ON models(provider_key, visibility, status);
CREATE INDEX IF NOT EXISTS idx_models_last_seen ON models(last_seen_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_models_max_output_tokens
  ON models(provider_key, visibility, status, max_output_tokens);
CREATE INDEX IF NOT EXISTS idx_models_top_provider_ctx
  ON models(provider_key, visibility, status, top_provider_context_length);
CREATE INDEX IF NOT EXISTS idx_models_tokenizer_filter
  ON models(provider_key, visibility, status, tokenizer);
CREATE INDEX IF NOT EXISTS idx_models_instruct_type_filter
  ON models(provider_key, visibility, status, instruct_type);
CREATE INDEX IF NOT EXISTS idx_models_arch_modality
  ON models(provider_key, visibility, status, architecture_modality);
CREATE INDEX IF NOT EXISTS idx_models_query_name
  ON models(provider_key, visibility, status, display_name COLLATE NOCASE, model_key);
CREATE INDEX IF NOT EXISTS idx_models_query_created
  ON models(provider_key, visibility, status, created_at_sec DESC, model_key DESC);
CREATE INDEX IF NOT EXISTS idx_models_vendor_filter
  ON models(provider_key, vendor, visibility, status);
CREATE INDEX IF NOT EXISTS idx_models_expiration_filter
  ON models(provider_key, status, visibility, expiration_at_sec);
CREATE INDEX IF NOT EXISTS idx_models_limits_filter
  ON models(provider_key, visibility, status, has_per_request_limits, has_default_parameters);
CREATE INDEX IF NOT EXISTS idx_models_param_flags_filter
  ON models(provider_key, visibility, status, has_tools, has_structured_outputs, has_reasoning, has_seed, in_modality_image);
CREATE INDEX IF NOT EXISTS idx_model_tags_type_key ON model_tags(tag_type, tag_key);
CREATE INDEX IF NOT EXISTS idx_model_tags_model ON model_tags(provider_key, model_id);
CREATE INDEX IF NOT EXISTS idx_catalog_meta_sync_state ON catalog_meta(sync_state, last_sync_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_endpoint_meta_model ON endpoint_meta(provider_key, base_url, model_id);
CREATE INDEX IF NOT EXISTS idx_endpoint_meta_fetched_at ON endpoint_meta(provider_key, base_url, model_id, fetched_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_model_favorites_scope_sort
  ON model_favorites(scope_type, scope_id, sort_rank ASC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_favorites_scope_updated
  ON model_favorites(scope_type, scope_id, updated_at_ms DESC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_favorites_model_lookup
  ON model_favorites(provider_key, model_id);
CREATE INDEX IF NOT EXISTS idx_model_favorites_global_sort
  ON model_favorites(sort_rank ASC, model_key ASC)
  WHERE scope_type = 'global' AND scope_id = '';
CREATE INDEX IF NOT EXISTS idx_model_recents_scope_last_used
  ON model_recents(scope_type, scope_id, last_used_at_ms DESC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_recents_scope_use_count
  ON model_recents(scope_type, scope_id, use_count DESC, last_used_at_ms DESC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_recents_model_lookup
  ON model_recents(provider_key, model_id);
CREATE INDEX IF NOT EXISTS idx_model_recents_global_last_used
  ON model_recents(last_used_at_ms DESC, model_key ASC)
  WHERE scope_type = 'global' AND scope_id = '';

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
