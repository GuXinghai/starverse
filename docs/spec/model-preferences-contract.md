# Model Preferences Contract（阶段 3）

更新日期：2026-02-17  
适用范围：收藏（favorites）与最近使用（recents）的行为契约、scope 语义、失败降级与数据保留策略。

## 1. 目标
- 冻结阶段 3 可见行为，避免后续在细节上反复讨论。
- 统一 UI、service、repo、DB 四层对偏好语义的理解。
- 为后续启用 project/conversation scope 保留一致扩展位。

## 2. 术语与 Key
- `providerKey`：目录来源键，例如 `openrouter`。
- `modelId`：供应商模型 id，例如 `anthropic/claude-3`。
- `modelKey`：`${providerKey}::${modelId}`（双冒号分隔）。
- `scopeType`：`global | project | conversation`。
- `scopeId`：
  - `global` 必须为空字符串 `''`
  - `project`/`conversation` 必须为非空字符串。

## 3. 收藏与最近的语义

### 3.1 Favorites
- 唯一性：同一 `(scopeType, scopeId, modelKey)` 只保留一条收藏记录。
- 幂等行为：重复收藏同一模型不会新增重复行，只更新既有记录。
- 排序语义：
  - 主排序 `sortRank ASC`
  - 并列稳定 tie-breaker：`modelKey ASC`。
- 重排语义：
  - 输入中的重复 `modelKey` 会先去重再执行。
  - 输入包含 scope 内不存在的 `modelKey` 时，重排失败并回滚（原子性保证）。

### 3.2 Recents
- 唯一性：同一 `(scopeType, scopeId, modelKey)` 只保留一条最近记录。
- 记录语义：
  - `recordRecent` 命中已存在模型时，更新 `lastUsedAtMs`（取较大值）并递增 `useCount`。
  - 不存在时插入新记录。
- 排序语义：
  - 主排序 `lastUsedAtMs DESC`
  - 并列稳定 tie-breaker：`modelKey ASC`。
- 容量语义：
  - 每个 scope 最多保留 50 条 recent，超出后裁剪最旧项。

## 4. 作用域与优先级

### 4.1 阶段 3 生效范围（冻结）
- UI 只启用 `global` scope。
- `project` 与 `conversation` scope 仅作为框架预埋能力，当前不暴露入口。

### 4.2 Scope 输入优先级
- service/repo 只接受显式传入 scope；不做隐式多 scope 合并。
- 若上层未传 scope，默认使用 `global`。

### 4.3 会话模型选择优先级（用户可见）
- 发送链路最终使用当前 UI 模型值。
- 会话切换时，若 `convo.meta.selectedModelKey` 合法，会先恢复到 UI 当前模型。
- 若无有效会话模型，回退默认 `openrouter/auto`。
- favorites/recents 仅影响“快速选择与展示”，不直接覆盖发送参数优先级。

## 5. 失败降级策略
- `dbBridge` 不可用：
  - `listFavorites/listRecents` 返回空列表；
  - `toggleFavorite` 返回失败结果；
  - `recordRecent` 返回 `null`；
  - 不阻断聊天主流程。
- 偏好写入失败：
  - 仅影响偏好状态更新，不阻断模型选择与发送。
- 重排失败：
  - DB 事务回滚，保留原有排序，避免半写入状态。

## 6. 数据保留策略
- 偏好数据持久化到 SQLite（`model_favorites`、`model_recents`），应用重启后保留。
- 偏好表不对 catalog 模型建立外键；模型被 hidden/missing 不自动删除偏好。
- recents 采用固定容量裁剪策略（每 scope 50 条）控制增长。
- 阶段 3 运行路径仅写 `global`，因此 project/conversation 清理策略暂不影响用户可见行为。

## 7. 回归与验收口径
- 自动回归：`npm run test:model-picker:smoke`
- 关键证明测试：
  - `infra/db/repo/modelPreferencesRepo.test.ts`
  - `src/next/modelPrefs/modelPrefsService.test.ts`
  - `src/ui-app/components/ChatAppComposer.modelPicker.test.ts`
  - `src/ui-app/AppChatApp.send.test.ts`
- 手动验收步骤见：`docs/notes/model-picker-smoke.md`（第 7 节阶段 3 验收步骤）。

## 8. References
- `infra/db/repo/modelPreferencesRepo.ts`
- `src/next/modelPrefs/modelPrefsService.ts`
- `src/ui-app/AppChatApp.vue`
- `infra/db/schema.sql`
- `docs/spec/model-preferences-scope.md`
- `docs/spec/model-preferences-schema.md`
- `docs/notes/model-picker-smoke.md`
