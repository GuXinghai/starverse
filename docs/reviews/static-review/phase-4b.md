# Static Review — Phase 4b: Renderer Conversation State

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

This is a read-only static review of branch `codex/basic-operation-exploration-8q02ix` at commit `c6a5455`. The application source matches baseline `aec217cd`. No application code was modified. Tests, builds and rebuilds were not run, the app was not launched, and no provider requests were made.

## 1. Scope and coverage

| Area | Files | Depth |
|---|---|---|
| Send orchestration | `src/ui-app/app/appChatApp.logic.ts` send / retry / regenerate / edit-resend / abort / image settings; `useChatSession.ts`, `conversationConfigUpdateQueue.ts`, `sendButtonMode.ts`, `generationV2RouteSelection.ts` | Targeted (see omissions); `chatSessionConfig.ts` skimmed |
| Command boundary | `src/next/generation-v2/renderer/generationV2CommandClient.ts`, `electron/ipc/textGenerationV2IpcCore.ts`, `electron/ipc/generationOperationRuntimeV2Ipc.ts`, capability-revision expectation | Full |
| Projection consumption | `subscribeGenerationV2Runtime`, `branchRuntimeCacheV2.ts`, `generationV2BranchProjection.ts`, `branchViewProjection.ts`, runtime-overlay and refresh paths in `appChatApp.logic.ts` | Full |
| `src/next/state` | `reducer*`, `reducers/*`, `eventScheduler.ts`, `selectors.ts`, merger, audits | Liveness determined; only live parts reviewed |

**Not covered (open):**
- `appChatApp.logic.ts`: attachment import/DFC (about lines 4220–6400), model-picker/catalog code, `onSelectConvo` and `onSelectBranch` bodies, delete-question, fork, and truncate flows.
- `projectReasoningPresentationV2`.
- Main-side `readBranch` validation.
- The plain-text and tool-continuation coordinators carried over from 4a. Only the Anthropic regenerate coordinator and `conversationGraphV2Repo` action methods were read.
- How startup orphan recovery treats `awaiting_tool`. Phase 4a reported that it preserves it, but this was not re-traced here.
- Tests.

## 2. Subagent configuration and contributions

Two read-only `Explore` subagents ran concurrently with `model: sonnet` and `effort: high`. The exact "Sonnet 5.5" version can't be confirmed. Neither subagent spawned agents or wrote files.

- **4B-A** reviewed command orchestration and the command boundary, and returned 9 candidates.
- **4B-B** reviewed projection consumption and state, and returned 16 candidates.

The coordinator verified the following against source:

**Subscribe handshake (P4b-02).** In `generationV2CommandClient.ts:147-165`, listener calls in the hydrate loop are unguarded. `hydrated` is set only on success, and `.catch` only emits `sync_error`. On the main side, `generationOperationRuntimeV2Ipc.ts:44-46` adds the subscriber and a `destroyed` listener before calling `listSnapshots()`.

**Regenerate guard (P4b-01).** `appChatApp.logic.ts:7870-7899` checks only `isRunning`, `isDraftInteractionLocked` and `activeAssistantMessageId`. It sets no lock before the awaits, and it mints a fresh `crypto.randomUUID()` per click.

**Operation-sender relay (P4b-06).** In `textGenerationV2IpcCore.ts:65-92`:
- Entries are set before dispatch.
- Entries are deleted on a terminal event, except when the operation is `awaiting_tool`.
- No renderer code calls `onProjection`; a grep over `src` and `electron` found no consumer.

**Other checks.**
- `newer()` prefers `generating` (`branchRuntimeCacheV2.ts:36-44`).
- The refresh timer ignores branch id (`appChatApp.logic.ts:8499-8505`).
- `onAbort` discards the abort result (`:3383-3402`).
- `useLiveStreamController.ts` has no importer.

## 3. Findings by severity

There are no High findings. Final IDs use the form P4b-NN, with the subagent IDs in brackets.

### Medium

