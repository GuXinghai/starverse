# DFC-M62 LibreOffice Approved Runtime Owner Gate Unblock

Date: 2026-06-24

## Objective

DFC-M62 fixes the installed-state blocker left by M61: the already installed and approved Windows x64 LibreOffice runtime was still reported as blocked by `owner_gate_not_production_approved`.

This round did not reinstall LibreOffice, did not download the package again, did not use external `.svpkg` or runtime injection, and did not use system LibreOffice or PATH fallback.

## Approved Scope

The approval decision remains limited to the exact M46 Windows x64 scope:

- platform/arch: `win32` / `x64`
- runtime version: `26.2.4`
- package: `starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg`
- package size/hash: matched the M46 approved catalog values
- acquisition source: managed `.svpkg` from the official GitHub Release / Plugin Management install path
- conversion scope: DOCX to `pdf_attachment`
- executable relative path: `program/soffice.exe`

macOS/Linux packages, `.doc`, `.rtf`, `.docm`, Excel-to-PDF, PS/EPS, PDF OCR, image/audio, system LibreOffice, PATH fallback, arbitrary executable paths, renderer-provided paths, and arbitrary package URLs remain out of scope.

## Root Cause

The M61 real install completed the install lifecycle but the active runtime manifest still carried package-preparation provenance for the upstream MSI instead of the Starverse approved `.svpkg` package identity.

The product gate compared the active manifest against the M46 approved `.svpkg` catalog identity. Because the manifest's package hash/source metadata did not match the approved package descriptor, the runtime bridge reported `productionApproved=false`, and Plugin Management/DFC surfaced the generic `owner_gate_not_production_approved` diagnostic.

This was an activation metadata persistence mismatch, not evidence that the installed LibreOffice runtime binary was wrong.

## Fix

The production approval decision now uses one consistent exact-scope matcher for both Plugin Management and DFC runtime availability.

Changes implemented:

- Added precise approved-scope mismatch diagnostics for package hash, package source, platform/arch, package/runtime version, and DOCX-to-PDF scope.
- Replaced the generic owner-gate block for managed LibreOffice runtimes with exact diagnostics when a runtime fails the Windows x64 approval matcher.
- Added a one-time activation manifest backfill for the already installed known-good Windows x64 `26.2.4` runtime whose manifest still has the legacy upstream MSI provenance fields.
- Stamped future official `.svpkg` imports with verified Starverse package hash/source metadata before activation.
- Kept size/hash/trust/staging/activation checks intact; no validation was weakened.
- Added a smoke-only DB worker timeout override so the live installed-state DOCX conversion can finish without changing the product default timeout.

## Installed Runtime Result

Installed-state verification reused the existing app-managed runtime.

Sanitized result:

| Field | Result |
| --- | --- |
| External `.svpkg` injection | not used |
| External runtime injection | not used |
| Install/download attempted | no |
| Runtime status | ready |
| Source kind | managed manifest |
| Production approval | approved for Windows x64 DOCX-to-PDF |
| Runtime version | `26.2.4` |
| Package version | `0.1.0` |
| Automatic download | disabled |
| Conversion-time download | disabled |

## Plugin Management and DFC Availability

Plugin Management and DFC now use the same approval decision. The LibreOffice Office PDF runtime is reported ready for the approved Windows x64 DOCX-to-PDF scope.

Mismatch behavior remains fail-closed:

| Mismatch | Diagnostic |
| --- | --- |
| package hash mismatch | `office_pdf_runtime_package_hash_mismatch` |
| package source mismatch | `office_pdf_runtime_package_source_mismatch` |
| platform/arch mismatch | `office_pdf_runtime_package_platform_mismatch` |
| package/runtime version mismatch | `office_pdf_runtime_package_version_mismatch` |
| executable/capability/scope mismatch | `office_pdf_runtime_package_scope_mismatch` |

## Live DOCX-to-PDF Result

Live installed-state DOCX workflow passed.

Sanitized result:

| Field | Result |
| --- | --- |
| DOCX workflow attempted | yes |
| DOCX `pdf_attachment` | available |
| Target kind | `pdf_attachment` |
| DerivedAsset kind | `converted_pdf` |
| Send strategy | `file_attachment` |
| SendAssetRef kind | `derived_asset` |
| PDF validation | `valid_pdf` |
| Preview | metadata-only PDF preview behavior preserved |
| Available independent options | `original_file`, `markdown`, `pdf_attachment` |

No silent fallback occurred. The selected `pdf_attachment` did not fall back to markdown, original file, plain text, legacy selectedSendMode, system LibreOffice, or PATH output.

## Validation

Completed:

- `npm run rebuild:node`
- targeted owner-gate tests
- targeted Plugin Management production-gate test
- targeted DFC DOCX `pdf_attachment` availability tests
- `npm run rebuild:electron`
- live installed-state DOCX-to-PDF smoke
- `node --check scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs`
- `npx vue-tsc --noEmit --pretty false`
- `git diff --check`
- privacy/artifact scan

The live smoke did not start `install_official_plugin`, did not download a package, and did not use external package/runtime injection.

## Privacy and Artifact Evidence

Evidence was kept sanitized:

- no raw runtime root
- no package path
- no executable path
- no sandbox/input/output path
- no command line
- no environment values
- no storage refs
- no content tokens
- no full hashes
- no DOCX/PDF bodies
- no manifest body
- no private keys

No LibreOffice `.svpkg`, MSI, extracted runtime, staging output, sandbox output, packaged output, temp output, or private signing key was committed.

## Final Classification

`approved_runtime_owner_gate_unblocked_live_docx_verified`

## Next Step

Recommended M63: close out the Windows x64 LibreOffice DOCX-to-PDF production evidence by auditing user-facing wording and release notes around installed-state readiness, proxy/manual install recovery, and deferred non-Windows package work. Do not expand platform or format scope.
