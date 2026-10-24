# Starverse repair plan (post-review)

**Status**: active
**Document Role**: plan
**Last updated**: 2026-10-22 (owner answers to OQ-1–OQ-4; repair Phase 1)

This plan replaces the repair order in [phase-9.md](phase-9.md) section 5, which stays as a historical record. Finding IDs and evidence classes come from phase-9.md as corrected by [repair-phase-0.md](repair-phase-0.md).

Each phase runs only when the owner says "continue", and stops with a report. A phase may be split into subphases (for example 2a and 2b) when its diff grows large.

## 1. Owner decisions (binding for this repair round)

| ID | Decision | What it allows | What it does not allow |
|---|---|---|---|
| D-1 | Development data may be deleted and recreated | Resetting the application's designated development data during development. No mandatory backup or migration system is needed as a prerequisite | Touching unrelated directories or arbitrary user files |
| D-2 | ~~Development builds may reset incompatible databases; formal releases must not silently delete or recreate user data~~ **Superseded for this round by D-2r below (OQ-2 answer).** | — | — |
| D-2r | (OQ-2 answer) No development/release distinction in this round. Old application data or an incompatible database may be deleted and recreated by default, through the designated legacy-data and schema-recovery paths | Default reset on the legacy-data and schema-recovery paths; keeping the existing reviewed predecessor upgrades | A general migration framework or a release-protection gate now; deleting unrelated files; turning ordinary runtime failures into automatic database resets (D-4 still applies). Formal-release data protection is future release-preparation work |
| D-3 | No generation timeouts this round | Repairing cancellation, cleanup, terminal states and recovery on their own | Adding generation connect, first-byte, idle or overall timeouts. Download and probe bounds are **not** waived |
| D-4 | ~~Keep failures local [...] An explicit restricted mode when integrity cannot be established~~ **Superseded for this round by D-4r below.** | — | — |
| D-4r | Keep failures local and fail closed. Isolate one broken generation, receipt, conversation, plugin or integration. When database integrity cannot be established, stop startup and keep the database (see the fail-closed integrity policy below) | Operation-level terminalization, branch-level restriction, and a localized fatal startup dialog with a stable code and the database location | Hiding errors; marking incomplete work as successful; a global restricted mode, read-only runtime, permission system or corruption-aware export; automatic repair, recreation, migration or destructive cleanup of a damaged database |
| D-5 | Original request bodies are a long-term product record while their conversation exists | Fixing storage cost, indexing, duplication, access boundaries and explicit user deletion | Disabling capture by default, expiring or truncating originals, deleting by age, or redacting user-authored content and calling it the original. Application-injected credentials must stay out |
| D-5a | (OQ-1 answer) Deleting a conversation also deletes its original request records and related archive indexes | Conversation-scoped archive deletion | Deleting shared resources still referenced elsewhere; age-based expiry; truncation; default-off capture |
| D-7 | (OQ-3 answer) Keep the in-app browser for future use | Repairing and hardening it | Removing it as dead or unnecessary |
| D-8 | (OQ-4 answer) Investigate first-install automatic rule activation; preserve current behaviour | Tracing trigger, validation, timing and relationship to capability refresh | Changing the activation policy before evidence is reported and a change is justified |
| D-6 | Refresh when a rule set becomes effective | Proactively recomputing capabilities, UI projections and pending-send configuration. Keeping the send-time revision check, and re-preparing a stale pending request | Activating staged candidates early; silently resetting or clamping user values; resending a request that already reached the provider; changing in-flight frozen snapshots; blanket rejection of documented test and internal-replay paths |

**Deferred by owner:**
- Generation timeouts (I4a-01; D-3).
- A general schema migration framework (I2a-02; D-2r).
- Formal-release data protection: a development/release channel, a guard against destructive or auto-approved recovery in releases, and the legacy-purge guard (formerly R2-03; D-2r). This is future release-preparation work.
- Any age-based or other automatic archive purge beyond conversation deletion (D-5, D-5a).

### Fail-closed integrity policy (D-4r, owner decision 2026-10-23)

The response depends on how far the damage reaches. Data is always kept as it is.

