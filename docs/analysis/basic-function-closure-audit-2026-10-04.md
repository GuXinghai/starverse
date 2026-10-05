# Starverse Basic-Function Closure Audit (2026-10-04)

**Status**: active (audit evidence, point-in-time)
**Document Role**: audit
**Audited revision**: `4ac2de5` (dev line `models-dev-capability-resolution`)
**Mode**: audit-only. No production, test, schema or configuration changes were made.

---

## Verdict

**Is the basic application workflow coherent end-to-end?** Mostly, but not fully.

The core spine is sound. That spine is: startup → workspace → send → stream → persist → stop → retry → restart reconstruction, on a single conversation, with the first-party providers. Persistence is transactional, FK-enforced and single-schema. Streams are routed by operation and branch, not by "current conversation". Stop really stops the main-process request. Deletes quiesce running work before they cascade.

The gaps sit at the edges of the spine:
- conversation switching;
- regenerate and multi-turn history with attachments;
- startup recovery when persisted state is unexpected;
- a band of legacy controls that report success while doing nothing.

**Are there P0/P1 issues that should block further feature development?** There are **no P0 findings**. There are **8 P1 findings**.
- Two of them silently corrupt or substitute user content in ordinary use. These should block feature work until fixed:
  - P1-1: conversation switch overwrites the target conversation's draft.
  - P1-2 and P1-3: what is sent with regenerate or later turns differs from what the user attached.
- The remaining P1s need a fault, race or platform condition to trigger. They should be scheduled immediately, but they need not block all work.

**Repair themes that deserve immediate priority**
1. **Conversation-scope integrity in the renderer orchestration.** This covers the draft flush scope on switch, deleting the active conversation, and writes made after a submit `await` while the user has moved on. See P1-1, P1-4 and P1-5.
2. **Attachment fidelity beyond the first send.** Regenerate must use the question's own attachments. Anthropic and Gemini history must replay prior-turn attachments, or the UI must say that it does not. See P1-2, P1-3, P2-9 and P2-10.
3. **Startup and recovery resilience.** Orphan recovery must be per-operation and clock-tolerant. The Linux reset journal must fail closed instead of wiping data. A corrupt config needs a recovery path, and shutdown should drain streams first. See P1-6, P1-7, P2-6 and P2-15.
4. **Provider completion semantics.** Covers model-alias mismatch on compatible and local endpoints, the hard 5-minute stream deadline, an empty catalog replacing the last-known-good one, and capability refresh after key or catalog changes. See P1-8, P2-1, P2-2 and P2-3.
5. **Remove or re-route dead legacy controls.** These are the `dbBridge` clients, the network-experiment toggles, `strict_ssrf`, the unselectable local modes and the image actions. See P2-4 and P2-5.

---

## 1. Executive Summary

- **Runtime shape (from code):**
  - Electron main: `electron/epoch2MainEntry.ts` → `bootstrapEpoch2ApplicationRuntime` → `electron/mainV2.ts`.
  - There is one Epoch-2 SQLite database at `workspace/epoch-2/starverse.db`. It has 21 schema fragments under `infra/db/v2/`, a digest-verified manifest, and no incremental migrations. A schema mismatch triggers a consent-gated backup-and-recreate.
  - Generation V2 has 9 execution providers, listed in §2.
  - Composer drafts and attachments are DB-backed. Attachment blobs are content-addressed and immutable.
  - Proxy governance is fail-closed.
- **Findings:**
  - **P0:** 0.
  - **P1:** 8, two of them confirmed at runtime or by direct code reading in this audit.
  - **P2:** 17.
  - The "Needs verification" section lists 16 further items.
- **Checks run:**
  - `tsc` and `vue-tsc` are green.
  - The UI suite is green: 509 of 509.
  - Unit has 11 failures and integration has 28. All of them are pre-existing and also failed at `c40fc6e` (Goal 4 baseline).
  - Six repository gates fail. Four of these are pre-existing. **Two regressed on the dev line after `c40fc6e`**: the privacy scan and the model-identity purge. See §9.
- **Unverified here:** the Electron smoke test could not run in the cloud. `rebuild:electron` needs `www.electronjs.org`, which the network policy blocks. It must be run on the owner's Windows PC.

## 2. Audit Scope and Method

**Read first:**
- `AGENTS.md`
- `docs/AGENT_INDEX.md`
- `docs/architecture/CURRENT_SYSTEM_ARCHITECTURE.md`
- `docs/maintenance/maintainer-entry.md`
- the file-pipeline and governance entries

Current behaviour was established from code. Where documentation disagreed with code, the code was taken as fact. The disagreements are noted inline: the phase-4 regenerate contract, and the `dbBridge`-era clients.

**Current runtime provider set** (`electron/ipc/generationV2IpcRegistration.ts:85-145`, `src/shared/provider/generationExecutionProviderId.ts`):

| Execution id | Route(s) | Credentials | Catalog |
|---|---|---|---|
| openrouter | openrouter_chat, openrouter_images | safeStorage IPC | first-party catalog v2 |
| openai_responses | openai_responses | safeStorage IPC | catalog v2 |
| anthropic | anthropic_messages | safeStorage IPC | catalog v2 |
| deepseek | deepseek | safeStorage IPC | catalog v2 |
| google_ai_studio | gemini_generate_content, gemini_interactions_image | safeStorage IPC | catalog v2 |
| openai_compatible | openai_chat_compatible | per-instance credential service | `openAICompatibleCatalogV2Service` |
| lmstudio | lmstudio_openresponses | none (loopback profile) | local management |
| ollama | ollama_chat | none (loopback profile) | local management |
| generic_local | generic_local_openai_chat | none (loopback profile) | none |

No OpenRouter-only preflight or default blocks the other providers. `DEFAULT_OPENROUTER_MODEL_ID` in `appChatApp.logic.ts:5943-5958` is used only for a debug log.

