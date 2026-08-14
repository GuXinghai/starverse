# Model and Provider Identity Frozen Decisions and Implementation Plan

- **Lifecycle Status**: completed
- **Document Role**: owner-decision-and-implementation-plan
- **Decision frozen**: 2026-08-14
- **Current-code baseline**: `5f2d7433001133430f183590ac7a4432124c6925`
- **Implementation status**: completed
- **Progress authority**: this file; update the ledger and phase status here as implementation proceeds

---

## 1. Authority and change control

This document records the final owner-frozen decisions after a bounded, current-checkout-only cross-check of the post-hard-cut model/provider identity code.

The following rules are mandatory:

1. Current source and data contracts remain the factual authority for implementation details.
2. During the completed cross-check, a proposed decision could be rejected only with current-source evidence.
3. The cross-check is now closed. Implementation must not reopen the frozen architecture decisions in this document.
4. If current code makes a frozen decision impossible or internally contradictory, stop the affected phase, record exact source evidence in the progress ledger, and obtain a new owner decision. Do not silently substitute another architecture.
5. Do not restore compatibility aliases, legacy decoders, fallback spellings, dual reads/writes, or arbitrary-string escape hatches to make a phase compile.
6. Files 01–06 in this directory are evidence and historical review material. They do not override this record.

## 2. Frozen non-goals and retained contracts

Do not reopen or modify these contracts in this implementation:

- Catalog identity remains `providerKey + modelId`, with `modelKey` derived and checked.
- Discovery/observation retains formal `nativeModelId`.
- Generation V2 retains requested `modelId` and existing request/snapshot/artifact contracts.
- Response-reported model/provider provenance remains separate from requested identity.
- `credential-scope-v2:*` and `local-none:*` remain valid credential-scope identities.
- Historical DB column names and existing Generation V2 snapshot field names are not renamed for style.
- Runtime, Catalog, Credential, and Generation execution provider namespaces are not forcibly merged.
- Retry continues to use the target answer's frozen Generation V2 snapshot.
- OpenAI-compatible remains a product provider capability and must not be removed.
- No endpoint-revision, active-catalog-policy, Magika, or DFC redesign is in scope.

## 3. Frozen identity domains

| Domain | Current/frozen values | Authority rule |
|---|---|---|
| `RuntimeProviderId` | `openrouter`, `openai_responses`, `google_ai_studio`, `anthropic_messages`, `deepseek`, `lm_studio`, `ollama_local`, `local_endpoint` | Closed route-selection domain |
| Registered Catalog provider | `openrouter`, `google_ai_studio`, `anthropic_messages`, `openai_responses`, `deepseek` | Catalog descriptor/authority registry |
| `ProviderCredentialKey` | `openrouter`, `openai_responses`, `google_ai_studio`, `anthropic`, `deepseek` | Credential slot domain |
| Generation execution provider | `openrouter`, `google_ai_studio`, `anthropic`, `deepseek`, `openai_responses`, `generic_local`, `ollama`, `lmstudio`, `openai_compatible` | Closed shared execution identity validated against reviewed contracts |

The differences above are domain differences, not legacy aliases. Conversion is allowed only at an explicit inter-domain authority.

### Owner clarification: explicit conversion authority

The Phase 1 prohibition on implicit cross-domain assignment is an architectural boundary rule, not a requirement to brand every protocol string. The underlying wire values may remain structurally compatible string literal unions. Production code must nevertheless route every cross-domain flow through a named, total, exhaustively tested conversion authority. Direct assignment, assertion, normalization, spelling inference, and arbitrary-string conversion across Runtime, Catalog, Credential, and Generation execution domains are forbidden.

This clarification selects explicit conversion authorities instead of repository-wide branded strings. It does not merge identity domains or create a global identity registry.

## 4. Frozen decisions

### D1. Google ghost identity

- Delete the active-Catalog projection `google_ai_studio -> gemini`.
- Delete the Catalog authority registry exception that accepts `gemini` for Google.
- The Generation execution identity for current Gemini contracts is `google_ai_studio`.
- Provider-family discriminators named `gemini` remain separate concepts when they are not provider identities.

### D2. Catalog mapping authority

