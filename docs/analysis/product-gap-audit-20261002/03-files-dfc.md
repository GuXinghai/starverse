# Workstream 03 — Files / Attachments / DFC

Audit snapshot: `models-dev-capability-resolution` at `8d928d6d913d61e51052a8c52f2b665cac332c03`, inspected 2026-10-03 (Asia/Tokyo).

Status: complete. Final coordinator classifications are in findings.json; incremental checkpoints are preserved below. Read-only code mapper supplies incremental findings; coordinator persists this dedicated report under the agent's file-write restriction. No real profiles, credentials, conversions or provider requests are used.

Initial map: `DraftAttachmentStrip.vue`, `DraftAttachmentCard.vue`, `DraftAttachmentDetailsDialog.vue`; `src/next/files/{fileIngestionClient,conversationDraftClient,sendPlanClient,messageAttachmentClient,previewClient}`; `electron/services/generationV2DfcService.ts` and epoch-2 DFC repositories. Scope is upload → inspect → convert → preview → compatibility → send → history.

Supported product/platform scope will be checked in current code before treating additional conversion formats as gaps.

## Incremental evidence checkpoint

- Strong candidate, coordinator source check confirms mismatch: `electron/services/generationV2DfcService.ts:123-125,154-165` creates and advertises a ready DOCX PDF using `starverse-dfc-docx-pdf-v1`. Selection at `:79-82` looks up every PDF using the HTML PDF converter contract, then throws `GENERATION_V2_DFC_OPTION_UNAVAILABLE` when no such output exists. User-visible select/send consequences and existing tests are being traced.
- Text converter reachability and format semantics remain under verification; legacy or deliberately unsupported pilot formats will not automatically be retained as regressions.

## Completed workstream findings

| Candidate | Severity / type | Scenario and exact broken loop | Evidence | Minimal direction / tests |
|---|---|---|---|---|
| F03-01 | HIGH / BROKEN_CLOSURE | DOCX converts through managed LibreOffice; PDF is ready; choosing it fails because selection queries the HTML converter contract. | `electron/services/generationV2DfcService.ts:123`, `:164`, `:79`; UI select/error `src/ui-app/app/appChatApp.logic.ts:5031`, `:5064`. | Backend: bind the actual generated contract/revision. Unit/adapter/default Markdown smoke miss selection. Specialized packaged/live-installed Electron smokes DO exercise DOCX options→select→preview and would catch this with valid prerequisites; not executed during this audit. |
| F03-02 | MEDIUM / BROKEN_CLOSURE | HTML→Markdown and CSV/TSV→table Markdown advertise conversion but send unchanged source text. | Service `:41` identity transform, `:110` availability, `:134` output; `generationV2ComposerClient.ts:47` sends selected output; supported-matrix docs `:30-31` promise tables/safe HTML. | Backend transforms for reviewed formats or block mislabeled targets; output-content tests. Current Markdown input and mocked content cannot detect identity conversion. |
| F03-03 | MEDIUM / UI_WITHOUT_BACKEND | Enabled Default send-mode button always fails. | `DraftAttachmentDetailsDialog.vue:601`; logic `:4138`, `:4161`, `:5041` unconditionally rejects preferredSendMode. | UI retire/disable obsolete controls within current V2 contract. No send-mode action test found. |
| F03-04 | MEDIUM / UI_GAP | Original/PDF selection succeeds yet preview says No selected preview. | Service `:91`, `:225` emits kind none for ready nontext; dialog `:570`, `:581` expects raw_file metadata. | Backend/DTO correct effective-asset metadata kind; no graphical PDF viewer requirement. Existing fixture tests text only. |
| F03-05 | MEDIUM / ERROR_RECOVERY | HTML PDF timeout/failure prevents choosing Original or Markdown. | Service options `:55-60`, select `:76`, HTML conversion `:120`, throw `:179`; logic `:4954`; dialog `:415`. | Backend isolate failed option/lazy conversion; preserve independent selections. Adapter tests miss enumeration failure. |
| F03-06 | MEDIUM / ERROR_RECOVERY | Multi-file import partially fails but feedback reports only success. | logic `:4686-4702`; `src/ui-app/AppChatApp.attachments.test.ts:156` checks surviving card, not failure disclosure. | UI partial-success count and retry. Current partial-import test permits misleading feedback. |

Component: `src/ui-app/components/DraftAttachmentDetailsDialog.vue`; orchestrator: `src/ui-app/app/appChatApp.logic.ts`; composer projection: `src/next/generation-v2/renderer/generationV2ComposerClient.ts`.

## Current execution path and coverage

`AppChatApp.vue:1088` → attachment handlers → Generation V2 composer client → `electron/ipc/generationV2ComposerIpc.ts:121` grants/ingestion/detection and `:246` options/select/preview → `GenerationV2DfcService` → `infra/db/repo/composerDraftV2Repo.ts:318` immutable selection/lineage → effective asset send projection → history snapshot cards.

| Area | Status | Evidence and limits |
|---|---|---|
| Grant-bound import and detection | CLOSED statically | Immutable source/revisions and sender-bound grants; partial-failure disclosure remains partial. |
| DFC options / conversion / selection | PARTIAL | DOCX contract, text semantics and option-failure isolation gaps. |
| Selected text preview | CLOSED statically | Reads immutable selected revision; raw/PDF metadata kind is partial. |
| Selection persistence / send / history | PARTIAL | Authority and projection exist; DOCX selection prevents closure; no fresh runtime validation. |
| Additional office formats/platforms | UNKNOWN / deliberate non-goals | Do not infer supported scope from legacy pilots. |

Ruled out: automatic application of saved DFC defaults is deliberately manual (`en-US/filePipeline.json:111`). Cross-platform LibreOffice, old office formats, OCR, automatic download and PATH fallback are deferred. Original/PDF metadata-only preview is deliberate. HTML conversion requests disable JavaScript/network/local-file access. DOCX Markdown/XLSX pilot documentation discrepancies require scope reconciliation, not automatic feature expansion.

Static-only agent inspection; no conversion, runtime, tests, dependency install, native rebuild, user DB/profile or network/provider request.

Coordinator cross-check correction: `scripts/dfc/office-pdf-libreoffice-packaged-electron-smoke.mjs:99-129` and `scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs:405-425` cover actual DOCX import→options→select→preview. Their existence is meaningful integration coverage. Current success is unverified; the default shell smoke's Markdown-only route does not substitute for running these prerequisites-dependent checks.
