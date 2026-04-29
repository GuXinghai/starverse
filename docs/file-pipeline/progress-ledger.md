# File Pipeline Progress Ledger

## Completed In Phase 1

- Created the file pipeline documentation entry point under `docs/file-pipeline`.
- Added shared file domain types in `src/shared/files/fileTypes.ts`.
- Added centralized extension and MIME support matrices in `src/shared/files/fileRules.ts`.
- Added pure classification and profile inference functions.
- Added unit tests for native MVP formats, conversion candidates, fallbacks, missing metadata, metadata conflicts, and aggregate profiles.

## Completed In Phase 2

- Added `file_assets`, `file_derivatives`, and `message_attachments` schema definitions.
- Added idempotent schema ensure logic for existing databases.
- Added repos for file assets, file derivatives, and message attachments.
- Added worker methods for create, read/list, soft delete, and physical cleanup planning.
- Added bridge contract decoders for file pipeline records and lifecycle responses.
- Added local storage path helpers for original and derived files.
- Added tests for repo persistence, worker routing, bridge contracts, and storage path stability.

## Completed In Phase 3

- Added `FileIngestionService` as the shared ingestion service for local files and URL imports.
- Added local file ingestion with metadata read, rule-layer classification, `sha256`, atomic storage copy, and `file_assets` creation.
- Added URL probing with `HEAD`, controlled `GET` fallback, redirect-aware resolved URL capture, and probe warnings.
- Added URL retention modes: `link_only` and `link_and_file`.
- Added URL source metadata persistence through `file_assets.source_meta_json`.
- Added `remote_url` storage backend support for retained URL assets without local file copies.
- Added explicit import, probe, and materialization statuses.
- Added conservative handling for URL MIME and suffix conflicts, including `text/html` masquerading as image or PDF URLs.
- Added tests for local ingestion, URL probe success/failure, materialization success/failure, source metadata, and conservative classification.

## Completed In Phase 4

- Added `conversation_drafts` for current input draft text and mode.
- Added `draft_attachments` for current input draft attachment references.
- Added `file_attachment_lifecycle` for detached and abandoned lifecycle marks.
- Added `ConversationAttachmentService` for draft restore, draft updates, draft attachment add/remove, send-time migration, edit cloning, detach, ownership queries, and candidate snapshots.
- Added worker methods and bridge decoders for draft and message attachment semantics.
- Added atomic draft-to-user-message migration: message creation and attachment transfer succeed or fail together.
- Added edit cloning semantics: original user messages and their formal attachments remain frozen.
- Added semantic candidate snapshots for later context trimming and provider adaptation.
- Added tests for draft recovery, migration, edit clone, resend defaults, branch visibility, detach, abandoned marks, URL asset mounting, and snapshot completeness.

## Completed In Phase 5

- Added provider-neutral send plan types in `src/shared/files/sendPlanTypes.ts`.
- Added `SendPlanService` for current-draft input collection, parsing-gate evaluation, compatibility checks, send-mode selection, and final Send Plan assembly.
- Added a three-layer gate model: parsing gate, compatibility gate, and send-plan gate.
- Added stable final send statuses: `sendable`, `sendable_with_warnings`, `partially_sendable`, and `blocked`.
- Added current-draft versus history attachment prioritization, including dedupe in favor of current draft ownership.
- Added provider-neutral send-mode selection defaults for image, PDF, text, audio, and video inputs.
- Added a timeout-based parsing fallback so stale non-terminal parse states do not block sending forever.
- Added warnings for excluded historical attachments and retained-URL degradation cases.
- Added tests for sendability levels, model recomputation, retained URL warnings, send-mode selection, history exclusion warnings, and Send Plan field consistency.

## Completed In Phase 6

- Added OpenRouter Send Plan serialization in `src/next/openrouter/openRouterSendPlanSerializer.ts`.
- Added deterministic mapping from included attachment plans to OpenRouter `text`, `image_url`, `file`, `input_audio`, and `video_url` content parts.
- Added actual `url_ref` and `inline_base64` serialization paths for image, PDF, audio, video, and text attachments.
- Added structured attachment serialization error mapping with attachment identity and selected send mode.
- Added sanitized OpenRouter attachment diagnostics for included attachments, excluded attachments, plugin injection, and multimodal presence.
- Added minimal PDF `file-parser` plugin injection support through the OpenRouter request builder.
- Added live-stream request-path wiring so pre-serialized multimodal user content blocks and additional plugins can flow through the existing OpenRouter send path.
- Added tests for content-part mapping, blocked-plan rejection, fallback behavior, diagnostics sanitization, plugin injection, and live request-body passthrough.