- `ProviderCatalogAuthorityRegistryV2` is the single authority for Catalog-to-Credential and Catalog-to-Generation-execution identity.
- Each entry carries an explicit execution provider identity.
- Registry validation compares explicit values; it must not infer an execution identity with suffix removal or spelling transformation.
- Runtime-to-renderer dispatch remains a separate authority.

### D3. Local provider mapping

- Introduce one typed `LocalProviderRouteDescriptor` table for the three local current-route families.
- Each row binds `runtimeProviderId`, renderer route kind, Generation execution provider, and protocol contract.
- Current route resolution and local profile lookup/create expectations consume this table.
- Historical retry mapping from persisted protocol contract remains separate.

**Hard constraint:**

> `LocalProviderRouteDescriptor` is an inter-domain mapping, not a compatibility normalizer. It must not accept legacy aliases, fallback spellings, arbitrary strings, or persisted historical variants.

Its inputs and outputs must be closed typed values. Unknown values fail at the calling boundary; the descriptor must never guess, normalize, or recover an old spelling.

### D4. History projection

- `generation_request_v2.provider_id` is a Generation execution identity.
- It must never be asserted or cast to `RuntimeProviderId`.
- Remove the unused `MessageMetaEntry.providerId` projection.
- Any future UI feature that needs a Runtime identity must request an explicit, typed conversion for that feature; history projection must not perform one implicitly.

### D5. Provider failures

- Replace the unqualified failure `providerId` meaning with a discriminated provider reference carrying an explicit namespace.
- Required namespaces are Generation execution, Catalog source, and Credential slot.
- Credential failures use `ProviderCredentialKey`; display-only spellings such as `openai` and `google-ai-studio` are not identities.
- One strict codec is used for persistence reads.
- Generation terminalization verifies failure operation, execution provider, and contract against the authoritative operation/request snapshot.
- Do not keep an indefinite legacy failure decoder.

### D6. OpenAI-compatible conversation route

- The route represents **current intent**, not a pinned configuration.
- Durable route intent consists only of provider instance and model identity, plus route kind/schema version.
- Provider name is derived from the current registry for display.
- Endpoint, credential, request/response profiles, reasoning mapping, inline policy, and their versions belong to the per-answer Generation V2 snapshot.
- Profile-owned default `extraBody` is resolved from the same current configuration at action time.
- A future user-authored per-conversation override, if approved, must be a separately named contract. It is not part of this implementation.
- Initial, regenerate, and edit-resend use the current active compatible configuration.
- Retry ignores the conversation route and continues exact historical snapshot replay.

### D7. Favorites and recents

- Favorites are explicit user-curated state for ordinary `provider_model` selections.
- Favorites must support every valid ordinary provider-model route rather than being hard-coded to OpenRouter.
- OpenAI-compatible is excluded from the existing preference schema because its durable identity is provider-instance plus model. Do not encode it as a fake Catalog/Runtime provider key.
- Production recents are global.
- A recent is recorded exactly once when a new Generation operation is accepted with result `created`.
- Merely selecting a model does not record a recent.
- `idempotent_replay` does not increment the count.
- A later provider failure does not undo the recent: the model was invoked.
- Initial, regenerate, edit-resend, and retry record ordinary provider-model usage consistently.
- Persisted recents are hydrated into the UI after mount/restart.
- One mutation produces one semantic service notification.
- When scoped favorites are used, inherited global rows are read-only in the child-scope editor; reorder/remove applies only to rows owned by that scope.

## 5. Product decisions intentionally deferred

These are not open questions for implementation:

- Instance-aware OpenAI-compatible favorites/recents are a future product feature.
- A user-authored compatible `extraBody` override is a future product feature.

The implementation must not approximate either feature using the ordinary provider-model preference contract or picker-time profile defaults.

## 6. Implementation phases

### Phase 1 — Close the Generation execution identity domain

- **Goal:** make execution-provider identity explicit and runtime-decodable.
- **Invariant:** Runtime, Catalog, Credential, and execution identities cannot be implicitly assigned or cast across domains.
- **Primary files/symbols:**
  - `src/next/provider/runtimeProviderId.ts`
  - `src/shared/modelCatalog/providerCatalogContracts.ts`
  - `electron/credentials/providerCredentialContract.ts`
  - `src/next/generation-v2/contracts/providerContractRegistryV2.ts`
  - new shared Generation execution identity module/codec
