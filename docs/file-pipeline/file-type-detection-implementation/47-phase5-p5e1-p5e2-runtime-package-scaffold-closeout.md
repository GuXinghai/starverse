# 47. Phase 5 P5-E1/P5-E2 Runtime Package Scaffold Closeout

**状态**: P5-E1/P5-E2 scaffold completed; real runtime packaging remains open
**日期**: 2026-05-10
**阶段**: Phase 5 P5-E1 + P5-E2 closeout
**父文档**: `46-phase5-p5d-trust-signing-closeout.md`, `45-phase5-batch2-trust-runtime-planning.md`

P5-E1/P5-E2 scaffold 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。
Full Phase 5 仍开放。Real runtime packaging 尚未实现。

---

## 1. P5-E1 Scope

| Item | Description |
|------|-------------|
| P5-E1 | Runtime package manifest / artifact inventory contract |

Implemented behavior:
- `PackageFileEntry` type: describes one file in a package with `relativePath`, `artifactClass`, optional `sha256`, and `required` flag
- `RuntimePackageInventory` type: full package inventory with `schemaVersion`, `engineId`, `packageVersion`, `platform`, `modelVersion`, `files`, `license`, `attribution`
- `PackageArtifactClass`: 9 artifact classes (runtime, model, config, wrapper, manifest, signature, license, attribution, healthcheck)
- Path validation: `validatePackageFilePath()` rejects absolute paths, `..` traversal (including Unicode variants), NUL bytes, and empty paths; normalizes separators
- Path normalization: `normalizePackageFilePath()` converts backslashes, strips `./` prefixes, collapses double slashes
- Inventory validation: `validateRuntimePackageInventory()` validates schemaVersion, engineId, packageVersion, platform, and file entries (paths, artifact classes, sha256 format, required flag)
- Required artifacts: `validatePackageRequiredArtifacts()` checks required artifact classes are present in inventory
- License check: `hasPackageRequiredLicenses()` verifies license file or license field present
- Attribution check: `hasPackageRequiredAttributions()` verifies attribution file or attribution field present
- Diagnostics: `formatPackageIssues()` joins issues; redacts absolute paths from diagnostic messages
- Factory helpers: `createPackageFileEntry()`, `createRuntimePackageInventory()`

The contract supports future signing and verification (sha256 fields, signature artifact class), but this session does not implement production signing.

## 2. P5-E2 Scope

| Item | Description |
|------|-------------|
| P5-E2 | Magika model pre-stage package scaffold using fake/minimal test artifacts |

Implemented behavior:
- Fake Magika package inventory with all 9 artifact classes (wrapper, runtime, model ×2, config, manifest, signature, license, attribution)
- Inventory passes full structural validation
- Required artifact class validation verifies runtime, model, license, etc. are present
- Missing artifact classes produce structured failures with explicit missing class names
- Trust verification gate confirmed: plugin engine with valid package inventory but undefined verificationStatus still cannot run health check or appear in availability
- Plugin engine with valid package inventory and `verificationStatus === 'verified'` passes health check and availability
- Builtin engine compatibility confirmed unaffected by package inventory contract

No real Magika model files, no real runtime binaries imported.

## 3. Files Changed

| File | Change |
|------|--------|
| `src/next/file-type/enginePackageContract.ts` | New — 263 lines: `RuntimePackageInventory`, `PackageFileEntry`, `PackageArtifactClass`, validation functions, path safety, factory helpers |
| `src/next/file-type/enginePackageContract.test.ts` | New — 50 tests: path validation (9), path normalization (5), inventory validation (17), artifact classes (1), required artifacts (3), license/attribution (6), diagnostics (3), PACKAGE_ARTIFACT_CLASSES (1), trust gate integration (4), builtin compatibility (2) |
| `src/next/file-type/index.ts` | Modified — added `export * from './enginePackageContract'` |

## 4. Tests and Scans

### 4.1 Tests

| Test File | Tests | Result |
|-----------|-------|--------|
| `enginePackageContract.test.ts` | 50 | 50/50 pass |
| `enginePluginTrustContracts.test.ts` | 72 | 72/72 pass |
| `externalEngineHealth.test.ts` | 13 | 13/13 pass |
| `externalEngineAvailability.test.ts` | 9 | 9/9 pass |
| `pluginCatalogSignature.test.ts` | 18 | 18/18 pass |
| `externalEngineManifest.test.ts` | 9 | 9/9 pass |
| `externalEngineRegistry.test.ts` | 3 | 3/3 pass |
| `externalProcessPolicy.test.ts` | 12 | 12/12 pass |
| `pluginCatalog.test.ts` | 6 | 6/6 pass |
| `officialPluginTrustedRoots.test.ts` | 20 | 20/20 pass |
| **Total** | **212** | **212/212 pass** |

### 4.2 Scans

| Scan | Result |
|------|--------|
| `git diff --check` | Clean |
| Private key in production source | 0 hits (test-only Ed25519 key generation) |
| `shell: true` in src/infra/electron | 0 hits |
| Forbidden completion claims (P5 docs area) | All negations/compliance guards — 0 improper |
| P5-D hotfix `092811b` verified before P5-E | Confirmed |

## 5. Verification Gate Preservation

P5-D behavior preserved and tested:
- Plugin engines (kind='plugin') must have `verificationStatus === 'verified'` to run health check
- Plugin engines must have `verificationStatus === 'verified'` to appear in availability
- Builtin engines remain exempt from verification
- Package inventory validation is separate from trust verification (validating a package layout does NOT set verificationStatus)
- Future package verification must occur before health check (gated by existing `isEngineTrustVerified` policy)

## 6. Remaining P5-E Scope

| Item | Reference |
|------|-----------|
| P5-E3 | First conversion runtime pilot (Pandoc recommended) |
| P5-E4 | Packaging regression / smoke package |
| P5-F | Phase 5 final production readiness closeout |

## 7. Explicit Non-Goals

- No real Magika model file import (`model_*.json`, `model_config.json`)
- No real Tika / LibreOffice / ffprobe / Pandoc runtime binaries packaged
- No downloader / installer functions
- No production signing tool or private key workflow
- No `managed_cache` cleanup
- No real runtime execution beyond existing stubs
- No full Phase 5 completion

## 8. P5-D Hotfix Baseline

P5-D hotfix `092811b` closed the `verificationStatus === undefined` fail-open gap before P5-E started. Plugin engines now require explicit `verificationStatus === 'verified'` before health check or availability exposure. Builtin engines are explicitly exempted. This behavior is preserved and integration-tested in P5-E2 scaffold.

## 9. Stop Confirmation

- P5-E1 implemented: runtime package inventory contract with types, validation, path safety
- P5-E2 implemented: fake Magika package scaffold with 50 tests
- 212/212 tests pass including all adjacent regression tests
- No production private keys generated
- No real runtime binaries packaged
- No real model files imported
- P5-D verification gates preserved
- Full Phase 5 remains open
- Real runtime packaging (P5-E3+) remains future scope

## 10. Commit

Commit 1 (code): `feat: add runtime package inventory scaffold`
Commit 2 (docs): `docs: close phase 5 p5e scaffold work`
