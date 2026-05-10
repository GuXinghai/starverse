# 44. Phase 5 Batch 1 External Audit Record

**状态**: External audit completed — PASS
**日期**: 2026-05-10
**阶段**: Phase 5 batch 1 external audit (Gemini CLI)
**父文档**: `43-phase5-batch1-security-closeout.md`

Phase 5 batch 1 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。

---

## 1. Audit Scope

| Parameter | Value |
|-----------|-------|
| Auditor | Gemini CLI (external) |
| Scope | Phase 5 Batch 1 only |
| Commit range | `8ee6955`..`9dd4bb9` |
| Packages audited | P5-A (BL-06), P5-B (BL-07), P5-C (closeout) |
| Excluded | P5-D (trusted root / signing), P5-E (real runtime packaging) |
| Opencode subagents | Not applicable (Gemini CLI does not support `/flash-*` commands) |

### 1.1 Audited Commits

| Commit | Message | Package |
|--------|---------|---------|
| `8ee6955` | docs: plan phase 5 bl06 bl07 security blockers | P5 planning |
| `059688d` | fix: guard engine plugin dev mode in production | P5-A |
| `af6cbd3` | fix: sanitize legacy message asset ipc output | P5-B |
| `9dd4bb9` | docs: close phase 5 batch 1 security work | P5-C |

---

## 2. Audit Conclusion

| Dimension | Result |
|-----------|--------|
| **Overall verdict** | **PASS** |
| P0 blockers | None |
| P1 follow-ups | None |
| P2 observations | 3 (all known baseline) |
| Recommendation | Starverse may proceed to P5-D planning |

---

## 3. BL-06 (P5-A) Audit Summary

**Objective**: Guard `SV_ENGINE_PLUGIN_DEV_MODE=1` in production contexts.

### 3.1 Implementation Reviewed

| Layer | Mechanism | Verdict |
|-------|-----------|---------|
| Main process guard | `electron/main.ts`: `app.exit(1)` before worker start if `isProduction && DEV_MODE=1` | Accepted |
| Worker defense-in-depth | `officialPluginTrustedRoots.ts`: `getActiveTrustedRoots()` returns `official_trusted_root_unconfigured` when `isProduction && DEV_MODE=1` | Accepted |
| Worker config propagation | `WorkerInitConfig.isProduction` → `workerManager.ts` → `runtime.ts` → `getActiveTrustedRoots()` | Accepted |
| Security event logging | Sanitized: no paths, no secrets, event ID `sv_engine_plugin_dev_mode_rejected_in_production` | Accepted |

### 3.2 Audit Findings

- Two-layer defense (main process + worker) accepted as sufficient for P0.
- `VITEST=true` and `NODE_ENV=test` correctly excluded from production guard.
- `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` continues to work in production contexts.
- No bypass paths found in audit grep.
- 20/20 unit tests pass; 62/62 broader regression tests pass.

### 3.3 Audit Verdict: PASS

---

## 4. BL-07 (P5-B) Audit Summary

**Objective**: Sanitize legacy `messageAsset.*` IPC output to prevent path/hash leak to renderer.

### 4.1 Implementation Reviewed

| Layer | Mechanism | Verdict |
|-------|-----------|---------|
| IPC schema | `messageAssetRenderSchema` omits `path`, `fileUrl`, `hash`, `bytes` via Zod `.omit()` | Accepted |
| IPC decoders | `decodeMessageAssetPersistResponse()` / `decodeMessageAssetListResponse()` return `DecodedMessageAssetRender[]` | Accepted |
| Renderer client type | `PersistedMessageImageAsset` stripped of `path`, `fileUrl`, `hash`, `bytes` | Accepted |
| UI fallback | `resolveImageRenderUrl()` uses only `assetUrl`; `fileUrl` and `path` fallbacks removed | Accepted |
| Defense-in-depth | IPC handlers `persistFromDataUrls` / `listByMessageIds` remain stubbed (return `[]`) | Accepted |

### 4.2 Audit Findings

- Renderer cannot receive `path`, `fileUrl`, `hash`, or `bytes` through messageAsset IPC — blocked at Zod schema boundary.
- TypeScript type enforcement prevents re-introduction of sensitive fields.
- `messageAsset.getById` correctly remains `renderer: false` (main-process only) with `isPathWithinRoot()` guard.
- Internal repo types (`MessageAssetRecord`, `AssetRow`) untouched.
- 168/168 IPC tests pass; 18/18 broader repo tests pass.

