# Static Review — Phase 3a: Model Identity and Capability

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

Read-only static review. Working tree inspected at branch `codex/basic-operation-exploration`, HEAD `aec217cd`, including uncommitted state. No application code modified, no tests/builds/rebuilds run, app not launched, no provider or network requests made.

## 1. Scope and coverage

| Area | Files (implementation; `src/next/**` are re-export shims) | Depth |
|---|---|---|
| Catalog sources and identity | `src/shared/modelCatalog/**` (catalogIdentity, catalogPolicyV2/Resolver/Presets, providerCatalogScope/Settings/Registry/SourceRegistry, internalSchema, openRouterCatalogSettingsMigrationV2, providers/{openrouter,google,anthropic,openai,deepseek,openai-chat-compatible}), `src/core/model-catalog/providerCatalogAuthorityRegistryV2.ts`, `src/shared/provider/catalogRuntimeProviderAuthority.ts` | Full for OpenRouter/Google/compatible; partial for Anthropic/OpenAI/DeepSeek |
| Catalog sync and authority | `electron/services/catalogScopeCoordinatorV2.ts`, `activeCatalogModelAuthorityV2Service.ts`, `openAICompatibleCatalogV2Service.ts`, `electron/ipc/generationV2ModelAvailabilityIpc.ts`, `generationV2ModelPreferencesIpc.ts` | Full |
| Catalog/preferences repos | `infra/db/repo/modelCatalogV2Repo.ts`, `modelPreferencesRepo.ts`, `conversationRoutePreferenceV2Repo.ts` and their SQL | Full (deferred from Phase 2b) |
| Renderer catalog | `src/next/modelCatalog/{catalogRuntimeStoreV2,catalogQueryService (to ~330),compatibleCatalogClient,modelCatalogClient,modelCatalogSelectors}`, `src/ui-app/app/providerCatalogStartupSyncV2.ts`, catalog refresh in `appChatApp.logic.ts` | Partial |
| Capability and model facts | `src/core/generation-v2/capability/**`, `src/core/generation-v2/model-facts/**` | Full except `runtimeCapabilitySnapshotV2` (skimmed) and `providerNativeSourceAdapterV1` (Gemini mapping only) |
| Capability rules | `src/core/generation-v2/capability-rules/**` (core V1/V2, cloud release, activation overlays, resolver, fact overlay, pack transfer); operations only at evaluation level (compilation is Phase 3b) | Full for rule semantics |
| Rules/facts services and IPC | `electron/services/{generationV2CapabilityResolutionService, goal3ModelFactsCapabilityV1, modelFactsInspector*, modelFactsSemanticInvalidationV1, modelsDevOfficialSourceRefreshV1, cloudRulesApplicationV1Service, cloudRulesCandidateRefreshV1, userCapabilityRulesV1/V2Service, capabilityRuleMaterializationSchedulerV1Service}`, the four capability/rules/inspector IPC files | Full except V1 user service (diffed against V2) |
| Rules/facts repos | `canonicalModelFactSourceV1Repo`, `capabilityRuleCoreV1/V2Repo`, `cloudRulesApplicationV1Repo`, `cloudRulesDistributionV1Repo`, `resolvedModelFactsV1Repo`, `runtimeCapabilityV2Repo`, `userCapabilityRuleDraftV2Repo`, `infra/db/services/*` | Full except `capabilityRuleMaterializationV1Repo/Service` and `userCapabilityRuleDraftV1Repo` |

**Not covered:** `openRouterCategoryCache.ts`, `providerModelObservationV2.ts`, `modelTagger.ts`, `ModelPickerDialog.vue` / `modelPrefsService.ts` (beyond the P1-01 read sites), `scripts/maintenance/resetModelCatalogV2.ts`, rule SQL schema files, `modelFactsInspectorScopeV1`.

## 2. Subagent configuration and contributions

Two read-only subagents, `model: sonnet`, `effort: high` (exact "Sonnet 5.5" version not confirmable from the harness), max two concurrent, no nested agents.

