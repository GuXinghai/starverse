# PROVIDER_CREDENTIAL_BOUNDARY_PLAN.md

版本：v1.0.0
状态：Planning document — not yet Owner-confirmed
最后更新：2026-06-14

关联文档：
- STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md §9, §10
- STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md §7
- STARVERSE_PROVIDER_EVOLUTION_PATH.md Legacy removal schedule

---

## 1. Current Credential Facts

### 1.1 OpenRouter credential path today

Verified flow:

```
[Electron Store]
  openRouterApiKey, openRouterBaseUrl
        │
        │ window.electronStore.get()
        v
[useChatSession.ts]  (lines 23-39)
  getOpenRouterApiKey()  →  string | null
  getOpenRouterBaseUrl() →  string | null
        │
        │ await calls
        v
[appChatApp.logic.ts]  (lines 7465, 7477, 8012, 8018)
  apiKey  = await getOpenRouterApiKey()
  baseUrl = await getOpenRouterBaseUrl()
        │
        │ apiKey  → credentials parameter: { apiKey }
        │ baseUrl → request.config.baseUrl
        v
[openRouterAdapter.ts]  (lines 37-69)
  streamViaOpenRouter(request, { apiKey })
        │
        v
[openRouterLiveStream.ts]  (lines 429-529)
  options.config.apiKey  →  fetch/apiKey
        │
        v
[openRouterStreamBridge.ts]  (line 346)
  request.setHeader('Authorization', `Bearer ${payload.config.apiKey}`)
```

The adapter receives credentials as explicit parameters — it does not read from the store. The store-to-adapter boundary is in `appChatApp.logic.ts`.

### 1.2 Renderer exposure today

| Surface | File | What renderer reads |
|---------|------|-------------------|
| `getOpenRouterApiKey()` | `src/ui-app/app/useChatSession.ts:23-30` | Raw API key string from `electronStore.get('openRouterApiKey')` |
| `getOpenRouterBaseUrl()` | `src/ui-app/app/useChatSession.ts:32-39` | Raw base URL string from `electronStore.get('openRouterBaseUrl')` |
| Settings panel input | `src/ui-app/components/SettingsPanel.vue:68-690` | Raw API key in `<input v-model="apiKey">`, reads/writes via `store.get`/`store.set` |
| Settings panel save | `SettingsPanel.vue:312,472` | Writes raw key via `store.set('openRouterApiKey', ...)` |
| Settings panel clear | `SettingsPanel.vue:403` | Clears local ref, writes empty via `store.set` |

The renderer has full read/write access to `openRouterApiKey` and `openRouterBaseUrl` through the preload bridge.

### 1.3 Store/Preload/IPC surfaces today

**Preload (`electron/preload.ts`):**
- Lines 1-10: Exposes `electronStore` with `get`, `set`, `delete`, `clearSafe`, `checkIntegrity`
- Line 71: Exposes `startOpenRouterStream(payload)` — sends full payload including `config.apiKey`
- No key-level filtering in preload itself

**Store IPC (`electron/ipc/storeIpc.ts`):**
- `store-get` (line 35): Returns any store key to renderer, except `openRouterCatalogLocalSecret`
- `store-set` (line 41): Writes any store key from renderer, except `openRouterCatalogLocalSecret`
- `store-delete` (line 72): Deletes any store key, except `openRouterCatalogLocalSecret`
- Only `openRouterCatalogLocalSecret` is blocked by `isSensitiveCatalogStoreKey`
- `openRouterApiKey`, `geminiApiKey`, `apiKey`, `activeProvider` are NOT blocked

**Config schema (`electron/config/configSchema.ts`):**
- Line 71: `'geminiApiKey'` in `ALLOWED_CONFIG_KEYS`
- Line 72: `'openRouterApiKey'` in `ALLOWED_CONFIG_KEYS`
- Line 73: `'openRouterBaseUrl'` in `OPENROUTER_CATALOG_LOCAL_SECRET_KEY`
- Line 74: `'openRouterCatalogLocalSecret'` in `ALLOWED_CONFIG_KEYS`
- Line 81: `'apiKey'` (legacy) in `ALLOWED_CONFIG_KEYS`
- Line 84: `'activeProvider'` in `ALLOWED_CONFIG_KEYS`

