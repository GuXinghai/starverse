# Repair Phase 2: data integrity, startup and failure isolation

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-23

This phase does R2-01, R2-02 and R2-04 to R2-07 from [repair-plan.md](repair-plan.md) section 3. R2-03 is withdrawn (D-2r). The optional items P2a-05 and P2a-06 were not done (section 6).

- Application source changed for the first time in the repair series. Each fix is covered by a test that names its finding ID.
- The Phase 1 `it.fails` tests for P2b-01, P2a-01 and P4a-01 are now ordinary tests. No assertion was weakened.
- No provider or network requests were made. Tests used temporary directories and in-memory databases. The Electron smoke used isolated, offline agent profiles under the system temporary directory, never the normal application profile.

## 1. Scope and repository state

| Item | Value |
|---|---|
| Branch | `codex/static-review-repairs`, on top of `d57b76a1` (Phase 1) |
| Untouched working-tree content | `world_map_experiment/__pycache__/` (untracked, preserved, not committed) |
| Subagents | Two read-only mapping agents (R2-05/R2-06 generation paths; R2-02/R2-07 startup and dialog paths); see section 7 |

## 2. Changes by item

### R2-01: line-ending-independent schema digest (P2b-01, P8-01)

- `.gitattributes` (new): `*.sql text eol=lf`, so new checkouts hash the same bytes everywhere.
- `infra/db/v2/schemaComposerV2.ts`:
  - Fragments are normalised from CRLF to LF before hashing and validation. The digest of this schema is now the same for LF, CRLF and mixed checkouts.
  - New `canonicalizeGenerationV2SchemaDigestInActiveTransaction`. A database stamped with a line-ending alias of the **current** schema is re-stamped with the canonical digest, inside the open transaction. The aliases are: the pinned mixed-ending digest of the reviewed Windows checkout (`CURRENT_SCHEMA_RAW_LINE_ENDING_DIGESTS`), the digest of the fragments with CRLF endings, and the digest of the raw on-disk fragments.
  - Before re-stamping it checks, in order: the installed schema verifies under the alias; every installed object equals an in-memory database built from the current fragments (`schemaRowsEqual`, otherwise `GENERATION_V2_SCHEMA_STATE_INVALID`); and the epoch identity validates. The immutable identity trigger is dropped and restored around the single `app_meta_v2` update, which must change exactly one row.
  - An unknown digest is left alone, so it still reaches the existing mismatch classification and, under D-2r, the recovery path.
- `electron/data-epoch/freshEpochDatabaseInitializer.ts`: the canonicalisation runs first in the upgrade chain for non-empty databases.
- **No pinned predecessor constant was changed.** The stop condition in the plan was not reached.

### R2-02: accurate, localised schema-recovery dialog (P2a-02)

- `electron/data-epoch/schemaMismatchRecoveryPrompt.ts`:
  - The confirmation dialog states what moves to the backup and what stays. Moved: everything stored in the database, including conversations and their history, and OpenAI-compatible providers with their API keys. Kept: app settings and built-in provider API keys. It also shows the backup folder (`<productRoot>/epoch-2-recovery-backups`).
  - The old text said that credentials would not be reset, which was wrong for OpenAI-compatible providers.
  - New `schemaMismatchRecoveredNoticeOptions` and `notifySchemaMismatchRecovered` show success in the UI with the exact backup directory. They follow the existing `notifyConfigRepaired` pattern, so the notice does not block startup.
  - All strings come from `dialogs.schemaRecovery.*` in the zh-CN and en-US bundles. The config store is not open at this point, so the locale follows the system languages (`matchSystemLocale(app.getPreferredSystemLanguages())`).
- `electron/epoch2MainEntry.ts`: passes the backup root and locale to the confirmation, and shows the success notice after the retried startup succeeds.
- `electron/data-epoch/schemaMismatchRecovery.ts`: corrected the doc comment that said credential vaults were untouched.

### R2-04: resumable crash window at `config_replaced` (P2a-01)

