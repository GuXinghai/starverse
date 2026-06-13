# OpenRouter C3 Credential Migration Decision Package

Status: Owner decision package, not an implementation plan completion claim
Date: 2026-06-14

Related:
- `PROVIDER_CREDENTIAL_BOUNDARY_PLAN.md`
- `STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md` §9, §10
- `STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md` §7
- `STARVERSE_PROVIDER_EVOLUTION_PATH.md` legacy removal schedule

---

## 1. Purpose

This document is a decision package for the Owner. It does not declare that the OpenRouter credential migration is finished, and it does not authorize implementation by itself.

The decision to make is whether Starverse should enter C3: OpenRouter active credential source migration. C3 means changing the active OpenRouter credential source behind the existing behavior-preserving boundaries while preserving OpenRouter chat/send behavior unless the Owner explicitly approves a behavior change.

This package is planning-only. It does not modify code, tests, settings, preload, IPC, secure storage, registries, Send Plan, or runtime behavior.

---

## 2. Current State

Current facts:

- OpenRouter remains the only active runtime.
- OpenRouter chat/send still receives the raw legacy API key from the renderer-side legacy store flow:
  - `useChatSession.ts` reads `openRouterApiKey` and `openRouterBaseUrl` through `window.electronStore.get`.
  - `appChatApp.logic.ts` passes `{ apiKey }` and optional `baseUrl` into `streamViaOpenRouterAsDomainEvents`.
  - `openRouterStreamBridge.ts` sets `Authorization: Bearer <apiKey>` for the main-process IPC streaming path.
- Renderer, preload, and store IPC still expose legacy raw credential keys. `openRouterApiKey`, `openRouterBaseUrl`, legacy `apiKey`, `geminiApiKey`, and `activeProvider` remain accessible through the generic store bridge where current behavior allows.
- `openRouterCatalogLocalSecret` remains a catalog local secret / HMAC key. It is not a provider credential.
- Catalog sync direct read has been wrapped by `readOpenRouterCatalogLegacyCredentialFromStore`, but the wrapper remains behavior-preserving legacy main-process store read.
- OpenRouter chat adapter resolver seam and catalog resolver seam are fixture-only. They are not wired into active chat/send or startup catalog sync behavior.
- No secure store implementation exists.
- No OS keychain or encrypted credential store exists.
- No endpoint registry or provider registry exists.
- No live runtime exists for non-OpenRouter providers. Non-OpenRouter providers remain fixture-only foundations.

Current C3 preparation state:

| Area | Current state | Migration status |
|---|---|---|
| OpenRouter chat adapter credential facade | Legacy facade wraps raw adapter-side key/baseURL material. | Fixture/behavior-preserving preparation only. |
| OpenRouter chat resolver seam | `ProviderCredentialRef` / resolver can map to OpenRouter legacy facade in fixture path. | Fixture-only, not active runtime. |
| OpenRouter catalog credential wrapper | Startup catalog sync reads through a wrapper around current legacy store keys. | Active wrapper, but still legacy backing. |
| OpenRouter catalog resolver seam | Provider resolver can map to catalog legacy credential material in tests. | Fixture-only, not startup path. |
| Renderer/settings/preload exposure | Raw legacy key flow still exposed by current store bridge and settings panel. | Not reduced. |
| Generic credential boundary | Provider credential resolver/store/safe metadata boundary exists for fixture paths. | Generic remains fixture-only. |

---

## 3. Existing Safety Net

The following gates already exist and should be treated as the C3 baseline:

- OpenRouter legacy credential facade tests.
- OpenRouter adapter Authorization, baseURL, empty-key, reasoning, tool, usage, terminal, and error behavior tests.
- `openrouterFetch` behavior characterization.
- `openRouterLiveStream` renderer fetch / IPC payload characterization.
- `openRouterStreamBridge` Authorization, mask/log, wire-event, and non-empty SSE characterization.
- Store IPC migration surface characterization, including legacy credential key access and `clearSafe` behavior.
- Preload generic store bridge exposure characterization.
- Catalog sync direct-read characterization.
- OpenRouter catalog credential wrapper tests.
- OpenRouter catalog resolver seam tests, including invalid credential ref hardening.
- OpenRouter catalog local secret / HMAC scope tests.
- Generic credential boundary tests.
- Provider credential resolver/store/safe metadata tests.
- Provider credential boundary import and secret-shape gates.
- Provider fixture invariant gates for terminal stream behavior and provider-specific leakage samples.

