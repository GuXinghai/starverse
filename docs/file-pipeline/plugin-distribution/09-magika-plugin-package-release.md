# Magika Plugin Package Release Preparation

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
