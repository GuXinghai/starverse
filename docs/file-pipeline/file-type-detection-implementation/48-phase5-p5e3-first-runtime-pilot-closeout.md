# 48. Phase 5 P5-E3 First Runtime Pilot Scaffold Closeout

**状态**: P5-E3 first runtime pilot scaffold completed; real runtime packaging remains open
**日期**: 2026-05-10
**阶段**: Phase 5 P5-E3 closeout
**父文档**: `47-phase5-p5e1-p5e2-runtime-package-scaffold-closeout.md`, `45-phase5-batch2-trust-runtime-planning.md`

P5-E3 first runtime pilot scaffold 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。
Full Phase 5 仍开放。Real runtime packaging 尚未实现。No real Pandoc binary was packaged.

---

## 1. P5-E3 Scope

| Item | Description |
|------|-------------|
| P5-E3 | First conversion runtime pilot scaffold (Pandoc as pilot) |

Implemented behavior:
- `CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES`: 5 required artifact classes for any conversion runtime package (runtime, manifest, signature, license, attribution)
- `ConversionPackageSeed`: seed type with engineId, packageVersion, platform, runtimeEntryRelPath, license, attribution
- `createConversionRuntimeInventory()`: factory function that builds a valid `RuntimePackageInventory` with the 5 required files plus any extra files
- Pandoc pilot fixture using win32 as default platform, with config and NOTICE extra files
- All 5 required artifacts are automatically included by the factory
- Generic across engines: Tika, LibreOffice, ffprobe pilot inventories can be built with the same factory
- Trust verification gate preserved: Pandoc pilot engine with valid inventory but unverified trust blocked at health check and availability
- Verified Pandoc pilot engine reaches fake runner health check
- Builtin Pandoc stub unaffected
- Process policy confirms `shell: false`, `allowBatchEntrypoint: false`, conversion timeout 60000ms
- Path safety and diagnostic sanitization preserved from enginePackageContract

No real Pandoc binary was packaged. No real Pandoc execution.

## 2. Files Changed

| File | Change |
|------|--------|
| `src/next/file-type/conversionRuntimePackage.ts` | New — 63 lines: `CONVERSION_RUNTIME_REQUIRED_ARTIFACT_CLASSES`, `ConversionPackageSeed`, `createConversionRuntimeInventory()` |
| `src/next/file-type/conversionRuntimePackage.test.ts` | New — 26 tests: artifact classes (1), inventory creation (4), missing artifacts (4), path safety (2), cross-platform (2), diagnostics (1), trust gate (4), builtin compatibility (2), process policy (3), generic engine coverage (3) |
| `src/next/file-type/index.ts` | Modified — added `export * from './conversionRuntimePackage'` |

## 3. Tests and Scans

### 3.1 Tests

| Test File | Tests | Result |
|-----------|-------|--------|
| `conversionRuntimePackage.test.ts` | 26 | 26/26 pass |
| `enginePackageContract.test.ts` | 50 | 50/50 pass |
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
| **Total** | **249** | **249/249 pass** |

### 3.2 Scans

| Scan | Result |
|------|--------|
| `git diff --check` | Clean |
| Private key in production source | 0 hits (test-only Ed25519 key generation) |
| `shell: true` in src/ | 0 hits (test-only rejection tests) |
| Console path/token leak | 0 hits |
| Forbidden completion claims | All negations/compliance guards — 0 improper |

## 4. Remaining P5-E Scope

| Item | Reference |
|------|-----------|
| P5-E4 | Packaging regression / smoke package |
| P5-F | Phase 5 final production readiness closeout |

## 5. Explicit Non-Goals

- No real Pandoc binary packaged or executed
- No real Tika, LibreOffice, ffprobe runtime binaries packaged
- No real Magika model files imported
- No downloader / installer functions
- No production signing tool or private key workflow
- No `managed_cache` cleanup
- No full Phase 5 completion

## 6. Stop Confirmation

- P5-E3 first runtime pilot scaffold completed (Pandoc pilot)
- 249/249 tests pass
- 0 new production dependencies
- No real runtime binaries packaged
- No real model files imported
- P5-D verification gates preserved
- Verification gate tested: unverified Pandoc pilot blocked, verified allowed
- Full Phase 5 remains open
- Real runtime packaging (P5-E4+) remains future scope

## 7. Commit

Commit 1 (code): `feat: add first runtime package pilot scaffold`
Commit 2 (docs): `docs: close phase 5 p5e3 runtime pilot scaffold`