These tests protect current behavior and fixture boundaries. They are not proof that a secure migration has happened.

---

## 4. Proposed C3 Migration Scope

C3 should be split into small Owner-approved steps. This section proposes scope only; it does not implement it.

### C3a: Main-Process OpenRouter Credential Resolver Read Path

Introduce a main-process OpenRouter credential resolver read path behind the existing behavior-preserving adapter boundary.

Expected intent:

- Keep the current OpenRouter request, Authorization header, baseURL, request body, SSE, error, reasoning, usage, web/file behavior unchanged.
- Use the existing OpenRouter legacy facade as the adapter-side compatibility layer.
- Use resolver failures to fail before fetch where the resolver path is used.
- Do not alter settings UI, preload, or store IPC exposure in this step.

### C3b: Catalog Sync Resolver-Backed Path

If the Owner approves, switch catalog sync from the behavior-preserving legacy wrapper to a resolver-backed path.

Expected intent:

- Preserve catalog sync job input semantics for `apiKey` and `baseUrl`.
- Keep `openRouterCatalogLocalSecret` separate from provider credentials.
- Preserve DB scoped params and HMAC/fingerprint behavior.
- Update characterization tests intentionally if startup behavior changes.

### C3c: Chat/Send Credential Source Migration

Switch the OpenRouter chat/send credential source behind a main-process boundary while preserving current runtime behavior.

Expected intent:

- Preserve Authorization header construction unless explicitly changed.
- Preserve baseURL behavior unless explicitly changed.
- Preserve request body, SSE, error envelope, reasoning, usage, tool, web, and file behavior.
- Avoid turning `appChatApp.logic.ts` into a provider switchboard.
- Keep existing raw legacy compatibility path available until later phases approve removal.

### C3d: Renderer Exposure Compatibility

Keep renderer raw key exposure unchanged until C4, or explicitly define a temporary compatibility bridge if the Owner approves a narrower change.

Expected intent:

- Do not mix C4 settings/preload exposure reduction into C3 by default.
- If a compatibility bridge is needed, define exactly what remains renderer-visible and why.
- Do not claim C3 reduces renderer raw key exposure unless the approved work actually does so.

### C3e: Intentional Test Updates

Update characterization tests only when an approved migration intentionally changes behavior.

Expected intent:

- Keep current characterization gates as baseline until a migration commit changes the target behavior.
- Make test diffs explain whether they preserve current behavior or intentionally update the migration target.
- Keep Generic and non-OpenRouter fixture boundaries unaffected.

---

## 5. Explicit Non-Goals

C3 should not include the following unless the Owner separately expands scope:

- No settings UI redesign.
- No preload/store IPC exposure reduction in C3 unless separately approved.
- No endpoint registry or provider registry.
- No live runtime for non-OpenRouter providers.
- No secure store implementation unless C1 is separately approved.
- No OS keychain or encrypted credential store unless separately approved.
- No DB schema change.
- No Send Plan runtime capability integration.
- No Generic provider production activation.
- No OpenRouter request body, SSE parser, reasoning, usage, web/file, or error-envelope rewrite.
- No Agent, RAG, coding workflow, shell, MCP, LSP, or workspace automation scope.

---

## 6. Decision Points For Owner

1. Should C3 start migrating the OpenRouter chat/send credential source?
2. May C3 introduce a main-process resolver-backed path without changing settings UI?
3. May C3 switch catalog sync from the legacy wrapper to a resolver-backed path?
4. Must C3 preserve existing empty-key behavior until C4, including any currently characterized missing-key or Authorization behavior?
5. May C3 modify tests that characterize legacy behavior when the migration intentionally changes that behavior?
6. Does C3 require C1 secure store implementation first, or may it introduce resolver abstraction first with legacy backing?
7. Should C3 migrate catalog sync before chat/send, after chat/send, or keep catalog sync on the wrapper until a later phase?
8. What compatibility guarantee is required for users who already have `openRouterApiKey` and `openRouterBaseUrl` in electron-store?
9. Should C3 produce temporary dual-read behavior, or should it use a single source with explicit fallback?

