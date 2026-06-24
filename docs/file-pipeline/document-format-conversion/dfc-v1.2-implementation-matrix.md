# DFC v1.2 Implementation Matrix

Date: 2026-06-24  
Status: current committed-evidence matrix  
Authority: `starverse_format_conversion_preview_v1_2.md` remains the product contract and SSOT. This document is an implementation-state index, not a replacement contract.

## Purpose

`starverse_format_conversion_preview_v1_2.md` defines the complete DFC product target: upload, conversion, preview, selected-option sending, model compatibility, history binding, and conversion safety governance. This matrix records what the current repository evidence supports, what is only partially implemented, what is deferred, and what must not be claimed as complete.

The main conclusion is:

- DFC core authority, DFC-managed draft/message binding, selected-option-driven Send Plan behavior, same-source preview for supported text paths, and backend-owned option/preview DTOs are implemented for DFC-managed attachments.
- The Phase 1 supported baseline is largely implemented, with later backend-only pilots for HTML safe markdown/code, XLSX table markdown, and DOCX markdown.
- The full v1.2 system is still partial. The product-level Attachment Shelf / Detail Inspector experience, user default preference system, full spreadsheet UI, broad Office family support, full PDF attachment production approval, HTML-to-PDF user controls, PS/EPS Ghostscript path, PDF OCR/local parsing, and cross-platform heavy-runtime distribution are not complete.

## Evidence boundary

This matrix is based on committed repository evidence visible on `main` at the time of writing. If a later local or unpushed closeout changes the LibreOffice production status, update the Phase 4 and DOCX `pdf_attachment` rows before using this as a release claim.

Current committed LibreOffice evidence still records the managed LibreOffice route as owner-gated and experimental with `productionApproved=false`. It verifies a DOCX-only `pdf_attachment` pilot path using the managed runtime package/import/redownload smoke evidence, but it does not approve broad production distribution, automatic download, system/PATH fallback, `.doc`, `.rtf`, `.docm`, HTML external-link expansion, PS/EPS, or local PDF parsing.

## Status labels

| Label | Meaning |
| --- | --- |
| `done` | Implemented and covered for the stated scope. |
| `partial` | Implemented only for a subset, backend-only path, pilot path, or missing user-facing/product controls. |
| `deferred` | Deliberately postponed or owner-gated for a later package. |
| `explicitly_unsupported` | Current contract or closeout says not to claim support. |
| `needs_verification` | Evidence was not sufficient to call it done or unsupported. |
| `mismatch` | Current implementation differs materially from the v1.2 plan wording and needs a doc or implementation decision. |

## Executive matrix

