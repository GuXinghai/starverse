# DFC-6 Owner Memo: DB Binding Migration Required

Status: owner-level blocker memo after the additive DFC DTO/facade slice. No DB schema, Send Plan behavior, UI behavior, conversion logic, external engines, dependencies, Playwright harness, or legacy migration bridge were changed in DFC-6.

Source of truth: `starverse_format_conversion_preview_v1_2.md`.

Related code commit: `985c53e` (`feat(file-conversion): add DFC DTO boundary and asset facade`).

## Facts

- DFC-6 implemented a safe additive runtime boundary only:
  - DFC sanitized renderer decoders in `src/next/ipc/contracts/dbBridgeContracts.ts`.
  - DFC DTO privacy tests in `src/next/ipc/contracts/dbBridgeContracts.test.ts`.
  - A strict `file_derivatives`-backed DerivedAsset facade helper in `src/shared/files/documentFormatConversion.ts`.
  - Facade tests in `src/shared/files/documentFormatConversion.test.ts`.
- The new DFC decoders are not wired into current UI, Send Plan, IPC channels, or DB repositories.
- The new DerivedAsset facade is not wired into current conversion jobs or Send Plan.
- Read-only mapping found no existing durable fields or metadata slot for:
  - `DraftAttachment.dfcManaged`
  - `DraftAttachment.selectedOptionId`
  - `DraftAttachment.selectedAssetRefs`
  - `MessageAttachment.usedOptionId`
  - `MessageAttachment.usedAssetRefs`
  - `MessageAttachment.targetKind`
  - `MessageAttachment.sendStrategy`
- Current `draft_attachments` still stores legacy `preferred_send_mode` and `url_retention_mode`.
- Current `message_attachments` still stores `asset_id`, `ai_payload_kind`, `processing_status`, `include_in_next_request`, and `excluded_reason`.
- `message_attachments` has no metadata JSON column that could hold DFC used refs without schema work.
- Continuing into DFC-managed Send Plan wiring without durable binding would either lose selected DFC state across draft/message transitions or create an invisible runtime fallback, both conflicting with v1.2 and DFC-3.

## Options

### Option A: explicit columns on existing attachment tables

Add DFC fields directly to `draft_attachments` and `message_attachments`.

Minimum draft fields:

- `dfc_managed INTEGER NOT NULL DEFAULT 0 CHECK (dfc_managed IN (0, 1))`
- `selected_option_id TEXT`
- `selected_asset_refs_json TEXT`

Minimum message fields:

- `used_option_id TEXT`
- `used_asset_refs_json TEXT`
- `target_kind TEXT`
- `send_strategy TEXT`

Tradeoffs:

- Best match for v1.2 draft/message binding.
- Clear `dfcManaged` quarantine boundary.
- Lowest runtime ambiguity.
- Requires DB migration and repository/type/IPC updates.

### Option B: JSON metadata columns

Add `dfc_metadata_json` to draft and message attachment tables.

Tradeoffs:

- Smaller initial column count.
- Harder to query and validate.
- Easier to accidentally mix legacy and DFC semantics.
- Still requires schema migration.

### Option C: sidecar DFC binding tables

Add separate DFC draft/message binding tables keyed by current attachment IDs.

Tradeoffs:

- Keeps legacy tables visually untouched.
- Adds joins and orphan handling.
- Higher repository and transaction complexity.
- Still requires schema migration.

### Option D: no durable migration

Keep DFC binding state in memory or derive it from existing asset/plan data.

Tradeoffs:

- Avoids schema change.
- Does not satisfy v1.2 durable draft/message binding.
- Cannot persist draft-local `selectedOptionId`.
- Cannot snapshot actual sent `usedAssetRefs`.
- Risks silent fallback or historical pollution.

## Recommendation

Choose Option A.

Reasoning:

- It implements the v1.2 contract directly.
- It preserves legacy rows with `dfc_managed = 0`.
- It creates a narrow runtime seam for DFC-managed attachments.
- It lets Send Plan enforce no silent fallback by reading DFC fields only for DFC-managed attachments.
- It avoids a broad compatibility layer and avoids hidden migration behavior.

## Affected Files For The Next Approved Round

Likely DB/schema files:

- `infra/db/schema.sql`
- `infra/db/migrations/ensureFilePipelineSchema.ts`
- `infra/db/migrations/ensureFilePipelineSchema.test.ts`
- possibly `infra/db/worker/runtime.ts` if it mirrors schema/index creation

Likely repository/type files:

- `infra/db/types.ts`
- `infra/db/repo/conversationDraftRepo.ts`
- `infra/db/repo/messageAttachmentRepo.ts`
- `infra/files/conversationAttachmentService.ts`

Likely contract/test files:

- `src/next/ipc/contracts/dbBridgeContracts.ts`
- `src/next/ipc/contracts/dbBridgeContracts.test.ts`
- `infra/files/conversationAttachmentService.test.ts`
- `infra/files/sendPlanService.test.ts` once Send Plan wiring begins

## Migration Impact

- This is a DB migration that changes draft/message attachment semantics.
- Existing legacy rows should default to `dfc_managed = 0`.
- The migration must not infer selected DFC options from legacy `preferred_send_mode`, `native_file`, `hybrid`, `unsupported`, extension, or MIME.
- Any bridge from legacy rows to DFC rows must be a later explicit migration bridge with tests and owner approval.

## Test Impact

Minimum tests for an approved DB-binding round:

- Migration adds all columns with safe defaults.
- Existing legacy draft/message rows remain readable.
- `ConversationDraftRepo` persists `dfcManaged`, `selectedOptionId`, and `selectedAssetRefs`.
- `MessageAttachmentRepo` persists `usedOptionId`, `usedAssetRefs`, `targetKind`, and `sendStrategy`.
- Committing a DFC-managed draft snapshots only selected send refs into message rows.
- Preview-only or unselected derived assets do not enter message `usedAssetRefs`.
- Malformed asset refs are rejected or blocked, not silently coerced.

## Privacy And Security Impact

- The migration should store only opaque `SendAssetRef` IDs, not paths, `fileUrl`, content tokens, file bodies, or full storage refs.
- Full hashes remain internal to file asset/derivative metadata and same-source checks.
- Renderer DTOs should continue to use the sanitized DFC decoder layer added in `985c53e`.
- Ordinary logs must not print raw selected/used asset ref resolution paths or raw file bodies.

## Stop Decision

Stop before DB migration and production Send Plan wiring.

Owner approval is required to implement Option A or any alternative durable binding storage. Without that approval, DFC Phase 1 cannot honestly satisfy draft-local `selectedOptionId`, `selectedAssetRefs`, message `usedAssetRefs`, or no-silent-fallback Send Plan behavior.
