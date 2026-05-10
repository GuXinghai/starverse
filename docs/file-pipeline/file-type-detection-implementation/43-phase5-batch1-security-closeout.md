# 43. Phase 5 Batch 1 Security Closeout

**状态**: Phase 5 batch 1 P5-A/P5-B/P5-C completed
**日期**: 2026-05-10
**阶段**: Phase 5 batch 1 closeout — P5-A, P5-B, P5-C
**父文档**: `42-phase5-bl06-bl07-security-planning.md`, `41-phase4-owner-decision-record.md`

Phase 5 batch 1 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。
Phase 5 仍开放 P5-D（trusted root / signing）和 P5-E（real runtime packaging）。

---

## 1. Scope

| Sub-package | Blocker | Description | Status |
|-------------|---------|-------------|--------|
| P5-A | BL-06 | Production dev-mode guard (`SV_ENGINE_PLUGIN_DEV_MODE=1`) | **completed** |
| P5-B | BL-07 | Legacy `messageAsset` IPC path/hash sanitization | **completed** |
| P5-C | — | Security regression + closeout documentation | **completed** |

---

## 2. P5-A: BL-06 Production Dev-Mode Guard

### 2.1 Implementation

| Layer | File | Change |
|-------|------|--------|
| Core guard | `src/next/file-type/officialPluginTrustedRoots.ts` | Added `options?: { isProduction?: boolean }` parameter. If `isProduction && SV_ENGINE_PLUGIN_DEV_MODE === '1'`, returns `official_trusted_root_unconfigured` instead of test roots |
| Config type | `infra/db/types.ts` | Added `isProduction?: boolean` to `WorkerInitConfig` |
| Worker | `infra/db/worker/runtime.ts` | Passes `config.isProduction` to `getActiveTrustedRoots()` |
| Worker manager | `electron/db/workerManager.ts` | Computes and passes `isProduction` via `workerData` |
| Main process | `electron/main.ts` | Guard before worker start: `app.exit(1)` if `isProduction && DEV_MODE=1`. Logs sanitized security event `sv_engine_plugin_dev_mode_rejected_in_production` |

### 2.2 Behavior Matrix

| Context | DEV_MODE=1 | Result |
|---------|-----------|--------|
| Dev (unpackaged, NODE_ENV=development) | Allowed | Test trusted root active |
| Test (VITEST=true / NODE_ENV=test) | Allowed | Test trusted root active |
| Packaged production (app.isPackaged) | **Rejected** | `app.exit(1)` or `official_trusted_root_unconfigured` |
| NODE_ENV=production (unpackaged) | **Rejected** | Same as packaged |
| SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS in production | Allowed | Official roots active (production key) |

### 2.3 Test Results

| File | Tests | Result |
|------|-------|--------|
| `officialPluginTrustedRoots.test.ts` | 20 (12 original + 8 new) | 20/20 pass |

### 2.4 Risk Review

Flash-risk-review result: **APPROVED**. Two-layer defense (main process exit + worker-internal guard). No bypass paths found.

### 2.5 Commit

`059688d` — `fix: guard engine plugin dev mode in production`

---

## 3. P5-B: BL-07 messageAsset IPC Sanitization

### 3.1 Implementation

| Layer | File | Change |
|-------|------|--------|
| IPC types | `src/next/ipc/contracts/dbBridgeContracts.ts` | Added `DecodedMessageAssetRender` type (omits `path`, `fileUrl`, `hash`, `bytes`). Extracted `messageAssetObjectSchema` base; added `messageAssetRenderSchema` with `.omit()`. `messageAssetPersistAckSchema` and decoders use render-safe schema |
| Client type | `src/next/message/messageClient.ts` | `PersistedMessageImageAsset` stripped: removed `hash`, `bytes`, `path`, `fileUrl` |
| UI fallback | `src/ui-app/app/appChatApp.logic.ts` | `resolveImageRenderUrl()` removed `fileUrl` and `path` fallback; uses only `assetUrl` |

### 3.2 Sanitization Boundary

