# Provider Catalog Persistence Plan

Date: 2026-07-04

## Scope

This is the Phase 1 plan for moving Starverse model catalog persistence from the current OpenRouter-specific implementation to one provider-neutral catalog core.

This phase is documentation only. It does not implement runtime changes.

The approved architecture decision is scheme 2:

- Extract the provider-neutral parts of the existing OpenRouter sync/job/query path into catalog core.
- Make OpenRouter the first provider source implemented on top of that core.
- Add Google AI Studio, Anthropic, OpenAI Responses, and DeepSeek as parallel provider modules.
- Do not keep a long-term split where OpenRouter uses an old source of truth and other providers use a new source of truth.

Existing dirty UI/i18n files remain out of scope. If later implementation cannot avoid touching them, work must stop for owner confirmation before edits.

## Non-Goals

- No Settings UI redesign in Phase 1.
- No provider runtime stream, upload, download, proxy, or LocalEndpoint routing changes.
- No schema migration unless a later owner decision explicitly approves it.
- No deletion of legacy OpenRouter IPC/config names in the first compatibility pass.
- No Google/Anthropic/OpenAI/DeepSeek implementation until OpenRouter behavior is locked and the provider-neutral core is in place.

## Unique Catalog Truth Principle

Final architecture must have exactly one catalog truth path:

- catalog sync
- scope status
- query active snapshot
- snapshot validation
- scoped cleanup
- retention cleanup
- sync error recording

Legacy OpenRouter IPC/config names may remain temporarily, but only as compatibility shells that forward to provider-neutral catalog core. They must not keep an independent sync runner, independent query path, independent cache retention path, or independent cache truth.

The final state must not be:

```text
OpenRouter -> old catalog path
Other providers -> new catalog path
```

The final state must be:

```text
Legacy OpenRouter IPC/config shell
Provider catalog IPC/settings shell
            |
            v
Provider-neutral catalog core
            |
            v
Provider source modules:
  openrouter
  google-ai-studio
  anthropic
  openai-responses
  deepseek
            |
            v
Scoped SQLite snapshots
```

## Target Directory Structure

Proposed layout:

```text
src/shared/modelCatalog/
  catalogSyncSettings.ts              existing settings normalizers
  catalogSyncRunner.ts                provider-neutral runner, renamed or preserved
  catalogSyncErrorMapper.ts           provider-neutral error mapper with provider context
  internalSchema.ts                   provider-neutral catalog model schema
  providerCatalogContracts.ts         new provider source contracts
  providerCatalogScope.ts             new provider-neutral scope derivation contracts
  providerCatalogRegistry.ts          new static provider registry
  providerCatalogSnapshotMapper.ts    new shared writer input helpers

src/shared/modelCatalog/providers/
  openrouter/
    openRouterCatalogClient.ts
    openRouterCatalogMapper.ts
    openRouterCatalogSource.ts
    openRouterCatalogScope.ts
  google-ai-studio/
    googleAIStudioCatalogClient.ts
    googleAIStudioCatalogMapper.ts
    googleAIStudioCatalogSource.ts
    googleAIStudioCatalogScope.ts
  anthropic/
    anthropicCatalogClient.ts
    anthropicCatalogMapper.ts
    anthropicCatalogSource.ts
    anthropicCatalogScope.ts
  openai-responses/
    openAIResponsesCatalogClient.ts
    openAIResponsesCatalogMapper.ts
    openAIResponsesCatalogSource.ts
    openAIResponsesCatalogScope.ts
  deepseek/
    deepSeekCatalogClient.ts
    deepSeekCatalogMapper.ts
    deepSeekCatalogSource.ts
    deepSeekCatalogScope.ts

electron/modelCatalog/
  providerCatalogScopeResolver.ts     main-process store/credential backed scope resolver
  providerCatalogSyncJob.ts           one sync entrypoint for all providers
  providerCatalogQueryService.ts      one scope status/query/clear/cleanup facade

electron/ipc/
  providerCatalogIpc.ts               provider-neutral IPC
  modelCatalogSyncIpc.ts              legacy OpenRouter compatibility shell

electron/jobs/
  providerCatalogStartup.ts           provider-neutral startup sync orchestration
  startupBackgroundJobs.ts            calls provider-neutral startup service
```

The exact filenames may be adjusted during implementation, but the ownership boundary must stay the same: provider modules normalize remote data; catalog core owns sync state, scope query, DB write/read, cleanup, and retention.

## Core Boundary

Provider-neutral core owns:

- sync policy evaluation: `always`, `stale_only`, `never`
- freshness and force behavior
- cache fallback semantics
- status shape
- active snapshot validation
- scoped snapshot write/read
- query normalization and pagination
- count/revision normalization
- cleanup and retention
- sync error code mapping
- no-secret DB worker validation