**OpenRouter IPC bridge (`electron/ipc/openRouterStreamBridge.ts`):**
- Line 326: Logs `maskApiKey(payload.config.apiKey)` — redacted, first 4 + last 4 chars
- Line 346: `request.setHeader('Authorization', `Bearer ${payload.config.apiKey}`)` — uses raw key
- Line 102: `sanitizeRequestBodyForLog` redacts `apiKey` in log output

**Catalog sync (`electron/jobs/catalogSyncStartup.ts`):**
- `catalogSyncStartup.ts` now calls the behavior-preserving OpenRouter catalog credential wrapper.
- The wrapper still reads the legacy `openRouterApiKey` / `openRouterBaseUrl` values from the main-process store and passes the same values to the catalog sync job.
- This is not a secure-store migration and does not change OpenRouter chat/send credentials.
- `openRouterCatalogLocalSecret` remains blocked from generic renderer store IPC and remains a catalog local secret / HMAC key, not a provider credential.

### 1.4 Gemini legacy credential remnants

| Surface | File:Line | Status |
|---------|-----------|--------|
| `'geminiApiKey'` in whitelist | `configSchema.ts:71` | Active — renderer can read/write |
| `'activeProvider'` field | `configSchema.ts:84` | Active — allows `'Gemini'` value |
| `apiKey` → `geminiApiKey` migration | `configSchema.ts:198-200` | Active migration logic |
| `PROVIDERS.GEMINI` constant | `src/constants/providers.ts:21` | Active — not deprecated |
| `PROVIDER_METADATA[GEMINI]` | `providers.ts:68-74` | Active — not marked deprecated |

These are runtime-dead (no active Gemini send chain) but config-live (stored values exist, migration logic runs).

### 1.5 Generic fixture credential boundary today

Verified in `src/next/provider/credentials/**`:
- Provider-level `ProviderCredentialRef` exists as a non-secret pointer with `kind` / `id`.
- `ProviderCredentialResolver` and `ProviderCredentialResolution` define an injected resolver boundary. They do not read store, env, renderer, preload, or IPC.
- `ProviderCredentialStore` exists as a pure provider-layer contract with in-memory test implementation and a resolver factory. It is not a global singleton and does not read electron-store.
- `ProviderCredentialStoreResult` has an explicit invalid branch; the success branch carries valid `ProviderCredential` only.
- Secret-like field detection is a provider credential layer SSOT and is reused by `ProviderCredentialRef` validation and Generic endpoint config validation.
- Safe credential metadata / diagnostic helpers exist for configured, missing, invalid, unavailable, and error states. They do not expose raw token, bearer value, Authorization, headers, URL userinfo, raw resolver output, or raw store error messages.

Verified in `src/next/provider/generic/**`:
- `GenericEndpointConfig` contains `credentialRef` but no raw API key.
- `streamViaGenericConfig` exercises config -> provider resolver/store -> descriptor -> adapter in tests.
- Resolver missing / invalid / unavailable / thrown-error paths fail before fetch, emit `stream.error`, and emit no `stream.done`.
- Generic remains fixture-only and conservative: text chat/basic streaming/basic error only, no live runtime enablement, no endpoint registry, and no provider registry.

This is provider fixture/boundary progress only. It is not secure store, not renderer/settings/preload/IPC migration, not live Generic support, and not production-ready multi-provider credential storage.

### 1.6 OpenRouter credential migration checkpoint

Completed as behavior-preserving or fixture-only work:
- OpenRouter legacy credential facade exists. It wraps current raw key/baseURL material for OpenRouter adapter fixtures and safe diagnostics, but it is explicitly a legacy exception facade.
- OpenRouter credential resolver seam exists at provider fixture level. It proves `ProviderCredentialRef` / resolver output can map to the OpenRouter legacy facade and then to the current adapter fixture path. It is not connected to the active renderer/settings/preload/IPC send path.
- OpenRouter legacy credential behavior characterization gates cover adapter Authorization behavior, baseURL preservation, safe diagnostics, error/envelope behavior, request builder/SSE/live-stream fixture behavior, and no raw key in provider fixture events.
- OpenRouter migration surface characterization gates cover store IPC legacy credential access, preload generic store bridge exposure, catalog sync direct-read surface, catalog local secret / HMAC scope behavior, bridge mask/log behavior, and non-empty IPC SSE handling.
- OpenRouter catalog credential read wrapper exists and is connected to `catalogSyncStartup`. It still performs the same legacy main-process store read and passes the same `apiKey` / `baseUrl` values to the sync job.
- OpenRouter credential migration gates have been hardened so the resolver seam does not trust dynamic resolver messages, preload scanning in tests is path-stable, `clearSafe` legacy credential behavior is characterized, and bridge mask/log tests prove the current mask pattern is applied.

