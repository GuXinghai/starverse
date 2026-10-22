# Static Review — Phase 6a: Frontend (Settings, Model Picker, Sidebar, Search, Startup)

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

This is a read-only static review of branch `codex/basic-operation-exploration-8q02ix` at `f273eb9`. The application source matches baseline `aec217cd`.

- No application code was modified.
- No tests, builds or rebuilds were run.
- The app was not launched, and no network or provider requests were made.

Phase 6 (frontend, per the Phase 0 coverage map) is split into two subphases:
- **6a** (this report): settings surfaces, model picker, conversation list and project sidebar, search, and workspace startup.
- **6b** (not started): message rendering, the `src/ui-kit` rich text pipeline, `ChatSessionConsole`, `ChatAppComposer`, the reasoning panels, `AppChatApp.vue`, and i18n.

## 1. Scope and coverage

| Area | Files | Depth |
|---|---|---|
| Settings | `SettingsPanel.vue` (3270 lines), `SettingsModal.vue`, `compatible/CompatibleProviderSettingsPanel.vue`, `NetworkProxySettingsPanel.vue`, `PluginManagementPanel.vue`, `EnginePluginSettingsPanel.vue`, `CapabilityRules{Overview,User}Panel.vue`, `ModelFactsSourcePrioritySettingsPanel.vue`, `GenerationParamsSettingsEditor.vue`, `WebSearchSettingsEditor.vue`, image settings editors, `SearchSettingsSection.vue`; `useSettingsBindings.ts`, `useExperimentalProviderChatSettings.ts`, `conversationConfigUpdateQueue.ts` | Script logic is full. About 1,500 lines of the `SettingsPanel.vue` template were only grepped. |
| Model picker | `ModelPickerDialog.vue` (3445 lines), `providerModelPickerViewModel.ts`, `generationV2RouteSelection.ts`, `providerCatalogStartupSyncV2.ts`, `ModelFactsInspectorPanel.vue`, `catalogRuntimeStoreV2.ts` | Script logic and list rows only. The template after about line 2420, the drag-and-drop ordering and `useVirtualWindow` were not reviewed. |
| Sidebar and list | `ConversationList.vue`, `ChatWorkspaceShell.vue`, conversation and project handlers in `appChatApp.logic.ts` (targeted) | Full for the mutation paths. |
| Search | `SearchModal.vue`, `SearchResultList.vue`, `SearchPaginator.vue`, `searchResultSession.ts`, `infra/db/repo/generationV2SearchRepo.ts` (query building) | Full, except `searchPagination.ts` boundary arithmetic. |
| Startup | `workspaceStartupController.ts`, `WorkspaceStartupRecovery.vue` | Full |

**Not covered (open):**
- The main-side handlers behind `networkProxy`, catalog `sync` / `applyPending` / `status`, and the credential bridges. The realism of the P6a-07 trigger depends on them.
- `ModelDetailPanel.vue`, `modelFactControlExplanations.ts`, `modelIndicatorName.ts` and `WorkspaceIcon.vue`, beyond grepping for listeners and `v-html`.
- The lower half of `EndpointDetailPanel.vue`.
- Whether `normalizeOpenAIImageGenerationUserSettings` drops invalid custom sizes.
- The `AppChatApp.vue` wiring of `mutationDisabled`.
- Tests.

**Dead code:**
- `ProjectSidebar.vue` has no importer. `ConversationList.vue` renders the projects.
- `EnginePluginSettingsPanel.vue` is not mounted; `SettingsPanel.vue:3225` mounts only `PluginManagementPanel`.

## 2. Subagent configuration and contributions

Two read-only `Explore` subagents ran concurrently, configured as `model: sonnet` and `effort: high`. The exact "Sonnet 5.5" version cannot be confirmed. Neither spawned agents nor wrote files.

- **6A-A** (settings surfaces) returned 12 candidates.
- **6A-B** (picker, sidebar, search, startup) returned 9 candidates.