- **Changes:** define the nine-value execution domain; adopt it in reviewed definitions, bindings, history DTOs, and relevant failure contexts.
- **Non-goals:** no DB column rename; no global identity registry.
- **Tests/gates:** exact-domain tests; reviewed-contract completeness; source gate forbidding execution-to-Runtime casts.
- **Data/migration:** none.

### Phase 2 — Remove ghost identity and centralize explicit mappings

- **Goal:** prevent Catalog authority from manufacturing an identity unsupported by reviewed contracts.
- **Invariant:** active Catalog evidence execution identity equals the explicit registry entry and reviewed contract.
- **Primary files/symbols:**
  - `src/next/modelCatalog/providerCatalogAuthorityRegistryV2.ts`
  - `electron/services/activeCatalogModelAuthorityV2Service.ts`
  - `src/ui-app/app/appChatApp.logic.ts` route/profile helpers
  - `infra/db/repo/localEndpointProfileV2Repo.ts`
  - renderer/preload local-profile contracts
- **Changes:** add explicit Catalog execution identity; remove `_messages` inference and Google exception; consume registry values in active authority; add and consume `LocalProviderRouteDescriptor`; centralize the local execution/provider/protocol closed types used across IPC and repo boundaries.
- **Non-goals:** no Runtime/Execution merge; no reuse of the descriptor for historical retry.
- **Tests/gates:** all Catalog entries; Gemini identity; Anthropic mapping; three local descriptor rows; invalid/unknown input rejection; source gate for identity-position `gemini` and compatibility-normalizer patterns.
- **Data/migration:** none.

### Phase 3 — Correct history projection and make failures namespace-safe

- **Goal:** remove the false Runtime projection and make persisted diagnostic identity structurally unambiguous.
- **Invariant:** history remains execution-domain evidence; a failure cannot exist without a provider namespace.
- **Primary files/symbols:**
  - `infra/db/repo/conversationReadV2Repo.ts`
  - `src/next/generation-v2/renderer/generationV2WorkspaceClient.ts`
  - `src/next/generation-v2/renderer/generationV2BranchProjection.ts`
  - `src/ui-app/app/appChatApp.logic.ts` / `MessageMetaEntry`
  - `src/shared/provider/providerFailureV2.ts`
  - `infra/db/repo/generationExecutionV2Repo.ts`
  - `infra/db/repo/modelCatalogV2Repo.ts`
  - Generation runners, Catalog/discovery failure writers, credential settings IPC, failure UI
- **Changes:** remove the unused history Runtime field/cast; introduce discriminated failure provider reference; use strict codec; validate Generation failure correlation; label diagnostic display with its namespace.
- **Non-goals:** no request/snapshot/reported-provenance redesign; no execution-to-Runtime conversion.
- **Tests/gates:** all non-Runtime execution IDs in history; three failure namespaces; malformed fact rejection; operation/provider/contract mismatch; diagnostic UI.
- **Data/migration:** failure JSON shape changes without renaming DB columns; applied with the single reset in Phase 6, with no dual decoder.

### Phase 4 — Make compatible route a current-intent contract

- **Goal:** align conversation persistence with initial/regenerate/edit behavior.
- **Invariant:** mutable route rows contain intent only; immutable answer snapshots contain execution provenance.
- **Primary files/symbols:**
  - `src/next/provider/openai-chat-compatible/ui/compatibleRouteIntent.ts`
  - `src/next/provider/conversationRouteSelection.ts`
  - `src/ui-app/components/ChatAppComposer.vue`
  - `src/ui-app/components/ModelPickerDialog.vue`
  - `infra/db/repo/conversationRoutePreferenceV2Repo.ts`
  - `infra/db/v2/conversationRoutePreferenceSchema.sql`
  - `electron/services/openAIChatCompatibleGenerationV2Coordinator.ts`
- **Changes:** version and shrink compatible route intent; derive name; remove endpoint/profile provenance and profile-default `extraBody` from picker persistence/commands; resolve the complete current config atomically before snapshot commit; fail clearly if the selected instance is missing/inactive.
- **Non-goals:** no Generation V2 snapshot/request/compiler change; no retry semantic change; no user override.
- **Tests/gates:** restart/CAS; provider rename; endpoint/profile changes; stale-default prevention; initial/regenerate/edit current config; retry exact historical snapshot; deletion/deactivation failure.
- **Data/migration:** route JSON/schema baseline changes; no legacy route adapter; use the single Phase 6 reset.

