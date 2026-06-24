# DFC-M46 LibreOffice Windows x64 Production Approval And Cross-Platform Deferral

Status: Windows x64 DOCX-to-PDF production approval implemented / macOS and Linux deferred

Authority: Owner approves production support for the current validated LibreOffice DOCX-to-PDF Windows x64 managed runtime path only.

## Owner Approval Statement

Owner approves production support for:

- LibreOffice DOCX-to-PDF.
- Windows x64 initial production package.
- Starverse managed `.svpkg` only.
- Manual user-initiated GitHub Release install.
- Verified offline import.
- Fixed first-party package descriptor only.
- Signed catalog / owner-approved hash-pinned trust policy as implemented.
- Plugin Management lifecycle controls.
- DFC selected-ref / verified-DerivedAsset authority.

## Approved Scope

Scoped production approval is now represented as:

| Field | Value |
| --- | --- |
| `productionApproved` | `true` |
| `approvedPlatform` | `win32` |
| `approvedArch` | `x64` |
| `approvedInput` | `docx` |
| `approvedOutput` | `pdf_attachment` |
| `approvedAcquisitionModes` | `manual_github_release`, `offline_import` |
| `automaticDownloadEnabled` | `false` |
| `postinstallDownloadEnabled` | `false` |
| `conversionTimeDownloadEnabled` | `false` |

The approval is tied to the expected first-party package identity and managed runtime manifest. Fake seams, imported development artifacts, missing runtimes, disabled runtimes, quarantined runtimes, wrong-platform runtimes, revoked packages, expired packages, trust-blocked packages, and path-policy failures remain non-production or blocked.

## Excluded Scope

Still unsupported:

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

## Cross-Platform Deferral Record

macOS and Linux are deferred, not rejected. Production enablement is package-gated per platform.

Deferred packages:

| Platform | Arch | Status |
| --- | --- | --- |
| `darwin` | `arm64` | deferred |
| `darwin` | `x64` | deferred |
| `linux` | `x64` | deferred |
| `linux` | `arm64` | deferred / optional |

Each future platform package requires official upstream source selection, package extraction/preparation, `.svpkg` manifest, executable relative path, executable hash/size, package size/hash, signed catalog entry, Plugin Management install descriptor, runtime gate validation, platform-specific sandbox/profile/temp validation, packaged Electron smoke, DOCX-to-PDF PDF validation, and legal/provenance update if needed.

## Package Identity

| Item | Value |
| --- | --- |
| Upstream authority | The Document Foundation |
| Upstream MSI URL | `https://download.documentfoundation.org/libreoffice/stable/26.2.4/win/x86_64/LibreOffice_26.2.4_Win_x86-64.msi` |
| MSI sha256 | `202f26cda071c5aa4996a5a28412fddceb3891dceb0366982c62650456c0730f` |
| MSI sizeBytes | `372539392` |
| Package | `starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg` |
| Package sha256 | `ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e` |
| Package sizeBytes | `518907010` |
| Runtime version | `26.2.4` |
| Package version | `0.1.0` |
| Platform / arch | `win32` / `x64` |
| Executable relative path | `program/soffice.exe` |
| GitHub release tag | `starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64` |

## Legal / Provenance Record

The Windows x64 approval record includes The Document Foundation source authority, upstream MSI URL/hash/size, `.svpkg` hash/size, package manifest, runtime manifest, inventory, provenance JSON, license files, NOTICE / CREDITS / attribution files, GitHub Release source descriptor, and Owner approval. This record is limited to Windows x64 DOCX-to-PDF and does not approve macOS/Linux packages before they exist.

## Trust / Catalog Policy

M46 keeps M43 revocation, expiration, package mismatch, signed catalog, and rollback checks. The validated Windows x64 package is accepted under the implemented signed catalog / owner-approved hash-pinned trust policy. Renderer-safe states include `owner_approved_hash_pinned`, `hash_pinned`, `signature_missing`, `catalog_untrusted`, `windows_x64_production_approved`, `manual_github_release_allowed`, `verified_offline_import_allowed`, `download_disabled_by_policy`, and `system_libreoffice_disallowed`.

