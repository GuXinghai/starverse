# DFC-17 Option Generation Trigger Owner Memo

Status: owner-level stop memo after DFC-16. No production code, DB schema, Send Plan behavior, UI behavior, conversion runtime, dependencies, external engines, Playwright harness, or legacy bridge are changed in DFC-17.

SSOT: `docs/file-pipeline/document-format-conversion/starverse_format_conversion_preview_v1_2.md` remains authoritative and was not modified.

## Objective

DFC-16 made existing worker-generated text derivatives DFC-ready, but it did not decide when the system should generate missing derived options before the user selects a DFC target.

The next implementation needs an owner decision because multiple viable designs exist:

- Generate low-cost Phase 1 conversions at upload time.
- Generate them when the attachment detail dialog opens.
- Add an explicit backend-owned ensure endpoint that the UI calls before or during option display.
- Keep generation lazy inside `sendPlan.buildCurrent`.
- Start browser Playwright smoke work first.

Choosing any one of these in production changes user-visible timing, job ownership, retry semantics, and stale/pending option states.

## Current Facts

- `conversationDraft.getDfcOptions` is the backend-owned sanitized option DTO endpoint. It lists the raw `original_file` option and currently eligible derived options from existing backend state.
- `conversationDraft.updateAttachmentSettings` validates `selectedOptionId` and `selectedAssetRefs` against backend-owned option candidates and persists through existing DFC draft binding fields.
- `conversationDraft.getDfcPreview` reads preview from the selected option and selected `SendAssetRef` authority.
- The existing attachment detail dialog calls `conversationDraft.getDfcOptions` and `conversationDraft.getDfcPreview`, displays backend-owned state, and persists backend-provided option ids/refs only.
- DFC-16 backfills DFC facade metadata for ready `extracted_text` derivatives when the existing worker send-plan bridge generates or rechecks them.
- The current generation trigger for those derivatives is `sendPlan.buildCurrent`, not upload and not attachment detail open.
- `getDfcOptions` is not an ensure/generation endpoint. It should remain safe to call for display without silently mutating conversion state unless the owner approves that behavior.
- The repo still has no durable `ConversionOption` table, no persisted option-generation state, and no browser Playwright harness to extend for the full upload/shelf/detail/option/preview/remove/send-gating smoke.

## Stop Triggers

Proceeding without an owner decision would cross at least one owner-level boundary:

- `selectedOptionId` ownership has multiple viable lifecycle designs because missing/pending options can be produced on upload, on detail open, on explicit ensure, or only during send-plan build.
- Broadening `getDfcOptions` into a mutating endpoint would change API semantics and user-visible pending states.
- Adding browser Playwright coverage requires new harness scaffolding because no root `playwright.config.*` exists.
- Triggering new conversions for upload/open paths risks touching conversion runtime orchestration and job semantics beyond DFC-16.

## Options

### Option A: Keep generation lazy in `sendPlan.buildCurrent`

Continue with the current behavior: DFC options only become available after Send Plan generation creates or rechecks existing text derivatives.

Pros:

- No new endpoint.
- Minimal production change.
- Keeps conversion writes inside an existing worker path.

Cons:

- Detail UI can show no derived option until send-plan refresh happens.
- Option availability depends on a send-planning side effect.
- It does not match the SSOT upload-stage flow where candidate options and low-cost preview assets can exist before send.
- It leaves the user-facing option picker with coarse pending/missing states.

### Option B: Generate low-cost Phase 1 options on upload

Create eligible Phase 1 text-like derivatives soon after ingestion or attachment creation.

Pros:

- Option DTOs are ready when the user opens details.
- Closest to the SSOT upload-stage model for low-cost options.
- Reduces UI pending states.

Cons:

- Changes upload latency and background job behavior.
- Requires careful cancellation/writeback handling when attachments are removed.
- May generate unused assets.
- Needs a clear storage/TTL policy for draft-bound or temporary derivatives.

### Option C: Generate when attachment details open

The detail flow would trigger backend conversion before or while fetching options.

Pros:

- Work happens only when the user inspects options.
- Keeps initial upload cheaper.
- Directly supports the existing dialog workflow.

Cons:

- Dialog open becomes a mutating operation if reused through `getDfcOptions`, or requires a separate ensure call.
- Pending/error states must be designed for the dialog.
- The UI must avoid inventing option identity while waiting.

### Option D: Add explicit `conversationDraft.ensureDfcOptions`

Add a backend-owned mutating endpoint that creates or schedules low-cost Phase 1 conversions, returns sanitized pending/ready option state, and keeps `getDfcOptions` read-only.

Pros:

- Keeps read and mutation semantics clear.
- Keeps option identity backend-owned.
- Gives the UI an explicit place to request generation without inventing targetKind or refs.
- Can return `pending`, `blocked`, `failed`, and `ready` without silent fallback.
- Can reuse existing worker text-derivative generation and DFC facade metadata without new external engines.

Cons:

- Adds a new IPC/service contract and tests.
- Requires a precise policy for idempotency, retry, attachment removal, and stale derivatives.
- Still does not create durable `ConversionOption` rows unless separately approved.

### Option E: Create browser Playwright harness first

Add the missing browser E2E harness before changing generation timing.

Pros:

- Establishes the final acceptance path for upload/shelf/detail/option/preview/removal/send gating.
- Reduces risk for later UI changes.

Cons:

- Requires new harness scaffolding and likely app launch/fixture decisions.
- Does not resolve backend generation timing.
- Is explicitly owner-approval-required under the current stop conditions.

## Recommendation

Approve Option D as DFC-18:

- Add an explicit backend-owned `conversationDraft.ensureDfcOptions` contract.
- Limit generation to already-approved Phase 1 local text-like paths: plain text, Markdown, source code, CSV, and TSV.
- Keep HTML, PS/EPS, PDF, Office, XLS, XLSX, external engines, and new dependencies out of scope.
- Keep `conversationDraft.getDfcOptions` read-only.
- Return sanitized option state with `pending`, `blocked`, `failed`, and `ready` statuses.
- Require the renderer to call the ensure endpoint by attachment id/conversation id only; it must not send targetKind, raw/derived refs, or invented option ids.
- Preserve the current Send Plan lazy generation path as a backend fallback only if it remains governed by the same DFC option authority and no-silent-fallback rules.

Recommended DFC-18 scope:

- Define request/response DTOs for `conversationDraft.ensureDfcOptions`.
- Implement idempotent worker/service handling for existing Phase 1 text-like conversions.
- Persist generated DFC metadata through existing `file_derivatives` and `source_meta_json` facade fields only.
- Add targeted worker/service/IPC/client/privacy tests.
- Do not add visible UI changes beyond the minimal client plumbing needed for a future backend-owned picker refresh.

Recommended DFC-19 scope after DFC-18:

- Wire the existing attachment details dialog to call `ensureDfcOptions` before or during option refresh.
- Keep the visible UI small and local to the existing dialog.
- Verify no renderer-inferred option identity appears.

Recommended Playwright scope:

- Stop for separate owner approval before adding `playwright.config.*` or browser E2E scaffolding.
- Implement the full smoke only after the generation trigger and UI behavior are stable enough to test.

## Affected Files

Likely DFC-18 files if Option D is approved:

- `src/shared/files/documentFormatConversion.ts`
- `src/next/ipc/contracts/dbBridgeContracts.ts`
- `src/next/files/conversationDraftClient.ts`
- `infra/db/dbMethodsRegistry.ts`
- `infra/db/validation.ts`
- `infra/db/worker/handlers/filePipelineHandlers.ts`
- `infra/files/conversationAttachmentService.ts`
- `infra/files/sendPlanService.ts` only if shared generation logic must be extracted from the worker bridge
- Targeted tests beside the changed modules

Likely DFC-19 UI files:

- `src/ui-app/app/appChatApp.logic.ts`
- `src/ui-app/components/DraftAttachmentDetailsDialog.vue`
- `src/ui-app/AppChatApp.attachments.test.ts`

Likely browser-smoke files only after separate owner approval:

- `playwright.config.*`
- `tests/playwright/**` or another owner-approved E2E location
- App launch and fixture helpers required by that harness

## Migration Impact

No DB migration is recommended for Option D if idempotent option generation can be represented through existing `file_derivatives`, `derivative_jobs`, draft attachment DFC binding columns, and existing `source_meta_json` metadata.

Stop before implementation if durable `ConversionOption` rows, new draft/message columns, or new conversion-state tables become necessary.

## Test Impact

Required tests if Option D is approved:

- IPC decoder/validation tests for the ensure DTO.
- Worker tests proving idempotent generation and sanitized results.
- Service tests proving generated options are backend-owned and selectable only through validated ids/refs.
- No-silent-fallback tests for missing, failed, stale, blocked, and unavailable generated options.
- Privacy tests proving no path, `fileUrl`, full hash, `contentToken`, storage ref, file body, or raw metadata leaks through the ensure DTO.
- Existing Send Plan and preview/send coherence tests after generation changes.

Browser Playwright remains blocked until owner approval for harness scaffolding.

## Privacy and Security Impact

The ensure DTO must not expose:

- absolute paths
- `fileUrl`
- `contentToken`
- storage refs
- file body
- raw temp paths
- full hashes
- raw `sourceMetaJson` or derivative `metaJson`

The ensure endpoint must not execute scripts, macros, HTML rendering, PDF rendering, Office extraction, PS/EPS rendering, or any external engine in this phase.

## Owner Approval Request

Owner approval is required before implementing either:

- Option D: explicit backend-owned `conversationDraft.ensureDfcOptions` generation contract.
- Option E: new browser Playwright harness scaffolding.

Recommendation: approve Option D for the next implementation round, then revisit browser Playwright after the generation trigger and existing-dialog UI behavior are stable.