---

## 7. C3 Acceptance Criteria

C3 should not be considered complete unless all applicable criteria are met:

- OpenRouter chat/send behavior is unchanged unless the Owner explicitly approves a behavior change.
- Authorization header behavior is preserved or intentionally changed with updated tests and Owner approval.
- BaseURL behavior is preserved or intentionally changed with updated tests and Owner approval.
- Request body, SSE decoding, error envelope, reasoning, usage, tool, web search, and file behavior are preserved.
- No raw key appears in renderer-visible events, stream events, diagnostics, or logs added by C3.
- Credential failures fail before fetch where resolver-backed paths are used.
- Resolver-backed credential failures emit terminal `stream.error` and no `stream.done` where stream events are emitted.
- Existing OpenRouter tests are updated intentionally, not accidentally broken.
- Store IPC and preload exposure changes are deferred to C4 unless separately approved.
- Existing renderer-visible store IPC / preload / settings raw-key exposure remains unchanged in C3 unless C4 is separately approved.
- `openRouterCatalogLocalSecret` remains catalog local secret / HMAC material, not provider credential material.
- Generic remains fixture-only.
- Live runtime for non-OpenRouter providers remains disabled.
- Typecheck has no new provider or OpenRouter credential errors.
- Known unrelated `infra/files/**` LibreOffice/DFC typecheck errors may remain documented if still present.

---

## 8. Rollback Plan

C3 must remain rollback-friendly:

- Revert C3 migration commits independently.
- Keep characterization gates as the baseline until a migration commit intentionally updates them.
- Do not delete the legacy raw key path until C4/C5 explicitly approve exposure reduction and removal.
- Keep the OpenRouter legacy credential facade until the migration is fully accepted.
- Keep catalog wrapper behavior available until resolver-backed catalog sync is accepted.
- Preserve user-readable legacy store keys until a durable migration plan is approved.

Rollback should restore current OpenRouter behavior without requiring DB schema repair, settings UI repair, or registry cleanup.

---

## 9. Risks

| Risk | Why it matters | Control |
|---|---|---|
| Renderer store still exposes raw keys. | C3 may move runtime reads without reducing renderer exposure. | Treat C4 as a separate explicit phase. Do not claim exposure reduction in C3. |
| Active chat/send source migration could break OpenRouter send path. | OpenRouter is the only active runtime. | Keep adapter, live stream, bridge, request builder, SSE, reasoning, usage, and error tests as hard gates. |
| Empty-key behavior is legacy and unpleasant but characterized. | Changing it can affect current error and startup behavior. | Preserve until Owner approves a behavior change. |
| Catalog local secret could be confused with provider credential. | It is HMAC/scope material, not API auth material. | Keep `openRouterCatalogLocalSecret` separate in code, tests, and docs. |
| Resolver seam can be mistaken for secure store. | Resolver seams currently prove wiring only. | Label resolver-backed legacy reads as legacy-backed unless secure store is actually implemented. |
| Characterization tests can block intentional migration. | They lock current behavior by design. | Update them deliberately in the same migration commit that changes behavior. |
| Dual-read migration can create drift. | Two credential sources may disagree. | Define source precedence and fallback rules before implementation. If legacy store and resolver-backed reads coexist during transition, C3 must define which source wins and whether fallback is allowed when one source is missing or invalid. |
| BaseURL normalization drift can break custom endpoint users. | Current baseURL behavior is user-visible. | Preserve current semantics unless explicitly approved. |

---

## 10. Recommended Next Step

Recommended sequence:

1. Mimo reviews and accepts `883c896e test(provider): harden OpenRouter catalog credential seam`.
2. Owner decides whether to enter C3 active credential migration.
3. If yes, produce a precise C3a implementation prompt with explicit file scope, expected behavior preservation, test updates, and rollback boundaries.
4. If no, stop provider credential migration here and move to another provider architecture slice.

The conservative default is to wait for Owner approval before changing any active OpenRouter credential source.