| Scope | Response | Implemented by |
|---|---|---|
| One operation | Terminalize the operation as `failed` with a specific error code, and release its branch lock when the repository invariants allow it. Its rows and artifacts are kept | R2-06 (`GENERATION_V2_RECOVERY_ARTIFACT_CORRUPT`) |
| One branch | Keep only that branch restricted. Other branches and conversations work normally | R2-06 (branch restriction banner) |
| The whole database | Stop startup. Show a clear, localized error dialog. Keep the original database: no automatic repair, recreation, migration or destructive cleanup | R2-06 fail-closed startup (repair-phase-2.md section 11) |

For database-wide failures:
- The dialog says that startup was stopped to protect existing data.
- It shows a stable error code and the database file location, for manual backup and troubleshooting.
- Logs carry only the code. They never include API keys, conversation content, raw error text or paths.
- Corruption is reported separately from:
  - storage I/O errors (`EPOCH2_DATABASE_IO_FAILED`);
  - permission and read-only failures (`EPOCH2_DATABASE_ACCESS_DENIED`, `EPOCH2_DATABASE_OPEN_CANTOPEN`, `EPOCH2_WIN32_DATABASE_FILE_OPEN_FAILED`);
  - a temporarily locked database (`EPOCH2_DATABASE_BUSY`).
- A damaged file is `EPOCH2_DATABASE_CORRUPT`. A failed schema or integrity verification keeps its existing codes (`EPOCH2_DATABASE_TRANSACTION_FAILED`, `EPOCH2_DATABASE_STATE_INVALID`, `EPOCH2_DATABASE_POSTCOMMIT_INVALID`), and the dialog treats all of these as "integrity not confirmed".
- No recovery, refresh or other database-writing task runs after the failure:
  - The database is verified during bootstrap, before `startMainV2` starts orphan recovery or the refresh jobs.
  - A later fatal failure inside `startMainV2` closes the runtime and its database connection (`startWithEpoch2RuntimeCleanup`), so jobs that were already started cannot write.

**Out of scope:** a global restricted mode, a read-only runtime, a permission system and a corruption-aware conversation export.

**Limitations:**
- Corruption that `PRAGMA integrity_check` and the schema verification do not detect is found only when the damaged rows are read. It is then handled at operation or branch scope, or surfaces as an ordinary error.
- The schema-mismatch recovery path (D-2r) is unchanged. It still backs up and resets an incompatible database after confirmation.
- Under agent automation, startup exits with the code on stderr and shows no dialog, as before.

## 2. Working rules for every phase

1. **Branch:** implementation goes on `codex/static-review-repairs`, cut from the review branch tip after Phase 0. Review documents continue to be updated there. No merge, force-push or release.
2. **Re-verify first:** re-read the cited code before each repair. If the mechanism no longer holds, or the behaviour is intended, record that outcome instead of changing code.
3. **Regression first:** add a failing test that names the finding ID before the fix. Where a test cannot express the defect, state the manual or runtime check instead.
4. **ABI policy:** follow AGENTS.md. Use `npm run rebuild:node` before database-heavy Vitest, and `npm run rebuild:electron` before an Electron smoke. Report the final ABI target. Never commit native artifacts or `public/build-id.json`.
5. **Isolation:** run tests and smokes against isolated profiles and fixtures (`SV_AGENT_ISOLATED_PROFILE`, temporary roots). Never touch the owner's normal application data. Make no provider requests: streaming checks use recorded or synthetic local fixtures, labelled as such.
6. **Synthetic is not runtime:** a unit test does not replace a real Electron or packaged check where the plan requires one. If a real check cannot run, the report says so.
7. **Subagents:** read-only `Explore` agents with `model: sonnet` and `effort: high`, at most two at once, no nesting, scoped to the current phase. The coordinator owns diagnosis, repair choice and completion.
8. **Close-out:** update the phase report (`repair-phase-N.md`), this plan's status column and [CLOUD_HANDOFF.md](CLOUD_HANDOFF.md) before reporting.

## 3. Phases

Each item gives: findings, intended behaviour, evidence class (A/B/S/L/M, from repair-phase-0.md C-05) with any required reproduction, minimal scope, checks, and acceptance. "Stop if" lines are stopping boundaries: when one is hit, the item is reported rather than widened.

### Phase 1: verification foundations

**Dependencies:** none. Every later phase needs this.

