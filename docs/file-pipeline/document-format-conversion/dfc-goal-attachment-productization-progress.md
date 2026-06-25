# DFC v1.2 Attachment Productization Progress Log

Append-only log for the attachment productization goal.

## 2026-06-25 08:47 +08:00

Action:
- Started goal in the Starverse repo workspace.
- Read local project rules and relevant DFC memory summaries.
- Confirmed planning/progress docs are required deliverables.
- Created the living plan and this progress log before implementation.

Changed files:
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`

Current findings:
- Existing DFC docs already define Attachment Shelf, chip tooltip, status colors, Detail Inspector, selected-option-driven send, and preview/send same-source constraints.
- Latest LibreOffice closeout constrains this work to Windows x64 DOCX-to-PDF for `pdf_attachment`; unsupported Office/PDF families remain out of scope.
- Current worktree has unrelated provider/runtime changes that must be preserved and excluded from this DFC change where possible.

Tests:
- Not run yet. This entry is planning/inventory only.

Risks:
- Existing dirty files may overlap UI surfaces needed by this goal.
- Real Electron automation may require switching `better-sqlite3` ABI to Electron at the end.
- Diagnostics and preview UI must avoid raw paths, storage refs, tokens, command lines, env values, file bodies beyond intended preview, and full hashes.

Next step:
- Wait for code-map evidence, then refine file map and implement the smallest viable attachment shelf/detail/defaults loop on top of backend-owned DFC data.

## 2026-06-25 08:50 +08:00

Action:
- Received read-only code map for DFC attachment UI, IPC, backend contracts, send plan, docs, and tests.
- Inspected focused snippets in `DraftAttachmentStrip.vue`, `DraftAttachmentCard.vue`, `DraftAttachmentDetailsDialog.vue`, `appChatApp.logic.ts`, and `dbBridgeContracts.ts`.
- Updated the living plan file map and phase status.

Changed files:
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`

Current findings:
- The repo already has DFC option loading, preview loading, selected option updates, and send-plan semantic binding.
- The frontend surface exists but is still more diagnostic/card-like than productized: it shows asset ids, lacks a proper chip tooltip, and does not clearly explain recommended versus selected route.
- Detail Inspector has option buttons and text/raw previews, but needs target-card semantics, PDF attachment preview language, warning/diagnostic grouping, and a minimal explicit default action.

Tests:
- Not run yet. This entry is still planning/inventory.

Risks:
- A broad global default-setting architecture would exceed the requested productization scope unless an existing setting seam is clearly reusable.
- Current unrelated provider/runtime worktree changes overlap `AppChatApp.vue`/logic and must be preserved.

Next step:
- Patch the existing attachment components and app-layer view models without changing backend route ownership.

## 2026-06-25 09:04 +08:00

Action:
- Added a DFC attachment defaults setting shape and DB/IPC/client methods for sanitized target-kind preferences.
- Added backend-owned `recommendedOptionId` and `recommendedReasonCode` to DFC draft options.
- Converted draft attachment first-screen cards into compact chips with status color and tooltip/title details.
- Expanded the details dialog into target-format cards with recommendation, default matches, explicit default apply/save/clear actions, and metadata-only raw/PDF preview copy.

Changed files:
- `src/shared/files/dfcAttachmentDefaults.ts`
- `src/shared/files/documentFormatConversion.ts`
- `infra/db/repo/settingsKeys.ts`
- `infra/db/repo/settingsRepo.ts`
- `infra/db/dbMethodsRegistry.ts`
- `infra/db/worker/handlers/usagePrefsSettingsHandlers.ts`
- `infra/files/conversationAttachmentService.ts`
- `src/next/ipc/contracts/dbBridgeContracts.ts`
- `src/next/settings/dfcAttachmentDefaultsClient.ts`
- `src/ui-app/app/appChatApp.logic.ts`
- `src/ui-app/AppChatApp.vue`
- `src/ui-app/components/DraftAttachmentCard.vue`
- `src/ui-app/components/DraftAttachmentDetailsDialog.vue`
- `src/ui-app/components/DraftAttachmentCard.test.ts`
- `src/ui-app/AppChatApp.attachments.test.ts`