## Completed In Phase 7

- Added `derivative_jobs` persistence for derivative task lifecycle tracking.
- Added `DerivativeJobRepo` and `DerivativeJobService`.
- Added worker and bridge methods for derivative job create, run, retry, cancel, and query flows.
- Added shared local-storage resolution so derivative readers reuse the same storage-root containment rules as send-time serialization.
- Added minimal `extracted_text` derivative generation for local text assets.
- Added PDF annotation capture that can write `extracted_text` derivatives from OpenRouter file annotations without introducing a heavyweight local PDF parser.
- Added minimal `transcript` derivative generation for local audio assets through OpenRouter chat completions plus `input_audio`.
- Added minimal `embedding_vector` derivative generation through OpenRouter `/embeddings`, including text chunking and derivative-managed JSON output.
- Added structured derivative-task error codes, attempt tracking, and output metadata.
- Added tests for derivative job persistence, worker routing, extracted text generation, PDF annotation capture, transcript generation, embedding retries, and reserved derivative-kind rejection.
- Added explicit `pdf_annotation_parse_failed` runtime handling for malformed stored annotation payloads, separate from `pdf_annotation_missing`.
- Added explicit provider-request timeout mapping to `derivative_task_timeout` for transcript and embedding jobs.
- Added boundary tests for transcript model catalog/capability failures and embedding empty-input or invalid-response failures.

## Completed In Phase 8

- Added minimal `preview_optimized` derivative generation for local image assets (`png`, `jpg`, `jpeg`) via the existing derivative job framework.
- Added bounded preview resize with aspect-ratio preservation and derived-storage output writes.
- Added preview metadata persistence in `file_derivatives.meta_json`, including source/preview dimensions, byte sizes, generator, format, and hashes.
- Added explicit preview failure codes for not-image assets, unsupported source format, missing local file, read failure, generation failure, invalid output, and write failure.
- Added explicit `preview_asset_missing` handling when preview jobs target non-existent assets.
- Added `getLatestReadyPreviewDerivative` and `ensurePreviewDerivative` helpers for reuse-first preview lookup and on-demand generation.
- Kept `converted_pdf` and `send_optimized` as reserved interfaces with explicit not-implemented errors (`conversion_not_implemented`, `derivative_kind_not_implemented`).
- Added tests for preview success, dimension bounds, aspect preservation, derived-storage writes, non-image rejection, missing-local failure, reuse lookup, and reserved-interface behavior.
- Added derivative-run diagnostic summaries and error-message sanitization to avoid leaking absolute local paths or large payload fragments in failed-job messages.

## Completed In Phase 9 Step 0 (Blocker Cleanup)

- Exposed ingestion bridge methods to renderer:
  - `fileIngestion.ingestLocalFile`
  - `fileIngestion.ingestUrl`
- Added worker validation, handler routing, and method registry coverage for file-ingestion bridge methods.
- Added dedicated local path picker IPC:
  - `dialog:select-local-files` returning `filePaths[]`
  - file/image context filters for future composer attach actions
  - legacy `dialog:select-file` kept intact
- Added renderer clients for:
  - file ingestion bridge
  - conversation draft text bridge
  - preview bridge
- Migrated AppChatApp composer text draft restore/persist/clear path to `conversationDraft.restore` and `conversationDraft.updateText`.
- Added preview bridge methods for UI display payloads:
  - `preview.getLatestReady`
  - `preview.ensure`
- Added tests for:
  - ingestion client bridge calls
  - preview client bridge calls
  - new local-path picker IPC behavior
  - draft text restore/persist path migration
  - contract decoding for ingestion and preview payloads

## Post-Audit P1 Fixes

