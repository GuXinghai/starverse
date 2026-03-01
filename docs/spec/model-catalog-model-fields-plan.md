# Model Catalog 模型级字段计划（阶段 4 冻结版）

更新日期：2026-02-17  
适用阶段：阶段 4（DDL 与映射实现前的最终字段计划）

## 1. 目标与冻结结论
- 目标：模型级字段达到“可筛选、可排序、可展示”，并明确缓存分层。
- 冻结结论：
  - 长缓存落盘：`/models` 与 `/models/user` 的模型级字段 + 高频筛选派生列。
  - 短缓存内存：仅 UI 辅助结构（格式化、分组、展示缓存），不作为筛选依据。
  - `raw_json` 仅用于审计回溯，不再作为 queryCore 的常规筛选数据源。

## 2. 必调查结论（代码实证）

### 2.1 `schema.sql` 当前 `models`/索引/FTS 现状
来源：`infra/db/schema.sql`

- 当前 `models` 已有主干字段：
  - 标识与展示：`provider_key`、`model_id`、`model_key`、`canonical_slug`、`display_name`、`description`、`vendor`、`family`
  - 生命周期：`status`、`visibility`、`created_at_sec`、`expiration_date`、`expiration_at_sec`、`unknown_expiration`
  - 上下文与能力：`context_length`、`max_output_tokens`、`input_modalities_json`、`output_modalities_json`、`supported_parameters_json`、`capabilities_json`、`cap_*`
  - 价格：`pricing_json`、`price_prompt`、`price_completion`、`price_request`、`price_image`
  - 进阶对象：`per_request_limits_json`、`default_parameters_json`、`has_per_request_limits`、`has_default_parameters`
  - 派生标记：`has_tools`、`has_structured_outputs`、`has_reasoning`、`has_seed`、`in_modality_image`、`top_provider_is_moderated`
  - 同步追踪：`first_seen_at_ms`、`last_seen_at_ms`、`synced_at_ms`、`raw_json`
- 当前缺口（未结构化列）：
  - `architecture.modality`
  - `architecture.tokenizer`
  - `architecture.instruct_type`
  - `top_provider.context_length`
  - `pricing` 扩展键平铺列（`web_search`、`internal_reasoning`、`input_cache_read`、`input_cache_write`）
- FTS 现状：
  - `models_fts(provider_key UNINDEXED, model_id UNINDEXED, display_name, canonical_slug, description)`
  - `model_id` 当前不参与倒排索引。

### 2.2 `syncCoreSnapshot` 写入链承载能力
来源：`src/shared/modelCatalog/openRouterCatalogClient.ts` -> `src/shared/modelCatalog/catalogSyncJob.ts` -> `infra/db/repo/modelCatalogRepo.ts`

- 上游映射（OpenRouter -> internal）已拿到：
  - `tokenizer`、`instructType`
  - `perRequestLimits`、`defaultParameters`
  - `topProviderIsModerated`、`maxOutputTokens`
  - `pricing` 扩展键（在 `pricing` 对象中）
- 当前写库 Row/DDL 承载状态：
  - 已承载：`per/default`、`has_*`、`top_provider_is_moderated`、`expiration_at_sec` 等。
  - 未承载为结构化列：`tokenizer`、`instruct_type`、`architecture.modality`、`top_provider.context_length`、`pricing` 扩展键平铺列。
- 结论：链路可承载新增列，但需同步扩展：
  - `CatalogCoreModelUpsertInput` 类型
  - `toCoreModelRow` 映射
  - `coreModelUpsertStmt` 插入/更新 SQL

## 3. 阶段 4 决策（含备选）

### 3.1 数组字段存储：`input_modalities` / `output_modalities` / `supported_parameters`
- 决策（采用）：JSON 字符串存储 + `json_each` contains 查询 + 高频布尔派生列。
- 不采用拆表原因：
  - 当前规模与查询复杂度下，拆表会显著增加写入与 join 成本。
  - 现有 `json_each` + 派生列已满足阶段 4 查询语义。

### 3.2 `per_request_limits` / `default_parameters`
- 决策（采用）：阶段 4 仅做存在性筛选（`has_*`），不做通用键级筛选。
- 备选（后续）：若出现稳定高频键，再新增派生列（如 `has_max_input_tokens_limit`），不直接在 query 层做动态 JSON 键路径过滤。

### 3.3 缓存分层
- 长缓存（落盘）：
  - 所有模型级原始字段（标准化后）+ 派生筛选列 + FTS 输入字段。
  - 作为 queryCore 唯一筛选依据。
- 短缓存（内存）：
  - UI 格式化结果（例如价格文案、标签分组、局部详情拼装）。
  - 仅加速展示，不参与筛选排序，不写回 DB。

## 4. 阶段 4 字段计划表（可直接指导 DDL/映射）

