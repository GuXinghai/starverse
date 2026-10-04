# Main product / UI journey audit

## Scope checkpoint

- Assigned workstream: chat, projects, conversations, branches, composer, model picker entry points, and loading/empty/error/recovery states.
- Baseline supplied by coordinator: branch `models-dev-capability-resolution`, HEAD `8d928d6d`; production/state audit is read-only.
- This report is the only file owned by this agent. No tests, app launch, ABI rebuild, provider calls, Cloud Rules mutation, or DB/settings changes have been run.
- Method: inspect current source and tests; trace reachable UI → store/composable → IPC → service/repository. Findings below remain candidates for coordinator cross-check and deduplication.
- Respect owner scope: main-loop closure does not imply full-project completion; deferred product expansion is distinguished from broken existing behavior.

## Candidate findings (incremental)

### MAIN-01 — Project deletion promises preservation but cascades deletion

- Candidate severity/type: **HIGH** (coordinator should consider BLOCKER for destructive consent mismatch), **BROKEN_CLOSURE / STATE_PERSISTENCE**.
- User-visible scenario: delete a user project containing conversations after the confirmation says its conversations will move to Inbox.
- Exact incomplete loop: confirm → V2 delete-project IPC → direct SQL project deletion. No conversation relocation occurs; the V2 schema cascades project deletion through conversations and messages. The confirmation describes a different outcome from the executed command.
- Evidence: `src/ui-app/components/ConversationList.vue:701` renders `navigation.project.deleteConfirm`; `src/shared/i18n/locales/en-US/navigation.json:9` and `zh-CN/navigation.json:9` promise Inbox relocation. `src/ui-app/app/appChatApp.logic.ts:2651` calls `deleteGenerationV2Project`; `electron/ipc/generationV2WorkspaceIpc.ts:150` dispatches the delete; `infra/db/repo/conversationWorkspaceV2Repo.ts:31`–42 performs `DELETE FROM project_v2`; `infra/db/v2/coreConversationSchema.sql:11` declares `conversation_v2.project_id ... ON DELETE CASCADE`, and line 22 cascades conversation deletion to messages.
- Minimal repair direction: align confirmed semantics with the backend. Preserving the current promise requires atomic relocation to the actual template/Inbox project before deleting the project, plus renderer refresh. If destructive semantics are owner-chosen, use explicit destructive wording and counts instead. **Both UI and backend** need the owner decision/closure check; no decision is made by this audit.
- FK enforcement/no relocation: `electron/data-epoch/epoch2CommittedBootstrap.ts:118`–121 turns foreign keys on for the live DB; `infra/db/repo/generationV2AuthorityTransactionInternal.ts:131`–133 enforces them again for the mutation. The project-delete trigger in `infra/db/v2/searchSchema.sql:26`–30 only deletes search rows. The reachable IPC/repo path has no move-to-Inbox step.
- Existing tests would **not** catch the confirmation mismatch. `electron/ipc/generationV2WorkspaceIpc.test.ts:96`–123 checks quiescing and project absence, with no preservation assertion. `infra/db/v2/schemaComposerV2.test.ts:535`–544 explicitly allows owning-project physical cascade; `infra/db/v2/generationExecutionSchema.test.ts:529`–534 asserts related generation records disappear after deleting a project. Those schema integrity tests are valid for physical deletion, but do not check the product's confirmation contract.
- Verification: no runtime performed; current SQL and reachable UI/IPC path establish the mismatch.

### MAIN-02 — Deleting the active conversation leaves a deleted active workspace

- Candidate severity/type: **HIGH**, **BROKEN_CLOSURE / STATE_PERSISTENCE / ERROR_RECOVERY**.
- Scenario: select a formal chat, delete it using its sidebar menu, then continue typing or sending.
- Exact incomplete loop: backend delete succeeds, sidebar list refreshes, but renderer retains the deleted `activeConvoId` and `activeBranchId`. `loadTranscriptForActiveConvo` attempts to reload the deleted conversation, raises missing branch, and never clears/replaces the old transcript. New sends still target the deleted branch until the user selects a valid chat or New.
- Evidence: `src/ui-app/app/appChatApp.logic.ts:2565`–2575 (single delete) and `2592`–2603 (bulk delete including active) only clear reasoning artifacts; neither changes active IDs. `refreshConvos` at `2103` chooses a replacement only when active ID is empty. `ensureGenerationV2BranchForConversation` at `2217`–2220 throws `GENERATION_V2_CONVERSATION_BRANCH_MISSING`. `loadTranscriptForActiveConvo` at `2446` awaits that before updating transcript. `infra/db/repo/conversationWorkspaceV2Repo.ts:60`–67 physically deletes the conversation.
- Minimal repair direction: after successful deletion including active conversation, clear/rebind active conversation and branch to a valid remaining conversation or New template, clear the removed projection/caches, and restore the next scope's draft. **UI only** for the deletion closure (backend delete is already present).
- Existing tests would **not** catch this renderer closure: repository/IPC deletion tests verify DB behavior; targeted searches across current `src/ui-app`/`tests` test sources found no active-delete or bulk-active-delete UI scenario. Shared bridge helpers mock delete success (`tests/helpers/generationV2Bridge.ts:248`).
- Verification: no runtime performed; recovery by selecting another chat/New remains reachable.

