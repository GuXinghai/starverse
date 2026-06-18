# STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md

版本：v1.1.0
状态：Owner-confirmed architecture SSOT
最后更新：2026-06-18
上游证据来源：provider-architecture-gpt55-transfer.zip
取代：previous unversioned provider architecture drafts

修订记录：
- v1.1.0 (2026-06-18): Added implementation status checkpoint and credential boundary clarification. No contract term changes.
关联文档：
- STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md
- STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md
- STARVERSE_PROVIDER_EVOLUTION_PATH.md


## Version notes

本版本将三轮架构评审收束为 provider architecture governance contract。主要变化：legacy path removal schedule 已进入治理要求；开放生态经验已映射为 Starverse 专属架构要求；placeholder abstraction prohibition 已加入禁止事项；被 Owner 排除的网关对象已从当前目标范围移除；Starverse chat-app boundary 已强化，明确 Starverse 不转型为 Agent、RAG 或 coding workflow platform。

---

## Implementation Status Checkpoint (added 2026-06-18)

This checkpoint records current implementation status after C6/C7 experimental slices. It does not change the target architecture and does not mark experimental paths as production runtime.

- OpenRouter remains the default production runtime.
- LocalEndpoint has explicit experimental text-only local chat. It is default-off, loopback-only, reversible, and separate from managed local runtime, model download, process lifecycle, GPU/CPU/offload controls, remote custom endpoint, and enterprise gateway support.
- OpenAI Responses has explicit experimental text-only native chat. It is default-off, reversible, and uses the native Responses path, not Generic OpenAI-compatible routing.
- Google AI Studio has explicit experimental text-only native chat. It is default-off, reversible, and uses the native Gemini / Google AI Studio path, not old Gemini runtime remnants.
- Anthropic Messages has explicit experimental text-only native chat. It is default-off, reversible, and uses the native Anthropic Messages path, not Generic OpenAI-compatible routing. Thinking/signature/tool-use persistence remains out of scope for the text-only live slice.
- LocalEndpoint, OpenAI Responses, Google AI Studio, and Anthropic Messages experimental modes are mutually exclusive in the current UI flow.
- Generic OpenAI-compatible remains fixture-only and is not a live runtime.
- No production `EndpointRegistry`, `ProviderRegistry`, or `RuntimeProviderRegistry` source abstraction has been introduced.

---

## 1. 适用范围

本契约是 Starverse 多供应商 AI 架构的 SSOT。后续 Owner 决策、Agent 改造、代码评审、架构评审和文档维护必须服从本契约；如需偏离，必须先更新本契约或形成新的 Owner 决策记录。

本契约覆盖：runtime provider、catalog source、endpoint、model capability、runtime capability、reasoning / tool / usage / stream event、remote native provider、first-class gateway provider、custom endpoint、local endpoint、future managed local runtime。

本契约不覆盖：具体 provider 完整实现、具体 UI 改版、本地模型运行时完整实现、代码任务、文件级修改清单、Agent task package、商业默认供应商策略、RAG/Agent/coding workflow 平台设计。

Starverse 的主目标是 AI 对话聊天客户端，核心体验包括聊天、多模型切换、多模态附件、reasoning panel、文件 Send Plan、用量与成本、本地/远程模型接入，以及用户可控的 provider / endpoint 配置。

---

## 2. 当前事实基线

本节是当前代码事实，不是目标设计。事实基线来自 `provider-architecture-gpt55-transfer.zip`，尤其是 `README_FOR_GPT55_PRO.md`、`provider-architecture-current-state-integrated.md`、`provider-architecture-source-comparison.md`、`source-file-inventory.csv`、`current-state-original/snippets/` 和 source bundle。若 README、历史文档或旧 UI 文案与证据包源码事实冲突，采用源码证据和 source comparison 的冲突解析。

