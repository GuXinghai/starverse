# LibreOffice Production Approval Checklist

Status: Owner-approved Windows x64 DOCX-to-PDF production support / cross-platform deferred

Date: 2026-06-23

Scope: LibreOffice Plugin Management / DOCX-to-PDF Windows x64 production approval package

Production state: `productionApproved=true` scoped to Windows x64 DOCX-to-PDF only

This checklist records the Owner decision to approve the current validated LibreOffice DOCX-to-PDF Windows x64 managed runtime path. It does not approve macOS/Linux packages, broad Office format conversion, system LibreOffice, PATH fallback, arbitrary executable paths, arbitrary package URLs, or automatic runtime download.

## Scoped Production Approval

Approved product scope:

- LibreOffice DOCX-to-PDF.
- Windows x64 initial production package only.
- Starverse managed `.svpkg` only.
- Fixed first-party GitHub Release asset descriptor.
- Manual GitHub Release install through Plugin Management `install_official_plugin`.
- Verified offline import through the same package verification and activation path as far as practical.
- DFC selected-ref / verified DerivedAsset authority.

Approved state fields:

- productionApproved: `true`
- approvedPlatform: `win32`
- approvedArch: `x64`
- approvedInput: `docx`
- approvedOutput: `pdf_attachment`
- approvedAcquisitionModes: `manual_github_release`, `offline_import`
- automaticDownloadEnabled: `false`
- postinstallDownloadEnabled: `false`
- conversionTimeDownloadEnabled: `false`

Production approval still requires a valid managed package, package size/hash verification, the implemented signed-catalog or owner-approved hash-pinned trust policy, runtime identity verification, executable identity verification, platform/arch verification, M36 path caps, enabled runtime state, no quarantine, no revocation, no hard-block expiration, approved acquisition mode, and no system/PATH fallback.

## Approved Package Identity

| Item | Value |
| --- | --- |
| Upstream authority | The Document Foundation |
| Upstream URL | `https://download.documentfoundation.org/libreoffice/stable/26.2.4/win/x86_64/LibreOffice_26.2.4_Win_x86-64.msi` |
| Observed official mirror host | `www.mirrorservice.org` |
| Runtime version | `26.2.4` |
| Platform / arch | `win32` / `x64` |
| MSI sha256 | `202f26cda071c5aa4996a5a28412fddceb3891dceb0366982c62650456c0730f` |
| MSI sizeBytes | `372539392` |
| Package name | `starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg` |
| Package sha256 | `ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e` |
| Package sizeBytes | `518907010` |
| Executable relative path | `program/soffice.exe` |
| GitHub repo | `GuXinghai/starverse` |
| GitHub release tag | `starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64` |
| Catalog source kind | `github_release_asset` |
| Catalog download state | `downloadEnabled=false` |

Manual GitHub Release install and verified offline import are approved acquisition modes. Opening Plugin Management, reading status, uploading DOCX, generating DFC options, Send Plan, and conversion attempts must not download.

## Legal And Provenance Record

Approval statement by Owner: approved for Windows x64 DOCX-to-PDF managed `.svpkg` only.

The Windows x64 legal/provenance approval record is limited to the package identity above. It covers:

- Upstream authority: The Document Foundation.
- TDF Windows x64 MSI URL, MSI sha256, and MSI size.
- Starverse `.svpkg` sha256 and size.
- Package manifest, runtime manifest, inventory, provenance JSON, license files, NOTICE / CREDITS / attribution files.
- GitHub Release source descriptor.
- DOCX-to-PDF only.

This approval does not generalize legal/provenance acceptance to future macOS or Linux packages.

## Trust And Distribution Policy

Current trust model: `owner_gated_hash_pinned_signed_catalog_required_for_production`, with M46 Owner acceptance of the validated Windows x64 hash-pinned package path and the M43 signed-catalog/revocation/expiration/rollback logic remaining in force.

Renderer-safe production trust/distribution states for the approved package include:

- `owner_approved_hash_pinned`
- `hash_pinned`
- `signature_missing`
- `catalog_untrusted`
- `windows_x64_production_approved`
- `manual_github_release_allowed`
- `verified_offline_import_allowed`
- `download_disabled_by_policy`
- `system_libreoffice_disallowed`

