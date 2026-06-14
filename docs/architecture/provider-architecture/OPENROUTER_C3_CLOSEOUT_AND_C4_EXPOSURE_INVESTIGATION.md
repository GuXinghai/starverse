# OpenRouter C3 Closeout And C4 Exposure Investigation

Date: 2026-06-14
Task status: C3 closeout plus C4 investigation, documentation only
Current HEAD reviewed: `bb83a70e feat(provider): route OpenRouter chat credentials through resolver`
Scope: close out accepted OpenRouter C3 credential-source migration and investigate C4 renderer/settings/preload/store IPC raw-key exposure reduction.

This document does not implement C4. It does not change runtime behavior, settings UI behavior, preload exposure, store IPC behavior, secure storage, registries, Send Plan, DB schema, or non-OpenRouter runtime support.

Related accepted C3 commits:

- `6635055c feat(provider): route OpenRouter catalog credentials through resolver`
- `bb83a70e feat(provider): route OpenRouter chat credentials through resolver`

Latest C4 implementation checkpoint:

- C4a exposure characterization completed in `a2105c31 test(provider): characterize C4 credential exposure baseline`.
- C4b/C4c are implemented by `feat(provider): reduce legacy credential exposure in renderer settings`.
- Generic renderer store `get` / `set` / `delete` access is now blocked for credential-bearing legacy keys: `openRouterApiKey`, `openRouterBaseUrl`, `geminiApiKey`, legacy `apiKey`, and `openRouterCatalogLocalSecret`.
- `activeProvider` remains generic-store-visible as legacy provider state, not raw credential material.
- OpenRouter settings use safe metadata plus one-way update/clear through an OpenRouter-specific credential IPC/preload bridge.
- Existing electron-store values remain the backing storage. This is still not secure store, not OS keychain, not endpoint/provider registry, and not non-OpenRouter live runtime.
- Deferred: C4d compatibility cleanup, secure-store/OS-keychain migration, C5 endpoint/provider registry, Generic live runtime, and non-OpenRouter live runtime.

---

## 1. C3 Closeout

### 1.1 Status

| C3 item | Status | Closeout note |
|---|---|---|
| C3a: main-process OpenRouter catalog resolver read path | Done | Catalog credential resolution uses a main-process resolver-backed `legacy_store` source. |
| C3b: catalog sync uses resolver-backed credential source | Done | `runCatalogSyncAtStartup` uses `resolveOpenRouterCatalogCredentialFromLegacyStore`. |
| C3c: chat/send credential source switch | Done | Active OpenRouter chat/send uses a main-process resolver-backed `legacy_store` source. |
| C3e: deliberate characterization test updates | Done | OpenRouter adapter, live stream, bridge, credential facade, catalog, and provider credential gates were updated deliberately around the new source. |
| C3d/C4: renderer/settings/preload/store raw-key exposure reduction | Deferred | Current renderer raw-key exposure remains unchanged until C4 is separately approved. |
| C5: endpoint/provider registry | Deferred | No endpoint registry or provider registry exists. |

### 1.2 What changed

Catalog path after C3:

- Canonical catalog credential ref: `{ kind: 'credential_ref', id: 'openrouter-catalog-legacy-store' }`.
- The catalog credential resolver still reads the existing legacy store keys:
  - `openRouterApiKey`
  - `openRouterBaseUrl`
- Catalog sync receives the same `apiKey` and base URL semantics as before, but through the resolver-backed catalog wrapper.
- `openRouterCatalogLocalSecret` remains catalog local secret / HMAC material. It is not provider credential material.

Chat/send path after C3:

- Canonical chat credential ref: `{ kind: 'credential_ref', id: 'openrouter-chat-legacy-store' }`.
- Active chat/send no longer passes raw `apiKey` from the renderer into the OpenRouter stream call.
- Active chat/send uses `streamViaOpenRouterAsDomainEventsWithLegacyStoreCredentialSource`.
- The live stream sends an IPC payload with `credentialSource: 'legacy_store'` rather than a raw API key.
- `registerOpenRouterStreamBridge({ store })` resolves the OpenRouter API key and base URL from the main-process legacy store before making the OpenRouter request.
- Credential resolution failure on the resolver-backed chat/send path fails before fetch, emits terminal `stream.error`, and emits no `stream.done`.

