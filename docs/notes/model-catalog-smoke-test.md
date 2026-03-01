# Model Catalog Smoke Test (Phase 1)

## Goal
- Validate phase-1 catalog baseline is runnable and debuggable:
  - mapping + tag derivation + query assembly
  - fixture-based sync -> sqlite persistence -> query
  - sync logs are enough to locate failure stage

## One-Click Smoke
```bash
npm run test:model-catalog:smoke
```

- Environment isolation:
  - no real API key required
  - no network required
  - only in-memory sqlite + local fixtures are used

This runs:
- `src/shared/modelCatalog/openRouterCatalogClient.test.ts`
- `src/shared/modelCatalog/modelTagger.test.ts`
- `src/next/modelCatalog/catalogQueryService.test.ts`
- `src/next/modelCatalog/catalogSyncJob.test.ts`
- `infra/db/repo/modelCatalogRepo.test.ts`
- `tests/integration/model-catalog-sync-query-smoke.test.ts`
- `tests/integration/model-catalog-stage4-smoke.test.ts`

## Fixture-Based Integration Case
- Fixture path:
  - `tests/fixtures/model-catalog/openrouter-models-user.fixture.json`
  - `tests/fixtures/model-catalog/openrouter-models-user-stage4.fixture.json`
  - `tests/fixtures/model-catalog/openrouter-models-category-science.fixture.json`
  - `tests/fixtures/model-catalog/openrouter-endpoints-openai-gpt-4.fixture.json`
  - `tests/fixtures/model-catalog/openrouter-models-user-401.fixture.json`
  - `tests/fixtures/model-catalog/openrouter-models-fallback-small.fixture.json`
  - `tests/fixtures/model-catalog/openrouter-providers.fixture.json`
  - `tests/fixtures/model-catalog/openrouter-models-count.fixture.json`
- Integration test:
  - `tests/integration/model-catalog-sync-query-smoke.test.ts`
- Covers:
  - one-shot sync with fixed snapshot id
  - `models/user` 401 -> fallback `/models`
  - provider fetch failure downgrade without clearing existing providers
  - hide-guard behavior (avoid mass hidden on suspiciously small fallback snapshot)
  - core meta persistence
  - FTS query
  - vendor/tag/context/price filters
  - keyset pagination stability
  - stage-4 model-level grouped filter coverage (identity/capability/modality/features/compliance/lifecycle/category)
  - endpoint cache critical path (first fetch, cache hit, manual refresh, refresh-fail fallback)

## Sync Observability Contract
`syncOpenRouterModelCatalog` logs:
- sync lifecycle:
  - `[CatalogSyncJob] sync start`
  - `[CatalogSyncJob] sync end`
- stage completion:
  - `fetch_models`
  - `fetch_providers`
  - `probe_count`
  - `write_legacy`
  - `write_core`
- stage degradation (non-blocking):
  - `fetch_providers`, `probe_count`
- failure classification:
  - `failureStage` in final `sync end` log
- write volume:
  - `legacyModelRows`
  - `coreProviderRows`
  - `coreModelRows`
  - `coreTagRows`
- FTS status:
  - `ftsBuildStatus: "trigger_managed"` when core snapshot path is executed
  - `ftsBuildStatus: "not_applicable"` when only legacy snapshot writer is used

### Failure Stage Enum (Stable)
- `fetch_models`: failed to fetch models list (`/models/user` and fallback path)
- `fetch_providers`: failed to fetch provider dictionary (`/providers`)
- `probe_count`: failed to probe models count (`/models/count`)
- `write_legacy`: failed writing legacy `model_catalog`
- `write_core`: failed writing core tables (`providers/models/model_tags/catalog_meta`)
- `validate_meta`: post-write model count invariant check failed
- `unknown`: uncategorized exception

### FTS Reproducibility Check
After one sync in the integration test:
- trigger presence:
  - `trg_models_fts_ai`
  - `trg_models_fts_au`
  - `trg_models_fts_ad`
- consistency:
  - `COUNT(models_fts)` matches synced `models` row count for provider
  - no `models` row is missing corresponding `models_fts` row via `rowid` join
- atomicity:
  - core write path is one transaction in repo (`syncCoreSnapshot`), so table + FTS trigger updates are committed together

## Failure Debug Entry
1. Run:
   ```bash
   npx vitest run src/next/modelCatalog/catalogSyncJob.test.ts
   ```
2. Check case:
   - `logs failure stage when legacy write fails`
3. Expected:
   - final log contains `status: "failed"` and `failureStage: "write_legacy"`

## Manual Offline Sanity Check
1. Start app once with valid network/api key to complete a catalog sync.
2. Disconnect network.
3. Restart app and open model selector/debug query entry.
4. Expected:
   - catalog query still returns the last successful cached rows when sync fails/skips
   - chat main flow not blocked by catalog sync failure
   - offline mode does not require catalog to refresh successfully

## Notes
- Phase 1 uses development destructive rebuild strategy for schema evolution.
- Query filtering semantics:
  - `providerKey`: source provider dimension (e.g. `openrouter`)
  - `vendors`: model vendor/author dimension (e.g. `openai`, `anthropic`)
