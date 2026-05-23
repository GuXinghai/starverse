# DFC-2 Implementation Design Memo

Status: design memo only. No production code, schema, tests, IPC contracts, UI, dependencies, or external engines are changed in DFC-2.

Source of truth: `starverse_format_conversion_preview_v1_2.md`.

Owner decision for this memo: use isolated replacement, not broad compatibility.

## 1. Current repository facts

DFC-1 mapped the current attachment pipeline to these implementation facts:

- Raw uploaded-file semantics currently live in `file_assets` / `FileAssetRecord`.
- Derived or generated content currently lives across `file_derivatives`, `FileDerivativeRecord`, `derivative_jobs`, preview derivatives, and text-conversion lineage metadata.
- Draft attachment persistence currently stores `preferredSendMode`, `urlRetentionMode`, `includeInNextRequest`, and `excludedReason`.
- Message attachment persistence currently stores the sent asset binding and payload status, but not explicit `usedOptionId` or `usedAssetRefs`.
- Public send-plan target vocabulary currently includes `native_file`, `hybrid`, and `unsupported`, while v1.2 requires `original_file`, `plain_text`, `markdown`, `code`, `table_markdown`, and `pdf_attachment`.
- Current selection vocabulary is `preferredSendMode` and `selectedSendMode`, not `selectedOptionId`.
- Existing send-plan lineage logic already compares `previewContentHash`, `sendContentHash`, and `conversionSettingsHash`; this is the best seam for mandatory preview/send same-source enforcement.
- Composer attachment UI already has attachment card and detail dialog seams, plus Vitest coverage in `src/ui-app/AppChatApp.attachments.test.ts`.
- Dedicated Playwright attachment-upload smoke was not found in DFC-1.
- IPC/message asset DTOs currently expose `path`, `fileUrl`, and full `hash`, which conflicts with the v1.2 privacy boundary for renderer-visible data and logs.

## 2. Contract gaps

The current implementation does not yet provide the v1.2 authority model:

- No explicit `ConversionOption` source of truth for new uploads.
- No first-class `selectedOptionId` on draft attachments.
- No persisted `selectedAssetRefs` on draft attachments.
- No persisted `usedOptionId` or `usedAssetRefs` on message attachments.
- No first-class `SendAssetRef` union for `raw_file` and `derived_asset`.
- No first-class `original_file` targetKind.
- No DFC-only send-plan path that ignores legacy send-mode fields.
- No clear quarantine for `native_file`, `hybrid`, `unsupported`, `preferredSendMode`, or `selectedSendMode`.
- No browser smoke covering the v1.2 upload, shelf/chip, inspector, option selection, preview, removal, and send gating workflow.
- No verified privacy DTO boundary that prevents renderer exposure of absolute paths, file URLs, content tokens, file bodies, or full hashes.

## 3. Owner decisions already frozen

These decisions are treated as frozen for DFC-2 and future implementation rounds unless the Owner explicitly changes them:

- Isolated replacement is the strategy. Broad compatibility is rejected.
- New uploads, new draft attachments, and new send plans must use the DFC path.
- The DFC path is authoritative through `ConversionOption`, `selectedOptionId`, `targetKind`, `SendAssetRef`, and `DerivedAsset`.
- `preferredSendMode`, `selectedSendMode`, `native_file`, `hybrid`, and `unsupported` are legacy vocabulary and must enter legacy quarantine.
- Legacy fields may support historical reads, diagnostics, explicit migration candidates, or display compatibility.
- Legacy fields must not silently participate in new DFC-managed send decisions.
- Silent fallback is forbidden.
- Missing, stale, failed, incompatible, or unavailable `selectedOptionId` must produce `pending`, `blocked`, `failed`, or `needs_user_selection`.
- DFC-managed sending must not fall back to `selectedSendMode`, `native_file`, `hybrid`, `unsupported`, extension checks, or MIME checks.
- Any bridge from old data to new data must be explicit, narrow, testable, removable, and visible as a migration bridge, not an invisible runtime fallback.

## 4. Recommended architecture

New DFC-managed attachments should enter the DFC path immediately after the raw file is persisted and before a usable draft attachment is exposed for sending. The intake boundary should be:

1. Persist raw file as the raw storage record.
2. Create or refresh file profile and detection state.
3. Generate a DFC `ConversionOption` set, including an `original_file` identity option when policy allows raw file sending.
4. Pick a default option only through DFC option rules, then store that `selectedOptionId` on the draft attachment.
5. Store `selectedAssetRefs` from the selected option, not from legacy send modes.