Not completed:
- No secure store implementation.
- No OS keychain or encrypted credential store.
- No renderer/settings/preload/IPC raw key exposure reduction.
- No OpenRouter chat/send credential source migration.
- No endpoint registry or provider registry.
- No non-OpenRouter live runtime.
- No Send Plan runtime capability integration.
- No DB schema or durable multi-provider usage migration.
- No OpenRouter catalog credential resolver integration beyond the behavior-preserving wrapper seed.
- `openRouterCatalogLocalSecret` remains a catalog local secret / HMAC key, not a provider credential.

### 1.7 Distinguishing verified facts from assumptions

| Fact | Source |
|------|--------|
| Renderer reads raw `openRouterApiKey` | Verified in `useChatSession.ts:26` |
| Renderer writes raw `openRouterApiKey` | Verified in `SettingsPanel.vue:312,472` |
| `openRouterCatalogLocalSecret` is blocked from renderer | Verified in `storeIpc.ts:37,43` and `catalogScope.ts:9` |
| `openRouterApiKey` is NOT blocked from renderer | Verified in `storeIpc.ts` — only `openRouterCatalogLocalSecret` is in `SENSITIVE_STORE_KEYS` |
| OpenRouter IPC bridge receives raw API key | Verified in `openRouterStreamBridge.ts:346` |
| OpenRouter adapter receives key as parameter | Verified in `openRouterAdapter.ts:39` |
| Generic config has no raw key | Verified in `genericEndpointConfig.ts:49-57` |
| Gemini `geminiApiKey` is still in config whitelist | Verified in `configSchema.ts:71` |

---

## 2. Risks

### 2.1 Renderer secret exposure

**Current state:** Renderer has full read/write access to `openRouterApiKey`, `geminiApiKey`, `apiKey`, and `activeProvider` through the preload bridge. The `electronStore.get/set` IPC channels carry raw secrets.

**Risk:** Any XSS, prototype pollution, or renderer compromise exposes all stored API keys. The preload bridge exposes the full `electron-store` API with no key-level restriction.

**Mitigation status:** Only `openRouterCatalogLocalSecret` is blocked. All other credential-bearing keys are unprotected.

### 2.2 Secret leakage into errors/logs/diagnostics

**Current state:** OpenRouter IPC bridge logs `maskApiKey(payload.config.apiKey)` (first 4 + last 4 chars) at line 326. The `sanitizeRequestBodyForLog` redacts `apiKey` in request body logs.

**Risk:** The `maskApiKey` function exposes the first 4 and last 4 characters of the API key. While not a full leak, it reduces the entropy of the key significantly for short keys. Provider error messages may echo credential material.

**Mitigation status:** Generic adapter has credential redaction and error-code sanitization. Provider credential metadata helpers provide renderer-safe diagnostics. OpenRouter bridge mask/log behavior is characterized, and the OpenRouter resolver seam normalizes credential failure messages to static safe strings. This is still defensive gating, not secure migration.

### 2.3 OpenRouter behavior regression risk

**Current state:** OpenRouter is the only active runtime. Its credential path is: renderer reads from store → passes to adapter via function parameter → adapter passes to IPC bridge → bridge sets Authorization header.

**Risk:** Any migration that changes the credential flow must not break this path. The IPC bridge receives the raw API key in the payload — changing this requires coordinating preload, IPC, adapter, and app logic.

**Mitigation:** The adapter already receives credentials as parameters (not from store). The OpenRouter legacy facade, resolver seam fixture, behavior characterization, and catalog credential read wrapper provide migration preparation while preserving behavior. The chat/send migration boundary remains at the store-to-adapter handoff in `appChatApp.logic.ts`.

### 2.4 Migration compatibility risk for existing users

**Current state:** Users have `openRouterApiKey` stored in electron-store. The config schema has migration logic for `apiKey` → `geminiApiKey`.

**Risk:** If the store key name changes or the credential format changes, existing users lose their API key. If the migration logic runs incorrectly, keys may be lost or duplicated.

**Mitigation:** Any migration must read existing keys, transform them, and write new format. Old keys must remain readable until migration is confirmed safe.

### 2.5 Settings/UI drift risk

**Current state:** `SettingsPanel.vue` reads/writes `openRouterApiKey` directly. It shows the raw key in an input field.

