# DFC v1.2 Implementation Matrix and Completion Path

Date: 2026-06-24  
Status: refreshed against current cloud evidence through DFC-M63  
Authority: `starverse_format_conversion_preview_v1_2.md` remains the product contract and SSOT. This document is an implementation-state index and completion plan, not a replacement contract.

## Purpose

`starverse_format_conversion_preview_v1_2.md` defines the complete DFC target: file upload, attachment conversion, preview, selected-option sending, model compatibility, history binding, and conversion safety governance.

This matrix records what current repository evidence supports, what is only partially implemented, what is deferred, and what must not be claimed as complete. It also defines the recommended path to complete the remaining v1.2 product surface.

## Current conclusion

The current repository supports a real DFC core plus several scoped runtime paths:

- DFC authority vocabulary and send model are implemented: `original_file`, text targets, `table_markdown`, `pdf_attachment`, `SendAssetRef(raw_file/derived_asset)`, backend-owned options, selected refs, sanitized preview DTOs, and message send snapshots.
- Phase 1 text/raw flows are substantially implemented for DFC-managed attachments, including selected-option Send Plan behavior and no-silent-fallback gating.
- HTML safe `markdown` / `code` and HTML-to-PDF are implemented as scoped backend/runtime paths, with HTML-to-PDF running through the dedicated Electron conversion boundary and real Electron smoke confidence.
- XLSX `table_markdown` and DOCX `markdown` exist as backend-only pilots.
- Windows x64 LibreOffice DOCX-to-PDF is now production-approved for the scoped managed runtime path verified by M63: DOCX input, PDF attachment output, manual official install / offline import acquisition modes, managed LibreOffice runtime, no automatic conversion-time download, no system/PATH fallback.
- The full v1.2 product system remains partial because UI/product controls, preference/default systems, spreadsheet productization, cross-platform LibreOffice packages, broad Office support, PS/EPS, and PDF OCR/local parsing are not complete.

## Status labels

| Label | Meaning |
| --- | --- |
| `done` | Implemented and covered for the stated scope. |
| `done_scoped` | Production-ready only within the explicitly named scope. |
| `partial` | Implemented only for a subset, backend-only pilot, experimental route, or missing product controls. |
| `deferred` | Deliberately postponed or owner-gated for a later package. |
| `explicitly_unsupported` | Current evidence says this must not be claimed as supported. |
| `needs_verification` | Evidence is insufficient to classify as done or unsupported. |
| `mismatch` | Implementation differs from v1.2 wording and needs an explicit doc or implementation decision. |

## Executive matrix

| Area | Status | Current evidence | Claim boundary / gap |
| --- | --- | --- | --- |
| Full DFC v1.2 product system | `partial` | `starverse_format_conversion_preview_v1_2.md`; `important-context.md`; DFC-M1 through M63 closeouts | Do not claim all v1.2 done. Core and several paths are implemented, but complete product controls and all format families are not. |
| DFC authority vocabulary | `done` | `src/shared/files/documentFormatConversion.ts` | Target kinds, `SendAssetRef`, options, decisions, preview DTOs, and send snapshots exist. |
| Durable DFC binding | `done` | `draft_attachments` / `message_attachments` DFC columns; attachment repo/service tests | Drafts store selected option/refs; messages store used option/refs plus target kind and send strategy. |
| Selected-option Send Plan | `done` | `infra/files/sendPlanService.ts`; Send Plan tests | DFC-managed rows resolve from selected option and selected refs. Missing/stale/failed/incompatible refs fail closed without legacy fallback. |
| Backend-owned options/previews | `done` | `conversationDraft.ensureDfcOptions`; `getDfcOptions`; `getDfcPreview`; IPC/client tests | Renderer does not invent target kind, option id, or refs. |
| Preview/send same-source | `done` for supported raw/text/PDF paths | DerivedAsset facade, selected preview DTOs, Send Plan lineage checks, message snapshots | Verified for supported DFC paths. Unsupported paths remain blocked instead of falling back. |
| Renderer privacy boundary | `done` for DFC DTOs; `needs_verification` for legacy generic surfaces | DFC DTO redaction tests; derivative error redaction tests | DFC DTOs omit raw paths, file URLs, storage refs, content tokens, file bodies, full hashes, and raw metadata. |
| Attachment Shelf / Detail Inspector v1.2 UI | `partial` | Existing attachment strip/card/details dialog, UI tests, Electron smoke seams | Existing dialog supports option selection and preview. Full v1.2 shelf tooltip/color-state/left-list inspector/default controls remain incomplete. |
| Real UI / Electron confidence | `partial` | Electron app shell smoke, backend-owned DFC attachment smoke, HTML-to-PDF smoke, LibreOffice packaged/live smoke evidence | Stronger than Vitest-only. Still no broad OS file picker, CI, installer matrix, or complete user journey smoke. |
| Plugin Management for LibreOffice | `done_scoped` | DFC-M63 closeout | LibreOffice Office PDF entry visible and ready for Windows x64 DOCX-to-PDF. Manual install/offline import only; automatic conversion-time download disabled. |
| User default preference system | `deferred` / `needs_verification` | No closeout proving full v1.2 default hierarchy | Per-file-type/global defaults and manual preference persistence should not be claimed complete. |