| Area | Status | Current evidence | Gap / release note |
| --- | --- | --- | --- |
| Full DFC v1.2 product system | `partial` | `starverse_format_conversion_preview_v1_2.md`; `important-context.md`; `dfc-m9-runtime-pilot-closeout.md`; `dfc-libreoffice-plugin-management-closeout.md` | Do not claim v1.2 complete. Current evidence supports a core DFC system plus several backend-only pilots and owner-gated heavy-runtime work. |
| DFC authority vocabulary | `done` | `src/shared/files/documentFormatConversion.ts` | `original_file`, `plain_text`, `markdown`, `code`, `table_markdown`, `pdf_attachment`, `SendAssetRef(raw_file/derived_asset)`, conversion option, decision, DTO, preview, and send snapshot contracts exist. |
| DFC durable binding | `done` | `infra/db/migrations/ensureFilePipelineSchema.ts`; `infra/db/repo/dfcAttachmentBinding.ts`; attachment repo/service tests | DFC-managed drafts persist `selectedOptionId` / `selectedAssetRefs`; message rows persist `usedOptionId` / `usedAssetRefs` plus `targetKind` and `sendStrategy`. Legacy rows remain quarantined. |
| Selected-option-driven Send Plan | `done` for DFC-managed attachments | `infra/files/sendPlanService.ts`; `src/shared/files/documentFormatConversion.ts`; send-plan tests | DFC-managed Send Plan resolves from selected option and selected refs. Missing/stale/failed/incompatible refs fail closed without legacy fallback. Broad legacy Send Plan still exists for non-DFC rows. |
| Backend-owned options and previews | `done` for supported scopes | `ConversationAttachmentService.getDfcDraftAttachmentOptions`; `getDfcDraftAttachmentPreview`; renderer client and IPC contract tests | Renderer receives sanitized backend-owned options/previews and does not invent target kind, option id, or refs. |
| Preview/send same-source | `done` for supported text and raw paths; `partial` for heavy PDF paths | DFC preview DTO, DerivedAsset facade, Send Plan lineage checks, TSV/CSV/HTML/DOCX/XLSX regressions | Verified for supported derived text paths and `original_file`. Heavy PDF path remains owner-gated/pilot or incomplete depending on source format. |
| Renderer privacy boundary | `done` for DFC DTOs; `needs_verification` for all legacy surfaces | `dbBridgeContracts.ts`; `documentFormatConversion.ts`; privacy/redaction tests | DFC DTOs omit path, file URL, storage refs, content token, file body, full hashes, and raw metadata. Legacy surfaces are not automatically equivalent to final DFC UI DTOs. |
| Attachment Shelf / Detail Inspector v1.2 UI | `partial` | `DraftAttachmentDetailsDialog.vue`; `AppChatApp.attachments.test.ts`; Electron smoke notes | Existing dialog can load options, select backend option, and show preview. Full v1.2 shelf/tooltip/color states/left-list inspector/preferences are not complete. |
| Real UI smoke confidence | `partial` | DFC-M11/M12/M13 Electron smoke harness notes; `npm run test:electron-smoke` | Electron smoke exists for app shell and a backend-owned DFC attachment seam. It does not cover OS file picker, packaged installer, CI, or full real upload/send flow. |
| User default preference system | `deferred` / `needs_verification` | No committed evidence found in DFC closeouts that implements full v1.2 default preference hierarchy | v1.2 defaults like per-file-type/global defaults and manual user preference persistence should not be claimed complete. |

## Phase matrix

### Phase 1: base text, code, CSV/TSV, `original_file`

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| DFC core models: RawFile/EncodingProfile/ConversionOption/DerivedAsset/SendAssetRef | `partial` | `documentFormatConversion.ts`; existing `file_assets` / `file_derivatives`; DerivedAsset facade | DFC names are implemented for conversion authority and facade semantics. The physical DB still uses existing asset/derivative tables rather than literal RawFile/DerivedAsset tables. |
| `original_file` identity option | `done` | `createDfcOriginalFileOption`; option DTO tests; Send Plan/history regressions | Uses `SendAssetRef.kind = raw_file`; no DerivedAsset is generated. |
| Plain text / markdown passthrough / code | `done` for supported local text assets | `DerivativeJobService.runExtractedTextJob`; explicit ensure path; option/preview/send tests | Safe text conversion is backend-owned and selected-option-driven. |
| CSV/TSV -> `table_markdown` | `done` for current parser scope | `DerivativeJobService` delimiter parser; DFC-40/41/42/43/44/45/46 notes; worker tests | Covers quoted CSV, multiline fields, TSV, BOM-aware UTF-16LE/BE with BOM, and fail-closed invalid/no-BOM cases. It is not Papa Parse and does not implement a user-facing delimiter selector. |
| selectedOptionId draft binding | `done` | `draft_attachments.selected_option_id`; `selected_asset_refs_json`; update settings validation | Renderer updates only by backend-issued option id and exact backend refs. |
| Send Plan by target kind | `done` for DFC-managed attachments | `SendPlanService` DFC branch; capability regressions | DFC-selected `original_file` requires file input; derived text targets require text input; no extension fallback. |
| Same-source preview and send | `done` for supported text/raw paths | `getDfcPreview`; DerivedAsset facade; message commit snapshots | Preview reads selected ref after facade validation and commit snapshots selected refs. |
| Manual encoding selector | `deferred` / `partial` | BOM-only decoder and fail-closed coverage | Deterministic BOM handling exists. Full `chardet`/`iconv-lite` and manual encoding override UI are not implemented. |
| Soft large-text user threshold UI | `needs_verification` | Send Plan hard byte constants exist | Product UI/configurable thresholds from v1.2 are not verified as complete. |
| Attachment Shelf chip initial UI | `partial` | Existing attachment card/details dialog and UI tests | Existing UI is functional but does not fully match v1.2 chip-only shelf plus tooltip/color-state spec. |