- `electron/data-epoch/epoch2CommittedBootstrap.ts`: the journal phase `config_replaced` with an existing epoch root now resumes through root creation, instead of being treated as a live workspace.
- The existing idempotent marker check decides the outcome:
  - an empty root, or a root containing only the expected marker, resumes;
  - a root with any other content still fails closed with `EPOCH2_POSIX_EPOCH_ROOT_CONFLICT`. The content is kept and the journal is unchanged.

### R2-05: every operation reaches a terminal state (P4a-01, P2b-02 + P4a-02, P2b-06)

- `electron/services/generationOperationRuntimeRegistryV2.ts`:
  - A failed receipt insert (`receiptPersisted: false`) now fails the operation with `GENERATION_V2_NATIVE_COMPLETION_RECEIPT_PERSIST_FAILED` instead of returning early. This releases the branch lock, and Stop works again (P4a-01).
  - Terminalisation is factored into `#failOperation`.
- `electron/services/generationNativeCompletionV2.ts`: the pending-receipt scheduler reports a receipt once it has used its whole retry budget (`[100, 500, 2000]` ms) through the new `onGenerationNativeCompletionRecoveryExhaustedV2`. The registry fails that operation with `GENERATION_V2_NATIVE_COMPLETION_MATERIALIZATION_EXHAUSTED` (P2b-02, P4a-02, P2b-06).
- The receipt itself stays `pending`, because receipts cannot be deleted by design. It is retried on the next start, which is harmless because the operation is already failed. The error is recorded and is not reported as success (D-4).

### R2-06: a corrupt artifact quarantines only its own operation (P2b-05, I4a-07)

- `electron/services/generationOrphanRecoveryV2.ts`: `loadRecoveryArtifactJson` now classifies `NativeArtifactStorageV2Error` as an invalid artifact. Before this, a chunked artifact with a missing chunk threw an unclassified storage error that aborted all orphan recovery and, through `mainV2.ts`, application startup.
- The operation now goes to `unrecovered`, the other operations recover, and startup continues. Database and I/O errors are still fatal, as before.
- **Partly done.** Two parts of the acceptance are not met; see section 5:
  - The quarantined operation keeps its existing rows and its branch lock. This is the current design, and existing tests assert it.
  - There is no explicit restricted mode and no error state in the conversation.

### R2-07: minimal failure handlers (P4a-18, P1-06, P1-04)

- **P1-04.** `electron/services/appShutdownCoordinatorV2.ts` has a new `closeResourcesInOrderV2`. It runs every close step, always runs the final database close, then rethrows the first failure. `electron/mainV2.ts` uses it, so a failing step no longer skips `runtime.epoch2.close()`.
- **P1-06.** `electron/bootstrap/epoch2StartupCleanup.ts` (new) has `startWithEpoch2RuntimeCleanup`. If `installEpoch2ApplicationRuntime` or `startMainV2` fails after bootstrap, the committed runtime is closed and the original error is rethrown. A close failure is logged as a code only.
- **P4a-18:**
  - The runner's detached `.catch` in the registry no longer lets a throwing terminalisation become an unhandled rejection. It logs `GENERATION_V2_RUNTIME_TERMINALIZE_FAILED`.
  - `epoch2MainEntry.ts` adds an `uncaughtExceptionMonitor` that writes only the origin and the error name. It never writes the message, a path or a credential, and it does not change Electron's default handling.

## 3. Tests added or changed

| File | Finding IDs | Change |
|---|---|---|
| `infra/db/v2/schemaDigestLineEndings.regression.test.ts` | P2b-01 | `it.fails` → `it`. Added: re-stamp of a mixed-ending alias; an unknown digest is left to the mismatch path; an alias whose installed objects differ is refused |
| `electron/data-epoch/epoch2CommittedBootstrap.test.ts` | P2a-01 | Crash after root creation resumes; crash after the marker resumes; unexpected content still fails closed |
| `electron/services/generationOperationRuntimeRegistryV2.test.ts` | P4a-01, P2b-05, P4a-18 | P4a-01 `it.fails` → `it`, now also asserting the error code and no active runner; corrupt Anthropic artifact isolated; throwing terminalisation logged, no unhandled rejection |
| `electron/services/openAIResponsesGenerationAuthorityV2Service.test.ts` | P2b-02 | Receipt materialisation that keeps failing ends the operation as failed after the retry budget |
| `electron/services/appShutdownCoordinatorV2.test.ts` | P1-04 | `closeResourcesInOrderV2`: all steps run, the final close always runs, the first failure is rethrown |
| `electron/bootstrap/epoch2StartupCleanup.test.ts` (new) | P1-06 | Runtime closed on startup failure; original error kept when close also fails |
| `electron/data-epoch/schemaMismatchRecoveryPrompt.test.ts` | P2a-02 | Old assertions encoded the inaccurate text and were replaced. New tests check what moves, what stays and the backup path in both locales, plus the success notice |

