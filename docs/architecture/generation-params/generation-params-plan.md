# Generation Parameters Plan

## 阶段目标

在调查结论基础上，设计 Starverse provider-aware / model-aware `generationParams` 体系的实施方案。计划必须确保最终只有一套生成参数事实路径，破坏性替换旧 `samplingParams`，并为后续 `AssistantAnswerGenerationSnapshot` 保存“本次实际发送 request-shape”打基础。

本阶段只产出计划文档，不实施 runtime、UI、DB、provider request builder 或测试改动。

## 实际操作

- 读取任务参考文档：`C:\Users\m1389\.codex\attachments\a0baa76a-c147-4827-94be-940af1c6e2e2\pasted-text-1.txt`。
- 复核调查文档：`docs/architecture/generation-params/generation-params-investigation.md`。
- 复核当前 dirty 边界：`src/next/provider/openai-responses/openaiResponsesAdapter.ts` 仍为既有 OpenAI Responses raw error diagnostic log，不纳入本计划切片。
- 通过当前代码确认旧路径和配置入口：
  - `src/next/openrouter/samplingParamsCatalog.ts`
  - `src/next/openrouter/samplingParamsResolver.ts`
  - `src/next/openrouter/samplingParamsPersistence.ts`
  - `src/ui-app/components/SamplingParamsSettingsEditor.vue`
  - `src/ui-app/app/appChatApp.logic.ts`
  - `src/ui-app/app/chatSessionConfig.ts`
  - `infra/db/repo/settingsRepo.ts`
  - `infra/db/worker/handlers/usagePrefsSettingsHandlers.ts`
  - provider request builders
- 核对官方 provider 文档：
  - OpenRouter API parameters 文档列出宽参数集，并要求按模型 provider section 确认实际支持。
  - OpenAI Responses API 文档确认 `temperature`、`top_p`、`max_output_tokens`、`reasoning.effort`、`reasoning.summary`、`text.verbosity` 等字段。
  - Gemini API 文档确认 `generationConfig` 内的 `temperature`、`topP`、`topK`、`maxOutputTokens`、`presencePenalty`、`frequencyPenalty`、`seed`、`thinkingConfig`；Gemini 3 文档建议保留 temperature 默认值并使用 `thinking_level`。
  - Anthropic 文档确认 Claude Opus 4.7+ / Opus 4.8 / Sonnet 5 对 `temperature`、`top_p`、`top_k` 非默认值返回 400。
  - DeepSeek 文档确认 chat API 支持 `temperature`、`top_p`、`max_tokens`，但 thinking mode 下 `temperature`、`top_p`、`presence_penalty`、`frequency_penalty` 无效，且 thinking toggle / effort 使用 `thinking` 与 `reasoning_effort`。

## 涉及文件

计划覆盖以下文件族；实施时应按阶段拆分修改，并保持 staged 范围可审计：

- `src/next/generation-params/*`
- `src/next/generation-params/providerProfiles/*`
- `src/next/openrouter/buildRequest.ts`
- `src/next/provider/*/*RequestBuilder.ts`
- `src/next/live/*TextChat.ts`
- `electron/ipc/*TextChatIpc.ts`
- `src/ui-app/app/chatSessionConfig.ts`
- `src/ui-app/app/appChatApp.logic.ts`
- `src/ui-app/components/GenerationParamsSettingsEditor.vue`
- `src/ui-app/components/ChatSessionConsole.vue`
- `src/ui-app/components/SettingsPanel.vue`
- `infra/db/repo/settingsRepo.ts`
- `infra/db/worker/handlers/usagePrefsSettingsHandlers.ts`
- `src/next/ipc/contracts/dbBridgeContracts.ts`
- `docs/architecture/generation-params/*`

## 最终架构语义

### 领域命名

将旧 `samplingParams` 升级为 `generationParams`。理由：

- `max_tokens` / `max_output_tokens` 是输出长度控制，不是 sampling。
- reasoning / thinking / verbosity 是推理预算或输出风格控制，不是 sampling。
- OpenRouter 的宽参数集只能作为 OpenRouter profile，不能作为 Starverse 全局事实。

### 参数状态

新状态使用三态：

```ts
export type GenerationParamSetting<T> =
  | { mode: 'inherit' }
  | { mode: 'custom'; value: T }
  | { mode: 'omit' }
```

语义：

| 状态 | 语义 | 是否进入 requestParams |
| --- | --- | --- |
| `inherit` | 本层不决定，继续向上层继承 | 只有继承链上找到 `custom` 且 provider/model 支持时才进入 |
| `custom` | 本层明确设置该值 | 校验通过后进入 |
| `omit` | 本层明确终止继承，不发送该字段 | 不进入 |