**Method:**
- Each journey was traced from UI → `src/ui-app/app/appChatApp.logic.ts` → `src/next/**` clients → `electron/preload.ts` → `electron/ipc/**` → `electron/services/**` → `infra/db/**` → back to the UI, and then through restart. Parallel read-only tracing was used per area. Every P1 was re-verified directly against the code by the audit owner.
- P1-1 was also confirmed at runtime with a temporary jsdom test that mounted `AppChatApp.vue` against the production-shaped test bridge. The test was deleted afterwards and is not committed.
- Schema cascade and FTS behaviour were checked by loading the `infra/db/v2` fragments into SQLite in a scratch directory.
- No real provider traffic was sent. No profile, database or credentials were touched.

## 3. Fundamental Operation Closure Matrix

| Operation | Status | Basis |
|---|---|---|
| App startup | PARTIALLY CLOSED | The normal path, fresh initialization and schema-mismatch recovery are closed. A single unexpected orphan operation, a clock rollback (P1-6) or a corrupt `config.json` (P2-15) makes startup fail permanently. The Electron smoke is UNVERIFIED in the cloud. |
| Restart / restore | PARTIALLY CLOSED | The last formal conversation and route preference are restored from the DB. The branch and project filter are not restored. Awaiting-tool operations survive restart as `streaming`; see Needs verification. |
| Create conversation | CLOSED | New Chat template → first send materializes the conversation in one transaction. |
| Open / switch conversation | BROKEN | P1-1: the previous draft text overwrites the target's stored draft. P1-5: race with an in-flight submit. |
| Delete conversation | PARTIALLY CLOSED | The DB cascade, FTS cleanup and quiesce are closed. Deleting the *active* conversation leaves a ghost UI (P1-4). |
| Draft preservation | BROKEN | P1-1 (confirmed at runtime), P1-5. |
| Text send | CLOSED | Atomic commit of operation + request + answer, idempotent by operationId, guarded by expected head. Caveat P1-5 for a mid-submit switch. |
| Streaming completion | PARTIALLY CLOSED | Closed for first-party providers. Compatible and local endpoints that alias model ids persist a completed answer as failed (P1-8). A hard 5-minute cap applies to all runners (P2-1). |
| Stop generation | CLOSED | `runtime:abort` → registry AbortController → runner → `cancelled` terminal, partial body persisted. |
| Retry | CLOSED | A new answer root copies the source snapshot, including attachments. |
| Regenerate | PARTIALLY CLOSED | It sends the *current composer draft's* attachments, not the question's own (P1-2). |
| Edit / resend | PARTIALLY CLOSED | Resend sends the snapshot bytes. Cancelling an edit loses the conversion selection and blocks Send (P2-9). |
| Branch switch / continuation | PARTIALLY CLOSED | Switch and continuation are closed. Fork and delete-branch handlers exist but are not wired to any UI (P2-14). |
| Model selection | PARTIALLY CLOSED | It is persisted per conversation in the DB. The capability projection is not refreshed after a key or catalog change (P2-3). |
| Provider selection | PARTIALLY CLOSED | All 9 providers route correctly. LM Studio and Ollama alternative modes are selectable but have no execution path (P2-5). |
| Model catalog refresh / failure | PARTIALLY CLOSED | A failed sync keeps the last-known-good catalog. An empty success replaces it, and the chat-console refresh ignores manual apply mode (P2-2). |
| Attachment add / remove | CLOSED | Conversation-keyed IPC with revision CAS. Detection results are guarded by attempt and revision. |
| Attachment send (first turn) | CLOSED | Every provider encodes each included attachment with a proof or rejects loudly. No silent drop was found at compile time. |
| Attachment send (later turns / regenerate) | BROKEN | P1-2 (regenerate substitution), P1-3 (Anthropic/Gemini history omission). |
| Attachment history restore | PARTIALLY CLOSED | Display, retry and edit-resend are closed. Edit-cancel restore is broken (P2-9). |
| Project / basic organization | PARTIALLY CLOSED | Create, rename, move and delete work. Project settings Save always fails (P2-4). Deleting the active project leaves a ghost UI (P1-4). |
| Search | PARTIALLY CLOSED | Trigger-indexed, with a correct cascade. The modal defaults its scope to the active conversation, content-only search matches titles, and hits on non-default branches do not navigate (P2-7). |
| Settings persistence | PARTIALLY CLOSED | Most settings are V2 preferences or DB. Several visible settings are no-ops or false successes (P2-4, P2-5, P2-16). |
| Proxy / network setting application | CLOSED | All governed egress uses `cloudFetch` plus `assertGovernedRequestAvailable`. Invalid settings block rather than fall back to direct. Local endpoints use a direct, loopback-only partition. The separate network-experiment toggles are ignored (P2-5). |
| Graceful shutdown / recovery | PARTIALLY CLOSED | The DB closes cleanly. In-flight streams are not aborted or drained before close (P2-6). There is no renderer-crash recovery (P2-17). |
| Electron packaged / dev smoke | UNVERIFIED | Blocked in the cloud. It needs the owner's Windows PC. |

## 4. P0 Findings

None. Two candidates were examined and downgraded:
- The Linux reset-journal wipe (P1-7) requires an external deletion of a hidden journal on a non-primary platform.
- Credential exposure was checked and found closed. The renderer receives only masked status. Store IPC blocks credential keys. No key logging was found. Gemini keys are sent in a header and redacted in failures.

## 5. P1 Findings

### P1-1 — Switching conversation writes the old draft into the new conversation and loses the old draft
- **Journey:** type in conversation A, then click conversation B (or New Chat, or a search hit).
- **Locations:**
  - `src/ui-app/app/appChatApp.logic.ts:2468-2470` (`onSelectConvo` sets `activeConvoId` first)
  - `:1050-1065` (sync watcher on `[activeConvoId, activeBranchId]`)
  - `:4743-4790` (`flushDraftPersistence` reads the scope from `getActiveDraftScope()` at `:3657`)
  - `:4809-4830` (`restoreDraftForActiveScope`)
- **Execution path:**
  1. `activeConvoId = B`.
  2. The watcher (flush `'sync'`) calls `flushDraftPersistence()`.
  3. Inside it, `scope = { convoId: B }` but `text = draft.value`, which is still **A's** text. The function also cancels A's pending 250 ms debounce.
  4. `updateGenerationV2ComposerText({ conversationId: B, draftText: A's text })`.
  5. `restoreDraftForActiveScope()` loads B, which now holds A's text.