| 当前事实 | 证据来源 |
|---|---|
| 当前 active runtime 是 OpenRouter-first。主要链路是 `src/ui-app/app/appChatApp.logic.ts` -> `streamOpenRouterChatAsEvents` -> `buildOpenRouterChatCompletionsRequest` -> renderer fetch 或 `openrouter:*` IPC -> `decodeOpenRouterSSE` -> `mapChunkToEvents` -> state/repo/SQLite。 | `provider-architecture-current-state-integrated.md` §1, §3, §4；源码路径：`src/ui-app/app/appChatApp.logic.ts`、`src/next/live/openRouterLiveStream.ts`、`src/next/openrouter/buildRequest.ts`、`src/next/openrouter/sse/decoder.ts`、`src/next/openrouter/mapChunkToEvents.ts`。 |
| catalog 层已有 `ProviderAdapter`，runtime/chat/stream 层没有 provider adapter 或 provider registry。现有 `ProviderAdapter` 只应在架构术语中改称 `CatalogSourceAdapter` 或 `ModelCatalogProviderAdapter`。 | `provider-architecture-current-state-integrated.md` §1；`provider-architecture-source-comparison.md` §6, §7；源码路径：`src/shared/modelCatalog/internalSchema.ts` 的 `ProviderAdapter`、`src/shared/modelCatalog/openRouterCatalogClient.ts` 的 `OpenRouterCatalogClient implements ProviderAdapter`。 |
| Gemini 当前是 `runtime-dead remnants`。仍有 `@google/generative-ai`、`geminiApiKey`、`PROVIDERS.GEMINI`、legacy `activeProvider: 'Gemini'` 等残留，但没有 active Gemini send chain。 | `provider-architecture-current-state-integrated.md` §1, §6；`provider-architecture-source-comparison.md` §6, §7；源码/片段：`package.json`、`electron/config/configSchema.ts`、`src/constants/providers.ts`、`current-state-original/snippets/gemini-status.md`。 |
| Reasoning 已与 visible assistant text 分离，state/DB/reasoning segment/final JSON 有基础；但当前一等解析格式主要是 OpenRouter `reasoning_details`，没有 DeepSeek `reasoning_content`、Anthropic thinking、OpenAI Responses reasoning items、Gemini thought/thinking-like data 的一等 runtime parser。 | `provider-architecture-current-state-integrated.md` §1, §5, §8, §11；源码路径：`src/next/openrouter/mapChunkToEvents.ts`、`src/next/state/types.ts`、`src/next/state/reducers/reasoningHandlers.ts`、`infra/db/schema.sql`、`infra/db/repo/reasoningDetailsAggregator.ts`。 |
| Send Plan / catalog 有 provider-aware 或 neutral-ish 基础，但 UI、catalog query、web search、request builder、IPC、error envelope 仍明显 OpenRouter-coupled。 | `provider-architecture-current-state-integrated.md` §3, §5, §9, §10, §11, §15；源码路径：`src/shared/files/sendPlanTypes.ts`、`infra/files/sendPlanService.ts`、`src/next/openrouter/openRouterSendPlanSerializer.ts`、`src/next/openrouter/searchSettingsResolver.ts`、`electron/preload.ts`、`src/next/errors/openRouterErrorEnvelope.ts`、`src/ui-app/components/ModelPickerDialog.vue`。 |
| renderer 当前可读取 OpenRouter key/baseURL。这是 legacy boundary issue，不得作为新 provider 模板。 | `provider-architecture-current-state-integrated.md` §1, §12, §14, §15；`provider-architecture-source-comparison.md` §4, §6, §7；源码路径：`src/ui-app/app/useChatSession.ts`、`electron/preload.ts`、`electron/ipc/storeIpc.ts`。 |
| durable `usage_log` table/repo 存在，但 active send path 的 durable usage logging 未由证据确认；active send 证据显示 `UsageDelta` 进入 message metadata snapshot。 | `provider-architecture-current-state-integrated.md` §1, §5, §12, §14；`provider-architecture-source-comparison.md` §6, §7；源码路径：`infra/db/schema.sql`、`infra/db/repo/usageRepo.ts`、`src/ui-app/app/appChatApp.logic.ts`。 |
| tool-call deltas 有 OpenRouter-style parse/merge/preserve 基础，但本次证据未建立 provider-neutral tool execution engine。 | `provider-architecture-current-state-integrated.md` §5, §11, §17；`provider-architecture-source-comparison.md` §6, §7；源码路径：`src/next/openrouter/mapChunkToEvents.ts`、state reducers、context builder、tests。 |

---

## 3. 核心术语定义

