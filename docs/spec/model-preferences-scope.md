# Model Preferences Scope 与 Key 体系（任务卡 3.0）

## 1. 目标
- 固化收藏（favorite）与最近使用（recent）的 scope 体系与 key 体系。
- 产出可直接指导后续 DDL 与 API 的统一语义，避免 UI/DB 各自解释。

## 2. 先决调查结论（代码事实）

### 2.1 Project 标识符来源与生命周期
- `project.id` 是主键，创建时默认 `randomUUID()`；也支持上层显式传入 id。  
  见 `infra/db/repo/projectRepo.ts`。
- 系统项目 Inbox 使用 `system_key='inbox'` 幂等创建，`id` 同样为 UUID，启动时缓存到 `inboxId`。  
  见 `infra/db/worker.ts`。
- 删除 project 时，`convo.project_id` 因外键约束变为 `NULL`（`ON DELETE SET NULL`）。  
  见 `infra/db/schema.sql`。

### 2.2 Conversation 标识符来源与生命周期
- `convo.id` 是主键，创建时默认 `randomUUID()`；支持上层显式传入 id。  
  见 `infra/db/repo/convoRepo.ts`。
- `convo.create` 在 `projectId` 未指定时会默认写入 `inboxId`。  
  见 `infra/db/worker/handlers/convoMessageHandlers.ts`。
- 归档/恢复使用同一 `convo.id`：归档时从 `convo` 删除并写入 `archive_convo`，恢复时以原 id 写回。  
  见 `infra/db/repo/convoRepo.ts` 与 `infra/db/schema.sql`。

### 2.3 modelKey 组成与稳定性
- 目录主键是 `(provider_key, model_id)`；`model_key` 为唯一列。  
  见 `infra/db/schema.sql`。
- 内部统一规则已经固定：`modelKey = ${providerKey}::${modelId}`（双冒号）。  
  见 `src/shared/modelCatalog/internalSchema.ts`。
- `vendor` 是模型厂商维度（如 `openai`），与 `providerKey`（目录来源，如 `openrouter`）是两个不同维度。  
  见 `src/shared/modelCatalog/openRouterCatalogClient.ts` 与 `infra/db/schema.sql`。

## 3. 方案决策（冻结）

### 3.1 Scope 结构
- 采用单表多 scope（推荐方案，冻结）。
- `scopeType` 枚举固定为：
  - `global`
  - `project`
  - `conversation`
- `scopeId` 规则固定为：
  - `global`: `scopeId = ''`（空字符串）
  - `project`: `scopeId = project.id`
  - `conversation`: `scopeId = convo.id`

### 3.2 模型 identity 与 key 结构
- 偏好记录必须至少包含 `providerKey + modelId`。
- 同时保留 `modelKey`（`providerKey::modelId`）作为读取/调试友好字段。
- `vendor` 不进入偏好主键；`vendor` 仅用于展示与筛选。

### 3.3 收藏与最近使用的统一建模
- 采用一行一模型一 scope 的统一记录（不拆 favorites/recents 多表）：
  - `isFavorite` 表示收藏关系
  - `lastUsedAtMs` + `useCount` 表示最近使用关系
- 主键唯一性：`(scope_type, scope_id, provider_key, model_id)`。

## 4. DDL 指导约束（用于后续实现）

> 本节是约束，不是立即执行变更。

阶段 3.1 物理落地采用分表：
- `model_favorites`
- `model_recents`

本节仅保留统一 key/scope 约束；可执行 DDL 以 `docs/spec/model-preferences-schema.md` 为准。

建议列与约束：
- `scope_type TEXT NOT NULL CHECK (scope_type IN ('global','project','conversation'))`
- `scope_id TEXT NOT NULL DEFAULT ''`
- `provider_key TEXT NOT NULL`
- `model_id TEXT NOT NULL`
- `model_key TEXT NOT NULL`
- `UNIQUE(scope_type, scope_id, model_key)`
- `CHECK(instr(model_key, '::') > 0)`
- `CHECK(model_key = provider_key || '::' || model_id)`
- `is_favorite INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1))`
- `last_used_at_ms INTEGER`
- `use_count INTEGER NOT NULL DEFAULT 1`
- `created_at_ms INTEGER NOT NULL`
- `updated_at_ms INTEGER NOT NULL`
- `PRIMARY KEY (scope_type, scope_id, provider_key, model_id)`
- `CHECK ((scope_type = 'global' AND scope_id = '') OR (scope_type != 'global' AND length(scope_id) > 0))`
- `scope_id` 不对 `project/convo` 建数据库外键（避免 `convo.archive` 触发删除导致偏好丢失）