## Phase matrix

### Phase 1: base text, code, CSV/TSV, `original_file`

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| DFC core models | `done` for authority/facade; `partial` for literal v1.2 object names | `documentFormatConversion.ts`; existing `file_assets` / `file_derivatives`; DerivedAsset facade | Physical schema uses existing asset/derivative tables plus DFC binding/generation-state tables rather than literal RawFile/DerivedAsset tables. |
| `original_file` identity option | `done` | `createDfcOriginalFileOption`; raw-file preview/send/history tests | Uses `raw_file`; does not create a DerivedAsset. |
| Plain text / markdown passthrough / code | `done` for supported local text assets | `DerivativeJobService.runExtractedTextJob`; DFC ensure/options/preview/send tests | Backend-owned, selected-option-driven. |
| CSV/TSV -> `table_markdown` | `done` for current parser scope | DFC-40 through DFC-46; worker tests | Covers delimiter parsing, quoted CSV, multiline cells, TSV, UTF-16 BOM handling, and fail-closed invalid input. It is still an internal parser, not Papa Parse. |
| Manual encoding selection | `partial` / `deferred` | BOM-aware decoder and fail-closed tests | Full `chardet`/`iconv-lite` legacy encoding detection and UI override are not complete. |
| selectedOptionId draft binding | `done` | DFC binding columns and update validation | Renderer persists only backend-issued option ids and exact backend refs. |
| Send Plan by target kind | `done` | DFC Send Plan branch and capability tests | `original_file` requires file input; text targets require text input; no extension fallback. |
| Preview/send same-source | `done` | Selected preview DTO, DerivedAsset facade, send snapshot tests | Text preview reads the selected derived asset; message commit snapshots actual refs. |
| Soft large-text threshold UX | `needs_verification` | Send Plan hard limits exist | v1.2 configurable soft thresholds and confirmation UI remain unverified. |
| Attachment Shelf chip initial UI | `partial` | Existing attachment UI and tests | Functional details dialog exists; full v1.2 shelf/chip/tooltip/color spec remains incomplete. |

Phase 1 verdict: `mostly_done_core_partial_product_ui`.

### Phase 2: XLSX / XLS tables

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| XLSX parser | `partial` | DFC-M4/M5; `DerivativeJobService.runXlsxTableMarkdownJob`; ExcelJS dependency | `.xlsx` backend-only pilot exists via ExcelJS. This intentionally differs from v1.2's SheetJS wording and should stay documented. |
| `.xls` table markdown | `explicitly_unsupported` | DFC-M4/M5/M9 notes; unsupported extension gates | `.xls` does not generate a DFC table option. |
| Multi-sheet conversion | `partial` | XLSX pilot notes | Visible worksheets can be emitted as markdown sections. Product sheet navigation UI is not complete. |
| Formula / hidden / merged diagnostics | `partial` | XLSX pilot tests | Backend warnings and fail-closed guards exist. Formula strategy UI, formula evaluation, hidden-content controls, and workbook productization are not complete. |
| Large table pagination / send gate UI | `partial` | Backend guard tests | Preview pagination and sheet/range user controls remain product gaps. |

Phase 2 verdict: `backend_pilot_partial_productization`.

### Phase 3: DOCX / DOC / RTF semantic markdown

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| DOCX -> markdown | `partial` | DFC-M7/M8/M9; `DerivativeJobService.runDocxMarkdownJob`; Mammoth dependency | `.docx` backend-only pilot exists via Mammoth HTML plus internal safe HTML-to-markdown. |
| Turndown / Pandoc path | `deferred` | DOCX pilot closeouts | No Turndown or Pandoc path is implemented. |
| `.doc` / `.rtf` markdown | `explicitly_unsupported` | DFC-M7/M8/M9 and M63 unsupported locks | They do not generate DFC markdown options. |
| Rich DOCX semantics | `partial` | DOCX pilot hardening notes | Basic semantic text is supported. Layout, images, comments, revisions, headers/footers, footnotes/endnotes, complex tables, macros, embedded objects, and external resources are not productized. |
| `original_file` fallback | `done` for raw option semantics | Core DFC option path | Requires model file capability. |

