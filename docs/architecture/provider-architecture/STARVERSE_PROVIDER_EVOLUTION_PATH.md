# STARVERSE_PROVIDER_EVOLUTION_PATH.md

版本：v1.1.0
状态：Owner-confirmed architecture SSOT
最后更新：2026-06-18
上游证据来源：provider-architecture-gpt55-transfer.zip
取代：previous unversioned provider architecture drafts

修订记录：
- v1.1.0 (2026-06-18): Added Experimental live paths status section reflecting C6 LocalEndpoint, C7a OpenAI Responses, C7b Google AI Studio, and C7c Anthropic Messages experimental text chat status with credential isolation and phase alignment detail. No contract term changes.
关联文档：
- STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md
- STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md
- STARVERSE_PROVIDER_EVOLUTION_PATH.md


## Version notes

本版本把目标架构转化为治理路径、阶段门和 Agent 工作边界。主要变化：legacy removal schedule 已绑定阶段；开放生态派生要求已进入 Phase 1 / 3 / 6 验收；placeholder abstraction prohibition 已成为阶段性硬规则；被 Owner 排除的网关对象已从 roadmap 与暂不实施范围移除；Starverse chat-app boundary 已强化，不引入 Agent/RAG/coding workflow 平台。

## Fixture foundation status (added 2026-06-12)

Phase 0–9 provider fixture foundations are complete:

| Provider | Mapper proof | Adapter fixture integration | Status |
|---|---|---|---|
| OpenRouter | Phase 1 (provider core slice) | Backed by existing active runtime | ✅ complete |
| DeepSeek | Phase 2 | Phase 3 | ✅ complete |
| OpenAI Responses | Phase 4 | Phase 5 | ✅ complete |
| Anthropic | Phase 6 | Phase 7 | ✅ complete |
| Gemini API / Google AI Studio | Phase 8b | Phase 9 | ✅ complete |
| Generic OpenAI-compatible | Phase 3b | Phase 3b (endpoint descriptor/profile-lite/capability-lite fixture boundary) | ✅ complete |

Shared contract: `RuntimeProviderStreamAdapter` extracted for DeepSeek, OpenAI Responses, Anthropic, Gemini, Generic. OpenRouter does not yet conform (uses DomainEvent bridge path).

Adapter-side credential boundary seed exists (bearer credential construction, auth header building, credential masking, credential-aware error redaction). This is pure adapter/test boundary only — not secure store, not renderer/settings/IPC, not live enablement.

Generic adapter conservative policy: text chat + basic streaming + basic error only. Endpoint descriptor/profile-lite/capability-lite fixture boundary. Rejects unsupported requested high-risk features (tools, web search, image generation, plugins, reasoning) before fetch. Rejects unsupported outbound content (non-generic context messages, non-text content blocks, malformed text blocks) before fetch. Sanitizes credential-bearing messages and provider-controlled error codes. No tools/files/vision/reasoning/web search/structured output by default. This remains fixture-only and does not exit Phase 3 live/custom endpoint requirements.

This status reflects fixture-integrated adapter foundations only. No provider has live API support, UI exposure, settings integration, secure credential store, registry support, or production send path in this closeout.

## Experimental live paths status (added 2026-06-18)

Four experimental, default-off, text-only live chat paths are implemented using the fixture-adapter foundations. These are NOT production provider surfaces and are gated behind explicit localStorage flags.