- AUD-002: OpenRouter transport verbose logging now emits sanitized request summaries only. Full API keys, Authorization header values, full request bodies, raw base64, raw data URLs, and text attachment bodies are not logged.
- AUD-003: OpenRouter attachment local-file resolution now validates `storageUri` containment. Only relative paths under `assets/original/` or `assets/derived/` are accepted, and the resolved path must remain inside the configured storage root.
- AUD-001/AUD-004: The production send path now performs a fresh send preflight before streaming: build Send Plan, block on `blocked`, serialize included attachments, migrate draft attachments when creating the user message, and pass content parts plus additional plugins into the OpenRouter stream path.
- AUD-005: Phase 4 ownership language is clarified as relation-level ownership. The same asset may be referenced by multiple relation rows, including edit-clone draft references, without mutating frozen source message attachments.

## Frozen Decisions

- MVP native formats are `png`, `jpg`, `jpeg`, `pdf`, `txt`, and `md`.
- Office-like documents and spreadsheets are conversion candidates, not natively readable in Phase 1.
- Audio and video are reserved as local-only asset classes until transcription or multimodal send flows are implemented.
- Archives are unsupported and use binary payload classification.
- MIME and extension conflicts downgrade to `binary` + `local_only`.
- Embeddings and transcription are task families, not asset kinds.
- Original assets and derivatives are separate concepts.
- Rule code remains in shared/domain scope and must not be embedded in UI or provider adapters.
- `sha256` is stored on `file_assets` but is not unique in Phase 2.
- Physical cleanup is planned but never executed automatically in Phase 2.
- `message_attachments` can be removed independently from the underlying file asset.
- URL import is not equivalent to file download.
- `link_only` preserves URL metadata and creates a `remote_url` asset without local file materialization.
- `link_and_file` preserves URL metadata and attempts local materialization, but falls back to a retained URL asset when local storage fails.
- Device-side URL probe failure does not automatically make the URL unusable for later send adaptation.
- Device-side URL materialization failure does not revoke URL reference eligibility.
- Invalid URL syntax and rejected URL schemes do not create file assets.
- URL source metadata must be persisted, not only logged.
- Draft recovery is limited to the current conversation input draft.
- Draft text and draft attachments are restored as one snapshot.
- Attachment reference ownership is either draft or formal user-message attachment; draft rows are cleared after successful migration.
- Edit mode uses cloned draft references and never mutates historical user message attachments in place.
- Assistant messages do not automatically receive user attachment copies.
- Resend defaults inherit the original user message attachments.
- Assistant regeneration does not mutate the preceding user message attachment set.
- Branch attachment visibility follows user messages present on the active branch path.
- URL local copies are not automatically refreshed; local copy update is manual by default.
- Detached and abandoned states are metadata marks only and do not imply disk deletion.
- Model modality support is read from provider model metadata; concrete attachment planning remains Starverse rule-layer logic.
- Parsing failures and timed-out parsing states are terminal for send-gate purposes and must not block sending forever.
- Current draft attachments are first-class inputs; historical attachments are secondary context candidates and can warn without directly blocking a valid current request.
- Provider-neutral Send Plan output is the only Phase 5 output; final provider payload serialization is deferred.
- Phase 6 consumes the Send Plan as-is and must not reopen inclusion, compatibility, or send-mode decisions inside the request builder.
- Audio input is never sent as URL on OpenRouter.
- PDF is serialized as OpenRouter `file` content and may inject the `file-parser` plugin when explicitly configured.
- Video URL use follows the Send Plan and explicit provider guardrails; the request builder does not enable it optimistically.
- URL and local-copy fallback is only allowed when the Send Plan explicitly carries fallback send modes.
- Diagnostics must stay sanitized and must not log raw base64 payloads, absolute local file paths, or sensitive file bodies.
- Verbose OpenRouter request logging must never print full API keys, Authorization values, complete request bodies, raw data URLs, or attachment text bodies.
- Send-time local file reads must be constrained to the configured storage root and to the frozen `assets/original/` and `assets/derived/` layout.
- Attachment no-double-ownership is a relation invariant. It does not prohibit multiple relations pointing at the same `file_assets` row.
- The production send boundary must rebuild a Send Plan immediately before request serialization; request builders still consume the plan and do not re-run business eligibility logic.
- Derivative jobs are independent from original asset lifecycle. Job failure does not change source asset availability or send eligibility for existing message flows.
- `embedding` and `transcription` remain task families. Their outputs become `file_derivatives`; they are not new asset kinds.
- PDF annotation capture is the preferred Phase 7 path for PDF text reuse. A heavyweight local PDF parser is not introduced here.
- `pdf-text` is deprecated and is not used as the recommended default parser engine in new code.
- Transcript generation only supports local audio copies and `input_audio` transport; audio URL transcription is explicitly rejected.
- Embedding generation only accepts text-like inputs derived from extracted text, transcript text, or native text assets.
- `converted_pdf`, `send_optimized`, and `preview_optimized` remain reserved derivative interfaces in Phase 7 and are not fully implemented.
- In Phase 8, `preview_optimized` is minimally implemented for image previews only; it remains an internal preview artifact and is not a send-source override.
- `converted_pdf` and `send_optimized` remain reserved interfaces and are not implemented for conversion or send optimization.
- Phase 9 Step 0 preview bridge payloads are display-only and must not be used as Send Plan sources or OpenRouter serializer inputs.
- Phase 9 Step 0 composer text draft persistence is anchored on `conversation_drafts`; legacy `settings.get/set/deleteChatDraft` is no longer part of the active composer draft path.
- `dialog:select-file` remains a legacy data-url picker path and is intentionally preserved while `dialog:select-local-files` is used for managed file ingestion.
- URL local-copy update remains manual by default; Step 0 does not add auto-refresh behavior.