Provider modules own:

- credential requirements
- base URL normalization and policy
- provider-specific scope fields
- remote endpoint calls
- provider-specific headers
- pagination
- fallback endpoint semantics
- raw response parsing
- mapping provider model records into shared catalog rows
- provider-specific evidence in `rawJson` or provider metadata fields

Provider modules must not:

- write SQLite directly
- implement their own stale/fresh/force runner
- implement their own active snapshot query
- implement their own retention cleanup
- expose API keys or request bodies to DB worker or renderer

## Provider Source Contract

Initial provider source shape:

```ts
type ProviderCatalogSource = Readonly<{
  providerKey: RuntimeProviderKey
  displayName: string
  schemaVersion: number
  resolveScope(input: ProviderCatalogScopeInput): ProviderCatalogScopeResolution
  fetchModels(input: ProviderCatalogFetchInput): Promise<ProviderCatalogFetchResult>
}>
```

Required source result:

```ts
type ProviderCatalogFetchResult = Readonly<{
  snapshotId?: string
  baseUrl: string
  dataSource: string
  models: readonly CatalogModel[]
  sourceMeta: Readonly<{
    requestedAtMs: number
    completedAtMs: number
    usedFallback?: boolean
    primarySource?: string
  }>
}>
```

The core converts this to the existing scoped snapshot writer input and persists it through the current `catalog_scope_meta` and `catalog_models` tables.

## Scope Fields

Provider-neutral scope must continue to isolate cache by provider and credential context.

OpenRouter scope input must remain behaviorally identical:

- `providerKey`
- normalized base URL
- data source
- API key fingerprint
- local catalog secret

Current OpenRouter data source input stays `models_user_primary` until a later implementation deliberately changes it with characterization tests in place.

Other providers should use explicit provider-owned data source names, for example:

- `google_models_list`
- `anthropic_models_list`
- `openai_models_list`
- `deepseek_models_list`

Scope derivation must continue to use a local HMAC secret and must never persist raw API keys. Provider-specific credential refs or secure-store IDs may affect scope only through a non-reversible fingerprint of the resolved credential material.

## DB Migration Decision

No DB migration is required for the first implementation slice.

Reason:

- `catalog_scope_meta` already isolates by `(provider_key, catalog_scope_key)`.
- `catalog_models` already isolates by `(provider_key, catalog_scope_key, snapshot_id, model_id)`.
- Existing fields can store all minimum cross-provider data: identity, display name, vendor/family, status, visibility, context, output limit, modalities, supported parameters, capabilities, pricing, raw JSON, and timestamps.

Provider-specific metadata that has no first-class column must go into `rawJson` or normalized JSON fields first.

Any later proposal to alter schema in a way that affects existing OpenRouter rows is a key-decision stop condition.

## Settings Naming

Existing OpenRouter keys remain short-term compatibility keys:

- `openRouterCatalogStartupSyncPolicy`
- `openRouterCatalogPickerOpenSyncPolicy`
- `openRouterCatalogListUpdateMode`
- `openRouterCatalogFreshnessMs`
- `openRouterCatalogRetentionMs`
- `openRouterDeprecatedCatalogCacheClearedAtMs`

Provider-neutral keys should be introduced as the new internal target:

```text
providerCatalog.<providerKey>.startupSyncPolicy
providerCatalog.<providerKey>.pickerOpenSyncPolicy
providerCatalog.<providerKey>.listUpdateMode
providerCatalog.<providerKey>.freshnessMs
providerCatalog.<providerKey>.retentionMs
providerCatalog.<providerKey>.deprecatedCacheClearedAtMs
```

Compatibility rule:

- OpenRouter legacy keys may be read and written by current Settings UI.
- Internally, OpenRouter settings resolution must normalize through the provider-neutral settings reader.
- New providers should use provider-neutral keys from the start.
- Do not create a second independent OpenRouter setting source.

OpenRouter default values must remain:

- startup sync policy: `stale_only`
- picker-open sync policy: `stale_only`
- list update mode: `manual`
- freshness: 24h
- retention: 90d

## OpenRouter Characterization Tests First

Before extraction, add characterization tests that lock current OpenRouter behavior. These tests should be committed before mechanical refactor work.

Required tests:

1. Scope key derivation input is unchanged.
   - Same provider key, API key, base URL, data source, and local secret produce the same `catalogScopeKey`.
   - Different API key, base URL, data source, or provider key produces a different `catalogScopeKey`.
   - Raw API key is not present in the scope key or DB worker payload.

2. Startup `stale_only` behavior is unchanged.
   - Fresh cache skips network.
   - Stale cache runs network sync.
   - No cache runs network sync.

