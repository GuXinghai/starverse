# Generation Parameters Implementation Log

## 阶段目标

记录 provider-aware / model-aware `generationParams` 重构的实际实施过程。本文档随实施推进更新，必须说明每组关键改动的目的、涉及文件、删除了哪些旧路径、保留了哪些路径以及保留理由。

## 实际操作

### Phase 0：边界确认

- 检查当前工作区。
- 确认既有 dirty 文件 `src/next/provider/openai-responses/openaiResponsesAdapter.ts` 属于 OpenAI Responses raw HTTP / stream error diagnostic log，不纳入 generation params 切片。
- 本阶段未修改该 dirty 文件。

### Phase 1：核心领域模型、profile registry、resolver/mapper

新增核心文件：

- `src/next/generation-params/generationParamTypes.ts`
- `src/next/generation-params/generationParamCatalog.ts`
- `src/next/generation-params/generationParamProfiles.ts`
- `src/next/generation-params/generationParamValidation.ts`
- `src/next/generation-params/generationParamResolver.ts`
- `src/next/generation-params/generationParamMappers.ts`

新增 provider profiles：

- `src/next/generation-params/providerProfiles/openrouterGenerationProfile.ts`
- `src/next/generation-params/providerProfiles/geminiGenerationProfile.ts`
- `src/next/generation-params/providerProfiles/openaiResponsesGenerationProfile.ts`
- `src/next/generation-params/providerProfiles/anthropicGenerationProfile.ts`
- `src/next/generation-params/providerProfiles/deepseekGenerationProfile.ts`
- `src/next/generation-params/providerProfiles/genericOpenAICompatibleGenerationProfile.ts`

新增 focused tests：

- `src/next/generation-params/generationParamResolver.test.ts`
- `src/next/generation-params/generationParamProfiles.test.ts`
- `src/next/generation-params/generationParamMappers.test.ts`

本组改动实现：

- `GenerationParamKey` 使用 provider-neutral camelCase。
- `GenerationParamSetting` 使用 `inherit/custom/omit`。
- Resolver 只输出实际发送的 `requestParams`。
- 未配置和显式 `omit` 不进入 `requestParams`。
- unsupported / rejected / noEffect 返回 structured warnings 和 decisions，不静默丢弃，也不在本阶段发送前阻断；非法值仍返回 structured errors。
- deprecated 返回 warning，但仍允许进入 `requestParams`。
- Provider profile registry 支持 model override。
- Mapper 支持 `wireKey` 和 `wirePath`。

### Phase 3：新持久化 key 契约

新增：

- `src/next/generation-params/generationParamPersistence.ts`
- `src/next/generation-params/generationParamPersistence.test.ts`
- `src/next/settings/generationParamsDefaultsClient.ts`
- `src/next/settings/generationParamsDefaultsClient.test.ts`

更新：

- `infra/db/repo/settingsKeys.ts`
- `infra/db/repo/settingsRepo.ts`
- `infra/db/repo/settingsRepo.test.ts`
- `infra/db/worker/handlers/usagePrefsSettingsHandlers.ts`
- `infra/db/dbMethodsRegistry.ts`
- `src/next/ipc/contracts/dbBridgeContracts.ts`
- `src/next/ipc/contracts/dbBridgeContracts.test.ts`

本组改动实现：

- 新全局 key：`settings_kv: generation_params.defaults`。
- 新 project meta key：`generationParamsDefaults`。
- 新 conversation meta key：`generationParamsOverride`。
- 新 persisted shape：`{ version: 1, params: ... }`。
- 新 DB bridge methods：`settings.getGenerationParamsDefaults` / `settings.setGenerationParamsDefaults`。
- 新 renderer client：`getGenerationParamsDefaults()` / `setGenerationParamsDefaults()`。
- 新 persistence helpers 只读取新 key，忽略旧 `sampling_params.defaults` / `samplingParamsDefaults` / `samplingParamsOverride`。

## 涉及文件

见“实际操作”中的文件列表。

## 删除了哪些旧路径

本阶段尚未删除旧路径。原因：

- 当前切片只建立新 core 和测试，避免 UI/发送路径半迁移。
- 旧 `samplingParams` 仍服务现有生产路径，在 Phase 5/6 完成前不能删除。

## 保留了哪些旧路径以及理由