旧 `{ mode: 'default' }` 不进入新体系。它混淆了“继承 Starverse 配置”“使用 provider 默认值”“省略字段”。新体系不把 provider 隐式默认值写入本地，也不把未配置字段序列化进请求。

### Canonical Key

内部 key 一律使用 provider-neutral camelCase。provider wire key 由 mapper 处理。

第一阶段 canonical keys：

```ts
export type GenerationParamKey =
  | 'temperature'
  | 'topP'
  | 'topK'
  | 'minP'
  | 'topA'
  | 'frequencyPenalty'
  | 'presencePenalty'
  | 'repetitionPenalty'
  | 'seed'
  | 'maxOutputTokens'
  | 'reasoningEffort'
  | 'reasoningSummary'
  | 'thinkingEnabled'
  | 'thinkingBudget'
  | 'thinkingLevel'
  | 'verbosity'
```

禁止把 `top_p`、`max_tokens`、`max_output_tokens` 作为 Starverse 内部领域 key；它们只允许出现在 provider mapper / wire payload 中。

### Resolver 输出

resolver 只输出“本次实际要发送给 provider 的参数”，不填 provider 默认值。

```ts
export type GenerationParamSource = 'conversation' | 'project' | 'global'

export type GenerationParamDecisionState =
  | 'sent'
  | 'omitted'
  | 'inheritedToAbsent'
  | 'unsupported'
  | 'rejected'
  | 'deprecated'
  | 'noEffect'

export interface ResolvedGenerationParams {
  requestParams: Partial<Record<GenerationParamKey, unknown>>
  decisions: Partial<Record<GenerationParamKey, GenerationParamDecision>>
  warnings: GenerationParamWarning[]
  errors: GenerationParamError[]
}
```

约束：

- `requestParams` 只包含实际发送字段。
- `omit`、未配置、unsupported、provider 隐式默认值都不进入 `requestParams`。
- `unsupported` 本阶段只作为不可用参数记录和 warning，不进入 `requestParams`，也不产生发送前阻断。
- `rejected` / `noEffect` 本阶段只作为不可用参数记录和 warning，不产生发送前阻断；如果 provider 实际拒绝，由真实 smoke/错误链路记录。
- 非法值产生 preflight error，阻断发送，因为值无法规范化。
- `deprecated` 默认隐藏或警告，不自动阻断。
- `temperature + topP` 同时 custom 产生 warning，不阻断。
- 未来 snapshot 只保存 `requestParams`，不保存继承状态、UI 默认值或 provider 隐式默认值。

## 文件迁移方案

### 新增领域目录

```text
src/next/generation-params/
  generationParamTypes.ts
  generationParamCatalog.ts
  generationParamProfiles.ts
  generationParamResolver.ts
  generationParamValidation.ts
  generationParamMappers.ts
  generationParamPersistence.ts
  providerProfiles/
    openrouterGenerationProfile.ts
    geminiGenerationProfile.ts
    openaiResponsesGenerationProfile.ts
    anthropicGenerationProfile.ts
    deepseekGenerationProfile.ts
    genericOpenAICompatibleGenerationProfile.ts
```

职责：

| 文件 | 职责 |
| --- | --- |
| `generationParamTypes.ts` | 核心类型、三态、decision、warning/error、provider profile 类型 |
| `generationParamCatalog.ts` | provider-neutral 参数元信息、label、help、基础范围 |
| `generationParamProfiles.ts` | profile registry、provider/model profile 解析 |
| `generationParamResolver.ts` | global/project/conversation 三层解析，输出 `ResolvedGenerationParams` |
| `generationParamValidation.ts` | 范围、枚举、conflict、unsupported/rejected/noEffect 校验 |
| `generationParamMappers.ts` | `requestParams` 到 provider wire patch 的映射 |
| `generationParamPersistence.ts` | 新 settings/meta key 读写、旧 key 清理辅助 |
| `providerProfiles/*` | 各 provider 的 wire protocol、capability、modelOverrides |

### 替换 UI 组件

```text
src/ui-app/components/SamplingParamsSettingsEditor.vue
```

替换为：

```text
src/ui-app/components/GenerationParamsSettingsEditor.vue
```

旧组件不保留 compatibility wrapper。所有引用一次性迁移。

### 替换 settings bridge

```text
src/next/settings/samplingParamsDefaultsClient.ts
```

替换为：

```text
src/next/settings/generationParamsDefaultsClient.ts
```

DB method 新增：