- **Expected:** A's text is saved to A. B shows its own stored draft.
- **Actual:**
  - B's stored draft is permanently replaced with A's text, and this survives restart.
  - A's last unsaved keystrokes are never persisted.
  - In edit mode, the DB trigger `trg_composer_draft_v2_validate_edit_source_update` (`infra/db/v2/composerDraftSchema.sql:25-35`) rejects the write. The error is swallowed as "non-fatal", so A's edit text is lost.
- **Why the loop is broken:** the flush scope is computed after the scope has already changed. The watcher passes `prevConvoId`, but it is only used as a validity check.
- **Trigger:** any conversation switch with non-empty draft text. This is an ordinary action.
- **Evidence:** a temporary UI test (mocked bridge; A empty, B holding `"B-own-draft"`) typed `typed-in-A` in A and clicked B. Recorded `updateText` calls were `[["c2","typed-in-A"],["c2","typed-in-A"]]`. Final stored drafts were A = `""`, B = `"typed-in-A"`. The textarea showed `typed-in-A`. No existing test covers a draft across a switch.
- **Confidence:** confirmed.
- **Repair boundary:** renderer only. Flush with the *previous* scope and text, either from `prevConvoId` or a captured `lastDraftScopeKey` plus text snapshot, ideally before mutating `activeConvoId`. Add a UI regression test.

### P1-2 — Regenerate sends the current composer draft's attachments instead of the question's own
- **Journey:** send Q1 with `report.pdf`. Later click Regenerate on Q1, with the composer either empty or holding `other.png` for a future message.
- **Locations:**
  - `src/ui-app/app/appChatApp.logic.ts:6970-7007` (`onRegenerateFromQuestion` builds `commandAttachments = projectGenerationV2ComposerAttachments(composerDraft)` from the live draft)
  - `electron/services/openRouterChatPlainTextRegenerateCoordinatorV2.ts:71-80` freezes `command.commandAttachments` into the new answer's command facts and compiles from them. The Anthropic, Gemini, OpenAI Responses, generic local and Ollama regenerate coordinators follow the same pattern.
  - `src/next/generation-v2/providers/openrouter-images/imageActionCommandsV2.test.ts:15` asserts the "current Composer attachment projection" for images.
- **Execution path:** UI draft projection → regenerate IPC → coordinator → command facts → prepared request.
- **Expected:**
  - `docs/file-pipeline/phase-4-message-attachment-semantics.md:103` says "assistant regeneration does not mutate the preceding user message attachments".
  - Retry already copies the source snapshot (`appChatApp.logic.ts:~7250-7270`).
- **Actual:**
  - With an empty composer, the regenerated answer is produced **without** the PDF.
  - With `other.png` in the composer, Q1 is regenerated **with** `other.png`.
  - Regenerate does not clear the draft, so `other.png` is sent again with the next message.
  - The question's attachment strip is drawn from the chosen answer's snapshot, so history now shows a different attachment set for Q1.
- **Why dangerous:** this is a silent substitution or omission of user content.
- **Trigger:** Regenerate on any turn that had attachments, or any Regenerate while the composer holds attachments.
- **Evidence:** static control flow, verified directly. No test covers regenerate with attachments in the UI or the coordinators. `AppChatApp.send.test.ts:490` only uses an empty `commandAttachments`.
- **Confidence:** high.
- **Repair boundary:**
  - Regenerate coordinators load attachment intents from the chosen answer's snapshot inside the authority transaction, as retry does.
  - The renderer stops sending draft attachments for regenerate.
  - Owner decision needed: whether OpenRouter Images intentionally differs. Its test encodes the current behaviour.

### P1-3 — Anthropic and Gemini drop earlier turns' attachments from later requests
- **Journey:** turn 1 sends a PDF or image to Claude or Gemini. Turn 2 asks a follow-up about it.
- **Locations:**
  - `infra/db/repo/anthropicNativeHistoryV2Repo.ts:167-191`: `#completeTurnMessages` rebuilds the prior user message as `content: question.body`, which is text only.
  - `infra/db/repo/geminiGenerateContentNativeHistoryV2Repo.ts:135-155`: `#completeTurnContents` requires the stored user content to be exactly one text part equal to the body.
  - Attachment parts are added only for the current turn, in `geminiGenerateContentPreparedRequestCompilerV2.ts:~226`.
- **Contrast:**
  - OpenRouter replays its native artifact, which includes the attachment parts.
  - OpenAI Responses re-adds `input_file` ids from each snapshot (`openAIResponsesNativeHistoryV2Repo.ts:168-197`).
- **Expected:** prior-turn attachments that the UI shows as part of the conversation context are replayed, or the UI states that they are not.
- **Actual:** turn 2 is compiled with turn 1 as plain text. The model never sees the file again, and the user is not told.
- **Trigger:** any multi-turn conversation with attachments on these two providers.
- **Evidence:** direct code reading. `anthropicNativeHistoryV2Repo.test.ts` uses `attachments: []` only.
- **Confidence:** high.
- **Repair boundary:** the Anthropic and Gemini history repos rebuild each prior user turn from that turn's answer snapshot (file_id or inline data), as the OpenAI Responses history repo does. The alternative is an explicit, user-visible "not carried into context" state.

### P1-4 — Deleting the active conversation (single or bulk), or the project containing it, leaves a ghost conversation
- **Journey:** delete the open conversation from the list, or bulk-delete it, or delete its project.
- **Locations:**
  - `src/ui-app/app/appChatApp.logic.ts:2566-2577` (`onDeleteConvo`)
  - `:2592-2604` (`onBulkDeleteConvos`)
  - `:2650-2665` (`onDeleteProject`)
  - `:2090-2104` (`refreshConvos` picks a new active conversation only when `activeConvoId` is empty)
  - `:2204-2220` (`ensureGenerationV2BranchForConversation` throws `GENERATION_V2_CONVERSATION_BRANCH_MISSING`)