Mutation checks: the tests for the `schemaRowsEqual` guard, P4a-18 and P2b-02 were each run against a reverted fix and failed for the stated reason, and passed again after restore.

## 4. Checks run

| Check | Result |
|---|---|
| Touched test files plus `config/vitestPartitionConfig.test.ts` and `src/shared/i18n` (incl. `localeKeyConsistency.test.ts`) | Pass |
| `node scripts/check-test-partitions.mjs` | Pass: 670 files, each with one owner (unit 363, ui 91, integration 216) |
| `npm run typecheck` | Pass |
| ESLint on changed files | 0 errors. 28 warnings (function length and complexity), almost all in pre-existing long functions |
| Unit partition | 13 failed, 3179 passed, 5 expected fail. Phase 1 baseline: 13 failed. One differing name (`responsesRequestV1` "rechecks item limits…") passes when run alone, so it is load-related. The rest are the baseline failures |
| UI partition | 17 failed (baseline 18). No new failures |
| Integration partition | 35 failed, 1716 passed, 2 expected fail (baseline 34 failed, 5 expected fail). The three tests flipped from `it.fails` explain the expected-fail change. Two names differ, both in `geminiInteractionsImageGenerationV2.test.ts`, and both are 5 s timeouts. One times out at clean HEAD as well. The other passes when run alone here and timed out at clean HEAD. Neither file is touched by this phase |
| R2-01 schema tests on an LF worktree at HEAD | The 16 schema-test failures in this checkout also fail at HEAD with LF endings. 7 of them need a fixture file (`capabilityRuleSchemaPreRuleV2.sql`) missing from the commit they read. With the patch there are no new failures, and P2b-01 passes |

**Electron smoke.** Run after `npm run rebuild:electron` and a development build:
- Each profile was an isolated agent profile (`SV_AGENT_ISOLATED_PROFILE=1`, `SV_AGENT_NETWORK=offline`) under `%TEMP%\sv-p2-smoke`.
- A temporary wrapper recorded native dialogs instead of showing them.
- The startup cloud-rules request was blocked by offline mode, and no other request was made.
- The fixtures were written with the Node ABI, between two Electron rebuilds.

| Scenario | Fixture | Result |
|---|---|---|
| Fresh profile ×3 | none | Renderer mounted |
| R2-01 | Profile database re-stamped with the mixed-ending digest `89007f35…` | Renderer mounted, no dialog. `app_meta_v2` and the manifest were re-stamped to the canonical `d84a3e0d…` |
| R2-02 | Profile database stamped with an unknown digest; `SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH=1`, which agent mode requires | Renderer mounted. The database moved to `epoch-2-recovery-backups/epoch-2-<ms>/starverse.db`, and a new database has the canonical digest. The success notice was shown in zh-CN with the exact backup directory |
| R2-06 | One streaming orphan, plus one completed awaiting-tool operation whose Anthropic artifact is missing its chunk | Renderer mounted. The valid orphan was recovered (`failed`, `stream_interrupted`). The broken operation was left untouched |

The wrapper, the profiles and the temporary fixture test were deleted afterwards. The LF worktree used for the R2-01 comparison was removed.

## 5. Limitations

- **R2-01:**
  - Predecessor upgrades could not be fully re-verified, because the schema predecessor tests already fail at HEAD (section 4).
  - A database at an older predecessor stage, stamped with a raw CRLF or mixed digest that is not in the pinned predecessor lists, is not recognised as that predecessor. Under D-2r it goes to the reset and recovery path.
- **R2-02:**
  - In agent automation, recovery requires the environment authority, so the confirmation dialog was not displayed at runtime. Its text is checked by unit tests in both locales. The success notice was checked at runtime.
  - The locale follows the system language, not the app's language setting, because the config store is not open yet.
