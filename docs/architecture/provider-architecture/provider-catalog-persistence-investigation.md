# Provider Catalog Persistence Investigation

Date: 2026-07-04

## Scope

This is the Phase 0 read-only investigation for extending provider model catalog persistence beyond OpenRouter.

The requested worktree boundary checks were run before writing this document:

```text
git status --short --untracked-files=all
git diff --name-only
```

Existing dirty files before this document was created:

```text
src/shared/i18n/locales/en-US/chat.json
src/shared/i18n/locales/zh-CN/chat.json
src/ui-app/components/ChatAppComposer.modelPicker.test.ts
src/ui-app/components/ChatAppComposer.vue
src/ui-app/components/ChatSessionConsole.anthropic.test.ts
src/ui-app/components/ChatSessionConsole.deepSeek.test.ts
src/ui-app/components/ChatSessionConsole.googleAIStudio.test.ts
src/ui-app/components/ChatSessionConsole.lmStudio.test.ts
src/ui-app/components/ChatSessionConsole.ollama.test.ts
src/ui-app/components/ChatSessionConsole.openAIResponses.test.ts
src/ui-app/components/ChatSessionConsole.vue
src/ui-app/components/ChatWorkspaceShell.test.ts
src/ui-app/components/ChatWorkspaceShell.vue
src/ui-app/components/ComposerCapabilityChip.test.ts
src/ui-app/components/ComposerCapabilityChip.vue
```

These files are treated as pre-existing unrelated UI/i18n work and were not modified by this investigation.

## Current OpenRouter Catalog Implementation

OpenRouter already has a scoped persistent catalog path:

- Settings keys and defaults are defined in `src/shared/modelCatalog/catalogSyncSettings.ts`.
- Credential/base URL scope derivation is implemented in `electron/modelCatalog/catalogScope.ts`.
- Catalog credential resolution is implemented in `electron/jobs/openRouterCatalogCredential.ts`.
- Startup sync orchestration is in `electron/jobs/startupBackgroundJobs.ts`.
- Sync execution is in `electron/jobs/catalogSyncStartup.ts` and `src/shared/modelCatalog/catalogSyncRunner.ts`.
- OpenRouter remote fetch/normalization is in `src/shared/modelCatalog/openRouterCatalogClient.ts` and `src/shared/modelCatalog/catalogSyncJob.ts`.
- IPC facade is in `electron/ipc/modelCatalogSyncIpc.ts`.
- Persistent storage is `catalog_scope_meta` and `catalog_models` in `infra/db/schema.sql`, accessed through `infra/db/repo/modelCatalogRepo.ts`.
- Renderer query/detail services use `src/next/modelCatalog/catalogQueryService.ts`, `modelCatalogClient.ts`, `modelDetailService.ts`, and `modelEndpointDetailService.ts`.
- UI settings and picker behavior are in `src/ui-app/components/SettingsPanel.vue` and `ModelPickerDialog.vue`.

OpenRouter settings currently include:

| Store key | Default | Notes |
| --- | --- | --- |
| `openRouterCatalogStartupSyncPolicy` | `stale_only` | `always`, `stale_only`, or `never`. |
| `openRouterCatalogPickerOpenSyncPolicy` | `stale_only` | Same policy enum. |
| `openRouterCatalogListUpdateMode` | `manual` | `automatic` or `manual`; controls whether a newly synced revision is applied to the visible picker list immediately. |
| `openRouterCatalogFreshnessMs` | 24h | Presets: 15m, 1h, 6h, 24h, 7d. |
| `openRouterCatalogRetentionMs` | 90d | Presets: 7d, 30d, 90d, 180d, `never`. |
| `openRouterCatalogLocalSecret` | generated | Local HMAC secret used for scope derivation; blocked from renderer store IPC. |
| `openRouterDeprecatedCatalogCacheClearedAtMs` | unset | One-time marker for clearing deprecated OpenRouter catalog tables. |

The OpenRouter scope key is an HMAC over provider key, normalized base URL, data source, API key fingerprint, and local catalog secret. Current data source input is `models_user_primary`.

OpenRouter sync uses the shared `CatalogSyncRunner` behavior:

- Fresh cache returns `cache_fresh` and avoids network.
- Missing cache, stale cache, or `force: true` runs a remote sync.
- Failed sync with old cache returns `usedCacheFallback: true`, but the sync result still reports the failed attempt.
- Query remains separate from sync and reads the active scoped snapshot when available.

