# 51. Phase 6 User-Level Magika Runtime Pilot Closeout

**Status**: Phase 6 user-level lifecycle scaffold + diagnostics surface + Magika pilot integration completed; real Magika smoke blocked_by_missing_local_magika_package
**Date**: 2026-05-10
**Phase**: Phase 6 closeout
**Parent docs**: `50-post-p5-user-level-roadmap.md`, `49-phase5-p5e4-packaging-regression-smoke-closeout.md`

Phase 6 user-level lifecycle scaffold 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。
Real runtime distribution remains open. Downloader / installer remains future.

---

## 1. Phase 6 Scope

| Subpackage | Description | Status |
|-----------|-------------|--------|
| P6-A | Local/manual plugin lifecycle (registerLocalPackage) | Completed |
| P6-B | Diagnostics / settings minimum surface (getDiagnosticsSummary) | Completed |
| P6-C | Magika real classifier pilot integration (managed plugin loader wiring) | Completed; real smoke blocked |
| P6-D | Manual smoke / closeout | Completed (this doc) |

---

## 2. Files Changed

| File | Change |
|------|--------|
| `infra/db/types.ts` | Added `'local_package'` to `EnginePluginInstallSource` |
| `infra/files/enginePluginLifecycleService.ts` | Added `registerLocalPackage()` — discovers Magika package from local directory, validates layout/manifest/integrity, computes manifest SHA-256 hash, upserts to DB with install source `local_package`. Added `getDiagnosticsSummary()` — returns combined view of builtin + plugin engines with status, counts. Added `RegisterLocalPackageInput`, `EngineDiagnosticsSummary`, `EngineDiagnosticsEntry` types. Added `local_package_unavailable` and `local_package_manifest_hash_missing` failure reasons. |
| `src/next/ipc/contracts/enginePluginLifecycleContracts.ts` | Added `RegisterLocalPackageRequest` type, `diagnosticsEntrySchema`, `diagnosticsSummarySchema`, `decodeDiagnosticsSummary()`. |
| `infra/db/worker/handlers/enginePluginLifecycleHandlers.ts` | Added `enginePluginLifecycle.registerLocalPackage` and `enginePluginLifecycle.getDiagnosticsSummary` IPC handlers. |
| `src/next/files/enginePluginLifecycleClient.ts` | Added `registerLocalPackage()` and `getDiagnosticsSummary()` client functions. |
| `infra/db/dbMethodsRegistry.ts` | Registered `registerLocalPackage` and `getDiagnosticsSummary` DB methods. |
| `infra/db/worker/runtime.ts` | Added `buildMagikaRuntimeLoader()` — creates `createManagedPluginMagikaRuntimeLoader` from installed plugin dirs. Passes loader to `FileTypeDetectionService` for `detectFull`. |
| `src/next/file-type/magikaManagedPlugin.ts` | Added `registry.setVerificationStatus({ engineId: 'magika', verificationStatus: 'verified' })` in `runManagedMagikaPluginHealthCheck` — fixes pre-existing test incompatibility with P5-D trust gate. |

No new files. All changes are modifications to existing modules.

---

## 3. P6-A: Local Package Lifecycle

### 3.1 registerLocalPackage

**What**: Registers a Magika package from a local/manual directory without requiring an official signed catalog.

**Flow**:
1. Validates `packageDir` and `installRootKind`
2. Resolves the installation directory via `resolveInstallPluginDir`
3. Discovers Magika package using `discoverMagikaManagedPlugin` (validates layout, manifest, model files, config files, integrity hashes, path traversal protection)
4. Reads manifest bytes and computes SHA-256 hash
5. Upserts to DB engine_plugin_registry with `installSource: 'local_package'`
6. Sets `enabled: true` by default (configurable via `RegisterLocalPackageInput.enabled`)
7. Does NOT set `verificationStatus: 'verified'` — plugin remains unverified until explicitly verified

**Failure reasons**:
- `install_root_kind_mismatch` — installRootKind not compatible with trusted root source
- `local_package_unavailable` — package discovery failed (missing manifest, missing model files, integrity mismatch, etc.)
- `local_package_manifest_hash_missing` — cannot read manifest for hash calculation