- **3a-A** — catalog, identity, refresh, preferences. 15 candidate findings; I re-verified 3A-1 (digest source and per-fetch timestamps; no source supplies `responseDigest`), 3A-3 (Anthropic `Date.parse`) and 3A-4 (no stale-`syncing` recovery) against source.
- **3a-B** — capability, model facts, rules, cloud rules, models.dev. 15 candidate findings; I re-verified 3B-1 (no signature, `rawAssetSha256` computed but not compared, `applyBootstrapCandidate` wired at `electron/mainV2.ts:205`), 3B-2 (`arrayBuffer()` at `cloudRulesCandidateRefreshV1.ts:237-239`) and 3B-4 (the 24 h gate in `refreshIfDueOnce`; `networkRecovered` at `mainV2.ts:270` is wired to cloud rules only, not models.dev).
- Side effects: 3a-B started one `grep` that timed out and was auto-backgrounded by the harness; read-only, output unused. No files written by either agent.

## 3. Findings by severity

No High findings. IDs below are final (P3a-NN); agent IDs in brackets.

### Medium

#### P3a-01 — Cloud capability rules have no authenticity check; first candidate auto-applies [3B-1]
- **Severity:** Medium. Remote content changes request shaping and model facts for all users with no cryptographic provenance; bounded by a closed typed rule language (no code execution) and HTTPS to a fixed GitHub repo.
- **Status:** Statically confirmed.
- **Where:** `electron/services/cloudRulesCandidateRefreshV1.ts:447-450` (`rawAssetSha256` computed and stored, never compared to a trusted value); `src/core/generation-v2/capability-rules/cloudRulesReleaseV1.ts` (document decoder; `contentRevision` is a self-digest of the packs); `electron/services/cloudRulesApplicationV1Service.ts:178-191` `applyBootstrapCandidate`, invoked via `modelFactsSemanticInvalidationV1.ts:22` from `electron/mainV2.ts:205`.
- **Trigger/path:** Anyone able to publish a release in the official rules repository (maintainer account/token compromise) publishes a self-consistent document → candidate refresh accepts it → if nothing has been applied yet, bootstrap applies it with no user action; later applies need the user.
- **Expected vs observed:** Expected a signature over the asset bytes with a pinned key. Observed only self-consistency, host allowlist and a same-version drift ledger.
- **Impact:** False limits/support flags and altered request-shaping operations; worst on first run.
- **Safeguards:** HTTPS, host allowlist with manual redirect validation, strict closed-world decoder, same-version content ledger, atomic apply.
- **Repair direction:** Verify an Ed25519 (or similar) signature over raw asset bytes against a compiled-in key; also compare the GitHub asset `digest`/`size`; consider making bootstrap apply opt-in. **Verify:** tampered-fixture test expects rejection.

#### P3a-02 — Catalog snapshot digest includes fetch timestamps, so every sync is a "change" [3A-1]
- **Severity:** Medium. Breaks unchanged-catalog detection, prompts the user on every manual sync, and grows the DB without bound under the default retention.
- **Status:** Statically confirmed.
- **Where:** `src/shared/modelCatalog/providers/openrouter/openRouterCatalogClient.ts:420-510` (`firstSeenAtMs`/`lastSeenAtMs`/`syncedAtMs`/`observedAtMs` = `fetchedAtMs`; same pattern in other sources, e.g. `anthropicCatalogSource.ts:105-106`); `electron/services/catalogScopeCoordinatorV2.ts:48-52, 201-203` (`responseDigest` = sha256 of serialized items when the result has no digest; no catalog source supplies one); `infra/db/repo/modelCatalogV2Repo.ts:309` (`CASE WHEN active_snapshot_digest=? THEN NULL` never matches); `electron/ipc/generationV2ModelAvailabilityIpc.ts:360` (`retentionMs: request.retentionMs ?? 'never'`).
- **Trigger/path:** Any catalog sync of an unchanged remote catalog.
- **Expected vs observed:** Expected an equal digest and no pending snapshot. Observed a new digest each time; a new immutable snapshot (up to 32 MiB, raw record embedded ~3×) is stored per sync; manual mode always yields a pending snapshot; `firstSeenAtMs` is never preserved.
- **Compounded by:** P3a-03 (per-provider policy lost → falls back to manual/`never`).
- **Safeguards:** Snapshot immutability and LKG are intact; `cleanupInactiveSnapshots` exists but only runs per scope with a finite retention.
- **Repair direction:** Compute the digest over a normalised payload excluding fetch-time fields; carry `firstSeenAtMs` from the active snapshot; reconsider the `'never'` default. **Verify:** sync the same fixture twice, assert equal digests and no new snapshot row.

