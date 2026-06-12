# STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md

版本：v1.0.0
状态：Owner-confirmed architecture SSOT
最后更新：2026-06-11
上游证据来源：provider-architecture-gpt55-transfer.zip
取代：previous unversioned provider architecture drafts
关联文档：
- STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md
- STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md
- STARVERSE_PROVIDER_EVOLUTION_PATH.md


## Version notes

本版本把契约转化为目标模块结构和数据流，明确 legacy path removal 是目标架构输入过滤规则；开放生态经验已映射为 Starverse 专属 landing objects；placeholder abstraction prohibition 已加入风险控制；被 Owner 排除的网关对象已从目标范围移除；Starverse chat-app boundary 已强化，不引入 Agent/RAG/coding workflow runtime。

## Fixture foundation closeout (added 2026-06-12)

All six target provider paths now have fixture-integrated adapter foundations:

- **OpenRouter**: backed by existing active runtime through provider core slice. OpenRouter behavior preserved unchanged.
- **DeepSeek**: native mapper + request builder + SSE decoder + adapter. `reasoning_content` separated from visible text. Terminal coordination proven.
- **OpenAI Responses**: native mapper + request builder + SSE decoder + adapter. `response.output_text.delta` / `response.reasoning_summary_text.delta` / `response.reasoning_text.delta` separated. `response.completed` / `response.failed` / `response.incomplete` terminal coordination proven.
- **Anthropic**: native mapper + request builder + SSE decoder + adapter. `thinking_delta` / `signature_delta` / `text_delta` separated. `thinking.budget_tokens < max_tokens` invariant enforced. `message_stop` / `error` terminal coordination proven.
- **Gemini API / Google AI Studio**: native mapper + request builder + SSE decoder + adapter. `thought` parts separated from visible text. `functionCall` / `functionResponse` ignored (no tool delta shape). `promptFeedback.blockReason` mapped to meta. `finishReason` / `error` terminal coordination proven. Gemini path is native Gemini API / Google AI Studio architecture, NOT legacy Gemini runtime remnants.
- **Generic OpenAI-compatible**: request builder + SSE decoder + adapter-local stream mapping. Conservative Chat Completions text/basic streaming/basic error. Rejects unsupported outbound content (non-generic context messages, non-text content blocks, malformed text blocks) deterministically before fetch rather than silently flattening or dropping. Sanitizes credential-bearing messages and provider-controlled error code/type metadata. No tools/files/vision/reasoning/web search/structured output by default.

Adapter-side credential boundary seed exists: pure adapter/test boundary for bearer credential construction, auth header building, credential masking, and credential-aware error message/code redaction. This is not secure store, not renderer/settings/IPC, not live enablement.

Deferred: live API calls, UI/provider picker, settings, secure credential store, provider registry, Send Plan RuntimeCapability integration, OpenRouter conformance to RuntimeProviderStreamAdapter, LocalEndpoint, ManagedLocalRuntime.

---

## 1. 架构目标

Starverse 目标架构要支持：OpenRouter first-class special adapter、OpenAI Responses API native adapter、Anthropic Messages API native adapter、Gemini API / Google AI Studio future native adapter、DeepSeek official profile / quirks、Generic OpenAI-compatible Chat Completions compatibility layer、enterprise/custom OpenAI-compatible endpoint、LM Studio / Ollama / LocalAI / llama.cpp server / custom local OpenAI-compatible endpoint，以及 future Starverse-managed local runtime boundary。

目标不是把 Starverse 改造成 Agent platform。Starverse 的主线仍是聊天、多模型切换、多模态附件、reasoning panel、文件 Send Plan、用量与成本、本地/远程模型接入，以及用户可控 provider / endpoint 配置。Agent loop、shell、MCP、LSP、workspace automation、patch/apply system、RAG/workspace platform 不属于本架构主线。

核心目标：

