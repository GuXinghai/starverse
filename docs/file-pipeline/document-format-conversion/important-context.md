# Document Format Conversion Important Context

This file is the recovery entry point after context compression. The source of truth for the document format conversion and preview contract remains `starverse_format_conversion_preview_v1_2.md` in this directory. Do not split the source contract into derived contract files unless the Owner explicitly changes that decision.

## Current status

- Current branch at latest documented DFC closeout: `main`
- Current topic directory: `docs/file-pipeline/document-format-conversion/`
- Current SSOT file: `starverse_format_conversion_preview_v1_2.md`
- Latest closeout: `dfc-libreoffice-plugin-management-closeout.md` records the LibreOffice Plugin Management route through runtime diagnostics, lifecycle inventory, catalog/import contract, package verification, lifecycle controls, adapter switch-over, product gate diagnostics, acquisition/download pipeline, release/upload owner-gate audit, `.svpkg` import bridge, official-source local package preparation, and draft release redownload verification evidence.
- Current recovery state: LibreOffice Office-to-PDF remains owner-gated and experimental with `productionApproved=false`. The current path is DOCX-only `pdf_attachment` through the managed runtime handle, with `markdown` and `original_file` fallbacks unchanged. Imported dev artifacts, official-source local `.svpkg` verification, and draft release redownload verification provide local/distribution confidence only; fake seams are not production runtime authority. Task 9 adds a disabled-by-default, owner-gated acquisition/download contract and controlled runtime cache/staging helper. Task 10 verified GitHub repo permissions and later Owner authorized a draft release upload/redownload verification round. Task 10R adds the `.svpkg` archive import bridge, records `dfc-libreoffice-owner-source-decision.md`, and adds a package preparation script. The follow-up official-source preparation round downloaded LibreOffice `26.2.4` Windows x86_64 from The Document Foundation infrastructure, prepared a real repo-external Starverse `.svpkg`, verified it through the archive/import bridge, and ran the real managed DOCX-to-PDF worker smoke. The draft release verification round uploaded the `.svpkg` as `starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64`, redownloaded the asset, verified sha256/size, re-ran archive/import verification, and re-ran the real managed DOCX-to-PDF worker smoke. No LibreOffice binary, `.svpkg`, extracted runtime, system LibreOffice/PATH fallback, `.doc` / `.rtf` / `.docm`, PS/EPS, or PDF OCR/local parsing support is committed or production-approved.
- Task 0-10R commit chain for this route includes `b50ce13`, `a506258`, `462a259`, `677328f`, `67b2bf5`, `ea33a9a`, `4e11d00`, `7c20e21`, `f79e38c`, `efe3696`, `4cf4e40`, `5ce73c4`, and `5dfe3fe`. The current round adds official-source local package preparation and verification evidence.
- Next DFC work should not expand Office formats or flip production approval until Owner explicitly accepts legal/license/provenance/security review, package signing policy, production acquisition policy, platform layout review, packaged smoke policy, user-facing wording, and lifecycle policy.
- Local worktree note at this closeout: `public/build-id.json` and `.artifacts/**` may be unrelated dirty local items and must not be staged as part of DFC documentation or runtime work.
- Current navigation note: the old root-level `format-conversion-preview-*` v1.0 files are historical only under `docs/file-pipeline/document-format-conversion/archive/v1.0-superseded/`; do not use them as implementation authority.
- The DFC-0 through DFC-6 bullets in this section are historical setup milestones; later DFC-7 through DFC-30 and DFC-M0 through DFC-M32 recovery notes are appended below and the full append-only sequence is in `progress-ledger.md`.
- DFC-0 scope: docs-only foundation. Create the topic directory, place the v1.2 source contract there, and add only `progress-ledger.md` and `important-context.md`.
- DFC-0 does not implement production behavior and does not modify schema, Send Plan, UI, dependencies, test configuration, external engines, or production code.
- DFC-1 scope: read-only repository mapping against v1.2. No production code was changed.
- DFC-1 HEAD during mapping: `72cee48`.
- DFC-2 scope: implementation design memo only. No production code, schema, Send Plan, UI, IPC, tests, package files, dependencies, or conversion logic changed.
- DFC-2 memo file: `dfc-2-implementation-design-memo.md`.
- DFC-2 HEAD during memo creation: `72cee48`.
- DFC docs foundation and design memo were committed in DFC-2A as `2176a2a` with message `docs(file-conversion): establish DFC foundation and design memo`.
- DFC-3 scope: owner decision freeze before code. No production code, schema, Send Plan, UI, IPC, tests, package files, dependencies, or conversion logic changed.
- DFC-3 freeze file: `dfc-3-owner-decision-freeze.md`.
- DFC-3 was committed as `a52fc9c` with message `docs(file-conversion): freeze DFC implementation decisions`.
- DFC-4 scope: first code slice only. Added shared DFC TypeScript contracts, an unintegrated pure resolver scaffold, sanitized renderer DTO draft, and targeted tests. No DB schema, production Send Plan behavior, UI, IPC runtime, package files, dependencies, conversion implementation, Playwright harness, or migration bridge changed.
- DFC-4 files: `src/shared/files/documentFormatConversion.ts` and `src/shared/files/documentFormatConversion.test.ts`.
- DFC-4 was committed as `8fdd187` with message `feat(file-conversion): add DFC contracts and fallback guards`.
- DFC-5 scope: runtime boundary decision memo only. No production code, DB schema, Send Plan behavior, UI, IPC runtime, package files, dependencies, conversion implementation, Playwright harness, external engines, or migration bridge changed.
- DFC-5 memo file: `dfc-5-runtime-boundary-decision.md`.
- DFC-6 code commit: `985c53e` with message `feat(file-conversion): add DFC DTO boundary and asset facade`.
- DFC-6 safe implementation scope: additive sanitized DFC renderer DTO decoders/tests and strict DerivedAsset facade helper/tests only.
- DFC-6 owner blocker memo: `dfc-6-owner-memo-db-binding-migration.md`.
- DFC-6 stopped before DB migration and production Send Plan wiring because durable draft/message DFC binding requires schema changes.

## North-star goal

Connect Starverse to a complete document format conversion and preview system.

The final goal includes:

- Document contract
- TypeScript contract
- Production implementation
- Complete targeted tests
- Playwright smoke
- Privacy log scan

## Core contract facts from v1.2

- `original_file` is a first-class `targetKind`.
- `SendAssetRef` is the unified expression for `raw_file` and `derived_asset`.
- `selectedOptionId` drives sending.
- Preview and send must use the same source.
- `original_file` does not generate a `DerivedAsset`.
- Conversion cache and detection cache are separate.
- `DraftAttachment` stores `selectedOptionId` and `selectedAssetRefs`.
- `MessageAttachment` binds only the actual sent `usedOptionId` and `usedAssetRefs`.
- Send Plan judges compatibility by selected `targetKind`, not directly by the original file extension.
- Security boundaries take priority over free choice.

## Owner decisions

- The total Goal remains the complete document format conversion and preview system.
- Every round must stop and report after completion.
- Major path choices that require Owner decision must stop before implementation.
- DFC-0 is documentation preparation only.
- DFC-2 supersedes the earlier three-document topic directory limit by Owner request. The source contract remains the SSOT and the DFC-2 memo is a subordinate design record.
- Hybrid first version is not implemented.
- External engines are not introduced in DFC-0.
- DFC-2 freezes isolated replacement as the implementation strategy. Broad compatibility is rejected.
- New uploads, new drafts, and new send plans must use the DFC path once implementation begins.
- DFC authority is `ConversionOption`, `selectedOptionId`, `targetKind`, `SendAssetRef`, and `DerivedAsset`.
- `preferredSendMode`, `selectedSendMode`, `native_file`, `hybrid`, and `unsupported` are legacy quarantine vocabulary.
- No silent fallback is allowed for DFC-managed attachments.
- Any legacy bridge must be explicit, narrow, testable, removable, and must not act as invisible runtime fallback.
- DFC-3 freezes Phase 1 `selectedOptionId` ownership as draft-local authority.
- DFC-3 freezes `dfcManaged` as the boundary marker for new DFC attachments.
- DFC-3 freezes `original_file` as a first-class targetKind; `native_file` is legacy vocabulary only.
- DFC-3 freezes `hybrid` as deferred for the first version.
- DFC-3 freezes `unsupported` as state, error code, diagnostic, or legacy status, not a new DFC targetKind.
- DFC-3 freezes the Phase 1 binding requirement: draft attachments need `selectedOptionId`, `selectedAssetRefs`, and `dfcManaged`; message attachments need `usedOptionId`, `usedAssetRefs`, `targetKind`, and `sendStrategy` snapshot.
- DFC-3 freezes the preferred DerivedAsset path: first evaluate a facade over existing derivative and preview lineage, and stop for owner approval if a dedicated table is needed.
- DFC-3 freezes the privacy boundary: renderer DTOs must not expose real path, fileUrl, full hash, contentToken, file body, or raw storage refs.

## Stop conditions for future rounds

Stop and report before proceeding if any of the following are required:

- DB migration changes attachment, draft, message, raw asset, or derived asset semantics.
- `selectedOptionId` ownership has multiple viable designs.
- Send Plan needs broad replacement.
- The existing asset model cannot naturally express `raw_file` and `derived_asset`.
- Playwright smoke requires creating an E2E harness from scratch.
- The next step requires LibreOffice, Chromium, Pandoc, Ghostscript, or another external engine.
- The next step requires loosening renderer path isolation, shell execution, sandbox, macro or script handling, external resource handling, or log privacy boundaries.

## DFC-1 mapping recovery notes

- Raw uploaded-file semantics currently live under `file_assets` / `FileAssetRecord`, not a `RawFile` contract name.
- Existing derivative concepts include `file_derivatives`, `FileDerivativeRecord`, `derivative_jobs`, preview derivatives, and text-conversion lineage metadata.
- Draft attachment persistence currently stores `preferredSendMode`, `urlRetentionMode`, `includeInNextRequest`, and `excludedReason`; it does not yet store v1.2 `selectedOptionId` and `selectedAssetRefs`.
- Message attachment persistence currently binds sent assets, but does not explicitly store v1.2 `usedOptionId` and `usedAssetRefs`.
- Current Send Plan types use `native_file`, `hybrid`, and `unsupported`; `original_file` is not yet a first-class targetKind.
- Current selection vocabulary is `preferredSendMode` / `selectedSendMode`, not `selectedOptionId`.
- Existing send-plan lineage checks already compare preview/send hashes and conversion settings, which is a likely seam for preview/send same-source enforcement.
- Detection and conversion are represented separately through file-type verdicts and derivative jobs/assets, but the hard v1.2 cache boundary still needs verification in implementation design.
- Attachment UI seams exist in the composer attachment card/details dialog flow and `src/ui-app/AppChatApp.attachments.test.ts`; dedicated Playwright attachment-upload smoke was not found in DFC-1.
- Privacy review is required for IPC/message asset surfaces that expose `path`, `fileUrl`, and full `hash`.

## DFC-2 design recovery notes

- Phase 1 recommended `selectedOptionId` ownership is draft-local only.
- Later file-type or global defaults may seed a new draft default, but must never override an explicit draft-local `selectedOptionId`.
- `original_file` must be the first-class DFC targetKind for raw file sending; `native_file` remains legacy vocabulary only.
- `hybrid` is frozen and deferred. DFC Phase 1 must not generate hybrid options or tests.
- In DFC, `unsupported` should be represented as state or diagnostics, not as a targetKind.
- Durable v1.2 compliance likely requires a DB migration for `selectedOptionId`, `selectedAssetRefs`, `usedOptionId`, `usedAssetRefs`, and a DFC-managed marker.
- Recommended derived asset path is a DFC `DerivedAsset` TypeScript facade over existing `file_derivatives` if existing metadata can represent required semantics without ambiguity; otherwise stop for owner approval for a dedicated table.
- Privacy DTO remediation should happen before or as the first DFC implementation slice so renderer DTOs do not expose paths, file URLs, content tokens, file bodies, or full hashes.
- DFC Send Plan integration should be a narrow DFC resolver seam for DFC-managed attachments, not a broad replacement of legacy send-plan behavior.
- DFC-managed Send Plan must not call legacy selected-send-mode fallback when the selected DFC option is missing, stale, failed, incompatible, or unavailable.

## DFC-3 decision freeze recovery notes

- Phase 1 implementation order should be: TS contracts and DFC boundary types; sanitized DTO privacy boundary; DB migration or binding storage decision; Phase 1 option generation; DFC Send Plan resolver seam; preview/send same-source gate; targeted and no-silent-fallback tests; minimal Playwright smoke if an existing harness can support it.
- Phase 1 option generation scope is limited to `original_file`, `plain_text`, markdown passthrough, `code`, and CSV/TSV `table_markdown`.
- Explicitly deferred: XLSX/XLS, DOCX/DOC/RTF, PDF attachment implementation, HTML conversion, PS/EPS, external engines, and new dependencies unless the Owner approves them.
- Required fields for a `DerivedAsset` facade are `sourceHash`, `contentHash`, `targetKind`, `conversionSettingsHash`, `usage`, `storageClass`, `sourceFileId`, converter identity, and binding refs.
- Minimum DB migration fields if durable storage is required: `dfc_managed`, `selected_option_id`, `selected_asset_refs_json`, `used_option_id`, `used_asset_refs_json`, `target_kind`, and `send_strategy`.
- Ambiguous legacy records must become `needs_user_selection`, blocked, or legacy read-only. They must not be silently migrated.

## DFC-4 implementation recovery notes

- DFC contracts and scaffold live in `src/shared/files/documentFormatConversion.ts`.
- `DfcTargetKind` includes only `original_file`, `plain_text`, `markdown`, `code`, `table_markdown`, and `pdf_attachment`.
- `native_file`, `hybrid`, and `unsupported` are not DFC target kinds.
- `createDfcOriginalFileOption` emits `targetKind: 'original_file'`, `sendStrategy: 'file_attachment'`, and `SendAssetRef.kind: 'raw_file'`.
- `createDfcDerivedAssetOption` emits `SendAssetRef.kind: 'derived_asset'` for `plain_text`, `markdown`, `code`, `table_markdown`, and contract-only `pdf_attachment`.
- `resolveDfcManagedAttachment` is pure and not wired into production Send Plan. It resolves only from `selectedOptionId`, selected option state, targetKind, and asset refs.
- The resolver accepts legacy quarantine fields only as inert audit input and must not branch on `preferredSendMode`, `selectedSendMode`, `legacyTargetKind`, extension, or MIME.
- Missing, failed, stale, incompatible, unavailable, or asset-missing selected options return non-ready statuses with empty send refs. They do not silently fallback.
- `sanitizeDfcAttachmentForRenderer` is a DTO draft only. It omits path, fileUrl, full hash, contentToken, file body, and raw storage refs.
- Targeted test file: `src/shared/files/documentFormatConversion.test.ts`.
- DFC-4 validation: targeted Vitest passed. Repo-wide TypeScript check currently fails in unrelated UI Vue export typings at `src/ui-app/app/appChatApp.logic.ts:178-179`.
- Risk review found no P0/P1 issues for DFC-4.

## DFC-5 runtime boundary recovery notes

- Sanitized DTO recommendation: add a DFC-specific sanitized runtime DTO before renderer/UI consumes production DFC attachment data. Keep existing legacy DTOs stable at first.
- DFC renderer DTOs must omit `path`, `fileUrl`, `storageUri`, raw storage refs, `contentToken`, file body/body snippets, full `sha256`, full lineage hashes, and raw `sourceMetaJson` / derivative `metaJson`.
- `DecodedFileAsset`, `DecodedFileDerivative`, `DecodedMessageAsset`, and Send Plan lineage decode surfaces currently expose sensitive or internal fields and must not become the DFC renderer DTO.
- DerivedAsset recommendation: use a strict facade over `file_derivatives` for Phase 1 if DFC metadata is required and validated in `meta_json`.
- DerivedAsset facade mapping: derivative id as asset id, `parent_asset_id` as source file id, `meta_json.targetKind`, `meta_json.contentHash`, `meta_json.sourceHash`, required `meta_json.conversionSettingsHash`, `meta_json.usage`, `meta_json.storageClass`, structured converter identity, and binding refs derived from draft/message binding rows.
- Dedicated DerivedAsset table remains deferred and owner-approval-required unless the facade cannot prove same-source or durable binding semantics.
- DB binding recommendation: explicit columns on existing attachment tables, not metadata-only or sidecar as the first choice.
- Recommended draft fields: `dfc_managed`, `selected_option_id`, `selected_asset_refs_json`.
- Recommended message fields: `used_option_id`, `used_asset_refs_json`, `target_kind`, `send_strategy`.
- Legacy rows remain `dfc_managed = 0`; no automatic legacy migration bridge is included.
- Legacy quarantine enforcement should be a narrow `SendPlanService` DFC branch before legacy mode selection. DFC-managed code must not call `selectAttachmentSendModeInternal`.
- DFC-6 is ready only as an owner-approved narrow production slice for sanitized DFC runtime DTOs and privacy tests. DB migration and Send Plan wiring still require separate owner approval.

## DFC-6 implementation and blocker recovery notes

- DFC sanitized renderer decoders now exist in `src/next/ipc/contracts/dbBridgeContracts.ts`:
  - `decodeDfcAttachmentDtoResponse`
  - `decodeDfcAttachmentDtoListResponse`
  - `decodeDfcFileAssetResponse`
  - `decodeDfcFileAssetListResponse`
  - `decodeDfcFileDerivativeResponse`
  - `decodeDfcFileDerivativeListResponse`
- These decoders are additive and not wired into UI, Send Plan, or DB runtime channels.
- DFC DTO tests prove the sanitized DFC renderer surfaces omit path-like fields, `fileUrl`, full hash fields, `contentToken`, file body, storage refs, raw `sourceMetaJson`, raw derivative `metaJson`, `storageUri`, and raw generator fields.
- `createDfcDerivedAssetFacade` now validates a `file_derivatives`-style record as a DFC DerivedAsset facade.
- The facade requires ready status, storage ref, `sourceHash`, `contentHash`, DFC derived `targetKind`, `conversionSettingsHash`, `usage`, `storageClass`, and converter identity.
- The facade rejects `original_file` because `original_file` must use `raw_file` and must not create `DerivedAsset`.
- Risk review found no P0/P1 issues in the additive DFC DTO/facade diff.
- Targeted Vitest passed for `src/shared/files/documentFormatConversion.test.ts` and `src/next/ipc/contracts/dbBridgeContracts.test.ts`.
- Project typecheck still fails in unrelated UI Vue export typing at `src/ui-app/app/appChatApp.logic.ts:178-179`.
- Durable Phase 1 cannot proceed into Send Plan wiring without a DB binding migration. Current draft/message attachment tables do not persist `dfcManaged`, `selectedOptionId`, `selectedAssetRefs`, `usedOptionId`, `usedAssetRefs`, `targetKind`, or `sendStrategy`.
- Recommended DB binding path is explicit columns on existing `draft_attachments` and `message_attachments`, with legacy rows defaulting to `dfc_managed = 0`.
- Do not emulate durable DFC binding in memory, in Send Plan metadata, or by reading legacy fields; that would violate draft-local selectedOptionId and no-silent-fallback requirements.

## Recommended next round

## DFC-7 implementation recovery notes

- Owner approved a destructive dev migration for attachment-related data because Starverse has no published install package and historical attachment/draft/message attachment data does not need preservation.
- DFC-7 adds explicit columns on existing attachment tables:
  - `draft_attachments`: `dfc_managed`, `selected_option_id`, `selected_asset_refs_json`.
  - `message_attachments`: `dfc_managed`, `used_option_id`, `used_asset_refs_json`, `target_kind`, `send_strategy`.
- The destructive migration is attachment-table scoped. If a legacy table lacks DFC binding columns, only that table is cleared before its columns are added. Unrelated conversations, messages, file assets, and already-DFC-capable attachment tables are preserved.
- The DFC schema upgrade is wrapped in a transaction so table clearing and column addition complete or roll back together.
- Legacy columns such as `preferred_send_mode` and `url_retention_mode` remain physically present for now, but DFC-managed draft writes clear them and DFC-managed repo reads ignore them.
- DFC-managed repo writes require at least one `SendAssetRef`. Empty, missing, malformed, or shape-invalid selected/used asset refs must throw rather than silently becoming an empty binding.
- Legacy rows remain `dfc_managed = 0` and read DFC refs as empty/inert. They are not treated as DFC-managed unless explicitly created that way.
- Draft-to-message persistence currently snapshots `dfcManaged`, `selectedOptionId` to `usedOptionId`, and selected refs to used refs. `targetKind` and `sendStrategy` remain nullable until the future Send Plan seam supplies the actual selected option snapshot.
- DFC-7 does not wire production Send Plan, UI, conversion runtime, CSV/TSV parsing, Playwright harness, dependencies, external engines, a dedicated DerivedAsset table, or a legacy migration bridge.
- Risk review during DFC-7 found and drove fixes for two classes of P1 risk:
  - mixed-schema destructive migration originally cleared both attachment tables; fixed to clear only the affected table.
  - malformed and empty DFC asset refs could silently collapse to empty bindings; fixed so DFC-managed rows fail instead.
- Local targeted Vitest after these fixes passed for migration, repo, service, worker, and DFC contract tests. Project typecheck still fails in unrelated `src/ui-app/app/appChatApp.logic.ts` Vue named-export typings.

## Recommended next round

DFC-8 should be an owner-approved, narrow selectedOptionId-driven Send Plan seam round.

Recommended DFC-8 scope:

- Read only DFC-managed persisted fields (`dfc_managed`, `selected_option_id`, `selected_asset_refs_json`) plus DFC `ConversionOption` data.
- Resolve send decisions through the DFC resolver and selected `targetKind` / `SendAssetRef`.
- Keep legacy Send Plan quarantined for non-DFC rows only.
- Add no-silent-fallback tests around missing, failed, stale, incompatible, unavailable, and missing-asset selected options.
- Do not implement UI, conversion runtime, new dependencies, external engines, Playwright harness creation, or legacy migration bridge in the Send Plan seam round unless separately approved.

Do not wire broad Send Plan replacement, UI consumption, conversion runtime, dependencies, external engines, or legacy migration bridge without separate Owner approval.

## DFC-8R0 read-only mapping recovery notes

