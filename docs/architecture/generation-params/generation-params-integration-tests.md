# Generation Parameters Integration Tests

## 阶段目标

记录 provider-aware / model-aware `generationParams` 重构后的自动化验证范围、命令、结果、失败处理和剩余测试风险。

## 实际操作

- 切换 better-sqlite3 到 Node/Vitest ABI。
- 运行 provider builder、resolver、mapper、persistence、settings repo、DB bridge、Generic fixture focused tests。
- 修正 mapper 的 model-aware 覆盖缺口：`mapGenerationParamsToProviderRequestPatch()` 现在接收 `modelId`，和 resolver 使用同一套 effective capability。
- 运行本轮改动 test 文件集合的宽扫，用于发现 App/UI test drift。
- 运行主 TypeScript 检查。

## 涉及文件

- `src/next/generation-params/*`
- `src/next/provider/*/*RequestBuilder.test.ts`
- `src/next/provider/generic/genericAdapter.test.ts`
- `src/next/provider/generic/genericEndpoint*.test.ts`
- `src/next/openrouter/buildRequest.test.ts`
- `infra/db/repo/settingsRepo.test.ts`
- `src/next/ipc/contracts/dbBridgeContracts.test.ts`
- `src/next/settings/generationParamsDefaultsClient.test.ts`

## 关键发现

- Focused tests 证明 resolver/profile/mapper/persistence/builder 主路径已经切到 `generationParams`。
- Mapper 的 model-aware 缺口已修复：resolver 和 provider wire patch 映射都使用同一个 `modelId` 维度的 effective capability。
- 旧 `sampling_params.defaults` / `samplingParamsDefaults` / `samplingParamsOverride` 的测试只保留为负向证明：这些旧配置不再影响新读取或发送。
- 本轮宽扫暴露的 UI fixture drift 主要来自 locale、credential preflight mock、message asset hydration mock 和旧 test id；已按失败分组收口。
- 自动化测试不能证明真实 provider 账户、区域、模型可用性和 provider 实际接收 wire 参数；这些仍属于真实 smoke 范围。

## 测试命令与结果

```text
npm run rebuild:node
```

结果：通过。

```text
npx vitest --run src/next/generation-params/generationParamResolver.test.ts src/next/generation-params/generationParamMappers.test.ts src/next/generation-params/generationParamProfiles.test.ts src/next/generation-params/generationParamPersistence.test.ts src/next/provider/gemini/geminiRequestBuilder.test.ts src/next/provider/openai-responses/openaiResponsesRequestBuilder.test.ts src/next/provider/anthropic/anthropicRequestBuilder.test.ts src/next/provider/deepseek/deepSeekRequestBuilder.test.ts src/next/provider/generic/genericRequestBuilder.test.ts src/next/provider/generic/genericAdapter.test.ts src/next/provider/generic/genericEndpointDescriptor.test.ts src/next/provider/generic/genericEndpointConfig.test.ts src/next/openrouter/buildRequest.test.ts infra/db/repo/settingsRepo.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts src/next/settings/generationParamsDefaultsClient.test.ts
```

结果：

```text
Test Files  16 passed (16)
Tests       568 passed (568)
```

```text
npx tsc --noEmit --pretty false
```

结果：通过。

```text
npx vue-tsc --noEmit
```

结果：通过。

```text
npm run gate:network-egress
```

结果：通过。

```text
git diff --check
```

结果：通过；仅有 CRLF warning。

```text
npx vitest --run src/next/generation-params/generationParamMappers.test.ts src/next/generation-params/generationParamResolver.test.ts src/next/generation-params/generationParamProfiles.test.ts
```

结果：

```text
Test Files  3 passed (3)
Tests       19 passed (19)
```

补充覆盖：

- 新增 mapper regression：model override 可以改变 provider wire target，例如同一 canonical `maxOutputTokens` 可按模型映射为 `max_completion_tokens`。

```text
$files = @((git diff --name-only --diff-filter=AM); (git ls-files --others --exclude-standard)) | Where-Object { $_ -match '\.test\.ts$' } | Sort-Object -Unique
npx vitest --run $files
```

结果：未通过。

```text
Test Files  10 failed | 34 passed (44)
Tests       39 failed | 755 passed (794)
```

