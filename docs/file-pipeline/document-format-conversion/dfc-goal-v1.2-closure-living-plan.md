# DFC v1.2 Closure Living Plan

Last updated: 2026-06-25 16:03 +08:00

## Goal

Lightly close the Starverse DFC v1.2 file-conversion system as a phase baseline. This closure does not add formats, runtimes, dependencies, DB schema, Send Plan semantics, download behavior, or UI architecture.

## Closure Standard

DFC v1.2 is considered phase-closed when the implementation and documentation agree on the current support surface:

- Implemented or productized baseline: text, markdown, code, CSV/TSV, HTML markdown/code/pdf_attachment, XLSX table_markdown pilot, DOCX markdown pilot, and Windows x64 DOCX pdf_attachment.
- Explicitly unsupported or deferred: `.doc`, `.rtf`, `.docm`, `.xls`, Excel-to-PDF, PS/EPS, PDF OCR/local parsing, macOS/Linux LibreOffice, system LibreOffice, PATH fallback, automatic download, external engines, and new dependencies.
- UI, Send Plan, privacy boundary, implementation matrix, progress ledger, and important context must not contradict that scope.
- Only P0/P1 contradictions should be fixed during closure. P2 polish is recorded but not expanded.

## Current Conclusion

Current conclusion: DFC v1.2 can be treated as a stage-closed baseline if the final targeted validation passes.

Observed alignment:

- `src/shared/files/documentFormatConversion.ts` keeps the DFC target vocabulary to `original_file`, `plain_text`, `markdown`, `code`, `table_markdown`, and `pdf_attachment`.
- Worker/UI/contract tests cover backend-owned option selection, preview/send source alignment, privacy sanitization, HTML markdown/code/pdf_attachment, CSV/TSV table markdown, XLSX table_markdown pilot, DOCX markdown pilot, and DOCX pdf_attachment behavior.
- M63/M64 evidence records Windows x64 DOCX-to-PDF through a managed LibreOffice runtime, manual official install path, no automatic conversion-time download, no system/PATH fallback, and no macOS/Linux production approval.
- M64 attachment productization exposes the existing backend-owned paths without letting the renderer forge `optionId`, `targetKind`, compatibility, `SendAssetRef`, or preview content.
- M64 evidence is anchored in the attachment productization living/progress docs and the `DFC-M64` / `DFC-M64-P2` ledger rows; there is no separate standalone M64 evidence file.
- `src/shared/files/fileRules.ts` and `src/next/file-type/sendRouteMapping.ts` still contain wider legacy/future candidate families for file classification and route exploration. Those sets are not the v1.2 implementation support authority. Actual closure authority is the execution layer, backend DFC option generation, Send Plan validation, runtime gates, and the targeted tests listed below.

## Deferred / Unsupported Items

| Item | Closure classification | Notes |
| --- | --- | --- |
| `.doc` | explicitly unsupported | No legacy Word runtime/parser support in v1.2 closure. |
| `.rtf` | explicitly unsupported | No RTF runtime/parser support in v1.2 closure. |
| `.docm` | explicitly unsupported | Macro-capable Office files stay out of supported conversion scope. |
| `.xls` | explicitly unsupported | Legacy Excel stays outside the XLSX-first table_markdown pilot. |
| Excel-to-PDF | deferred | Not part of Windows x64 DOCX pdf_attachment approval. |
| PS/EPS | deferred | No production runtime or local parsing path in v1.2 closure. |
| PDF OCR/local parsing | explicitly unsupported | PDF understanding remains model/provider-side when sent as a file. |
| macOS/Linux LibreOffice | deferred | Windows x64 only for DOCX pdf_attachment. |
| system LibreOffice | explicitly unsupported | Managed runtime only. |
| PATH fallback | explicitly unsupported | No discovery or fallback through PATH. |
| automatic download | explicitly unsupported | Manual official install path only; no startup/background/postinstall/conversion-time download. |
| external engines/new dependencies | explicitly unsupported | Closure does not add engines or dependencies. |

