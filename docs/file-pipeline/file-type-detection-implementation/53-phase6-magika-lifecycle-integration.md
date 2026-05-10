# 53. Phase 6 Magika Lifecycle Integration

**Status**: Lifecycle integration completed with mocked test chain
**Date**: 2026-05-11
**Phase**: Phase 6 follow-up
**Parent docs**: `52-phase6-magika-pure-js-runtime-smoke.md`, `51-phase6-user-level-magika-runtime-pilot-closeout.md`

Magika lifecycle integration 不代表全项目完成。不代表完整插件系统已完成。

---

## 1. Integration Goals

Prove Starverse can use a local Magika package through the full lifecycle path:
- register local package → enable → health check → diagnostics summary → fallback

---

## 2. Changes

### 2.1 Git Hygiene

| File | Change |
|------|--------|
| `.gitignore` | Added `.external-runtime-work/` and `.starverse-engines/` |

### 2.2 DB Schema

| File | Change |
|------|--------|
| `infra/db/schema.sql` | Added `'local_package'` to `install_source` CHECK constraint |
| `infra/db/migrations/ensureEnginePluginRegistrySchema.ts` | Same |

The `install_source` column now accepts both `'official_catalog'` and `'local_package'`. This completes the P6-A change that added `'local_package'` to `EnginePluginInstallSource` in TypeScript types but missed the SQL constraint.

### 2.3 Lifecycle Integration Tests

| File | Change |
|------|--------|
| `infra/files/enginePluginLifecycleService.test.ts` | Added 5 new tests (21 total, all pass) |

**New tests**:

| Test | What it verifies |
|------|-----------------|
| `registers local package, enables, runs health check, and returns diagnostics with full lifecycle state` | Complete register→enable→health→diagnostics→disable→uninstall chain with state assertions at each step |
| `registerLocalPackage returns structured failure when plugin not found at packageDir` | Structured failure with `'local_package_unavailable'` reason |
| `registerLocalPackage sanitizes failure message to exclude raw paths` | No absolute path or Windows path pattern leaked in failure messages |
| `getDiagnosticsSummary returns builtin engines always present regardless of plugin state` | Builtin engines (tika, libreoffice, ffprobe, pandoc) always shown with `kind: 'builtin'`, `verificationStatus: null` |
| `getDiagnosticsSummary reflects installed plugin engine after registerLocalPackage` | Diagnostics counts update correctly after registration |

---

## 3. Lifecycle Chain Verified

The test proves:

1. **registerLocalPackage** — discovers Magika package from fixture, validates layout/manifest/integrity, upserts to DB with `installSource: 'local_package'`, `enabled: true`, `healthStatus: 'unknown'`
2. **enablePlugin** — toggles enabled state
3. **runHealthCheck** — discovers plugin, runs managed plugin health check (with P5-D trust gate bypass on local registry), updates DB health status to `'healthy'`
4. **getDiagnosticsSummary** — shows combined builtin + plugin view with correct counts (installed, healthy, unverified)
5. **disablePlugin** — sets enabled=false, diagnostics reflects change
6. **uninstallPlugin** — marks uninstalled, diagnostics shows installed=false

---

## 4. detectFull Integration

`detectFull` Magika path was wired in P6-C (`2cf3bfc`) via `buildMagikaRuntimeLoader()`. The loader queries the DB registry for installed Magika plugins. With `registerLocalPackage` now correctly storing packages in DB, the loader can discover lifecycle-registered packages.

Real smoke through `detectFull` requires:
1. Plugin registered (DB — done)
2. Plugin enabled (DB — done)
3. Verification gate passed (runtime layer — bypassed in health check via local registry)
4. Health check passed (DB updated — done)
5. Runtime entry executable (requires real Node.js child process — external, works locally)
6. Classify callback produces valid output (external, works locally)

The existing `fileTypeDetectionService.test.ts` covers `detectFull` with mock runtime loader (12 tests, all pass). Real end-to-end via actual managed plugin awaits full runtime availability and is documented as future work.

---

## 5. P5-D Trust Gate Preserved

The health check route in `runManagedMagikaPluginHealthCheck` (line 409) sets `verificationStatus: 'verified'` on a local in-memory `ExternalEngineRegistry` before calling `runEngineHealthCheck`. This is the existing self-bypass for managed plugin health checks — not a weakening of production gates. The DB-level lifecycle service does not grant or check verification status; that remains a runtime-layer concept.

`registerLocalPackage` does NOT auto-set verification — unverified status preserved.

---

## 6. Tests

| Test File | Tests | Change |
|-----------|-------|--------|
| `enginePluginLifecycleService.test.ts` | 21 | +5 new lifecycle tests |
| `magikaManagedPlugin.test.ts` | 32 | Unchanged |
| `fileTypeDetectionService.test.ts` | 12 | Unchanged |
| Full file-type + lifecycle suite | 285 | All pass |

---

## 7. Scans

| Scan | Result |
|------|--------|
| `git diff --check` | Clean |
| Private key | 0 hits (test-only Ed25519) |
| `shell:true` | 0 hits |
| Console leaks | 0 hits |
| Forbidden claims | 0 hits |

---

## 8. Remaining Scope

| Item | Status |
|------|--------|
| Lifecycle integration (register→enable→health→diagnostics) | Completed |
| detectFull via real managed plugin (end-to-end native process) | Future (requires full runtime handshake) |
| Verification API (`setVerificationStatus`) in lifecycle layer | Deferred (runtime concept, not DB) |
| Downloader / installer | Future |
| Marketplace | Future |
| Second engine (Pandoc/P7) | Future |
| tfjs-node native route | Optional |

---

## 9. Explicit Non-Goals

- No Python CLI route
- No downloader, git clone, npm install inside Starverse
- No marketplace, no auto-update
- No real model files or node_modules committed
- No production private keys
- Full plugin ecosystem not completed
- Phase 6 not completed

---

## 10. Commit

`feat: integrate local magika runtime lifecycle`