- Current HEAD during this mapping round: `6eacf67` (`feat(file-conversion): persist DFC attachment bindings`).
- Worktree was clean before this round appended ledger/context notes.
- DFC v1.2 contract remains unchanged and remains the SSOT.
- Current code already has shared DFC target kinds and `SendAssetRef` helpers in `src/shared/files/documentFormatConversion.ts`.
- Current DB schema already has DFC binding columns for draft and message attachments.
- Structural cache separation exists: detection data is in `file_type_verdicts`; conversion/preview data is in `file_derivatives` and `derivative_jobs`.
- The next implementation seam remains production Send Plan, not schema. `infra/files/sendPlanService.ts` still derives planner semantics from route candidates and legacy mode selection instead of first resolving persisted `selectedOptionId`.
- `semanticFromRoute()` and `selectAttachmentSendModeInternal()` are legacy seams that must remain quarantined for non-DFC rows in the next round.
- Preview/send lineage checks already exist in `evaluateAttachmentLineageGuard()`, but need to be applied from selected DFC option / asset refs rather than route-derived semantics.
- `ConversationAttachmentService.createMessageAttachmentFromDraft()` currently snapshots `usedOptionId` and `usedAssetRefs`, but leaves message `targetKind` and `sendStrategy` nullable until the Send Plan seam supplies the selected option snapshot.
- DFC renderer DTO sanitization exists, but mixed legacy DTO surfaces and lineage hash fields should not be treated as the final DFC UI privacy boundary without review.
- Playwright smoke for the v1.2 attachment flow was not verified in this mapping round.

## DFC-8 implementation recovery notes

- DFC-8 wires a narrow production Send Plan seam for DFC-managed draft attachments only.
- Shared Send Plan semantics now include `original_file` and `SendPlanAttachment.sendAssetRefs`.
- `SendPlanService.collectCurrentSendInputs()` now carries `dfcManaged`, `selectedOptionId`, `selectedAssetRefs`, and a DFC resolver decision for draft attachments.
- DFC-managed draft planning checks the DFC selected-option decision before legacy send-mode selection. Missing, failed, stale, unavailable, incompatible, or mismatched selected refs block instead of silently falling back.
- `original_file` is resolved from a selected `raw_file` ref and uses file attachment compatibility. It does not create or require a `DerivedAsset`.
- Selected derived text/table/code/markdown refs are resolved from existing `file_derivatives` metadata, or existing text-conversion lineage metadata only when a derivative repo is not available. The runtime passes `fileDerivativeRepo`.
- The Send Plan IPC decoder accepts `original_file` and optional `sendAssetRefs`.
- DFC-8 does not create durable `ConversionOption` rows. It reconstructs the selected option from persisted refs plus derivative metadata for the narrow Phase 1 seam.
- `optionGenerationState` is not persisted yet; missing selection and pending generation are still coarse in production Send Plan decisions.
- `MessageAttachment.targetKind` and `sendStrategy` still need a future send/commit-time snapshot seam. DFC-8 does not update message snapshot persistence.
- DFC-8 does not implement UI option selection, conversion runtime beyond existing text derivative metadata, Playwright smoke, external engines, new dependencies, or legacy migration bridge.
- Validation after `npm run rebuild:node` passed for the targeted DFC Send Plan, DFC contract, IPC decoder, OpenRouter serializer, and worker file-pipeline suites. Full project typecheck still fails only at the pre-existing Vue named-export issue in `src/ui-app/app/appChatApp.logic.ts`.

## Recommended next round

DFC-9 should bind successful DFC send snapshots into `MessageAttachment.targetKind` and `sendStrategy`, using a narrow send/commit-time seam if available. Stop for an owner memo if the current send pipeline cannot supply the selected Send Plan attachment snapshot without broad replacement.

## DFC-9 implementation recovery notes

- DFC-9 adds `DfcAttachmentSendSnapshot` to the shared DFC contract. The snapshot is attachment-id keyed and carries `assetId`, selected `targetKind`, selected `sendStrategy`, and the actual `sendAssetRefs`.
- The normal composer send path now collects DFC snapshots from included draft `SendPlanAttachment` rows and forwards them through `beginTurn` into `conversationAttachmentService.attachDraftToMessage()`.
- The edit-draft attach path also forwards snapshots from the edit preflight Send Plan, along with the included sent asset ids.
- Worker validation accepts `dfcAttachmentSendSnapshots` on `branch.beginTurn`, `conversationDraft.commitToUserMessage`, and `conversationDraft.attachToMessage`.
- `ConversationAttachmentService` validates a snapshot before persisting message semantics:
  - snapshot attachment id must match the draft attachment row;
  - snapshot asset id must match the draft raw asset id;
  - snapshot `sendAssetRefs` must match the draft `selectedAssetRefs`;
  - `original_file` must use one matching `raw_file` ref and `file_attachment`;
  - `pdf_attachment` must use derived refs and `file_attachment`;
  - text targets must use derived refs and `text_in_prompt`.
- When the snapshot is valid, message rows store `targetKind` and `sendStrategy` along with the existing `usedOptionId` and `usedAssetRefs`.
- For backward compatibility, service callers that omit `dfcAttachmentSendSnapshots` still create DFC message rows with nullable `targetKind` and `sendStrategy`; this preserves older direct call sites and tests, but the production send flow now supplies snapshots.
- Risk review found and DFC-9 fixed a P1 send-integrity issue: DFC `original_file` text attachments could use a ready converted-text payload in OpenRouter serialization. The serializer now skips converted-text reads for `semantic.targetKind === 'original_file'`, including the local-file-missing converted fallback.
- DFC-9 adds a serializer regression proving that a DFC `original_file` text attachment with a ready converted derivative sends raw text, not the converted markdown.
- DFC-9 does not add DB schema, durable `ConversionOption` rows, persisted option-generation state, UI option selection, Playwright smoke, conversion runtime expansion, dependencies, external engines, or a legacy migration bridge.
- Validation after `npm run rebuild:node` passed for the focused DFC send snapshot, Send Plan, contract, IPC decoder, worker, and OpenRouter serializer suites. Full project typecheck still fails only at the pre-existing Vue named-export issue in `src/ui-app/app/appChatApp.logic.ts`.

## Recommended next round

DFC-10 should start the minimal Phase 1 UI bridge: expose DFC option selection and preview state through sanitized DFC DTOs and the existing Attachment Shelf / Detail Inspector seams. If the existing UI or Playwright harness cannot cover the required v1.2 smoke without new framework work, stop with a feasibility/owner memo before implementation.

## DFC-10 UI and Playwright feasibility recovery notes

- DFC-10 stopped before production implementation and added `docs/file-pipeline/document-format-conversion/dfc-10-ui-playwright-feasibility-owner-memo.md`.
- Existing composer attachment UI seams are `src/ui-app/AppChatApp.vue`, `src/ui-app/components/DraftAttachmentStrip.vue`, `src/ui-app/components/DraftAttachmentCard.vue`, `src/ui-app/components/DraftAttachmentDetailsDialog.vue`, and `src/ui-app/app/appChatApp.logic.ts`.
- The current details dialog exposes legacy `preferredSendMode` and `urlRetentionMode`; it has no DFC option picker and no `selectedOptionId` update event.
- Existing DB/service binding can store DFC-managed draft `selectedOptionId` and `selectedAssetRefs`, but `src/next/files/conversationDraftClient.ts` still exposes only legacy draft setting fields to renderer code.
- Sanitized DFC DTO helpers and IPC decoders exist, but there is no backend-owned draft option-candidate endpoint for the composer UI.
- DFC-8 reconstructs the selected option from persisted refs and derivative metadata. The repo still has no durable `ConversionOption` rows or complete option list source.
- Do not implement a renderer-inferred option picker from current Send Plan rows alone; that would risk inventing option identity and alternatives outside the DFC contract.
- Existing `tests/e2e` files are Vitest fixture/component smoke tests. No root `playwright.config.*` or browser-driven attachment-upload smoke was found.
- Adding a real Playwright smoke for upload, shelf/chip, inspector/detail flow, option selection, preview visibility, removal, and send gating requires owner approval for new browser harness scaffolding.

## Recommended next round

DFC-11 should be an owner-approved backend-owned DFC draft option DTO and selected-option update contract round:

- Define a sanitized DFC draft option DTO from backend-owned state.
- Build the DTO from persisted DFC binding, raw asset, eligible derived assets, and current compatibility/send-plan state.
- Expose a narrow IPC/client read method for the composer detail inspector.
- Extend draft setting updates to accept `selectedOptionId` and `selectedAssetRefs` only after the DTO contract is defined.
- Add targeted contract/privacy/no-silent-fallback tests.
- Do not add visible UI option controls, Playwright scaffolding, dependencies, external engines, broad Send Plan replacement, conversion runtime expansion, or legacy migration in the same round unless separately approved.

## DFC-11R0 owner-gate revalidation notes

- A follow-up read-only mapping found no safe production implementation slice that can advance DFC-11 without the DFC-10 owner approvals.
- The current safe work without approval is limited to documentation or characterization tests around existing behavior. That does not implement the required backend-owned DFC draft option DTO/update contract.
- `conversationDraft.updateAttachmentSettings` already reaches backend validation/repo code that can accept DFC binding fields, but the renderer client remains legacy-shaped and there is no owner-approved DFC option-candidate DTO source for UI selection.
- `SendPlanService` already treats DFC-selected refs as authoritative and can block incoherent selections, so a partial renderer update path without the owned candidate DTO risks invalid or stale selections.
- Do not proceed into DFC option DTO, selected-option update contract, visible UI picker, or Playwright harness scaffolding until owner approval is explicit.

## DFC-11R1 blocked-audit recovery notes

- The same owner gate has repeated across three consecutive goal rounds: DFC-10, DFC-11R0, and DFC-11R1.
- No explicit owner approval is recorded for implementing the backend-owned DFC draft option DTO/update contract.
- No explicit owner approval is recorded for creating browser Playwright harness scaffolding.
- Further production implementation is blocked until owner approval is provided or the owner chooses a different contract path.
- After approval, resume at DFC-11 with the backend-owned sanitized DFC draft option DTO endpoint and selected-option update contract. Keep visible UI picker and Playwright harness for later bounded rounds unless they are separately approved.

## DFC-11 implementation recovery notes

- Owner approval for the backend-owned DFC draft option DTO endpoint and selected-option update contract was granted in-thread before implementation resumed.
- Before DFC-11 work, the coherent recovered DFC-8/9 production and DFC-10/11 docs diff was validated and committed as `0f40a84` with message `feat(file-conversion): wire DFC send plan snapshots`.
- `conversationDraft.getDfcOptions` is now the backend-owned draft option DTO seam. It is registered in the DB method registry, validated in the worker, implemented in `ConversationAttachmentService`, decoded in `dbBridgeContracts`, and wrapped by `getConversationDraftAttachmentDfcOptions()`.
- The DTO includes attachment id, conversation id, raw file id, filename, size, `dfcManaged`, current selected option id/asset refs, DFC resolver decision, and option candidates. It intentionally excludes paths, file URLs, storage URIs, source metadata, derivative metadata, content tokens, file bodies, and hash fields.
- Backend option candidates come from the raw file `original_file` option plus eligible `file_derivatives.meta_json.targetKind` records, with an existing `sourceMetaJson.textConversion` fallback only when it identifies a specific derived asset not already represented by a derivative row.
- `original_file` uses a `raw_file` `SendAssetRef` and does not create a `DerivedAsset`.
- Derived options use `derived_asset` refs and target-kind-derived send strategies. Failed, stale, pending, blocked, unavailable, or incompatible options remain represented through DFC decision/status instead of falling back to legacy send modes.
- `conversationDraft.updateAttachmentSettings` now validates DFC selection updates against backend-built option candidates. A renderer-invented `selectedOptionId`, mismatched `selectedAssetRefs`, malformed refs, or selected refs without a selected option must fail rather than silently route through legacy fields.
- A DFC-11 risk review found an initial P1 where option ids could be preserved from prior persisted state. The fix makes option ids canonical backend-generated values and leaves preexisting non-canonical selections as `needs_user_selection` / `selected_option_not_found` until updated with a backend-issued option id.
- The renderer client can send `dfcManaged`, `selectedOptionId`, and `selectedAssetRefs` through the update contract, but visible UI picker work remains deferred.
- Existing draft/message binding columns are reused; no DB migration was needed in DFC-11.
- Validation after `npm run rebuild:node` passed for the focused DFC service, worker, IPC contract, renderer client, shared contract, Send Plan, and OpenRouter serializer suites. Full project typecheck still fails only at the pre-existing Vue named-export issue in `src/ui-app/app/appChatApp.logic.ts`.

## Recommended next round

DFC-12 should wire the existing attachment detail UI to the backend-owned DFC draft option DTO and selected-option update contract, without introducing a new Playwright harness unless the owner separately approves that harness work.

## DFC-12 implementation recovery notes

- DFC-12 is a narrow UI-plumbing slice over the existing attachment detail dialog, not a broad UI redesign.
- `src/ui-app/app/appChatApp.logic.ts` now fetches `conversationDraft.getDfcOptions` when a draft attachment detail dialog is opened and keeps DFC option DTO state separate from send-plan state.
- `DraftAttachmentDetailsDialog.vue` renders a small Format section from backend-owned option candidates only. It does not infer target kind, selected option identity, or `SendAssetRef` in the renderer.
- Selecting an option emits the backend option id back to app logic; app logic looks up the matching DTO option and persists `dfcManaged: true`, `selectedOptionId`, and the exact backend-provided `selectedAssetRefs` through `conversationDraft.updateAttachmentSettings`.
- The UI test harness now mocks `conversationDraft.getDfcOptions` and verifies that selecting a Markdown option sends the backend-owned `selectedOptionId` and `selectedAssetRefs`.
- DFC-12 does not add a Playwright harness, full Attachment Detail Inspector redesign, conversion runtime expansion, durable ConversionOption rows, persisted option-generation state, new dependencies, external engines, legacy bridge, or broad Send Plan replacement.
- Validation passed for the UI attachment/client tests and the focused backend/contract/send-plan suites. Full project typecheck still fails only at the pre-existing Vue named-export issue in `src/ui-app/app/appChatApp.logic.ts`.

## Recommended next round

DFC-13 should either add owner-approved browser smoke coverage for the upload/shelf/detail/option/preview/remove/send-gating flow, or continue backend preview/send coherence wiring if Playwright harness approval is still deferred.

## DFC-13 implementation recovery notes

- DFC-13 is a backend-only preview/send coherence tightening slice; it does not add a browser Playwright harness or a renderer-visible selected-option preview DTO.
- `ConversationAttachmentService` now evaluates derived option candidates through the DFC `DerivedAsset` facade. Malformed ready derivatives and `usage: preview_only` derivatives remain visible as unavailable/backend-owned candidates with sanitized diagnostics, rather than becoming selectable send options.
- `SendPlanService` now computes DFC-managed lineage from selected `SendAssetRef` records and `file_derivatives`, not from raw asset lineage metadata. Selected derived refs can block as preview-only, missing, deleted/stale, malformed/not-ready, or lineage-mismatched.
- DFC-managed Send Plan lineage summaries intentionally redact `sourceHash`, `previewContentHash`, `sendContentHash`, and `conversionSettingsHash` to `null` before they cross the IPC DTO boundary.
- A DFC-13 risk review found a P1 where non-ready DFC decisions could still fall back to raw asset lineage hashes. The fix makes every DFC-managed attachment use explicit DFC lineage or a redacted unknown lineage summary, and tests seed raw hash fields to prove they do not leak.
- Validation passed for focused service tests and the broader targeted worker/contract/client/shared/serializer/UI suite. Full project typecheck still fails only at the pre-existing Vue named-export issue in `src/ui-app/app/appChatApp.logic.ts`.

## Recommended next round

DFC-14 should decide between two owner-level paths:
- Add a backend-owned selected-option preview DTO/API so renderer-visible preview is driven by the same selected option and `SendAssetRef` authority as send.
- Or obtain owner approval for new browser smoke harness work covering upload, shelf/chip, detail flow, option selection, preview visibility, removal, and send gating.

## DFC-14 implementation recovery notes

- DFC-14 implements the backend-owned selected-option preview DTO/API path; it does not add a new browser Playwright harness.
- `conversationDraft.getDfcPreview` is now registered in the DB method registry, validated in the worker, implemented in `ConversationAttachmentService`, decoded in `dbBridgeContracts`, and wrapped by `getConversationDraftAttachmentDfcPreview()`.
- The preview DTO includes attachment identity, raw file id, filename, size, DFC selection state, resolver decision, and an explicit preview payload. It intentionally excludes paths, file URLs, storage URIs, storage refs, content tokens, raw file body, raw derivative metadata, and full hash fields.
- `original_file` preview is metadata-only and uses the selected `raw_file` ref; it does not generate or read a `DerivedAsset`.
- Phase 1 text targets (`plain_text`, `markdown`, `code`, `table_markdown`) read capped preview text only from the selected `derived_asset` ref after the DFC `DerivedAsset` facade validates the selected asset as `preview_and_send`.
- If persisted `selectedOptionId` and `selectedAssetRefs` disagree, preview returns a blocked `dfc_selection_refs_mismatch` diagnostic before reading selected derivative content, and message binding also throws instead of sending a different ref.
- A DFC-14 risk review initially found the selected-option/ref mismatch as a P1. The fix made preview and message binding share backend DFC selection authority; follow-up risk review passed.
- Validation passed for focused DFC service/worker/IPC/client/shared tests and the broader send-plan/serializer/UI suite. Full project typecheck still fails only at the pre-existing Vue named-export issue in `src/ui-app/app/appChatApp.logic.ts`.

## Recommended next round

DFC-15 should wire the existing attachment details dialog to display the selected-option preview DTO if it remains a small local extension. Browser Playwright smoke still requires owner approval if it needs a new harness.

## DFC-15 implementation recovery notes

- DFC-15 is a narrow existing-dialog preview display slice; it does not add a full Attachment Detail Inspector, browser Playwright harness, broad UI redesign, backend conversion runtime, new dependency, external engine, legacy bridge, or broad Send Plan replacement.
- `src/ui-app/app/appChatApp.logic.ts` now calls `conversationDraft.getDfcPreview` when the draft attachment details dialog opens, when the selected attachment survives a draft refresh, and after a backend-owned DFC option selection update.
- DFC preview DTO state is cached separately from DFC option DTO state and composer Send Plan state.
- The renderer sends only `conversationId`, `assetId`, and `maxCharacters` to the preview endpoint. It does not invent or persist `selectedOptionId`, target kind, `SendAssetRef`, `raw_file`, or `derived_asset` semantics for preview.
- `DraftAttachmentDetailsDialog.vue` renders backend-provided preview status, target kind, send strategy, capped text preview, raw-file selected state, and diagnostic codes. It does not render backend option ids, selected asset refs, storage refs, storage URIs, file URLs, content tokens, raw file bodies, or full hashes.
- The UI attachment test now mocks `conversationDraft.getDfcPreview` and verifies that selecting the backend-owned Markdown option also loads and displays the selected-option preview text.
- Validation after `npm run rebuild:node` passed for the focused UI/client/IPC suite and the focused backend/send-plan/shared suite. Full project typecheck still fails only at the pre-existing Vue named-export issue in `src/ui-app/app/appChatApp.logic.ts`.
- Risk review found no P0/P1 issues for DFC authority, stale preview state, privacy/log exposure, or missing targeted tests.

## Superseded DFC-16 recommendation

The following recommendation was the active next-step guidance after DFC-15 and was superseded by the DFC-16 implementation notes below:

- Obtain owner approval for new browser Playwright harness scaffolding, then implement the required upload, shelf/chip, detail flow, option selection, preview visibility, removal, and send-gating smoke.
- Or continue a non-harness backend conversion/runtime slice that remains within Phase 1 and avoids XLSX/Office/PDF/HTML/PS-EPS, new dependencies, external engines, legacy compatibility, broad UI redesign, and broad Send Plan replacement.

## DFC-16 implementation recovery notes

- DFC-16 is a backend/runtime and privacy-boundary slice; it does not add a browser Playwright harness, new dependency, external engine, UI redesign, legacy bridge, broad Send Plan replacement, or forbidden conversion family runtime.
- The existing worker `sendPlan.buildCurrent` bridge now backfills DFC facade metadata onto ready `extracted_text` derivatives for allowed Phase 1 text-like assets: plain text, Markdown, source-code text, CSV, and TSV.
- HTML, PS/EPS, PDF, Office, XLS, and XLSX assets are explicitly excluded from the new DFC metadata backfill. This keeps those families pending a separate owner-approved runtime plan.
- The bridge writes DFC metadata only when a source hash is available and keeps using the existing `file_derivatives` facade; no DB schema or durable `ConversionOption` rows were added.
- DFC options can now expose a generated CSV/TSV `table_markdown` derivative as an available backend-owned derived option after the existing send-plan worker path has generated or rechecked the `extracted_text` derivative.
- A risk review found an initial P1: internal DFC metadata written into `file_derivatives.meta_json` and `file_assets.source_meta_json` could leak through generic renderer raw asset/derivative decoders.
- The fix keeps private parser schemas for backend-owned DFC sanitizers, but public raw `fileAsset` / `fileDerivative` IPC decoders now redact top-level full hashes and private JSON metadata inside `sourceMetaJson` / `metaJson`, including `textConversion`, `lineage`, storage refs, content tokens, file bodies, hash fields, converter identity, and path-like metadata.
- Follow-up risk review passed with no P0/P1 findings. Targeted worker, service, IPC contract, renderer client, shared contract, and attachment UI tests passed. Full project typecheck still fails only at the pre-existing Vue named-export issue in `src/ui-app/app/appChatApp.logic.ts`.

## Recommended next round

DFC-17 should choose one of two owner-level paths:

- Obtain owner approval for new browser Playwright harness scaffolding, then implement the required upload, shelf/chip, detail flow, option selection, preview visibility, removal, and send-gating smoke.
- Or make an explicit owner decision on conversion option generation timing before adding upload/open-triggered generation, because DFC-16 only makes derivatives DFC-ready after the existing send-plan worker path runs.

## DFC-17 owner memo recovery notes

