# PROVIDER_CREDENTIAL_BOUNDARY_PLAN.md

版本：v1.0.0
状态：Planning document — not yet Owner-confirmed
最后更新：2026-06-13

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
- Line 61: `const apiKey = String(store.get('openRouterApiKey') ?? '').trim()` — reads key directly from store in main process

### 1.4 Gemini legacy credential remnants

| Surface | File:Line | Status |
|---------|-----------|--------|
| `'geminiApiKey'` in whitelist | `configSchema.ts:71` | Active — renderer can read/write |
| `'activeProvider'` field | `configSchema.ts:84` | Active — allows `'Gemini'` value |
| `apiKey` → `geminiApiKey` migration | `configSchema.ts:198-200` | Active migration logic |
| `PROVIDERS.GEMINI` constant | `src/constants/providers.ts:21` | Active — not deprecated |
| `PROVIDER_METADATA[GEMINI]` | `providers.ts:68-74` | Active — not marked deprecated |

These are runtime-dead (no active Gemini send chain) but config-live (stored values exist, migration logic runs).

### 1.5 Generic fixture credential seed today

Verified in `src/next/provider/credentials/providerCredential.ts`:
- `BearerCredential`: `{ kind: 'bearer', token: string }`
- `createBearerCredential(token)`: Validates non-empty, returns credential
- `buildAuthHeader(cred)`: Returns `{ Authorization: 'Bearer <token>' }`
- `maskCredential(cred)`: Returns `{ maskedToken: '***' }` — raw token NEVER in output
- `redactCredentialFromMessage(message, token)`: Strips bearer tokens from error messages
- `sanitizeErrorCode(rawCode, token, fallback)`: Prevents token leakage in error codes

Verified in `src/next/provider/generic/genericEndpointConfig.ts`:
- `GenericCredentialRef`: `{ kind: 'credential_ref', id: string }` — non-secret pointer
- `GenericEndpointConfig`: Contains `credentialRef` but NO raw API key
- `resolveGenericEndpointDescriptor(config, resolveCredential)`: Resolves credential through injected resolver
- `toSafeGenericEndpointMetadata(config)`: Exposes `credentialPresent: boolean` but never raw token
- Secret-like field detection: 27 field names rejected case-insensitively

This is pure adapter/test boundary — not secure store, not renderer/settings/IPC.

### 1.6 Distinguishing verified facts from assumptions

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

**Mitigation status:** Generic adapter has `redactCredentialFromMessage` and `sanitizeErrorCode`. OpenRouter bridge has partial redaction. Other adapters have no explicit credential redaction in their error paths.

### 2.3 OpenRouter behavior regression risk

**Current state:** OpenRouter is the only active runtime. Its credential path is: renderer reads from store → passes to adapter via function parameter → adapter passes to IPC bridge → bridge sets Authorization header.

**Risk:** Any migration that changes the credential flow must not break this path. The IPC bridge receives the raw API key in the payload — changing this requires coordinating preload, IPC, adapter, and app logic.

**Mitigation:** The adapter already receives credentials as parameters (not from store). The migration boundary is at the store-to-adapter handoff in `appChatApp.logic.ts`.

### 2.4 Migration compatibility risk for existing users

**Current state:** Users have `openRouterApiKey` stored in electron-store. The config schema has migration logic for `apiKey` → `geminiApiKey`.

**Risk:** If the store key name changes or the credential format changes, existing users lose their API key. If the migration logic runs incorrectly, keys may be lost or duplicated.

**Mitigation:** Any migration must read existing keys, transform them, and write new format. Old keys must remain readable until migration is confirmed safe.

### 2.5 Settings/UI drift risk

**Current state:** `SettingsPanel.vue` reads/writes `openRouterApiKey` directly. It shows the raw key in an input field.

**Risk:** If the credential boundary moves to main process, the settings panel must be updated to show masked metadata instead of raw keys. If the panel is updated before the boundary is ready, it may break. If the panel is not updated after the boundary, it becomes inconsistent.

**Mitigation:** Phase the migration: first establish the secure store, then update the UI. Do not change the UI until the secure path is validated.

### 2.6 Endpoint registry / credentialRef mismatch risk

