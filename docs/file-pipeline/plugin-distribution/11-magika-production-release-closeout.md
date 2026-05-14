# Magika Production Release Closeout

Date: 2026-05-14

Status: published and enabled for the built-in official Magika release metadata.

This closeout covers only the official Starverse Magika plugin package. It does not add marketplace behavior, auto-update, third-party plugin sources, user-provided plugin URLs, document conversion, provider file references, runtime npm install, runtime Git clone install, or root package dependencies.

## Release Asset

- Plugin ID: `magika`
- Plugin version: `0.1.0`
- Model version: `standard_v3_3`
- Runtime kind: `managed`
- Platform / arch: `win32` / `x64`
- Release tag: `starverse-plugin-magika-v0.1.0`
- Asset name: `starverse-plugin-magika-0.1.0-win32-x64.zip`
- Asset URL: `https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v0.1.0/starverse-plugin-magika-0.1.0-win32-x64.zip`
- Final size: `65,401,229` bytes
- Final SHA-256: `4397df63cdcb5dbc72622018ee6a99e8d1fb1e698265724e3c3dedbf46289728`
- Package manifest SHA-256: `7e32c31ef972d493b333395ef98b8364e08f0da535791a4911dd2730278af17d`
- Package inventory SHA-256: `cb00f8b079bb9454d9eaae61cf75041625748c2de4a0454c6b6085c01feeb0b7`

The uploaded asset is the same byte-for-byte zip that was signed and verified locally. No artifact zip, staged package tree, `.starverse-engines` content, local `node_modules`, model files, or `.artifacts/plugin-packages` content is committed.

## Signing And Trust

- Signature status: `production-signed`
- Signature algorithm: `ed25519`
- Key ID: `starverse-pdp-ed25519-prod-2026Q2`
- Public key DER fingerprint SHA-256: `141a5458134ca46fe353368ce190d3b5c8f015a6dee024e62e127a91d3f76bd6`
- Signature `signedAt`: `2026-05-14T14:58:29.502Z`
- Signature `expiresAt`: `2027-05-14T00:00:00.000Z`
- Trust root reference: `keys/starverse-pdp-ed25519-prod-2026Q2.public.pem`

The private signing key was created and kept outside the repository in the Owner-controlled secret area. Private key contents were not printed, copied into docs, copied into package artifacts, or committed. The public trust material required for verification is embedded in the built-in metadata and official trusted root code.

## Catalog Enablement

The built-in Magika release metadata is tracked in `src/next/plugin-distribution/magikaOfficialRelease.ts`.

- `remoteInstallEnabled`: `true`
- `packageRef`: `starverse-plugin-magika-v0.1.0/starverse-plugin-magika-0.1.0-win32-x64.zip`
- Download source: Starverse GitHub Release asset only
- Allowed hosts: `github.com`, `release-assets.githubusercontent.com`
- Maximum download size: `70,000,000` bytes

The catalog metadata stores the exact URL, package hash, size, manifest hash, inventory hash, signature envelope, trust root metadata, public key fingerprint, compatibility metadata, and production key ID. UI-facing read models must continue to avoid exposing raw private material, local paths, or unnecessary signature internals.

## Verification

Production signature and package verification:

```powershell
npx vitest --run src/next/plugin-distribution/magikaProdSignature.local.test.ts
```

Result: passed with the temporary local harness. The harness verified the exact release zip bytes with `verifyPluginPackageCryptographicTrust`, the production Ed25519 signature envelope, the production trust root metadata, manifest/inventory coverage, platform/architecture compatibility, and package hash/size. The temporary harness was removed after the run.

Published asset download and verification:

```powershell
npx vitest --run src/next/plugin-distribution/magikaPublishedAsset.local.test.ts
```

Result: passed with the temporary local harness. The harness downloaded the published GitHub Release asset over HTTPS, enforced official host policy, verified the final size and SHA-256, and verified the production Ed25519 signature with `verifyOfficialPackageReleaseDownload`. The temporary harness was removed after the run.

Managed plugin registration and health:

```powershell
npx vitest --run infra/files/enginePluginLifecycleService.publishedMagika.local.test.ts
```

Result: passed with the temporary local harness. The extracted published package `engine/` directory registered through `EnginePluginLifecycleService.registerLocalPackage`, enabled successfully, and returned a healthy managed Magika plugin health check. The temporary harness was removed after the run.

Real Magika classify smoke:

```powershell
$env:STARVERSE_ENABLE_REAL_MAGIKA_TESTS='1'
$env:STARVERSE_REAL_MAGIKA_PLUGIN_DIR=(Resolve-Path '.artifacts/plugin-packages/published-smoke/engine').Path
npx vitest --run src/next/file-type/magikaClassifyRunner.real.test.ts
```

Result: passed, `5/5` tests.

Real `detectFull` smoke:

```powershell
npx vitest --run infra/files/fileTypeDetectionService.realMagika.local.test.ts
```

Result: passed with the temporary local harness. `FileTypeDetectionService.detectFull` used the real managed Magika runtime from the extracted published package, persisted `standard_v3_3` as the Magika model version, and completed with a medium-cost verdict. The temporary harness was removed after the run.

## GitHub Release

The release was created with GitHub CLI against `GuXinghai/starverse`.

```powershell
gh release create starverse-plugin-magika-v0.1.0 .artifacts\plugin-packages\starverse-plugin-magika-0.1.0-win32-x64.zip --repo GuXinghai/starverse --title "Starverse Magika Plugin v0.1.0" --notes "Official Starverse Magika plugin package v0.1.0"
```

Post-upload verification confirmed the release asset size and GitHub-reported SHA-256 digest match the signed package.

## Non-Goals

This release did not add or start marketplace UI, auto-update, third-party plugin source support, user-provided plugin URLs, provider file references, document conversion engines, remote catalog fetch, dynamic runtime npm install, runtime Git clone install, root package dependency changes, model file commits, `node_modules` commits, `.starverse-engines` commits, `.artifacts/plugin-packages` commits, or private key commits.