| Provider | Adapter foundation | Experimental live path | Credential boundary | Send gating | Status |
|---|---|---|---|---|---|
| OpenRouter | Phase 1 (active runtime) | Production (unchanged) | Legacy store backing with renderer raw read-back blocked | Always active via `onSend()` fallthrough | ✅ default production runtime |
| LocalEndpoint | C6 diagnostics → experimental chat | `localEndpointTextChat` IPC + renderer bridge | No credentials — loopback-only, `redirect:'error'` | `starverse.localEndpointTextChat.enabled === '1'` | ✅ experimental default-off |
| OpenAI Responses | Phase 4/5 (native adapter fixture) | `openAIResponsesTextChat` IPC + renderer bridge | Main-process credential bridge — one-way update IPC, masked status only | `starverse.openAIResponsesTextChat.enabled === '1'` | ✅ experimental default-off |
| Google AI Studio | Phase 8b/9 (native Gemini API fixture) | `googleAIStudioTextChat` IPC + renderer bridge | Main-process credential bridge — one-way update IPC, masked status only; uses `googleAIStudioApiKey` NOT `geminiApiKey` | `starverse.googleAIStudioTextChat.enabled === '1'` | ✅ experimental default-off |
| DeepSeek | Phase 2/3 (adapter fixture) | (none) | (none) | (none) | ❌ not started |
| Anthropic | Phase 6/7 (native Messages adapter fixture) | `anthropicTextChat` IPC + renderer bridge | Main-process credential bridge — one-way update IPC, masked status only | `starverse.anthropicMessagesTextChat.enabled === '1'` | ✅ experimental default-off |
| Generic OpenAI-compatible | Phase 3b (adapter fixture) | (none) | (none) | (none) | ❌ not started — fixture-only |

### Phase alignment

Current implementation spans partial Phase 5 (OpenAI Responses native, Anthropic Messages native, Gemini API / AI Studio native) and partial Phase 6 (LocalEndpoint), but all paths remain experimental and do not complete their respective phases:

| Phase | Provider | Phase requirements met | Phase requirements deferred |
|---|---|---|---|
| Phase 5 (Native providers) | OpenAI Responses, Anthropic Messages, Google AI Studio | Native adapter used (not OpenAI-compatible); native reasoning/tool/usage architecture present in adapter fixture; credential boundary enforced; text-only send gated | `RuntimeProviderRegistry` dispatch; model picker integration; capability resolver; reasoning roundtrip; tool execution; usage accounting; non-text streaming; Anthropic thinking/signature persistence |
| Phase 6 (Local endpoint) | LocalEndpoint | External local service only; conservative capability; probe/health; redirect blocking; no process management | Endpoint registry; `ModelAvailability`/`RuntimeCapability` integration; non-localhost endpoints; full probe matrix |

### Credential boundary detail

All credential-bearing experimental providers enforce the one-way update pattern:

```
Renderer (SettingsPanel)
  → preload bridge update({apiKey})
    → Main IPC credential:update
      → store.set(key, apiKey) [main process only]
      → Return masked status {apiKeyConfigured:true, maskedApiKey:'***'}
      → Renderer reads masked status only — never raw key

Renderer (send)
  → preload bridge startTextChat(payload) [no credentials in payload]
    → Main IPC chat:stream-text
      → store.get(key) [main process only]
      → fetch(provider API, {provider-native auth header, redirect:'error'})
      → Stream events (error-redacted) → renderer
```

After settings save, raw API keys, provider-native auth headers, Authorization headers, Bearer tokens, custom headers, and enterprise tokens must not enter renderer memory through any read-back, diagnostic, log, or stream-event path. Renderer may only transiently hold user-entered API keys before submitting them through provider-specific one-way update IPC.

### Gemini legacy isolation

The Google AI Studio experimental path explicitly isolates from old Gemini remnants:
- New credential store key: `googleAIStudioApiKey` (NOT `geminiApiKey`)
- Native adapter: `streamViaGemini` from Phase 9 fixture (NOT `@google/generative-ai` SDK)
- Native API endpoint: `https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent` (NOT old Gemini REST)
- Old `geminiApiKey` remains blocked in `storeIpc.ts` (`RENDERER_BLOCKED_CREDENTIAL_STORE_KEYS`) and classified as `deprecated-for-removal / migration-read-only`
- `PROVIDERS.GEMINI` constant, `@google/generative-ai` dependency, and old `activeProvider: 'Gemini'` are untouched and remain `runtime-dead remnants`

### Anthropic Messages native isolation

The Anthropic experimental path is native Anthropic Messages, not Generic OpenAI-compatible:
- Credential store key: `anthropicApiKey`
- Native adapter: `streamViaAnthropic` from Phase 7 fixture
- Native API endpoint: `https://api.anthropic.com/v1/messages`
- Main process sends `x-api-key`; renderer sees only masked status and never receives raw key material
- Thinking/signature/tool-use semantics remain native Anthropic adapter responsibilities, but this live slice does not surface or persist them

