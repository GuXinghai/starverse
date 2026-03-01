# Model Selector Stage4 Gap Matrix（任务卡 4.0）

更新日期：2026-02-17  
目标：把“当前最简实现”与“目标全量字段”差距一次性点清，后续任务按矩阵闭环。

## 1. 判定口径
- `✅`：已实现且可用于阶段 4 主路径。
- `⚠️`：部分实现（仅 raw、仅内部、仅部分 UI、或仅部分测试）。
- `❌`：未实现。
- 缺口标签：
  - `缺实现`：repo/service/query 能力缺失。
  - `缺落库`：无结构化落库（仅 raw 或完全无存储）。
  - `缺UI`：UI 无对应过滤/展示/交互。
  - `缺测试`：缺少针对该项的明确测试断言。

## 2. 必调查结论（代码实证）

### 2.1 DB Core `models` 已落库字段集合
来源：`infra/db/schema.sql`

- 标识与展示：`provider_key`、`model_id`、`model_key`、`canonical_slug`、`display_name`、`description`、`vendor`、`family`
- 生命周期：`status`、`visibility`、`created_at_sec`、`expiration_date`、`expiration_at_sec`、`unknown_expiration`
- 上下文与能力：`context_length`、`max_output_tokens`、`input_modalities_json`、`output_modalities_json`、`supported_parameters_json`、`capabilities_json`、`cap_*`
- 价格：`pricing_json`、`price_prompt`、`price_completion`、`price_request`、`price_image`
- 进阶对象：`per_request_limits_json`、`default_parameters_json`、`has_per_request_limits`、`has_default_parameters`
- 派生标志：`has_tools`、`has_structured_outputs`、`has_reasoning`、`has_seed`、`in_modality_image`、`top_provider_is_moderated`
- 同步追踪：`first_seen_at_ms`、`last_seen_at_ms`、`synced_at_ms`、`raw_json`

### 2.2 DB Core `models` 未结构化落库字段（仅 raw 或缺失）
来源：`src/shared/modelCatalog/openRouterCatalogClient.ts` + `infra/db/schema.sql`

- 仅 `raw_json` 保留（无单列）：
  - `architecture.tokenizer`
  - `architecture.instruct_type`
  - `architecture.modality`
  - `top_provider.context_length`
  - `pricing` 扩展键（如 `web_search`、`internal_reasoning`、`input_cache_*`）仅在 `pricing_json`
- 未作为本地持久 membership 存储：
  - `category`（当前为在线按需 membership 缓存）

### 2.3 `queryCore` 当前过滤与排序项
来源：`infra/db/repo/modelCatalogRepo.ts` + `src/next/modelCatalog/catalogQueryService.ts`

- 过滤：
  - `searchText(FTS)`、`vendors/providers`、`modelIds`
  - `tags`（AND）
  - `contextBuckets`、`contextLength range`
  - `maxOutputTokens range`
  - `priceBuckets`（经 `model_tags`）
  - `topProviderIsModerated`
  - `tokenizers`（从 `raw_json` 提取）
  - `instructTypes`（从 `raw_json` 提取）
  - `modalities`、`inputModalities`、`outputModalities`
  - `supportedParameters`（JSON contains）
  - 固定约束：`provider_key` + `visibility='visible'` + `status='active'` + `not expired`
  - `category`（通过在线 membership -> `modelIds` 预过滤）
- 排序：
  - `name`、`created_at`
  - keyset 分页 tie-breaker：`model_key`

### 2.4 UI 过滤面板与详情面板当前支持项
来源：`src/ui-app/components/ModelPickerDialog.vue` + `src/ui-app/components/EndpointDetailPanel.vue`

- ModelPicker 左侧过滤：
  - 搜索框
  - Capability chips：`all/reasoning/tools/vision/long_context/cheap`
  - Vendor 单选
- 当前未暴露 UI 过滤：
  - `contextLength range`、`maxOutputTokens range`
  - `topProviderIsModerated`
  - `tokenizers/instructTypes`
  - `modalities/input/output`
  - `supportedParameters`
  - `category`
  - `created_at` 排序切换
- 模型展示：
  - 列表项显示：`displayName`、`modelId`、`vendor`、`description`、能力 chips
  - 不显示：`contextLength`、`pricing`、`created_at`、`tokenizer`、`instruct_type`、`per_request_limits/default_parameters` 等
- 端点详情展示：
  - 显示：`providerName/tag`、`quantization`、`status`、`maxPromptTokens`、`maxCompletionTokens`、`uptimeLast30m`、`fetchedAt`
  - 不显示：`latency`、`throughput`、`supportedParameters`、`supportsImplicitCaching`、`raw`