Tests:
- Not run yet after implementation.

Risks:
- The new settings methods need contract/registry coverage and may expose type errors in test mocks.
- The chip UI changed visible text expectations, so AppChatApp attachment tests may need targeted updates.
- Backend recommendation priority is intentionally conservative and must remain a recommendation, not an auto-selection.

Next step:
- Run focused UI/contract tests and `vue-tsc`, then fix compile/test regressions before broad validation.

## 2026-06-25 09:33 +08:00

Action:
- Fixed the focused AppChatApp attachment test regressions exposed by the first validation run.
- Corrected send-plan test fixtures so absent semantic metadata is omitted rather than encoded as `null`.
- Aligned the attachment UI test harness with the current runtime-selection path by explicitly selecting OpenRouter and mocking scoped model-catalog APIs.
- Kept renderer DFC defaults limited to sanitized `targetKind` preferences; no renderer-generated `optionId`, `targetKind` compatibility, or `SendAssetRef` is introduced.

Changed files:
- `src/ui-app/AppChatApp.attachments.test.ts`

Tests:
- Passed: `npx vitest --run src/ui-app/AppChatApp.attachments.test.ts --testTimeout 60000 --reporter=dot` (46 tests).
- Earlier partial run passed: `src/shared/files/documentFormatConversion.test.ts`, `src/next/files/conversationDraftClient.test.ts`, `src/next/ipc/contracts/dbBridgeContracts.test.ts`, `infra/files/conversationAttachmentService.test.ts`, and `src/ui-app/components/DraftAttachmentCard.test.ts`.
- Earlier partial run initially failed in `AppChatApp.attachments.test.ts`; fixed by protocol-shape and runtime-selection test harness updates.

Risks:
- Existing unrelated provider/runtime worktree changes still overlap `AppChatApp.vue` and `appChatApp.logic.ts`; final commit isolation remains a risk.
- Test output still shows non-fatal async settings getter noise after component teardown; assertions pass, but broader validation may expose the same noise.

Next step:
- Re-run the full focused DFC/UI/contract test set after adding any missing defaults coverage, then run `vue-tsc`.

## 2026-06-25 09:38 +08:00

Action:
- Added a focused UI test for saving and applying DFC defaults from the Detail Inspector.
- Fixed `vue-tsc` errors by adding recommendation fields to the Electron DFC smoke fixture and making the Detail Inspector recommendation label null-safe.
- Re-ran the focused DFC/UI/contract set and send-plan serializer coverage.

Changed files:
- `src/ui-app/AppChatApp.attachments.test.ts`
- `src/ui-app/app/appChatApp.logic.ts`
- `src/ui-app/components/DraftAttachmentDetailsDialog.vue`

Tests:
- Passed: `npx vitest --run src/ui-app/components/DraftAttachmentCard.test.ts src/ui-app/AppChatApp.attachments.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts src/next/files/conversationDraftClient.test.ts infra/files/conversationAttachmentService.test.ts src/shared/files/documentFormatConversion.test.ts --testTimeout 60000 --reporter=dot` (305 tests).
- Passed: `npx vue-tsc --noEmit --pretty false`.
- Passed: `npx vitest --run infra/files/sendPlanService.test.ts src/next/openrouter/openRouterSendPlanSerializer.test.ts --testTimeout 60000 --reporter=dot` (78 tests).

Risks:
- Focused UI tests pass, but real Electron launch validation is still pending.
- Existing provider/runtime dirty changes still overlap final commit boundaries.

Next step:
- Update implementation/closeout docs, then run `git diff --check`, privacy scan, and real Electron automation.

## 2026-06-25 10:18 +08:00

