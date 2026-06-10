# Starverse File Pipeline

> 📌 **Status**: Phases 1-9 completed. Read [../progress-ledger.md](../progress-ledger.md) for current decisions and blockers.
> 💡 **For agents**: Phase docs are historical process records. Check [../DOC_STATUS_INDEX.md](../DOC_STATUS_INDEX.md) for each doc's status (active/reference/historical).

This directory is the documentation entry point for the Starverse complete file pipeline. It defines the shared vocabulary, phase boundaries, and decision ledger used by later persistence, import, attachment, provider adaptation, conversion, transcription, and embeddings work.

## Phase Map

1. Phase 1: domain model and rule boundary freeze. Completed.
2. Phase 2: persistence model and local storage layout. Completed.
3. Phase 3: ingestion, URL probing, and source registration. Completed.
4. Phase 4: message attachment semantics and draft recovery. Completed.
5. Phase 5: send eligibility, model compatibility checks, and provider-neutral request planning. Completed.
6. Phase 6: OpenRouter request adaptation and transport wiring. Completed.
7. Phase 7: derivative-task framework, extracted text, transcript, embedding vectors, and PDF annotation capture. Completed.
8. Phase 8: image preview derivatives (`preview_optimized`) with conversion interfaces kept as reserved contracts. Completed.
9. Phase 9: complete frontend file UI MVP. Step 0 blocker cleanup completed; Step 1 composer entry points completed; Step 2 draft attachment strip/card completed; Step 3 attachment details dialog completed; Step 4 send-button gating completed; Step 5 model-switch revalidation and history-incompatible warning/navigation completed; Step 6 historical user-message attachment rendering completed; Step 7 edit-message attachment clone integration completed; Step 8 testing/documentation/closeout completed.

## Current Scope

Phase 9 Step 0 is complete and only covers blocker cleanup for frontend integration readiness:

- renderer bridge methods for local-file and URL ingestion;
- dedicated local-path picker IPC (`dialog:select-local-files`) with file/image contexts;
- renderer clients for ingestion, conversation draft text restore/update, and preview read/ensure;
- composer draft text persistence moved onto `conversationDraft.*` to share a single draft snapshot with attachments.

Phase 9 Step 1 is also complete and covers only composer entry points:

- `+` attachment menu with file, image, and URL actions;
- local path picker integration for file/image contexts;
- ingest-and-attach wiring through the existing file pipeline and conversation draft clients;
- minimal URL prompt flow with retention mode selection;
- drag/drop and paste entry hooks at the composer boundary;
- image-entry front gating from model capability checks.

Phase 9 Step 2 is also complete and covers only draft attachment strip/card rendering:

- draft attachment strip above the composer;
- draft attachment cards for image and non-image attachments;
- preview bridge reads for image thumbnails only;
- remove actions that only detach draft attachments;
- status border mapping and minimal parsing-state feedback.

Phase 9 Step 3 is also complete and covers only draft attachment detail surfaces:

- attachment details dialog from draft attachment cards;
- attachment-level send mode selection with availability reasons;
- URL retention mode selection for URL-derived attachments;
- file metadata, URL metadata, warning, and blocking display;
- retry-preview entry only for safely retryable image previews;
- draft-only remove actions.

Phase 9 Step 4 is also complete and covers only send-button and preflight gating:

- composer send-button disable state from draft attachment Send Plan blocking reasons;
- lightweight composer blocking/warning hints from Send Plan reasons;
- send preflight checks using `sendPlan.buildCurrent` before request preparation when draft attachments exist.

Phase 9 Step 5 is also complete and adds only model-switch revalidation and lightweight history-incompatible navigation:

- model-switch-triggered draft attachment revalidation via Send Plan refresh;
- history-attachment incompatibility/exclusion summary recomputation from Send Plan history scope;
- composer-top non-blocking warning with `查看` and cyclic `<` / `>` `1/N` navigation to target messages.

Phase 9 Step 6 is also complete and adds only read-only historical user-message attachment rendering:

- message-attachment hydration for visible user messages;
- historical attachment list under user messages;
- `preview_optimized` thumbnails for images;
- minimal cards for PDF, text, URL-only, audio, video, archive, and binary attachments;
- red styling for unsupported and history-incompatible attachments;
- `activeHistoryIncompatibleAttachmentId` highlight support with safe message-level fallback.