OpenRouter network source behavior:

- Prefer `/models/user`.
- Fall back to `/models` if the user-scoped source fails.
- Fetch `/providers` as a degraded secondary stage; provider fetch failure does not block model snapshot write.
- Optional `/models/count` probe exists but is not enabled by the current startup/manual catalog path.

OpenRouter model mapping currently extracts:

- ID, name, canonical slug, description, created timestamp, expiration.
- Vendor/family from model ID.
- Context length and max output tokens.
- Architecture modality, input/output modalities.
- Supported parameters.
- Capabilities derived from supported parameters and modalities: reasoning, tools, structured outputs, vision, long context.
- Pricing, including web search, internal reasoning, input cache read/write.
- Status from expiration date; visibility defaults to visible.

## Reusable Modules

These modules are good candidates for provider-neutral reuse or adaptation:

- `CatalogSyncRunner` in `src/shared/modelCatalog/catalogSyncRunner.ts`: the freshness/force/fallback state machine is provider-neutral enough to reuse once its meta input is generalized.
- `catalog_scope_meta` and `catalog_models`: the schema already has `provider_key`, `catalog_scope_key`, and `snapshot_id` isolation.
- DB worker methods for scoped meta/snapshot/query/clear/cleanup in `modelCatalogRepo.ts`: names are currently OpenRouter-facing at IPC level, but repo methods are mostly provider-neutral.
- `modelCatalog.queryScopedCurrent` IPC payload shape: already accepts `providerKey`, query filters, cursor, and returns counts/revision/status.
- `CatalogQueryService`: already uses `sourceProviderKey` and delegates to scoped current query.
- Picker sync UX concepts: startup policy, picker-open policy, manual refresh, freshness, retention, manual/automatic list apply, cooldowns.
- `ProviderCredentialService.getLegacyStoreValue`: useful for existing secure-store-backed legacy key compatibility, but provider-specific credential resolution should remain explicit.

## OpenRouter-Specific Modules That Should Not Be Reused As-Is

These carry OpenRouter semantics and should not become parent implementations for other providers:

- `electron/jobs/openRouterCatalogCredential.ts`: hard-wired to `openRouterApiKey`, `openRouterBaseUrl`, OpenRouter endpoint policy, and OpenRouter catalog credential refs.
- `electron/modelCatalog/catalogScope.ts`: function shape is reusable, but constants and data source names are OpenRouter-specific.
- `src/shared/modelCatalog/openRouterCatalogClient.ts`: OpenRouter endpoints, headers, raw response schema, `/models/user` fallback behavior, provider endpoint support, and OpenRouter attribution headers are provider-specific.
- `src/shared/modelCatalog/catalogSyncJob.ts`: currently maps OpenRouter `CatalogModel` objects and writes OpenRouter-shaped rows; useful as a reference but not as a base class for Google/Anthropic/OpenAI/DeepSeek.
- `electron/ipc/modelCatalogSyncIpc.ts`: channel names are generic, but some methods and clear APIs are OpenRouter-specific, especially `clearAllOpenRouterScopedCaches`.
- `SettingsPanel.vue` OpenRouter section: UI wording and controls are OpenRouter-specific.
- `openRouterCategoryCache.ts`: this is a separate in-memory category helper, not the durable scoped catalog path.

## Non-OpenRouter Provider Current State

Google AI Studio, Anthropic, OpenAI Responses, and DeepSeek currently expose model availability through IPC probes. They do not write scoped snapshots to SQLite and do not use catalog freshness/retention.

### OpenAI Responses

- Renderer ref: `openAIResponsesModelAvailabilityResult` in `src/ui-app/app/appChatApp.logic.ts`.
- Refresh handler: `onRefreshOpenAIResponsesModels`.
- IPC: `electron/ipc/openAIResponsesModelAvailabilityIpc.ts`, channel `openai-responses-models:list-availability`.
- Source: `src/next/provider/openai-responses/openAIResponsesModelSource.ts`.
- Remote endpoint: `GET https://api.openai.com/v1/models`.
- Source semantics: `/models` is treated as availability/basic ownership only. Responses capability hints are Starverse curated metadata.
- Current data lifetime: renderer session memory only.

### Google AI Studio