- **R2-04:** only the POSIX marker path was tested. The native Win32 marker behaviour for this crash case was not exercised.
- **R2-05:** an exhausted receipt stays `pending` (receipts cannot be deleted) and is retried, harmlessly, on each start. The attempt for P4a-01 is recorded as `provider_failed pre_stream`.
- **R2-06:**
  - The quarantined operation keeps its rows and its `streaming` branch lock, so that branch cannot generate until the data is repaired. This conflicts with R2-05's "no operation remains streaming without a live runner".
  - There is no restricted mode and no conversation error state.
  - Changing either needs an owner decision (section 6).
- **R2-07:**
  - There is no overall shutdown watchdog.
  - Resources created inside `startMainV2` before a failure are not individually closed; only the runtime is.
  - No global `unhandledRejection` listener was added, to keep Electron's default behaviour.
- **No runtime control run.** The smoke was not repeated on the pre-fix build. The pre-fix behaviour is shown by the unit tests and mutation checks.

## 6. Deferred work and open questions

- **Owner question (R2-06):** should a quarantined operation be terminalised (failed, with its lock released and an error state in the conversation), even though its rows stay for inspection? The current code and tests deliberately preserve both the rows and the lock. A restricted mode for integrity failures is also undecided: what it blocks, and how it is shown.
- **P2a-05** (schema recovery cannot resume after a crash between rename and journal write) and **P2a-06** (config repair rename window): optional, not done. Neither is a small change. Both are left for a later phase.
- R2-03 remains withdrawn (D-2r). The migration framework, P2a-03, P3a-16 and P2a-11 were out of scope.
- The baseline failures from Phase 1 remain. CI is still red independently of these repairs.

## 7. Subagents

Two read-only `Explore` agents were used, each requested with `model: sonnet` and `effort: high`; the exact model version could not be confirmed. One mapped the generation terminal and orphan-recovery paths for R2-05 and R2-06. The other mapped the startup, recovery-dialog and shutdown paths for R2-02 and R2-07. Neither made edits. The coordinator checked every location they reported against the source and did all implementation, testing and conclusions. There were never more than two agents at once, and no nesting.

## 8. Native module report

- better-sqlite3 ABI mismatch encountered: no
- Rebuild command run: `npm run rebuild:electron` (smoke), `npm run rebuild:node` (fixture writing), `npm run rebuild:electron` (smoke)
- Current ABI target after task: electron
- Tests retried after rebuild: none needed. The Node/Vitest runs used the Node ABI before the first Electron rebuild
- Electron smoke retried after rebuild: yes. The scenarios ran after the second Electron rebuild
- No native artifacts committed: confirmed

## 9. Next phase

Repair Phase 3 (generation and protocol correctness): R3-01 to R3-08 in [repair-plan.md](repair-plan.md). It depends on R2-05, which is done, and starts by flipping the remaining `it.fails` tests for P3b-01, P4a-03, P4a-04 and P4a-05 as it fixes them. The R2-06 owner question above can be answered alongside it.

## 10. Addendum (2026-10-23): R2-06 owner decision and follow-up

*This section was added after the owner answered the R2-06 question in section 6. The text above is unchanged.*

The owner decided:
1. A corrupt operation is terminalized as `failed` with its own error code, and its branch lock is released.
2. Its rows and corrupt artifacts are kept.
3. The failure is shown in the conversation.
4. Restriction follows the scope of the failure: operation, then branch, then global.
5. A restriction states its reason, scope and remaining actions.

### 10.1 Feasibility check before implementation

Two read-only mapping agents (`Explore`, requested as `model: sonnet`, `effort: high`) traced the schema triggers, repo preconditions, history consumers and UI paths. The coordinator verified the key points against the source:
- **Safe through the existing repos:** an operation that still decodes, is `streaming`, has no `prepared`/`streaming` request and no open attempt, and whose answer is still `streaming` (the awaiting-tool shape).
  - The schema allows `streaming → failed` here. `trg_generation_operation_v2_terminal_requests` fires only for prepared or streaming requests.
  - `terminalizeAssistantMessage` and `terminalizeOperation` do not read artifacts.
  - The runtime's own `#failOperation` already ends operations of this shape.
