# Gemini Thinking 契约核查报告

本报告只做契约与原始 REST 证据核查，不修改生产代码、不调整编译器、不新增模型匹配规则，也未启动 Starverse 主程序。

## 核查边界与时间

- 实测开始：2026-07-23T20:33:34.864Z
- 实测结束：2026-07-23T20:33:38.645Z
- 账号：仅以本次临时 API Key 认证；Key 未写入任何证据文件
- 活跃项目契约：gemini-generate-content-v1beta
- 请求：`GET /v1beta/models`、`GET /v1beta/models/{model}`；另外对 `v1` 做探索性对照
- 分页：`pageSize=1000`；v1beta 1 页，v1 1 页；每一页原始响应均已保存
- v1 结论边界：仓库当前 GenerateContent 契约仍是 v1beta，未发现迁移至 v1 的项目计划；v1 结果仅作为对照证据

## 一、Models API 原始字段结论

### Schema 事实

官方 Models API 将 `name`、`baseModelId`、`version` 标为 Required；`supportedGenerationMethods` 和 `thinking` 的字段定义没有 Required 标记。`thinking` 的官方含义是“模型是否支持 thinking”，不是某次请求的默认思考深度。详见 [Models API](https://ai.google.dev/api/models)。

### 本次实测事实

| API | 全部模型 | generateContent 模型 | 列表 thinking=true | 列表 thinking=false | 列表 thinking 缺失 | 列表 thinking 异常类型 | models.get 数量 | list/get thinking 差异 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| v1beta | 56 | 41 | 34 | 0 | 22 | 0 | 41 | 0 |
| v1 | 21 | 16 | 11 | 0 | 10 | 0 | 16 | 0 |

在 v1beta 的 41 个 `generateContent` 模型中，31 个原始 JSON 自有 `thinking: true`，10 个完全没有 `thinking` own-property；没有观察到原始 `thinking: false`，也没有观察到异常类型。v1 的 16 个 `generateContent` 模型中，11 个为 `true`，5 个缺失，同样没有 `false` 或异常类型。

这不是“缺失等于 false”：报告和审计 JSON 将缺失单独记为 `missing`，并保留 `thinkingOwnProperty=false`。

另外，Models API 当前原始响应中 `baseModelId` 在 v1beta 的 56 个 list 模型和 41 个 get 模型中均缺失；v1 的 21 个 list 模型和 16 个 get 模型中也均缺失。该现象单独保留为原始字段缺失事实，没有用 `name` 或模型家族推导填充。

### list/get 差异

对所有支持 `generateContent` 的模型执行了 `models.get`。v1beta 和 v1 均未发现以下差异：

- list 有 `thinking`、get 缺失：0
- list 缺 `thinking`、get 有：0
- list/get 布尔值不一致：0
- list/get 其他审计字段差异：0

完整清单见 [list-get-differences.json](./list-get-differences.json)。

### v1 与 v1beta 差异

- v1beta 独有模型：35
- v1 独有模型：0
- 两边同名但字段不同：0

本次 v1 是 v1beta 模型集合的严格子集；未发现同名模型的审计字段差异。完整差异见 [v1-v1beta-differences.json](./v1-v1beta-differences.json)。

## 二、GenerateContent Thinking 控制矩阵

下表只使用 GenerateContent Thinking 官方文档、GenerateContent 图片文档和本次 Models API 原始证据；没有使用 Interactions API 能力表替代 GenerateContent 契约。对于官方文档没有逐一绑定控制语义的其他 GenerateContent 模型，控制项保持 `unknown`，不按名称推断。

官方结论包括：Gemini 3.x 推荐 `thinkingLevel`；Gemini 2.5 不支持 `thinkingLevel`，使用 `thinkingBudget`；Gemini 3.x 对 `thinkingBudget` 的向后兼容接受不改变推荐分类；`Dynamic` 是默认/动态行为，不是额外的 level 枚举。详见 [GenerateContent Thinking](https://ai.google.dev/gemini-api/docs/generate-content/thinking)、[Gemini 3.5 changes](https://ai.google.dev/gemini-api/docs/generate-content/whats-new-gemini-3.5) 和 [image generation](https://ai.google.dev/gemini-api/docs/generate-content/image-generation)。

| Exact model ID | Stable/preview/deprecated observation | Model.thinking raw | Control | Default | Levels | Normal budget | 0 | -1 | Can fully disable | Evidence | verifiedAt |
|---|---|---|---|---|---|---|---|---|---|---|---|
| antigravity-preview-05-2026 | preview name; deprecated status not exposed by Models API | missing (own-property=false) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| deep-research-max-preview-04-2026 | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| deep-research-preview-04-2026 | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| deep-research-pro-preview-12-2025 | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-2.0-flash | stable name; deprecated status not exposed by Models API | missing (own-property=false) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-2.0-flash-001 | stable name; deprecated status not exposed by Models API | missing (own-property=false) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-2.0-flash-lite | stable name; deprecated status not exposed by Models API | missing (own-property=false) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-2.0-flash-lite-001 | stable name; deprecated status not exposed by Models API | missing (own-property=false) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-2.5-computer-use-preview-10-2025 | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-2.5-flash | stable name; deprecated status not exposed by Models API | true (boolean) | budget | dynamic thinking | not applicable; thinkingLevel unsupported | 0..24576 | 0; disables thinking | -1; dynamic thinking (default) | yes | Gemini GenerateContent Thinking guide, thinking-budget table | 2026-07-23T20:33:38.645Z |
| gemini-2.5-flash-image | stable name; deprecated status not exposed by Models API | missing (own-property=false) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-2.5-flash-lite | stable name; deprecated status not exposed by Models API | true (boolean) | budget | model does not think | not applicable; thinkingLevel unsupported | 512..24576 | 0; disables thinking | -1; dynamic thinking | yes; default is already no-thinking | Gemini GenerateContent Thinking guide, thinking-budget table | 2026-07-23T20:33:38.645Z |
| gemini-2.5-flash-preview-tts | preview name; deprecated status not exposed by Models API | missing (own-property=false) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-2.5-pro | stable name; deprecated status not exposed by Models API | true (boolean) | budget | dynamic thinking | not applicable; thinkingLevel unsupported | 128..32768 | not allowed; cannot disable | -1; dynamic thinking (default) | no | Gemini GenerateContent Thinking guide, thinking-budget table | 2026-07-23T20:33:38.645Z |
| gemini-2.5-pro-preview-tts | preview name; deprecated status not exposed by Models API | missing (own-property=false) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-3-flash-preview | preview name; deprecated status not exposed by Models API | true (boolean) | level | on (high; dynamic) | minimal, low, medium, high | not specified by the level table | not applicable; minimal is not guaranteed off | not applicable | no; Gemini 3 Flash has no full thinking-off | Gemini GenerateContent Thinking guide, Gemini 3 Flash table | 2026-07-23T20:33:38.645Z |
| gemini-3-pro-image | stable name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-3-pro-image-preview | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-3-pro-preview | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-3.1-flash-image | stable name; deprecated status not exposed by Models API | true (boolean) | level | on (minimal) | minimal, high | not specified by the level table | not applicable; minimal is not guaranteed off | not applicable | no; image thinking cannot be disabled | Gemini image generation guide, image thinking-level table | 2026-07-23T20:33:38.645Z |
| gemini-3.1-flash-image-preview | preview name; deprecated status not exposed by Models API | true (boolean) | level | on (minimal) | minimal, high | not specified by the level table | not applicable; minimal is not guaranteed off | not applicable | no; image thinking cannot be disabled | Gemini image generation guide, image thinking-level table | 2026-07-23T20:33:38.645Z |
| gemini-3.1-flash-lite | stable name; deprecated status not exposed by Models API | true (boolean) | level | on (minimal) | minimal, low, medium, high | not specified by the level table | not applicable; minimal is not guaranteed off | not applicable | no; Flash-Lite has no full thinking-off | Gemini GenerateContent Thinking guide, Gemini Flash-Lite table | 2026-07-23T20:33:38.645Z |
| gemini-3.1-flash-lite-image | stable name; deprecated status not exposed by Models API | true (boolean) | level | on (minimal) | minimal, high | not specified by the level table | not applicable; minimal is not guaranteed off | not applicable | no; image thinking cannot be disabled | Gemini image generation guide, image thinking-level table | 2026-07-23T20:33:38.645Z |
| gemini-3.1-flash-lite-preview | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-3.1-flash-tts-preview | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-3.1-pro-preview | preview name; deprecated status not exposed by Models API | true (boolean) | level | on (high; dynamic) | low, medium, high | not specified by the level table | not applicable; minimal is not guaranteed off | not applicable | no | Gemini GenerateContent Thinking guide, Gemini 3.1 Pro table | 2026-07-23T20:33:38.645Z |
| gemini-3.1-pro-preview-customtools | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-3.5-flash | stable name; deprecated status not exposed by Models API | true (boolean) | level | on (medium) | minimal, low, medium, high | not specified by the level table | not applicable; minimal is not guaranteed off | not applicable | no; minimal is not full thinking-off | Gemini GenerateContent Thinking guide, Gemini 3 table | 2026-07-23T20:33:38.645Z |
| gemini-3.5-flash-lite | stable name; deprecated status not exposed by Models API | true (boolean) | level | on (minimal) | minimal, low, medium, high | not specified by the level table | not applicable; minimal is not guaranteed off | not applicable | no; Flash-Lite has no full thinking-off | Gemini GenerateContent Thinking guide, Gemini Flash-Lite table | 2026-07-23T20:33:38.645Z |
| gemini-3.6-flash | stable name; deprecated status not exposed by Models API | true (boolean) | level | on (medium) | minimal, low, medium, high | not specified by the level table | not applicable; minimal is not guaranteed off | not applicable | no; minimal is not full thinking-off | Gemini GenerateContent Thinking guide, Gemini 3 table | 2026-07-23T20:33:38.645Z |
| gemini-flash-latest | latest alias; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-flash-lite-latest | latest alias; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-omni-flash-preview | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-pro-latest | latest alias; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-robotics-er-1.5-preview | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemini-robotics-er-1.6-preview | preview name; deprecated status not exposed by Models API | true (boolean) | budget | dynamic thinking | not applicable; thinkingLevel unsupported | 0..24576 | 0; disables thinking | -1; dynamic thinking (default) | yes | Gemini GenerateContent Thinking guide, thinking-budget table | 2026-07-23T20:33:38.645Z |
| gemma-4-26b-a4b-it | stable name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| gemma-4-31b-it | stable name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| lyria-3-clip-preview | preview name; deprecated status not exposed by Models API | missing (own-property=false) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| lyria-3-pro-preview | preview name; deprecated status not exposed by Models API | missing (own-property=false) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |
| nano-banana-pro-preview | preview name; deprecated status not exposed by Models API | true (boolean) | unknown | not established by the cited GenerateContent thinking tables | unknown | unknown | unknown | unknown | unknown | Models API raw metadata only; exact GenerateContent thinking control evidence not identified in this audit | 2026-07-23T20:33:38.645Z |

### 指定模型覆盖

- `gemini-3.1-pro` 当前 Models API 精确返回的是 `gemini-3.1-pro-preview`；不能把未返回的无后缀 ID 当作当前可用模型。
- `gemini-3-flash` 当前精确返回的是 `gemini-3-flash-preview`。
- `gemini-3.1-flash-lite-image` 当前精确返回，官方图片文档明确为 `minimal` / `high`，且 thinking 默认开启、不能完全关闭；`minimal` 不是关闭。
- `gemini-2.5-flash-lite` 的 Models API 原始 `thinking` 为 `true`，而 GenerateContent 官方表格写明默认模型不思考；两者语义不同：前者是能力字段，后者是默认行为描述，不能互相覆盖。

## 证据文件

- [metadata.json](./metadata.json)：时间、endpoint、分页、活动契约和来源
- [model-audit.json](./model-audit.json)：v1beta 全部 41 个 GenerateContent 模型的逐项表
- [capability-classification-report.md](./capability-classification-report.md)：当前统一 resolver 基于上述本地 fixture 生成的 41 个 GenerateContent 模型最终分类表
- [v1beta-audit.json](./v1beta-audit.json)、[v1-audit.json](./v1-audit.json)：分页、get 请求和逐模型原始审计投影
- [list-get-differences.json](./list-get-differences.json)：list/get 差异清单
- [v1-v1beta-differences.json](./v1-v1beta-differences.json)：版本差异清单
- [requested-model-coverage.json](./requested-model-coverage.json)：用户指定模型的精确 ID 覆盖
- [raw/v1beta](./raw/v1beta)、[raw/v1](./raw/v1)：脱敏后的原始 REST JSON；每个 list page 和每个 GenerateContent model 的 get 响应均单独保存

## 最终结论

1. Schema 层面，`thinking` 没有被官方字段定义标记为 Required，因此服务端字段缺失是需要被表示的合法观测状态；不能用 SDK 默认值替代原始 JSON 事实。
2. 本次 2026-07-23T20:33:38.645Z 实测中，v1beta GenerateContent 模型观察到 10 个 `thinking` 缺失，v1 观察到 5 个；两者均未观察到原始 `false` 或异常类型。该结论只适用于本次日期、账号、API 版本和返回集合，不能外推为字段永远不会缺失。
3. 当前项目的 GenerateContent 契约仍为 v1beta；v1 仅完成了对照请求，未形成迁移结论。
4. GenerateContent 控制分类应以官方 exact-model/官方模型表为证据：Gemini 3.x 用 level；Gemini 2.5 用 budget；不能把 Interactions 的抽象或 Gemini 3.x 的兼容性接受误当作 GenerateContent 推荐契约。
