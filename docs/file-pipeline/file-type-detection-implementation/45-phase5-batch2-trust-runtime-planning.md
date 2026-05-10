# 45. Phase 5 Batch 2 Trust & Runtime Packaging Planning

**状态**: Planning only — P5-D 和 P5-E 联合规划
**日期**: 2026-05-10
**阶段**: Phase 5 Batch 2 joint planning (P5-D + P5-E)
**父文档**: `43-phase5-batch1-security-closeout.md`, `44-phase5-batch1-external-audit-record.md`, `41-phase4-owner-decision-record.md`

Phase 5 Batch 2 不代表全项目完成。不代表完整插件系统已完成。不代表真实外部引擎已完成。
Full Phase 5 仍开放。
本包是 planning-only — 不实现签名，不实现打包，不导入真实 runtime，不添加模型文件，不修改生产代码。

---

## 1. Planning Scope

### 1.1 In Scope

| Item | Description | Type |
|------|-------------|------|
| P5-D | Trusted root / offline signing workflow planning | Planning only |
| P5-E | Real runtime packaging / model pre-stage planning | Planning only |
| Joint | Cross-cutting trust + packaging integration planning | Planning only |

### 1.2 Out of Scope

- No production signing implementation (key generation, Ed25519 signing, certificate issuance)
- No actual trusted root persistence implementation
- No real runtime binary import (Tika JAR, LibreOffice portable, ffprobe/ffmpeg binary, Pandoc binary)
- No real Magika model file import (`model_*.json`, `config.json`)
- No downloader / installer implementation
- No automatic runtime update implementation
- No provider_file_ref implementation
- No destructive legacy cleanup
- No broad sendPlanService refactor
- No broad appChatApp.logic.ts refactor
- No full Phase 5 completion claim

---

## 2. Handoff State from Batch 1

| Item | Status | Reference |
|------|--------|-----------|
| P5-A: BL-06 production dev-mode guard | Completed — `059688d` | `43-phase5-batch1-security-closeout.md §2` |
| P5-B: BL-07 messageAsset IPC sanitization | Completed — `af6cbd3` | `43-phase5-batch1-security-closeout.md §3` |
| P5-C: Security regression + closeout docs | Completed — `9dd4bb9` | `43-phase5-batch1-security-closeout.md` |
| External audit (Gemini CLI) | PASS — `ded1964` | `44-phase5-batch1-external-audit-record.md` |
| Full Phase 5 | Open — P5-D, P5-E not started | — |
| Owner decisions (BL-01~BL-04) | Not in development scope | `41-phase4-owner-decision-record.md` |
| 43 manual smoke cases | `not_run` | `37-p4d2-manual-smoke-execution-package.md` |
| 17 pre-existing TS errors | Known baseline | `36-p4d1-baseline-verification-ledger.md` |
| 1 pre-existing derivativeJobService test failure | Known baseline | `36-p4d1-baseline-verification-ledger.md` |

**Key property**: P5-D and P5-E are **not started** before this planning document. This package is planning only.

---

## 3. Why P5-D and P5-E Are Coupled

### 3.1 Structural Coupling

1. **Runtime artifacts need a trust model.** If runtimes are packaged before signing is designed, the verification chain cannot be retrofitted without re-packaging artifacts.

2. **Signing workflow needs real artifact constraints.** A signing design that assumes a single-file model cannot satisfy a reality where runtimes span multiple files (binary, wrapper, model, config, license).

3. **Manifest, integrity, signature, and artifact inventory are one chain.** The catalog → manifest → integrity → artifact file chain (`pluginCatalogSignature.ts` → `pluginCatalog.ts` → `magikaManagedPlugin.ts`) already exists. Adding real runtimes without the trust anchor upgrades makes the chain incomplete in production.

4. **License and attribution are shared.** Both the signing manifest and the runtime package must agree on license/attribution fields. Designing them separately risks mismatch.

5. **Platform matrix is shared.** The `platform` field in `ManagedEnginePluginManifest` (`externalEngineTypes.ts:62`) binds both the signing envelope and the packaging layout.

6. **Verification order is shared.** The validation chain in `enginePluginLifecycleService.ts:157-251` runs catalog signature → manifest hash → file integrity in sequence. Adding real packaged runtimes must respect this order.

### 3.2 Risk of Planning Separately

| Risk | Consequence |
|------|-------------|
| Signing designed for single file, but runtimes are multi-file | Force package re-design after signing is implemented |
| Package layout defined without signature slot | No place to put `.sig` / `.signature` bundle |
| Platform binding in manifest but not in package | Runtime for wrong platform could pass verification |
| modelVersion in manifest but model files unversioned | Stale model accepted after manifest update |
| License fields in manifest but no LICENSE file in package | Attribution gap |

**Decision**: P5-D and P5-E must be designed together as one planning package to prevent these structural mismatches.

---

## 4. P5-D Risk Statement

### 4.1 Risk Catalog

| ID | Risk | P-Level | Gemini Classification (if known) |
|----|------|---------|----------------------------------|
| TK-1 | Unofficial trusted root accepted in production | P0 | — (future audit) |
| TK-2 | Dev/test root leaking into production artifact chain | P0 | Confirmed P0 in BL-06 context |
| TK-3 | Unsigned or tampered runtime accepted in production | P0 | — |
| TK-4 | Stale signature after artifact mutation | P0 | — |
| TK-5 | Root rotation ambiguity — which root signs which version | P1 | — |
| TK-6 | No revocation mechanism — compromised root stays valid forever | P0 | — |
| TK-7 | Offline signing process bypass or forgery | P0 | — |
| TK-8 | Audit trail gaps — which key signed which artifact when | P1 | — |
| TK-9 | Diagnostic logs exposing key paths or artifact paths | P0 | — |

### 4.2 Risk Details

**TK-1: Unofficial root in production**
- Current state: `getActiveTrustedRoots()` (`officialPluginTrustedRoots.ts:15-55`) accepts `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` env var. No validation that the env-injected root is the real production root.
- Production fix: Hardcode or embed the production public key; do not accept env-injected roots in production.

**TK-2: Dev/test root leak**
- Current state: Protected by P5-A two-layer guard (`electron/main.ts:682-691` + `officialPluginTrustedRoots.ts:41-44`).
- Remaining risk: Test root PEM is hardcoded in `officialPluginTrustedRoots.ts:7-9`. No risk if production guard holds, but defense-in-depth should ensure the test PEM is unreachable in a production code path even if guard is bypassed.

