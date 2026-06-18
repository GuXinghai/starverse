# Provider C6 LocalEndpoint Investigation

Date: 2026-06-18
Task status: C6 investigation plus implementation checkpoints; experimental LocalEndpoint text-only chat exists
Current HEAD reviewed: `cb74afc15f4edaf9da3ff9de6cd15b42342fe77b`
Scope: external LocalEndpoint support investigation and checkpoints for LM Studio, Ollama, LocalAI, llama.cpp server, and custom local OpenAI-compatible endpoint
Explicit non-goal: no production LocalEndpoint runtime, no remote custom endpoint activation, no enterprise gateway activation, no managed local runtime, no production endpoint/provider registry implementation

This document originally scoped C6 after the C3/C4/C5 provider architecture work. It now also records accepted C6 checkpoints. It must not be read as proof that LocalEndpoint is a production runtime, Generic live runtime, endpoint registry, provider registry, secure store, DB migration, Send Plan `RuntimeCapability` integration, remote custom endpoint support, enterprise gateway support, or local model process management exists.

Related:

- `STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md`
- `STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md`
- `STARVERSE_PROVIDER_EVOLUTION_PATH.md`
- `PROVIDER_C5_ENDPOINT_REGISTRY_INVESTIGATION.md`
- `PROVIDER_CREDENTIAL_BOUNDARY_PLAN.md`
- `OPENROUTER_C3_CLOSEOUT_AND_C4_EXPOSURE_INVESTIGATION.md`

---

## 1. Current Baseline And Gaps

### 1.1 Active Runtime Baseline

OpenRouter remains the only active production runtime.

Current active chat/send facts:

- `src/ui-app/app/appChatApp.logic.ts` invokes `streamViaOpenRouterAsDomainEventsWithLegacyStoreCredentialSource`.
- `src/next/provider/openrouter/openRouterAdapter.ts` sets `credentialSource: 'legacy_store'`.
- `src/next/live/openRouterLiveStream.ts` sends `credentialSource: 'legacy_store'` through the main-process bridge and omits renderer raw `apiKey` / `baseUrl` from the active IPC payload.
- `electron/ipc/openRouterStreamBridge.ts` resolves OpenRouter API key and base URL from the legacy-store resolver path and constructs Authorization in main process.
- OpenRouter request body, SSE parsing, reasoning, tool, usage, web/file, error envelope, and terminal stream behavior remain OpenRouter-specific.

C6 must not change this path while it is only an investigation.

### 1.2 Generic OpenAI-Compatible Fixture Baseline

Generic OpenAI-compatible is still fixture-only.

Current Generic facts:

- `src/next/provider/generic/genericEndpointConfig.ts` defines a fixture-only `GenericEndpointConfig`.
- `toGenericEndpointFixtureMetadata` projects a non-secret fixture shape with `kind: 'generic_endpoint_fixture'`, `fixtureOnly: true`, and `rendererVisible: false`.
- Generic config and descriptor tests reject raw secret fields, URL userinfo, query secrets, malformed credential refs, and high-risk capability enablement.
- `src/next/provider/generic/genericAdapter.ts` keeps Generic fixture behavior conservative and fails before fetch for unsupported high-risk requests.
- Generic is not imported by SettingsPanel, preload, OpenRouter active runtime, catalog startup, or active send routing.

C6 can use Generic fixture behavior as design pressure, but it must not activate Generic live runtime without an Owner-approved gate.

### 1.3 Endpoint Metadata / Settings / IPC Baseline

C5 introduced OpenRouter-only endpoint metadata, not a generic registry.

Current endpoint/settings facts:

- `electron/ipc/openRouterCredentialSettingsIpc.ts` returns renderer-safe OpenRouter endpoint metadata through `openrouter-credential:get-status`.
- The metadata distinguishes `openrouter-official` and `openrouter-custom-legacy-store`, is backed by legacy-store state, and includes non-secret credential refs.
- `electron/preload.ts` exposes only the OpenRouter-specific `window.openRouterCredential` bridge plus the filtered generic store bridge.
- `electron/ipc/storeIpc.ts` blocks renderer generic store get/set/delete for credential-bearing legacy keys.
- `src/ui-app/components/SettingsPanel.vue` consumes OpenRouter credential/endpoint metadata and does not expose endpoint picker, profile picker, Generic endpoint settings, or arbitrary endpoint CRUD.