| 术语 | 正式定义 | 数据库 | 用户设置 | 运行时 | 诊断 | renderer 可见性 |
|---|---|---:|---:|---:|---:|---|
| `RuntimeProvider` | Starverse 运行时可调用的 provider 类型或实例，如 OpenRouter、OpenAI Responses、Anthropic Messages、Gemini native、DeepSeek profile、Generic OpenAI-compatible endpoint。 | 存 provider/profile/endpoint 引用。 | 可存默认 provider/profile。 | registry 中存在。 | 可显示 id/version。 | 可见 display name、id、masked status；不可见 secret。 |
| `RuntimeProviderAdapter` | runtime/chat/stream 层一等适配器，负责 request translation、streaming、event normalization、usage/error/reasoning/tool normalization。 | 不存 adapter 实例。 | 不直接设置。 | 是。 | 是。 | 不直接暴露。 |
| `CatalogSourceAdapter` / `ModelCatalogProviderAdapter` | 模型目录来源适配器，只负责 list/sync/enrich model metadata。它是当前 catalog `ProviderAdapter` 的目标术语。 | 存 source sync state、metadata、source version。 | 可 enable/disable source。 | sync worker/service 中存在。 | 是。 | 可见 source 名称和同步状态。 |
| `ProviderProfile` | provider 或 endpoint 的语义 profile，如 `openrouter_v1_chat`、`openai_responses_v1`、`deepseek_official_openai_compat`、`ollama_openai_subset`。 | 存 profile id/version，可存 override。 | 可选择或绑定 endpoint。 | request translation 中加载。 | 是。 | 可见 id/display name；不可见 secret。 |
| `ProviderQuirks` | profile 下的行为差异，如 reasoning field、usage shape、tool delta、error envelope、ignored params、stream done semantics。 | 默认随应用；override 可存。 | 高级 override 可存。 | 是。 | 是。 | 可见摘要；不可见 secret/header。 |
| `Endpoint` | 具体可请求位置和访问配置，包括 baseURL、authRef、headersSecretRef、locality、health、profileId。 | 是。 | 非敏感字段可设置。 | health/cache/connection state。 | 是。 | 可见 endpoint id、display name、masked URL/host、health；不可见 key/header secret。 |
| `Gateway` | 聚合或代理服务，如 OpenRouter 或 enterprise OpenAI-compatible gateway。Gateway 不等于 upstream vendor。 | endpoint/provider metadata。 | 可作为 endpoint kind。 | 否。 | route/upstream 诊断可见。 | 可见。 |
| `UpstreamVendor` | 模型研发或原始服务方，如 OpenAI、Anthropic、Google、DeepSeek、Meta、Mistral、Qwen。 | catalog dictionary。 | 通常不设置。 | 否。 | route/cost metadata 可显示。 | 可见。 |
| `ModelIdentity` | Starverse 内部模型身份，包含 modelKey、native model id、catalog source、endpoint/profile availability、upstream vendor。 | 是。 | favorites/default model 引用。 | 是。 | 是。 | 可见。 |
| `ModelAvailability` | 某模型在某 endpoint/profile/source 上是否可用、来源、时间、confidence、health。 | 是。 | 可有 manual availability。 | health/probe cache。 | 是。 | 可见摘要。 |
| `ModelCapability` | 模型声明或推导能力，如 modalities、context、max output、vision、tools、reasoning、structured output、pricing。 | 是，必须带 source/confidence/timestamp。 | 可有 user override。 | capability resolver 输入。 | 是。 | 可见摘要。 |
| `RuntimeCapability` | 发送前最终能力：model capability ∩ provider runtime capability ∩ endpoint capability ∩ transport dialect ∩ profile/quirks ∩ user override ∩ probe。 | 可缓存 snapshot。 | 不直接编辑，可由 override 影响。 | 是，Send Plan 必须消费。 | 是。 | 可见 summary/warning。 |
| `TransportDialect` | wire protocol 形态，如 OpenAI Chat Completions、OpenAI Responses、Anthropic Messages、Gemini generateContent、OpenAI-compatible subset。 | profile 字段。 | 高级可见。 | adapter 分派。 | 是。 | 可见简化标签。 |
| `LocalEndpoint` | 用户或外部应用启动的本地 endpoint，如 LM Studio、Ollama、LocalAI、llama.cpp server、custom local OpenAI-compatible endpoint。 | Endpoint subtype。 | 是。 | health/probe/cache。 | 是。 | 可见；secret/header/admin token 不可见。 |
| `ManagedLocalRuntime` | Starverse 未来自管本地模型运行时域对象，负责模型文件、engine、process、port、resource、health、privacy。 | 是，存 runtime profile/inventory；路径用脱敏引用。 | 是。 | manager state。 | 是，必须脱敏。 | 可见摘要；不得暴露原始路径、admin secret、日志正文。 |
| `RuntimeEngine` | 本地推理引擎，如 llama.cpp、vLLM、MLX、ONNX Runtime 等 future candidate。 | engine inventory/config。 | 可选择 engine 和资源 profile。 | process supervisor 中存在。 | engine version/backend/log summary。 | 可见摘要。 |
| `ModelArtifact` | 本地模型文件或导入资产，如 GGUF、safetensors、projector、tokenizer；含 quantization、checksum、license、storageRef。 | 是。 | 用户可管理。 | 加载时使用。 | 脱敏路径、hash prefix、size。 | 可见逻辑名、脱敏路径；不得暴露完整敏感路径。 |
| `StarverseChatRequest` | Starverse app-owned request IR，表达 messages/content parts/files/tools/reasoning/web/sampling/model/endpoint 等语义。 | 通常不整体持久化；可存 request metadata snapshot。 | 不直接设置。 | 是。 | 脱敏摘要可记录。 | renderer 可以构造 provider-neutral 意图，但不得含 secret/native provider body。 |
| `StarverseStreamEvent` | provider-neutral stream IR，覆盖 text/reasoning/tool/usage/meta/warning/error/done/diagnostics。 | 可映射为 message/reasoning/usage/error persistence。 | 不设置。 | 是。 | 是。 | renderer 可消费 normalized event；不得携带 secret/raw sensitive diagnostic。 |
| `StarverseProviderError` | provider-neutral error envelope，含 phase、category、retryable、provider code、http status、redacted raw、request id。 | error snapshot / usage failure record 可存。 | 不设置。 | 是。 | 是，raw 必须脱敏。 | 可见 user-safe message、category、retry hint。 |
| `StarverseUsageRecord` | provider-neutral usage/cost/accounting record，覆盖 input/output/reasoning/cache/file/media/tool/web units、cost、currency、request id、attempt、duration。 | `usage_log` 长期 SOT；message meta 存 UI snapshot。 | 不设置。 | 是。 | 是。 | 可见 cost/usage summary。 |

