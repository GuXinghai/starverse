# DFC-M1 Phase 1 Closeout and Supported Matrix

Status: manual-supervision baseline closeout. This document summarizes the current DFC Phase 1 implemented capability surface and stops the prior automatic small-gap progression. It does not add runtime behavior, schema, IPC shape, Send Plan architecture, UI behavior, dependencies, Playwright harnesses, external engines, or legacy bridges.

Date: 2026-05-26
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline HEAD observed: `20e49e9`

## 1. Baseline purpose

DFC Phase 1 is now treated as an owner-supervised baseline rather than an open-ended `/goal` stream. Future work should start from an explicit task package and should not continue appending narrow DFC-76-style implementation gaps unless the owner reopens that mode.

The Phase 1 invariants remain:

- `original_file` is a first-class `targetKind` and uses `SendAssetRef.kind = 'raw_file'`.
- Converted outputs use `SendAssetRef.kind = 'derived_asset'` and the Phase 1 `DerivedAsset` facade over existing derivative storage.
- `selectedOptionId` plus `selectedAssetRefs` drive preview, send, and compatibility decisions for DFC-managed attachments.
- Renderer code must not invent option identity, targetKind, SendAssetRef, or conversion identity.
- Send Plan must not silently route DFC-managed attachments through legacy fallback.
- Renderer DTOs and Send Plan outputs must not expose paths, storage refs, full hashes, content tokens, or file bodies.

## 2. Phase 1 supported matrix

| Target kind | Primary input family | SendAssetRef | DerivedAsset required | Preview semantics | Send Plan semantics | Current Phase 1 status |
| --- | --- | --- | --- | --- | --- | --- |
| `original_file` | Raw file when policy/model allows file input | `raw_file` pointing at the original asset | No | Metadata-only raw-file preview diagnostics; no file body or storage URI exposure | `file_attachment`; validates the selected raw ref and model file/PDF capability; no legacy `native_file` fallback for DFC-managed rows | Supported as first-class DFC target |
| `plain_text` | Plain text or extracted/converted text-like content | `derived_asset` | Yes | Text preview from selected derived asset; selected ref must match preview/send source | `text_in_prompt`; uses selected derived asset and blocks missing/stale/unavailable refs | Supported |
| `markdown` | Markdown source, safe HTML markdown output, or DOCX-first backend-only pilot output | `derived_asset` | Yes | Markdown text preview from selected derived asset | `text_in_prompt`; uses selected derived asset and DFC lineage checks | Supported; DOCX is backend-only pilot using Mammoth with sanitized symbolic diagnostics |
| `code` | Source-code-like inputs and HTML/template-like code path | `derived_asset` | Yes | Code text preview from selected derived asset | `text_in_prompt`; selected option snapshots through draft/message attachment state | Supported |
| `table_markdown` | CSV/TSV text tables | `derived_asset` | Yes | Markdown table preview from selected derived asset | `text_in_prompt`; selected table derivative is the send source | Supported for CSV/TSV text runtime only |
| HTML safe `markdown` | Static/document-like HTML | `derived_asset` | Yes | Safe markdown preview; JavaScript is not executed, external resources are not loaded, script/style are removed, selected image alt/link/list/blockquote visible semantics are preserved where implemented | `text_in_prompt`; selected safe markdown derivative is authoritative | Supported as local string-level safe conversion |
| HTML `code` | Template-like or script-heavy HTML | `derived_asset` | Yes | Exact or code-oriented derived text preview according to backend-owned option generation | `text_in_prompt`; selected code derivative is authoritative | Supported as local code-path conversion |

## 3. Shared preview/send semantics

- Draft option authority is backend-owned. UI may display and select options, but it must persist backend-issued `selectedOptionId` and `selectedAssetRefs`.
- Preview reads the selected DFC option and selected refs; preview must not choose a different asset family than Send Plan.
- Message commit snapshots `usedOptionId`, `usedAssetRefs`, `targetKind`, and `sendStrategy` so history send planning does not recompute through legacy routing.
- For derived targets, same-source checks use the selected `derived_asset` facade and block stale, missing, preview-only, source-hash-mismatched, or unavailable derivatives.
- DFC-managed Send Plan decisions produce blocked/pending/failed/incompatible states rather than falling back to `preferredSendMode`, `selectedSendMode`, `native_file`, `hybrid`, or `unsupported`.
- Privacy boundary remains sanitized: renderer-visible DFC DTOs and Send Plan summaries expose opaque IDs and diagnostics, not local paths, storage refs, full hashes, content tokens, or file bodies.