C6 must not add preload/store/settings behavior unless a later implementation slice explicitly authorizes it.

### 1.4 Model Catalog / Availability / Capability Baseline

The catalog layer is OpenRouter-first and should not be confused with runtime registry.

Current catalog/capability facts:

- `src/shared/modelCatalog/internalSchema.ts` has a catalog `ProviderAdapter` interface for list/sync/enrich operations. It is a catalog source adapter, not a runtime provider registry.
- `src/shared/modelCatalog/openRouterCatalogClient.ts` implements OpenRouter catalog `listModels`, provider counts, and model endpoint detail mapping.
- `src/shared/modelCatalog/catalogSyncJob.ts` stores OpenRouter catalog models, tags, endpoint details, pricing, and capabilities.
- `src/next/modelCatalog/catalogQueryService.ts` and `src/next/modelCatalog/modelDetailService.ts` expose catalog query/detail views.
- `src/shared/modelCatalog/modelTagger.ts` derives capability tags such as vision, tools, reasoning, structured outputs, and long context from catalog metadata.

There is no LocalEndpoint model inventory, endpoint-native `listModels` ingestion, health cache, probed model availability record, or RuntimeCapability resolver connected to LocalEndpoint today.

### 1.5 Send Plan Capability Touchpoint Baseline

Send Plan remains tied to current OpenRouter behavior.

Current Send Plan facts:

- `src/shared/files/sendPlanTypes.ts` defines send plan inputs, attachment plans, and provider context shapes.
- `src/next/files/sendPlanClient.ts` calls the current Send Plan bridge.
- `src/next/openrouter/openRouterSendPlanSerializer.ts` and `src/next/openrouter/openRouterSendPreparation.ts` serialize current send plans into OpenRouter request material.
- There is no LocalEndpoint-aware RuntimeCapability resolver feeding Send Plan.

C6 must treat Send Plan integration as a later gate. LocalEndpoint investigation can define capability inputs, but it must not wire LocalEndpoint into Send Plan or change current attachment behavior.

### 1.6 Main Gaps Before C6 Implementation

Open gaps:

- no LocalEndpoint settings model;
- no LocalEndpoint health probe;
- no endpoint-native `listModels` probe or model availability cache;
- no basic stream probe harness for external endpoints;
- no local/remote/enterprise endpoint kind implementation;
- no renderer-safe LocalEndpoint metadata bridge;
- no main-process credential/admin-token boundary for local or enterprise endpoints;
- no RuntimeCapability resolver for endpoint/profile/probe results;
- no Send Plan capability consumption;
- no rollback/disable path for failed LocalEndpoint experiments.

---

## 2. Proposed LocalEndpoint Product Slice

C6 should support user-configured external endpoints that are already running outside Starverse.

The product slice should cover:

- LM Studio OpenAI-compatible local server;
- Ollama OpenAI-compatible or native-adjacent local server mode, if the selected profile supports it;
- LocalAI OpenAI-compatible local server;
- llama.cpp server OpenAI-compatible mode;
- custom local OpenAI-compatible endpoint;
- enterprise OpenAI-compatible gateway reachable over a private or corporate network.

The slice should be connection-first:

- user supplies endpoint display name, base URL, profile, model id or model discovery mode, and optional credential/admin token ref;
- Starverse stores only non-secret renderer-safe endpoint metadata outside the credential boundary;
- main process resolves credential material and performs probes;
- LocalEndpoint starts disabled or untrusted until health/probe succeeds;
- capabilities default to conservative text/basic streaming/basic error until probes or explicit Owner-approved profiles prove more.

The slice should not manage model files, launch local model processes, download models, choose GPU/CPU/offload settings, or supervise local runtime lifecycle.

---

## 3. Endpoint Kinds

### 3.1 Local Endpoint

Definition:

- an endpoint on localhost, loopback, LAN, or user-provided local network address;
- backed by an external service such as LM Studio, Ollama, LocalAI, llama.cpp server, or a custom OpenAI-compatible server;
- managed by the user or another application, not by Starverse.

Required metadata:

- endpoint id;
- display name;
- endpoint kind `local`;
- locality `local` or `lan`;
- base URL as sanitized endpoint metadata;
- profile id;
- model id or discovery mode;
- credential/admin token ref if needed;
- health/probe status;
- conservative capability summary.

Main risk:

- local endpoints vary widely in protocol fidelity and capability claims. Starverse must not assume full OpenAI compatibility.