- **Expected:** the UI moves to another conversation or the New Chat template.
- **Actual:**
  - `activeConvoId` still points at the deleted row.
  - The transcript reload throws into `loadError`, and the stale transcript stays visible.
  - Draft flushes fail silently, and Send or Attach fail through `ensureActiveConvo`.
  - After a project delete, no reload happens at all.
  - The DB itself is consistent, and a restart recovers because `last_formal_conversation_id` is `ON DELETE SET NULL`.
- **Trigger:** deleting the conversation you are looking at, which is the most common way to delete.
- **Confidence:** high (static, verified directly). The backend is tested (`generationV2WorkspaceIpc.test.ts`). There is no UI test.
- **Repair boundary:** renderer only. When the active conversation is removed, reset `activeConvoId` and `activeBranchId` to the template (as `onCreateConvo` does) or to the first remaining conversation before reloading.

### P1-5 — Switching conversation while a send, edit-resend or retry submit is in flight wipes the other conversation's draft and leaves a stale view
- **Locations:**
  - `src/ui-app/app/appChatApp.logic.ts:6886-6905` (send)
  - `~7142` (edit-resend)
  - `~7026` and `~7287` (error paths)
  - `src/ui-app/AppChatApp.vue:436` (the list is disabled only by `!isReady || isDraftInteractionLocked`; `isDraftInteractionLocked` at `:692` covers only attachment confirmation)
- **Execution path:**
  - After `await submitGenerationV2Initial(...)`, the code sets `draft.value = <cleared draft of the source conversation>` with no check that `activeConvoId` is still the source. This can take seconds while provider files upload.
  - The draft watcher then persists the empty text into the *currently active* conversation B.
  - `refreshRenderableBranchView(source)` bumps the projection coordinator, so B's in-flight load is discarded. The UI keeps a stale transcript, and the next send fails with `GENERATION_V2_BRANCH_PROJECTION_STALE`.
  - When sending from the New Chat template, `:6889-6890` forcibly sets `activeConvoId` and `activeBranchId` to the new conversation, pulling the user back.
- **Expected:** post-submit draft and view writes are guarded by source identity. The success paths for regenerate and edit already use such a `shouldFollow` guard.
- **Trigger:** a click in the conversation list during a slow submit.
- **Confidence:** high for the mechanism, medium for frequency.
- **Repair boundary:** guard these call sites with `activeConvoId/activeBranchId === source`. Renderer only.

### P1-6 — One unexpected orphan operation, or a clock rollback, permanently prevents startup
- **Locations:**
  - `electron/mainV2.ts:169` calls `recoverGenerationOrphansV2(db)` with no guard, before `registerGenerationV2Ipc`.
  - `electron/services/generationOrphanRecoveryV2.ts:118-260`: a single transaction over all operations; any `invalid()` aborts everything.
  - Monotonic-time guards reject `Date.now()` values older than the persisted ones:
    - `infra/db/repo/generationExecutionV2Repo.ts:477-479`
    - `generationRequestV2Repo.ts:339`
    - `conversationGraphV2Repo.ts:874-877`
  - `electron/epoch2MainEntry.ts:31-35`: `GENERATION_V2_*` codes are reported as `EPOCH2_STARTUP_UNCLASSIFIED`, and the app quits.
- **Execution path:** the app crashes or is killed mid-stream. On relaunch, recovery terminalizes the open attempt or request with `atMs = Date.now()`. If the system clock moved backwards (NTP correction, dual-boot RTC offset), or any operation is in a state the recovery does not anticipate, it throws. Startup fails, and it fails again on every later launch.
- **Expected:** recovery is per-operation and clamps time to `max(now, persisted updated_at)`. The in-session path already does this in `generationOperationRuntimeRegistryV2.ts` `#terminalizeUnhandledRunFailure`. An incoherent operation should be quarantined, not fatal.
- **Actual:** the app cannot start, there is no in-app recovery path, and the error is only a generic code.
- **Evidence:** static, verified directly. `generationOrphanRecoveryV2.test.ts` covers only the awaiting-tool predicates; `recoverGenerationOrphansV2` itself has no test.
- **Confidence:** high (code); medium (trigger frequency).
- **Repair boundary:** `generationOrphanRecoveryV2.ts` plus its call site. Per-operation transactions, time clamping, quarantine or fail-and-log for incoherent rows, and a classified startup code.

### P1-7 — Linux: a missing reset journal silently wipes the whole Epoch-2 workspace and `config.json`
- **Locations:**
  - `electron/data-epoch/epoch2CommittedBootstrap.ts:32-35, 62-70`: a `null` journal counts as "before config replacement".
  - `electron/data-epoch/dataEpochCoordinatorCore.ts:77-151`: a fresh journal is created, `sweepLegacyOwnedTargets` runs, then `commitEpoch2ConfigReplacement` and `clearDefaultSessionData`.
  - `electron/data-epoch/resetInventory.ts:23`: `legacy_workspace = 'workspace'`, which is the live `layout.workspaceRoot` (`rootManifest.ts:97-98`).
  - `electron/data-epoch/posixEpochFilesystemBackend.ts:199-213, 352`: `deleteTree` has no live-epoch guard.
  - Windows contrast: `native/epoch-win32/src/addon.cc:765-767, 1758-1825` (`reject_epoch_2_child` makes Windows throw `EPOCH2_WIN32_DELETE_PROTECTED_DESCENDANT` instead).
- **Expected:** if the journal is missing but `workspace/epoch-2/root-manifest.json` or the DB exists, refuse to start (or back up), and never delete it.
- **Actual:**
  - **Linux** (POSIX backend, selected at `win32EpochRootLease.ts:500-503`): all conversations, assets, plugins and the config with provider credentials are deleted with no prompt and no backup.
  - **Windows:** startup fails permanently with no recovery path. This is safe but bricked.
- **Trigger:** the hidden `.epoch-transition/` folder or its journal file is removed, for example by a cleanup, sync or backup-restore tool, or by the user.
- **Confidence:** high (code). Not reproduced, because doing so would require a destructive run. The `dataEpochCoordinatorCore.test.ts` cases are Windows-only and are skipped on Linux.
- **Repair boundary:** in `runEpoch2ResetThroughConfigReplacement`, fail closed when the journal is `null` and a live epoch marker or DB exists. Alternatively, add a POSIX equivalent of `reject_epoch_2_child`. Add a POSIX test.