#### P4b-01 — Regenerate and retry-as-new have no in-flight guard; a double-click creates two branches and two provider generations [4B-A-1]
- **Severity:** Medium. It produces duplicate billable requests and a stray branch, but no data loss.
- **Status:** Statically confirmed. The size of the window depends on main-process latency: attachment preflight, credential checks and the local profile lookup are awaited before submit.
- **Where:**
  - `appChatApp.logic.ts:7870-7931` (`onRegenerateFromQuestion`) and `:8164-8206` (`onRetryAnswer`).
  - The guards at `:7873` are not set until the command is accepted and a refresh runs.
  - A new `operationId` / `clientActionId` is minted per click at `:7898` and `:8177`.
  - `infra/db/repo/conversationGraphV2Repo.ts:588-690` (`beginAnswerAction`) checks the head and the source answer, but `regenerate_question` and `retry_as_new` only insert a `branch_v2` row and do not advance the source head. Both commands therefore pass.
- **Counterevidence:**
  - `retry_replace` is protected by the head compare-and-set (`:744-791`).
  - Send and edit-resend use `sendOrchestrationLocked` and `submittingComposerConversationIds`, set synchronously before the first await.
- **Repair direction:** Put regenerate and retry under the same synchronous submitting lock, or a per-question in-flight set. Optionally derive the client action id from `(branch, question, sourceAnswer, head)` so that a duplicate is an `idempotent_replay`.
- **Verify:** A UI test that clicks twice before the first submit resolves should see one command.

#### P4b-02 — Runtime subscription can wedge for the life of the page and buffer events without bound [4B-B-1, 4B-A-5]
- **Severity:** Medium. When it triggers, live streaming stops updating and the only visible sign is a connection error until reload.
- **Status:** Statically confirmed mechanism. The triggers are suspected.
- **Where:**
  - `generationV2CommandClient.ts:150-165`: listener calls in the hydrate loop at `:153-156` have no try/catch, `hydrated = true` runs only after the loop, and `.catch` at `:159` emits `sync_error` with no retry. Events arriving meanwhile are pushed to `pending` at `:147`, which has no cap.
  - `generationOperationRuntimeV2Ipc.ts:44-46` registers the subscriber before `listSnapshots()`. If hydration throws, events keep flowing to a renderer that will never become hydrated.
- **Triggers:**
  - The app listener throws on any historic snapshot.
  - `listSnapshots()` / `#hydrate` throws, for example `PROJECTION_NOT_PERSISTED` for an entry whose rows were later deleted. This is unverified, and it compounds with P4a-13, since the registry never evicts.
- **Repair direction:**
  - Guard each listener call.
  - Set `hydrated` in `finally` and resubscribe with backoff.
  - Cap `pending`.
  - On the main side, register the subscriber only after a successful snapshot, and make `listSnapshots` skip entries that fail to hydrate instead of throwing.

#### P4b-03 — "Generating" state can stick with no reconciliation against the DB [4B-B-2, 4B-B-3, 4B-A-6]
- **Severity:** Medium. The composer stays blocked and Stop gives no feedback. Recovery requires a reload or a conversation switch.
- **Status:** The mechanisms are statically confirmed. The specific lost-terminal trigger is suspected.
- **Where:**
  - `branchRuntimeCacheV2.ts:36-44` (`newer()` always prefers a `generating` snapshot).
  - `appChatApp.logic.ts:1214-1239` (`isRunning` reads both the cache and `activeGenerationV2Answer.status`).
  - `:8499-8505` (terminal-triggered `void refreshRenderableBranchView`, with no `.catch`).
  - `:3383-3402` (`onAbort` ignores the abort result).
  - `generationV2CommandClient.ts:44-46` (abort result is not unwrapped).
  - `electron/services/generationStreamProjectionV2.ts:60-65` (publish exceptions are swallowed).
- **Paths:**
  1. The terminal event is never published because `#persistedPayload` throws. No concrete path was traced. The renderer has no polling.
  2. The terminal refresh rejects, so the DB-derived view keeps `streaming`. A conversation switch during that read also yields an unhandled `GENERATION_V2_BRANCH_PROJECTION_STALE` rejection.
  3. Abort returns `false` for an operation that is not abortable, such as `awaiting_tool` (see P4b-04), and nothing is shown to the user.
- **Repair direction:**
  - When a DB refresh shows the target answer is terminal, clear or downgrade the matching cache entry.
  - Re-query `snapshot(opId)` for stale `generating` entries.
  - Catch and surface refresh errors.
  - Surface abort `{ok:false}` / `aborted:false`.