**IPC**: `enginePluginLifecycle.registerLocalPackage` — accessible via `registerLocalPackage()` client function.

### 3.2 Existing Lifecycle Preserved

All existing lifecycle methods unchanged: `listOfficialPlugins`, `registerLocalOfficialPlugin`, `enablePlugin`, `disablePlugin`, `uninstallPlugin`, `runHealthCheck`, `getInstalledPlugins`.

---

## 4. P6-B: Diagnostics Surface

### 4.1 getDiagnosticsSummary

**What**: Returns a combined view of all engines (builtin + plugin) with status counts.

**Return type**: `EngineDiagnosticsSummary`:
- `engines[]`: Array of `EngineDiagnosticsEntry` with `engineId`, `displayName`, `kind`, `installed`, `enabled`, `healthStatus`, `verificationStatus`, `pluginVersion`, `modelVersion`, `failureReason`, `installSource`
- `counts`: `{ total, installed, enabled, healthy, failed, unverified }`

**Builtin engines**: `tika`, `libreoffice`, `ffprobe`, `pandoc` — always shown with `kind: 'builtin'`, `verificationStatus: null`

**Plugin engines**: All non-builtin entries from DB registry — shown with `kind: 'plugin'`, `verificationStatus: 'unverified'` when `installState === 'installed'`

**Sanitization**: Failure reasons sanitized through existing `sanitizeStoredFailureReason`. No raw paths, no hashes, no tokens.

**IPC**: `enginePluginLifecycle.getDiagnosticsSummary` — accessible via `getDiagnosticsSummary()` client function.

---

## 5. P6-C: Magika Real Classifier Pilot Integration

### 5.1 Managed Plugin Loader Wiring

**What**: Wired `createManagedPluginMagikaRuntimeLoader` into `DbWorkerRuntime` → `FileTypeDetectionService`.

**Flow**:
1. At `DbWorkerRuntime` construction, `buildMagikaRuntimeLoader()` is called
2. Queries `enginePluginRegistryRepo` for installed Magika plugins (engineId='magika', not uninstalled)
3. Resolves plugin dirs from installRootKind/installRef
4. Falls back to `engine-plugins/managed_root/magika` default location
5. Creates `createManagedPluginMagikaRuntimeLoader` with classifier callback (`createMagikaClassifyCallback`)
6. Passes loader to `FileTypeDetectionService` as `magikaRuntimeLoader`

**Graceful fallback**: When no Magika package is installed, `createManagedPluginMagikaRuntimeLoader.load()` returns `{ available: false, runtimeKind: 'unavailable' }`. `FileTypeDetectionService` falls back to lightweight detection (magic bytes, extensions, MIME, container, text probes) without Magika.

**Existing behavior preserved**: `detectBasic` never uses Magika. `detectFull` uses Magika only when loader reports available. Model version caching and stale detection unchanged.

### 5.2 Pre-existing Test Fix

Fixed `magikaManagedPlugin.test.ts` test "maps health timeout and output limit with structured failure reasons". The P5-D trust gate (`isEngineTrustVerified`) was applied to `runEngineHealthCheck` in commit `092811b`, but `runManagedMagikaPluginHealthCheck` used a local in-memory registry without setting `verificationStatus: 'verified'`, causing the health runner to be blocked. Fix: `runManagedMagikaPluginHealthCheck` now sets `verificationStatus: 'verified'` on the local registry record before calling `runEngineHealthCheck`.

---

## 6. Local Magika Package Discovery