#### P3a-03 — Per-provider catalog policy is silently dropped (consequence of P1-01) [3A-2]
- **Severity:** Medium (impact refinement of P1-01, not a new root cause).
- **Status:** Statically confirmed.
- **Where:** `electron/config/configSchema.ts:103-104`, `electron/ipc/storeIpc.ts:77-78, 97-146` (exact-key allowlist; returns `false`/`undefined`); renderer writes ignore the boolean result (`SettingsPanel.vue` ~1352-1362); reads always `undefined` at `SettingsPanel.vue:1116`, `ModelPickerDialog.vue:673`, `appChatApp.logic.ts:3765`, `providerCatalogStartupSyncV2.ts:260`.
- **Impact:** The UI appears to save; only global policy applies; Epoch-2-migrated OpenRouter policy is written in main but unreadable by the renderer; with no global policy, refresh falls back to `applyMode 'manual'`, `retentionMs 'never'` (`appChatApp.logic.ts:3760-3790`), feeding P3a-02.
- **Repair direction:** Fix P1-01 (allow the dotted keys); check `store.set` results in the UI.

### Low-Medium

| ID | Finding | Status | Where | Repair direction |
|---|---|---|---|---|
| P3a-04 [3A-3] | One unparseable remote field fails the whole provider sync: Anthropic `createdAtSec = Math.floor(Date.parse(x)/1000)` → `NaN`; canonical serializer throws `GENERATION_V2_JSON_NON_FINITE_NUMBER`. Other numeric fields accept negative/huge finite values. LKG retained, so availability-only. | Confirmed | `anthropicCatalogSource.ts:102`; `src/shared/serialization/canonicalJsonV2.ts:59`; `modelCatalogV2Repo.ts:269`; `googleAIStudioCatalogSource.ts:73-86` | Per-field coercion to `null` at the source boundary; drop single bad records |
| P3a-05 [3A-4] | Catalog scope can stay `syncing` forever after a process kill mid-sync (no startup reset of stale `syncing` rows), or if an adapter ignores abort (coordinator chain blocks later syncs). `beginSync` then always throws `SYNC_IN_PROGRESS`. | Suspected (startup path confirmed absent; hang needs runtime) | `modelCatalogV2Repo.ts:226-242`; `catalogScopeCoordinatorV2.ts:165-166` | Reset `syncing` rows at startup or by TTL |
| P3a-06 [3B-4] | models.dev: one failed attempt postpones the next by the full 24 h cadence (`lastAttemptedAtMs` gate); `networkRecovered` exists only for cloud rules. A structurally valid but truncated payload publishes as complete; missing subjects become `absent_in_complete_snapshot` (facts → unknown) with no shrink guard. | Gate confirmed; shrink suspected | `modelsDevOfficialSourceRefreshV1.ts:140-157`; `infra/db/services/canonicalModelFactSourceIngestionV1Service.ts` `publishModelsDev`; `mainV2.ts:270` | Short backoff after failure; shrink guard (reject/mark partial on large subject loss) |
| P3a-07 [3B-5] | Persisted rule state is strictly re-derived on read (byte-for-byte re-serialization check). A draft or owner row that no longer decodes (decoder tightened in an update, or corruption) makes `openDraft`/`cancelDraft`/`saveDraft` throw; one bad owner row blocks all user saves via `listOwnershipSnapshots`. No in-app discard. Generation unaffected. | Confirmed by code; trigger conditional | `capabilityRuleCoreV2Repo.ts` `decodeSnapshotRow` (~59-72), `listOwnershipSnapshots` (~98); `userCapabilityRuleDraftV2Repo.ts` `readDraft` (~142-165) | Decode-free draft reset; quarantine bad owner rows; migration test with prior-decoder fixtures |
| P3a-08 [3B-6] | Rule dependency-cycle and conflict checks run per ownership snapshot, not across owners. Cloud + user snapshots can together form a cycle or equal-priority conflict, failing every matching request with `RULE_DEPENDENCY_CYCLE`/`RULE_CONFLICT`; nothing detects it at save/apply time. | Confirmed by reasoning (not executed) | `capabilityRuleCoreV2.ts` ~625-660; `requestRuleResolverV2.ts:143-146, 332` | Merged-graph preflight in materialization prep |
| P3a-09 [3A-5] | Provider-native model facts are published inside `execute`, before `commitSync`; they diverge if commit fails and are published for manual (unaccepted) snapshots. | Confirmed | `generationV2ModelAvailabilityIpc.ts:387-406` | Publish after commit, and only for applied snapshots |
| P3a-10 [3A-7] | Compatible-provider catalog: size cap checked after `arrayBuffer()` (chunked bodies fully buffered), no timeout, no per-provider in-flight dedupe; transactional replace is last-writer-wins by completion order. | Confirmed | `electron/services/openAICompatibleCatalogV2Service.ts` ~228-232; `openAICompatibleV2Repo.ts:402-456` | Streaming cap, timeout, per-provider dedupe or monotonic request ordering |
| P3a-11 [3B-2] | Cloud-rules asset and listing reads have no size cap (`arrayBuffer()`), unlike models.dev's 16 MiB streaming cap. | Confirmed | `cloudRulesCandidateRefreshV1.ts:237-239` | Reuse bounded body reader |
| P3a-12 [3A-6] | Active-catalog authority fabricates defaults when raw limits are missing (max input from `positive(...,1)`, output limits 1,000,000); model lookup is first exact match, no status filter. Downstream clamping not traced (Phase 3b). | Suspected | `activeCatalogModelAuthorityV2Service.ts` | Represent unknown as `null` |

