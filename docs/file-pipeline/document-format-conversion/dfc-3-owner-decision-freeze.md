# DFC-3 Owner Decision Freeze

Status: pre-code owner decision freeze. No production code, schema, Send Plan behavior, UI behavior, IPC contracts, tests, package files, dependencies, or conversion logic are changed in DFC-3.

Source of truth: `starverse_format_conversion_preview_v1_2.md`.

Related design memo: `dfc-2-implementation-design-memo.md`.

## 1. Purpose

DFC-3 freezes the implementation decisions that must hold before Phase 1 code starts. It does not implement the DFC path. It narrows the next implementation round so the first code slice can proceed without re-opening authority, vocabulary, fallback, privacy, or phase-boundary questions.

## 2. Frozen selectedOptionId Decision

Phase 1 authority is draft-local `selectedOptionId`.

- The active draft attachment owns the selected option for sending.
- File-type defaults, asset-level defaults, and global preferences are deferred preference layers.
- Deferred preference layers may seed a new draft's initial option later, but they must never override the current draft's explicit `selectedOptionId`.
- Missing `selectedOptionId` must resolve to `needs_user_selection`, `pending`, or `blocked`.
- A DFC-managed attachment with missing, stale, failed, incompatible, or unavailable `selectedOptionId` must not fall back to legacy fields, extension checks, MIME checks, or old target vocabulary.

## 3. Frozen dfcManaged Boundary

New uploads and new draft attachments enter the DFC-managed path once Phase 1 implementation begins.

For a DFC-managed attachment, Send Plan authority is limited to:

- `selectedOptionId`.
- The selected option's `targetKind`.
- The selected option's `SendAssetRef` values.
- DFC state, compatibility, warning, and same-source validation derived from that selected option.

Legacy fields are quarantined:

- `preferredSendMode`.
- `selectedSendMode`.
- `native_file`.
- `hybrid`.
- `unsupported`.

Legacy fields may support historical display, diagnostics, explicit migration candidates, or a removable migration bridge. They must not participate in a DFC-managed send decision.

## 4. Frozen Target Vocabulary

DFC contract target vocabulary is:

- `original_file`.
- `plain_text`.
- `markdown`.
- `code`.
- `table_markdown`.
- `pdf_attachment`.

Phase 1 implementation may emit only `original_file`, `plain_text`, `markdown`, `code`, and `table_markdown`. `pdf_attachment` is frozen as a contract value only; Phase 1 does not implement PDF attachment.

Frozen transition decisions:

- `original_file` is a first-class targetKind.
- `native_file` is legacy vocabulary only.
- `hybrid` is deferred for the first version and must not enter new DFC targetKind generation.
- `unsupported` is a state, error code, diagnostic, or legacy status. It is not a new DFC targetKind.

## 5. Frozen Draft and Message Binding Decision

Phase 1 `DraftAttachment` requires:

- `selectedOptionId`.
- `selectedAssetRefs`.
- `dfcManaged`.

Phase 1 `MessageAttachment` requires a send-time snapshot of:

- `usedOptionId`.
- `usedAssetRefs`.
- `targetKind`.
- `sendStrategy`.

Minimum migration fields if DB storage is required:

- Draft attachment scalar: `dfc_managed`.
- Draft attachment scalar: `selected_option_id`.
- Draft attachment JSON: `selected_asset_refs_json`.
- Message attachment scalar: `used_option_id`.
- Message attachment JSON: `used_asset_refs_json`.
- Message attachment scalar: `target_kind`.
- Message attachment scalar: `send_strategy`.

Migration risks:

- Changes draft/message attachment semantics and therefore requires owner approval before code.
- Old drafts may not have enough data to infer a valid DFC selected option.
- Legacy `native_file` can sometimes map to `original_file`, but only through an explicit migration bridge.
- Legacy `hybrid` cannot be silently mapped into Phase 1 DFC because hybrid is deferred.
- Ambiguous legacy records must become `needs_user_selection`, blocked, or legacy read-only, not silently migrated.
- Message history must bind only actually sent assets; preview-only assets must not enter `usedAssetRefs`.

Owner approval is still required before implementing any DB migration or migration bridge.

## 6. Frozen DerivedAsset Strategy

Phase 1 should first evaluate a `DerivedAsset` facade over existing derivative and preview lineage mechanisms.

The facade must expose these required fields or their unambiguous equivalents:

- `sourceHash`.
- `contentHash`.
- `targetKind`.
- `conversionSettingsHash`.
- `usage`.
- `storageClass`.
- `sourceFileId`.
- Converter identity, including converter name and version.
- Binding refs for draft and message attachment ownership.

If existing derivative and preview lineage mechanisms cannot carry these fields without ambiguity, the recommended fallback is a dedicated `DerivedAsset` table. A dedicated table requires owner approval before code because it changes durable asset semantics and migration scope.

`original_file` must not create a `DerivedAsset`; it uses `SendAssetRef.kind = 'raw_file'`.

## 7. Frozen Privacy DTO Boundary

Renderer DTOs must not expose:

- Real filesystem `path`.
- `fileUrl`.
- Full hash.
- `contentToken`.
- File body or body fragments.
- Raw storage refs that can be resolved to local paths.

Main/infra internals may retain necessary paths, storage refs, content tokens, and full hashes for controlled IO, dedupe, cache, conversion, and sending. Ordinary logs must not output those values.

Before Phase 1 code implementation expands DFC renderer data, the implementation must define one of these privacy strategies:

- A sanitized DFC DTO that contains only opaque IDs, display metadata, status, targetKind, warnings, and sanitized diagnostics.
- Explicit field removal from existing renderer DTOs where DFC attachments would otherwise expose path-like or hash-like data.

Phase 1 must add privacy tests or scans for renderer DTOs and logs.

## 8. Frozen Phase 1 Implementation Order

Recommended implementation order:

A. TypeScript contracts and DFC boundary types.

B. Sanitized DTO privacy boundary.

C. DB migration or binding storage decision.

D. Phase 1 option generation:

- `original_file`.
- `plain_text`.
- Markdown passthrough.
- `code`.
- CSV/TSV `table_markdown`.

E. DFC Send Plan resolver seam.

F. Preview/send same-source gate.

G. Targeted tests and no-silent-fallback tests.

H. Minimal Playwright smoke if an existing harness can support it.

If Playwright requires creating a new harness from scratch, stop for owner approval before implementation.

## 9. Explicitly Deferred

Deferred until later owner-approved rounds:

- XLSX/XLS.
- DOCX/DOC/RTF.
- PDF attachment implementation.
- HTML conversion.
- PS/EPS.
- External engines.
- New dependencies unless the Owner approves them.

Deferred engine and dependency examples include:

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

## 10. Still-open Decisions Before Code

These are not reopened as architecture questions, but still require owner approval before the relevant code slice:

- Exact DB migration shape for draft/message binding fields.
- Whether existing derivative and preview lineage can support the required `DerivedAsset` facade.
- Whether a dedicated `DerivedAsset` table is needed.
- Exact sanitized DTO shape or field-removal strategy.
- Whether legacy draft migration is in scope for Phase 1 or deferred.
- Whether existing Playwright infrastructure can support the minimal attachment smoke without harness creation.

## 11. Recommended First Implementation Round

DFC-4 should start with the smallest code slice that does not require external engines:

1. Add TypeScript DFC contract types.
2. Add or define sanitized DFC DTO boundary.
3. Add tests proving DFC-managed attachments cannot use legacy send-mode fallback.

If DFC-4 requires DB migration before even defining contracts and DTOs, stop first for owner approval on the migration plan.