**TK-3: Unsigned runtime accepted**
- Current state: `verifyCatalogSignature()` (`pluginCatalogSignature.ts:38-104`) checks Ed25519. But if trusted roots are empty (`official_trusted_root_unconfigured`), the check fails — which is correct (fail-closed). However, in a production package where the catalog is unsigned, the system must fail closed.

**TK-4: Stale signature after mutation**
- Current state: SHA-256 hash verification in `verifyManifestIntegrity()` (`magikaManagedPlugin.ts:545-623`) catches modified files relative to the manifest. But if the manifest itself is not re-signed after an artifact change, the hash chain breaks silently.

**TK-5: Root rotation ambiguity**
- Current state: No rotation mechanism exists. `TrustedCatalogPublicKeyMap` (`pluginCatalogSignature.ts:18`) is a Record of keyId → key — a multi-key map. Rotation is theoretically supported but no rotation workflow, versioning, or overlapping-root policy exists.

**TK-6: No revocation**
- Current state: No revocation list, no CRL, no OCSP, no offline revocation metadata. If a root key is compromised, there is no way to revoke it short of deploying a new build.

**TK-7: Offline signing bypass**
- Current state: `verifyCatalogSignature()` is the verify side. No corresponding offline sign tool exists. Signing is done by an unauthorized external process. No gate prevents a catalog signed with any key from being accepted if that key is injected into trusted roots.

**TK-8: Audit trail gaps**
- Current state: No signing log, no release ledger, no artifact → signature → key → timestamp trace.

**TK-9: Key path leakage**
- Current state: `ed25519` PEM strings contain public key material. If these appear in diagnostic logs, they could aid an attacker in fingerprinting the signing infrastructure. Currently, trusted root PEM only appears in `createPublicKey()` calls — not logged. But artifact paths (`pluginDir`, `installRef`) could leak through health check errors.

---

## 5. P5-D Affected Surfaces

Code surfaces identified by flash-code-reader subagent:

| Surface | File(s) | P5-D Impact |
|---------|---------|-------------|
| Trusted root definition | `src/next/file-type/officialPluginTrustedRoots.ts` | Add production root embedding, rotation support, revocation list |
| Catalog signature verification | `src/next/file-type/pluginCatalogSignature.ts` | Add revocation check, rotation version binding |
| Catalog entry hash verification | `src/next/file-type/pluginCatalog.ts` | Add signature timestamp, platform binding |
| Managed plugin integrity | `src/next/file-type/magikaManagedPlugin.ts` | Integrity map must match signed manifest fields |
| Engine lifecycle service | `infra/files/enginePluginLifecycleService.ts` | Add revocation gate before registration |
| Engine lifecycle IPC handlers | `infra/db/worker/handlers/enginePluginLifecycleHandlers.ts` | No change (verification happens server-side) |
| Worker runtime init | `infra/db/worker/runtime.ts` | Pass production root config, not env only |
| Production dev-mode guard | `electron/main.ts` + `officialPluginTrustedRoots.ts` | Preserve BL-06 guard, add production root as fallback |
| Electron packaging config | `electron-builder.json5` | Add extraResources for bundled trusted root / manifest |
| DB schema | `infra/db/migrations/ensureEnginePluginRegistrySchema.ts` | Add revocation metadata columns (planning only) |

**No renderer-side changes needed.** Signature verification and trusted root logic all live in the worker thread.

---

## 6. P5-D Trust Model Proposal

### 6.1 Trust Chain

```
Production Root Key (Ed25519 key pair)
  │
  ├─ Private key ──► Offline signing tool (air-gapped)
  │                    │
  │                    ├─ Signs: official_plugin_catalog.json → catalog.sig
  │                    └─ Signs: per-release manifest bundle (optional)
  │
  └─ Public key ──► Embedded in production build
                       │
                       └─► getActiveTrustedRoots() → TrustedCatalogPublicKeyMap
                              │
                              └─► verifyCatalogSignature() — Ed25519 verify
                                     │
                                     ├─ catalog signature valid?
                                     │  └─► verifyCatalogEntryHashes() — SHA-256
                                     │         │
                                     │         ├─ manifestSha256 match?
                                     │         └─ packageSha256 match?
                                     │                │
                                     │                └─► discoverMagikaManagedPlugin()
                                     │                       │
                                     │                       └─► verifyManifestIntegrity()
                                     │                              └─► per-file SHA-256
                                     │
                                     └─ catalog signature invalid? → fail-closed
```

### 6.2 Model Components

| Component | Type | Binding |
|-----------|------|---------|
| Root of trust | Ed25519 public key | Embedded in production build |
| Signing identity | keyId (e.g., `starverse-production-root-2026`) | In catalog signature |
| Artifact signature | Ed25519 signature over JSON payload | `PluginCatalogSignature.value` |
| Manifest signature | Catalog-level (signs the catalog, not individual manifests) | `verifyOfficialPluginCatalogSignature()` |
| Artifact hash | SHA-256 of file bytes | `manifestSha256` / `packageSha256` in catalog entry |
| Manifest hash | SHA-256 of manifest JSON | `entry.manifestSha256` |
| Per-file hash | SHA-256 of each runtime/model/config file | `integrity` map in manifest |
| Version binding | `pluginVersion` in catalog entry + manifest | Verified at registration |
| Platform binding | `platform` field in manifest | Verified at registration |
| EngineId binding | `engineId` in catalog entry + manifest | Cross-checked at registration |
| ModelVersion binding | `modelVersion` in manifest | Verified at registration |
| License / attribution binding | `license`, `attribution` in manifest | Parsed at registration |

### 6.3 Verification Order (Fail-Closed)

```
1. trustedRoots empty? → fail (official_trusted_root_unconfigured)
2. catalog signature missing? → fail (signature_missing)
3. signature algorithm not ed25519? → fail (signature_algorithm_unsupported)
4. signing keyId not in trustedRoots? → fail (trusted_root_missing)
5. PEM parse fails? → fail (trusted_root_invalid)
6. Ed25519 verify fails? → fail (signature_invalid)
7. manifestSha256 mismatch? → fail
8. packageSha256 mismatch? → fail
9. Per-file SHA-256 mismatch? → fail (hash_mismatch)
10. All pass → registration allowed
```

All failures must result in a disabled/unhealthy engine, never a degraded-but-running engine.

---

## 7. P5-D Offline Signing Workflow

### 7.1 Release Pipeline (Planning)

