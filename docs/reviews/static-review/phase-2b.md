# Static Review — Phase 2b: Database and Repositories

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22
**Review type**: Phased static review (read-only). No application code changed; nothing built, run, tested, or rebuilt.
**Baseline**: branch `codex/basic-operation-exploration`, HEAD `aec217cd`. See [phase-0.md](phase-0.md), [phase-1.md](phase-1.md), [phase-2a.md](phase-2a.md).

---

## 1. Scope and coverage

**Reviewed**
- Schema and identity: `infra/db/v2/*.sql`, `infra/db/v2/schemaComposerV2.ts` (fragment loading, digest, predecessor upgrades), `infra/db/schemaVersion.ts`, identity check in `electron/data-epoch/freshEpochDatabaseInitializer.ts`, connection pragmas.
- Conversation/workspace repos: `conversationGraphV2Repo` (partially; lines 590–971 skimmed), `conversationReadV2Repo`, `conversationWorkspaceV2Repo`, `composerDraftV2Repo`, `generationV2SearchRepo` / search target repo, `electron/ipc/generationV2WorkspaceIpc.ts` (delete, rename, move, duplicate).
- Generation persistence: request, execution, config, command-facts authority, authority transaction wrapper, native completion receipts, native artifact storage, body checkpoint, OpenRouter / Ollama / generic-local / OpenAI-compatible native history repos, `electron/services/generationOrphanRecoveryV2.ts`, `electron/debug/rawGenerationRequestStore.ts`.
- Liveness of all repos and the legacy `src/next/persistence` / `dbBridge` layer.

**Not deeply reviewed**: `attachmentAssetV2Repo` internals; Anthropic, DeepSeek, Gemini, LM Studio, OpenAI Responses native history repos (only spot-checked); `portableGenerationHistoryV2`, image output and interrupted-replay repos; model catalog / preferences / capability-rule / cloud-rules repos (question 7 unanswered — carried to Phase 3a); small repos (route preference, endpoint profile, plugin registry, file type detection) checked for liveness only.

**Coordinator direct reads**: schema digest and fragment loader (`schemaComposerV2.ts:15-40, 214-305`), initializer identity check (`freshEpochDatabaseInitializer.ts:75-110, 180-200`), pragma sites, `git ls-files --eol` on schema files, FTS schema, attachment delete guards, `retireAsset` callers, orphan recovery error handling.

---

## 2. Subagent configuration and contributions

- Two concurrent read-only Explore subagents, model `sonnet`, effort `high` (exact "Sonnet 5.5" version not confirmable through the tool).
- **2b-A** — schema, identity, constraints, conversation/workspace/attachment/draft/search repos, liveness.
- **2b-B** — generation persistence, recovery, native history, raw debug store.
- Process note: 2b-A's over-broad `grep` was auto-backgrounded on timeout; the agent stopped it immediately. Read-only; no repo files were changed.
- The coordinator independently found and verified P2b-01, and re-verified P2b-03, P2b-04, P2b-05, and P2b-07.

---

## 3. Findings (ordered by severity)

### P2b-01 — Medium — Schema identity changes with line endings, which can trigger a full data reset
- **Rationale**: A non-semantic byte difference sends users into the backup-and-recreate flow (all conversations leave the live app).
- **Status**: Statically confirmed; whether release builds ever mix checkouts requires runtime/process verification.
- **Evidence**:
  - `infra/db/v2/schemaComposerV2.ts:214-225` (`readFragment`) reads raw bytes with no line-ending normalization; `:263-299` (`digestFragments`) hashes `id \0 bytes \0`.
  - No `.gitattributes`; `core.autocrlf=true` here. `git ls-files --eol infra/db/v2/coreConversationSchema.sql` → `i/lf w/crlf`.
  - `package.json` packages `infra/db/v2/*.sql` as they exist in the build checkout.
  - The code already pins LF, CRLF, and mixed-ending variants of one predecessor (`COMPOSER_EDIT_SESSION_PREDECESSOR_DIGESTS`, `:21-26`; also `REQUEST_CONTRACT_PREDECESSOR_DIGESTS_V2` ~`:461-465`) — the authors have hit this before.