## 3. 模型级字段覆盖矩阵

| 模型级项 | 落库状态 | Query 筛选 | Query 排序 | UI 过滤 | UI 展示 | 测试覆盖 | 缺口标签 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `provider_key + model_id + model_key` | ✅ 列 | ⚠️（`provider_key` 固定；缺通用 modelId 精确筛选） | ✅（`model_key` tie-break） | ❌ | ✅（显示 `modelId`） | ✅ | 缺实现,缺UI | `searchText` 对 `modelId` 非精确路径 |
| `canonical_slug` | ✅ 列 | ⚠️（仅搜索侧间接命中） | ❌ | ❌ | ❌ | ⚠️ | 缺UI,缺测试 | 无单独过滤器/展示 |
| `display_name` | ✅ 列 | ✅（FTS） | ✅（name） | ✅（搜索） | ✅ | ✅ | - | 主路径已闭环 |
| `description` | ✅ 列 | ✅（FTS） | ❌ | ✅（搜索） | ✅ | ⚠️ | 缺测试 | 无单项断言 |
| `vendor(author)` | ✅ 列 | ✅（vendors/providers） | ❌ | ✅（Vendor 下拉） | ✅ | ✅ | - | 阶段 1/2 语义已收敛 |
| `status + visibility + expiration` | ✅ 列 | ⚠️（仅固定约束，不可配置） | ❌ | ❌ | ❌ | ⚠️ | 缺实现,缺UI,缺测试 | 无“包含已过期/即将过期”开关 |
| `context_length` | ✅ 列 | ✅（bucket + range） | ❌ | ⚠️（仅 `long_context` 间接） | ❌ | ✅ | 缺UI | 无区间控件与数值展示 |
| `max_output_tokens` | ✅ 列 | ✅（range） | ❌ | ❌ | ❌ | ✅ | 缺UI | 仅 query 能力，未接 UI |
| `created_at_sec` | ✅ 列 | ❌ | ✅（created_at） | ❌ | ❌ | ✅ | 缺UI | UI 固定 name 排序 |
| `top_provider.is_moderated` | ✅ 列（`top_provider_is_moderated`） | ✅ | ❌ | ❌ | ❌ | ✅ | 缺UI | 未暴露筛选开关 |
| `architecture.tokenizer` | ⚠️ raw（无单列） | ✅（`json_extract(raw_json)`） | ❌ | ❌ | ❌ | ✅ | 缺落库,缺UI | 查询可用但依赖 raw |
| `architecture.instruct_type` | ⚠️ raw（无单列） | ✅（`json_extract(raw_json)`） | ❌ | ❌ | ❌ | ✅ | 缺落库,缺UI | 同上 |
| `input/output/modalities` | ✅（JSON 列） | ✅（modalities 组合） | ❌ | ❌ | ⚠️（仅 vision 间接） | ✅ | 缺UI | 无显式 modalities 面板 |
| `supported_parameters` | ✅（JSON 列） | ✅（contains all） | ❌ | ❌ | ❌ | ✅ | 缺UI | 无参数勾选 UI |
| `capabilities（reasoning/tools/vision/long_context）` | ✅（`cap_*` + tags） | ✅ | ❌ | ✅（chips） | ✅（chips） | ✅ | - | `structured_outputs` 未在 UI chip 暴露 |
| `pricing.prompt/completion/request/image` | ✅（平铺 + JSON） | ⚠️（仅 priceBuckets） | ❌ | ⚠️（仅 cheap） | ❌ | ✅ | 缺实现,缺UI | 缺数值区间筛选与展示 |
| `pricing` 扩展键（web_search 等） | ⚠️（仅 `pricing_json`） | ❌ | ❌ | ❌ | ❌ | ❌ | 缺实现,缺落库,缺UI,缺测试 | 仅 raw/json 保留，未可用化 |
| `per_request_limits` | ✅（JSON + `has_per_request_limits`） | ❌ | ❌ | ❌ | ❌ | ⚠️（存储有测） | 缺实现,缺UI,缺测试 | 无存在性过滤接线 |
| `default_parameters` | ✅（JSON + `has_default_parameters`） | ❌ | ❌ | ❌ | ❌ | ⚠️（存储有测） | 缺实现,缺UI,缺测试 | 无存在性过滤接线 |
| `expiration_date` / `expiration_at_sec` | ✅ 列 | ⚠️（仅默认排除过期） | ❌ | ❌ | ❌ | ⚠️ | 缺实现,缺UI,缺测试 | 缺 `expiringWithinDays` 等显式策略 |
| `category membership` | ❌（不落 DB） | ✅（在线 membership -> modelIds） | ❌ | ❌ | ❌ | ✅ | 缺落库,缺UI | 单选语义在 service 层已实现 |

