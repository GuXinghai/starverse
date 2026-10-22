# Repair Phase 1: verification foundations

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

This phase does R1-01 to R1-04 from [repair-plan.md](repair-plan.md), after the owner-answer update to the repair documents. It repairs test discovery and CI scope, adds failing regression tests for the reproducible findings, and wires the gates that pass today. It does not fix any application defect.

- Test, CI and gate configuration changed; application source did not.
- The new regression tests are written as `it.fails` with the finding ID in the name. Each one was checked to fail for the stated reason. The phase that fixes a defect changes its test to `it`.
- No provider or network requests were made. Tests used temporary directories and isolated fixtures, not the application profile.

## 1. Scope and repository state

| Item | Value |
|---|---|
| Branch | `codex/static-review-repairs`, cut from `3e0f26c` (the Phase 0 tip of `codex/basic-operation-exploration-8q02ix`) |
| Untouched working-tree content | `world_map_experiment/__pycache__/` (untracked, preserved, not committed) |
| Subagents | None in this phase; see section 7 |

## 2. Repair documents: owner answers

The owner answered OQ-1 to OQ-3 and turned OQ-4 into an investigation item. The changes are recorded in:
- [repair-plan.md](repair-plan.md):
  - D-2 is struck through and replaced by **D-2r** (no development/release distinction this round; legacy data and incompatible databases may be reset by default; only on the designated legacy-data and schema-recovery paths).
  - **D-5a** adds conversation-scoped deletion of request records and archive indexes, keeping shared resources still referenced elsewhere.
  - D-7 (keep and harden the in-app browser) and D-8 (OQ-4 investigation, preserve current behaviour) are added.
  - R2-03 is withdrawn under D-2r. R2-01, R2-02, R4-01, R6-04, R6-10 and R7-04 are updated.
  - Section 6 records the answers. OQ-1 to OQ-3 are no longer open.
- [repair-phase-0.md](repair-phase-0.md): an appended addendum with the answers and the count correction.
- [phase-9.md](phase-9.md): appended section 7.6.
- Superseded requirements are struck through or marked, never deleted, so the historical evidence remains.

**Seven or six predecessor upgrades:** six exported upgrade entry points are called in order at `electron/data-epoch/freshEpochDatabaseInitializer.ts:336-347`. One of them runs a seventh, internal pre-capacity routine. The number of accepted predecessor digests is larger again, because one routine can accept more than one digest. "Six" counts the call chain; "seven" counts routines. Both are now stated with that definition.

## 3. Changes by item

### R1-01: test collection and partition ownership (P8-04, P8-05)

**Verified before the change** with `vitest list --filesOnly` for each config against `git ls-files`:
- Five discovered test files were collected by no config: `electron/data-epoch/epochNativeBoundary.test.ts` and four `*.slow.test.ts` files.
- The slow files are excluded by design (they run only through the slow gate, one explicit path at a time).
- `epochNativeBoundary.test.ts` was a real orphan (**P8-04 confirmed**). Its override assigns it to unit, but `vitest.unit.config.ts` excluded `electron/**/*.test.*`, and Vitest applies `exclude` after `include`.
- Ownership rules disagreed with collection (**P8-05 confirmed**):
  - `scripts/agent/*.test.mjs` were owned by unit in `ownerForTestPath` and `check-test-partitions.mjs` but collected by integration.
  - `src/ui-app/rendererImportBoundary.test.ts` had no override, although it is collected by unit.
  - `vitest.integration.config.ts` also included `tools/**`, which unit owns: a latent duplicate.