| Field | Renderer | Main Process |
|-------|----------|-------------|
| `assetId` | ✓ | ✓ |
| `assetUrl` (`asset://<id>`) | ✓ | ✓ |
| `mime`, `width`, `height` | ✓ | ✓ |
| `ordinal`, `messageId` | ✓ | ✓ |
| `path` | **Blocked** | ✓ (internal) |
| `fileUrl` (`file:///...`) | **Blocked** | ✓ (internal) |
| `hash` (SHA-256) | **Blocked** | ✓ (internal) |
| `bytes` | **Blocked** | ✓ (internal) |

### 3.3 Stubs Status

IPC handlers `persistFromDataUrls` and `listByMessageIds` remain **stubbed** (return `[]`). The sanitization is defense-in-depth — if stubs are ever removed, the IPC output is hardened and will not leak path/fileUrl/hash to renderer.

### 3.4 Test Results

| File | Tests | Result |
|------|-------|--------|
| `dbBridgeContracts.test.ts` | 168 (164 original + 4 new BL-07) | 168/168 pass |
| `messageAssetRepo.test.ts` | 2 | 2/2 pass |
| `messageAssetRepo.codec.test.ts` | 4 | 4/4 pass |
| `conversationAttachmentService.test.ts` | 12 | 12/12 pass |

### 3.5 Risk Review

Flash-risk-review result: **APPROVED**. No P0/P1 issues. Zod schema properly strips sensitive fields; TypeScript type enforcement prevents re-introduction. Internal repo types untouched.

### 3.6 Commit

`af6cbd3` — `fix: sanitize legacy message asset ipc output`

---

## 4. P5-C: Security Regression Verification

### 4.1 Regression Test Suite

| Test Group | Files | Tests | Result |
|------------|-------|-------|--------|
| File-type external engines | 6 files | 62 | 62/62 pass |
| IPC contracts + messageAsset | 4 files | 186 | 186/186 pass |
| **Total P5-A/P5-B regression** | **10 files** | **248** | **248/248 pass** |

### 4.2 Grep Scans

| Scan | Pattern | Result |
|------|---------|--------|
| Forbidden completion claims | `Phase 5 completed`, `Phase 4 completed`, `全项目完成`, etc. | **0 hits** (all negations/forbidden-items) |
| BL-06 guard verification | `SV_ENGINE_PLUGIN_DEV_MODE` in `electron/` | **2 hits** — guard + security event in `main.ts` |
| BL-07 UI fallback verification | `resolveImageRenderUrl` in `appChatApp.logic.ts` | **0 hits** on `fileUrl`/`path` — only uses `assetUrl` |
| Log leak scan | Paths/secrets in console.log/warn/error | **0 hits** |
| Shell:true scan | `shell:\s*true\|exec\(\|spawn\(\|execFile\(` | **0 hits** in production code |

### 4.3 Known Baseline Issues (unchanged)

| Issue | Status |
|-------|--------|
| 17 pre-existing TS errors | Unchanged |
| derivativeJobService HTML targetKind failure | Unchanged |
| 43 manual smoke cases not_run | Unchanged |
| Real Tika/LO/ffprobe/Pandoc runtime not in repo | Unchanged |
| Production trusted root / signing not implemented | Unchanged |
| Real runtime packaging / model pre-stage not implemented | Unchanged |

### 4.4 Changed Files

```
src/next/file-type/officialPluginTrustedRoots.ts
src/next/file-type/officialPluginTrustedRoots.test.ts
infra/db/types.ts
infra/db/worker/runtime.ts
electron/db/workerManager.ts
electron/main.ts
src/next/ipc/contracts/dbBridgeContracts.ts
src/next/ipc/contracts/dbBridgeContracts.test.ts
src/next/message/messageClient.ts
src/ui-app/app/appChatApp.logic.ts
docs/file-pipeline/file-type-detection-implementation/43-phase5-batch1-security-closeout.md (new)
docs/file-pipeline/file-type-detection-implementation/README.md
```

---

## 5. Electron Manual Smoke Planning

All manual smoke items remain `not_run` pending Electron + real runtime environment.

### 5.1 P5-A Smoke Items

| # | Item | Status |
|---|------|--------|
| SM-1 | App startup with no plugins (verify no crash) | not_run |
| SM-2 | App startup with SV_ENGINE_PLUGIN_DEV_MODE unset (normal) | not_run |
| SM-3 | App startup with SV_ENGINE_PLUGIN_DEV_MODE=1 in dev mode | not_run |
| SM-4 | Packaged production simulation with SV_ENGINE_PLUGIN_DEV_MODE=1 (expect rejection) | not_run |
| SM-5 | Security event log inspection (verify sanitized, no paths) | not_run |
| SM-6 | Plugin settings panel shows unconfigured status in production | not_run |