| 旧路径 | 保留理由 | 后续删除点 |
| --- | --- | --- |
| `src/next/openrouter/samplingParamsCatalog.ts` | 现有 UI/发送仍引用 | Phase 6/7 |
| `src/next/openrouter/samplingParamsResolver.ts` | 现有 OpenRouter send path 仍引用 | Phase 6/7 |
| `src/next/openrouter/samplingParamsPersistence.ts` | 现有 settings/project/conversation meta 仍引用 | Phase 3/7 |
| `src/ui-app/components/SamplingParamsSettingsEditor.vue` | UI 尚未迁移 | Phase 4 |
| `ProviderStreamConfig.samplingParams` | provider builders 尚未迁移 | Phase 5/6 |
| `settings.getSamplingParamsDefaults` / `settings.setSamplingParamsDefaults` | 现有 Settings/App 初始化仍调用 | Phase 4/7 |

## 关键发现

- 当前 RuntimeProviderKey 中没有 generic OpenAI-compatible provider id，因此新 core 使用 `GenerationProviderId = RuntimeProviderKey | 'generic_openai_compatible'`，让 Generic profile 能先表达协议差异，后续再接入具体 endpoint config。
- 本阶段只接 provider profile 静态规则；OpenRouter catalog `supportedParameters` 和 Gemini model metadata `topK` 等动态能力证据先作为不可用参数记录来源，不在本轮升级为发送前阻断。

## 风险与取舍

| 风险 | 处理 |
| --- | --- |
| 新 core 与旧生产路径短期并存 | 仅限未接线阶段；实施文档明确后续删除点，避免长期双路径。 |
| DeepSeek thinking model override 目前用 model id pattern | 后续接入实际 thinking mode runtime context 后，应从 runtime mode 而非仅模型名判断 noEffect。 |
| Anthropic modern model rejected rules依赖 model pattern | 后续应结合 model catalog/official model source 增强。 |

## 当前验证

Phase 1 focused validation：

```text
npx vitest --run src/next/generation-params/generationParamResolver.test.ts src/next/generation-params/generationParamProfiles.test.ts src/next/generation-params/generationParamMappers.test.ts
```

结果：

```text
Test Files  3 passed (3)
Tests       18 passed (18)
```

TypeScript：

```text
npx tsc --noEmit --pretty false
```

结果：通过。

Whitespace：

```text
git diff --check
```

结果：通过；仅有既有 `src/next/provider/openai-responses/openaiResponsesAdapter.ts` CRLF warning。

Phase 3 persistence/settings focused validation：

```text
npm run rebuild:node
npx vitest --run src/next/generation-params/generationParamResolver.test.ts src/next/generation-params/generationParamProfiles.test.ts src/next/generation-params/generationParamMappers.test.ts src/next/generation-params/generationParamPersistence.test.ts src/next/settings/generationParamsDefaultsClient.test.ts infra/db/repo/settingsRepo.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts
npx tsc --noEmit --pretty false
```

结果：

```text
Test Files  7 passed (7)
Tests       244 passed (244)
TypeScript  passed
```

## Phase 4：UI / App / OpenRouter send 主路径接线

## 阶段目标

把 Settings、会话配置、项目配置、Console 编辑入口和 OpenRouter 主发送链路从旧 `samplingParams` 切到新 `generationParams`。本阶段只收口 OpenRouter 主路径，不迁移 Gemini / OpenAI Responses / Anthropic / DeepSeek provider builders。

## 实际操作

新增：

- `src/ui-app/components/GenerationParamsSettingsEditor.vue`

更新：

- `src/ui-app/app/chatSessionConfig.ts`
- `src/ui-app/app/chatSessionConfig.test.ts`
- `src/ui-app/app/appChatApp.logic.ts`
- `src/ui-app/AppChatApp.vue`
- `src/ui-app/components/ChatSessionConsole.vue`
- `src/ui-app/components/ChatSessionConsole.*.test.ts`
- `src/ui-app/components/ChatAppComposer.vue`
- `src/ui-app/components/ChatAppComposer.*.test.ts`
- `src/ui-app/components/SettingsPanel.vue`
- `src/ui-app/components/SettingsPanel.test.ts`
- `src/next/provider/providerTypes.ts`
- `src/next/provider/openrouter/openRouterAdapter.ts`
- `src/next/live/openRouterLiveStream.ts`
- `src/next/openrouter/buildRequest.ts`
- `src/next/openrouter/buildRequest.test.ts`
- `src/ui-app/AppChatApp*.test.ts`