### MAIN-03 — Branch fork, rename, and delete have backend support but no reachable UI

- Candidate severity/type: **MEDIUM**, **BACKEND_WITHOUT_UI / DEAD_OR_LEGACY**.
- Scenario: edit/resend or regenerate an earlier question to create branches; users can switch branches but cannot name, deliberately fork, or remove an unwanted branch.
- Evidence/path: `src/ui-app/AppChatApp.vue:472`–500 renders only branch select/load-more. `src/ui-app/app/appChatApp.logic.ts:6908`–6941 implements fork/delete and exports them at `7747`–7748, but `AppChatApp.vue` does not destructure/bind them and no other production caller is present. `src/next/generation-v2/renderer/generationV2WorkspaceClient.ts:103`–105 exposes fork/rename/delete; IPC is registered in `electron/ipc/generationV2WorkspaceIpc.ts:187`–206, backed by `ConversationWorkspaceV2Repo`.
- Minimal direction: **UI only** to expose branch management with confirmation/protected-last-branch policy, or deliberately remove/document unused actions if owner chooses limited scope. Existing branch selection/edit/regenerate works; this is missing product reachability, not a claim that all branching is broken.
- Tests: current `AppChatApp.regenRetry.test.ts:467`–520 verifies conversation/branch pagination preserving active route; workspace IPC tests cover delete safety. They do not cover absent management UI.
- Deduplication: overlaps feature-to-backend wiring workstream 04; coordinator should retain one normalized finding.

### MAIN-04 — The Inbox/system-project identity follows the newest project, not the stored template

- Candidate severity/type: **HIGH**, **STATE_PERSISTENCE / BROKEN_CLOSURE**.
- Scenario: create or rename a project so it becomes the most recently updated project, then inspect/rename/delete projects or restart.
- Exact incomplete loop: ensure-default selects the newest project even when a system template already belongs to another project, returns that selected ID, and renderer marks it as Inbox/system. The real template-owning project remains the New Chat destination and backend-protected project; UI and backend now disagree about identity. The newly created project can immediately become falsely protected, while the actual template project exposes actions that reject.
- Evidence: `electron/ipc/generationV2WorkspaceIpc.ts:87`–97 chooses `ORDER BY updated_at_ms DESC` and returns the chosen `projectId`; `infra/db/repo/systemChatTemplateV2Repo.ts:57`–58 returns the existing template unchanged. `src/ui-app/app/appChatApp.logic.ts:2129`–2130 sets `inboxId` from ensure-default; `2689` assigns system status by that ID. `ConversationList.vue:57`–66 excludes that ID from user projects/protects it; `onCreateProject` at logic `2632`–2634 immediately invokes refresh. Actual backend protection is `conversationWorkspaceV2Repo.ts:33`–35, keyed to the stored template conversation's project.
- Minimal direction: **backend + UI cross-check**: return the existing template's owning project ID as the authoritative default/Inbox identity; renderer consumes that stable identity. Avoid deriving a protected/system identity from recency. Consider explicit contract assertion that defaultWorkspace.projectId equals template.conversation.projectId.
- Tests would **not** catch this identity drift: current App fixtures mock a single stable ensure-default project (`AppChatApp.regenRetry.test.ts:191`, `AppChatApp.send.test.ts:369`, `AppChatApp.candidatePager.test.ts:75`). Workspace IPC tests focus on deletion/quiescing and do not exercise ensure-default after a second project. The template client's bridge tests verify plumbing, not project recency/identity. No runtime performed.

### MAIN-05 — Initial workspace failures are hidden when no conversation is active