- **Path**: DB created by a build from a CRLF checkout → opened by a build from an LF checkout (or after any comment/whitespace SQL edit) → `freshEpochDatabaseInitializer.ts:195-197` throws `EPOCH2_DATABASE_SCHEMA_MISMATCH` → schema-mismatch prompt → backup and recreate (P2a-02, P2a-05).
- **Counterevidence**: Release builds from a single consistent checkout would not hit it; known predecessors have explicit upgrades.
- **Repair direction**: Normalize line endings before hashing (and keep a migration for existing CRLF digests), and add `.gitattributes` with `infra/db/v2/*.sql text eol=lf`.
- **Verification**: Unit test asserting equal digests for LF and CRLF forms of every fragment.

### P2b-02 — Medium — Pending native-completion receipts that never materialize lock the branch permanently
- **Rationale**: A deterministic materialization failure leaves a branch that can never generate again, with no user action to clear it.
- **Status**: Suspected; requires runtime verification.
- **Evidence**: `electron/services/generationOperationRuntimeRegistryV2.ts:194-308` returns early when a receipt is pending; `generationOrphanRecoveryV2.ts` deliberately skips such operations; `generationNativeCompletionV2.ts` retries `[100, 500, 2000]` ms with an in-memory counter that resets per process; `generationV2IpcRegistration.ts:161-162` reschedules on start. The active-branch partial unique index includes `streaming`, so new generations fail with `GENERATION_V2_EXECUTION_ACTIVE_CONFLICT`. No path abandons a permanently failing receipt.
- **Counterevidence**: Skipping is correct for transient failure because the receipt holds the only copy of the provider result.
- **Repair direction**: Classify materialization errors; after a permanent error or N attempts, terminalize as failed (keeping the partial body) and mark the receipt abandoned, or offer a user "discard" action.
- **Verification**: Inject a failing materializer; assert the branch becomes writable after restart.

### P2b-03 — Medium — FTS maintenance triggers scan the whole index on every message write
- **Rationale**: Synchronous main-process work that grows with total corpus size on common operations.
- **Status**: Statically confirmed; magnitude requires benchmarking.
- **Evidence**: `infra/db/v2/searchSchema.sql:2-7` declares `entity_type`, `entity_id`, `project_id`, `conversation_id`, `created_at_ms` as `UNINDEXED`; triggers delete/update by those columns (e.g. `:69`, `:81`, `:93` `DELETE ... WHERE entity_type='message' AND entity_id=...`). FTS5 can look up only by rowid or `MATCH`, so each trigger is a full scan.
- **Where it fires**: user send (insert, update, delete+reinsert), assistant completion, each cascaded message delete, conversation rename/move (message rows denormalize the title, so all messages are reindexed), project delete (moves N conversations).
- **Impact**: UI stalls proportional to corpus size × operations; deleting a long conversation is roughly O(messages × corpus).
- **Counterevidence**: FTS is not touched while streaming (completed-status trigger only); small corpora early on.
- **Repair direction**: Map entity → FTS rowid in an indexed side table and delete by rowid, or use external-content FTS; join the title at query time instead of denormalizing.
- **Verification**: Benchmark with N messages × M conversations.

### P2b-07 — Medium (privacy/growth) — Raw generation debug store grows without limit and outlives deletions
- **Status**: Statically confirmed (no `DELETE`/prune in `electron/debug/rawGenerationRequestStore.ts`).
- **Evidence**: `rawGenerationRequestStore.ts:207-218` (lazy open, `raw_generation_requests`, `raw_provider_errors`); every stream runner calls `tryPersistPreparedV2`; error payloads up to 8 MiB. Separate SQLite file with no link to conversation deletion.
- **Impact**: Full request bodies (including multimodal content) accumulate forever and survive conversation deletion. Unredacted content is already P2a-09.
- **Counterevidence**: Writes are non-fatal; may be intended as a debug feature.
- **Repair direction**: Retention by age and size with prune on open; purge on conversation delete; or gate behind an explicit debug setting.
- Related: `close()` sets `db = null` and the next `tryPersist*` lazily reopens (possible handle at shutdown); no `busy_timeout`/`synchronous` set.