### 1.3 What stayed unchanged

- OpenRouter remains the only active production runtime.
- Generic and all non-OpenRouter providers remain fixture-only.
- Existing legacy store keys remain the backing source:
  - `openRouterApiKey`
  - `openRouterBaseUrl`
- Settings UI still reads and writes the raw OpenRouter API key.
- Preload still exposes the generic `electronStore` bridge.
- Store IPC still permits generic access to legacy credential keys except `openRouterCatalogLocalSecret`.
- No secure store, OS keychain, encrypted credential store, endpoint registry, provider registry, DB schema migration, Send Plan RuntimeCapability integration, Generic live runtime, or non-OpenRouter live runtime was introduced.

### 1.4 Validation summary from accepted C3 commits

C3a/C3b validation covered catalog and credential behavior:

- OpenRouter catalog credential wrapper and resolver-backed source tests.
- Catalog startup handoff tests.
- Catalog scope / HMAC behavior tests.
- Store IPC and OpenRouter migration surface characterization tests.
- OpenRouter adapter, live stream, bridge, and provider credential boundary tests.
- `git diff --check`.

C3c/C3e validation covered chat/send credential-source migration:

- `npm run rebuild:node` completed before Vitest validation.
- OpenRouter credential/adapter/transport/live/bridge targeted tests passed.
- Provider credential, Generic, and provider fixture invariant targeted tests passed.
- `npx vitest --run src/next/provider --reporter=dot --silent` passed.
- `git diff --check` passed.
- `vue-tsc` was run because renderer code changed; failures were known unrelated `infra/files/**` LibreOffice/DFC type errors, not provider/OpenRouter/renderer credential errors.

### 1.5 Known C3 behavior notes

Base URL precedence changed intentionally for the active C3 chat/send path:

- Under `credentialSource: 'legacy_store'`, the bridge resolves both API key and base URL from the legacy store.
- Renderer-provided base URL in the stream payload is not the active source for C3 chat/send.
- This aligns chat/send with the main-process resolver-backed migration direction.
- C4b/C4c treats `openRouterBaseUrl` as credential-bound endpoint material and blocks generic renderer store access together with `openRouterApiKey`.

C3 is not a secure-store migration and not renderer exposure reduction. It moved active OpenRouter catalog and chat/send credential reads behind main-process resolver-backed legacy-store sources while preserving OpenRouter behavior.

---

## 2. Current C4 Exposure Inventory

### 2.1 Raw credential-bearing keys exposed to renderer

After C4b/C4c, generic renderer store IPC no longer allows `get`, `set`, or `delete` for these credential-bearing keys:

- `openRouterApiKey`
- `openRouterBaseUrl`
- `geminiApiKey`
- legacy `apiKey`
- `openRouterCatalogLocalSecret`

`activeProvider` remains generic-store-visible as legacy provider state, not raw credential material. It is deferred until broader provider-state cleanup.

`openRouterCatalogLocalSecret` remains blocked and remains a catalog local secret / HMAC key, not provider credential material.

### 2.2 Preload APIs that allow exposure

`electron/preload.ts` exposes:

- `window.electronStore.get(key)` -> `store-get`
- `window.electronStore.set(key, value)` -> `store-set`
- `window.electronStore.delete(key)` -> `store-delete`
- `window.electronStore.clearSafe(keepKeys)` -> `store-clear-safe`
- `window.electronStore.checkIntegrity()` -> `store-check-integrity`
- `window.openRouterCredential.getStatus()` -> `openrouter-credential:get-status`
- `window.openRouterCredential.update(payload)` -> `openrouter-credential:update`
- `window.openRouterCredential.clear()` -> `openrouter-credential:clear`
- `window.electronAPI.startOpenRouterStream(payload)` -> `openrouter:stream-chat`

After C3, active chat/send uses `credentialSource: 'legacy_store'` and does not need raw `apiKey` in the OpenRouter stream payload. After C4b/C4c, the generic store bridge remains for non-sensitive settings but main-process store IPC filters credential-bearing legacy keys.