Phase 1 verdict: `partial_done`. The DFC authority and supported text/raw flows are strong, but encoding UI, default preferences, and full v1.2 shelf/inspector UX remain incomplete.

### Phase 2: XLSX / XLS tables

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| XLSX parser | `partial` | DFC-M4/M5; `DerivativeJobService.runXlsxTableMarkdownJob`; ExcelJS dependency | `.xlsx` backend-only pilot exists via ExcelJS. This is a deliberate implementation mismatch with the v1.2 SheetJS wording. |
| `.xls` | `explicitly_unsupported` | DFC-M4/M5 notes; `OFFICE_TEXT_NOT_IMPLEMENTED_EXTENSIONS` | `.xls` does not generate a DFC `table_markdown` option. |
| Multi-sheet output | `partial` | XLSX pilot notes | Visible worksheets are output as markdown sections. Product sheet navigation UI is not implemented. |
| Formula / hidden / merged diagnostics | `partial` | XLSX pilot and hardening tests | Warnings exist for selected backend behavior; formula evaluation, formula strategy UI, and workbook productization are not implemented. |
| Large workbook pagination UI / send gate | `partial` / `needs_verification` | Guard coverage exists | Backend guards exist. v1.2 preview pagination and user sheet/range controls are not complete. |

Phase 2 verdict: `partial`. Backend `.xlsx -> table_markdown` is implemented as a pilot; full spreadsheet UX and `.xls` are not.

### Phase 3: DOCX / DOC / RTF semantic markdown

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| DOCX -> markdown | `partial` | DFC-M7/M8; `DerivativeJobService.runDocxMarkdownJob`; Mammoth dependency | `.docx` backend-only pilot exists using Mammoth to HTML plus internal safe HTML-to-markdown. |
| Turndown / Pandoc path | `deferred` | DFC-M7/M8 notes | No Turndown, no Pandoc, no external engine path was added. |
| `.doc` / `.rtf` | `explicitly_unsupported` | DFC-M7/M8/M9 notes; not-implemented extension set | They remain unsupported and do not generate markdown options. |
| Rich DOCX semantics | `partial` | DFC-M7/M8 notes | Ordinary paragraphs/headings/visible link text are supported. Layout, images, comments, revisions, headers/footers, footnotes/endnotes, complex tables, macros, embedded objects, and external resources are not productized. |
| `original_file` fallback | `done` for raw option semantics | DFC original_file core; option DTOs | Availability still depends on selected model file capability. |

Phase 3 verdict: `partial`. DOCX markdown is a backend-only pilot; the unified Office family and advanced conversion engine paths are incomplete.

