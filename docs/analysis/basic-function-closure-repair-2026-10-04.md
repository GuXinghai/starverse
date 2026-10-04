# Basic-function deterministic repair closeout

**Status**: active (bounded repair evidence)
**Document Role**: repair closeout
**Last updated**: 2026-10-04
**Development line**: `models-dev-capability-resolution`
**Starting HEAD**: `54f026dc9524d4b92859f6c8a29167a3719b8103`
**Repair commit**: `327f00b34527dc21d2f7c7e940e528a433c92af5`

## Acceptance boundary

This pass repairs narrow defects whose behavior follows existing contracts. It does not establish full application readiness, live-provider acceptance, Electron smoke acceptance, or closure of every finding. No schema, user profile, credential, provider policy, attachment encoder revision, or stored answer snapshot was changed by a production migration. No push or billable provider call was performed.

The original audit is `basic-function-closure-audit-2026-10-04.md`, audited at `4ac2de5`. It remains byte-for-byte unchanged: SHA-256 `88085370571231cfbb90b15c1c64b9acd1f1a309c90e7408c496b702e1c7d3e4`. Findings already repaired at the starting HEAD are distinguished from this pass. Previously repaired findings were rechecked through existing implementations and regressions; no duplicate patch was made.

## Findings ledger

`THIS` refers to the repair commit above. `PARTIAL` and `DEFERRED` are open findings, not acceptance. Counts refer to the audit's eight numbered P1 and seventeen numbered P2 findings; the additional unnumbered privacy P2 is recorded separately.