### 2.3 Store IPC channels that allow exposure

`electron/ipc/storeIpc.ts` currently:

- blocks generic renderer `store-get`, `store-set`, and `store-delete` for `openRouterApiKey`, `openRouterBaseUrl`, `geminiApiKey`, legacy `apiKey`, and `openRouterCatalogLocalSecret`;
- allows non-sensitive settings, including `activeProvider`, through the generic store bridge;
- keeps `openRouterCatalogLocalSecret` during `store-clear-safe`.

`clearSafe` remains legacy-compatible: it keeps `openRouterCatalogLocalSecret` automatically and honors explicit keep-list entries.

### 2.4 Settings UI raw-key surfaces

`src/ui-app/components/SettingsPanel.vue` now:

- loads OpenRouter credential status through `window.openRouterCredential.getStatus()`;
- shows configured/unconfigured status and masked API key metadata only;
- does not place the existing raw API key into an input value;
- sends replacement API keys and base URL updates one-way through `window.openRouterCredential.update(payload)`;
- clears the OpenRouter API key through `window.openRouterCredential.clear()`;
- continues to use `electronStore` for non-sensitive catalog and UI settings.

This is C4 exposure reduction with legacy electron-store backing. It is not secure store.

### 2.5 Legacy Gemini/API-key remnants

`electron/config/configSchema.ts` still allows:

- `geminiApiKey`
- legacy `apiKey`
- `activeProvider`

These are runtime-dead for Gemini but config-live. C4b/C4c blocks generic renderer store access to `geminiApiKey` and legacy `apiKey`; `activeProvider` remains visible as legacy provider state.

### 2.6 Current OpenRouter active send path after C3

After C3:

- `appChatApp.logic.ts` still reads `openRouterBaseUrl` for Send Plan/provider context and diagnostic settings.
- Active stream creation uses the OpenRouter legacy-store credential source wrapper.
- The IPC wire request supports either a legacy raw `apiKey` compatibility path or `credentialSource: 'legacy_store'`.
- Active C3 chat/send uses `credentialSource: 'legacy_store'`.
- `openRouterStreamBridge.ts` resolves the credential from the injected main-process store, then sets `Authorization: Bearer <apiKey>` inside the main process.

### 2.7 Current catalog path after C3

After C3:

- `catalogSyncStartup.ts` calls `resolveOpenRouterCatalogCredentialFromLegacyStore`.
- The resolver-backed source reads current legacy store keys in the main process.
- Catalog sync still receives API key and base URL material as before.
- Catalog scope/HMAC/fingerprint behavior remains tied to the catalog local secret and scoped catalog data, not to provider credential storage.

### 2.8 Current raw compatibility/helper paths after C3

The following raw paths remain for compatibility, fixture coverage, or characterization:

- `streamViaOpenRouter(request, { apiKey })` low-level provider fixture path.
- IPC wire validation still accepts raw `config.apiKey`.
- OpenRouter legacy credential facade still accepts raw adapter-side material.
- `useChatSession.getOpenRouterBaseUrl()` reads the safe OpenRouter credential metadata display URL, not the generic store raw key path.
- SettingsPanel no longer reads raw OpenRouter credential values back into the renderer.

C4d should narrow or retire remaining raw compatibility/helper paths only after rollback needs are resolved.

---

## 3. C4 Problem Statement

C4 should reduce renderer/settings/preload/store IPC raw-key exposure without changing OpenRouter request semantics. C4b/C4c now covers the primary renderer settings/store reduction; C4d remains for compatibility cleanup.

C4 should reduce:

- generic renderer reads of raw `openRouterApiKey`;
- generic renderer reads of raw `openRouterBaseUrl` if treated as credential-bound endpoint material;
- generic renderer reads of `geminiApiKey` and legacy `apiKey` if still present;
- settings UI raw key read-back;
- generic credential-key writes that bypass provider-specific validation and diagnostics.

C4 should preserve:

- existing users' stored OpenRouter credentials;
- OpenRouter active chat/send behavior;
- OpenRouter catalog sync behavior;
- base URL compatibility, subject to an explicit C4 decision;
- ability to save, replace, verify, and clear OpenRouter credentials from settings;
- safe metadata display for configured/missing/invalid states;
- rollback to the current C3 legacy-backed resolver path.