**Current state:** `GenericCredentialRef` exists as a type (`{ kind: 'credential_ref', id: string }`) but no endpoint registry or credential store consumes it. The resolver is injected per-test.

**Risk:** If the endpoint registry and credential store are designed independently, the `credentialRef` may not match the store's key format. If the resolver is not the same function used in production, fixture tests may not catch integration bugs.

**Mitigation:** Design the credential store key format before implementing the endpoint registry. Ensure the resolver used in tests matches the production resolver's contract.

### 2.7 Test coverage gaps

**Current gaps:**
- No tests for the store-to-adapter handoff in `appChatApp.logic.ts` (it's UI orchestration)
- No tests for the IPC bridge credential flow end-to-end
- No tests for SettingsPanel credential display after migration
- No tests for credential migration logic (old key → new format)
- No tests for multi-endpoint credential resolution

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

### Phase C0: Tests and inventory gates

**Goal:** Establish test coverage for current credential flows and document the exact surfaces that need migration.

**Files likely touched:**
- `src/next/provider/credentials/providerCredential.test.ts` (expand)
- `src/next/provider/providerFixtureInvariants.test.ts` (add credential leakage invariant for all adapters)
- `docs/architecture/provider-architecture/PROVIDER_CREDENTIAL_BOUNDARY_PLAN.md` (this document)

**Forbidden changes:**
- No source code changes
- No store schema changes
- No UI changes
- No adapter behavior changes

**Validation checks:**
- All existing provider tests pass
- Invariant tests cover credential leakage for all adapters
- Inventory document is complete and verified

**Rollback condition:** N/A — docs and tests only

---

### Phase C1: Secure-store abstraction seed in main process

**Goal:** Create a minimal secure-store abstraction in the main process that can store and retrieve credential material. No UI migration, no adapter changes.

**Files likely touched:**
- `electron/credentials/secureCredentialStore.ts` (new)
- `electron/credentials/secureCredentialStore.test.ts` (new)
- `electron/config/configSchema.ts` (add new store keys for credential metadata)

**Forbidden changes:**
- No renderer exposure of new keys
- No preload/IPC changes
- No adapter changes
- No UI changes
- No OpenRouter behavior changes

**Validation checks:**
- Secure store can store/retrieve/mask credentials
- Secure store does not expose raw credentials through any IPC channel
- Existing OpenRouter path unchanged
- All existing tests pass

**Rollback condition:** If the secure store abstraction cannot be contained to main process only, revert and redesign.

---

### Phase C2: Generic fixture consumes credentialRef through resolver

**Goal:** Wire the Generic adapter's `streamViaGenericConfig` entrypoint to use the secure store resolver in tests, proving the config → resolver → descriptor → adapter path works with real credential resolution.

**Files likely touched:**
- `src/next/provider/generic/genericAdapter.ts` (no changes — already has `streamViaGenericConfig`)
- `src/next/provider/generic/genericAdapter.test.ts` (add tests using secure store resolver)
- `electron/credentials/secureCredentialStore.ts` (expose resolver function)

**Forbidden changes:**
- No production adapter changes
- No UI changes
- No preload/IPC changes
- No OpenRouter changes

**Validation checks:**
- Config → resolver → descriptor → adapter happy path works
- Invalid credential fails before fetch
- No raw token in emitted events
- All existing tests pass

**Rollback condition:** If the resolver integration requires changes to the adapter contract, revert and redesign the resolver interface.

---

### Phase C3: OpenRouter legacy read path wrapped, behavior unchanged

**Goal:** Wrap the OpenRouter credential read path (`useChatSession.ts` → `electronStore.get('openRouterApiKey')`) behind a main-process credential boundary. The behavior must be identical — the renderer still reads the key, but through a new IPC channel that returns masked metadata for display and passes the raw key only to the adapter in the main process.

**Files likely touched:**
- `electron/ipc/credentialIpc.ts` (new)
- `electron/preload.ts` (add new credential IPC channel)
- `src/ui-app/app/useChatSession.ts` (switch to new IPC channel)
- `electron/credentials/secureCredentialStore.ts` (add OpenRouter migration logic)

**Forbidden changes:**
- OpenRouter request/stream/reasoning/tool/usage behavior must not change
- Existing stored `openRouterApiKey` must remain readable
- Settings panel must continue to work (may show masked key instead of raw)
- No other provider changes

**Validation checks:**
- OpenRouter happy path unchanged (same requests, same responses)
- Settings panel shows masked key or existing behavior
- Existing stored keys are not lost
- All existing tests pass

**Rollback condition:** If OpenRouter behavior changes at all, revert immediately. The legacy path must remain functional until the migration is confirmed safe.

---

### Phase C4: Settings/preload renderer exposure reduced to masked metadata

**Goal:** The renderer no longer receives raw API keys. The settings panel shows masked metadata. The renderer can configure endpoints (non-secret fields) and trigger credential entry (which goes directly to main process).

**Files likely touched:**
- `src/ui-app/components/SettingsPanel.vue` (show masked key, add credential entry flow)
- `electron/preload.ts` (remove raw key access from `electronStore` API, or add key-level filtering)
- `electron/ipc/storeIpc.ts` (block `openRouterApiKey` from renderer reads)
- `electron/ipc/credentialIpc.ts` (add masked metadata endpoint)

**Forbidden changes:**
- No new provider live support
- No endpoint registry
- No Send Plan changes
- No DB schema changes

**Validation checks:**
- Renderer cannot read raw `openRouterApiKey` through any IPC channel
- Settings panel shows masked key and allows credential entry
- OpenRouter behavior unchanged
- All existing tests pass

**Rollback condition:** If the settings panel breaks or OpenRouter behavior changes, revert and keep the legacy renderer access.

---

### Phase C5: Endpoint registry / provider settings integration

**Goal:** Introduce a minimal endpoint registry that stores non-secret endpoint config with credentialRef pointers. The credential store resolves credentialRef to actual credentials. Multiple endpoints can be configured (OpenRouter official, custom OpenAI-compatible, future providers).

**Files likely touched:**
- `electron/endpoints/endpointRegistry.ts` (new)
- `electron/endpoints/endpointRegistry.test.ts` (new)
- `electron/credentials/secureCredentialStore.ts` (extend for multi-endpoint)
- `src/ui-app/components/SettingsPanel.vue` (endpoint management UI)

**Forbidden changes:**
- No live non-OpenRouter provider enablement
- No Send Plan integration
- No DB schema changes for endpoints (use electron-store)

**Validation checks:**
- Endpoint registry can store/retrieve non-secret config
- CredentialRef resolves to correct credential
- OpenRouter official endpoint works through new path
- All existing tests pass

**Rollback condition:** If the endpoint registry introduces complexity that cannot be contained, revert and keep the single-endpoint path.

---

### Phase C6: Production non-OpenRouter live enablement gate

**Goal:** Enable live non-OpenRouter provider calls through the secure credential boundary. The first provider to go live is Generic OpenAI-compatible, followed by DeepSeek, then native providers.

**Files likely touched:**
- `src/ui-app/app/appChatApp.logic.ts` (add provider dispatch based on endpoint registry)
- `src/next/provider/generic/genericAdapter.ts` (wire to secure store resolver)
- Endpoint-specific adapter files (wire to secure store resolver)

**Forbidden changes:**
- OpenRouter behavior must not change
- No Send Plan integration until RuntimeCapability phase
- No DB schema changes

**Validation checks:**
- Generic endpoint can make live API calls with credentials from secure store
- OpenRouter still works unchanged
- Error messages do not leak credentials
- All existing tests pass

**Rollback condition:** If live non-OpenRouter calls fail or leak credentials, disable the provider dispatch and revert to OpenRouter-only.

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
| Secure store implementation | Not in this task. Secure store is Phase C1. |
| Live provider enablement | Not in this task. Live non-OpenRouter is Phase C6. |
| Endpoint/provider registry implementation | Not in this task. Registry is Phase C5. |
| Send Plan integration | Not in this task. Send Plan integration is deferred to RuntimeCapability phase. |
| DB schema migration | Not in this task. Endpoint config uses electron-store, not SQLite. |
| Gemini legacy revival | Not in this task. Gemini remains runtime-dead remnants. |
| Agent/RAG/coding workflow platform shift | Not in this task. Starverse remains an AI chat app. |