**Risk:** If the credential boundary moves to main process, the settings panel must be updated to show masked metadata instead of raw keys. If the panel is updated before the boundary is ready, it may break. If the panel is not updated after the boundary, it becomes inconsistent.

**Mitigation:** Phase the migration: keep renderer exposure characterized while the main-process boundary is prepared, then update the active credential source and UI only under an explicit migration task. Do not change the UI until the replacement path is validated.

### 2.6 Endpoint registry / credentialRef mismatch risk

**Current state:** `ProviderCredentialRef`, injected resolver, provider credential store boundary seed, and safe metadata helpers exist. Generic fixture tests consume the config -> resolver/store -> descriptor -> adapter path. There is still no endpoint registry, provider registry, or live production resolver wiring.

**Risk:** If the endpoint registry and credential store are designed independently, the `credentialRef` may not match the store's key format. If the resolver is not the same function used in production, fixture tests may not catch integration bugs.

**Mitigation:** Keep the provider credential resolver/store contract as the SSOT for future endpoint registry work. Do not introduce endpoint/provider registry until the credentialRef shape and migration behavior are explicitly accepted.

### 2.7 Test coverage gaps

**Current gaps:**
- No migration of the OpenRouter chat/send active credential source.
- No tests for the final migrated store-to-adapter handoff in `appChatApp.logic.ts`.
- No tests for SettingsPanel masked credential display after migration.
- No tests for durable legacy key -> secure credential migration logic.
- No tests for endpoint/provider registry credential resolution.

**Recently covered gates:**
- Provider credential boundary import/safety gates.
- Generic config -> resolver/store -> descriptor -> adapter fixture path.
- OpenRouter legacy adapter facade and resolver seam fixture.
- Store IPC/preload legacy exposure characterization.
- OpenRouter catalog credential read wrapper characterization.
- OpenRouter bridge mask/log and non-empty IPC SSE credential-safety characterization.

---

## 3. Target Boundary

### 3.1 Main-process / secure-store owns secrets

All credential material lives in the main process. The renderer never receives raw API keys, bearer tokens, Authorization headers, or custom secret headers.

### 3.2 Renderer sees only masked metadata

The renderer receives:
- `credentialPresent: boolean` — whether a credential is configured
- `maskedCredential: string` — e.g., `'***'` or `'sk-12...ab'`
- `credentialKind: string` — e.g., `'bearer'`
- `endpointId: string` — which endpoint this credential belongs to

The renderer never receives:
- Raw API key
- Bearer token
- Authorization header value
- Custom secret headers
- Full URL with embedded credentials

### 3.3 Runtime adapters receive credential material only through adapter-side resolver

Adapters receive a `ProviderCredential` object through an injected resolver, not from the store directly. The resolver is called in the main process before the adapter runs.

### 3.4 Endpoint config stores non-secret fields only

`GenericEndpointConfig` and future endpoint config types contain:
- `endpointId`, `displayName`, `profileId`
- `baseUrl` (no embedded credentials)
- `model`
- `credentialRef` (pointer, not secret)
- `capabilityOverride`

They never contain:
- `apiKey`, `token`, `authorization`, `secret`, `password`, `headers`

### 3.5 credentialRef is the cross-boundary handle

`credentialRef` is a lightweight, non-secret pointer that the renderer can store and pass to the main process. The main process resolves it to actual credential material.

### 3.6 Provider error diagnostics must be redacted

All provider adapters must redact credential material from error messages, error codes, and diagnostic output before emitting events.

### 3.7 OpenRouter legacy exception is migration-only

The current renderer access to `openRouterApiKey` is a legacy exception. It must not be replicated for new providers. The migration path wraps this access behind a secure boundary while preserving behavior.

---

## 4. Proposed Minimal Objects

### 4.1 CredentialRef

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `'credential_ref'` | Discriminator |
| `id` | `string` | Identifier for the credential (e.g., endpoint ID, provider account ID) |
| `provider` | `string` | Provider name (e.g., `'openrouter'`, `'generic'`) |

Non-secret. Renderer-safe. Stored in endpoint config.

### 4.2 MaskedCredentialMetadata

| Field | Type | Description |
|-------|------|-------------|
| `credentialRefId` | `string` | Which credential this metadata describes |
| `present` | `boolean` | Whether a credential is configured |
| `maskedToken` | `string` | Masked representation (e.g., `'***'`) |
| `kind` | `'bearer'` | Credential type |
| `lastUpdated` | `number?` | Timestamp of last credential change (optional) |