Action:
- Ran real Electron DFC attachment smoke through `npm run test:electron-smoke`; Electron mounted, backend-owned DFC seeding worked, Markdown preview opened, and HTML-to-PDF target cards rendered.
- The smoke failed on the HTML PDF metadata-only preview privacy sentinel because the user-facing copy contained the word `storage` while explaining that paths are hidden.
- Reworded metadata-only raw/PDF preview copy to avoid internal privacy-marker terms while preserving the user-visible explanation that content bytes and local locations are hidden.

Changed files:
- `src/ui-app/components/DraftAttachmentDetailsDialog.vue`

Tests:
- Failed then fixed: `npm run test:electron-smoke`.
- Failure: `HTML PDF preview exposed path, storage, hash, or file body-like content`.
- Evidence: `.artifacts/white-screen/electron-smoke/run-info.json` recorded a failed Electron run after real app launch.

Risks:
- The first real Electron run proved the smoke path is exercising the new product UI, but it must be rerun after the copy fix before marking Electron validation complete.
- Final commit isolation remains blocked-risky until overlapping pre-existing provider/runtime dirty changes are reviewed.

Next step:
- Re-run `npm run test:electron-smoke` and then update ledger/context docs with the final pass or blocker.

## 2026-06-25 10:22 +08:00

Action:
- Re-ran the real Electron DFC attachment smoke after the metadata-only preview wording fix.
- Confirmed the app mounted, scoped preload boundary held, backend-owned Markdown attachment seeding opened the Detail Inspector with send preview, and HTML-to-PDF `pdf_attachment` route rendered target cards plus metadata-only preview.
- Confirmed the smoke privacy sentinel reported `previewContainsPath: false`.

Changed files:
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`
- Pending doc updates: `progress-ledger.md`, `important-context.md`, supported matrix addendum.

Tests:
- Passed: `npm run test:electron-smoke`.
- Evidence: `.artifacts/white-screen/electron-smoke/run-info.json` status `passed`.

Risks:
- Electron validation is now complete for the DFC attachment productization path covered by the smoke.
- Final static checks, privacy scan, and commit isolation are still pending.

Next step:
- Update the final DFC-M64 evidence docs, then run final `vue-tsc`, `git diff --check`, and privacy scan.

## 2026-06-25 10:24 +08:00

Action:
- Ran final static validation after the Electron smoke and documentation updates.
- Confirmed final docs are covered by the privacy gate.

Changed files:
- `docs/file-pipeline/document-format-conversion/dfc-m1-phase-1-closeout-supported-matrix.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`

Tests:
- Passed: `npx vue-tsc --noEmit --pretty false`.
- Passed: `git diff --check` with line-ending warnings only.
- Passed: `npm run gate:privacy`.

Risks:
- Validation is complete for the implemented DFC productization path.
- Commit/clean-worktree completion is still at risk because unrelated provider/runtime dirty changes pre-existed and overlap some touched UI files.

Next step:
- Append DFC-M64 to `progress-ledger.md`, update `important-context.md`, then assess whether a safe partial DFC-only commit is possible.

## 2026-06-25 10:28 +08:00

Action:
- Appended DFC-M64 to the durable progress ledger.
- Added DFC-M64 recovery notes to `important-context.md`.
- Re-ran final privacy and diff checks after the ledger/context updates.

Changed files:
- `docs/file-pipeline/document-format-conversion/progress-ledger.md`
- `docs/file-pipeline/document-format-conversion/important-context.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`

Tests:
- Passed: `git diff --check` with line-ending warnings only.
- Passed: `npm run gate:privacy`.

Risks:
- Documentation evidence is complete.
- Commit/clean-worktree status still depends on separating unrelated pre-existing dirty files from this DFC change.

Next step:
- Inspect worktree/diff ownership and decide whether staging a coherent DFC-only commit is safe without absorbing unrelated provider/runtime work.

## 2026-06-25 10:31 +08:00

Action:
- Inspected `git status --short`, `git diff --name-status`, `git diff --stat`, and focused diffs for overlapping files.
- Confirmed this DFC work overlaps pre-existing provider/runtime dirty changes in `src/ui-app/AppChatApp.vue` and `src/ui-app/app/appChatApp.logic.ts`.
- Decided not to stage or commit by whole file because that would absorb unrelated provider/runtime changes into a DFC commit.

Changed files:
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`