C4 is higher risk than C3 because it changes renderer-visible store behavior and settings workflows. C3 moved active runtime reads into main-process resolver-backed legacy sources while leaving UI/store exposure untouched. C4 will change what renderer code can read and must coordinate preload, store IPC, settings UI, tests, and backward compatibility for existing users.

---

## 4. C4 Candidate Migration Approaches

### 4.1 Approach A: Key-Level Store IPC Filtering Plus Provider-Specific Credential IPC

Summary:

- Block generic `store-get` access for credential-bearing keys.
- Add provider-specific IPC for safe credential metadata, set, clear, and optional verify/sync triggers.
- Keep legacy store backing in the main process during transition.
- Do not implement secure store in C4 unless separately approved.

Pros:

- Directly reduces the largest exposure surface.
- Keeps active OpenRouter C3 resolver-backed runtime path intact.
- Allows settings to save/clear credentials without reading raw values back.
- Fits the current main-process resolver-backed direction.

Cons:

- Requires careful compatibility tests for settings and store IPC.
- Renderer code that assumes arbitrary raw reads will need targeted updates.
- Needs a clear list of blocked keys and an intentional migration story for legacy `apiKey` and `geminiApiKey`.

### 4.2 Approach B: SettingsPanel Compatibility Bridge

Summary:

- Settings UI stops reading raw key.
- Settings UI displays masked credential status from main-process safe metadata.
- Save operation sends a new raw key one-way to main process.
- Clear operation clears the credential through main process.
- No raw read-back.

Pros:

- Matches target renderer behavior.
- Can be implemented incrementally after store IPC characterization.
- Keeps existing user workflows visible: configured/missing, save, clear, verify.

Cons:

- Does not fully reduce exposure unless generic store reads are also filtered.
- Requires UI changes and `vue-tsc` validation.
- Must avoid implying secure store if backing remains legacy electron-store.

### 4.3 Approach C: Full Secure Store / OS Keychain Migration

Summary:

- Move OpenRouter credential material from electron-store to OS keychain or encrypted credential store.
- Migrate existing `openRouterApiKey` into secure storage.
- Expose only masked metadata to renderer.

Pros:

- Strongest target-state security story.
- Aligns with the long-term secure credential boundary.

Cons:

- Larger than C4 exposure reduction unless Owner explicitly expands scope.
- Adds migration, dependency, rollback, and platform behavior risk.
- Could delay reducing renderer raw-key reads.

Recommendation: defer beyond C4 unless Owner separately approves C1 secure-store implementation.

### 4.4 Approach D: Endpoint/Provider Registry-Based Solution

Summary:

- Use future endpoint/provider registry records to route settings, credentials, base URL, and provider identity.

Pros:

- Aligns with long-term provider architecture.
- Supports custom endpoints and multi-provider settings eventually.

Cons:

- This is C5, not C4.
- It is too broad for exposure reduction and risks placeholder registry work.
- It could mix endpoint modeling with immediate credential exposure hardening.

Recommendation: keep as future dependency, not current C4 implementation.

### 4.5 Recommended approach

Use Approach A plus Approach B in phases:

1. Add C4a characterization gates before behavior changes.
2. Add key-level store IPC filtering for credential-bearing keys.
3. Add provider-specific OpenRouter credential IPC for masked metadata, set, clear, and verify/sync needs.
4. Update SettingsPanel to use masked metadata and one-way credential updates.
5. Keep legacy electron-store backing in main process until secure store is separately approved.

This reduces renderer exposure without requiring secure-store, endpoint registry, or non-OpenRouter live runtime work.

---

## 5. Recommended C4 Phased Plan

### C4a: Investigation gates / characterization

- Add tests that prove current generic store reads can access `openRouterApiKey`, `openRouterBaseUrl`, `geminiApiKey`, legacy `apiKey`, and `activeProvider`.
- Add tests that identify every settings/preload path that depends on raw read-back.
- Add tests proving active C3 chat/send and catalog sync do not require renderer raw key reads.
- Add tests distinguishing characterization from target C4 behavior.

