# 46. Phase 5 P5-D Trust & Signing Closeout

**状态**: P5-D implementation foundation completed; production verification gate implemented; root rotation/revocation scaffold implemented
**日期**: 2026-05-10
**阶段**: Phase 5 P5-D implementation closeout
**父文档**: `45-phase5-batch2-trust-runtime-planning.md`, `43-phase5-batch1-security-closeout.md`

P5-D implementation foundation completed. 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。
Full Phase 5 仍开放。P5-E（real runtime packaging）未实现。

---

## 1. P5-D Scope

| Subpackage | Scope | Commit |
|------------|-------|--------|
| P5-D1 | Trust/signing contracts and verification status model | `0311278` |
| P5-D2 | Production verification gate and fail-closed policy | `6f58c8c` |
| P5-D3 | Root rotation / revocation metadata scaffold | `bf2fcc4` |

---

## 2. Files Changed

### P5-D1 (`0311278`)

| File | Change |
|------|--------|
| `src/next/file-type/enginePluginTrustContracts.ts` | New — 257 lines: TrustRootScope, TrustRootEnvironment, TrustedRootMetadata, VerificationBinding, TrustVerificationStatus, PluginVerificationResult, helper functions (mapVerificationStatusToFailureReason, sanitizeVerificationDetail, filterActiveTrustedRoots, resolveTrustRootEnvironment) |
| `src/next/file-type/enginePluginTrustContracts.test.ts` | New — 61 tests covering all exported functions |
| `src/next/file-type/pluginCatalogSignature.test.ts` | New — 18 tests: Ed25519 verify (valid, missing, tampered, wrong key, algorithm, PEM), createCatalogSigningPayload (sorting, undefined drop, nested) |
| `src/next/file-type/externalEngineTypes.ts` | Modified — added `verificationStatus?: TrustVerificationStatus` to `ExternalEngineRecord` |
| `src/next/file-type/index.ts` | Modified — added `export * from './enginePluginTrustContracts'` |

### P5-D2 (`6f58c8c`)

| File | Change |
|------|--------|
| `src/next/file-type/officialPluginTrustedRoots.ts` | Modified — production gate: env-var roots (`SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS`, `SV_TEST_TRUSTED_ROOTS`) blocked when `isProduction=true`; VITEST/NODE_ENV=test/DEV_MODE fallback blocked in production |
| `src/next/file-type/officialPluginTrustedRoots.test.ts` | Modified — 5 tests updated to expect `ok:false` instead of `ok:true` for env injection in production |
| `src/next/file-type/externalEngineHealth.ts` | Modified — added verificationStatus gate before health check: engines with `verificationStatus` set to non-verified non-undefined are blocked with `disabled_by_policy` |
| `src/next/file-type/externalEngineHealth.test.ts` | Modified — 2 new tests: blocks health check when verificationStatus is `failed` / `revoked` |
| `src/next/file-type/externalEngineAvailability.ts` | Modified — `buildCapabilityAvailability()` excludes engines with `verificationStatus` set to anything other than `verified` or `undefined` |
| `src/next/file-type/externalEngineAvailability.test.ts` | Modified — added `verificationStatus` to engine factory; 3 new tests: excludes failed/revoked, includes verified |
| `src/next/file-type/externalEngineRegistry.ts` | Modified — added `setVerificationStatus()` method, `SetEngineVerificationStatusInput` type, imported `TrustVerificationStatus` |

### P5-D3 (`bf2fcc4`)

| File | Change |
|------|--------|
| `src/next/file-type/enginePluginTrustContracts.ts` | Modified — added `RevokedRootEntry`, `RevokedRootsList`, `parseRevokedRootsList()`, `isKeyIdRevoked()`, `filterRevokedRoots()` |
| `src/next/file-type/enginePluginTrustContracts.test.ts` | Modified — 13 new tests: `parseRevokedRootsList` (valid, non-object, wrong version, missing fields, empty), `isKeyIdRevoked`, `filterRevokedRoots` |

---

## 3. Existing Ed25519 Surface Clarification

The repository contained pre-existing Ed25519 signing/verification infrastructure in `pluginCatalogSignature.ts`:
- `verifyCatalogSignature()` — full Ed25519 verification using `node:crypto`
- `createCatalogSigningPayload()` — JSON canonicalization for deterministic signing
- `verifyOfficialPluginCatalogSignature()` — high-level catalog signature verification
- 6 failure reasons: `signature_missing`, `signature_algorithm_unsupported`, `trusted_root_missing`, `trusted_root_invalid`, `signature_value_invalid`, `signature_invalid`

