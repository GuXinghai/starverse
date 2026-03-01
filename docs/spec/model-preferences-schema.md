# Model Preferences Schema（阶段 3.1）

更新日期：2026-02-17  
适用范围：收藏与最近使用持久化（支持多 scope，阶段 3.1 仅启用 global）

## 1. 目标
- 落地可扩展的 preferences 存储结构。
- 支持 `global/project/conversation` 三种 scope 的 DDL 表达能力。
- 阶段 3.1 运行策略只启用 `global`，为后续扩展预留字段与索引。

## 2. 与重建策略的关系
- DDL 落点：`infra/db/schema.sql`
- 版本锚点：`infra/db/schemaVersion.ts`（本次升级为 `DB_SCHEMA_VERSION = 6`）
- 启动执行语义（代码事实）：
  - Worker 初始化时每次都会执行 `schema.sql`：`DbWorkerRuntime` 构造内 `this.db.exec(readFileSync(schemaPath, 'utf8'))`。见 `infra/db/worker.ts`。
  - 因此新表/索引在非重建启动也会按 `IF NOT EXISTS` 尝试落地。
- 开发态重建：
  - `user_version != DB_SCHEMA_VERSION` 且 `dbExp.rebuildOnSchemaMismatch !== false` 时，启动早期删库重建。
  - 重建后 Worker 使用最新 `schema.sql` 建表并写入当前 schema version。

## 3. 表设计（分表方案）

### 3.1 `model_favorites`
语义：某 scope 下的收藏关系与排序信息。

```sql
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
```

### 3.2 `model_recents`
语义：某 scope 下最近使用关系与使用频次。

```sql
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
```

## 4. 索引设计

### 4.1 Favorites
```sql
CREATE INDEX IF NOT EXISTS idx_model_favorites_scope_sort
  ON model_favorites(scope_type, scope_id, sort_rank ASC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_favorites_scope_updated
  ON model_favorites(scope_type, scope_id, updated_at_ms DESC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_favorites_model_lookup
  ON model_favorites(provider_key, model_id);
CREATE INDEX IF NOT EXISTS idx_model_favorites_global_sort
  ON model_favorites(sort_rank ASC, model_key ASC)
  WHERE scope_type = 'global' AND scope_id = '';
```

### 4.2 Recents
```sql
CREATE INDEX IF NOT EXISTS idx_model_recents_scope_last_used
  ON model_recents(scope_type, scope_id, last_used_at_ms DESC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_recents_scope_use_count
  ON model_recents(scope_type, scope_id, use_count DESC, last_used_at_ms DESC, model_key ASC);
CREATE INDEX IF NOT EXISTS idx_model_recents_model_lookup
  ON model_recents(provider_key, model_id);
CREATE INDEX IF NOT EXISTS idx_model_recents_global_last_used
  ON model_recents(last_used_at_ms DESC, model_key ASC)
  WHERE scope_type = 'global' AND scope_id = '';
```

## 5. 阶段 3.1 启用规则（运行时）
- 允许 schema 接收三种 scope。
- 阶段 3.1 写入端仅写 `scope_type='global'` 且 `scope_id=''`。
- `project/conversation` scope 在后续任务启用，不需要 DDL 变更。

## 6. 约束说明
- 本阶段不建立到 `project/convo/models` 的外键，避免：
  - 归档/恢复或同步波动导致偏好记录被级联删除。
- identity 约束由 `provider_key + model_id + model_key` 内部一致性保证。
- favorites 排序列固定为 `sort_rank`，为后续 `reorderFavorites` 提供稳定批量更新目标列。
- recents 裁剪基于 `last_used_at_ms`（按 scope 排序），`use_count` 作为可选二级排序与策略信号。

## 7. 最小验收步骤
1. 启动应用，确保开发态 schema mismatch 重建完成（或手工删库重启）。
2. 测试环境优先路径（必跑）：
   - `npm run rebuild:node`
   - `npx vitest run infra/db/repo/modelPreferencesSchema.test.ts`
3. 本地 ABI 受阻时兜底验证：
   - 使用 Python sqlite 内存执行 `infra/db/schema.sql`，检查两表与索引存在。
   - 用 `EXPLAIN QUERY PLAN` 验证 scope 查询命中 `idx_model_favorites_scope_sort` 与 `idx_model_recents_scope_last_used`。

## 8. References
- `infra/db/schema.sql`
- `infra/db/schemaVersion.ts`
- `infra/db/worker.ts`
- `docs/spec/db-rebuild-strategy-dev.md`
- `docs/spec/model-preferences-scope.md`