| Item | Findings | Intended behaviour | Evidence / reproduction | Minimal scope | Checks | Acceptance |
|---|---|---|---|---|---|---|
| R1-01 | P8-04, P8-05 | Every test file belongs to exactly one partition that actually runs it | B / M. Run `npx vitest list --config <each>` to confirm `epochNativeBoundary.test.ts` runs nowhere | Fix `tests/test-partition-overrides.json`; add a test that resolves each config's globs and compares them with partition ownership | `vitest list` before and after; the new ownership test | `epochNativeBoundary.test.ts` is listed by exactly one config; the ownership test fails on an orphan file |
| R1-02 | P8-03 | Pushes to `main` run every partition; PR scope includes shared-core paths that feed DB and Windows tests | A. Static config | `.github/workflows/ci.yml` and `scripts/resolve-test-ci-scope.mjs` only | Unit test of the scope resolver with shared-core paths | Shared-core paths select the DB and Windows partitions; `main` push selects all |
| R1-03 | P8-06 (for P2b-01, P3b-01, P4a-03, P4a-04, P4a-05, P4a-01, P2a-01) | Each deterministic Phase 2 and 3 defect has a test that currently fails | Per finding | Tests only, written as `it.fails` with the finding ID in the name, so CI stays green until the fix flips them to `it` | Run each new test and record that it fails for the stated reason | Every listed finding has a failing test, or a written reason why one cannot be written |
| R1-04 | P8-11 (subset) | Gates already used locally run in CI | A | Add only gates that pass today; list the rest | `npm run verify:ssot` locally | No new red CI; skipped gates listed with reasons |

**Not in Phase 1:** a full CI overhaul (P8-07 release build in CI, P8-17, P8-18). Those go to Phase 8 or stay listed.
**Stop if:** a partition change makes a previously passing suite fail for reasons unrelated to the move. Report it and do not fix tests to match.

### Phase 2: data integrity, startup and failure isolation

**Dependencies:** Phase 1 (R1-03 tests).

| Item | Findings | Intended behaviour | Evidence / reproduction | Minimal scope | Checks | Acceptance |
|---|---|---|---|---|---|---|
| R2-01 | P2b-01 (+P8-01) | One schema produces one digest whatever the checkout's line endings. Databases stamped by the current schema from LF, CRLF or mixed checkouts are all recognised. The reviewed predecessor upgrades keep working | B. The R1-03 test hashes LF, CRLF and mixed copies of the fragments | Add `.gitattributes` (`*.sql text eol=lf`); normalise CRLF before hashing; accept the current schema's raw CRLF and mixed digests as aliases and re-stamp them inside the existing transaction | R1-03 test flips; the existing `schemaComposerV2.test.ts` upgrade tests; an Electron smoke on an isolated profile created from a CRLF checkout | No false `EPOCH2_DATABASE_SCHEMA_MISMATCH` for an identical schema; predecessor fixtures still upgrade. D-2r allows resetting genuinely incompatible databases, not identical ones |
| R2-02 | P2a-02 (lower priority under D-2r) | The recovery dialog states exactly what moves to the backup (including OpenAI-compatible providers and their credentials) and where the backup is; success is shown in the UI, not only on stderr | A | `schemaMismatchRecoveryPrompt.ts`, `epoch2MainEntry.ts`; localise the strings | Unit test of the dialog options; Electron smoke of the dialog on an isolated profile | Text matches `schemaMismatchRecovery.ts` behaviour; backup path shown |
| ~~R2-03~~ | I2a-01, C-04 auto-approve env var | **Withdrawn by D-2r (OQ-2).** No development/release separation or release guard this round. The legacy purge and the schema-recovery path stay as they are, and `SV_EPOCH2_RECOVER_ON_SCHEMA_MISMATCH` is accepted behaviour. Recorded as future release-preparation work | — | — | — | — |
| R2-04 | P2a-01 | A crash between epoch-root creation and the journal write is resumable | B. Reproduce with a test that creates the root and stops before the journal write | `epochRootCoordinatorCore.ts` / `epoch2CommittedBootstrap.ts`: treat an empty root left at `config_replaced` as resumable | The R1-03 test flips; existing epoch tests (Windows partition) | Later starts proceed. A non-empty unexpected root still fails closed |
| R2-05 | P4a-01, P2b-02 (+P4a-02), P2b-06 | Every operation reaches a terminal state: a failed receipt insert ends the operation as failed with Stop working; a receipt that can never materialise ends after the retry budget; the branch lock is released | A / B | `generationNativeCompletionV2.ts`, `generationOperationRuntimeRegistryV2.ts:234`, `generationOrphanRecoveryV2.ts:165-166` | R1-03 test for P4a-01; a test for a non-materialisable pending receipt | No operation remains `streaming` without a live runner. The error is recorded, not reported as success (D-4) |
| R2-06 | P2b-05, I4a-07 | One corrupt artifact quarantines its own operation and leaves the rest of startup working; ~~if database integrity cannot be established, the app enters an explicit restricted mode~~ if database integrity cannot be established, startup stops with a localized dialog and the database is kept (D-4r) | S. Reproduce first with a corrupt-artifact fixture | Orphan recovery: per-operation try/quarantine; ~~startup restricted mode only for integrity failures~~ fail-closed startup classification and dialog | Fixture test; an Electron smoke with a corrupted isolated profile | The app starts, the affected conversation shows an error state, and the rest is usable |
| R2-07 | P4a-18, P1-06, P1-04 (RC-17) | Unhandled main-process failures are logged and surfaced; a startup failure closes the runtime; a failing `closeResources` step does not skip the DB close | S / A / B | Minimal handlers only | Unit tests where possible | Failure is visible and does not leave the DB open |