本组改动实现：

- `ChatSessionConfig` 字段从 `samplingParams.detail` 改为 `generationParams.detail`。
- 会话 meta 只读写新 key `generationParamsOverride`，不再读取旧 `samplingParamsOverride`。
- 项目 meta 只读写新 key `generationParamsDefaults`。
- Settings 全局默认值读写 `settings.getGenerationParamsDefaults` / `settings.setGenerationParamsDefaults`。
- Settings 更新事件改为 `settings:generationParamsDefaultsUpdated`。
- Console / Settings / project modal 使用 `GenerationParamsSettingsEditor`，支持 `inherit | custom | omit`。
- App send resolver 使用 provider profile + model id 解析新三层配置，并在 resolver errors 出现时发送前失败。
- OpenRouter 主发送 path 传 `generationParams` provider-native patch。
- OpenRouter builder 支持 `generationParams`，会校验 top-level sampling 字段、`reasoning` 和 `verbosity`。既有显式 reasoning 控件仍保留独立 wire 路径；它不是旧 `samplingParams` fallback，但仍是后续 request-shape SSOT 的未解决项。

## 保留了哪些旧路径以及理由

| 旧路径 | 当前状态 | 后续删除点 |
| --- | --- | --- |
| `src/next/openrouter/samplingParamsCatalog.ts` / resolver / persistence | App 主路径不再读取；旧 OpenRouter config scope 和旧单测仍引用 | 删除旧 compatibility scope 时 |
| `src/ui-app/components/SamplingParamsSettingsEditor.vue` | App/Settings/Console 不再引用 | 删除旧组件文件和旧测试时 |
| `ProviderStreamConfig.samplingParams` / `BuildOpenRouterRequestInput.samplingParams` | 保留为旧调用点兼容字段；App 主路径改传 `generationParams` | provider builders 全部迁移后 |
| `settings.getSamplingParamsDefaults` / `settings.setSamplingParamsDefaults` | DB bridge 仍注册，Settings/App 不再调用 | 删除旧 settings client/bridge 时 |
| Non-OpenRouter provider request builders 的 `config.samplingParams` | 尚未迁移 | 下一阶段 provider builder 统一接 `generationParams` |

## 当前验证

```text
npx vue-tsc --noEmit
npx tsc --noEmit --pretty false
npx vitest --run src/next/generation-params/generationParamResolver.test.ts src/next/generation-params/generationParamProfiles.test.ts src/next/generation-params/generationParamMappers.test.ts src/next/generation-params/generationParamPersistence.test.ts src/next/settings/generationParamsDefaultsClient.test.ts infra/db/repo/settingsRepo.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts src/next/openrouter/buildRequest.test.ts src/ui-app/app/chatSessionConfig.test.ts src/ui-app/components/SettingsPanel.test.ts src/ui-app/components/ChatSessionConsole.runtimeSelection.test.ts src/ui-app/components/ChatAppComposer.webSearchSendGuard.test.ts src/ui-app/components/ChatAppComposer.modelPicker.test.ts
npm run gate:network-egress
git diff --check
```

结果：

```text
vue-tsc                    passed
tsc                        passed
focused vitest             13 files passed, 316 tests passed
network egress gate        passed
git diff --check           passed; CRLF warnings only
```

## 未解决问题

1. Gemini / OpenAI Responses / Anthropic / DeepSeek / Generic request builders 仍读取 `config.samplingParams`，尚未统一为 `GenerationRequestConfig.generationParams`。
2. `ProviderStreamConfig.samplingParams` / `BuildOpenRouterRequestInput.samplingParams` 仍作为兼容字段保留，需在所有 provider builder 迁移后删除。
3. 旧 OpenRouter `openRouterConfigScope`、`samplingParams*` core、旧 Settings bridge methods 和旧 editor 文件尚未删除。
4. App 主路径暂未把 resolved generation params 附着到 assistant answer generation snapshot。
5. 还未生成集成测试文档和真实烟测文档。
6. 当前 worktree 中 `src/next/provider/openai-responses/openaiResponsesAdapter.ts` 存在本轮之前的诊断日志脏改动，未纳入本阶段。

## 下一步动作

1. 进入 provider builder 迁移：Gemini / OpenAI Responses / Anthropic / DeepSeek / Generic 消费 `generationParams`。
2. 删除旧 `samplingParams` compatibility 字段、旧 editor、旧 settings bridge 和旧 OpenRouter config scope。
3. 将本次实际发送的 request-shape 附着到 assistant answer generation snapshot。
4. 补集成测试文档与真实 smoke 文档。