```text
settings.getGenerationParamsDefaults
settings.setGenerationParamsDefaults
```

旧 `settings.getSamplingParamsDefaults` / `settings.setSamplingParamsDefaults` 删除或停止注册。若保留测试 fixture 中的旧方法名，必须先删除测试依赖。

### 替换 App / session config 字段

```text
ChatSessionConfig.samplingParams
```

替换为：

```text
ChatSessionConfig.generationParams
```

事件名替换：

```text
settings:samplingParamsDefaultsUpdated
```

改为：

```text
settings:generationParamsDefaultsUpdated
```

## 需要删除或停用的 legacy 路径

### 旧文件

实施完成时应删除或彻底断开：

```text
src/next/openrouter/samplingParamsCatalog.ts
src/next/openrouter/samplingParamsResolver.ts
src/next/openrouter/samplingParamsPersistence.ts
src/next/settings/samplingParamsDefaultsClient.ts
src/ui-app/components/SamplingParamsSettingsEditor.vue
```

如某个旧文件因阶段性编译需要短暂停留，必须在实施记录文档中列出后续删除点；最终状态不允许旧 resolver 继续影响发送。

### 旧 settings/meta key

旧 key 不迁移，不兼容，不 fallback：

| 旧路径 | 新路径 |
| --- | --- |
| `settings_kv: sampling_params.defaults` | `settings_kv: generation_params.defaults` |
| project meta `samplingParamsDefaults` | project meta `generationParamsDefaults` |
| conversation meta `samplingParamsOverride` | conversation meta `generationParamsOverride` |

应用初始化或 settings 保存路径可安全删除旧 key，但旧值不能进入新 resolver。

### 旧类型/字段

需要替换：

```text
OpenRouterSamplingParamName
OpenRouterSamplingParamsPatch
SamplingParamsLayer
ResolvedSamplingParams
ProviderStreamConfig.samplingParams
BuildOpenRouterRequestInput.samplingParams
resolveSamplingParamsConfigForConvoId
activeSessionSamplingParamsResolved
sessionSamplingParamsDraftResolved
projectSamplingParamsResolved
```

新字段：

```text
GenerationParamKey
GenerationParamsLayer
ResolvedGenerationParams
GenerationRequestConfig.generationParams
Build*RequestInput.config.generationParams
resolveGenerationParamsConfigForConvoId
activeSessionGenerationParamsResolved
```

## Provider Profile 设计

### OpenRouter

OpenRouter profile 保留最宽参数集，但它只是 OpenRouter provider profile：

| canonical key | wire key/path | 状态 |
| --- | --- | --- |
| `temperature` | `temperature` | stable |
| `topP` | `top_p` | stable |
| `topK` | `top_k` | stable |
| `minP` | `min_p` | stable |
| `topA` | `top_a` | stable |
| `frequencyPenalty` | `frequency_penalty` | stable |
| `presencePenalty` | `presence_penalty` | stable |
| `repetitionPenalty` | `repetition_penalty` | stable |
| `seed` | `seed` | stable |
| `maxOutputTokens` | `max_tokens` | stable |
| `reasoningEffort` | `reasoning.effort` | stable/provider-specific |
| `reasoningSummary` | `reasoning.exclude`/OpenRouter reasoning display policy 待细化 | provider-specific |
| `verbosity` | `verbosity` | provider-specific |

OpenRouter 同时列出 `max_tokens` 与 `max_completion_tokens`。第一阶段只暴露一个 canonical `maxOutputTokens`，默认映射 `max_tokens`；若后续需要区分 reasoning token cap，新增独立 key，不让用户同时配置两个语义重叠字段。

OpenRouter 文档明确要求按模型 provider section 确认实际支持。因此 resolver 需要结合 OpenRouter catalog 的 `supportedParameters` 做 model-level override；如果 model catalog 缺失，则按 OpenRouter profile 给 warning，并可选择 require_parameters 策略后续处理。

### Google AI Studio / Gemini

Gemini 文本 generateContent profile：

| canonical key | wire path | 状态 |
| --- | --- | --- |
| `temperature` | `generationConfig.temperature` | stable；Gemini 3 默认隐藏/警告 |
| `topP` | `generationConfig.topP` | stable；Gemini 3 默认隐藏/警告 |
| `topK` | `generationConfig.topK` | model-dependent；Gemini 3 默认隐藏/警告 |
| `maxOutputTokens` | `generationConfig.maxOutputTokens` | stable |
| `presencePenalty` | `generationConfig.presencePenalty` | stable |
| `frequencyPenalty` | `generationConfig.frequencyPenalty` | stable |
| `seed` | `generationConfig.seed` | stable/best-effort |
| `thinkingBudget` | `generationConfig.thinkingConfig.thinkingBudget` | Gemini 2.5 family |
| `thinkingLevel` | `generationConfig.thinkingConfig.thinkingLevel` | Gemini 3 family |