- DFC-17 added `docs/file-pipeline/document-format-conversion/dfc-17-owner-memo-generation-trigger.md` and stopped before production implementation.
- Current backend-owned DFC option and preview plumbing is live: `conversationDraft.getDfcOptions`, `conversationDraft.getDfcPreview`, and validated `conversationDraft.updateAttachmentSettings`.
- Current UI plumbing is live in the existing draft attachment details dialog and does not infer option identity in the renderer.
- Current DFC-ready derivative generation is still triggered by the worker `sendPlan.buildCurrent` path through `ensureTextDerivativesForCollected` / `ensureTextDerivativeAsset`, not upload or attachment details open.
- No `playwright.config.*` or `@playwright/test` harness was found. Existing `tests/e2e` files are Vitest-based smoke tests.
- Owner approval is required before implementing either a new explicit `conversationDraft.ensureDfcOptions` generation contract or browser Playwright harness scaffolding.
- Recommended next implementation, if approved, is an explicit backend-owned `conversationDraft.ensureDfcOptions` endpoint limited to already-approved Phase 1 text-like conversions. Keep `getDfcOptions` read-only, keep renderer requests free of targetKind/refs/option ids, and keep HTML, PS/EPS, PDF, Office, XLS/XLSX, external engines, and new dependencies out of scope.

## DFC-17R0 blocked revalidation notes

- Worktree recovery revalidated a clean tree at `26adca2` on branch `docs/dfc-0-format-conversion-foundation`.
- A read-only `code_mapper` recheck confirmed `conversationDraft.getDfcOptions`, `conversationDraft.getDfcPreview`, and `conversationDraft.updateAttachmentSettings` remain the live backend-owned DFC DTO/update plumbing.
- DFC-ready text derivative generation remains coupled to the worker `sendPlan.buildCurrent` path through `ensureTextDerivativesForCollected` / `ensureTextDerivativeAsset`.
- `conversationDraft.ensureDfcOptions` is still only proposed in the DFC-17 memo; it is not implemented and repo docs do not record owner approval for Option D.
- No `playwright.config.*` or `@playwright/test` browser harness exists; `tests/e2e` remains Vitest-based smoke coverage.
- No safe next implementation slice was found that avoids choosing an owner-level option-generation trigger or adding new Playwright harness scaffolding.
- Owner approval remains required for either explicit `conversationDraft.ensureDfcOptions` generation semantics or new browser Playwright harness scaffolding.

## DFC-17R1 blocked audit closure notes

- Worktree recovery revalidated a clean tree at `3d04d1e` on branch `docs/dfc-0-format-conversion-foundation`.
- The same owner-level stop condition has now repeated across DFC-17, DFC-17R0, and DFC-17R1.
- Current production state still has backend-owned `conversationDraft.getDfcOptions`, `conversationDraft.getDfcPreview`, and `conversationDraft.updateAttachmentSettings`, but no implemented `conversationDraft.ensureDfcOptions` generation contract.
- DFC-ready text derivative generation is still triggered by `sendPlan.buildCurrent`; moving it to upload, attachment-detail open, or an explicit ensure endpoint would choose generation lifecycle semantics.
- No browser Playwright harness exists to extend; adding one would create new harness scaffolding.
- Continue only after owner approval for one of the two blocked paths: explicit `conversationDraft.ensureDfcOptions` generation semantics, or new browser Playwright harness scaffolding.

## DFC-18 implementation recovery notes

- Owner approval for the explicit backend-owned DFC option generation path was granted in-thread after the DFC-17 blocked audit closure.
- `conversationDraft.ensureDfcOptions` is now registered in the DB method registry, validated in the worker, exposed through the renderer client, and decoded through the same sanitized DFC draft options DTO schema as `conversationDraft.getDfcOptions`.
- The ensure request accepts only `conversationId` and `assetId`. The renderer cannot supply target kind, option id, `raw_file`, `derived_asset`, or `SendAssetRef` semantics.
- The worker ensure handler verifies the draft attachment through the existing backend-owned option DTO seam, then generates DFC-ready text derivatives only for stored local Phase 1 text-like assets: plain text, Markdown, code, CSV, and TSV.
- Explicit ensure generation reuses the existing DFC `file_derivatives` facade and source metadata backfill. It does not add a DB migration, durable `ConversionOption` rows, new dependencies, external engines, browser Playwright harness, UI redesign, broad Send Plan rewrite, or forbidden runtime families.
- PDF, Office, XLS/XLSX, HTML, PS/EPS, non-local URL-backed assets, and unsupported assets do not get new Phase 1 derivatives from this endpoint.
- Generated derived options use canonical backend option ids and exact backend-owned `derived_asset` refs; `original_file` remains a `raw_file` option and does not generate a `DerivedAsset`.
- Targeted worker, IPC contract, client, DFC service, Send Plan, shared contract, and registry tests passed. Full repo typecheck still fails only at the pre-existing Vue named-export issue in `src/ui-app/app/appChatApp.logic.ts`.

## DFC-19 implementation recovery notes

- DFC-19 is a narrow existing-dialog plumbing slice; it does not add a browser Playwright harness, full Attachment Detail Inspector, broad UI redesign, DB schema, backend conversion runtime, new dependency, external engine, legacy bridge, broad Send Plan replacement, or forbidden conversion family runtime.
- This UI plumbing builds on the already owner-approved DFC-18 `conversationDraft.ensureDfcOptions` endpoint; it does not create a new option-generation contract.
- The existing draft attachment details option refresh now calls `conversationDraft.ensureDfcOptions` through `ensureConversationDraftAttachmentDfcOptions()` instead of calling the read-only `conversationDraft.getDfcOptions` path directly.
- The renderer ensure request sends only `conversationId` and `assetId`. It still does not invent target kind, option ids, `selectedOptionId`, `selectedAssetRefs`, `SendAssetRef`, `raw_file`, or `derived_asset` semantics.
- Backend-owned option identity and exact backend-provided asset refs remain authoritative. Selecting an option still persists the option id and refs from the sanitized backend DTO options already loaded into the details flow.
- Targeted UI/client/IPC tests, combined DFC backend/client/UI tests, `vue-tsc`, `git diff --check`, privacy scans, and risk review passed. Browser Playwright/Electron smoke remains deferred because new harness scaffolding is outside this slice.

## Recommended next round

DFC-20 should close remaining non-Playwright Phase 1 generation gaps, likely by removing or quarantining the backend `sendPlan.buildCurrent` lazy DFC-generation fallback where explicit ensure-driven readiness can replace it safely. Browser Playwright smoke still requires separate owner approval if it needs new harness scaffolding.

## DFC-20 implementation recovery notes

- DFC-20 is a narrow worker quarantine slice; it does not add a DB schema change, IPC contract change, renderer option identity, browser Playwright harness, UI redesign, new dependency, external engine, legacy bridge, broad Send Plan rewrite, durable `ConversionOption` rows, async option-generation state, or forbidden conversion family runtime.
- Worker Send Plan paths still call the existing text derivative job path for legacy/non-DFC text sendability, but they pass `exposeDfcOption: false`.
- With `exposeDfcOption: false`, the worker preserves legacy lineage fields such as `sendAssetReady` and `sendTextStorageUri`, but does not stamp or replace the DFC `textConversion` facade metadata that backend option DTOs require before a derived option is available.
- Existing coherent DFC-ready `textConversion` metadata for the same derivative is preserved if a later Send Plan build rechecks the asset, so explicit ensure results are not stripped by normal send-plan refresh.
- The explicit `conversationDraft.ensureDfcOptions` path passes `exposeDfcOption: true` and remains the backend-owned path that makes approved Phase 1 text-like derivatives available as DFC options.
- `infra/db/worker.filePipeline.test.ts` now proves that `sendPlan.buildCurrent` can create the CSV text derivative and legacy lineage without making the `table_markdown` DFC option available, that explicit `conversationDraft.ensureDfcOptions` then makes the same backend-owned option available, and that a later Send Plan refresh preserves the explicit DFC facade.
- Targeted backend/client/UI tests and `vue-tsc` passed. Plain `tsc` still fails only on the pre-existing Vue SFC named-export mismatch in `src/ui-app/app/appChatApp.logic.ts`.

## Recommended next round

DFC-21 should continue closing Phase 1 gaps around explicit ensure state, stale selected refs, and preview/send coherence. Browser Playwright smoke still requires separate owner approval if it needs new harness scaffolding.

## DFC-21 implementation recovery notes

- DFC-21 is a narrow backend coherence slice; it does not add a DB schema change, IPC contract change, renderer option identity, conversion runtime family expansion, browser Playwright harness, UI redesign, new dependency, external engine, legacy bridge, broad Send Plan rewrite, durable `ConversionOption` rows, or async option-generation state.
- Backend-owned DFC option DTO generation now compares a derived facade `sourceHash` with the current raw asset `sha256` when a hash is available. A mismatch marks the derived option `stale`, unavailable, and blocked with the sanitized diagnostic code `derived_asset_source_hash_mismatch`.
- DFC preview and commit now reject a selected stale derived option with the existing `selected_option_stale` decision path instead of previewing or committing it.
- Send Plan selected-ref synthesis and lineage validation now treat selected DFC derived refs with mismatched source hashes as stale, so DFC-managed sends remain blocked and do not fall back to preferred/selected legacy send modes, extension, MIME, or route-derived behavior.
- The existing malformed-derivative lineage diagnostic path remains intact; the Send Plan availability check only blocks early for confirmed source-hash mismatch and leaves malformed facades to lineage validation.
- New tests cover stale source-hash option DTO redaction, preview rejection, commit gating, and Send Plan no-fallback blocking for source-mismatched selected derived refs.
- Targeted DFC service/shared tests, broader backend/client/UI DFC tests, `vue-tsc`, `git diff --check`, privacy scans, test_runner, and risk_reviewer passed.
- Residual risk: source-hash mismatch detection cannot prove staleness when the raw asset `sha256` is null. Future `SendPlanService` consumers must provide `fileDerivativeRepo` for selected derived-ref source-hash gating.

## Recommended next round

DFC-22 should continue non-Playwright Phase 1 hardening around null-hash and pending-state semantics, or durable generated-option state if approved. Browser Playwright smoke still requires separate owner approval if it needs new harness scaffolding.

## DFC-22 implementation recovery notes

- DFC-22 is a narrow backend coherence slice; it does not add a DB schema change, IPC contract change, renderer option identity, conversion runtime family expansion, browser Playwright harness, UI redesign, new dependency, external engine, legacy bridge, broad Send Plan rewrite, durable `ConversionOption` rows, or async option-generation state.
- Backend-owned DFC option DTO generation now treats a ready derived facade as unavailable `blocked` when the current raw asset `sha256` is null. The exposed diagnostic is symbolic: `raw_file_source_hash_missing`.
- DFC preview and commit now reject a selected source-unverifiable derived option through the existing `selected_option_blocked` decision path instead of previewing or committing it.
- Send Plan selected-ref synthesis and lineage validation now also block selected DFC derived refs when the raw source hash is missing, with no fallback to preferred/selected legacy send modes, extension, MIME, or route-derived behavior.
- `original_file` remains unaffected: raw-file options still use `raw_file` refs and do not require derived lineage.
- Explicit `conversationDraft.ensureDfcOptions` already avoids exposing DFC metadata when the raw source hash is null; this slice closes the hand-existing/legacy-metadata derived-facade availability case.
- New tests cover null raw-hash derived option redaction, blocked preview, commit gating, and Send Plan no-fallback blocking for selected derived refs with unverifiable raw source lineage.
- Targeted DFC service/shared tests, broader backend/client/UI DFC tests, `vue-tsc`, `git diff --check`, privacy scans, code_mapper, and risk_reviewer passed.

## Recommended next round

DFC-23 should continue non-Playwright Phase 1 hardening around pending/concurrent generation semantics. Browser Playwright smoke still requires separate owner approval if it needs new harness scaffolding.

## DFC-23 implementation recovery notes

- DFC-23 is a narrow Send Plan fail-closed slice; it does not add a DB schema change, IPC contract change, renderer option identity, conversion runtime family expansion, browser Playwright harness, UI redesign, new dependency, external engine, legacy bridge, broad Send Plan rewrite, durable `ConversionOption` rows, or async option-generation state.
- DFC selected derived refs now require `fileDerivativeRepo` verification before the Send Plan marks the selected option available.
- If a Send Plan caller omits `fileDerivativeRepo`, selected `derived_asset` refs are blocked through the selected-option decision path with redacted lineage. The implementation no longer treats asset metadata as a stand-in for a verified `DerivedAsset`.
- Production worker runtime still injects `fileDerivativeRepo`, so the normal backend path can verify ready derived refs while fail-closed behavior protects incomplete/test callers.
- The regression test covers a DFC-managed selected derived ref with matching asset metadata and a real derivative row, then proves a Send Plan service constructed without the derivative repo blocks the send and does not expose internal derivative content or source hashes in the attachment plan.
- Targeted Send Plan/shared tests, the broader backend/client/UI DFC suite, `vue-tsc`, `git diff --check`, diff privacy scans, and risk review passed.

## Recommended next round

DFC-24 should continue non-Playwright Phase 1 hardening around pending/concurrent generation semantics. Browser Playwright smoke still requires separate owner approval if it needs new harness scaffolding.

## DFC-24 implementation recovery notes

- DFC-24 is a narrow draft option/preview fail-closed slice; it does not add a DB schema change, IPC contract change, renderer option identity, conversion runtime family expansion, browser Playwright harness, UI redesign, new dependency, external engine, legacy bridge, broad Send Plan rewrite, durable `ConversionOption` rows, or async option-generation state.
- Backend draft option generation now builds derived DFC options only from verified `file_derivatives` rows. Asset-level `sourceMetaJson.textConversion` no longer creates a DFC derived option by itself.
- DFC preview source resolution now also requires a matching derivative row for selected `derived_asset` refs. Orphaned text-conversion metadata cannot cause preview to read or expose converted content.
- The explicit `conversationDraft.ensureDfcOptions` path remains compatible because it writes the DFC facade metadata onto the derivative row; the asset-level metadata can remain as lineage/cache state but is no longer option/preview authority.
- The regression test seeds a ready-looking orphaned text-conversion metadata object and a readable storage file, then proves options expose only `original_file`, stale selected derived refs become `selected_option_not_found`, preview stays empty, and storage/content/hash fixture values are not emitted.
- Targeted DFC service/shared tests, the broader backend/client/UI DFC suite, `vue-tsc`, `git diff --check`, diff privacy scans, and risk review passed.

## Recommended next round

DFC-25 should continue non-Playwright Phase 1 hardening around pending/concurrent `conversationDraft.ensureDfcOptions` generation semantics. Browser Playwright smoke still requires separate owner approval if it needs new harness scaffolding.

## DFC-25 implementation recovery notes

- DFC-25 is a narrow worker in-flight coalescing slice; it does not add a DB schema change, IPC contract change, renderer option identity, Send Plan behavior change, browser Playwright harness, UI redesign, new dependency, external engine, legacy bridge, broad Send Plan rewrite, durable `ConversionOption` rows, or durable async option-generation state.
- `ensureTextDerivativeAsset` now uses a runtime-local in-flight map keyed by source asset, target kind, and DFC-exposure mode. Concurrent identical explicit ensure requests await the same backend generation promise instead of creating duplicate text derivative jobs.
- The in-flight entry is removed in a `finally` block, so success and failure paths can be retried by a later ensure call.
- The coalescing key keeps explicit DFC exposure separate from legacy Send Plan derivative generation, preserving the DFC-20 boundary that only `conversationDraft.ensureDfcOptions` makes a derivative DFC-ready.
- The regression test dispatches two concurrent `conversationDraft.ensureDfcOptions` calls for the same CSV draft attachment and verifies both responses return the same backend-owned `table_markdown` option while only one derivative row and one derivative job row are created.
- This is not a durable cross-process uniqueness guarantee. A durable uniqueness boundary for derivative jobs would require owner approval for a schema/repo design change.
- Targeted worker/shared tests, the broader backend/client/UI DFC suite, `vue-tsc`, `git diff --check`, diff privacy scans, code mapping, and risk review passed.

## Recommended next round

DFC-26 should continue non-Playwright Phase 1 hardening around failed-generation/no-silent-fallback semantics. Browser Playwright smoke still requires separate owner approval if it needs new harness scaffolding, and durable job uniqueness still requires an owner-approved schema/repo plan.

## DFC-26 implementation recovery notes

- DFC-26 is a narrow backend failure-state slice; it does not add a DB schema change, IPC contract change, renderer option identity, Send Plan rewrite, conversion runtime family expansion, browser Playwright harness, UI redesign, new dependency, external engine, legacy bridge, durable `ConversionOption` rows, or durable async option-generation state.
- Explicit `conversationDraft.ensureDfcOptions` failures now write a DFC-exposed symbolic failure marker for approved Phase 1 text-like targets. Backend option DTO generation can surface that marker as a deterministic unavailable `failed` option without exposing storage refs, hashes, paths, file body, or raw error text.
- Synthetic failed options are gated by `dfcOptionExposed === true`, excluded for `pdf_attachment`, and use empty `sendAssetRefs`; the existing draft selection coherence check prevents persisting them as a selected option.
- Existing selected derivatives whose storage is missing or unreadable during explicit ensure are marked `failed`, retain their backend-owned option id/refs, and resolve to `selected_option_failed` for preview/send decisions rather than falling back to legacy routing.
- Legacy non-explicit failure metadata does not create synthetic failed DFC options. Ready DFC preview/send options still require a verified `file_derivatives` row.
- Focused worker/service/shared tests, the broader backend/client/UI DFC suite, `vue-tsc`, `git diff --check`, diff privacy scans, code mapping, test-runner attribution, and risk review passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this infra diff.

## Recommended next round

DFC-27 should continue non-Playwright Phase 1 hardening around pending-state visibility and retry semantics if it can stay within existing storage. Durable option-generation storage, durable job uniqueness, browser Playwright harness scaffolding, and forbidden conversion families remain owner-gated.

## DFC-27 implementation recovery notes

- DFC-27 is a narrow pending-option DTO/decision slice; it does not add a DB schema change, IPC contract change, renderer option identity, Send Plan rewrite, conversion runtime family expansion, browser Playwright harness, UI redesign, new dependency, external engine, legacy bridge, durable `ConversionOption` rows, durable job-state linkage, or durable async option-generation state.
- Backend draft option generation now surfaces existing DFC `file_derivatives` rows whose status is `pending` as deterministic, unavailable pending options.
- Pending option DTOs use the symbolic diagnostic `derived_asset_pending` and do not expose storage refs, paths, hashes, content tokens, file body, or full storage metadata.
- A backend-owned pending option can be persisted through the existing selected-option fields only when `selectedOptionId` and `selectedAssetRefs` match the generated option. Preview resolves to `selected_option_pending`, and commit/send remain blocked without legacy fallback.
- The shared DFC resolver now has regression coverage for a selected pending option and for option-generation pending state with no selection, both without falling back to legacy send modes.
- Code mapping found no safe durable pending/retry visibility path using only current `derivative_jobs`, `file_derivatives`, and source metadata while avoiding schema, IPC, renderer, or broad UI changes.
- Targeted service/shared tests, the broader backend/client/UI DFC suite, `vue-tsc`, `git diff --check`, diff privacy scans, test-runner attribution, risk review, and doc consistency passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this DFC diff.

## Recommended next round

DFC-28 should either proceed with an owner-approved durable pending/retry/job-state design, or continue narrow backend hardening only where it can stay within existing storage. Browser Playwright harness scaffolding, durable option-generation storage, DB uniqueness/migration, external engines, new dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, and forbidden conversion families remain owner-gated.

## DFC-28 implementation recovery notes

- DFC-28 is a narrow backend-owned option DTO diagnostic parity slice; it does not add a DB schema change, IPC shape change, renderer option identity, Send Plan behavior change, browser Playwright harness, UI redesign, new dependency, external engine, legacy bridge, durable `ConversionOption` rows, durable job-state linkage, or durable async option-generation state.
- `conversationDraft.getDfcOptions` now attaches the existing sanitized `dfc_selection_refs_mismatch` diagnostic to the selected option candidate when persisted `selectedAssetRefs` diverge from the refs generated for the selected backend option.
- The mismatch diagnostic is added through the existing option candidate `diagnostics` array, so the renderer receives visibility without inventing option identity or requiring a DTO shape change.
- Preview and commit/send behavior are unchanged: preview already blocks with `dfc_selection_refs_mismatch`, and message binding rejects mismatched selected refs before creating DFC send snapshots.
- The regression test proves the options DTO exposes only the symbolic mismatch diagnostic and does not leak preview body text or storage URI.
- Focused service tests, the broader backend/client/UI DFC suite, `vue-tsc`, `git diff --check`, diff privacy scans, test-runner attribution, risk review, and doc consistency passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this DFC diff.

## Recommended next round

DFC-29 should seek owner approval for durable pending/retry/job-state storage or browser Playwright harness scaffolding unless another concrete narrow backend gap is found that stays within existing storage and IPC shape. Browser Playwright harness scaffolding, durable option-generation storage, DB uniqueness/migration, external engines, new dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, and forbidden conversion families remain owner-gated.

## DFC-29 implementation recovery notes

- DFC-29 is a narrow Send Plan fail-closed slice; it does not add a DB schema change, IPC shape change, renderer option identity, UI, browser Playwright harness, new dependency, external engine, legacy bridge, durable `ConversionOption` rows, durable job-state linkage, or durable async option-generation state.
- When `fileDerivativeRepo` is available, DFC Send Plan selected-ref reconstruction now requires the selected derivative row metadata to provide the DFC target kind. It no longer falls back to `file_assets.sourceMetaJson.textConversion` for target-kind authority if the derivative row is missing or malformed.
- Missing selected derivative rows, derivative rows without DFC `targetKind`, and malformed history snapshots without persisted target metadata now fail closed as `selected_option_not_found` with unsupported semantics, no selected send mode, and no legacy route fallback.
- The no-derivative-repo path remains fail-closed for incomplete/test callers and can still preserve a redacted target diagnosis from asset metadata when no repository is available.
- The regression tests seed draft and history source metadata that claims a ready markdown conversion, then prove the normal backend Send Plan path does not treat that asset metadata as target authority and does not emit storage URI, source hash, content hash, or conversion settings hash fixture values.
- Focused Send Plan/shared tests passed at 2 files / 70 tests. The broader backend/client/UI DFC suite passed at 7 files / 364 tests. `vue-tsc`, `git diff --check`, diff privacy scans, test-runner attribution, risk review, and doc consistency passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this DFC diff.

## Recommended next round