| 目标 | 说明 |
|---|---|
| Provider-neutral core | UI / DB / Send Plan 依赖 Starverse-owned IR，不依赖 provider-native schema。 |
| Low-maintenance long-tail coverage | 长尾供应商优先通过 Generic OpenAI-compatible endpoint + profile/quirks/probe/user override 覆盖。 |
| Native where semantics matter | 高价值且语义差异强的 provider 才做 native adapter。 |
| Catalog/runtime separation | catalog source 只负责模型目录；runtime provider 只负责请求和流。 |
| Capability-driven Send Plan | Send Plan 消费 `RuntimeCapability`，不消费 OpenRouter raw fields。 |
| Secure credential boundary | 新 provider secret 只在 main process / secure store 使用。 |
| Local endpoint first | 先支持外部 local endpoint，后期再考虑 managed local runtime。 |
| Legacy removal | 旧 provider paths、旧配置、旧默认值、旧文档口径不作为目标架构资产。 |

---

## 2. 总体架构图

```text
UI / Composer / Model Picker
  │
  │ provider-neutral intent: endpointId + profileId + modelKey + draft + attachments
  ▼
Provider-neutral send facade
  │
  ├─ reads RuntimeCapability from Capability Resolver
  ├─ invokes RuntimeProviderRegistry
  └─ emits StarverseStreamEvent
        │
        ▼
RuntimeProviderRegistry
  │
  ├─ OpenRouterRuntimeProviderAdapter
  ├─ OpenAIResponsesRuntimeProviderAdapter
  ├─ AnthropicMessagesRuntimeProviderAdapter
  ├─ GeminiNativeRuntimeProviderAdapter future
  ├─ OpenAICompatChatCompletionsAdapter
  └─ DeepSeekProfile over OpenAI-compatible transport
        │
        ▼
ProviderProfile / ProviderQuirks / Endpoint Registry
  │
  ├─ remote native endpoints
  ├─ first-class gateway endpoint
  ├─ custom OpenAI-compatible endpoint
  └─ local endpoint
        │
        ▼
Provider API / Gateway / Local Endpoint

CatalogSourceAdapter layer
  │
  ├─ OpenRouter catalog
  ├─ provider native listModels
  ├─ Models.dev enrichment/reference
  ├─ manual model config
  └─ local endpoint model inventory/probe
        │
        ▼
ModelCatalog + ModelAvailability + ModelCapability
        │
        ▼
RuntimeCapability Resolver
        │
        ▼
Send Plan / Attachment capability gate

StarverseStreamEvent
  │
  ├─ maps to current DomainEvent/state bridge
  ├─ reasoning artifact service
  ├─ usage accounting service
  ├─ error envelope service
  └─ SQLite message/reasoning/usage persistence

Future boundary:
ManagedLocalRuntime / RuntimeEngine / ModelArtifact / ResourcePolicy
  │
  └─ exposes local endpoint or direct engine bridge to RuntimeProviderAdapter
```

---

## 3. 模块职责

| 模块 | 输入 | 输出 | 拥有状态 | 不应承担 | 与现有模块关系 |
|---|---|---|---|---|---|
| provider runtime layer | `StarverseChatRequest`、Endpoint、Profile、RuntimeCapability、credential ref。 | `StarverseStreamEvent`、`StarverseProviderError`、`StarverseUsageRecord`。 | adapter runtime state、abort handles、redacted diagnostics。 | catalog sync、UI rendering、DB schema ownership、local process lifecycle。 | 包裹当前 `src/next/openrouter/*` 与 live stream，不先重写 OpenRouter 行为。 |
| provider catalog layer | CatalogSource config、credential ref if needed、sync trigger。 | ModelIdentity、ModelAvailability、ModelCapability、pricing/context/modalities。 | catalog source sync state、source/confidence/timestamp。 | chat streaming、Send Plan decisions、secret exposure。 | 现有 catalog `ProviderAdapter` 改称 `CatalogSourceAdapter`。 |
| endpoint/profile registry | endpoint config、authRef、profileId、quirks、health/probe result。 | Endpoint selection、profile binding、masked renderer metadata。 | endpoint records、non-secret config、health cache。 | provider request execution、catalog merge policy。 | 取代 provider-specific baseURL/key 被 UI 直接读取的模式。 |
| capability resolver | model capability、endpoint capability、transport dialect、profile/quirks、probe、user override。 | `RuntimeCapability`。 | capability snapshot/cache、conflict diagnostics。 | raw catalog sync、provider transport。 | Send Plan 的未来输入；替代 OpenRouter hardcoded provider context。 |
| stream event normalization | provider-native stream chunk、adapter profile。 | `StarverseStreamEvent`。 | stream diagnostics、sequence ids、finish metadata。 | UI rendering、DB schema changes。 | 现有 `mapChunkToEvents` 可作为 OpenRouter adapter 内部素材。 |
| reasoning artifact service | reasoning events、provider raw/opaque artifacts、visibility policy。 | normalized reasoning view、provider raw artifact records、roundtrip metadata。 | reasoning segment aggregation、format/version/fingerprint。 | provider transport、UI layout。 | 保留 reasoning segments/final JSON 方向；扩展 format vocabulary。 |
| usage accounting service | usage snapshot/final events、provider metadata、pricing source、message/session ids。 | `StarverseUsageRecord`、message meta snapshot、usage log record。 | `usage_log` 长期 accounting state。 | stream parsing、catalog sync。 | 目标是 `usage_log` SOT；message meta 只作 UI snapshot。 |
| credential service | endpoint authRef、provider identity、secure store request。 | adapter-only secret material、masked renderer metadata。 | secret refs、rotation metadata。 | provider selection、UI raw secret display。 | 修正 OpenRouter renderer key/baseURL legacy issue。 |
| local runtime manager future boundary | ModelArtifact、RuntimeEngine、resource profile、privacy policy。 | local endpoint or direct engine bridge、health/resource diagnostics。 | process state、port lease、engine inventory、redacted logs。 | provider request schema translation、chat UI state。 | 当前仅预留边界；不作为近期完整实现目标。 |