### P2b-04 — Low-Medium — Attachment bytes are never reclaimed, even after deletion
- **Status**: Statically confirmed (extends I2a-04).
- **Evidence**: `infra/db/v2/attachmentAssetSchema.sql:173-177` (`trg_file_blob_v2_delete_guard` raises on any delete), plus guards on `file_asset_v2`, `asset_revision_v2`, provider file descriptors. `attachmentAssetV2Repo.ts:1045` (`retireAsset`) has no production caller. RESTRICT FKs from draft attachments and image outputs.
- **Impact**: Deleting a conversation or project leaves attachment content on disk indefinitely — unbounded growth, and user-deleted content persists (privacy expectation of "delete").
- **Repair direction**: Reachability sweep that retires unreferenced assets, then a guarded purge path for blob store and rows; document the limitation meanwhile.

### P2b-05 — Low-Medium — Startup orphan recovery can fail on one corrupt artifact and block every launch
- **Status**: Suspected (needs prior corruption).
- **Evidence**: `electron/services/generationOrphanRecoveryV2.ts:63-80` (`loadRecoveryArtifactJson` → `loadNativeArtifactJsonV2`, which throws `NativeArtifactStorageV2Error` on hash/manifest mismatch); the per-operation catch at `:359-362` rethrows anything that is not `GenerationOrphanRecoveryV2Error`; `electron/mainV2.ts:255` calls recovery with no guard.
- **Impact**: A single bad chunk → `EPOCH2_STARTUP_UNCLASSIFIED` on every start.
- **Counterevidence**: Chunk + manifest writes are transactional and hash-verified, so corruption is not expected in normal operation.
- **Repair direction**: Treat artifact-storage errors as a per-operation unrecoverable result; wrap the startup call so recovery cannot block launch.

### P2b-06 — Low-Medium — Unrecoverable operations keep a permanent branch lock
- **Status**: Behaviour statically confirmed; frequency requires runtime verification.
- **Evidence**: `electron/mainV2.ts:255-259` only logs the count; incoherent rows stay `streaming`/`committed`, and the active-branch unique index blocks new generations on that branch each launch.
- **Repair direction**: Quarantine terminal state (e.g. failed with `unrecoverable_state`, evidence preserved) or a user "reset branch" action.

### P2b-08 — Low-Medium — Missing indexes on FK child columns and hot filters
- **Status**: Statically confirmed; impact requires `EXPLAIN QUERY PLAN`.
- **Evidence**: No index on `branch_v2(conversation_id)`, `branch_v2(parent_branch_id, conversation_id)`, `message_v2(introduced_in_branch_id, conversation_id)`, `question_id`/`answer_root_id` on branch choice/hide tables, or non-active columns of `generation_operation_v2`. `conversationReadV2Repo.listConversationPage` queries `branch_v2 WHERE conversation_id=?` per conversation (up to 50 per page).
- **Repair direction**: Add indexes in a new fragment with a predecessor-digest entry.

### P2b-09 — Low — Native completion receipts are never compacted
- **Status**: Statically confirmed.
- **Evidence**: `generationExecutionSchema.sql` allows ~313 MiB per receipt (`native_result_json` + `prepared_request_json`); the receipt repo has no delete/compaction; materialized receipts duplicate artifact and history data.
- **Repair direction**: Clear payloads after materialization (needs an update-guard exception) or delete after a grace period.

### P2b-10 — Low — Body checkpoint rewrites the full body on every flush
- **Status**: Pattern statically confirmed; cost requires measurement.
- **Evidence**: `generationBodyCheckpointV2.ts` (50 ms / 4 KB) → `conversationGraphV2Repo.compareAndSetStreamingAssistantBody` (`:827-887`), one immediate transaction per flush rewriting the whole body; the DB uses `journal_mode=DELETE` + `synchronous=FULL` (journal create/delete and fsyncs per flush on the main thread).
- **Repair direction**: Back off the interval as the body grows.