- Candidate severity/type: **HIGH**, **ERROR_RECOVERY / UI_GAP**.
- Scenario: first workspace/bootstrap IPC read rejects before active conversation is assigned, or the renderer bridge is unavailable.
- Exact incomplete loop: mounted startup catches/stores `loadError` and sets ready, but the sole error-rendering topbar is gated on `workspaceMode !== 'none'`; that mode requires an active conversation. The user gets empty sidebar/content rather than error/retry/settings. Sidebar Refresh only refreshes conversations using the current project IDs; with startup failure before projects load, it cannot rerun initialization.
- Evidence: `src/ui-app/app/appChatApp.logic.ts:7329`–7332 records missing-bridge error; `7335`–7351 initializes before navigation; `7413`–7416 captures startup failure. `3270`–3272 derives `none` from null active ID. `src/ui-app/AppChatApp.vue:458` hides `ChatTopSummaryBar`, including `loadError` at `464` and the ordinary settings entry at `468`. `ChatTopSummaryBar.vue:54`–55 is the error display; current source has no independent root error banner. `refreshConvos` at `2093` uses currently loaded projects, rather than restarting initialization.
- Minimal direction: **UI only** for root startup error/loading/retry independent of active conversation, preserving settings access. Avoid treating a failed workspace read as a valid empty workspace.
- Tests would **not** catch the hidden root error: current App send/regenerate/pagination fixtures exercise successful workspace startup; `src/next/convo/systemChatTemplateClient.test.ts:62` verifies the client propagates exact errors, but does not render App with a rejected startup read. This is a static failure-path finding; no failing IPC was injected/runtime performed.

### MAIN-06 — Edit mode is global across conversations and is not reconstructed from persisted draft mode

- Candidate severity/type: **HIGH**, **STATE_PERSISTENCE / BROKEN_CLOSURE**.
- Scenario: start editing a question in chat A, switch to chat B, then submit/cancel the visible edit controls; alternatively restart with an edit draft persisted.
- Reachability verified: `isDraftInteractionLocked` is only attachment-confirmation state (`appChatApp.logic.ts:689`–692), not edit mode. `AppChatApp.vue:436` passes only readiness/that lock to sidebar; `ConversationList.vue:108`–115 and `463`–467 select another chat with no edit restriction. `onSelectConvo` at `2468`–2474 and `onSelectBranch` at `2477`–2483 do not guard/cancel edit; branch selector at `AppChatApp.vue:480` only checks readiness.
- Exact incomplete loop: `questionEditSession` is one global ref (`logic:765`–769); scope change restores the destination draft but never clears/rebinds that session (`1050`–1065). Normal send remains disabled (`699`), edit submit looks up A's question in B's branch and yields `GENERATION_V2_EDIT_TARGET_STALE` (`7091`–7102). Cancel restores A's prior DB draft and then unconditionally writes its text into the visible draft (`7063`–7077), now showing chat B; attachment refresh loads B but does not synchronize text by default (`4542`–4546). Autosave can persist that foreign text in B. Separately, startup/scope restore reads persisted `draftMode`/`editingSourceQuestionId` (`4823`–4830), but never rebuilds the global session; an edit draft appears as ordinary composer input after restart.
- IPC/backend path: opening edit uses `replaceGenerationV2ComposerDraftFromAnswerSnapshot` (`logic:7045`), renderer `generationV2ComposerClient.ts` → preload composer bridge → `electron/ipc/generationV2ComposerIpc.ts:232`–244, which persists `draftMode:'edit'` and the question ID via `ComposerDraftV2Repo.replace` (`infra/db/repo/composerDraftV2Repo.ts:297`–312). Backend persists mode; UI fails to scope/restore it.
- Minimal direction: **UI + bounded persistence contract**: scope edit session to conversation/branch and explicitly restore or cancel its state on navigation; rehydrate a persisted edit as edit rather than normal compose. Never render/assign a restored prior draft into a different active scope. Whether a prior draft snapshot needs persistence for cancel-after-restart is a product decision.
- Existing tests would **not** catch these cases: current `AppChatApp.regenRetry.test.ts` covers regenerate/retry and branch navigation, but has no edit-resend UI scenario. Composer IPC test covers attachment projection; shared fixtures default to compose mode. No runtime performed; cross-chat cancel/rehydration findings are statically traced.

### MAIN-07 — Conversation switching flushes the old draft into the destination conversation