---

## 1. 演进原则

| 原则 | 含义 |
|---|---|
| contract first | 先冻结术语、边界、不变量、禁止事项，再允许 provider 改造。 |
| evidence-based | 当前事实必须来自 evidence package 或后续明确补证；不得基于 README 宣传或历史文档推断 runtime。 |
| OpenRouter behavior preservation | 当前 OpenRouter-first runtime 是唯一活跃路径，任何阶段不得退化其 request/stream/reasoning/tool/usage/web/search/Send Plan 行为。 |
| no provider big-bang rewrite | 禁止一次性重写 runtime、catalog、settings、Send Plan、DB。 |
| no renderer secret expansion | 新 provider、custom endpoint、local endpoint、enterprise gateway 不得新增 renderer secret access。 |
| adapter boundary before new provider | 没有 runtime provider contract 和 stream event vocabulary 前，不接新 provider。 |
| capability before Send Plan expansion | Send Plan 的多 provider 扩展必须先有 `RuntimeCapability`，不得继续硬编码 provider context。 |
| local endpoint before managed local runtime | 先支持外部 local endpoint；managed local runtime 只预留边界，后期再做。 |
| legacy removal is mandatory | 旧路径、旧配置、旧默认值、旧文档口径不是架构资产；替代边界出现后必须分类和移除。 |
| provider raw containment | provider-native schema 只在 adapter/raw diagnostic 区，不能污染 UI/DB/Send Plan。 |
| chat-app boundary | Starverse 是 AI chat app，不是 Agent/RAG/coding workflow platform。 |
| reversible phases | 每个阶段必须可回滚到上一稳定 OpenRouter 行为。 |

---

## Legacy removal schedule

| Legacy category | Current examples | Latest handling phase | Required handling | Exit standard |
|---|---|---|---|---|
| Misleading docs / README / UI claims | claims implying Gemini is an active runtime provider。 | Phase 0。 | stop misleading wording; mark as historical / legacy / future rebuild only。 | docs/UI no longer imply Gemini active runtime support。 |
| Legacy default provider config | `activeProvider: 'Gemini'`。 | Phase 0 or Phase 1。 | migration-only; not runtime selection input。 | new configs do not create Gemini active defaults。 |
| Legacy Gemini config reads | `geminiApiKey`。 | Phase 1 isolation; final removal after migration or if Owner drops Gemini。 | read-only migration; no runtime role。 | old fields do not affect active runtime。 |
| Gemini constants / dependencies / remnants | `PROVIDERS.GEMINI`, `@google/generative-ai`。 | inventory in Phase 1/2; removal when no migration need remains or when future Gemini native adapter replaces them。 | deprecated-for-removal。 | no misleading imports/constants/docs remain。 |
| OpenRouter renderer credential access | renderer reads `openRouterApiKey` / `openRouterBaseUrl`。 | Phase 1 prohibits copying; Phase 2/3 defines migration path。 | legacy exception -> main/secure credential boundary。 | new providers never expose secrets to renderer; OpenRouter migration path documented。 |
| OpenRouter raw schema as external contract | OpenRouter request/stream/error schema treated as app-wide schema。 | Phase 2。 | facade boundary; external users see Starverse IR。 | outside OpenRouter adapter/facade, no OpenRouter raw schema is treated as generic provider contract。 |

Legacy removal is not optional cleanup. Every phase that introduces a replacement boundary must include a legacy-removal checklist. A phase cannot be marked complete if replaced legacy surfaces are left unclassified as migrated, isolated, deprecated-for-removal, or removed.

Gemini legacy removal gate:

- Phase 0: docs/UI must not claim Gemini is an active runtime provider.
- Phase 1: legacy Gemini config can only be migration-read-only and must not enter runtime selection.
- Phase 2: Gemini constants/dependencies/remnants must be inventoried as deprecated-for-removal.
- Phase 5: if Gemini native adapter is implemented, it must be rebuilt through Gemini API / Google AI Studio native architecture; old Gemini path must not be reused.
- If Owner decides not to implement Gemini native, old Gemini remnants should be removed after migration safety is confirmed.

---

## Placeholder abstraction prohibition

