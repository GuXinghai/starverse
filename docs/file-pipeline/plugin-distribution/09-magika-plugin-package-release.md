# Magika Plugin Package Release Preparation

> 2026-08-13 update: this document below is the historical Windows-only `0.1.x` release record. The current release target is `0.2.0`, a reproducible pure-JavaScript `any/any` package built only from `scripts/plugin-packaging/magika/package-lock.json`, pinned upstream model hashes, the checked-in runtime wrapper, and checked-in license/attribution files. The builder rejects native `.node` payloads and known native TensorFlow packages and emits a complete inventory. The current local canonical dry-run artifact is not production-signed and must not replace the built-in catalog metadata yet.

Current `0.2.0` acceptance state:

- implemented: deterministic builder, Node classification smoke, Electron `utilityProcess` executor/smoke harness, six-runner manual release matrix, identical-hash comparison, and protected signing/metadata stage;
- implemented runtime boundary: no system `node`, no `ELECTRON_RUN_AS_NODE`, no renderer/IPC-provided executable, path, environment, or raw stderr;
- network statement: the runtime loads the local model through a TensorFlow.js in-memory IO handler and makes no runtime network request; this is an external-network-free design, not an OS-level network sandbox;
- legacy handling: active `0.1.x` is not upgraded in place; after the signed `0.2.0` catalog cutover, uninstall/reset and a fresh install are required. Before cutover the detector reports an unsupported-version warning and retains basic detection instead of promising an unavailable reinstall path;
- environment-blocked: production signing, the catalog hash/size/signature/URL cutover, and six hosted-runner results. Until those complete, the tracked `0.1.x` catalog record remains historical production metadata and must not be described as the cross-platform release.

Latest local reproducibility evidence: two consecutive builds produced SHA-256 `08307d2eead8019ea51d6b1205e6a1b56da678fa215048f471e0091b4cbaeb18`, size `64,085,105` bytes, manifest SHA-256 `53037ab956545dc59b58d0a40d6dc93958bfd1ea2bce08a45795ef510fe951a2`, and inventory SHA-256 `b3218d6944ebb4c73dd285ba7f5edca9dc3b0b419f0d1cb2bc5e8275ded1f063`. Both Node and Electron utility-process classification smokes returned a valid `txt` result with model `standard_v3_3`.

Date: 2026-05-14

This record covers the release preparation of the official Starverse Magika plugin package artifact for Windows x64. It is a packaging record only; it does not enable remote install, marketplace behavior, auto-update, third-party plugin sources, document conversion, or provider file references.

## Package

- Plugin ID: `magika`
- Display name: `Starverse Magika File Type Classifier`
- Package version: `0.1.0`
- Model version: `standard_v3_3`
- Runtime kind:
  - PDP package manifest: `managed`
  - managed Magika engine manifest: `local_loader`
- Platform / arch: `win32` / `x64`
- Upstream source: official npm package `magika@1.0.0`
- Upstream repository: `https://github.com/google/magika`
- Release tag: `starverse-plugin-magika-v0.1.0`
- Release asset name: `starverse-plugin-magika-0.1.0-win32-x64.zip`
- Intended release URL after an approved upload:
  `https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v0.1.0/starverse-plugin-magika-0.1.0-win32-x64.zip`

The artifact was staged from the existing ignored local package at `.starverse-engines/magika/`. No Git clone or runtime npm install is required by the Starverse client for this package. The release package includes the local runtime dependencies needed by the pure-JS Magika runtime.

## Artifact

Local artifact path:

```powershell
.artifacts\plugin-packages\starverse-plugin-magika-0.1.0-win32-x64.zip
```

Artifact details:

- Size: `65,401,229` bytes
- SHA-256: `4397df63cdcb5dbc72622018ee6a99e8d1fb1e698265724e3c3dedbf46289728`
- Package manifest SHA-256: `7e32c31ef972d493b333395ef98b8364e08f0da535791a4911dd2730278af17d`
- Final inventory SHA-256: `cb00f8b079bb9454d9eaae61cf75041625748c2de4a0454c6b6085c01feeb0b7`
- Staged file count: `7514`

Top-level archive layout:

```text
manifest.json
inventory.json
engine/
licenses/
attribution/
node_modules/
signatures/
package.runtime.json
package-lock.runtime.json
```

The package manifest is the PDP package manifest. The managed Magika runtime manifest is stored at `engine/manifest.json` so the staged payload can be smoke-tested by pointing `STARVERSE_REAL_MAGIKA_PLUGIN_DIR` at the extracted `engine/` directory.

## Signing

