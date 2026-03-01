# OpenRouter Catalog 接口核对与字段字典（阶段 1 约束）

更新日期：2026-02-16  
适用范围：Starverse / OpenRouter（Catalog 内核阶段）

## 1. 目标与约束

本文件用于固化 OpenRouter 目录相关接口与字段语义，作为阶段 1 的实现约束。  
原则：
- 先以仓库现有调用链为准定位落点；
- 再以 OpenRouter 官方页面校对接口与字段；
- 未经官方确认的行为一律标注为“推断”，不得当作硬约束。

## 2. 必用接口（Catalog 维度）

| 接口 | 用途 | 当前代码状态 |
| --- | --- | --- |
| `GET /api/v1/models` | 全量模型目录（基础对象） | 已使用（`src/shared/modelCatalog/catalogSyncJob.ts`） |
| `GET /api/v1/models/user` | 按用户 provider 偏好、隐私、guardrails 过滤后的目录 | 未接入 |
| `GET /api/v1/models/count` | 轻量目录计数信号 | 未接入 |
| `GET /api/v1/providers` | provider 元数据字典 | 未接入 |
| `GET /api/v1/models/:author/:slug/endpoints` | 单模型 endpoints 性能/参数视图 | 未接入 |

## 2.1 Base URL 规则（实现硬约束）

- 默认 OpenRouter Base URL：`https://openrouter.ai/api/v1`
- EU in-region routing/过滤场景 Base URL：`https://eu.openrouter.ai/api/v1`
- 当需要验证或使用 `/api/v1/models/user` 的 EU 过滤行为时，必须切换到 EU base URL 发起请求。

## 3. 鉴权与归因头

### 3.1 必需鉴权
- `Authorization: Bearer <token>`

### 3.2 可选归因头
- `HTTP-Referer`
- `X-Title`

说明：
- 官方在 API reference overview 与 app attribution 中将以上两个归因头定义为可选；
- 若希望出现在 attribution/rankings 分析中，应显式携带。

## 4. 字段字典（按接口）

## 4.1 `GET /api/v1/models` 与 `GET /api/v1/models/user` 的模型对象（核心字段）

| 字段 | 类型（官方示例） | 语义 | Starverse 当前落库 |
| --- | --- | --- | --- |
| `id` | `string` | 模型 ID（如 `openai/gpt-4`） | `model_catalog.model_id` |
| `canonical_slug` | `string` | 规范 slug | 未单列落库（在 `raw_json`） |
| `name` | `string` | 展示名 | `model_catalog.name` |
| `created` | `number` | 创建时间戳（秒） | 未单列落库（在 `raw_json`） |
| `pricing` | `object`（字符串价格） | 价格对象 | 未单列落库（在 `raw_json`） |
| `context_length` | `number` | 上下文长度 | `model_catalog.context_length` |
| `architecture` | `object` | 模态/分词器/指令类型 | 未单列落库（在 `raw_json`） |
| `top_provider` | `object` | 顶层 provider 视图（示例含 `max_completion_tokens`） | 未单列落库（在 `raw_json`） |
| `per_request_limits` | `object|null` | 单请求限制 | 未单列落库（在 `raw_json`） |
| `supported_parameters` | `string[]` | 支持参数声明 | `model_catalog.supported_parameters_json` |
| `default_parameters` | `object|null` | 默认参数 | 未单列落库（在 `raw_json`） |
| `description` | `string|null` | 描述 | `model_catalog.description` |
| `expiration_date` | `string|null` | 过期日期 | 未单列落库（在 `raw_json`） |

落库约束：
- 价格字段保持字符串语义，不做浮点强转；
- 未显式建列字段保留在 `raw_json`，避免信息丢失；
- `supported_parameters` 仅按字符串数组处理，不猜测 provider 子集能力。

## 4.2 `GET /api/v1/models/user` 过滤语义与默认策略