Do not create placeholder abstractions.

Any new interface, registry, manager, service, or facade added to source code must satisfy at least one of:

1. It is directly exercised by an existing behavior path.
2. It is covered by tests or regression checks.
3. It is required by the current phase and has a clear bridge to existing OpenRouter behavior.

Otherwise it must remain in the architecture documents and must not enter source code.

Bad:

- Empty RuntimeProviderAdapter with no caller.
- ProviderRegistry that no active send path uses.
- RuntimeManager / EngineManager before managed local runtime phase.
- StarverseStreamEvent type that no adapter emits and no mapper consumes.

Good:

- A facade that wraps current OpenRouter path while preserving behavior.
- A stream event bridge that maps existing OpenRouter events into StarverseStreamEvent and then into current DomainEvent, with regression tests.
- A capability object consumed by Send Plan in a scoped phase.

---

## 2. 阶段划分

本节给出高层阶段。它不是文件级修改清单，也不是 Agent 任务包。

### Phase 0：契约冻结

目标：冻结术语、Owner decisions、不变量、禁止事项、暂不实施范围；停止误导性 UI / README / docs 口径；明确 Gemini 为 runtime-dead remnants；明确 legacy paths are migration-only and deprecated-for-removal。

验收：

- 三份 SSOT 文档具备版本元数据并处于 Owner-confirmed architecture SSOT。
- Owner decisions 明确，且未标为已确认状态。
- 禁止事项明确，包含 placeholder abstraction prohibition。
- Legacy docs/UI no longer imply Gemini active runtime support。
- 暂不实施范围明确，且不包含被 Owner 排除的具体网关对象。

暂不做：不改生产代码；不接新 provider；不迁移 OpenRouter secret；不调整 DB schema；不创建 source-level placeholder abstractions。

### Phase 1：Provider-neutral contract shell

目标：定义 runtime provider contract、stream event vocabulary、provider error / usage / capability contract、credential boundary policy；隔离 legacy config migration；不改变 OpenRouter 行为。

验收：

- `RuntimeProviderAdapter`、`StarverseChatRequest`、`StarverseStreamEvent`、`StarverseProviderError`、`StarverseUsageRecord`、`RuntimeCapability` 的架构 contract 清晰。
- 现有 OpenRouter behavior 不变。
- reasoning tests 不退化。
- no provider runtime switch yet。
- 当前 `DomainEvent` / state / DB 的消费边界与 provider-neutral event 的转换关系清晰。
- Legacy Gemini config can only be migration-read-only and must not enter runtime selection。
- Ecosystem-derived requirement: Provider-neutral contract shell must be Starverse-owned. External SDKs or ecosystems may inform implementation, but the public/internal contract remains StarverseChatRequest, StarverseStreamEvent, StarverseProviderError, StarverseUsageRecord, and RuntimeCapability.

暂不做：不接新 provider；不改 OpenRouter request body；不重写 Send Plan；不迁移 catalog source；不创建无人调用的 registry/interface。

### Phase 2：OpenRouter facade / adapter 包裹

目标：把现有 OpenRouter runtime 包入新边界；不迁移 provider 行为；不引入新 provider；证明 provider-neutral shell 能承载当前 OpenRouter path；inventory Gemini constants/dependencies/remnants as deprecated-for-removal。

验收：

- OpenRouter request/stream/reasoning/tool/usage/web search/image generation/Send Plan 行为不退化。
- 现有 OpenRouter request builder、SSE decoder、mapChunkToEvents、live stream、reasoning、Send Plan、settings、catalog regression checks 通过。
- `appChatApp.logic.ts` 不变成 provider switchboard。
- OpenRouter adapter/facade 外部接口 provider-neutral，内部仍可使用现有 OpenRouter modules。
- Outside OpenRouter adapter/facade, OpenRouter raw request/stream/error schema is not treated as generic provider contract。
- Gemini constants/dependencies/remnants inventoried as deprecated-for-removal。

暂不做：不改变 OpenRouter request body；不改变 OpenRouter IPC behavior，除非只是外层 facade；不接 DeepSeek/OpenAI/Anthropic/Gemini/local endpoint；不做 managed local runtime。