Phase 3 verdict: `docx_backend_pilot_partial_office_family_unsupported`.

### Phase 4: PDF attachment

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| `pdf_attachment` target semantics | `done` | DFC target kind and derived option helpers | `pdf_attachment` maps to `derived_asset` + `file_attachment`. |
| HTML -> PDF | `done_scoped` / `partial_product_controls` | DFC-M19R-B/C/D, M20, M21; `DerivativeJobService.runConvertedPdfJob` | Managed local HTML can generate `converted_pdf` through the dedicated Electron conversion boundary. JS/network/local-file access are disabled. Full v1.2 user controls for JS/external resources/CSS media are not complete. |
| DOCX -> PDF via LibreOffice | `done_scoped` | DFC-M46/M62/M63; `dfc-m63-libreoffice-plugin-availability-smoke-and-production-closeout.md`; `DerivativeJobService.runDocxConvertedPdfJob` | Production-approved only for Windows x64, DOCX input, `pdf_attachment` output, managed LibreOffice runtime, manual official install/offline import, no automatic conversion-time download. |
| `.doc` / `.rtf` / `.docm` Office-to-PDF | `explicitly_unsupported` | M63 unsupported format lock | No broad Office family PDF support. |
| Excel-to-PDF | `explicitly_unsupported` | M63 unsupported format lock | XLSX table markdown exists separately; Excel-to-PDF does not. |
| PDF preview/send same-source | `done` for implemented converted PDF paths | HTML-to-PDF and DOCX-to-PDF derived assets; metadata-only preview; selected-ref Send Plan tests/smokes | Preview is metadata-only for PDF; actual PDF body/path is not exposed through DTOs. |
| Model file/PDF capability gate | `done` | Send Plan target-kind gating | Selected PDF attachment requires file/PDF capability. |
| External dependency detection / sandbox | `done_scoped` for Windows x64 DOCX-to-PDF and HTML-to-PDF | Plugin Management, runtime gate, sandbox runner, path caps, Electron conversion boundary | macOS/Linux LibreOffice package evidence is pending. PS/EPS Ghostscript remains absent. |

Phase 4 verdict: `scoped_pdf_paths_done_full_v1.2_controls_partial`.

### Phase 5: HTML full path

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| HTML -> safe markdown | `done` for backend safe conversion | DFC-55 through DFC-75; safe markdown tests | Preserves visible semantics while dropping external URLs, script/style semantics, and resource attributes. |
| HTML -> code | `done` | HTML dual-option tests | Template/source/script-heavy HTML can use source-preserving code output. |
| HTML `original_file` | `done` | HTML raw-file preview/send/history tests | Raw-file semantics are independent and model-gated. |
| HTML -> PDF | `done_scoped` | M19R-C/D, M20, M21 | Static managed local HTML can become `pdf_attachment` with JS/network/local-file blocked and real Electron smoke confidence. |
| JS / external resource / CSS media user controls | `deferred` | v1.2 requires user controls; current path keeps active content and network disabled | Enabling JS, external resource loading, or CSS media switching needs a separate product/security package. |

Phase 5 verdict: `text_paths_done_pdf_scoped_controls_deferred`.

### Phase 6: PS/EPS late path

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PS/EPS -> code | `partial` | Text inference can classify PS/EPS as code when stored as text | Complete v1.2 PS/EPS UX and ask-each-time behavior are not proven. |
| PS/EPS -> original_file | `partial` | Generic raw-file semantics | Specific PS/EPS policy gate and UI are not complete. |
| PS/EPS -> PDF via Ghostscript | `deferred` | v1.2 Phase 6 and M63 unsupported lock | No Ghostscript path. |

Phase 6 verdict: `deferred`.

## Format and path matrix