### P2b-11 — Low — Search quality gaps
- **Status**: CJK suspected; others statically confirmed.
- **Evidence**: `searchSchema.sql` uses the default `unicode61` tokenizer (no `tokenize`), so a contiguous CJK run is one token and mid-sentence words likely do not match. Fuzzy mode in `generationV2SearchRepo.buildFtsQuery` joins `token*` unquoted; tokens `AND`/`OR`/`NOT`/`NEAR` cause syntax errors and the fallback returns an empty page silently. Messages in soft-deleted branches remain indexed and appear as non-navigable hits.
- **Counterevidence**: Exact mode quotes correctly; no injection or scope bypass.
- **Repair direction**: Trigram/ICU tokenizer or CJK segmentation; quote keyword tokens; de-index deleted-branch messages. Revisit in Phase 6.

### P2b-12 — Low — A backward clock change makes renames, moves, and sends fail with misleading errors
- **Status**: Statically confirmed; requires runtime verification.
- **Evidence**: `conversationWorkspaceV2Repo` rename/move/delete use `... AND updated_at_ms <= ?` and report failure as `*_NOT_FOUND`; `conversationGraphV2Repo.beginInitialTurn` rejects `createdAtMs < updatedAtMs` as `INPUT_INVALID`.
- **Repair direction**: Use `max(now, updated_at_ms + 1)` or a distinct error code.

### P2b-13 — Low — Native history repo drift
- **Status**: Statically confirmed for the four repos read.
- **Evidence**: Ollama, generic-local, and OpenAI-compatible repos throw plain `Error` (unclassifiable by IPC) and lack the constructor `foreign_keys` assertion the OpenRouter repo has; `openAIChatCompatible.loadRequestHistory` lacks the provider/contract snapshot check the Ollama and generic-local repos perform; `nativeArtifactJsonMatchesV2` reports a corrupt stored artifact as `CONFLICT`.
- **Repair direction**: Shared base with typed errors, FK assertion, snapshot checks, and a cross-provider conformance test suite. Phase 3b should extend to the remaining providers.

### P2b-14 — Low — Project-name duplicate check is case- and normalization-sensitive
- **Status**: Statically confirmed.
- **Evidence**: `electron/ipc/generationV2WorkspaceIpc.ts:89-98` (`duplicateResult`) compares `project.name = ?` exactly; no DB UNIQUE. "Work" vs "work" and Unicode variants pass. The inbox project can be renamed. (No race: check and insert share one immediate transaction.)

### Informational
- **I2b-01** — `DB_SCHEMA_VERSION = 13` (`infra/db/schemaVersion.ts`) has no production importer and `PRAGMA user_version` is unused; schema identity is the fragment digest. Docs describing a `user_version` mechanism (e.g. `docs/spec/db-rebuild-strategy-dev.md`) are stale. **Correction to Phase 0**: the Phase 0 map's description of versioning via `DB_SCHEMA_VERSION` is inaccurate. **Refinement of I2a-02**: a limited, digest-specific predecessor-upgrade path does exist (`schemaComposerV2.ts` predecessor handling), but any unanticipated schema change still forces backup-and-recreate.
- **I2b-02** — The live connection sets only `foreign_keys=ON` (`epoch2CommittedBootstrap.ts:120`); `synchronous=FULL` / `busy_timeout=0` are set only on the initializer connection (`freshEpochDatabaseInitializer.ts:105-108`), which is closed. Effective live values likely match SQLite/better-sqlite3 defaults (FULL; 5000 ms timeout) — runtime verification recommended.
- **I2b-03** — `ComposerDraftV2Repo.read()` runs a large multi-join after every mutation including each `updateText`; drafts may be up to 20 MiB (edit session up to 32 MiB). Per-keystroke cost scales with draft size (Phase 6).
- **I2b-04** — Soft-deleted branches keep messages and operations forever (growth).
- **I2b-05** — Credential revision captured before an `await` in `openAIChatCompatibleGenerationV2Coordinator.ts:70-191` is not rechecked in the commit transaction (narrow race; Phase 3b).
- **I2b-06** — Dead code: `reasoningDetailsAggregator.ts` (unconditional `console.log`), stale "No production caller" docstring on the authority transaction helper.