```
1. Artifact build
   ├─ Compile/acquire runtime binaries
   ├─ Package model/config files
   ├─ Generate LICENSE / ATTRIBUTION / NOTICE
   └─ Place in staged engine directory (engines/<engineId>/)

2. Inventory generation
   ├─ Compute SHA-256 for every file
   ├─ Generate manifest.json with integrity map
   ├─ Compute manifestSha256
   └─ Compute packageSha256 (archive or whole-dir hash)

3. Catalog entry creation
   ├─ Add/update entry in official_plugin_catalog.json
   ├─ Include manifestSha256, packageSha256
   ├─ Set pluginVersion, platform, minStarverseVersion

4. Offline signing
   ├─ Transfer catalog JSON to air-gapped signing machine
   ├─ Sign with production Ed25519 private key
   ├─ Generate catalog.sig (base64-encoded Ed25519 signature)
   └─ Transfer signature back; never expose private key to network

5. Signature bundle assembly
   ├─ Bundle: catalog JSON + catalog.sig = release artifact
   └─ Optionally sign individual manifests for defense-in-depth

6. Release bundle
   ├─ Package: engine directory + signed catalog update
   └─ Version the release (e.g., starverse-engines-2026-05.zip)

7. Verification before publish
   ├─ Verify catalog signature with production public key
   ├─ Verify all manifest hashes
   ├─ Verify all file integrity hashes
   └─ Reject release if any check fails

8. Verification after install
   ├─ On app startup, verify installed catalog against embedded public key
   ├─ On plugin registration, verify catalog → manifest → integrity chain
   └─ On health check, verify integrity of runtime files before execution
```

### 7.2 Audit Ledger

Each release must record:

| Field | Description |
|-------|-------------|
| Release version | Semver or date-based |
| Catalog version | Catalog JSON version field |
| Signing keyId | Which production root signed |
| Signing timestamp | When the signature was generated |
| Artifact hashes | manifestSha256 + packageSha256 per engine |
| Platform matrix | Which platforms this release covers |
| Revocation metadata | Whether this release revokes prior versions |

### 7.3 Security Constraints

- Private key must never touch a networked machine.
- Signed catalog must be verified before distribution (catch signing errors early).
- Signature generation must use the exact same `createCatalogSigningPayload()` canonicalization as verification (`pluginCatalogSignature.ts:106-126`).
- No env var can override or supplement the production trusted root in production builds.

---

## 8. P5-D Root Rotation and Revocation Planning

### 8.1 Root Versioning

Each production root key is identified by a `keyId`:

```
starverse-production-root-2026-v1
starverse-production-root-2027-v2
```

### 8.2 Overlapping Roots

During rotation, a release build embeds two public keys:
- Current root (v1) — signs this release
- Next root (v2) — pre-announced for the next rotation

The catalog can be signed by either key. After the rotation deadline, v1 is removed from the embedded set in the next build.

### 8.3 Staged Rotation

| Phase | Action | Timeline |
|-------|--------|----------|
| Pre-rotation | Generate v2 key pair. Embed v2 public key in build. v1 continues to sign. | Release N |
| Active rotation | v1 and v2 both trusted. New artifacts signed with v2. | Release N+1 |
| Post-rotation | Remove v1 from embedded roots. Only v2 trusted. | Release N+2 |

### 8.4 Emergency Revocation

If a production root is compromised:

| Mechanism | Description |
|-----------|-------------|
| Revocation list | JSON file: `{"revokedKeyIds": ["starverse-production-root-2026-v1"], "effectiveFrom": "2026-06-01T00:00:00Z"}` |
| Revocation placement | Bundled with the app; checked at startup before any catalog verification |
| Revocation check | `verifyCatalogSignature()` checks `signature.keyId` against revocation list before Ed25519 verify |
| Fail behavior | If signing keyId is revoked → `signature_invalid` (no fallback) |
| Revocation is irreversible | Once a keyId is in the revocation list, no artifact signed by that key is ever accepted |

### 8.5 Offline Revocation Metadata

- Revocation list file: `revoked_roots.json`
- Signed with the **current active** production root (or emergency backup root)
- Distributed as part of the app bundle (not fetched online in initial implementation)
- Checked at `getActiveTrustedRoots()` load time: filter out revoked keyIds from the active set

### 8.6 Downgrade Prevention

A downgraded app (older version) may trust a revoked root. Mitigations:
- Catalog `minStarverseVersion` field prevents old apps from loading new catalogs
- Revocation list is forward-only: once revoked, keyId never re-trusted
- App auto-update or manual update is the distribution channel for new revocation lists

---

## 9. P5-D Implementation Options

### 9.1 Option Comparison

| Option | Description | Pro | Con | Recommendation |
|--------|-------------|-----|-----|----------------|
| **A: Manifest-only hash** | Verify SHA-256 of manifest + package, no Ed25519 | Simple, already implemented (`verifyCatalogEntryHashes`) | No signing identity, no non-repudiation | **Rejected** — not sufficient for production |
| **B: Manifest signature (current)** | Ed25519 catalog signature + SHA-256 hashes (current code) | Already implemented | No rotation, no revocation, no signing workflow | **Baseline** — needs P5-D upgrades |
| **C: Detached artifact signature** | Individual `.sig` files per artifact | Granular verification | Complex, many signature files to manage | **Future** — P5-D3 or later |
| **D: Signed release bundle** | Single signed archive (`.zip.sig`) | Atomic release unit | Requires unpack before verification; slower | **Future** — P5-E4 or later |
| **E: Embedded production root** | Hardcode production public key in build | No env dependency, no injection risk | Requires rebuild to rotate root | **Recommended for P5-D1** |
| **F: User-installed roots** | User can add trusted roots via settings | Flexibility for enterprise | Massive P0 risk: user adds malicious root | **Rejected for production** — enterprise-only future extension with owner decision |
| **G: Offline revocation list** | Bundled `revoked_roots.json` | No network dependency, works air-gapped | Requires app update to distribute | **Recommended for P5-D3** |

### 9.2 Recommended Composition

- **P5-D1**: Option E (embedded production root) + Option B (existing Ed25519, upgraded with rotation metadata)
- **P5-D3**: Option G (offline revocation list)
- **P5-E4**: Option D (signed release bundle) for distribution packaging
- **Rejected**: Option A, Option C (complexity not justified for this phase), Option F (P0 risk)

---

## 10. P5-D Recommended Implementation Strategy

### 10.1 Phased Path (Planning):

| Subpackage | Scope | Dependencies |
|------------|-------|-------------|
| **P5-D1** | Embed production public key. Upgrade trusted roots to support keyId rotation metadata. Hardcode production root in build. Ensure `getActiveTrustedRoots()` returns production root in production (no env fallback). | P5-A (BL-06) must be completed first |
| **P5-D2** | Production verification gate. Add fail-closed policy: no production plugin registration without valid catalog signature. Add `isProduction` flag awareness to `registerLocalOfficialPlugin()`. Optionally: production-only signed catalog path (separate from dev catalogs). | P5-D1 |
| **P5-D3** | Root rotation / revocation scaffold. Add `revoked_roots.json` bundle. Add rotation config (overlapping roots with expiry). Add revocation check to `verifyCatalogSignature()`. Add audit log for registration/signature events. | P5-D2 |
| **P5-E integration** | Runtime package manifest must be signable by the P5-D pipeline. Package layout must include signature slot. | P5-D1 + P5-E1 |

