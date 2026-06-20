# Provider Experimental Text Chat Closeout

Date: 2026-06-21
Task status: phase closeout / documentation only
Current HEAD reviewed: `ec44b4d51a39d6b61595e9feeb9387c8e8cfaf3c`
Scope: current provider text-chat paths, smoke evidence, debt, graduation criteria, and next options

This document closes out the current experimental provider text-chat phase. It is not a production graduation decision, does not add provider capabilities, and does not introduce a `RuntimeProviderRegistry`, `EndpointRegistry`, `ProviderRegistry`, secure store, Send Plan `RuntimeCapability` integration, DB migration, or new runtime behavior.

Related SSOT:

- `STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md`
- `STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md`
- `STARVERSE_PROVIDER_EVOLUTION_PATH.md`
- `PROVIDER_C6_LOCAL_ENDPOINT_INVESTIGATION.md`
- `PROVIDER_C5_ENDPOINT_REGISTRY_INVESTIGATION.md`
- `OPENROUTER_C3_CLOSEOUT_AND_C4_EXPOSURE_INVESTIGATION.md`

---

## 1. Current Provider Status

| Provider path | Classification | Runtime route | User enablement | Scope | Status |
|---|---|---|---|---|---|
| OpenRouter | Default production runtime | `streamViaOpenRouterAsDomainEventsWithLegacyStoreCredentialSource` through the existing OpenRouter bridge | Default when all experimental modes are disabled | Full existing OpenRouter behavior | Production default unchanged |
| LocalEndpoint | Experimental text-only | `streamLocalEndpointTextChatAsDomainEvents` through `local-endpoint-chat:*` IPC | Console checkbox, loopback URL, manual model id | Loopback OpenAI-compatible text streaming only | Default-off experimental |
| OpenAI Responses | Experimental text-only native | `streamOpenAIResponsesTextChatAsDomainEvents` through `openai-responses-chat:*` IPC | Settings credential/model + Console checkbox | Native Responses text streaming only | Default-off experimental |
| Google AI Studio | Experimental text-only native | `streamGoogleAIStudioTextChatAsDomainEvents` through `google-ai-studio-chat:*` IPC | Settings credential/model + Console checkbox | Native Gemini API text streaming only | Default-off experimental |
| Anthropic Messages | Experimental text-only native | `streamAnthropicTextChatAsDomainEvents` through `anthropic-chat:*` IPC | Settings credential/model + Console checkbox | Native Anthropic Messages text streaming only | Default-off experimental |
| DeepSeek official | Experimental text-only official profile | `streamDeepSeekTextChatAsDomainEvents` through `deepseek-chat:*` IPC | Settings credential/model + Console checkbox | DeepSeek official profile text streaming only | Default-off experimental |
| Generic OpenAI-compatible | Fixture-only | `src/next/provider/generic/*` tests and fixture boundaries | Not exposed in UI/settings/live send | Conservative compatibility adapter pressure | Non-live |

Current source evidence:

- `src/ui-app/app/appChatApp.logic.ts` owns the current horizontal experimental send branches, localStorage flags, mutual exclusion, block reasons, and fallback to OpenRouter.
- `src/ui-app/components/ChatSessionConsole.vue` owns the explicit experimental enable/disable controls.
- `src/ui-app/components/SettingsPanel.vue` owns provider-specific credential/model setup for OpenAI Responses, Google AI Studio, Anthropic, DeepSeek, and LocalEndpoint diagnostics/model defaults.
- `electron/preload.ts` exposes provider-specific credential/chat bridges, not a generic secret or provider registry bridge.
- `electron/ipc/storeIpc.ts` blocks renderer generic store access to credential-bearing keys.
- `scripts/smoke/provider-text-chat-smoke.mjs` exercises the current provider text-chat matrix through the real Electron app.

---

## 2. Production Vs Experimental Classification

OpenRouter is still the only production provider path. It remains the default route when no experimental mode is enabled.

The other five text-chat paths are experimental:

- they are default-off;
- they are enabled explicitly in Console;
- they are mutually exclusive in the current UI flow;
- they are reversible through disable/clear controls;
- they use the normal composer/transcript flow for text-only messages;
- they do not publish their model ids into the main model picker;
- they do not change OpenRouter request body, SSE parsing, reasoning, tools, usage, web/file behavior, error envelopes, or terminal stream semantics.

Generic OpenAI-compatible remains non-live. The experimental official provider paths do not route through Generic live runtime.

---

## 3. Credential Boundary Status

OpenRouter still uses legacy electron-store backing, but C3/C4 moved active OpenRouter credential resolution into main-process resolver-backed paths and blocked renderer generic-store raw read-back for legacy credential keys.

The experimental credential-bearing providers use provider-specific one-way update IPC:

| Provider | Store key | Renderer read-back | Main-process use | Notes |
|---|---|---|---|---|
| OpenRouter | `openRouterApiKey`, `openRouterBaseUrl` | masked metadata only through `openrouter-credential:*` | legacy-store resolver constructs Authorization/base URL in main process | Not secure store |
| OpenAI Responses | `openAIResponsesApiKey` | masked status only | main process constructs provider auth | Native Responses path |
| Google AI Studio | `googleAIStudioApiKey` | masked status only | main process constructs Gemini API auth | Does not reuse `geminiApiKey` |
| Anthropic Messages | `anthropicApiKey` | masked status only | main process sends `x-api-key` | Thinking/signature not surfaced |
| DeepSeek official | `deepSeekApiKey` | masked status only | main process sends `Authorization: Bearer` | `reasoning_content` not surfaced |
| LocalEndpoint | none in current text-chat slice | no credential API | no auth headers, loopback only | No local admin token support |

Renderer may transiently hold a user-entered API key while submitting it through provider-specific update IPC. Renderer must not read raw keys back through store IPC, preload, diagnostics, logs, stream events, or snapshots.

This phase is not secure-store completion. OS keychain, encrypted credential storage, credential migration out of electron-store, credential rotation, and cross-provider credential records remain deferred.

---

## 4. UI Entry Points

Settings Panel:

- OpenRouter credential status/update/clear through masked metadata and one-way update.
- LocalEndpoint diagnostics and model/default URL setup for experimental text chat.
- OpenAI Responses, Google AI Studio, Anthropic, and DeepSeek API key status/update/clear plus manual model id defaults.
- Settings writes model/default preferences but does not enable experimental chat by itself.

Chat Console:

- Explicit checkboxes enable one experimental mode at a time.
- Disable keeps settings but returns send flow to OpenRouter.
- Clear removes that experimental mode's local settings.
- Provider status text marks modes as experimental, text-only, and not OpenRouter.

Composer/transcript:

- Experimental providers use the normal text composer and transcript rendering path.
- Attachments, web search, reasoning controls, image generation, tools, structured output, and file support are blocked or out of scope for experimental providers.
- OpenRouter remains the fallback/default when all experimental modes are disabled.

Model picker:

- Experimental provider model ids are not inserted into the main model picker.
- OpenRouter catalog/model selection remains the production model-picker path.

---

## 5. Smoke And Test Evidence

Current automated smoke matrix:

- Script: `scripts/smoke/provider-text-chat-smoke.mjs`
- Dry run: `node scripts/smoke/provider-text-chat-smoke.mjs`
- Real Electron UI matrix: `node scripts/smoke/provider-text-chat-smoke.mjs --ui --build-electron`

The matrix uses deterministic mocks:

- OpenRouter: loopback mock endpoint through the real OpenRouter IPC/credential path.
- LocalEndpoint: loopback OpenAI-compatible mock endpoint through the real LocalEndpoint IPC path.
- OpenAI Responses, Google AI Studio, Anthropic, and DeepSeek: provider-specific chat IPC channels with temporary main-process smoke handlers.

The matrix verifies:

- the real app launches;
- OpenRouter is the default route at baseline and after experimental clear/disable;
- each experimental provider can be enabled explicitly;
- a text prompt streams into the normal transcript;
- Stop/abort is observed for each provider path;
- experimental provider models do not appear in the main model picker;
- provider API keys, `Authorization`, `Bearer`, and custom secret header markers do not appear in renderer-visible output;
- no real provider API calls or secrets are required.

Latest closeout evidence for this phase:

- `node --check scripts/smoke/provider-text-chat-smoke.mjs` passed.
- `node scripts/smoke/provider-text-chat-smoke.mjs` passed.
- `node scripts/smoke/provider-text-chat-smoke.mjs --ui` passed for all six provider paths.
- `src/next/provider/providerEndpointRegistryBaseline.test.ts` remains the source guard for no production registry placeholder / Generic fixture-only / C6 baseline claims.

---

## 6. Known Architecture Debt

The current implementation is intentionally pragmatic and should not be mistaken for the target runtime architecture.

Known debt:

- `appChatApp.logic.ts` has horizontal experimental provider branches and per-provider storage/update/send functions.
- The experimental send priority is hardcoded in `onSend()`: DeepSeek, Anthropic, Google AI Studio, OpenAI Responses, LocalEndpoint, then OpenRouter fallback.
- There is no formal `RuntimeProviderRegistry`, `EndpointRegistry`, or `ProviderRegistry` source abstraction.
- There is no provider-neutral runtime dispatch facade beyond the current app-level branching.
- Credential material still uses legacy electron-store backing; secure store / OS keychain is not implemented.
- Non-OpenRouter providers have no `RuntimeCapability` / Send Plan integration.
- Experimental providers are text-only and do not support files, tools, web search, image generation, structured output, or provider-specific reasoning persistence.
- OpenRouter still does not conform to a formal `RuntimeProviderStreamAdapter` source contract.
- Model picker remains OpenRouter-first and does not represent endpoint/profile/model availability for experimental providers.
- Usage accounting, cost reporting, advanced error diagnostics, and provider-native reasoning/tool artifacts are not production-complete for experimental providers.

