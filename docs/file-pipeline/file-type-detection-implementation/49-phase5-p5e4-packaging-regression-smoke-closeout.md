# 49. Phase 5 P5-E4 Packaging Regression / Smoke Scaffold Closeout

**状态**: P5-E4 packaging regression / smoke scaffold completed; real runtime packaging remains open
**日期**: 2026-05-10
**阶段**: Phase 5 P5-E4 closeout
**父文档**: `48-phase5-p5e3-first-runtime-pilot-closeout.md`, `45-phase5-batch2-trust-runtime-planning.md`

P5-E4 packaging regression / smoke scaffold 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。
Full Phase 5 仍开放。Real runtime packaging 尚未实现。No real Pandoc binary was packaged.

No real runtime binary was packaged in this phase.

---

## 1. P5-E4 Scope

| Item | Description |
|------|-------------|
| P5-E4 | Packaging regression / smoke scaffold |

Implemented behavior:

**Packaging regression scaffold:**
- Full lifecycle test: inventory build → validate paths → validate required artifacts → validate license/attribution → trust gate block → set verification → health check pass → availability exposure
- Every missing required artifact class (runtime, manifest, signature, license, attribution) produces structured failures
- Valid hash-shaped metadata (64-char hex sha256) accepted; non-hex, short hashes rejected; null sha256 accepted (not yet computed)
- Inventory validity remains separate from trust verification throughout

**Fake packaged runtime smoke:**
- Pandoc smoke inventory valid with all 5 required artifact classes + extras
- Fake Pandoc package blocked at health check and availability when unverified/undefined
- Fake Pandoc package passes health check and availability when `verificationStatus === 'verified'`
- All non-verified statuses (failed, revoked, expired, unconfigured, undefined) tested and blocked
- Diagnostics sanitized — no raw absolute paths leaked in issue messages or path validation reasons
- Path safety preserved (absolute, traversal, NUL byte, normalized relative paths)

**Manual smoke checklist (below):** practical checklist for future real runtime packaging; all items marked `not_run` — no real runtime was executed.

## 2. Files Changed

| File | Change |
|------|--------|
| `src/next/file-type/packagingRegressionSmoke.test.ts` | New — 40 tests: full lifecycle (2), every missing artifact class (5), every non-verified trust status (10), undefined verification (2), diagnostics sanitized (3), process policy (3), artifact classes (1), path safety (5), hash metadata (4), builtin engines (3) |

No production source files changed. Smoke is test-only.

## 3. Tests and Scans

### 3.1 Tests

| Test File | Tests | Result |
|-----------|-------|--------|
| `packagingRegressionSmoke.test.ts` | 40 | 40/40 pass |
| `enginePackageContract.test.ts` | 50 | 50/50 pass |
| `conversionRuntimePackage.test.ts` | 26 | 26/26 pass |
| `enginePluginTrustContracts.test.ts` | 72 | 72/72 pass |
| `externalEngineHealth.test.ts` | 13 | 13/13 pass |
| `externalEngineAvailability.test.ts` | 9 | 9/9 pass |
| `externalEngineRegistry.test.ts` | 3 | 3/3 pass |
| `externalProcessPolicy.test.ts` | 12 | 12/12 pass |
| `externalProcessRunner.test.ts` | 11 | 11/11 pass |
| `pluginCatalogSignature.test.ts` | 18 | 18/18 pass |
| `externalEngineManifest.test.ts` | 9 | 9/9 pass |
| `pluginCatalog.test.ts` | 6 | 6/6 pass |
| `officialPluginTrustedRoots.test.ts` | 20 | 20/20 pass |
| **Total** | **289** | **289/289 pass** |

### 3.2 Scans

| Scan | Result |
|------|--------|
| `git diff --check` | Clean |
| Private key in new file | 0 hits |
| `shell: true` in new file | 0 hits |
| Forbidden completion claims | All negations/compliance guards — 0 improper |

## 4. Manual Smoke Checklist

All items `not_run` — no real runtime was executed in P5-E4.

| # | Check Item | Status |
|---|-----------|--------|
| 1 | Packaged app startup with no engines | not_run |
| 2 | Packaged app with fake verified package inventory | not_run |
| 3 | Packaged app with unverified package inventory | not_run |
| 4 | Package missing signature placeholder | not_run |
| 5 | Package missing license / attribution | not_run |
| 6 | Hash mismatch detection | not_run |
| 7 | Healthcheck blocked before verificationStatus === verified | not_run |
| 8 | Verified package reaches healthcheck | not_run |
| 9 | Logs checked for raw path / contentToken / fullHash leaks | not_run |
| 10 | Confirm no real runtime binary in this phase | Confirmed — 0 real binaries |

This checklist exists for future P5-F final closeout when real runtimes are available for manual smoke.

## 5. Remaining Scope

| Item | Reference |
|------|-----------|
| P5-F | Phase 5 final production readiness closeout |

All P5-E subphases (E1, E2, E3, E4) completed. P5-F remains future.

## 6. Explicit Non-Goals

- No real Pandoc binary packaged or executed
- No real Tika, LibreOffice, ffprobe runtime binaries packaged
- No real Magika model files imported
- No downloader / installer functions
- No production signing tool or private key workflow
- No `managed_cache` cleanup
- No full Phase 5 completion
- No `index.ts` export for the test file (smoke is test-only)

## 7. Stop Confirmation

- P5-E4 packaging regression / smoke scaffold completed
- 289/289 tests pass (40 new + 249 regression)
- 0 production code modified
- 0 new dependencies
- No real runtime binaries packaged
- No real model files imported
- P5-D verification gates preserved and smoke-tested
- Manual smoke checklist provided (all not_run)
- Full Phase 5 remains open
- P5-F final closeout remains future scope

## 8. Commit

Commit 1 (code): `test: add runtime package smoke regression scaffold`
Commit 2 (docs): `docs: close phase 5 p5e4 packaging smoke scaffold`
