# Phase 9: Frontend File UI MVP

## Scope

Phase 9 builds the minimal end-to-end frontend file UX on top of the frozen Phase 1-8 semantics:

1. Add attachments from local files, images, and URLs.
2. Show draft attachment status and send gating results from Send Plan.
3. Migrate draft attachments to user messages at send boundary.
4. Render historical user-message attachments.
5. Warn when model switches make historical attachments incompatible.
6. Render read-only historical user-message attachments under user messages.

This phase does not introduce a full file manager, full preview UI, RAG UI, conversion UI, or asset-library management.

## Step 0 Status: Blockers Cleared

Step 0 is focused on bridge and data-path readiness only, not full UI implementation.

Completed in Step 0:

- Added renderer-callable ingestion bridge methods:
  - `fileIngestion.ingestLocalFile`
  - `fileIngestion.ingestUrl`
- Added dedicated file picker IPC for managed ingestion:
  - `dialog:select-local-files` returns `filePaths[]`
  - Supports `context: 'file' | 'image'`
  - Keeps legacy `dialog:select-file` unchanged
- Added renderer clients for:
  - file ingestion
  - conversation draft text restore/update
  - preview read/ensure
- Migrated composer text draft restore/persist path to `conversationDraft.restore` and `conversationDraft.updateText`.
- Added preview bridge methods for UI thumbnail reads:
  - `preview.getLatestReady`
  - `preview.ensure`
  - Returned payload is display-only and does not participate in send serialization.

Still intentionally not done in Step 0:

- Attachment cards
- Attachment detail panel
- Historical attachment navigation UI
- Visual styling work

## Step 1 Status: Composer Entry Points Added

Step 1 adds the minimal attachment entry surface in the composer without introducing attachment cards, detail panels, history navigation, or send-side request changes.

Completed in Step 1:

- Added a `+` attachment menu in `ChatAppComposer`.
- Added menu actions for:
  - upload file
  - upload image
  - upload URL
- Wired local file picking through `dialog:select-local-files` with `context: 'file' | 'image'`.
- Wired ingestion through `fileIngestion.ingestLocalFile` and `fileIngestion.ingestUrl`.
- Added the minimal URL prompt flow with retention mode selection.
- Routed successful imports into `conversationDraft.addAttachment` so draft text and draft attachments stay in the same conversation draft snapshot.
- Added drag/drop and paste entry hooks for file, image, and URL attachment intake.
- Added the model-image-capability front gate for image upload, drag, and paste.
- Kept attachment feedback lightweight and local to the composer.

Still intentionally not done in Step 1:

- Attachment cards
- Attachment detail panel
- Historical attachment display or navigation
- File status overview
- OpenRouter request assembly changes
- Preview-as-send-source changes

## Step 2 Status: Draft Attachment Strip and Cards Added

Step 2 adds the draft attachment strip in the composer area and renders attachment cards from the current conversation draft snapshot.

Completed in Step 2:

- Added a draft attachment strip above the composer.
- Added draft attachment cards for image and non-image attachments.
- Wired image cards to display `preview_optimized` thumbnails through the preview bridge.
- Added state display for parsing, ready, warning, incompatible, failed, and unsupported attachment states.
- Added border-tone mapping for green, yellow, red, and neutral states.
- Added remove actions that remove the draft attachment only and do not delete the underlying file asset.
- Added view-model construction in app logic so UI components do not reassemble attachment business state.

Still intentionally not done in Step 2:

- Attachment detail panel
- URL detail expansion
- Historical attachment display or navigation
- Send button logic changes
- OpenRouter request assembly changes
- Preview-as-send-source changes
- Full file preview UI

## Step 3 Status: Attachment Details Dialog Added

Step 3 adds the attachment details dialog for draft attachments and keeps the scope limited to draft-only settings and display state.

Completed in Step 3:

- Added a details dialog that opens from draft attachment cards.
- Added attachment-level send mode selection with explicit availability reasons.
- Added URL retention mode selection for URL-derived attachments.
- Added display of file metadata, attachment state, warnings, blocking reasons, and URL probe/materialization metadata.
- Added retry-preview entry only for image attachments that can safely retry preview generation.
- Kept remove actions draft-only so file assets are not deleted.

Still intentionally not done in Step 3:

- Historical attachment details or history navigation
- Full file preview UI
- Send button logic changes
- OpenRouter request assembly changes
- Preview-as-send-source changes
- File status overview

## Step 4 Status: Send Button and Send Plan Gate Added

Step 4 adds send gating for draft attachments by consuming Send Plan results at composer-send time and at send-button state display.

Completed in Step 4:

- Added composer send-button gate messaging for draft attachment blocking and warning reasons.
- Disabled the send button when draft attachment Send Plan indicates blocking reasons.
- Added send preflight blocking check from `sendPlan.buildCurrent` before request preparation when draft attachments are present.
- Kept warning reasons non-blocking and surfaced as lightweight composer warnings.
- Kept all gating logic on existing Send Plan services and did not introduce parallel eligibility logic.
- Kept send-button eligibility as app-layer Send Plan gate output (`canSend`) and removed composer-local fallback gate logic.
- Kept `partially_sendable` under conservative allow rules only (included attachments remain explicit, no blocked/parsing draft attachments, no excluded draft attachments).

Still intentionally not done in Step 4:

- Historical attachment UI and history navigation
- Full attachment preview UI
- OpenRouter request serializer changes
- Request builder semantic rewrites