Owner checkpoint: approve exact blocked-key list before production behavior changes.

### C4b: Store IPC key-level filtering

- Block generic `store-get` for credential-bearing keys.
- Consider blocking generic `store-set` and `store-delete` for those keys once provider-specific IPC exists.
- Keep `openRouterCatalogLocalSecret` blocked and separate.
- Define whether `openRouterBaseUrl` is blocked as credential-bound endpoint material or remains renderer-readable endpoint config during transition.

Rollback: restore previous store IPC allow behavior while leaving C3 resolver-backed runtime intact.

### C4c: Settings masked metadata bridge

- Add OpenRouter credential metadata IPC that returns configured/missing status and safe diagnostics only.
- Add one-way save and clear IPC operations.
- Update SettingsPanel to show masked status rather than raw read-back.
- Keep verify/sync behavior working through main-process operations.

Rollback: revert SettingsPanel and provider-specific IPC while retaining C3.

### C4d: Active compatibility cleanup

- Remove or narrow renderer raw read helpers that are no longer used.
- Reclassify raw compatibility helpers as test-only or legacy compatibility.
- Keep low-level OpenRouter adapter characterization if needed for rollback.

Owner checkpoint: decide whether legacy raw compatibility paths remain until C5 or are removed as part of C4 exit.

---

## 6. C4 Acceptance Criteria

C4 should not be considered complete unless:

- Renderer cannot read raw `openRouterApiKey` through generic store IPC.
- Renderer cannot read raw `openRouterBaseUrl` through generic store IPC if Owner treats it as credential-bound endpoint material.
- Renderer cannot read raw `geminiApiKey` or legacy `apiKey` if those keys remain present.
- Settings can still save and clear the OpenRouter credential.
- Existing users do not lose stored OpenRouter credentials.
- OpenRouter active chat/send still works.
- OpenRouter catalog sync still works.
- Raw key, Bearer value, Authorization header, and credential material are absent from renderer-visible events, logs, diagnostics, and snapshots added by C4.
- Tests cover blocked generic store reads and allowed safe operations.
- C4 does not claim secure store completion unless secure store is actually implemented.
- Generic remains fixture-only.
- Non-OpenRouter live runtime remains disabled.

---

## 7. Future C4 Test And Validation Plan

Likely tests to add or update:

- `electron/ipc/storeIpc.test.ts`
  - current exposure characterization in C4a;
  - blocked-key behavior in C4b;
  - `clearSafe` compatibility around blocked credential keys.
- `electron/preload` characterization tests if the existing harness can inspect exposed APIs without production changes.
- `src/ui-app/components/SettingsPanel` tests if a component test harness exists; otherwise add focused logic-level tests around the new credential bridge.
- `electron/ipc/openRouterStreamBridge.test.ts`
  - active C3 chat/send continues to use `credentialSource: 'legacy_store'`;
  - no raw credential appears in bridge logs/events.
- `electron/jobs/catalogSyncStartup.test.ts`
  - catalog sync still resolves from main-process legacy store source.
- `electron/jobs/openRouterCatalogCredential.test.ts`
  - catalog resolver remains independent of settings/preload exposure.
- `src/next/provider/openrouter/openRouterLegacyCredential.test.ts`
  - chat credential resolver remains safe and legacy-backed.
- `src/next/provider/credentials/providerCredentialBoundary.test.ts`
  - provider credential boundary still does not import renderer/preload/store IPC.
- `src/next/provider/generic/genericEndpointConfig.test.ts` and `src/next/provider/generic/genericAdapter.test.ts`
  - Generic remains fixture-only and unaffected.

Likely targeted commands:

```powershell
npm run rebuild:node
npx vitest --run electron/ipc/storeIpc.test.ts electron/ipc/openRouterStreamBridge.test.ts electron/jobs/catalogSyncStartup.test.ts electron/jobs/openRouterCatalogCredential.test.ts --reporter=dot --silent
npx vitest --run src/next/provider/openrouter/openRouterLegacyCredential.test.ts src/next/provider/openrouter/openRouterAdapter.test.ts src/next/live/openRouterLiveStream.test.ts src/next/transport/openrouterFetch.test.ts --reporter=dot --silent
npx vitest --run src/next/provider/credentials/providerCredentialBoundary.test.ts src/next/provider/generic/genericEndpointConfig.test.ts src/next/provider/generic/genericAdapter.test.ts src/next/provider/providerFixtureInvariants.test.ts --reporter=dot --silent
git diff --check
```

