# Provider C5 Endpoint Registry Investigation

Date: 2026-06-15
Task status: investigation and decision package only
Current HEAD reviewed: `70a7d8df test(provider): audit residual credential exposure after C4`
Scope: C5 endpoint/provider registry investigation only
Explicit non-goal: no implementation, no source-level registry shell, no production behavior change

This document scopes C5 after the OpenRouter C3 credential-source migration and C4 renderer credential exposure reduction. It does not implement endpoint registry, provider registry, secure store, Generic live runtime, non-OpenRouter live runtime, DB migration, Send Plan integration, or settings behavior changes.

Related:

- `STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md`
- `STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md`
- `STARVERSE_PROVIDER_EVOLUTION_PATH.md`
- `OPENROUTER_C3_CREDENTIAL_MIGRATION_DECISION_PACKAGE.md`
- `PROVIDER_CREDENTIAL_BOUNDARY_PLAN.md`
- `OPENROUTER_C3_CLOSEOUT_AND_C4_EXPOSURE_INVESTIGATION.md`

---

## 1. C5 Purpose

C5 should define how Starverse represents provider endpoints and provider profiles after C4 reduced renderer access to raw OpenRouter credential keys.

C5 is needed because current settings still mix several concerns:

- OpenRouter official endpoint behavior is encoded through legacy store keys and OpenRouter-specific runtime code.
- `openRouterBaseUrl` is treated as credential-bound endpoint material after C4, but it is still a legacy setting key, not an endpoint record.
- Generic OpenAI-compatible has a non-secret `GenericEndpointConfig` fixture path, but no live settings or registry.
- Provider credential refs exist, but they are not yet connected to durable endpoint records.
- Catalog has a `ProviderAdapter` interface for model catalog sources, but it is not a runtime provider registry.
- Legacy Gemini and legacy `apiKey` fields remain config-live but runtime-dead.

C5 should solve:

- a non-secret endpoint record model for OpenRouter official and future custom endpoints;
- a provider profile model that binds endpoint records to runtime semantics without activating new live providers;
- a relationship between endpoint records and `ProviderCredentialRef`;
- renderer-safe endpoint metadata for settings/model selection;
- a migration path from legacy OpenRouter base URL settings into endpoint-shaped metadata;
- tests that prevent registry placeholders, raw secret regression, Generic accidental live activation, and OpenRouter behavior drift.

C5 should not solve:

- secure store or OS keychain implementation;
- endpoint/provider registry source implementation without a consumed behavior path;
- Generic or non-OpenRouter live runtime activation;
- Send Plan `RuntimeCapability` integration;
- DB schema migration;
- old Gemini runtime revival;
- Agent, RAG, coding workflow, MCP, shell, LSP, or workspace automation scope.

---

## 2. Current State Inventory

### 2.1 OpenRouter Active Endpoint Behavior

OpenRouter remains the only active production runtime.

After C3:

- active chat/send uses `streamViaOpenRouterAsDomainEventsWithLegacyStoreCredentialSource`;
- the renderer no longer passes raw `apiKey` in the active stream payload;
- the main-process OpenRouter bridge resolves `credentialSource: 'legacy_store'`;
- the bridge reads the OpenRouter API key and base URL from the legacy store and sets `Authorization` in main process;
- OpenRouter request body, SSE parsing, reasoning, tool, usage, web/file, error envelope, and terminal stream behavior remain OpenRouter-specific.

After C4:

- generic renderer `store-get`, `store-set`, and `store-delete` are blocked for `openRouterApiKey`, `openRouterBaseUrl`, `geminiApiKey`, legacy `apiKey`, and `openRouterCatalogLocalSecret`;
- OpenRouter settings use `window.openRouterCredential.getStatus/update/clear`;
- OpenRouter settings receive masked metadata and send new credential material one-way;
- legacy electron-store remains the backing storage.

There is no endpoint record for OpenRouter official or custom OpenRouter base URL today.

### 2.2 OpenRouter Credential Settings After C4

`electron/ipc/openRouterCredentialSettingsIpc.ts` exposes a narrow renderer-safe OpenRouter credential settings surface:

- `openrouter-credential:get-status`;
- `openrouter-credential:update`;
- `openrouter-credential:clear`.

The returned status includes:

- `source: 'legacy_store'`;
- configured/missing flags;
- masked API key status;
- safe display base URL metadata;
- invalid base URL marker when needed.