重要约束：

- Gemini 3 文档建议 temperature 保持默认值；UI 默认隐藏或显示 deprecated warning。
- `topK` 需要参考 model metadata。官方文档说明空 `topK` 表示该模型不允许设置 `topK`。本轮先把这类信息作为不可用参数证据记录来源，不直接升级为发送前阻断；若后续要改为 UI/profile 阻断，需要单独 Owner 决策。
- Gemini 3 `thinking_level` 与 legacy `thinking_budget` 不得同时发送。
- Google AI Studio 现有独立 image-generation policy 保持不并入本次 generation params 第一阶段；本次只确保文本生成参数不会与已有 Gemini native thinking/image policy 冲突。

### OpenAI Responses

OpenAI Responses profile：

| canonical key | wire path | 状态 |
| --- | --- | --- |
| `temperature` | `temperature` | stable |
| `topP` | `top_p` | stable |
| `maxOutputTokens` | `max_output_tokens` | stable |
| `reasoningEffort` | `reasoning.effort` | reasoning models only |
| `reasoningSummary` | `reasoning.summary` | reasoning models only |
| `verbosity` | `text.verbosity` | stable |

不加入 Responses 文档未支持的字段：

```text
topK
minP
topA
seed
frequencyPenalty
presencePenalty
repetitionPenalty
```

模型级 override：

- `gpt-5.1` reasoning effort: `none | low | medium | high`。
- `gpt-5-pro` reasoning effort: only `high`。
- `xhigh` 只在官方支持的模型范围开放。

如果 UI 对完全无 wire target 的非 reasoning model 设置 `reasoningEffort` / `reasoningSummary`，resolver 应返回 `unsupported`，不把无效字段发送给 Responses API。若字段有 wire target 但 provider/model 可能拒绝，本阶段只记录 warning，不发送前阻断。

### Anthropic Messages

Anthropic profile：

| canonical key | wire path | 状态 |
| --- | --- | --- |
| `maxOutputTokens` | `max_tokens` | stable/required |
| `temperature` | `temperature` | model-dependent |
| `topP` | `top_p` | model-dependent |
| `topK` | `top_k` | model-dependent |
| `thinkingEnabled` | `thinking.type` | model-dependent |
| `thinkingBudget` | `thinking.budget_tokens` | legacy extended-thinking models only |
| `reasoningEffort` | `output_config.effort` | adaptive-thinking models |

默认策略：

- Claude Opus 4.7+ / Opus 4.8：`temperature`、`topP`、`topK` 非默认值 marked `rejected`。
- Claude Sonnet 5：`temperature`、`topP`、`topK` 非默认值 marked `rejected`。
- 对这些模型，UI 默认不展示 sampling 控件；如果旧或外部输入强行设置，本阶段只记录 warning 并继续发送，provider 拒绝结果进入不可用参数记录。
- Manual extended thinking `thinking: { type: "enabled", budget_tokens }` 对 Sonnet 5 / Opus 4.7+ / Opus 4.8 marked `rejected`；用 adaptive thinking + `output_config.effort`。

仍需 Owner 决策：

- 对 Claude Sonnet 4.5 / Haiku 4.5 等非上述模型，是否允许 `temperature/topP/topK`，以及 UI 默认是否展示。

### DeepSeek

DeepSeek profile：

| canonical key | wire path | 状态 |
| --- | --- | --- |
| `temperature` | `temperature` | stable in non-thinking mode |
| `topP` | `top_p` | stable in non-thinking mode |
| `maxOutputTokens` | `max_tokens` | stable |
| `thinkingEnabled` | `thinking.type` via extra body | thinking models |
| `reasoningEffort` | `reasoning_effort` | thinking models |
| `presencePenalty` | `presence_penalty` | deprecated/noEffect |
| `frequencyPenalty` | `frequency_penalty` | deprecated/noEffect |

策略：

- thinking mode enabled 时，`temperature`、`topP`、`presencePenalty`、`frequencyPenalty` marked `noEffect`，Starverse 本阶段只记录 warning 并继续发送；后续是否升级为 UI/profile 阻断需要 Owner 决策。
- non-thinking mode 可发送 `temperature`、`topP`、`maxOutputTokens`。
- `reasoningEffort` 支持 `high/max`；`low/medium/xhigh` 的兼容映射如果保留，应在 profile 中明示 warning。