## Completed In Phase 9 Step 1 (Composer Entry Points)

- Added the composer `+` attachment menu with upload file, upload image, and upload URL actions.
- Routed file and image selection through `dialog:select-local-files` using file/image contexts.
- Routed successful imports through `fileIngestion.ingestLocalFile`, `fileIngestion.ingestUrl`, and `conversationDraft.addAttachment`.
- Added drag/drop and paste attachment entry hooks at the composer boundary.
- Added a minimal URL prompt flow with retention-mode selection.
- Added a model-image-capability gate that disables image upload entry points when the active model does not support image input.
- Kept attachment feedback lightweight and localized to the composer.
- No attachment cards, detail panel, history UI, or send-plan logic changes were introduced in Step 1.

## Completed In Phase 9 Step 2 (Draft Attachment Strip and Cards)

- Added the composer-side draft attachment strip above the input area.
- Added draft attachment cards for image and non-image attachments.
- Wired image cards to read `preview_optimized` display payloads through the preview bridge.
- Added status display for parsing, ready, warning, incompatible, failed, and unsupported attachment states.
- Added border-tone mapping for green, yellow, red, and neutral states.
- Added draft-only remove actions that do not delete underlying file assets.
- Added app-layer view-model construction so UI components do not reconstruct attachment semantics.
- Kept preview payloads display-only and out of Send Plan / OpenRouter serialization paths.

## Completed In Phase 9 Step 3 (Attachment Details Dialog)

- Added a draft attachment details dialog opened from draft attachment cards.
- Added attachment-level send mode selection with explicit availability reasons.
- Added URL retention mode selection for URL-derived attachments.
- Added display of file metadata, attachment state, warnings, blocking reasons, and URL probe/materialization metadata.
- Added retry-preview entry only for image attachments that can safely retry preview generation.
- Kept remove actions draft-only and did not delete underlying file assets.
- Kept `preview_optimized` display-only and did not introduce any send-source override.
- Kept URL local-copy refresh manual-update only; Step 3 does not add auto-refresh behavior.

## Completed In Phase 9 Step 4 (Send Button and Send Plan Gate)

- Added composer send-button disable behavior for draft attachment blocking reasons from Send Plan.
- Added lightweight composer blocking and warning hints derived from Send Plan reasons.
- Added send preflight checks that call `sendPlan.buildCurrent` before request preparation when draft attachments are present.
- Kept warning reasons non-blocking; only blocking reasons prevent send.
- Kept `preview_optimized` out of send payload eligibility and serialization.
- Did not change historical attachment UI or history navigation behavior.
- Did not rewrite request builder semantics and did not modify OpenRouter serializer behavior.
- Consolidated send-button eligibility to app-layer `Send Plan -> canSend` output and removed composer-local fallback gate behavior.
- Kept conservative partial-send gate policy: allow only with explicit included attachments and no draft-side excluded/blocked/parsing attachments.