失败分组：

- `src/ui-app/AppChatApp.attachments.test.ts`：附件确认面板和 DFC 附件流测试超时或找不到旧 test id。
- `src/ui-app/AppChatApp.draftBridge.test.ts`：仍查找英文 placeholder `Type a message...`，当前测试 locale 渲染为中文。
- `src/ui-app/AppChatApp.imageCapabilityQuerySeq.earlyAccess.test.ts`：mount + ticks 超时。
- `src/ui-app/AppChatApp.imageGenerationDefaults.test.ts` / `AppChatApp.webSearchSettings.ui.test.ts`：fixture 未渲染期望消息文本。
- `src/ui-app/AppChatApp.modelSelectionRegression.test.ts` / `AppChatApp.send.test.ts`：model picker fixture 中出现重复 model item，旧查询假设单项。
- `src/ui-app/AppChatApp.questionBranching.test.ts`：仍查找英文 `Cancel`。
- `src/ui-app/AppChatApp.sendButtonState.test.ts`：旧 stop/send 状态断言与当前 UI 状态不一致。
- `src/ui-app/components/ChatSessionConsole.localEndpoint.test.ts`：仍断言英文 `Text-only loopback`，当前 locale 是中文。

处理结论：

- 第一轮宽扫还暴露 `messageAsset.listByMessageIds` / `message.listReasoningDisplayBlocksByMessageIds` mock 返回 `{ ok: true }` 的协议错误；已在相关 App test mock 中补为 `[]`，第三轮 JSON 报告不再显示这些 decode failures。
- 后续已对本轮触发的 UI fixture drift 做最小修复：locale-safe 断言、model picker 重复 item 查询、OpenRouter credential preflight mock、发送计划 IPC 名称、旧 composer sampling row test id、message asset hydration mocks。
- 未重新跑完整 changed-test-file 宽扫；改为按失败分组跑 focused UI 集合验证。

```text
npx vitest --run src/ui-app/AppChatApp.webSearchSettings.ui.test.ts
```

结果：通过。

```text
npx vitest --run src/ui-app/AppChatApp.draftBridge.test.ts
```

结果：通过。

```text
npx vitest --run src/ui-app/components/ChatSessionConsole.localEndpoint.test.ts
```

结果：通过。

```text
npx vitest --run src/ui-app/AppChatApp.imageGenerationDefaults.test.ts
```

结果：通过。

```text
npx vitest --run src/ui-app/AppChatApp.questionBranching.test.ts
```

结果：通过。

```text
npx vitest --run src/ui-app/AppChatApp.modelSelectionRegression.test.ts src/ui-app/AppChatApp.send.test.ts
```

结果：通过。

```text
npx vitest --run src/ui-app/AppChatApp.sendButtonState.test.ts
```

结果：通过。

```text
npx vitest --run src/ui-app/AppChatApp.attachments.test.ts
```

结果：通过。

```text
npx vitest --run src/ui-app/AppChatApp.imageCapabilityQuerySeq.earlyAccess.test.ts
```

结果：通过。

```text
npx vitest --run src/ui-app/AppChatApp.attachments.test.ts src/ui-app/AppChatApp.imageCapabilityQuerySeq.earlyAccess.test.ts src/ui-app/AppChatApp.modelSelectionRegression.test.ts src/ui-app/AppChatApp.send.test.ts src/ui-app/AppChatApp.sendButtonState.test.ts
```

结果：通过。

## 覆盖范围

- Resolver 三层继承、`omit`、unsupported/rejected/noEffect/deprecated、conflict warning。
- Provider profile registry 和 model override。
- Provider mapper `wireKey` / `wirePath`，以及 mapper 使用 `modelId` 应用 model overrides。
- 新 `generation_params.defaults` settings bridge。
- 旧 global/project/conversation sampling key 被忽略。
- OpenRouter builder 的自定义生成参数补丁只接受 `generationParams`。
- Gemini text / OpenAI Responses / Anthropic / DeepSeek / Generic builder 消费 provider-native `generationParams` patch；OpenRouter builder 的 `generationParams.reasoning` 不再被 legacy explicit reasoning 覆盖。
- 文本 request builders 不再从 `requestedReasoningMode` / `requestedReasoningEffort` / text `geminiThinking` 写 provider wire body。Gemini Interactions 生图的 thinking summary/level 仍是独立 request input；本轮 tests 不证明图片生成完整 request-shape 已经只由 generation params 表达。
- Generic fixture capability 改为 `generationParams`。