### Generic OpenAI-compatible

Generic profile 不猜测所有 OpenAI 新参数。新增协议模式：

```ts
type GenericOpenAICompatibleProtocol =
  | 'openai-chat-compatible-legacy'
  | 'openai-chat-compatible-modern'
```

映射：

| canonical key | legacy wire | modern wire |
| --- | --- | --- |
| `temperature` | `temperature` | `temperature` |
| `topP` | `top_p` | `top_p` |
| `maxOutputTokens` | `max_tokens` | `max_completion_tokens` |
| `presencePenalty` | `presence_penalty` | `presence_penalty` |
| `frequencyPenalty` | `frequency_penalty` | `frequency_penalty` |

配置入口：

- 在 generic endpoint descriptor/config 中新增 protocol 字段。
- 旧 `capabilityOverride.samplingParams` 替换为 `generationParams` capability，至少能表达 disabled、legacy、modern。
- 没有明确 protocol 时默认 legacy，且 UI 显示 warning。

## UI 三态语义

### 展示文案

| 内部状态 | 中文文案 | 英文文案 |
| --- | --- | --- |
| `inherit` | 继承 | Inherit |
| `custom` | 自定义 | Custom |
| `omit` | 不发送 | Omit |

不要再使用 `default` 表示 provider 默认值。

### 控件行为

- SettingsPanel：编辑 global `generation_params.defaults`。
- Project settings：编辑 project `generationParamsDefaults`。
- ChatSessionConsole：编辑 conversation `generationParamsOverride`。
- Composer 下方仅显示当前会话实际有效的简短状态，不新建第二套自由输入。
- 参数列表按当前 `providerId/modelId` 的 profile 过滤。
- unsupported 不显示。
- deprecated 默认隐藏，可通过“显示高级/不推荐参数”展开。
- rejected/noEffect 允许 custom 继续发送，但必须显示 warning 并在 resolved decisions 中记录，避免把 provider 风险静默吞掉。
- `omit` 必须可见，且能明确覆盖上层 custom。

### 状态摘要

UI 摘要应区分：

- `N custom`
- `M omitted`
- `K inherited`
- `warnings/errors`

不显示 provider 隐式默认值为“已配置值”。placeholder 可展示“provider default”，但不能写入状态。

## 统一发送链路

### App 层解析

新增统一解析函数：

```ts
async function resolveGenerationParamsConfigForConvoId(input: {
  convoId: string
  providerId: RuntimeProviderKey
  modelId: string
  runtimeContext: GenerationParamRuntimeContext
}): Promise<ResolvedGenerationParams>
```

调用点：

- OpenRouter normal send
- OpenRouter regenerate
- experimental provider send path
- Google AI Studio
- OpenAI Responses
- Anthropic
- DeepSeek
- Generic provider

### Request config

替换：

```ts
ProviderStreamConfig.samplingParams
```

为：

```ts
ProviderStreamConfig.generationParams?: Partial<Record<GenerationParamKey, unknown>>
```

或者更明确：

```ts
GenerationRequestConfig.generationParams?: ResolvedGenerationParams['requestParams']
```

Builder 禁止读取：

- active UI state
- activeSessionConfig
- old OpenRouter sampling resolver
- global/project/conversation meta

Builder 只消费已经解析好的 `generationParams`。

### Mapper 设计

统一 mapper：

```ts
mapGenerationParamsToProviderRequestPatch({
  profile,
  requestParams,
})
```

支持：

- `wireKey`: top-level field
- `wirePath`: nested field
- protocol-specific conversion
- assertion：resolver 未允许的字段不得被 mapper 静默丢弃

示例：

```ts
topP + OpenRouter -> { top_p: 0.9 }
topP + Gemini -> { generationConfig: { topP: 0.9 } }
maxOutputTokens + OpenAI Responses -> { max_output_tokens: 2048 }
verbosity + OpenAI Responses -> { text: { verbosity: 'low' } }
reasoningEffort + DeepSeek -> { reasoning_effort: 'high' }
```

## 分阶段实施方案

### Phase 0：边界清理

目标：避免混入当前 OpenAI Responses diagnostic dirty 文件。

动作：

- 确认 `src/next/provider/openai-responses/openaiResponsesAdapter.ts` 是否单独提交、保留或撤销。
- generation params 分支只 stage 本计划内文件。
- 禁止 `git add -A`。

停止条件：

- 该 dirty 文件来源仍不明确，或无法避免混入。

### Phase 1：核心类型与 resolver