**Optional if small:** P2a-05 (recovery resume after a crash), P2a-06 (config rename window).
**Not in Phase 2:** migration framework and release guard (deferred, D-2r); legacy-path findings P2a-03, P3a-16, P2a-11 (accepted under D-2r: legacy data may be reset; no repair this round).
**Real-runtime checks:** `npm run rebuild:electron` followed by an Electron smoke on isolated profiles for R2-01, R2-02 and R2-06.

**R2-06 follow-ups (tracked separately; not part of Phase 3):**

| Item | Gap | Notes |
|---|---|---|
| R2-06a | Retrying a recovered corrupt-artifact answer was traced statically, not run end to end | Retry reads only the answer's snapshot and ledger. Needs a runtime or integration check |
| R2-06b | Later sends on a branch whose history includes a corrupt-artifact turn fail with a raw `NativeArtifactStorageV2Error` | Fails closed correctly; the message is not localized or mapped to a stable code |
| R2-06c | A restricted branch's head answer can still show the generating indicator while it is `streaming` | The banner explains the state; the indicator is misleading |
| R2-06d | An operation whose bundle cannot be decoded keeps its branch locked, and the branch read fails, so the banner cannot be shown | Showing it would mean relaxing the `ConversationReadV2Repo` decode check; not done |
| R2-06e | Gemini and LM Studio fold storage corruption into `*_HISTORY_STATE_INVALID` | Their corrupt awaiting-tool artifacts stay branch-restricted instead of being terminalized |
**Stop if:** R2-01 cannot accept the existing digests without changing a pinned predecessor constant. Report it rather than editing the pinned values.

### Phase 3: generation and protocol correctness

**Dependencies:** Phase 1 tests; R2-05 (terminal states).
**Owner constraint:** no generation timeouts (D-3).