DFC-30 should seek owner approval for durable pending/retry/job-state storage or browser Playwright harness scaffolding unless another concrete narrow backend gap remains outside owner-gated scope. Browser Playwright harness scaffolding, durable option-generation storage, DB uniqueness/migration, external engines, new dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, and forbidden conversion families remain owner-gated.

## DFC-30 implementation recovery notes

- DFC-30 is a test-hardening slice only; it does not add production code, DB schema changes, IPC shape changes, renderer option identity, Send Plan behavior changes, browser Playwright harness, UI redesign, new dependencies, external engines, legacy bridge, durable `ConversionOption` rows, durable job-state linkage, or durable async option-generation state.
- Backend service regression coverage now proves a selected backend-owned markdown `derived_asset` option persists through draft restore, rehydrates as a ready backend option DTO, previews from the same selected ref, commits to a message without renderer-supplied snapshot data, and surfaces the same `usedOptionId`, `usedAssetRefs`, `targetKind`, and `sendStrategy` in history candidate snapshots.
- UI regression coverage now proves the existing attachment details dialog reloads backend DFC options and preview after close/reopen while preserving the selected option marker and avoiding any extra `conversationDraft.updateAttachmentSettings` call.
- Focused backend/UI Vitest passed at 2 files / 73 tests. The broader backend/client/UI DFC suite passed at 7 files / 366 tests. `vue-tsc` passed. Production diff privacy scan found no hits; the only new privacy-pattern hits are test-only `storageUri` fixture inputs. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this DFC diff.

## Recommended next round

DFC-31 should continue only with a narrow non-gated coverage or contract gap, such as selected-option mismatch-state UI coverage, unless the Owner approves durable pending/retry/job-state storage, browser Playwright harness scaffolding, DB uniqueness/migration, external engines, new dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, or forbidden conversion families.

## DFC-31 implementation recovery notes

- DFC-31 is a narrow renderer visibility and UI regression slice; it does not add a DB schema change, IPC shape change, renderer option identity, Send Plan behavior change, browser Playwright harness, new dependency, external engine, legacy bridge, durable `ConversionOption` rows, durable job-state linkage, durable async option-generation state, broad UI redesign, or conversion runtime family expansion.
- Attachment details now carries backend-sanitized DFC option diagnostic codes into the existing option view model and displays them under the backend-owned option. The renderer still does not invent option ids, refs, target kinds, compatibility, or conversion identity.
- UI regression coverage now seeds a persisted `selectedOptionId` whose `selectedAssetRefs` differ from the backend option refs, then proves the dialog shows the selected backend option diagnostic, preview is blocked with `dfc_selection_refs_mismatch`, no preview body is shown, and the renderer does not call `conversationDraft.updateAttachmentSettings` to rewrite the backend selection.
- Focused UI Vitest, `vue-tsc`, `git diff --check`, and diff-only privacy/log scans passed. `git diff --check` reported only LF/CRLF working-copy warnings.

## Recommended next round

DFC-32 should seek owner approval for durable pending/retry/job-state storage or browser Playwright harness scaffolding unless another concrete narrow contract or coverage gap remains outside owner-gated scope. Browser Playwright harness scaffolding, durable option-generation storage, DB uniqueness/migration, external engines, new dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, and forbidden conversion families remain owner-gated.

## DFC-32 implementation recovery notes

- DFC-32 is an owner-level stop memo only; it does not add production code, DB schema changes, Send Plan behavior changes, UI behavior changes, conversion runtime changes, dependencies, external engines, browser Playwright harness scaffolding, durable option-generation storage, durable job-state storage, or a legacy bridge.
- The memo records that known non-gated Phase 1 hardening has covered null-hash, verified derivative authority, failure, pending, mismatch visibility, Send Plan fail-closed behavior, rehydrate, same-source coverage, and UI diagnostic visibility.
- The next meaningful production work now requires owner approval for either durable DFC option-generation/job-state storage or new browser Playwright harness scaffolding.
- The memo recommends approving durable DFC generation state first because pending, retry, and cross-process idempotency are production semantics, while browser smoke should follow once the backend contract is stable.

## Recommended next round

DFC-33 should proceed only after owner approval for either durable DFC option-generation/job-state storage or new browser Playwright harness scaffolding. If Option A is approved, keep the implementation to the smallest durable-state design tied to existing `file_derivatives` and `derivative_jobs`; if Option B is approved, add only the minimal browser harness and one existing-flow DFC smoke.

## DFC-33 implementation recovery notes

- Owner approved DFC-32 Option A first: durable DFC option-generation/job-state storage. Browser Playwright harness remains deferred until durable state lifecycle stabilizes.
- DFC-33 adds the narrow durable companion table `dfc_option_generation_states` rather than a broad Send Plan rewrite, broad UI redesign, new browser harness, new dependency, external engine, legacy bridge, or new conversion runtime family.
- The durable state identity is backend-owned by raw asset, DFC target kind, exposure mode, generator, and conversion settings hash. It tracks pending/running/ready/failed/stale/blocked status, retryability, attempt count, linked derivative job, and output derivative id without exposing paths, storage refs, file bodies, full hashes, content tokens, command details, or temp paths through renderer DTOs.
- Explicit `conversationDraft.ensureDfcOptions` now writes DFC durable generation state for approved Phase 1 local text-like targets and updates it on running, ready, and failed outcomes. A later explicit ensure can retry a failed durable state and keeps one generation-state row for the backend option identity.
- `conversationDraft.getDfcOptions` can surface durable pending/running/failed generation states as sanitized non-sendable backend options when no verified derived option exists. Failed generation states keep the existing deterministic failed option id shape; pending/running states use backend-owned generation-state option ids and empty refs, so the renderer cannot select or persist them as sendable refs.
- Ready preview/send authority remains verified `file_derivatives` plus DerivedAsset facade metadata. The new durable state table does not replace the DerivedAsset authority for ready options.
- Targeted migration/repo/worker/service tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc`, `git diff --check`, and privacy/log scans passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this durable-state slice.

## Recommended next round

DFC-34 should continue durable lifecycle hardening around stale/cancellation/removal semantics or add a narrowly scoped retry-control endpoint only if it can preserve backend-owned identity and privacy boundaries. Browser Playwright harness scaffolding, external engines, new dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, and forbidden conversion families remain deferred unless separately owner-approved.

## DFC-34 implementation recovery notes

- DFC-34 is a narrow durable stale-source lifecycle slice; it does not add a DB schema change beyond the already-added DFC-33 durable state table, IPC shape change, renderer option identity, browser Playwright harness, new dependency, external engine, broad UI redesign, broad Send Plan rewrite, legacy bridge, or new conversion runtime family.
- Explicit DFC ensure no longer reuses an existing ready text derivative when the derivative DFC `sourceHash` no longer matches the current raw asset `sha256`. It creates a fresh derivative/job and updates the durable generation state output to the new derivative id.
- Backend DFC option candidate generation now reads derivative candidates latest-first and exposes at most one candidate per derived target kind. When a regenerated ready derivative exists, the older stale derivative is not exposed as a competing option for the same target.
- `FileDerivativeRepo.getLatestReady` now uses insertion order as the final tie-breaker after `created_at`, so same-timestamp test and worker runs resolve the latest inserted derivative deterministically.
- Regression coverage updates a source asset hash after first explicit ensure, then proves the second ensure generates a new `derived_asset`, updates durable state attempt/output, and does not expose old or new source hashes through the DTO.
- Focused worker/service/repo tests, the broader backend/client/UI DFC suite, `vue-tsc`, `git diff --check`, and privacy/log scans passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this durable lifecycle slice.

## Recommended next round

DFC-35 should continue durable lifecycle hardening around cancellation/removal semantics, especially ensuring completed background generation cannot write back into removed draft UI state. Browser Playwright harness scaffolding, external engines, new dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, and forbidden conversion families remain deferred unless separately owner-approved.

## DFC-35 implementation recovery notes

- DFC-35 is a narrow durable attachment-removal lifecycle slice; it does not add a DB schema change, IPC shape change, renderer option identity, browser Playwright harness, external engine, new dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, or new conversion runtime family.
- `DfcOptionGenerationStateRepo` now has an explicit blocked-state writer. Detached draft generation is recorded with the sanitized symbolic reason `draft_attachment_detached`, retryable false, no output derivative id, and no path, storage ref, file body, full hash, command detail, temp path, or content token exposure.
- Explicit `conversationDraft.ensureDfcOptions` validates the draft attachment before generation as before, and now also passes a draft-attachment relevance guard into DFC derivative generation. If the attachment is removed before generation starts or after conversion completes but before DFC metadata/asset ready state is written, the durable generation state is blocked instead of being marked ready.
- The completed-conversion removal regression forces the attachment to be removed after the derivative job succeeds, then proves the worker response is a closed `draft attachment not found` error, durable state is blocked with `draft_attachment_detached`, no DFC output derivative id is written, and the response does not expose storage URI or source hash fixture values.
- Focused repo/worker/service tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this durable lifecycle slice.

## Recommended next round

DFC-36 can continue durable lifecycle hardening with a narrowly scoped retry-control or stale/blocked recovery behavior if it preserves backend-owned option identity and privacy boundaries. Browser Playwright harness scaffolding, external engines, new dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, and forbidden conversion families remain deferred unless separately owner-approved.

## DFC-36 implementation recovery notes

- DFC-36 is a narrow durable generation-state transition hardening slice; it does not add a DB schema change, IPC shape change, renderer option identity, browser Playwright harness, external engine, new dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, or new conversion runtime family.
- `DfcOptionGenerationStateRepo.markRunning`, `markFailed`, and `markBlocked` now clear `output_derivative_id`. Only `ready` state retains the authoritative output pointer, so retries, failures, and detached/blocked states cannot retain a stale DerivedAsset output id in durable generation state.
- Repo regression coverage now exercises ready -> running, ready -> failed, and ready -> blocked transitions and proves the old output derivative id is cleared while symbolic error/status fields remain available.
- Focused repo/worker/service tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this durable lifecycle slice.

## Recommended next round

DFC-37 can continue within Owner-approved durable lifecycle work by adding a narrow retry-control/recovery behavior or by auditing remaining durable-state terminal conditions. Browser Playwright harness scaffolding, external engines, new dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, and forbidden conversion families remain deferred unless separately owner-approved.

## DFC-37 implementation recovery notes

- DFC-37 is a narrow durable retry lifecycle slice; it does not add a DB schema change, IPC shape change, renderer option identity, browser Playwright harness, external engine, new dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, or new conversion runtime family.
- Explicit DFC ensure now honors durable failed generation states whose `retryable` flag is false. When no verified reusable derivative already exists for the same option identity, ensure returns the existing sanitized failed option instead of creating another derivative job for the same terminal failure.
- Verified ready derivatives still take precedence as DerivedAsset authority. The non-retryable gate only suppresses repeated job creation when the durable failed state is the only authority for that DFC option identity.
- Worker regression coverage seeds a non-retryable `conversion_not_implemented` durable state, calls `conversationDraft.ensureDfcOptions`, and proves no derivative job or derivative row is created, the failed option remains backend-owned and sanitized, and storage URI/source hash fixtures are not emitted.
- Focused repo/worker/service tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this durable lifecycle slice.

## Recommended next round

DFC-38 can continue with narrow durable lifecycle hardening or stop for an owner decision before moving into browser Playwright harness scaffolding, external conversion engines/dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, or new runtime families.

## DFC-38 implementation recovery notes

- DFC-38 is a focused regression slice for durable blocked-state recovery; it does not add production code, DB schema changes, IPC shape changes, renderer option identity, browser Playwright harness, external engine, new dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, or new conversion runtime family.
- Worker coverage now proves a `draft_attachment_detached` durable blocked state is recoverable after the user adds the same asset back to the draft. A later explicit ensure reuses the existing verified text derivative, marks the durable generation state ready, writes the output derivative id, and does not create a duplicate derivative job.
- The same regression preserves the DFC privacy boundary by asserting neither the raw storage URI nor the raw source hash fixture appears in the detached error response or the recovered options DTO.
- Focused repo/worker/service tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this durable lifecycle regression.

## Recommended next round

DFC-39 should either continue with a concrete narrow durable lifecycle gap, or pause for owner decision before browser Playwright harness scaffolding, external conversion engines/dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, or new runtime families.

## DFC-39 implementation recovery notes

- DFC-39 is a focused regression slice for durable failure recovery through verified DerivedAsset authority; it does not add production code, DB schema changes, IPC shape changes, renderer option identity, browser Playwright harness, external engine, new dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, or new conversion runtime family.
- Worker coverage now proves a non-retryable durable `failed` generation state does not permanently suppress an already verified ready derivative for the same option identity. Explicit ensure reuses the verified derivative, recovers the durable state to `ready`, writes the output derivative id, and creates no new derivative job.
- The regression preserves privacy assertions for both raw and derived storage/source metadata: raw storage URI, derived storage URI, raw source hash, and derived content hash fixtures are absent from the options DTO.
- Focused repo/worker/service tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this durable lifecycle regression.

## Recommended next round

DFC-40 should either continue with a concrete narrow durable lifecycle or contract coverage gap, or pause for owner decision before browser Playwright harness scaffolding, external conversion engines/dependencies, broad UI redesign, broad Send Plan rewrite, legacy compatibility bridge, or new runtime families.

## DFC-40 implementation recovery notes

- DFC-40 is a focused worker regression slice for existing TSV/table_markdown conversion behavior; it does not add production code, DB schema changes, IPC shape changes, renderer option identity, browser Playwright harness, external engine, new dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, or new conversion runtime family.
- Worker coverage now proves a TSV draft attachment explicitly ensures to a `table_markdown` `derived_asset`, writes the expected Markdown table output, persists the selected backend option/ref, previews from the same selected derived ref, and commits a message attachment with matching `usedOptionId`, `usedAssetRefs`, `targetKind`, and `sendStrategy`.
- The regression preserves the DFC privacy boundary by asserting raw storage URI, derived storage URI, and raw source hash fixtures are absent from the options/preview DTOs.
- Focused repo/worker/service tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this TSV same-source regression.

## Recommended next round

DFC-41 can continue with another concrete narrow contract/runtime coverage gap, or present an owner-decision memo for the next larger step such as browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-41 implementation recovery notes

- DFC-41 is a focused worker regression slice for existing CSV/table_markdown conversion behavior; it does not add production code, DB schema changes, IPC shape changes, renderer option identity, browser Playwright harness, external engine, new dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, or new conversion runtime family.
- Worker coverage now proves quoted CSV cells convert to `table_markdown` without splitting escaped commas, with Markdown pipe escaping preserved, and with quoted multiline cell content rendered as `<br>` inside the Markdown table.
- The regression preserves backend-owned option identity and privacy assertions by checking the generated `derived_asset` option/ref while ensuring raw storage URI, derived storage URI, and raw source hash fixtures are absent from the options DTO.
- Focused repo/worker/service tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this CSV conversion regression.

## Recommended next round

DFC-42 should either continue with another concrete narrow runtime/contract coverage gap, or present an owner-decision memo for the next larger step such as browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-42 implementation recovery notes

- DFC-42 is a narrow built-in text decoding runtime slice; it does not add a DB schema change, IPC shape change, renderer option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, or new conversion runtime family.
- `DerivativeJobService` now decodes text assets with explicit UTF-16LE/UTF-16BE BOMs before falling back to strict UTF-8. This is deterministic BOM handling only; it does not guess arbitrary encodings or relax binary detection.
- Worker coverage now proves a UTF-16LE BOM TSV asset explicitly ensures to a `table_markdown` `derived_asset`, writes the expected Markdown table output, and records `sourceEncoding: utf-16le` in derivative metadata.
- The regression preserves backend-owned option identity and privacy assertions by checking the generated `derived_asset` option/ref while ensuring raw storage URI, derived storage URI, and raw source hash fixtures are absent from the options DTO.
- Focused repo/worker/service tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this encoding runtime slice.

## Recommended next round

DFC-43 can continue with another concrete narrow runtime/contract coverage gap, or present an owner-decision memo for the next larger step such as browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-43 implementation recovery notes

- DFC-43 is a focused worker regression slice for the UTF-16BE half of the existing BOM-aware text decoder; it does not add production code, DB schema changes, IPC shape changes, renderer option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, or new conversion runtime family.
- Worker coverage now proves a UTF-16BE BOM TSV asset explicitly ensures to a `table_markdown` `derived_asset`, writes expected Markdown table output, and records `sourceEncoding: utf-16be` in derivative metadata.
- The regression preserves backend-owned option identity and privacy assertions by checking the generated `derived_asset` option/ref while ensuring raw storage URI, derived storage URI, and raw source hash fixtures are absent from the options DTO.
- Focused repo/worker/service tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this encoding regression.

## Recommended next round

DFC-44 can continue with another concrete narrow runtime/contract coverage gap, or present an owner-decision memo for the next larger step such as browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-44 implementation recovery notes

- DFC-44 is a focused worker regression slice for the deterministic BOM-only encoding boundary; it does not add production code, DB schema changes, IPC shape changes, renderer option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, heuristic encoding policy, or new conversion runtime family.
- Worker coverage now proves a UTF-16LE TSV asset without an explicit BOM fails closed during explicit DFC `table_markdown` ensure instead of being guessed into a conversion path.
- The regression verifies no `DerivedAsset` is written, the derivative job and durable generation state are marked failed with `derivative_input_missing`, and the exposed failed option remains backend-owned, unavailable, and sanitized.
- Privacy assertions confirm the options DTO does not leak the raw storage URI, source hash fixture, or raw decoder detail.
- Focused repo/worker/service tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this encoding boundary regression.

## Recommended next round

DFC-45 can continue with another concrete narrow runtime/contract coverage gap, or present an owner-decision memo for the next larger step such as browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-45 implementation recovery notes

- DFC-45 is a focused built-in text derivative runtime hardening slice; it does not add DB schema changes, IPC shape changes, renderer option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, heuristic encoding policy, or new conversion runtime family.
- `DerivativeJobService` now only trusts caught `error.code` values that are known `DerivativeErrorCode` members. Unknown Node/internal codes from APIs such as `TextDecoder` fall through to sanitized `derivative_input_missing` instead of being stored or surfaced as DFC state.
- Worker coverage now proves an invalid UTF-8 CSV asset without a BOM fails closed during explicit DFC `table_markdown` ensure, writes no `DerivedAsset`, and records the derivative job and durable generation state as failed with `derivative_input_missing`.
- Privacy assertions confirm the options DTO does not leak the raw storage URI, source hash fixture, or raw decoder wording such as encoded-data details.
- Focused repo/worker/service tests passed after `npm run rebuild:node`. The broader backend/client/UI DFC suite passed after rebuild. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this decoder error-code sanitization slice.

## Recommended next round

DFC-46 can continue with another concrete narrow runtime/contract coverage gap, or present an owner-decision memo for the next larger step such as browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-46 implementation recovery notes

- DFC-46 is a focused built-in text derivative runtime redaction slice; it does not add DB schema changes, IPC shape changes, renderer option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, heuristic encoding policy, or new conversion runtime family.
- Unknown/internal errors normalized to `derivative_input_missing` now store the fixed safe message `Derivative input could not be decoded.` instead of retaining raw runtime or decoder wording. Known `DerivativeErrorCode` failures continue through the existing sanitized message path.
- Worker coverage now proves invalid UTF-8 explicit DFC `table_markdown` ensure stores the safe message in derivative job state and asset `textConversion` metadata, writes no `DerivedAsset`, leaves durable generation state failed, and does not retain raw decoder wording.
- Focused repo/worker/service tests passed after `npm run rebuild:node`. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this decoder message redaction slice.

## Recommended next round

DFC-47 can continue with another concrete narrow runtime/contract coverage gap, or present an owner-decision memo for browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-47 implementation recovery notes

- DFC-47 is a focused derivative runtime failure-message privacy slice; it does not add DB schema changes, IPC shape changes, renderer option identity, DFC option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, heuristic encoding policy, HTML policy changes, or new conversion runtime family.
- `sanitizeDerivativeErrorMessage` now redacts POSIX absolute paths in addition to storage-root, data URL, long base64, Windows drive, and UNC path redaction.
- Focused service coverage proves a provider failure containing `/var/tmp/.../private-token/...` is stored as `[redacted-path]` in derivative job failure state.
- Validation note: full `infra/files/derivativeJobService.test.ts` currently still has a pre-existing HTML expectation mismatch: HTML containing `<script>` is inferred as `code` by current runtime while the test expects safe markdown conversion. The DFC-47 focused redaction test passed, and the broader backend/client/UI DFC suite passed.
- `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this path-redaction slice.

## Recommended next round

DFC-48 can either address the HTML runtime/test policy mismatch with an owner-aware memo if needed, continue with another narrow privacy/contract gap, or prepare an owner-decision memo for browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-48 implementation recovery notes

- DFC-48 is a focused derivative runtime failure-message privacy slice; it does not add DB schema changes, IPC shape changes, renderer option identity, DFC option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, heuristic encoding policy, HTML policy changes, or new conversion runtime family.
- `sanitizeDerivativeErrorMessage` now redacts `http://` and `https://` URLs before messages are persisted to derivative job failure state, reducing risk of signed URL, token, or remote storage details leaking through runtime diagnostics.
- Focused service coverage proves a provider failure containing a URL with query token and fragment is stored as `[redacted-url]`.
- Focused runtime redaction tests passed after `npm run rebuild:node`. Focused repo/worker/service DFC tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this URL-redaction slice.
- HTML policy/test mismatch remains unresolved pending Owner decision: full `infra/files/derivativeJobService.test.ts` still expects safe markdown for script-bearing HTML while current runtime infers `code`.

## Recommended next round

DFC-49 can continue with another narrow privacy/contract gap, resume the HTML policy decision path if Owner approves Option A/B/C, or prepare an owner-decision memo for browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-49 implementation recovery notes

- DFC-49 is a focused derivative runtime failure-message privacy slice; it does not add DB schema changes, IPC shape changes, renderer option identity, DFC option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, heuristic encoding policy, HTML policy changes, or new conversion runtime family.
- `sanitizeDerivativeErrorMessage` now redacts `file://` URLs before messages are persisted to derivative job failure state, reducing risk of local file URL, username, and app-support path leakage.
- Focused service coverage proves a provider failure containing a local `file:///Users/.../Application%20Support/...` URL is stored as `[redacted-url]`.
- Focused runtime redaction tests passed after `npm run rebuild:node`. Focused repo/worker/service DFC tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this file-URL-redaction slice.
- HTML policy/test mismatch remains unresolved pending Owner decision: full `infra/files/derivativeJobService.test.ts` still expects safe markdown for script-bearing HTML while current runtime infers `code`.