#### P4b-04 — `awaiting_tool` operations are unstoppable and block deletion; the renderer has no continuation path [4B-A-2]
- **Severity:** Medium if reachable. Likelihood is low.
- **Status:** Mechanism statically confirmed. Reachability is suspected: the renderer hard-codes `tools: { mode: 'disabled' }` (`appChatApp.logic.ts:7045`).
- **Where:**
  - `generationV2CommandClient.ts:89` maps `awaiting_tool` to `generating`, and there is no continue-tool command in the client or any caller in `src/ui-app`.
  - The registry clears `abort` when the runner finishes (`generationOperationRuntimeRegistryV2.ts:155-157, 224-226`), so `abort()` returns `false` (`:386`).
  - `infra/db/repo/conversationWorkspaceV2Repo.ts` (about lines 38-44) rejects project and conversation deletion while any operation is `committed` or `streaming`, and an `awaiting_tool` operation stays `streaming`.
- **Impact:** The branch is stuck showing "generating" with a no-op Stop, the conversation and project cannot be deleted, and the operation-sender entry is held (see P4b-06).
- **Repair direction:** Make abort terminalize `awaiting_tool` as cancelled, or have the renderer treat it as terminal when tools are disabled.

#### P4b-05 — Retained runtime snapshots make reload/remount cost quadratic, and per-delta work is heavy [4B-B-4, 4B-B-5, 4B-B-6, 4B-A-5]
- **Severity:** Medium for long sessions; this is reliability and performance, not correctness.
- **Status:** Statically confirmed. Measure before fixing.
- **Where:**
  - **Retention:** the renderer bridge `snapshots` map is never pruned (`generationV2CommandClient.ts:103, 116, 154`). Main never evicts registry entries (`generationOperationRuntimeRegistryV2.ts:95`; same root cause as P4a-13). This defeats the `branchRuntimeCacheV2` limits of 16 branches and 32 MB.
  - **Reload:** `listSnapshots()` re-hydrates every operation from SQLite and sends all bodies and reasoning. Each snapshot then runs `upsert` → `prune` → `patchBranch` → overlay, which is O(N²).
  - **Per delta:**
    - `prune` runs `estimateBytes` (TextEncoder plus `JSON.stringify`) over up to 17 terminal branches on every event (`branchRuntimeCacheV2.ts:21-34, 66, 88-100`).
    - The reasoning array is copied in the bridge reducer (`generationV2CommandClient.ts:69-73`) and again in the overlay.
    - The overlay copies the whole messages map.
    - `selectMessage` re-projects all reasoning facts (`appChatApp.logic.ts:1000-1008, 1910-1924`; `selectors.ts:107-116`).
    - Reasoning events are unthrottled.
- **Repair direction:**
  - Evict terminal operations in both the registry and the bridge once delivered.
  - Have `listSnapshots` return only active and recent operations.
  - Prune only on terminal or new-operation upserts, and cache byte sizes.
  - Coalesce events per animation frame.

### Low-Medium