It never returns the raw API key, Bearer token, Authorization header, URL userinfo, query secrets, or raw store errors.

This is not an endpoint registry. It is an OpenRouter-specific C4 compatibility bridge over legacy electron-store backing.

### 2.3 OpenRouter Catalog Credential Path

`electron/jobs/catalogSyncStartup.ts` uses `resolveOpenRouterCatalogCredentialFromLegacyStore`.

The catalog path:

- uses canonical credential ref `{ kind: 'credential_ref', id: 'openrouter-catalog-legacy-store' }`;
- resolves credentials in main process from legacy store backing;
- passes the same API key and normalized base URL semantics to OpenRouter catalog sync;
- keeps `openRouterCatalogLocalSecret` separate as catalog local secret / HMAC material;
- writes scoped catalog metadata keyed by provider, base URL, data source, and credential fingerprint.

This is not endpoint registry storage. The catalog layer has provider/source metadata and scoped catalog cache semantics, but no durable endpoint record selected by settings.

### 2.4 GenericEndpointConfig Fixture State

`src/next/provider/generic/genericEndpointConfig.ts` is explicitly fixture-only. It separates non-secret endpoint config from credential material:

- `endpointId`;
- optional `displayName`;
- `profileId`;
- `baseUrl`;
- `model`;
- `credentialRef`;
- conservative `capabilityOverride`.

The config path resolves credentials through injected `ProviderCredentialResolver` and then creates a Generic endpoint descriptor consumed by the fixture adapter. It rejects secret-like fields and unsafe URLs.

It explicitly does not provide endpoint registry, settings, secure store, UI, or live API support.

### 2.5 Provider Credential Boundary State

Provider credential boundary facts:

- `ProviderCredentialRef` is currently `{ kind: 'credential_ref', id: string }`.
- `ProviderCredentialResolver` is injected and does not read renderer, env, preload, IPC, or store by itself.
- `ProviderCredentialStore` is a pure provider-layer boundary seed with test implementation.
- Safe credential metadata and diagnostic helpers exist.
- Secret-like field detection is centralized in provider credential helpers.
- Generic fixture tests cover config -> resolver/store -> descriptor -> adapter.

There is still no durable production credential store, secure store, endpoint registry, or provider registry.

### 2.6 SettingsPanel Current Provider/Credential Surfaces

`src/ui-app/components/SettingsPanel.vue` currently:

- uses `window.openRouterCredential` for OpenRouter credential status/update/clear;
- does not generic-store read or write `openRouterApiKey` / `openRouterBaseUrl`;
- keeps non-sensitive settings on `window.electronStore`;
- shows masked configured/unconfigured OpenRouter status;
- sends replacement API key and base URL values one-way to main process;
- keeps broad visual/provider settings behavior otherwise stable.

There is no endpoint picker, endpoint list, provider profile selector, custom endpoint registry editor, or Generic endpoint settings UI.

### 2.7 ConfigSchema Legacy Fields

`electron/config/configSchema.ts` still allows:

- `openRouterApiKey`;
- `openRouterBaseUrl`;
- `openRouterCatalogLocalSecret`;
- `geminiApiKey`;
- legacy `apiKey`;
- `activeProvider`;
- OpenRouter catalog sync policy and retention keys.

After C4, renderer generic store access is blocked for credential-bearing keys, but the legacy keys remain in electron-store so existing users keep working.

`activeProvider` remains generic-store-visible as legacy provider state, not raw credential material.

### 2.8 Old Gemini Remnants And Legacy `apiKey`

Old Gemini remnants remain runtime-dead but config-live:

- `geminiApiKey` is still an allowed config key, but generic renderer store access is blocked;
- legacy `apiKey` remains for migration/compatibility, but generic renderer store access is blocked;
- `PROVIDERS.GEMINI` and Gemini metadata still exist in constants;
- no active Gemini send path is revived.

Future Gemini support must be rebuilt through Gemini API / Google AI Studio native adapter. C5 must not reuse old Gemini runtime remnants.

### 2.9 Absence Of Endpoint/Provider Registry Today

There is no source-level endpoint registry or provider registry today.

Existing nearby concepts are not the registry:

- model catalog `ProviderAdapter` is a catalog-source adapter, not runtime provider registry;
- catalog `CatalogModelEndpoint` is in-memory/source metadata from OpenRouter endpoint details, not user endpoint settings;
- Generic endpoint config is fixture-only;
- OpenRouter credential settings IPC is an OpenRouter-specific compatibility bridge;
- OpenRouter legacy credential facade is not a registry.

### 2.10 Absence Of Non-OpenRouter Live Runtime Today

Non-OpenRouter providers remain fixture foundations:

- DeepSeek;
- OpenAI Responses;
- Anthropic;
- Gemini API / Google AI Studio;
- Generic OpenAI-compatible.

None has live settings, endpoint registry selection, Send Plan integration, or production send activation.

---

## 3. Registry Boundary Definitions

This section proposes C5 boundary language. It is not an implementation.

### 3.1 Endpoint Record Candidate Shape

An endpoint record should be non-secret and renderer-safe:

```ts
type EndpointRecord = Readonly<{
  endpointId: string
  providerKey: 'openrouter' | 'generic_openai_compatible' | string
  kind: 'openrouter_official' | 'openrouter_custom_base_url' | 'generic_openai_compatible' | 'local_endpoint'
  displayName: string
  baseUrl: string
  profileId: string
  credentialRef: ProviderCredentialRef
  enabled: boolean
  source: 'built_in' | 'legacy_migration' | 'user'
}>
```

Rules:

- `baseUrl` must not contain URL userinfo, query secrets, or embedded credentials.
- `credentialRef` is a pointer only.
- raw API keys, Authorization headers, secret headers, passwords, bearer tokens, and local admin tokens are not endpoint record fields.
- renderer-visible metadata may include safe display URL/host and credential configured status.

### 3.2 Provider Profile Candidate Shape

A provider profile should describe semantics, not credentials:

```ts
type ProviderProfileRecord = Readonly<{
  profileId: string
  providerKey: string
  transportDialect: string
  adapterKind: 'openrouter' | 'generic_openai_compatible' | 'native'
  displayName: string
  capabilityDefaults: Record<string, boolean>
  quirksVersion: string
}>
```

Rules:

- profiles do not execute requests by themselves;
- profiles do not contain secrets;
- profiles do not activate a provider unless a runtime path consumes them under explicit Owner-approved scope;
- Generic profiles must remain conservative unless later phases approve broader capability handling.

### 3.3 CredentialRef Relationship

Endpoint records should reference credential material through `ProviderCredentialRef`.

Current implementation shape is still:

```ts
{ kind: 'credential_ref', id: string }
```

C5 should not assume a provider/account dimension already exists. If C5 needs provider/account scoping, it should be introduced deliberately with migration tests and updated boundary docs.

### 3.4 Renderer-Visible Metadata

Renderer-safe endpoint metadata may include:

- endpoint id;
- display name;
- provider key/display name;
- profile id/display name;
- sanitized base URL host or display URL;
- locality such as remote/custom/local;
- enabled state;
- credential configured/missing/invalid/unavailable status;
- capability summary and warnings;
- health summary when available.

Renderer metadata must not include:

- raw API key;
- bearer token;
- Authorization value;
- secret headers;
- URL userinfo;
- query secrets;
- raw store errors;
- raw provider credential material.

### 3.5 Main-Process-Only Secret Material

Main process resolves secret material from credential refs. Adapters receive credential material only inside main-process/provider boundaries.

C5 can continue using legacy electron-store backing for OpenRouter if secure store is not in scope. It must label that backing clearly as legacy and not as secure storage.

### 3.6 OpenRouter Official Endpoint Representation

OpenRouter official endpoint should likely be represented as a built-in endpoint record:

- `endpointId`: stable built-in id, for example `openrouter-official`;
- `providerKey`: `openrouter`;
- `kind`: `openrouter_official`;
- `baseUrl`: `https://openrouter.ai/api/v1`;
- `profileId`: OpenRouter chat/completions profile;
- `credentialRef`: current chat or future unified OpenRouter credential ref;
- `source`: `built_in` or `legacy_migration`.

This record should preserve existing OpenRouter behavior and should not change active runtime semantics by itself.

### 3.7 OpenRouter Custom Mirror / Custom Base URL Representation

The current `openRouterBaseUrl` setting acts like custom endpoint material. C5 should decide whether it becomes:

- an override field on the built-in OpenRouter endpoint record; or
- a separate endpoint record, for example `openrouter-custom-legacy`.