## Step 5 Status: Model-Switch Revalidation and History-Attachment Warning Added

Step 5 adds model-switch revalidation for both draft and historical attachment context, plus lightweight history-incompatible navigation above the composer.

Completed in Step 5:

- Added model-change-triggered recomputation for draft attachment Send Plan status and card view models.
- Added model-change and scope-change recomputation for historical attachment incompatibility/exclusion summary.
- Added a composer-top warning banner for historical attachments that will not be included in the next request context.
- Kept history warning non-blocking and separate from send-button blocking logic.
- Added `查看` entry and cyclic `<` / `>` navigation with `1/N` index display.
- Reused existing message focus/scroll behavior for history-target navigation.
- Added app-layer history-incompatible view model, including `activeHistoryIncompatibleAttachmentId` for Step 6 handoff.

Still intentionally not done in Step 5:

- Full historical attachment card/list rendering under user messages.
- Historical attachment details dialog.
- Historical attachment detach/management operations.
- Full file preview UI.
- OpenRouter request builder semantic changes.

## Step 6 Status: Historical User-Message Attachment Rendering Added

Step 6 adds read-only historical attachment rendering directly under user messages and keeps the scope limited to display-only hydration.

Completed in Step 6:

- Added message-attachment hydration for visible user messages through the message-attachment bridge.
- Added a read-only historical attachment list under each user message that has message attachments.
- Added image thumbnail rendering from `preview_optimized` when a ready preview is available.
- Added minimal file-type cards for PDF, text, URL-only, audio, video, archive, and binary attachments.
- Added red history-incompatible/unsupported styling in the historical attachment cards.
- Added `activeHistoryIncompatibleAttachmentId`-driven attachment highlight, with safe message-level fallback when the target card is missing.
- Kept historical attachment UI read-only: no details dialog, no detach/remove actions, no send-mode controls, and no send-chain changes.
- Kept `preview_optimized` display-only and out of Send Plan / OpenRouter serialization paths.

Still intentionally not done in Step 6:

- Historical attachment details dialog
- Historical attachment detach/management operations
- Full file preview UI
- OpenRouter request builder semantic changes
- Send-chain changes

## Step 7 Status: Edit-Message Attachment Clone Integration Added

Step 7 connects the existing user-message edit entry to Phase 4 clone semantics so edit drafts carry both text and attachment relations without mutating frozen history rows.

Completed in Step 7:

- Routed user-message edit entry through `conversationDraft.cloneFromMessage`.
- Edit draft now restores both source user text and source attachment relations into composer draft state.
- Kept source user message and source `message_attachments` frozen while editing.
- Kept draft-side operations (`text update`, `remove attachment`, `add attachment`) scoped to `conversation_drafts` / `draft_attachments` only.
- Routed edit submit to migrate draft attachment relations onto the newly created edited user message through `conversationDraft.attachToMessage`.
- Kept submission and preflight pipeline on existing Step 4 send and branch infrastructure; no request-builder rewrite was introduced.
- Kept UI wording unchanged; no new "editing copy" banner or extra prompt was added.

Still intentionally not done in Step 7:

- Historical attachment detach/unbind UI.
- Historical attachment details panel.
- Full file preview UI.
- Assistant regenerate semantic rewrites.
- OpenRouter request builder rewrites.

## Step 8 Status: Test, Documentation, And Closeout Completed

Step 8 is a closeout step. It adds no new frontend feature surface.

Completed in Step 8:

- Ran Phase 9 core test suites for UI app, file clients, bridge contracts, OpenRouter send preparation, and dialog IPC.
- Re-validated that composer send gating remains app-layer `Send Plan -> canSend` and send-time preflight still runs immediately before send.
- Added focused coverage for URL retention controls to ensure `default`, `link_only`, and `link_and_file` options are all visible in attachment details.
- Confirmed `preview_optimized` remains display-only in UI and does not become a send source.
- Confirmed draft attachment remove flows only remove draft relations and do not delete assets.
- Recorded legacy noise tests `ChatAppComposer.modelPicker.test.ts` and `ChatAppComposer.webSearchSendGuard.test.ts` as non-blocking interface-mismatch debt for later cleanup (not a Phase 9 feature regression).
- Updated file-pipeline docs and progress ledger to reflect Phase 9 Step 0-8 status and remaining TODOs.

Still intentionally not done in Step 8:

- Full file manager UI
- Historical attachment unbind/detach UI
- Full file preview UI
- Conversion/compression/RAG UI
- Automatic URL local-copy refresh
- OpenRouter request builder rewrite

## Frozen Boundaries Kept

- `preview_optimized` is display-only; it is not a model send source.
- `converted_pdf` and `send_optimized` remain reserved interfaces.
- URL local copy behavior remains manual-update by default.
- URL local-copy refresh remains manual-update by default; Step 3 does not add auto-refresh behavior.
- Step 4 send gating uses Send Plan blocking reasons only; warning reasons remain non-blocking.
- Step 5 history-attachment incompatibility warnings remain non-blocking and must not be promoted into send-button blocked state.
- Step 6 historical attachment rendering is read-only and display-only; it must not mutate attachment ownership, send modes, or request serialization.
- UI send logic must continue through `sendPlan.buildCurrent` and `prepareOpenRouterSendFromDraft`.
- Request builders do not re-run send-plan business decisions.