不得进入 renderer 的内容：API key、secret header、enterprise token、local admin token、provider raw Authorization、未脱敏 provider error raw、完整本地模型敏感路径、未脱敏日志、完整 file/content token、OpenRouter 或其他 provider 的 raw request body。

---

## 4. Provider 分层契约

| 分层 | 契约含义 | 代表对象 | 目标处理 |
|---|---|---|---|
| Remote native provider | 官方 API 语义明显强于 generic compatibility，需 native adapter 保真。 | OpenAI Responses API、Anthropic Messages API、Gemini API / Google AI Studio。 | 建立 native `RuntimeProviderAdapter`；不压平成 OpenAI-compatible。 |
| First-class gateway provider | Starverse 明确支持且具有特殊 runtime/catalog/metadata 语义的 gateway。 | OpenRouter。 | first-class special adapter；不是普通 OpenAI-compatible endpoint。 |
| Generic compatibility adapter | 用最低公共能力覆盖长尾 provider 和自定义 endpoint。 | Generic OpenAI-compatible Chat Completions。 | 只承诺 text chat/basic streaming/basic error；高级能力必须 profile/probe/override。 |
| Official profile / quirks | 使用 compatibility transport，但官方语义有重要差异。 | DeepSeek official profile。 | OpenAI-compatible transport + DeepSeek profile/quirks；不是普通 generic endpoint。 |
| Custom endpoint | 用户或企业配置的远程 endpoint。 | enterprise OpenAI-compatible gateway、custom OpenAI-compatible endpoint。 | 通过 endpoint registry、credential ref、profile id、capability override/probe 管理。 |
| Local endpoint | 外部本地服务，Starverse 只连接，不管理模型进程生命周期。 | LM Studio、Ollama、LocalAI、llama.cpp server、custom local OpenAI-compatible endpoint。 | LocalEndpoint + profile/quirks/probe；默认能力保守。 |
| Managed local runtime | Starverse 自己管理模型文件、engine、process、port、resource、health、privacy。 | Future Starverse-managed local runtime。 | 只冻结边界；后期通过 RuntimeManager / EngineManager 实现；不等同 custom baseURL。 |

Provider 定位：

