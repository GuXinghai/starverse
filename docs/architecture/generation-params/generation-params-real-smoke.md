# Generation Parameters Real Smoke

## 阶段目标

记录 provider-aware / model-aware `generationParams` 真实桌面 smoke 的执行方案、实际结果和阻断项。真实 smoke 必须通过 Starverse 桌面应用完成，不能用 builder 单测替代。

## 实际操作

本轮已执行真实桌面 smoke 前置启动、凭据检查、Google AI Studio 真点击短文本请求，以及 2026-07-06 追加的 OpenRouter / OpenAI Responses / Anthropic / DeepSeek 真实 provider 参数 smoke。早期 Playwright smoke 使用的用户数据目录与手动 `npm run dev` 看到的主用户目录不一致；随后已修正脚本启动方式，改为从 package root 启动 Electron，并确认当前主用户 profile 为 `[redacted-user-data]`。后续又修正 smoke 脚本对 credential bridge 返回值的解析：bridge 返回 `{ ok, status }`，实际 credential 状态在 `status` 字段内。

已执行：

1. 运行 `npm run rebuild:electron`，切换 `better-sqlite3` 到 Electron ABI。
2. 启动 Starverse Electron 开发应用，确认主窗口加载到真实 renderer。
3. 使用 Playwright 启动并控制真实 Electron 主进程；早期脚本路径存在临时 `--user-data-dir` / profile 不一致风险，后续修正为从 package root `.` 启动以匹配 Starverse app identity。
4. 等待 `[data-testid="composer-draft"]` 出现，确认 composer 可用。
5. 通过 preload 暴露的 credential status bridge 只读检查各 provider API key 配置状态。
6. 使用 Google AI Studio / `gemini-2.5-flash-lite` 真点击设置 generation params 并发送短文本。
7. 使用同一主用户 profile 对 OpenRouter / OpenAI Responses / Anthropic / DeepSeek 补跑可发送子集、all-off 和代表性随机参数组合，并记录 requestParams 与 provider wire 参数。

结果：

- 桌面应用启动成功。
- Composer 加载成功。
- 修正后脚本确认 `app.getPath('userData')` 为 `[redacted-user-data]`。
- 修正 credential bridge 解析后，OpenRouter / OpenAI Responses / Google AI Studio / Anthropic / DeepSeek 均返回 `apiKeyConfigured: true`，来源为 `secure_store`，`storageBackend` 为 `electron_safe_storage`。
- Google AI Studio 真点击 smoke 选择 `gemini-2.5-flash-lite`，应用 `temperature=0.2`、`maxOutputTokens=64`，发送后回到 `Status · idle`。
- 追加真实 smoke 已覆盖 OpenRouter / OpenAI Responses / Anthropic / DeepSeek 的可发送代表组合；具体 requestParams 和 wire 参数见下方真实 smoke 结果记录。
- Google smoke 摘要文件：`[redacted-local-artifact]`。
- Credential-only 摘要文件：`[redacted-local-artifact]`。
- 该 smoke summary 中 `hasErrorLikeText: true` 来自当前主用户历史会话里已有的旧 OpenAI Responses 错误文本，不是本次 Google AI Studio 请求产生的新错误。

## 涉及文件

- `src/ui-app/app/appChatApp.logic.ts`
- `src/next/provider/*`
- `src/next/live/*`
- `electron/ipc/*TextChatIpc.ts`
- `src/next/generation-params/*`

## 计划流程

1. `npm run rebuild:electron`
2. 启动 Starverse 桌面开发环境。
3. 创建新会话。
4. 选择目标 provider。
5. 选择指定模型。
6. 在 Settings 或 Console 设置 generation params。
7. 发送短文本：`请只回复“ok”。`
8. 确认收到短文字回复。
9. 记录 resolved requestParams 和 provider wire payload。

可复跑命令：

```bash
npm run smoke:generation-params-real-click -- --provider google_ai_studio --model gemini-2.5-flash-lite --preset reset --param temperature=0.2 --param maxOutputTokens=64 --prompt "请用一句中文回复：参数烟测通过。" --timeout-ms 180000
```

注意：该命令会显式复用主用户 `app.getPath('userData')`，因此运行前应关闭手动启动的 Starverse Electron 窗口，避免两个实例同时读写同一个主用户数据库。脚本只读取 credential configured 状态，不 reveal API key，不写入临时 credential。

只检查主用户 credential status：

```bash
npm run smoke:generation-params-real-click -- --provider google_ai_studio --model gemini-2.5-flash-lite --credential-check-only
```

## Provider 矩阵

| Provider | Model | 参数状态 |
| --- | --- | --- |
| OpenRouter | `deepseek/deepseek-v4-flash` | 全开 / 全关 / 随机开启 |
| OpenAI Responses | `gpt-5.4-nano` | 全开 / 全关 / 随机开启 |
| Anthropic | `claude-haiku-4-5-20251001` | 全开 / 全关 / 随机开启 |
| Google AI Studio | `gemini-2.5-flash-lite` | 全开 / 全关 / 随机开启 |
| DeepSeek | `deepseek-v4-flash` | 全开 / 全关 / 随机开启 |