The coordinator verified these from source:
- `NetworkProxySettingsPanel.vue:11, 41-50, 53-55` (`saved` starts as `''`; a failed mount load leaves it empty).
- `SettingsPanel.vue:1337-1406` (sequential save, with events dispatched only at the end), `:1852-1857` and `:2618` (probe result preferred, with no reset when the URL changes), and `:3045-3049`.
- `GenerationParamsSettingsEditor.vue:145-151` (no rows without a capability projection).
- `CompatibleProviderSettingsPanel.vue:126-185` (`choose()` fires unsequenced loads), `:252-266`, `:452-501` (`Number()` with no catch), and `:553-559` (instance rows are not disabled while busy).
- `ConversationList.vue:44, 94-121, 154-192` (the selection is cleared only by the selection-mode toggle and after confirm; `onSelectProject` does not clear it).
- `generationV2SearchRepo.ts:65-77, 190-194`.
- `ModelPickerDialog.vue:1516-1545` (one shared `querySeq`) and `:2154-2172`.
- `appChatApp.logic.ts:2662-2673` and `:3845-3890`.

## 3. Findings by severity

There are no High findings. No credential leak was found in the renderer. Final IDs are P6a-NN, with subagent IDs in brackets.

### Medium

#### P6a-01 — Bulk delete and move include conversations that are no longer visible [6A-B-1]
- **Severity:** Medium. It is an irreversible deletion of conversations the user cannot see. The confirm dialog shows only a count.
- **Status:** Statically confirmed.
- **Where:**
  - `src/ui-app/components/ConversationList.vue:44, 66`: `selectedIds` and `selectedIdsArray`.
  - `:495, :504`: bulk Move and Delete use `selectedIdsArray`.
  - The set is cleared only by `setSelectionMode` (`:94-96`) and after a confirm (`:168, :185`).
  - `onSelectProject` (`:188-191`) does not clear it, and nothing intersects it with `props.items` when the list changes.
- **Trigger:**
  1. Enter Select mode and tick rows in project A.
  2. Switch the project filter, or let the list refresh.
  3. Delete or move the "selected" rows.
- **Impact:** Hidden conversations from project A are deleted or moved. "Selected N" and the select-all checkbox state (`:107-121`, `size === items.length`) are also wrong.
- **Counterevidence:**
  - There is a delete confirm.
  - Cancel and Done clear the selection.
  - The user has to keep Select mode on across the filter change.
- **Repair direction:** Prune `selectedIds` to the current `items` in a watcher, or clear it on a project switch. List the titles in the delete confirm.
- **Verify:** A component test that selects, switches project, and checks the bulk delete payload.

#### P6a-02 — A failed proxy load lets a global Save overwrite the stored proxy configuration with defaults [6A-A-1]
- **Severity:** Medium. A user's manual or environment proxy can be silently replaced by `system`. In a network that needs the proxy, that cuts off provider access, and the user may not connect it to the settings save.
- **Status:** Statically confirmed. The trigger needs `getProxyConfiguration()` to reject at mount.
- **Where:**
  - `src/ui-app/components/NetworkProxySettingsPanel.vue:10-11`: the defaults, and `saved = ''`.
  - `:41-50`: the mount `catch` sets `error`, and `finally` clears `loading`.
  - `:53-55`: `save()` compares against `''` and passes the `busy` check.
  - Called unconditionally from `SettingsPanel.vue:1362`.
- **Impact:** `saveProxyConfiguration(defaults)` is persisted and applied. The error banner stays visible but does not block saving.
- **Repair direction:** Track a `loaded` flag. Make `save()` a no-op until a successful load, and disable the proxy controls while `error` is set.

### Low-Medium