| Provider / endpoint | 最终定位 |
|---|---|
| OpenRouter | First-class special adapter；同时是 gateway provider 与 catalog source。 |
| OpenAI Responses API | OpenAI native 主线。 |
| OpenAI Chat Completions | 兼容层，不是 OpenAI native 主线。 |
| Anthropic Messages API | Native adapter。 |
| Gemini API / Google AI Studio | Future native adapter；旧 Gemini remnants 不复用。 |
| DeepSeek official | OpenAI-compatible transport + DeepSeek official profile / quirks。 |
| Generic OpenAI-compatible Chat Completions | 长尾 provider 和自定义 endpoint 的低维护覆盖策略。 |
| LM Studio / Ollama / LocalAI / llama.cpp server | LocalEndpoint，不是 ManagedLocalRuntime。 |
| Starverse-managed local runtime | Future boundary；不作为近期完整实现目标。 |

---

## 5. Adapter 职责契约

### 5.1 RuntimeProviderAdapter

负责：request translation、streaming transport、stream event normalization、reasoning normalization、tool-call normalization、usage extraction、error normalization、abort / cancellation、provider metadata、capability validation、diagnostics redaction。

不得负责：model catalog sync、UI rendering、DB schema ownership、Send Plan policy ownership、local model process lifecycle、provider setting UI、模型下载、模型导入、进程启动、端口租约、GPU/CPU/offload 管理。

RuntimeProviderAdapter 的输出必须是 Starverse-owned IR。即使 adapter 内部使用 AI SDK、OpenAI SDK 或 provider SDK，输出也必须归一化为 `StarverseStreamEvent`、`StarverseProviderError`、`StarverseUsageRecord` 等 Starverse contract。

### 5.2 CatalogSourceAdapter

负责：`listModels`、`listProviders` / endpoint metadata if applicable、model metadata enrichment、pricing / context / modality collection、source/confidence/version tracking、catalog sync diagnostics。

不得负责：chat streaming、request execution、credential exposure to renderer、Send Plan decisions、runtime capability final decision、provider raw request construction。

现有 catalog 层 `ProviderAdapter` 名称不得承担 runtime 职责。架构术语中应称为 `CatalogSourceAdapter` 或 `ModelCatalogProviderAdapter`。

---

## 6. Internal IR 契约

Starverse 必须建立自己的 Internal LLM IR。UI / DB / Send Plan 不直接依赖 OpenAI、OpenRouter、Anthropic、Gemini、AI SDK 或任一 provider-native schema。

契约原则：

| 原则 | 要求 |
|---|---|
| App-owned request | `StarverseChatRequest` 是唯一 app-owned request IR。provider-native request body 只能在 adapter 内部生成。 |
| Provider-neutral stream | `StarverseStreamEvent` 是 runtime adapter 输出的 provider-neutral stream IR。 |
| Raw containment | provider-native schema 只能存在于 adapter 内部、raw diagnostic、provider raw persistence 区，不得成为 UI/DB/Send Plan 的通用字段。 |
| Existing consumer bridge | 当前 `DomainEvent` / state / DB 可作为现有消费层，但不得直接成为 provider wire schema。 |
| Evidence boundary | 任何新增 IR 字段必须有当前行为、目标 provider 语义或明确 Owner 决策支撑。 |
| Placeholder prohibition | 不得只为未来可能性创建空 interface、空 registry、空 manager、空 service。没有现有行为桥接、测试或当前阶段要求的 abstraction 必须停留在文档层。 |

---

## 7. Stream / reasoning / tool / usage 契约

统一 `StarverseStreamEvent` 分类：visible text delta、reasoning delta、reasoning item、reasoning summary、reasoning signature / encrypted / opaque artifact、tool call delta、tool result、usage snapshot、usage final、provider metadata、warning、error、done、aborted、transport diagnostics。

Reasoning 统一规则：

| 来源 | Starverse 表达 | 历史上下文规则 |
|---|---|---|
| OpenRouter `reasoning_details` | normalized reasoning detail + provider raw `openrouter_reasoning_details`。 | 默认不作为 visible text；是否回传由 OpenRouter adapter/profile 决定。 |
| DeepSeek `reasoning_content` | `reasoning.delta` + DeepSeek raw artifact。 | 默认不进入 generic history；tool-call continuation 等特殊规则由 DeepSeek profile 决定。 |
| OpenAI Responses reasoning items | `reasoning.item` / encrypted / opaque artifact。 | 由 OpenAI Responses adapter 管理 previous response / encrypted continuation。 |
| Anthropic thinking | `reasoning.delta` / summary / signature / redacted or opaque artifact。 | signature/redacted thinking 是否回传由 Anthropic adapter 管理。 |
| Gemini thought / thinking-like data | `reasoning.item` / thought signature / opaque artifact。 | thought signature 是否回传由 Gemini native adapter 管理。 |
| local model without structured reasoning | 不拆 reasoning；普通 text 仍是 visible text。 | 不创建 fake reasoning。 |