### Phase 3：Generic OpenAI-compatible compatibility layer

目标：支持 custom OpenAI-compatible Chat Completions endpoint；最低能力承诺；capability conservative by default；endpoint/profile/credential registry 能表达 custom endpoint，不污染 OpenRouter native settings。

验收：

- 不影响 OpenRouter。
- Generic endpoint 默认只承诺 text chat/basic streaming。
- local endpoint 不默认获得 tools/files/reasoning/web search/structured output/usage final。
- errors / stream / usage 可归一化为 provider-neutral vocabulary。
- secret 不进入 renderer。
- endpoint config 与 OpenRouter native settings 分离。
- Ecosystem-derived requirement: Generic OpenAI-compatible endpoint support must include the chat-client custom endpoint pattern: baseURL, model id, credential ref, profile id, conservative capability declaration, and safe error display. This is inspired by open chat platforms, but must remain Starverse-owned and must not copy server/.env deployment assumptions.

暂不做：不把 Generic OpenAI-compatible 宣传为完整 OpenAI；不默认启用 file/PDF/tool/reasoning；不做 DeepSeek quirks，除非进入 Phase 4。

### Phase 4：DeepSeek official profile

目标：在 OpenAI-compatible transport 上处理 DeepSeek official quirks；支持 `reasoning_content` -> reasoning channel；支持 thinking / reasoning_effort policy；处理无效或被忽略参数 warning；roundtrip policy 由 DeepSeek profile/adapter 决定。

验收：

- reasoning 不污染 visible text。
- provider-specific reasoning raw 可保存。
- continuation policy 由 adapter/profile 决定，不由 UI/context builder 拼接。
- tool-call 场景的 reasoning continuation policy 有明确测试或证据。
- OpenRouter 与 Generic OpenAI-compatible 不受影响。

暂不做：不把 DeepSeek 当普通 generic endpoint；不把 `reasoning_content` 拼入 visible assistant text；不把 DeepSeek quirks 写入 Generic adapter 默认行为。

### Phase 5：Native providers

目标：OpenAI Responses native；Anthropic Messages native；Gemini API / AI Studio native；native reasoning / tool / usage 能进入 Starverse IR；不把 native provider 压成 OpenAI-compatible。

验收：

- OpenAI Responses reasoning items/encrypted content/previous_response_id 或 equivalent continuation 由 adapter 管理。
- Anthropic thinking/signature/redacted thinking/tool use continuation 由 adapter 管理。
- Gemini thought signatures/thinking-like artifacts 由 adapter 管理。
- native usage/error/metadata 进入 provider-neutral records。
- UI/DB/Send Plan 不依赖 native provider schema。
- OpenRouter behavior 不退化。
- If Gemini native adapter is implemented, it is rebuilt through Gemini API / Google AI Studio native architecture; old Gemini path is not reused。

暂不做：不实现 generic Anthropic-compatible；不把 Gemini legacy remnants 直接复活为 runtime；不实现 provider 完整 tool ecosystems 的所有高级能力，除非 Owner 单独冻结 scope。

### Phase 6：Local endpoint

目标：支持 LM Studio、Ollama、LocalAI、llama.cpp server、custom local OpenAI-compatible endpoint、enterprise OpenAI-compatible gateway；endpoint health / profile / probe / conservative capability。

验收：

- endpoint registry 能区分 remote custom、gateway、local endpoint。
- local endpoint health/listModels/probe 能进入 ModelAvailability / RuntimeCapability。
- local endpoint 与 managed runtime 分离。
- capability conservative by default。
- renderer 不拿 secret/header/admin token。
- local endpoint 没有 reasoning structured field 时，普通文本不被自动拆 reasoning。
- Ecosystem-derived requirement: Local endpoint support must follow the external-local-service pattern: Starverse connects to an already running service, probes health/model list/basic stream, applies conservative capability, and does not manage model process lifecycle in this phase.

暂不做：不把 local endpoint 当完整 OpenAI；不启动/管理本地模型进程；不自动下载模型；不做全量 capability probe matrix。

### Phase 7：Managed local runtime boundary

目标：只建立边界或最小 runtime manager；不提前实现全量模型管理；明确 `ManagedLocalRuntime`、`RuntimeEngine`、`ModelArtifact`、`ResourcePolicy`、`PrivacyPolicy`。