## Phase 5/6：发送链路统一与 provider builders 替换

## 阶段目标

让 OpenRouter、Google AI Studio、OpenAI Responses、Anthropic、DeepSeek、Generic OpenAI-compatible 的发送链路都接收同一套 resolved `generationParams` provider-native request patch。Provider builders 不再读取旧 `samplingParams`。

## 实际操作

新增：

- `electron/ipc/providerGenerationParamsPayload.ts`
- `src/next/provider/providerGenerationParams.ts`

更新：

- `electron/electron-env.d.ts`
- `electron/ipc/openAIResponsesTextChatIpc.ts`
- `electron/ipc/googleAIStudioTextChatIpc.ts`
- `electron/ipc/anthropicTextChatIpc.ts`
- `electron/ipc/deepSeekTextChatIpc.ts`
- `src/next/live/openAIResponsesTextChat.ts`
- `src/next/live/googleAIStudioTextChat.ts`
- `src/next/live/anthropicTextChat.ts`
- `src/next/live/deepSeekTextChat.ts`
- `src/ui-app/app/providerRuntimeSendCoordinator.ts`
- `src/ui-app/app/appChatApp.logic.ts`
- `src/next/provider/gemini/geminiRequestBuilder.ts`
- `src/next/provider/openai-responses/openaiResponsesRequestBuilder.ts`
- `src/next/provider/anthropic/anthropicRequestBuilder.ts`
- `src/next/provider/deepseek/deepSeekRequestBuilder.ts`
- `src/next/provider/generic/genericRequestBuilder.ts`
- `src/next/provider/generic/genericEndpointDescriptor.ts`
- `src/next/provider/generic/genericEndpointConfig.ts`
- Focused provider/generic tests listed in the integration test document.

本组改动实现：

- App normal send / regenerate path 继续为 OpenRouter 解析 `generationParams`。
- Experimental provider path 为 OpenAI Responses / Google AI Studio / Anthropic / DeepSeek 解析同一 `generationParams` 并透传到 live wrapper / preload IPC / main IPC。
- IPC 只接受可序列化 plain object，不接受 Error、function、array、prototype object 或过大 payload。
- Gemini builder 只接受 provider-native `{ generationConfig: ... }` patch。
- OpenAI Responses builder 接受 provider-native `temperature`、`top_p`、`max_output_tokens`、`reasoning`、`text`。
- Anthropic builder 接受 provider-native `max_tokens`、`temperature`、`top_p`、`top_k`、`thinking`、`output_config`。
- DeepSeek builder 接受 provider-native `temperature`、`top_p`、`max_tokens`、`thinking`、`reasoning_effort`。
- Generic builder 接受 provider-native legacy/modern OpenAI-compatible patch。
- Generic endpoint capability 字段从 `samplingParams` 改为 `generationParams`。

## Phase 7：legacy sampling path 清理

## 阶段目标

删除旧 `samplingParams` 主路径，确保旧 settings/meta/API 不再影响 UI 或发送。

## 实际操作

删除：

- `src/next/openrouter/openRouterConfigScope.ts`
- `src/next/openrouter/openRouterConfigScope.test.ts`
- `src/next/openrouter/samplingParamsCatalog.ts`
- `src/next/openrouter/samplingParamsResolver.ts`
- `src/next/openrouter/samplingParamsResolver.test.ts`
- `src/next/openrouter/samplingParamsPersistence.ts`
- `src/next/openrouter/samplingParamsPersistence.test.ts`
- `src/next/settings/samplingParamsDefaultsClient.ts`
- `src/next/settings/samplingParamsDefaultsClient.test.ts`
- `src/ui-app/components/SamplingParamsSettingsEditor.vue`

更新：