| Finding | Status | Repair / evidence | Residual limit |
| --- | --- | --- | --- |
| P1-1 draft scope | Already repaired | `7896ddfb`; scope-ownership regressions | No new patch. |
| P1-2 regenerate attachments | PARTIAL, text repaired | THIS: text coordinators read the source answer's immutable attachment intent inside the authority transaction; renderer sends no current text-composer attachments. Descriptor preflight also reads the source. | Image regenerate retains existing composer semantics pending Owner decision. Compatible text keeps its empty-only input guard. Current settings/capabilities are resolved afresh; retry semantics are unchanged. |
| P1-3 Anthropic/Gemini prior-turn attachments | DEFERRED deterministic work | Reverified native history reconstruction and current-turn compiler boundaries | Requires a tested history/descriptor/blob replay repair across providers, including Gemini native history storage. No history or transport-policy shortcut was introduced. This remains a high-priority content-fidelity defect. |
| P1-4 active delete rebind | Already repaired | `7896ddfb`; existing single/bulk/project-delete scope tests | No new patch. |
| P1-5 post-submit navigation ownership | Already repaired | `7896ddfb`; delayed-submit scope tests | No new patch. |
| P1-6 orphan isolation / clock rollback | Repaired | THIS: one authority transaction per operation; only classified malformed local-state errors are isolated; terminal time is at least all relevant persisted timestamps | Malformed rows and their branch locks remain intact; startup logs a classified count. SQL/I/O failures still fail startup. No blanket corrupt-database acceptance. |
| P1-7 POSIX missing reset journal | Repaired | THIS: refuse any existing epoch root before reset cleanup, manifest/journal write or configuration clear | Covers missing/stale reset state conservatively. Portable Linux-branch fixtures ran on Windows; no Linux Electron smoke or real workspace reset. |
| P1-8 model aliases | Owner decision, unchanged | Exact requested/returned model identity remains enforced | Define accepted aliases and evidence provenance before changing equality. |
| P2-1 stream total deadline | Owner decision, unchanged | Existing five-minute total deadline preserved | Idle/total timeout semantics and bounds require policy choice. |
| P2-2 catalog apply / empty success | PARTIAL, policy propagation repaired | THIS: console awaits provider/global policy, uses existing precedence and apply/retention values; malformed policy blocks sync | Successful empty-catalog replacement versus retention of last-known-good requires Owner policy. Unconfigured explicit refresh follows existing picker fallback: manual / never. |
| P2-3 credential/catalog freshness | Repaired | THIS: credential event and selected catalog authority scope/digest changes invalidate/re-resolve active capability projection | Existing pending-send and stale-response fences retained; transient query/sync/policy changes do not trigger refresh. No live-provider acceptance. |
| P2-4 legacy controls | Owner decision, unchanged | Missing V2 implementations reverified | Choose implementation versus explicit unavailability/removal; no false-success acceptance is claimed. |
| P2-5 unsupported settings/modes | Owner decision, unchanged | Incomplete execution surfaces preserved | No unsupported route or security-policy relaxation added. |
| P2-6 shutdown drain | DEFERRED deterministic work | Reverified close ordering and running services | Requires coordinated cancellation/drain across generation, detection/materialization and plugin work. |
| P2-7 search | PARTIAL, prior navigation repair | `54f026dc` fixes route/page/focus navigation; search tests pass | Default scope and title/content matching remain unchanged and open. |
| P2-8 quiesce/runner start race | DEFERRED deterministic work | Reverified commit-to-runtime-registration boundary | Cross-coordinator transaction/runtime admission repair remains necessary. |
| P2-9 converted attachment edit | Repaired with prior fix | `7896ddfb` restores raw draft/conversion state on cancel; THIS makes historical derived attachments use the parent's detection authority, matching backend enforcement | No MIME/transport admission was widened. |
| P2-10 Gemini attached tool continuation | DEFERRED deterministic work | Reverified last-user-content/text lookup | Native continuation request/history regression must establish the safe compiler repair. |
| P2-11 conversion after provider switch | DEFERRED deterministic work | Reverified provider admission and renderer revalidation boundary | Provider changes still can fail loudly; no permissive transport fallback was added. |
| P2-12 partial bulk reconciliation | Repaired with prior fix | `7896ddfb` handles bulk delete; THIS uses allSettled and refresh/reconciliation for bulk move before displaying failure | Batch operations remain individually transactional; no atomic batch claim. |
| P2-13 no-op workspace controls during generation | Repaired | THIS: explicit mutationDisabled prop disables mutation controls and already-open confirmation paths | Navigation, search and New Chat retain their existing availability. |
| P2-14 branch authoring UI | Owner decision, unchanged | Unwired controls confirmed | Choose UI exposure and intended branch operations. |
| P2-15 corrupt config recovery | Owner decision, unchanged | Existing fail-closed config load preserved | Backup/reset consent and recovery authority must be specified; no config reset. |
| P2-16 UI preference lost writes / false acknowledgement | Repaired | THIS: known preference leaves merge synchronously in main; aggregate size limit retained; renderer returns true only on positive acknowledgement | Explicit nine-key allowlist; no generic descendant-store or credential access. |
| P2-17 renderer crash recovery | Owner decision, unchanged | Missing recovery policy confirmed | Reload/restart and repeated-crash behavior remain unspecified. |
| Unnumbered privacy P2 | Already repaired | `7896ddfb`; current privacy gate PASS | No new evidence rewrite. |
| Model identity gate regression | Already repaired | `7896ddfb`; current model-identity gate PASS | No allowlist weakening in this pass. |
| P2-R1 additional validation finding: Anthropic attachment encoding coverage | DEFERRED architecture review | Real coordinator attempts reject URL-reference metadata, and then managed-file `attachments[].kind`, at the existing encoding coverage validator | Failure is loud and transactionally rolled back. Define an immutable encoder revision/cutover before changing admitted semantic paths; the production validator was not mocked or relaxed. |
| P2-R2 additional validation finding: Anthropic action snapshot guard | Repaired | THIS: the shared regenerate/edit post-insert check now compares the persisted source ID to the pending source ID used for insertion | Initial-send source must still be null. This was an unconditional action failure, not a reason to weaken identity checks. |

Additional same-root repairs discovered by the coordinator regression: Anthropic initial-send and edit-resend passed branded decoded attachment identities to the plain command-facts decoder. Both now use the existing Anthropic attachment projection, as regenerate does. The shared action snapshot guard also required a null source after inserting a non-null regenerate/edit source; it now verifies the exact pending identity. These are representation and identity corrections, not history replay fixes; P1-3 remains open.

