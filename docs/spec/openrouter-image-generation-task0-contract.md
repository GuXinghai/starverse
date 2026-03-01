# OpenRouter 图片生成 Task 0 契约冻结

更新时间：2026-02-19  
适用范围：Starverse / OpenRouter text-to-image（仅任务卡 0）
规范性来源 commit：`ad11b7c3447d9a33096b6ab6cffcebfaad2ae41d`

## 1. 事实源与范围

- 规范性来源唯一事实源：`docs/requirements/OPENROUTER_IMAGE_GENERATION_TASK_CARDS.md`
- 本文是实现索引与摘要，不具备独立规范效力；字段枚举与约束解释以 requirements 文档为准。
- 规范段落索引：
- 全局约束：`docs/requirements/OPENROUTER_IMAGE_GENERATION_TASK_CARDS.md`（“全局硬性要求”）
- 任务卡 0：`docs/requirements/OPENROUTER_IMAGE_GENERATION_TASK_CARDS.md`（“任务卡 0：调研与契约冻结”）
- 本文只冻结任务卡 0：
- 图片生成最小协议（请求/响应/流式解析/错误落点）
- 模型发现、过滤、回退、自检策略
- 参考模型类别（text+image 与 image-only）
- 不包含图像输入与文件上传能力

## 2. 最小请求契约（冻结）

请求端点：
- `POST /api/v1/chat/completions`

请求字段（图片生成相关）：
- `modalities`
- text+image 输出模型：`['image', 'text']`
- image-only 输出模型：`['image']`
- `image_config`
- 最小必填支持：`aspect_ratio`、`image_size`
- 高级参数：允许透传（保留 `Record<string, unknown>` 扩展口）

约束：
- 任务卡 0 只冻结字段与选择规则，不在此阶段落具体 UI 参数面板实现。

## 3. 最小响应契约（冻结）

图片字段路径：
- 非流式：`choices[0].message.images`
- 流式：`choices[0].delta.images`
- 每张图 URL：`image_url.url`
- URL 形态：`data:` URL（供后续任务卡 2 落盘）

统一内部事件（冻结）：
- 每个图片条目映射为 `MessageAppendContentBlock`
- block 结构：`{ type: 'image', url: string }`

## 4. 流式解析与错误落点（冻结）

流式解析硬约束：
- SSE comment 行必须忽略，不参与 JSON 解析。
- 解析路径必须同时覆盖 `delta.images` 与非流式 `message.images`。

错误归一化与 UI 落点：
- HTTP pre-stream 错误：归一到 `StreamError`（`pre_stream_error`）。
- SSE 中途错误：归一到 `StreamError`（`mid_stream_error`）。
- 协议/解析错误：归一到 `StreamError`。
- UI 展示入口：
- run 级：`RunState.error`
- message 级：`MessageState.errorEnvelope`
- 消息气泡展示链路：`src/ui-app/AppChatApp.vue` -> `src/ui-kit/chat/ChatMessageBubble.vue`

## 5. 模型发现与过滤策略（冻结）

数据源策略：
1. 模型列表主源：`/models/user`
2. 模型列表回退：`/models`
3. 基线计数：`/models/count`
4. 端点详情：`/models/:author/:slug/endpoints`

可出图过滤规则（按优先顺序）：
1. `architecture.output_modalities` 包含 `image`
2. `architecture.input_modalities` 包含 `text`（当前范围仅 text-to-image）
3. 模型为 active（若有 status 字段）
4. 模型为 visible（若有 visibility 字段）
5. 未过期（若有 `expirationAtSec`）

能力分类：
- `text_and_image`：output 同时包含 `text` 与 `image`
- `image_only`：output 包含 `image` 且不包含 `text`

请求 modalities 映射：
- `text_and_image` -> `['image', 'text']`
- `image_only` -> `['image']`

回退规则：
1. 选中模型不满足可出图过滤：禁用图片生成并给出明确原因。
2. 没有 `text_and_image`，但有 `image_only`：仅允许 `['image']` 模式。
3. 完全无可出图模型：图片生成入口禁用并提示“当前模型目录无 image 输出能力模型”。

## 6. “本地只看到少量模型”自检流程（冻结）

步骤：
1. 读取已拉取模型数量 `listedModelCount`
2. 调用 `/models/count` 得到 `countProbe`
3. 判定：
- `probe_missing`：计数接口不可用，仅告警不阻断
- `possible_subset`：`listedModelCount < countProbe`，提示可能只拉到子集
- `ok`：`listedModelCount >= countProbe`

说明：
- 该自检用于发现“目录明显不完整”，不直接改变最终可出图过滤规则。

## 7. 端点级元数据策略（冻结）

目标：
- 对单模型拉取 endpoints，用于 provider/tag/quantization/性能与状态展示。

策略：
- 端点元数据用于“展示与排序解释”，不直接替代 `output_modalities` 的能力判定。
- capability gate 仍以模型级 `output_modalities` 为准。

## 8. 任务卡 0 参考模型（冻结）

本仓库内固定验收夹具：
- text+image：`openai/vision-image-dual`
- image-only：`openai/image-writer`
- 文件：`tests/fixtures/model-catalog/openrouter-models-image-generation-task0.fixture.json`

运行时选择策略：
- 使用 `selectImageGenerationReferenceModels` 从实时目录挑选首个符合两类能力的模型。

## 9. 已冻结实现资产

- 契约规则模块：`src/next/openrouter/imageGenerationContract.ts`
- 契约单测：`src/next/openrouter/imageGenerationContract.test.ts`
- 任务卡 0 参考夹具：`tests/fixtures/model-catalog/openrouter-models-image-generation-task0.fixture.json`

## 10. 与任务卡 1 的接口边界

任务卡 0 只冻结契约，不改现有请求和解析主流程。  
任务卡 1 将按本文约束落具体实现：
- 请求体注入 `modalities` / `image_config`
- 解析 `message.images` / `delta.images`
- 将图片增量事件接入现有状态机与 UI 渲染