## 失败结果与修复过程

- Focused validation 未出现 generation params 语义失败。
- Changed-test-file 宽扫发现的 hydration list mock 协议错误已修复。
- Changed-test-file 宽扫发现的主要 UI fixture drift 已按失败分组收口，并通过 focused UI 回归集合验证。

## 风险与取舍

- 本轮 focused tests 覆盖 builder/request path、settings/persistence、App send、附件发送门禁、model picker 查询和相关 UI fixture drift；未重新运行全量 changed-test-file 宽扫。
- 真实 provider 行为需要真实 API key/余额/模型可用性验证，不能由单测替代。

## Closeout validation

为收口新增 generation params editor i18n 和控制台分区命名，补跑：

```text
npx vitest --run src/shared/i18n/index.test.ts src/ui-app/components/ChatSessionConsole.runtimeSelection.test.ts src/ui-app/components/SettingsPanel.test.ts
```

结果：通过，3 个文件，68 个测试。

高级参数 UI 补充回归：

```text
npx vitest run src/ui-app/components/GenerationParamsSettingsEditor.test.ts
```

结果：通过，1 个文件，2 个测试。覆盖隐藏高级参数默认不渲染、点击高级参数开关后可见、已配置隐藏参数保持可见。

Builder/request SSOT 补充回归：

```text
npx vitest run src/next/openrouter/buildRequest.test.ts src/next/provider/openai-responses/openaiResponsesRequestBuilder.test.ts src/next/provider/anthropic/anthropicRequestBuilder.test.ts src/next/provider/deepseek/deepSeekRequestBuilder.test.ts src/next/provider/gemini/geminiRequestBuilder.test.ts src/next/provider/generic/genericEndpointDescriptor.test.ts src/next/provider/generic/genericRequestBuilder.test.ts
npx vitest run src/next/live/openRouterLiveStream.test.ts src/next/live/openRouterLiveStream.requireParameters.test.ts src/next/live/openRouterLiveStream.parity.test.ts
```

结果：通过，10 个文件，174 个测试。覆盖文本 request builder 不再从 legacy `requestedReasoning*` / text `geminiThinking` 写 provider wire body；OpenRouter live stream body 只通过 `generationParams.reasoning` 写 reasoning。

最终主检查：

```text
npx tsc --noEmit --pretty false
npx vue-tsc --noEmit
npm run gate:network-egress
git diff --check
```

结果：

```text
tsc                          passed
vue-tsc                      passed
network egress gate          passed
git diff --check             passed
```

## 未解决问题

1. `AssistantAnswerGenerationSnapshot` 尚未保存本次实际 generation request-shape。
2. 真实桌面 smoke 已完成启动、composer 加载和 credential bridge 只读检查；Playwright 脚本已修正为从 package root 启动并复用 `C:\Users\m1389\AppData\Roaming\Starverse`。修正 credential bridge wrapper 解析后，五个 provider 均可从 secure store 读到 credential。OpenRouter / Google AI Studio / OpenAI Responses / Anthropic / DeepSeek 已完成可发送代表组合的真点击 smoke，其中 OpenRouter 已覆盖包含隐藏高级参数的 all-open；已观测的 provider 参数拒绝组合本轮仅记录，暂不在 resolver/profile 阻断。Gemini `topK` 等 provider/model metadata 差异也按不可用参数记录处理，暂不做发送前阻断。
3. Gemini Interactions 生图 thinking summary/level 仍未并入 generation params SSOT；如果下一阶段要做 `AssistantAnswerGenerationSnapshot` 并覆盖图片生成，必须同时保存或统一这条 request-shape 输入。
4. 历史 docs 中 sampling 术语仍需后续文档 cleanup。

## 下一步动作

1. 如 Owner 要求提交前全量 changed-test-file 绿灯，重新跑宽扫并处理新增 drift。
2. 如 Owner 要求更宽 provider/model 覆盖，继续按 provider 补跑真实 smoke；不要用单测替代真实 provider 行为。