| Input / path | Current status | Claim boundary |
| --- | --- | --- |
| `.txt` / `.log` plain text | `done` for UTF-8/BOM-aware local text; `partial` for legacy encodings | No full manual encoding override UI. |
| `.md` markdown | `done` | Derived markdown text can be selected and sent. |
| Code/config files | `done` for supported text-like extensions | Code path is text-based; no script execution. |
| CSV / TSV | `done` for current parser | Internal parser, not Papa Parse; no delimiter selector UI. |
| `.xlsx -> table_markdown` | `partial` backend pilot | ExcelJS implementation; no `.xls`, workbook UI, formula strategy UI, or pagination UI. |
| `.xls -> table_markdown` | `explicitly_unsupported` | No DFC table option. |
| `.docx -> markdown` | `partial` backend pilot | Mammoth + internal safe HTML-to-markdown; no Turndown/Pandoc/full fidelity. |
| `.doc` / `.rtf -> markdown` | `explicitly_unsupported` | No DFC markdown option. |
| `.docx -> pdf_attachment` | `done_scoped` | Windows x64 managed LibreOffice runtime, DOCX only, manual install/offline import, no automatic conversion-time download. |
| `.doc` / `.rtf` / `.docm -> pdf_attachment` | `explicitly_unsupported` | Not part of approved LibreOffice production route. |
| Excel-to-PDF | `explicitly_unsupported` | Not part of approved route. |
| Direct `.pdf` upload | `done` for `original_file`; `explicitly_unsupported` for local parsing/OCR | PDF understanding remains model/provider responsibility. |
| HTML -> safe markdown | `done` | No JS execution or external resource loading. |
| HTML -> code | `done` | Source-preserving selected derived option. |
| HTML -> `original_file` | `done` | Requires model file capability. |
| HTML -> PDF | `done_scoped` | Managed local HTML only; JS/network/local file disabled; full user controls deferred. |
| PS/EPS -> PDF | `deferred` | No Ghostscript path. |
| Image/audio processing | `explicitly_unsupported` for DFC v1.2 | Outside this DFC matrix. |

## Validation and smoke matrix

| Layer | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Unit/service/worker DFC tests | `done` for supported paths | Shared contract, DB, service, Send Plan, worker, derivative runtime, LibreOffice and HTML PDF tests | Does not replace product-level manual QA or full matrix smoke. |
| Vitest/jsdom UI confidence | `done` for existing dialog seam | `AppChatApp.attachments.test.ts` and DFC-M2/M12/M15 notes | Not a browser/Electron launch by itself. |
| Electron shell / attachment smoke | `partial` | DFC-M11 through M13 | Covers app shell, preload boundary, backend-owned attachment option/preview seam. |
| HTML-to-PDF Electron smoke | `done_scoped` | DFC-M21 | Real Electron smoke generated a PDF derived asset and observed metadata-only preview. |
| LibreOffice official install / packaged smoke | `done_scoped` | DFC-M45/M61/M62/M63 | M63 verifies current app-managed runtime ready and live DOCX-to-PDF. Automatic download remains disabled; install retry history should not be generalized into auto-download support. |
| Plugin Management LibreOffice availability | `done_scoped` | DFC-M63 | Visible, ready, Recheck does not download/install, Windows x64 DOCX-to-PDF approval surfaced. |
| Packaged installer / release matrix | `partial` / `deferred` | Packaged and smoke evidence exists for scoped paths, but broad installer/CI/multi-platform matrix is incomplete | macOS/Linux LibreOffice packages and CI smoke remain pending. |

## Completion path

### P0: keep current scope truthful

Owner-facing and release-facing wording must continue to separate these two facts:

1. Windows x64 DOCX-to-PDF through managed LibreOffice is supported in the M63-approved scope.
2. DFC v1.2 as a whole is still partial.

Do not let the M63 success imply broad Office support, automatic download, macOS/Linux support, `.doc/.rtf/.docm`, Excel-to-PDF, PS/EPS, or PDF OCR/local parsing.

### P1: M64 release-facing support notes and operational monitoring

Goal: make the Windows x64 DOCX-to-PDF production scope maintainable.

Deliverables:

- Release-facing support note: supported platform, input, output, acquisition modes, diagnostics, non-goals.
- Operational monitoring checklist for Plugin Management, runtime ready/recheck, manual install/offline import, failed package states, and DFC PDF generation.
- Runbook for common diagnostics: missing runtime, owner-gate mismatch, path policy exceeded, download disabled, conversion sandbox denied, invalid PDF output.
- Regression list that must run before release: Plugin Management visibility, Recheck no-download, DOCX `pdf_attachment`, unsupported format locks, privacy/artifact scan.

Exit criteria:

- A maintainer can verify the approved path without reading the whole M46-M63 history.
- User-facing text does not overclaim unsupported formats or platforms.

### P2: Full v1.2 Attachment Shelf / Detail Inspector productization

Goal: close the largest user-facing gap in v1.2.

Deliverables:

- Shelf chips with file type and close button only.
- Tooltip with filename, selected send target, status, and warnings.
- Status color model: green/yellow/red/gray.
- Detail Inspector with file list, current send method, target cards, preview, warnings, compatibility, and Advanced diagnostics.
- UI coverage for selection, preview refresh, removal, blocked state, and warning state.