| ID | Finding | Status | Where | Repair direction |
|---|---|---|---|---|
| P6a-03 [6A-A-2] | The global Save is a non-atomic chain of about 12 writes, with the fallible proxy apply in the middle. The `settings:*Updated` events fire only after every write succeeds. A mid-chain failure leaves earlier writes persisted but unannounced, so live consumers (`appChatApp.logic.ts:8379-8384`) keep old values until reload, and the user sees one error with no indication of what saved. | Confirmed | `SettingsPanel.vue:1337-1406` | Validate first, put the proxy step last, and dispatch per successful step or report partial success |
| P6a-04 [6A-A-3] | "Save endpoint" can persist a stale probe. `safeLocalEndpointChatUrlForStorage` prefers the last probe's `safeBaseUrl` over the current input, and nothing resets the probe result when the URL changes. Probe A, edit to B, save, and A is stored and broadcast while the field shows B. The invalid-URL fallback (`:1866`) stores the raw string, which may include userinfo. | Confirmed | `SettingsPanel.vue:1852-1868, 1887-1891, 2618` | Reset the probe result on input; never store an unparsed raw value |
| P6a-05 [6A-A-4, 6A-A-5] | Compatible-provider panel races and silent failures. `choose()` fires `loadModels()` / `loadDiscovery()` with no selection check, so rapid switching shows A's models under B, and later accept/remove actions act on B with A's data. The instance rows are not disabled while `busy`. `save()` reads `authMode` / `secret` / `customSecretHeaders` after an `await`, so a selection change mid-save can save `credential: null` for the original provider. A `basic` username-only edit is silently dropped. `testConnection`, `removeCredential`, `ignoreDiscovery`, `acceptDiscovery` (an unguarded `JSON.parse`), `addManualModel` and `removeManualModel` have no catch, so failures become unhandled rejections with no UI feedback. `addManualModel` sends `Number(value)` (NaN, negative or fractional) for context and output limits, and main rejects it invisibly. | Confirmed | `compatible/CompatibleProviderSettingsPanel.vue:126-185, 252-266, 302-321, 381-432, 452-507, 553-559` | Snapshot the form before the first await; check a selection token before assigning; disable rows while busy; catch into `error`; validate the numbers |
| P6a-06 [6A-A-6] | Global generation-param defaults are invisible and uneditable. Settings mounts `GenerationParamsSettingsEditor` without a `capabilityProjection`, and `visibleSpecs` returns `false` for every spec when it is absent. Only "reset" works, while persisted defaults still feed request resolution (`appChatApp.logic.ts:6150, 6203, 6217, 6948`). | Confirmed (UI); runtime effect inferred | `SettingsPanel.vue:3045-3049`; `GenerationParamsSettingsEditor.vue:145-151` | Render raw per-key controls for the global scope, or a read-only list with a clear action |
| P6a-07 [6A-B-2, 6A-B-3] | Catalog query sequencing in the model picker. One `querySeq` serves both all-provider and single-provider fetches, so a background single-provider refresh discards an in-flight all-provider query. The other providers then keep rows from the previous query, and catalog rows bypass the client text filter, so the list does not match the search box. The dropped providers' runtime-store routes stay `loading`. Separately, sync and apply-pending mutation tokens are invalidated by any authority bump, so a sync started at open is discarded when the user types: the "syncing" snapshot never resolves and Apply/Discard appear to do nothing. `applyLatestCatalogList` / `keepCurrentCatalogList` have no catch. | Confirmed logic; trigger timing realistic but main-side not traced | `ModelPickerDialog.vue:1516-1545, 1595-1623, 1776, 1834-1877, 2017`; `catalogRuntimeStoreV2.ts` (`isCurrent`, `beginQuery`) | Per-provider sequences; do not let a partial fetch supersede a full one; key mutation tokens on the mutation request only |
| P6a-08 [6A-B-4; adjacent to P2b-11] | Fuzzy search with FTS5 keywords returns "no results". Fuzzy mode emits `token*` joined by `AND`, and neither the primary nor the fallback builder quotes tokens or removes `AND` / `OR` / `NOT` / `NEAR`. Both queries fail and `query()` returns `EMPTY_PAGE` with no error. It is not an injection: the query is bound. | Code confirmed; FTS5 parse behaviour from reference knowledge | `infra/db/repo/generationV2SearchRepo.ts:65-77, 190-194` | Quote each token (`"tok"*`); surface query errors distinctly from empty results |
| P6a-09 [6A-B-5] | Selecting a missing conversation or project leaves dangling active state. `onSelectConvo` sets `activeConvoId` and clears `activeBranchId` before loading, and a missing branch throws with no rollback, so the old transcript stays on screen under the dead id. `onSelectSearchHit` has the same ordering. Its project branch selects a deleted project without an existence check and returns true. Reachable from stale search results or a delete in another window path. | Confirmed | `appChatApp.logic.ts:2662-2673, 2861, 3308`; branch-missing throw at `:2620` | Restore the previous ids on failure; validate projects against `projects.value` |