- `src/next/openrouter/buildRequest.ts` 删除 `samplingParams` input，只保留 `generationParams`。
- `src/next/live/openRouterLiveStream.ts` 删除 `samplingParams` config。
- `src/next/provider/openrouter/openRouterAdapter.ts` 删除 `samplingParams` forwarding。
- `src/next/provider/providerTypes.ts` 删除 `ProviderStreamConfig.samplingParams`。
- `infra/db/repo/settingsKeys.ts` 删除 `SETTINGS_KEY_SAMPLING_PARAMS_DEFAULTS`。
- `infra/db/repo/settingsRepo.ts` 删除 `getSamplingParamsDefaults()` / `setSamplingParamsDefaults()`。
- `infra/db/worker/handlers/usagePrefsSettingsHandlers.ts` 删除 `settings.getSamplingParamsDefaults` / `settings.setSamplingParamsDefaults` handler。
- `infra/db/dbMethodsRegistry.ts` 删除旧 settings methods。
- `src/next/ipc/contracts/dbBridgeContracts.ts` 删除旧 decoder。

当前结果：

- `rg "samplingParams|sampling_params.defaults|SamplingParamsSettingsEditor|samplingParamsDefaultsClient|SETTINGS_KEY_SAMPLING_PARAMS_DEFAULTS|OpenRouterSamplingParamsPatch|resolveSamplingParams|samplingParamsOverride|samplingParamsDefaults" src infra electron --glob '!**/*.test.ts'` 无生产路径结果。
- 测试中保留少量 legacy 字符串仅用于证明旧 `sampling_params.defaults` / `samplingParamsDefaults` / `samplingParamsOverride` 不再被新 persistence 读取。

## 当前验证

```text
npm run rebuild:node
npx vitest --run src/next/generation-params/generationParamResolver.test.ts src/next/generation-params/generationParamMappers.test.ts src/next/generation-params/generationParamProfiles.test.ts src/next/generation-params/generationParamPersistence.test.ts src/next/provider/gemini/geminiRequestBuilder.test.ts src/next/provider/openai-responses/openaiResponsesRequestBuilder.test.ts src/next/provider/anthropic/anthropicRequestBuilder.test.ts src/next/provider/deepseek/deepSeekRequestBuilder.test.ts src/next/provider/generic/genericRequestBuilder.test.ts src/next/provider/generic/genericAdapter.test.ts src/next/provider/generic/genericEndpointDescriptor.test.ts src/next/provider/generic/genericEndpointConfig.test.ts src/next/openrouter/buildRequest.test.ts infra/db/repo/settingsRepo.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts src/next/settings/generationParamsDefaultsClient.test.ts
npx vitest run src/next/openrouter/buildRequest.test.ts src/next/provider/openai-responses/openaiResponsesRequestBuilder.test.ts src/next/provider/anthropic/anthropicRequestBuilder.test.ts src/next/provider/deepseek/deepSeekRequestBuilder.test.ts src/next/provider/gemini/geminiRequestBuilder.test.ts src/next/provider/generic/genericEndpointDescriptor.test.ts src/next/provider/generic/genericRequestBuilder.test.ts
npx vitest run src/next/live/openRouterLiveStream.test.ts src/next/live/openRouterLiveStream.requireParameters.test.ts src/next/live/openRouterLiveStream.parity.test.ts
npx tsc --noEmit --pretty false
```

结果：

```text
rebuild:node                 passed
focused vitest               16 files passed, 568 tests passed
builder SSOT focused vitest  7 files passed, 146 tests passed
OpenRouter live SSOT tests   3 files passed, 28 tests passed
tsc                          passed
```

## 未解决问题

1. `src/next/provider/openai-responses/openaiResponsesAdapter.ts` 仍有本轮之前的 raw HTTP / stream error diagnostic dirty diff；未纳入 generation params 语义。
2. `AssistantAnswerGenerationSnapshot` 尚未实现；本轮只确保发送时 generation params request patch 已是可保存的 provider-native 参数补丁。文本 provider builders 已不再从 `requestedReasoningMode` / `requestedReasoningEffort` / text `geminiThinking` 写请求体；Gemini Interactions 生图路径仍使用 `geminiThinking` 生成 `generation_config.thinking_level` / `thinking_summaries`，需要后续并入 generation params 或 image-generation policy。
3. 真实桌面 smoke 已完成启动、composer 加载和 credential bridge 只读检查；早期 Playwright 路径存在 profile 不一致风险，后续已修正为从 package root 启动，确认主用户 profile 为 `[redacted-user-data]`。修正 smoke 脚本对 `{ ok, status }` credential bridge wrapper 的解析后，OpenRouter / OpenAI Responses / Google AI Studio / Anthropic / DeepSeek 均返回 `apiKeyConfigured: true`，来源为 `secure_store`，`storageBackend` 为 `electron_safe_storage`。
4. 旧 `docs/features/*` 历史文档仍可能提到 sampling parameters；本轮工程路径已清理，历史文档可单独归档或更新。