### P1-8 — Compatible and local providers persist a fully streamed answer as failed when the response's `model` differs from the requested id
- **Locations:**
  - `electron/services/openAIChatCompatibleStreamRunnerV2.ts:177`
  - `genericLocalOpenAIChatStreamRunnerV2.ts:83`
  - `ollamaChatStreamRunnerV2.ts:281`
  - `lmStudioOpenResponsesStreamRunnerV2.ts:148`
- **Execution path:** the stream completes and the user sees the whole answer. Then `result.model !== preparedRequest.modelId` throws, the catch writes terminal `failed` (`…MODEL_MISMATCH` or `…PROVIDER_FAILED`), and after refresh the answer shows an error.
- **Expected:** a completed answer stays completed, and the returned model is recorded as provenance (or only a mismatch in model *family* is rejected).
- **Trigger:** endpoints that resolve aliases. Examples: dated snapshots for an alias, Azure deployment names, vLLM `served-model-name`, llama.cpp returning a file path, and gateways and proxies.
- **Evidence:** static. `MODEL_MISMATCH` appears in no test.
- **Confidence:** high (code); medium (prevalence by endpoint).
- **Repair boundary:** the completion checks in these 4 runners only.

## 6. P2 Findings

Each item lists its locations, behaviour, confidence and repair boundary.

- **P2-1 — Hard 5-minute wall-clock deadline on every stream.** `DEFAULT_TIMEOUT_MS = 5*60_000` is set once and never reset on data in all 11 runners (e.g. `openRouterChatStreamRunnerV2.ts:27,72`, `anthropicMessagesStreamRunnerV2.ts:33,69`). Nothing overrides it in the runtimes. Long reasoning output or a slow local CPU model that is still streaming is cut off at 5:00 and marked failed with `…_TIMEOUT`. The partial body is kept. *Confirmed.* Repair: make it an idle timeout, optionally with a larger total cap, in the shared abort scope.

- **P2-2 — An empty provider model list replaces the last-known-good catalog, and the chat-console refresh forces automatic apply.**
  - `generationV2ModelAvailabilityIpc.ts:345-406` accepts `items=[]`.
  - `infra/db/repo/modelCatalogV2Repo.ts:309-319` (automatic mode) activates the 0-model snapshot. No first-party source rejects an empty list.
  - Send then fails with `GENERATION_V2_ACTIVE_CATALOG_MISSING` (`activeCatalogModelAuthorityV2Service.ts:128-131`).
  - The console's "Refresh models" (`appChatApp.logic.ts:3398-3422`) omits `applyMode` and `retentionMs`, so main defaults them to `automatic` and `never` (`generationV2ModelAvailabilityIpc.ts:354-355`). The default user setting is `manual` (`catalogSyncSettings.ts:23`). Settings, picker and startup sync pass the policy correctly.
  - *High.* Repair: treat 0 items as failure (or pending) when a non-empty active snapshot exists, and pass the resolved policy from the console refresh.

- **P2-3 — The capability projection is not refreshed after adding a key or syncing a catalog.**
  - The projection re-runs only on route or model change, or after `STALE_CAPABILITY_REVISION` (`appChatApp.logic.ts:6805-6812, 6883`).
  - `settings:providerCredentialUpdated` is only listened to by `ModelPickerDialog.vue:2295`.
  - Send stays enabled, because `composerCanSend` at `:696-704` does not check the projection. Send then throws `GENERATION_V2_CAPABILITY_PROJECTION_REQUIRED` (`:6822`), shown as a raw code, until the user switches conversation or model.
  - *High.* Repair: refresh on credential and catalog events, and map these codes to user-facing messages and a disabled Send.

- **P2-4 — Legacy `dbBridge` clients still back visible controls.** `electron/preload.ts` no longer exposes `dbBridge`, but:
  - Project settings **Save** (`appChatApp.logic.ts:5655-5679` → `src/next/project/projectClient.ts:63-77`) always throws `Missing dbBridge`.
  - `refreshProjects` (`:2127-2134`) never loads project `meta`, so project-level web-search and generation defaults are never applied.
  - The OpenRouter **require_parameters** toggle (`SettingsPanel.vue:1293, 1388, 2282-2295` → `openRouterProviderSettingsClient.ts:15-27`): get returns `false` and set silently returns. The panel then shows "Saved". No V2 compiler reads the key anyway; only legacy `src/next/openrouter/buildRequest.ts:382` does.
  - Lazy error-envelope hydration (`appChatApp.logic.ts:1637` → `messageClient.ts:511-513`) returns an empty map. See Needs verification.
  - *Confirmed.* Repair: route these to V2 workspace or config channels, or remove the controls.

- **P2-5 — Visible settings and modes that have no execution path.**
  - Network-experiment toggles (HTTP/2, QUIC, keep-alive, force HTTP/1, stream-in-main; `SettingsPanel.vue:3184-3280` → `netExpClient.ts:105-121`) are stored, but nothing in `electron/` reads them. Only the allowlist at `configSchema.ts:101-107` mentions them.
  - Compatible-provider `strict_ssrf` is offered (`CompatibleProviderSettingsPanel.vue:589`) and accepted by IPC, but `openAICompatibleNetworkV2.ts:8` always throws `compatible_strict_ssrf_unavailable`, so catalog, test and send all fail.
  - LM Studio "Native REST" and `/v1/chat/completions`, and Ollama OpenAI-compatible and `/api/generate`, are selectable in `ChatSessionConsole.vue:1717-1977`. Send throws `…_NOT_SELECTED` (`appChatApp.logic.ts:6602-6609`) with no i18n text.
  - *Confirmed.* Repair: hide or disable these until they are implemented.