Exit criteria:

- Existing DFC backend authority remains intact: renderer never invents option id, refs, target kind, or conversion identity.
- The UI matches the v1.2 interaction contract for supported paths.

### P3: User defaults and large-content controls

Goal: implement the v1.2 configurable behavior layer.

Deliverables:

- Per-file-type and global default target preferences.
- Save-for-this-file / type / global default semantics.
- Manual encoding override design and implementation if legacy encodings are in scope.
- Soft threshold confirmation UI for large converted text and context-ratio risk.

Exit criteria:

- Defaults seed new drafts without overriding explicit draft-local `selectedOptionId`.
- Large content warnings are visible before send and respect hard model/context limits.

### P4: XLSX productization package

Goal: move `.xlsx -> table_markdown` from backend pilot to product-grade spreadsheet flow.

Deliverables:

- Sheet navigation UI.
- Preview pagination for large sheets.
- Formula/display-value/hidden-content policy display and explicit warnings.
- Send gate UX for large workbook output.
- Explicit decision whether ExcelJS remains accepted or v1.2 SheetJS wording is updated.

Exit criteria:

- `.xlsx` user can inspect and control what will be sent.
- `.xls` and Excel-to-PDF remain blocked unless separately approved.

### P5: DOCX markdown hardening

Goal: improve DOCX semantic extraction without expanding Office family claims.

Deliverables:

- More robust tables, footnotes/endnotes, comments/revisions diagnostics.
- Warning snapshot consistency between preview and send.
- Clear unsupported markers for images/layout/fidelity gaps.

Exit criteria:

- `.docx -> markdown` remains useful and honest.
- `.doc`, `.rtf`, `.docm`, Turndown/Pandoc, and Office-to-PDF expansion remain separate decisions.

### P6: HTML-to-PDF product controls and readiness

Goal: decide whether v1.2's optional controls should become product UI.

Deliverables:

- Owner/security decision on JavaScript enablement.
- Owner/security decision on external resource loading total switch.
- CSS media print/screen decision.
- Product UI and diagnostics only after the security decision.

Exit criteria:

- Default remains safe: JS/network/local file blocked.
- Any new active-content capability is explicit, visible, isolated, and covered by tests/smoke.

### P7: macOS/Linux LibreOffice package expansion

Goal: extend the M63 Windows x64 DOCX-to-PDF route cross-platform.

Deliverables per platform/arch:

- Official source/provenance package preparation.
- Signed catalog/trust entry or approved equivalent.
- Runtime gate validation.
- Plugin Management descriptor evidence.
- Packaged Electron smoke.
- DOCX-to-PDF valid PDF evidence.
- Privacy/artifact scan.

Exit criteria:

- macOS/Linux support is approved per platform, not inferred from Windows x64.

### P8: Office family expansion decisions

Goal: decide if `.doc`, `.rtf`, `.docm`, Excel-to-PDF, or broader Office-to-PDF should exist.

Deliverables:

- Separate owner memo per family.
- Macro/security policy for macro-capable formats.
- Runtime support proof and fail-closed tests.
- User-facing warning language.

Exit criteria:

- No broad Office claim lands without format-specific tests and product wording.

### P9: PS/EPS Ghostscript late path

Goal: implement only if explicitly prioritized after higher-value DFC gaps.

Deliverables:

- Ghostscript sandbox owner decision.
- Strict file access, timeout, memory, process, and diagnostics policy.
- `original_file`, `code`, and `pdf_attachment` option semantics.

Exit criteria:

- PS/EPS stays `deferred` until Ghostscript is sandboxed and tested.

## Non-claim boundaries

Do not claim these from current evidence:

- Full DFC v1.2 completion.
- macOS/Linux LibreOffice support.
- `.doc`, `.rtf`, `.docm`, `.xls`, Excel-to-PDF, broad Office-to-PDF, PS/EPS-to-PDF, or PDF OCR/local parsing support.
- System LibreOffice discovery, PATH fallback, arbitrary executable paths, renderer-provided executable paths, arbitrary package URLs, automatic/startup/background/postinstall/conversion-time downloads.
- Full v1.2 default preference hierarchy, manual encoding selector, sheet picker, pagination UI, HTML JS/external-resource UI, CSS media UI, or full packaged installer/CI matrix.

## Recommended immediate next package

Implement M64: release-facing support notes plus operational monitoring for the Windows x64 DOCX-to-PDF production path. This is the correct next package because M63 created a legitimate scoped production claim, and that claim now needs support boundaries, diagnostics, and verification routines before expanding any new format or platform.