3. Picker-open `stale_only` behavior is unchanged.
   - Fresh synced status skips sync.
   - Stale synced status runs sync.
   - Not synced runs sync.
   - Failed `cache_corrupted` can trigger sync.
   - Other failed states do not accidentally loop sync unless current behavior says so.

4. Manual refresh `force` behavior is unchanged.
   - Manual refresh calls sync with `force: true`.
   - Force ignores freshness and hits network.

5. Cache fresh does not hit network.
   - `CatalogSyncRunner` returns `cache_fresh`.
   - OpenRouter client fetch implementation is not invoked.

6. Stale or missing cache hits network.
   - `/models/user` is attempted when user-scoped models are preferred.
   - `/models` fallback remains unchanged.

7. Sync failure with old cache can still query old active snapshot.
   - Failed sync writes error meta without clearing `active_snapshot_id`.
   - Query still returns old active rows.
   - Sync status reports failure/stale while picker can still render cached rows where current behavior allows it.

8. Query only returns visible active rows.
   - `visibility = hidden` rows are excluded.
   - `status = archived` rows are excluded.
   - `status = deprecated` rows are excluded unless current behavior explicitly changes.

9. Retention cleanup behavior is unchanged.
   - Expired scopes are deleted by `last_used_at_ms`.
   - `retention = never` skips cleanup.
   - Current-scope clear deletes only current scope.
   - All OpenRouter cache clear deletes all OpenRouter scopes.

If any test cannot stably describe the current behavior, stop for owner decision before extraction.

## Refactor Steps

### Step 1: Characterize OpenRouter

Add the behavior-lock tests listed above around the current implementation.

Likely files:

- `electron/modelCatalog/catalogScope.test.ts`
- `electron/jobs/catalogSyncStartup.test.ts`
- `electron/jobs/startupBackgroundJobs.test.ts`
- `electron/ipc/modelCatalogSyncIpc.test.ts`
- `infra/db/repo/modelCatalogRepo.test.ts`
- `src/ui-app/components/ModelPickerDialog.test.ts`

Do not change production logic in this step.

### Step 2: Extract Provider-Neutral Types

Add provider-neutral contracts without changing behavior.

Likely files:

- `src/shared/modelCatalog/providerCatalogContracts.ts`
- `src/shared/modelCatalog/providerCatalogScope.ts`
- `src/shared/modelCatalog/providerCatalogRegistry.ts`

Keep OpenRouter client and sync job in place during this step. Tests should remain green.

### Step 3: Extract Provider-Neutral Sync Core

Move the generic runner/job orchestration out of OpenRouter-named files.

Target behavior:

- one runner path
- one stale/fresh/force decision path
- one sync error mapping path
- one DB writer path

OpenRouter should call the new core through an adapter but still produce identical results under characterization tests.

### Step 4: Move OpenRouter Into Provider Module

Move OpenRouter-specific remote fetch/mapping/scope code under provider module ownership.

Expected ownership:

- OpenRouter module owns `/models/user`, `/models`, `/providers`, OpenRouter headers, fallback rules, supported parameters, pricing, endpoint-specific raw mapping.
- Core owns persistence and query.

During this step, old imports may be re-exported temporarily to reduce churn, but final code must not keep two executable catalog paths.

### Step 5: Convert Legacy IPC/Config To Compatibility Shells

Refactor legacy names so they forward internally:

- `modelCatalog.syncNow`
- `modelCatalog.getSyncStatus`
- `modelCatalog.queryScopedCurrent`
- `modelCatalog.repairCurrentScopedCache`
- `modelCatalog.clearCurrentScopedCache`
- `modelCatalog.clearAllOpenRouterScopedCaches`

Compatibility shell rule:

- It may translate old payloads to provider-neutral inputs.
- It may preserve old channel names and error shapes.
- It must not perform OpenRouter-specific DB reads/writes itself.
- It must not instantiate an independent OpenRouter sync runner.

### Step 6: Provider-Neutral Startup Jobs

Replace OpenRouter-specific startup catalog job orchestration with provider-neutral startup orchestration.

Initial startup provider list may include only OpenRouter. The important change is that startup behavior goes through the same provider-neutral core that later providers will use.

### Step 7: Google AI Studio Vertical Slice

Only after OpenRouter passes characterization tests through the new core, add Google AI Studio as the first non-OpenRouter source.

Minimum Google slice:

- provider source contract implementation
- scope resolver
- `models.list` client
- mapper into catalog rows
- scoped snapshot write
- query through the same catalog core
- picker source from catalog, not renderer-session availability

No independent Google query/sync/cache path is allowed.

### Step 8: Remaining Provider Slices

Add providers one at a time:

1. Anthropic
2. OpenAI Responses
3. DeepSeek