Tests:
- No new tests run in this entry; this was a commit-safety assessment.

Risks:
- Coherent DFC-only commit requires careful partial staging or prior separation of unrelated provider/runtime work.
- Clean worktree cannot be claimed while those unrelated dirty files remain.

Next step:
- Stop for owner/developer decision on commit isolation: either authorize a DFC-only partial staging pass, or first separate/commit/stash the provider/runtime work outside this DFC goal.

## 2026-06-25 10:37 +08:00

Action:
- Built a DFC-only partial staged patch for the overlapping `src/ui-app/AppChatApp.vue` and `src/ui-app/app/appChatApp.logic.ts` files.
- Verified the partial patch applies cleanly to the index and contains only DFC default/recommendation/Detail Inspector wiring, not provider/runtime or DOCX smoke seam changes.
- Staged the remaining DFC-owned implementation, test, privacy-scan, and documentation files.

Changed files:
- `src/ui-app/AppChatApp.vue` (partial index only)
- `src/ui-app/app/appChatApp.logic.ts` (partial index only)
- DFC-owned files listed in the DFC-M64 ledger row
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`

Tests:
- Passed: `git apply --cached --check -p2` for the generated DFC-only patch.
- Passed: staged diff boundary scan for `AppChatApp.vue` and `appChatApp.logic.ts`; no provider/runtime terms or DOCX smoke seam terms were present in those staged hunks.
- Passed: `git diff --cached --check`.

Risks:
- The commit can now be made coherently for DFC-only scope.
- The worktree will still not be clean after commit because unrelated provider/runtime dirty changes remain outside this goal.

Next step:
- Commit the staged DFC-only diff, then report that clean-worktree completion remains blocked by unrelated pre-existing changes.

## 2026-06-25 10:39 +08:00

Action:
- Created a coherent DFC-only commit from the staged diff.
- Confirmed no unrelated provider/runtime files were staged into that commit.
- Confirmed the remaining dirty worktree entries are outside the DFC commit and pre-existing/unrelated to this goal.

Changed files:
- DFC-only staged files were committed.
- Unrelated provider/runtime files remain unstaged and uncommitted.

Tests:
- Commit succeeded: `git commit -m "Productize DFC attachment sending experience"`.
- Post-commit `git status --short` shows no DFC-owned staged leftovers; remaining dirty entries are provider/runtime files and overlapping unstaged hunks.

Risks:
- Clean worktree is still not achievable inside this DFC goal without moving, committing, stashing, or reverting unrelated provider/runtime work, which this goal must not do implicitly.

Next step:
- Stop with DFC implementation, validation, docs, and commit complete; report clean-worktree blocker as unrelated dirty worktree state.

## 2026-06-25 10:47 +08:00

Action:
- Re-audited the worktree after the DFC-only commit.
- Confirmed `git diff --cached --name-status` is empty.
- Confirmed DFC-owned committed files and DFC goal docs have no remaining unstaged diff.
- Confirmed the remaining dirty worktree entries are outside the DFC-M64 commit boundary and belong to provider/runtime work, with an unverified DOCX smoke seam still mixed into `src/ui-app/app/appChatApp.logic.ts`.

Changed files:
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`

Tests:
- Read-only audit commands:
  - `git status --short`
  - `git log -1 --oneline --stat`
  - `git diff --name-status`
  - `git diff --cached --name-status`
  - DFC-owned path diff check using `git diff --name-only -- <DFC paths>`.