---

## 4. Provider 类型方案

### 4.1 OpenRouter

OpenRouter 是 first-class special adapter。它不是普通 OpenAI-compatible endpoint。当前 Starverse active runtime、request builder、SSE parser、reasoning parser、web search plugin、file/multimodal serializer、catalog、pricing、usage/error 都围绕 OpenRouter。目标是以 OpenRouter facade / adapter 包裹现有路径，外部暴露 Starverse IR，内部保留 OpenRouter-specific behavior。

### 4.2 OpenAI

OpenAI Responses API 是 OpenAI native 主线。OpenAI Chat Completions 只作为兼容层或长尾 compatibility 参考。Responses adapter 必须保留 reasoning items、encrypted reasoning、previous response / continuation、hosted tool 等语义空间。

### 4.3 Anthropic

Anthropic Messages API 是 native adapter。thinking、signature、redacted thinking、tool use continuation 等语义不得通过 Generic OpenAI-compatible 伪装。

### 4.4 Gemini

Gemini API / Google AI Studio 是 future native adapter。旧 Gemini remnants 不作为目标架构输入，不复用为 runtime。未来 Gemini support 必须基于 native Gemini architecture 重建。

### 4.5 DeepSeek

DeepSeek 使用 OpenAI-compatible transport + DeepSeek official profile / quirks。`reasoning_content`、thinking、reasoning_effort、参数屏蔽、tool-call continuation policy 必须由 DeepSeek profile 处理，不能进入 generic default。

### 4.6 Generic OpenAI-compatible

Generic OpenAI-compatible Chat Completions 是低维护长尾 provider 策略。最低公共能力只包括 text chat、basic messages、basic streaming text delta、basic HTTP error 和 manual model id。tools、files、vision、structured output、reasoning、usage final、web search、image generation、parallel tool calls 均需 profile/probe/override 后才可启用。

### 4.7 Local endpoint

Local endpoint 包括 LM Studio、Ollama、LocalAI、llama.cpp server、custom local OpenAI-compatible endpoint。Starverse 连接已经运行的服务，探测 health/model list/basic stream，默认能力保守。Local endpoint 不等同于 managed local runtime。

### 4.8 Managed local runtime

Managed local runtime 是 future boundary。它涉及 ModelArtifact、RuntimeEngine、process supervision、port lease、GPU/CPU/offload、resource policy、health probe、privacy policy、log redaction 和 model capability probe。近期只冻结边界，不实现完整模型管理。

---

## 5. Request / stream / reasoning 方案

`StarverseChatRequest` 是统一入口。UI/Composer 只表达 provider-neutral intent，包括 messages、content parts、attachments、reasoning intent、tools、web/search intent、structured output intent、sampling intent、response modality、endpointId、profileId、modelKey 和 metadata。provider-native request body 只能由 adapter 内部生成。