- **P2-6 — Quitting during a stream does not abort or drain before the DB closes.**
  - The `before-quit` handler at `electron/mainV2.ts:226-244` closes the raw store, refresh services and the DB, then calls `app.exit(0)`.
  - It does not abort registry operations, stop file-type detection or the materialization scheduler, or wait for plugin installs.
  - Late stream callbacks hit a closed DB. There is no `unhandledRejection` handler.
  - The answer is recorded as `failed / stream_interrupted` on the next start instead of `cancelled`.
  - *High.* Repair: abort all registry entries and wait a bounded drain in `before-quit`.

- **P2-7 — Search scope and navigation.**
  - `SearchModal.vue:38-51` defaults `convoId` to the active conversation and never resets it. At default startup this is the hidden New Chat template, so searches return nothing until "Advanced" is changed. The filter also persists across re-opens, including for deleted conversations.
  - Message FTS rows index the conversation title (`infra/db/v2/searchSchema.sql:56-89`), and `MATCH` searches all columns (`generationV2SearchRepo.ts:118-132`). A content-only search therefore returns every message of a conversation whose *title* matches. Confirmed with SQLite.
  - `onSelectSearchHit` → `focusMessageAfterSearch` (`appChatApp.logic.ts:2719-2733, 2990-3012`) does not resolve the message's branch or page. Hits on other branches, older turns or non-chosen candidates land at the top with no feedback. `navigateToBranchMessage` (`:2494-2552`) already pages correctly.
  - *High.*

- **P2-8 — A quiesce race leaves a committed operation with no runner.** The coordinator commits the operation and the streaming answer first. Then `registry.start` → `register()` throws `…_QUIESCING` (`generationOperationRuntimeRegistryV2.ts:131-145`). The IPC returns `ok:false`, but the DB keeps a `streaming` answer with no registry entry, so Stop is a no-op until restart. Trigger: a send overlapping a branch truncate or delete, or a conversation or project delete. *Medium.* Repair: check quiescing before commit, or terminalize on start failure.

- **P2-9 — Cancelling a question edit loses the attachment's conversion choice and blocks Send.**
  - `appChatApp.logic.ts:7061-7073` restores the previous draft through the *send projection*, which carries the derived asset with `sendAs:'inline_text'`.
  - `ComposerDraftV2Repo.replace` (`composerDraftV2Repo.ts:~274`) drops the stored conversion selections.
  - Derived assets have no detection row at the draft revision (`:160`), so the UI shows `GENERATION_V2_FILE_DETECTION_REQUIRED` (`logic.ts:677-686`) and retry-detection fails. The backend checks the parent's detection (`attachmentAssetV2Repo.ts:1092-1096`).
  - Opening Edit on a question that sent a converted file shows the same state.
  - *High.* Repair: restore from the stored draft rows, and let the read model fall back to the parent's detection.

- **P2-10 — Gemini tool continuation fails on a turn that has attachments.** For `requestSequence ≥ 2`, the last user content is a `functionResponse`. The compiler finds no text part and throws `GENERATION_V2_GEMINI_COMPILER_AUTHORITY_INVALID` (`geminiGenerateContentPreparedRequestCompilerV2.ts:177-182`). *Medium-high.*

- **P2-11 — A converted-text option shows ready, then fails at Send after a model switch.**
  - Text conversion options are offered for OpenRouter chat, and stored as `text/markdown` (`generationV2DfcService.ts:141`).
  - After switching to Anthropic, the send fails because Anthropic requires `text/plain` (`anthropicMessagesPreparedRequestCompilerV2.ts:223,234`).
  - After switching to OpenAI Responses, the send fails because it rejects `inline_text` and local `image_reference` (`openAIResponsesAttachmentPreflightV2.ts:58-61`).
  - The send gate is reset on model switch rather than rechecked (`logic.ts:~4630`). The failure is loud, not silent. *High.*
  - **Closed (P2-11).** A provider/operation change now re-fetches backend DFC options for included converted selections, and Send is gated on the backend `decision`/option diagnostics for the current route (stale DTOs block until revalidated). The selected option and derived asset are untouched. Authority: `generationV2DfcService.ensureOptions` via `dfcSelectedOptionBlockingReason` in `appChatApp.logic.ts`.

- **P2-12 — Bulk delete or move is not atomic, and partial failure leaves the list stale.** `Promise.all` is used at `appChatApp.logic.ts:2597, 2611`. If one call rejects, the refresh and reload are skipped while the other items are already deleted or moved. *High.* Repair: use `allSettled`, always refresh, and report the failures.

- **P2-13 — Workspace controls are silent no-ops during generation.** The handlers return early on `isRunning` (`appChatApp.logic.ts:2554, 2567, 2581, 2629, 2641, 2651, 2668`), but the list's `:disabled` (`AppChatApp.vue:436`) does not include it. Confirm dialogs close and nothing happens. *High.*

- **P2-14 — Fork and delete-branch have no UI.** `onForkFromHead` and `onDeleteActiveBranch` (`appChatApp.logic.ts:6908-6941`) are exported, but no `.vue` file references them. Branch rename is also not wired. *Confirmed.* Whether this is intended is an owner decision.

- **P2-15 — A corrupt `config.json` causes a permanent startup failure with no recovery offer.** `electron/bootstrap/epoch2ApplicationRuntime.ts:140` sets `clearInvalidConfig: false`, so electron-store throws, and every launch reports `EPOCH2_STARTUP_UNCLASSIFIED`. Nothing is destroyed, which is good, but unlike the schema path no backup-and-reset is offered. *Medium* (the throw comes from the library).

- **P2-16 — UI-preference writes lose updates and ignore failure.** `src/next/generation-v2/renderer/uiPreferenceStoreV2.ts:36-43` does a read-modify-write of the whole `generationV2UiPreferences` object over two async IPC calls. Concurrent settings clients overwrite each other's keys. `store-set` returning `false` (`electron/ipc/storeIpc.ts:98-101`) is ignored, and the function returns `true`. *Medium-high.*

- **P2-17 — No renderer-crash recovery.** There is no `render-process-gone` or `did-fail-load` handling in `electron/windows/mainWindow.ts` or `mainWindowLifecycle.ts`. A renderer crash leaves a blank window until the app restarts. *High.*