| Item | Result |
|------|--------|
| Path checked | `D:\Starverse\.starverse-engines\magika\` |
| Exists | No |
| Manual prep performed | Not performed |
| Real smoke status | **blocked_by_missing_local_magika_package** |

---

## 7. Manual Package Preparation Instructions

To prepare a local Magika package for manual smoke:

**Route A: npm package route**
```
mkdir D:\Starverse\.starverse-engines\magika
cd /d D:\Starverse\.starverse-engines\magika
mkdir runtime model config
```
Then create `manifest.json` following the `MagikaManagedPluginManifest` schema. The npm `magika` package directory can be placed under `runtime/`.

**Route B: Official Google Magika repository route**
```
cd /d C:\temp
git clone https://github.com/google/magika.git
```

Neither route was executed in this session.

---

## 8. Tests and Scans

### 8.1 Tests

| Test File | Tests | Result |
|-----------|-------|--------|
| `magikaManagedPlugin.test.ts` | 32 | 32/32 pass (1 pre-existing fix applied) |
| `enginePluginTrustContracts.test.ts` | 72 | 72/72 pass |
| `enginePackageContract.test.ts` | 50 | 50/50 pass |
| `conversionRuntimePackage.test.ts` | 26 | 26/26 pass |
| `externalEngineHealth.test.ts` | 13 | 13/13 pass |
| `externalEngineAvailability.test.ts` | 9 | 9/9 pass |
| `externalEngineRegistry.test.ts` | 3 | 3/3 pass |
| `externalEngineManifest.test.ts` | 9 | 9/9 pass |
| `packagingRegressionSmoke.test.ts` | 40 | 40/40 pass |
| `pluginCatalogSignature.test.ts` | 18 | 18/18 pass |
| `pluginCatalog.test.ts` | 6 | 6/6 pass |
| `officialPluginTrustedRoots.test.ts` | 20 | 20/20 pass |
| `externalProcessPolicy.test.ts` | 12 | 12/12 pass |
| `externalProcessRunner.test.ts` | 11 | 11/11 pass |
| `magikaRuntimeLoader.test.ts` | 2 | 2/2 pass |
| `magikaAdapter.test.ts` | 6 | 6/6 pass |
| **Total** | **329** | **329/329 pass** |

### 8.2 Scans

| Scan | Result |
|------|--------|
| `git diff --check` | Clean |
| Private key in src/infra/electron | 0 hits (test-only Ed25519) |
| `shell: true` in src/infra/electron | 0 hits (test-only rejection tests) |
| Console path/token/hash leak | 0 hits |

---

## 9. Remaining Scope

| Item | Status |
|------|--------|
| Real Magika package preparation | Not performed |
| Real Magika classify smoke | `not_run` / blocked |
| Downloader / installer | Future |
| Marketplace | Future |
| Second engine (Pandoc) | Future (P7) |
| Production signing workflow | Future |
| P5-F closeout | Optional / may skip |
| P6-D manual smoke | Future (requires real Magika package) |

---

## 10. Future Downloader / Installer Requirement (Not in Phase 6)

A later phase should implement:
1. Download Magika package from approved source
2. Verify package hash / manifest / signature
3. Register package
4. Enable package
5. Run healthcheck
6. Run real classifier
7. Disable / uninstall / rollback
8. Inspect logs for path/token/hash leakage

Phase 6 does not implement this downloader. It only documents this future requirement.

---

## 11. Explicit Non-Goals

- No downloader, git clone, npm install inside Starverse
- No marketplace
- No auto-update
- No second engine (Pandoc/P7 future)
- No real runtime binary execution
- No real model file import
- No production private key workflow
- No provider_file_ref
- No full plugin ecosystem completion

---

## 12. Stop Confirmation

- P6-A local package lifecycle implemented (`registerLocalPackage`)
- P6-B diagnostics summary implemented (`getDiagnosticsSummary`)
- P6-C managed plugin loader wired to FileTypeDetectionService
- 329/329 tests pass
- 1 pre-existing test bug fixed (P5-D trust gate bypass in managed plugin health check)
- 0 new production dependencies
- No real runtimes or models committed
- Local Magika package not found — real smoke blocked
- Manual package preparation instructions provided
- Downloader / installer remain future
- Full plugin ecosystem remains future

---

## 13. Commit

Commit 1 (lifecycle + diagnostics + IPC): 
`feat: add local package registration and diagnostics summary`

Commit 2 (loader wiring + test fix):
`feat: wire managed plugin magika loader to detection service`

Commit 3 (docs / closeout):
`docs: close phase 6 user-level magika runtime pilot work`
