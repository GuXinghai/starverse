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

DFC-7 should be an owner-approved DB binding migration and repository test round.

Recommended DFC-7 scope:

- Add explicit DFC binding columns to `draft_attachments` and `message_attachments`.
- Add migration tests and repository persistence tests.
- Keep legacy rows quarantined with `dfc_managed = 0`.
- Do not wire DFC into production Send Plan until binding persistence is verified.
- Do not implement conversions in the migration round.

Do not wire DFC into production Send Plan until the Owner approves the DB/DTO/DerivedAsset decisions.