- **Also P2: a privacy regression in committed docs.** `docs/analysis/models-dev-capability-resolution/cloud-rules-v1-research/evidence/openrouter-validation.json:53` (added in `ca2d9bd`) contains a local Windows user-profile temp directory path that includes the account name. `npm run gate:privacy` now fails on it; it passed at `c40fc6e`. No credential is involved. *Confirmed.* Repair: sanitize the path in that evidence file.

## 7. Cross-Cutting Failure Patterns

1. **Scope captured after it changed.**
   - Renderer async flows read "the active conversation" or `draft.value` *after* an `await` or a navigation mutation, instead of capturing the source scope up front.
   - This is the root of P1-1, P1-5 and P2-12.
   - The regenerate and edit success paths already use the correct `shouldFollow` pattern. It should become the rule for every post-`await` write in `appChatApp.logic.ts`.
2. **Current-turn-only attachment thinking.** Attachments are handled rigorously for the *current* request, with proofs, fail-closed compilers and an immutable blob store. They are not handled consistently for regenerate and history replay (P1-2, P1-3, P2-10). Snapshot facts exist; not every path reads them.
3. **All-or-nothing startup gates with unclassified codes.** Orphan recovery, config load and the reset journal all fail closed, which is correct for data safety. None of them offers the consent-gated recovery that schema mismatch already has (P1-6, P1-7, P2-15).
4. **Legacy surface still visible.** The `dbBridge` clients, the network-experiment toggles, the five image-action preload APIs with no main handler (`preload.ts:389-409`), and modes or policies that always throw. These produce false "Saved" states or raw error codes (P2-4, P2-5).
5. **Strict equality where providers are lenient.** Model-id equality (P1-8) and a hard total timeout (P2-1) treat normal provider variance as failure.
6. **Raw internal codes as user errors.** `GENERATION_V2_*` codes reach `loadError` in several reachable paths without i18n mapping (P2-3, P2-5, P1-4).

## 8. Needs Verification

- **Awaiting-tool operations.** Recovery intentionally keeps them `streaming` (`generationOrphanRecoveryV2.ts:150-226`). The renderer never calls `continueTool`, and Stop returns `aborted:false` once the run settles. The branch would stay locked across restarts. The UI always sends `tools: {mode:'disabled'}` (`appChatApp.logic.ts:6385`). Gemini and Anthropic reject tool calls in that mode, but the OpenRouter, DeepSeek, OpenAI Responses and LM Studio runners have no such guard. The trigger is unproven.
- **Retry after an API-key change.** It requires the snapshot's `credentialScopeId` to equal the current scope (`openRouterChatPlainTextRetryCoordinatorV2.ts:76-79`), and every key save creates a new scope, so the result is `RETRY_TARGET_INVALID` with no hint. This is probably by design.
- **Provider file ids.** OpenAI Responses and Anthropic history and retry reuse old provider file ids. After a key change or provider-side deletion, later turns may 404 with no re-upload path.
- **Draft clear after a successful send.** It uses `expectedRevision` captured before the submit `await` (`appChatApp.logic.ts:6896`). A conflict is only logged, so attachments could be re-sent with the next message.
- **DOCX→PDF in-flight dedupe.** There is none (HTML has `htmlPdfInFlight`). The preview and send revision could differ, with the same source but different bytes.
- **Import size limits.** URL import reads the full body before its 50 MB check (`generationV2ComposerIpc.ts:179-181`). Local import has no size limit.
- **Main-process memory.** Registry entries are never evicted (`generationOperationRuntimeRegistryV2.ts:91`). `sender.once('destroyed')` accumulates on every renderer reload (`generationOperationRuntimeV2Ipc.ts:45`).
- **Long reasoning.** Reasoning rows are written per stream read with `MAX_DETAILS = 65_536` (`answerReasoningProjectionV2Repo.ts:9`). Exceeding it fails the generation, and the renderer cost is O(n²).
- **Attachment storage reclamation.** Assets and blobs have abort-on-delete triggers (`attachmentAssetSchema.sql:174-209`) and are never reclaimed after a conversation delete. This is probably intentional immutability. Owner decision on GC.
- **Draft flush on quit.** `void flushDraftPersistence()` on `beforeunload` (`appChatApp.logic.ts:1326`) is best-effort.
- **Restore on startup.** `restore_last_formal` restores the conversation but not the last branch or `activeProjectId` (`appChatApp.logic.ts:~7357`).
- **`store-clear-safe`.** `backupConfig` uses `require('fs')` in an ESM main bundle (`configSchema.ts:427`). It is unused by the renderer. Check the built output.
- **Epoch-1 data.** The first Epoch-2 launch deletes legacy `chat.db`, assets and config backups by design. No owner-decision record was found in `docs/`.
- **Blocked proxy state.** `defaultSession` keeps Electron's default proxy for any non-governed consumer, such as the in-app browser. Not traced.
- **LM Studio and generic local.** They persist the completed body from assembled items, not the streamed text, so the post-refresh body could differ.
- **macOS.** A DMG target is configured, but `acquireEpochRootLease` throws `EPOCH2_WIN32_NATIVE_REQUIRED` on `darwin` (`win32EpochRootLease.ts:500-502`), so a macOS build cannot start. The README already says that non-Windows targets are not validated.

## 9. Existing Tests/Gates Run and Results

Environment: Ubuntu 24.04, Node 22.22.0, `npm ci` (its postinstall runs `npm run rebuild:node`).