### Phase 5 — Make preferences event-consistent

- **Goal:** one accepted operation produces at most one durable recent event and UI persistence matches display.
- **Invariant:** selection and idempotent replay never increment recents; compatible never enters the ordinary preference identity table.
- **Primary files/symbols:**
  - `src/ui-app/components/ChatAppComposer.vue`
  - `src/ui-app/components/ModelPickerDialog.vue`
  - `src/ui-app/app/appChatApp.logic.ts`
  - `src/next/modelPrefs/modelPrefsService.ts`
  - `infra/db/repo/modelPreferencesRepo.ts`
  - model-preference IPC validation and bridge declarations
- **Changes:** remove selection-time/debounced writes; centralize created-operation recording for all four actions; hydrate global recents; emit one event; make favorite callbacks carry provider/model; make child-scope ownership explicit.
- **Non-goals:** no compatible preference schema; no terminal-completion recent semantics.
- **Tests/gates:** restart hydration; selection plus send increments once; idempotent replay increments zero; later failure still counts; all actions; compatible exclusion; single notification; child/global favorite editing.
- **Data/migration:** existing unreliable counts are discarded by the single Phase 6 reset; no preference-column change required unless implementation evidence proves otherwise.

### Phase 6 — Reset once and close acceptance

- **Goal:** switch all changed JSON/baseline contracts atomically and validate the complete identity path.
- **Invariant:** no legacy decoder, alias, fallback, or dual-write remains.
- **Primary authorities:**
  - `infra/db/v2/schemaComposerV2.ts`
  - `electron/data-epoch/schemaMismatchRecovery.ts`
  - `electron/data-epoch/freshEpochDatabaseInitializer.ts`
- **Changes:** after all Node tests and schema composition are stable, use the existing lease-bound backup-and-recreate authority exactly once; never delete the DB directly.
- **Non-goals:** do not reset config, credential vault, assets, plugins, runtimes, or browser storage.
- **Tests/gates, in order:**
  1. `npm run rebuild:node`
  2. targeted registry, active-authority, local-profile, history, failure, route, compatible, and preference tests
  3. `npx tsc --noEmit --pretty false`
  4. `npx vue-tsc --noEmit --pretty false`
  5. identity purge gate and Generation V2 zero-residual gate
  6. `git diff --check`
  7. lease-bound database backup/recreate
  8. `npm run rebuild:electron`
  9. Electron fresh-profile smoke covering Google, Anthropic, local routes, compatible current intent, historical retry, recent restart/count, and scoped favorites
- **Data/migration:** `starverse.db` plus journals are moved to the recovery backup; the current checkout recreates epoch-2. Backup and journal verification are mandatory. Final native ABI target is Electron and no native artifact is committed.

## 7. Progress ledger

Update this table in the same commit as each phase transition. Do not mark a phase complete until its listed tests/gates pass or an explicit exception is recorded below.

| Phase | Status | Started | Completed | Commit | Evidence / blockers |
|---|---|---|---|---|---|
| 1. Execution identity domain | completed | 2026-08-14 | 2026-08-14 | `0f0cad08` + `92de0f88` | Closed codecs remain authoritative; structurally compatible values cross domains only through total Catalog/Runtime and Generation-execution/Runtime authorities. Model Picker no longer relies on casts or direct structural assignment. |
| 2. Ghost and mapping authorities | completed | 2026-08-14 | 2026-08-14 | `0f0cad08` + `92de0f88` | Google ghost remains absent. All three current local profile lookup/create helpers consume the strict descriptor for execution provider and protocol; retry mapping remains independent. |
| 3. History and failure namespace | completed | 2026-08-14 | 2026-08-14 | `0f0cad08` | Removed history-to-Runtime projection; introduced three-way provider refs, strict full-shape codec, and Generation/Catalog persistence correlation checks; 32 targeted tests and `tsc` passed |
| 4. Compatible current intent | completed | 2026-08-14 | 2026-08-14 | `0f0cad08` | Route intent is provider-instance plus model only; action-time coordinator rereads current configuration and snapshots current endpoint/profile defaults; retry remains frozen-snapshot replay; 24 targeted tests passed |
| 5. Preferences semantics | completed | 2026-08-14 | 2026-08-14 | `0f0cad08` + `92de0f88` | Renderer mutation IPC was removed. Main-process registration and startup reconciliation derive ordinary recents from strict persisted snapshots; the operation ledger provides idempotent exactly-once increments and rejects identity/time reuse. Compatible operations remain excluded. |
| 6. Reset and acceptance | completed | 2026-08-14 | 2026-08-14 | `0f0cad08` + `92de0f88` | Committed temporary-profile identity smoke passes across two launches. The closeout schema used the existing lease-bound backup/recreate authority against the verified normal DB path, then all targeted/static/Electron gates passed with final Electron ABI. |