**This pre-existing code was verification-only.** No `signCatalogPayload()` production signing function exists. Signing is done externally/offline. P5-D did not add signing — it added trust contracts and production verification gate hardening around the existing verify infrastructure.

---

## 4. Trust/Signing Contracts Implemented

| Contract | Type | Location |
|----------|------|----------|
| Trust root scope | `'production' \| 'test' \| 'development'` | `enginePluginTrustContracts.ts:4` |
| Trust root environment | `'production' \| 'test' \| 'development' \| 'unknown'` | `enginePluginTrustContracts.ts:7` |
| Trusted root metadata | `{ keyId, algorithm, publicKeyPem, version, scope, environment, activatedAt, expiresAt, revoked }` | `enginePluginTrustContracts.ts:10` |
| Verification binding | `{ engineId, platform, pluginVersion, modelVersion, license, attribution }` | `enginePluginTrustContracts.ts:40` |
| Verification status | `'unverified' \| 'verified' \| 'failed' \| 'revoked' \| 'expired' \| 'unconfigured'` | `enginePluginTrustContracts.ts:59` |
| Verification failure detail | 17 union members covering all verification failure modes | `enginePluginTrustContracts.ts:77` |
| Plugin verification result | Discriminated union with helper factories | `enginePluginTrustContracts.ts:95` |
| Revoked roots list | `{ schemaVersion, entries: [{ keyId, revokedAt, reason }] }` | `enginePluginTrustContracts.ts:206` |

---

## 5. Production Verification Gate Behavior

### 5.1 Trusted Root Gate

When `isProduction=true`:
- All environment variable roots blocked (`SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS`, `SV_TEST_TRUSTED_ROOTS`)
- VITEST/NODE_ENV=test/dev-mode fallback blocked
- DEV_MODE=1 explicitly rejected with `official_trusted_root_unconfigured`
- Result: fail-closed — no trusted roots → no plugin registration → no plugin execution
- Only an embedded production key (future P5-D implementation) can unlock production plugins

### 5.2 Health Check Gate

When `verificationStatus` is set to non-verified non-undefined:
- Health check is blocked with `disabled_by_policy` failure reason
- Engine record marked as `failed` without executing the runtime
- Error detail contains the verification status for diagnostics

### 5.3 Availability Gate

When computing capability availability:
- Engines with `verificationStatus` other than `verified` or `undefined` are excluded
- Backward compatible: `undefined` (unset) passes through
- Health check gate and availability gate are independent defense-in-depth layers

---

## 6. Root Rotation / Revocation Scaffold

### 6.1 Revocation List

- `RevokedRootsList`: `{ schemaVersion: '1', entries: [{ keyId, revokedAt, reason }] }`
- `parseRevokedRootsList()`: validates schema version, entries format
- `isKeyIdRevoked()`: checks if a given keyId is in the revocation list
- `filterRevokedRoots()`: returns trusted roots with revoked entries removed

### 6.2 Rotation Support

- `TrustedRootMetadata.version`: allows tracking root version for rotation
- `TrustedRootMetadata.activatedAt` / `expiresAt`: allows time-windowed root validity
- `filterActiveTrustedRoots()`: filters expired and revoked roots from metadata map
- `TrustedCatalogPublicKeyMap`: supports multiple roots (already existed) — overlapping roots during rotation

### 6.3 What Is Not Implemented

- No `revoked_roots.json` file loading (parse function exists, no file loader)
- No automatic root rotation schedule
- No online revocation fetching (this scaffold is offline-only)
- No managed_cache cleanup
- No downgrade prevention beyond catalog `minStarverseVersion`

---

## 7. Tests and Scans Run

### 7.1 Tests

| Test File | Tests | Result |
|-----------|-------|--------|
| `enginePluginTrustContracts.test.ts` | 61 | 61/61 pass |
| `pluginCatalogSignature.test.ts` | 18 | 18/18 pass |
| `officialPluginTrustedRoots.test.ts` | 20 | 20/20 pass |
| `externalEngineHealth.test.ts` | 9 | 9/9 pass |
| `externalEngineAvailability.test.ts` | 6 | 6/6 pass |
| `externalEngineRegistry.test.ts` | 3 | 3/3 pass |
| `externalEngineManifest.test.ts` | 9 | 9/9 pass |
| `externalProcessPolicy.test.ts` | 12 | 12/12 pass |
| `externalProcessRunner.test.ts` | 11 | 11/11 pass |
| `pluginCatalog.test.ts` | 6 | 6/6 pass |
| **Total** | **155** | **155/155 pass** |

