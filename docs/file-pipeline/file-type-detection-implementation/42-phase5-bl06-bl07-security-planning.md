# 42. Phase 5 BL-06 / BL-07 Security Planning

**状态**: Phase 5 planning — BL-06/BL-07 only
**日期**: 2026-05-10
**阶段**: Phase 5 security planning (narrow scope)
**父文档**: `40-phase4-final-closeout-report.md`, `41-phase4-owner-decision-record.md`

Phase 5 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。
本包是 planning-only。不实现代码。不修复 BL-06 或 BL-07。

---

## 1. Phase 5 Planning Scope

### 1.1 In Scope

| # | Item | Priority |
|---|------|----------|
| BL-06 | `SV_ENGINE_PLUGIN_DEV_MODE=1` production guard | P0 |
| BL-07 | Legacy `messageAsset.*` IPC path/hash sanitization | P0 |

### 1.2 Out of Scope (this package)

- Production trusted root / offline signing workflow (future P5-D)
- Real runtime packaging / model pre-stage (future P5-E)
- Electron manual smoke execution (future P5-C)
- provider_file_ref implementation
- Legacy destructive cleanup
- sendPlanService / appChatApp.logic.ts refactor
- TS error cleanup (17 pre-existing)
- derivativeJobService fix

---

## 2. Phase 4 Handoff State

Phase 4 implementation package accepted with documented blockers.  
P4-D implementation completed and externally audited (Gemini CLI: pass with follow-ups).  
Owner decision recorded (`41-phase4-owner-decision-record.md`).  
Phase 4 remains NOT completed in the strict production sense.  
Phase 5 planning approved, but not started (this package = planning only).

---

## 3. BL-06: Risk Statement

### 3.1 Description

`SV_ENGINE_PLUGIN_DEV_MODE=1` is an environment variable that, when set, activates a test Ed25519 trusted root and overrides the official signature verification chain for engine plugins. There is currently **no guard** preventing this variable from being set in a production (packaged) Electron build.

### 3.2 Attack Surface

| Vector | Description |
|--------|-------------|
| Env leak | Production environment inherits `SV_ENGINE_PLUGIN_DEV_MODE=1` from CI/CD, Docker compose, launch script, or system environment |
| Silent bypass | No diagnostic log, error, or crash when DEV_MODE activates in production — all signature verification silently switches to test keys |
| No packaging guard | `electron/` directory has zero references to `SV_ENGINE_PLUGIN_DEV_MODE`; `app.isPackaged` is never checked against it |
| Worker unconditional | `infra/db/worker/runtime.ts:234` calls `getActiveTrustedRoots()` unconditionally during worker construction, with no packaging context |
| Alt env injection | `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` and `SV_TEST_TRUSTED_ROOTS` env vars (`officialPluginTrustedRoots.ts:23-36`) are parsed before DEV_MODE check. If an attacker can set environment variables, they could inject arbitrary trusted roots without needing DEV_MODE=1. DEV_MODE guard does not protect against this vector. |

### 3.3 Gemini CLI Audit Classification

**P0 — production / configuration / code blocker.** Development mode carried into production bypasses the official trusted root / signature chain and enables test root behavior.

---

## 4. BL-06: Affected Surfaces

### 4.1 Environment Variable Parsing

| File | Line | Function |
|------|------|----------|
| `src/next/file-type/officialPluginTrustedRoots.ts` | 38 | `getActiveTrustedRoots()` — runtime check: `env.SV_ENGINE_PLUGIN_DEV_MODE === '1'` activates test trusted root. Uses `process.env` by default (no explicit parameter). |

### 4.2 Trusted Root / Test Root Handling