### Low

| ID | Finding | Status | Where |
|---|---|---|---|
| P6a-10 [6A-A-8] | Composer toggles build their patch from the pre-queue `activeSessionConfig`. For example, the web-search enable patch carries `level: current.level`, so a second toggle inside one IPC round-trip overwrites the first change with a stale field. | Confirmed | `appChatApp.logic.ts:3845-3850, 3877-3950` |
| P6a-11 [6A-A-7] | When capability data is unknown, generation-param numbers have no lower bounds. `temperature=-5`, `maxOutputTokens=-1` and `topK=0` persist and fail later at send time. | Suspected | `GenerationParamsSettingsEditor.vue:112-127`; `next/generation-params/generationParamValidation.ts:31-48` |
| P6a-12 [6A-A-9] | Plugin panel polling: the 1.5 s interval starts `loadData` even with one in flight, and nothing sequences the responses, so a pre-action response can land after the post-action reload and show stale state. | Confirmed | `PluginManagementPanel.vue:126-204, 303-306, 873-878` |
| P6a-13 [6A-A-10] | Experimental-provider endpoint URLs are written to localStorage raw on every keystroke (userinfo and query included), unlike the sanitized local-endpoint path. The setters skip the `isRunning` / draft-lock check that the toggles use. | Confirmed | `useExperimentalProviderChatSettings.ts:718-765, 815-854, 910-913` |
| P6a-14 [6A-B-6] | Model picker keyboard handling: ArrowDown with no active item skips index 0. Arrow keys walk the full list in Favorites/Recents mode. Enter on a focused button (Close, Refresh, the star) is `preventDefault`ed and commits the hovered model instead. | Confirmed | `ModelPickerDialog.vue:2154-2172` |
| P6a-15 [6A-B-7, 6A-B-8] | `activeProjectId` is reassigned on new chat and on default startup navigation without `refreshConvos`, so the highlighted project does not match the list. Project delete runs `setProjectDefaults` and the refreshes in one try block, so a defaults failure after the committed delete leaves the deleted project listed and active. | Confirmed | `appChatApp.logic.ts:2897, 2922, 8267, 8297` |
| P6a-16 [6A-B-9] | List and search edges: <ul><li>`loadMoreConvos` can merge a pre-delete page.</li><li>`onSelectProject` fires `refreshConvos` with no catch.</li><li>Move bypasses `composerMutationQueue`.</li><li>The "No project" move option always throws `GENERATION_V2_PROJECT_REQUIRED`, which is shown raw.</li><li>Search `timeTo` is exclusive at minute precision.</li><li>`SearchResultSession.pump` can push overlapping windows (duplicate keys) when the index changes mid-pagination.</li></ul> | Confirmed by reading | `appChatApp.logic.ts:2201, 2220, 2789, 2831`; `SearchModal.vue:179`; `searchResultSession.ts` |
| P6a-17 [6A-A-11, 6A-A-12, 6A-B-9] | UX and accessibility: <ul><li>Escape, backdrop click and Reload in Settings discard unsaved edits without a prompt.</li><li>The capability-rule delete arm is not reset on navigation.</li><li>Rule priority inputs accept empty as 0.</li><li>Proxy reset has no confirm.</li><li>The picker has `aria-modal` with no focus trap, and its row button nests a star button.</li><li>Hard-coded strings (`保存端点`, English plural `'s'`).</li><li>The engine-plugin panel's `finally` reload erases its own status messages (dead component).</li></ul> | Confirmed | `SettingsModal.vue:66-74`; `SettingsPanel.vue:2649-2655, 3253-3258`; `CapabilityRulesUserPanel.vue:218-239, 456, 490`; `ModelPickerDialog.vue:2403, 2990`; `ConversationList.vue` delete title |