Recommended direction: treat custom base URL as a distinct endpoint record once endpoint records exist. This avoids mixing official OpenRouter settings with mirror/custom endpoint settings and aligns with the architecture contract.

Migration must preserve current users:

- existing `openRouterBaseUrl` should continue to work;
- URL userinfo/query secrets must not become renderer-visible endpoint metadata;
- base URL precedence must remain explicitly defined.

### 3.8 Generic OpenAI-Compatible Endpoint Representation

Generic endpoint records should be based on the existing fixture shape:

- endpoint id;
- display name;
- base URL without userinfo/query/fragment;
- model id or default model id;
- credential ref;
- Generic profile id;
- conservative capability override.

Generic must remain fixture-only until a later Owner-approved live runtime task. C5 can prepare non-secret metadata and tests, but it must not activate Generic send.

### 3.9 LocalEndpoint Future Representation

LocalEndpoint is a future endpoint kind for externally running services such as LM Studio, Ollama, LocalAI, llama.cpp server, or custom local OpenAI-compatible endpoints.

C5 should only define it as future vocabulary if needed. It should not implement local endpoint support, health probes, process management, model downloads, local admin tokens, or managed local runtime.

### 3.10 EndpointRegistry vs RuntimeProviderRegistry

EndpointRegistry should own non-secret endpoint records, renderer-safe metadata, enabled/default selection, and credential refs.

RuntimeProviderRegistry should own runtime adapter selection and execution routing.

They are different:

- an endpoint record says where and with which profile a request could go;
- a runtime provider registry says which adapter can execute a request;
- catalog source adapters list/sync model metadata and are neither endpoint registry nor runtime registry;
- C5 should not create a runtime registry unless an active behavior path consumes it.

---

## 4. C5 Scope Options

### Option A: OpenRouter-Only Endpoint Record First

Summary:

- Introduce OpenRouter endpoint metadata as the first non-secret registry read model.
- Keep OpenRouter active send/catalog behavior unchanged.
- Keep legacy electron-store backing.
- Do not activate Generic.

Pros:

- Lowest behavioral risk.
- Starts from the only active runtime.
- Lets C5 migrate `openRouterBaseUrl` semantics deliberately.
- Avoids Generic live activation.
- Gives SettingsPanel a concrete endpoint metadata target.

Cons:

- Does not solve long-tail provider settings yet.
- May need a later migration to generalize endpoint records.

### Option B: OpenRouter + Generic Endpoint Config Unification

Summary:

- Define endpoint record shape by unifying OpenRouter endpoint metadata with Generic fixture config.
- Keep Generic fixture-only but align shapes.

Pros:

- Reduces future drift between OpenRouter and Generic.
- Reuses existing `GenericEndpointConfig` boundary pressure.

Cons:

- Higher risk of accidentally implying Generic live support.
- Could overfit OpenRouter and Generic into a premature common source shape.
- Requires more tests to prove Generic remains fixture-only.

### Option C: Registry Shell Without Live Behavior

Summary:

- Add source-level registry interfaces/data structures without consuming them in active runtime.

Pros:

- Documents a future shape in code.

Cons:

- Violates the placeholder abstraction prohibition unless directly consumed.
- Adds maintenance surface with no behavior path.
- Risks becoming a fake architecture asset.

Recommendation: reject for now.

### Option D: Defer Registry And Proceed To Secure Store First

Summary:

- Stop C5 and start a secure store / OS-keychain decision and implementation path.

Pros:

- Stronger secret storage story.
- Avoids endpoint modeling before credential storage is durable.

Cons:

- Does not clarify endpoint/base URL/profile ownership.
- Could leave C4 OpenRouter-specific settings bridge as the long-term endpoint model.

### Recommended Option

Recommended: Option A first, with limited Option B analysis in tests/docs only.

Rationale:

- C5 should start from OpenRouter because it is the only active runtime.
- C5 should not activate Generic or non-OpenRouter providers.
- OpenRouter official/custom base URL handling is the immediate source of endpoint semantics.
- Generic fixture config should inform shape constraints, but not drive production activation.
- A source-level registry object should enter code only when a real OpenRouter behavior path or settings metadata path consumes it.

---

## 5. Avoid Placeholder Abstractions

C5 must not add:

- empty `EndpointRegistry`;
- empty `ProviderRegistry`;
- unused runtime provider manager;
- unused endpoint manager;
- unused provider profile service;
- unused local endpoint manager;
- unused Generic live provider switch;
- registry objects that only mirror docs without a consumer.

A registry object is allowed to enter source only when:

1. it is directly consumed by an existing behavior path, such as OpenRouter settings metadata or active OpenRouter runtime selection;
2. it has tests proving behavior and rollback boundaries;
3. it replaces or isolates a concrete legacy surface, such as `openRouterBaseUrl` metadata ownership;
4. it preserves OpenRouter behavior and does not activate Generic live runtime.

If those conditions are not met, the registry shape must remain in documentation.

---

## 6. Migration Strategy

### 6.1 Preserve Existing OpenRouter Users

C5 must preserve:

- existing `openRouterApiKey`;
- existing `openRouterBaseUrl`;
- existing OpenRouter chat/send behavior;
- existing catalog sync behavior;
- existing OpenRouter settings update/clear behavior.

Any endpoint metadata migration must read legacy values and keep rollback possible.

### 6.2 Avoid Changing Active OpenRouter Behavior

OpenRouter request body, Authorization behavior, base URL precedence, SSE parsing, reasoning, tools, usage, web/file behavior, error envelope, and terminal stream behavior should not change during C5 investigation or initial registry metadata work.

If a later implementation changes behavior intentionally, characterization tests must be updated in the same commit with a clear migration note.

### 6.3 Avoid Generic Live Activation

Generic endpoint registry preparation must not:

- add Generic settings UI as live support;
- route active chat/send to Generic;
- expose Generic as production runtime;
- broaden Generic capabilities beyond conservative fixture defaults.

Generic endpoint config remains a fixture foundation until an explicit live gate is approved.

### 6.4 Treat `openRouterBaseUrl`

After C4, `openRouterBaseUrl` is credential-bound endpoint material:

- generic renderer store access is blocked;
- SettingsPanel reads a sanitized display URL through OpenRouter credential metadata;
- active chat/send and catalog resolve base URL in main process through legacy-store source.

C5 should classify it as endpoint metadata with secret-adjacent handling:

- renderer-visible form must be sanitized;
- source precedence must remain explicit;
- a custom value should likely become an OpenRouter custom endpoint record or endpoint override;
- URL userinfo/query must not enter renderer metadata.

### 6.5 Treat `activeProvider`

`activeProvider` remains visible as legacy provider state. C5 should not silently repurpose it into a provider registry selector.

Recommended handling:

- characterize current usage before any behavior change;
- keep it out of endpoint credential semantics;
- decide whether it becomes a provider default selector, is deprecated, or is ignored after endpoint records exist.

### 6.6 Treat `geminiApiKey` / Legacy `apiKey`

`geminiApiKey` and legacy `apiKey` remain config-live but runtime-dead for Gemini:

- generic renderer store access is blocked after C4;
- they should not become endpoint records unless a migration/removal decision exists;
- old Gemini runtime must not be revived.

C5 should likely inventory these as deprecated-for-removal, not migrate them into provider registry records.

---

## 7. C5 Phased Task Proposal

### C5a: Characterization / Inventory Gates

Goal:

- lock current endpoint-like surfaces before implementation;
- prove there is no endpoint/provider registry source today;
- characterize OpenRouter base URL handling and `activeProvider` usage;
- guard against Generic live activation and placeholder registry code.

Likely outputs:

- source audit tests;
- docs update if needed;
- no production behavior change.

Owner checkpoint:

- approve C5 recommended option before registry source work begins.

### C5b: Non-Secret OpenRouter Endpoint Metadata Read Model

Goal:

- introduce a consumed OpenRouter endpoint metadata read path only if it replaces a real settings metadata need;
- keep legacy store backing;
- keep raw secrets out of renderer;
- keep active OpenRouter runtime unchanged.

Acceptance pressure:

- must be consumed by SettingsPanel or a tested OpenRouter metadata path;
- no Generic live behavior;
- no provider switchboard.

### C5c: SettingsPanel Endpoint Metadata Split

Goal:

- separate OpenRouter credential metadata from endpoint/base URL metadata if needed;
- keep the current one-way credential update/clear path;
- preserve user ability to update custom base URL;
- avoid broad visual redesign.

### C5d: Generic Endpoint Registry Preparation, Fixture-Only

Goal:

- align Generic fixture endpoint config with endpoint metadata vocabulary;
- add tests proving Generic remains fixture-only;
- do not add Generic production settings or live send path.

### C5e: Rollout / Rollback Gates

Goal:

- ensure C5 metadata changes can be reverted without breaking OpenRouter chat/send/catalog;
- preserve C4 credential filtering;
- keep legacy keys readable until a secure store or registry migration is accepted.

---

## 8. C5 Acceptance Criteria

C5 should not exit unless:

- no raw secret reaches renderer;
- existing OpenRouter chat/send still works;
- existing OpenRouter catalog sync still works;
- OpenRouter-first active runtime is preserved;
- Generic remains fixture-only unless separately approved;
- endpoint config contains no raw secret;
- `ProviderCredentialRef` remains non-secret;
- settings/preload/store boundaries remain safe after C4;
- no source-level placeholder registry is introduced;
- no old Gemini runtime path is revived;
- no LiteLLM is introduced;
- no Agent/RAG/coding workflow scope is introduced;
- OpenRouter custom base URL behavior is explicitly preserved or intentionally changed with tests;
- rollback does not require DB schema repair.

---

## 9. Test Strategy

### 9.1 C5a Tests

Likely C5a tests:

- source guard proving no `EndpointRegistry` / `ProviderRegistry` production source exists yet;
- source guard proving active send still uses OpenRouter legacy-store credential source;
- source guard proving `appChatApp.logic.ts` is not a provider switchboard;
- store/preload tests proving C4 blocked credential keys stay blocked;
- SettingsPanel tests proving OpenRouter settings still use safe metadata bridge;
- tests characterizing `activeProvider` visibility and usage;
- tests proving Generic remains fixture-only and no live send path consumes `GenericEndpointConfig`;
- tests proving old Gemini constants do not create active send behavior.

### 9.2 C5b Tests

If C5b introduces consumed OpenRouter endpoint metadata:

- metadata contains endpoint id, display name, provider key, profile id, sanitized base URL, and credential status;
- metadata does not contain raw API key, Bearer token, Authorization, URL userinfo, query secrets, or raw store errors;
- default official endpoint and custom legacy base URL are represented without behavior drift;
- OpenRouter active send and catalog tests still pass;
- SettingsPanel can update base URL through the approved OpenRouter settings bridge;
- C4 store IPC filtering remains intact.

### 9.3 Regression Commands

Likely targeted validation for C5a/C5b:

```powershell
npm run rebuild:node
npx vitest --run electron/ipc/storeIpc.test.ts electron/ipc/openRouterCredentialSettingsIpc.test.ts electron/preload.test.ts src/ui-app/components/SettingsPanel.test.ts src/ui-app/app/appChatApp.credentialExposure.test.ts --reporter=dot --silent
npx vitest --run electron/ipc/openRouterStreamBridge.test.ts src/next/live/openRouterLiveStream.test.ts src/next/provider/openrouter/openRouterLegacyCredential.test.ts src/next/provider/openrouter/openRouterAdapter.test.ts --reporter=dot --silent
npx vitest --run src/next/provider/credentials/providerCredentialBoundary.test.ts src/next/provider/generic/genericEndpointConfig.test.ts src/next/provider/generic/genericAdapter.test.ts src/next/provider/providerFixtureInvariants.test.ts --reporter=dot --silent
git diff --check
```

If renderer production files change:

```powershell
npx vue-tsc --noEmit --pretty false
```

Known unrelated `infra/files/**` LibreOffice/DFC typecheck failures may remain documented if unchanged. Any new provider/OpenRouter/settings/preload/renderer type error should block completion.

---

## 10. C5a Characterization Checkpoint

C5a characterization gates have been added. They record the current pre-registry baseline without introducing endpoint/provider registry source code or changing production behavior.

Covered baseline:

- production source has no `EndpointRegistry`, `ProviderRegistry`, or `RuntimeProviderRegistry` implementation or placeholder shell;
- active OpenRouter chat/send remains on the first-class OpenRouter path with `credentialSource: 'legacy_store'`;
- OpenRouter active send is not routed through Generic or a registry route;
- OpenRouter catalog sync still uses the resolver-backed legacy-store credential source;
- SettingsPanel still uses the OpenRouter credential metadata bridge and has no endpoint record / endpointId / profileId selection UI;
- `openRouterBaseUrl` remains credential-bound endpoint material in the current C4 bridge, not a registry endpoint record;
- Generic endpoint config remains fixture-only and is not consumed by active production routing;
- provider credential boundary pieces remain non-secret and do not introduce secure-store / OS-keychain production implementation;
- old Gemini remains runtime-dead, while `geminiApiKey` and legacy `apiKey` stay blocked from generic renderer store access.