## Completed In Phase 9 Step 5 (Model Switch Revalidation and History Warning)

- Added model-switch-triggered revalidation for draft attachment Send Plan and draft attachment card status refresh.
- Added app-layer recomputation of historical attachment incompatibility/exclusion summary from Send Plan history scope.
- Added non-blocking composer warning for historical attachments that are excluded from the next model context.
- Added `查看` entry with cyclic `<` / `>` navigation and `1/N` index for history-incompatible targets.
- Reused message-level focus/scroll behavior for history target navigation; no new attachment-level history card UI was introduced.
- Added `activeHistoryIncompatibleAttachmentId` app-layer state for Step 6 attachment-level highlighting handoff.
- Kept send-button gating tied to draft attachment gate semantics from Step 4; history warnings do not block send.
- Kept OpenRouter request builder and Send Plan business semantics unchanged.

## Completed In Phase 9 Step 6 (Historical Message Attachment Rendering)

- Added read-only historical user-message attachment rendering under user messages.
- Added message-attachment hydration for visible user messages through the message-attachment bridge.
- Added image thumbnail display from `preview_optimized` when a ready preview exists.
- Added minimal read-only cards for PDF, text, URL-only, audio, video, archive, and binary attachments.
- Added red styling for unsupported and history-incompatible historical attachments.
- Added `activeHistoryIncompatibleAttachmentId` highlighting for the currently located attachment, with safe message-level fallback when the attachment card is absent.
- Kept history attachment rendering display-only and did not introduce details, detach, delete, preview, or send-path changes.
- Kept `preview_optimized` out of send serialization and request-builder inputs.

## Completed In Phase 9 Step 7 (Edit Message Attachment Clone Integration)

- Wired the user-message edit entry to `conversationDraft.cloneFromMessage` instead of text-only local copy.
- Restored edit draft text and draft attachment relations from the selected source user message.
- Preserved frozen-history semantics: source user message body and source `message_attachments` rows are not mutated by edit-draft operations.
- Kept edit-draft text and attachment edits scoped to `conversation_drafts` and `draft_attachments`.
- Migrated edit-draft attachments to the newly created edited user message through `conversationDraft.attachToMessage` after branch fork/replace creates the message row.
- Kept edit submit on existing branch/send chain semantics; no OpenRouter request builder rewrite was introduced.
- Kept UI wording unchanged and did not add an explicit edit-copy banner.
- Kept historical attachment rendering read-only; Step 7 still does not add historical detach/unbind UI.

## Completed In Phase 9 Step 8 (Testing, Documentation, Closeout)

- Executed the Step 8 Phase 9 core test sweep across UI app, file clients, bridge contracts, OpenRouter send preparation/serialization, and dialog IPC.
- Added missing minimal UI coverage for URL-retention control visibility (`default`, `link_only`, `link_and_file`) in attachment details.
- Revalidated that the UI send chain still consumes app-layer Send Plan outputs and still performs preflight before send.
- Revalidated that `preview_optimized` remains display-only and never becomes a send-source input.
- Revalidated draft attachment removal as relation-only behavior (no asset deletion).
- Updated Phase 9 documentation and status entries to Step 8 closeout state.
- Logged non-blocking legacy test noise:
  - `src/ui-app/components/ChatAppComposer.modelPicker.test.ts`
  - `src/ui-app/components/ChatAppComposer.webSearchSendGuard.test.ts`
  - Both currently fail from stale test fixtures that no longer match the composer interface, not from a Phase 9 send-chain regression.

## Explicitly Not Done

- No full file manager UI.
- No provider file reference implementation.
- No message attachment creation as part of ingestion.
- No model capability checks or send-mode selection.
- No conversion, compression, preview, OCR, transcription, or embedding job implementation.
- No automatic URL local-copy refresh.
- No automatic file deletion after detach, message deletion, or abandoned marking.
- No cross-session dedupe, shared reference pointer, or reference-counted garbage collector.
- No full file manager UI.
- No historical attachment unbind/detach UI.
- No full file preview UI.
- No conversion/compression/RAG UI entry workflow in the composer.
- No provider Files API integration.
- No derivative-task scheduling during request build.
- No automatic remote refresh or local overwrite during send-time serialization.
- No full RAG retrieval system or vector search layer.
- No Office conversion pipeline.
- No image/PDF compression workflow.
- No OCR pipeline.
- No automatic derivative-driven reindexing of historical conversations.