| Item | Findings | Intended behaviour | Evidence / reproduction | Minimal scope | Checks | Acceptance |
|---|---|---|---|---|---|---|
| R3-01 | P3b-01, P4a-03, P4a-07 (RC-03) | Anthropic receives block-array assistant content from portable and interrupted-replay history; `pause_turn` is not stored as a completed turn | A / A / Low-Medium A | `portableGenerationHistoryV2.ts:126-137`, `generationInterruptedReplayV2Repo.ts:126`; Anthropic stop-reason handling | R1-03 tests flip; a compile test with mixed-provider history | A switched or recovered conversation compiles for Anthropic |
| R3-02 | P4a-05, P4a-09, P4a-16 (part) | One shared SSE line splitter that carries CR/LF across chunks and ignores comment lines | B. Synthetic chunk-boundary fixtures | A shared splitter used by every decoder; no other decoder changes | R1-03 test flips; existing decoder tests | Identical output for any chunking of the same bytes |
| R3-03 | P4a-04 | Generic local streams accept the trailing usage chunk after `finish_reason` | B. Synthetic fixture matching `include_usage: true` | `generic-local-openai-chat/chatStreamV1.ts:48` | R1-03 test flips | The stream completes with usage recorded |
| R3-04 | P4a-06 | Accept `citations_delta` only if the wire format is established | S. Establish the shape from Anthropic's published streaming docs; no live request | `providers/anthropic/chatStreamV1.ts:241` | Fixture built from the documented shape | **Stop if** the shape cannot be established: record it as unverified and make no change |
| R3-05 | P4a-15, P4a-08, P4a-12 | Truncated or blocked finishes are not recorded as success; the receipt follows the final checkpoint; `finally` cleanup survives a throwing snapshot | A | Per-runner finish mapping and ordering | Unit tests per provider | Incomplete work is never marked complete (D-4) |
| R3-06 | P4a-17 | Abort reaches every runner's `reader.read()` | A | Wrap reads in `abortable()` for the remaining runners | Abort tests with a stalled synthetic stream | Stop ends a stalled stream without a timeout |
| R3-07 | P4b-01 | Regenerate and retry ignore a second click while the first is in flight | B | Renderer in-flight guard keyed by target | Component or logic test with a double invocation | One branch and one generation per click burst |
| R3-08 | P4b-03, P4b-04, P4a-19, P4b-12 | The renderer reconciles "generating" with the database; Stop on a non-abortable operation gives feedback; `awaiting_tool` with tools disabled is terminalised (cancelled) and does not block deletion or quit | B (P4b-03 path 1 untraced; P4b-04 reachability suspected) | Reconcile on refresh; surface the abort result; terminalise `awaiting_tool` on abort | Logic tests for paths 2 and 3 of P4b-03; a registry test for `awaiting_tool` abort | Stop never silently fails. **Stop if** P4b-04 needs a tool-continuation UI; that is a feature, not this repair |

**Not in Phase 3:** P4a-10, P4a-11, P3b-09, P3b-10, P3b-11 (provider-tolerance questions that need real providers; recorded as unverified).
**Real-runtime checks:** an Electron smoke with a local synthetic SSE server (no provider credentials) covering stream completion, abort and Anthropic history compile.

### Phase 4: effective-rule refresh and configuration consistency (D-6)

**Dependencies:** Phase 3 (R3-07 and R3-08 touch the same send paths).

| Item | Findings | Intended behaviour | Evidence / reproduction | Minimal scope | Checks | Acceptance |
|---|---|---|---|---|---|---|
| R4-01 | New (D-6, D-8) | Map current behaviour before changing it. Includes OQ-4: first-install automatic activation (`applyBootstrapCandidate`, `cloudRulesApplicationV1Service.ts:178-191`, reached through `modelFactsSemanticInvalidationV1.ts:22` from `mainV2.ts:205`): its trigger, validation, timing, and whether it bumps the capability revision and reaches renderers | Mapping by one read-only subagent: how activation (cloud apply, rollback, user save, bootstrap) changes `capabilityRevision`; what the renderer recomputes; how `STALE_CAPABILITY_REVISION` is handled at send | Report only; activation policy unchanged (D-8) | — | A written map with file:line; gaps listed; an OQ-4 evidence section proposing, not making, any justified change |
| R4-02 | New (D-6) | When a rule set becomes effective, main notifies renderers; capability projections, model-picker facts, composer chips and pending-send configuration are recomputed | Depends on R4-01 | One activation event from main; renderer subscribers re-derive | Logic tests: activation leads to recomputed projection | UI reflects the new rules without a reload |
| R4-03 | New (D-6), P3b-02 clamp, P6a-11, P6b-10 | A user value the new rules allow is preserved. A value they forbid is flagged with an explanation and blocks sending until adjusted, never silently reset or clamped | A | Validation result surfaced in the composer and console | Tests for preserved, conflicting and newly unsupported values | No silent value change |
| R4-04 | New (D-6) | A stale pending request (not yet sent) is refreshed and revalidated before dispatch; a request that already reached the provider is never resent; in-flight generations keep their frozen snapshot | B | Renderer send path: on `STALE_CAPABILITY_REVISION`, re-prepare and revalidate once, then send or surface the conflict | Tests: stale-before-send re-prepares; in-flight is untouched | No automatic resend after dispatch |
| R4-05 | P3a-09, P3a-06 | Staged or unaccepted data never becomes effective before activation; a truncated models.dev payload is not published as complete | A / S | Publish facts after `commitSync`, only for applied snapshots; add a shrink guard | Unit tests | Candidate staging changes nothing active |
| R4-06 | P3a-22, P3a-08 | Activation keeps a user's "off" override; cross-owner rule cycles and conflicts are detected before activation | A / S | Activation preparation | Unit tests | Activation either preserves the choice or reports the conflict |
| R4-07 | I3a-05, I3b-05 | Every user-facing command IPC entry installs the revision context; tests and internal replay keep the documented exemption | Intended exemption | An inventory test over the IPC registration | The inventory test | Production entries without the context fail the test |
| R4-08 | P1-01 (+P3a-03), P3a-02, P3a-14, P3a-05, P6a-07 | Catalog policy persists; unchanged content does not bump revisions (which cause needless stale sends); a stale `syncing` row recovers; picker queries do not discard each other | A / A / S / S / B | Catalog repo and picker sequencing | Unit tests | No phantom changes or stuck sync |
| R4-09 | P6a-02, P6a-03, P6a-05, P3a-07 | Settings saves cannot overwrite unloaded values; partial saves are reported; panel races are guarded; one undecodable rule row does not block every save (D-4) | A | Settings panels and rule repos | Component and repo tests | No silent overwrite or global lockout |