| File | Line | Function |
|------|------|----------|
| `src/next/file-type/officialPluginTrustedRoots.ts` | 3-9 | `OFFICIAL_ROOT_ID`, `TEST_ROOT_ID`, hardcoded test Ed25519 PEM key |
| `src/next/file-type/officialPluginTrustedRoots.ts` | 15-46 | `getActiveTrustedRoots()` — priority: `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` (production key via env) → `SV_TEST_TRUSTED_ROOTS` (test key via env) → dev/test fallback (if VITEST/NODE_ENV=test/DEV_MODE=1) → returns `official_trusted_root_unconfigured` error |
| `src/next/file-type/officialPluginTrustedRoots.ts` | 49-67 | `createTestTrustedRoots()`, `createOfficialTrustedRoots()` |
| `src/next/file-type/officialPluginTrustedRoots.ts` | 69-94 | `parseTrustedRootsJson()` — validates Ed25519 + PEM format |

### 4.3 Manifest / Plugin Registry Initialization

| File | Line | Function |
|------|------|----------|
| `infra/db/worker/runtime.ts` | 234-238 | Worker constructor: `getActiveTrustedRoots()` (uses `process.env` by default) → `trustedRoots` + `trustedRootSource` → `EnginePluginLifecycleService`. No packaging context passed.
| `infra/files/enginePluginLifecycleService.ts` | 91-92 | `trustedRoots: TrustedCatalogPublicKeyMap`, `trustedRootSource?: 'official' \| 'test' \| null` |
| `infra/files/enginePluginLifecycleService.ts` | 349-357 | `getRecommendedInstallRootKind()` / `isValidInstallRootKind()` — official source → `managed_root`, rejects `test_root`; test source → `test_root` |
| `infra/files/enginePluginLifecycleService.ts` | 362-368 | `loadAndVerifyCatalog()` — fails if `trustedRoots` empty; verifies catalog signatures with active keys |

### 4.4 Production Packaging Boundary

| File | Line | Check |
|------|------|-------|
| `electron/main.ts` | 53 | `isDev = process.env.NODE_ENV === 'development' \|\| !app.isPackaged` — **NOT connected to SV_ENGINE_PLUGIN_DEV_MODE** |
| `electron/db/workerManager.ts` | 257-265 | `db.reset()` guard: `NODE_ENV === 'production'` or `app.isPackaged` → throw `ERR_FORBIDDEN` — **model for BL-06 guard, but does not cover DEV_MODE** |
| `electron/` | — | **Zero references** to `SV_ENGINE_PLUGIN_DEV_MODE` anywhere in Electron code |

### 4.5 Logs / Diagnostics

| File | Line | Context |
|------|------|----------|
| `src/next/file-type/officialPluginTrustedRoots.ts` | 44-46 | Fallback path returns `kind: 'unconfigured'` with message `'official plugin trusted roots are not configured'` — **but no log when DEV_MODE=1 activates in production** |
| `electron/ipc/logSanitizer.ts` | 10 | Sanitizes `contentToken` from logs — model for sanitized security events |

---

## 5. BL-06: Implementation Options

### Option A: Hard Startup Reject
If `SV_ENGINE_PLUGIN_DEV_MODE=1` is set and `app.isPackaged`:
- Throw a fatal error at Electron startup.
- No fallback, no override.
- **Pros**: Strongest guarantee. **Cons**: No emergency dev override on a packaged build.

### Option B: Force-Ignore Outside Dev
If `!isDev && SV_ENGINE_PLUGIN_DEV_MODE=1`:
- Ignore the variable (treat as if unset).
- Log a sanitized security warning.
- **Pros**: Graceful. **Cons**: Silently changing behavior may confuse operators.

### Option C: Build-Time Guard
Electron packaging script (e.g. `electron-builder` config) strips or asserts `SV_ENGINE_PLUGIN_DEV_MODE` from the packaged env.
- **Pros**: Prevents the variable from reaching runtime at all.
- **Cons**: Only as strong as the build pipeline; doesn't help with unpackaged production runs.

### Option D: Packaged App Guard (Recommended Primary)
In `electron/main.ts`, before `getActiveTrustedRoots()` is called (before worker construction):
- Check `app.isPackaged && process.env.SV_ENGINE_PLUGIN_DEV_MODE === '1'`.
- If true: log sanitized security event, then either throw fatal error (fail-closed) or force-unset.
- **Pros**: Direct enforcement at the boundary. Reuses existing `app.isPackaged` pattern.

