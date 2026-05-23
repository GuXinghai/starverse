# DFC-5 Runtime Boundary Decision

Status: decision memo only. No production code, DB schema, Send Plan behavior, UI behavior, IPC runtime contract, dependencies, conversion logic, Playwright harness, external engines, or migration bridge are changed in DFC-5.

Source of truth: `starverse_format_conversion_preview_v1_2.md`.

Related records:

- `dfc-2-implementation-design-memo.md`
- `dfc-3-owner-decision-freeze.md`
- `src/shared/files/documentFormatConversion.ts`
- `src/shared/files/documentFormatConversion.test.ts`

DFC-4 was committed at the start of this round as `8fdd187` with message `feat(file-conversion): add DFC contracts and fallback guards`.

## 1. Purpose

DFC-5 freezes the runtime boundaries needed before DFC Phase 1 can enter production wiring:

- Sanitized renderer DTO strategy.
- `DerivedAsset` facade feasibility over existing derivative and preview lineage.
- DB binding migration shape for draft and message attachments.
- Legacy quarantine enforcement plan.

This memo recommends implementation paths, but does not implement them.

## 2. Current Repository Facts

Read-only mapping found these facts:

- `src/next/ipc/contracts/dbBridgeContracts.ts` exposes `DecodedFileAsset` with `sha256`, `storageBackend`, `storageUri`, and `sourceMetaJson`; `DecodedFileDerivative` with `storageUri`, `generator`, and `metaJson`; and `sendPlanAttachmentSchema` with `selectedSendMode`, `fallbackSendModes`, legacy target vocabulary, and lineage hashes.
- `infra/db/repo/messageAssetRepo.ts` returns legacy message asset records with `hash`, `path`, `fileUrl`, and `assetUrl`. `messageAssetRenderSchema` is safer because it omits `path`, `fileUrl`, `hash`, and `bytes`, but the raw contract still exists.
- `infra/db/schema.sql` has `file_assets`, `file_derivatives`, `derivative_jobs`, `message_attachments`, `conversation_drafts`, and `draft_attachments`.
- `draft_attachments` persists `preferred_send_mode` and `url_retention_mode`, but does not persist `dfc_managed`, `selected_option_id`, or `selected_asset_refs_json`.
- `message_attachments` persists `asset_id`, `ai_payload_kind`, `processing_status`, `include_in_next_request`, and `excluded_reason`, but does not persist `used_option_id`, `used_asset_refs_json`, `target_kind`, or `send_strategy`.
- `file_derivatives` has first-class `parent_asset_id`, `derived_kind`, `storage_uri`, `generator`, `status`, and `meta_json`.
- `derivative_jobs` has `input_snapshot_json`, `config_json`, and `output_derivative_id`, but those are job records, not the durable message binding.
- `infra/files/derivativeJobService.ts` already writes some DFC-like text derivative metadata: `sourceHash`, `contentHash`, `targetKind`, `usage`, source MIME/extension/encoding, byte length, and conversion warnings.
- `infra/files/sendPlanService.ts` has a useful lineage gate through `evaluateAttachmentLineageGuard` and `evaluateAttachmentLineageSummary`.
- Current Send Plan still calls `selectAttachmentSendModeInternal` and emits legacy `selectedSendMode`, `native_file`, `hybrid`, and `unsupported` vocabulary.

## 3. Sanitized DTO Runtime Boundary

### Current exposure risks

The current renderer-visible or renderer-decoded surfaces are not safe for DFC-managed attachment expansion:

- `DecodedFileAsset.sha256` exposes full file hashes.
- `DecodedFileAsset.storageUri` and `DecodedFileAsset.storageBackend` expose internal storage references.
- `DecodedFileAsset.sourceMetaJson` can carry lineage fields, diagnostic detail, full hashes, or future storage-like fields.
- `DecodedFileDerivative.storageUri` exposes derivative storage references.
- `DecodedFileDerivative.metaJson` can expose full `sourceHash`, `contentHash`, conversion settings, source metadata, or future converter diagnostics.
- `sendPlanAttachmentSchema.lineage` exposes `sourceHash`, `previewContentHash`, `sendContentHash`, and `conversionSettingsHash`.
- Legacy message asset records expose `path`, `fileUrl`, and full `hash`.

These values are acceptable inside main/infra code when required for IO, dedupe, conversion, cache keys, or send serialization. They must not become the renderer DTO for DFC-managed attachments.

### Field policy

For DFC Phase 1 renderer DTOs:

| Field family | Runtime DTO decision |
| --- | --- |
| `path`, `fileUrl` | Delete from DFC renderer DTOs. Keep only in main/infra internals and explicit shell/image legacy paths. |
| `storageUri`, `storageRef`, `storageBackend` | Delete from DFC renderer DTOs. Resolve through main/infra only. |
| `contentToken` | Delete from DFC renderer DTOs and ordinary logs. |
| File body or body snippets | Delete from attachment metadata DTOs. Preview text must use an explicit preview endpoint with size and status gates. |
| Full `sha256`, `sourceHash`, `contentHash`, `previewContentHash`, `sendContentHash`, `conversionSettingsHash` | Omit by default. If user-visible diagnostics need correlation, expose a short diagnostic hash prefix only, never the full hash. |
| `sourceMetaJson`, `metaJson` | Replace with typed sanitized fields: status, `targetKind`, warnings, sanitized diagnostics, compatibility, and user-safe metadata. |
| Exact `sizeBytes` | Allowed for renderer display. Use bucketed sizes only for logs or telemetry if those are later introduced. |
| `assetUrl` | Allowed only for image/message asset render routes that are already mediated by the custom protocol. DFC document DTOs should prefer opaque IDs and explicit preview APIs. |

### Recommendation

DFC Phase 1 must land a sanitized runtime DTO before any production DFC attachment data is consumed by renderer or UI.

Recommended shape:

- Keep existing legacy DTOs stable for historical display and non-DFC paths.
- Add a DFC-specific sanitized DTO or decoder that returns only:
  - Opaque attachment ID and raw file ID.
  - Display filename.
  - Size.
  - `dfcManaged`.
  - `selectedOptionId`.
  - Current `targetKind`.
  - Current status.
  - Sanitized warnings and diagnostics.
  - Optional short diagnostic hash prefix fields only if needed.
- Do not expose raw `DecodedFileAsset`, `DecodedFileDerivative`, or send-plan lineage hashes directly to DFC renderer UI.

### Minimum code files for a future approved round

If the Owner approves runtime DTO work, the smallest implementation slice should be limited to:

- `src/next/ipc/contracts/dbBridgeContracts.ts` or a new DFC-specific contract module under `src/next/ipc/contracts/`.
- `src/next/files/` client wrapper for sanitized DFC attachment DTOs if a renderer client is needed.
- Tests near `src/next/ipc/contracts/dbBridgeContracts.test.ts` or a new DFC DTO contract test.
- Existing `src/shared/files/documentFormatConversion.ts` sanitizer may be reused or split if runtime contracts need a distinct decoder.

### Risk and rollback

Risk:

- Removing fields from existing DTOs could break UI paths that still rely on them.
- Adding a parallel sanitized DFC DTO has lower risk than broad removal.

Rollback:

- Keep the sanitized DFC DTO additive and DFC-only at first.
- Do not change existing legacy message asset render DTOs in the same round.
- If a renderer path needs sensitive data, block DFC UI consumption rather than widening the DTO.

## 4. DerivedAsset Facade Feasibility

### Existing storage capability

The existing derivative system can partially represent the v1.2 `DerivedAsset` contract:

| DFC required field | Existing mapping candidate | Current state |
| --- | --- | --- |
| `assetId` | `file_derivatives.id` | First-class. |
| `sourceFileId` | `file_derivatives.parent_asset_id` | First-class. |
| `sourceHash` | `file_assets.sha256` or `file_derivatives.meta_json.sourceHash` | Available for text derivatives today. |
| `contentHash` | `file_derivatives.meta_json.contentHash` | Available for text derivatives today; must be required for DFC send assets. |
| `targetKind` | `file_derivatives.meta_json.targetKind` | Available for text derivatives today; not first-class. |
| `conversionSettingsHash` | `file_derivatives.meta_json.conversionSettingsHash` or job `config_json` digest | Not consistently present today; must be added as a DFC metadata convention. |
| `usage` | `file_derivatives.meta_json.usage` | Available for text derivatives today; must be required for DFC. |
| `storageClass` | `file_derivatives.meta_json.storageClass` or binding-derived state | Not present today; must be added or derived from binding rows. |
| Converter identity | `file_derivatives.generator` plus optional metadata | `generator` is first-class; converter name/version need stricter metadata. |
| Binding refs | Draft/message DFC binding fields | Not present today; should be derived from attachment binding records, not hidden in derivative metadata. |

### Facade recommendation

The existing `file_derivatives` mechanism is feasible for DFC Phase 1 as a `DerivedAsset` facade if the future implementation adds a strict DFC metadata convention.

Recommended facade mapping:

- `DerivedAsset.assetId` = `file_derivatives.id`.
- `DerivedAsset.sourceFileId` = `file_derivatives.parent_asset_id`.
- `DerivedAsset.kind` / `targetKind` = `meta_json.targetKind`, validated against DFC target kinds and never inferred from `derived_kind` alone.
- `DerivedAsset.mime` = `file_derivatives.mime`.
- `DerivedAsset.contentPath` = main/infra resolution of `storage_uri`; never renderer-visible.
- `DerivedAsset.usage` = `meta_json.usage`, required for DFC assets.
- `DerivedAsset.storageClass` = `meta_json.storageClass` or binding-derived state, with Phase 1 values `temporary`, `draft_bound`, and `message_bound`.
- `DerivedAsset.sourceHash` = `meta_json.sourceHash` if present, otherwise `file_assets.sha256`.
- `DerivedAsset.contentHash` = `meta_json.contentHash`, required for DFC send and preview/send same-source gates.
- `DerivedAsset.conversionSettingsHash` = required `meta_json.conversionSettingsHash`.
- `DerivedAsset.converterName` and `converterVersion` = structured metadata, with `file_derivatives.generator` retained as the legacy generator string.
- Binding refs = resolved through DFC draft/message attachment binding fields, not by mutating derivative records after send.

The facade should reject records that lack DFC-required metadata. It must return `stale`, `blocked`, or `failed`, not infer missing fields from extension, MIME, or legacy send mode.

### Dedicated table fallback

If the metadata convention cannot prove same-source and durable message binding, use a dedicated table. Minimum table needs:

- `id`.
- `source_file_id`.
- `target_kind`.
- `source_hash`.
- `content_hash`.
- `conversion_settings_hash`.
- `usage`.
- `storage_class`.
- `storage_backend`.
- `storage_uri`.
- `converter_name`.
- `converter_version`.
- `settings_json`.
- `status`.
- `warnings_json`.
- `created_at`, `updated_at`, optional `expires_at`, optional `deleted_at`.

Dedicated table risks:

- Higher migration cost.
- New repo and cleanup code.
- New tests for lifecycle, binding, cache reuse, and privacy.
- Possible duplicate semantics with existing `file_derivatives`.

Decision: do not create a dedicated table in Phase 1 unless a future implementation audit proves the facade cannot carry required metadata without ambiguity. Dedicated table creation remains owner-approval-required.

## 5. DB Binding Migration Shape

### Required durable fields

DFC Phase 1 needs these durable fields:

Draft attachment:

- `dfc_managed`.
- `selected_option_id`.
- `selected_asset_refs_json`.

Message attachment:

- `used_option_id`.
- `used_asset_refs_json`.
- `target_kind`.
- `send_strategy`.

### Storage options

Option A: explicit columns on existing attachment tables.

- Draft: add `dfc_managed INTEGER NOT NULL DEFAULT 0`, `selected_option_id TEXT`, and `selected_asset_refs_json TEXT`.
- Message: add `used_option_id TEXT`, `used_asset_refs_json TEXT`, `target_kind TEXT`, and `send_strategy TEXT`.
- Pros: simplest transactional fit with `ConversationDraftRepo`, `MessageAttachmentRepo`, and `ConversationAttachmentService`; strongest queryability; lowest risk of orphan sidecars; clear quarantine marker.
- Cons: DB migration touches core attachment tables and requires owner approval.

Option B: add metadata JSON columns to existing attachment tables.

- Draft: `dfc_metadata_json`.
- Message: `dfc_metadata_json`.
- Pros: flexible and smaller initial migration.
- Cons: weaker type enforcement, harder queries, easier to mix legacy and DFC semantics, higher test burden for malformed JSON.

Option C: sidecar binding tables.

- Example: `dfc_draft_attachment_bindings` and `dfc_message_attachment_bindings`.
- Pros: isolates DFC from legacy table shape and can be deleted later if replaced.
- Cons: extra joins, orphan risk, harder transaction handling, more repo and migration surface.

Option D: no DB migration, facade-only binding.

- Pros: no schema work.
- Cons: does not satisfy v1.2 durable draft/message binding because `message_attachments` has no metadata JSON escape hatch and current draft fields cannot store selected refs.

### Recommendation

Use Option A: explicit columns on existing `draft_attachments` and `message_attachments`.

Recommended Phase 1 migration shape:

```sql
ALTER TABLE draft_attachments ADD COLUMN dfc_managed INTEGER NOT NULL DEFAULT 0 CHECK (dfc_managed IN (0, 1));
ALTER TABLE draft_attachments ADD COLUMN selected_option_id TEXT;
ALTER TABLE draft_attachments ADD COLUMN selected_asset_refs_json TEXT;

ALTER TABLE message_attachments ADD COLUMN used_option_id TEXT;
ALTER TABLE message_attachments ADD COLUMN used_asset_refs_json TEXT;
ALTER TABLE message_attachments ADD COLUMN target_kind TEXT;
ALTER TABLE message_attachments ADD COLUMN send_strategy TEXT;
```