- **Not safe:** an operation whose bundle cannot be decoded (`findOperationInTransaction` fails). The repos refuse such an operation, and ending it would need raw SQL that bypasses the repo checks. Request-level incoherence and an answer that is no longer `streaming` are also excluded, because the repo steps would throw or leave the operation and its answer inconsistent.
- **Later sends fail closed.** Later sends on the same branch include the failed turn. `loadPortableGenerationHistoryV2` reads its artifacts and throws `NativeArtifactStorageV2Error` on the corrupt one. The corrupt data is never used as history and the check is not bypassed. Retrying the failed answer reads only its snapshot and ledger, not its artifacts.
- **No global restricted mode is possible today.** No restricted, read-only or safe mode exists, and there is no conversation export. Startup runs many write paths (recovery, model catalog and cloud-rule refresh), and the IPC handlers assume a writable database.

### 10.2 What changed

**Operation level** (`electron/services/generationOrphanRecoveryV2.ts`)
- `NativeArtifactStorageV2Error` while loading an awaiting-tool artifact is now classified as `GENERATION_V2_ORPHAN_RECOVERY_ARTIFACT_CORRUPT`.
- After the recovery transaction rolls back, `failOperationWithCorruptArtifact` runs a separate transaction. It re-checks the safe shape, then sets the answer and the operation to `failed` with `GENERATION_V2_RECOVERY_ARTIFACT_CORRUPT`, which releases the branch lock.
- If the shape does not hold, it changes nothing and the operation stays in `unrecoveredOperationIds`.
- Requests, attempts and artifacts are not touched.
- The result has a new `failedOperationIds` field. `mainV2.ts` logs its count by code.

**Branch level**
- `readGenerationRecoveryBranchRestrictionsV2` maps the operations recovery could neither recover nor end to their branches.
- The workspace `read-branch` IPC now returns `integrityRestriction: { scope: 'branch', code: 'GENERATION_V2_RECOVERY_STATE_INVALID' }` for those branches and `null` for all others.
- The renderer shows an alert above the transcript for a restricted branch. It gives the reason, the scope (only this branch; other branches and conversations work normally) and what still works (reading this branch).
- Sending is blocked on that branch only, in both `composerCanSend` and `onSend`. The database lock remains the real enforcement.

**UI failure state**
- The error panel shows a localized message for `GENERATION_V2_RECOVERY_ARTIFACT_CORRUPT` instead of the stored English text.
- The message says the result is corrupt, the records were kept and are not used as a valid answer, and the answer can be retried to replace it.
- The answer's status is `failed` and is never shown as completed.
- New strings are in `errors.generationRecovery.*` for zh-CN and en-US.

**Global level:** not implemented. See 10.4.

### 10.3 Tests and checks

| Test | What it proves |
|---|---|
| `generationOperationRuntimeRegistryV2.test.ts` "P2b-05, R2-06: fails awaiting-tool history…" | The operation is terminalized with the exact error code and message, its answer is failed, and its branch has no active operation. Request, attempt and artifact rows are byte-identical before and after. The branch read shows `failed` with the code. The unaffected orphan is recovered normally. A second recovery run (restart) changes nothing. |
| same file, "R2-06: keeps a corrupt-artifact operation whose answer is no longer streaming…" | Outside the safe shape, nothing is terminalized and the evidence is unchanged. |
| same file, "R2-06: restricts only the branch…" | Recovery → restriction map → `read-branch` IPC. The restriction appears for the locked branch only, and the database lock still holds for that branch only. |
| `portableGenerationHistoryV2.test.ts` "R2-06: fails closed on a failed earlier turn whose stored artifact is corrupt" | A later turn including the failed one throws `NativeArtifactStorageV2Error`. The corrupt data is never used as history. |
| `AppChatApp.regenRetry.test.ts` "R2-06: shows a recovered corrupt-artifact failure…" | The localized message is shown and the stored English text is not. Retry stays enabled. |
| same file, "R2-06: shows the branch restriction and blocks sending only when restricted" (both cases) | All four banner lines appear, with `role="alert"`, and Send is disabled. With no restriction there is no banner and Send is enabled. |