## 当前完成状态汇总

- Core 类型 / resolver / profile / mapper 已切到 `generationParams`。
- Mapper 已修正为 model-aware：resolver 和 wire patch 映射均使用同一个 `modelId` 维度的 effective capability。
- Settings / project / conversation persistence 使用新 key：`generation_params.defaults`、`generationParamsDefaults`、`generationParamsOverride`。
- App normal send / regenerate path 和 experimental provider path 都会解析并透传 provider-native generation params request patch。
- OpenRouter / Google AI Studio text / OpenAI Responses / Anthropic / DeepSeek / Generic OpenAI-compatible builders 的自定义生成参数补丁和文本 reasoning/thinking 请求字段都只读 `config.generationParams`；旧 `requestedReasoningMode` / `requestedReasoningEffort` 不再写 provider wire body。Gemini Interactions 生图 thinking summary/level 仍由 `geminiThinking` 驱动，作为明确待收口项记录。
- 旧 `samplingParams` 生产路径、旧 settings bridge methods、旧 OpenRouter sampling core 和旧 editor 已删除。
- 生产路径扫描未发现 `samplingParams` / `sampling_params.defaults` 等旧主链路残留。
- 自动化 focused validation 通过；changed-test-file 宽扫暴露的主要 UI/i18n/test fixture drift 已按失败分组收口，详见集成测试文档。
- 真实 Electron 桌面应用可启动并加载 composer；OpenRouter / Google AI Studio / OpenAI Responses / Anthropic / DeepSeek 已使用主用户 profile 完成可发送代表组合的真点击 smoke，并记录 requestParams 与 provider wire 参数。已观测但暂不阻断的 provider 参数拒绝见真实烟测文档。

## 未解决问题清单

| 问题 | 当前状态 | 是否阻断 generation params 代码收口 | 建议处理 |
| --- | --- | --- | --- |
| 真实 provider smoke 请求 | 桌面启动、composer 加载、credential bridge 只读检查已完成；修正后主用户 profile 为 `[redacted-user-data]`，credential service 可读到五个 provider key；OpenRouter / Google AI Studio / OpenAI Responses / Anthropic / DeepSeek 已完成可发送代表组合的真点击 smoke，并记录 requestParams 与 wire 参数 | 不阻断代码收口；OpenAI Responses `temperature + reasoningEffort`、Anthropic `reasoningEffort`、DeepSeek `thinkingEnabled` 已观测 provider 拒绝，按 Owner 口径仅记录、不阻断 | 若要把不可用组合转为 UI/profile 阻断，需要单独 Owner 决策；本轮只保留记录 |
| `AssistantAnswerGenerationSnapshot` | 本轮非目标；当前 resolver/request config 已输出可保存的 provider-native generation params patch，文本 provider request builders 已切到 generationParams-only；Gemini 生图 thinking 仍是独立 request-shape 输入 | 不阻断本轮旧 sampling 清理，但阻止宣称完整 request-shape SSOT 覆盖全部图片生成功能 | 下一阶段若要保存完整 request-shape，需要把 Gemini image thinking summary/level 一并归入 generation params/image-generation snapshot |
| Gemini Models API 动态 `topK` metadata | 当前只实现静态 provider profile 和 model override；未接入 Models API 返回的 per-model `topK` 空值记录 | 不阻断本轮静态 profile 交付；按 Owner 口径，先记录不可用参数，不做发送前阻断 | 后续把 catalog/model metadata 输入不可用参数审计记录；是否升级为 UI/profile 阻断需单独决策 |
| DeepSeek thinking mode runtime context | 当前使用 model id pattern 判断 v4/reasoner/thinking 下的 noEffect 参数 | 不阻断本轮，但可能不如运行时 mode 精确 | 后续让 resolver 接收实际 thinking mode runtime context |
| Gemini image thinking 尚未并入 generation params SSOT | Google AI Studio Interactions 生图仍通过 `geminiThinking` 写 `generation_config.thinking_level` / `thinking_summaries`；文本 request builders 已切断 legacy reasoning consumption | 不阻断旧 sampling path 替换；阻断“所有 request-shape 都可只从 generationParams snapshot 重放”的最终声明 | 后续把 Gemini image thinking summary/level 纳入 generation params 或 image-generation policy，并更新 smoke/snapshot |
| OpenAI Responses raw HTTP diagnostic dirty diff | `src/next/provider/openai-responses/openaiResponsesAdapter.ts` 已存在非本轮 generation params dirty diff | 不阻断本轮代码逻辑，但提交时必须单独处理边界 | 提交时排除或作为独立 diagnostic 提交处理 |
| 历史 docs 中 sampling 术语 | 工程路径和当前 UI 已切到 generation params，历史 docs 仍可能有旧术语 | 不阻断本轮 | 另做 docs cleanup，避免扩大本切片 |