Revoked packages are not launchable and are not rollback targets. Expired packages remain hard blocks where the signed-catalog policy marks them hard-blocked. Rollback targets require matching runtime/plugin identity, same platform/arch, package hash/size verification, manifest/runtime/executable verification, not revoked, not expired under hard-block policy, `rollbackAllowed=true`, and the relevant trust policy pass.

## Security Acceptance Record

Accepted Windows x64 controls:

- managed runtime handle only
- no system LibreOffice
- no PATH fallback
- no renderer executable path
- no arbitrary executable path
- `shell: false`
- argument-array invocation
- sandbox input copy
- controlled output dir
- isolated profile dir
- timeout/process cleanup
- stdout/stderr redaction
- PDF output validation
- path-cap guard
- signed catalog/revocation/expiration/rollback checks

Macro, external-link, network, and embedded-object policy remains scoped to the approved Windows x64 DOCX-to-PDF path. Accepted macro/external-link/network/embedded-object risk is limited to Windows x64 DOCX-to-PDF and must be re-reviewed for any new platform package.

## DFC Production Behavior

Approved Windows x64 with valid runtime:

- DOCX exposes production-ready `pdf_attachment`.
- DerivedAsset remains `converted_pdf`.
- Send strategy remains `file_attachment`.
- Send asset ref remains `derived_asset`.
- Preview remains metadata-only.
- Send Plan remains selected-ref / verified-DerivedAsset authoritative.

Blocked states:

- Missing runtime: DOCX `pdf_attachment` unavailable/blocked, manual install available diagnostic, no automatic download.
- Invalid, disabled, quarantined, revoked, expired, untrusted, or path-blocked runtime: no ready `converted_pdf`, no stale ready PDF option, no legacy fallback, no system/PATH fallback.
- Non-Windows package without approved `.svpkg`: DOCX `pdf_attachment` unavailable/blocked with platform package pending diagnostic.

DOCX `markdown` and `original_file` remain independent.

## Plugin Management Status

Windows x64 with a valid runtime shows production approval for DOCX-to-PDF, manual install only, automatic download disabled, DOCX only, package/runtime version, trust/catalog status, and GitHub Release or verified offline import source.

macOS and Linux show the LibreOffice DOCX-to-PDF capability as known but platform package pending. They are not production-approved.

Renderer output must not expose raw package paths, runtime roots, executable paths, command lines, env, storage refs, content tokens, manifest bodies, license bodies, DOCX/PDF bodies, or full hashes.

## Cross-Platform Deferral Record

macOS and Linux remain deferred, not rejected. Production enablement is package-gated per platform.

Deferred platform packages:

- darwin / arm64
- darwin / x64
- linux / x64
- linux / arm64

Required future gates for each platform:

- official LibreOffice upstream package source
- package extraction/preparation
- `.svpkg` manifest
- executable relative path
- executable hash/size
- package size/hash
- signed catalog entry
- Plugin Management install descriptor
- runtime gate validation
- platform-specific sandbox/profile/temp behavior
- packaged Electron smoke
- DOCX-to-PDF PDF validation
- legal/provenance update if needed

## Explicitly Unsupported

Unsupported scope remains locked:

- `.doc`
- `.rtf`
- `.docm`
- `.xls/.xlsx` Office-to-PDF
- PS/EPS
- PDF OCR/local parsing
- image/audio processing
- system LibreOffice
- PATH fallback
- common-install-location probing
- arbitrary executable path
- renderer-provided executable path
- arbitrary plugin URL input
- automatic download
- startup/background download
- postinstall download
- conversion-time download

## Remaining Future Work

- Prepare and validate deferred macOS/Linux `.svpkg` packages only when separately approved.
- Publish or provision a production signed catalog/trust-root flow if Owner later requires signature trust beyond the accepted Windows x64 hash-pinned package.
- Re-review macro/external-link/network/embedded-object behavior for any new package/platform scope.
- Keep the no-auto-download regression suite and packaged smoke commands green.