**Stop if:** R4-01 shows that a refresh needs a protocol change across all provider IPC cores. Report the scope before implementing.

### Phase 5: files, conversation actions and content correctness

**Dependencies:** Phase 1.

| Item | Findings | Intended behaviour | Evidence | Minimal scope | Checks | Acceptance |
|---|---|---|---|---|---|---|
| R5-01 | P6a-01, P6a-09, P6a-16 | Bulk actions apply only to visible, selected conversations; selecting a missing item rolls back | A | Sidebar selection state | Logic tests | No hidden item is deleted or moved |
| R5-02 | P5b-01 (+P5b-05), P5b-02 | Text conversion options work for non-markdown text; one failed option does not hide the others | A / B | DFC options; blob identity per (bytes, mime) | Unit tests; the `data:` limit is checked in an Electron smoke | Options list degrades per option |
| R5-03 | P5b-04 (correctness part), P5b-13 | History never replays a provider file id from another credential scope; one corrupt draft attachment row does not block the draft (D-4) | A | Send-time scope check; per-row isolation | Unit tests | Old-scope ids are re-uploaded or reported |
| R5-04 | P6b-01, P6b-09 (RC-13) | Code and math render byte-exact, including `$&`, `` $` ``, `$'` and `$$` | B (`$$` tokenisation uncertain) | Function replacers | R1-03-style tests with each pattern | Rendered text equals the source |
| R5-05 | P6b-02, P6b-03, P6b-04 | Inline math does not capture currency or shell variables or cross paragraphs; unsupported link schemes and nested fences render safely | A | Renderer rules | Renderer tests | Documented examples render correctly |

### Phase 6: security and integration boundaries

**Dependencies:** Phase 1. Each item first states its attack preconditions; without them a finding is hardening, not an exploitable vulnerability.

| Item | Findings | Intended behaviour | Minimal scope | Checks |
|---|---|---|---|---|
| R6-01 | P8-02 | Electron fuses set: `RunAsNode` off, ASAR integrity on, and the related fuses | Builder config | `npx @electron/fuses read` on a built executable (packaged check) |
| R6-02 | P5a-01 | LibreOffice runs with macros, links and network disabled | Runner arguments and profile | Fixture DOCX with a macro and an external link (isolated) |
| R6-03 | P5a-02, P5a-03 (+P1-10) | Plugin code is re-verified on load; the health check cannot run manifest-chosen commands; `register-local-package` is not reachable in a release | Plugin lifecycle | Unit tests with a tampered package |
| R6-04 | P3a-01 | Rule assets are signature-checked against a compiled-in key. Bootstrap activation policy unchanged unless R4-01's OQ-4 evidence justifies a change | Cloud rules refresh | Tampered-fixture test |
| R6-05 | P5b-03, P1-12, P3b-05, P3a-10, P3a-11, P5a-10, P5b-12, P7-06 (RC-08) | Downloads and probes are bounded in size and time and check each hop's host at connection level. D-3 does not cover these | Network helpers | Local test servers |
| R6-06 | P1-11, P5a-13, P1-09, P5b-10, P7-09, P4b-06 (RC-11) | IPC handlers check sender and frame and validate values; the vestigial relay is removed | IPC cores | Unit tests per handler |
| R6-07 | P1-08 / I7-01, P7-04, P8-14 (RC-12) | CSP adds `base-uri` and `form-action`, production `connect-src 'self'`, an `img[src]` hook; dev and prod CSP follow Vite mode | CSP config | CSP unit tests and a packaged check |
| R6-08 | P8-08, P8-09, P8-13, P8-10 | Release workflows use least privilege and protected refs; assets are not silently replaced | Workflows | Workflow review; no release is published |
| R6-09 | P2a-09, P7-07, P6a-13 (RC-18) | Credentials and endpoint userinfo never reach logs, error archives or localStorage. Only app-injected transport credentials are redacted; user-authored content is never redacted | Sanitiser wiring | Tests with credential-shaped values |
| R6-10 | P1-02, P1-03, P7-05 | (D-7) The in-app browser is kept: it is built and loaded correctly, its session has permission request and check handlers, and remote content is hardened (sandbox, no node integration, navigation and window-open policy) | `inappBrowser.ts`, its preload and build entry | Handler unit tests; an Electron smoke opening a local test page |