### 10.2 Design Principles

- Production fails closed — no unsigned plugin, no dev root, no missing signature.
- Dev/test affordances only behind `!isProduction` gates (already enforced by P5-A).
- No env-based root injection in production (override `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` behavior).
- Signing private key never in repo, never in CI/CD.
- All verification is synchronous and blocks plugin loading.

---

## 11. P5-D Test Matrix

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Valid signed catalog with production root | Signature passes, hashes match, registration succeeds |
| 2 | Catalog missing signature field | `signature_missing` → registration fails |
| 3 | Invalid Ed25519 signature | `signature_invalid` → registration fails |
| 4 | Signing keyId not in trusted roots | `trusted_root_missing` → registration fails |
| 5 | Manifest bytes modified after signing (manifestSha256 mismatch) | Hash mismatch → registration fails |
| 6 | Package bytes modified after signing (packageSha256 mismatch) | Hash mismatch → registration fails |
| 7 | Runtime file modified after integrity hash computed | Per-file hash mismatch → `hash_mismatch` |
| 8 | engineId in catalog entry ≠ engineId in manifest | Cross-check fails → registration fails |
| 9 | platform in manifest ≠ current platform | Platform mismatch → registration fails |
| 10 | modelVersion in manifest < minModelVersion in code | Version mismatch → registration fails |
| 11 | Root key revoked in revocation list | `signature_invalid` → registration fails |
| 12 | Rotated root: old root expired, new root signs | Signature passes with new root |
| 13 | Rotated root: new root signs, but old root still trusted (overlap) | Signature passes |
| 14 | Dev root PEM used in production (isProduction=true) | `official_trusted_root_unconfigured` or hard reject |
| 15 | Unsigned catalog in production | Fail-closed: no plugins loaded |
| 16 | Sanitized diagnostics: error messages contain no PEM, path, or hash data | No sensitive data in logs |

---

## 12. P5-E Risk Statement

### 12.1 Risk Catalog

| ID | Risk | P-Level |
|----|------|---------|
| RP-1 | Runtime binaries added without trust verification | P0 |
| RP-2 | Model files drift from manifest integrity hashes | P0 |
| RP-3 | Package bloat — unnecessary files in runtime package | P1 |
| RP-4 | Platform-specific packaging errors (wrong binary arch) | P0 |
| RP-5 | License / attribution omissions | P1 |
| RP-6 | Runtime path leakage to renderer or ordinary logs | P0 |
| RP-7 | Runtime not available after install (missing dependency, broken symlink) | P0 |
| RP-8 | Offline execution mismatch: runtime works on build machine but not on user machine | P1 |
| RP-9 | Health check running before signature/integrity verification | P0 |
| RP-10 | Packaging structure incompatible with future P5-D signing | P0 |

### 12.2 Risk Details

**RP-1: No trust verification before runtime added.** If a runtime binary is bundled into the app without being registered in the signed catalog, it bypasses the entire trust chain. The packaging process must be gated by the catalog.

**RP-2: Model drift.** Magika model files (`model_*.json`, `config.json`) must match the integrity hashes in the manifest. If the model is updated but the manifest is not re-signed, verification fails — which is correct, but must be caught at build time, not at user runtime.

**RP-3: Package bloat.** Runtime packages can be large (LibreOffice portable ~500MB, Pandoc ~50MB, Tika JAR ~60MB). Unnecessary files (docs, examples, source) must be excluded from the package.

**RP-4: Platform mismatch.** A win32 ffprobe.exe bundled in a darwin build will never execute. Platform must be verified at both packaging time and runtime.

**RP-5: License/attribution gap.** Each runtime has its own license (Apache-2.0 for Tika, MPL-2.0 for LibreOffice, GPL for ffprobe). These must be included in the package and surfaced in the UI.

**RP-6: Path leakage.** The local filesystem path to a runtime binary must not appear in renderer IPC or ordinary log output. The existing path sanitization in `externalProcessRunner.ts` covers stderr, but structured health check results and IPC responses must also be sanitized.

**RP-7: Runtime not available.** A packaged runtime may fail because of missing DLLs, incorrect file permissions, or arch mismatch. The health check must detect these and report `unhealthy`/`failed` — never crash.

**RP-8: Offline mismatch.** The runtime binary runs on the CI/build machine but not on a user's machine due to different glibc, missing vcredist, or OS version incompatibility. Platform-specific smoke tests are required.

**RP-9: Health check before verification.** `runManagedMagikaPluginHealthCheck()` (`magikaManagedPlugin.ts:402-431`) runs the runtime entrypoint. If it runs before integrity verification, a tampered runtime could execute. The health check must only run after verification passes.

**RP-10: Packaging incompatible with signing.** If the directory layout doesn't match the integrity map, or if the manifest doesn't have a signature slot, the trust chain breaks. P5-E layout must be designed with P5-D signature slots from the start.

---

## 13. P5-E Affected Surfaces

Code surfaces identified by flash-code-reader subagent:

| Surface | File(s) | P5-E Impact |
|---------|---------|-------------|
| Magika managed plugin | `src/next/file-type/magikaManagedPlugin.ts` (934 lines) | Model/config pre-stage location, plugin directory resolution |
| Magika classify runner | `src/next/file-type/magikaClassifyRunner.ts` | Model file path resolution |
| External engine runners | `tikaRunner.ts`, `libreOfficeRunner.ts`, `ffprobeRunner.ts`, `pandocRunner.ts` | Runtime binary path resolution |
| External process runner | `src/next/file-type/externalProcessRunner.ts` | No change (already hardened) |
| External process policy | `src/next/file-type/externalProcessPolicy.ts` | No change |
| Engine manifest schema | `src/next/file-type/externalEngineManifest.ts` | Fields for `packageDir`, `entrypoint`, `platform` |
| Engine types | `src/next/file-type/externalEngineTypes.ts` | Runtime path in `ExternalEngineRecord` |
| Engine registry | `src/next/file-type/externalEngineRegistry.ts` | Built-in stub manifests → real manifests |
| Engine health | `src/next/file-type/externalEngineHealth.ts` | Health check must verify integrity before execution |
| Engine availability | `src/next/file-type/externalEngineAvailability.ts` | Availability depends on runtime presence + verification |
| Engine lifecycle service | `infra/files/enginePluginLifecycleService.ts` | Plugin dir resolution for managed root |
| File storage paths | `infra/db/worker/runtime.ts` | `resolveInstallPluginDir` → `<storageRoot>/engine-plugins/<kind>/<ref>` |
| Electron packaging | `electron-builder.json5` | `extraResources` for bundled runtimes |
| Electron main process | `electron/main.ts` | Copy runtimes from resources to userData on first launch |