### Option E: Worker-Side Guard
In `infra/db/worker/runtime.ts:234`, before calling `getActiveTrustedRoots()`:
- Check a new `isProduction` flag passed from Electron main process.
- Reject DEV_MODE=1.
- **Pros**: Guards the actual call site. **Cons**: Worker doesn't have `app.isPackaged` context.

### Option F: `getActiveTrustedRoots()` Internal Guard
Add an `isPackaged: boolean` parameter to `getActiveTrustedRoots()`:
- If `isPackaged && SV_ENGINE_PLUGIN_DEV_MODE === '1'`: return `official_trusted_root_unconfigured` (or throw).
- **Pros**: Single enforcement point. **Cons**: Requires API change; all callers must provide packaging context.

---

## 6. BL-06: Recommended Implementation Strategy

### 6.1 Primary Guard: Packaged App + Worker Combined

**Phase 5-A implementation**:

1. **Electron main process guard** (fail-closed):
   - In `electron/main.ts`, before worker construction, check:
     ```ts
     if (app.isPackaged && process.env.SV_ENGINE_PLUGIN_DEV_MODE === '1') {
       logSecurityEvent('sv_engine_plugin_dev_mode_rejected_in_production');
       app.exit(1); // or throw fatal error
     }
     ```

2. **Worker-side defense-in-depth**:
   - In `infra/db/worker/runtime.ts:234`, accept an `isProduction: boolean` parameter.
   - In `getActiveTrustedRoots()`, add `isProduction?: boolean` parameter.
   - If `isProduction && SV_ENGINE_PLUGIN_DEV_MODE === '1'`: return `official_trusted_root_unconfigured`.

3. **Security event logging**:
   - Use sanitized channel (no paths, no secrets, no contentToken).
   - Event ID: `sv_engine_plugin_dev_mode_rejected_in_production`.
   - Include `app.isPackaged`, `NODE_ENV` (sanitized), timestamp.

### 6.2 Behavior by Context

| Context | DEV_MODE=1 | Behavior |
|---------|-----------|----------|
| Dev (unpackaged, `NODE_ENV=development`) | Allowed | Test trusted root active |
| Test (unpackaged, `VITEST` or `NODE_ENV=test`) | Allowed | Test trusted root active |
| CI (unpackaged, `CI=true`) | Allowed | Test trusted root active |
| Packaged production (`app.isPackaged`) | **Rejected** | Fatal error or force-unset |
| Unpackaged but `NODE_ENV=production` | **Rejected** | Same as packaged |

### 6.3 Emergency Override

No runtime override for production. If emergency dev access is needed on a packaged build:
- Use a separate, explicitly named env var (e.g. `SV_ENGINE_PLUGIN_EMERGENCY_DEV_UNLOCK`) that:
  - Requires an additional secret token or file presence.
  - Logs a high-severity sanitized audit event.
  - Auto-expires after a time window.
- This is a Phase 5 follow-up consideration, not part of the BL-06 MVP fix.

---

## 7. BL-06: Test Matrix

| # | Test | Category | Expected |
|---|------|---------|----------|
| BL-06-T1 | `getActiveTrustedRoots({ SV_ENGINE_PLUGIN_DEV_MODE: '1' }, { isProduction: true })` returns unconfigured | Unit | `official_trusted_root_unconfigured` |
| BL-06-T2 | `getActiveTrustedRoots({ SV_ENGINE_PLUGIN_DEV_MODE: '1' }, { isProduction: false })` returns test root | Unit | test trusted root active |
| BL-06-T3 | Packaged app with DEV_MODE=1 → startup rejected | Integration | Fatal error / exit code 1 |
| BL-06-T4 | Unpackaged dev with DEV_MODE=1 → startup normal | Integration | Test trusted root active |
| BL-06-T5 | CI with DEV_MODE=1 → tests pass | Integration | Test trusted root available |
| BL-06-T6 | Security event logged when DEV_MODE rejected | Unit | Sanitized event, no paths/secrets |
| BL-06-T7 | `SV_ENGINE_PLUGIN_DEV_MODE=0` or unset in production → normal | Regression | Official trusted root used |
| BL-06-T8 | Grep for `SV_ENGINE_PLUGIN_DEV_MODE` usage in `electron/` | Audit | Guard code present, no bypass paths |
| BL-06-T9 | `app.isPackaged && DEV_MODE=1` → worker `trustedRootSource` is not `'test'` | Integration | `trustedRootSource` is `null` or `'official'` |