- Candidate severity/type: **HIGH**, **STATE_PERSISTENCE / BROKEN_CLOSURE**.
- Scenario: chat A has visible unsent text; chat B has its own saved draft. Select B from sidebar (also relevant when entering New from a formal chat).
- Exact incomplete loop: `onSelectConvo` first changes active ID (`logic:2469`). The synchronous scope watcher sees that there was a previous valid scope, but invokes unscoped `flushDraftPersistence` after the active ID has changed (`1050`–1058; `flush:'sync'` at `1065`). The flush reads `getActiveDraftScope()` (`4745`, helper `3657`–3660) and captures still-visible A text (`4746`), fetches B's draft/revision (`4767`–4768), then updates B with A's text/mode (`4769`–4771). Only afterwards does the watcher restore the active draft (`1064`). Source and destination are crossed at the persistence boundary.
- Minimal direction: **UI only** for explicit old-scope draft flushing before navigation or immutable captured-scope writes, plus stale-response guards for restoration. Preserve distinct A/B draft contents; do not infer write scope from current reactive active ID after it changed.
- IPC/backend path: `updateGenerationV2ComposerText` → composer preload → `generationV2ComposerIpc.ts:115`–119 → `ComposerDraftV2Repo.updateText` (`composerDraftV2Repo.ts:201`–212). Backend correctly updates the conversation ID supplied by UI; CAS cannot prevent a correct-revision write to the wrong intended conversation.
- Tests would **not** catch this: targeted source searches found no App test with two conversations, distinct unsent drafts, and navigation/return assertion. Current send/attachment fixtures generally hold one conversation draft. Requires an isolated two-conversation UI/IPC regression test; no runtime performed.
- Deduplication: shares the active-draft authority seam with MAIN-06; fixes should be coordinated, but normal compose navigation and global edit rehydration are distinct scenarios.

## Coverage map (static)

`CLOSED` means a reachable nominal UI→backend path was found; it does not imply complete runtime acceptance or full-project completion.

| Area | UI | Backend/data path | Persistence/recovery | Existing tests inspected | Status |
|---|---|---|---|---|---|
| Initial send, selected route/model | Composer Send → `onSend` / `onSendUnlocked` | Command client → provider IPC/runtime → coordinator → graph/request/snapshot repos | Revision-bound command, draft clear, streaming runtime projection | `AppChatApp.send.test.ts` normal send, stale capability, model switch | CLOSED nominal; error/startup/navigation limits below |
| Streaming/stop while branch changes | Composer stop and branch selector | Runtime cache → abort operation; shared runtime event bridge | Branch-keyed active runtime and terminal refresh | `AppChatApp.regenRetry.test.ts:396` inactive branch/stop | CLOSED nominal; live Electron/provider behavior UNKNOWN |
| Regenerate/retry/candidate selection | Question/answer actions, candidate pager | Provider command client; branch/candidate workspace IPC | Frozen retry binding, sibling answers, navigation revision guards | `AppChatApp.regenRetry.test.ts:249`, `313`, `335`, `427`; candidate tests | CLOSED nominal |
| Edit/resend/cancel/restart | Question edit and edit toolbar | Composer snapshot replacement + provider edit-resend | Persisted edit mode not rehydrated/scoped | IPC attachment projection; no App edit navigation/restart test found | PARTIAL — MAIN-06/07 |
| New template/lifecycle | New, reset template, settings lifecycle controls | System template/lifecycle repo via workspace bridge | Template promotion and preferences persist | `systemChatTemplateClient.test.ts`; graph promotion tests | PARTIAL — default/Inbox authority and empty-root recovery |
| Projects CRUD | Sidebar create/rename/delete | Workspace IPC → graph/workspace repos | DB persistence; delete wording/backend outcome disagree | Workspace quiesce tests, schema cascade tests | PARTIAL — MAIN-01/04 |
| Conversation CRUD/bulk actions | Sidebar menus/selection | Workspace IPC → workspace repo | Active deletion not rebound; draft navigation crosses scopes | Backend deletion tests; no active-delete UI scenario found | PARTIAL — MAIN-02/07 |
| Conversation/branch/transcript pagination | Load More/Earlier buttons | Workspace list/read pages → ConversationReadV2Repo | Cursors/projection leases; request failures have no local retry/busy flow reviewed | `AppChatApp.regenRetry.test.ts:467`, `522` | CLOSED happy path; PARTIAL recovery |
| Branch switch | Visible selector | Read branch and runtime cache | Scoped branch projections | Branch navigation/pagination tests | CLOSED nominal |
| Branch management | No fork/rename/delete controls | All three renderer/IPC/repo actions exist | Backend last-branch/generation safety | Workspace delete tests | MISSING UI — MAIN-03 (overlap 04) |
| Model picker and facts entry | Composer button → picker; Facts Inspector opens settings | Route preference/config IPC and catalog clients | Conversation route preference persists; capability revisions used | Composer/model picker + App selected-model tests | CLOSED entry point; full capability audit delegated to 02 |
| Global loading/error/settings in no-workspace mode | Sidebar remains; main topbar/composer/rail hidden | Startup/bridge can error before active assignment | Stored loadError invisible; no initialization retry UI | No root failure test found | PARTIAL — MAIN-05 |