- Renderer ref: `googleAIStudioModelAvailabilityResult` in `src/ui-app/app/appChatApp.logic.ts`.
- Refresh handler: `onRefreshGoogleAIStudioModels`.
- IPC: `electron/ipc/googleAIStudioModelAvailabilityIpc.ts`, channel `google-ai-studio-models:list-availability`.
- Source: `src/next/provider/gemini/geminiModelSource.ts`.
- Remote endpoint: `GET https://generativelanguage.googleapis.com/v1beta/models?pageSize=100`.
- Pagination: bounded by `maxPages`, default 2, maximum 5.
- Source semantics: live `models.list` is treated as availability/capability seed and merged with curated Gemini metadata.
- Current data lifetime: renderer session memory only.

### Anthropic

- Renderer ref: `anthropicModelAvailabilityResult` in `src/ui-app/app/appChatApp.logic.ts`.
- Refresh handler: `onRefreshAnthropicModels`.
- IPC: `electron/ipc/anthropicModelAvailabilityIpc.ts`, channel `anthropic-models:list-availability`.
- Source: `src/next/provider/anthropic/anthropicModelSource.ts`.
- Remote endpoint: `GET https://api.anthropic.com/v1/models?limit=100`, with `after_id` pagination.
- Pagination: bounded by `maxPages`, default 5, maximum 10.
- Source semantics: provider-reported Models API data plus Starverse curated metadata.
- Current data lifetime: renderer session memory only.

### DeepSeek

- Renderer ref: `deepSeekModelAvailabilityResult` in `src/ui-app/app/appChatApp.logic.ts`.
- Refresh handler: `onRefreshDeepSeekModels`.
- IPC: `electron/ipc/deepSeekModelAvailabilityIpc.ts`, channel `deepseek-models:list-availability`.
- Source: `src/next/provider/deepseek/deepSeekModelSource.ts`.
- Remote endpoint: `GET https://api.deepseek.com/models`.
- Source semantics: `/models` is availability; pricing/model details are seeded from DeepSeek pricing docs and Starverse curated metadata.
- Current data lifetime: renderer session memory only.

The model picker receives these session-only sources through `providerModelPickerSources`, and `onRefreshProviderModelPickerSources` refreshes all four probes concurrently. Send preflight can also call `ensureCloudAvailabilityResult`, which may trigger a model availability probe if no result is present. This is explicitly not equivalent to persistent catalog sync.

## DB Schema Assessment

The existing scoped catalog schema is sufficient for provider isolation:

- `catalog_scope_meta` primary key is `(provider_key, catalog_scope_key)`.
- `catalog_models` primary key is `(provider_key, catalog_scope_key, snapshot_id, model_id)`.
- `catalog_models` references `catalog_scope_meta(provider_key, catalog_scope_key)`.
- Active lookup index includes provider key, scope key, snapshot, visibility, status, display name, and model ID.
- Query path validates the active scoped snapshot and filters default picker rows to `visibility = 'visible'` and `status = 'active'`.

No immediate schema migration is required for Phase 1 planning if provider-normalized fields can fit into the existing columns:

- model identity/display/vendor/family/status/visibility
- context/max output
- modality JSON
- supported parameters JSON
- capabilities JSON
- pricing JSON
- raw JSON
- created/first seen/last seen/synced timestamps

However, a provider-neutral evidence model may need to be stored inside existing JSON fields unless a later plan deliberately adds columns. Any migration that affects current OpenRouter rows should trigger owner confirmation.

## Minimum Implementation Slice Recommendation

Recommended first implementation slice after planning:

1. Introduce provider-neutral catalog contracts and registry without moving OpenRouter runtime behavior.
2. Extract or wrap the reusable sync runner inputs around provider-neutral names.
3. Add provider-neutral settings helpers that can represent per-provider startup policy, picker-open policy, list update mode, freshness, and retention.
4. Add provider-neutral scope descriptor helpers using the existing local catalog secret concept, but avoid importing OpenRouter-specific constants into other providers.
5. Register OpenRouter as the first provider adapter through the new registry while keeping old IPC/settings compatible.
6. Add tests that prove the new core does not import OpenRouter provider code.

Do not start by moving the model picker or deleting availability probes. Google should be the first vertical slice only after the core contract and plan are stable.

## Stop-Condition Notes

The investigation found two likely decision points for the Phase 1 plan:

1. Whether provider-neutral core should wrap the existing `CatalogSyncRunner` directly or introduce a thin provider-neutral runner facade.
2. Whether provider field evidence should live inside existing JSON fields for the first vertical slices or require new schema. A migration is not required for the minimum slice, but durable first-class evidence columns would need owner confirmation.

No source files were modified for this investigation.