### 7.1 Regression Grep

```
rg -n "SV_ENGINE_PLUGIN_DEV_MODE" electron/
rg -n "SV_ENGINE_PLUGIN_DEV_MODE" src/ infra/
rg -n "app\.isPackaged" electron/
```

---

## 8. BL-06: Rollback / Deployment Safety

### 8.1 Disabling the Guard During Emergency Development

- The guard must NOT have a runtime `SV_ENGINE_PLUGIN_DEV_MODE` bypass for production.
- Emergency dev access on a packaged build requires the `SV_ENGINE_PLUGIN_EMERGENCY_DEV_UNLOCK` mechanism (future consideration, not BL-06 MVP).
- For CI/CD pipeline testing: build with a non-packaged configuration.

### 8.2 Diagnosing False Positives

- Security event log (sanitized) records: timestamp, `app.isPackaged`, `NODE_ENV`, guard trigger reason.
- If production falsely detects DEV_MODE=1: check system environment, launch scripts, Docker/dotenv files for leaked variable.
- Add startup diagnostic in dev mode: `console.log('[dev] SV_ENGINE_PLUGIN_DEV_MODE detected, test trusted root active')` — only in non-production.

---

## 9. BL-07: Risk Statement

### 9.1 Description

Legacy `messageAsset.*` IPC contracts, Zod schemas, and renderer DTOs include raw local file system paths (`path`), file URLs (`fileUrl`), and content hashes (`hash`) in fields transmitted to the renderer process. While the current renderer-side IPC client code is **stubbed** (returns empty arrays, does not call IPC), the IPC infrastructure — schemas, decoders, and UI consumption paths — is fully wired to accept and render these sensitive fields if the stubs are ever removed.

### 9.2 Current State (Critical Context)

| Layer | Status |
|-------|--------|
| IPC handler `messageAsset.persistFromDataUrls` | **Stubbed** — returns `{ok:true, assets:[]}` |
| IPC handler `messageAsset.listByMessageIds` | **Stubbed** — returns `[]` |
| IPC handler `messageAsset.getById` | **Active** (main process only, `renderer: false`) — has `isPathWithinRoot()` guard |
| IPC schema `messageAssetSchema` | **Defines** `path`, `fileUrl`, `assetUrl`, `hash` as validated output fields |
| IPC decoder `decodeMessageAssetListResponse` | **Exports** all fields for renderer use |
| Renderer client `messageClient.ts` | **Stubbed** — `persistMessageImageAssetsFromDataUrls()` returns `[]`, `listMessageImageAssetsByMessageIds()` returns `[]` |
| UI consumption `resolveImageRenderUrl()` | **Has fallback chain**: `assetUrl` → `fileUrl` → `path` for `<img src>` — dangerous if unstubbed |

**Key finding**: There is currently **no active path/hash leak to renderer** because the IPC methods are stubbed. The risk is that the stubs are the only protection; the infrastructure underneath is fully ready to leak if un-stubbed.

### 9.3 Attack Surface

| Vector | Description |
|--------|-------------|
| Stub removal | If any developer removes a stub (e.g., to re-enable image attachment display), `path`, `fileUrl`, and `hash` immediately flow to renderer |
| `resolveImageRenderUrl` fallback | If `assetUrl` is empty, the function falls back to `fileUrl` then `path` — injecting raw paths into DOM `<img src>` |
| `fileUrl` → `file:///` protocol | Electron renderer accessing `file://` URLs exposes local file system paths |
| `hash` exposure | Full SHA-256 content hash transmitted — potential content identification/de-duplication leak |
| `DecodedMessageAsset` type | Type definition in `dbBridgeContracts.ts:36-48` includes all sensitive fields without `@deprecated` or security annotations |