## Dependencies For Later Phases

- Phase 3 may use `inferFileProfile`, `file_assets`, and storage path helpers during local upload and URL import registration.
- Phase 4 may use `message_attachments` and profile fields to decide message attachment eligibility.
- Phase 5 may compare `AiPayloadKind` with model `ModelCapability` before sending and emit a provider-neutral Send Plan.
- Phase 6 may consume the Send Plan directly and serialize provider payloads without reimplementing attachment semantics.
- Phase 7 may use `ProcessingStatus`, `DerivedKind`, and `file_derivatives` to schedule conversion, preview, transcription, and embedding work.
- Phase 8 may build reuse, search, optimization, or richer background execution on top of derivative jobs and ready derivatives without changing original asset ownership or send-path semantics.

## Entry Conditions For Phase 2

- Phase 1 tests pass.
- No UI or provider code depends on forked file classification logic.
- Any new file format decision is added to the shared matrix and documented here before persistence work starts.

## Entry Conditions For Phase 3

- Phase 2 repo and worker tests pass.
- Local storage path helpers remain the only path allocation mechanism.
- File import code must create `file_assets` records before creating message attachments.
- Import code must not implement cross-session dedupe unless a separate lifecycle and deletion design is approved.

## Entry Conditions For Phase 4

- Phase 3 ingestion tests pass.
- URL source metadata is available from `file_assets.source_meta_json`.
- Ingestion results expose `AiPayloadKind`, `ProcessingStatus`, import status, URL retention mode, and send eligibility hints.
- Message attachment creation remains separate from ingestion.
- Attachment logic must not treat URL probe failure or materialization failure as automatic send ineligibility.

## Entry Conditions For Phase 5

- Phase 4 draft and message attachment tests pass.
- Candidate attachment snapshots expose included and excluded attachment rows without provider serialization.
- Attachment rows expose `AiPayloadKind`, `ProcessingStatus`, source kind, and storage backend.
- Provider send adaptation must consume snapshots and model capabilities rather than reimplementing ownership rules.
- URL local-copy refresh remains manual unless a separate lifecycle design is approved.

## Entry Conditions For Phase 6

- Phase 5 Send Plan tests pass.
- Final send-status output must be explainable through attachment plans, warnings, and blocking reasons.
- Model compatibility checks must already react to attachment resolution and model changes before payload build starts.
- Provider payload builders must consume the Send Plan directly instead of reopening attachment ownership or eligibility rules.

## Entry Conditions For Phase 7

- Phase 6 OpenRouter serialization tests pass.
- Included attachments can be mapped into provider requests without request-builder-side eligibility recomputation.
- Attachment serialization failures are surfaced through structured error codes rather than silent omission.
- PDF plugin injection remains explicit and minimal until a later parsing-strategy phase expands it.
- Diagnostics remain sanitized and usable for provider debugging without leaking raw payload content.
- Post-audit P1 fixes for OpenRouter log redaction, storage URI containment, and production Send Plan wiring remain covered by tests.

## Entry Conditions For Phase 8

- Phase 7 derivative job tests pass.
- `file_derivatives` can be produced, queried, retried, and reused without mutating source assets.
- PDF annotation capture remains non-fatal to the primary send path.
- Transcript and embedding tasks remain isolated from request builders and UI code.
- Diagnostics remain summary-only and do not log raw derivative payloads, audio base64, or full vectors.

## Governance Additions (2026-04-29)

### 2026-04-29

- 完成：将最终方案文件 `format-conversion-preview-final.md` 添加至 `docs/file-pipeline/`，作为文档格式转换、预览、发送计划、模型兼容性与安全治理的权威参考信源。
- 完成：创建执行进度跟踪文件 `format-conversion-preview-progress.md`，用于记录代码调研、差距分析与分阶段落地执行日志。
- 修改文件：已在 `docs/file-pipeline/README.md` 中追加索引条目，指向最终方案文档。
- 当前状态：方案已纳入治理文件；尚未开始代码实现，下一步将执行代码调研清单并记录在 progress 文档中。