Risks:
- Clean worktree cannot be completed inside DFC-M64 without an owner decision for the unrelated provider/runtime changes.
- Committing the remaining work would absorb a separate provider/runtime feature set; reverting or stashing it would modify user-owned dirty state.

Next step:
- Treat the goal as blocked on unrelated worktree cleanup after three consecutive goal turns with the same clean-worktree blocker.

## 2026-06-25 10:58 +08:00

Action:
- User removed the clean-worktree requirement from the active goal.
- Reclassified the DFC-M64 state from blocked-on-unrelated-worktree to complete for the revised objective.
- Kept the unrelated provider/runtime dirty worktree entries untouched and outside the DFC commit.

Changed files:
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`
- `docs/file-pipeline/document-format-conversion/progress-ledger.md`
- `docs/file-pipeline/document-format-conversion/important-context.md`

Tests:
- Completion evidence already passed before this requirement change:
  - `npx vitest --run src/ui-app/components/DraftAttachmentCard.test.ts src/ui-app/AppChatApp.attachments.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts src/next/files/conversationDraftClient.test.ts infra/files/conversationAttachmentService.test.ts src/shared/files/documentFormatConversion.test.ts --testTimeout 60000 --reporter=dot`
  - `npx vitest --run infra/files/sendPlanService.test.ts src/next/openrouter/openRouterSendPlanSerializer.test.ts --testTimeout 60000 --reporter=dot`
  - `npx vue-tsc --noEmit --pretty false`
  - `npm run test:electron-smoke`
  - `git diff --check`
  - `npm run gate:privacy`
- This entry will be followed by doc-only `git diff --check` and `npm run gate:privacy` before the commit is amended.

Risks:
- Unrelated provider/runtime dirty files remain in the worktree by design; they are no longer part of DFC-M64 acceptance.
- Future provider/runtime work should not treat the DFC-M64 commit as containing those unstaged changes.

Next step:
- Amend the DFC commit with this final evidence update and mark the revised goal complete.

## 2026-06-25 11:00 +08:00

Action:
- Re-ran final documentation-scope checks after the clean-worktree requirement was removed.
- Kept the DFC-only commit boundary intact; unrelated provider/runtime dirty work remains untouched.

Changed files:
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`
- `docs/file-pipeline/document-format-conversion/progress-ledger.md`
- `docs/file-pipeline/document-format-conversion/important-context.md`

Tests:
- `git diff --check -- docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md docs/file-pipeline/document-format-conversion/progress-ledger.md docs/file-pipeline/document-format-conversion/important-context.md` passed with LF/CRLF warnings only.
- `npm run gate:privacy` passed: scanned 1236 files, no unclassified privacy-sensitive matches.

Risks:
- The remaining dirty worktree entries are outside DFC-M64 and are intentionally not absorbed into this productization commit.

Next step:
- Amend the DFC productization commit with this final evidence update and mark the revised goal complete.

## 2026-06-25 14:58 +08:00

Action:
- Started the DeepSeek P2 review fix for commit `67e7c779` as a DFC UI-only polish round.
- Added DFC attachment UI strings to the existing shared i18n `filePipeline` namespace for zh-CN and en-US.
- Changed `DraftAttachmentCard.vue` tooltip/status labels to use shared i18n and human Chinese labels instead of hardcoded English/raw route/compatibility terms.
- Changed `DraftAttachmentDetailsDialog.vue` main view to show human-readable labels for target format, selection status, preview status, compatibility, diagnostics, defaults, and URL/send-mode sections.
- Moved raw debug fields such as `assetKind`, `aiPayloadKind`, `sourceKind`, `displayStatus`, `detectionLevel`, `sendPlanStatus`, decision raw fields, diagnostic codes, and timestamps into a default-collapsed advanced information block.
- Removed the unused local `dfcManaged` field from the details component prop type instead of giving it artificial UI behavior.
- Localized DFC default-save/default-clear feedback in `appChatApp.logic.ts`; the existing transient composer feedback now shows visible Chinese success copy after save.
- Corrected the living-plan file map so `DraftAttachmentStrip.vue` is described as the shelf/list container, not as a file modified for the productization polish.