Remaining original numbered findings: **P0 0; P1 3; P2 12**. With the separately identified encoding blocker P2-R1, the known remaining total is **P0 0; P1 3; P2 13**. P1-2 is counted open because of image policy, P1-3 because history fidelity is still defective, and P1-8 because alias policy is undecided. Five original numbered P2 findings are fully closed: 3, 9, 12, 13, 16. P2-2 and P2-7 remain partial. The sixteen original “Needs verification” items are not silently promoted or declared closed.

No underlying audited defect was disproven outright. Several audit symptoms were already repaired in intervening commits, so treating them as current defects would have been stale. The starting Anthropic action guard and encoder coverage checks also masked the audit's claimed successful attachment-substitution journey by rejecting the request earlier; the wrong attachment selection remained a code defect, but a successful substituted Anthropic wire request was not reproduced. Deferred deterministic work is kept separate from genuine Owner decisions.

## Validation

Results below are per invocation; overlapping focused runs are not added into a claimed unique-test total.

| Check | Result |
| --- | --- |
| `npm run rebuild:node` | PASS before DB-heavy validation |
| `npm run test:unit -- --maxWorkers 2` | 327 files: 325 passed, 2 failed; 2751 tests: 2745 passed, 6 failed |
| `npm run test:ui -- --maxWorkers 2` (final after preference test-contract update) | 83 files / 635 tests PASS |
| `npm run test:integration -- --maxWorkers 2` (final after root-guard assertion update) | 176 files: 175 passed, 1 failed; 1331 tests: 1327 passed, 1 failed, 3 skipped |
| Core focused integration: dataEpochCoordinatorCore, generationOperationRuntimeRegistryV2, composerDraftV2Repo | 3 files / 34 tests PASS |
| Focused settings/preferences under unit config | 4 files / 12 tests PASS |
| Focused UI ownership, mutation controls, semantic invalidation, catalog policy | 4 files / 51 tests PASS |
| Focused store IPC | 1 file / 19 tests PASS |
| Focused root coordinator and Anthropic action regression | 2 files / 8 tests PASS |
| Anthropic/compatible coordinator pair | 2 files: 1 passed, 1 failed; 9 tests passed, 1 known stale assertion failed |
| Filtered new coordinator regressions | 3 passed, 7 skipped by name filter |
| Final `npx tsc --noEmit -p tsconfig.json`, `npx vue-tsc --noEmit` | PASS |
| Generation Goal-3 / zero-residual / capability-rule authority | PASS |
| Network egress / privacy / model identity | PASS |
| Test partition ownership | PASS |
| Docs metadata gate (`DOCS_BASE_REF=7896ddfb`) | FAIL: 39 missing metadata fields in preexisting documents; new closeout metadata is complete |
| TC17 / TC18 / TC16 | FAIL in unchanged legacy constraints: direct JSON.parse sites; three relative imports; missing old SSOT file |
| Final `git diff --check` | PASS (LF/CRLF normalization warnings only) |
| Electron / real-provider / managed LibreOffice smoke | NOT RUN |

The six final unit failures are unchanged known stale expectations: DeepSeek `stableCapabilityPolicyV2.test.ts` (one) and Gemini `interactionsImageCommandsV2.test.ts` (five). The final integration failure is `openAIChatCompatibleGenerationV2Coordinator.test.ts`, “applies the exact materialized rule claim before creating the runtime snapshot”: expected temperature range max 1, actual supported field has no domain. Tests and assertions were not weakened to hide them. The initial baseline additionally timed out in DeepSeek streaming and UI historical-search tests; both pass in the final bounded-worker suites. Initial integration had eleven Electron import failures caused by incomplete extraction after D: ENOSPC, plus the known compatible capability-domain assertion and Magika staging timeout. These initial runs used the shared tree while edits began, so they are not an immutable HEAD checkout baseline. The final integration run has no import failures and the Magika test passes.