## Recommended next round

DFC-50 can continue with another narrow privacy/contract gap, resume the HTML policy decision path if Owner approves Option A/B/C, or prepare an owner-decision memo for browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-50 implementation recovery notes

- DFC-50 is a focused derivative runtime failure-message privacy slice; it does not add DB schema changes, IPC shape changes, renderer option identity, DFC option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, heuristic encoding policy, HTML policy changes, or new conversion runtime family.
- `sanitizeDerivativeErrorMessage` now redacts common secret-bearing fragments such as `Authorization: Bearer ...`, `api_key=...`, `token:...`, access/refresh/content token keys, and generic `secret` assignments before messages are persisted to derivative job failure state.
- Focused service coverage proves provider failures containing bearer, API key, and token values are stored with `[redacted-secret]`.
- Focused runtime redaction tests passed after `npm run rebuild:node`. Focused repo/worker/service DFC tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this secret-redaction slice.
- HTML policy/test mismatch remains unresolved pending Owner decision: full `infra/files/derivativeJobService.test.ts` still expects safe markdown for script-bearing HTML while current runtime infers `code`.

## Recommended next round

DFC-51 can continue with another narrow privacy/contract gap, resume the HTML policy decision path if Owner approves Option A/B/C, or prepare an owner-decision memo for browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-51 implementation recovery notes

- DFC-51 is a focused derivative runtime failure-message privacy slice; it does not add DB schema changes, IPC shape changes, renderer option identity, DFC option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, heuristic encoding policy, HTML policy changes, or new conversion runtime family.
- `sanitizeDerivativeErrorMessage` now redacts email-like identifiers before messages are persisted to derivative job failure state, reducing risk of account/user identifiers leaking through provider/runtime diagnostics.
- Focused service coverage proves a provider failure containing `alice.sensitive+dfc@example.test` is stored as `[redacted-email]`.
- Focused runtime redaction tests passed after `npm run rebuild:node`. Focused repo/worker/service DFC tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this email-redaction slice.
- HTML policy/test mismatch remains unresolved pending Owner decision: full `infra/files/derivativeJobService.test.ts` still expects safe markdown for script-bearing HTML while current runtime infers `code`.

## Recommended next round

DFC-52 can continue with another narrow privacy/contract gap, resume the HTML policy decision path if Owner approves Option A/B/C, or prepare an owner-decision memo for browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-52 implementation recovery notes

- DFC-52 is a focused derivative runtime failure-message privacy slice; it does not add DB schema changes, IPC shape changes, renderer option identity, DFC option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, heuristic encoding policy, HTML policy changes, or new conversion runtime family.
- `sanitizeDerivativeErrorMessage` now redacts JWT-like dotted token values before messages are persisted to derivative job failure state, covering shorter three-segment tokens that can bypass long-base64 and key-assignment redaction.
- Focused service coverage proves a provider failure containing a dotted token is stored as `[redacted-token]`.
- Focused runtime redaction tests passed after `npm run rebuild:node`. Focused repo/worker/service DFC tests passed. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this dotted-token-redaction slice.
- HTML policy/test mismatch remains unresolved pending Owner decision: full `infra/files/derivativeJobService.test.ts` still expects safe markdown for script-bearing HTML while current runtime infers `code`.

## Recommended next round

DFC-53 can continue with another narrow privacy/contract gap, resume the HTML policy decision path if Owner approves Option A/B/C, or prepare an owner-decision memo for browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-53 implementation recovery notes

- DFC-53 is a focused derivative runtime failure-message privacy slice; it does not add DB schema changes, IPC shape changes, renderer option identity, DFC option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, heuristic encoding policy, HTML policy changes, or new conversion runtime family.
- `sanitizeDerivativeErrorMessage` now redacts uppercase environment-variable style secret assignments before messages are persisted to derivative job failure state, covering prefixed keys such as `OPENAI_API_KEY=...`, `AWS_SECRET_ACCESS_KEY=...`, and `STARVERSE_CONTENT_TOKEN=...`.
- Focused service coverage proves a provider failure containing those env-style secret assignments is stored with `[redacted-secret]`.
- The first focused DFC-53 redaction run exposed that `AWS_SECRET_ACCESS_KEY` was not covered; the same slice corrected the pattern and the focused runtime redaction tests then passed.
- Focused repo/worker/service DFC tests passed after `npm run rebuild:node`. The broader backend/client/UI DFC suite passed. `vue-tsc` passed. Plain `tsc` still fails only in the pre-existing Vue SFC named-export mismatch at `src/ui-app/app/appChatApp.logic.ts:183-184`, unrelated to this env-secret-redaction slice.
- HTML policy/test mismatch remains unresolved pending Owner decision: full `infra/files/derivativeJobService.test.ts` still expects safe markdown for script-bearing HTML while current runtime infers `code`.

## Recommended next round

DFC-54 can continue with another narrow privacy/contract gap, resume the HTML policy decision path if Owner approves Option A/B/C, or prepare an owner-decision memo for browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-54 implementation recovery notes

- DFC-54 is a focused DFC validation-chain hardening slice; it does not change runtime DFC behavior, DB schema, IPC shape, renderer option identity, DFC option identity, browser Playwright harness, external engine, external dependency, broad UI redesign, broad Send Plan rewrite, legacy bridge, heuristic encoding policy, HTML policy changes, or conversion runtime families.
- The repeated plain `tsc` blocker at `src/ui-app/app/appChatApp.logic.ts:183-184` is resolved by moving Search modal and Conversation list prop/list types from named `.vue` type exports into regular `.ts` type modules.
- `SearchModal.vue`, `ConversationList.vue`, and `appChatApp.logic.ts` now import those types type-only from `SearchModal.types.ts` and `ConversationList.types.ts`, avoiding runtime changes while allowing plain TypeScript to typecheck without Vue SFC named exports.
- Validation passed: plain `tsc`, `vue-tsc`, focused UI attachment Vitest, and the broader backend/client/UI DFC suite after `npm run rebuild:node`. Renderer diff privacy/log scan found no added DTO/log/path/token exposure. `git diff --check` passed with LF/CRLF warnings only.
- HTML policy/test mismatch remains unresolved pending Owner decision: full `infra/files/derivativeJobService.test.ts` still expects safe markdown for script-bearing HTML while current runtime infers `code`.

## Recommended next round

DFC-55 can continue with a narrow contract/privacy gap, resume the HTML policy decision path if Owner approves Option A/B/C, or prepare an owner-decision memo for browser Playwright harness scaffolding or an external conversion engine/dependency.

## DFC-55 implementation recovery notes

- Owner approved HTML Option C with a corrected default policy: HTML may expose both `code` and safe `markdown`; default inference should prefer `markdown` for static/document-like HTML and `code` for template/source/script-heavy HTML.
- DFC-55 is a focused HTML text-conversion and option-generation slice. It does not add HTML->PDF, Chromium/Puppeteer, external resource loading, external dependencies, browser Playwright harness, broad UI redesign, broad Send Plan rewrite, legacy bridge, external conversion engines, or additional preference UI.
- `DerivativeJobService` now treats explicit `configJson.targetKind` as authoritative for text jobs and validates that the requested target is supported instead of silently falling back. HTML `code` preserves source text; HTML `markdown` uses safe string-based conversion that does not execute JavaScript or load externals, removes script/style execution semantics, preserves visible text, and emits HTML safety warnings.
- The implicit HTML profile heuristic now keeps static/document-like HTML on `markdown`, while template/source/script-heavy HTML defaults to `code`.
- `conversationDraft.ensureDfcOptions` now generates both HTML `markdown` and `code` DFC derived options when the raw HTML asset is eligible. The existing `original_file` option remains the raw_file option. Reuse now searches for a latest reusable derivative with matching target kind, avoiding repeat generation when both HTML targets exist.
- Coverage proves static/document-like HTML defaults to safe markdown with warnings, script-heavy HTML defaults to code, explicit markdown on script-heavy HTML produces safe markdown, explicit code preserves source, HTML DFC option generation exposes `original_file`/`markdown`/`code`, and selected markdown preview uses the same derived_asset ref.
- Validation passed after `npm run rebuild:node`: full `infra/files/derivativeJobService.test.ts`, focused worker HTML/DFC option tests, broader backend/client/UI DFC suite, plain `tsc`, and `vue-tsc`. `git diff --check` passed with LF/CRLF warnings only. Privacy/log scan found no production DTO/log/path/token exposure; broader hits were internal source-hash/settings-hash handling or test fixtures with explicit non-leak assertions.

## Recommended next round

DFC-56 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-56 implementation recovery notes

- DFC-56 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, conversion runtime, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, or HTML->PDF behavior.
- The HTML dual-option worker regression now proves that after `conversationDraft.ensureDfcOptions` exposes ready `original_file`, safe `markdown`, and `code` options, the backend still returns `selectedOptionId: null`, empty `selectedAssetRefs`, and a `needs_user_selection` / `selected_option_missing` decision until a backend-issued option is explicitly selected.
- This locks the Owner-approved Option C behavior that HTML choices remain selectedOptionId-driven and that the backend/renderer must not silently default to either `code` or `markdown` when the draft has no selected option.
- Validation passed after `npm run rebuild:node`: focused HTML worker regression and the broader backend/client/UI DFC suite. `git diff --check` passed with LF/CRLF warnings only. Privacy/log scan hit only test fixture storage/source-hash strings covered by explicit non-leak assertions; no production DTO/log code changed.

## Recommended next round

DFC-57 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-57 implementation recovery notes

- DFC-57 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, conversion runtime, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, or HTML->PDF behavior.
- The HTML dual-option worker regression now continues from selected safe `markdown` preview to selected `code` preview and message commit. It proves the `code` preview uses the same selected `derived_asset` ref and that commit persists matching `usedOptionId`, `usedAssetRefs`, `targetKind: code`, and `sendStrategy: text_in_prompt`.
- This locks the Owner-approved Option C behavior for both HTML derived outputs: safe markdown preserves visible semantics without JS/external loading, while code preserves source text, and both remain selectedOptionId/selectedAssetRefs-driven rather than renderer-invented.
- Validation passed after `npm run rebuild:node`: focused HTML worker regression and the broader backend/client/UI DFC suite. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit only test fixture raw/derived refs and explicit non-leak assertions; no production DTO/log code changed.

## Recommended next round

DFC-58 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-58 implementation recovery notes

- DFC-58 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, conversion runtime, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, or HTML->PDF behavior.
- The HTML dual-option worker regression now explicitly selects `original_file` before switching to derived `markdown` and `code`. It proves selected preview returns a `raw_file` metadata-only payload, preserves the selected raw_file ref, and reports `sendStrategy: file_attachment`.
- The same regression asserts the raw-file preview DTO does not expose the raw storage URI, either HTML derived storage URI, or the HTML file body, keeping `original_file` preview metadata-only while still first-class in the HTML profile.
- Validation passed after `npm run rebuild:node`: focused HTML worker regression and the broader backend/client/UI DFC suite. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit only test fixture storage refs and explicit non-leak assertions; no production DTO/log code changed.

## Recommended next round

DFC-59 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-59 implementation recovery notes

- DFC-59 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, conversion runtime, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, or HTML->PDF behavior.
- The HTML dual-option worker regression now attaches the same HTML asset to a second draft, selects the backend-issued `original_file` option, and commits it. The resulting MessageAttachment snapshot must persist matching `usedOptionId`, raw_file `usedAssetRefs`, `targetKind: original_file`, and `sendStrategy: file_attachment`.
- This complements DFC-58 raw preview coverage and locks first-class HTML `original_file` send binding without creating a DerivedAsset, falling back to derived conversion identity, or relying on renderer-invented refs.
- Validation passed after `npm run rebuild:node`: focused HTML worker regression and the broader backend/client/UI DFC suite. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit only test fixture raw/derived refs and explicit non-leak assertions; no production DTO/log code changed.

## Recommended next round

DFC-60 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-60 implementation recovery notes

- DFC-60 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, conversion runtime, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, or HTML->PDF behavior.
- The HTML dual-option worker regression now attaches the same HTML asset to a separate draft, selects the backend-issued safe `markdown` option, and commits it. The resulting MessageAttachment snapshot must persist matching `usedOptionId`, markdown `derived_asset` `usedAssetRefs`, `targetKind: markdown`, and `sendStrategy: text_in_prompt`.
- This complements selected markdown preview coverage and locks HTML safe markdown preview/send same-source behavior without renderer-invented conversion identity or raw/derived storage detail leakage.
- Validation passed after `npm run rebuild:node`: focused HTML worker regression and the broader backend/client/UI DFC suite. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit only test fixture raw/derived refs and explicit non-leak assertions; no production DTO/log code changed.

## Recommended next round

DFC-61 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-61 implementation recovery notes

- DFC-61 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, conversion runtime, UI, browser Playwright harness, external engines/dependencies, or HTML->PDF behavior.
- Send Plan coverage now proves HTML raw assets with backend-selected safe `markdown` or `code` `derived_asset` refs are planned from DFC option/ref semantics as `text_in_prompt`, `mappedFromLegacy: false`, and `eligibility: included`, despite the raw asset extension/MIME being HTML.
- The regression asserts Send Plan does not fall back to legacy `conversion_required_before_send` or `unsupported` routing and does not expose raw/derived storage URIs or lineage hashes in the plan DTO.
- Validation passed after `npm run rebuild:node`: focused Send Plan regression and the broader backend/client/UI DFC suite. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit only test fixture storage/hash fields and explicit non-leak assertions; no production DTO/log code changed.

## Recommended next round

DFC-62 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-62 implementation recovery notes

- DFC-62 is a narrow Send Plan contract-alignment fix plus regression coverage; it does not change DB schema, IPC shape, renderer option identity, DFC option identity, conversion runtime, UI, browser Playwright harness, external engines/dependencies, or HTML->PDF behavior.
- The new Send Plan regression first exposed that an HTML raw asset with a backend-issued `original_file` raw_file selection was still blocked by `processingStatus: convertible` as `conversion_required_before_send`.
- `compatibilityReasonFromProcessingStatusForSemantic` now treats `targetKind: original_file` with `sendStrategy: file_attachment` as a raw-file send semantic that does not require a ready text conversion before Send Plan mode selection. This keeps DFC-selected original files governed by selectedOptionId/selectedAssetRefs rather than legacy extension/MIME conversion routing.
- Coverage now proves HTML `original_file`, safe `markdown`, and `code` selections all plan from selected DFC refs without legacy HTML fallback. Validation passed after `npm run rebuild:node`: focused Send Plan HTML DFC tests and the broader backend/client/UI DFC suite. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan found the production diff only changes a semantic gate condition; storage/hash hits are test fixtures with explicit non-leak assertions.

## Recommended next round

DFC-63 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-63 implementation recovery notes

- DFC-63 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, conversion runtime, UI, browser Playwright harness, external engines/dependencies, or HTML->PDF behavior.
- The HTML `original_file` Send Plan regression now also evaluates the same backend-issued raw_file selection against a text-only model. The overall plan must be blocked by missing model capability, while the attachment remains DFC semantic `targetKind: original_file`, `sendStrategy: file_attachment`, and `mappedFromLegacy: false`.
- The negative gate asserts the selected raw_file ref is preserved and the note names missing `file_in`; the plan must not fall back to legacy `conversion_required_before_send` or `unsupported` HTML routing.
- Validation passed after `npm run rebuild:node`: focused Send Plan HTML original_file regression and the broader backend/client/UI DFC suite. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit only the existing DFC-62 production semantic gate plus test fixture storage/hash fields and explicit non-leak assertions.

## Recommended next round

DFC-64 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-64 implementation recovery notes

- DFC-64 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, conversion runtime, UI, browser Playwright harness, external engines/dependencies, or HTML->PDF behavior.
- The HTML safe `markdown` and `code` Send Plan regression now also evaluates each backend-selected `derived_asset` option against a model without `text_in`. The overall plan must be blocked by missing model capability, while the attachment remains DFC semantic `targetKind: markdown` or `code`, `sendStrategy: text_in_prompt`, and `mappedFromLegacy: false`.
- The negative gate asserts the selected derived_asset ref is preserved and the note names missing `text_in`; the plan must not fall back to legacy HTML `conversion_required_before_send` or `unsupported` routing.
- Validation passed after `npm run rebuild:node`: focused Send Plan HTML DFC regressions and the broader backend/client/UI DFC suite. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit only the existing DFC-62 production semantic gate plus test fixture storage/hash fields and explicit non-leak assertions.

## Recommended next round

DFC-65 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-65 implementation recovery notes

- DFC-65 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, conversion runtime, UI, browser Playwright harness, external engines/dependencies, or HTML->PDF behavior.
- Send Plan coverage now creates historical MessageAttachment snapshots for HTML `markdown` and `code` derived options, then plans them through `historyScope`. The history plan must preserve the message snapshot semantics: `targetKind`, `sendStrategy: text_in_prompt`, `mappedFromLegacy: false`, and the selected `derived_asset` refs.
- The regression asserts historical HTML DFC attachments do not re-enter legacy HTML `conversion_required_before_send` or `unsupported` routing and do not expose raw/derived storage URIs or lineage hashes in the plan DTO.
- Validation passed after `npm run rebuild:node`: focused history HTML DFC regression and the broader backend/client/UI DFC suite. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit test fixture storage/hash fields and explicit non-leak assertions; no production code changed in this round.

## Recommended next round

DFC-66 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-66 implementation recovery notes

- DFC-66 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, conversion runtime, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, or HTML->PDF behavior.
- The history `original_file` Send Plan regression now covers both PDF and HTML raw_file MessageAttachment snapshots. The history plan must preserve the snapshot semantics: `usedOptionId`, selected raw_file refs, `targetKind: original_file`, `sendStrategy: file_attachment`, and `mappedFromLegacy: false`.
- The HTML branch asserts historical `original_file` does not re-enter legacy HTML `conversion_required_before_send` or `unsupported` routing and does not expose the raw storage URI in the plan DTO.
- Validation passed after `npm run rebuild:node`: focused history original_file regression and the broader backend/client/UI DFC suite. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit test fixture storage/hash fields and explicit non-leak assertions; no production code changed.

## Recommended next round

DFC-67 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-67 implementation recovery notes

- DFC-67 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, broad HTML runtime behavior, or HTML->PDF behavior.
- The derivative runtime HTML default-code test now covers both script-heavy and template-like HTML. Template-like HTML using `<template>`, `{{ }}`, and `v-if` must default to `targetKind: code`, produce no conversion warnings, and write the exact original source text as the derived output.
- This complements the existing static/document-like HTML default markdown test and explicit markdown/code HTML tests, keeping the owner-approved v1.2 HTML profile heuristic covered without adding Chromium/Puppeteer, external resource loading, external dependencies, or Playwright.
- Validation passed after `npm run rebuild:node`: focused HTML runtime regression and the broader backend/client/UI DFC suite including full derivative runtime tests. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit cumulative test fixture storage URIs, template literals, and existing redaction-test secret samples; no production DTO/log code changed.

## Recommended next round

DFC-68 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-68 implementation recovery notes

- DFC-68 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, broad HTML runtime behavior, or HTML->PDF behavior.
- Worker-level option generation now covers template-like HTML. `conversationDraft.ensureDfcOptions` must keep `selectedOptionId` null and return `needs_user_selection`, while exposing backend-owned `original_file` raw_file, safe `markdown` derived_asset, and `code` derived_asset options.
- The template-like HTML regression asserts the safe markdown derivative preserves visible template text without template tags/directives, the code derivative preserves the exact HTML source, markdown warnings include the safe HTML diagnostics, and the ensure DTO does not expose raw storage URI, source hash, or original HTML body.
- Validation passed after `npm run rebuild:node`: focused worker regression and the broader backend/client/UI DFC suite including full derivative runtime tests. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit cumulative test fixture storage/hash fields, selected ref assertions, and explicit non-leak assertions; no production DTO/log code changed.

## Recommended next round

DFC-69 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-69 implementation recovery notes

- DFC-69 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, broad HTML runtime behavior, or HTML->PDF behavior.
- The template-like HTML worker regression now selects the backend-issued `code` option and verifies selected preview/send same-source behavior: preview returns the same selected `derived_asset` ref and exact code derivative text, and message commit snapshots matching `usedOptionId`, `usedAssetRefs`, `targetKind: code`, and `sendStrategy: text_in_prompt`.
- The preview/commit DTO assertions ensure raw and derived storage URIs are not exposed while preserving backend-owned `selectedOptionId` / `selectedAssetRefs` and message `usedOptionId` / `usedAssetRefs`.
- Validation passed after `npm run rebuild:node`: focused worker regression and the broader backend/client/UI DFC suite including full derivative runtime tests. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit cumulative test fixture storage/hash fields, selected/used ref assertions, and explicit non-leak assertions; no production DTO/log code changed.

## Recommended next round

DFC-70 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-70 implementation recovery notes

- DFC-70 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, broad HTML runtime behavior, or HTML->PDF behavior.
- The template-like HTML worker regression now also selects the backend-issued safe `markdown` option in a separate draft conversation and verifies selected preview/send same-source behavior: preview returns the same selected `derived_asset` ref and safe markdown derivative text, and message commit snapshots matching `usedOptionId`, `usedAssetRefs`, `targetKind: markdown`, and `sendStrategy: text_in_prompt`.
- The preview/commit DTO assertions ensure raw and derived storage URIs and the original HTML body are not exposed while preserving backend-owned selected refs and message used refs.
- Validation passed after `npm run rebuild:node`: focused worker regression and the broader backend/client/UI DFC suite including full derivative runtime tests. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit cumulative test fixture storage/hash fields, selected/used ref assertions, and explicit non-leak assertions; no production DTO/log code changed.

## Pause note

The owner requested pausing after DFC-70. Resume with DFC-71 when the owner asks to continue.

## DFC-71 implementation recovery notes