建议索引：
- `idx_model_prefs_scope_favorite` on `(scope_type, scope_id, is_favorite, updated_at_ms DESC)`
- `idx_model_prefs_scope_recent` on `(scope_type, scope_id, last_used_at_ms DESC, updated_at_ms DESC)`
- `idx_model_prefs_model_lookup` on `(provider_key, model_id)`

## 5. API 契约指导约束（用于后续实现）

### 5.1 Scope 输入
```ts
type PreferenceScope =
  | { scopeType: 'global'; scopeId: '' }
  | { scopeType: 'project'; scopeId: string }
  | { scopeType: 'conversation'; scopeId: string }
```

### 5.2 模型 key 输入
```ts
type PreferenceModelRef = {
  providerKey: string
  modelId: string
  modelKey?: string // 若传入则必须等于 `${providerKey}::${modelId}`
}
```

### 5.3 最小操作语义
- `upsertFavorite(scope, modelRef, favorite: boolean)`
- `touchRecent(scope, modelRef, usedAtMs)`
- `listFavorites(scope)`
- `listRecents(scope, limit)`

返回记录统一带：
- `scopeType`、`scopeId`
- `providerKey`、`modelId`、`modelKey`
- `isFavorite`、`lastUsedAtMs`、`useCount`

## 6. 生命周期与降级规则（冻结）
- `convo.archive` / `convo.restore`：会话级偏好按 `convo.id` 保留，不删除。
- `convo.delete` / `convo.deleteMany`：会话级偏好应同步硬删除（由 repo/handler 显式清理）。
- `project.delete`：项目级偏好应同步硬删除（由 repo/handler 显式清理）。
- Scope 解析失败或 `scopeId` 非法：拒绝写入，返回可观测错误。
- `modelKey` 与 `providerKey/modelId` 不一致：拒绝写入，避免脏数据。
- 模型在 catalog 中 hidden/missing：偏好记录不自动删除，读取时由上层决定是否展示“已隐藏/不可用”状态。
- 当前阶段若存在仅 `modelId` 的历史输入，兼容映射为：
  - `providerKey='openrouter'`
  - `modelId=<legacyValue>`
  - `modelKey='openrouter::<legacyValue>'`

## 7. 落点路径（后续实现指引）
- DDL：`infra/db/schema.sql`
- DDL 细化规范：`docs/spec/model-preferences-schema.md`
- 类型：`infra/db/types.ts`
- Repo：`infra/db/repo/`（新增 `modelPreferencesRepo.ts`）
- Worker handlers：`infra/db/worker/handlers/`
- Query/Service：`src/next/modelCatalog/` 或后续偏好服务模块

## 8. 验收清单
- 文档中 `scopeType`、`scopeId`、key 规则在 DDL/API 两侧一致。
- `global/project/conversation` 三种 scope 无语义冲突。
- `providerKey` 与 `vendor` 语义边界明确且不混用。
- 文档可直接用于下一步 DDL 与接口实现，无需二次猜测。

## 9. References
- `infra/db/schema.sql`
- `infra/db/repo/projectRepo.ts`
- `infra/db/repo/convoRepo.ts`
- `infra/db/worker.ts`
- `infra/db/worker/handlers/convoMessageHandlers.ts`
- `src/shared/modelCatalog/internalSchema.ts`
- `src/shared/modelCatalog/openRouterCatalogClient.ts`

## 10. 阶段 3.8 运行时框架预埋（不启用 UI 入口）

### 10.1 调查结论（代码事实）
- Project 维度：
  - UI 中项目选择状态在 `activeProjectId`，由侧边栏选择事件驱动更新。
  - 对话列表刷新时 `convo.list` 会携带 `projectId` 过滤参数。  
    见 `src/ui-app/AppChatApp.vue`（`activeProjectId`、`onSelectProject`、`refreshConvos`）。
- Conversation 维度：
  - 当前会话 id 在 `activeConvoId`，选中对话或创建新对话后稳定可用。
  - 发送链路在 `ensureActiveConvo()` 后可保证拿到可用的 `convoId`。  
    见 `src/ui-app/AppChatApp.vue`（`activeConvoId`、`onSelectConvo`、`ensureActiveConvo`）。

### 10.2 阶段 3.8 冻结规则
- `ModelPrefsService` 与 DB methods 持续支持 `global/project/conversation` 三种 scope 入参。
- `ChatAppComposer` 允许上层传入 `modelPrefsScope`（框架能力），并将其用于：
  - `listFavorites`
  - `listRecents`
  - `toggleFavorite`
  - `reorderFavorites`
- 阶段 3 UI 仍只传 `global`：
  - `scopeType='global'`
  - `scopeId=''`
- 不提供任何 project/conversation scope 的可见 UI 入口。

### 10.3 验收口径（阶段 3.8）
- 代码层可传入 `project/conversation` scope 并正确下沉到 `dbBridge` 调用参数。
- 默认运行路径保持 global，不改变当前用户可见行为。