Changed files:
- `src/shared/i18n/locales/zh-CN/filePipeline.json`
- `src/shared/i18n/locales/en-US/filePipeline.json`
- `src/ui-app/components/DraftAttachmentCard.vue`
- `src/ui-app/components/DraftAttachmentCard.test.ts`
- `src/ui-app/components/DraftAttachmentDetailsDialog.vue`
- `src/ui-app/AppChatApp.attachments.test.ts`
- `src/ui-app/app/appChatApp.logic.ts`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`

Tests:
- `npm run rebuild:node` passed.
- `npx vitest --run src/ui-app/components/DraftAttachmentCard.test.ts src/ui-app/AppChatApp.attachments.test.ts src/shared/i18n/locales/localeKeyConsistency.test.ts --testTimeout 60000 --reporter=dot` passed: 3 files / 69 tests.
- `npx vue-tsc --noEmit --pretty false` passed.

Risks:
- This round intentionally does not change DFC backend authority, conversion capability, DB schema, Send Plan semantics, runtime behavior, download policy, or supported formats.
- The worktree still contains unrelated provider/runtime dirty files outside this DFC polish; do not absorb or revert them while closing this review fix.

Next step:
- Run the remaining related DFC/contract tests, `git diff --check`, privacy gate, and update `progress-ledger.md` plus `important-context.md` with final evidence.

## 2026-06-25 15:07 +08:00

Action:
- Completed the DeepSeek P2 DFC attachment UI polish validation and evidence update.
- Confirmed the Electron smoke path exercises DFC attachment details through stable `data-testid` selectors and format labels, so no smoke script patch was needed.
- Rebuilt Electron ABI and ran the real Starverse Electron smoke after the UI/i18n polish.
- Updated the living plan, progress ledger, and important context with final evidence and boundaries.

Changed files:
- `src/shared/i18n/locales/zh-CN/filePipeline.json`
- `src/shared/i18n/locales/en-US/filePipeline.json`
- `src/ui-app/components/DraftAttachmentCard.vue`
- `src/ui-app/components/DraftAttachmentCard.test.ts`
- `src/ui-app/components/DraftAttachmentDetailsDialog.vue`
- `src/ui-app/AppChatApp.attachments.test.ts`
- `src/ui-app/app/appChatApp.logic.ts`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-attachment-productization-progress.md`
- `docs/file-pipeline/document-format-conversion/progress-ledger.md`
- `docs/file-pipeline/document-format-conversion/important-context.md`

Tests:
- `npx vitest --run src/next/ipc/contracts/dbBridgeContracts.test.ts src/next/files/conversationDraftClient.test.ts infra/files/conversationAttachmentService.test.ts src/shared/files/documentFormatConversion.test.ts --testTimeout 60000 --reporter=dot` passed: 4 files / 256 tests.
- `git diff --check` passed with LF/CRLF warnings only.
- `npm run gate:privacy` passed: scanned 1236 files, no unclassified privacy-sensitive matches.
- `npm run rebuild:electron` passed.
- `npm run test:electron-smoke` passed after its internal Electron rebuild: backend-owned Markdown DFC attachment details opened with selected preview, HTML `pdf_attachment` details opened with derived ref and metadata-only preview, and the preview privacy sentinel reported `previewContainsPath: false`.

Risks:
- Current ABI target is Electron after the required smoke path.
- The worktree still contains unrelated provider/runtime dirty files outside this DFC polish; this round did not revert or absorb them.
- `src/ui-app/app/appChatApp.logic.ts` has unrelated existing dirty hunks, so any future commit must stage only the DFC-owned polish hunks.

Next step:
- If this polish is committed, create a DFC-only commit or partial stage that excludes unrelated provider/runtime changes and generated native/build artifacts.