**No renderer-side changes needed beyond existing `enginePluginLifecycleClient.ts`.**

---

## 14. P5-E Artifact Taxonomy

| Class | Description | Examples | Required |
|-------|-------------|----------|----------|
| Runtime binary | Executable or JAR that performs the engine's function | `magika.js`, `tika-server.jar`, `soffice.exe`, `ffprobe.exe`, `pandoc.exe` | Yes |
| Runtime wrapper | Script that launches the runtime with correct args | `magika-cli.js` (entrypoint), `run-tika.sh` | For Magika |
| Model file | ML model data loaded at runtime | `model_config.json`, `model_*.json` | For Magika |
| Config file | Engine configuration | `config.json` (Magika), defaults | Conditional |
| Manifest | `manifest.json` with metadata + integrity | `manifest.json` | Yes |
| Signature bundle | Ed25519 signature + metadata | `catalog.sig`, per-manifest `.sig` | Yes (production) |
| License file | License text for the runtime | `LICENSE` | Yes |
| Attribution file | Third-party notices / attribution | `ATTRIBUTION`, `NOTICE` | Yes |
| Healthcheck metadata | Command + timeout for health probe | In `manifest.json.healthcheck` | Yes |
| Platform metadata | Platform compatibility info | In `manifest.json.platform` | Yes |

---

## 15. P5-E Package Layout Proposal

### 15.1 Engine Directory Structure

```
engines/<engineId>/
  ├── manifest.json           # Engine manifest (required)
  ├── manifest.json.sig       # Detached signature (optional, defense-in-depth)
  ├── LICENSE                 # Runtime license (required)
  ├── ATTRIBUTION             # Third-party attribution (required)
  ├── NOTICE                  # Additional notices (optional)
  ├── README.md               # Engine-specific notes (optional)
  ├── runtime/                # Runtime binaries (required)
  │   ├── entrypoint          # Main entry script/binary
  │   ├── ...                 # Other runtime files
  │   └── (platform subdir)   # e.g., win32/, darwin/, linux/
  ├── model/                  # Model files (for Magika)
  │   ├── model_config.json
  │   └── model_*.json
  ├── config/                 # Configuration files (optional)
  │   └── config.json
  └── signatures/             # Signature cache / verification metadata
      └── (generated at verification time)
```

### 15.2 Install Root Kind Mapping

| InstallRootKind | Location | Purpose |
|-----------------|----------|---------|
| `managed_root` | `<userData>/engine-plugins/managed_root/<engineId>/` | Production managed plugins (signed, verified) |
| `test_root` | `<userData>/engine-plugins/test_root/<engineId>/` | Dev/test plugins (unsigned, test keys) |
| `managed_cache` | `<userData>/engine-plugins/managed_cache/<engineId>/` | Cached plugin artifacts (future downloader) |

### 15.3 Bundle Strategy

| Strategy | Description | Pros | Cons |
|----------|-------------|------|------|
| **Bundled with app** | `extraResources` in electron-builder; copied to `managed_root` on first launch | Always available offline, no download | Larger installer, harder to update independently |
| **Managed sidecar** | Separate install directory, referenced by app | Smaller app, independent updates | More complex install, platform paths differ |
| **UserData managed** | App downloads/copies on first run to userData | Works for per-user installs | Not verified before first health check |
| **Portable engines** | `portable/engines/` directory alongside the app | Portable mode support | No code-level portable support exists yet |

**Recommended for P5-E**: **Bundled with app** as default production path. Managed sidecar or userData download as future options (P5-E4+).

### 15.4 Cache Exclusion

The following must NOT be in the package:
- `.git/`, `.svn/`, `.hg/`
- `node_modules/` (except for Magika runtime)
- `__pycache__/`, `*.pyc`
- `.DS_Store`, `Thumbs.db`
- `*.log`, `*.tmp`, `*.swp`
- Build artifacts, object files, `.o`, `.obj`
- Source files unless required by license

---

## 16. P5-E Engine-Specific Planning

### 16.1 Magika Model Pre-Stage