| OpenRouter 字段 | 内部字段 | 目标落库列（models） | 索引建议 | 筛选语义 | 排序语义 | 展示语义 |
| --- | --- | --- | --- | --- | --- | --- |
| `id` | `modelId` | `model_id` + `model_key` | 主键/唯一键（已存在） | 精确匹配、membership 过滤 | tie-breaker | 必显 |
| `canonical_slug` | `canonicalSlug` | `canonical_slug` | FTS 输入 | 搜索命中 | 无 | 详情可显 |
| `name` | `displayName` | `display_name` | `idx_models_query_name`（已存在） | 搜索命中 | `name` 排序主键 | 必显 |
| `description` | `description` | `description` | FTS 输入 | 搜索命中 | 无 | 摘要可显 |
| `created` | `createdAtSec` | `created_at_sec` | `idx_models_query_created`（已存在） | 范围/时间分组（可选） | `created_at` 排序 | 详情可显 |
| `context_length` | `contextLength` | `context_length` | `idx_models_context_length`（已存在） | bucket + range | 无 | 列表/详情可显 |
| `top_provider.max_completion_tokens` | `maxOutputTokens` | `max_output_tokens` | 建议新增 `idx_models_max_output_tokens` | range | 无 | 详情可显 |
| `top_provider.context_length` | `topProviderContextLength` | `top_provider_context_length`（新增） | 建议新增 `idx_models_top_provider_ctx` | range（可选） | 无 | 详情可显 |
| `top_provider.is_moderated` | `topProviderIsModerated` | `top_provider_is_moderated` | 已通过组合索引可过滤 | 布尔过滤 | 无 | 详情徽标可显 |
| `architecture.modality` | `modality` | `architecture_modality`（新增） | 建议新增 `idx_models_arch_modality` | 精确过滤（可选） | 无 | 详情可显 |
| `architecture.input_modalities` | `inputModalities` | `input_modalities_json` + `in_modality_image` | `idx_models_param_flags_filter`（已存在） | contains-all | 无 | 标签可显 |
| `architecture.output_modalities` | `outputModalities` | `output_modalities_json` | 依赖 JSON 查询 | contains-all | 无 | 标签可显 |
| `architecture.tokenizer` | `tokenizer` | `tokenizer`（新增） | 建议新增 `idx_models_tokenizer_filter` | 精确过滤（小写归一） | 无 | 详情可显 |
| `architecture.instruct_type` | `instructType` | `instruct_type`（新增） | 建议新增 `idx_models_instruct_type_filter` | 精确过滤（小写归一） | 无 | 详情可显 |
| `supported_parameters` | `supportedParameters` | `supported_parameters_json` + `has_tools/has_structured_outputs/has_reasoning/has_seed` | `idx_models_param_flags_filter`（已存在） | contains-all + 高频布尔过滤 | 无 | 标签可显 |
| `per_request_limits` | `perRequestLimits` | `per_request_limits_json` + `has_per_request_limits` | `idx_models_limits_filter`（已存在） | 仅存在性 | 无 | 详情可显（摘要） |
| `default_parameters` | `defaultParameters` | `default_parameters_json` + `has_default_parameters` | `idx_models_limits_filter`（已存在） | 仅存在性 | 无 | 详情可显（摘要） |
| `pricing.prompt` | `pricing.prompt` | `price_prompt` + `pricing_json` | `idx_models_price_prompt`（已存在） | bucket/区间（按需） | 默认不排序 | 详情可显 |
| `pricing.completion` | `pricing.completion` | `price_completion` + `pricing_json` | `idx_models_price_completion`（已存在） | bucket/区间（按需） | 默认不排序 | 详情可显 |
| `pricing.request` | `pricing.request` | `price_request` + `pricing_json` | `idx_models_price_request`（已存在） | 可选 | 默认不排序 | 详情可显 |
| `pricing.image` | `pricing.image` | `price_image` + `pricing_json` | `idx_models_price_image`（已存在） | 可选 | 默认不排序 | 详情可显 |
| `pricing.web_search` | `pricing.webSearch` | `price_web_search`（新增） + `pricing_json` | 建议新增 `idx_models_price_web_search` | 可选 | 无 | 详情可显 |
| `pricing.internal_reasoning` | `pricing.internalReasoning` | `price_internal_reasoning`（新增） + `pricing_json` | 建议新增 `idx_models_price_internal_reasoning` | 可选 | 无 | 详情可显 |
| `pricing.input_cache_read` | `pricing.inputCacheRead` | `price_input_cache_read`（新增） + `pricing_json` | 建议新增 `idx_models_price_input_cache_read` | 可选 | 无 | 详情可显 |
| `pricing.input_cache_write` | `pricing.inputCacheWrite` | `price_input_cache_write`（新增） + `pricing_json` | 建议新增 `idx_models_price_input_cache_write` | 可选 | 无 | 详情可显 |
| `expiration_date` | `expirationDate` | `expiration_date` + `expiration_at_sec` + `unknown_expiration` | `idx_models_expiration_filter`（已存在） | 默认排除过期 + 阈值过滤（后续） | 无 | 生命周期提示 |
| `status`（内部） | `status` | `status` | 组合索引已覆盖 | 固定 `active`（可扩展） | 无 | 可显状态 |
| `visibility`（内部） | `visibility` | `visibility` | 组合索引已覆盖 | 固定 `visible`（可扩展） | 无 | 可显状态 |
| `raw payload` | `raw` | `raw_json` | 不建索引 | 不参与 queryCore 常规筛选 | 无 | 调试仅用 |

