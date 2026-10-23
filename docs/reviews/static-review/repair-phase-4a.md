# Repair Phase 4a: effective-rule refresh and its consequences

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-23

This is the first part of repair Phase 4 (effective-rule refresh and configuration consistency, D-6) from [repair-plan.md](repair-plan.md) section 3. Phase 4 was split into two subphases:

- **4a (this report):** R4-01 to R4-07, the rule refresh and its consequences.
- **4b (next):** R4-08 (catalog policy persistence, revision bumps, stuck `syncing`, picker query sequencing) and R4-09 (settings saves, partial saves, panel races, undecodable rule rows).

Every fix has a test that names its finding or item ID, and each was checked against the reverted fix (section 3).

- No provider or network requests were made. Tests used in-memory databases, synthetic catalogs and synthetic rule packs.
- D-6 holds: a stale request that has not been sent is re-prepared once; nothing is resent after dispatch; in-flight frozen snapshots are not touched; no value is silently reset or clamped.
- D-8 holds: bootstrap rule activation is unchanged. Its evidence is in section 2 (R4-01).

## 1. Scope and repository state

| Item | Value |
|---|---|
| Branch | `codex/static-review-repairs`, on top of `b983e0af` (Phase 3) |
| Untouched working-tree content | `world_map_experiment/__pycache__/` (untracked, preserved, not committed) |
| Subagents | Two read-only passes: one verified the R4-05..R4-09 findings against the code, one mapped activation paths and revision checks for R4-01. Their findings were checked by reading the cited code; conclusions are the coordinator's |

## 2. Changes by item

### R4-01: map of activation paths and refresh triggers (investigation; OQ-4 / D-8)

**Where a rule set becomes effective, and whether the renderer hears about it (before this phase):**

| Path | Code | Broadcast before 4a |
|---|---|---|
| Cloud rules apply, rollback, overrides | `electron/services/cloudRulesApplicationV1Service.ts` `#prepare` / `#commit`; IPC `generationV2CloudCapabilityRulesIpc.ts` `notifyCommitted` | Yes |
| User rule save | `electron/services/userCapabilityRulesV2Service.ts` `saveDraft`; IPC wrappers | Yes |
| Source priority change | its IPC handler | Yes |
| Bootstrap cloud activation (first install) | see OQ-4 below | Yes, best effort |
| models.dev refresh publishing a new source revision | `electron/services/modelsDevOfficialSourceRefreshV1.ts` | **No** (fixed by R4-02) |
| Materialization scheduler (startup; after credential, local-profile and compatible-provider mutations) | `electron/services/capabilityRuleMaterializationSchedulerV1Service.ts` | **No** (fixed by R4-02) |
| Provider-native fact publication after a catalog sync | `electron/ipc/generationV2ModelAvailabilityIpc.ts` | No (still not broadcast; see limitations) |

**Renderer recompute triggers** (`src/ui-app/app/appChatApp.logic.ts`): route, model and conversation watchers; the catalog digest watcher; the credential DOM event; the semantic-invalidation broadcast; and a stale result at send. Window focus does not trigger a recompute. The model picker carries no `capabilityRevision`.

**Main-side revision check.** `capabilityRevision` is a content digest recomputed on each resolve, not a counter. The expectation context (`infra/generation-v2/capabilityRevisionExpectationV2.ts`) fails open when absent, by design; R4-07 now proves every production command entry installs it. A mismatch returns `STALE_CAPABILITY_REVISION` before the execution snapshot is committed, so no provider request is made.

**Cross-owner rule checks.** `bindRequestRulesToSubjectsV2` → `assertBoundRequestRuleDecisionsV2` already checks dependency cycles and static conflicts per subject across all owners. It runs through `prepareGenerationRequestRulesPublicationV2` on user save, cloud apply and override replacement (see R4-06, P3a-08).

**OQ-4: first-install bootstrap activation (evidence only; D-8).**