`StarverseStreamEvent` 是 adapter 输出。它再映射到当前 `DomainEvent` / state / DB bridge。当前 OpenRouter `mapChunkToEvents` 可作为 OpenRouter adapter 内部 mapper，不应成为 provider-neutral contract。

Reasoning 保存采用 normalized + provider raw / opaque artifact 双层：

| 层 | 用途 |
|---|---|
| normalized reasoning | UI reasoning panel、message display、search/display-safe metadata。 |
| provider raw / opaque artifact | provider roundtrip、diagnostics、migration、future parser repair。 |

Provider roundtrip metadata 由 adapter/profile 管理。UI 和 generic context builder 不决定 reasoning 是否回传。默认规则：visible assistant text 进入普通历史；reasoning 不进入 generic visible history；signature/encrypted/item 等 opaque continuation 由对应 provider adapter 决定。

Usage event 分为 `usage.snapshot` 和 `usage.final`。snapshot 可用于 UI 过程展示；final 应进入 `StarverseUsageRecord` 并最终写入长期 accounting SOT。message metadata 保留 UI snapshot。

---

## 6. Capability 方案

Capability resolver 生成 `RuntimeCapability`。Send Plan 只消费 `RuntimeCapability`，不直接消费 OpenRouter catalog 或 provider-specific fields。

| 能力类型 | 表达内容 |
|---|---|
| catalog capability | catalog source 声明的 model metadata，带 source/confidence/timestamp。 |
| runtime capability | provider adapter/profile 能表达和支持的能力。 |
| endpoint capability | endpoint health、stream、file upload、max size、auth、listModels、error shape。 |
| probed capability | health/listModels/basic stream/feature probe 观察结果。 |
| Send Plan capability | 当前 selected model + endpoint + profile + attachment target 的最终发送能力。 |
| user override | 用户手动能力声明，必须带 warning/confidence。 |
| conflict resolution | observed/probed > endpoint-native > provider official profile > OpenRouter catalog for OpenRouter > user override for manual/custom > Models.dev enrichment > heuristic。 |
| source/confidence/timestamp | 所有非显然能力必须记录来源、置信度和更新时间。 |

File / MIME capability：区分 text in prompt、raw file attachment、provider file id、inline bytes、URL ref、PDF support、MIME whitelist、max file bytes、max count、conversion requirement。文件格式转换和 Send Plan 的 selected option 语义必须保留，模型兼容性由 selected option + RuntimeCapability 决定。

Feature capability：tool、reasoning、web search、structured output、image generation、image/audio/video/file input/output 必须分开建模。web search 可以是 provider plugin、hosted tool 或 Starverse-managed external tool，但不应被建模成单一 model boolean。

---

## 7. Settings / credential 方案

目标设置边界：Endpoint registry 保存非敏感 endpoint config；secure credential store 保存 API key、secret header、enterprise token、local admin token；renderer 只显示 masked metadata。

| 对象 | 存储与可见性 |
|---|---|
| endpoint registry | endpointId、kind、baseURL/masked host、profileId、display name、locality、health、capability override refs。 |
| secure credential store | API key、Authorization、custom headers、enterprise tokens、local admin token。renderer 不可读。 |
| renderer-visible metadata | endpoint id、provider display name、masked key status、health、capability summary、safe error。 |
| per-provider/per-endpoint config | 通过 endpoint/profile registry 管理，不复用 OpenRouter native setting。 |
| custom headers | secret ref 存 secure store，renderer 只见是否配置。 |
| local endpoint health | 可见健康摘要，不暴露 admin secret 或敏感本地路径。 |
| Gemini legacy migration | read-only migration；不进入 runtime selection。 |
| OpenRouter legacy exception | 当前 renderer key/baseURL access 是 legacy issue，后续迁移到 main/secure boundary。 |

---

## 8. Local model 方案

External local endpoint 与 Starverse-managed local runtime 必须分离。

| 类型 | 含义 | 近期策略 |
|---|---|---|
| External LocalEndpoint | 用户或外部应用已启动的本地服务，Starverse 只连接。 | 支持 endpoint config、health/listModels/basic stream probe、conservative capability。 |
| ManagedLocalRuntime | Starverse 自己管理模型文件、引擎、进程、端口和资源。 | 只冻结边界，不做完整实现。 |

