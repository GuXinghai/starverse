# Model Tagging Rules (Phase 1)

更新日期：2026-02-17  
落点实现：`src/shared/modelCatalog/modelTagger.ts`

## 1. 目标
- 以本地纯函数稳定推导“硬能力标签”。
- 同输入同输出，支持回归测试与离线复现。
- 为阶段 2 筛选直接提供 `model_tags` 数据。

## 2. 输入字段
- `inputModalities`
- `supportedParameters`
- `contextLength`
- `pricing.prompt` / `pricing.completion`（字符串小数）
- `modelKey` / `updatedAtMs`（用于标签主键与时间戳）

## 3. 最小标签集与规则

1. `vision`
- 标签键：`capability:vision`
- 条件：`inputModalities` 包含 `image` 或 `video`

2. `tools`
- 标签键：`capability:tools`
- 条件：`supportedParameters` 含 `tools` 或 `tool_choice`

3. `structured_outputs`
- 标签键：`capability:structured_outputs`
- 条件：`supportedParameters` 含 `response_format` / `json_schema` / `structured_outputs`

4. `reasoning`
- 标签键：`capability:reasoning`
- 条件：`supportedParameters` 含 `reasoning` 或 `include_reasoning`

5. `long_context`
- 标签键：`capability:long_context`
- 条件：`contextLength >= 128000`

6. `cheap_bucket`
- 标签键：`category:cheap_bucket:<bucket>`
- bucket 取值：`cheap` / `standard` / `expensive` / `unknown`
- 规则：
  - 使用 `max(prompt, completion)` 作为有效价格（字符串转 number）
  - `<= 0.0000025` -> `cheap`
  - `<= 0.00002` -> `standard`
  - `> 0.00002` -> `expensive`
  - 价格缺失或不可解析 -> `unknown`

## 4. 可解释性与稳定性
- 标签均来自可追溯输入字段，不依赖运行时外部状态。
- 输出按 `tag.key` 排序，保证顺序稳定。
- 每个标签固定 `confidence=1`、`source=derived`。

## 5. 落库链路
1. `mapOpenRouterModelToCatalogModel` 调用 `deriveModelTags(...)`
2. `CatalogSyncJob` 将 `model.tags` 转换为 `CatalogCoreTagUpsertInput`
3. `modelCatalog.syncCoreSnapshot` 在事务内写入 `model_tags`

## 6. 最小验证步骤
1. 运行：
```bash
npx vitest run src/shared/modelCatalog/modelTagger.test.ts src/shared/modelCatalog/openRouterCatalogClient.test.ts
```
2. 检查断言：
- 同输入重复调用返回完全一致标签
- 能力标签与 `cheap_bucket` 与输入字段一致
- 缺失 pricing 时给出 `category:cheap_bucket:unknown`