| ID | Finding | Status | Where | Repair direction |
|---|---|---|---|---|
| P4b-06 [4B-A-4, resolves I4a-09] | Per-provider IPC `operationSenders` relays every event on the provider projection channel, but no renderer code subscribes (`onProjection` is declared in `electron/preload.ts:62` and has no consumer). Each event is therefore cloned and sent twice, and `assistant_body` carries the full body each time. Entries leak for `awaiting_tool` (by design, `:78`) and for `idempotent_replay` of already-terminal operations. Each leaked entry holds a `WebContents` reference. | Confirmed | `electron/ipc/textGenerationV2IpcCore.ts:65-92, 111`; `openRouterGenerationV2Ipc.ts:76-106`; `geminiGenerationV2Ipc.ts:56-96` | Remove the vestigial relay and maps |
| P4b-07 [4B-A-3] | An accepted command and the draft clear are separate transactions. If the renderer crashes in between, the draft survives with text and attachments while the head has already advanced, and resending mints a new UUID, which creates a duplicate turn. A throw from `clearCommitted` or the attachment refresh after acceptance is reported as a send failure, locks the composer behind `pendingDraftConflict`, and skips the post-send refresh. In edit-resend it also skips the branch follow-up. | Confirmed design; crash window suspected | `appChatApp.logic.ts:7737-7773, 8042-8061, 5385-5399`; `composerDraftV2Repo.ts:307-320` | Derive the operation key from `(conversationId, draftRevision)`, or clear the draft in the command transaction |
| P4b-08 [4B-B-8] | Runtime-triggered refreshes reload only the latest page (`appendEarlier=false`). Turns the user loaded earlier disappear and the scroll jumps. | Confirmed | `appChatApp.logic.ts:2358-2360, 8555`; `loadEarlierTranscript` at `:2533-2538` | Preserve the loaded turn range |
| P4b-09 [4B-A-7] | Image-generation panel settings are applied optimistically. A persistence failure only produces a debug log, with no rollback and no error shown. Send reads the persisted config, so the UI and the command silently diverge. | Confirmed | `appChatApp.logic.ts:6563-6597` | Roll back and report, as in `applyComposerSessionConfigUpdate` (`:3845-3856`) |
| P4b-10 [4B-B-7] | While the target answer is not yet in state, every event schedules a refresh, and each refresh supersedes the one in flight. If a refresh is slower than the event cadence (for example image-heavy turns), none completes until events stop. | Suspected (the send path may already insert the answer) | `appChatApp.logic.ts:2381, 2403-2420, 8553-8557`; `branchViewProjection.ts:139-143` | Single-flight refresh with a dirty flag |
| P4b-11 [4B-B-10] | The overlay sets `contentText = entry.body` unconditionally after each DB hydrate, even when the operation is terminal. If the terminalized DB body differs from the last streamed body (cf. P4a-08), the renderer shows the stale text until reload. | Suspected (divergence not proven) | `appChatApp.logic.ts:1902-1908, 2480`; `conversationGraphV2Repo.ts:867-874` | Prefer the DB body once terminal, or publish a final body event |

### Low

| ID | Finding | Status | Where |
|---|---|---|---|
| P4b-12 [4B-A-8, 4B-B-9] | Two refresh-targeting slips. First, the error-path refresh in regenerate and retry runs on the source branch without checking the active branch: it bumps the global refresh revision, can drop the active branch's in-flight load, and on a conversation switch throws inside `catch`. Second, the single refresh timer ignores branch id, so a pending timer for branch A swallows a refresh request for branch B. Separately, `reportChatError` drops errors after any navigation, so a failed send can show nothing (the draft is kept). | Suspected / confirmed | `appChatApp.logic.ts:7927-7930, 8202-8205, 8499-8505, 352-359` |
| P4b-13 [4B-B-14, 4B-A-5] | Main adds a `sender.once('destroyed')` listener on every subscribe (MaxListeners warning after repeated remounts), and there is no unsubscribe channel, so main keeps sending after the renderer unsubscribes. | Confirmed | `generationOperationRuntimeV2Ipc.ts:44-45` |
| P4b-14 [4B-B-13] | The module-global `messageCache` in selectors is never cleared. It retains message VMs, including image data URLs, across conversation switches. | Confirmed | `src/next/state/selectors.ts:6-7, 100-101, 160` |
| P4b-15 [4B-B-12, 4B-B-11] | Runtime payload validation is shallow: an unknown `payload.type` falls into the terminal branch with `status: undefined`, and `subscribe`/`snapshot` results are not validated. The renderer reducer does not bump `updatedAtMs`, unlike main, but `newer()` tie-breaks on it. The source is trusted main, so impact is small. | Confirmed | `generationV2CommandClient.ts:61-99, 152-156` |
| P4b-16 [4B-B-15] | A turn whose chosen answer is missing throws `GENERATION_V2_UI_CHOSEN_ANSWER_MISSING` and blanks the whole branch view. This requires an inconsistent DB projection. | Suspected | `generationV2BranchProjection.ts:71` |
| P4b-17 [4B-A-9] | Raw error codes (for example `GENERATION_V2_GRAPH_REPOSITORY_STALE_HEAD`, `..._PROJECT_HAS_ACTIVE_GENERATION`) are shown verbatim, with no i18n mapping. The command boundary sanitises codes to `^[A-Z][A-Z0-9_]{2,255}$`, so no provider text leaks. | Confirmed | `ChatTopSummaryBar.vue:47-49`; `textGenerationV2IpcCore.ts:48-51` |