官方语义：
- 结果会受用户 provider 偏好、隐私设置、guardrails 影响；
- 在 `eu.openrouter.ai` 域名下请求时，结果会进一步受 EU in-region 约束。

默认实现策略（设计选择，基于官方语义）：
- 阶段 1 若目标是“对当前用户真实可用模型目录”，默认主源使用 `GET /api/v1/models/user`；
- `GET /api/v1/models` 作为兜底与对照集，不作为默认主源。

## 4.3 `GET /api/v1/models/count`

返回结构（官方示例）：
- `data.count: number`

实现意义（推断）：
- 可作为轻量变更信号触发“是否拉全量目录”；
- 不能单独证明“目录字段未变”（计数不变仍可能元数据变化）。

## 4.4 `GET /api/v1/providers`

provider 对象字段（官方示例）：
- `name: string`
- `slug: string`
- `privacy_policy_url: string`
- `terms_of_service_url: string`
- `status_page_url: string`

## 4.5 `GET /api/v1/models/:author/:slug/endpoints`

路径参数：
- `author: string`（required）
- `slug: string`（required）

参数来源规则（实现约束）：
- 默认从模型 ID 分段获得：`<author>/<slug>`（示例：`openai/gpt-4` -> `author=openai`, `slug=gpt-4`）。
- 若返回对象同时存在 `canonical_slug` 与 `id`，以服务端实际可调用路径为准；不可假设两者永远等价。

响应中 `data.endpoints[]` 官方示例字段（节选）：
- `provider_name`
- `tag`
- `quantization`
- `max_completion_tokens`
- `max_prompt_tokens`
- `supported_parameters`
- `uptime_last_30m`
- `supports_implicit_caching`
- `latency_last_30m.{p50,p75,p90,p99}`
- `throughput_last_30m.{p50,p75,p90,p99}`
- `status`

## 5. 错误结构与流式错误约束

官方错误结构：
- `error.code`
- `error.message`
- `error.metadata?`

HTTP 与错误码关系：
- 请求级错误时，HTTP 状态通常与 `error.code` 对齐；
- 对于部分端点，HTTP 可能返回 `200`，错误随后在响应体或 SSE `data` 事件中返回。

流式语义：
- Pre-stream 错误：标准错误结构；
- Mid-stream 错误：SSE 事件中包含顶层 `error` 且流终止。
- 对 `chat/completions` 的实现要求：错误判定必须同时覆盖 HTTP 非 2xx 与流内错误事件，不得仅依赖 HTTP 状态码。

`chat/completions` 错误处理硬约束（按官方描述）：
- 非流式请求：可直接返回标准错误 JSON（含 `error.code/error.message`）。
- 流式请求：即使 HTTP 为 `200`，仍可能在后续 SSE `data` 事件或响应体中返回错误；客户端必须监听并解析流内错误事件。

## 6. 阶段 1 实现策略（约束版）

## 6.1 数据源优先级
1. 默认：`GET /api/v1/models/user`  
2. 兜底：`GET /api/v1/models`  
3. 信号：`GET /api/v1/models/count`  
4. 辅助字典：`GET /api/v1/providers`  
5. 详情按需：`GET /api/v1/models/:author/:slug/endpoints`

## 6.2 现有代码差距（仓库事实）

- 现实现仅拉取 `GET /api/v1/models`：`src/shared/modelCatalog/catalogSyncJob.ts`
- 当前落库主表：`model_catalog`（基础字段 + `raw_json`）
- 未见 `providers` 与 `endpoints` 的持久化实现
- `reasoning_model_index` 当前通过 `supported_parameters` 包含 `reasoning` 派生

## 7. 最小 smoke test（可复现）

将 `<KEY>` 替换为 OpenRouter key，`<MODEL_ID>` 形如 `openai/gpt-4`：