- DFC-71 resumed after the owner-requested DFC-70 pause. It is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, broad HTML runtime behavior, or HTML->PDF behavior.
- The template-like HTML worker regression now also selects the backend-issued `original_file` option in a separate draft conversation and verifies selected preview/send same-source behavior: preview returns the same selected `raw_file` ref with metadata-only raw preview diagnostics, and message commit snapshots matching `usedOptionId`, `usedAssetRefs`, `targetKind: original_file`, and `sendStrategy: file_attachment`.
- The preview/commit DTO assertions ensure raw and derived storage URIs and the original HTML body are not exposed while preserving backend-owned selected refs and message used refs.
- Validation passed after `npm run rebuild:node`: focused worker regression and the broader backend/client/UI DFC suite including full derivative runtime tests. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit cumulative test fixture storage/hash fields, selected/used ref assertions, and explicit non-leak assertions; no production DTO/log code changed.

## Recommended next round

DFC-72 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-72 implementation recovery notes

- DFC-72 is a narrow safe HTML markdown runtime fix. It does not change DB schema, IPC shape, renderer option identity, DFC option identity, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, broad HTML runtime behavior, external resource loading, or HTML->PDF behavior.
- `htmlToMarkdownSafe` now rewrites `<img>` tags to their `alt` text only. This preserves visible/semantic image text while preventing external `src` URLs or domains from entering the derived markdown output.
- The static/document-like HTML runtime regression now includes an external image URL and asserts the output keeps `Revenue chart`, removes the remote URL/domain, strips script/style semantics, and keeps safe HTML warnings including `html_external_resources_not_loaded`.
- Validation passed after `npm run rebuild:node`: focused safe HTML runtime regression and the broader backend/client/UI DFC suite including full derivative runtime tests. `git diff --check` passed after docs with LF/CRLF warnings only. Privacy/log scan hit the intentional external URL fixture, explicit non-leak assertions, and cumulative redaction-test samples; no DTO/log code changed.

## Recommended next round

DFC-73 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-73 implementation recovery notes

- DFC-73 is regression coverage only; it does not change production code, DB schema, IPC shape, renderer option identity, DFC option identity, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, broad HTML runtime behavior, external resource loading, or HTML->PDF behavior.
- The static/document-like HTML safe markdown runtime regression now includes an external `<a href>` URL with a token-like query value. The derived markdown must preserve visible link text (`Read report`) while dropping the URL, remote domain, and token.
- This complements DFC-72 image-resource handling and keeps the no-JS/no-external-resource boundary covered for common link attributes without adding dependencies or loading external resources.
- Validation passed after `npm run rebuild:node`: focused safe HTML runtime regression and the broader backend/client/UI DFC suite including full derivative runtime tests. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit the intentional external link/image URL fixtures, explicit non-leak assertions, and cumulative redaction-test samples; no production DTO/log code changed.

## Recommended next round

DFC-74 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-74 implementation recovery notes

- DFC-74 is a narrow safe HTML markdown runtime fix. It does not change DB schema, IPC shape, renderer option identity, DFC option identity, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, broad HTML runtime behavior, external resource loading, or HTML->PDF behavior.
- `htmlToMarkdownSafe` now maps `<li>` to markdown bullet lines. This preserves basic visible list semantics while keeping the conversion string-level, dependency-free, and non-executing.
- The static/document-like HTML runtime regression now includes a list and asserts the output contains `- First item` and `- Second item`, while still stripping script/style semantics and external URL attributes.
- Validation passed after `npm run rebuild:node`: focused safe HTML runtime regression and the broader backend/client/UI DFC suite including full derivative runtime tests. `git diff --check` passed before docs with LF/CRLF warnings only. Privacy/log scan hit intentional safe markdown fixture text, external URL non-leak assertions, and cumulative redaction-test samples; no DTO/log code changed.

## Recommended next round

DFC-75 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-75 implementation recovery notes

- DFC-75 is a narrow safe HTML markdown runtime fix. It does not change DB schema, IPC shape, renderer option identity, DFC option identity, Send Plan policy, UI, browser Playwright harness, external engines/dependencies, broad HTML runtime behavior, external resource loading, or HTML->PDF behavior.
- `htmlToMarkdownSafe` now maps `<blockquote>` to markdown quote text. This preserves a basic visible document semantic while keeping conversion string-level, dependency-free, and non-executing.
- The static/document-like HTML runtime regression now includes a blockquote and asserts the output contains `> Important note`, while retaining prior script/style stripping, external URL non-leak, image alt, link text, and list semantics checks.
- Validation passed after `npm run rebuild:node`: focused safe HTML runtime regression and the broader backend/client/UI DFC suite including full derivative runtime tests. Privacy/log scan hit intentional safe markdown fixture text plus existing URL/token/storage/hash fixture assertions; no DTO/log code changed. `git diff --check` passed after docs with LF/CRLF warnings only.

## Recommended next round

DFC-76 can continue with another narrow DFC contract/runtime gap, or prepare an owner-decision memo for browser Playwright harness scaffolding, external conversion engines, HTML->PDF, or the next larger runtime family.

## DFC-M1 Phase 1 closeout recovery notes

- DFC-M1 switches the DFC workstream from automatic small-gap progression into manual-supervision task packages.
- Added `dfc-m1-phase-1-closeout-supported-matrix.md` as the current supported matrix and closeout baseline.
- The Phase 1 baseline supports `original_file`, `plain_text`, `markdown`, `code`, `table_markdown`, plus HTML safe `markdown` and HTML `code` paths through backend-owned options and selected refs.
- Phase 1 non-goals are XLSX/XLS runtime, DOCX/Office runtime, HTML->PDF, Office->PDF, PS/EPS production runtime, browser Playwright smoke, external engine sandbox, new dependencies, broad Send Plan rewrite, broad UI redesign, and legacy bridge work.
- Existing `.codex/agents/*.toml` dirty files are unrelated to DFC-M1 and prevent a clean checkpoint commit in this worktree.

## Recommended next round

M2 should be the End-to-End confidence path owner decision. M3 can then choose the next runtime family pilot after the confidence path is scoped.

## DFC-M2 End-to-End confidence path recovery notes

- DFC-M2 used the existing Vitest/jsdom UI smoke infrastructure instead of adding a new Playwright or Electron scaffold.
- The strengthened confidence path is `src/ui-app/AppChatApp.attachments.test.ts` test `loads backend DFC options and updates the selected option from attachment details`.
- Covered chain: attachment details open, backend-owned `conversationDraft.ensureDfcOptions`, backend-owned markdown option selection, `conversationDraft.updateAttachmentSettings` with `selectedOptionId` and `selectedAssetRefs`, selected-option preview through `conversationDraft.getDfcPreview`, and Send Plan mock visibility of `markdown` semantic plus selected `derived_asset` refs.
- This does not prove a real browser/Electron launch, file upload, OS file picker, or production DB worker. It is the low-intrusion confidence path approved by the task package boundary.
- Validation passed: `git diff --check`; `npx vue-tsc --noEmit --pretty false`; `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts -t "loads backend DFC options and updates the selected option from attachment details" --reporter=dot --silent`.

## Recommended next round

Prefer M3 Next Runtime Family Pilot only after the owner accepts Vitest/jsdom as the M2 confidence path or separately approves a real Browser/Electron harness package.

## DFC-M3 next runtime family decision recovery notes

- DFC-M3 selects XLSX/XLS -> `table_markdown` as the recommended next runtime family because it is closest to existing DFC `table_markdown`, DerivedAsset, preview, selected-ref, and Send Plan semantics.
- DFC-M3 stops at owner memo instead of implementation because the repository has no XLSX/XLS parser dependency or wrapper. Existing CSV/TSV table support is text-delimiter based and cannot parse workbook formats.
- `dfc-m3-next-runtime-family-owner-memo.md` records rejected alternatives: DOCX/Office -> markdown, HTML->PDF / Office->PDF, and PS/EPS -> PDF attachment.
- No production code, DB schema, Send Plan flow, IPC shape, asset model, UI, dependency, Playwright/Electron harness, external engine, or runtime implementation changed in M3.
- Next owner decision should approve or reject an XLSX/XLS parser strategy before any pilot implementation.

## Recommended next round

DFC-M4 should be an XLSX/XLS parser dependency decision. If approved, implement one backend-only XLSX-first `table_markdown` pilot with strict privacy and no broad architecture changes.

## DFC-M4 XLSX-first table_markdown pilot recovery notes

- DFC-M4 implements the owner-approved XLSX-first backend-only parser pilot using `exceljs`.
- `.xlsx` local stored assets can now enter `conversationDraft.ensureDfcOptions` for `targetKind: table_markdown`; `.xls` remains unsupported and does not generate a `table_markdown` option in this round.
- The parser runs only in `infra/files/derivativeJobService.ts`, reads bytes through the existing managed local storage path, and writes a `derived_asset` markdown table output through existing derivative storage.
- Minimal XLSX semantics: visible worksheets become markdown sections, empty visible worksheets produce an `_Empty worksheet._` section and warning, formula cells use cached values when present, hyperlink targets are omitted, hidden sheets/rows/columns are skipped with warnings, and embedded media/macros/merged cells are warnings/flattened behavior only.
- Existing DFC option, preview, selected refs, message/send semantics, DerivedAsset facade, and Send Plan selected-ref authority are reused. No DB schema, IPC shape, Send Plan main-flow, asset model, renderer UI, Playwright/Electron harness, external engine, or `.xls` support was added.
- Validation passed after `npm run rebuild:node`: `git diff --check`; `npx vue-tsc --noEmit --pretty false`; targeted Vitest for worker/backend/client DFC files: 6 files, 340 tests.
- Current ABI target after validation: node.

## Recommended next round

DFC-M5 should harden the XLSX pilot only if owner accepts the dependency footprint. Recommended next slices are targeted limits/warnings coverage, documented dependency/security review, or a commit checkpoint. Do not add `.xls`, DOCX/Office, HTML->PDF, Office->PDF, PS/EPS, UI sheet selection, pagination, formula evaluation, or external engines without a new owner decision.

## DFC-M5 XLSX pilot hardening recovery notes

- DFC-M5 keeps the M4 XLSX-first pilot as backend-only `table_markdown` support and does not add `.xls`, a second parser, DOCX/Office, HTML->PDF, Office->PDF, PS/EPS, UI, Playwright/Electron harness, external engines, DB schema changes, IPC changes, Send Plan main-flow changes, asset-model changes, formula evaluation, sheet picker, or pagination.
- ExcelJS dependency footprint remains accepted for the pilot boundary: lockfile inspection found no ExcelJS native binary, browser rendering dependency, external engine, or ExcelJS postinstall hook. Residual dependency hygiene risk is limited to transitive package footprint and deprecated transitive packages inherited through the ExcelJS stack.
- Parser boundary hardening added an XLSX worksheet-count guard on top of the existing size, row, and cell guards. Guard failures remain fail-closed with a blocked DFC option and no `derived_asset` output.
- Markdown output hardening now escapes more worksheet-heading markdown syntax. Cell text continues to escape table pipes and line breaks before output.
- Targeted worker coverage now includes XLSX heading/cell escaping, worksheet guard fail-closed behavior, malformed workbook fail-closed behavior, successful XLSX ensure/preview/selected refs/Send Plan path, and the existing `.xls` unsupported boundary.
- Validation passed after `npm run rebuild:node`: `git diff --check`; `npx vue-tsc --noEmit --pretty false`; `npx vitest --run infra/db/worker.filePipeline.test.ts -t "XLSX|legacy XLS" --reporter=dot --silent`.
- Current ABI target after validation: node.

## Recommended next round

Either continue spreadsheet hardening with similarly targeted XLSX guard/diagnostic tests, or switch to a DOCX/Office runtime owner-decision memo. Do not expand into `.xls`, formula calculation, workbook product UI, external engines, or browser rendering without a new owner decision.

## DFC-M6 DOCX/Office decision recovery notes

- DFC-M6 is tests plus owner-decision documentation only. It does not implement DOCX runtime and does not add dependencies, DB schema, IPC shape, Send Plan main-flow, asset-model, UI, Playwright/Electron harness, external engine, `.doc`, `.rtf`, Office-to-PDF, HTML-to-PDF, PS/EPS, or legacy bridge work.
- XLSX follow-up coverage adds regression tests for visible worksheet order with hidden-sheet warning stability and formula cells without cached values producing fail-safe empty output plus `xlsx_formula_cached_value_missing`.
- Dependency scan found no Mammoth, Turndown, Pandoc, LibreOffice, `soffice`, or equivalent DOCX/Office conversion wrapper in `package.json` or `package-lock.json`.
- Existing DFC seams can support a future DOCX-first `markdown` derived option: backend-owned ensure/options, existing `targetKind: markdown`, `derived_asset` preview/send, selected refs, Send Plan authority, and preserved `original_file` raw option.
- Owner memo `dfc-m6-docx-office-markdown-runtime-owner-memo.md` recommends DOCX-first backend-only markdown only if owner approves a parser dependency, preferably Mammoth. `.doc`, `.rtf`, Office-to-PDF, HTML-to-PDF, PS/EPS, and external engines remain explicitly postposed.

## Recommended next round

Make the DOCX-first dependency decision. If Mammoth is approved, implement one backend-only `.docx -> markdown` pilot with strict DTO/privacy boundaries. If not approved, continue only targeted XLSX hardening.

## DFC-M7 DOCX-first markdown pilot recovery notes

- DFC-M7 implements the owner-approved DOCX-first backend-only parser pilot using `mammoth`.
- `.docx` local stored assets can now enter `conversationDraft.ensureDfcOptions` for `targetKind: markdown`; `.doc` and `.rtf` remain unsupported and do not generate markdown derived options in this round.
- Mammoth runs only in `infra/files/derivativeJobService.ts`, reads bytes through the existing managed local storage path, converts DOCX to semantic HTML, then uses the existing internal safe HTML-to-markdown text path. No Turndown, Pandoc, LibreOffice, external engine, browser rendering, or Office-to-PDF path was added.
- Minimal DOCX semantics: ordinary paragraphs, headings, and visible link text are preserved. Hyperlink targets are omitted from derived markdown. Visual layout, fonts, colors, pagination, images, comments, revisions, headers/footers, footnotes/endnotes, complex tables, macros, embedded objects, and external resources are not productized.
- Existing DFC option, preview, selected refs, message/send semantics, DerivedAsset facade, and Send Plan selected-ref authority are reused. No DB schema, IPC shape, Send Plan main-flow, asset model, renderer UI, Playwright/Electron harness, or legacy bridge changed.
- Mammoth dependency footprint: `mammoth@1.12.0`, BSD-2-Clause, adds transitive packages and a CLI bin entry, with no observed native binary, browser rendering dependency, external engine, or Mammoth postinstall hook in the lockfile entry.
- Validation passed after `npm run rebuild:node`: `git diff --check`; `npx vue-tsc --noEmit --pretty false`; targeted Vitest for worker/backend/client DFC files: 6 files, 347 tests.
- Current ABI target after validation: node.

## Recommended next round

DFC-M8 should harden DOCX pilot boundaries with targeted tests for malformed DOCX, embedded media/resource omission, parser warnings, and dependency/privacy review. Do not add `.doc`, `.rtf`, Turndown, Pandoc, LibreOffice, Office-to-PDF, HTML-to-PDF, PS/EPS, UI, external engines, or browser rendering without a new owner decision.

## DFC-M8 DOCX pilot hardening recovery notes

- DFC-M8 keeps the M7 DOCX-first pilot as backend-only `markdown` support and does not add dependencies, `.doc`, `.rtf`, Turndown, Pandoc, LibreOffice, Office-to-PDF, HTML-to-PDF, PS/EPS, UI, Playwright/Electron harness, external engines, DB schema changes, IPC changes, Send Plan main-flow changes, asset-model changes, layout fidelity, image extraction, comment/revision productization, or legacy bridge work.
- Malformed DOCX now has worker-level fail-closed coverage: invalid DOCX input yields a failed/blocked markdown DFC option, no ready `derived_asset`, and no legacy fallback.
- Embedded media/resource coverage proves media bytes, media paths, storage refs, source hashes, and file bodies do not enter derived markdown or renderer-facing DTOs.
- Hyperlink coverage remains in the successful DOCX path: visible link text is preserved while the target URL and token-like query content are omitted from markdown preview/send assets.
- DOCX diagnostics stay symbolic and sanitized. The Mammoth image converter only records an internal `docx_images_not_extracted` warning; raw Mammoth warning text, XML fragments, paths, and internal parser details are not exposed.
- Mammoth remains a backend library dependency only. The `mammoth` CLI bin is not invoked, and no shell process, external engine, browser rendering, or external resource loading path is introduced.

## Recommended next round

If validation passes, DOCX can remain a Phase 1 backend-only supported pilot. Next work should either add another narrow DOCX hardening slice or move to an owner decision for Office/PDF/external-engine boundaries; do not expand into `.doc`, `.rtf`, Turndown, Pandoc, LibreOffice, Office-to-PDF, HTML-to-PDF, PS/EPS, UI, or external engines without approval.
## DFC-M9 runtime pilot closeout recovery notes

- DFC-M9 is documentation-only. It closes the runtime pilot expansion stage without changing production code, tests, dependencies, DB schema, IPC shape, Send Plan flow, asset model, UI, Playwright/Electron harness, external engine, packaging, npm audit, ESLint, or legacy bridge behavior.
- Added `dfc-m9-runtime-pilot-closeout.md` as the runtime pilot closeout. It records Phase 1 supported paths, backend-only pilot boundaries, dependency boundaries, Safety Gate conclusions, known risks, and next owner-gated directions.
- Current Phase 1 supported/pilot matrix includes `original_file`, `plain_text`, `markdown`, `code`, CSV/TSV `table_markdown`, HTML safe `markdown`/`code`, XLSX-first backend-only `table_markdown`, and DOCX-first backend-only `markdown`.
- XLSX remains `.xlsx` only via backend ExcelJS; `.xls`, formula evaluation, macros, images/charts extraction, hidden sheet UI, sheet picker UI, pagination UI, and workbook productization remain unsupported.
- DOCX remains `.docx` only via backend Mammoth library usage plus the internal safe HTML-to-markdown text path. `.doc`, `.rtf`, Turndown, Pandoc, LibreOffice, Office-to-PDF, HTML-to-PDF, image extraction, layout fidelity, comments/revisions productization, external resources, embedded objects, macros, and shell/external process conversion remain unsupported.
- Safety-Gate-1 removed raw renderer `ipcRenderer` exposure and sealed the identified image source arbitrary local-path-read entry. Safety-Gate-2 found no same-class P0/P1, no DFC renderer DTO privacy P0/P1, and made no code changes. Gate-3 is skipped.
- The two remaining owner-gated directions are Packaging / smoke confidence and Heavy runtime owner decision. Packaging / smoke confidence is recommended first because it validates the existing Phase 1 and backend-only pilot paths before expanding into Office/PDF/PS-EPS/external-engine work.

## Recommended next round

Start a Packaging / smoke confidence owner package, or write a Heavy runtime owner-decision memo for Office-to-PDF, HTML-to-PDF, PS/EPS, or external engine sandbox. Do not add runtime formats, dependencies, DB schema, IPC shape, Send Plan main-flow changes, asset-model changes, UI, Playwright/Electron harness, or external engines without a new owner decision.

## DFC-M10 packaging / smoke confidence recovery notes

- DFC-M10 is documentation-only. It does not add a smoke harness, runtime, dependency, DB schema, IPC shape, Send Plan flow, asset model, UI, CI integration, packaged installer, external engine, npm audit work, ESLint work, or legacy bridge behavior.
- Added `dfc-m10-packaging-smoke-confidence-owner-memo.md` after read-only inspection of package scripts, Vite/Vitest/Electron config, existing smoke scripts, Playwright dependency, e2e tests, preload tests, and DFC UI seams.
- Existing `verify:live` / `gate:tc14` runs `scripts/gates/tc14-ui-live-smoke.mjs`, which is an OpenRouter chat/completions network smoke and does not launch Electron, browser UI, preload, composer, attachment details, preview, or Send Plan.
- Existing `tests/e2e/*smoke.test.ts` are Vitest fixture replay tests, not real browser/Electron process smoke.
- `playwright` and `@axe-core/playwright` are already present, but no Playwright config, Electron launch helper, packaged smoke runner, or app readiness helper was found.
- M10 stops at owner memo because implementing a reliable real smoke requires a dedicated harness package: launch strategy, isolated `userData`, DB/config/log/temp cleanup, Electron ABI target, app readiness, Windows child-process cleanup, and a DFC fixture seam.
- Recommended next package is an Electron smoke harness using Playwright `_electron` against development or built Electron output. Start with app shell plus scoped preload, then add DFC attachment UI seam only if it does not require app bootstrap, DB schema, Send Plan, asset model, IPC, or UI architecture changes.
- Heavy runtime owner decisions for Office-to-PDF, HTML-to-PDF, PS/EPS, or external engine sandbox should wait until after at least one smoke confidence package lands.

## Recommended next round

DFC-M11 should be an owner-approved Electron smoke harness package. Keep it to one smoke path, no CI, no packaged installer, no OS file picker automation, no runtime expansion, and no broad E2E platform.

## DFC-M11 Electron smoke harness seed recovery notes

- DFC-M11 adds the first real Electron smoke harness seed after Owner approval. It is limited to app shell plus scoped preload confidence and does not implement DFC attachment upload, OS file picker automation, attachment details, preview, selected refs, Send Plan, packaged installer, CI, runtime expansion, DB schema changes, IPC architecture changes, asset model changes, or heavy runtime work.
- Added `npm run test:electron-smoke`, which runs `npm run rebuild:electron`, builds current Vite/Electron artifacts with the existing `vite.config.ts`, and then runs `scripts/smoke/electron-shell-smoke.mjs`.
- Added `scripts/smoke/vite.renderer-smoke.config.ts` so the smoke can start a renderer-only Vite dev server without invoking the interactive Electron dev plugin startup path.
- The smoke launches current `dist-electron/main.js` with Playwright `_electron`, points it at the renderer dev server through `VITE_DEV_SERVER_URL`, waits for `#app` / composer shell readiness, verifies `window.ipcRenderer` is not exposed, and verifies scoped `electronAPI`, `electronStore`, and `dbBridge` preload objects exist.
- The smoke intentionally does not add a Playwright test platform, Playwright config, fixture framework, CI integration, packaged installer smoke, or true DFC attachment flow.

## Recommended next round

If M11 validation is stable, DFC-M12 can add one DFC attachment smoke seam on top of the harness. Keep it to one backend-owned option/preview/send-gate observation and stop if it requires app bootstrap, DB schema, Send Plan, asset model, IPC architecture, UI architecture, OS file picker, or packaged installer changes.

## DFC-M12 Electron DFC attachment smoke seam recovery notes