Renderer-safe. No raw secrets.

### 4.3 CredentialMaterial

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `'bearer'` | Discriminator |
| `token` | `string` | Raw credential material |

Main-process only. Never crosses IPC to renderer. Consumed by adapter-side resolver.

### 4.4 CredentialResolver

Signature: `(ref: CredentialRef) => CredentialMaterial | CredentialError`

Main-process function. Resolves a non-secret reference to actual credential material. Called by adapter entrypoints before fetch.

### 4.5 Endpoint non-secret config

| Field | Type | Description |
|-------|------|-------------|
| `endpointId` | `string` | Unique endpoint identifier |
| `displayName` | `string?` | Human-readable name |
| `profileId` | `string` | Provider profile identifier |
| `baseUrl` | `string` | API endpoint URL (no embedded credentials) |
| `model` | `string` | Default model ID |
| `credentialRef` | `CredentialRef` | Pointer to credential in secure store |
| `capabilityOverride` | `object?` | Conservative capability overrides |

Non-secret. Renderer-safe. Stored in endpoint registry (future).

### 4.6 Credential diagnostics / audit fields

| Field | Type | Description |
|-------|------|-------------|
| `credentialRefId` | `string` | Which credential |
| `action` | `'created' \| 'updated' \| 'deleted' \| 'rotated' \| 'accessed'` | What happened |
| `timestamp` | `number` | When |
| `source` | `'user' \| 'migration' \| 'auto'` | Who triggered |
| `success` | `boolean` | Whether the action succeeded |

Main-process audit log. Not exposed to renderer.

### 4.7 Migration marker for legacy OpenRouter key/baseURL

| Field | Type | Description |
|-------|------|-------------|
| `legacyOpenRouterMigrated` | `boolean` | Whether the legacy key has been migrated to new format |
| `legacyStoreKey` | `string` | Original store key name (e.g., `'openRouterApiKey'`) |
| `migratedToCredentialRef` | `string` | New credentialRef ID |

Stored in config schema. Prevents re-migration on app restart.

---

## 5. Phased Migration Plan

This checkpoint records current progress. Status terms are intentionally conservative:

- **complete** means the stated test/boundary work exists and is covered.
- **fixture-only** means it is exercised by provider fixtures/tests, not active runtime.
- **behavior-preserving wrapper** means it wraps the existing legacy path without reducing the legacy exposure.
- **partial** means useful preparation exists, but the migration phase has not exited.
- **not started** means no implementation should be inferred from target architecture language.

### Current phase status

| Phase | Status | Completed checkpoint | Still not complete |
|---|---|---|---|
| C0 characterization / safety gates | substantially complete | Provider fixture invariant gate, provider credential boundary safety gates, OpenRouter legacy behavior gates, migration surface gates, catalog wrapper tests, bridge mask/log gates, and hardening gates exist. | Future migrated UI/settings tests and final secure-store migration tests do not exist. Characterization tests intentionally lock current legacy behavior and must be updated during migration. |
| C1 credential store boundary | partial | Provider-layer credential store contract, in-memory test store, store -> resolver factory, explicit missing/invalid/unavailable/error mapping, and safe metadata boundary exist. | No secure store implementation, no OS keychain, no encrypted store, no electron-store migration, no renderer/settings/preload/IPC integration. |
| C2 Generic fixture credentialRef consumption | fixture-level complete | Generic config -> ProviderCredentialRef -> resolver/store -> descriptor -> adapter path is covered. Resolver failure fails before fetch, emits `stream.error`, and emits no `stream.done`. Secret-like field detection is shared provider SSOT. | Generic remains fixture-only. No live Generic API, no endpoint registry, no provider registry, no production credential source. |
| C3 OpenRouter legacy read wrapping | partial / in preparation | OpenRouter legacy credential facade done. Resolver seam fixture done. OpenRouter behavior characterization done. Migration surface characterization done. Catalog credential read wrapper done. Resolver seam hardening done. | OpenRouter chat/send active credential source is not migrated. Renderer/settings/preload/IPC raw key exposure remains. Catalog wrapper still reads legacy store values and is not secure store. Catalog credential resolver integration beyond wrapper seed is not done. |
| C4 settings/preload exposure reduction | not started | Current raw-key exposure is characterized. `openRouterCatalogLocalSecret` remains blocked from generic store IPC. | No reduction of renderer/settings/preload/IPC raw key exposure. Settings panel still reads/writes raw legacy key. Generic store bridge remains legacy exposure. |
| C5 endpoint registry / provider settings | not started | CredentialRef and non-secret Generic config fixtures establish shape pressure for future endpoint registry. | No endpoint registry, no provider registry, no provider settings integration, no multi-endpoint credential routing. |
| C6 production non-OpenRouter live gate | not started | Non-OpenRouter providers have fixture foundations and credential boundaries where applicable. | No non-OpenRouter live runtime. No Send Plan runtime capability integration. No DB schema or durable multi-provider usage migration. OpenRouter remains the only active runtime. |