### Low

| ID | Finding | Status | Where |
|---|---|---|---|
| P3a-13 [3A-9] | No duplicate `modelId`/`modelKey` check within a snapshot (OpenRouter/Gemini); first match shadows. Compatible path does reject duplicates. | Confirmed | `modelCatalogV2Repo.ts` `validateItemIdentity` |
| P3a-14 [3A-10] | `authority_revision` bumps on every attempt incl. failures; a background sync between binding and consume yields `ACTIVE_CATALOG_CHANGED` even with unchanged content (worse with P3a-02). | Suspected | `modelCatalogV2Repo.ts` begin/commit/fail; `activeCatalogModelAuthorityV2Service.ts` `assertCurrent` |
| P3a-15 [3A-11] | Policy decoders use `Number(value)`: `''`, `false`, `[]` → 0; `true` → 1; `'5'` → 5 pass validation (e.g. retention `''` → 0 = immediate cleanup). | Confirmed | `src/shared/modelCatalog/catalogPolicyV2.ts:53-65`; IPC `:102-105, 122` |
| P3a-16 [3A-12] | Legacy migration defaults partially-set users to automatic `stale_only` sync while fresh installs default to `'never'`; one invalid policy value aborts the whole Epoch-2 config projection (`EPOCH2_CONFIG_INVALID`). | Suspected | `openRouterCatalogSettingsMigrationV2.ts:22-54`; `catalogSyncSettings.ts:159-162`; `configProjection.ts` ~106-138 |
| P3a-17 [3A-13] | Route preference / favorites / recents are not reconciled with catalog removal (ghost models); `model_favorites`/`model_recents` scope ids have no FK; `model_recent_operation_v2` never pruned. | Confirmed | `conversationRoutePreferenceV2Repo.ts`; `modelPreferencesSchema.sql` |
| P3a-18 [3A-14] | Compatible (`ocp_provider_*`) models cannot be favorited/recorded (closed `RUNTIME_PROVIDER_IDS` enum); three key encodings for the same model identity with no single converter. | Confirmed | `modelPreferencesRepo.normalizeModelRef`; `infra/db/validation.ts:1123-1126` |
| P3a-19 [3A-8] | OpenRouter catalog client is the only source without `redirect: 'error'`; `/models/user` falls back to `/models` on any error incl. auth. | Confirmed | `openRouterCatalogClient.ts` ~557-580 |
| P3a-20 [3B-3] | No downgrade check: an older/republished release can become a candidate (apply is user-driven except bootstrap). | Confirmed | `cloudRulesDistributionV1Repo.ts` ~262-267 |
| P3a-21 [3B-7] | `fact_default` is an assertion when unconditional (outranks models.dev) but gap-fill only when conditional. Unused today; latent trap. | Confirmed (latent) | `materializedCapabilityRuleSourceV1.ts:320-325`; `requestFactOverlayV2.ts:41` |
| P3a-22 [3B-8] | Cloud activation overrides for packs/rules absent in a release are dropped; a user "off" is lost if the rule returns later. | Confirmed | `cloudRulesActivationOverlayV1.ts:59,72`; `…V2.ts` ~38,51 |
| P3a-23 [3B-10] | Model-facts inspector reads run an IMMEDIATE transaction that may publish and pin a resolved snapshot; raw-payload read returns an entire stored payload over IPC with no cap. | Confirmed | `modelFactsInspectorV1Service.ts` ~100-113 |
| P3a-24 [3B-11] | Capabilities overview panel reads only the V1 user snapshot, which the first V2 save deletes. UI effect untraced. | Suspected | `CapabilityRulesOverviewPanel.vue:163` |
| P3a-25 [3B-14] | Quadratic hot spots: new `RegExp` per subject×rule; linear `find` per subject; whole-draft re-digest per read. Matters only at large scale. | Confirmed | `materializedCapabilityRuleSourceV1.ts:218-222`; `modelsDevSourceAdapterV1` |
| P3a-26 [3B-13] | Gemini decimal facts accept any finite value (negative/zero `maxTemperature`). | Suspected | `providerNativeSourceAdapterV1.ts:162-168` |

