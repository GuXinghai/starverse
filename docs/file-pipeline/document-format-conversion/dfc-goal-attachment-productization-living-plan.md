# DFC v1.2 Attachment Productization Living Plan

Last updated: 2026-06-25 15:07 +08:00

## Goal

Productize the existing DFC v1.2 attachment sending experience so users can upload and inspect attachments, see status, open details, choose backend-owned send/conversion routes, preview the actual send content, understand warnings/blockers, and configure minimal defaults.

The UI must make the recommended path visible, editable, and explainable. The renderer must not invent `optionId`, `targetKind`, `SendAssetRef`, compatibility, or derived asset identity.

## Scope

Allowed existing capabilities:

- `original_file`
- `plain_text`
- `markdown`
- `code`
- `table_markdown`
- CSV/TSV table markdown
- HTML markdown/code/pdf attachment
- XLSX table markdown pilot
- DOCX markdown pilot
- Windows x64 DOCX `pdf_attachment`

Explicit non-goals:

- `.doc`, `.rtf`, `.docm`, `.xls`
- Excel-to-PDF
- PS/EPS
- PDF OCR or local PDF parsing
- macOS/Linux LibreOffice
- system LibreOffice
- PATH fallback
- automatic download
- external engines or new dependencies
- renderer-provided executable paths, package URLs, compatibility decisions, or send asset refs

## Product Requirements

- Attachment Shelf: visible attached-file chips, status color, removal, and a way into details.
- Chip tooltip: filename, high-level type, selected target, status, and concise warning/blocker summary without sensitive values.
- Detail Inspector: target options, recommendation reason, warnings/diagnostics, compatibility, and preview.
- Target format cards: show backend-provided option identity, target kind, strategy, availability, recommendation, and why it is safe or blocked.
- Preview: show actual send text for text strategies; show PDF attachment metadata/preview affordance without exposing local paths; show original-file metadata for raw attachment.
- Warnings/diagnostics: explain recoverable warnings and hard blockers using user-facing labels only.
- User defaults: minimal loop for selecting a default behavior from backend-supported options without silently overriding the current choice.

## Safety And Privacy Requirements

Do not expose in renderer UI, docs, logs, tests, or summaries:

- raw local paths, runtime roots, sandbox paths, executable paths
- `storageUri`, storage refs, signed URLs, tokens, env values, command lines
- file body text beyond intended sanitized previews
- full content hash or package hash
- raw backend payloads containing private asset references

Allowed UI evidence should use target kind, option id labels, sanitized status, warning codes, size/type summaries, and metadata-only previews.

## File Map

Refined map after the first read-only code mapping pass:

| Area | Files / Symbols | Notes |
| --- | --- | --- |
| DFC design docs | `docs/file-pipeline/document-format-conversion/starverse_format_conversion_preview_v1_2.md` | Source product contract for Attachment Shelf and Detail Inspector. |
| DFC closeout/evidence | `progress-ledger.md`, `important-context.md`, `dfc-m63-libreoffice-plugin-availability-smoke-and-production-closeout.md` | Must stay aligned with this goal and final evidence. |
| App shell / composer | `src/ui-app/AppChatApp.vue`, `src/ui-app/app/appChatApp.logic.ts`, `src/ui-app/AppChatApp.attachments.test.ts` | Existing entry point for draft attachments, DFC option/preview loading, selected option updates, and details dialog state. |
| Attachment shelf/chip | `src/ui-app/components/DraftAttachmentStrip.vue`, `DraftAttachmentCard.vue`, `DraftAttachmentCard.test.ts` | `DraftAttachmentStrip.vue` is the unchanged shelf/list container that renders chips and forwards interactions; chip tooltip/status copy and user-facing formatting live in `DraftAttachmentCard.vue`. |
| Detail inspector | `src/ui-app/components/DraftAttachmentDetailsDialog.vue` | Existing details dialog with send mode, URL retention, DFC option list, diagnostics, and preview; needs clearer target cards, recommendation/default actions, PDF/raw preview language. |
| DFC UI i18n | `src/shared/i18n/locales/zh-CN/filePipeline.json`, `src/shared/i18n/locales/en-US/filePipeline.json` | DFC attachment UI copy should use existing shared `t`/`tf` helpers, with Chinese as the default UI style and en-US kept key-consistent. |
| Renderer DFC client | `src/next/files/conversationDraftClient.ts`, `conversationDraftClient.test.ts` | Calls backend-owned `getDfcOptions`, `ensureDfcOptions`, `getDfcPreview`, and `updateAttachmentSettings`. |
| IPC contracts/sanitization | `src/next/ipc/contracts/dbBridgeContracts.ts`, `dbBridgeContracts.test.ts` | Decodes DFC option/preview payloads and strips private renderer meta. |
| DFC backend contracts | `infra/files/conversationAttachmentService.ts`, `src/shared/files/documentFormatConversion.ts` | Backend owns option construction, selected refs, decision coherence, and SendAssetRef validation. |
| Send plan | `infra/files/sendPlanService.ts`, `src/next/openrouter/openRouterSendPlanSerializer.ts` and tests | Send plan consumes backend-owned semantic target/send strategy and blocks stale/missing refs. |
| Electron smoke | `scripts/smoke/electron-shell-smoke.mjs`, `npm run test:electron-smoke` | Required real automated Starverse validation path. |
| LibreOffice/DOCX PDF | `infra/files/*libreoffice*`, `scripts/dfc/*libreoffice*` | Windows x64 DOCX PDF attachment path only. |

## Phase Plan

| Phase | Status | Exit Criteria |
| --- | --- | --- |
| P0 Planning and inventory | Complete | Living plan and progress log exist; code map identifies UI/backend/test seams and dirty worktree boundaries. |
| P1 Backend/UI contract hardening | Implemented, validating | Renderer uses only backend-provided option/send-plan/compatibility data; no forged route fields. |
| P2 Attachment Shelf and tooltip | Implemented, validating | Attached files show status color and safe tooltip; removal/details work. |
| P3 Detail Inspector and target cards | Implemented, validating | Users can inspect recommendation, choose available backend options, see warnings/blockers, and keep choice explicit. |
| P4 Preview and diagnostics | Implemented, validating | Preview reflects the actual selected send asset; diagnostics are sanitized and explainable. |
| P5 User defaults | Implemented, validating | Minimal default-setting loop persists safe preferences without silently changing unsupported routes. |
| P6 Validation and docs closeout | Complete | Targeted UI/DFC tests, `vue-tsc`, real Electron automation, `git diff --check`, privacy scan, implementation docs, DFC-only staging, and DFC-only commit are complete. User removed the clean-worktree requirement on 2026-06-25 10:58 +08:00; unrelated provider/runtime dirty work remains outside this DFC goal and outside the DFC commit. |
| P7 DeepSeek P2 UI polish | Complete | New DFC UI strings use shared i18n, main Detail Inspector shows human Chinese labels, raw compatibility/decision/diagnostic/debug fields are under default-collapsed advanced info, default-save feedback is visible, and no backend authority/runtime/support behavior changes. Targeted UI/DFC tests, `vue-tsc`, `git diff --check`, privacy gate, and real Electron smoke passed. |

## Test Plan

Required validation before completion:

- Targeted DFC route/option/send-plan tests.
- Targeted UI tests for shelf, tooltip, inspector, target cards, preview, warnings/diagnostics, and defaults.
- `npx vue-tsc --noEmit --pretty false`.
- `git diff --check`.
- `npm run gate:privacy` or an equivalent repo privacy scan for the changed surface.
- Real Starverse automation, preferred path: `npm run test:electron-smoke` or a focused Playwright/Electron smoke that actually launches the app and exercises the attachment flow.

ABI policy:

- Run `npm run rebuild:node` before DB-heavy Node/Vitest validation.
- Run `npm run rebuild:electron` before Electron smoke.
- If both are needed, finish final validation with Electron and leave ABI target as Electron unless final acceptance pivots back to Node-only checks.
- Do not stage native rebuild artifacts, `node_modules`, generated binaries, or `public/build-id.json`.