- Trigger: `CloudRulesCandidateRefreshV1.start()` (`electron/mainV2.ts`, about line 222), through its `afterSuccessfulCheck` hook (about lines 202–208). The hook runs on the not-due, no-release and success paths, and applies only when `!application.applied && distribution.candidate`.
- Validation: host allowlist, redirect checks, JSON decode, `validateDecodedCloudRulesReleasePublicationV1`, `prepareCloudRulesCandidateV1`, and the application's compare-and-set checks. The payload's SHA-256 is computed but not compared with a trusted value; there is no signature. That is P3a-01 and stays in R6-04.
- Timing: the refresh starts before IPC registration and window creation; its continuations run after the window exists.
- Delivery: it broadcasts, best effort. The renderer subscribes before its first resolve (`appChatApp.logic.ts`, subscription before the initial refresh), so an activation that lands during startup is not lost. This was established by reading the code, not observed at runtime.
- Proposal only: no policy change is justified by this evidence. Signature checking remains R6-04.

**Stop condition.** The plan's stop condition ("a refresh needs a protocol change across all provider IPC cores") did not apply: the revision check and the broadcast channel already existed; the gaps were missing broadcasts and the renderer's handling of a stale result.

### R4-02: every activation reaches the renderer

- `src/core/generation-v2/model-facts/semanticInvalidationV1.ts`: new event `{ kind: 'model_facts_source', sourceKind: 'models_dev', canonicalSourceRevision }`, with a strict decoder branch.
- `electron/services/modelsDevOfficialSourceRefreshV1.ts`: option `onPublished`, called only when a refresh publishes a revision different from the current one. A throwing listener cannot fail the refresh.
- `electron/services/capabilityRuleMaterializationSchedulerV1Service.ts`: option `onActivated`, called after `activateCurrent` when the active Capability Rules revision moved. The extra read happens only when a listener is set; a failing read or listener cannot undo the committed activation.
- `electron/ipc/generationV2IpcRegistration.ts` and `electron/mainV2.ts` wire both to `notifyModelFactsSemanticInvalidationV1` (kinds `capability_rules` and `model_facts_source`).
- The renderer already re-derives on any decoded event; a renderer test now proves the new event triggers a capability resolve.

### R4-03: no silent value change (D-6, P3b-02 clamp, P6a-11, P6b-10)

**Clamp (P3b-02).** No user value is clamped. The Anthropic `applicationDefaultInRange` clamp applies only to application fallback defaults, never to a user value; no change was needed.

**Image resolution.** Before, `refreshActiveSessionCapabilityProjection` silently reset `imageGeneration.resolution` to provider default and persisted it whenever a new authoritative enum excluded it. The session console also displayed the first allowed option in place of the stored one.
- `src/ui-app/app/appChatApp.logic.ts`: the reset is removed. `imageResolutionConflictReason` flags a retained resolution that the current authoritative enum excludes. It is shown in the composer's send-gate notice, makes `composerCanSend` false, and `withOneCapabilityReprepare` throws `GENERATION_V2_IMAGE_RESOLUTION_UNSUPPORTED` before send, regenerate and edit-resend, including after a re-prepare that newly forbids the value.
- `src/ui-app/components/ChatSessionConsole.vue`: shows the stored value (no substitute) and a conflict notice naming it.
- New i18n key `composer.status.imageResolutionUnsupported` (en-US, zh-CN; schema updated).

**Parameter editor (P6a-11).** `src/ui-app/components/GenerationParamsSettingsEditor.vue`:
- Invalid custom input is kept and flagged, with a visible "Not saved … Allowed: …" message (`chat.generationParams.invalidValue`). It is no longer reverted to the stored value or dropped to inherit. The stored setting is unchanged until a valid value is entered.
- A stored value that the current rules no longer allow is shown as stored and flagged.
- Switching to custom when no allowed starting value exists is flagged instead of ignored.