| Property | Value |
|----------|-------|
| Purpose | File type detection via ML model |
| Artifact type | Node.js runtime (`magika.js` + `magika-cli.js`) + model files (`model_*.json`) + config (`model_config.json`) |
| Expected platform | All (Node.js cross-platform) |
| Expected manifest fields | `engineId: 'magika'`, `runtimeKind: 'managed-plugin-node'`, `runtimeEntry`, `modelVersion`, `modelFiles`, `configFiles`, `integrity` |
| License | Apache-2.0 |
| Attribution | Google Magika (https://github.com/google/magika) |
| Health check strategy | Classify a known small file (e.g., empty `.txt`); expect `label` and `score` in output |
| Verification requirements | SHA-256 integrity of all model + config + runtime files. Catalog signature for production. |
| Default posture | Enabled (core file detection engine) |
| Implementation blockers | Real model files not in repo. P5-E2 must be the first implementation subpackage after P5-D trust model is ready. |
| Non-goals | No online model download. No model auto-update. No model training or fine-tuning. |

### 16.2 Tika Package Planning

| Property | Value |
|----------|-------|
| Purpose | Document text extraction and metadata parsing (PDF, DOCX, ODT, etc.) |
| Artifact type | Java JAR (`tika-server.jar` or `tika-app.jar`) |
| Expected platform | All (requires JRE) |
| Expected manifest fields | `engineId: 'tika'`, `runtimeKind: 'managed-plugin-jar'`, `runtimeEntry: 'tika-server.jar'`, `javaArgs`, `healthcheck` |
| License | Apache-2.0 |
| Attribution | Apache Tika (https://tika.apache.org/) |
| Health check strategy | POST empty request to Tika server; expect 200 with `/tika` endpoint; timeout 5s |
| Verification requirements | SHA-256 integrity of JAR. Catalog signature for production. |
| Default posture | Disabled by default (JRE dependency, large JAR). User enables after confirming JRE availability. |
| Implementation blockers | JAR not in repo. Requires JRE detection/validation. Fake runner (`tikaRunner.ts`) already exists as contract. |
| Non-goals | No embedded JRE. No Tika server config file generation. No OCR/Tesseract integration. |

### 16.3 LibreOffice Package Planning

| Property | Value |
|----------|-------|
| Purpose | Document format conversion (DOCX→PDF, ODT→PDF, etc.) |
| Artifact type | Portable LibreOffice installation (`soffice.exe` / `soffice`) |
| Expected platform | Windows, macOS, Linux (separate packages per platform) |
| Expected manifest fields | `engineId: 'libreoffice'`, `runtimeKind: 'managed-plugin-binary'`, `runtimeEntry: 'soffice'`, `platform: 'win32'/'darwin'/'linux'` |
| License | MPL-2.0 |
| Attribution | LibreOffice (https://www.libreoffice.org/) |
| Health check strategy | `soffice --version`; expect exit code 0 and version string; timeout 10s |
| Verification requirements | SHA-256 integrity of all runtime files. Catalog signature for production. Platform match check. |
| Default posture | Disabled by default (large package ~500MB, platform-specific). |
| Implementation blockers | Portable LibreOffice build not in repo. Platform-specific packaging. Large size (500MB+). Fake runner (`libreOfficeRunner.ts`) already exists as contract. |
| Non-goals | No LibreOffice SDK integration. No UNO API usage. No Java-based LO extensions. |

### 16.4 ffprobe / ffmpeg Package Planning

| Property | Value |
|----------|-------|
| Purpose | Media file inspection (codec, duration, resolution, bitrate) |
| Artifact type | Native binary (`ffprobe.exe` / `ffprobe`) |
| Expected platform | Windows, macOS, Linux (separate binaries per platform) |
| Expected manifest fields | `engineId: 'ffprobe'`, `runtimeKind: 'managed-plugin-binary'`, `runtimeEntry: 'ffprobe'`, `platform` |
| License | GPL (or LGPL if LGPL build used) |
| Attribution | FFmpeg (https://ffmpeg.org/) |
| Health check strategy | `ffprobe -version`; expect exit code 0 and version string; timeout 5s |
| Verification requirements | SHA-256 integrity. Catalog signature. Platform match. |
| Default posture | Disabled by default (platform-specific, GPL licensing complexity). |
| Implementation blockers | FFmpeg binary not in repo. GPL vs LGPL licensing decision needed. Fake runner (`ffprobeRunner.ts`) already exists as contract. |
| Non-goals | No ffmpeg transcoding. No video/audio encoding. No streaming. |

### 16.5 Pandoc Package Planning

| Property | Value |
|----------|-------|
| Purpose | Document format conversion (Markdown, HTML, LaTeX, DOCX, etc.) |
| Artifact type | Native binary (`pandoc.exe` / `pandoc`) |
| Expected platform | Windows, macOS, Linux (separate binaries per platform) |
| Expected manifest fields | `engineId: 'pandoc'`, `runtimeKind: 'managed-plugin-binary'`, `runtimeEntry: 'pandoc'`, `platform` |
| License | GPL-2.0 |
| Attribution | Pandoc (https://pandoc.org/) |
| Health check strategy | `pandoc --version`; expect exit code 0 and version string; timeout 5s |
| Verification requirements | SHA-256 integrity. Catalog signature. Platform match. |
| Default posture | Disabled by default (platform-specific). |
| Implementation blockers | Pandoc binary not in repo. GPL licensing. Fake runner (`pandocRunner.ts`) already exists as contract. |
| Non-goals | No LaTeX distribution bundling. No pandoc-citeproc. No custom filters. |

---

## 17. P5-E Implementation Options

### 17.1 Distribution Options

| Option | Description | Pro | Con | Recommendation |
|--------|-------------|-----|-----|----------------|
| **A: Bundled with app** | `extraResources` in electron-builder; engines copied to userData on first launch | Always available, no network | Large installer, slow updates | **Recommended for Magika** (small) and **all engines** as default |
| **B: Managed sidecar** | Separate install alongside app | Smaller installer | Complex cross-platform paths | — (future) |
| **C: UserData managed** | App downloads on first run | Small installer | Needs downloader (out of scope), no verification at download time | **Future** (P5-E4+) |
| **D: Portable directory** | `portable/engines/` alongside app | Portable mode support | No code infrastructure for portable paths | **Future** (with portable mode feature) |
| **E: Manual directory import** | User points app to engine directory | Low implementation cost | Poor UX, no integrity guarantee | **Dev/test only** — not for production |
| **F: Dev-only local directory** | `STARVERSE_DEV_ENGINE_DIR` env var for development | Good dev workflow | Must not work in production | **Already partially supported** via `pluginDirs` injection |

### 17.2 Recommended Composition

- **P5-E1**: Option A (bundled with app) for contract + verification scaffold
- **P5-E2**: Option A for Magika model pre-stage (small, critical path)
- **P5-E3**: Option A for first conversion runtime pilot (recommended: Pandoc, smallest ~50MB)
- **Future**: Option C (downloader) after trust model, Option D (portable) with portable mode feature
- **Dev**: Option F (dev-only directory) already supported

---

## 18. P5-E Recommended Strategy

### 18.1 Phased Path (Planning):

| Subpackage | Scope | Dependencies |
|------------|-------|-------------|
| **P5-E1** | Runtime package manifest and artifact inventory contract. Define directory layout. Define packaging spec. Define manifest schema for non-Magika engines. Extend `MAGIKA_PACKAGE_LAYOUT` pattern to all engines. | P5-D1 (need trust model for signing contract) |
| **P5-E2** | Magika model pre-stage package scaffold. Create packaging script for Magika model + runtime. Wire model path discovery from `managed_root`. Update `discoverMagikaManagedPlugin()` to find model in managed root. | P5-E1 |
| **P5-E3** | First conversion runtime pilot (recommended: Pandoc — smallest, simple health check). Package Pandoc binary. Wire runtime path resolution. Add platform detection. | P5-E1 + P5-D1 |
| **P5-E4** | Packaging regression and smoke package. All engine health checks. Platform matrix validation. Size budget enforcement. | P5-E2 + P5-E3 |
| **Future P5-E5+** | Tika, LibreOffice, ffprobe packaging (each separately). Downloader (with owner decision). Portable mode support. | P5-D3 (revocation) + P5-E4 |

### 18.2 Design Principles

- No all-engines-at-once: package one engine at a time.
- No downloader before trust model is implemented.
- Magika first (already has managed plugin infrastructure).
- Pandoc first for conversion runtimes (smallest, simplest).
- Each engine package is independently verifiable via catalog signature.
- Disabled-by-default for all conversion engines; user opts in after install.

### 18.3 Implementation Sequence

```
P5-D1 (embedded root) ──► P5-E1 (packaging contract)
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              P5-E2 (Magika)        P5-D2 (verify gate)
                    │                     │
                    └──────────┬──────────┘
                               ▼
                         P5-E3 (Pandoc pilot)
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
              P5-D3 (revocation)    P5-E4 (smoke/regression)
```

---

## 19. P5-E Test Matrix

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| 1 | Magika model + runtime present and hash-verified | Discovery succeeds, health check passes |
| 2 | Runtime binary missing from package | Discovery fails, engine marked `unhealthy` |
| 3 | Model file missing (`model_config.json` not found) | `integrity_missing` → registration fails |
| 4 | Config file missing | `config_file_missing` → registration fails |
| 5 | Runtime file hash mismatch (tampered) | `hash_mismatch` → registration fails |
| 6 | Manifest signature invalid (if per-manifest sig) | Registration fails |
| 7 | Platform mismatch (win32 runtime on darwin) | Platform check fails → registration fails |
| 8 | LICENSE file missing | Manifest validation warns (not hard fail — non-blocking) |
| 9 | ATTRIBUTION file missing | Manifest validation warns (non-blocking) |
| 10 | Health check runs before verification | Must not happen — verification is gating |
| 11 | Health check after verification, runtime works | Engine marked `healthy` |
| 12 | Health check timeout (runtime hangs) | Engine marked `timeout` or `unhealthy` |
| 13 | Disabled engine not health-checked | Skip health check, availability shows `disabled` |
| 14 | No raw path in renderer IPC | Renderer receives `engineId`, `healthStatus`, `displayName` only |
| 15 | No raw path in ordinary logs | Paths sanitized to `[engine-path]` or omitted |
| 16 | Bundled engines copied correctly on first launch | Files present in `managed_root/<engineId>/` after startup |
| 17 | Dev mode: `pluginDirs` injection works for local development | Developer can test with local engine directory |
| 18 | Production: dev-only directory not used | `STARVERSE_DEV_ENGINE_DIR` ignored when `isProduction=true` |

---

## 20. Shared Security Principles

These principles apply to both P5-D and P5-E implementation:

1. **Production fails closed.** No unsigned plugin. No dev root. No missing signature. No runtime execution without verification.
2. **No dev/test root in production.** Enforced by P5-A (BL-06). P5-D must embed production root directly.
3. **No unsigned runtime in production.** Every runtime file must have a verified integrity hash and a valid catalog signature.
4. **No runtime execution before verification.** Health check must be gated by signature + integrity verification.
5. **No health check before verification.** `runManagedMagikaPluginHealthCheck()` must verify first.
6. **No raw local path to renderer.** IPC responses must sanitize `installRef`, `pluginDir`, `runtimeEntry` paths. Renderer receives only `engineId`, `displayName`, `healthStatus`.
7. **No contentToken leakage.** `contentToken` field already not in renderer types. Maintain this.
8. **No full hash leakage to renderer or ordinary logs.** SHA-256 hashes may appear only in controlled audit records (signed audit log) when needed for debugging.
9. **Runtime package paths must be sanitized in ordinary diagnostics.** Error messages use `[engine-path]/runtime/entrypoint` not the absolute path.
10. **External engines must use existing safe process runner constraints.** `externalProcessRunner.ts` already enforces `shell: false`, timeout, output cap, policy check. All new engine runtimes must use it.
11. **`shell: true` remains forbidden.** Rejected at `externalProcessPolicy.ts:83-89`.
12. **`.bat`/`.cmd` direct execution remains forbidden.** Rejected at `externalProcessPolicy.ts:96-102` unless future policy explicitly designs a safe wrapper with owner approval.
13. **No env var can override production trusted root.** `SV_OFFICIAL_PLUGIN_TRUSTED_ROOTS` must be ignored when `isProduction=true`.
14. **Signing key material must never be in the repository.** Private keys are generated and stored offline. Public keys are embedded in production builds.

---

## 21. Phase 5 Batch 2 Implementation Subpackages

This section is planning only. Do not implement any subpackage.

| ID | Subpackage | Scope | Priority | Depends On |
|----|------------|-------|----------|------------|
| P5-D1 | Trust model contracts and signature metadata schema | Embed production public key. Upgrade `TrustedCatalogPublicKeyMap` with rotation metadata (`validFrom`, `validUntil`, `revoked`). Define `PluginCatalogSignature` v2 schema. | P0 | P5-A (BL-06) |
| P5-D2 | Production verification gate and fail-closed policy | Production catalog path. `registerLocalOfficialPlugin()` production mode (no test root, no env injection). Fail-closed: no plugins loaded if catalog missing/unsigned in production. | P0 | P5-D1 |
| P5-D3 | Root rotation / revocation scaffold | `revoked_roots.json` bundle. Rotation config (overlapping roots). Revocation check in `verifyCatalogSignature()`. Audit log for registration events. | P0 | P5-D2 |
| P5-E1 | Runtime package manifest / artifact inventory contract | Define `RuntimeEnginePackageLayout` for all engine types. Extend manifest schema for non-Magika engines. Define packaging spec (required files, optional files, cache exclusion). | P0 | P5-D1 |
| P5-E2 | Magika model pre-stage package scaffold | Packaging script for Magika model + runtime. Wire `managed_root` path for Magika discovery. Update `discoverMagikaManagedPlugin()` to find managed root. | P0 | P5-E1 |
| P5-E3 | First conversion runtime pilot (Pandoc recommended) | Package Pandoc binary. Wire runtime path for Pandoc. Platform-specific binary selection. Health check integration. | P1 | P5-E1 + P5-D2 |
| P5-E4 | Packaging regression / smoke package | All engine health checks. Platform matrix validation. Size budget enforcement. Cross-platform smoke (manual, with real runtimes). | P1 | P5-E2 + P5-E3 |
| P5-F | Phase 5 final production readiness closeout | Final acceptance matrix. All P5-D + P5-E items integrated. Manual smoke with real runtimes in Electron. Production signing key pair generated (offline). | P0 | All above |

---

## 22. Non-Goals

### 22.1 Explicitly Excluded

- **No production signing implementation.** No Ed25519 key generation. No offline signing tool. No CI/CD integration for signing.
- **No actual trusted root persistence implementation.** No production public key embedded in code. No `revoked_roots.json` generated.
- **No real runtime binary import.** No Tika JAR, LibreOffice portable, ffprobe binary, or Pandoc binary added to repository.
- **No real Magika model file import.** No `model_*.json` or `model_config.json` added to repository.
- **No downloader / installer implementation.** No `fetchEngine`, `downloadRuntime`, or `installRuntime` functions.
- **No automatic runtime update.** No version checking, no delta updates, no auto-update integration.
- **No Tika / LibreOffice / ffprobe / Pandoc real execution.** The fake runners remain as contracts.
- **No provider_file_ref implementation.**
- **No destructive legacy cleanup.**
- **No broad sendPlanService refactor.**
- **No broad appChatApp.logic.ts refactor.**
- **No full Phase 5 completion claim.**

### 22.2 Baseline Issues Preserved

- 17 pre-existing TypeScript errors (`npx tsc --noEmit`).
- 1 pre-existing derivativeJobService HTML targetKind test failure.
- 43 Electron / real runtime manual smoke cases remain `not_run`.
- P5-D and P5-E are not implemented before this planning package.
- Real Tika / LibreOffice / ffprobe / Pandoc runtimes are not in repo and have not been executed.
- Production trusted root / signing workflow is not implemented before this planning package.
- Real runtime packaging / model pre-stage is not implemented before this planning package.

---

## 23. Acceptance Commands

### 23.1 Planning Acceptance (This Package)

Run these commands to verify the planning document:

**Preflight:**
```
git status --short
git log -10 --oneline
```

**Docs validation:**
```
git diff --check
git diff --name-only
```

**Forbidden completion claim scan:**
```
rg -n "Phase 5 completed|Phase 4 completed|Phase 4 implementation completed|主工程已完成|完整插件系统已完成|真实 Tika runtime 已完成|真实 LibreOffice runtime 已完成|真实 ffprobe runtime 已完成|真实 Pandoc runtime 已完成|第三方插件生态已完成|全项目完成|production signing completed|real runtime packaging completed|trusted root completed|offline signing completed" docs/file-pipeline/file-type-detection-implementation
```

**Trust / signing surface scan:**
```
rg -n "trustedRoot|trusted root|officialPluginTrustedRoots|signature|signing|signed|verify|verification|revocation|rotation|root" src infra electron docs/file-pipeline/file-type-detection-implementation
```

**Runtime packaging surface scan:**
```
rg -n "magika|tika|LibreOffice|libreoffice|ffprobe|ffmpeg|pandoc|runtime|modelVersion|modelFiles|configFiles|integrity|manifest|engines/" src infra electron docs/file-pipeline/file-type-detection-implementation
```

**Process safety scan:**
```
rg -n "shell\\s*:\\s*true|exec\\(|spawn\\(|execFile\\(" src infra electron
```

**Path / token / hash log scan:**
```
rg -n "console\\.(log|warn|error).*([A-Za-z]:\\\\|file://|/Users/|/home/|/mnt/|contentToken|fullHash|storageUri)" src infra electron docs
```

### 23.2 Future Implementation Acceptance

These commands should be run when P5-D and P5-E implementation subpackages are created:

```
# P5-D acceptance
npx vitest run src/next/file-type/officialPluginTrustedRoots.test.ts
npx vitest run src/next/file-type/pluginCatalogSignature.test.ts
npx vitest run src/next/file-type/pluginCatalog.test.ts
npx vitest run infra/files/enginePluginLifecycleService.test.ts

# P5-E acceptance
npx vitest run src/next/file-type/magikaManagedPlugin.test.ts
npx vitest run src/next/file-type/magikaClassifyRunner.real.test.ts  # requires STARVERSE_REAL_MAGIKA_PLUGIN_DIR

# Broad regression
npx vitest run
npx tsc --noEmit  # expect 17 pre-existing errors, no new errors
```

---

## 24. Grep Scans (Recorded for Future Audit)

The following scan commands are included for documentation and future audit:

```bash
# Forbidden completion claim scan
rg -n "Phase 5 completed|Phase 4 completed|..." docs/file-pipeline/file-type-detection-implementation

# Trust / signing surface scan
rg -n "trustedRoot|trusted root|signature|signing|revocation|rotation|root" src infra electron

# Runtime packaging surface scan
rg -n "magika|tika|libreoffice|ffprobe|ffmpeg|pandoc|runtime|modelVersion|integrity|manifest|engines/" src infra electron

# Process safety scan
rg -n "shell\\s*:\\s*true|exec\\(|spawn\\(" src infra electron

# Console leak scan
rg -n "console\\.(log|warn|error).*([A-Za-z]:\\\\|file://|/Users/|/home/|/mnt/|contentToken|fullHash|storageUri)" src infra electron docs
```

---

## 25. External Audit Handoff

### 25.1 For Gemini CLI

After this planning package is committed, provide Gemini CLI with:

1. This planning document (`45-phase5-batch2-trust-runtime-planning.md`).
2. The following scan commands in Section 24.
3. The following context:
   - Phase 5 Batch 1 completed and externally audited (see `44-phase5-batch1-external-audit-record.md`).
   - Phase 5 Batch 2 is planning only — no implementation.
   - P5-D and P5-E are not started.
   - All existing runtime code is stubbed (fake runners only).
   - No real runtimes or model files are in the repository.
   - `electron-builder.json5` has no `extraResources` (placeholder state).
   - 17 pre-existing TS errors and 1 pre-existing test failure are known baseline.
   - 43 manual smoke cases are `not_run`.

### 25.2 Gemini CLI Constraints

- Gemini CLI is external audit only.
- It does not support `/flash-read-code`, `/flash-run-test`, `/flash-risk-review`, or `/flash-doc-check` Opencode commands.
- It should audit the planning document for completeness, risk coverage, and non-goal consistency.
- It should flag any completion claim that suggests Phase 5 or full project completion.
- It should verify that no implementation was committed alongside the planning document.

---

## 26. No Overclaim Section

- Phase 5 Batch 2 P5-D/P5-E 联合规划文档已创建。
- Phase 5 Batch 2 不代表全项目完成。
- P5-D 未实现（trusted root / signing 未开始）。
- P5-E 未实现（real runtime packaging 未开始）。
- 真实 runtime 二进制未入库（Tika JAR, LibreOffice portable, ffprobe binary, Pandoc binary）。
- 真实 Magika 模型文件未入库（model_*.json, model_config.json）。
- Production trusted root 密钥对未生成。
- Offline signing pipeline 未建立。
- Revocation list 未创建。
- Root rotation 未配置。
- electron-builder.json5 未修改（无 extraResources）。
- Electron 手工烟测未执行（43 cases not_run）。
- 17 pre-existing TS errors 未修复。
- 1 derivativeJobService test failure 未修复。
- Full Phase 5 remains open.

---

## 27. Commit

- **文件**: `45-phase5-batch2-trust-runtime-planning.md` (new)
- **README**: 索引 + 状态更新
- **commit message**: `docs: plan phase 5 batch 2 trust and runtime packaging`