If SettingsPanel or other renderer files change, run:

```powershell
npx vue-tsc --noEmit --pretty false
```

Known unrelated `infra/files/**` LibreOffice/DFC typecheck failures may remain if encountered, but any new provider/OpenRouter/settings/preload/store IPC type error should block C4 completion.

---

## 8. Out Of Scope / Deferred

- Secure store / OS keychain unless separately approved.
- Encrypted credential store unless separately approved.
- Endpoint registry.
- Provider registry.
- Generic live runtime.
- Non-OpenRouter live runtime.
- Send Plan RuntimeCapability integration.
- DB schema changes.
- DFC / LibreOffice / file-conversion work.
- Old Gemini runtime revival.
- LiteLLM.
- Agent, RAG, coding workflow, shell, MCP, LSP, or workspace automation scope.

---

## 9. Proposed Next Implementation Task Package

Suggested next task title:

`test(provider): characterize C4 renderer credential exposure surfaces`

Suggested prompt:

```text
We are starting OpenRouter C4a only: characterization gates before renderer/settings/preload/store IPC exposure reduction.

Do not implement C4 behavior changes yet. Do not modify runtime behavior, SettingsPanel behavior, preload/store IPC production behavior, secure storage, endpoint/provider registry, DB schema, Send Plan, Generic live runtime, or non-OpenRouter live runtime.

Start from the accepted C3 state where OpenRouter catalog and chat/send active credential sources use main-process resolver-backed legacy_store reads. Confirm HEAD and clean git status.

Read:
- docs/architecture/provider-architecture/OPENROUTER_C3_CLOSEOUT_AND_C4_EXPOSURE_INVESTIGATION.md
- electron/preload.ts
- electron/ipc/storeIpc.ts
- electron/config/configSchema.ts
- src/ui-app/components/SettingsPanel.vue
- src/ui-app/app/useChatSession.ts
- src/ui-app/app/appChatApp.logic.ts
- electron/ipc/openRouterStreamBridge.ts
- electron/jobs/catalogSyncStartup.ts
- electron/jobs/openRouterCatalogCredential.ts
- src/next/provider/openrouter/openRouterLegacyCredential.ts

Add or strengthen tests that characterize current C4 exposure surfaces:
- generic store-get can currently read openRouterApiKey, openRouterBaseUrl, geminiApiKey, legacy apiKey, and activeProvider where current behavior allows;
- openRouterCatalogLocalSecret remains blocked;
- SettingsPanel currently reads/writes raw openRouterApiKey and openRouterBaseUrl through electronStore;
- active C3 chat/send and catalog sync do not require renderer raw API key reads;
- raw key/Bearer/Authorization values do not appear in OpenRouter stream events/log diagnostics added by C3.

Tests should state this is legacy characterization, not target C4 behavior. Do not change production behavior.

Run targeted store IPC, OpenRouter bridge, catalog credential, OpenRouter provider, provider credential boundary, Generic fixture tests, git diff --check, and vue-tsc only if renderer code changes.
```

The next implementation step should be C4a characterization before any production behavior change. C4b store IPC filtering and C4c settings masked metadata bridge should wait for Owner approval after C4a makes the current exposure baseline explicit.

---

## 10. Closeout Summary

OpenRouter C3 is closed out through accepted catalog and chat/send credential-source migration commits. The active OpenRouter runtime now resolves catalog and chat/send credentials in the main process through resolver-backed `legacy_store` sources while keeping legacy electron-store backing and preserving OpenRouter behavior.

C4 remains open. The remaining exposure is not the active runtime credential source; it is the renderer/settings/preload/store IPC ability to read and write raw legacy credential keys. C4 should reduce that exposure deliberately, with characterization gates first, and without overclaiming secure-store completion.