## Execution paths checked

- Root: `src/App.vue` → `src/ui-app/AppChatApp.vue` → `useAppChatAppLogic`.
- Navigation/CRUD: `ConversationList.vue` → App events → `appChatApp.logic.ts` → `generationV2WorkspaceClient.ts` → `electron/preload.ts:143`–176 → `generationV2WorkspaceIpc.ts` → `ConversationReadV2Repo`, `ConversationWorkspaceV2Repo`, `ConversationGraphV2Repo`, `SystemChatTemplateV2Repo`.
- Send: `ChatAppComposer.vue` → App Send → `logic:6242` / `6842` → `generationV2CommandClient.ts:40` → provider bridge (`electron/preload.ts:48`) → e.g. `openRouterGenerationV2Ipc.ts:109` → `openRouterChatGenerationV2Runtime.ts:76` → `openRouterChatPlainTextInitialSendCoordinatorV2.ts:113`–133 → graph initial turn/snapshot commit and prepared request compiler. Shared runtime subscription returns branch-keyed overlays at `logic:7564`–7579.
- Draft: renderer composer client → composer preload → `generationV2ComposerIpc.ts` → `ComposerDraftV2Repo`.
- Branch transcript: `readGenerationV2Branch` (`logic:2259`) → read-branch IPC → `ConversationReadV2Repo` → branch UI projection/lease checks.

## Additional observations not elevated

- Sidebar mutations/New remain visibly enabled during an active generation, while numerous handlers return immediately on `isRunning`; a user can confirm an action and see a no-op. Evidence: App sidebar disabled at `436`; handler guards at logic `2555`, `2566`, `2629`, `2668`. Candidate MEDIUM UI feedback gap, overlapping errors/interaction workstreams; not independently ranked here.
- Several main-screen summaries/empty states are hardcoded English (`AppChatApp.vue:300`–309, `459`, `539`). Translation/accessibility workstream owns full normalization; no count inflated here.
- Project conversation counts are refreshed by `refreshProjects` only (`logic:2134`–2145); ordinary conversation mutations and first send refresh conversation lists, not counts (`2572`, `2585`, `2599`, `2612`, `6892`). Candidate LOW stale badge state; secondary to the authority/deletion findings.

## Gaps, uncertainty, and boundaries

- Static inspection only. No tests, builds, ABI rebuilds, Electron/UI launch, network requests, real credentials, DB mutations, settings changes, Cloud Rules actions, or destructive actions were performed.
- Source proves reachable call-chain and state-authority mismatches. Exact runtime timing/appearance and browser/native focus behavior are unverified; coordinator can approve isolated regression checks.
- No claims about provider-data acquisition scope, DFC expansion, frozen capability authority decisions, project completion, or merge readiness. Main-flow closeout commits do not erase the specific gaps above.
- Full model/provider/capability audit, file pipeline, settings, diagnostics, i18n/a11y, and architecture residue are covered by peer reports; cross-workstream duplicates are flagged.
- Only this agent's report was edited. Production code and the user's unrelated work were untouched.

## Recommended next files for coordinator cross-check

1. MAIN-01/04: `electron/ipc/generationV2WorkspaceIpc.ts:84`, `infra/db/repo/conversationWorkspaceV2Repo.ts:31`, `infra/db/repo/systemChatTemplateV2Repo.ts:52`, `infra/db/v2/coreConversationSchema.sql:9`, confirmation strings.
2. MAIN-02/06/07: `src/ui-app/app/appChatApp.logic.ts:1050`, `2468`, `2565`, `4743`, `4809`, `7030`, `7061` and `src/ui-app/AppChatApp.vue:430`.
3. MAIN-05: `AppChatApp.vue:456` and mounted initialization at logic `7324`.

## Audit completion

Bounded source mapping complete. Seven candidates reported (five HIGH scenarios plus the distinct HIGH draft-navigation seam and one MEDIUM management reachability gap); severity/deduplication and repair acceptance remain with the coordinator.

Final coordinator severity, ranking and deduplication are recorded in `findings.json`; the candidate severities above preserve the mapper's assessment.
