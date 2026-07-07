# Generation Parameters Investigation

## 阶段目标

调查 Starverse 现有“自定义参数”实现，明确旧语义、legacy 路径、OpenRouter 中心化假设、非 OpenRouter provider 未完整接入的问题，以及会影响 provider-aware / model-aware generation parameters 重构质量的旁支问题。

本阶段只读调查并记录证据，不实施 runtime、UI、DB schema 或 provider request builder 改动。

## 实际操作

- 读取任务参考文档：`C:\Users\m1389\.codex\attachments\a0baa76a-c147-4827-94be-940af1c6e2e2\pasted-text-1.txt`。
- 检查工作区 dirty 状态。
- 搜索并梳理 `samplingParams`、`sampling_params.defaults`、`SamplingParamsSettingsEditor`、provider request builder、App send path、Settings DB bridge、model catalog supported parameters 的当前实现。
- 仅新增本文档；未改运行时代码。

## 涉及文件

### 当前 dirty 边界

| 文件 | 当前状态 | 判断 |
| --- | --- | --- |
| `src/next/provider/openai-responses/openaiResponsesAdapter.ts` | 已有未提交改动 | 只包含 OpenAI Responses raw HTTP / stream error diagnostic log。不是 generation params 范围，后续不得混入本轮提交。 |

### 旧参数领域模型

| 文件 | 当前职责 |
| --- | --- |
| `src/next/openrouter/samplingParamsCatalog.ts` | OpenRouter 风格参数全集与范围：`temperature`, `top_p`, `top_k`, `min_p`, `top_a`, `frequency_penalty`, `presence_penalty`, `repetition_penalty`, `seed`, `max_tokens`。 |
| `src/next/openrouter/samplingParamsResolver.ts` | `default/custom` 双态规范化、三层解析、输出 `requestPatch`。 |
| `src/next/openrouter/samplingParamsPersistence.ts` | 从 project/conversation meta 读写 `samplingParamsDefaults` / `samplingParamsOverride`。 |
| `src/next/openrouter/openRouterConfigScope.ts` | 将 reasoning / web search / samplingParams 合并为 OpenRouter config scope。 |

### 当前 UI 与配置入口

| 文件 | 当前职责 |
| --- | --- |
| `src/ui-app/components/SamplingParamsSettingsEditor.vue` | 参数编辑器。当前 UI 语义是 `default/custom`，并硬编码多处英文文案。 |
| `src/ui-app/components/SettingsPanel.vue` | 全局“自定义参数”入口，读写 `settings.getSamplingParamsDefaults` / `settings.setSamplingParamsDefaults`。 |
| `src/ui-app/components/ChatSessionConsole.vue` | 会话控制台 Sampling 区域，编辑 conversation-level override。 |
| `src/ui-app/AppChatApp.vue` | 将会话 resolved sampling params 和 update 事件连接到 composer/console/project settings。 |
| `src/ui-app/app/chatSessionConfig.ts` | 将 conversation meta 的 `samplingParamsOverride` 反序列化进 `ChatSessionConfig.samplingParams.detail`，保存时仍写回旧 key。 |
| `src/ui-app/app/appChatApp.logic.ts` | 维护 global/project/conversation 三层 sampling state，并在 OpenRouter send path 解析为 request patch。 |

### 当前 DB / IPC 持久化

| 文件 | 当前职责 |
| --- | --- |
| `infra/db/repo/settingsKeys.ts` | 定义 `SETTINGS_KEY_SAMPLING_PARAMS_DEFAULTS = 'sampling_params.defaults'`。 |
| `infra/db/repo/settingsRepo.ts` | 通过 `settings_kv` 读写全局 sampling defaults。 |
| `infra/db/worker/handlers/usagePrefsSettingsHandlers.ts` | 注册 `settings.getSamplingParamsDefaults` / `settings.setSamplingParamsDefaults`。 |
| `infra/db/dbMethodsRegistry.ts` | 声明上述 settings method 可被 renderer/worker 使用。 |
| `src/next/settings/samplingParamsDefaultsClient.ts` | Renderer client bridge。 |
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 对 get response 仅做 `value: any | null` 级别解码，未做领域级 schema 校验。 |

### 当前 provider request builders