Managed local runtime future boundary 需要：model artifact inventory、engine inventory、process supervision、port lease、GPU/CPU/offload resource profile、health probe、local privacy policy、log redaction、model capability probe、resource limits、stop/restart semantics。

LocalEndpoint 不应被误认为完整 OpenAI-compatible。即使 endpoint 暴露 OpenAI-style path，也必须通过 profile/quirks/probe/override 判断 tools/files/reasoning/usage/vision 等高级能力。

---

## 9. Open ecosystem borrowing strategy

开放生态经验必须转化为 Starverse-specific architecture requirements，而不是 generic reference list。Starverse 借鉴 provider 生态路线，但不引入外部 runtime，不复制 agent/workflow 产品形态。

| 外部生态 | 借鉴方向 | Starverse 边界 |
|---|---|---|
| AI SDK | provider abstraction、provider packages、OpenAI-compatible provider、custom provider。 | 可作 adapter implementation detail；schema 不进入 Starverse contract。 |
| OpenCode | AI SDK + Models.dev + provider config + local endpoint 配置路线。 | 不引入 runtime、agent loop、shell、patch、workspace automation。 |
| LibreChat | custom endpoint / OpenAI-compatible endpoint 设置经验。 | 不复制 server/.env deployment model。 |
| Open WebUI | Ollama / OpenAI-compatible API / local-cloud hybrid 聊天平台经验。 | 不复制 self-hosted platform/RAG runtime。 |
| LobeChat | provider/environment/config/model picker 分层经验。 | 不复制 deployment/environment variable model。 |
| Continue.dev | 配置化 model provider、自定义 endpoint、本地推理服务接入。 | 不引入 coding workflow、LSP、workspace automation。 |
| AnythingLLM | 本地模型、文档聊天产品中的 provider 配置经验。 | 不把 RAG/workspace 变成 provider architecture 主线。 |
| LangChain / LlamaIndex | provider integration ecosystem 与非标准字段风险提醒。 | 不作为 runtime core。 |
| LLM-Rosetta | hub-and-spoke IR、request/response/stream event/reasoning trace 抽象思路。 | 不绑定外部 IR implementation。 |

## Ecosystem-derived Starverse architecture requirements

| Open ecosystem pattern | Starverse landing object | Required contract | Explicit non-goal |
|---|---|---|---|
| AI SDK provider abstraction | RuntimeProviderAdapter internal implementation option。 | SDK may be used inside adapter; output must be StarverseStreamEvent; AI SDK schema must not reach UI/DB/Send Plan。 | AI SDK as Starverse internal contract。 |
| OpenCode AI SDK + Models.dev + provider config | Long-tail provider strategy。 | Generic OpenAI-compatible + ProviderProfile + ProviderQuirks + Models.dev enrichment。 | OpenCode runtime / agent loop / shell / patch / workspace automation。 |
| LibreChat custom endpoint pattern | Endpoint registry。 | support custom OpenAI-compatible endpoint, baseURL, model id, credential ref, profile id。 | server/.env deployment model。 |
| Open WebUI local-cloud pattern | LocalEndpoint。 | LM Studio / Ollama / LocalAI / llama.cpp as local endpoint; capability conservative by default。 | self-hosted platform / RAG runtime。 |
| LobeChat provider/environment config | provider/endpoint setting model and model picker。 | separate endpoint config, model identity, user-visible provider metadata。 | copying its deployment or environment variable model。 |
| Continue.dev provider config | manual model and endpoint overrides。 | user-configurable model id, context/max output/capability override, local endpoint configuration。 | coding workflow / LSP / workspace automation。 |
| AnythingLLM local model and document-chat experience | LocalEndpoint and future ManagedLocalRuntime boundary。 | local endpoint first; managed local runtime later。 | making RAG/workspace the Starverse provider architecture mainline。 |
| LangChain / LlamaIndex integration ecosystem | provider-specific field warning and profile/quirks policy。 | non-standard fields such as reasoning_content / reasoning_details must be handled by profile/quirks。 | LangChain / LlamaIndex as runtime core。 |
| LLM-Rosetta hub-and-spoke IR | StarverseChatRequest / StarverseStreamEvent / provider adapters。 | all adapters convert through Starverse-owned IR。 | binding to an external IR implementation。 |