## 真实 smoke 结果记录

本组 smoke 使用主用户 profile：`[redacted-user-data]`。`npm run smoke:generation-params-real-click` 已内置 `--use-main-user-data`，因此 Provider Key、secure store 和 catalog cache 与手动 `npm run dev` 的主用户状态一致。

已确认的可发送组合：

| Provider | Model | 参数状态 | requestParams | wire 参数 | 结果 | summary |
| --- | --- | --- | --- | --- | --- | --- |
| OpenRouter | `deepseek/deepseek-v4-flash` | all-open | `{ temperature: 0.2, topP: 0.9, topK: 10, minP: 0.05, topA: 0.1, frequencyPenalty: 0, presencePenalty: 0, repetitionPenalty: 1, seed: 123, maxOutputTokens: 64, reasoningEffort: "high", verbosity: "low" }` | `{ temperature: 0.2, top_p: 0.9, top_k: 10, min_p: 0.05, top_a: 0.1, frequency_penalty: 0, presence_penalty: 0, repetition_penalty: 1, seed: 123, max_tokens: 64, reasoning: { effort: "high" }, verbosity: "low" }` | 通过 | `[redacted-local-artifact]` |
| OpenRouter | `deepseek/deepseek-v4-flash` | all-off | `{}` | `{}` | 通过 | `[redacted-local-artifact]` |
| OpenRouter | `deepseek/deepseek-v4-flash` | random | `{ maxOutputTokens: 64, reasoningEffort: "high" }` | `{ max_tokens: 64, reasoning: { effort: "high" } }` | 通过 | `[redacted-local-artifact]` |
| Google AI Studio | `gemini-2.5-flash-lite` | all-open | `{ temperature: 0.2, frequencyPenalty: 0, presencePenalty: 0, maxOutputTokens: 64 }` | `{ generationConfig: { temperature: 0.2, frequencyPenalty: 0, presencePenalty: 0, maxOutputTokens: 64 } }` | 通过 | `[redacted-local-artifact]` |
| Google AI Studio | `gemini-2.5-flash-lite` | random | `{ temperature: 0.2, maxOutputTokens: 64 }` | `{ generationConfig: { temperature: 0.2, maxOutputTokens: 64 } }` | 通过 | `[redacted-local-artifact]` |
| Google AI Studio | `gemini-2.5-flash-lite` | all-off | `{}` | `{}` | 通过 | `[redacted-local-artifact]` |
| OpenAI Responses | `gpt-5.4-nano` | all-off | `{}` | `{}` | 通过 | `[redacted-local-artifact]` |
| OpenAI Responses | `gpt-5.4-nano` | random | `{ temperature: 0.2, maxOutputTokens: 64 }` | `{ temperature: 0.2, max_output_tokens: 64 }` | 通过 | `[redacted-local-artifact]` |
| OpenAI Responses | `gpt-5.4-nano` | reasoning subset | `{ maxOutputTokens: 64, reasoningEffort: "low" }` | `{ max_output_tokens: 64, reasoning: { effort: "low" } }` | 通过 | `[redacted-local-artifact]` |
| OpenAI Responses | `gpt-5.4-nano` | verbosity subset | `{ maxOutputTokens: 64, verbosity: "low" }` | `{ max_output_tokens: 64, text: { verbosity: "low" } }` | 通过 | `[redacted-local-artifact]` |
| OpenAI Responses | `gpt-5.4-nano` | sendable all-open subset | `{ maxOutputTokens: 64, reasoningEffort: "low", verbosity: "low" }` | `{ max_output_tokens: 64, reasoning: { effort: "low" }, text: { verbosity: "low" } }` | 通过 | `[redacted-local-artifact]` |
| OpenAI Responses | `gpt-5.4-nano` | all-open attempt / unavailable combination | `{ temperature: 0.2, maxOutputTokens: 64, reasoningEffort: "low" }` | `{ temperature: 0.2, max_output_tokens: 64, reasoning: { effort: "low" } }` | HTTP 400 provider rejected；仅记录，不阻断 | `[redacted-local-artifact]` |
| Anthropic Messages | `claude-haiku-4-5-20251001` | all-off | `{}` | `{}` | 通过 | `[redacted-local-artifact]` |
| Anthropic Messages | `claude-haiku-4-5-20251001` | random | `{ maxOutputTokens: 64 }` | `{ max_tokens: 64 }` | 通过 | `[redacted-local-artifact]` |
| Anthropic Messages | `claude-haiku-4-5-20251001` | all-open attempt / unavailable combination | `{ maxOutputTokens: 64, reasoningEffort: "low" }` | `{ max_tokens: 64, output_config: { effort: "low" } }` | `invalid_request_error` provider rejected；仅记录，不阻断 | `[redacted-local-artifact]` |
| DeepSeek | `deepseek-v4-flash` | all-off | `{}` | `{}` | 通过 | `[redacted-local-artifact]` |
| DeepSeek | `deepseek-v4-flash` | random | `{ maxOutputTokens: 64 }` | `{ max_tokens: 64 }` | 通过 | `[redacted-local-artifact]` |
| DeepSeek | `deepseek-v4-flash` | reasoning subset | `{ maxOutputTokens: 64, reasoningEffort: "high" }` | `{ max_tokens: 64, reasoning_effort: "high" }` | 通过 | `[redacted-local-artifact]` |
| DeepSeek | `deepseek-v4-flash` | all-open attempt / unavailable combination | `{ maxOutputTokens: 64, reasoningEffort: "high", thinkingEnabled: true }` | `{ max_tokens: 64, reasoning_effort: "high", thinking: { type: true } }` | HTTP 400 provider rejected；仅记录，不阻断 | `[redacted-local-artifact]` |

