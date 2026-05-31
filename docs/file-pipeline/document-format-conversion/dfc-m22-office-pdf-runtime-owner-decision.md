# DFC-M22 Office-to-PDF Runtime Owner Decision

Date: 2026-05-31
Branch: docs/dfc-0-format-conversion-foundation
Baseline: 5b7f0b0

## Decision summary

Recommended strategy: **DOCX-first Office-to-PDF should use LibreOffice headless as a Starverse managed external engine package, gated by a runtime/package availability check before any real conversion path is enabled.**

M22 is documentation-only. It does not implement Office-to-PDF, does not call LibreOffice, does not add an engine binary or dependency, and does not modify runtime code.

## Current state

- HTML-to-PDF already has an Electron-backed backend pipeline pilot, metadata-only preview, selected-ref plus verified DerivedAsset authority, and a real Electron smoke that generated a `pdf_attachment` derived asset.
- DOCX-to-markdown is covered by the Mammoth backend-only pilot.
- XLSX-to-`table_markdown` is covered by the ExcelJS backend-only pilot.
- Office-to-PDF remains unsupported.
- PS/EPS-to-PDF remains unsupported.

## Existing foundation

| Area | Evidence | M22 conclusion |
| --- | --- | --- |
| DFC sandbox helper | `infra/files/dfcConversionSandbox.ts` defines controlled input/output path planning, output path validation, external process policy mapping, sanitized diagnostics, fail-closed run outcome, and cleanup status. | Reuse for Office-to-PDF. It already models the right input/output/diagnostic boundary for PDF attachment generation. |
| External process policy/runner | `src/next/file-type/externalProcessPolicy.ts` and `src/next/file-type/externalProcessRunner.ts` provide shell-disabled process policy, timeout, output limits, process tree termination, and sanitized stdout/stderr. | Prefer for LibreOffice. Office-to-PDF is an external process problem, not a BrowserWindow problem. |
| LibreOffice runner traces | `src/next/file-type/libreOfficeRunner.ts` and tests model LibreOffice conversion, macro policy, timeout/output failure mapping, and sanitized results. | Useful prior art, but not DFC runtime wiring. Treat as file-type layer seam/contract evidence, not existing DFC Office-to-PDF support. |
| Engine registry/package contracts | `src/next/file-type/externalEngineRegistry.ts` has a built-in `libreoffice` stub; `src/next/file-type/conversionRuntimePackage.ts` can represent a LibreOffice runtime package with runtime, manifest, signature, license, and attribution artifacts. | Use as basis for M23 managed LibreOffice engine gate/package scaffold. Current stubs are metadata, not installed engines. |
| M19R Electron conversion service | `infra/files/electronConversionServiceContract.ts` and `electron/services/electronConversionService.ts` serve the main-process Electron HTML-to-PDF adapter. | Do not reuse directly for LibreOffice. It is intentionally Electron/main-process/browser-window specific. Use its sanitized request/response lessons, not its service boundary. |
| DFC `pdf_attachment` semantics | `pdf_attachment` already maps to `file_attachment` and `derived_asset` authority in DFC and Send Plan paths. | Office-to-PDF should produce the same verified `converted_pdf` DerivedAsset shape as HTML-to-PDF, without extension/MIME fallback. |

## Engine strategy comparison