| 文件 | 当前消费方式 |
| --- | --- |
| `src/next/openrouter/buildRequest.ts` | 直接消费 `samplingParams`，按 OpenRouter snake_case/top-level 字段写请求。支持旧 catalog 的 10 个参数。 |
| `src/next/provider/gemini/geminiRequestBuilder.ts` | Builder 支持 `temperature`, `top_p -> topP`, `max_tokens -> maxOutputTokens`，但正常 App experimental send path 当前未把 resolved sampling params 传入。 |
| `src/next/provider/openai-responses/openaiResponsesRequestBuilder.ts` | Builder 只读取 `samplingParams.max_tokens -> max_output_tokens`。 |
| `src/next/provider/anthropic/anthropicRequestBuilder.ts` | Builder 只读取 `temperature`, `top_p`；`max_tokens` 使用 Anthropic builder 自身默认/入参，不来自 sampling params。 |
| `src/next/provider/deepseek/deepSeekRequestBuilder.ts` | Builder 支持 `temperature`, `top_p`, `max_tokens`。 |
| `src/next/provider/generic/genericRequestBuilder.ts` | Builder 支持 `temperature`, `top_p`, `max_tokens`。 |

## 关键发现

### 1. 当前领域名和参数全集仍以 OpenRouter 为事实源

当前参数目录在 `src/next/openrouter/` 下，类型名为 `OpenRouterSamplingParamName` / `OpenRouterSamplingParamsPatch`。UI 上显示为 “Custom Parameters”，但领域模型实际是 OpenRouter sampling catalog。

这与目标冲突：

- `max_tokens` 属于输出长度控制，不是 sampling。
- reasoning / thinking / verbosity 不是 sampling。
- OpenRouter 的宽参数集不能作为 Gemini / OpenAI Responses / Anthropic / DeepSeek 的全局参数全集。

### 2. 当前 `default` 语义混合了多个概念

当前层级设置只有：

- `{ mode: 'default' }`
- `{ mode: 'custom'; value: number }`

Resolver 的实际行为是：`default` 不会生成 request field，并且继续寻找下层 project/global custom。也就是说当前 `default` 更接近“本层继承/未覆盖”，不是 provider default。

缺失目标要求的三态：

- `inherit`
- `custom`
- `omit`

当前无法表达“conversation 明确终止 global topP，不发送该字段”。这会阻塞 “未配置/显式 omit/provider 隐式默认都不得进入 requestParams” 的新语义。

### 3. 旧三层持久化完整存在

当前已有三层：

- Global: `settings_kv` key `sampling_params.defaults`
- Project meta: `samplingParamsDefaults`
- Conversation meta: `samplingParamsOverride`

这些都仍在主 UI 和 send path 中生效。参考任务要求破坏性重构且不迁移旧值，因此后续必须改为：

- `generation_params.defaults`
- `generationParamsDefaults`
- `generationParamsOverride`

并确保旧 key 不再影响发送。

### 4. OpenRouter 主发送链路已接通，非 OpenRouter 主链路未完整接通

OpenRouter send / regenerate path 当前会调用 `resolveSamplingParamsConfigForConvoId()`，再把 `samplingParamsConfig.requestPatch` 传给 `streamViaOpenRouterAsDomainEventsWithLegacyStoreCredentialSource()`。

Experimental provider path 当前传入：

- `geminiThinking`
- `imageGeneration`
- local endpoint / LM Studio / Ollama config

但没有传入 resolved `samplingParams`。因此 Gemini / OpenAI Responses / Anthropic / DeepSeek builders 虽然有局部 sampling params 单测能力，正常 UI 主发送链路不一定实际可达。

这会直接影响目标中的验收项：非 OpenRouter provider 的 UI 主发送链路也必须收到 generationParams。

### 5. Provider request builder 仍直接读取 `samplingParams`

多个 builder 的输入类型仍是 `ProviderStreamConfig.samplingParams?: unknown`，builder 内部自行按旧 key 读取。

这与目标冲突：

- 所有 provider request builder 应只消费统一 `GenerationRequestConfig.generationParams`。
- Builder 不应直接依赖 OpenRouter 专用 resolver 或 snake_case canonical key。
- Builder 不应 silently drop resolved generation params。

### 6. Model catalog 记录 supported/default parameters，但未参与参数 UI/发送治理

Model catalog 存在：

- `supportedParameters`
- `defaultParameters`
- `maxOutputTokens`
- endpoint supported parameters