### 9.4 Gemini CLI Audit Classification

**P0 — privacy / code blocker.** Raw local paths, file URLs, and content hashes transmitted to renderer without sanitization.

---

## 10. BL-07: Affected IPC Surfaces

### 10.1 IPC Schema / DTO (Source of Sensitive Fields)

| File | Line | Field | Risk |
|------|------|-------|------|
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 36-48 | `DecodedMessageAsset` type: `path`, `fileUrl`, `assetUrl`, `hash` | Source type |
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 315-339 | `messageAssetSchema` (Zod): validates + transmits all fields | IPC output schema |
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 832-835 | `messageAssetPersistAckSchema` wraps `messageAssetSchema` | Inherits risk |
| `infra/db/types.ts` | 236-248 | `MessageAssetRecord`: `path`, `fileUrl`, `hash`, `bytes` | DB row type |

### 10.2 IPC Decoders (Renderer-Side)

| File | Line | Function |
|------|------|----------|
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 995-1009 | `decodeMessageAssetPersistResponse()` — decodes all fields |
| `src/next/ipc/contracts/dbBridgeContracts.ts` | 1012-1027 | `decodeMessageAssetListResponse()` — decodes all fields |

### 10.3 IPC Handlers (Worker-Side)

| File | Line | Method | renderer access | Actual behavior |
|------|------|--------|-----------------|-----------------|
| `infra/db/worker/handlers/convoMessageHandlers.ts` | 292-295 | `messageAsset.persistFromDataUrls` | `renderer: true` | **Stubbed** → `{ok:true, assets:[]}` |
| `infra/db/worker/handlers/convoMessageHandlers.ts` | 297-300 | `messageAsset.listByMessageIds` | `renderer: true` | **Stubbed** → `[]` |
| `infra/db/worker/handlers/convoMessageHandlers.ts` | 302-305 | `messageAsset.getById` | `renderer: false` | **Active** → `repo.getById()` |

### 10.4 IPC Registry

| File | Line | Method | renderer |
|------|------|--------|----------|
| `infra/db/dbMethodsRegistry.ts` | 44 | `messageAsset.persistFromDataUrls` | true |
| `infra/db/dbMethodsRegistry.ts` | 45 | `messageAsset.listByMessageIds` | true |
| `infra/db/dbMethodsRegistry.ts` | 46 | `messageAsset.getById` | **false** |

### 10.5 Renderer Client (Stubbed)

| File | Line | Function | Behavior |
|------|------|----------|----------|
| `src/next/message/messageClient.ts` | 186-192 | `persistMessageImageAssetsFromDataUrls()` | Stubbed → returns `[]` |
| `src/next/message/messageClient.ts` | 194-197 | `listMessageImageAssetsByMessageIds()` | Stubbed → returns `[]` |

### 10.6 UI Consumption (Dangerous Fallback Chain)

| File | Line | Function | Risk |
|------|------|----------|------|
| `src/ui-app/app/appChatApp.logic.ts` | 1211-1217 | `resolveImageRenderUrl(asset)` | `assetUrl` → `fileUrl` → `path` fallback for `<img src>` |
| `src/ui-app/app/appChatApp.logic.ts` | 1234-1249 | `replaceMessageDataImageBlocks()` | Calls `resolveImageRenderUrl` |
| `src/ui-app/app/appChatApp.logic.ts` | 1279-1333 | `applyHydratedImageAssetsToState()` | Injects `PersistedMessageImageAsset` objects into Vue state |
| `src/ui-app/app/appChatApp.logic.ts` | 1698-1714 | `hydrateMessageAssetsForRows()` | Calls `listMessageImageAssetsByMessageIds()` (stubbed) |

### 10.7 Main Process (Secure — Model for Renderer Boundary)