**Changed:**
- `vitest.unit.config.ts`: removed the excludes for `tests/e2e/**`, `tests/integration/**`, `electron/**`, `infra/**` and `scripts/**` test files. Those paths are outside the unit include anyway, so the excludes only dropped unit overrides.
- `vitest.integration.config.ts`: removed the `tools/**` include. Integration-owned `tools/` tests use overrides.
- `vitest.shared.ts`: `ownerForTestPath` is exported and routes `scripts/` to integration.
- `scripts/check-test-partitions.mjs`: the same `scripts/` rule.
- `tests/test-partition-overrides.json`: `src/ui-app/rendererImportBoundary.test.ts` → unit.
- `config/vitestPartitionConfig.test.ts`: a new test resolves every config's `include` and `exclude` globs over the tracked and untracked (non-ignored) files and checks that each non-slow test file is collected by exactly its owner config. It fails on an orphan, a duplicate or a mismatch.

**After:** `epochNativeBoundary.test.ts` is listed once (unit). The only uncollected files are the four slow tests. File counts: unit 363, ui 91, integration 211, including this phase's new test files.

### R1-02: CI scope (P8-03)

- `scripts/resolve-test-ci-scope.mjs`:
  - `.nvmrc` and `.github/workflows/ci.yml` are global infrastructure, so changing them runs every partition.
  - Non-test sources under `src/core/`, `src/shared/`, `config/`, `tests/helpers/`, `tests/fixtures/` and `tests/utils/` select both the ui and integration partitions.
  - `scripts/` changes select integration (they were limited to `scripts/dfc/`).
  - A `fullRun` option selects everything. The CLI sets it from `SV_TEST_SCOPE_FULL=true`.
- `.github/workflows/ci.yml`: the scope step sets `SV_TEST_SCOPE_FULL` to true for pushes, which `on:` limits to `main`.
- `config/testCiScope.test.ts`: new tests for shared-core paths, a unit-only `src/core` test, `scripts/` routing and the full run.

### R1-03: regression tests (P8-06)

| Finding | Test | Observed failure (checked with a temporary `it` copy) |
|---|---|---|
| P4a-05 | `src/next/generation-v2/providers/sseChunkBoundary.regression.test.ts`: OpenRouter, Gemini, generic-local and OpenAI Responses decoders, with a chunk boundary between CR and LF | Each decoder's output differs from the unsplit stream. An unsplit control test passes for each |
| P4a-04 | `src/next/generation-v2/providers/generic-local-openai-chat/chatStreamV1.regression.test.ts` | The assembler rejects the usage-only chunk after `finish_reason`. A control with usage before the finish reason passes |
| P3b-01 | `infra/db/repo/portableGenerationHistoryV2.test.ts`: OpenRouter turn then Anthropic, compiled for Anthropic | `GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_SHAPE` |
| P4a-03 | Same file: cancelled Anthropic turn replayed through `GenerationInterruptedReplayV2Repo` | `GENERATION_V2_ANTHROPIC_MESSAGES_REQUEST_INVALID_SHAPE` |
| P2b-01 | `infra/db/v2/schemaDigestLineEndings.regression.test.ts`: the schema fragments copied with LF and with CRLF | The digests differ. A same-bytes control passes |
| P4a-01 | `electron/services/generationOperationRuntimeRegistryV2.test.ts`: the runner throws `GenerationNativeCompletionMaterializationPendingV2Error` with `receiptPersisted: false` | The operation is not terminalized. In this fixture it stays `committed`, its pre-run state, rather than `streaming` |
| P2a-01 | `electron/data-epoch/epoch2CommittedBootstrap.test.ts`: reset through `config_replaced`, create the empty epoch root, then bootstrap (POSIX authority, so it runs on every platform) | `EPOCH2_RESET_LIVE_WORKSPACE_PROTECTED` |

Every finding listed for R1-03 has a test. No assertion was weakened to make a test fail or pass.

### R1-04: gates (P8-11, in part)

Each candidate gate was run locally:

| Gate | Result | Action |
|---|---|---|
| `gate:generation-v2-zero-residual` | Pass | Added to `verify:ssot` |
| `gate:generation-v2-capability-rule-authority` | Pass (534 production files) | Added to `verify:ssot` |
| `gate:docs` | Pass (8 entry documents) | Added to `verify:ssot` |
| `gate:tc13` | Pass (714 files) | Added to `verify:ssot` |
| `network-egress-gate.mjs --self-test` | Pass on win32 | Added to `verify:ssot` |
| `privacy-scan.mjs --self-test` | Pass on win32 | Added to `verify:ssot` |
| `gate:vite-renderer-resolution` | Pass; its probe files were removed afterwards | Added to the CI `verify-ssot` job as its own step, before the renderer build. It starts a local Vite server, so it is kept out of `verify:ssot` |
| `gate:model-identity-purge` | **Fails**: `src/core/generation-v2/capability-rules/anthropicThinkingRulesV2.ts uses nativeModelId outside the discovery/observation allowlist` | **Not wired.** Tracked as deferred: whether this is a defect or a stale allowlist is a Phase 3 (model identity) question |

All new gates sit before `tc15-git-clean`, which stays last.

## 4. Checks run

Native module ABI: `npm run rebuild:node` was run before the DB-heavy Vitest runs.

**Targeted checks** (all pass, apart from the intended expected failures):
- `config/vitestPartitionConfig.test.ts` and `config/testCiScope.test.ts`, including the new ownership and scope tests.
- `node scripts/check-test-partitions.mjs`.
- Each new or extended regression test file. The `it.fails` tests count as "expected fail". Each was also run once as a temporary plain `it` copy to record the failure reason in section 3; the copies were deleted.

**Full partitions** (`npm run test:unit`, `test:ui`, `test:integration`, run in sequence on this Windows checkout):

| Partition | Files | Tests |
|---|---|---|
| unit | 10 failed, 353 passed (363) | 13 failed, 3179 passed, 5 expected fail |
| ui | 6 failed, 85 passed (91) | 18 failed, 738 passed, 2 skipped |
| integration | 11 failed, 200 passed (211) | 34 failed, 1700 passed, 5 expected fail, 3 skipped |

None of the partitions was green before this phase either. To attribute the failures:
- **Isolated re-run:** the failing files were re-run alone. Unit fell from 13 to 10 failing tests, so 3 were load timeouts. ui stayed at 18. Integration went from 34 to 36, so its timeouts vary between runs.
- **Baseline:** the same files were run on `3e0f26c` (before Phase 1) in a temporary worktree that shared this checkout's `node_modules`. The worktree was removed afterwards.
- **ui:** the same 18 tests fail at the baseline.
- **integration:** every failing test also fails at the baseline. The baseline fails 52, because that worktree lacked this checkout's built native epoch addon.
- **unit:** 8 of 10 fail at the baseline. The other 2 are in `electron/data-epoch/epochNativeBoundary.test.ts`, which ran nowhere before R1-01 (P8-04), so they could not fail before. Both are stale guardrails, surfaced rather than caused by this phase:
  - "limits epoch-root creation to the dormant database-phase coordinator": the check matches the module name as text, so `electron/ipc/generationV2CapabilityIpc.ts`, which has only `import type { Epoch2CommittedRuntime }`, counts as a third consumer.
  - "keeps session reset narrow and credential records free of legacy compatibility": the credential record module now declares `credentialScopeId` and a `plaintext` backend, both of which the guard's pattern forbids.
  - Under AGENTS.md ("Do not refactor tests unless explicitly requested") neither test was changed. Whether to update them is an owner decision.
- **Pre-existing failure causes**, not diagnosed in this phase:
  - 5000 ms timeouts, including the known `portableGenerationHistoryV2.test.ts` case;
  - integration assertions expecting `git hash-object`-style `<sha> blob <n>` output;
  - schema digest and identity errors in `schemaComposerV2.test.ts`, `freshEpochDatabaseInitializer.test.ts` and `requestRulesMigrationV2.test.ts`. The SQL files are CRLF in this checkout (`i/lf w/crlf`), which is consistent with P2b-01;
  - stale model-fact, Gemini-rule, request-body and UI expectations.