DB 应保存 normalized reasoning 与 provider raw / opaque artifact 两层。UI reasoning panel 读取 normalized reasoning view，不直接读取 provider raw schema。provider roundtrip metadata 由 adapter/profile 决定，不由 UI 或 generic context builder 自行拼接。

Usage 契约：`usage_log` 是长期 accounting / audit source of truth；message metadata 保存 UI snapshot。若当前 active path 尚未完整写入 `usage_log`，这是待演进事实，不改变目标 SOT。

Tool 契约：tool-call stream parsing 与 tool execution 分层。当前证据只确认 OpenRouter-style tool-call deltas 有 parse/merge/preserve 基础；provider-neutral tool execution engine 需要补充证据后单独设计。

---

## 8. Model capability 契约

能力必须分层，Send Plan 必须消费 `RuntimeCapability`，不得直接消费 OpenRouter catalog、provider-specific fields 或 raw model metadata。

| 能力层 | 含义 | 来源 |
|---|---|---|
| model intrinsic capability | 模型自身能力：modalities、context、max output、vision、audio、video、reasoning family、tool suitability。 | catalog、provider docs、Models.dev enrichment、manual metadata。 |
| provider runtime capability | provider runtime 能表达的能力：native tools、hosted tools、web search、file parser、reasoning controls。 | provider profile / adapter。 |
| endpoint capability | endpoint 实际能力：stream、file upload、max size、listModels、health、auth、error shape。 | endpoint config、probe、health check。 |
| transport dialect capability | wire protocol 能承载的能力：Chat Completions、Responses、Messages、generateContent、OpenAI-compatible subset。 | profile。 |
| file / MIME capability | 文件输入方式：URL、inline bytes、provider file id、raw file、PDF support、MIME whitelist、size/count limit。 | RuntimeCapability resolver、Send Plan、file pipeline。 |
| feature availability | 最终 feature 是否可用，如 web search、tool call、structured output、image generation、reasoning panel。 | RuntimeCapability final result。 |
| user override | 用户对 custom endpoint/local endpoint/enterprise gateway 的手动能力声明。 | settings，必须带 confidence。 |
| probed capability | 通过 health/listModels/basic stream 或 feature probe 观察到的能力。 | probe records。 |
| catalog-reported capability | catalog source 声明能力。 | OpenRouter catalog、provider native listModels、Models.dev enrichment、manual catalog。 |

Conflict policy：observed/probed capability 与 endpoint-native data 优先；provider official profile 高于 generic heuristic；OpenRouter catalog 对 OpenRouter endpoint 有权威性；Models.dev 只做 enrichment/reference，不是 endpoint availability SOT；user override 可禁用能力优先，强行启用高风险能力必须有 warning。

---

## 9. Settings / credential 契约

新 provider credential 不得通过 renderer-readable state、generic store IPC、diagnostics、logs 或 stream events 暴露。secret / API key / custom header / enterprise token / local admin token 只在 main process / secure store 边界使用。

One-way credential update pattern：renderer 可临时传递用户输入的 API key 通过 provider-specific one-way update IPC channel（如 `openai-responses-credential:update`、`google-ai-studio-credential:update`）。key 到达 main process 后立即存储，renderer 不可通过任何 IPC、store IPC、preload bridge 或 diagnostic channel 读回 raw key。所有 credential IPC 只返回 masked status（如 `apiKeyConfigured: true, maskedApiKey: '***'`）。

renderer 只能看到：provider display name、endpoint id、profile id、modelKey、masked credential status、health、capability summary、safe error message、诊断摘要。

store IPC、preload bridge、diagnostics 不得暴露 raw API key、Authorization、Bearer 或 secret headers。

Endpoint settings 必须与 provider-native settings 分离。custom endpoint 不得污染 OpenRouter native settings。OpenRouter official endpoint、OpenRouter mirror/custom endpoint、enterprise OpenAI-compatible gateway、local endpoint 必须是不同 Endpoint record。