- **Assertion updates:** the existing exact-equality assertions on the recovery result now include `failedOperationIds: []`. No assertion was weakened.
- **Mutation checks:** each new behaviour was disabled in turn, and its test failed: the terminalization call, the error-code text mapping, and the composer send guard. Each file was restored and confirmed.
- **Static checks:** typecheck passes, the partition gate passes, and lint shows 0 errors.
- **Touched files:** all pass, except 7 integration tests in the coordinator and portable-history files that are in the Phase 1 baseline (timeouts).
- **Full partitions:** unit 10 failed (baseline 13), UI 18 (baseline 18), integration 38 (Phase 1 baseline 34). Every failing name is in the Phase 1 baseline failure lists. The differences are the known flaky timeouts.

**Electron smoke** used two isolated offline agent profiles under `%TEMP%`, fixtures written with the Node ABI, and checks through the app's own preload bridge (`window.generationV2.workspace.readBranch`):

| Scenario | Result |
|---|---|
| Corrupt awaiting-tool artifact, plus one interrupted orphan | Renderer mounted. The broken branch reads `failed` / `GENERATION_V2_RECOVERY_ARTIFACT_CORRUPT`, with no restriction. The other branch reads `failed` / `stream_interrupted`. In the database, the request is still `completed`, the artifact row is kept, and there are no active locks. stderr logged the code with `count: 1`. |
| Restart of the same profile | Renderer mounted, same state, no further changes |
| Operation recovery cannot end (streaming, answer already failed), plus one orphan | Renderer mounted. The locked branch reads `integrityRestriction: { scope: 'branch', code: 'GENERATION_V2_RECOVERY_STATE_INVALID' }`. The other branch has none. The database lock remains on `branch:locked` only. |

The smoke profiles, the temporary wrapper and fixture test, and a renderer server left running from the Phase 2 smoke were all removed or stopped.

### 10.4 Remaining limitations and unresolved findings

- **No global restricted mode (blocked).** When overall database integrity can't be established, startup still fails closed with a dialog showing only the error code. Two things are missing:
  - **A read-only runtime:** open the database read-only, skip recovery and the refresh jobs, and register only the read IPC.
  - **Conversation export:** none exists yet.

  Both are new features that touch startup and IPC-wide write gating. Adding them as a workaround would risk writes to a database whose consistency is unknown.
  - **Proposed:** a separate phase. Classify integrity failures in `epoch2MainEntry.ts`, add a read-only startup profile with a minimal IPC set, and add an export of the readable conversations, with its own smoke on a deliberately corrupted profile.
- **Undecodable operation (branch-level, unreadable):** the operation stays locked (restricted to its branch). The branch read itself also fails, so the banner cannot be shown, because `ConversationReadV2Repo` requires every answer's snapshot to decode. Showing it would mean relaxing that read check, which was not done.
- **Gemini and LM Studio:** their history repos fold storage corruption into `*_HISTORY_STATE_INVALID`, which cannot be told apart from other invalid state. Their corrupt awaiting-tool artifacts therefore stay branch-restricted, not operation-terminalized. The same applies to artifacts that load but fail to decode, which reach the generic "no awaiting-tool state" path.
- **Sends after recovery:** later sends on a branch whose history includes a corrupt-artifact turn fail with `NativeArtifactStorageV2Error`, shown as a raw error. Retrying the failed answer (retry reads only its snapshot) is the path forward. That remedy was traced statically, not run end to end.
- **The restricted branch's head answer** may still render with the generating indicator if it is `streaming`. The banner explains the state, but the indicator itself was not changed.
- **I4a-07:** handled for the operation and branch scopes above. The database-wide case remains open with the global mode.

**Native module (this follow-up)**
- better-sqlite3 ABI mismatch encountered: no
- Rebuild command run: `npm run rebuild:node` (tests), `npm run rebuild:electron` (smoke), `npm run rebuild:node` (fixtures), `npm run rebuild:electron` (smoke)
- Current ABI target after task: electron
- Tests retried after rebuild: none needed
- Electron smoke retried after rebuild: yes
- No native artifacts committed: confirmed

This phase is complete. I have stopped and am waiting for your instruction to continue.