A new draft attachment must have `selectedOptionId` once option generation reaches a stable `ready`, `blocked`, `failed`, or `needs_user_selection` state. During detection or conversion, `selectedOptionId` may be absent only if the attachment state is explicitly `pending` or `needs_user_selection`, and Send Plan must block or remain pending.

Send Plan must read `targetKind` and `SendAssetRef` from the selected DFC `ConversionOption`, resolved by `selectedOptionId`. For DFC-managed attachments, the send-plan path must not consult `preferredSendMode`, `selectedSendMode`, `native_file`, `hybrid`, `unsupported`, extension-only compatibility, or MIME-only compatibility.

Preview/send same-source checking should become a hard DFC gate:

- `original_file` passes only when the selected option sends exactly one `raw_file` ref matching the draft raw file.
- Text-like targets pass only when preview and send use the same `derived_asset`, or when a permitted same-content policy verifies matching `contentHash` and `conversionSettingsHash`.
- `pdf_attachment` later follows the same rule for rendered PDF assets.
- Mismatches produce `blocked` or `stale`, never fallback.

## 5. Legacy quarantine plan

Legacy quarantine separates old vocabulary from the DFC authority path.

`preferredSendMode`:

- Allowed as read-only input for historical drafts and migration diagnostics.
- Allowed to display old draft intent with a legacy badge.
- Forbidden as a send-decision input for DFC-managed attachments.

`selectedSendMode`:

- Allowed as an output detail for legacy send-plan display.
- Forbidden as fallback input for DFC-managed send plans.
- Should not be stored as the selected choice for new DFC attachments.

`native_file`:

- Legacy vocabulary only.
- Explicit migration may map old `native_file` to a new `original_file` `ConversionOption`, but only through a named migration bridge with tests.
- New DFC code must emit `original_file`, not `native_file`.

`hybrid`:

- Frozen. New DFC code must not generate it.
- Existing historical data may display as legacy or deferred.
- No migration should synthesize hybrid into DFC Phase 1 because v1.2 removed hybrid from the first version.

`unsupported`:

- In DFC, unsupported is a state or error condition, not a targetKind.
- Legacy `unsupported` may be displayed for old records, but DFC-managed attachments must represent the condition as `blocked`, `failed`, `incompatible`, or `needs_user_selection`.

Historical messages should remain readable with legacy labels and sanitized metadata. Old drafts should either remain in legacy read-only mode or pass through an explicit migration bridge that produces DFC options and asks the user to confirm if the old choice is ambiguous.

Legacy quarantine can be deleted or narrowed only after:

- No active draft depends on legacy fields for sending.
- Historical display has a stable compatibility path.
- Migration tests prove old draft records either migrate explicitly or remain blocked/read-only.
- Static searches show no DFC-managed send path reads legacy send decisions.

## 6. No silent fallback rules

For DFC-managed attachments, these rules are mandatory:

- Missing `selectedOptionId`: state is `pending` when option generation is still running, otherwise `needs_user_selection` or `blocked`.
- `selectedOptionId` points to missing option: `needs_user_selection` or `blocked`.
- `selectedOptionId` points to `failed` option: `failed`, with visible error and available non-selected alternatives.
- `selectedOptionId` points to `stale` option: `stale` or `blocked` until regenerated or reselected.
- `selectedOptionId` points to incompatible option: `incompatible` or `blocked`, with model capability detail.
- `selectedOptionId` points to unavailable option: `blocked` or `needs_user_selection`.
- Missing `raw_file` for `original_file`: `blocked` or `failed`.
- Missing `derived_asset` for derived targets: `pending` if conversion is running, otherwise `failed` or `blocked`.
- Preview/send same-source mismatch: `stale` or `blocked`.

The implementation must explicitly forbid fallback to:

- File extension.
- Browser MIME.
- Detected MIME.
- `preferredSendMode`.
- `selectedSendMode`.
- `native_file`.
- `hybrid`.
- `unsupported`.
- Any legacy route eligibility if no selected DFC option is valid.

## 7. selectedOptionId ownership

Four ownership levels are possible.

`draft-local`:

- Stores the explicit current choice on `DraftAttachment`.
- Best match for v1.2 because sending is a draft action and must reflect the user's current selected option.
- Supports no-silent-fallback because a missing or invalid value is visible on the draft.
- Recommended for Phase 1.

`asset-level default`:

- Could remember a suggested default for a raw file across drafts.
- Risk: a raw file can be attached to different conversations, models, and privacy contexts.
- Not authoritative for sending.
- Deferred.

`per-file-type preference`:

- Useful later for "always send CSV as table markdown" or similar preferences.
- Must only seed a new draft's initial option.
- Must never override an explicit draft-local `selectedOptionId`.
- Deferred until Phase 1 is stable.

`global preference`:

- Useful later for user-wide defaults.
- Highest risk because it can obscure the active draft choice.
- Must only seed defaults and must never override explicit draft-local selection.
- Deferred.

Phase 1 recommendation: use draft-local `selectedOptionId` as the only authoritative owner. Later file-type or global defaults may be introduced as default seeders, but never as send-time authority and never as overrides for the current draft's explicit selection.

## 8. targetKind and legacy vocabulary transition

`original_file` must become a first-class DFC targetKind. It represents raw file attachment sending through `SendAssetRef.kind = 'raw_file'` and must not generate a `DerivedAsset`.

`native_file` should remain legacy vocabulary only. If old records use `native_file`, an explicit migration bridge may create a DFC `original_file` option when all required raw-file and policy checks pass.

`hybrid` should be frozen and marked deferred or legacy. DFC Phase 1 must not emit hybrid options, hybrid send plans, or hybrid tests.

`unsupported` should move from target vocabulary into state and diagnostics. DFC should express unsupported conditions through `blocked`, `failed`, `incompatible`, `needs_user_selection`, or error codes.

An enum transition is required in TypeScript contracts. A DB enum migration may be required if targetKind is persisted in a constrained column. If current DB tables do not persist targetKind directly, Phase 1 can add DFC targetKind storage in new explicit DFC fields or JSON metadata. Any durable schema change requires owner approval before code.

## 9. Draft and Message binding design

DraftAttachment should persist:

- `rawFileId`.
- `selectedOptionId`.
- `selectedAssetRefs`.
- DFC state fields for detection, conversion, compatibility, and stale/blocked reasons.
- Optional warning snapshot for the selected option.

MessageAttachment should persist only what was actually sent:

- `rawFileId`.
- `usedOptionId`.
- `usedAssetRefs`.
- `targetKind`.
- `sendStrategy`.
- Model and provider route data when available.
- Warning snapshot at send time.

A DB migration is likely required because current draft and message attachment records do not explicitly store these v1.2 fields. Recommended migration shape:

- Add explicit DFC fields to draft attachments and message attachments, preferably as typed JSON columns for asset refs and warnings plus scalar IDs/status fields for queryable ownership.
- Add a `dfcManaged` or equivalent marker to distinguish new DFC attachments from legacy attachments.
- Keep legacy fields present but quarantined.
- Add an explicit migration bridge for old drafts only if the Owner approves a bridge round.

Owner approval is required before implementing any DB migration that changes attachment, draft, message, raw asset, or derived asset semantics.

To avoid preview-only pollution of history, commit-to-message must snapshot only the selected option's send refs after preflight succeeds. Preview-only assets must be rejected by Send Plan and excluded from message attachment writes.

## 10. raw_file / derived_asset mapping

`raw_file` should map to the existing file asset record that owns the original bytes and managed storage ref. Renderer-visible DTOs must see only sanitized raw file metadata, not storage paths, file URLs, content tokens, file bodies, or full hashes.

`derived_asset` can be mapped in three ways:

Option A: reuse existing `file_derivatives` with a DFC `DerivedAsset` facade.

- Migration impact: lower than a new table if existing derivative records can store kind, source hash, content hash, settings hash, usage, and binding metadata.
- Test impact: targeted repo and send-plan tests must prove DFC refs resolve to the correct derivative record.
- Privacy impact: must sanitize derivative storage refs before renderer exposure.
- Recommended for Phase 1 if existing schema can represent required metadata without ambiguity.

Option B: add a dedicated `derived_assets` table.

- Migration impact: higher but cleaner contract alignment.
- Test impact: new repo, migration, cleanup, binding, and send-plan tests.
- Privacy impact: cleanest boundary if renderer DTOs are designed alongside it.
- Use only if existing derivative tables cannot safely express DFC semantics.

Option C: Phase 1 internal TypeScript-only `DerivedAsset` over existing derivative and lineage metadata.

- Migration impact: lowest for early contract wiring, but not sufficient for durable message binding unless message refs persist stable asset IDs.
- Test impact: useful for proving send-plan rules before schema expansion.
- Privacy impact: still requires sanitized DTOs.
- Acceptable only as a short-lived implementation slice, not the final durable model.

Recommendation: use a DFC `DerivedAsset` TypeScript facade over existing `file_derivatives` for Phase 1 if the required metadata fits. Escalate to owner approval for a dedicated table if the facade cannot represent usage, binding, source hash, content hash, or settings hash without ambiguity.