OpenRouter 当前仍使用 legacy store backing，但 renderer generic store raw key/baseURL read-back 已被 C4 屏蔽，并通过 provider-specific settings IPC 暴露 masked metadata 与 one-way update/clear。它仍不是 secure store completion，不得作为新 provider secret read-back 模板，后续 secure credential boundary 仍需单独推进。

Gemini legacy remnants 的处理原则：`geminiApiKey`、`activeProvider: 'Gemini'`、旧 provider constants、旧 README 说法只允许 migration-read-only 或 deprecated-for-removal。未来如果支持 Gemini，必须基于 Gemini API / Google AI Studio native adapter 重建，不复活旧 Gemini path。

---

## 10. Legacy path removal policy

Legacy provider paths are not architectural assets.

旧 provider 路径、旧配置、旧默认值、旧文档残留和误导性 UI 只允许短期保留，用于迁移、兼容读取、避免升级损坏。一旦新架构路径可用，必须逐步移除旧路径、旧默认值、旧文档口径和误导性 UI。

| Legacy category | 契约处理 |
|---|---|
| 旧 provider runtime path | migration-only；不得作为未来架构输入。 |
| Gemini legacy path | `runtime-dead remnants`；目标状态是 `deprecated-for-removal / migration-read-only`。 |
| Gemini future support | 必须基于 Gemini API / Google AI Studio native adapter 重建。旧 `geminiApiKey`、`activeProvider: 'Gemini'`、旧 constants、旧 SDK dependency、旧 README 口径不得复用为 runtime path。 |
| OpenRouter renderer credential access | legacy exception；新 provider 禁止复制；后续迁移到 main/secure credential boundary。 |
| OpenRouter raw schema leakage | 只能留在 OpenRouter adapter/facade 内部或 raw diagnostic 区；不得作为 app-wide provider contract。 |
| Misleading docs/UI | 必须停止暗示 Gemini 是 active runtime provider；历史口径应标记为 legacy 或 future rebuild only。 |

Legacy removal is not optional cleanup. 每个引入替代边界的阶段都必须包含 legacy-removal checklist。阶段不能在已替换 legacy surface 未被分类为 migrated、isolated、deprecated-for-removal 或 removed 时标记完成。

---

## 11. Long-tail provider support policy

Starverse 的长尾 provider 策略是低维护、多供应商覆盖，而不是手写大量 native adapter。

| 策略 | 契约 |
|---|---|
| 主路径 | 长尾供应商优先走 Generic OpenAI-compatible Chat Completions endpoint。 |
| Profile/quirks | 非标准字段、stream 差异、usage/error/tool/reasoning 差异通过 `ProviderProfile` / `ProviderQuirks` / probe / user override 管理。 |
| Native adapter 范围 | 只用于高价值、强语义差异 provider：OpenRouter、OpenAI Responses API、Anthropic Messages API、Gemini API / Google AI Studio、DeepSeek official profile / quirks。 |
| AI SDK | 可作为 adapter 内部实现参考或 implementation detail；AI SDK schema 不得成为 Starverse internal contract。 |
| Models.dev | 可作为 catalog enrichment/reference 降低目录维护压力；不是 endpoint availability SOT。 |
| Chat product references | LibreChat、Open WebUI、LobeChat、Continue.dev、AnythingLLM 等可借鉴 provider setting、custom endpoint、local endpoint、model picker 经验；不照抄 server/deployment/agent/workflow 架构。 |
| Integration ecosystem | LangChain / LlamaIndex 只作 provider integration ecosystem 参考，尤其提醒 OpenAI-compatible 无法保真所有非标准字段。 |
| IR reference | LLM-Rosetta 可作为 hub-and-spoke IR 思路参考；不绑定其实现。 |

Starverse 不转型为 Agent platform，不引入 OpenCode runtime、agent loop、shell、MCP、LSP、workspace automation、patch/apply system，也不把 RAG/workspace/coding workflow 作为 provider architecture 主线。

---

## 12. 不变量

1. OpenRouter 当前行为不退化。
2. visible assistant text 与 reasoning 分离不退化。
3. 历史消息兼容不破坏。
4. Send Plan / attachment safety gate 不绕过。
5. 新 provider 不新增 renderer secret access。
6. Generic OpenAI-compatible 不默认承诺 tools/files/reasoning/web search/structured output/usage final/image generation。
7. LocalEndpoint 不等同于 ManagedLocalRuntime。
8. provider raw schema 不污染 UI / DB / Send Plan。
9. RuntimeProviderAdapter 与 CatalogSourceAdapter 必须分离。
10. 现有 legacy paths 不得被重新表述为长期架构资产。
11. Starverse 保持 AI chat app 边界，不转型为 Agent/RAG/coding workflow platform。
12. Placeholder abstractions 不得进入 source，除非被真实行为路径、测试或当前阶段边界直接使用。