## File Map

| Area | Files |
| --- | --- |
| Implementation matrix | `docs/file-pipeline/document-format-conversion/dfc-m1-phase-1-closeout-supported-matrix.md` |
| Durable context | `docs/file-pipeline/document-format-conversion/important-context.md` |
| Progress ledger | `docs/file-pipeline/document-format-conversion/progress-ledger.md` |
| Attachment UX closure | `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md` |
| Shared DFC vocabulary | `src/shared/files/documentFormatConversion.ts` |
| Backend attachment authority | `infra/files/conversationAttachmentService.ts` |
| Worker DFC coverage | `infra/db/worker.filePipeline.test.ts` |
| UI/i18n coverage | `src/ui-app/AppChatApp.attachments.test.ts`, `src/ui-app/components/DraftAttachmentCard.test.ts`, `src/shared/i18n/locales/localeKeyConsistency.test.ts` |
| Send Plan coverage | `infra/files/sendPlanService.test.ts`, `src/next/openrouter/openRouterSendPlanSerializer.test.ts` |

## Validation Plan

Required for this documentation-only closure:

- `npm run rebuild:node`
- targeted DFC/UI/contract/i18n Vitest
- `npx vue-tsc --noEmit --pretty false`
- `git diff --check`
- `npm run gate:privacy`

Electron smoke is not required unless this closure changes real send or attachment detail paths. The intended closure patch is documentation-only, so prior M64/M64-P2 Electron smoke evidence remains the live-app evidence.

Validation status: passed for the current documentation-only closure patch.

Completed validation:

- `npm run rebuild:node`
- `npx vitest --run src/ui-app/components/DraftAttachmentCard.test.ts src/ui-app/AppChatApp.attachments.test.ts src/shared/i18n/locales/localeKeyConsistency.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts src/next/files/conversationDraftClient.test.ts infra/files/conversationAttachmentService.test.ts src/shared/files/documentFormatConversion.test.ts infra/files/sendPlanService.test.ts src/next/openrouter/openRouterSendPlanSerializer.test.ts --testTimeout 60000 --reporter=dot` passed: 9 files / 403 tests.
- `npx vitest --run infra/db/worker.filePipeline.test.ts -t "DOCX pdf_attachment|unsupported|Office PDF|LibreOffice|XLSX|HTML pdf_attachment|table_markdown|legacy XLS|CSV|TSV" --testTimeout 60000 --reporter=dot` passed: 31 passed / 29 skipped.
- `npx vue-tsc --noEmit --pretty false` passed.
- `git diff --check` passed with line-ending warnings only.
- `npm run gate:privacy` passed with no unclassified privacy-sensitive matches.

## Risks

- `starverse_format_conversion_preview_v1_2.md` is a design/spec artifact and mentions broader candidate families; the closure baseline is governed by the supported matrix addenda and this living plan.
- `public/build-id.json` remains a generated dirty artifact from earlier build/smoke activity and must not be committed.
- P2 UI wording or release-note polish may remain, but should not block v1.2 closure unless it contradicts support scope or privacy boundaries.

## Stop Conditions

- Stop if the same issue cannot be safely resolved after 3 consecutive attempts.
- Stop if closure requires a major architecture or support-scope decision.
- Stop if sensitive files, generated packages, runtime packages, private paths, or binary runtime artifacts appear in the staged scope.
- Stop when DFC v1.2 reaches the stage-closed baseline.

## Revision Log

| Time | Change |
| --- | --- |
| 2026-06-25 15:51 +08:00 | Created closure living plan with support/deferred standard and validation plan. |
| 2026-06-25 15:58 +08:00 | Updated recovery-state wording after doc-consistency review: current closure anchors are M63, M64 productization docs/ledger rows, and the v1.2 closure docs, not the older M59 install blocker. |
| 2026-06-25 16:03 +08:00 | Added legacy/future candidate-layer clarification and recorded passing targeted validation. |