动作：

- 新增 `src/next/generation-params/*` core files。
- 实现 `GenerationParamSetting`、`GenerationParamKey`、`ProviderGenerationParamProfile`。
- 实现 `resolveGenerationParamsFromLayers()`。
- 实现 `omit` 覆盖上层 custom。
- 实现 warning/error decision。

验收：

- Resolver 单测不依赖 provider builder。
- 未配置参数不进入 `requestParams`。
- 显式 `omit` 不进入 `requestParams`。
- provider 隐式默认值不进入 `requestParams`。

### Phase 2：provider profiles

动作：

- 新增六个 provider profile。
- 增加 model override 匹配。
- 接入 OpenRouter catalog `supportedParameters`。
- 接入 Gemini model metadata `topK` 不可用参数记录；暂不做发送前阻断。

验收：

- OpenRouter 现有 10 个旧参数均可表达。
- OpenAI Responses 不暴露 Responses API 未支持字段。
- Gemini 3 sampling 参数 deprecated/默认隐藏。
- Anthropic Sonnet 5 / Opus 4.7+ rejected sampling 被记录为 warning，不在本阶段发送前阻断。
- DeepSeek thinking mode noEffect 被记录为 warning，不在本阶段发送前阻断。
- Generic legacy/modern max token wire key 可区分。

### Phase 3：持久化替换

动作：

- 新增 `generation_params.defaults`。
- 新增 project/conversation meta key。
- 删除或停用旧 settings methods。
- App 初始化不再读取旧 sampling key。
- Settings 保存时可清理旧 key，但不迁移旧值。

验收：

- 旧 `sampling_params.defaults` 不影响发送。
- 旧 `samplingParamsDefaults` 不影响发送。
- 旧 `samplingParamsOverride` 不影响发送。
- 新 settings/client/IPC schema 做领域级 validation。

### Phase 4：UI 三态改造

动作：

- 替换 `SamplingParamsSettingsEditor.vue`。
- SettingsPanel / AppChatApp.vue / ChatSessionConsole 接新组件。
- 完成中英文 i18n。
- 按 provider/model capability 过滤参数。

验收：

- OpenRouter 显示 OpenRouter profile 参数。
- OpenAI Responses 不显示 `minP/topA/repetitionPenalty`。
- Gemini 3 默认不显示或警告 sampling 参数。
- Anthropic rejected 参数 custom 时显示 warning。
- DeepSeek thinking mode noEffect 参数 custom 时显示 warning。

### Phase 5：发送链路统一

动作：

- App normal send 和 regenerate path 都解析 `generationParams`。
- experimental provider path 接收同一 resolved requestParams。
- provider stream config 全部替换为 `generationParams`。

验收：

- OpenRouter / Google / OpenAI Responses / Anthropic / DeepSeek / Generic UI 主发送链路都使用同一解析结果。
- 不存在 UI 写新 key、builder 读旧 key 的混合状态。

### Phase 6：provider builders 替换

动作：

- OpenRouter builder 从 `generationParams` 生成 OpenRouter wire patch。
- Gemini builder 从 `generationParams` 生成 `generationConfig`。
- OpenAI Responses builder 从 `generationParams` 生成 Responses fields。
- Anthropic builder 从 `generationParams` 生成 Messages fields。
- DeepSeek builder 从 `generationParams` 生成 Chat fields。
- Generic builder 根据 protocol 生成 legacy/modern fields。

验收：

- `rg "samplingParams"` 在生产路径无旧主链路残留。
- Builder 不再读取 active UI/config/meta。
- Builder 不再 silently drop 已解析参数。

### Phase 7：legacy 清理

动作：

- 删除旧 sampling files 或确保无引用。
- 删除旧 tests 或重写为 generation params tests。
- 更新旧 docs 中会误导当前行为的关键页面，历史归档文档可另行标注。

验收：

- 旧 resolver 不再编译进发送路径。
- 旧 settings method 不可从 renderer 调用。
- 旧 meta key 不再影响 UI 和发送。

## 测试矩阵

### Resolver tests

- global custom `topP` + project inherit + conversation inherit => sends `topP`。
- global custom `topP` + conversation omit => does not send `topP`。
- no custom anywhere => no `topP` in `requestParams`。
- conversation custom overrides project/global。
- project custom overrides global。
- unsupported custom => warning，不阻断，也不进入 requestParams。
- rejected custom => warning，不阻断。
- noEffect custom => warning，不阻断。
- deprecated custom => warning。
- `temperature` + `topP` custom => warning, not error。
- invalid numeric range => validation error。
- enum outside allowed values => validation error。