已观测但暂不阻断的不可用参数或组合：

| Provider | Model | 参数/组合 | wire 参数 | Provider 结果 | 当前处理 | summary |
| --- | --- | --- | --- | --- | --- | --- |
| OpenAI Responses | `gpt-5.4-nano` | `temperature=0.2` + `reasoningEffort=low` | `{ temperature: 0.2, max_output_tokens: 64, reasoning: { effort: "low" } }` | HTTP 400 provider rejected | 仅记录；暂不在 resolver/profile 阻断 | `[redacted-local-artifact]` |
| Anthropic Messages | `claude-haiku-4-5-20251001` | `reasoningEffort=low` | `{ max_tokens: 64, output_config: { effort: "low" } }` | `invalid_request_error` provider rejected | 仅记录；暂不在 resolver/profile 阻断 | `[redacted-local-artifact]` |
| DeepSeek | `deepseek-v4-flash` | `thinkingEnabled=true` | `{ max_tokens: 64, reasoning_effort: "high", thinking: { type: true } }` | HTTP 400 provider rejected | 仅记录；暂不在 resolver/profile 阻断 | `[redacted-local-artifact]` |

待接入但暂不阻断的不可用参数证据来源：

| Provider | 证据来源 | 参数/组合 | 当前处理 |
| --- | --- | --- | --- |
| Google AI Studio | Gemini Models API / catalog metadata | per-model `topK` 为空或缺失时，可能表示该模型不允许设置 `topK` | 仅作为后续不可用参数记录来源；本轮不在 resolver/profile 阻断，也不静默修改用户输入 |

OpenAI Responses 早期 all-off smoke 曾出现 `invalid_wire_event`，根因是 renderer live bridge 未忽略主进程结束哨兵 `{ type: "end" }`。已补齐 OpenAI renderer bridge 与 Anthropic / Google / DeepSeek 一致的 `isWireEnd()` 处理，并通过 `src/next/live/openAIResponsesTextChat.test.ts` 回归验证。后续 OpenAI all-off / random smoke 均已通过。

补充检查：

- OpenRouter 主用户 profile credential bridge 也返回 `apiKeyConfigured: true`，来源为 `secure_store`。
- 本轮未打印、读取或保存任何 API key 值。

## 关键发现

- 真实 Electron 桌面应用可启动，composer 可加载。
- 真实 smoke 的关键前提是 Playwright 必须从 package root 启动 Electron，确保 `app.getPath('userData')` 指向 `[redacted-user-data]`。
- 主用户 profile credential 可通过 ProviderCredentialService 读取；此前的 `apiKeyConfigured: false` 是 smoke 脚本错误解析 `{ ok, status }` wrapper 导致。
- Google AI Studio 真点击 smoke 已验证：UI 可设置 generation params，发送链路可完成请求并回到 idle。
- OpenRouter / OpenAI Responses / Anthropic / DeepSeek 已完成可发送代表组合的真实 provider smoke；已观测的 provider 拒绝参数组合仅记录，暂不在 resolver/profile 阻断。

## 风险与取舍

- 不用自动化单测冒充真实 smoke 通过。
- 如果某 provider 因 API key、余额、区域、模型不可用或文档变化失败，应记录为 smoke 阻断项，而不是修改代码静默 fallback。

## 未解决问题

1. OpenAI Responses `temperature + reasoningEffort`、Anthropic `reasoningEffort`、DeepSeek `thinkingEnabled` 已观测 provider 拒绝；本轮仅记录，不在 resolver/profile 阻断。
2. Gemini per-model `topK` metadata 尚未接入不可用参数记录；本轮不把该项升级为发送前阻断。
3. 未逐项确认所有 provider 的账户余额、地区和目标模型可用性。

## 下一步动作

1. 如需要扩大覆盖，再按 provider/model 增加真实 smoke 组合。
2. 提交前按最终交付目标决定是否切回 Node ABI 并重跑必要 Node/Vitest 验证。
3. 不把已观测的 provider 参数拒绝静默改为 resolver/profile 阻断；后续如要阻断，需要单独 Owner 决策。
