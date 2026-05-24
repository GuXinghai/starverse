# Document Format Conversion Important Context

This file is the recovery entry point after context compression. The source of truth for the document format conversion and preview contract remains `starverse_format_conversion_preview_v1_2.md` in this directory. Do not split the source contract into derived contract files unless the Owner explicitly changes that decision.

## Current status

- Current branch: `docs/dfc-0-format-conversion-foundation`
- Current topic directory: `docs/file-pipeline/document-format-conversion/`
- Current SSOT file: `starverse_format_conversion_preview_v1_2.md`
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
