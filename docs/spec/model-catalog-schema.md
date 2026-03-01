# Model Catalog Schema（可执行 DDL）

更新日期：2026-02-17  
适用范围：Catalog 阶段 2（开发态删库重建）

## 1. 目标

本文件将 Catalog 表结构规范收敛为可执行 DDL，并与 `infra/db/schema.sql` 的 Catalog 段保持一致。  
阶段目标：在不做迁移兼容的前提下，一次性落地模型级可查询列与复合索引，保障 `syncCoreSnapshot` 写入与 `queryCore` 组合筛选性能。

## 2. 单一 DDL 落点与重建机制

- 执行脚本：`infra/db/schema.sql`
- Schema 版本：`infra/db/schemaVersion.ts`（当前 `DB_SCHEMA_VERSION = 7`）
- 重建触发：开发态 `user_version != DB_SCHEMA_VERSION` 时默认删库重建（见 `docs/spec/db-rebuild-strategy-dev.md`）

## 3. Catalog DDL（执行版）

```sql
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
  model_id TEXT NOT NULL CHECK (length(model_id) > 0),
  endpoint_key TEXT NOT NULL CHECK (length(endpoint_key) > 0),
  provider_name TEXT,
  tag TEXT,
  quantization TEXT,
  max_completion_tokens INTEGER,
  max_prompt_tokens INTEGER,
  supported_parameters_json TEXT,
  supports_implicit_caching INTEGER CHECK (supports_implicit_caching IN (0, 1)),
  status INTEGER,
  raw_json TEXT,
  fetched_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  PRIMARY KEY (provider_key, model_id, endpoint_key),
  FOREIGN KEY(provider_key, model_id) REFERENCES models(provider_key, model_id) ON DELETE CASCADE
);

CREATE VIRTUAL TABLE IF NOT EXISTS models_fts USING fts5(
  provider_key UNINDEXED,
  model_id UNINDEXED,
  display_name,
  canonical_slug,
  description,
  tokenize = 'unicode61'
);
```

## 4. 触发器与索引（执行版）

```sql
CREATE TRIGGER IF NOT EXISTS trg_models_fts_ai
AFTER INSERT ON models
BEGIN
  INSERT INTO models_fts(rowid, provider_key, model_id, display_name, canonical_slug, description)
  VALUES (new.rowid, new.provider_key, new.model_id, coalesce(new.display_name, ''), coalesce(new.canonical_slug, ''), coalesce(new.description, ''));
END;

CREATE TRIGGER IF NOT EXISTS trg_models_fts_au
AFTER UPDATE OF provider_key, model_id, display_name, canonical_slug, description ON models
BEGIN
  DELETE FROM models_fts WHERE rowid = old.rowid;
  INSERT INTO models_fts(rowid, provider_key, model_id, display_name, canonical_slug, description)
  VALUES (new.rowid, new.provider_key, new.model_id, coalesce(new.display_name, ''), coalesce(new.canonical_slug, ''), coalesce(new.description, ''));
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
CREATE INDEX IF NOT EXISTS idx_endpoint_meta_model ON endpoint_meta(provider_key, model_id);
CREATE INDEX IF NOT EXISTS idx_endpoint_meta_fetched_at ON endpoint_meta(provider_key, model_id, fetched_at_ms DESC);
```

## 5. 查询与分页约束

- `queryCore` 默认基础过滤：`provider_key + visibility + status`。
- 过期保护：查询侧附加 `expiration_at_sec IS NULL OR expiration_at_sec > now`，避免同步间隙返回已过期模型。
- keyset 分页稳定 tie-breaker：`model_key`。
  - `name` 排序：`display_name COLLATE NOCASE, model_key`
  - `created_at` 排序：`COALESCE(created_at_sec, 0), model_key`
- FTS 负责全文字段（`display_name/canonical_slug/description`）；`model_id` 精确定位走普通列匹配。

## 6. 设计决策（2.4）

- JSON 对象字段不拆表（阶段 2）：
  - 保留 `*_json` 原文（如 `per_request_limits_json`、`default_parameters_json`）。
  - 高频 contains 查询走派生布尔列（`has_*` / `in_modality_image`）与复合索引。
- Endpoints 详情采用双层缓存：
  - 稳定字段写入 `endpoint_meta`（可离线查看）。
  - 波动性能字段（`uptime/latency/throughput`）只保留内存缓存，不落盘。
  - 盘缓存不做自动 TTL 失效，刷新由用户手动触发。
- 维持可重建优先：通过 `DB_SCHEMA_VERSION` 递增触发开发态删库重建，不做迁移兼容。

## 7. 最小验收步骤

1. 删除本地 DB 或直接启动开发态（触发 mismatch 重建）。
2. 运行：`npx vitest run infra/db/repo/modelCatalogSchema.test.ts`。
3. 运行：`npx vitest run infra/db/repo/modelCatalogRepo.test.ts src/next/modelCatalog/catalogQueryService.test.ts`。
4. 验证查询：组合 `search + vendor + tags + context + price` 过滤，分页无重复。