验收：

- runtime engine / model artifact / resource policy / privacy boundary 概念清晰。
- managed local runtime 可向上暴露 local endpoint 或 direct engine bridge。
- 不影响 remote provider。
- 不影响 local endpoint 模式。
- 日志脱敏、模型路径、port lease、admin secret、安全策略边界明确。
- Placeholder abstraction rule satisfied: no RuntimeManager / EngineManager enters source unless it is exercised by real behavior, covered by checks, or explicitly required by this phase.

暂不做：不实现 full model marketplace；不实现 automatic model download；不支持所有 engine；不把 RuntimeManager 塞进 RuntimeProviderAdapter。

---

## 3. 每阶段禁止事项

| 阶段 | 禁止事项 |
|---|---|
| Phase 0 | 禁止在 Owner 未确认契约前开始 provider runtime 改造；禁止继续暗示 Gemini active runtime support。 |
| Phase 1 | 禁止接新 provider；禁止改 OpenRouter request body；禁止重写 DB；禁止 source-level placeholder abstractions。 |
| Phase 2 | 禁止改变 OpenRouter request/stream semantics；禁止把 facade 改造成 provider switchboard；禁止迁移 provider 行为；禁止让 OpenRouter raw schema 继续作为 generic contract。 |
| Phase 3 | 禁止默认启用 tools/files/reasoning/web search/structured output；禁止 custom endpoint 污染 OpenRouter settings；禁止复制 server/.env deployment assumptions。 |
| Phase 4 | 禁止把 `reasoning_content` 拼入 visible text；禁止把 DeepSeek quirks 写成 generic default。 |
| Phase 5 | 禁止用 OpenAI-compatible 伪装 OpenAI Responses、Anthropic Messages、Gemini native；禁止复用旧 Gemini remnants 作为 runtime。 |
| Phase 6 | 禁止把 local endpoint 当完整 OpenAI；禁止启动/管理本地模型进程；禁止暴露 local admin secret 到 renderer。 |
| Phase 7 | 禁止把 managed runtime 塞进 custom endpoint；禁止 automatic model download；禁止超出边界实现完整模型管理。 |

---

## 4. 验收矩阵

| 阶段 | 行为不变量 | 测试 / 回归要求 | 文档要求 | 回滚标准 | 风险检查 |
|---|---|---|---|---|---|
| Phase 0 | 不改行为。 | 不运行实现测试；只审文档。 | 三份 SSOT versioned。 | 回退到旧文档不影响代码。 | 是否仍有误导性 Gemini active claim。 |
| Phase 1 | OpenRouter 行为不变。 | reasoning/state/stream contract 相关 regression checks 保持。 | contract shell 与 placeholder rule 清晰。 | 移除 shell 不改变 OpenRouter。 | 是否创建无人使用 abstraction。 |
| Phase 2 | OpenRouter request/stream/reasoning/tool/usage/web/search/Send Plan 不退化。 | OpenRouter request builder、SSE decoder、mapChunkToEvents、reasoning、Send Plan、catalog、settings 相关 regression checks。 | facade boundary 与 legacy classification 更新。 | 可回到旧 OpenRouter path。 | facade 是否变 provider switchboard。 |
| Phase 3 | OpenRouter 不受影响。 | custom endpoint basic text/basic stream/error regression checks。 | Generic capability limits documented。 | 可禁用 custom endpoint layer。 | 是否过度承诺 tools/files/reasoning。 |
| Phase 4 | OpenRouter/Generic 不受影响。 | DeepSeek reasoning_content / visible text separation / raw artifact checks。 | DeepSeek profile quirks documented。 | 可禁用 DeepSeek profile。 | reasoning continuation 是否由 adapter 决定。 |
| Phase 5 | Native providers 不污染 UI/DB/Send Plan。 | Provider-native reasoning/tool/usage to IR checks。 | Native provider scope frozen。 | 可禁用单个 native adapter。 | 是否复活旧 Gemini。 |
| Phase 6 | LocalEndpoint 不影响 remote providers。 | health/listModels/basic stream/probe checks。 | local endpoint limitations documented。 | 可禁用 local endpoint profiles。 | 是否管理模型进程。 |
| Phase 7 | Remote/local endpoint 不受影响。 | manager boundary checks only。 | managed runtime boundary documented。 | 可禁用 managed boundary。 | 是否提前实现 full runtime。 |