## 需要 Owner 决策清单

| 决策点 | 当前建议 |
| --- | --- |
| 是否继续扩展真实 provider smoke 覆盖到全部 provider * 参数状态矩阵 | 已完成五个 provider 的可发送代表组合；若继续扩大到更多模型/参数组合，应单独排期，不能用单测冒充真实 smoke 通过 |
| 是否现在实现 `AssistantAnswerGenerationSnapshot` | 不做；目标明确列为非目标，下一阶段处理 |
| 是否将 Gemini model metadata 动态不可用记录纳入本轮 | 不纳入；当前改为后续不可用参数记录项，暂不做阻断 |
| OpenAI Responses diagnostic dirty diff 是否提交 | 不和 generation params 混提交；提交前由 Owner 决定保留、撤销或单独提交 |
| 历史 docs sampling 术语是否同批清理 | 建议另开 docs cleanup，避免扩大本轮代码切片 |

## Phase 8：UI i18n closeout

## 阶段目标

补齐新 generation params 编辑器和控制台分区的可见文案 i18n，避免新统一参数体系继续显示旧 OpenRouter `Sampling` 术语。

## 实际操作

- `src/ui-app/components/GenerationParamsSettingsEditor.vue` 接入 `t()` / `tf()`。
- Console section 文案从旧 `chat.console.section.sampling` 改为 `chat.console.section.generationParams`。
- `chat.generationParams.*` 增加中英文文案，覆盖展开/收起、重置、三态模式、来源、空状态、unsupported fallback 和参数说明 tooltip。
- Settings 全局标题从 `Global Custom Parameters` / `全局自定义参数` 改为 `Global Generation Parameters` / `全局生成参数`。

## 验证

```text
npx vitest --run src/shared/i18n/index.test.ts src/ui-app/components/ChatSessionConsole.runtimeSelection.test.ts src/ui-app/components/SettingsPanel.test.ts
npx tsc --noEmit --pretty false
npx vue-tsc --noEmit
npm run gate:network-egress
git diff --check
```

结果：

```text
i18n / Console / Settings focused tests passed: 3 files, 68 tests
tsc passed
vue-tsc passed
network egress gate passed
git diff --check passed
```

## Phase 9：真实 smoke 修复与会话配置回读修正

## 阶段目标

修正真实点击 smoke 过程中暴露的非 provider 问题，确保主用户 profile credential 可被正确识别，且控制台修改的 generation params 能从 conversation meta 正确回读。

## 实际操作

- `scripts/smoke/generation-params-real-click-smoke.mjs` 修正 credential bridge status 解析：bridge 返回 `{ ok, status }`，脚本应读取 `result.status`。
- smoke 脚本保持从 package root `.` 启动 Electron，复用主用户 `[redacted-user-data]`。
- smoke 脚本在发送前记录 generation params editor applied snapshot，并在浮动控制台打开时先关闭控制台再点击发送。
- `src/ui-app/app/chatSessionConfig.ts` 反序列化 conversation meta 时使用 `extractConvoGenerationParamsOverride()`，正确解包 `{ version: 1, params: ... }`。
- `src/ui-app/app/appChatApp.logic.ts` 为 session generation params quick-save 增加 pending layer；保存进行中收到的新值按 last-write-wins 继续落库，避免 mode/value 快速连续更新时后一项被丢弃。
- `src/ui-app/app/chatSessionConfig.test.ts` 增加 versioned `generationParamsOverride` round-trip 测试。

## 当前验证

```text
npm run rebuild:electron
npm run smoke:generation-params-real-click -- --provider google_ai_studio --model gemini-2.5-flash-lite --credential-check-only --timeout-ms 60000
npm run smoke:generation-params-real-click -- --provider google_ai_studio --model gemini-2.5-flash-lite --preset reset --param temperature=0.2 --param maxOutputTokens=64 --prompt "请用一句中文回复：参数烟测通过。" --timeout-ms 180000
npm run rebuild:node
npx vitest run src/ui-app/app/chatSessionConfig.test.ts
npx tsc --noEmit --pretty false
npx vue-tsc --noEmit
npm run gate:network-egress
git diff --check
```