**Gates:**
- The R1-04 table in section 3.
- The existing `verify:ssot` gates:
  - passing: `gate:generation-v2-goal3-authority`, `tc18`, `tc12 --skip-tests`, `tc16` and `gate:network-egress`.
  - **`tc17-ui-guardrails` fails** (`src/ui-app/components/NetworkProxySettingsPanel.vue: 2 JSON.parse call(s), file is not in the reviewed allowlist`; the file was last changed in baseline commit `aec217cd`).
  - **`gate:privacy` fails** with 25 violations. 12 are in baseline application files (`docs/implementation/request-rules-v2-migration.md`, `docs/maintenance/basic-operation-exploration-2026-10-17.md`, `docs/maintenance/electron-agent-infrastructure.md`, `scripts/smoke/network-proxy-smoke.mjs`). 13 are local `D:\Starverse` path mentions in the static-review documents (`CLOUD_HANDOFF.md`, `phase-7.md`, `phase-8.md`, `phase-9.md`, `repair-phase-0.md`).
- `npm run verify:ssot` as a whole was not run to completion. It stops at `npm run test`, which already fails at the baseline, and `tc15-git-clean` needs a clean tree. Its other steps were run one by one, as listed above.

## 5. Limitations

- **`src/next/` transitive scope:** a change to a non-test `src/next/` source still selects partitions through override routing only. A shared module whose importers live in another partition may not select it on a PR. Pushes to `main` run everything, which bounds the gap.
- **Slow tests** are still not run in CI. They need one explicit path per run.
- **Self-tests** of the egress and privacy gates were run on Windows only. CI runs them on Ubuntu for the first time.
- **P4a-01** is reproduced in the `committed` state, not `streaming`. The defect (no terminalization) is the same; the visible state differs.
- **CI stays red, as before this phase.** The unit, ui and integration partitions and `verify:ssot` all failed at the baseline. Because `verify:ssot` is an `&&` chain, the gates added to it run in CI only once `npm run test`, `tc17` and `gate:privacy` pass. The Vite resolution step runs only if the `verify:ssot` step passes. Until then, the gates are verified locally only.
- **The unit partition gains 2 failures** from `epochNativeBoundary.test.ts`, which now runs. They are stale guardrails (section 4), and the partition was already failing.
- **No Electron or packaged checks** were run. This phase changed no runtime code.
- The regression tests show that the mechanisms fail. They do not show how often each failure happens for users.

## 6. Deferred work and open questions

- **`gate:model-identity-purge`:** fails today (section 3, R1-04). To be decided with Phase 3.
- **Failing gates and tests, tracked:**
  - `tc17-ui-guardrails` and `gate:privacy` (section 4);
  - the two stale `epochNativeBoundary.test.ts` guardrails, which need an owner decision on updating them;
  - the pre-existing partition failures in section 4. A "make CI green" item does not exist in the plan yet; it would be needed before any gate here can protect a PR.
- **Gates still outside CI:** `gate:tc14` (live smoke, needs provider credentials; CI runs it only when live smoke is enabled) and the slow tests.
- **OQ-4** (first-install cloud-rule activation) stays an investigation item under R4-01.
- Every item of Phases 2–8 in [repair-plan.md](repair-plan.md) is unchanged.

## 7. Subagents

None were used. The phase needed precise edits to shared test configuration and a coordinator check of each failure reason, so all mapping and verification was done directly. The preferred configuration for later phases is unchanged: Sonnet-family agents with high effort, at most two at once, no nesting.

## 8. Native module report

- better-sqlite3 ABI mismatch encountered: no
- Rebuild command run: `npm run rebuild:node`
- Current ABI target after task: node
- Tests retried after rebuild: none needed
- Electron smoke retried after rebuild: no (no Electron smoke in this phase)
- No native artifacts committed: confirmed

## 9. Next phase

Repair Phase 2 (data integrity, startup and failure isolation): R2-01, R2-02, R2-04 to R2-07 in [repair-plan.md](repair-plan.md). It starts by turning the R1-03 tests for P2b-01, P2a-01 and P4a-01 into ordinary tests as it fixes them.

This phase is complete. I have stopped and am waiting for your instruction to continue.