These debts are acceptable for the experimental phase because the paths are default-off, explicit, reversible, text-only, and covered by smoke/source guards.

---

## 7. Graduation Criteria

Before any experimental provider can graduate toward production, the Owner should require:

1. Provider-specific production scope approved: supported models, regions/endpoints, auth shape, text/non-text feature set, and rollback policy.
2. OpenRouter regression evidence: default OpenRouter behavior remains unchanged.
3. Credential boundary evidence: no renderer raw key read-back; store IPC and preload remain provider-specific and secret-safe.
4. Capability boundary: `RuntimeCapability` is defined for the provider before file/tool/web/reasoning/Send Plan features are enabled.
5. Model availability boundary: model picker integration is based on endpoint/profile/model availability, not ad hoc localStorage model ids.
6. Error/usage/reasoning policy: safe user-visible errors, provider-native reasoning/tool artifacts, usage accounting, and redaction are specified.
7. Smoke and regression coverage: real or mocked provider-specific smoke covers send, stream, stop, errors, and clear/disable rollback.
8. Legacy classification: any replaced credential/settings/runtime surface is classified as migrated, isolated, deprecated-for-removal, or removed.

Graduation must not happen by merely flipping an experimental flag. It requires a separate Owner-approved implementation package.

---

## 8. Blockers Before Production Graduation

Blockers common to all experimental providers:

- no formal runtime dispatch boundary yet;
- no production endpoint/provider registry;
- no secure store / OS keychain;
- no Send Plan `RuntimeCapability` integration;
- no model picker availability model for non-OpenRouter providers;
- no production UX for provider selection beyond experimental Console controls;
- no provider-specific production observability and rollback gate;
- no file/tool/web/image/reasoning production support;
- no production usage/cost accounting guarantee for non-OpenRouter providers.

Provider-specific blockers:

- LocalEndpoint: remains loopback-only, no credentials/admin tokens, no managed runtime, no remote custom endpoint or enterprise gateway.
- OpenAI Responses: reasoning items, hosted tools, file inputs, previous-response continuation, and usage semantics are not production-integrated.
- Google AI Studio: native Gemini advanced features and old Gemini removal strategy remain deferred.
- Anthropic Messages: thinking/signature/tool-use persistence and continuation remain deferred.
- DeepSeek official: `reasoning_content` display/persistence and DeepSeek parameter/quirk policy remain deferred.

---

## 9. Guidance For Next Work

Do not add a `RuntimeProviderRegistry`, `EndpointRegistry`, or `ProviderRegistry` as a placeholder. A registry source object should enter only when it is directly exercised by behavior or tests and removes real branching or enables a scoped production gate.

Do not graduate any provider in a documentation or smoke-only task.

Do not change production behavior while closing out this phase.

Recommended next implementation options:

| Option | First task type | Why next | Runtime behavior change |
|---|---|---|---|
| Provider runtime dispatch decision package | docs/planning | Decide how to replace horizontal app-level branches without placeholder registry overreach | No |
| Secure store / OS keychain decision package | docs/planning + later implementation | Remove legacy electron-store credential backing | No in planning; yes in later migration |
| RuntimeCapability / Send Plan investigation | docs/test characterization | Define how non-OpenRouter providers can safely support files/tools/web/reasoning later | No |
| Experimental provider production-candidate audit | test/docs | Pick one provider and define production blockers, smoke, and rollback gates | No |
| Old Gemini removal inventory | docs/test/source guard | Remove or further isolate legacy Gemini remnants now that Google AI Studio native exists | No initially |
| Stop provider architecture temporarily | planning | Current experimental phase is coherent; another product slice may be higher priority | No |

Conservative recommendation: do not create a registry yet. First produce a runtime dispatch decision package that chooses between keeping the current explicit branches until one provider graduates, introducing a behavior-backed dispatch facade, or deferring registry work until `RuntimeCapability` and model availability are ready.

---

## 10. Explicit Non-Goals

This closeout does not:

- add provider capabilities;
- change send routing;
- add `RuntimeProviderRegistry`, `EndpointRegistry`, or `ProviderRegistry` source abstractions;
- change credential storage behavior;
- add secure store / OS keychain migration;
- change Send Plan behavior;
- add DB migrations;
- touch DFC / LibreOffice;
- add file/tool/reasoning/image/web/search support to experimental providers;
- activate Generic OpenAI-compatible live runtime;
- make any experimental provider the default;
- turn Starverse into an Agent/RAG/coding workflow platform.