## 4. 端点级字段与行为覆盖矩阵

| 端点级项 | 缓存策略（落盘/内存） | UI 展示 | 筛选/排序 | 刷新语义 | 测试覆盖 | 缺口标签 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `endpointKey`（`modelId::tag::quantization::providerName`） | ✅ 落盘主键 | ⚠️（仅 testid 间接） | ❌ | ✅ | ✅ | 缺UI | 标识稳定，但用户不可见 |
| `provider_name/tag/quantization` | ✅ 落盘 | ✅ | ❌ | ✅ | ✅ | 缺实现 | 仅展示，不可筛选排序 |
| `max_prompt_tokens/max_completion_tokens` | ✅ 落盘 | ✅ | ❌ | ✅ | ✅ | 缺实现 | 缺比较排序/过滤 |
| `status` | ✅ 落盘 | ✅ | ❌ | ✅ | ✅ | 缺实现 | 仅文本展示 |
| `supported_parameters` | ✅ 落盘 | ❌ | ❌ | ✅ | ⚠️ | 缺UI,缺测试 | service 解析有实现，UI 未展示 |
| `supports_implicit_caching` | ✅ 落盘 | ❌ | ❌ | ✅ | ⚠️ | 缺UI,缺测试 | 同上 |
| `uptime_last_30m` | ✅ 内存（volatile） | ✅ | ❌ | ✅ | ✅ | 缺实现 | 未参与排序/过滤 |
| `latency_last_30m` | ✅ 内存（volatile） | ❌ | ❌ | ✅ | ⚠️ | 缺UI,缺测试 | 已缓存但未展示 |
| `throughput_last_30m` | ✅ 内存（volatile） | ❌ | ❌ | ✅ | ⚠️ | 缺UI,缺测试 | 已缓存但未展示 |
| `raw_json` | ✅ 落盘 | ❌ | ❌ | ✅ | ⚠️ | 缺UI,缺测试 | 仅调试追溯 |
| 首次查看拉取、后续读缓存 | ✅ | ✅（fetchedAt） | - | ✅ | ✅ | - | `forceRefresh=false` 命中缓存 |
| 手动刷新强制重拉 | ✅ | ✅（Refresh 按钮） | - | ✅ | ✅ | - | UI -> service -> client 闭环可用 |
| 失败回退缓存不阻断主路径 | ✅ | ✅（错误提示） | - | ✅ | ✅ | - | 已验证 network fail fallback |
| 基于端点指标的模型列表筛选/排序 | ❌ | ❌ | ❌ | - | ❌ | 缺实现,缺UI,缺测试 | 阶段 4 仍未接入 queryCore |

## 5. 阶段 4 验收矩阵（可勾选）

### 5.1 模型级最小闭环
- [ ] `per_request_limits/default_parameters` 存在性过滤（query + UI + 测试）
- [ ] `tokenizer/instruct_type` 从 raw 迁移为结构化列（或明确保留 raw 方案并补性能基线）
- [ ] `context/maxOutput` 区间过滤 UI 接线
- [ ] `created_at` 排序 UI 接线
- [ ] `category` 过滤 UI 接线（单选语义）
- [ ] 定义并落地 `expiration` 可配置策略（仅活跃/包含已过期/即将过期）

### 5.2 端点级最小闭环
- [ ] EndpointDetailPanel 展示 `latency/throughput/supported_parameters/supports_implicit_caching`
- [ ] 明确端点字段是否进入模型列表排序（若不做需在契约写死）
- [ ] 补齐端点关键字段展示断言测试（UI/service）
- [ ] 补一条 baseUrl 维度缓存隔离测试（默认域 vs EU 域）

## 6. 取证路径（References）
- `infra/db/schema.sql`
- `infra/db/repo/modelCatalogRepo.ts`
- `infra/db/repo/modelCatalogRepo.test.ts`
- `src/next/modelCatalog/catalogQueryService.ts`
- `src/next/modelCatalog/catalogQueryService.test.ts`
- `src/next/modelCatalog/modelEndpointDetailService.ts`
- `src/next/modelCatalog/modelEndpointDetailService.test.ts`
- `src/next/modelCatalog/openRouterCategoryCache.ts`
- `src/next/modelCatalog/openRouterCategoryCache.test.ts`
- `src/ui-app/components/ModelPickerDialog.vue`
- `src/ui-app/components/ModelPickerDialog.test.ts`
- `src/ui-app/components/EndpointDetailPanel.vue`
- `docs/spec/model-catalog-model-fields-plan.md`
- `docs/spec/model-catalog-query-contract.md`