Next recommended step: C5b OpenRouter-only non-secret endpoint metadata model, if Owner approves. C5b should introduce source only when the metadata is consumed by a real OpenRouter settings or runtime-adjacent path and must continue to avoid Generic live activation.

---

## 11. C5b OpenRouter Endpoint Metadata Checkpoint

C5b has introduced an OpenRouter-only, renderer-safe endpoint metadata model through the existing OpenRouter credential settings bridge.

Implemented facts:

- `openrouter-credential:get-status` now returns an `endpoint` object with `kind: 'openrouter_endpoint'`.
- The metadata distinguishes the built-in official endpoint from the legacy custom base URL source:
  - `openrouter-official`
  - `openrouter-custom-legacy-store`
- The metadata includes non-secret OpenRouter ids, profile id `openrouter_v1_chat`, sanitized display base URL, default base URL, and non-secret credential refs:
  - `{ kind: 'credential_ref', id: 'openrouter-chat-legacy-store' }`
  - `{ kind: 'credential_ref', id: 'openrouter-catalog-legacy-store' }`
- SettingsPanel consumes the endpoint metadata for safe display while continuing to use one-way OpenRouter credential update/clear.
- Existing legacy electron-store backing remains in place.
- OpenRouter active chat/send and catalog runtime behavior is unchanged.

This is not a generic endpoint registry, provider registry, runtime provider registry, secure store, OS keychain, Generic live runtime, or non-OpenRouter live runtime. It is an OpenRouter-specific metadata model backed by current C3/C4 behavior.

Next likely step: C5c SettingsPanel endpoint metadata split if Owner wants clearer endpoint/base URL UX, or C5d Generic registry preparation if Owner wants fixture-only shape alignment. Either path must keep Generic live activation out of scope unless separately approved.

---

## 12. C5c Endpoint Metadata Settings Integration Checkpoint

C5c has hardened the OpenRouter-only endpoint metadata integration without adding a generic registry.

Implemented facts:

- OpenRouter endpoint metadata now uses an explicit renderer-safe status shape for:
  - official endpoint;
  - custom legacy-store endpoint;
  - invalid custom legacy-store endpoint.
- The metadata keeps literal non-secret credential refs for chat and catalog credential sources.
- SettingsPanel displays official, custom, and invalid custom endpoint status more explicitly while keeping the API key input empty for existing credentials.
- Invalid custom base URL metadata is shown as a safe warning and is not copied into the editable base URL input.
- OpenRouter credential update, API-key clear, and base-URL clear behavior remain one-way through the OpenRouter credential settings bridge.
- C5 baseline guards still allow only this behavior-backed OpenRouter-specific metadata and continue to reject generic `EndpointRegistry`, `ProviderRegistry`, and `RuntimeProviderRegistry` source shells.

Still not implemented:

- no generic endpoint registry;
- no RuntimeProviderRegistry or ProviderRegistry;
- no endpoint CRUD, endpoint picker, or profile picker;
- no secure store, OS keychain, or encrypted credential store;
- no Generic live runtime;
- no non-OpenRouter live runtime.

Next likely step depends on Owner priority: C5d Generic registry preparation while remaining fixture-only, a separate secure-store decision package, or stopping provider architecture work here and switching to another slice.

---

## 13. C5d Generic Fixture Endpoint Boundary Checkpoint

C5d has prepared Generic endpoint registry shape pressure at fixture level only.

Implemented facts:

- Generic has a fixture-only endpoint metadata projection with `kind: 'generic_endpoint_fixture'`.
- The fixture metadata keeps endpoint id, display name, profile id, base URL, model id, non-secret `credentialRef`, and conservative capability flags together in one tested shape.
- Generic endpoint-like config rejects raw secret-bearing fields, URL userinfo, query secrets, malformed credential refs, and high-risk capability enablement before producing fixture metadata.
- Generic adapter fixture tests continue to fail before fetch for unsupported high-risk runtime feature requests.
- Source guards keep Generic fixture metadata out of SettingsPanel, preload, OpenRouter active runtime, catalog startup, and active send routing.
- C5 baseline guards still reject production `EndpointRegistry`, `ProviderRegistry`, and `RuntimeProviderRegistry` source shells.