### 3.2 Remote Custom Endpoint

Definition:

- a user-configured remote OpenAI-compatible endpoint that is not the built-in OpenRouter endpoint;
- may represent a hosted custom deployment or another provider's compatibility endpoint.

Required metadata:

- endpoint id;
- display name;
- endpoint kind `remote_custom`;
- sanitized base URL;
- profile id;
- credential ref;
- conservative capabilities and probe status.

Main risk:

- remote custom endpoints can look OpenAI-compatible but diverge on errors, usage, tools, reasoning, streaming, and file support.

### 3.3 Enterprise Gateway

Definition:

- a corporate or organization-managed OpenAI-compatible gateway;
- may proxy multiple upstream vendors or enforce custom auth, headers, audit, and routing policy.

Required metadata:

- endpoint id;
- display name;
- endpoint kind `enterprise_gateway`;
- sanitized base URL or host;
- profile id;
- credential ref and optional secret header refs;
- organization-safe display metadata;
- gateway route/upstream diagnostics if available and safe.

Main risk:

- enterprise gateways often require custom headers, tokens, or tenant routing. Those values must remain main-process-only credential material.

---

## 4. Conservative Capability Defaults

LocalEndpoint and custom OpenAI-compatible endpoints should start with the minimum safe capability set:

| Capability | Default | Reason |
|---|---:|---|
| text chat | enabled | Minimum product value for an OpenAI-compatible endpoint. |
| basic messages | enabled | Needed for ordinary chat requests. |
| streaming text | probe-required | Many endpoints stream, but stream shape varies. |
| basic HTTP error | enabled | Safe to surface as normalized errors after redaction. |
| sampling params | conservative | Temperature/top-p style params may be supported but should remain profile-gated. |
| tools/function calling | disabled | Tool delta and call semantics vary. |
| files/PDF/vision/multimodal | disabled | Send Plan must not assume support. |
| reasoning | disabled | Local endpoints often emit plain text, not structured reasoning. |
| web search/provider-hosted tools | disabled | External local endpoints should not gain hosted tools by default. |
| structured output | disabled | Schema support and error semantics vary. |
| image/audio/video generation | disabled | Not part of the basic local chat slice. |
| usage final guaranteed | disabled | Many endpoints omit stable usage. |

Capability escalation should require one of:

- endpoint-specific profile evidence;
- successful targeted probe with recorded source/confidence/time;
- explicit user override with warning and confidence;
- later Owner-approved profile/quirks support.

Generic fixture tests already prove similar conservative defaults. C6 should reuse the policy direction, not activate Generic live behavior automatically.

---

## 5. Probe Plan: Health, List Models, Basic Stream

### 5.1 Health Probe

Goal:

- verify the endpoint is reachable and responds within a bounded timeout;
- classify connection errors without exposing raw URL credentials, headers, local paths, or admin tokens.

Inputs:

- endpoint id;
- sanitized base URL;
- profile id;
- credential ref if required;
- timeout policy;
- probe id/correlation id.

Outputs:

- `healthy`, `unreachable`, `auth_required`, `auth_failed`, `timeout`, `invalid_response`, or `unknown`;
- safe message;
- redacted HTTP status if available;
- timestamp and duration;
- no raw request headers or secret material.

### 5.2 List Models Probe

Goal:

- discover endpoint-reported model ids when the endpoint supports model listing;
- attach source/confidence/timestamp to ModelAvailability without claiming catalog authority.

Rules:

- model ids are endpoint-local availability observations;
- unknown or unsupported listModels is not fatal if manual model id is configured;
- provider/gateway display names should not be inferred from untrusted model ids;
- returned metadata must be redacted and bounded in size.

### 5.3 Basic Stream Probe

Goal:

- confirm a minimal text-only streaming request can produce parseable text deltas or a safe terminal error.

Probe shape:

- single short user message;
- selected configured model id;
- no tools;
- no files;
- no web search;
- no reasoning request;
- no structured output;
- low timeout;
- abort cleanup.

Outputs:

- `streaming_text_confirmed` true/false;
- normalized safe event summary;
- error category if failed;
- no raw response body in renderer-visible diagnostics.

### 5.4 Probe Safety Requirements

All probes must:

- run in main process or provider boundary;
- resolve credentials through refs;
- redact Authorization, Bearer values, secret headers, URL userinfo, query secrets, and local admin tokens;
- bound stdout/body/log snippets if any are collected;
- support cancellation and timeout;
- avoid writing request/response bodies to durable logs unless explicitly redacted.