Recommended constraints for implementation:

- `selected_asset_refs_json` and `used_asset_refs_json` must decode to arrays of `DfcSendAssetRef`.
- New DFC attachments must write `dfc_managed = 1`.
- Legacy rows remain `dfc_managed = 0`.
- No automatic migration from legacy fields in the migration itself.
- Ambiguous legacy rows stay legacy read-only or require explicit migration bridge approval.

Owner approval is required before implementing this migration.

## 6. Legacy Quarantine Enforcement

DFC-managed runtime must use a hard dispatch boundary:

- If `dfc_managed = 1`, send planning must resolve only through DFC fields: `selected_option_id`, selected `ConversionOption`, `targetKind`, and `SendAssetRef`.
- If `dfc_managed = 0`, existing legacy send planning may continue to use `preferred_send_mode`, `selectedSendMode`, `native_file`, `hybrid`, and `unsupported` for historical behavior.
- DFC-managed code must not call `selectAttachmentSendModeInternal`.
- DFC-managed code must not infer sendability from extension or MIME after the selected option is missing, stale, failed, incompatible, unavailable, or asset-missing.

Recommended runtime seam:

- Add a narrow DFC branch inside `SendPlanService` before legacy mode selection.
- Keep legacy `buildDraftAttachmentPlan` and `buildHistoryAttachmentPlan` behavior intact for `dfc_managed = 0`.
- Add a DFC resolver helper that consumes loaded attachment binding fields and selected option records.
- Route DFC history attachments through message snapshots: `usedOptionId`, `usedAssetRefs`, `targetKind`, and `sendStrategy`, not current draft state.

Tests required before Send Plan wiring:

- DFC-managed missing `selectedOptionId` blocks or needs selection and ignores `preferredSendMode`.
- Failed selected option does not fallback to `selectedSendMode`.
- Stale selected option does not fallback to `native_file`.
- Incompatible selected option does not fallback to extension or MIME.
- Missing `raw_file` or `derived_asset` blocks and does not fallback to `hybrid`.
- DFC-managed Send Plan never emits `native_file`, `hybrid`, or `unsupported`.
- Legacy `dfc_managed = 0` records still display/read through existing legacy path.

## 7. DFC-6 Readiness

DFC-6 can enter narrow production code only after Owner approves the exact implementation slice.

Recommended DFC-6 first production slice:

1. Implement sanitized DFC runtime DTO and contract tests.
2. Keep it additive and DFC-only.
3. Do not wire Send Plan to DFC yet.
4. Do not run DB migration yet unless the Owner approves the migration slice.
5. Add privacy tests that prove DFC renderer DTOs omit `path`, `fileUrl`, full hash fields, `contentToken`, file bodies, and storage refs.

Not ready for DFC-6 without additional owner approval:

- DB migration implementation.
- Production Send Plan DFC branch.
- Dedicated `DerivedAsset` table.
- Legacy migration bridge.
- UI option selection wiring.
- Playwright harness creation.
- External engines or new dependencies.

## 8. Owner Approvals Required Before Code

Owner approval is required before:

- Any IPC runtime DTO change, even if additive.
- The explicit DB migration recommended in this memo.
- Treating the `file_derivatives` facade metadata convention as the production `DerivedAsset` representation.
- Any production Send Plan branch for `dfc_managed`.
- Any UI consumption of DFC DTOs.
- Any dedicated `DerivedAsset` table.
- Any legacy migration bridge.

## 9. Validation Plan For Future Code

Future implementation rounds should add or run:

- Sanitized DTO contract tests for DFC attachments.
- DB migration tests for explicit attachment columns.
- Repo tests for `ConversationDraftRepo` and `MessageAttachmentRepo` DFC field persistence.
- DerivedAsset facade tests rejecting missing `contentHash`, `targetKind`, `conversionSettingsHash`, or invalid `usage`.
- Send Plan no-silent-fallback tests for `dfc_managed = 1`.
- Privacy/log scans for absolute paths, `fileUrl`, content tokens, file bodies, storage refs, and full hashes.
- Targeted Vitest before broad typecheck.

## 10. Recommended Next Round

DFC-6 should be an owner-approved production slice for sanitized DFC runtime DTOs only:

- Add sanitized DFC DTO runtime contract and decoder.
- Add privacy tests.
- Do not change DB schema.
- Do not wire DFC into production Send Plan.
- Do not implement conversions.

After DFC-6, the next owner-approved slice should be the DB binding migration from Section 5.