- DFC-M12 extends the M11 Electron smoke harness with one controlled DFC attachment UI seam. It remains a smoke-confidence package, not a production DFC runtime or upload feature.
- The seam is gated to development mode and the `?sv-electron-smoke-dfc=1` URL query. It injects a deterministic draft attachment, backend-shaped markdown option DTO, selected derived-asset refs, and preview DTO into the existing attachment details UI path for smoke observation.
- `npm run test:electron-smoke` now launches the app with that query and verifies app shell readiness, composer visibility, scoped preload objects, absence of raw `window.ipcRenderer`, the DFC attachment chip, attachment details dialog, markdown option, and selected-option preview text.
- The seam intentionally does not use the OS file picker, real upload persistence, DB fixture setup, Send Plan service execution, package installer smoke, CI, runtime expansion, DB schema changes, IPC/preload architecture changes, asset model changes, or heavy runtime work.
- Validation passed: `git diff --check`; `npx vue-tsc --noEmit --pretty false`; `npm run test:electron-smoke`. The smoke rebuilds to the Electron ABI target before launch.

## Recommended next round

DFC-M13 should only attempt a real backend-owned DFC attachment smoke if it can remain low-intrusion without app bootstrap, DB schema, Send Plan, asset model, IPC/preload, OS file picker, packaged installer, or CI changes. Otherwise stop smoke expansion and move to the heavy runtime owner-decision package.

## DFC-M13 backend-owned attachment smoke recovery notes

- DFC-M13 promotes the M12 controlled Electron smoke seam into a backend-owned DFC attachment smoke while keeping the same low-intrusion boundary.
- The smoke runner creates a temporary markdown fixture under the smoke temp directory and calls a DEV/query-gated page seeder. The seeder uses existing backend APIs through `dbBridge`: `fileIngestion.ingestLocalFile`, `conversationDraft.addAttachment`, `conversationDraft.ensureDfcOptions`, `conversationDraft.updateAttachmentSettings`, and `conversationDraft.getDfcPreview`.
- The smoke verifies app shell readiness, composer visibility, scoped preload objects, absence of raw `window.ipcRenderer`, backend-created `assetId` / `attachmentId`, backend-owned markdown `optionId`, attachment chip/details visibility, markdown option visibility, and selected-option preview text from the backend derived asset.
- `npm run test:electron-smoke` now includes `npm run build:worker` after `npm run rebuild:electron`. M13 needed this because the backend-owned smoke touches current DB worker DFC methods; without building the worker, Electron used stale worker code and failed with `Unknown method: conversationDraft.ensureDfcOptions`.
- M13 does not add OS file picker automation, packaged installer smoke, CI, full E2E framework, DB schema changes, Send Plan main-flow changes, asset model changes, DFC option semantic changes, runtime expansion, dependency changes, or external engines.
- Validation passed: `git diff --check`; `npx vue-tsc --noEmit --pretty false`; `npm run test:electron-smoke`. The final ABI target is Electron because the smoke rebuilds `better-sqlite3` for Electron before launch.

## Recommended next round

Close the DFC smoke confidence path here unless a narrowly scoped Send Plan observation can be added without changing app bootstrap, DB schema, Send Plan main-flow, asset model, IPC/preload architecture, packaged installer, CI, or OS file picker behavior. The recommended next package is a heavy runtime owner decision memo for Office-to-PDF, HTML-to-PDF, PS/EPS, and external engine sandbox boundaries.

## DFC-M14 heavy runtime decision recovery notes

- DFC-M14 is documentation-only. It does not implement heavy runtime conversion, add an external engine, add dependencies, change DB schema, change Send Plan main-flow, change asset model, change DFC option semantics, extend smoke coverage, add CI, or address broad code-health work.
- Added `dfc-m14-heavy-runtime-decision-external-engine-boundary.md` as the unified owner decision for HTML->PDF, Office/DOCX->PDF, PS/EPS->PDF, and generic external engine sandbox foundation.
- Read-only findings: `pdf_attachment` already exists as DFC target vocabulary and maps derived PDF outputs to `sendStrategy: file_attachment` plus `derived_asset` refs, but no HTML/Office/PS-EPS runtime currently writes a generated PDF `derived_asset`.
- Existing `src/next/file-type` external process/engine code provides useful safety primitives (`externalProcessPolicy`, `externalProcessRunner`, engine registry, runtime package inventory), but it is currently file-type/plugin infrastructure, not a complete DFC conversion sandbox.
- Dependency/engine inventory: Playwright exists for smoke; Puppeteer, Ghostscript, LibreOffice runtime, Pandoc runtime, and production Chromium conversion wiring are not approved or present for DFC heavy runtime use.
- Recommendation order: first DFC external engine/rendered-output sandbox foundation; second HTML->PDF `pdf_attachment` pilot after engine choice approval; third Office/DOCX->PDF after LibreOffice/engine package approval; PS/EPS->PDF postposed behind Ghostscript/PS sandbox security decision.
- Do not continue text parser-family expansion as the primary path; the remaining value is rendered-output/PDF attachment confidence and sandboxing.

## Recommended next round

DFC-M15 should implement or document the External Engine Sandbox Foundation. It should not add a real engine. Stop if it requires a new dependency, real conversion, DB schema, Send Plan main-flow, asset model, IPC shape, DFC option semantic change, broad file-type refactor, or renderer DTO expansion.

## DFC-M15 external engine sandbox foundation recovery notes

- DFC-M15 adds `infra/files/dfcConversionSandbox.ts` and `infra/files/dfcConversionSandbox.test.ts` as a backend-only DFC heavy-runtime sandbox foundation.
- The helper defines controlled sandbox input path planning, controlled output path validation, engine working directory planning, conversion-mode external process policy mapping, sanitized diagnostics, fail-closed run outcomes, cleanup status, a future engine adapter request shape, and a renderer-safe summary shape.
- M15 does not call a real converter and does not implement HTML-to-PDF, Office-to-PDF, PS/EPS-to-PDF, Chromium/Puppeteer/Playwright runtime conversion, LibreOffice, Ghostscript, Pandoc, DB schema, IPC shape, Send Plan main-flow, asset model, DFC target vocabulary, packaged smoke, CI, npm audit, ESLint, or full-suite failure work.
- Targeted tests cover absolute output escape, path traversal, UNC/drive/NUL rejection, output containment, process policy mapping, fail-closed engine results, cleanup after success/failure, output escape blocking, diagnostics redaction, and renderer summary privacy.
- Validation passed: `git diff --check`; `npx vue-tsc --noEmit --pretty false`; `npx vitest --run infra/files/dfcConversionSandbox.test.ts --reporter=dot --silent` with 1 file / 12 tests. No DB worker tests were touched, so no Node ABI rebuild was required.
- M14 docs were already uncommitted when M15 started; do not confuse M15 helper scope with the pre-existing M14 owner decision diff.

## Recommended next round

DFC-M16 should be an HTML-to-PDF Pilot Owner Decision. It must choose whether the future engine is existing Electron/Chromium, Playwright/Chromium as production runtime, or a managed external engine. Do not proceed to implementation until owner approves the engine strategy, dependency/runtime boundary, sandbox policy, and PDF output validation path.

## DFC-M16 HTML-to-PDF engine strategy recovery notes

- DFC-M16 is documentation-only. It does not implement HTML-to-PDF, add an engine, add a dependency, alter packaging, change DB schema, change IPC shape, change Send Plan main-flow, change asset model, change DFC option semantics, extend smoke, or enter Office/PDF / PS-EPS.
- Added `dfc-m16-html-to-pdf-engine-strategy-decision.md` as the owner decision for HTML->PDF `pdf_attachment` engine strategy.
- Read-only findings: Electron is present as app runtime; Playwright is present and used only by the Electron smoke script; Puppeteer is not present; LibreOffice/Ghostscript/Pandoc are not present as DFC conversion runtimes; file-type engine scaffolds are not DFC HTML->PDF runtime implementations.
- Main app BrowserWindow uses sandboxed Electron preferences, but app renderer/preload/session must not be reused for conversion. A future Electron strategy must use a dedicated hidden/offscreen conversion window or service with no app preload and a non-persistent isolated session.
- Recommended order: Playwright Chromium production runtime if owner accepts browser binary/packaging policy; dedicated Electron/Chromium conversion window as fallback; managed external engine package for longer-term alignment; Puppeteer/bundled Chromium not recommended for first pilot; defer only if both browser runtime paths are rejected.
- M17 may proceed only after owner explicitly chooses the engine strategy and approves JS/network/local-file policy, profile isolation, timeout/cleanup, output validation, and PDF `derived_asset` binding.

## Recommended next round

DFC-M17 should implement a minimal HTML->PDF `pdf_attachment` pilot only after owner chooses Playwright Chromium production runtime or dedicated Electron/Chromium conversion window. Keep JS disabled by default, deny external resources/network/local files by default, isolate profile/session per job, validate PDF output, and bind preview/send to the same managed `derived_asset`.

## DFC-M17 HTML-to-PDF browser runtime blocker recovery notes

- DFC-M17 attempted a minimal HTML->PDF `pdf_attachment` backend pilot after Owner approved Playwright Chromium as the first conversion runtime strategy.
- The attempt stopped before commit because Playwright Chromium could not launch: the executable was missing from the local Playwright cache at `C:\Users\m1389\AppData\Local\ms-playwright\chromium_headless_shell-1200\chrome-headless-shell-win64\chrome-headless-shell.exe`.
- `npx playwright install chromium` was not run because adding or downloading a browser binary requires a fresh Owner browser runtime / packaging decision.
- The uncommitted implementation and M17 test diff was reverted from `infra/files/derivativeJobService.ts`, `infra/db/worker/handlers/filePipelineHandlers.ts`, `infra/files/conversationAttachmentService.ts`, and `infra/db/worker.filePipeline.test.ts`.
- No production HTML->PDF runtime is committed. HTML->PDF remains unimplemented; `pdf_attachment` remains vocabulary/contract plus future heavy-runtime target.
- Validation before rollback: `npm run rebuild:node` passed, `git diff --check` passed, `npx vue-tsc --noEmit --pretty false` passed after a type narrowing, and targeted Vitest failed only in the new M17 HTML->PDF worker test due to the missing Chromium executable.

## Recommended next round

Do not resume HTML->PDF implementation until Owner decides Playwright Chromium binary installation and packaging policy. The next package should either approve the browser binary lifecycle and resume M17, or choose the M16 fallback strategy: isolated Electron/Chromium conversion window or managed external engine package.

## DFC-M17A Playwright Chromium runtime packaging decision recovery notes

- DFC-M17A is documentation-only. It does not implement HTML->PDF, download Chromium, change `package-lock.json`, change runtime code, package the app, or wire CI.
- Decision: Playwright Chromium can be the HTML->PDF rendering API, but production must not depend on the user's global Playwright cache, postinstall browser downloads, arbitrary system Chrome/Edge, or the app renderer/preload/session.
- Recommended production packaging: Starverse managed engine/runtime package for Playwright Chromium, with per-platform manifest, pinned Playwright/browser revision, artifact hash, provenance/license metadata, executable discovery, and health checks.
- Runtime auto-download remains disallowed by default. Missing or invalid browser runtime should fail closed with sanitized diagnostics such as `html_pdf_browser_runtime_missing` or `html_pdf_browser_runtime_invalid`, and must not create a ready DerivedAsset or silently fall back to legacy routing.
- Base app size should not grow unless Owner explicitly approves bundling Chromium in the main installer. Preferred shape is optional managed engine package or offline-installable engine artifact.
- M15 remains the sandbox boundary for controlled input copy, output directory/path validation, timeout/cleanup, sanitized diagnostics, and fail-closed result. Browser runtime discovery does not replace sandbox rules.

## Recommended next round

Resume HTML->PDF implementation as DFC-M17B only after Owner approves the managed browser runtime / packaging policy. If Owner rejects managed Playwright Chromium packaging, choose the M16 fallback: dedicated isolated Electron conversion window or managed external engine package.

## DFC-M17B managed browser runtime gate recovery notes

- M17B adds a backend-only managed Playwright Chromium availability gate for the future HTML->PDF `pdf_attachment` runtime.
- The gate expects a Starverse-managed runtime manifest under the app-managed runtime root and validates runtime id, platform, executable path containment, executable existence, optional size, and optional SHA-256 metadata.
- Rejected executable paths include absolute paths, UNC paths, Windows drive-qualified paths, traversal, and NUL bytes. The gate does not accept renderer-provided paths, arbitrary user paths, Playwright cache paths, system Chrome/Edge, or runtime auto-download.
- HTML `conversationDraft.ensureDfcOptions` keeps ready `original_file`, safe `markdown`, and `code` options. It now also exposes a blocked `pdf_attachment` candidate when the managed browser runtime is missing or invalid.
- Runtime missing/invalid states do not launch Playwright, do not generate PDFs, do not create ready `converted_pdf` DerivedAssets, and do not introduce legacy fallback.
- Diagnostics remain symbolic: `html_pdf_runtime_missing`, `html_pdf_runtime_manifest_invalid`, `html_pdf_runtime_executable_missing`, `html_pdf_runtime_path_rejected`, and `html_pdf_runtime_platform_unsupported`.

## Recommended next round

Do not claim HTML->PDF support yet. M17C real PDF generation should start only after Owner provides an approved managed Chromium runtime artifact or test fixture path and accepts the browser binary packaging/update policy from M17A.

## DFC-M18 managed browser runtime package scaffold recovery notes

- M18 extends the M17B runtime gate into a managed Chromium runtime package scaffold. It does not download Chromium, run Playwright, generate PDFs, package the app, add CI, or implement HTML->PDF conversion.
- The scaffold manifest requires `packageId: starverse.dfc.playwright-chromium`, `runtimeId: playwright-chromium-html-pdf`, platform, relative executable path, Playwright version, browser revision, SHA-256, size, provenance, and license metadata. Capabilities may include `html_to_pdf`.
- The gate rejects absolute paths, UNC paths, Windows drive-qualified paths, traversal, NUL bytes, missing executables, unsupported platforms, invalid manifest shape, incomplete package metadata, size mismatch, and hash mismatch.
- New symbolic diagnostic: `html_pdf_runtime_metadata_incomplete`. Existing runtime diagnostics remain symbolic and sanitized.
- Tests use a temporary fake runtime package with a tiny stub executable and manifest metadata. No real Chromium binary, native artifact, Playwright cache, system browser, or package-lock change is introduced.

## Recommended next round

HTML->PDF remains runtime-gated unavailable. Next choose production package/installer policy for distributing the managed Chromium runtime, or approve a dev-only M19 generation pilot with an explicit managed runtime artifact for local tests.

## DFC-M19R-A main-process Electron conversion service boundary recovery notes

- M19R-A switches away from the Playwright Chromium binary path and establishes only the internal boundary for a future Dedicated Electron HTML->PDF runtime.
- Added a shared internal request/response contract for worker/backend to main-process conversion calls, with controlled sandbox input/output descriptors, timeout, disabled-by-default JavaScript/network/local-file policy flags, symbolic diagnostics, and renderer-safe summaries.
- Added a backend bridge seam that fails closed when the main-process conversion service is unavailable. This is not a renderer IPC API.
- Added a main-process service skeleton under `electron/services` that validates requests, blocks unsupported conversion kinds, and returns unavailable for `html_to_pdf` until a dedicated conversion window adapter is implemented.
- M19R-A does not create BrowserWindow or webContents, does not call printToPDF, does not generate PDFs, and does not connect DFC `conversationDraft.ensureDfcOptions` or derivative jobs to the service.
- The known unrelated dirty file `infra/files/enginePluginLifecycleService.test.ts` belongs to another session and must remain untouched/uncommitted for this package.

## Recommended next round

M19R-B may implement the dedicated hidden/offscreen Electron conversion window adapter behind the M19R-A service boundary. It must keep app renderer, app preload, user session/cookies/storage, network, local-file access, downloads, popups, and extra navigation isolated or blocked by default.

## DFC-M19R-B dedicated Electron conversion window adapter recovery notes