### Provider profile tests

- OpenRouter supports existing 10 params。
- OpenRouter model supportedParameters can hide/mark unsupported params。
- Gemini maps `topP` to `generationConfig.topP`。
- Gemini maps `maxOutputTokens` to `generationConfig.maxOutputTokens`。
- Gemini empty model `topK` metadata is recorded as unavailable evidence without preflight blocking in this phase。
- Gemini 3 marks `temperature/topP/topK` deprecated。
- OpenAI Responses supports only documented Responses fields。
- OpenAI Responses rejects `minP/topA/repetitionPenalty`。
- `gpt-5.1` reasoning effort options exclude `minimal/xhigh` if profile says so。
- `gpt-5-pro` only accepts `high`。
- Anthropic Sonnet 5 marks `temperature/topP/topK` non-default as provider-rejected warning。
- Anthropic Opus 4.7+ marks `temperature/topP/topK` non-default as provider-rejected warning。
- DeepSeek thinking enabled records `temperature/topP/presencePenalty/frequencyPenalty` as noEffect warning。
- DeepSeek thinking disabled sends `temperature/topP/maxOutputTokens`。
- Generic legacy maps `maxOutputTokens` to `max_tokens`。
- Generic modern maps `maxOutputTokens` to `max_completion_tokens`。

### Builder tests

- OpenRouter request contains expected snake_case fields only for requestParams。
- Gemini request writes nested `generationConfig` only when non-empty。
- OpenAI Responses request writes `text.verbosity` and `reasoning.summary` correctly。
- Anthropic request writes `max_tokens` from `maxOutputTokens` and does not mix old `maxTokens` fallback unexpectedly。
- DeepSeek request writes `thinking` / `reasoning_effort` only under profile-approved conditions。
- Generic builder respects protocol mode。
- Every builder ignores absent params and does not fill provider defaults。

### App integration tests

- OpenRouter UI send includes resolved `generationParams`。
- OpenAI Responses UI send includes selected custom params。
- Google UI send includes Gemini generationConfig params。
- Anthropic UI send records rejected sampling warnings and continues request。
- DeepSeek UI send records noEffect sampling warnings and continues request。
- experimental provider path receives `generationParams`。
- Old global `sampling_params.defaults` no longer affects send。
- Old project `samplingParamsDefaults` no longer affects send。
- Old conversation `samplingParamsOverride` no longer affects send。

### UI tests

- SettingsPanel uses new editor and no longer renders `sampling-params-editor` test id。
- ChatSessionConsole uses `inherit/custom/omit` options。
- Provider/model switch changes visible parameter set。
- unsupported params are hidden。
- deprecated params are hidden by default or show warning when advanced is enabled。
- `omit` summary is visible and blocks inheritance.
- zh-CN and en-US i18n complete。

### Cleanup/gate tests

- `rg "samplingParams|sampling_params.defaults|SamplingParamsSettingsEditor" src infra electron` returns no production main path references, except explicitly documented archived docs/tests if any。
- `npx tsc --noEmit --pretty false`。
- `npx vue-tsc --noEmit`。
- focused vitest for generation params resolver/profile/builder/UI/App integration。
- `npm run gate:network-egress`。
- `git diff --check`。

## 真实烟测方案

真实烟测在实施和集成测试后执行，不用 builder 单测替代。

流程：

1. `npm run rebuild:electron`。
2. `npm run dev` 或项目当前 Electron dev 启动命令。
3. 创建新会话。
4. 选择 provider。
5. 选择指定低价模型。
6. 设置 generation params。
7. 发送短文本。
8. 确认收到短文字回复。
9. 记录实际 requestParams 和 provider wire fields。

提示词：

```text
请只回复“ok”。
```

供应商和模型：

| Provider | Model |
| --- | --- |
| OpenAI Responses | `gpt-5.4-nano` |
| Anthropic | `claude-haiku-4.5` |
| Google AI Studio | `gemini-2.5-flash-lite` |
| DeepSeek | `deepseek-v4-flash` |

每个 provider 测三组：

| 参数状态 | 要求 |
| --- | --- |
| 全开 | 当前 provider/model 支持且 UI 可配置的 generation params 全部 custom |
| 全关 | 所有 generation params omit 或未配置，确认 request 不发送这些字段 |
| 随机开启 | 随机一部分 custom，其余 omit/inherit |

真实烟测文档必须记录：

- provider
- model
- 参数状态
- UI 设置值
- resolved `requestParams`
- builder wire payload 参数
- 是否返回短文字
- provider error / local validation error
- 是否需要后续决策