### Info
- **I3a-01 [3B-9]:** Capability/rules IPC ignores the sender (same root as Phase 1 `registerInvoke` note); payload validation is strict.
- **I3a-02 [3B-12]:** Imported rule packs are integrity-checked, not provenance-checked; activation still requires an explicit draft save.
- **I3a-03 [3B-15]:** Unexpected exception text (e.g. `SqliteError`) can reach the renderer via IPC rejection.
- **I3a-04 [3A-15]:** Maintainability: redundant renderer refresh dedupe; `store.get` outside try inside `Promise.all` in startup sync (`providerCatalogStartupSyncV2.ts:254`); silent truncation at 50×100 models in `modelCatalogClient`; index-coupled `registerList` channels; two different canonical serializers in coordinator vs repo; full raw items returned to renderer (multi-MB IPC).
- **I3a-05:** Fail-open by design: absent expected-capability revision context (`infra/generation-v2/capabilityRevisionExpectationV2.ts:32`).

### Liveness
- **Live:** V1 and V2 user-rules services/IPC (V2 migrates from V1); `capabilityRuleCoreV1` (V2 depends on it); both activation overlays; schema-1 and schema-2 cloud release channels.
- **Authoring-only/dead:** `scripts/rules/cloudRulesUpgradeV2.ts`; `fact_default` effect (no users); `src/next/**` capability/model-facts/catalog shims.
- **Drift risk:** V1/V2 user-rules services duplicate ~60 % of logic.

## 4. Uncertainties and excluded false positives

**Uncertainties (need runtime or later-phase verification):**
- P3a-05 adapter-hang path; P3a-06 shrink behaviour; P3a-12 clamping downstream (Phase 3b); P3a-14 frequency in practice; P3a-24 UI effect.
- Chromium's handling of `Authorization` on cross-origin redirects (P3a-19) — assumed stripped, not verified.

**Held up:**
- Catalog `commitSync` is one IMMEDIATE transaction guarded by `active_attempt_id`; snapshot rows immutable; LKG kept on failure; empty automatic result demoted to manual; compatible models marked `stale` rather than deleted.
- Scope identity is a sha256 over a closed tuple; preference `model_key` is injective (closed enum + CHECK + UNIQUE).
- IPC `requestOptions` is a strict allowlist; credentials redacted in failures; Gemini key in a header.
- Renderer catalog store guards stale responses with request token + authority revision.
- models.dev: `redirect: 'error'`, 30 s timeout, 16 MiB streaming cap, strict content type/UTF-8, non-blocking start, clean dispose.
- Model facts: exact identity (no alias/prefix guessing); equal-priority disagreement → `conflict` → unknown (restrictive); CAS on source revision; failed refresh keeps LKG.
- Cloud rules apply/rollback is one IMMEDIATE transaction with multi-revision CAS; cloud fetch has manual redirect allowlist and cross-host header stripping.
- Rule decoders: exact keys and rebuilt objects (no prototype pollution); bounded predicate depth/nodes; constrained regex grammar (no ReDoS path found).
- Materialization scheduler coalesces, retries stale races ≤3, and is registered as a shutdown source.

**Rejected:** preference upsert race (synchronous transactional repo); cross-provider `model_key` collision; "NaN silently stored" (serializer rejects — becomes P3a-04); `store-set` throwing (it returns `false` — becomes P3a-03); resolved-snapshot revision collision; ReDoS; import prototype pollution; partial facts after failed refresh.

## 5. Next phase

**Phase 3b — request compilation:** generation compiler V2, capability-bound command, semantic capability validator, requested-parameter / reasoning / tool-definition operations, provider request encoders, and how unknown or fabricated limits (P3a-12) are clamped before dispatch.