### Info and maintainability
- **I4b-01: dead or inert state modules.**
  - `useLiveStreamController.ts` has no importer.
  - `reasoningArtifactCollector.ts` has no importer; `reasoningArtifactsByMessageId` is only pruned, never filled.
  - `src/next/state/reducers/*` and `applyEventsBatch` are unreachable.
  - `eventScheduler.ts` is instantiated (`appChatApp.logic.ts:1387`), but `enqueue` is never called.
  - The renderer use of `src/next/state/reasoningDetailStreamMerger.ts` is reached only via dead code.
  - Live parts: `types.ts`, `createInitialState`, `toggleReasoningPanelState`, `selectMessage`, `selectRun`, and the diagnostics-gated `perfMetrics` and `schedulerDiagnostics`.
  - Phase 0 listed `useLiveStreamController` and the reducer as live state; this phase corrects that.
- **I4b-02:** `subscribeGenerationV2Projections` is unused (tests only). It would throw out of the listener on `sync_error`, poisoning the recovery chain, and it drops snapshots. Do not wire it up as written.
- **I4b-03:** The abort `_route` parameter is dead, and `useChatSession.randomId` is unused.
- **I4b-04:** Attachments-only sends are allowed by the renderer (`appChatApp.logic.ts:7705`). Main-side validation was not traced.

## 4. Uncertainties and excluded false positives

**Uncertainties:**
- Whether any path makes `#persistedPayload` throw on a terminal (P4b-03).
- Whether hydration can fail after deletions (P4b-02).
- Whether models can emit tool calls when tools are disabled (P4b-04).
- Whether terminal and streamed bodies ever diverge (P4b-11).
- Whether the send path inserts the answer before the first event (P4b-10).
- Real reasoning-array and image sizes, which decide whether P4b-05 is noticeable.
- The latency of the regenerate double-click window (P4b-01).

**Held up:**
- **Subscribe ordering:** events are buffered until the snapshot is applied. Duplicates are dropped by sequence, and gaps or unknown operations trigger serialized recovery. Main's subscribe handler is synchronous, so a snapshot can't interleave with a publish, and body persist and publish happen in one synchronous block.
- **Terminal ordering:** main publishes a terminal only after the DB matches, so no body event can follow it.
- **Branch targeting:** the overlay applies only to the active branch and to an existing assistant target. Superseded loads are discarded via leases (`appChatApp.logic.ts:2424, 2454`).
- **Unmount:** `onUnmounted` unsubscribes and clears the timer.
- **Send and edit-resend double-submit:** closed by a synchronous lock.
- **Retry-replace double-click:** safe via the head compare-and-set.
- **Stale model or provider at send:** the capability lease is re-asserted around every await, and the revision is checked strictly at the IPC boundary through AsyncLocalStorage.
- **Failed sends:** the draft is cleared only after `result.ok`, with an optimistic-concurrency revision check, so a failed send keeps the draft and attachments. Cross-conversation draft publication is prevented.
- **Config updates:** serialized through `conversationConfigUpdateQueue`.
- **Abort target:** abort targets the registry with the correct operation id.
- **Operation ids:** `crypto.randomUUID()` per action.

**Rejected or downgraded:**
- "Reasoning merge is incorrect": the merger is not on the live path (I4b-01).
- "Scheduler rAF/timer leak": the scheduler never schedules anything.
- "Snapshot-then-delta gap on subscribe": the buffer plus the synchronous main handler close it.

## 5. Cross-phase notes
- P4b-05 and P4b-02 share a root cause with **P4a-13** (registry never evicts). A single fix should address all three.
- P4b-11 is the renderer-side face of **P4a-08**.
- P4b-06 resolves **I4a-09**.
- P4b-04 extends the `awaiting_tool` drain note in **P4a-19**.

## 6. Next phase

**Phase 5a, plugins, engines and processes:**
- Engine plugin lifecycle and signing.
- LibreOffice runtime and installer.
- Magika utility process.
- `externalProcessRunner`.
- Official package download.

Still open from Phases 4a and 4b, to be folded into Phase 9 or done as a short follow-up:
- The plain-text and tool-continuation coordinators.
- The `appChatApp.logic.ts` regions listed in §1.

This phase is complete. I have stopped and am waiting for your instruction to continue.
