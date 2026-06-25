# DFC v1.2 Closure Progress

Append-only progress log for the DFC v1.2 closure baseline.

## 2026-06-25 15:51 +08:00

Action:

- Started lightweight DFC v1.2 closure.
- Confirmed current dirty worktree contains only `public/build-id.json`, a generated build-id artifact that must stay uncommitted.
- Reviewed the supported matrix, M63/M64 evidence, progress ledger, important context, shared DFC target vocabulary, and targeted test surfaces.

Changed files:

- `docs/file-pipeline/document-format-conversion/dfc-goal-v1.2-closure-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-v1.2-closure-progress.md`

Preliminary conclusion:

- No P0/P1 backend contradiction found in the shared target vocabulary or current evidence docs.
- Closure should remain documentation-only unless validation or subagent review identifies a support-scope contradiction.

Validation:

- Pending.

Risks:

- `starverse_format_conversion_preview_v1_2.md` is broader as a design document; closure docs must keep the implementation baseline explicit.
- `public/build-id.json` remains dirty and excluded.

Next step:

- Add v1.2 closure addendum to the implementation matrix, progress ledger, and important context, then run targeted validation.

## 2026-06-25 15:58 +08:00

Action:

- Applied doc-consistency P1 fix: updated `important-context.md` top-level current status so the latest recovery anchor is DFC v1.2 closure with M63/M64 evidence, not the older M59 staging/import blocker.
- Recorded that M64 evidence is anchored in attachment productization living/progress docs and the `DFC-M64` / `DFC-M64-P2` ledger rows rather than a separate standalone M64 file.

Changed files:

- `docs/file-pipeline/document-format-conversion/important-context.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-v1.2-closure-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-v1.2-closure-progress.md`

Validation:

- Pending.

Risks:

- `progress-ledger.md` intentionally remains pending until targeted validation completes, then the row must be closed with actual results.

Next step:

- Wait for implementation-scope code mapping feedback, then run targeted DFC/UI/contract/i18n validation and static gates.

## 2026-06-25 16:03 +08:00

Action:

- Processed implementation-scope code mapping feedback.
- Recorded the key P1 interpretation risk: `fileRules.ts` and `sendRouteMapping.ts` contain broader legacy/future candidate families, but they are not the v1.2 implemented support authority.
- Kept the closure patch documentation-only; no runtime, support-format, Send Plan, DB schema, dependency, download, or UI behavior changed.

Changed files:

- `docs/file-pipeline/document-format-conversion/dfc-goal-v1.2-closure-living-plan.md`
- `docs/file-pipeline/document-format-conversion/dfc-goal-v1.2-closure-progress.md`
- `docs/file-pipeline/document-format-conversion/progress-ledger.md`
- `docs/file-pipeline/document-format-conversion/important-context.md`

Validation:

- `npm run rebuild:node` passed.
- `npx vitest --run src/ui-app/components/DraftAttachmentCard.test.ts src/ui-app/AppChatApp.attachments.test.ts src/shared/i18n/locales/localeKeyConsistency.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts src/next/files/conversationDraftClient.test.ts infra/files/conversationAttachmentService.test.ts src/shared/files/documentFormatConversion.test.ts infra/files/sendPlanService.test.ts src/next/openrouter/openRouterSendPlanSerializer.test.ts --testTimeout 60000 --reporter=dot` passed: 9 files / 403 tests.
- `npx vitest --run infra/db/worker.filePipeline.test.ts -t "DOCX pdf_attachment|unsupported|Office PDF|LibreOffice|XLSX|HTML pdf_attachment|table_markdown|legacy XLS|CSV|TSV" --testTimeout 60000 --reporter=dot` passed: 31 passed / 29 skipped.
- `npx vue-tsc --noEmit --pretty false` passed.
- `git diff --check` passed with LF/CRLF warnings only.
- `npm run gate:privacy` passed with no unclassified privacy-sensitive matches.

Risks:

- P2/release wording polish may still be desirable, but no P0/P1 support-scope contradiction remains after the current-status and candidate-layer clarifications.
- Electron smoke was not rerun because the closure patch is documentation-only and does not change real send or attachment detail paths; M64/M64-P2 already provide the live app evidence.

Conclusion:

- DFC v1.2 reaches `dfc_v1_2_stage_closure_baseline` for the current phase after final diff/privacy recheck and commit.