如果 API key、余额、区域、模型可用性、供应商文档变化、SDK/API 行为变化导致无法完成，记录为真实烟测阻断项，不用单测冒充通过。

## 关键发现

- 本轮目标是 provider-aware / model-aware `generationParams`，不是 OpenRouter `samplingParams` 字段扩容。
- 旧 `default/custom` 无法区分继承、provider 默认和显式不发送，必须改为 `inherit/custom/omit`。
- Resolver 的唯一事实输出是 `requestParams`，只包含本次实际发送字段；未配置字段、显式 omit 字段和 provider 隐式默认值都不得进入。
- OpenRouter 宽参数集只能作为 `openrouter` profile，不能继续作为 Starverse 全局参数事实源。
- 非 OpenRouter provider 的 UI 主发送链路必须统一接入 resolved `generationParams`，否则 builder 支持只会停留在单测可达。
- 真实 smoke 依赖真实 API key、余额、地区和模型可用性；环境不可用时必须记录阻断，不能用自动化测试替代。

## 风险与取舍

| 风险 | 影响 | 计划处理 |
| --- | --- | --- |
| 破坏性删除旧 key | 旧会话/旧设置失效 | 用户明确允许；不迁移、不 fallback。 |
| OpenAI Responses diagnostic dirty 文件 | 容易混入提交 | Phase 0 先处理边界；提交前只 stage generation params 文件。 |
| Provider/model 能力变化快 | 静态 profile 可能过期 | profile + modelOverrides；关键能力用 catalog metadata 输入；真实烟测记录阻断。 |
| Anthropic/DeepSeek noEffect/rejected 策略影响体验 | 用户可能想强行发送 | 本阶段默认记录 warning 并继续发送；如需升级为阻断必须 Owner 决策。 |
| Generic protocol 无来源 | 可能错误映射 `maxOutputTokens` | 新增 explicit protocol config；默认 legacy + warning。 |
| UI/发送/DB 同时变更范围大 | 容易出现新旧混合 | 分阶段但不长期并存；每阶段有 rg gate 和 integration tests。 |
| 旧 docs 大量提到 sampling | 文档漂移 | 必须更新会误导当前行为的 docs；历史归档可另列后续清理。 |

## 未解决问题

1. `src/next/provider/openai-responses/openaiResponsesAdapter.ts` 的 raw diagnostic log 是否提交、保留或撤销，需要在 Phase 0 单独决策。
2. Anthropic `claude-haiku-4.5` 是否仍允许 `temperature/topP/topK` 需要实施前用实际 model docs 或 smoke 验证；如果官方资料不足，先保守隐藏或 require model override。
3. DeepSeek `deepseek-v4-flash` 的 Starverse 模型 ID 与官方 thinking/non-thinking mode 对应关系需要从当前 provider source 和真实请求验证。
4. Generic OpenAI-compatible protocol mode 的 UI/配置入口需要 Owner 确认是否放在 endpoint descriptor。
5. Gemini image-generation policy 与文本 generation params 的边界需要保持清晰，避免 image thinking/image size 参数混入本轮文本参数 core。
6. 旧 `docs/features/SAMPLING_PARAMETERS_FEATURE.md` 等文档是否在同一实施提交更新，还是另做 docs cleanup，需要 Owner 决策。

## 下一步动作

1. 停止在计划阶段并等待 Owner 确认。
2. Owner 确认后先做 Phase 0：处理 OpenAI Responses diagnostic dirty 边界。
3. 再做 Phase 1：核心类型、resolver、validation、mapper 的 focused 单测。
4. 每完成一个阶段更新实施记录文档，并在提交前确认 staged 范围。

## 参考资料

- [OpenRouter API Parameters](https://openrouter.ai/docs/api/reference/parameters)
- [OpenRouter Models API supported_parameters](https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties)
- [OpenAI Responses API create](https://developers.openai.com/api/reference/resources/responses/methods/create/)
- [OpenAI Reasoning models guide](https://developers.openai.com/api/docs/guides/reasoning)
- [Gemini generateContent API](https://ai.google.dev/api/generate-content)
- [Gemini 3 Developer Guide](https://ai.google.dev/gemini-api/docs/gemini-3)
- [Claude Sonnet 5 behavior changes](https://docs.anthropic.com/en/docs/about-claude/models/whats-new-sonnet-5)
- [Claude Messages API](https://docs.anthropic.com/en/api/messages)
- [Claude model migration guide](https://platform.claude.com/docs/en/about-claude/models/migration-guide)
- [DeepSeek Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion)
- [DeepSeek Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode)