### 5.2 P5-B Smoke Items

| # | Item | Status |
|---|------|--------|
| SM-7 | File upload with historical message attachments | not_run |
| SM-8 | Image preview from asset:// protocol | not_run |
| SM-9 | History attachment display with no raw path in DOM | not_run |
| SM-10 | Plugin unavailable fallback display | not_run |

### 5.3 General Smoke Items

| # | Item | Status |
|---|------|--------|
| SM-11 | Logs inspected for path / contentToken / fullHash | not_run |
| SM-12 | Console free of unexpected errors on startup | not_run |
| SM-13 | Settings UI renders correctly with no plugin installed | not_run |

---

## 6. Remaining Blockers

### 6.1 Phase 5 Open Items

| # | Item | Phase |
|---|------|-------|
| P5-D | Production trusted root / offline signing workflow | Future |
| P5-E | Real runtime packaging (Tika/LO/ffprobe/Pandoc) | Future |
| BL-01~BL-04 | Owner decision items (production key, catalog signing) | Owner dependency |
| BL-05 | Real runtime packaging implementation | Phase 5 future |

### 6.2 Maintenance Items (P2)

| # | Item |
|---|------|
| M-1 | 17 pre-existing TS errors |
| M-2 | derivativeJobService HTML targetKind failure |
| M-3 | P1-1: Unix path sanitization — 5 runners |
| M-4 | P1-2: Hash sanitization strategy alignment |
| M-5 | P1-3: provider_file_ref IPC schema rejection |
| M-6 | P1-4: installRef sanitization |

---

## 7. Security Conclusions

### 7.1 BL-06 Status

`SV_ENGINE_PLUGIN_DEV_MODE=1` is now guarded at two layers:
1. **Main process**: `app.exit(1)` before worker construction in packaged/production contexts
2. **Worker**: `getActiveTrustedRoots()` rejects DEV_MODE=1 when `isProduction` flag is set

Production builds cannot activate development/test plugin roots. Emergency override requires a separate mechanism (future P5-D consideration).

### 7.2 BL-07 Status

Legacy `messageAsset.*` IPC output is now sanitized at the schema/decoder boundary:
- `path`, `fileUrl`, `hash`, `bytes` stripped from renderer-bound DTOs
- `resolveImageRenderUrl()` uses only `assetUrl` (asset:// protocol with main-process path traversal guard)
- IPC handlers remain stubbed as defense-in-depth
- TypeScript types enforce the sanitization boundary

---

## 8. External Audit Handoff

After this closeout, hand the following to Gemini CLI or another external auditor:

1. This closeout document (`43-phase5-batch1-security-closeout.md`)
2. All changed source files (see §4.4)
3. Test results from P5-A and P5-B test matrices
4. Grep scan results (§4.2)

**Gemini CLI** is an external audit tool only. It does not support `/flash-*` commands (flash-read-code, flash-run-test, flash-risk-review, flash-doc-check). Those commands are Opencode session tools only.

---

## 9. Git History

```
059688d fix: guard engine plugin dev mode in production         (P5-A)
af6cbd3 fix: sanitize legacy message asset ipc output           (P5-B)
8ee6955 docs: plan phase 5 bl06 bl07 security blockers          (P5 planning)
```

---

## 10. No Overclaim Section

- Phase 5 batch 1 P5-A/P5-B/P5-C completed.
- Phase 5 不代表全项目完成。
- P5-D（trusted root / signing）未实施。
- P5-E（real runtime packaging）未实施。
- 真实 Tika / LibreOffice / ffprobe / Pandoc runtime 未打包、未提交。
- Production trusted root 密钥对未生成。
- Electron 手工烟测未执行（not_run）。
- 17 pre-existing TS errors 未修复。
- 1 derivativeJobService test failure 未修复。

---

## 11. Commit

- **文件**: `43-phase5-batch1-security-closeout.md` (new)
- **README**: 索引 + 状态更新
- **commit message**: `docs: close phase 5 batch 1 security work`