| Strategy | User value | Complexity | Security and privacy risk | Packaging/runtime cost | DFC fit | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| LibreOffice headless as managed external engine package | Very high for DOCX fidelity and common user expectation. Can later expand to DOC/RTF/ODT/PPT/XLS families if separately approved. | High. Needs managed package, health check, profile isolation, font expectations, process timeout/kill, output validation, and platform-specific behavior handling. | High but containable with sandbox input copy, isolated profile, no network, macro/external-link policy, controlled output dir, sanitized diagnostics, and no renderer path exposure. | Large binary per platform. Requires license/provenance/update ownership and optional/offline package policy. | Strong. External process runner plus M15 sandbox can produce verified `pdf_attachment` DerivedAsset. | **Recommended first Office-to-PDF strategy.** |
| System LibreOffice discovery | Useful for developer diagnostics and local experiments. | Medium. Discovery paths differ by OS and install channel. | Higher for production because binary provenance, version, plugins, profile state, and update cadence are uncontrolled. | No Starverse package size, but unreliable and not offline-controlled by Starverse. | Acceptable only behind explicit dev/diagnostic flag with fail-closed diagnostics. | Do not use as production default. |
| Pandoc / docx2pdf / other tools | Mixed. Pandoc is good for semantic conversion, weaker for Word visual fidelity. `docx2pdf` often depends on platform Office automation. | Medium to high, with inconsistent cross-platform behavior. | Tool-specific. Office automation can cross user profile/process boundaries and is hard to sandbox cleanly. | Varies; can introduce extra runtime/binary chains. | Weaker for high-fidelity `pdf_attachment`. | Not first pilot. Keep owner-gated. |
| Defer Office-to-PDF | Avoids new engine risk. | Low now. | None now. | None now. | Delays high-value capability after HTML-to-PDF confidence. | Not recommended unless Owner rejects managed LibreOffice packaging. |

## Recommended Office-to-PDF policy

### First pilot scope

- Support only managed local `.docx` input.
- Output only `pdf_attachment`.
- Derived asset kind should remain `converted_pdf`.
- Send strategy must be `file_attachment`.
- Send asset refs must be `derived_asset`.
- Preview must remain metadata-only.
- Send Plan must use selected refs plus verified DerivedAsset metadata.
- `original_file` and DOCX markdown options must remain available and independent.

### Deferred input formats

- `.doc` remains unsupported until binary format risk, macro policy, and fidelity expectations are separately approved.
- `.rtf` remains unsupported until scope is expanded.
- `.docm`, embedded macro-capable formats, Office templates, PowerPoint, Excel, and mixed Office families remain unsupported for Office-to-PDF unless Owner explicitly opens new packages.

### Security policy

- Macros disabled/blocked by default.
- External links and external resources disabled/blocked by default.
- Embedded objects do not execute and should not be dereferenced.
- Network access disabled by default.
- The engine must use an isolated temporary LibreOffice user profile per job or per controlled runtime scope.
- Input must be a sandbox copy of the managed asset, not an arbitrary renderer path.
- Output must be validated as a PDF under the controlled sandbox output directory.
- Timeout and process tree termination are required.
- Diagnostics must be symbolic/sanitized and must not expose raw paths, profile paths, storage refs, file URLs, content tokens, file body, full hashes, command/env details, or raw stderr/stdout.

### Packaging policy

- Production support requires a managed LibreOffice runtime package or equivalent Starverse-owned engine inventory.
- The package must carry runtime executable metadata, manifest, signature, license, attribution, version, platform, size, hash/provenance, supported capabilities, and health-check metadata.
- Runtime auto-download is not approved by this decision.
- System LibreOffice fallback is not approved for production support.
- Offline environments require bundled or preinstalled managed engine packages; otherwise the DFC candidate must be unavailable/blocked with a repair/install diagnostic.
- Windows/macOS/Linux support must be platform-gated by available verified package artifacts and may start with one platform if Owner accepts explicit unsupported diagnostics elsewhere.

## Owner decision answers

- **Approve LibreOffice as next heavy runtime engine?** Recommended yes, but only as a managed external engine package.
- **Approve managed LibreOffice runtime package strategy?** Recommended yes. This should be the production path before real conversion.
- **Allow system LibreOffice fallback?** Recommended no for production. Optional dev-only diagnostic fallback can be considered in a separate owner-approved package, but it must never claim production support.
- **First round support scope?** DOCX-to-PDF only.
- **Default macro/external link/embedded object policy?** Block by default. No macro execution, no external resource loading, no embedded object execution.
- **Need packaged smoke before user-visible support?** Yes. At minimum, run a managed-engine availability smoke and one real DOCX-to-PDF smoke before default user-visible enablement.
- **Allow M23 LibreOffice runtime gate/package scaffold?** Recommended yes. Do not jump directly to real LibreOffice conversion.