结果：

```text
credential check passed; all five provider credential statuses were apiKeyConfigured=true from secure_store/electron_safe_storage
Google AI Studio real-click smoke passed; applied temperature=0.2 and maxOutputTokens=64, then returned to idle
chatSessionConfig focused test passed: 6 tests
tsc passed
vue-tsc passed
network egress gate passed
git diff --check passed; CRLF warnings only
```

## Phase 10：Provider 矩阵 smoke 与不可用参数记录

## 阶段目标

用真实桌面点击路径补齐 OpenRouter / Google AI Studio / OpenAI Responses / Anthropic / DeepSeek 的 provider 参数 smoke，记录实际 `requestParams` 和 provider wire 参数。不可用参数或 provider 拒绝组合本轮只记录，暂不在 resolver/profile 阻断。

## 实际操作

- `scripts/smoke/generation-params-real-click-smoke.mjs` 继续复用主用户 profile，package script 默认带 `--use-main-user-data`。
- `src/ui-app/app/appChatApp.logic.ts` 的 smoke trace 记录 send-time `requestParams` 和 provider wire 参数，但不记录 API key、Authorization 或用户密钥。
- `src/next/live/openAIResponsesTextChat.ts` 补齐 renderer live bridge 对主进程结束哨兵 `{ type: "end" }` 的忽略逻辑，与 Anthropic / Google / DeepSeek live wrapper 保持一致。
- `src/next/live/openAIResponsesTextChat.test.ts` 增加 OpenAI Responses wire end sentinel 回归，防止成功流结束后被误判为 `invalid_wire_event`。
- `src/ui-app/components/GenerationParamsSettingsEditor.vue` 增加高级参数显示开关，使 OpenRouter `minP` / `topA` / `repetitionPenalty` / `seed` / `verbosity` 这类 `visibleByDefault: false` 但 `editable: true` 的 profile 参数拥有真实 UI 配置路径。
- `scripts/smoke/generation-params-real-click-smoke.mjs` 在目标参数未渲染时自动展开高级参数，再进行真实点击设置。
- 真实 smoke 已覆盖：
  - OpenRouter / `deepseek/deepseek-v4-flash`：all-open、all-off、random。
  - Google AI Studio / `gemini-2.5-flash-lite`：all-open、all-off、random。
  - OpenAI Responses / `gpt-5.4-nano`：all-off、random、reasoning subset、verbosity subset、sendable all-open subset，以及 `temperature + reasoningEffort` all-open attempt provider rejected 记录。
  - Anthropic Messages / `claude-haiku-4-5-20251001`：all-off、random，以及 `reasoningEffort` all-open attempt provider rejected 记录。
  - DeepSeek / `deepseek-v4-flash`：all-off、random、reasoning subset，以及 `thinkingEnabled` all-open attempt provider rejected 记录。

## 已记录但暂不阻断的 provider 行为

| Provider | Model | 参数/组合 | Provider 结果 | 当前处理 |
| --- | --- | --- | --- | --- |
| OpenAI Responses | `gpt-5.4-nano` | `temperature=0.2` + `reasoningEffort=low` | HTTP 400 provider rejected | 仅记录；暂不在 resolver/profile 阻断 |
| Anthropic Messages | `claude-haiku-4-5-20251001` | `reasoningEffort=low` | `invalid_request_error` provider rejected | 仅记录；暂不在 resolver/profile 阻断 |
| DeepSeek | `deepseek-v4-flash` | `thinkingEnabled=true` | HTTP 400 provider rejected | 仅记录；暂不在 resolver/profile 阻断 |

## 当前验证

```text
npx vitest run src/next/live/openAIResponsesTextChat.test.ts
node --check scripts\smoke\generation-params-real-click-smoke.mjs
npx vitest run src/next/generation-params/generationParamProfiles.test.ts src/next/generation-params/generationParamResolver.test.ts src/next/live/openAIResponsesTextChat.test.ts
```

结果：

```text
OpenAI Responses live focused test passed
smoke script syntax check passed
profiles/resolver/OpenAI live focused tests passed: 3 files, 16 tests
```