| File | Line | Function | Safeguard |
|------|------|----------|-----------|
| `electron/main.ts` | 452-481 | `resolveAssetFileByUrl()` | `isPathWithinRoot()` before serving files |
| `electron/main.ts` | 483-511 | `registerAssetProtocol()` | Renderer sees only `asset://<id>` URLs |

---

## 11. BL-07: Sanitization / DTO Strategy

### 11.1 Design Principle

**Renderer must never receive**: `path`, `fileUrl`, `hash`, `contentToken`, or any local file reference.

### 11.2 Renderer-Safe DTO

Define a new/replacement output type for renderer-bound message asset data:

| Field | Included? | Notes |
|-------|-----------|-------|
| `assetId` | Yes | Opaque identifier |
| `assetUrl` (`asset://<id>`) | Yes | Safe; resolved by main process with path traversal guard |
| `mime` | Yes | MIME type for UI display |
| `width` / `height` | Yes | Dimensions for layout |
| `ordinal` | Yes | Ordering |
| `messageId` | Yes | Association |
| `path` | **No** | Raw filesystem path |
| `fileUrl` (`file:///...`) | **No** | Exposes local path |
| `hash` | **No** | Full SHA-256 content hash |
| `bytes` | **No** | Raw binary data |
| `contentToken` | **No** | If present |

### 11.3 IPC Schema Strategy

**Option 1 (Recommended)**: Strip sensitive fields from the Zod output schema.

```ts
// Current: messageAssetSchema includes path, fileUrl, hash
// Proposed: messageAssetRenderSchema = messageAssetSchema.omit({ path: true, fileUrl: true, hash: true, bytes: true })
```

**Option 2**: Transform at decode boundary — add `.transform()` to strip fields before they reach the renderer client.

**Option 3**: Deny-by-default — only whitelist `assetId`, `assetUrl`, `mime`, `width`, `height`, `ordinal`, `messageId`.

### 11.4 Renderer Client Strategy

1. Keep current stubs in place until schema/DTO is hardened.
2. Before removing any stub, verify that:
   - The IPC output schema strips `path`/`fileUrl`/`hash`.
   - The renderer client type does not include these fields.
   - `resolveImageRenderUrl()` fallback chain is reduced to `assetUrl` only.
3. Remove `fileUrl`/`path` fallbacks from `resolveImageRenderUrl()`.

### 11.5 Compatibility

- **Main process `getById`**: Unchanged — needs `path` to resolve files via `asset://` protocol. `renderer: false` already enforced.
- **DB schema**: Unchanged — `message_asset` table continues to store all fields internally.
- **Legacy tests**: May need fixture updates but should not be removed.

---

## 12. BL-07: Test Matrix

| # | Test | Category | Expected |
|---|------|---------|----------|
| BL-07-T1 | IPC output schema omits `path` from renderer-bound response | Unit | Schema validation rejects `path` |
| BL-07-T2 | IPC output schema omits `fileUrl` from renderer-bound response | Unit | Schema validation rejects `fileUrl` |
| BL-07-T3 | IPC output schema omits `hash` from renderer-bound response | Unit | Schema validation rejects `hash` |
| BL-07-T4 | `decodeMessageAssetListResponse` returns only safe fields | Unit | No `path`/`fileUrl`/`hash` in decoded output |
| BL-07-T5 | `resolveImageRenderUrl` uses `assetUrl` only (no `fileUrl`/`path` fallback) | Unit | Returns `assetUrl` or placeholder |
| BL-07-T6 | Grep for `path`/`fileUrl`/`hash` in renderer IPC output | Audit | 0 hits in renderer-bound DTOs |
| BL-07-T7 | Main process `getById` behavior unchanged | Regression | `isPathWithinRoot()` still guards file access |
| BL-07-T8 | Renderer client `listMessageImageAssetsByMessageIds` unstubbed → no leak | Integration | Safe fields only in Vue state |
| BL-07-T9 | `asset://` protocol resolution unchanged | Regression | `electron/main.ts:452-481` works as before |

### 12.1 Grep Verification