**Composer web-search chip (P6b-10).** `src/ui-app/components/ChatAppComposer.vue`: the chip now uses the same projection (`projectGenerationV2WebSearchControls`) as the session console. It cannot turn search on when the projection does not allow it, and says why; an enabled search can always be turned off; only allowed levels are offered.

### R4-04: a stale pending request is re-prepared once (D-6)

`src/ui-app/app/appChatApp.logic.ts`:
- `refreshActiveSessionCapabilityProjection` now tracks the latest refresh; `settleCurrentCapabilityProjection()` waits until it is stable.
- `withOneCapabilityReprepare(attempt, lease, stillCurrent)`: on `GENERATION_V2_CAPABILITY_PROJECTION_STALE` (renderer lease) or `STALE_CAPABILITY_REVISION` (main, before the snapshot commit), it waits for the current projection and, if the draft, branch and head are still current, runs the attempt once more under a fresh lease. A second stale result is shown.
- Used by send, regenerate and edit-resend. Each attempt has its own `operationId`. Regenerate checks conversation, branch, branch id and head; edit-resend also checks the draft scope and edit identity.
- Retry (`onRetryAnswer`) is unchanged: it replays the persisted revision of an answer that already exists.
- Nothing that reached the provider is resent: both stale codes are returned before dispatch.

### R4-05: nothing staged becomes effective early; truncated models.dev is not published (P3a-09, P3a-06)

- **P3a-09.** `electron/ipc/generationV2ModelAvailabilityIpc.ts`: provider-native facts are captured during a sync and published only after `coordinator.sync` reports `publication: 'active'`. A manual sync that stages a pending snapshot holds its facts in memory under the snapshot digest; `applyPending` publishes them when digest and credential scope match; `discardPending` drops them. A failed catalog commit records a fact failure (`MODEL_CATALOG_PUBLICATION_FAILED`) and publishes nothing.
- **P3a-06.** `infra/db/services/canonicalModelFactSourceIngestionV1Service.ts`: `isModelsDevSnapshotShrinkV1` rejects a models.dev payload with fewer than half the previous subjects, when the previous one had at least 50 (`CANONICAL_MODEL_FACT_MODELS_DEV_SHRINK_REJECTED`). The refresh maps it to `MODELS_DEV_OFFICIAL_SNAPSHOT_SHRINK_REJECTED` and keeps the last known good source.

### R4-06: a user's "off" survives activation; cross-owner graphs are checked (P3a-22, P3a-08)

- **P3a-22.** `src/core/generation-v2/capability-rules/cloudRulesActivationOverlayV1.ts` and `…V2.ts`: overrides for pack or rule ids absent from the current release are retained instead of dropped, so an "off" re-applies when a later release brings the rule back. Malformed overrides are still rejected. The settings panel already keeps other overrides when one changes.
- **P3a-08: not reproduced.** Two characterization tests (cloud + user dependency cycle; equal-priority static conflict) show that a user save which would complete a cross-owner cycle or conflict is rejected before the user snapshot is written. They pass at HEAD. Conflicts that depend on differing `when` conditions are, by design, detected only at send.

### R4-07: revision-context inventory (I3a-05, I3b-05)

New `electron/ipc/generationV2CapabilityRevisionContextInventory.test.ts`:
- Registers all nine provider registrars with a recording runtime and invokes every channel except `:abort` and three documented exemptions (the OpenRouter image endpoint get/select/update-settings channels, which create no execution snapshot). Each command must run with the expected revision in context.
- Fails if `generationV2IpcRegistration.ts` uses a registrar the test does not cover.
- Fails if a file other than the three reviewed IPC cores decodes capability-bound generation commands.
- Tests and internal replay keep the documented fail-open exemption.

## 3. Tests added or changed