Each provider must use the same provider-neutral core and have its own source module only for credential/scope/fetch/map behavior.

### Step 9: UI And Probe Closeout

After all providers have durable catalog slices:

- Model picker reads current provider scope active snapshots.
- Session-only availability probes are no longer the model picker source of truth.
- Provider availability may remain only as send preflight or diagnostics if still needed.
- Settings can later expose provider-neutral refresh controls without changing the core.

## UI Migration Plan

Phase 1 does not edit UI.

Later migration order:

1. Keep existing OpenRouter Settings controls wired to compatibility settings keys.
2. Move ModelPicker query calls from OpenRouter-only `sourceProviderKey` assumptions to selected provider scope.
3. Replace `providerModelPickerSources` session availability sources with provider catalog query results.
4. Preserve manual/automatic list update semantics.
5. Preserve current count semantics unless explicitly changed:
   - synced total count comes from snapshot meta
   - visible count comes from meta when available
   - hidden count comes from meta when available
   - actual displayed list is active + visible query result
6. Do not touch existing dirty UI/i18n files until implementation scope explicitly requires it and owner accepts the overlap.

## Test Matrix

Core tests:

| Area | Required coverage |
| --- | --- |
| scope | deterministic key, credential fingerprint, base URL, provider key, data source |
| runner | fresh skip, stale sync, no cache sync, force sync, missing credential, failed sync with cache |
| DB write | active snapshot switch, counts, validation, no raw secret payload |
| DB query | provider/scope/snapshot isolation, visible active only, pagination, filters |
| status | not synced, synced, syncing, failed, stale detection, revision |
| cleanup | current scope clear, provider-wide clear, retention cleanup, retention never |
| IPC shell | legacy OpenRouter names forward to provider-neutral core |

OpenRouter characterization tests:

| Area | Required coverage |
| --- | --- |
| source | `/models/user` preferred, `/models` fallback |
| settings | startup stale-only, picker-open stale-only, manual refresh force |
| cache | fresh cache does not call fetch, stale/no cache calls fetch |
| fallback | sync failed plus old cache can still query old active snapshot |
| query | only visible active rows returned |
| cleanup | existing retention behavior unchanged |

Provider slice tests:

| Provider | Minimum coverage |
| --- | --- |
| Google AI Studio | paginated `models.list`, generateContent-capable filtering/mapping, scoped snapshot, query |
| Anthropic | paginated `/v1/models`, mapper, scoped snapshot, query |
| OpenAI Responses | `/v1/models`, Responses capability seed mapping, scoped snapshot, query |
| DeepSeek | `/models`, curated metadata merge, scoped snapshot, query |

Regression gates:

- `npx tsc --noEmit --pretty false`
- `npx vue-tsc --noEmit`
- focused vitest for changed catalog/core/provider tests
- `npm run gate:network-egress`
- `git diff --check`

## Commit Order

Recommended commit sequence:

1. `test(catalog): characterize OpenRouter scoped catalog behavior`
2. `feat(catalog): add provider catalog core contracts`
3. `refactor(catalog): extract provider-neutral sync core`
4. `refactor(catalog): move OpenRouter catalog source into provider module`
5. `refactor(catalog): route legacy OpenRouter catalog IPC through core`
6. `feat(catalog): add Google AI Studio persistent catalog source`
7. `feat(catalog): add Anthropic persistent catalog source`
8. `feat(catalog): add OpenAI Responses persistent catalog source`
9. `feat(catalog): add DeepSeek persistent catalog source`
10. `refactor(catalog): make model picker consume provider scoped catalogs`
11. `test(catalog): remove legacy availability picker source regressions`

If a step requires touching pre-existing dirty UI/i18n files, stop before editing and report the overlap.

## Stop Conditions

Stop and ask owner/reviewer before continuing if any of these occur:

- OpenRouter visible behavior must change to complete extraction.
- OpenRouter characterization tests cannot stably describe current behavior.
- Schema migration would affect existing OpenRouter rows or query semantics.
- Legacy OpenRouter IPC/config cannot be reduced to compatibility shells without retaining duplicate truth.
- Dirty UI/i18n file overlap becomes unavoidable.
- Credential/base URL/header security boundary needs to change.
- Provider remote metadata is not trustworthy enough to seed durable catalog rows.
- ModelPicker refresh/count semantics would visibly change.
- Old availability probe fallback retention becomes ambiguous.

## Acceptance For Phase 1

This plan is acceptable only if it preserves these architecture constraints:

- Final path has one provider-neutral catalog core.
- OpenRouter is the first provider source, not a permanent special main path.
- Old OpenRouter entrypoints have a clear compatibility-shell closeout route.
- Google AI Studio is built on the same core as OpenRouter.
- No final architecture keeps OpenRouter on an old path while other providers use a new one.