---

## 4. Liveness

- **Live**: conversationGraphV2Repo, conversationReadV2Repo, conversationWorkspaceV2Repo, composerDraftV2Repo, attachmentAssetV2Repo, generationV2SearchRepo, generationV2SearchTargetRepo, systemChatTemplateV2Repo, conversationRoutePreferenceV2Repo, fileTypeDetectionV2Repo, enginePluginRegistryRepo, localEndpointProfileV2Repo, and the generation request/execution/config/native-history repos.
- **Dead (no non-test importers)**: conversationDraftRepo, fileAssetRepo, searchRepo, projectRepo, usageRepo, derivativeJobRepo, messageAttachmentRepo, fileDerivativeRepo, dfcOptionGenerationStateRepo, reasoningDetailsAggregator, `src/next/persistence/{repo,migrate}.ts` + `schema.sql`, `infra/db/dbMethodsRegistry.ts` (type-only), `src/next/ipc/contracts/dbBridgeContracts.ts` and renderer clients using `globalThis.dbBridge`, `DB_SCHEMA_VERSION`.
- **dbBridge residue**: `electron/preload.ts` exposes no `dbBridge`; in `src/ui-app/app/appChatApp.logic.ts`, `persistConvoMetaUpdate` (~3536) reaches `saveConvo` only after an early return, and `cycleUserMessageRenderMode` (~6698) swallows the "Missing dbBridge" error and is never called. Dead code with divergent legacy schemas — removal candidates (Phase 4b/6 will confirm).

---

## 5. Reviewed with no actionable finding

- Core graph CHECK/trigger invariants (immutable structure, status transitions, head/parent validation, branch choice/hide/context-filter triggers); `UNIQUE(conversation_id, ordinal)`.
- One active operation per branch enforced at the DB (partial unique index), not only in memory.
- Operation state machine: CHECK + terminal-once/immutability triggers + CAS updates (`WHERE state=? AND updated_at_ms=?`); terminal states final.
- Late checkpoint cannot overwrite a terminal message (CAS requires `status='streaming'` and matching body).
- Orphan recovery runs synchronously before IPC registration (`mainV2.ts:255` vs `:261`), per-operation transactions, idempotent; partial content kept as failed with `stream_interrupted`.
- Authority transaction wrapper: `transaction.immediate()`, rejects async callbacks and nesting, maps BUSY/LOCKED to a lock-conflict code.
- Request and snapshot tables insert-only (trigger-guarded); request repo stores only body hash and length.
- Config CAS with revision recheck; command facts frozen into snapshot inside the transaction.
- Native artifact storage: content-addressed 1 MiB chunks, hash-verified on load.
- Draft repo: revision CAS in immediate transactions for every mutation.
- Delete while streaming: workspace delete quiesces and drains, registry rejects new registrations, DB rechecks active operations inside the delete transaction.
- FKs: every repo asserts `foreign_keys=ON`, as does the live connection.

## 6. Rejected false positives

- Project delete losing conversations (they move to Inbox; UI states this).
- Rename/duplicate races (single synchronous immediate transaction).
- `MAX(ordinal)+1` race (immediate transaction + UNIQUE).
- FTS injection/scope bypass (exact mode quoted; column filters scoped).
- FTS write amplification during streaming (triggers fire only on completion).
- Receipts leaking credentials (typed non-secret header plan; endpoint credentials rejected).
- Raw store contending with the main DB (separate file).
- `source_answer_id` RESTRICT blocking conversation delete — considered unlikely given cascade order, but the regenerate/retry case is untested; flagged for runtime verification.

---

## 7. Next phase

Phase 3a — Model identity and capability (`src/core/generation-v2` capability rules, model facts, contracts; `src/shared/modelCatalog`; `src/next/modelCatalog`, `modelPrefs`, `provider`; cloud rules and models.dev refresh; source priority; plus the deferred transaction/LKG review of catalog, preference, capability-rule, and cloud-rules repos). Not started.