## Non-goals

- No Office-to-PDF implementation.
- No LibreOffice download, bundle, system discovery, or `soffice` execution.
- No new dependency, binary, package-lock change, postinstall download, or runtime auto-download.
- No DOC, RTF, DOCM, Office family expansion, Office automation, PS/EPS, or HTML-to-PDF pipeline change.
- No DB schema, renderer IPC shape, Send Plan main-flow, asset model, or DFC vocabulary change.
- No full Vitest, Electron smoke, packaged installer smoke, CI, npm audit, ESLint, or unrelated failure cleanup.

## M22 acceptance

- Docs-only owner decision.
- `git diff --check`.
- No tests required because no code changed.

## Why not reuse the Electron HTML-to-PDF route

HTML-to-PDF benefits from Electron because Chromium is already in the app and rendering HTML is a browser-native task. Office-to-PDF is different: the conversion engine is document-layout software, likely LibreOffice. Routing it through the Electron conversion service would either overload a browser-specific main-process boundary or force an external process concern into a service that was designed to isolate BrowserWindow and `printToPDF`.

The safer route is:

1. DFC sandbox helper plans controlled input/output and diagnostics.
2. Managed engine gate verifies a LibreOffice package.
3. External process policy/runner executes a shell-disabled, timeout-limited conversion command.
4. DFC stores a verified `converted_pdf` DerivedAsset.
5. Preview and Send Plan use the same selected `derived_asset` reference.

## Next package recommendation

Proceed with **DFC-M23 LibreOffice Managed Engine Gate / Package Scaffold**.

Do not implement real conversion in M23 unless Owner explicitly expands scope after the gate/package scaffold is reviewed.

### DFC-M23 task package prompt

Goal: build a DFC Office-to-PDF managed LibreOffice runtime availability gate and package scaffold. Do not run LibreOffice and do not generate PDFs.

Scope:

- Define managed LibreOffice runtime manifest/package expectations using existing engine package contracts where possible.
- Validate engine id `libreoffice`, platform, runtime executable relative path, version, hash/size/provenance/license/attribution metadata, supported capability `office_to_pdf`, and optional health-check metadata.
- Reject missing manifest, invalid manifest, unsupported platform, executable missing, executable path escape, traversal, UNC, drive escape, NUL, missing hash/provenance/license, and disabled engine states.
- Expose Office-to-PDF DFC candidates only as unavailable/blocked when runtime is missing or invalid.
- Keep `.docx` as the only planned first input family.
- Keep `.doc`, `.rtf`, Office-to-PDF real conversion, PS/EPS, and system LibreOffice fallback unsupported.
- Add targeted tests for manifest validation, path rejection, unavailable candidate behavior, sanitized diagnostics, and no renderer path/storage/hash/body exposure.
- Update progress/context docs.

Forbidden:

- Do not download or bundle LibreOffice.
- Do not call `soffice`.
- Do not run system LibreOffice.
- Do not generate PDF.
- Do not add dependencies or binaries.
- Do not change DB schema, renderer IPC shape, Send Plan main-flow, asset model, DFC vocabulary, or HTML-to-PDF pipeline.

Acceptance:

- `git diff --check`
- `npx vue-tsc --noEmit --pretty false` only if code files are changed
- targeted tests for the new runtime gate/scaffold only
- no full Vitest, no Electron smoke unless smoke files are changed

Stop conditions:

- Need real LibreOffice runtime to complete the gate.
- Need DB schema, renderer IPC shape, Send Plan main-flow, asset model, or DFC vocabulary changes.
- Cannot keep diagnostics sanitized.
- Cannot distinguish managed package path from arbitrary user/system path.