```
rg -n "path:|fileUrl:|hash:" src/next/ipc/contracts/dbBridgeContracts.ts
rg -n "resolveImageRenderUrl" src/ui-app/app/appChatApp.logic.ts
rg -n "fileUrl|rawPath|localPath" src/next/message/
```

---

## 13. BL-07: Migration / Compatibility / Rollback

### 13.1 Avoid Destructive Cleanup

- Do NOT drop the `message_asset` table.
- Do NOT remove main-process `getById`.
- Keep all DB columns intact.
- Only modify the **renderer-bound IPC output boundary**.

### 13.2 Preserve UI Behavior

- Image display via `asset://` protocol continues to work.
- The `asset://` URL is the only path to renderer; main process resolves it securely.
- If `assetUrl` is missing for a legacy record, display a placeholder (not a fallback to `fileUrl`/`path`).

### 13.3 Rollback

- The IPC schema change is additive (new safe schema alongside old full schema).
- Old schema remains available as an internal (main-process-only) variant.
- If rollback needed: reconnect renderer to old schema path (temporary, with explicit risk acknowledgement).

---

## 14. Shared Security Principles

These principles apply to both BL-06 and BL-07 and must guide Phase 5 implementation:

1. **No raw local paths to renderer** — Strip or sanitize before IPC boundary.
2. **No `fileUrl` leakage** — `file://` URLs must not cross to renderer.
3. **No complete hash leakage** — Content hashes are internal; use opaque IDs.
4. **No `contentToken` leakage** — Already sanitized in `logSanitizer`; extend to all IPC.
5. **Test/dev roots cannot leak into production** — `SV_ENGINE_PLUGIN_DEV_MODE=1` rejected in packaged/production builds.
6. **Production build must fail closed** — Guards are deny-by-default; allow only in explicit dev/test/CI contexts.

---

## 15. Phase 5 Implementation Subpackages (High-Level)

| Sub-package | Scope | Depends On |
|-------------|-------|------------|
| **P5-A** | BL-06: Production dev-mode guard | — |
| **P5-B** | BL-07: messageAsset IPC path leak fix | — |
| **P5-C** | Security regression testing + Electron smoke planning | P5-A, P5-B |
| **P5-D** | Trusted root / signing workflow planning (future) | P5-A |
| **P5-E** | Real runtime packaging planning (future) | — |

P5-D and P5-E are future planning placeholders. Do not elaborate implementation plans in this document.

---

## 16. Non-Goals

| # | Non-Goal |
|---|----------|
| 1 | No `provider_file_ref` implementation |
| 2 | No legacy `message_asset` destructive cleanup |
| 3 | No real runtime packaging (Tika/LO/ffprobe/Pandoc) |
| 4 | No production signing implementation |
| 5 | No `sendPlanService` refactor |
| 6 | No `appChatApp.logic.ts` full refactor |
| 7 | No TS error cleanup (17 pre-existing) |
| 8 | No `derivativeJobService` fix |
| 9 | No Electron manual smoke execution |
| 10 | No `contentToken`/`fullHash` sanitization expansion in P5-A/P5-B — existing `logSanitizer` and `sanitizeForProcessResult` coverage adequate for this scope; full IPC DTO audit deferred to P5-C |

---

## 17. Acceptance Commands

### 17.1 Preflight

```
git status --short
git log -10 --oneline
```

### 17.2 Documentation Checks

```
git diff --check
git diff --name-only
```

### 17.3 Recommended Scoped Tests (After Future Implementation)

```
npx vitest --run src/next/file-type/externalEngineRegistry.test.ts src/next/file-type/externalEngineManifest.test.ts src/next/file-type/externalEngineHealth.test.ts
npx vitest --run src/next/file-type/externalProcessPolicy.test.ts src/next/file-type/externalProcessRunner.test.ts
npx vitest --run src/next/ipc/**/*.test.ts src/next/files/**/*.test.ts
npx vitest --run infra/files/conversationAttachmentService.test.ts infra/db/repo/messageAssetRepo.test.ts
```

