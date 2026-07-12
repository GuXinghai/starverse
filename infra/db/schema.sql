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
  meta TEXT,
  system_key TEXT,
  template_revision INTEGER NOT NULL DEFAULT 0
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

CREATE TABLE IF NOT EXISTS message_reasoning_display_blocks (
  block_id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL,
  block_type TEXT NOT NULL CHECK (block_type IN ('text', 'image', 'opaque')),
  text TEXT,
  semantic_role TEXT CHECK (
    semantic_role IS NULL OR semantic_role IN ('summary', 'reasoning', 'thinking', 'thought')
  ),
  asset_id TEXT REFERENCES asset(id) ON DELETE SET NULL,
  file_asset_id TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
  url TEXT,
  mime TEXT,
  width INTEGER,
  height INTEGER,
  alt TEXT,
  label TEXT,
  warning TEXT,
  provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
  source_event_type TEXT,
  source_raw_segment_id INTEGER REFERENCES message_reasoning_detail_segments(segment_id) ON DELETE SET NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  final_at INTEGER,
  segment_fingerprint TEXT,
  UNIQUE (message_id, ordinal),
  UNIQUE (message_id, segment_fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_reasoning_display_blocks_message_ordinal
  ON message_reasoning_display_blocks(message_id, ordinal);

CREATE TABLE IF NOT EXISTS message_provider_native_contents (
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
  source_api TEXT NOT NULL CHECK (length(source_api) > 0),
  snapshot_key TEXT NOT NULL CHECK (length(snapshot_key) > 0),
  candidate_index INTEGER CHECK (candidate_index IS NULL OR candidate_index >= 0),
  status TEXT NOT NULL CHECK (status IN ('streaming', 'final', 'error', 'cancelled')),
  content_json TEXT NOT NULL,
  role TEXT,
  finish_reason TEXT,
  stop_reason TEXT,
  stop_sequence TEXT,
  usage_json TEXT,
  model TEXT,
  model_version TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (message_id, provider_key, source_api, snapshot_key)
);

CREATE INDEX IF NOT EXISTS idx_provider_native_contents_message
  ON message_provider_native_contents(message_id);

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

-- Immutable request semantics for assistant answers. Credentials and transient
-- runtime objects are intentionally excluded from snapshot_json.
CREATE TABLE IF NOT EXISTS assistant_answer_generation_snapshots (
  answer_root_id TEXT PRIMARY KEY REFERENCES message(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  snapshot_json TEXT NOT NULL CHECK (
    json_valid(snapshot_json) AND json_type(snapshot_json) = 'object'
    AND length(CAST(snapshot_json AS BLOB)) <= 1048576
  ),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0)
);

CREATE TABLE IF NOT EXISTS assistant_answer_generation_operations (
  operation_id TEXT PRIMARY KEY CHECK (length(trim(operation_id)) BETWEEN 1 AND 256),
  action_kind TEXT NOT NULL CHECK (action_kind IN ('regenerate', 'retry_replace', 'retry_as_new')),
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  target_answer_root_id TEXT REFERENCES message(id) ON DELETE RESTRICT,
  result_answer_root_id TEXT NOT NULL UNIQUE REFERENCES message(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('committed', 'streaming', 'completed', 'failed', 'cancelled')),
  error_code TEXT,
  error_message TEXT,
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  terminal_at_ms INTEGER,
  CHECK (
    (state IN ('committed', 'streaming') AND terminal_at_ms IS NULL) OR
    (state IN ('completed', 'failed', 'cancelled') AND terminal_at_ms = updated_at_ms)
  )
);

CREATE INDEX IF NOT EXISTS idx_answer_generation_operation_branch_question
  ON assistant_answer_generation_operations(branch_id, question_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS file_blobs (
  id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL UNIQUE,
  size_bytes INTEGER NOT NULL,
  mime TEXT,
  storage_backend TEXT NOT NULL CHECK (storage_backend IN ('local_fs', 'remote_url')),
  storage_uri TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_asset_revisions (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
  blob_id TEXT NOT NULL REFERENCES file_blobs(id),
  parent_revision_id TEXT REFERENCES file_asset_revisions(id) ON DELETE SET NULL,
  cause TEXT NOT NULL CHECK (cause IN ('imported', 'url_snapshot', 'converted', 'compressed', 'preview_generated', 'ai_edited', 'user_replaced')),
  derived_from_asset_id TEXT REFERENCES file_assets(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS file_asset_bindings (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK (scope IN ('conversation', 'message', 'branch', 'project')),
  conversation_id TEXT,
  message_id TEXT,
  branch_id TEXT,
  project_id TEXT,
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS file_derivatives (
  id TEXT PRIMARY KEY,
  parent_asset_id TEXT NOT NULL REFERENCES file_assets(id),
  derived_kind TEXT NOT NULL CHECK (derived_kind IN ('thumbnail', 'extracted_text', 'ocr_text', 'transcript', 'converted_pdf', 'converted_markdown', 'rendered_images', 'selected_frames', 'extracted_audio', 'send_optimized', 'preview_optimized', 'embedding_vector')),
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

CREATE TABLE IF NOT EXISTS dfc_option_generation_states (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
  target_kind TEXT NOT NULL CHECK (target_kind IN ('plain_text', 'markdown', 'code', 'table_markdown', 'pdf_attachment')),
  derived_kind TEXT NOT NULL CHECK (derived_kind IN ('extracted_text', 'converted_pdf', 'converted_markdown')),
  exposure_mode TEXT NOT NULL CHECK (exposure_mode IN ('dfc')),
  generator TEXT NOT NULL,
  conversion_settings_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'ready', 'failed', 'stale', 'blocked')),
  retryable INTEGER NOT NULL DEFAULT 1 CHECK (retryable IN (0, 1)),
  derivative_job_id TEXT REFERENCES derivative_jobs(id) ON DELETE SET NULL,
  output_derivative_id TEXT REFERENCES file_derivatives(id) ON DELETE SET NULL,
  error_code TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER,
  UNIQUE (asset_id, target_kind, exposure_mode, conversion_settings_hash)
);

CREATE TABLE IF NOT EXISTS message_attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES message(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL REFERENCES file_assets(id),
  ai_payload_kind TEXT NOT NULL CHECK (ai_payload_kind IN ('image', 'pdf', 'text', 'audio', 'video', 'binary')),
  processing_status TEXT NOT NULL CHECK (processing_status IN ('native_supported', 'convertible', 'local_only', 'unsupported')),
  include_in_next_request INTEGER NOT NULL DEFAULT 1 CHECK (include_in_next_request IN (0, 1)),
  excluded_reason TEXT,
  dfc_managed INTEGER NOT NULL DEFAULT 0 CHECK (dfc_managed IN (0, 1)),
  used_option_id TEXT,
  used_asset_refs_json TEXT,
  target_kind TEXT CHECK (target_kind IN ('original_file', 'plain_text', 'markdown', 'code', 'table_markdown', 'pdf_attachment')),
  send_strategy TEXT CHECK (send_strategy IN ('text_in_prompt', 'file_attachment')),
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
  dfc_managed INTEGER NOT NULL DEFAULT 0 CHECK (dfc_managed IN (0, 1)),
  selected_option_id TEXT,
  selected_asset_refs_json TEXT,
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
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_blobs_sha256 ON file_blobs(sha256);
CREATE INDEX IF NOT EXISTS idx_file_asset_revisions_asset_created ON file_asset_revisions(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_file_asset_revisions_blob ON file_asset_revisions(blob_id);
CREATE INDEX IF NOT EXISTS idx_file_asset_bindings_asset_scope ON file_asset_bindings(asset_id, scope, deleted_at);
CREATE INDEX IF NOT EXISTS idx_file_asset_bindings_conversation ON file_asset_bindings(conversation_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_file_asset_bindings_message ON file_asset_bindings(message_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_file_asset_bindings_branch ON file_asset_bindings(branch_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_file_asset_bindings_project ON file_asset_bindings(project_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_file_derivatives_parent ON file_derivatives(parent_asset_id, created_at);
CREATE INDEX IF NOT EXISTS idx_derivative_jobs_asset_created ON derivative_jobs(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_derivative_jobs_status_updated ON derivative_jobs(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dfc_option_generation_asset ON dfc_option_generation_states(asset_id, target_kind, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_dfc_option_generation_status ON dfc_option_generation_states(status, updated_at DESC);
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

-- ========== Provider File Upload Cache (M1d) ==========

CREATE TABLE IF NOT EXISTS provider_file_upload_cache (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('openai_responses', 'anthropic_messages', 'google_ai_studio')),
  endpoint_family TEXT NOT NULL,
  normalized_base_url TEXT NOT NULL,
  credential_fingerprint TEXT NOT NULL,
  asset_id TEXT NOT NULL REFERENCES file_assets(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL REFERENCES file_asset_revisions(id) ON DELETE CASCADE,
  blob_sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('image', 'pdf')),
  upload_purpose TEXT NOT NULL,
  provider_file_id TEXT,
  provider_file_uri TEXT,
  provider_file_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'ready', 'failed', 'invalidated')),
  expires_at_ms INTEGER,
  upload_started_at_ms INTEGER NOT NULL,
  uploaded_at_ms INTEGER,
  invalidated_at_ms INTEGER,
  last_error_code TEXT,
  last_error_message TEXT,
  metadata_json TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS new_chat_materializations (
  request_id TEXT PRIMARY KEY,
  template_convo_id TEXT NOT NULL REFERENCES convo(id) ON DELETE RESTRICT,
  template_revision INTEGER NOT NULL,
  target_convo_id TEXT NOT NULL UNIQUE REFERENCES convo(id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL UNIQUE REFERENCES branch(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL UNIQUE REFERENCES message(id) ON DELETE CASCADE,
  assistant_id TEXT NOT NULL UNIQUE REFERENCES message(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_file_upload_cache_key
  ON provider_file_upload_cache (
    provider,
    endpoint_family,
    normalized_base_url,
    credential_fingerprint,
    asset_id,
    revision_id,
    blob_sha256,
    mime_type,
    size_bytes,
    asset_kind,
    upload_purpose
  );

CREATE INDEX IF NOT EXISTS idx_provider_file_upload_cache_asset_revision
  ON provider_file_upload_cache(asset_id, revision_id, status);

CREATE INDEX IF NOT EXISTS idx_provider_file_upload_cache_expiry
  ON provider_file_upload_cache(provider, status, expires_at_ms);

CREATE TABLE IF NOT EXISTS engine_plugin_registry (
  engine_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  plugin_version TEXT NOT NULL,
  manifest_schema_version TEXT NOT NULL,
  manifest_hash TEXT NOT NULL,
  runtime_kind TEXT NOT NULL,
  model_version TEXT,
  install_state TEXT NOT NULL DEFAULT 'installed' CHECK (install_state IN ('installed', 'failed', 'uninstalled', 'update_available')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  health_status TEXT NOT NULL DEFAULT 'unknown' CHECK (health_status IN ('unknown', 'healthy', 'degraded', 'unhealthy')),
  failure_reason TEXT,
  install_source TEXT NOT NULL DEFAULT 'official_catalog' CHECK (install_source IN ('official_catalog', 'local_package')),
  install_root_kind TEXT NOT NULL CHECK (install_root_kind IN ('managed_root', 'managed_cache', 'test_root')),
  install_ref TEXT NOT NULL,
  installed_at INTEGER,
  updated_at INTEGER NOT NULL,
  last_verified_at INTEGER,
  last_health_check_at INTEGER,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_engine_plugin_registry_state ON engine_plugin_registry(install_state, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_plugin_registry_enabled ON engine_plugin_registry(enabled, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_plugin_registry_health ON engine_plugin_registry(health_status, updated_at DESC);

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

-- ========== Scoped Model Catalog Cache (credential-scoped, rebuildable) ==========

CREATE TABLE IF NOT EXISTS catalog_scope_meta (
  provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
  catalog_scope_key TEXT NOT NULL CHECK (length(catalog_scope_key) > 0),
  base_url TEXT NOT NULL,
  data_source TEXT NOT NULL CHECK (data_source IN ('models_user_primary', 'models_fallback', 'mixed')),
  active_snapshot_id TEXT,
  sync_state TEXT NOT NULL CHECK (sync_state IN ('idle', 'syncing', 'ok', 'error')),
  last_sync_at_ms INTEGER NOT NULL DEFAULT 0,
  last_used_at_ms INTEGER NOT NULL DEFAULT 0,
  model_count INTEGER NOT NULL DEFAULT 0,
  visible_model_count INTEGER NOT NULL DEFAULT 0,
  hidden_model_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  last_validated_at_ms INTEGER,
  last_repair_attempt_at_ms INTEGER,
  repair_attempt_count INTEGER NOT NULL DEFAULT 0,
  snapshot_checksum TEXT,
  schema_version INTEGER NOT NULL,
  PRIMARY KEY(provider_key, catalog_scope_key)
);

CREATE TABLE IF NOT EXISTS catalog_models (
  provider_key TEXT NOT NULL CHECK (length(provider_key) > 0),
  catalog_scope_key TEXT NOT NULL CHECK (length(catalog_scope_key) > 0),
  snapshot_id TEXT NOT NULL CHECK (length(snapshot_id) > 0),
  model_id TEXT NOT NULL CHECK (length(model_id) > 0),
  model_key TEXT NOT NULL CHECK (length(model_key) > 0),
  canonical_slug TEXT,
  display_name TEXT NOT NULL CHECK (length(display_name) > 0),
  description TEXT,
  vendor TEXT,
  family TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deprecated', 'archived')),
  visibility TEXT NOT NULL DEFAULT 'visible' CHECK (visibility IN ('visible', 'hidden')),
  context_length INTEGER,
  max_output_tokens INTEGER,
  input_modalities_json TEXT NOT NULL DEFAULT '[]',
  output_modalities_json TEXT NOT NULL DEFAULT '[]',
  supported_parameters_json TEXT NOT NULL DEFAULT '[]',
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  pricing_json TEXT,
  raw_json TEXT,
  created_at_sec INTEGER,
  first_seen_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,
  synced_at_ms INTEGER NOT NULL,
  PRIMARY KEY(provider_key, catalog_scope_key, snapshot_id, model_id),
  FOREIGN KEY(provider_key, catalog_scope_key)
    REFERENCES catalog_scope_meta(provider_key, catalog_scope_key)
    ON DELETE CASCADE
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
  model_id,
  display_name,
  canonical_slug,
  description,
  tokenize = 'unicode61',
  prefix = '1 2 3 4'
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
CREATE INDEX IF NOT EXISTS idx_catalog_scope_meta_state ON catalog_scope_meta(provider_key, sync_state, last_sync_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_scope_meta_used ON catalog_scope_meta(provider_key, last_used_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_models_active_lookup
  ON catalog_models(provider_key, catalog_scope_key, snapshot_id, visibility, status, display_name COLLATE NOCASE, model_id);
CREATE INDEX IF NOT EXISTS idx_catalog_models_model_lookup
  ON catalog_models(provider_key, catalog_scope_key, model_id);
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

-- ========== OpenAI Chat Completions-compatible (fresh schema only) ==========

CREATE TABLE IF NOT EXISTS compatible_provider_instances (
  provider_instance_id TEXT PRIMARY KEY CHECK (provider_instance_id GLOB 'ocp_provider_*' AND length(provider_instance_id) BETWEEN 21 AND 109),
  protocol_key TEXT NOT NULL CHECK (protocol_key = 'openai_chat_compatible'),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 256),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled', 'deleted')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  deleted_at_ms INTEGER,
  CHECK (
    (status = 'deleted' AND deleted_at_ms IS NOT NULL AND deleted_at_ms >= created_at_ms) OR
    (status != 'deleted' AND deleted_at_ms IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_compatible_provider_active_name
  ON compatible_provider_instances(lower(trim(display_name)))
  WHERE deleted_at_ms IS NULL;

CREATE INDEX IF NOT EXISTS idx_compatible_provider_status
  ON compatible_provider_instances(status, updated_at_ms DESC);

CREATE TABLE IF NOT EXISTS compatible_credential_descriptors (
  credential_version_ref TEXT PRIMARY KEY CHECK (credential_version_ref GLOB 'ocp_credential_*' AND length(credential_version_ref) BETWEEN 23 AND 111),
  provider_instance_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('none', 'bearer', 'basic', 'custom_headers')),
  backend TEXT NOT NULL CHECK (backend = 'electron_safe_storage'),
  masked_summary_json TEXT NOT NULL CHECK (json_valid(masked_summary_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  deleted_at_ms INTEGER CHECK (deleted_at_ms IS NULL OR deleted_at_ms >= created_at_ms),
  FOREIGN KEY (provider_instance_id) REFERENCES compatible_provider_instances(provider_instance_id) ON DELETE RESTRICT,
  UNIQUE (provider_instance_id, version),
  UNIQUE (provider_instance_id, credential_version_ref)
);

CREATE INDEX IF NOT EXISTS idx_compatible_credential_provider
  ON compatible_credential_descriptors(provider_instance_id, version DESC);

CREATE TABLE IF NOT EXISTS compatible_request_profiles (
  request_profile_id TEXT NOT NULL CHECK (request_profile_id GLOB 'ocp_request_profile_*' AND length(request_profile_id) BETWEEN 28 AND 116),
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (request_profile_id, version)
);

CREATE TABLE IF NOT EXISTS compatible_request_field_mappings (
  mapping_id TEXT NOT NULL CHECK (mapping_id GLOB 'ocp_request_mapping_*' AND length(mapping_id) BETWEEN 28 AND 116),
  version INTEGER NOT NULL CHECK (version > 0),
  request_profile_id TEXT NOT NULL,
  request_profile_version INTEGER NOT NULL CHECK (request_profile_version > 0),
  target_path_json TEXT NOT NULL CHECK (json_valid(target_path_json) AND json_type(target_path_json) = 'array'),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (mapping_id, version),
  FOREIGN KEY (request_profile_id, request_profile_version)
    REFERENCES compatible_request_profiles(request_profile_id, version) ON DELETE RESTRICT,
  UNIQUE (request_profile_id, request_profile_version, target_path_json)
);

CREATE INDEX IF NOT EXISTS idx_compatible_request_mapping_profile
  ON compatible_request_field_mappings(request_profile_id, request_profile_version);

CREATE TABLE IF NOT EXISTS compatible_reasoning_mappings (
  mapping_id TEXT NOT NULL CHECK (mapping_id GLOB 'ocp_reasoning_mapping_*' AND length(mapping_id) BETWEEN 30 AND 118),
  version INTEGER NOT NULL CHECK (version > 0),
  mode TEXT NOT NULL CHECK (mode IN ('custom_preferred_with_builtin_fallback', 'custom_only')),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (mapping_id, version)
);

CREATE TABLE IF NOT EXISTS compatible_inline_policies (
  inline_policy_id TEXT NOT NULL CHECK (inline_policy_id GLOB 'ocp_inline_policy_*' AND length(inline_policy_id) BETWEEN 26 AND 114),
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (inline_policy_id, version)
);

CREATE TABLE IF NOT EXISTS compatible_response_profiles (
  response_profile_id TEXT NOT NULL CHECK (response_profile_id GLOB 'ocp_response_profile_*' AND length(response_profile_id) BETWEEN 29 AND 117),
  version INTEGER NOT NULL CHECK (version > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  reasoning_mapping_id TEXT NOT NULL,
  reasoning_mapping_version INTEGER NOT NULL CHECK (reasoning_mapping_version > 0),
  inline_policy_id TEXT NOT NULL,
  inline_policy_version INTEGER NOT NULL CHECK (inline_policy_version > 0),
  config_json TEXT NOT NULL CHECK (json_valid(config_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (response_profile_id, version),
  FOREIGN KEY (reasoning_mapping_id, reasoning_mapping_version)
    REFERENCES compatible_reasoning_mappings(mapping_id, version) ON DELETE RESTRICT,
  FOREIGN KEY (inline_policy_id, inline_policy_version)
    REFERENCES compatible_inline_policies(inline_policy_id, version) ON DELETE RESTRICT,
  UNIQUE (
    response_profile_id, version,
    reasoning_mapping_id, reasoning_mapping_version,
    inline_policy_id, inline_policy_version
  )
);

CREATE TABLE IF NOT EXISTS compatible_endpoint_revisions (
  endpoint_revision_id TEXT PRIMARY KEY CHECK (endpoint_revision_id GLOB 'ocp_endpoint_*' AND length(endpoint_revision_id) BETWEEN 21 AND 109),
  provider_instance_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  base_url TEXT NOT NULL CHECK (
    length(trim(base_url)) BETWEEN 8 AND 2048 AND
    instr(base_url, '@') = 0
  ),
  allow_insecure_http INTEGER NOT NULL CHECK (allow_insecure_http IN (0, 1)),
  security_policy TEXT NOT NULL CHECK (security_policy IN ('compatibility_first', 'strict_ssrf')),
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('none', 'bearer', 'basic', 'custom_headers')),
  credential_version_ref TEXT,
  auth_config_json TEXT NOT NULL CHECK (json_valid(auth_config_json)),
  ordinary_headers_json TEXT NOT NULL CHECK (json_valid(ordinary_headers_json) AND json_type(ordinary_headers_json) = 'array'),
  sensitive_header_refs_json TEXT NOT NULL CHECK (json_valid(sensitive_header_refs_json) AND json_type(sensitive_header_refs_json) = 'array'),
  query_json TEXT NOT NULL CHECK (json_valid(query_json) AND json_type(query_json) = 'array'),
  request_profile_id TEXT NOT NULL,
  request_profile_version INTEGER NOT NULL CHECK (request_profile_version > 0),
  response_profile_id TEXT NOT NULL,
  response_profile_version INTEGER NOT NULL CHECK (response_profile_version > 0),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  FOREIGN KEY (provider_instance_id) REFERENCES compatible_provider_instances(provider_instance_id) ON DELETE RESTRICT,
  FOREIGN KEY (provider_instance_id, credential_version_ref)
    REFERENCES compatible_credential_descriptors(provider_instance_id, credential_version_ref) ON DELETE RESTRICT,
  FOREIGN KEY (request_profile_id, request_profile_version)
    REFERENCES compatible_request_profiles(request_profile_id, version) ON DELETE RESTRICT,
  FOREIGN KEY (response_profile_id, response_profile_version)
    REFERENCES compatible_response_profiles(response_profile_id, version) ON DELETE RESTRICT,
  UNIQUE (provider_instance_id, revision),
  UNIQUE (provider_instance_id, endpoint_revision_id),
  UNIQUE (
    endpoint_revision_id, provider_instance_id, credential_version_ref,
    request_profile_id, request_profile_version,
    response_profile_id, response_profile_version
  ),
  CHECK (
    (auth_mode = 'none' AND credential_version_ref IS NULL) OR
    (auth_mode != 'none' AND credential_version_ref IS NOT NULL)
  ),
  CHECK (
    base_url LIKE 'https://%' OR
    (allow_insecure_http = 1 AND base_url LIKE 'http://%')
  )
);

CREATE INDEX IF NOT EXISTS idx_compatible_endpoint_provider_revision
  ON compatible_endpoint_revisions(provider_instance_id, revision DESC);

CREATE TABLE IF NOT EXISTS compatible_catalog_snapshots (
  snapshot_id TEXT PRIMARY KEY CHECK (snapshot_id GLOB 'ocp_catalog_snapshot_*' AND length(snapshot_id) BETWEEN 29 AND 117),
  provider_instance_id TEXT NOT NULL,
  snapshot_sequence INTEGER NOT NULL CHECK (snapshot_sequence > 0),
  observed_at_ms INTEGER NOT NULL CHECK (observed_at_ms >= 0),
  model_count INTEGER NOT NULL CHECK (model_count >= 0),
  checksum TEXT CHECK (checksum IS NULL OR length(checksum) BETWEEN 1 AND 256),
  metadata_json TEXT CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  FOREIGN KEY (provider_instance_id) REFERENCES compatible_provider_instances(provider_instance_id) ON DELETE RESTRICT,
  UNIQUE (provider_instance_id, snapshot_sequence),
  UNIQUE (provider_instance_id, snapshot_id)
);

CREATE TABLE IF NOT EXISTS compatible_model_records (
  provider_instance_id TEXT NOT NULL,
  model_id TEXT NOT NULL CHECK (length(trim(model_id)) BETWEEN 1 AND 512),
  source TEXT NOT NULL CHECK (source IN ('remote_sync', 'manual')),
  record_state TEXT NOT NULL CHECK (record_state IN ('active', 'stale')),
  snapshot_id TEXT,
  metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  PRIMARY KEY (provider_instance_id, model_id, source),
  FOREIGN KEY (provider_instance_id) REFERENCES compatible_provider_instances(provider_instance_id) ON DELETE RESTRICT,
  FOREIGN KEY (provider_instance_id, snapshot_id)
    REFERENCES compatible_catalog_snapshots(provider_instance_id, snapshot_id) ON DELETE RESTRICT,
  CHECK (
    (source = 'remote_sync' AND snapshot_id IS NOT NULL) OR
    (source = 'manual' AND snapshot_id IS NULL)
  ),
  CHECK (source = 'remote_sync' OR record_state = 'active')
);

CREATE INDEX IF NOT EXISTS idx_compatible_model_provider_model
  ON compatible_model_records(provider_instance_id, model_id);
CREATE INDEX IF NOT EXISTS idx_compatible_model_provider_state
  ON compatible_model_records(provider_instance_id, record_state, model_id);
CREATE INDEX IF NOT EXISTS idx_compatible_model_snapshot
  ON compatible_model_records(provider_instance_id, snapshot_id);

CREATE TABLE IF NOT EXISTS compatible_catalog_sync_state (
  provider_instance_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('never', 'syncing', 'success', 'empty_success', 'failed', 'backoff')),
  last_attempt_at_ms INTEGER,
  last_success_at_ms INTEGER,
  last_success_snapshot_id TEXT,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  backoff_until_ms INTEGER,
  diagnostics_json TEXT CHECK (diagnostics_json IS NULL OR json_valid(diagnostics_json)),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  FOREIGN KEY (provider_instance_id) REFERENCES compatible_provider_instances(provider_instance_id) ON DELETE RESTRICT,
  FOREIGN KEY (provider_instance_id, last_success_snapshot_id)
    REFERENCES compatible_catalog_snapshots(provider_instance_id, snapshot_id) ON DELETE RESTRICT,
  CHECK (last_attempt_at_ms IS NULL OR last_attempt_at_ms >= 0),
  CHECK (last_success_at_ms IS NULL OR last_success_at_ms >= 0),
  CHECK (backoff_until_ms IS NULL OR backoff_until_ms >= 0)
);

CREATE TABLE IF NOT EXISTS compatible_discovered_fields (
  provider_instance_id TEXT NOT NULL,
  response_profile_id TEXT NOT NULL,
  profile_version INTEGER NOT NULL CHECK (profile_version > 0),
  stream_path TEXT NOT NULL CHECK (length(trim(stream_path)) BETWEEN 1 AND 1024),
  state TEXT NOT NULL CHECK (state IN ('candidate', 'ignored', 'confirmed')),
  aggregate_json TEXT NOT NULL CHECK (json_valid(aggregate_json)),
  occurrence_count INTEGER NOT NULL CHECK (occurrence_count > 0),
  first_observed_at_ms INTEGER NOT NULL CHECK (first_observed_at_ms >= 0),
  last_observed_at_ms INTEGER NOT NULL CHECK (last_observed_at_ms >= first_observed_at_ms),
  PRIMARY KEY (provider_instance_id, response_profile_id, profile_version, stream_path),
  FOREIGN KEY (provider_instance_id) REFERENCES compatible_provider_instances(provider_instance_id) ON DELETE RESTRICT,
  FOREIGN KEY (response_profile_id, profile_version)
    REFERENCES compatible_response_profiles(response_profile_id, version) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_compatible_discovered_state
  ON compatible_discovered_fields(provider_instance_id, state, last_observed_at_ms DESC);

CREATE TABLE IF NOT EXISTS compatible_route_provenance (
  route_provenance_id TEXT PRIMARY KEY CHECK (route_provenance_id GLOB 'ocp_route_*' AND length(route_provenance_id) BETWEEN 18 AND 106),
  request_id TEXT NOT NULL UNIQUE CHECK (length(trim(request_id)) BETWEEN 1 AND 256),
  request_message_id TEXT NOT NULL,
  protocol_key TEXT NOT NULL CHECK (protocol_key = 'openai_chat_compatible'),
  provider_instance_id TEXT NOT NULL,
  model_id TEXT NOT NULL CHECK (length(trim(model_id)) BETWEEN 1 AND 512),
  endpoint_revision_id TEXT NOT NULL,
  credential_version_ref TEXT,
  request_profile_id TEXT NOT NULL,
  request_profile_version INTEGER NOT NULL CHECK (request_profile_version > 0),
  response_profile_id TEXT NOT NULL,
  response_profile_version INTEGER NOT NULL CHECK (response_profile_version > 0),
  reasoning_mapping_id TEXT NOT NULL,
  reasoning_mapping_version INTEGER NOT NULL CHECK (reasoning_mapping_version > 0),
  reasoning_mode TEXT NOT NULL CHECK (reasoning_mode IN ('custom_preferred_with_builtin_fallback', 'custom_only')),
  inline_policy_id TEXT NOT NULL,
  inline_policy_version INTEGER NOT NULL CHECK (inline_policy_version > 0),
  state TEXT NOT NULL CHECK (state IN ('prepared', 'streaming', 'completed', 'failed', 'aborted', 'interrupted')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  terminal_at_ms INTEGER,
  FOREIGN KEY (request_message_id) REFERENCES message(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_instance_id) REFERENCES compatible_provider_instances(provider_instance_id) ON DELETE RESTRICT,
  FOREIGN KEY (provider_instance_id, endpoint_revision_id)
    REFERENCES compatible_endpoint_revisions(provider_instance_id, endpoint_revision_id) ON DELETE RESTRICT,
  FOREIGN KEY (
    endpoint_revision_id, provider_instance_id, credential_version_ref,
    request_profile_id, request_profile_version,
    response_profile_id, response_profile_version
  ) REFERENCES compatible_endpoint_revisions(
    endpoint_revision_id, provider_instance_id, credential_version_ref,
    request_profile_id, request_profile_version,
    response_profile_id, response_profile_version
  ) ON DELETE RESTRICT,
  FOREIGN KEY (provider_instance_id, credential_version_ref)
    REFERENCES compatible_credential_descriptors(provider_instance_id, credential_version_ref) ON DELETE RESTRICT,
  FOREIGN KEY (request_profile_id, request_profile_version)
    REFERENCES compatible_request_profiles(request_profile_id, version) ON DELETE RESTRICT,
  FOREIGN KEY (response_profile_id, response_profile_version)
    REFERENCES compatible_response_profiles(response_profile_id, version) ON DELETE RESTRICT,
  FOREIGN KEY (
    response_profile_id, response_profile_version,
    reasoning_mapping_id, reasoning_mapping_version,
    inline_policy_id, inline_policy_version
  ) REFERENCES compatible_response_profiles(
    response_profile_id, version,
    reasoning_mapping_id, reasoning_mapping_version,
    inline_policy_id, inline_policy_version
  ) ON DELETE RESTRICT,
  FOREIGN KEY (reasoning_mapping_id, reasoning_mapping_version)
    REFERENCES compatible_reasoning_mappings(mapping_id, version) ON DELETE RESTRICT,
  FOREIGN KEY (inline_policy_id, inline_policy_version)
    REFERENCES compatible_inline_policies(inline_policy_id, version) ON DELETE RESTRICT,
  CHECK (
    (state IN ('prepared', 'streaming') AND terminal_at_ms IS NULL) OR
    (state IN ('completed', 'failed', 'aborted', 'interrupted') AND terminal_at_ms = updated_at_ms)
  )
);

CREATE INDEX IF NOT EXISTS idx_compatible_route_instance_model
  ON compatible_route_provenance(provider_instance_id, model_id, created_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_compatible_route_message
  ON compatible_route_provenance(request_message_id);

CREATE TABLE IF NOT EXISTS compatible_route_choices (
  route_provenance_id TEXT NOT NULL,
  choice_index INTEGER NOT NULL CHECK (choice_index >= 0 AND choice_index <= 1024),
  message_id TEXT NOT NULL UNIQUE,
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (route_provenance_id, choice_index),
  FOREIGN KEY (route_provenance_id) REFERENCES compatible_route_provenance(route_provenance_id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES message(id) ON DELETE CASCADE,
  UNIQUE (route_provenance_id, choice_index, message_id)
);

CREATE TABLE IF NOT EXISTS compatible_tool_calls (
  route_provenance_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  choice_index INTEGER NOT NULL CHECK (choice_index >= 0 AND choice_index <= 1024),
  tool_index INTEGER NOT NULL CHECK (tool_index >= 0 AND tool_index <= 1024),
  tool_call_id TEXT CHECK (tool_call_id IS NULL OR length(tool_call_id) BETWEEN 1 AND 256),
  tool_type TEXT CHECK (tool_type IS NULL OR tool_type = 'function'),
  function_name TEXT CHECK (function_name IS NULL OR length(function_name) BETWEEN 1 AND 256),
  arguments_text TEXT NOT NULL CHECK (length(CAST(arguments_text AS BLOB)) <= 1048576),
  arguments_observed INTEGER NOT NULL CHECK (arguments_observed IN (0, 1)),
  arguments_json TEXT CHECK (arguments_json IS NULL OR json_valid(arguments_json)),
  status TEXT NOT NULL CHECK (status IN ('streaming', 'complete', 'malformed', 'incomplete')),
  parse_error_code TEXT CHECK (parse_error_code IS NULL OR length(parse_error_code) BETWEEN 1 AND 128),
  execution_state TEXT NOT NULL CHECK (execution_state = 'not_executed'),
  sequence_start INTEGER NOT NULL CHECK (sequence_start >= 0),
  sequence_end INTEGER NOT NULL CHECK (sequence_end >= sequence_start),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  CHECK (
    (status = 'streaming' AND arguments_json IS NULL AND parse_error_code IS NULL) OR
    (status = 'complete' AND tool_call_id IS NOT NULL AND tool_type = 'function' AND function_name IS NOT NULL
      AND arguments_observed = 1 AND arguments_json IS NOT NULL AND json_type(arguments_json) = 'object'
      AND arguments_json = arguments_text AND parse_error_code IS NULL) OR
    (status IN ('malformed', 'incomplete') AND arguments_json IS NULL AND parse_error_code IS NOT NULL)
  ),
  PRIMARY KEY (message_id, choice_index, tool_index),
  FOREIGN KEY (route_provenance_id, choice_index, message_id)
    REFERENCES compatible_route_choices(route_provenance_id, choice_index, message_id) ON DELETE CASCADE,
  UNIQUE (route_provenance_id, tool_call_id)
);

CREATE INDEX IF NOT EXISTS idx_compatible_tool_call_route_choice
  ON compatible_tool_calls(route_provenance_id, choice_index, tool_index);

CREATE TABLE IF NOT EXISTS compatible_tool_results (
  tool_result_message_id TEXT PRIMARY KEY,
  route_provenance_id TEXT NOT NULL,
  tool_call_id TEXT NOT NULL,
  content_json TEXT NOT NULL CHECK (json_valid(content_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  FOREIGN KEY (tool_result_message_id) REFERENCES message(id) ON DELETE CASCADE,
  FOREIGN KEY (route_provenance_id, tool_call_id)
    REFERENCES compatible_tool_calls(route_provenance_id, tool_call_id) ON DELETE CASCADE,
  UNIQUE (route_provenance_id, tool_call_id)
);

CREATE TABLE IF NOT EXISTS compatible_raw_extension_records (
  record_id TEXT PRIMARY KEY CHECK (record_id GLOB 'ocp_raw_extension_*' AND length(record_id) BETWEEN 26 AND 114),
  route_provenance_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  choice_index INTEGER NOT NULL CHECK (choice_index >= 0 AND choice_index <= 1024),
  response_profile_id TEXT NOT NULL,
  response_profile_version INTEGER NOT NULL CHECK (response_profile_version > 0),
  source_path TEXT NOT NULL CHECK (length(trim(source_path)) BETWEEN 1 AND 1024),
  sequence_start INTEGER NOT NULL CHECK (sequence_start >= 0),
  sequence_end INTEGER NOT NULL CHECK (sequence_end >= sequence_start),
  extension_kind TEXT NOT NULL CHECK (extension_kind IN ('append', 'snapshot')),
  semantic TEXT NOT NULL CHECK (semantic IN ('reasoning', 'diagnostic')),
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  value_bytes INTEGER NOT NULL CHECK (value_bytes BETWEEN 0 AND 16384),
  redaction_state TEXT NOT NULL CHECK (redaction_state IN ('redacted', 'truncated_redacted', 'dropped')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  FOREIGN KEY (route_provenance_id, choice_index, message_id)
    REFERENCES compatible_route_choices(route_provenance_id, choice_index, message_id) ON DELETE CASCADE,
  FOREIGN KEY (response_profile_id, response_profile_version)
    REFERENCES compatible_response_profiles(response_profile_id, version) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_compatible_raw_message_sequence
  ON compatible_raw_extension_records(message_id, choice_index, sequence_start);
CREATE INDEX IF NOT EXISTS idx_compatible_raw_route
  ON compatible_raw_extension_records(route_provenance_id, choice_index);

CREATE TABLE IF NOT EXISTS compatible_reasoning_choice_state (
  route_provenance_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  choice_index INTEGER NOT NULL CHECK (choice_index BETWEEN 0 AND 1024),
  reasoning_mapping_id TEXT NOT NULL,
  reasoning_mapping_version INTEGER NOT NULL CHECK (reasoning_mapping_version > 0),
  mode TEXT NOT NULL CHECK (mode IN ('custom_preferred_with_builtin_fallback', 'custom_only')),
  status TEXT NOT NULL CHECK (status IN ('unselected', 'locked', 'terminal')),
  locked_source TEXT CHECK (locked_source IS NULL OR locked_source IN ('custom', 'reasoning', 'reasoning_content', 'thinking', 'inline')),
  locked_source_key TEXT CHECK (locked_source_key IS NULL OR length(locked_source_key) BETWEEN 1 AND 1280),
  reasoning_text TEXT NOT NULL CHECK (length(CAST(reasoning_text AS BLOB)) <= 1048576),
  segment_ids_json TEXT NOT NULL CHECK (json_valid(segment_ids_json) AND json_type(segment_ids_json) = 'array'),
  conflicts_json TEXT NOT NULL CHECK (json_valid(conflicts_json) AND json_type(conflicts_json) = 'array'),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  PRIMARY KEY (route_provenance_id, choice_index),
  FOREIGN KEY (route_provenance_id, choice_index, message_id)
    REFERENCES compatible_route_choices(route_provenance_id, choice_index, message_id) ON DELETE CASCADE,
  FOREIGN KEY (reasoning_mapping_id, reasoning_mapping_version)
    REFERENCES compatible_reasoning_mappings(mapping_id, version) ON DELETE RESTRICT,
  CHECK ((status = 'unselected' AND locked_source IS NULL AND locked_source_key IS NULL AND reasoning_text = '') OR (status IN ('locked', 'terminal') AND locked_source IS NOT NULL AND locked_source_key IS NOT NULL)),
  CHECK (
    locked_source IS NULL OR
    (locked_source = 'custom' AND
      substr(locked_source_key, 1, length('custom:' || reasoning_mapping_id || ':' || reasoning_mapping_version || ':')) = ('custom:' || reasoning_mapping_id || ':' || reasoning_mapping_version || ':') AND
      length(locked_source_key) > length('custom:' || reasoning_mapping_id || ':' || reasoning_mapping_version || ':')) OR
    (locked_source = 'inline' AND substr(locked_source_key, 1, 7) = 'inline:' AND length(locked_source_key) > 7) OR
    (locked_source NOT IN ('custom', 'inline') AND locked_source_key = locked_source)
  )
);

CREATE TABLE IF NOT EXISTS compatible_choice_display_projections (
  route_provenance_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  choice_index INTEGER NOT NULL CHECK (choice_index BETWEEN 0 AND 1024),
  checkpoint_version INTEGER NOT NULL CHECK (checkpoint_version = 1),
  status TEXT NOT NULL CHECK (status IN ('streaming', 'completed', 'failed', 'aborted', 'interrupted')),
  last_sequence INTEGER NOT NULL CHECK (last_sequence >= 0),
  projection_json TEXT NOT NULL CHECK (json_valid(projection_json) AND json_type(projection_json) = 'object' AND length(CAST(projection_json AS BLOB)) <= 33554432),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= 0),
  terminal_at_ms INTEGER,
  PRIMARY KEY (route_provenance_id, choice_index),
  FOREIGN KEY (route_provenance_id, choice_index, message_id)
    REFERENCES compatible_route_choices(route_provenance_id, choice_index, message_id) ON DELETE CASCADE,
  CHECK (json_extract(projection_json, '$.routeProvenanceId') = route_provenance_id),
  CHECK (json_extract(projection_json, '$.messageId') = message_id),
  CHECK (json_extract(projection_json, '$.choiceIndex') = choice_index),
  CHECK (json_extract(projection_json, '$.status') = status),
  CHECK (json_extract(projection_json, '$.lastSequence') = last_sequence),
  CHECK ((status = 'streaming' AND terminal_at_ms IS NULL) OR (status != 'streaming' AND terminal_at_ms = updated_at_ms))
);

CREATE INDEX IF NOT EXISTS idx_compatible_choice_display_message
  ON compatible_choice_display_projections(message_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_compatible_choice_display_response_usage
  ON compatible_choice_display_projections(route_provenance_id)
  WHERE json_extract(projection_json, '$.usage.scope') = 'response';

CREATE TRIGGER IF NOT EXISTS trg_compatible_choice_display_monotonic
BEFORE UPDATE ON compatible_choice_display_projections
WHEN
  new.route_provenance_id IS NOT old.route_provenance_id OR
  new.message_id IS NOT old.message_id OR
  new.choice_index IS NOT old.choice_index OR
  new.checkpoint_version IS NOT old.checkpoint_version OR
  new.last_sequence < old.last_sequence OR
  new.updated_at_ms < old.updated_at_ms OR
  old.status != 'streaming'
BEGIN
  SELECT RAISE(ABORT, 'compatible display projection identity/state is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_reasoning_choice_monotonic
BEFORE UPDATE ON compatible_reasoning_choice_state
WHEN
  new.route_provenance_id IS NOT old.route_provenance_id OR
  new.message_id IS NOT old.message_id OR
  new.choice_index IS NOT old.choice_index OR
  new.reasoning_mapping_id IS NOT old.reasoning_mapping_id OR
  new.reasoning_mapping_version IS NOT old.reasoning_mapping_version OR
  new.mode IS NOT old.mode OR
  (old.locked_source IS NOT NULL AND (new.locked_source IS NOT old.locked_source OR new.locked_source_key IS NOT old.locked_source_key)) OR
  (old.status = 'terminal' AND new.status IS NOT 'terminal') OR
  (old.status = 'terminal' AND (new.locked_source IS NOT old.locked_source OR new.locked_source_key IS NOT old.locked_source_key OR new.reasoning_text IS NOT old.reasoning_text OR new.segment_ids_json IS NOT old.segment_ids_json OR new.conflicts_json IS NOT old.conflicts_json OR new.updated_at_ms IS NOT old.updated_at_ms)) OR
  (old.status = 'locked' AND new.status = 'unselected')
BEGIN
  SELECT RAISE(ABORT, 'compatible reasoning choice identity/state is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_reasoning_choice_route_pin_insert
BEFORE INSERT ON compatible_reasoning_choice_state
WHEN NOT EXISTS (
  SELECT 1 FROM compatible_route_provenance route
  WHERE route.route_provenance_id = new.route_provenance_id
    AND route.reasoning_mapping_id = new.reasoning_mapping_id
    AND route.reasoning_mapping_version = new.reasoning_mapping_version
    AND route.reasoning_mode = new.mode
)
BEGIN
  SELECT RAISE(ABORT, 'compatible reasoning choice must match route mapping pin');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_credential_descriptor_identity_immutable
BEFORE UPDATE ON compatible_credential_descriptors
WHEN
  new.credential_version_ref IS NOT old.credential_version_ref OR
  new.provider_instance_id IS NOT old.provider_instance_id OR
  new.version IS NOT old.version OR
  new.auth_mode IS NOT old.auth_mode OR
  new.backend IS NOT old.backend OR
  new.masked_summary_json IS NOT old.masked_summary_json OR
  new.created_at_ms IS NOT old.created_at_ms
BEGIN
  SELECT RAISE(ABORT, 'compatible credential descriptor versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_endpoint_revision_immutable
BEFORE UPDATE ON compatible_endpoint_revisions
BEGIN
  SELECT RAISE(ABORT, 'compatible endpoint revisions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_request_profile_immutable
BEFORE UPDATE ON compatible_request_profiles
BEGIN
  SELECT RAISE(ABORT, 'compatible request profile versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_request_mapping_immutable
BEFORE UPDATE ON compatible_request_field_mappings
BEGIN
  SELECT RAISE(ABORT, 'compatible request field mapping versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_reasoning_mapping_immutable
BEFORE UPDATE ON compatible_reasoning_mappings
BEGIN
  SELECT RAISE(ABORT, 'compatible reasoning mapping versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_inline_policy_immutable
BEFORE UPDATE ON compatible_inline_policies
BEGIN
  SELECT RAISE(ABORT, 'compatible inline policy versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_response_profile_immutable
BEFORE UPDATE ON compatible_response_profiles
BEGIN
  SELECT RAISE(ABORT, 'compatible response profile versions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_catalog_snapshot_immutable
BEFORE UPDATE ON compatible_catalog_snapshots
BEGIN
  SELECT RAISE(ABORT, 'compatible catalog snapshots are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_route_provenance_pin_immutable
BEFORE UPDATE ON compatible_route_provenance
WHEN
  new.route_provenance_id IS NOT old.route_provenance_id OR
  new.request_id IS NOT old.request_id OR
  new.request_message_id IS NOT old.request_message_id OR
  new.protocol_key IS NOT old.protocol_key OR
  new.provider_instance_id IS NOT old.provider_instance_id OR
  new.model_id IS NOT old.model_id OR
  new.endpoint_revision_id IS NOT old.endpoint_revision_id OR
  new.credential_version_ref IS NOT old.credential_version_ref OR
  new.request_profile_id IS NOT old.request_profile_id OR
  new.request_profile_version IS NOT old.request_profile_version OR
  new.response_profile_id IS NOT old.response_profile_id OR
  new.response_profile_version IS NOT old.response_profile_version OR
  new.reasoning_mapping_id IS NOT old.reasoning_mapping_id OR
  new.reasoning_mapping_version IS NOT old.reasoning_mapping_version OR
  new.reasoning_mode IS NOT old.reasoning_mode OR
  new.inline_policy_id IS NOT old.inline_policy_id OR
  new.inline_policy_version IS NOT old.inline_policy_version OR
  new.created_at_ms IS NOT old.created_at_ms
BEGIN
  SELECT RAISE(ABORT, 'compatible route provenance pin is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_route_initial_state
BEFORE INSERT ON compatible_route_provenance
WHEN new.state != 'prepared' OR new.updated_at_ms != new.created_at_ms OR new.terminal_at_ms IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'compatible route provenance must start prepared');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_route_request_message_valid
BEFORE INSERT ON compatible_route_provenance
WHEN NOT EXISTS (
  SELECT 1 FROM message request_message
  WHERE request_message.id = new.request_message_id
    AND request_message.role = 'user'
)
BEGIN
  SELECT RAISE(ABORT, 'compatible route request message must be a persisted user message');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_route_pin_consistent
BEFORE INSERT ON compatible_route_provenance
WHEN
  NOT EXISTS (
    SELECT 1 FROM compatible_endpoint_revisions endpoint
    WHERE endpoint.endpoint_revision_id = new.endpoint_revision_id
      AND endpoint.provider_instance_id = new.provider_instance_id
      AND endpoint.credential_version_ref IS new.credential_version_ref
      AND endpoint.request_profile_id = new.request_profile_id
      AND endpoint.request_profile_version = new.request_profile_version
      AND endpoint.response_profile_id = new.response_profile_id
      AND endpoint.response_profile_version = new.response_profile_version
  ) OR
  NOT EXISTS (
    SELECT 1 FROM compatible_response_profiles profile
    JOIN compatible_reasoning_mappings reasoning
      ON reasoning.mapping_id = profile.reasoning_mapping_id
      AND reasoning.version = profile.reasoning_mapping_version
    WHERE profile.response_profile_id = new.response_profile_id
      AND profile.version = new.response_profile_version
      AND profile.reasoning_mapping_id = new.reasoning_mapping_id
      AND profile.reasoning_mapping_version = new.reasoning_mapping_version
      AND reasoning.mode = new.reasoning_mode
      AND profile.inline_policy_id = new.inline_policy_id
      AND profile.inline_policy_version = new.inline_policy_version
  )
BEGIN
  SELECT RAISE(ABORT, 'compatible route provenance pin is inconsistent');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_route_state_transition
BEFORE UPDATE ON compatible_route_provenance
WHEN NOT (
  (
    new.state = old.state AND
    new.updated_at_ms = old.updated_at_ms AND
    new.terminal_at_ms IS old.terminal_at_ms
  ) OR
  (
    old.state = 'prepared' AND new.state = 'streaming' AND
    new.updated_at_ms >= old.updated_at_ms AND new.terminal_at_ms IS NULL
  ) OR
  (
    old.state = 'prepared' AND new.state IN ('aborted', 'interrupted') AND
    new.updated_at_ms >= old.updated_at_ms AND new.terminal_at_ms = new.updated_at_ms
  ) OR
  (
    old.state = 'streaming' AND new.state IN ('completed', 'failed', 'aborted', 'interrupted') AND
    new.updated_at_ms >= old.updated_at_ms AND new.terminal_at_ms = new.updated_at_ms
  )
)
BEGIN
  SELECT RAISE(ABORT, 'invalid compatible route provenance state transition');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_route_choice_message_valid
BEFORE INSERT ON compatible_route_choices
WHEN NOT EXISTS (
  SELECT 1
  FROM compatible_route_provenance route
  JOIN message request_message ON request_message.id = route.request_message_id
  JOIN message choice_message ON choice_message.id = new.message_id
  WHERE route.route_provenance_id = new.route_provenance_id
    AND choice_message.role = 'assistant'
    AND choice_message.convo_id = request_message.convo_id
)
BEGIN
  SELECT RAISE(ABORT, 'compatible route choice must be an assistant message in the request conversation');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_route_choice_immutable
BEFORE UPDATE ON compatible_route_choices
BEGIN
  SELECT RAISE(ABORT, 'compatible route choices are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_tool_call_identity_immutable
BEFORE UPDATE ON compatible_tool_calls
WHEN old.route_provenance_id <> new.route_provenance_id
  OR old.message_id <> new.message_id
  OR old.choice_index <> new.choice_index
  OR old.tool_index <> new.tool_index
  OR old.sequence_start <> new.sequence_start
  OR old.created_at_ms <> new.created_at_ms
  OR old.execution_state <> new.execution_state
BEGIN
  SELECT RAISE(ABORT, 'compatible tool call identity is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_tool_call_monotonic
BEFORE UPDATE ON compatible_tool_calls
WHEN new.sequence_end < old.sequence_end
  OR new.updated_at_ms < old.updated_at_ms
  OR (old.tool_type IS NOT NULL AND (new.tool_type IS NULL OR new.tool_type <> old.tool_type))
  OR (old.tool_call_id IS NOT NULL AND (new.tool_call_id IS NULL OR substr(new.tool_call_id, 1, length(old.tool_call_id)) <> old.tool_call_id))
  OR (old.function_name IS NOT NULL AND (new.function_name IS NULL OR substr(new.function_name, 1, length(old.function_name)) <> old.function_name))
  OR substr(new.arguments_text, 1, length(old.arguments_text)) <> old.arguments_text
BEGIN
  SELECT RAISE(ABORT, 'compatible tool call updates must be monotonic');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_tool_call_terminal_immutable
BEFORE UPDATE ON compatible_tool_calls
WHEN old.status <> 'streaming'
BEGIN
  SELECT RAISE(ABORT, 'compatible terminal tool calls are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_tool_call_arguments_bounded_insert
BEFORE INSERT ON compatible_tool_calls
WHEN new.status = 'complete' AND (
  (SELECT count(*) FROM json_tree(new.arguments_json)) > 100000 OR
  EXISTS (
    WITH RECURSIVE depths(id, depth) AS (
      SELECT id, 0 FROM json_tree(new.arguments_json) WHERE parent IS NULL
      UNION ALL
      SELECT child.id, depths.depth + 1
      FROM json_tree(new.arguments_json) child
      JOIN depths ON child.parent = depths.id
      WHERE depths.depth < 65
    )
    SELECT 1 FROM depths WHERE depth > 64
  )
)
BEGIN
  SELECT RAISE(ABORT, 'compatible tool arguments exceed structural limits');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_tool_call_arguments_bounded_update
BEFORE UPDATE ON compatible_tool_calls
WHEN new.status = 'complete' AND (
  (SELECT count(*) FROM json_tree(new.arguments_json)) > 100000 OR
  EXISTS (
    WITH RECURSIVE depths(id, depth) AS (
      SELECT id, 0 FROM json_tree(new.arguments_json) WHERE parent IS NULL
      UNION ALL
      SELECT child.id, depths.depth + 1
      FROM json_tree(new.arguments_json) child
      JOIN depths ON child.parent = depths.id
      WHERE depths.depth < 65
    )
    SELECT 1 FROM depths WHERE depth > 64
  )
)
BEGIN
  SELECT RAISE(ABORT, 'compatible tool arguments exceed structural limits');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_tool_result_binding_valid
BEFORE INSERT ON compatible_tool_results
WHEN NOT EXISTS (
  SELECT 1
  FROM compatible_tool_calls call
  JOIN message call_message ON call_message.id = call.message_id
  JOIN message result_message ON result_message.id = new.tool_result_message_id
  JOIN message_body result_body ON result_body.message_id = result_message.id
  WHERE call.route_provenance_id = new.route_provenance_id
    AND call.tool_call_id = new.tool_call_id
    AND call.status = 'complete'
    AND result_message.role = 'tool'
    AND result_message.convo_id = call_message.convo_id
    AND result_message.seq > call_message.seq
    AND EXISTS (
      WITH RECURSIVE lineage(id, parent_id, depth) AS (
        SELECT id, parent_id, 0 FROM message WHERE id = new.tool_result_message_id
        UNION ALL
        SELECT parent.id, parent.parent_id, lineage.depth + 1
        FROM message parent
        JOIN lineage ON parent.id = lineage.parent_id
        WHERE lineage.depth < 1024
      )
      SELECT 1 FROM lineage WHERE id = call.message_id
    )
    AND result_body.body = CASE
      WHEN json_type(new.content_json) = 'text' THEN json_extract(new.content_json, '$')
      ELSE new.content_json
    END
)
BEGIN
  SELECT RAISE(ABORT, 'compatible tool result binding is invalid');
END;

CREATE TRIGGER IF NOT EXISTS trg_compatible_tool_result_immutable
BEFORE UPDATE ON compatible_tool_results
BEGIN
  SELECT RAISE(ABORT, 'compatible tool results are immutable');
END;