## Current Risks

- Existing dirty worktree contains provider/runtime changes outside this DFC goal plus an unverified DOCX smoke seam in the same overlapping file set; they were not reverted or absorbed into the DFC commit. Clean worktree is no longer a DFC-M64 acceptance requirement per the 2026-06-25 10:58 +08:00 user update.
- Existing UI may already be mid-refactor, so the patch must stay narrow and avoid style-only churn.
- Real Electron validation passed for backend-owned Markdown and HTML PDF attachment routes; final static privacy/diff checks passed for the P2 UI polish.
- Privacy regressions are easy if diagnostics include raw backend details; tests/scans must verify sanitized output.
- Unsupported formats must remain unavailable even if UI cards become more generic.
- The current component already exists as a card-heavy shelf; changing it to a mature chip experience should avoid broad style churn or hidden behavioral changes.
- A global DFC default store would be a larger architecture path; this goal should first use the existing attachment-level settings/update path unless a narrow existing default store is found.
- DeepSeek P2 polish is UI-only, but it touches `appChatApp.logic.ts`, which still has unrelated provider/runtime dirty work in the worktree; any future commit must stage only DFC-owned hunks.

## Stop Conditions

- Stop and report if the same issue cannot be fully resolved after 5 consecutive attempts.
- Stop and report if a solution requires a major architecture change, new dependency, external engine, or owner/developer decision.
- Stop and summarize if the goal is complete.
- Stop before expanding beyond the approved format/runtime scope.

## Revision Log

| Time | Change |
| --- | --- |
| 2026-06-25 08:47 +08:00 | Created initial living plan before implementation. |
| 2026-06-25 08:50 +08:00 | Refined file map and phase status after read-only code mapping. |
| 2026-06-25 09:04 +08:00 | Implemented initial backend recommendation, chip tooltip, detail target cards, metadata previews, and DFC default preference wiring; validation pending. |
| 2026-06-25 09:33 +08:00 | Fixed AppChatApp attachment test protocol/runtime harness issues; focused attachment UI suite passes 46/46; validation phase started. |
| 2026-06-25 10:22 +08:00 | Real Electron DFC attachment smoke passed after tightening metadata-only preview wording; final static checks and commit/worktree closeout pending. |
| 2026-06-25 10:31 +08:00 | Final static/privacy/docs validation passed; commit and clean-worktree closeout blocked by unrelated provider/runtime dirty worktree overlap. |
| 2026-06-25 10:37 +08:00 | Prepared a DFC-only staged diff for overlapping files without absorbing provider/runtime changes; clean-worktree closeout remains blocked by unrelated dirty worktree entries. |
| 2026-06-25 10:39 +08:00 | Created the DFC-only commit; clean-worktree closeout remains blocked by unrelated provider/runtime dirty worktree entries. |
| 2026-06-25 10:47 +08:00 | Re-audited after commit; DFC-owned files have no remaining diff, but provider/runtime dirty files and an unverified DOCX smoke seam still block clean-worktree completion. |
| 2026-06-25 10:58 +08:00 | User removed the clean-worktree requirement; DFC-M64 productization is complete with the DFC-only productization commit, validation evidence, and unrelated worktree changes left untouched. |
| 2026-06-25 11:00 +08:00 | Re-ran doc-scoped `git diff --check` and full privacy scan after the revised objective update; both passed. |
| 2026-06-25 14:58 +08:00 | Implemented DeepSeek P2 UI polish for DFC attachment copy/i18n, main-view label hygiene, default-collapsed advanced debug info, and visible default-save feedback; final static/privacy validation pending. |
| 2026-06-25 15:07 +08:00 | Completed DeepSeek P2 UI polish validation: related UI/DFC Vitest, `vue-tsc`, `git diff --check`, privacy gate, and real Electron smoke passed; docs updated with final evidence. |