```bash
curl https://openrouter.ai/api/v1/models \
  -H "Authorization: Bearer <KEY>" \
  -H "HTTP-Referer: https://your.app" \
  -H "X-Title: YourApp"

curl https://openrouter.ai/api/v1/models/user \
  -H "Authorization: Bearer <KEY>"

curl https://openrouter.ai/api/v1/models/count \
  -H "Authorization: Bearer <KEY>"

curl https://openrouter.ai/api/v1/providers \
  -H "Authorization: Bearer <KEY>"

curl https://openrouter.ai/api/v1/models/<author>/<slug>/endpoints \
  -H "Authorization: Bearer <KEY>"
```

可选 EU 对照验证（校验 baseURL 切换逻辑）：

```bash
curl https://openrouter.ai/api/v1/models/user \
  -H "Authorization: Bearer <KEY>"

curl https://eu.openrouter.ai/api/v1/models/user \
  -H "Authorization: Bearer <KEY>"
```

对比两次响应的模型集合差异，用于验证 EU in-region 过滤链路。

## 8. 边界条件与降级路径

- `GET /api/v1/models/user` 失败：降级到 `GET /api/v1/models`（保持 Catalog 可用）。
- `GET /api/v1/models/count` 失败：不阻断全量刷新（仅失去轻量信号）。
- `GET /api/v1/providers` 或 `GET /api/v1/models/:author/:slug/endpoints` 失败：不阻断主模型选择，仅降级隐藏增强信息。
- 流式 HTTP 200 但 mid-stream 出错：按 SSE 错误事件处理，不可仅依赖 HTTP 状态。

## 9. 待审核选项（需你确认）

1. 目录主源是否切换到 `GET /api/v1/models/user`（推荐）
- 方案 A（推荐）：`GET /api/v1/models/user` 主源 + `GET /api/v1/models` 兜底
- 方案 B：继续 `GET /api/v1/models` 主源，仅把 `GET /api/v1/models/user` 作为实验开关

2. 是否在阶段 1 就落库 providers/endpoints
- 方案 A（推荐）：阶段 1 落库 `providers`（低成本、稳定支撑 UI 与路由说明）；`endpoints` 先按需拉取 + 短 TTL 缓存，不急于落库
- 方案 B：阶段 1 同步落库 `providers + endpoints`，提前支持完整性能排序与历史分析

## 10. 任务卡 2.5 映射与容错规则（固化）

- `created`：按 Unix seconds 映射到内部 `createdAtSec`，不转 ISO 字符串。
- `pricing.*`：按字符串小数保留到内部 `pricing`，禁止转 `number`。
- `architecture.input_modalities` / `architecture.output_modalities`：缺失时按 `text->text` 默认值落 `['text']`。
- `architecture.tokenizer` / `architecture.instruct_type`：映射到内部 `tokenizer` / `instructType`；空字符串或空白字符串统一归一为 `null`。
- `per_request_limits` / `default_parameters`：存在则保留 JSON 值，缺失或 `null` 时映射为 `null`，不得抛错。
- 映射容错要求：模型对象缺少非主键字段不得导致映射失败；仅 `id` 缺失时跳过该模型。

## References
- Models list: https://openrouter.ai/docs/api/api-reference/models/get-models
- Models user: https://openrouter.ai/docs/api/api-reference/models/list-models-user
- Models count: https://openrouter.ai/docs/api/api-reference/models/list-models-count
- Providers list: https://openrouter.ai/docs/api/api-reference/providers/list-providers
- Endpoints list: https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints
- API reference overview: https://openrouter.ai/docs/api/reference/overview
- Authentication: https://openrouter.ai/docs/api/reference/authentication
- App attribution: https://openrouter.ai/docs/app-attribution
- Errors & debugging: https://openrouter.ai/docs/api/reference/errors-and-debugging
- Privacy logging: https://openrouter.ai/docs/guides/privacy/logging
- Provider selection: https://openrouter.ai/docs/guides/routing/provider-selection