---

## 13. 禁止事项

禁止：

1. 把所有 provider 压平成 OpenAI-compatible。
2. 把 AI SDK schema 作为 Starverse 内部 contract。
3. 把 OpenCode runtime 接入 Starverse 核心 provider gateway。
4. 把任意外部 enterprise gateway 作为默认必经 gateway。
5. 把 managed local runtime 当成普通 custom baseURL。
6. 在 `appChatApp.logic.ts` 直接横向添加多个 provider 分支。
7. 复用 catalog `ProviderAdapter` 命名承担 runtime 职责。
8. 复活旧 Gemini path 作为 future Gemini adapter。
9. 让新 provider credential 进入 renderer。
10. 把 OpenRouter request/stream/error schema 暴露为 app-wide provider schema。
11. 把 RAG、Agent、coding workflow、shell、MCP、LSP、workspace automation 纳入 provider architecture 主线。
12. 创建 placeholder abstractions：空 `RuntimeProviderAdapter`、无人调用的 registry、提前出现的 RuntimeManager / EngineManager、无人 emit/consume 的 stream event type、未被 Send Plan 或 runtime 使用的 capability object。

---

## 14. 仍需 Owner 决策的问题

| 决策点 | 推荐选项 | 说明 |
|---|---|---|
| 文档确认状态 | 当前为 Owner-confirmed architecture SSOT。 | 未经 Owner 明确确认前不得标为已确认状态。 |
| usage SOT | `usage_log` 为长期 accounting/audit SOT；message metadata 为 UI snapshot。 | 当前 active durable logging 需要补证或演进。 |
| credential store | main process / secure store 持有 secret。 | 需要 Owner 决定迁移窗口与 OpenRouter legacy exception 处理。 |
| Gemini future | 若做，基于 Gemini API / Google AI Studio native adapter 重建。 | 旧 path 不复用；若不做，迁移安全确认后删除 remnants。 |
| Models.dev | enrichment/reference，不是 endpoint availability SOT。 | 是否启用为可选 enrichment source 需 Owner 确认。 |
| AI SDK 使用边界 | adapter 内部可用，Starverse contract 不依赖。 | 需明确 dependency policy 与测试门槛。 |
| Managed local runtime | 只冻结边界，后期再实现。 | 不在近期目标内实现完整模型下载/运行时管理。 |
| Long-tail provider UX | Generic OpenAI-compatible + profile/quirks/probe/user override。 | 需要 Owner 确认 capability warning 与 advanced settings 露出程度。 |

---

## 15. 外部参考边界

外部生态只用于架构模式校准，不作为 Starverse 当前代码事实来源，也不作为 Starverse runtime contract。

| 外部参考 | 可借鉴 | 不引入 |
|---|---|---|
| AI SDK | provider abstraction、provider packages、OpenAI-compatible provider、custom provider 思路。 | AI SDK schema 作为 Starverse internal contract。 |
| OpenCode | AI SDK + Models.dev + provider config + local endpoint 配置思路。 | runtime、agent loop、shell、patch、workspace automation。 |
| LibreChat | custom endpoint、OpenAI-compatible endpoint、chat product settings 经验。 | server/.env deployment model。 |
| Open WebUI | local-cloud hybrid、Ollama/OpenAI-compatible chat platform 经验。 | self-hosted platform/RAG runtime。 |
| LobeChat | provider/environment/config/model picker 分层经验。 | deployment/environment model 复制。 |
| Continue.dev | provider config、自定义 OpenAI-compatible endpoint、本地推理服务配置经验。 | coding assistant workflow、LSP、workspace automation。 |
| AnythingLLM | 本地模型与文档聊天产品经验。 | RAG/workspace 成为 provider architecture 主线。 |
| LangChain / LlamaIndex | provider integration ecosystem、非标准字段风险提醒。 | runtime core、Agent/RAG framework。 |
| LLM-Rosetta | hub-and-spoke IR、request/response/stream event/reasoning trace 抽象思路。 | 外部 IR 实现绑定。 |