但当前 `SamplingParamsSettingsEditor` 不按 provider/model capability 过滤可编辑参数，send resolver 也不根据 provider/model profile 做 rejected / unsupported / deprecated / noEffect 决策。

这意味着当前系统无法表达：

- Gemini 3 sampling deprecated。
- Anthropic 现代 Claude 对 temperature/top_p/top_k 的模型级拒绝。
- DeepSeek thinking enabled 下 temperature/topP noEffect/rejected。
- Generic OpenAI-compatible legacy/modern max token wire key 差异。

### 7. UI 文案仍会误导新语义

当前 UI 名称和控件包括：

- `SamplingParamsSettingsEditor`
- `settings.customParams.title`
- `Parameters`
- `default`
- `custom`
- `Reset`

若直接改底层而保留这些文案，会继续暗示 “default = provider 默认值” 或 “sampling = 所有生成参数”。后续 UI 三态改造必须同步处理。

### 8. Generic endpoint capability 当前默认允许 samplingParams，但不区分协议版本

Generic capability 默认 `samplingParams: true`，request builder 只映射：

- `temperature`
- `top_p`
- `max_tokens`

目标要求 Generic OpenAI-compatible 区分 legacy `max_tokens` 和 modern `max_completion_tokens`。当前 generic capability 不足以表达这个差异。

### 9. 当前 request config / answer meta 不足以支持后续快照

当前 assistant message meta 主要保存 `providerId` / `modelId` 等基础字段。`samplingParams` 作为会话/project/global 当前状态解析，未作为“本次实际发送 request-shape”附着到 answer。

本轮非目标是不实现 `AssistantAnswerGenerationSnapshot`，但 generation params resolver 输出必须为后续 snapshot 准备：只输出并保存实际发送字段，不能混入 inherited/omitted/provider default。

## 风险与取舍

| 风险 | 影响 | 当前阶段结论 |
| --- | --- | --- |
| 直接删除旧 sampling key 会让旧会话/旧配置失效 | 用户明确允许不兼容旧会话和旧设置 | 后续实施应按破坏性重构执行，不写兼容 fallback。 |
| OpenRouter 诊断日志 dirty 文件仍在工作区 | 容易混入本轮提交 | 本轮不触碰该文件；提交前必须单独确认 staged 范围。 |
| Provider 官方能力有模型级差异 | 静态 provider profile 不足以长期准确 | 第一阶段可建静态 profile + modelOverrides；Gemini topK 等可记录为需要 metadata 输入的后续风险。 |
| UI 与发送链路同时重构范围大 | 容易出现 UI 写新 key、send 读旧 key 的混合状态 | 计划阶段必须明确删除/替换顺序和测试矩阵。 |
| Builder 单测已覆盖旧 `samplingParams` | 重构会破坏大量测试 | 后续应按新 `generationParams` 语义重写测试，不做兼容适配。 |
| Anthropic / DeepSeek noEffect/rejected 策略可能需要 Owner 确认 | 阻断还是隐藏会影响用户体验 | 当前 Owner 口径为先记录不可用参数、暂不阻断；后续如要升级为阻断需再次决策。 |

## 未解决问题

1. `src/next/provider/openai-responses/openaiResponsesAdapter.ts` 的 raw diagnostic log 是否保留、提交或撤销，仍需单独处理；本任务不应混入。
2. Provider 文档中 Anthropic 现代模型、OpenAI Responses reasoning/verbosity、Gemini model metadata 的最新能力需要在计划/实现前再次用官方文档确认。
3. Generic OpenAI-compatible “legacy vs modern” 判定目前没有清晰配置入口，需要在计划阶段定义。
4. 当前 real smoke 需要真实 API key/余额/模型可用性；若环境不可用，必须在真实烟测文档中记录阻断，不能用单测替代。
5. 旧 `docs/features/*` 和 `docs/i18n/*` 中仍有 sampling parameter 历史说明，是否同步更新为本轮 scope 需计划阶段决定。

## 下一步动作

1. 进入计划文档阶段，明确最终架构、文件迁移方案、legacy 删除点、provider profile 设计、UI 三态、测试矩阵和真实烟测方案。
2. 计划文档完成后停止并等待 Owner 确认，再进入核心类型/resolver 实施。
3. 在任何代码提交前，先确认 `git status --short --untracked-files=all`，并排除既有 OpenAI Responses diagnostic dirty 文件。