| File | IDs | Change |
|---|---|---|
| `electron/ipc/generationV2CapabilityRevisionContextInventory.test.ts` (new) | R4-07 | Inventory over every registrar and channel (11 tests) |
| `electron/ipc/generationV2ModelAvailabilityIpc.test.ts` | P3a-09 | Manual snapshot publishes facts only on apply; discard drops them; a failed commit publishes nothing |
| `infra/db/services/canonicalModelFactSourceIngestionV1Service.test.ts` | P3a-06 | 60 → 29 subjects rejected; 60 → 30 accepted |
| `electron/services/modelsDevOfficialSourceRefreshV1.test.ts` | P3a-06, R4-02 | 80 → 3 rejected with the last good source kept; notifies only when the revision moves |
| `electron/services/capabilityRuleMaterializationSchedulerV1Service.test.ts` | R4-02 | Reports a run that moves the active revision, not one that keeps it |
| `src/next/generation-v2/model-facts/semanticInvalidationV1.test.ts` | R4-02 | Decodes the `model_facts_source` event; rejects malformed ones |
| `src/ui-app/AppChatApp.semanticInvalidation.test.ts` | R4-02, R4-04 | New: a models.dev source event triggers a capability resolve. **Changed assertion** (below) |
| `src/next/generation-v2/capability-rules/cloudRulesActivationOverlayV1.test.ts` | P3a-22 | **Changed assertion** (below); added: a retained "off" re-applies when the rule returns; a malformed override for an absent id is still rejected |
| `src/next/generation-v2/capability-rules/cloudRulesActivationOverlayV2.test.ts` (new) | P3a-22 | Same retention and re-apply for schema-2 packs |
| `electron/services/userCapabilityRulesV2Service.test.ts` | P3a-08 | Cross-owner cycle and static conflict rejected before the user snapshot is written (characterization; pass at HEAD) |
| `src/ui-app/AppChatApp.send.test.ts` | R4-04 | **Changed assertion** (below) |
| `src/ui-app/AppChatApp.regenRetry.test.ts` | R4-04 | **Changed assertion** (below) |
| `src/ui-app/AppChatApp.scopeOwnership.test.ts` | R4-04 | New: a stale edit-resend is re-prepared once with a fresh operation; a second stale result is shown |
| `src/ui-app/AppChatApp.semanticOperation.test.ts` | R4-03 | **Changed assertion** (below) |
| `src/ui-app/components/GenerationParamsSettingsEditor.test.ts` | P6a-11 | Allowed stored value preserved; newly forbidden stored value kept and flagged; rejected input kept with an explanation, then a valid value saved |
| `src/ui-app/components/ChatAppComposer.webSearchSendGuard.test.ts` | P6b-10 | New: cannot turn search on without the capability, with a reason; an enabled search can be turned off; only allowed levels offered. **Fixture change** (below) |

**Assertions changed because they encoded a defect or a superseded policy** (each has an explanatory comment in the test):

1. `cloudRulesActivationOverlayV1.test.ts`: the test asserted that an override for a rule absent from the release is dropped, which is P3a-22. It now asserts the override is retained.
2. `AppChatApp.send.test.ts` "refreshes capability after a stale initial send without automatically resubmitting": asserted no re-prepare, superseded by D-6. Now: one re-prepare with a new `operationId`, then the second stale result is shown, nothing created, draft kept.
3. `AppChatApp.regenRetry.test.ts` "refreshes capability after stale regenerate without creating or resubmitting an answer": same change for regenerate.
4. `AppChatApp.semanticInvalidation.test.ts` "does not author config or submit an already-started send after a committed rule invalidates its captured authority": required the user to click Send again. Now the send waits for the current projection and is re-prepared once; it still never authors config or submits under the old authority.
5. `AppChatApp.semanticOperation.test.ts` "resets an excluded resolution to provider default and persists it after a model switch": asserted the silent reset that D-6 forbids. Now: the value is kept, flagged in the composer and console, blocks sending, and clears once the user picks an allowed value.
6. `ChatAppComposer.webSearchSendGuard.test.ts` "updates web search state through the web search capability chip": its fixture had no web-search capability, which the chip used to ignore. The fixture now declares an OpenRouter text binding that supports provider search; the asserted behaviour is unchanged.