Phase 9 Step 7 is also complete and adds only edit-entry clone integration:

- edit entry calls `conversationDraft.cloneFromMessage`;
- edit draft restores text + attachment relations from source user message;
- source user message rows remain frozen while draft relations are edited;
- edit submit migrates draft relations via `conversationDraft.attachToMessage` to the new edited user message;
- no extra edit-copy banner text and no request-builder rewrite.

Phase 9 Step 8 is also complete and adds only closeout work:

- Phase 9 test sweep and minimal missing coverage fill (URL retention mode visibility);
- docs and progress ledger convergence for Step 0-8;
- legacy noisy tests (`ChatAppComposer.modelPicker`, `ChatAppComposer.webSearchSendGuard`) recorded as non-blocking interface-mismatch debt;
- no new UI feature and no request-builder semantics change.

## Documents

- `phase-1-domain-model.md`: frozen domain model, support matrix, rules, and invariants.
- `phase-2-persistence-and-storage.md`: persistence tables, local storage layout, deletion semantics, and dedupe boundary.
- `phase-3-ingestion-and-import.md`: local and URL ingestion, probe semantics, source metadata, and import statuses.
- `phase-4-message-attachment-semantics.md`: draft recovery, ownership migration, edit cloning, detach lifecycle, and candidate snapshots.
- `phase-5-send-eligibility-and-planning.md`: parsing gate, compatibility gate, send-plan gate, send-mode selection, and provider-neutral Send Plan output.
- `phase-6-openrouter-request-adapter.md`: Send Plan serialization, OpenRouter content-part mapping, error mapping, PDF plugin injection, and diagnostics.
- `phase-7-derived-tasks-and-embeddings.md`: derivative job framework, extracted text, transcript, embedding-vector generation, PDF annotation capture, and task/error boundaries.
- `phase-8-preview-derivatives.md`: `preview_optimized` derivative responsibilities, generation boundaries, error semantics, and reserved conversion interfaces.
- `phase-9-frontend-ui-mvp.md`: frontend MVP scope and Step 0-Step 8 status.
- `progress-ledger.md`: completed work, frozen decisions, explicit non-goals, and phase dependencies.

## Document Format Conversion / DFC

Current DFC implementation and planning must use the v1.2 topic directory:

- `document-format-conversion/starverse_format_conversion_preview_v1_2.md`: current DFC SSOT for document format conversion, preview, Send Plan, compatibility, and safety boundaries.
- `document-format-conversion/progress-ledger.md`: append-only DFC implementation ledger.
- `document-format-conversion/important-context.md`: context recovery entry point for current DFC work.
- `document-format-conversion/dfc-m32-deadline-closeout-demo-readiness.md`: latest supported/pilot/unsupported matrix at the DFC-M32 closeout.
- `document-format-conversion/dfc-libreoffice-plugin-management-closeout.md`: Task 8 closeout for the LibreOffice Plugin Management integration route, Owner gate, verification matrix, and production-claim boundary.

Current DFC work must not follow the superseded v1.0 Hybrid / mixed send strategy route. `original_file` is a first-class target, `SendAssetRef` distinguishes `raw_file` and `derived_asset`, and Attachment Shelf + Attachment Detail Inspector is the current UI direction.

LibreOffice Office-to-PDF is currently owner-gated and experimental. The current product path is DOCX-only `pdf_attachment` through the managed runtime handle; imported dev artifacts and fake seams are not production package authority, no LibreOffice binary is committed, and system LibreOffice/PATH fallback remains disallowed.

### Historical Reference

The old root-level v1.0 files were moved to `document-format-conversion/archive/v1.0-superseded/`:

- `document-format-conversion/archive/v1.0-superseded/format-conversion-preview-final.md`
- `document-format-conversion/archive/v1.0-superseded/format-conversion-preview-implementation-plan.md`
- `document-format-conversion/archive/v1.0-superseded/format-conversion-preview-progress.md`

These archive files are historical reference only. Do not implement Hybrid, mixed send strategy, or old file-card modal UI from them.