### Progress notes

- 2026-08-14: Closeout implementation committed as `92de0f88`. Added total Catalog/Runtime and Generation-execution/Runtime conversion authorities, adopted the local descriptor in every current profile lookup/create helper, removed the renderer recent mutation surface, and added a main-process operation-keyed recent authority with startup reconciliation. No branded strings, alias decoder, fallback spelling, compatibility normalizer, global provider registry, or retry remapping was introduced.
- 2026-08-14: Closeout validation passed: unit 5 files / 22 tests, integration 5 files / 43 tests, UI 5 files / 76 tests, `tsc`, `vue-tsc`, identity purge gate (`files=851 deleted=12`), Generation V2 zero-residual gate (`runners=11 deleted=17`), test-partition gate (`518` files), ESLint error-only, and `git diff --check`. Diagnostic `lint:changed` has zero errors and 69 pre-existing size/complexity warnings, so it still exits nonzero under the repository's zero-warning changed-file policy and remains outside the frozen acceptance gate.
- 2026-08-14: The closeout schema reset used explicit authority and the verified target `C:\Users\m1389\AppData\Roaming\Starverse\workspace\epoch-2\starverse.db`. It created the recoverable backup `C:\Users\m1389\AppData\Roaming\Starverse\epoch-2-recovery-backups\epoch-2-1786678421992`, verified the backup main DB and `epoch_root_created` journal before recreation, and finished with journal phase `committed`. The runner used isolated Electron user data and was deleted; config and browser storage were not reset.
- 2026-08-14: `npm run test:model-provider-identity:fresh-profile` passed both write and verify launches, and `npm run test:electron-smoke` passed shell/preload, DFC, and diagnostics capture after the final Electron rebuild. Final ABI is Electron. Submission review found no P0/P1, no compatibility-layer regression, no Magika/DFC source change, and no generated/native artifact in Git status.
- 2026-08-14: Post-implementation reconciliation found no P0/P1 and no compatibility regression, but reopened Phases 1, 2, 5, and 6 for a bounded closeout patch. The owner selected explicit, exhaustive conversion authorities rather than branded strings. No frozen architecture decision was reopened.