### Recommended next engineering steps

1. Mimo review `c0ba6eb2 fix(provider): harden OpenRouter credential migration gates`.
2. Consider catalog credential resolver integration only after the catalog wrapper review is accepted.
3. Start C3 OpenRouter chat/send credential migration only after explicit Owner approval.
4. Defer C4 settings/preload raw-key exposure reduction until the C3 active credential path is stable.
5. Keep endpoint/provider registry work deferred until the credential migration boundary is accepted.

### Current risks

| Risk | Current control |
|---|---|
| Renderer store bridge still exposes raw legacy keys. | Characterization gates document current exposure. No reduction has happened. |
| OpenRouter chat send path still receives raw key from renderer/store flow. | OpenRouter behavior characterization and facade/seam tests protect current behavior. |
| Catalog wrapper is behavior-preserving, not secure. | Wrapper tests prove same `apiKey` / `baseUrl` behavior and no raw key in diagnostics/scope output. |
| Characterization tests can block intentional migration changes. | Future migration tasks must update these tests deliberately with Owner-approved behavior changes. |
| Safe metadata could be mistaken for secure migration. | This document labels it as provider boundary progress only, not secure store or renderer migration. |

---

## 6. Acceptance Criteria

| Criterion | Verification |
|-----------|-------------|
| No new provider secret in renderer | After Phase C4, renderer IPC audit shows no raw API keys |
| OpenRouter behavior unchanged | All OpenRouter adapter tests pass through every phase |
| Existing stored OpenRouter keys remain readable | Migration logic reads old keys and writes new format |
| Renderer cannot read raw secrets for new providers | New providers use credentialRef only; resolver runs in main process |
| Errors/events/logs do not include raw secrets | Invariant tests cover all adapters; `redactCredentialFromMessage` used |
| Generic remains conservative and fixture-only until Phase C6 | No live Generic API calls before Phase C6 |
| No Send Plan changes until RuntimeCapability phase | Send Plan integration deferred to separate phase |

---

## 7. Open Questions for Owner

| Question | Options | Recommendation |
|----------|---------|----------------|
| Secure store mechanism | `electron-store` with encryption, OS keychain (`keytar`), custom encrypted file | `electron-store` with encryption is simplest; OS keychain is most secure but adds dependency |
| Migration timing for OpenRouter key/baseURL | Phase C3 (early) or Phase C5 (late) | Phase C3 — earlier migration reduces risk surface |
| OpenRouter mirror/custom endpoint | Same Endpoint record with different baseUrl, or separate Endpoint record | Separate Endpoint record — cleaner boundary |
| Credential status UI | Show masked key only, or show masked key + last updated + rotation reminder | Masked key + last updated; rotation reminder is Phase C5+ |
| CredentialRef per endpoint or per provider account | Per endpoint (simpler) or per provider account (allows key sharing) | Per endpoint — simpler, matches current architecture |
| Local endpoint admin tokens | First credential phase (C1-C2) or deferred | Deferred — local endpoint is Phase 6 in evolution path |

---

## 8. Non-Goals

| Non-Goal | Status |
|----------|--------|
| UI implementation | Not in this task. Settings panel changes are Phase C4. |
| Settings implementation | Not in this task. Settings IPC changes are Phase C4. |
| Secure store implementation | Not in this task. Only provider credential store boundary seed exists; OS keychain / encrypted store remains future work. |
| Live provider enablement | Not in this task. Live non-OpenRouter is Phase C6. |
| Endpoint/provider registry implementation | Not in this task. Registry is Phase C5. |
| Send Plan integration | Not in this task. Send Plan integration is deferred to RuntimeCapability phase. |
| DB schema migration | Not in this task. Endpoint config uses electron-store, not SQLite. |
| Gemini legacy revival | Not in this task. Gemini remains runtime-dead remnants. |
| Agent/RAG/coding workflow platform shift | Not in this task. Starverse remains an AI chat app. |