Still not implemented:

- no production endpoint registry;
- no RuntimeProviderRegistry or ProviderRegistry;
- no endpoint CRUD, endpoint picker, or profile picker;
- no Generic live runtime or UI/settings exposure;
- no secure store, OS keychain, or encrypted credential store;
- no non-OpenRouter live runtime.

Next possible steps are C5e rollback/closeout gates, a separate secure-store decision package, stopping C5 and switching to another provider architecture slice, or a later Owner-approved Generic live gate. Generic live activation remains out of scope until explicitly approved.

---

## 14. Risks

| Risk | Why it matters | Control |
|---|---|---|
| OpenRouter behavior regression | OpenRouter is the only active runtime. | Keep OpenRouter runtime tests as hard gates. |
| Endpoint/base URL precedence drift | `openRouterBaseUrl` is user-visible and now main-process resolved. | Characterize before C5b and update only intentionally. |
| SettingsPanel confusion | Credential metadata and endpoint metadata can be conflated. | Split labels/status only when there is a consumed endpoint metadata path. |
| CredentialRef/store mismatch | Registry records may point to refs not supported by resolver backing. | Keep `ProviderCredentialRef` shape and resolver tests as SSOT. |
| Generic accidental live activation | Generic fixture config resembles future endpoint records. | Add source guards and explicit fixture-only tests. |
| Stale Gemini fields | `geminiApiKey`, legacy `apiKey`, and `PROVIDERS.GEMINI` are config-live/runtime-dead. | Inventory as deprecated-for-removal; do not migrate into registry as live endpoints. |
| Over-engineered registry shell | Empty registry/source objects violate the architecture contract. | Do not add registry source until consumed by behavior or tests. |
| Catalog/runtime confusion | Catalog `ProviderAdapter` can be mistaken for runtime registry. | Keep terminology as CatalogSourceAdapter / ModelCatalogProviderAdapter in docs and code comments. |

---

## 15. Recommended Next Implementation Prompt

Suggested next task:

```text
Task title:
test(provider): characterize C5 endpoint registry baseline

Goal:
Add C5a characterization/inventory gates only. Do not implement endpoint registry, provider registry, secure store, Generic live runtime, non-OpenRouter live runtime, or settings behavior changes.

Required checks:
1. Prove no production EndpointRegistry / ProviderRegistry source exists.
2. Prove current catalog ProviderAdapter is catalog-source only, not runtime registry.
3. Prove active OpenRouter send still uses the legacy-store credential source.
4. Prove OpenRouter catalog sync still uses resolver-backed legacy-store source.
5. Prove SettingsPanel uses OpenRouter credential metadata bridge and not generic store reads for OpenRouter credential/base URL keys.
6. Prove GenericEndpointConfig remains fixture-only and no active send path consumes it.
7. Prove Generic and non-OpenRouter providers remain live-disabled.
8. Prove old Gemini remains runtime-dead and legacy `geminiApiKey` / `apiKey` are not active runtime inputs.
9. Preserve C4 store IPC/preload credential exposure reduction tests.

Preferred files:
- src/ui-app/app/appChatApp.credentialExposure.test.ts
- electron/ipc/storeIpc.test.ts
- src/next/provider/credentials/providerCredentialBoundary.test.ts
- src/next/provider/generic/genericEndpointConfig.test.ts

Validation:
- npm run rebuild:node
- targeted C4/OpenRouter/provider boundary tests
- git diff --check

Commit message:
test(provider): characterize C5 endpoint registry baseline
```

C5a should remain characterization/inventory work. Registry implementation should wait until the Owner approves the C5 option and a consumed OpenRouter endpoint metadata path is defined.

---

## 16. Summary

C5 should begin with OpenRouter-only endpoint metadata investigation, not a source-level placeholder registry. The recommended path is Option A: OpenRouter endpoint record first, with Generic endpoint config used only as fixture shape pressure. Secure store, endpoint/provider registry source implementation, Generic live runtime, non-OpenRouter live runtime, Send Plan capability integration, old Gemini revival, LiteLLM, and Agent/RAG/coding workflow scope remain out of scope.