Revoked packages do not launch and are not rollback targets. Expired packages remain hard blocks where policy marks expiration hard-blocked. Rollback eligibility remains same identity, same platform/arch, verified hash/size, verified manifest/runtime/executable, not revoked, not expired under hard-block policy, `rollbackAllowed=true`, and trust-policy pass.

## Acquisition Policy

Manual GitHub install remains allowed through the Magika-aligned `install_official_plugin` operation. Verified offline import remains allowed. Automatic/startup/background/postinstall/conversion-time download remains forbidden. Download starts only through explicit Plugin Management user action. The source is the fixed first-party GitHub Release asset descriptor; arbitrary URLs are not accepted.

## Security Acceptance Record

Accepted controls for Windows x64:

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

Macro, external-link, network, and embedded-object policy acceptance is scoped to Windows x64 DOCX-to-PDF only and must be re-reviewed for new platform packages.

## DFC Production Behavior

Approved Windows x64 valid runtime:

- DOCX exposes production-ready `pdf_attachment`.
- DerivedAsset remains `converted_pdf`.
- Send strategy remains `file_attachment`.
- Send asset ref remains `derived_asset`.
- Preview remains metadata-only.
- Send Plan remains selected-ref / verified-DerivedAsset authoritative.

Blocked cases:

- Missing runtime: unavailable/blocked `pdf_attachment`, manual install available diagnostic, no automatic download.
- Invalid/disabled/quarantined/revoked/expired/untrusted/path-blocked runtime: no ready `converted_pdf`, no stale ready PDF option, no legacy fallback, no system/PATH fallback.
- Non-Windows pending platform package: unavailable/blocked `pdf_attachment`, no automatic download, no system LibreOffice fallback.

DOCX `markdown` and `original_file` remain independent.

## Plugin Management Status

Plugin Management now surfaces the scoped product gate fields: production approval, approved platform/arch/input/output/acquisition modes, automatic/postinstall/conversion-time download disabled states, package decision, trust states, distribution states, signature/catalog status, revocation/expiration/rollback state, and platform package status `windows_x64_approved_mac_linux_deferred`.

Renderer DTOs remain path-free and body-free.

## Tests / Smoke Evidence

M46 focused validation so far:

- `npm run rebuild:node`: passed.
- `npx vue-tsc --noEmit --pretty false`: passed.
- Script syntax checks for `libreoffice-svpkg-preflight.mjs`, `office-pdf-libreoffice-packaged-electron-smoke.mjs`, and `office-pdf-libreoffice-official-install-smoke.mjs`: passed.
- Focused runtime / packaged confidence / view-model / UI tests: passed, 86 passed / 2 skipped.
- Focused lifecycle and DFC worker LibreOffice tests: passed, 29 passed / 98 skipped.
- Targeted signed catalog / installer / archive / acquisition / adapter / default-off path-depth tests: passed, 45 passed / 2 skipped.
- `npm run test:office-pdf-libreoffice-official-install-smoke`: failed during the download phase with sanitized `download_failed:curl_28` after states `accepted`, `pending`, `downloading`, `failed`. No activation, process launch, DOCX conversion, packaged smoke, or runtime output occurred in that run.
- `npm run test:office-pdf-libreoffice-packaged-smoke`: blocked because `STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG` is absent.
- `npm run test:office-pdf-libreoffice-packaged-electron-smoke`: blocked because `STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SVPKG` is absent.
- `git diff --check`: passed with LF/CRLF warnings only.

M45 validated evidence remains the current smoke baseline:

- Real manual GitHub `install_official_plugin` e2e smoke passed.
- Post-install DFC worker smoke passed.
- Direct packaged smoke passed with `valid_pdf`.
- True packaged Electron smoke passed.
- No-auto-download proof passed.
- Path-cap product guard tested.

Full smoke revalidation should be retried when network/package env is available; M46 code and scoped approval tests passed locally.

## Remaining Future Work

- Prepare platform packages for deferred macOS/Linux scopes only in future approved rounds.
- Keep no-auto-download regressions passing.
- Keep packaged smoke commands passing with a valid repo-external `.svpkg`.
- Re-review macro/external-link/network/embedded-object risk for any new platform.

Recommended M47: create the macOS/Linux platform package preparation plan only if Owner chooses cross-platform expansion; otherwise move to release hardening and monitoring for the approved Windows x64 DOCX-to-PDF path.