The first full UI run failed only an old SettingsPanel aggregate-store-write assertion. It was updated to require the five expected leaf writes while retaining no-credential/no-catalog-policy assertions; the complete UI suite then passed. The first final integration run had 1326 passed, 2 failed, 3 skipped: the known compatible assertion and an old root-coordinator error-code expectation. The latter now expects the earlier live-root protection refusal and retains its file-integrity assertion; the full integration suite was repeated. Initial type checks caught unused harness locals and an attachment union assertion during test authoring; those were corrected, with final results recorded above.

Negative proof used HEAD production versions while keeping new regressions, then restored working files byte-for-byte:

- Reset/recovery/draft-read group: 10 failures on old code; restored patch 34/34 PASS.
- UI group: 10 failures on old app logic/list; patched focused group 51/51 PASS.
- Preference helper: 2 failures on old code; patched focused settings group 12/12 PASS.
- Store IPC: 1 failure on old code; patched group 19/19 PASS.
- Anthropic initial/edit/regenerate/snapshot-guard negative proof: replacing each production file separately with HEAD yields respectively 1, 1, 1, and 2 failures in the two-test action file. Restored patch passes both tests; the root/action group passes 8/8. The nonempty test is composition-only; the empty-source control uses the actual compiler.

The real nonempty Anthropic compiler was also exercised as a temporary diagnostic override in the new test: 1 expected failure at `GENERATION_V2_ENCODING_COVERAGE_INVALID`, 1 skipped by filter. The test file was restored byte-for-byte afterwards. This preserves direct evidence of P2-R1 rather than declaring the mocked nonempty request accepted end-to-end. The committed test stubs only final compilation for its nonempty, excluded managed-file composition case; source lookup, projection, graph, snapshot/command-facts authority and recovery are real. Included-file upload/encoding is not covered by that case.

Focused commands use explicit `vitest.unit.config.ts`, `vitest.ui.config.ts` or `vitest.integration.config.ts`. Paths that did not match a partition in exploratory commands are not counted as tests. Parent full-suite logs and negative-proof/diagnostic receipts are retained outside the repository in the task validation directory under the owner's Documents folder; extra worker-focused receipts are in the task transcript. No temporary diagnostic test was left in the repository.

Reproducible focused commands:

```powershell
npx vitest --run --config vitest.integration.config.ts electron/data-epoch/dataEpochCoordinatorCore.test.ts electron/services/generationOperationRuntimeRegistryV2.test.ts infra/db/repo/composerDraftV2Repo.test.ts
npx vitest --run --config vitest.integration.config.ts electron/data-epoch/epochRootCoordinatorCore.test.ts electron/services/anthropicPlainTextRegenerateCoordinatorV2.test.ts
npx vitest --run --config vitest.integration.config.ts electron/ipc/storeIpc.test.ts
npx vitest --run --config vitest.unit.config.ts src/next/generation-v2/renderer/uiPreferenceStoreV2.test.ts src/next/settings/webSearchDefaultsClient.test.ts src/next/settings/imageGenerationDefaultClient.test.ts src/next/settings/generationParamsDefaultsClient.test.ts --reporter=verbose
npx vitest --run --config vitest.ui.config.ts src/ui-app/AppChatApp.scopeOwnership.test.ts src/ui-app/components/ConversationList.mutations.test.ts src/ui-app/AppChatApp.semanticInvalidation.test.ts src/ui-app/AppChatApp.catalogRefreshPolicy.test.ts --reporter=verbose
npx vitest --run --config vitest.integration.config.ts electron/services/openAIChatCompatibleGenerationV2Coordinator.test.ts electron/services/anthropicPlainTextRegenerateCoordinatorV2.test.ts
npx vitest --run --config vitest.integration.config.ts electron/services/openAIChatCompatibleGenerationV2Coordinator.test.ts electron/services/anthropicPlainTextRegenerateCoordinatorV2.test.ts -t "rejects foreign raw attachments|Anthropic plain-text regenerate coordinator V2"
```

## Changed files and Git hygiene

Production paths:

```text
electron/data-epoch/dataEpochCoordinatorCore.ts
electron/ipc/storeIpc.ts
electron/mainV2.ts
electron/services/anthropicPlainTextInitialSendCoordinatorV2.ts
electron/services/anthropicPlainTextEditResendCoordinatorV2.ts
electron/services/anthropicPlainTextRegenerateCoordinatorV2.ts
electron/services/anthropicPlainTextSnapshotCommitV2.ts
electron/services/geminiPlainTextRegenerateCoordinatorV2.ts
electron/services/generationOrphanRecoveryV2.ts
electron/services/genericLocalOpenAIChatGenerationV2Coordinator.ts
electron/services/lmStudioOpenResponsesGenerationV2Coordinator.ts
electron/services/ollamaChatGenerationV2Coordinator.ts
electron/services/openAIChatCompatibleGenerationV2Coordinator.ts
electron/services/openAIResponsesPlainTextRegenerateCoordinatorV2.ts
electron/services/openRouterChatPlainTextRegenerateCoordinatorV2.ts
electron/services/regenerateSourceAttachmentsV2.ts
infra/db/repo/composerDraftV2Repo.ts
src/next/generation-v2/renderer/uiPreferenceStoreV2.ts
src/shared/settings/generationV2UiPreferenceKeys.ts
src/ui-app/AppChatApp.vue
src/ui-app/app/appChatApp.logic.ts
src/ui-app/components/ConversationList.vue
```

Regression paths:

```text
electron/data-epoch/dataEpochCoordinatorCore.test.ts
electron/data-epoch/epochRootCoordinatorCore.test.ts
electron/ipc/storeIpc.test.ts
electron/services/anthropicPlainTextRegenerateCoordinatorV2.test.ts
electron/services/generationOperationRuntimeRegistryV2.test.ts
electron/services/openAIChatCompatibleGenerationV2Coordinator.test.ts
infra/db/repo/composerDraftV2Repo.test.ts
src/next/generation-v2/renderer/uiPreferenceStoreV2.test.ts
src/next/settings/generationParamsDefaultsClient.test.ts
src/next/settings/imageGenerationDefaultClient.test.ts
src/next/settings/webSearchDefaultsClient.test.ts
src/ui-app/AppChatApp.scopeOwnership.test.ts
src/ui-app/AppChatApp.semanticInvalidation.test.ts
src/ui-app/AppChatApp.catalogRefreshPolicy.test.ts
src/ui-app/components/ConversationList.mutations.test.ts
src/ui-app/components/SettingsPanel.test.ts
```

The code commit stages only these 38 paths. This closeout has its own documentation commit. Unrelated `.codex/config.toml`, `pelican-bicycle.html`, the original audit and preexisting product-gap audit drafts remain excluded and preserved. No native output, node_modules, package-lock rebuild effect, build-id or generated runtime is staged.

## Environment and remaining risk

The baseline integration invocation automatically downloaded Electron and exhausted the nearly-full D: drive during extraction. Only that task-created partial `node_modules/electron/dist` was relocated; the official cached archive was extracted into a repository-external C: workdir and the ignored runtime path now points there through a junction. Electron import succeeds; the app itself was not launched. No unrelated user files were cleaned up. D: still has little free space, and automated tests do not establish a healthy production disk environment. Automatic approval rejected removal of the repository-external partial extraction with `blocked by policy`; that approximately 94 MB directory remains preserved, and no alternative deletion mechanism was attempted.

ABI report:

- better-sqlite3 ABI mismatch encountered: no.
- Rebuild command run: `npm run rebuild:node`.
- Current ABI target after task: node.
- Tests retried after ABI rebuild: none for mismatch; initial validation followed the required rebuild.
- Electron smoke retried after rebuild: no.
- No native artifacts committed: confirmed by the exact allowlist.

Static risk review found no unresolved P0/P1 in the patch boundary. It does not clear the remaining audit P1s. Malformed recovery state remains fail-closed and locked for explicit follow-up; included managed-file preflight, live credentials, provider-side file lifetime, actual Linux reset behavior and Electron shutdown/crash behavior need their own acceptance. This deterministic pass ends here; no speculative second repair pass was started.