---

## 6. Model Availability And RuntimeCapability Implications

C6 should treat LocalEndpoint model availability as endpoint-specific and lower-confidence than OpenRouter catalog data.

Recommended model availability fields:

- endpoint id;
- profile id;
- model id;
- source `endpoint_probe`, `manual`, or `user_override`;
- availability status;
- observed timestamp;
- confidence;
- safe warning list.

RuntimeCapability should be computed from:

- endpoint kind;
- provider profile;
- transport dialect;
- model availability;
- probed capability;
- user override;
- adapter support;
- Send Plan attachment requirements.

Rules:

- probed local capability should not override adapter limitations;
- user override can disable a capability immediately;
- user override enabling high-risk capabilities should show warnings and require explicit acceptance;
- Send Plan should consume only final RuntimeCapability once a later implementation phase wires it;
- until that wiring exists, LocalEndpoint must not alter Send Plan behavior.

Open questions:

- whether LocalEndpoint model availability should share catalog tables or use a separate endpoint-probe cache;
- whether manual model ids should appear in ModelPicker before any successful probe;
- how stale probe data should expire;
- how to represent enterprise gateway upstream routing without leaking organization-specific identifiers.

---

## 7. Renderer Metadata And Main-Process Secret Boundary

Renderer-visible LocalEndpoint metadata may include:

- endpoint id;
- display name;
- endpoint kind;
- sanitized base URL display value or host;
- profile id;
- locality;
- enabled/disabled state;
- health summary;
- model availability summary;
- conservative capability summary;
- credential configured/missing status;
- safe warning messages.

Renderer-visible metadata must not include:

- raw API key;
- Authorization value;
- Bearer token;
- custom secret header;
- enterprise token;
- local admin token;
- URL userinfo;
- query secrets;
- raw provider error body;
- full raw request body;
- sensitive local path or local service logs.

Main-process-only material should include:

- credential tokens;
- secret headers;
- admin tokens;
- probe request headers;
- raw upstream error bodies before redaction;
- any local endpoint security-sensitive diagnostics.

C6 should reuse the C4/C5 principle: renderer receives safe metadata and sends credential material one-way through provider-specific IPC only after an Owner-approved implementation task. This investigation does not add that IPC.

---

## 8. Safe Error Display And Redaction

LocalEndpoint errors should be normalized before reaching renderer.

Required categories:

- invalid endpoint URL;
- connection refused;
- timeout;
- TLS/certificate failure;
- auth required;
- auth failed;
- unsupported listModels;
- invalid model id;
- invalid stream response;
- provider error;
- probe aborted;
- unknown.

Redaction requirements:

- remove URL userinfo and query values;
- remove Authorization/Bearer values;
- remove secret headers and admin tokens;
- bound raw response snippets;
- avoid full local paths in renderer-visible diagnostics;
- use static safe messages for credential resolver/store failures;
- record raw details only in redacted diagnostic channels if a later implementation needs them.

User-facing errors should be actionable but conservative. Example:

- "Endpoint is reachable but returned an unsupported streaming response."
- "Endpoint requires authentication. Configure credentials and retry."
- "Model list is unavailable. You can enter a model id manually if the endpoint supports chat completions."

---

## 9. Rollback And Disable Strategy

C6 implementation slices should be independently reversible.

Required rollback controls:

- global feature flag or Owner gate for LocalEndpoint UI exposure;
- per-endpoint enabled/disabled state;
- probe failure should disable only the endpoint/probe result, not OpenRouter;
- no migration should delete OpenRouter legacy-store backing;
- no Generic live activation as fallback;
- OpenRouter active runtime remains available if LocalEndpoint is disabled;
- stored endpoint metadata should be removable without DB repair if the implementation uses a store-backed interim model.

Disable behavior:

- disabled LocalEndpoint should not appear as active send target;
- disabled LocalEndpoint probes should not run automatically;
- disabled LocalEndpoint model availability should not satisfy Send Plan;
- diagnostics should explain disabled state without secret details.

---

## 10. Recommended C6 Implementation Slices

### C6a: LocalEndpoint Baseline Characterization (completed before implementation)

Goal:

- prove no LocalEndpoint production runtime exists before implementation;
- prove Generic remains fixture-only;
- prove no endpoint/provider/runtime registry placeholder is introduced;
- inventory current OpenRouter, Generic, catalog, SettingsPanel, preload, and Send Plan touchpoints.