- 2026-08-14: Decisions frozen against HEAD `5f2d7433001133430f183590ac7a4432124c6925`; implementation not yet started.
- 2026-08-14: Phase 1 completed. `npx tsc --noEmit --pretty false` passed. Domain/contract tests: 19 passed. Active Catalog, conversation read, and branch projection tests: 11 passed. `npm run rebuild:node` completed successfully; current ABI target is Node.
- 2026-08-14: Phase 2 started. The closed execution type exposed the dead Google `gemini` registry exception as a compile error; current-source evidence matched frozen D1, so the exception and active-authority ghost producer were removed without adding an alias.
- 2026-08-14: Phase 2 completed. `LocalProviderRouteDescriptor` is a strict three-row inter-domain table; route/profile consumers use it, while historical retry remains separate. `tsc` passed; six descriptor/registry/identity tests and two App send route tests passed.
- 2026-08-14: Phase 3 started. Removed the unused `MessageMetaEntry.providerId` field and the execution-provider-to-`RuntimeProviderId` assertion.
- 2026-08-14: Phase 3 completed. `ProviderFailureV2.provider` is discriminated as Generation execution, Catalog source, or Credential slot. The strict codec rejects missing/extra fields, aliases, and unqualified identities; Generation terminalization validates operation/provider/contract correlation and Catalog failures validate source scope. Unit/integration tests: 32 passed; `npx tsc --noEmit --pretty false` passed.
- 2026-08-14: Phase 4 started. No compatible-route legacy decoder or dual representation will be introduced; the database reset in Phase 6 is the only cutover mechanism.
- 2026-08-14: Phase 4 completed. Compatible conversation routes now use schema v2 current intent (`providerInstanceId + modelId`). Provider name is derived for display; commands carry intent only; the coordinator rereads the active configuration in its authority transaction and snapshots current endpoint/profile/default `extraBody`. Retry tests prove historical snapshot replay after registry changes. Unit/integration/UI tests: 24 passed.
- 2026-08-14: Phase 5 completed. Favorites accept the closed ordinary Runtime route domain and mutation IPC derives `modelKey`. Global recents hydrate after mount and are recorded only for a newly created operation; selection and idempotent replay do not count, compatible is excluded, and initial/regenerate/edit/retry share the same decision helper. Scoped global fallback rows are visible but non-editable. Preference/UI/send tests: 84 passed; `npx tsc --noEmit --pretty false` and `npx vue-tsc --noEmit --pretty false` passed.
- 2026-08-14: Phase 6 started. Node ABI is active. Full acceptance gates, the single lease-bound backup/recreate, Electron rebuild, and fresh-database smoke remain.
- 2026-08-14: Full acceptance suites passed under the Node ABI: unit 306 files / 2648 tests; UI 62 files / 462 tests; integration 144 files / 1108 passed and 3 skipped. `npx tsc --noEmit --pretty false`, `npx vue-tsc --noEmit --pretty false`, the identity purge gate (`files=849 deleted=12`), Generation V2 zero-residual gate (`runners=11 deleted=17`), and `git diff --check` passed. After moving the new closed contracts to the shared boundary, a focused five-file / 18-test identity suite also passed.
- 2026-08-14: The only development database cutover for this implementation used the existing root-lease recovery authority against the verified absolute target `C:\Users\m1389\AppData\Roaming\Starverse\workspace\epoch-2\starverse.db`. It moved the database to `C:\Users\m1389\AppData\Roaming\Starverse\epoch-2-recovery-backups\epoch-2-1786643180478`, verified the backup main file, and regressed the journal to `epoch_root_created`. Normal-profile startup recreated the current database and advanced the same operation to `committed`; `config.json`, the provider credential vault, assets, plugins, runtimes, and browser storage were not reset.
- 2026-08-14: `npm run test:electron-smoke` passed after the Electron rebuild. The first rebuild attempt hit a transient `EBUSY` lock on `node_modules/better-sqlite3/build`; no ABI mismatch occurred, the lock was absent on inspection, and the unchanged command passed on retry. A temporary, uncommitted normal-profile acceptance runner then performed two real app launches without provider requests. It verified an initially unset route; restart persistence of Google, Anthropic, LM Studio, Ollama, generic-local, and OpenAI-compatible route identities; strict rejection of the `lm_studio` execution alias at local-profile IPC; derived favorite model keys; one persisted recent count; project-scoped favorite persistence; all three local execution profiles; and stable credential status. Historical retry exact-snapshot behavior remains covered by the passed compatible coordinator/integration tests rather than an external provider call.
- 2026-08-14: `npm run lint:changed` was diagnostic only and is not a frozen Phase 6 gate. It reports existing complexity/size warnings and pre-existing Electron-to-`src/next` restricted imports in files touched by this change. The three newly introduced cross-boundary imports were removed by placing the closed execution codec and `LocalProviderRouteDescriptor` in `src/shared/provider`; this implementation did not broaden the unrelated legacy lint-boundary cleanup.
- 2026-08-14: Frozen decisions were committed as `341b5dee`; implementation and acceptance changes were committed as `0f0cad08`. This closeout update records those immutable references before branch publication.

## 8. Completion criteria

The goal is complete only when:

- all six phase rows are `completed`;
- the database backup/reset and fresh-profile Electron smoke are verified;
- the final code contains no Google ghost, execution-to-Runtime cast, unqualified failure provider identity, hybrid compatible route provenance, or duplicate recent event;
- all frozen non-goals remain intact;
- final review confirms no Magika/DFC dirty hunk was overwritten;
- the implementation commits and documentation progress ledger are synchronized.