### Phase 4: PDF attachment

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| `pdf_attachment` target semantics | `done` at contract level | `DfcTargetKind`; `createDfcDerivedAssetOption`; Send Plan semantics | `pdf_attachment` exists and maps to `derived_asset` + `file_attachment`. |
| DOCX -> PDF via LibreOffice | `partial` / `owner_gated` on committed evidence | `dfc-libreoffice-plugin-management-closeout.md`; `DerivativeJobService.runDocxConvertedPdfJob`; managed runtime package/import/redownload smoke | Committed evidence says DOCX-only pilot, owner-gated, experimental, `productionApproved=false`. Do not claim broad or automatic production distribution from committed docs. |
| `.doc` / `.rtf` / `.docm` Office-to-PDF | `explicitly_unsupported` | LibreOffice closeout supported/out-of-scope matrix | Current committed supported pilot scope is DOCX only. |
| PDF preview/send same-source | `partial` | Converted PDF writes DerivedAsset metadata; closeout smoke | Verified for pilot DOCX path under managed runtime conditions. Full product PDF viewer/packaged runtime distribution confidence remains incomplete. |
| Model file/PDF gate | `done` for DFC Send Plan semantics | Send Plan target-kind gating tests | Selected `pdf_attachment` requires file/PDF capability. |
| External dependency detection / sandbox | `partial` | Managed runtime diagnostics; conversion sandbox runner; plugin lifecycle tests | Strong for current pilot. Cross-platform packaging, production approval, and full lifecycle registry remain incomplete. |

Phase 4 verdict: `partial`. Contract and DOCX pilot exist; production approval and broad Office-to-PDF are not complete in committed evidence.

### Phase 5: HTML full path

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| HTML -> safe markdown | `done` for backend safe string conversion | DFC-55 through DFC-75; `htmlToMarkdownSafe` | Preserves visible text, headings/basic lists/quotes/image alt/link text while dropping external URLs, scripts, styles, and resource attributes. |
| HTML -> code | `done` | HTML dual-option notes; code option regression coverage | Template/source/script-heavy HTML defaults to code; code preserves source. |
| HTML `original_file` | `done` for raw option semantics | DFC-58/59/62/63/66/71 notes | Uses raw_file ref; Send Plan gates file capability; no local execution. |
| HTML -> PDF | `partial` / `deferred` | `DerivativeJobService.runConvertedPdfJob` has an Electron bridge path with JS/network/local-file disabled | The full v1.2 user-controlled HTML-to-PDF product experience is not complete. No JS enable UI, external-resource authorization UI, CSS media switch UI, or broad product path is validated here. |
| External resources / JS / CSS media controls | `deferred` | v1.2 requires user controls; current committed notes keep loading/execution disabled | Current safe markdown path deliberately does not load externals or execute JS. |

Phase 5 verdict: `partial`. HTML text paths are well covered; full HTML-to-PDF product controls remain incomplete.

### Phase 6: PS/EPS late path

| Requirement | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PS/EPS `code` path | `partial` | `DerivativeJobService` infers PS/EPS text as code when stored as text | There is no evidence of complete v1.2 PS/EPS option UX or ask-each-time behavior. |
| PS/EPS `original_file` | `partial` | DFC raw_file semantics apply generally | Specific PS/EPS product gate and UI are not verified as complete. |
| PS/EPS -> PDF via Ghostscript | `deferred` | v1.2 Phase 6 and closeouts list PS/EPS out of scope | No Ghostscript sandbox path is implemented. |

Phase 6 verdict: `deferred` with only incidental code/raw semantics available.

## Format and path matrix