## 11. Send Plan integration strategy

Send Plan should gain a local DFC integration seam rather than broad replacement:

1. Detect whether an attachment is DFC-managed.
2. For DFC-managed attachments, call a DFC resolver that loads `selectedOptionId`, resolves the `ConversionOption`, validates `SendAssetRef`, checks same-source lineage, and returns a DFC send-plan attachment.
3. For legacy attachments, keep the existing legacy send-plan path under quarantine.
4. Never let the DFC resolver call `selectAttachmentSendModeInternal` or read legacy target vocabulary as fallback.
5. Keep legacy and DFC tests separate so regressions show which path failed.

The DFC resolver should be narrow and typed:

- Input: draft attachment ID, raw file ID, selected option ID, model/provider context.
- Internal lookup: selected `ConversionOption` and referenced raw or derived assets.
- Output: DFC send-plan attachment with targetKind, send strategy, selected asset refs, compatibility, warnings, and blocking reason.

Tests must prove:

- Missing selected option does not fallback.
- Failed selected option does not fallback.
- Stale selected option does not fallback.
- Legacy `selectedSendMode` is ignored for DFC-managed attachments.
- `native_file`, `hybrid`, and `unsupported` are not emitted by DFC-managed send plans.

## 12. Privacy and DTO boundary

Current risk:

- `path` can reveal local absolute paths and usernames.
- `fileUrl` can reveal local file paths through `file://` URLs.
- Full `hash` can enable cross-context correlation and violates the v1.2 log/privacy rule against full hash exposure.
- Any content token, file body, or derivative storage path in renderer DTOs would widen the privacy boundary.

Main/infra may retain:

- Managed storage URI.
- Absolute path for local file IO.
- Full content hash for dedupe and cache keys.
- Content token if needed internally.
- File body only inside controlled read/conversion/send code.

Renderer DTOs should receive sanitized data only:

- Stable asset ID.
- Display filename or sanitized label.
- MIME or detected type summary.
- Size.
- DFC targetKind and status.
- Short diagnostic hash prefix only if needed, never full hash.
- Warning and error codes with sanitized detail.
- Preview payloads only through explicit preview APIs with content-size and redaction rules.

Phase 1 should include a sanitized DTO boundary before or as the first DFC implementation slice. DFC should not expand renderer access to raw paths, file URLs, content tokens, full hashes, or raw storage refs.

Required privacy validation:

- Contract tests that renderer DTO decoders reject or omit `path`, `fileUrl`, full hash, content token, and file body fields.
- Log scan tests for absolute paths, content tokens, file bodies, and full hashes in DFC diagnostics.
- Send-plan tests proving DFC uses opaque `SendAssetRef` IDs, not renderer-visible paths.

## 13. Phase 1 minimal implementation slice

Phase 1 should be implemented in small reviewable sub-rounds after owner approval for schema and privacy boundaries.

Minimum Phase 1 capabilities:

- DFC TypeScript contracts for `targetKind`, `SendAssetRef`, `ConversionOption`, `DerivedAsset`, draft selected refs, and message used refs.
- `original_file` identity option with `SendAssetRef.kind = 'raw_file'`.
- Plain text conversion to `derived_asset`.
- Markdown passthrough to `derived_asset`.
- Code text option to `derived_asset`.
- CSV/TSV to `table_markdown` using an existing local parser if available, or a narrow internal parser with targeted tests. If a new CSV dependency is needed, stop for owner approval.
- Draft-local `selectedOptionId` and `selectedAssetRefs`.
- Message `usedOptionId` and `usedAssetRefs`.
- DFC-managed Send Plan resolver driven only by selected option targetKind and asset refs.
- Preview/send same-source hard gate.
- No silent fallback behavior and tests.
- Privacy DTO and log tests.
- Minimal Playwright smoke for upload, shelf/chip, detail inspector, option selection, preview visibility, removal, and send gating.

Recommended implementation order:

1. Privacy DTO boundary and DFC contract types.
2. Draft/message binding schema proposal and owner-approved migration.
3. Option generation for Phase 1 local file types.
4. DerivedAsset facade over existing derivative storage.
5. DFC Send Plan resolver seam.
6. UI wiring for selected option only after contracts and resolver are stable.
7. Targeted tests.
8. Playwright smoke.

## 14. Deferred phases

These are explicitly deferred until later owner-approved rounds:

- XLSX/XLS.
- DOCX/DOC/RTF.
- PDF attachment.
- HTML conversion.
- PS/EPS.
- LibreOffice.
- Chromium.
- Puppeteer.
- Pandoc.
- Ghostscript.
- Mammoth.
- Turndown.
- SheetJS.
- Papa Parse.
- chardet.
- iconv-lite.

If any deferred engine or dependency becomes necessary for Phase 1, stop for owner approval before adding it.

## 15. Test and Playwright plan

Targeted tests needed after implementation starts:

- `selectedOptionId` missing produces `pending`, `blocked`, or `needs_user_selection`.
- Failed selected option does not fallback to legacy.
- Stale selected option does not fallback to legacy.
- Incompatible selected option blocks instead of falling back.
- Missing `raw_file` blocks `original_file`.
- Missing `derived_asset` blocks derived targets unless conversion is pending.
- `original_file` sends `SendAssetRef.kind = 'raw_file'`.
- `plain_text`, `markdown`, `code`, and `table_markdown` send `SendAssetRef.kind = 'derived_asset'`.
- DraftAttachment persists `selectedAssetRefs`.
- MessageAttachment persists `usedAssetRefs`.
- Preview/send same-source enforcement blocks mismatched assets or hashes.
- Legacy `selectedSendMode` does not participate in DFC-managed send.
- DFC-managed Send Plan never emits `native_file`, `hybrid`, or `unsupported`.
- Renderer DTOs do not expose `path`, `fileUrl`, full hash, content token, file body, or raw storage refs.
- Logs and diagnostics do not leak absolute paths, content tokens, file bodies, or full hashes.

Minimal Playwright smoke should cover:

- Attachment upload.
- Attachment shelf or equivalent chip appears.
- Chip hover or detail affordance exposes sanitized metadata.
- Detail inspector opens.
- Option selection changes selected option.
- Preview is visible and matches selected option state.
- Attachment removal updates UI and send plan.
- Send gating blocks invalid, pending, stale, or incompatible selected options.
- Send gating allows a valid selected option in a controlled fixture.

## 16. Migration impact

Schema migration is likely required for durable v1.2 compliance:

- Draft attachment needs `selectedOptionId` and `selectedAssetRefs`.
- Message attachment needs `usedOptionId` and `usedAssetRefs`.
- DFC-managed marker is needed to quarantine legacy path decisions.
- Conversion options and derived refs need durable storage or a reproducible lookup keyed by raw file and settings.

Possible migration bridge:

- Name it explicitly, for example `legacyAttachmentToDfcDraftBridge`.
- Run only on old draft records or an explicit migration command.
- Produce DFC options and selected refs only when mapping is unambiguous.
- Mark ambiguous cases as `needs_user_selection`.
- Never run as invisible send-time fallback.
- Include deletion criteria and tests from the first bridge round.

Owner approval is required before schema migration or bridge implementation.

## 17. Risks

- DB migration can change draft/message semantics and must be reviewed before code.
- Existing derivative metadata may be insufficient for full `DerivedAsset` semantics.
- A facade over existing derivatives could hide ambiguity unless tests assert usage, binding, and content hash rules.
- Legacy send-plan code may be accidentally reused by DFC unless the integration seam is strict.
- Privacy fixes may need to precede UI work because current DTOs expose path-like data.
- Playwright attachment smoke may require harness work that DFC-1 did not find.
- Phase 1 CSV/TSV parsing can grow if quoted fields, embedded newlines, and escaping are not scoped carefully.

## 18. Owner approval required before code

Owner approval is required before implementing:

- DB migration for draft/message/asset semantics.
- DFC-managed marker and legacy quarantine enforcement.
- Any explicit legacy migration bridge.
- Any privacy DTO contract change that removes or replaces renderer-visible fields.
- Any Playwright harness creation if existing e2e structure is insufficient.
- Any new dependency or external engine.

Already approved by the Owner for design:

- Isolated replacement.
- No broad compatibility.
- Legacy quarantine.
- No silent fallback.
- Explicit migration bridge only, if needed.

## 19. Recommended next round

DFC-3 should be an owner approval checkpoint plus the first implementation slice.

Recommended DFC-3 scope:

- Confirm the DB migration shape for `selectedOptionId`, `selectedAssetRefs`, `usedOptionId`, `usedAssetRefs`, and `dfcManaged`.
- Confirm whether Phase 1 uses a `DerivedAsset` facade over existing `file_derivatives` or requires a dedicated table.
- Confirm privacy DTO removal/sanitization behavior.
- Then implement only the first approved Phase 1 slice, with targeted tests and no external engines.