**Mutation checks.** Each of the following was run against the reverted source, failed for the stated reason, and passed after restore: the inventory test; P3a-09 fact holding; the models.dev shrink guard (service and refresh); P3a-22 retention (V1 and V2); the R4-02 decoder, scheduler, models.dev notification and renderer event; the R4-04 send, regenerate, edit-resend and in-progress-send tests; the R4-03 resolution conflict, parameter editor (2 tests) and web-search chip (2 tests).

## 4. Checks run

| Check | Result |
|---|---|
| Touched test files, each run on its own | Pass, apart from failures in the baseline lists |
| `npx vue-tsc --noEmit` | Pass |
| `node scripts/check-test-partitions.mjs` | Pass: unit 364, ui 91, integration 219 owners |
| ESLint on changed files | 0 errors. 67 warnings (function length and complexity), in pre-existing long functions and test `describe` bodies |
| Unit partition | 13 failed, 3197 passed. 10 are the Phase 3 list. The other 3 (`rawSourceSnapshotV1` "accepts a bounded full-distribution payload…", `nativeContentBlocksV1` "preserves artifacts above the request budget…", `responsesRequestV1` "rechecks item limits…") are 5 s timeouts in untouched files, all in the Phase 2 list, and pass when their files run alone (36 passed) |
| UI partition | 18 failed, 752 passed, 2 skipped. Exactly the R2-06 baseline; no new names |
| Integration partition | 40 failed, 1756 passed, 3 skipped. 38 are the R2-06 baseline names; the other 2 are the load-related timeouts recorded in repair-phase-3.md section 4. Three baseline names that passed in Phase 3 timed out again; all are 5 s timeouts in untouched files and also time out when their files run alone in this environment |

**Electron smoke.** Run after `npm run rebuild:electron`, through `scripts/agent/electron-agent.mjs` with a fresh isolated offline profile (`--offline`) under `%TEMP%\sv-p4a-smoke`:
- The app started, the renderer attached, and the composer rendered.
- The main-process log showed only the expected offline-blocked startup fetches (`MODELS_DEV_OFFICIAL_FETCH_FAILED`, `CLOUD_RULES_FETCH_FAILED`). There were no uncaught errors and no materialization failure, so the new scheduler and models.dev listeners did not disturb startup.
- With no model selected, the composer's web-search chip was disabled and showed the localized reason (zh-CN "当前无法获取所选模型的网络搜索能力…"), matching the console gate (P6b-10).
- Not observed at runtime: a broadcast reaching the renderer after a real activation, a stale-send re-prepare, or the resolution conflict. Offline mode allows no rule download or provider endpoint, so these are covered by the tests in section 3 only.
- The profile was deleted afterwards.

## 5. Limitations

- **Provider-native publications are not broadcast.** The renderer that started the sync re-derives through the catalog digest watcher, and the scheduler covers subject-set changes, but another window is not told when provider-native facts alone change.
- **Retry has no re-prepare.** It replays the persisted revision of an existing answer; a stale result is shown.
- **Conditional conflicts** (rules whose `when` differ) are still detected only at send, by design.
- **Shrink guard:** the threshold is fixed (half of a previous set of at least 50) with no override; a genuine large shrink of models.dev needs a code change to accept.
- **Held pending facts** live in memory; after a restart, a pending snapshot applied later publishes no provider-native facts until the next sync.
- **Image aspect ratio** in the console and composer still displays the first allowed option when the stored one is excluded. It was not reported as a finding and was left alone; it is a candidate for the same treatment as resolution.
- **Generic reasoning chip vs console checkbox** still use different gates (P6b-10 mentions both); only the web-search chip was aligned in this phase.
- **Main-side deferral of unsupported parameters** is P3b-03 and out of scope.

## 6. Deferred work

- Phase 4b: R4-08 and R4-09.
- R6-04: signature checking for cloud rule releases (P3a-01), referenced by OQ-4.
- The R2-06 follow-ups R2-06a–e stay tracked separately.