- M19R-B implements the main-process Dedicated Electron HTML->PDF adapter behind the M19R-A service boundary.
- The adapter creates a hidden BrowserWindow through an injected/default factory with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`, `javascript: false`, no preload, and a per-job non-persistent partition.
- It reads controlled sandbox HTML, loads it as a data URL, blocks window open, arbitrary navigation, downloads, network/external resources, and local-file requests, then calls `webContents.printToPDF` and writes only to the validated controlled output path.
- M15 sandbox output validation is used before writing output. Failed, blocked, unavailable, or timed-out conversions return no output descriptor.
- Cleanup attempts to clear temporary session storage and destroy the conversion window after success and failure.
- M19R-B does not wire DFC generation, does not modify `DerivativeJobService`, does not change `conversationDraft.ensureDfcOptions`, and does not create ready `converted_pdf` / `pdf_attachment` DerivedAssets.
- Known unrelated dirty test files from parallel sessions remain outside this package and must not be staged or committed with M19R-B.

## Recommended next round

M19R-C can wire DFC `converted_pdf` generation to the main-process service boundary if worker/main invocation can remain internal, fail-closed, sanitized, and non-renderer-exposed. Keep `original_file`, HTML safe markdown/code, selected refs, preview/send same-source, and no-legacy-fallback invariants intact.
- M19R-B validation passed for scoped M19R-B files: diff check, service targeted Vitest, and adapter targeted Vitest passed. `vue-tsc` was attempted and failed only in parallel unrelated `src/ui-app/components/ChatAppComposer.webSearchSendGuard.test.ts` errors; no M19R-B TypeScript errors remain.

## DFC-M19R-C DFC HTML-to-PDF generation wiring recovery notes

- M19R-C wires DFC `converted_pdf` generation to the internal main-process Electron conversion service boundary.
- The DB worker/backend path uses the internal electron conversion bridge and does not import `BrowserWindow`, `webContents`, or other Electron main-only APIs.
- Eligible managed local `.html` / `.htm` assets can produce a ready `pdf_attachment` DerivedAsset when the main-process service succeeds.
- Ready PDF options use `targetKind: pdf_attachment`, `sendStrategy: file_attachment`, and `sendAssetRefs: derived_asset`.
- PDF preview is metadata-only and uses the same selected derived asset. It does not read or expose PDF body, storage path, sandbox path, storage ref, file URL, content token, full hash, or raw HTML body.
- Conversion service unavailable, blocked, failed, or timed out remains fail-closed and creates no ready DerivedAsset. Unavailable/failed PDF candidates cannot become valid ready selected options.
- `original_file`, HTML safe `markdown`, and HTML `code` options remain independent and available when their existing paths are valid.
- Tests use a fake conversion bridge for backend integration. M19R-B remains the adapter-level coverage for hidden conversion window policy, `printToPDF`, network/local-file blocking, JavaScript disabled policy, and cleanup.
- Known parallel dirty test files remain outside this package and must not be staged or committed with M19R-C.

## Recommended next round

Run a focused Electron HTML-to-PDF hardening package before broad support claims: more timeout/failure diagnostics, cleanup assertions, production runtime availability checks, and risk review. Do not add renderer conversion IPC or expand to Office->PDF / PS-EPS without a fresh owner decision.

## DFC-M19R-D Electron HTML-to-PDF hardening recovery notes

- M19R-D hardens the M19R-C DFC HTML-to-PDF generation path without expanding runtime scope.
- Adapter tests now cover BrowserWindow creation failure, HTML load failure, `printToPDF` failure, timeout, non-PDF output, controlled output descriptor mismatch in adapter code, resource blocking, and cleanup.
- Backend worker tests now cover conversion bridge `failed`, `timed_out`, and success-with-invalid-PDF output. These paths create no ready `converted_pdf` DerivedAsset and expose only failed/unavailable PDF candidates.
- Backend sandbox cleanup now also runs when a conversion service returns success but the output is missing or not a PDF.
- Ready PDF semantics remain `pdf_attachment` + `file_attachment` + `derived_asset`; preview remains metadata-only; Send Plan remains selected-ref/DerivedAsset-authoritative.
- Renderer still has no conversion IPC, and the DB worker/backend still does not import Electron main-only APIs.
- Office->PDF and PS/EPS remain unsupported.

## Recommended next round

Either close out the HTML-to-PDF pilot with a production-readiness owner decision, or open a separate Office->PDF owner memo. Do not add new heavy runtimes until the HTML-to-PDF pilot boundary and packaging/runtime expectations are accepted.

## DFC-M20 HTML-to-PDF pilot closeout recovery notes

- M20 is documentation-only and closes the current Electron-backed HTML-to-PDF pilot phase.
- Current supported pilot scope: managed local `.html` / `.htm` assets can produce `converted_pdf` DerivedAssets exposed as DFC `pdf_attachment` options with `file_attachment` + `derived_asset` semantics.
- PDF preview remains metadata-only; Send Plan remains selected-ref plus verified DerivedAsset authoritative; DFC-managed selected PDF options do not silently fall back to legacy routing.
- Dedicated Electron conversion window policy remains: no app renderer reuse, no app preload, no user session reuse, per-job temporary session, JavaScript disabled, network/external resources blocked, local file access blocked, popups/downloads/arbitrary navigation blocked.
- Failure, timeout, unavailable service, output escape, missing output, and invalid/non-PDF output remain fail-closed and create no ready DerivedAsset.
- Production readiness decision: allow backend pilot support, but do not declare broad production readiness until a real Electron smoke or packaged/runtime confidence path exercises an actual HTML-to-PDF job.
- Office->PDF and PS/EPS remain unsupported and require separate owner decisions.

## Recommended next round

Prefer M21 HTML-to-PDF packaged/electron smoke confidence before Office->PDF. Choose M21 Office->PDF owner decision first only if Owner explicitly prioritizes expanding runtime family over de-risking the existing HTML-to-PDF pilot.

## DFC-M21 HTML-to-PDF Electron smoke confidence recovery notes

- M21 extends the existing `npm run test:electron-smoke` path with a real app-runtime HTML-to-PDF DFC smoke seam.
- The smoke remains query-gated and does not add renderer IPC, packaged installer smoke, CI, OS file picker automation, or a full E2E platform.
- The new seeder ingests a managed local HTML fixture, adds it to the active draft, runs `conversationDraft.ensureDfcOptions`, selects the backend-owned `pdf_attachment` option, requests metadata-only preview, and refreshes the attachment details state.
- The smoke runner asserts the selected PDF option uses `file_attachment` with a `derived_asset`, preview is metadata-only, and `original_file`, safe `markdown`, and `code` options remain available.
- Raw `window.ipcRenderer` remains absent in the smoke. Detailed JS/network/local-file blocking remains covered by M19R-D targeted tests rather than duplicated in the smoke.
- Validation passed: `git diff --check`; `npx vue-tsc --noEmit --pretty false`; `npm run test:electron-smoke`. The smoke rebuilt to the Electron ABI, built the DB worker, generated a real PDF derived asset, and observed the metadata-only PDF preview.
- Office->PDF and PS/EPS remain unsupported.

## Recommended next round

If Owner accepts this smoke confidence, proceed to an Office->PDF owner decision. If broader HTML-to-PDF exposure is desired first, run a production-readiness hardening package focused on packaged/runtime smoke and default exposure gates.

## DFC-M22 Office-to-PDF owner decision recovery notes

- M22 is documentation-only and decides the next Office-to-PDF route after HTML-to-PDF backend pilot plus real Electron smoke confidence.
- Recommended strategy: DOCX-first Office-to-PDF should use LibreOffice headless as a Starverse managed external engine package, gated by runtime/package availability before real conversion is enabled.
- M15 `dfcConversionSandbox` should be reused for controlled input/output path planning, output validation, process policy mapping, cleanup status, fail-closed outcomes, and sanitized diagnostics.
- The M19R Electron conversion service should not be reused directly for LibreOffice; it is a BrowserWindow/`printToPDF` main-process boundary. Office-to-PDF should use the external process policy/runner and managed engine package contracts instead.
- Existing file-type layer LibreOffice traces (`libreOfficeRunner`, engine registry, runtime package inventory) are useful prior art and package-contract evidence, but they are not DFC Office-to-PDF support.
- Recommended first support scope remains `.docx` -> `pdf_attachment` only. `.doc`, `.rtf`, macro-enabled Office formats, Office families beyond DOCX, PS/EPS, system LibreOffice production fallback, and real conversion are still unsupported.
- Production policy should block macros, external links/resources, embedded object execution, network access, arbitrary renderer paths, and output path escapes by default. Diagnostics must remain symbolic/sanitized.
- System LibreOffice is not approved as production fallback. A dev-only diagnostic fallback would need a separate owner-approved package.

## Recommended next round

Proceed with M23 LibreOffice managed engine gate / package scaffold. Do not implement real Office-to-PDF conversion until the managed engine availability, package metadata, path rejection, diagnostic redaction, and unavailable candidate behavior are tested.

## DFC-M23 LibreOffice managed engine gate recovery notes

- M23 adds a LibreOffice managed runtime gate/package scaffold for the future DOCX-first Office-to-PDF path.
- New gate module: `infra/files/dfcManagedLibreOfficeRuntime.ts`.
- The expected package contract is `starverse.dfc.libreoffice` / `libreoffice` / `libreoffice-office-pdf` with a managed executable relative path, LibreOffice/package versions, artifact and executable hash/size metadata, provenance, license, notices, capabilities `office_to_pdf` and `docx_to_pdf`, minimum contract version, and security policy metadata requiring macros/network/external links disabled plus isolated profile.
- The availability gate returns only symbolic diagnostics: `office_pdf_runtime_missing`, `office_pdf_runtime_manifest_invalid`, `office_pdf_runtime_executable_missing`, `office_pdf_runtime_path_rejected`, `office_pdf_runtime_platform_unsupported`, and `office_pdf_runtime_metadata_incomplete`.
- DOCX `conversationDraft.ensureDfcOptions` can expose a blocked/unavailable `pdf_attachment` candidate through the existing DFC generation-state option path when LibreOffice runtime is missing or invalid.
- DOCX `markdown` and `original_file` remain unaffected. `.doc`, `.rtf`, and `.docm` remain unsupported and do not expose Office-to-PDF candidates.
- M23 does not bundle LibreOffice, does not run `soffice`, does not use system LibreOffice, does not generate PDF, does not create ready `converted_pdf` DerivedAssets, and does not change DB schema, renderer IPC shape, Send Plan main-flow, asset model, DFC vocabulary, or HTML-to-PDF behavior.
- Validation passed: `git diff --check`; `npx vue-tsc --noEmit --pretty false`; `npx vitest --run infra/files/dfcManagedLibreOfficeRuntime.test.ts --reporter=dot --silent`; `npx vitest --run infra/db/worker.filePipeline.test.ts -t "LibreOffice|Office PDF|DOCX pdf_attachment|unsupported" --reporter=dot --silent`. `npm run rebuild:node` was run before DB worker targeted tests.
- Risk review found one P1 symlink escape issue in executable path confinement; M23 fixed it by validating executable `realpath` remains inside the managed runtime root and adding a symlink escape regression test.

## Recommended next round

Proceed to M24 Office-to-PDF conversion adapter only after Owner approves a real managed LibreOffice runtime artifact or a fake-adapter strategy for tests. Do not run `soffice` or claim production Office-to-PDF support until package availability, process sandboxing, output validation, diagnostics, and smoke confidence are approved.

## DFC-M24 Office-to-PDF conversion adapter skeleton recovery notes

- M24 adds `infra/files/dfcLibreOfficePdfAdapter.ts` as a DOCX-first LibreOffice PDF adapter skeleton.
- The adapter uses M15 sandbox planning and M23 managed LibreOffice execution descriptors to construct a controlled `shell: false` external process plan.
- Tests use only an injected fake process runner. M24 does not run real `soffice`, does not use system LibreOffice, does not submit a LibreOffice binary, and does not generate production Office-to-PDF output.
- Command planning uses the managed runtime executable only, controlled sandbox input/output directories, a controlled working directory, an isolated LibreOffice user profile under the sandbox, empty environment, and a configurable timeout.
- Output validation requires the expected PDF path to remain under the controlled output directory, exactly one expected PDF output, and a minimal `%PDF-` signature. Missing, non-PDF, escaped, ambiguous, failed, or timed-out outputs fail closed with no output descriptor.
- M24 does not wire the adapter into `conversationDraft.ensureDfcOptions`, `DerivativeJobService`, ready `converted_pdf` generation, preview, or Send Plan. DFC DOCX PDF candidate behavior remains the M23 blocked/unavailable gate behavior.
- DOCX `markdown` and `original_file` remain unaffected. `.doc`, `.rtf`, and `.docm` remain unsupported. No DB schema, renderer IPC shape, Send Plan main-flow, asset model, DFC vocabulary, or HTML-to-PDF pipeline changed.
- Validation passed: `git diff --check`; `npx vue-tsc --noEmit --pretty false`; `npm run rebuild:node`; runtime gate and adapter targeted Vitest passed with 18 tests; DB worker DOCX Office PDF candidate targeted Vitest passed with 6 tests and 44 skipped.

## Recommended next round

M25 should decide whether to approve a dev-only real managed LibreOffice artifact path for local conversion tests or continue fake-process hardening and DFC generation seam design. Do not claim production Office-to-PDF support until real managed runtime packaging, conversion output validation, no-fallback behavior, and smoke confidence are accepted.

## DFC-M25 LibreOffice managed plugin/runtime integration recovery notes

- M25 aligns the LibreOffice Office-to-PDF runtime gate with the Starverse managed plugin/runtime pattern used by Magika.
- The LibreOffice manifest now carries plugin/runtime package identity (`libreoffice`, `libreoffice-office-pdf`, `starverse.dfc.libreoffice`), plugin version, runtime kind `managed_external_process`, official release/package reference metadata, attribution, required capabilities, and security policy metadata.
- The gate can map a valid fake LibreOffice runtime summary into the external engine registry manifest contract with `kind: plugin`, `document_conversion`, DOCX input support, sandbox enabled, and network disabled.
- Disabled plugin/runtime state fails closed with symbolic `office_pdf_runtime_disabled`.
- The gate still rejects missing, invalid, unsupported-platform, missing-executable, path-escape, symlink-escape, and metadata-incomplete packages with sanitized diagnostics.
- No real `soffice` runs, no system LibreOffice lookup or PATH fallback is used, no LibreOffice binary is submitted, and no real Office-to-PDF DerivedAsset is generated.
- DOCX PDF candidate behavior remains blocked/unavailable only. DOCX `markdown` and `original_file` remain unaffected. `.doc`, `.rtf`, and `.docm` remain unsupported.
- No DB schema, renderer IPC shape, Send Plan main-flow, asset model, DFC vocabulary, or HTML-to-PDF pipeline changed.

## Recommended next round

Proceed to M26 fake-process DFC generation seam or continue managed package hardening. Do not run real LibreOffice or declare production Office-to-PDF support until managed artifact distribution, installer policy, real execution, output validation, no-fallback behavior, and smoke confidence are separately approved.

## DFC-M26 Office PDF fake-process DFC seam recovery notes

- M26 wires DOCX `pdf_attachment` generation into the backend DFC seam only when a valid managed LibreOffice runtime package is available and an internal fake process runner is injected.
- Without the injected fake runner, DOCX Office PDF behavior remains M25: the managed runtime gate can be available, but the `pdf_attachment` candidate remains blocked with `conversion_not_implemented` and no ready DerivedAsset is generated.
- The successful fake-process seam uses the M24 adapter skeleton and writes a verified `converted_pdf` DerivedAsset with `targetKind: pdf_attachment`, `sendStrategy: file_attachment`, `sendAssetRefs: derived_asset`, `usage: preview_and_send`, and converter identity `starverse-libreoffice-docx-pdf` / `skeleton-1`.
- The converter metadata explicitly records `conversionMode: fake_process_test_seam`; this must not be interpreted as real LibreOffice production support.
- Preview remains metadata-only and Send Plan remains selected-ref / verified-DerivedAsset authoritative. The seam must not infer Office PDF behavior from extension or MIME fallback.
- Fake process failure, timeout, missing/invalid runtime, missing runner, missing output, non-PDF output, escaped output, and ambiguous output all fail closed with no ready DerivedAsset.
- DOCX `markdown` and `original_file` remain unaffected. `.doc`, `.rtf`, and `.docm` remain unsupported.
- M26 still does not run real `soffice`, use system LibreOffice or PATH fallback, submit a LibreOffice binary, change DB schema, expose renderer IPC, change Send Plan main-flow, change asset model, change DFC vocabulary, or alter HTML-to-PDF behavior.

## Recommended next round

Proceed to Office PDF fake-process hardening/smoke planning, or make an owner decision for a real managed LibreOffice artifact and dev-only `soffice` execution package. Do not run real LibreOffice or declare production Office-to-PDF support without separate approval for binary distribution, installer/update policy, real execution sandboxing, smoke confidence, and exposure gates.

## DFC-M27 Office PDF fake-process hardening recovery notes

- M27 hardens the M26 fake-process DFC seam without moving to real LibreOffice execution.
- Adapter coverage now asserts cleanup is attempted after fake success and fake failure when requested.
- Worker coverage now asserts fake timeout, missing output, non-PDF output, and ambiguous output fail closed with no ready `converted_pdf` DerivedAsset and no valid ready selection.
- Office PDF output-validation failures in the backend seam now map to `derivative_output_write_failed`; fake timeout maps to `derivative_task_timeout`.
- Successful fake-process output still uses `derivedKind: converted_pdf`, `targetKind: pdf_attachment`, `sendStrategy: file_attachment`, `sendAssetRefs: derived_asset`, `usage: preview_and_send`, and metadata-only preview.
- Send Plan continues to use selected refs plus verified DerivedAsset metadata and does not infer Office PDF behavior from extension or MIME fallback.
- Managed runtime gate regressions from M23/M25 remain the authority for missing, disabled, invalid manifest, symlink/path escape, unsupported platform, and metadata-incomplete states.
- M27 still does not run real LibreOffice, run `soffice`, discover system LibreOffice, use PATH fallback, submit a LibreOffice binary, support `.doc`/`.rtf`/`.docm`, alter HTML-to-PDF, or change DB schema, renderer IPC shape, Send Plan main-flow, asset model, or DFC vocabulary.

## Recommended next round

Proceed to an M28 owner decision for a real managed LibreOffice artifact and dev-only `soffice` execution package, or continue package/install policy hardening. Do not enter `.doc`, `.rtf`, `.docm`, Office-family expansion, or production Office-to-PDF support claims before that decision.

## DFC-M28 Managed LibreOffice artifact dev smoke recovery notes

- M28 adds a dev-only managed LibreOffice artifact acquisition and smoke path for the DOCX-first Office-to-PDF line.
- New script: `scripts/dfc/office-pdf-libreoffice-dev-smoke.mjs`; package script: `npm run test:office-pdf-libreoffice-dev-smoke`.
- The default artifact source is the official Document Foundation LibreOffice 25.8.7 Windows x86_64 MSI. The script prepares the runtime under ignored `.external-runtime-work/libreoffice` and generates a managed runtime manifest.
- The generated manifest records plugin/runtime/package identity, platform, executable relative path, LibreOffice/package version, artifact hash, executable hash/size, official provenance/source URL, MPL-2.0 license metadata, attribution/notices metadata, and security policy metadata.
- The dev smoke uses the managed runtime executable descriptor only. It does not use system LibreOffice, PATH fallback, arbitrary user-selected paths, or production auto-download behavior.
- Adapter-level real smoke runs managed `soffice` through the M24 LibreOffice adapter with M15 sandbox input/output/work dirs, isolated profile, `shell: false`, output validation, and cleanup.
- Worker-level DFC real smoke can generate a DOCX `converted_pdf` / `pdf_attachment` DerivedAsset from the managed runtime in dev mode, then verifies metadata-only preview and selected-ref Send Plan authority.
- The LibreOffice binary, MSI, extracted runtime, sandbox output, and temporary work directories must remain outside git. `.external-runtime-work/` remains ignored.
- M28 does not declare production Office-to-PDF support, does not support `.doc`/`.rtf`/`.docm`, does not use system LibreOffice, does not modify DB schema, renderer IPC shape, Send Plan main-flow, asset model, DFC vocabulary, or HTML-to-PDF behavior.

## Recommended next round

Proceed to M29 production managed LibreOffice package/install/update policy and packaged smoke planning before any user-visible Office-to-PDF production claim. Do not expand to `.doc`, `.rtf`, `.docm`, system fallback, or broad production exposure before owner approval.

## DFC-M29 LibreOffice production package policy recovery notes

- M29 is documentation-only. It defines the production managed LibreOffice package, install/import, update, revocation, offline import, packaged smoke, and user-visible enablement policy after the M28 dev managed `soffice` smoke.
- Production Office-to-PDF must trust only Starverse managed LibreOffice packages. System LibreOffice, PATH fallback, common install locations, arbitrary user executable paths, renderer-provided paths, default postinstall downloads, implicit runtime auto-download, and M28 `.external-runtime-work` dev artifacts are not production authority.
- The production manifest must include package/plugin/runtime identity, platform/arch, executable relative path, LibreOffice version, package version, source/provenance URL, official release metadata, artifact hash, executable hash/size, package size, license/notices/attribution, capabilities `office_to_pdf` and `docx_to_pdf`, minimum Starverse/contract versions, platform support matrix, security policy metadata, and update/revocation metadata.
- Install/import policy requires staged acquisition, artifact hash validation before extraction, manifest validation before activation, executable hash/size validation, realpath containment, symlink escape rejection, atomic activation, rollback to previous known-good when allowed, and cleanup of temp/staging directories.
- Revoked, expired, incomplete, unsupported, invalid, disabled, or missing packages must keep DOCX PDF unavailable/blocked and must not run `soffice` or fall back to legacy routing.
- Packaged smoke is required before user-visible production exposure. It must prove managed package discovery, hash validation, real DOCX-to-PDF conversion, controlled output, metadata-only preview, selected-ref Send Plan authority, missing-runtime fail-closed behavior, and no system fallback.
- User-visible enablement should remain experimental until package policy, install/import scaffold, packaged smoke, focused security review, complete diagnostics, and fail-closed behavior are accepted.
- M29 does not download a new artifact, run `soffice`, commit LibreOffice binaries, implement installer/revocation code, implement packaged smoke, support `.doc`/`.rtf`/`.docm`, declare production Office-to-PDF support, or change DB schema, renderer IPC, Send Plan main-flow, asset model, DFC vocabulary, or HTML-to-PDF behavior.

## Recommended next round

Proceed to M30-A LibreOffice managed package import/install scaffold. Do not run real `soffice`, add packaged smoke, enable user-visible Office-to-PDF, or expand to `.doc`, `.rtf`, `.docm` until the package lifecycle scaffold is implemented and reviewed.

## DFC-M30 Managed LibreOffice import scaffold recovery notes

- M30 adds `infra/files/dfcLibreOfficeManagedPackageInstaller.ts` as the DOCX-first Office-to-PDF managed LibreOffice import/install scaffold.
- The helper imports an already prepared managed runtime directory; it does not download LibreOffice and does not discover system LibreOffice.
- Import flow validates source existence, parses the manifest, optionally checks expected artifact SHA-256, rejects revoked packages, rejects symlinks, validates through the M23/M25 runtime gate before and after staging, copies into a controlled staging root, activates into the app-managed active runtime root, captures previous known-good metadata, and cleans failed staging installs.
- Rollback is allowed only to a previous non-revoked known-good runtime that still validates through the runtime gate. Revoked or invalid rollback targets fail closed.
- New dev smoke script: `scripts/dfc/office-pdf-libreoffice-import-dev-smoke.mjs`; package script: `npm run test:office-pdf-libreoffice-import-dev-smoke`.
- The dev import smoke requires the M28 artifact under `.external-runtime-work/libreoffice/managed-runtimes/dfc-office-pdf/libreoffice-office-pdf`. If it is missing, M30 stops and does not auto-download LibreOffice.
- The dev import smoke activates the M28 runtime under `.external-runtime-work/libreoffice/import-smoke-app-root/...` and runs real managed `soffice` through the M24 adapter. Imported-runtime DFC worker real smoke is deferred to M31 because it needs timeout/packaged-smoke tuning beyond the M30 scaffold boundary.
- LibreOffice binaries, MSI files, extracted runtime files, staging output, sandbox output, and temp files remain under ignored `.external-runtime-work` or OS temp locations and must not be staged.
- M30 continues to forbid system LibreOffice, PATH fallback, arbitrary user executable paths, renderer-provided paths, runtime auto-download, postinstall download, `.doc`/`.rtf`/`.docm`, production Office-to-PDF support claims, DB schema changes, renderer IPC changes, Send Plan main-flow changes, asset model changes, DFC vocabulary changes, and HTML-to-PDF changes.

## Recommended next round

Proceed to M31 packaged Office-to-PDF smoke confidence or user-visible experimental gate planning only after Owner accepts the M30 managed import boundary. Do not expand to `.doc`, `.rtf`, `.docm`, system fallback, or production Office-to-PDF claims before that acceptance.

## DFC-M31 Office PDF imported runtime seam validation recovery notes

- M31 validates the M30 imported active managed LibreOffice runtime through both adapter-level import smoke and DFC worker DOCX Office PDF smoke.
- The timeout/ready-ref issue was resolved by allowing explicit long conversion jobs up to 300 seconds, setting the Office PDF DFC job/dev-smoke timeout to 300 seconds, and using an OS temp Starverse-controlled LibreOffice sandbox root for backend DOCX->PDF conversion jobs.
- The default external conversion timeout remains 60 seconds; M31 only raises the maximum cap for explicitly requested long conversions.
- The real DFC smoke uses a minimal DOCX fixture dedicated to Office PDF seam validation and verifies a ready `pdf_attachment` option backed by a `converted_pdf` DerivedAsset.
- Preview remains metadata-only and Send Plan remains selected-ref / verified-DerivedAsset authoritative. The smoke must not infer Office PDF behavior from extension or MIME fallback.
- The imported managed LibreOffice runtime is the only execution source. M31 still forbids system LibreOffice, PATH fallback, arbitrary executable paths, renderer-provided paths, runtime auto-download, postinstall download, and committing LibreOffice binaries or sandbox artifacts.
- Office-to-PDF remains owner-gated / experimental, not production-ready. `.doc`, `.rtf`, and `.docm` remain unsupported.
- M31 does not change DB schema, renderer IPC shape, Send Plan main-flow, asset model, DFC vocabulary, or HTML-to-PDF behavior.

## Recommended next round

Proceed to M32 packaged Office-to-PDF smoke confidence or user-visible experimental enablement gate planning. Do not expand to `.doc`, `.rtf`, `.docm`, system fallback, or production Office-to-PDF claims before owner approval.

## DFC-M32 Deadline closeout / demo readiness recovery notes

- M32 is documentation-only and closes the deadline readiness push after M31.
- Current demo-ready capabilities include: `original_file`, `plain_text`, `markdown`, `code`, CSV/TSV `table_markdown`, HTML safe markdown/code, XLSX `table_markdown` backend pilot, DOCX `markdown` backend pilot, HTML-to-PDF experimental-gated backend pilot with real Electron smoke, and DOCX-to-PDF dev managed-runtime smoke through imported LibreOffice.
- Demo checklist: Electron shell smoke, backend-owned DFC attachment smoke, HTML-to-PDF Electron smoke, and Office-to-PDF imported runtime smoke.
- Explicitly unsupported: `.doc`, `.rtf`, `.docm`, PS/EPS, broad production LibreOffice enablement, packaged installer support, CI runtime smoke, system LibreOffice/PATH fallback, and production Office-to-PDF claims.
- Next-stage route: packaged smoke confidence, user-visible experimental gate, production package update/revocation/offline import implementation, then Office family expansion decision.
- M32 does not change code, tests, DB schema, renderer IPC shape, Send Plan main-flow, asset model, DFC vocabulary, runtime behavior, dependencies, packaged installer, or CI.

## Recommended next round

Proceed to packaged smoke confidence first. If owner prioritizes exposure instead, open a user-visible experimental gate package with explicit diagnostics and fail-closed behavior. Do not expand to `.doc`, `.rtf`, `.docm`, PS/EPS, system fallback, or production Office-to-PDF claims before owner approval.

## Local runtime workdir watcher boundary note

- LibreOffice / external runtime preparation created `.external-runtime-work/` under the repo root.
- Git ignored it, but Vite watcher still scanned it and caused dev renderer white-screen via event-loop stalls.
- Permanent guard: `.external-runtime-work/` must remain in Vite `server.watch.ignored`.
- Future runtime workdirs must follow `docs/maintenance/local-runtime-workdirs.md`.