Expected changes:

- tests/source guards and a docs checkpoint only;
- no production behavior change.

C6a historical checkpoint:

- source guards locked the pre-implementation baseline that OpenRouter was the only active runtime at that time;
- Generic OpenAI-compatible remains fixture-only and outside live/UI/preload/catalog startup surfaces;
- no LocalEndpoint runtime, settings bridge, health probe, listModels probe, basic stream probe, or Send Plan integration existed yet at the C6a baseline;
- renderer-visible surfaces do not expose local admin tokens, enterprise tokens, custom secret headers, generic credential resolver, or generic secret store;
- no production endpoint/provider/runtime registry placeholder has been introduced.

### C6b: LocalEndpoint Non-Secret Metadata Shape

Goal:

- introduce a behavior-backed, non-secret LocalEndpoint metadata shape only if consumed by a test/settings-safe read model;
- keep it disabled and not send-capable;
- keep credentials as refs only.

Acceptance pressure:

- no endpoint CRUD beyond metadata draft if not consumed;
- no Generic live activation;
- no renderer secret exposure.

C6b diagnostics MVP checkpoint:

- a user-visible LocalEndpoint diagnostics-only surface exists in SettingsPanel;
- users can enter a localhost URL and manually run model-list and basic stream diagnostics probes;
- the main-process probes accept only localhost / loopback URLs, reject public remote hosts, reject embedded URL credentials, do not follow redirects to public remote targets, and send no API key, Authorization header, custom header, enterprise token, or local admin token;
- probe diagnostics can classify OpenAI-compatible `/v1/models` and Ollama `/api/tags` model-list responses when available;
- stream diagnostics can classify minimal OpenAI-compatible SSE text delta evidence and Ollama NDJSON text delta evidence when a model is available from model listing;
- renderer-visible diagnostics are redacted and include only reachability, inferred endpoint family, safe base URL, model-list summary, safe error text, and conservative capability summary;
- LocalEndpoint remains unavailable for chat send, discovered models are not added to the main model picker, Generic live runtime remains disabled, and no provider/runtime registry source abstraction has been introduced.

C6c experimental text chat checkpoint:

- an explicit experimental LocalEndpoint text chat mode exists in the normal chat UI controls;
- the mode is loopback-only and accepts localhost / 127.0.0.1 / ::1 / accepted loopback IPv6-mapped forms through the same local endpoint URL validation boundary used by diagnostics;
- the first chat path supports only OpenAI-compatible `/v1/chat/completions` with manual endpoint URL, manual model id, text-only user/assistant messages, and basic streaming text deltas;
- the main-process chat IPC sends no API key, Authorization header, custom header, enterprise token, or local admin token, and it rejects public remote hosts and embedded URL credentials before fetch;
- renderer-visible errors and IPC diagnostics remain static/redacted and must not include raw secret material, Bearer values, Authorization values, URL userinfo, or query secrets;
- attachments, web search, tools, image generation, reasoning controls, structured output, and Send Plan capability expansion remain unsupported for LocalEndpoint text chat and must be blocked or ignored conservatively;
- LocalEndpoint models are not added to the main model picker, Generic live runtime remains disabled, OpenRouter remains the default unchanged runtime, and no ProviderRegistry / EndpointRegistry / RuntimeProviderRegistry source abstraction has been introduced.

### C6c: Main-Process Probe Harness, Default-Off

Goal:

- add default-off health/listModels/basic stream probe helpers with injected fetch and credential resolver;
- verify redaction, timeout, abort, and safe result shapes;
- keep probes out of active send and UI until Owner approval.

Acceptance pressure:

- test with fixtures, not live endpoints by default;
- no persistent model availability unless separately approved.

### C6d: LocalEndpoint Settings Gate

Goal:

- add gated UI/settings entry only after C6b/C6c are accepted;
- display safe metadata, health, and model availability;
- allow one-way credential update if credentials are required;
- keep endpoint disabled by default until probes pass.

Acceptance pressure:

- no endpoint picker/profile picker that can route active send unless Owner approves live gate;
- no broad settings redesign.

### C6e: Production LocalEndpoint Gate

Goal:

- decide whether the experimental LocalEndpoint text-only path can advance beyond default-off experimental status after probes, capability policy, rollback, and Send Plan implications are accepted.

Acceptance pressure:

- text-only basic streaming first;
- fail before fetch for unsupported high-risk features;
- no file/tool/reasoning/web/search support by default;
- OpenRouter behavior unchanged.

---

## 11. Explicit Non-Goals

C6 investigation does not include:

- managed local runtime;
- model process lifecycle management;
- model download;
- GPU/CPU/offload controls;
- full provider marketplace;
- Generic live activation before Owner gate;
- endpoint CRUD;
- endpoint picker or profile picker;
- production EndpointRegistry / ProviderRegistry / RuntimeProviderRegistry source implementation;
- secure store, OS keychain, or encrypted credential store;
- DB schema or migration changes;
- Send Plan RuntimeCapability integration;
- local file, image, audio, or video processing expansion;
- changing OpenRouter request body, SSE, reasoning, tool, usage, web/file, error, or terminal stream behavior.

---

## 12. Owner Decisions Needed

Before C6 production expansion starts, Owner should decide:

1. Which endpoint kinds are in the first product slice: local only, remote custom, enterprise gateway, or a narrower subset.
2. Whether the existing LocalEndpoint settings and experimental text chat controls can be promoted beyond default-off experimental status.
3. Whether credentials/admin tokens are allowed for local endpoints in the first slice.
4. Whether endpoint-native `listModels` can populate model picker results or must remain a diagnostics-only probe initially.
5. Whether manual model ids are allowed before health/listModels success.
6. Which capabilities can be user-overridden and which remain hard-disabled.
7. Whether C6 should proceed before secure store / OS keychain work.
8. Whether enterprise gateway support needs organization-specific policy review before implementation.

Recommended default:

- keep the current experimental LocalEndpoint text-only path default-off and reversible;
- keep model picker, Send Plan, remote custom endpoints, enterprise gateways, credentials, and managed runtime out of scope until separately approved;
- treat any production LocalEndpoint promotion as a separate Owner-approved gate.

---

## 13. Validation Plan For Future C6 Work

Likely future targeted tests:

- no production LocalEndpoint runtime baseline guard;
- no Generic live activation guard;
- no production registry placeholder guard;
- endpoint metadata redaction tests;
- health/listModels/basic stream probe fixture tests;
- credential resolver failure redaction tests;
- timeout/abort cleanup tests;
- SettingsPanel/preload exposure tests if UI is touched;
- OpenRouter active runtime regression tests;
- Generic conservative capability tests;
- Send Plan unchanged tests until RuntimeCapability integration is explicitly in scope.

Likely commands for future implementation slices:

```text
npm run rebuild:node
npx vitest --run src/next/provider/providerEndpointRegistryBaseline.test.ts src/next/provider/generic/genericEndpointConfig.test.ts src/next/provider/generic/genericAdapter.test.ts src/next/provider/providerFixtureInvariants.test.ts --reporter=dot --silent
npx vitest --run src/ui-app/app/appChatApp.credentialExposure.test.ts src/ui-app/components/SettingsPanel.test.ts electron/preload.test.ts electron/ipc/storeIpc.test.ts --reporter=dot --silent
npx vitest --run electron/ipc/openRouterStreamBridge.test.ts src/next/live/openRouterLiveStream.test.ts src/next/provider/openrouter/openRouterAdapter.test.ts --reporter=dot --silent
git diff --check
```

If renderer production files change, run:

```text
npx vue-tsc --noEmit --pretty false
```

Known unrelated `infra/files/**` LibreOffice/DFC typecheck failures may remain documented if unchanged. Any new provider/OpenRouter/settings/preload/renderer type error should block completion.

---

## 14. Recommended Next Task Package

Suggested next task if Owner wants to proceed beyond the current experimental text-only path:

```text
Task title:
test(provider): audit LocalEndpoint production gate readiness

Goal:
Add readiness/source guards proving LocalEndpoint remains default-off experimental, Generic remains fixture-only, OpenRouter remains the default production runtime, no production endpoint/provider/runtime registry placeholder exists, model picker and Send Plan remain unchanged, and production promotion gates are explicit.

Allowed scope:
- provider architecture tests/source guards;
- optional C6 docs checkpoint;
- no production behavior change.

Validation:
- npm run rebuild:node
- targeted provider/source guard tests
- git diff --check

Commit message:
test(provider): audit LocalEndpoint production gate readiness
```

Do not promote LocalEndpoint beyond the current default-off experimental text-only path until Owner approves a production gate.