## 5. 新增/调整索引清单（阶段 4 目标）
- 建议新增：
  - `idx_models_max_output_tokens` on `(provider_key, visibility, status, max_output_tokens)`
  - `idx_models_top_provider_ctx` on `(provider_key, visibility, status, top_provider_context_length)`
  - `idx_models_tokenizer_filter` on `(provider_key, visibility, status, tokenizer)`
  - `idx_models_instruct_type_filter` on `(provider_key, visibility, status, instruct_type)`
  - `idx_models_arch_modality` on `(provider_key, visibility, status, architecture_modality)`
  - `idx_models_price_web_search` on `(provider_key, visibility, status, price_web_search)`
  - `idx_models_price_internal_reasoning` on `(provider_key, visibility, status, price_internal_reasoning)`
  - `idx_models_price_input_cache_read` on `(provider_key, visibility, status, price_input_cache_read)`
  - `idx_models_price_input_cache_write` on `(provider_key, visibility, status, price_input_cache_write)`
- 保留现有：
  - `idx_models_query_name`
  - `idx_models_query_created`
  - `idx_models_vendor_filter`
  - `idx_models_expiration_filter`
  - `idx_models_limits_filter`
  - `idx_models_param_flags_filter`
  - `models_fts` + triggers

## 6. Query 与展示语义（阶段 4）
- QueryCore 不再使用 `json_extract(models.raw_json, ...)` 做主筛选。
- `tokenizer`/`instruct_type` 改为结构化列筛选（小写归一）。
- 数组筛选维持 `json_each(input/output/supported_parameters)` contains-all 语义。
- `per_request_limits/default_parameters` 阶段 4 只支持存在性过滤。
- 排序维持：
  - `name`
  - `created_at`
  - 稳定 tie-breaker `model_key`
- UI 展示最低要求：
  - 列表：`display_name`、`model_id`、`vendor`、核心能力、`context_length`（可读化）
  - 详情：`tokenizer`、`instruct_type`、`max_output_tokens`、`top_provider_is_moderated`、`per/default`存在性、完整价格对象摘要

## 7. DDL 与映射实现任务拆解（供 4.2+ 直接执行）
1. DDL：
  - 为第 4 节“新增列”补齐 `models` 列定义与索引。
2. 类型：
  - 扩展 `CatalogCoreModelUpsertInput`（`catalogSyncJob.ts`、`modelCatalogRepo.ts`）。
3. 映射：
  - `toCoreModelRow` 补 tokenizer/instruct/modality/top_provider_context/pricing 扩展键。
4. Repo SQL：
  - `coreModelUpsertStmt` INSERT/UPDATE 补齐新增列。
5. Query：
  - `queryCore` tokenizer/instruct 过滤改走结构化列；移除 raw_json 依赖路径。
6. UI：
  - 过滤面板与详情面板接线新增字段。
7. 测试：
  - repo/query/service/UI 补每字段至少 1 条正向用例 + 1 条缺字段容错用例。

## 8. 验收清单（任务卡 4.1）
- [x] 明确了 `models` 现有列、索引、FTS 结构。
- [x] 明确了 `syncCoreSnapshot` 承载能力与类型/SQL 扩展点。
- [x] 数组字段存储方案已定（JSON + 派生列，不拆表）。
- [x] `per_request_limits/default_parameters` 策略已定（阶段 4 仅存在性）。
- [x] 长缓存落盘与短缓存内存分层已写死。
- [x] 字段计划表已给出“列名/索引/筛选语义/展示语义”，可直接指导 DDL 与映射实现。

## 9. 阶段 4 回归基线（任务卡 4.11）
- 线下 fixture 集成回归：
  - `tests/integration/model-catalog-stage4-smoke.test.ts`
  - fixture:
    - `tests/fixtures/model-catalog/openrouter-models-user-stage4.fixture.json`
    - `tests/fixtures/model-catalog/openrouter-models-category-science.fixture.json`
- 覆盖分组（每组至少一项）：
  - 身份检索：`searchText` 精确命中 `model_id`
  - 能力边界：`contextLength`、`maxOutputTokens` 区间
  - 模态：`architectureModalities` + `outputModalities`
  - 特性：`supportedParameters`
  - 合规：`topProviderIsModerated`
  - 生命周期：过期模型默认剔除
  - category：单选 membership 预过滤（含 baseUrl 对齐）

## References
- Models API (`/models`): https://openrouter.ai/docs/api/api-reference/models/get-models
- Models user API (`/models/user`): https://openrouter.ai/docs/api/api-reference/models/list-models-user
- Models standard (pricing 扩展键、supported_parameters): https://openrouter.ai/docs/guides/overview/models
- `infra/db/schema.sql`
- `src/shared/modelCatalog/openRouterCatalogClient.ts`
- `src/shared/modelCatalog/catalogSyncJob.ts`
- `infra/db/repo/modelCatalogRepo.ts`