---

## 5. Agent 工作边界

后续 Agent 必须遵守：

1. 每阶段先读 `STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md`、`STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md`、`STARVERSE_PROVIDER_EVOLUTION_PATH.md`。
2. 每阶段先输出计划和拟修改范围，但不得输出越过阶段目标的任务包。
3. 不越过阶段目标，不顺手重构，不改无关模块。
4. 不处理 dirty baseline；开始前必须报告 git status。
5. 每阶段必须报告测试或 regression check 结果；若 Owner 明确禁止运行测试，则报告未运行原因。
6. 每阶段必须列出不确定项和需要补充证据的问题。
7. 不创建 placeholder abstractions。任何新 interface、registry、manager、service、facade 必须被真实行为路径、测试或当前阶段 OpenRouter bridge 直接使用。
8. 不修改 package.json、lockfiles 或安装依赖，除非 Owner 单独授权。
9. 不新增 provider secret 到 renderer。
10. 不将 Starverse 转为 Agent/RAG/coding workflow platform。

---

## 6. 暂不实施范围

| 暂不实施 | 边界 |
|---|---|
| full managed local runtime | 只冻结边界，不实现完整模型管理。 |
| automatic model download | 不做自动下载、模型市场、许可证处理。 |
| native OpenAI Responses full tool system | 可设计 native adapter，但不默认实现完整 hosted tool ecosystem。 |
| Anthropic computer use | 不作为 provider architecture 主线。 |
| Gemini advanced tool ecosystem | 不作为 Phase 5 默认范围。 |
| universal provider marketplace | 不做 provider marketplace。 |
| generic Anthropic-compatible | 暂不做。 |
| advanced capability probing across all providers | 只做阶段所需保守 probe。 |
| OpenCode runtime | 不引入。 |
| Continue-style coding assistant workflow | 不做。 |
| LangChain/LlamaIndex Agent/RAG platform | 不做。 |
| MCP / shell / LSP / workspace automation | 不做。 |
| RAG/workspace as provider architecture mainline | 不做。 |
| source-level placeholder abstractions | 不做。 |

---

## 7. Owner checkpoint

| 阶段 | Owner 必须确认 |
|---|---|
| Phase 0 | 三份文档状态、legacy removal policy、excluded scopes、Gemini runtime-dead remnants、Starverse chat-app boundary。 |
| Phase 1 | IR names、credential boundary、usage SOT、placeholder abstraction rule、legacy config isolation。 |
| Phase 2 | OpenRouter facade boundary、OpenRouter raw containment、Gemini remnants inventory classification。 |
| Phase 3 | Generic OpenAI-compatible minimum capability、custom endpoint UX、安全边界、capability warning strategy。 |
| Phase 4 | DeepSeek reasoning policy、roundtrip policy、parameter warning policy。 |
| Phase 5 | Native provider order、Gemini native rebuild decision、scope of tool/reasoning features。 |
| Phase 6 | LocalEndpoint profiles、probe depth、local admin secret policy、enterprise gateway handling。 |
| Phase 7 | Whether to implement managed local runtime beyond boundary; runtime engines; model artifact privacy policy。 |

---

## 8. 阶段退出标准

一个阶段只有在以下条件同时满足时才能退出：

1. 阶段目标完成且未越界。
2. OpenRouter 当前行为未退化，或明确无代码变更。
3. legacy surfaces 已分类为 migrated、isolated、deprecated-for-removal 或 removed。
4. 没有新增 renderer secret access。
5. 没有 provider raw schema 泄漏到 UI/DB/Send Plan。
6. 没有 source-level placeholder abstraction。
7. 文档、Owner checkpoint、风险项、不确定项已更新。
8. Git status 和变更摘要已报告。
9. 测试或 regression check 已按阶段要求报告；若未运行，必须有 Owner 指令或阶段说明。
10. 暂不实施范围未被偷偷推进。
