# DFC-M63 LibreOffice Plugin Availability Smoke and Production Closeout

Date: 2026-06-24

## Objective

DFC-M63 verifies that the approved Windows x64 LibreOffice DOCX-to-PDF runtime is not only available to the DFC backend, but also visible and usable through the Plugin Management user path.

This round did not run `install_official_plugin`, did not download or retry the package, did not uninstall/reinstall, did not use external `.svpkg` or runtime injection, and did not use system LibreOffice or PATH fallback.

## Approved User-Facing Scope

User-facing wording for the approved scope:

- Windows x64 supported
- DOCX to PDF only
- Managed LibreOffice runtime
- Manual official install
- No automatic conversion-time download
- macOS/Linux packages pending

Explicitly out of scope:

- `.doc`
- `.rtf`
- `.docm`
- Excel-to-PDF
- PS/EPS
- PDF OCR/local parsing
- image/audio processing
- system LibreOffice
- PATH fallback
- arbitrary executable path
- renderer-provided executable path
- arbitrary package URL
- automatic/startup/background/postinstall/conversion-time download

## Live Plugin Management Smoke

The live Starverse app was launched against the existing app-managed runtime state. The smoke opened Plugin Management, found the LibreOffice Office PDF plugin entry, and verified the installed runtime state.

Sanitized Plugin Management evidence:

| Field | Result |
| --- | --- |
| Plugin visible | yes |
| Runtime status | ready |
| Installed runtime reused | yes |
| Install/download attempted | no |
| Recheck attempted | yes |
| Recheck started download/install | no |
| Production approval | approved for Windows x64 DOCX-to-PDF |
| Platform | `win32` |
| Arch | `x64` |
| Scope | DOCX-to-PDF only |
| Automatic download | disabled |
| Conversion-time download | disabled |
| macOS/Linux | package pending |
| Sensitive UI text detected | no |

The runtime status remained `ready` before and after Recheck.

## Live DOCX-to-PDF Smoke

A small DOCX fixture was attached through the live app path. The approved runtime exposed the DOCX `pdf_attachment` option and generated a verified converted PDF.

Sanitized DFC evidence:

| Field | Result |
| --- | --- |
| DOCX workflow attempted | yes |
| Available targets | `original_file`, `pdf_attachment`, `markdown` |
| Selected target | `pdf_attachment` |
| DerivedAsset kind | `converted_pdf` |
| Send strategy | `file_attachment` |
| SendAssetRef kind | `derived_asset` |
| PDF validation | `valid_pdf` |
| Preview | metadata-only PDF preview behavior preserved |
| Diagnostic | none |

No silent fallback occurred. The selected `pdf_attachment` did not fall back to markdown, original file, plain text, legacy selectedSendMode, system LibreOffice, or PATH output.

## Unsupported Format Lock

Targeted DFC availability tests confirmed unsupported Office/PDF families remain outside the LibreOffice production route:

| Format family | Result |
| --- | --- |
| `.doc` | unsupported |
| `.rtf` | unsupported |
| `.docm` | unsupported |
| Excel-to-PDF | unsupported |
| PS/EPS | unsupported |
| PDF OCR/local parsing | unsupported |

DOCX `markdown` and `original_file` remain independent options where already supported.

## Test Index

| Area | Evidence |
| --- | --- |
| proxy/system route | M58/M59 evidence docs and proxy transport tests |
| official install | M45/M57/M59/M61 evidence docs and lifecycle tests |
| staging/import | M60 evidence doc and archive/lifecycle tests |
| owner gate | M62 evidence doc and `dfcManagedLibreOfficeRuntime` tests |
| Plugin Management availability | live M63 smoke, `enginePluginLifecycleService` tests, `PluginManagementPanel` tests |
| Recheck runtime | live M63 smoke |
| DFC DOCX `pdf_attachment` | live M63 smoke and worker DFC tests |
| live DOCX-to-PDF | live M63 smoke |
| no silent fallback | live M63 smoke and DFC worker tests |
| unsupported formats | DFC worker unsupported-format tests |

## Validation

Completed:

- `npm run rebuild:node`
- targeted Plugin Management tests
- targeted owner-gate tests
- targeted DFC availability tests
- targeted unsupported format tests
- `node --check scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs`
- `npx vue-tsc --noEmit --pretty false`
- `npm run rebuild:electron`
- live Plugin Management / Recheck / DOCX-to-PDF smoke
- `git diff --check`
- privacy/artifact scan

## Privacy and Artifact Evidence

Evidence remained sanitized:

- no raw URL
- no signed redirect URL
- no proxy credentials
- no package path
- no runtime root
- no executable path
- no sandbox/input/output path
- no command line
- no environment values
- no storage refs
- no content tokens
- no full hashes
- no DOCX/PDF body
- no manifest body
- no private keys

No LibreOffice `.svpkg`, MSI, extracted runtime, staging output, sandbox output, packaged output, temp output, or private signing key was committed.

## Final Classification

`libreoffice_plugin_available_live_docx_verified`

## Next Step

Recommended M64: prepare release-facing support notes and operational monitoring for the Windows x64 DOCX-to-PDF production path. Keep non-Windows packages and unsupported formats deferred.