---

## 10. Long-tail provider strategy

Long-tail provider support must minimize maintenance pressure. Starverse should not handwrite native adapters for every vendor.

| Strategy | Requirement |
|---|---|
| Default long-tail path | Generic OpenAI-compatible Chat Completions endpoint。 |
| Provider-specific extension | ProviderProfile + ProviderQuirks。 |
| Capability confidence | conservative defaults, health/basic stream probe, user override with warning。 |
| Catalog maintenance | Models.dev enrichment/reference may reduce manual catalog work; endpoint availability remains endpoint-native/probed/manual。 |
| UI contract | custom endpoint UX should ask for baseURL, model id, credential ref, profile id, capability declaration, and safe error display。 |
| Native adapter threshold | only when provider semantics cannot be preserved by compatibility + profile/quirks and has clear product value。 |

---

## 11. Legacy removal strategy

旧路径不作为目标架构输入。目标架构只接收 legacy surfaces 的迁移分类：migrated、isolated、deprecated-for-removal、removed。

| Legacy surface | Target handling |
|---|---|
| Misleading README/docs/UI claims | stop implying Gemini active runtime; mark historical/legacy/future rebuild only。 |
| `activeProvider: 'Gemini'` | migration-only; not runtime selection input。 |
| `geminiApiKey` | migration-read-only; no runtime role。 |
| Gemini constants/dependencies/remnants | inventory as deprecated-for-removal; remove when migration safety confirmed or native adapter replaces them。 |
| OpenRouter renderer key/baseURL access | legacy exception; migrate to main/secure credential boundary。 |
| OpenRouter raw schema as app-wide schema | contain inside OpenRouter adapter/facade; expose Starverse IR externally。 |

Gemini future support must be rebuilt through Gemini API / Google AI Studio native adapter. Old Gemini path must not be revived.

---

## 12. 外部方案取舍

| 选择 | 决策 |
|---|---|
| Direct AI SDK contract | 不采用。AI SDK 可作 adapter 内部实现细节。 |
| OpenAI SDK / provider SDK | 可在 adapter 内部使用；输出必须是 Starverse IR。 |
| OpenCode runtime | 不引入。只借鉴 provider config/catalog/local endpoint 思路。 |
| Models.dev | enrichment/reference；不作为 endpoint availability SOT。 |
| LibreChat / Open WebUI / LobeChat | 借鉴 chat product endpoint/provider/model picker setting 经验；不复制 deployment/server 架构。 |
| Continue.dev | 借鉴配置化 provider/local endpoint 经验；不引入 coding workflow。 |
| AnythingLLM | 借鉴本地模型与文档聊天 provider 配置经验；不把 RAG/workspace 作为主线。 |
| LangChain / LlamaIndex | 参考 integration ecosystem 和非标准字段风险；不作为 runtime core。 |
| LLM-Rosetta | 参考 hub-and-spoke IR 思路；不绑定外部实现。 |

---

## 13. 目标架构风险

| 风险 | 控制 |
|---|---|
| abstraction overreach | 只为真实行为、目标 provider 语义或当前阶段需求建 IR。 |
| placeholder abstraction | 禁止无人调用、无测试、无 OpenRouter bridge 的 interface/registry/manager/service 进入 source。 |
| premature managed local runtime | LocalEndpoint 先行；ManagedLocalRuntime 只保留边界。 |
| OpenAI-compatible overclaim | Generic endpoint 只承诺最低能力；高级能力 profile/probe/override。 |
| provider raw schema leakage | raw 只在 adapter/diagnostic/persistence raw 区；UI/DB/Send Plan 使用 Starverse IR。 |
| credential leakage | 新 provider secrets 只在 main/secure boundary；renderer 只见 masked metadata。 |
| catalog/runtime confusion | CatalogSourceAdapter 与 RuntimeProviderAdapter 分离命名和职责。 |
| reasoning roundtrip corruption | adapter/profile 决定 reasoning opaque artifact 回传；UI 不拼接。 |
| Send Plan capability mismatch | Send Plan 消费 RuntimeCapability。 |
| legacy path persistence | legacy-removal checklist 随阶段执行；旧 Gemini 不复用。 |
| product scope creep | Starverse 保持 chat app；不进入 Agent/RAG/coding workflow platform。 |