### 7.2 Scans

| Scan | Result |
|------|--------|
| `git diff --check` (each commit) | Clean |
| Private key in production source | 0 hits |
| `console.log` + path/token/hash in file-type | 0 hits |
| Forbidden completion claims (P5 docs area) | All negations/compliance/grep refs — 0 improper |
| `shell:true` in src/infra/electron | 0 hits |

---

## 8. Known Baseline Issues

| Issue | Status |
|-------|--------|
| 17 pre-existing TypeScript errors (`npx tsc --noEmit`) | Unchanged — not in P5-D scope |
| 1 pre-existing derivativeJobService HTML targetKind failure | Unchanged — not in P5-D scope |
| 43 Electron / real runtime manual smoke cases | `not_run` — not in P5-D scope |
| P5-E real runtime packaging | Not implemented |

---

## 9. Remaining P5-D Limitations

| Limitation | Status |
|------------|--------|
| No production private key generated | Key custody and signing remain external/Owner-governed |
| No production public key embedded in build | Pending P5-D wire-up with embedded root |
| `getActiveTrustedRoots()` has no production consumer | Worker thread calls it but `isProduction` is set by Electron main; no caller wires `isProduction=true` in current production path |
| `setVerificationStatus()` not wired into plugin registration | `registerLocalOfficialPlugin()` does not yet call `setVerificationStatus` |
| No `revoked_roots.json` file loader | Parse function exists; file loading is future P5-D integration |
| No offline signing tool | `createCatalogSigningPayload()` exists for canonicalization; sign tool remains external |

---

## 10. P5-E Remaining Scope

P5-E (real runtime packaging / model pre-stage) is not implemented. Remaining:

| Item | Reference |
|------|-----------|
| P5-E1: Runtime package manifest / artifact inventory contract | `45-phase5-batch2-trust-runtime-planning.md §21` |
| P5-E2: Magika model pre-stage package scaffold | |
| P5-E3: First conversion runtime pilot (Pandoc) | |
| P5-E4: Packaging regression / smoke package | |
| P5-F: Phase 5 final production readiness closeout | |

---

## 11. Electron Manual Smoke Status

43 manual smoke cases remain `not_run`. Not in P5-D scope.

---

## 12. External Audit Handoff

For Gemini CLI external audit:
- Changed source files: see §2 above
- 155/155 tests pass
- No production private keys generated or committed
- No real runtime binaries packaged
- No model files imported
- P5-E not implemented
- Full Phase 5 remains open

Gemini CLI is external audit only. It does not support `/flash-read-code`, `/flash-run-test`, `/flash-risk-review`, or `/flash-doc-check` Opencode commands.

Audit scan commands:
```bash
rg -n "BEGIN .*PRIVATE KEY|PRIVATE KEY|secretKey" src/next/file-type/officialPluginTrustedRoots.ts src/next/file-type/enginePluginTrustContracts.ts src/next/file-type/pluginCatalogSignature.ts
rg -n "Phase 5 completed|Phase 4 completed|production signing completed" docs/file-pipeline/file-type-detection-implementation/46-phase5-p5d-trust-signing-closeout.md
rg -n "shell\\s*:\\s*true" src infra electron
```

---

## 13. Forbidden Completion Claim Scan

Performed on `docs/file-pipeline/file-type-detection-implementation/` and `src/`. All matches are:
- Negations (不代表全项目完成, 不写 Phase 4 completed)
- Compliance guard wording in documentation
- Grep command references in acceptance sections
- **Zero improper completion claims**

---

## 14. Stop Confirmation

- P5-D implementation foundation completed
- Production verification gate implemented
- Root rotation / revocation scaffold implemented
- No production private keys generated
- No real runtime binaries packaged
- No real model files imported
- P5-E not implemented
- Full Phase 5 remains open
- 17 pre-existing TS errors preserved
- 1 pre-existing test failure preserved
- 43 manual smoke cases still `not_run`

---

## 15. Commit

`bf2fcc4` — `feat: add trusted root rotation and revocation scaffold`
`6f58c8c` — `fix: fail closed on unverified production engine plugins`
`0311278` — `feat: add engine plugin trust verification contracts` (`46-phase5-p5d-trust-signing-closeout.md` + README update will follow as separate docs commit)