| Input / path | Current status | Claim boundary |
| --- | --- | --- |
| `.txt` / `.log` plain text | `done` for UTF-8/BOM-aware local text; `partial` for legacy encodings | No full manual encoding override UI. |
| `.md` markdown | `done` for backend text derivative path | Sends derived markdown text when selected. |
| Code/config files | `done` for supported text-like extensions | Code path is text-based; no script execution. |
| CSV / TSV | `done` for current backend parser | Parser is internal, not Papa Parse; no delimiter selector UI. |
| `.xlsx` | `partial` backend-only pilot | ExcelJS implementation, not SheetJS. `.xls` unsupported. No workbook UI/pagination/formula strategy UI. |
| `.xls` | `explicitly_unsupported` | No DFC table markdown option. |
| `.docx -> markdown` | `partial` backend-only pilot | Mammoth + internal safe HTML-to-markdown; no Turndown/Pandoc/full fidelity. |
| `.doc` / `.rtf -> markdown` | `explicitly_unsupported` | Current DOCX pilot does not include `.doc` or `.rtf`. |
| `.docx -> pdf_attachment` | `partial` / `owner_gated` in committed evidence | Managed LibreOffice plugin route exists as DOCX-only pilot; production approval remains blocked on committed docs. |
| `.doc` / `.rtf` / `.docm -> pdf_attachment` | `explicitly_unsupported` | Current committed LibreOffice closeout forbids broad Office family support claims. |
| Direct `.pdf` upload | `done` for `original_file`; `explicitly_unsupported` for local parsing/OCR | PDF is raw_file/original_file and model/provider responsibility. |
| HTML -> safe markdown | `done` for current backend path | No JS execution or external resource loading. |
| HTML -> code | `done` | Source-preserving selected derived option. |
| HTML -> `original_file` | `done` for DFC raw option semantics | Requires model file capability. |
| HTML -> PDF | `partial` / `deferred productization` | Low-level bridge exists with disabled JS/network/local file access, but full v1.2 controls are not productized. |
| PS/EPS -> PDF | `deferred` | No Ghostscript path. |
| Image/audio processing | `explicitly_unsupported` for this DFC matrix | Outside v1.2 DFC scope. |

## Validation and smoke matrix

| Layer | Status | Evidence | Gap |
| --- | --- | --- | --- |
| Unit / service / worker DFC tests | `done` for supported paths | Shared contract, DB, service, Send Plan, worker, derivative runtime tests referenced in DFC ledger/context | Test scope is broad for supported backend paths, but not exhaustive product UI. |
| Vitest/jsdom UI confidence | `done` for existing dialog seam | `AppChatApp.attachments.test.ts` and M2 notes | Does not launch real browser/Electron by itself. |
| Electron smoke harness | `partial` | DFC-M11/M12/M13 notes | Covers app shell, preload, and controlled/backend-owned DFC attachment seam. Not a full OS file-picker, packaged app, or CI smoke. |
| LibreOffice real package/import/redownload smoke | `partial` / `owner_gated` | LibreOffice closeout | Confirms package/import/runtime smoke for Windows x64 candidate, not production distribution approval or multi-platform support. |
| Packaged installer smoke | `deferred` / `needs_verification` | LibreOffice closeout says packaged or near-packaged smoke is not established | Required before broad production distribution claims. |

## Recommended next packages

1. Keep this matrix as the status baseline and update it whenever a DFC package changes a claim boundary.
2. Resolve the LibreOffice status mismatch explicitly: if a newer M63 closeout really flips Windows x64 DOCX-to-PDF from owner-gated experimental to production-approved, commit that closeout and update Phase 4 rows with the exact evidence.
3. Prefer packaging/smoke confidence before expanding heavy runtime families. This validates existing DFC Phase 1 and backend-only pilots before adding more conversion surface.
4. If continuing feature work, choose one bounded package:
   - Full v1.2 Attachment Shelf / Detail Inspector product UI completion.
   - XLSX UI/productization package: sheet navigation, pagination, formula/display strategy, hidden content controls, send gate.
   - DOCX markdown hardening package: tables/footnotes/comments/revisions diagnostics without adding unsupported Office formats.
   - Heavy runtime owner memo for Office-to-PDF production approval, HTML-to-PDF controls, or Ghostscript PS/EPS.

## Non-claim boundaries

Do not claim any of the following from current committed evidence:

- DFC v1.2 is complete end-to-end.
- LibreOffice is bundled, production-approved, automatically downloaded, or system/PATH fallback is allowed.
- Broad Office family PDF support exists.
- `.doc`, `.rtf`, `.docm`, `.xls`, Excel-to-PDF, PS/EPS-to-PDF, or PDF OCR/local parsing are supported.
- Full v1.2 Detail Inspector, user default preferences, sheet picker, pagination UI, HTML JS/external-resource UI, CSS media UI, packaged smoke, or cross-platform runtime distribution are complete.