### 4.3 Audit Verdict: PASS

---

## 5. Pattern Scan Reconciliation

### 5.1 Console Leak Scan

Gemini CLI initially reported 4 matches on the console leak pattern. Targeted scan resolved as follows:

**Scan command**:
```
rg -n "console\.(log|warn|error).*([A-Za-z]:\\|file://|/Users/|/home/|/mnt/|contentToken|fullHash|storageUri)" src infra electron docs
```

**Opencode re-scan result**: **0 hits** in `src/`, `infra/`, `electron/`, `docs/`.

The 4 initial Gemini matches were not in the target codebase directories (`src/`, `infra/`, `electron/`). These were likely hits in `node_modules/`, test snapshot files, or other non-target paths — Gemini's initial scan may have used a broader directory scope before narrowing to target directories in its final report.

**Classification**: Benign. No console-path/hash/token leak exists in production code (`src/`, `infra/`, `electron/`).

**Effect on audit result**: None. The 0-hits targeted scan confirms the Gemini final conclusion of "0 hits in target codebase directories."

### 5.2 Forbidden Completion Claims Scan

**Scan command**:
```
rg -n "Phase 5 completed|Phase 4 completed|..." docs/file-pipeline/file-type-detection-implementation/
```

**Opencode re-scan result**: 55 matches. Every match classified as one of:

| Category | Count | Example |
|----------|-------|---------|
| Negation / compliance guard | ~40 | "不代表全项目完成", "Phase 4 不是全项目完成" |
| Grep command reference | ~8 | Scan pattern listed in acceptance checklists |
| Forbidden-items list entry | ~5 | Non-goal tables explicitly listing forbidden phrases |
| Compliance check result | ~2 | "0 hits in new docs", "all negations" |

**Zero improper completion claims found.** All 55 matches are negative affirmations, compliance wording, or internal documentation that references the forbidden phrases for the purpose of forbidding them.

**Classification**: Benign. No cleanup required. These matches are intentional compliance guard language.

**Effect on audit result**: None. Gemini correctly classified these as non-actionable.

---

## 6. Baseline Issues (unchanged)

| Issue | Gemini Classification | Status |
|-------|----------------------|--------|
| 17 pre-existing TypeScript errors | P2 observation | Unchanged — not in Phase 5 batch 1 scope |
| derivativeJobService HTML targetKind failure | P2 observation | Unchanged — not in Phase 5 batch 1 scope |
| 43 Electron / real runtime manual smoke cases | P2 observation | All `not_run` — pending real runtime + Electron environment |

These are known baseline items documented since P4-D1 (`36-p4d1-baseline-verification-ledger.md`). No new issues introduced.

---

## 7. Remaining Phase 5 Scope

| Item | Status |
|------|--------|
| P5-D: Production trusted root / offline signing workflow | **Not started** — future planning package required |
| P5-E: Real runtime packaging (Tika/LO/ffprobe/Pandoc) | **Not started** — future planning package required |
| BL-01~BL-04: Owner decision items | Owner dependency — not in development scope |
| BL-05: Real runtime packaging implementation | Future |
| M-1~M-6: P1/P2 maintenance items | Deferred |
| 43 manual smoke cases | `not_run` — requires Electron + real runtime environment |

**Full Phase 5 is not completed.** Only Phase 5 Batch 1 (P5-A/P5-B/P5-C) is completed.

---

## 8. Final Recommendation

**Gemini CLI recommendation**: Starverse may proceed to P5-D planning.

**Constraints on progression**:
- P5-D planning must be a separate planning package with Owner approval.
- Do not enter P5-D implementation without explicit planning and authorization.
- P5-E remains future scope.
- Full Phase 5 remains open.

---

## 9. No Overclaim Section

- Phase 5 batch 1 P5-A/P5-B/P5-C completed and externally audited.
- Phase 5 不代表全项目完成。
- P5-D（trusted root / signing）未启动。
- P5-E（real runtime packaging）未启动。
- 真实 Tika / LibreOffice / ffprobe / Pandoc runtime 未打包、未提交。
- Production trusted root 密钥对未生成。
- Production signing pipeline 未建立。
- Electron 手工烟测未执行。
- 17 pre-existing TS errors 未修复。
- 1 derivativeJobService test failure 未修复。

---

## 10. Commit

- **文件**: `44-phase5-batch1-external-audit-record.md` (new)
- **README**: 索引 + 状态更新（external audit recorded）
- **commit message**: `docs: record phase 5 batch 1 external audit`