## 4. Uncertainties and excluded false positives

**Uncertainties:**
- How often `getProxyConfiguration()` rejects in practice (P6a-02).
- Main-side catalog authority timing (P6a-07).
- FTS5 keyword parsing, which comes from reference knowledge rather than execution (P6a-08).
- Whether invalid image custom sizes are normalized before persistence.

**Held up:**
- **Provider API keys in the renderer:**
  - Keys use `type="password"` inputs, are trimmed, and are cleared on success, cancel and status apply.
  - The masked value is never rendered.
  - Credential operations are sequenced per provider with stale-response discard and pending guards.
  - In scope there is no `console.*`, clipboard, `v-html`, `window.open` or `openExternal`.
  - Events carry only `providerKey`.
  - The compatible-provider registry client unwraps errors to codes only.
  - Main-side schemas reject secret-bearing header names and secrets in the query.
- **Proxy URL parsing in main:** it rejects embedded credentials, other schemes, and paths, queries and fragments (`productNetworkProxyV2.ts:369-382`).
- **Rule and priority panels:** they use revision CAS with stale-revision reload.
- **Search:**
  - Snippets render as text nodes via `splitSnippet`, with no `v-html`, so there is no XSS.
  - FTS queries are parameter-bound with quotes escaped.
  - Delete triggers clean the index.
  - Modal and session generation counters sequence results.
- **Model facts inspector:** separate attempt counters, a mounted guard, and an unsubscribed invalidation listener.
- **Model selection:** it is bound to the conversation id captured before the queue. A mid-flight switch yields `ACTIVE_CONVERSATION_UNAVAILABLE`, not a cross-conversation write. Unavailable rows are disabled, and `selectionPending` and `isRunning` block double or mid-run selection.
- **Single conversation delete:** queued per id, rebinds to a survivor or the template, and has a confirm. Project delete moves conversations to Inbox, as its confirm text states.
- **Startup controller:** single-flight `run()` with a lease on every await. The recovery UI shows fixed i18n strings only, with no paths, and offers no destructive action.
- **Listener and timer cleanup:** the picker, settings modal, workspace shell, plugin panel interval and experimental-provider listeners are all released.

**Rejected or downgraded:**
- "FTS injection": the query is bound and only the FTS grammar is affected (P6a-08).
- "Model selection written to the wrong conversation": blocked by the captured id.
- "API key echoed into the DOM": not found.
- `ProjectSidebar.vue` and `EnginePluginSettingsPanel.vue` defects: dead components, noted only.

**Cross-references:**
- P6a-08 is adjacent to P2b-11 (search quality) but distinct: P2b-11 is about ranking and quality, P6a-08 about parse failure.
- P2b-14 (project-name normalization) was not re-reported.
- P6a-09 compounds P2b-04 when a stale search hit points at a deleted conversation.
- The Phase 4b generation-state findings were not re-reported.

## 5. Next phase

**Phase 6b — Frontend rendering:** `src/ui-kit` rich text (`streamRenderer`, `finalRenderer`, `blockTokenizer`, `shikiLoader`), `ChatMessageBubble`, `useVirtualWindow`, `ChatSessionConsole.vue`, `ChatAppComposer.vue`, the reasoning panels, `AppChatApp.vue`, and i18n. Markdown, KaTeX and Shiki sanitization is examined there only for its frontend behaviour; the cross-cutting sanitization review remains in Phase 7.

This phase is complete. I have stopped and am waiting for your instruction to continue.