### 17.4 Known Baseline (Expected to Fail — Separate Cleanup)

```
npx tsc --noEmit                       # 17 pre-existing errors
npx vitest --run infra/files/derivativeJobService.test.ts  # 1 pre-existing failure
```

---

## 18. Grep Scans

### 18.1 BL-06 Surface Scan

```
rg -n "SV_ENGINE_PLUGIN_DEV_MODE|ENGINE_PLUGIN_DEV_MODE|plugin dev|devMode|trustedRoot|testRoot|dev root|trusted root" src infra electron docs
```

### 18.2 Completion Claim Scan

```
rg -n "Phase 4 completed|Phase 4 implementation completed|主工程已完成|完整插件系统已完成|真实 Tika runtime 已完成|真实 LibreOffice runtime 已完成|真实 ffprobe runtime 已完成|真实 Pandoc runtime 已完成|第三方插件生态已完成|全项目完成" docs/file-pipeline/file-type-detection-implementation
```

### 18.3 Legacy messageAsset Surfaces

```
rg -n "messageAsset|message_asset|fileUrl|rawPath|localPath|storageUri|contentToken|fullHash|sha256|hash" src infra electron
```

### 18.4 Renderer Path Leak Scan

```
rg -n "([A-Za-z]:\\\\|file://|/Users/|/home/|/mnt/)" src/ui-app src/ui-kit src/next electron infra
```

### 18.5 Log Leak Scan

```
rg -n "console\\.(log|warn|error).*([A-Za-z]:\\\\|file://|/Users/|/home/|/mnt/|contentToken|fullHash|storageUri)" src infra electron
```

### 18.6 Shell/Process Guard Scan

```
rg -n "shell\\s*:\\s*true|exec\\(|spawn\\(|execFile\\(" src infra electron
```

---

## 19. External Audit Handoff

After Phase 5 P5-A / P5-B planning (this document) is reviewed, and after P5-A / P5-B implementation is completed, the following should be handed to Gemini CLI or another external auditor:

1. This planning document (`42-phase5-bl06-bl07-security-planning.md`).
2. All changed source files from P5-A and P5-B commits.
3. Test results from the BL-06 and BL-07 test matrices (§7, §12).
4. Grep scan results (§18) post-implementation.
5. Security event log samples (sanitized).

**Gemini CLI** is an external audit tool only. It does not support `/flash-*` commands (flash-read-code, flash-run-test, flash-risk-review, flash-doc-check). Those commands are Opencode session tools only.

---

## 20. Pre-Implementation Baseline (Current Session)

### 20.1 git status

```
Working tree: clean
HEAD: a5f556e (docs: record phase 4 owner closeout decision)
```

### 20.2 Grep Scan Results (Run in This Session)

| Scan | Result |
|------|--------|
| Improper completion claims | 0 improper (all hits are negations/forbid-items) |
| Log leak scan | 0 hits |
| Shell:true in production | 0 hits (test-only rejection tests) |
| BL-06 surface scan | Confirmed: `SV_ENGINE_PLUGIN_DEV_MODE` check only at `officialPluginTrustedRoots.ts:38`; zero guards in `electron/` |
| BL-07 surface scan | Confirmed: IPC schema + decoders defined; handlers stubbed; `resolveImageRenderUrl` has dangerous fallback chain; `getById` secure (main process only) |

### 20.3 Known Baseline Issues

| Issue | Status |
|-------|--------|
| 17 pre-existing TS errors | Unchanged |
| derivativeJobService HTML targetKind failure | Unchanged |
| 43 manual smoke cases not_run | Unchanged |
| Real Tika/LO/ffprobe/Pandoc runtime not in repo | Unchanged |
| Production trusted root / signing not implemented | Unchanged |
| Real runtime packaging / model pre-stage not implemented | Unchanged |

---

## 21. Commit

- **文件**: `42-phase5-bl06-bl07-security-planning.md` (new)
- **READNE**: 索引 + 状态更新
- **commit message**: `docs: plan phase 5 bl06 bl07 security blockers`
