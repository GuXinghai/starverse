# DFC-10 UI and Playwright Feasibility Owner Memo

Status: owner-level stop memo after read-only UI and test-harness mapping. No production code, DB schema, Send Plan behavior, UI behavior, conversion runtime, dependencies, external engines, Playwright harness, or legacy bridge are changed in DFC-10.

SSOT: `docs/file-pipeline/document-format-conversion/starverse_format_conversion_preview_v1_2.md` remains authoritative and was not modified.

## Objective

DFC-10 was intended to start the minimal Phase 1 option-selection and preview UI bridge. The round stopped before implementation because the current repository exposes two owner-level decision points:

- The UI does not have an owned DFC option-candidate source for editing `selectedOptionId` and `selectedAssetRefs`.
- The requested browser Playwright smoke does not have an existing browser harness to extend.

## Facts

- Composer attachment UI already exists in `src/ui-app/AppChatApp.vue`, `src/ui-app/components/DraftAttachmentStrip.vue`, `src/ui-app/components/DraftAttachmentCard.vue`, and `src/ui-app/components/DraftAttachmentDetailsDialog.vue`.
- The existing draft attachment detail inspector is legacy-send-mode-oriented. It can update `preferredSendMode` and `urlRetentionMode`, but it has no DFC option picker and no event for `selectedOptionId`.
- `src/ui-app/app/appChatApp.logic.ts` already has draft attachment view-model seams, selected-attachment detail state, draft preview loading, send gating, and DFC send-snapshot collection.
- The DB and service side can already persist DFC-managed draft bindings through `dfcManaged`, `selectedOptionId`, and `selectedAssetRefs`.
- `src/next/files/conversationDraftClient.ts` still exposes only the legacy draft setting fields to renderer code.
- `src/shared/files/documentFormatConversion.ts` contains sanitized DFC DTO helpers, and `src/next/ipc/contracts/dbBridgeContracts.ts` contains DFC DTO decoders, but those surfaces are not wired to a draft option-list endpoint for the composer UI.
- DFC-8 reconstructs the selected option from persisted refs plus derivative metadata. The repository does not yet have durable `ConversionOption` rows or a backend-owned candidate-option endpoint that lists all current choices for a draft attachment.
- `src/next/files/previewClient.ts` is asset-id/image-preview oriented. It does not currently expose a DFC preview projection for derived text, markdown, code, table markdown, or raw-file preview/send parity.
- Existing `tests/e2e/*.test.ts` are Vitest fixture or component smoke tests. No root `playwright.config.*` was found, and no browser-driven upload/shelf/inspector/option-selection/send-gating smoke was found.

## Stop Triggers

Implementation would cross owner-stop boundaries from the v1.2 round discipline:

- `selectedOptionId` editing has multiple viable designs because the current runtime has persistence but no owned candidate-list source.
- A true Playwright smoke for attachment upload and composer interactions requires creating new browser E2E scaffolding rather than extending an existing Playwright suite.
- A UI-only picker inferred from current Send Plan rows would risk inventing option identity and alternatives outside the DFC contract.

## Options

### Option A: Infer UI choices from the current Send Plan

The UI could display the selected DFC Send Plan row and construct a small picker from available route or derivative data.

Pros:

- Smallest visible UI patch.
- Reuses state already available in `appChatApp.logic.ts`.

Cons:

- Risks inventing option identity in renderer code.
- Cannot truthfully present all valid alternatives.
- Blurs candidate generation, selected option authority, preview parity, and send compatibility.
- Could reintroduce extension-derived or route-derived behavior that v1.2 explicitly quarantines for DFC-managed attachments.

### Option B: Add a backend-owned DFC draft option DTO endpoint

Add a narrow service/IPC/client seam that returns sanitized current DFC draft attachment state and option candidates from backend-owned data. The renderer would consume that DTO and update `selectedOptionId` / `selectedAssetRefs` through the draft settings path.

Pros:

- Keeps option authority outside renderer code.
- Matches v1.2's draft-local `selectedOptionId` model.
- Reuses existing DFC binding columns and sanitized DTO/privacy work.
- Gives UI, tests, preview, and send gating one contract to target.
- Does not require new dependencies or external conversion engines for the Phase 1 text/table/code/markdown/original-file bridge.

Cons:

- Requires a new production API/IPC seam and tests before visible UI work.
- Requires a precise DTO shape for candidate state, preview/send asset refs, warnings, compatibility, and no-silent-fallback status.
- Still does not solve browser Playwright scaffolding by itself.

### Option C: Create browser Playwright harness first

Add repository Playwright configuration and a first browser-driven attachment smoke before the DFC UI picker.

Pros:

- Establishes the final acceptance path early.
- Makes later UI work easier to verify end to end.

Cons:

- This is new E2E scaffolding, which v1.2 requires owner approval for.
- It may need app launch, fixture, file upload, storage, and Electron/browser environment decisions unrelated to the DFC option contract.
- It does not resolve the option-source ownership gap.

## Recommendation

Approve Option B as the next production round before any option-selection UI is implemented.

Recommended DFC-11 scope:

- Define a backend-owned sanitized DFC draft option DTO for one draft attachment.
- Build the DTO from persisted DFC draft binding, raw file asset, eligible derived assets, and current Send Plan compatibility.
- Expose a narrow IPC/client read method for the composer detail inspector.
- Extend `updateConversationDraftAttachmentSettings()` to accept `selectedOptionId` and `selectedAssetRefs` only after the DTO contract is in place.
- Add targeted tests for sanitized output, option identity, raw-file vs derived-asset refs, no-silent-fallback states, and privacy field exclusion.
- Do not create Playwright scaffolding, new dependencies, external engines, broad Send Plan replacement, legacy migration, or UI option picker in the same round.

Recommended DFC-12 scope, after DFC-11 passes:

- Wire the existing draft attachment details dialog to the DFC option DTO.
- Add option selection controls, preview visibility, removal behavior, and send-gate display using the DTO.
- Add Vue/Vitest coverage in the existing `src/ui-app/AppChatApp.attachments.test.ts` seam.

Recommended Playwright scope:

- Stop for owner approval before adding a real browser Playwright harness.
- If approved, create that harness as a separate round after the DFC option DTO and UI bridge exist.

## Affected Files

Likely DFC-11 files:

- `src/shared/files/documentFormatConversion.ts`
- `src/next/ipc/contracts/dbBridgeContracts.ts`
- `src/next/files/conversationDraftClient.ts`
- `infra/files/sendPlanService.ts`
- `infra/files/conversationAttachmentService.ts` or a narrow DFC draft option service
- `infra/db/worker/runtime.ts`
- `infra/db/worker/handlers/filePipelineHandlers.ts`
- Targeted tests beside the changed modules

Likely DFC-12 files:

- `src/ui-app/app/appChatApp.logic.ts`
- `src/ui-app/AppChatApp.vue`
- `src/ui-app/components/DraftAttachmentDetailsDialog.vue`
- `src/ui-app/components/DraftAttachmentCard.vue` if shelf/chip summary changes are needed
- `src/ui-app/AppChatApp.attachments.test.ts`

Likely browser-smoke files only after separate owner approval:

- `playwright.config.*`
- `tests/playwright/**` or another owner-approved E2E location
- App launch or fixture helpers needed by that harness

## Migration Impact

No DB migration is recommended for DFC-11 if the Phase 1 DTO can be built from existing DFC binding columns and derivative metadata. If implementation discovers that durable candidate identity cannot be represented without new storage, stop again before adding or changing schema.

## Test Impact

DFC-11 should use targeted unit/contract tests around DTO construction, IPC decoding, privacy sanitization, selected option updates, and no-silent-fallback states.

DFC-12 should use existing UI/Vitest attachment tests for the first visible composer bridge.

Browser Playwright smoke remains blocked until owner approval for new harness scaffolding.

## Privacy and Security Impact

The DFC draft option DTO must not expose:

- absolute paths
- `fileUrl`
- `contentToken`
- file body text
- raw storage refs
- full hashes
- raw `sourceMetaJson` or derivative `metaJson`

Renderer option selection should send back only stable option/ref identifiers and must not relax existing path, hash, content, or token boundaries.

## Owner Approval Request

Owner approval is required before implementation proceeds with either of these:

- Option B: backend-owned DFC draft option DTO endpoint and selected-option update contract.
- Option C: new browser Playwright harness scaffolding.

Recommendation: approve Option B for the next round, then revisit Playwright harness creation after the UI bridge has a stable DTO contract.