**Real-runtime checks:** a packaged build for R6-01 and R6-07. Nothing is published.

### Phase 7: long-term archives and resource costs (D-5)

**Dependencies:** Phases 2 and 3 (registry and checkpoint code paths).

| Item | Findings | Intended behaviour | Minimal scope | Checks |
|---|---|---|---|---|
| R7-01 | P7-03 (cost), P2b-07 (residual) | Capture stays on and keeps the full canonical body, without blocking the main thread per send | Move hashing and insert off the send path, or batch them; keep the stored bytes identical | Before/after timing on a large synthetic body; byte-equality test |
| R7-02 | P2b-07 (residual) | Identical bodies (retries, repeated attachments) are stored once by content address, still returning the exact original; the archive is indexed by answer and conversation | Schema plus repository | Equality and lookup tests |
| R7-03 | P7-03 (access) | The archive's IPC checks sender and frame (main window only) | IPC handler | Unit test |
| R7-04 | D-5a (OQ-1), P2b-07 | Deleting a conversation deletes its request records (`raw_generation_requests`, `raw_provider_errors`) and archive indexes. Content-addressed bodies (R7-02) are removed only when no other conversation references them. The archive is a separate SQLite file, so the purge must survive a crash between the two deletes (for example a pending-purge marker retried at startup). Explicit per-answer deletion from the inspection UI is optional | Raw store repository and the conversation-delete path | Tests: delete removes only that conversation's records; shared bodies survive; an interrupted purge completes on the next start |
| R7-05 | — | Verify that no transport credential reaches the archive (bodies only; headers are not stored, per `rawGenerationRequestStore.ts:76-98`) and that provider error payloads echoing a key are redacted of that key only | Test with credential-shaped headers and error bodies | Archive contains the user content unchanged and no credentials |
| R7-06 | P4a-13 (+P7-01), P2b-10 (+P7-02), P4b-02, P4b-05, P4b-14, P4b-13, P6b-05 (RC-05) | Terminal operations leave the runtime registry; subscribe sends only live operations; checkpoints and renderer buffers are bounded | Registry, checkpoint, renderer buffers | Measure before and after (memory and latency, synthetic long session) |
| R7-07 | P2b-04, P5b-05, P5b-06, P5b-11, P2b-09, I2a-04 (RC-09) | Unreferenced attachment blobs and derived assets are reclaimed by a guarded sweep; request-archive copies are untouched | Blob store | Sweep tests |
| R7-08 | P2b-03, P2b-08 | FTS triggers do not scan the whole index; hot filters are indexed | Schema upgrade through the reviewed-predecessor mechanism | Benchmark; predecessor-upgrade test |

**Stop if:** R7-02 or R7-08 needs a schema change that the reviewed-predecessor mechanism cannot express. Report it rather than introducing a migration framework.

### Phase 8: final reconciliation and validation

- Re-walk the register: each finding is Fixed (with test), Reclassified, Deferred (with owner decision), Not reproduced, or Still open.
- Run every partition under `rebuild:node`, then `rebuild:electron` and a packaged Electron smoke on an isolated profile, including `npx @electron/fuses read` and the release-channel guard (R2-03).
- Review the remaining open coverage (section 5) where a repair touched it.
- Separate completed repairs from static leads and from behaviour that is still unverified.