Signature status: `dev-test-signed`.

The package contains a dev/test Ed25519 signature envelope at `signatures/package.sig`, plus dev/test trust metadata under `signatures/`. This signature is for validation of the release-preparation metadata path only. It is not a production Starverse signing key and does not approve executable trust.

Trust status:

- Production-signed: no
- Dev/test-signed: yes
- Unsigned: no
- Production executable trust approved: no
- Remote install enabled: no

The dev/test signature envelope covers the package manifest payload and records manifest/inventory coverage metadata. The final zip hash and size are recorded above for manual release verification. A production release should replace this with owner-approved production signing metadata before enabling catalog-based remote install.

## Validation

PDP validation result:

- `validatePluginPackageManifest`: passed
- `validatePluginPackageInventory`: passed
- `validatePluginSignatureEnvelope`: passed for dev/test metadata
- `validatePluginTrustRootMetadata`: passed for dev/test metadata
- `verifyLocalPluginPackage`: passed with `requireSignedPackages: true`
- Verification status: `verified_metadata_only`
- `registerLocalPackage`: passed with `controlledRootKind: dev_only`
- Executable trust approved: false

Managed Magika validation result:

- staged `engine/` layout passed `validateMagikaPackageLayout`
- staged `engine/` discovery passed `discoverMagikaManagedPlugin`
- staged `detectFull` smoke passed through `createManagedPluginMagikaRuntimeLoader` and the real Magika classify callback

The validation command was:

```powershell
npx vitest --run .external-runtime-work/magika-release/magika-package-release-validation.test.ts
```

Result: `1` file passed, `2/2` tests passed.

## Smoke Tests

The release package was smoke-tested from the staged package `engine/` directory:

```powershell
$env:STARVERSE_ENABLE_REAL_MAGIKA_TESTS='1'
$env:STARVERSE_REAL_MAGIKA_PLUGIN_DIR=(Resolve-Path '.artifacts/plugin-packages/staging/starverse-plugin-magika-0.1.0-win32-x64/engine').Path
npx vitest --run src/next/file-type/magikaClassifyRunner.real.test.ts
```

Additional targeted tests:

```powershell
npx vitest --run src/next/file-type/magikaManagedPlugin.test.ts src/next/file-type/magikaRuntimeLoader.test.ts src/next/file-type/magikaAdapter.test.ts
npx vitest --run src/next/plugin-distribution/packageVerification.test.ts src/next/plugin-distribution/localPackageRegistration.test.ts src/next/plugin-distribution/cryptoVerification.test.ts
```

Result: targeted release-validation and existing managed-plugin/PDP contract tests passed. The repeated non-failing warning was the existing `baseline-browser-mapping` freshness warning.

## GitHub Release

Upload was not performed.

Reasons:

- GitHub CLI was unavailable locally: `gh` was not recognized as a command.
- The artifact is dev/test-signed, not production-signed, so catalog remote install must remain disabled.

Manual upload command after installing/authenticating `gh` and after owner approval of signing status:

```powershell
gh release create starverse-plugin-magika-v0.1.0 .artifacts/plugin-packages/starverse-plugin-magika-0.1.0-win32-x64.zip --repo GuXinghai/starverse --title "Starverse Magika Plugin v0.1.0" --notes "Official Starverse Magika plugin package v0.1.0"
```

If the release already exists:

```powershell
gh release upload starverse-plugin-magika-v0.1.0 .artifacts/plugin-packages/starverse-plugin-magika-0.1.0-win32-x64.zip --repo GuXinghai/starverse --clobber
```

Before enabling any built-in catalog entry, verify the final uploaded release asset hash remains:

```text
4397df63cdcb5dbc72622018ee6a99e8d1fb1e698265724e3c3dedbf46289728
```

## Artifacts Not Committed

The following are intentionally local-only and ignored:

- `.artifacts/plugin-packages/`
- `.external-runtime-work/magika-release/`
- `.starverse-engines/magika/`
- generated zip artifact
- generated package staging tree
- Magika model files
- local `node_modules`
- dev/test signature material

`public/build-id.json` was not modified, staged, or committed by this package-release preparation.

## Catalog Status

No built-in official catalog metadata was enabled in this task.

The package is release-prepared only. Remote install remains disabled until the release asset is uploaded and production trust/signing metadata is approved.

## Scope Confirmation

This task did not start or implement marketplace UI, auto-update, third-party plugin ecosystem support, user-provided plugin URLs, document conversion, provider file references, remote catalog fetch, root package dependency changes, runtime npm install, runtime Git clone install, or unrelated plugin runtime expansion.
