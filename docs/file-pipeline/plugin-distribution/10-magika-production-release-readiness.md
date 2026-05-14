# Magika Production Release Readiness

Date: 2026-05-14

Status: release-prepared only. Remote install remains disabled because the package is dev/test-signed and the GitHub Release asset has not been published.

## Package Target

- Plugin: Starverse official Magika file classification plugin
- Plugin ID: `magika`
- Plugin version: `0.1.0`
- Model version: `standard_v3_3`
- Runtime kind: `managed`
- Platform: `win32`
- Architecture: `x64`
- Release tag: `starverse-plugin-magika-v0.1.0`
- Asset name: `starverse-plugin-magika-0.1.0-win32-x64.zip`
- Intended URL: `https://github.com/GuXinghai/starverse/releases/download/starverse-plugin-magika-v0.1.0/starverse-plugin-magika-0.1.0-win32-x64.zip`
- Local prepared artifact: `.artifacts/plugin-packages/starverse-plugin-magika-0.1.0-win32-x64.zip`
- Size: `65,401,229` bytes
- SHA-256: `4397df63cdcb5dbc72622018ee6a99e8d1fb1e698265724e3c3dedbf46289728`
- Signature status: `dev-test-signed`
- Trust status: not production trusted

The local artifact path is intentionally ignored and must not be committed. It contains the release package prepared from the official Google Magika source/npm package lineage, but it is not yet a production-trusted Starverse download.

## Production Signing Prerequisites

Before this package can be treated as production trusted, the Owner must complete all of the following:

- Approve the Starverse production package-signing mechanism and key custody process.
- Generate or use an approved production Ed25519 signing key outside tracked source.
- Ensure private signing material is never committed, copied into `.starverse-engines/`, included in `.artifacts/`, or embedded in the package.
- Produce production signature metadata for the exact package bytes intended for release.
- Ensure the signature covers the expected package identity, package SHA-256, package size, manifest SHA-256, inventory SHA-256, platform, architecture, and compatibility range.
- Ensure the production public trust root is available to the PDP verification path through the approved in-repo mechanism.
- Rerun PDP package verification with production trust material and no dev/test override.

Dev/test signing is useful for local smoke coverage only. It must not be represented as production trust and must not enable remote install.

## GitHub Release Prerequisites

Before upload:

- Install GitHub CLI and authenticate an account with release permissions for `GuXinghai/starverse`.
- Verify the active repository target is `GuXinghai/starverse`.
- Recompute the local artifact SHA-256 and size immediately before upload.
- Confirm the artifact has been production-signed, or stop and keep the package release-prepared only.
- Confirm no artifact zip, model file, `node_modules`, `.starverse-engines`, `.artifacts`, or `public/build-id.json` content is staged.

Manual commands after production signing and GitHub CLI authentication:

```powershell
gh auth status
gh repo view GuXinghai/starverse
Get-FileHash .artifacts\plugin-packages\starverse-plugin-magika-0.1.0-win32-x64.zip -Algorithm SHA256

gh release create starverse-plugin-magika-v0.1.0 `
  .artifacts\plugin-packages\starverse-plugin-magika-0.1.0-win32-x64.zip `
  --repo GuXinghai/starverse `
  --title "Starverse Magika Plugin v0.1.0" `
  --notes "Official Starverse Magika plugin package v0.1.0"
```

If the release already exists:

```powershell
gh release upload starverse-plugin-magika-v0.1.0 `
  .artifacts\plugin-packages\starverse-plugin-magika-0.1.0-win32-x64.zip `
  --repo GuXinghai/starverse `
  --clobber
```

## Gated Catalog Metadata

No built-in Magika catalog entry is enabled by this document. If a built-in official catalog entry module is added or updated after production signing and upload, use a disabled draft until both gates pass.

Required disabled reasons before production release:

- `production_signature_missing`
- `release_asset_not_published`

Catalog fields to populate after production signing and release upload:

```json
{
  "pluginId": "magika",
  "pluginVersion": "0.1.0",
  "runtimeKind": "managed",
  "platform": "win32",
  "arch": "x64",
  "packageRef": "starverse-plugin-magika-v0.1.0/starverse-plugin-magika-0.1.0-win32-x64.zip",
  "packageSha256": "4397df63cdcb5dbc72622018ee6a99e8d1fb1e698265724e3c3dedbf46289728",
  "packageSizeBytes": 65401229,
  "manifestSha256": "7e32c31ef972d493b333395ef98b8364e08f0da535791a4911dd2730278af17d",
  "inventorySha256": "cb00f8b079bb9454d9eaae61cf75041625748c2de4a0454c6b6085c01feeb0b7",
  "signatureRef": "<production-signature-metadata-ref>",
  "compatibility": {
    "platforms": ["win32"],
    "architectures": ["x64"],
    "starverseVersionRange": ">=0.0.0"
  },
  "channel": "stable"
}
```

The current PDP catalog metadata contract uses a safe relative `packageRef`; the GitHub Release URL is the resolved release location, not a raw user-provided plugin URL. UI read models must continue to hide raw hashes, signatures, and local paths.

Remote install remains disabled until:

- the production signature exists and verifies,
- the release asset exists at the intended GitHub Release URL,
- package hash and size match the catalog metadata,
- PDP package verification passes without dev/test trust,
- Owner explicitly approves enabling the official catalog install path.

## Post-Upload Smoke

After production signing and upload, rerun the validation from the published asset, not from an editable working package.

```powershell
gh release download starverse-plugin-magika-v0.1.0 `
  --repo GuXinghai/starverse `
  --pattern starverse-plugin-magika-0.1.0-win32-x64.zip `
  --dir .artifacts\plugin-packages\download-check

Get-FileHash .artifacts\plugin-packages\download-check\starverse-plugin-magika-0.1.0-win32-x64.zip -Algorithm SHA256
```

Then extract to an ignored temporary directory and rerun:

```powershell
$env:STARVERSE_ENABLE_REAL_MAGIKA_TESTS = "1"
$env:STARVERSE_REAL_MAGIKA_PLUGIN_DIR = "<extracted-plugin-dir>"
npx vitest --run src/next/file-type/magikaClassifyRunner.real.test.ts
npx vitest --run src/next/file-type/magikaManagedPlugin.test.ts src/next/file-type/magikaRuntimeLoader.test.ts src/next/file-type/magikaAdapter.test.ts
npx vitest --run src/next/plugin-distribution/packageVerification.test.ts src/next/plugin-distribution/localPackageRegistration.test.ts src/next/plugin-distribution/cryptoVerification.test.ts
```

If a production catalog entry is added, also rerun:

```powershell
npx vitest --run src/next/plugin-distribution/catalogMetadata.test.ts src/next/plugin-distribution/catalogReadModel.test.ts src/next/plugin-distribution/downloadPolicy.test.ts
```

## Current Readiness Decision

The Magika package is release-prepared but not production releasable from the client. The remaining Owner-owned gates are production signing, release publication, post-upload verification, and an explicit catalog enablement decision.

No marketplace UI, auto-update, third-party plugin ecosystem, user-provided plugin URL, document conversion engine, provider file reference flow, dynamic npm install, or git-clone runtime install is part of this readiness step.