| Command | Result |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | PASS |
| `npx vue-tsc --noEmit` | PASS |
| `npm run test:unit` | 2712 passed, 11 failed. All pre-existing; the counts match the Goal 4 closeout baseline, which reproduced them at `c40fc6e`. They are 6 known stale expectations (DeepSeek stable policy ×1, Gemini Interactions image ×5) plus Windows/CRLF-only tests (`externalProcessPolicy` ×3, provider-contract evidence bytes ×2). |
| `npm run test:integration` | 1105 passed, 28 failed, 102 skipped. All pre-existing (same baseline). They are `openAIChatCompatibleGenerationV2Coordinator.test:79` (stale), Windows/CRLF/path-only tests (logSanitizer, productIdentity, DFC LibreOffice, engine plugin lifecycle), and 2 suites that need the Electron binary (`generationV2ModelAvailabilityIpc`, `electronConversionService`). |
| `npm run test:ui` | 509 / 509 PASS |
| `gate:generation-v2-goal3-authority` | PASS |
| `gate:generation-v2-zero-residual` | PASS |
| `gate:network-egress` | PASS |
| `gate:docs` | PASS |
| `gate:privacy` | **FAIL, regression since `c40fc6e`.** A local user-profile path in the committed evidence JSON; see the privacy item in §6. |
| `gate:model-identity-purge` | **FAIL, regression since `c40fc6e`.** `src/shared/model-facts/cloudRulesPresentation.ts` (added in `4ac2de5`) uses `nativeModelId` outside the allowlist. This is a gate allowlist or design question, not a runtime defect. |
| `tc17`, `tc18`, `tc16`, `b_gate` | FAIL. Pre-existing; they fail identically at `c40fc6e`. The causes are legacy relative-import rules, a missing SSOT doc path, and a missing baseline count. |
| Temporary UI diagnostic for P1-1 | Confirmed the defect. The file was deleted and not committed. |
| Electron smoke (`test:electron-smoke`, `electron:dev`) | NOT RUN. `rebuild:electron` needs `www.electronjs.org`, which the cloud network policy blocks. Run it on the owner's Windows PC. |
| Real-provider smoke | NOT RUN, by policy (no billable or uncontrolled traffic). |

ABI report:
- better-sqlite3 ABI mismatch encountered: no.
- Rebuild command run: `npm run rebuild:node` (via the `npm ci` postinstall).
- Current ABI target after the task: node.
- Tests retried after rebuild: none needed.
- Electron smoke retried after rebuild: no (blocked).
- No native artifacts committed: confirmed.

## 10. Recommended Repair Order

1. **Renderer conversation-scope integrity** (P1-1, P1-4, P1-5, then P2-12 and P2-13). This is a small, renderer-only change in `appChatApp.logic.ts`. It has the highest user-data impact and the lowest risk. Add UI regression tests for switch-with-draft, delete-active and switch-during-submit.
2. **Attachment fidelity beyond the first send** (P1-2, P1-3, then P2-9, P2-10 and P2-11). The regenerate coordinators read the snapshot. The Anthropic and Gemini history repos replay prior-turn attachment blocks. Owner decision needed on the OpenRouter Images regenerate semantics.
3. **Startup and recovery resilience** (P1-6, P1-7, then P2-6, P2-15 and P2-17). Per-operation, clock-tolerant orphan recovery. A POSIX live-epoch guard for the reset sweep. A config-corruption recovery path. A drain on quit.
4. **Provider completion semantics** (P1-8, then P2-1, P2-2 and P2-3). Model-alias tolerance, an idle timeout, empty-catalog LKG protection with a policy-respecting console refresh, and capability refresh on credential or catalog events.
5. **Legacy and no-op surface cleanup** (P2-4, P2-5, P2-14, P2-16, the dead image-action preload APIs, and the two regressed gates). Route or remove each control so that no visible control reports success without effect.

## 11. Areas Audited With No Material Defects Found

- **Schema and migrations.** There is a single fresh-schema path inside one `BEGIN IMMEDIATE`, verified by manifest digest, with read-only post-commit verification (`freshEpochDatabaseInitializer.ts:294-396`). There are no divergent upgrade paths. Schema-mismatch recovery is consent-gated and moves the DB plus sidecars into a timestamped backup (`schemaMismatchRecovery.ts:145-187`). It leaves config and credentials untouched.
- **FK integrity.** `foreign_keys=ON` is asserted on the live connection (`epoch2CommittedBootstrap.ts:118-121`) and in every authority transaction.
- **Delete cascades.** A conversation or project delete removes messages, bodies, branches, drafts, config, route preference, operations and FTS rows (simulated in SQLite). Deletes quiesce, abort and drain running operations first (`generationOperationRuntimeRegistryV2.ts:131-139, 293-312`). Tests: `generationV2WorkspaceIpc.test.ts`, `generationOperationRuntimeRegistryV2.test.ts:329-441`.
- **Generation transactions.** Create, prepare and terminal steps are atomic. Body checkpoints are compare-and-set guarded on `status='streaming'`. Every runner's error path writes exactly one terminal transaction. Duplicate sends are prevented by the orchestration lock, `expectedHeadMessageId` and operationId idempotency.
- **Stream routing.** Events are routed by operation and branch binding, with sequence-gap recovery and hydrate-then-replay on renderer reload (`generationV2CommandClient.ts:101-165`). No path was found where a stream writes to the wrong conversation.
- **Stop.** A real main-process abort, with the partial body persisted and a `cancelled` terminal.
- **Attachment identity.**
  - Blobs are content-addressed and sha256-rechecked on read (`epoch2AttachmentBlobStoreV2.ts:71-83`).
  - Attachment intents are frozen into the answer snapshot in the same transaction as the graph commit.
  - Detection is enforced in the backend regardless of the UI.
  - Compile-time attachment handling never silently drops: every provider encodes with a proof or rejects loudly.
  - Preview and send revisions match.
  - Composer IPC is keyed by conversationId with revision CAS. Late detection results are guarded by attempt and revision.
- **Credentials.** safeStorage, masked status only, store IPC blocks credential keys, no key logging, and Gemini uses a header with redaction.
- **Proxy.** All governed egress (generation, catalog, models.dev, cloud rules, URL import, conversion and plugin downloads) goes through `cloudFetch` with a fail-closed guard. Failed updates roll back. `strictSSL=false` is rejected. Local endpoints are loopback-only on a direct partition.
- **IPC surface parity.** Of 253 preload channels, all have main handlers except the 5 legacy image-action channels (`preload.ts:389-409`). All 11 generation routes expose matching initial, retry, regenerate, edit-resend and abort handlers.
- **Startup ordering.** Every `registerInvoke` call happens before `createWindow`. A second-instance activation during startup is buffered. A proxy apply failure blocks governed requests and lets startup continue.