## 4. Status

| Phase | Status |
|---|---|
| 0 | Complete (this document and repair-phase-0.md) |
| 1 | Complete, see [repair-phase-1.md](repair-phase-1.md) |
| 2 | Complete, see [repair-phase-2.md](repair-phase-2.md). R2-06 completed for the operation and branch scopes after the owner decision (addendum, section 10). Database-wide failures follow the fail-closed startup policy (D-4r; addendum, section 11). Global restricted mode is removed from scope. Follow-ups R2-06a–e are tracked separately |
| 3 | Complete, see [repair-phase-3.md](repair-phase-3.md). R3-01 to R3-08 done. R3-04 used the documented `citations_delta` shape. P4b-04 needed no tool-continuation UI: an operation left `awaiting_tool` is cancelled on Stop or quiesce |
| 4a | Complete, see [repair-phase-4a.md](repair-phase-4a.md). R4-01 to R4-07 done. P3a-08 was not reproduced (characterization tests added). OQ-4 evidence recorded; bootstrap activation unchanged (D-8) |
| 4b | Complete, see [repair-phase-4b.md](repair-phase-4b.md). R4-08 and R4-09 done. The catalog revision now bumps only when the active snapshot changes, interrupted syncs are recovered, settings saves no longer overwrite unloaded values, and one undecodable rule row no longer blocks saving (D-4). Limitations are in section 5 of that report. |
| 5 | Complete, see [repair-phase-5.md](repair-phase-5.md). R5-01 to R5-05 done. P5b-04 was not reproduced (characterization test added). A corrupt draft attachment row is now skipped and counted; a broken DFC selection still fails the read. No test assertion changed |
| 6a | Complete, see [repair-phase-6a.md](repair-phase-6a.md). R6-01, R6-02, R6-07 and R6-08 done, scoped to keep development unaffected. Fuses verified on a packaged exe; LibreOffice not run. No test assertion changed |
| 6b, 7, 8 | Not started. 6b is R6-03 to R6-06, R6-09 and R6-10 |

## 5. Still-unreviewed areas

These are from phase-9.md section 7.4, the corrected list. Repairs that touch one of them must read it first.
- **Main process:** plain-text and tool-continuation coordinators; `interruptedReplayStorageV2`; about 70% of `openRouterChatGenerationAuthorityV2Service.ts`; LM Studio `nativeItemsV1` and `continuationArtifactV1`; OpenAI-compatible `nativeMessages*`; Gemini interactions-image compiler; OpenRouter image descriptor authority; main-side `readBranch` validation; orphan recovery's treatment of `awaiting_tool`; `addon.cc` blob write atomicity and symlink races; `setDfcSelection` revalidation at send; the plugin-distribution modules listed in phase-5a; citation and `groundingChunks` mapping; `fetchPackageToFile` governance; proxy credential handling beyond the redaction points; `JSON.parse` size bounds in SSE parsers; catalog `sync`, `applyPending` and `status` handlers.
- **Renderer:** the `appChatApp.logic.ts` regions listed in phase-4b; `projectReasoningPresentationV2`; `ChatAppReasoningPanel.vue`; `richtext.css`; `ModelPickerDialog.vue` after template line 2420; about 1,500 template lines of `SettingsPanel.vue`; the lower half of `EndpointDetailPanel.vue` and the other 6a panels; `DraftAttachmentDetailsDialog.vue`; `ingestLocalFiles`.
- **Build and runtime:** installer contents; GitHub environment settings; signature `expiresAt`; privacy-scan internals beyond P7-11; runtime CSP under `file://`; DOMPurify mXSS for MathML and SVG.

## 6. Owner questions

- **OQ-1: answered (D-5a).** Conversation deletion also deletes that conversation's request records and archive indexes, never shared resources still referenced elsewhere. Implemented in R7-04.
- **OQ-2: answered (D-2r).** No development/release distinction this round; legacy data and incompatible databases may be reset by default on the designated paths. R2-03 is withdrawn; formal-release protection is future work.
- **OQ-3: answered (D-7).** Keep and harden the in-app browser (R6-10).
- **OQ-4: open as an investigation item (D-8).** Traced in R4-01; activation behaviour is preserved until evidence justifies a change.