## 4. Phase 1 non-goals

The following are explicitly outside the current Phase 1 baseline:

- XLSX/XLS runtime.
- DOC/RTF runtime.
- HTML-to-PDF.
- Office-to-PDF.
- PS/EPS production runtime.
- Browser Playwright smoke harness.
- External engine sandbox.
- New dependencies for conversion engines.
- Broad Send Plan rewrite.
- Broad UI redesign.
- Legacy bridge for old records.
- DB schema changes beyond the already-landed DFC binding columns.
- IPC shape expansion beyond the already-landed DFC DTO surfaces.

## 5. Known gaps and risks

- End-to-end confidence is still mostly Vitest-backed. Browser/Electron smoke ownership remains undecided.
- The supported matrix is stronger for text-like local runtimes than for office/runtime-family coverage.
- `pdf_attachment` exists in the shared target vocabulary but is not a Phase 1 implemented runtime path.
- XLS and DOC/RTF require owner decisions before any parser/runtime/dependency choice.
- HTML safe markdown is intentionally string-level and non-executing; it is not browser rendering and not HTML-to-PDF.
- DOCX markdown is backend-only and semantic-text oriented; it does not preserve Word visual layout, extract media bytes, load external resources, execute macros, or support `.doc` / `.rtf`.
- Legacy route summary code still exists for non-DFC rows; DFC correctness depends on the DFC-managed boundary staying strict.
- Existing unrelated dirty `.codex/agents/*.toml` files prevent treating the current worktree as a clean checkpoint baseline.

## 6. Next-decision map

Only two main directions should remain open after M1.

### Direction A: End-to-End confidence path

Goal: decide and implement the smallest owner-approved confidence path that proves DFC option selection, preview, commit, and Send Plan behavior in an Electron/browser-like environment.

Allowed next artifact:

- Owner memo for minimal smoke ownership, or a narrowly approved harness task package.

Forbidden until approved:

- New Playwright harness.
- Electron smoke automation.
- Browser rendering engine use.
- New dependencies.

Stop condition:

- If the task requires creating a harness, launching Electron, or adding dependencies without owner approval.

### Direction B: Next runtime family pilot

Goal: choose one runtime family to pilot next, with a written owner decision before implementation.

Candidate pilots:

- XLSX/XLS to `table_markdown`.
- DOCX/Office to `markdown`.
- HTML-to-PDF or Office-to-PDF only after sandbox and external-engine decisions.

Forbidden until approved:

- Runtime implementation.
- Parser or office dependency.
- External engine.
- Sandbox implementation.
- New storage/body exposure.

Stop condition:

- If the pilot cannot be described without choosing a new dependency, external engine, sandbox model, or expanded privacy surface.

## 7. Recommended next task

Prefer Direction A first: M2 End-to-End confidence path owner decision.

Reason: Phase 1 now has enough local text-like coverage to benefit more from one owner-approved end-to-end confidence path than from another narrow runtime gap. Runtime-family expansion should wait until the baseline can be demonstrated through a representative user path.

## M32 deadline readiness matrix addendum

As of M32 / HEAD `7040dc5`, the current DFC demo-readiness matrix is:

| Capability | Level |
| --- | --- |
| `original_file` | supported |
| `plain_text` | supported |
| `markdown` | supported |
| `code` | supported |
| CSV/TSV `table_markdown` | supported |
| HTML safe `markdown` / `code` | supported |
| XLSX `table_markdown` | backend pilot |
| DOCX `markdown` | backend pilot |
| HTML -> PDF `pdf_attachment` | experimental-gated backend pilot with real Electron smoke |
| DOCX -> PDF `pdf_attachment` | dev managed runtime smoke through imported LibreOffice runtime |
| `.doc` / `.rtf` / `.docm` | unsupported |
| PS/EPS | unsupported |

The original M1 non-goals described the M1 baseline before later owner-approved pilots. M32 does not rewrite that history; this addendum records the current deadline closeout state after M21 HTML-to-PDF smoke and M31 Office-to-PDF imported-runtime smoke.

## DFC-M64 attachment productization addendum

As of 2026-06-25, the DFC v1.2 attachment sending experience has a productized UI shell over the existing backend-owned capability surface:

| Area | Current state |
| --- | --- |
| Attachment Shelf | Implemented as compact draft attachment chips with status color, remove control, click-to-detail, safe title/tooltip text, and no visible asset id. |
| Chip tooltip | Implemented with filename/type/status/recommended route/compatibility/warning summaries; no local path, storage URI, token, command, env, full hash, or body exposure. |
| Detail Inspector | Implemented with backend target-format cards, selected/recommended/default badges, explicit selection, warnings/diagnostics, URL retention/send-mode controls, and remove/retry controls. |
| Preview | Implemented from the selected backend option/ref path; text previews show selected send text, while `original_file` and `pdf_attachment` use metadata-only copy. |
| Recommendation | Backend-owned `recommendedOptionId` and `recommendedReasonCode` are surfaced as recommendation labels only; they do not silently select or mutate a draft. |
| User defaults | Minimal sanitized setting stores only target-kind preferences globally or by file type. Applying a default resolves to the current backend option and refs; the renderer does not persist stale option ids or SendAssetRefs as defaults. |
| Renderer authority boundary | Preserved. Renderer displays and selects backend-issued options; it does not forge `optionId`, `targetKind`, compatibility, or `SendAssetRef`. |
| Allowed target scope | Still limited to `original_file`, `plain_text`, `markdown`, `code`, `table_markdown`, CSV/TSV, HTML markdown/code/pdf_attachment, XLSX `table_markdown` pilot, DOCX `markdown` pilot, and Windows x64 DOCX `pdf_attachment`. |
| Explicit non-goals | `.doc`, `.rtf`, `.docm`, `.xls`, Excel-to-PDF, PS/EPS, PDF OCR, macOS/Linux LibreOffice, system LibreOffice, PATH fallback, auto-download, external engines, and new dependencies remain out of scope. |

Focused validation at this addendum point:

- `npx vitest --run src/ui-app/components/DraftAttachmentCard.test.ts src/ui-app/AppChatApp.attachments.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts src/next/files/conversationDraftClient.test.ts infra/files/conversationAttachmentService.test.ts src/shared/files/documentFormatConversion.test.ts --testTimeout 60000 --reporter=dot`
- `npx vitest --run infra/files/sendPlanService.test.ts src/next/openrouter/openRouterSendPlanSerializer.test.ts --testTimeout 60000 --reporter=dot`
- `npx vue-tsc --noEmit --pretty false`
- `npm run test:electron-smoke`
- `git diff --check`
- `npm run gate:privacy`

Real Electron launch validation passed after rebuilding the Electron ABI and launching Starverse through the DFC smoke URL. The smoke confirmed backend-owned Markdown option seeding, HTML `pdf_attachment` option generation, Detail Inspector target cards, metadata-only preview behavior, and no path/storage/hash/body-like preview exposure. The final privacy gate passed; clean-worktree/commit status is tracked in the living goal docs and final ledger entry for this productization round.

## DFC v1.2 closure addendum

As of 2026-06-25, the DFC v1.2 implementation baseline is stage-closed around the following scope:

| Capability | Closure classification |
| --- | --- |
| Text files to `plain_text` / text prompt routes | supported |
| Markdown files to `markdown` | supported |
| Code/config/script-like text to `code` | supported |
| CSV/TSV to `table_markdown` | supported |
| HTML to safe `markdown` and source/code-oriented `code` | supported |
| HTML to `pdf_attachment` | supported through the existing Electron conversion bridge and smoke evidence |
| XLSX to `table_markdown` | backend pilot |
| DOCX to `markdown` | backend pilot |
| Windows x64 DOCX to `pdf_attachment` | supported through managed LibreOffice runtime and M63/M64 smoke evidence |
| `.doc`, `.rtf`, `.docm`, `.xls` | explicitly unsupported |
| Excel-to-PDF | deferred |
| PS/EPS | deferred |
| PDF OCR/local parsing | explicitly unsupported |
| macOS/Linux LibreOffice | deferred |
| system LibreOffice / PATH fallback | explicitly unsupported |
| automatic/startup/background/postinstall/conversion-time download | explicitly unsupported |
| external engines or new dependencies | explicitly unsupported |

This closure addendum records the current implementation baseline after later owner-approved pilots. It does not reopen the broader v1.2 design candidate list in `starverse_format_conversion_preview_v1_2.md`, and it does not add new runtime behavior.
