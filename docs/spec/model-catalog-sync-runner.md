# Model Catalog Sync Runner (Phase 1)

## Goals
- Cold start: when there is no catalog cache, run one full sync before catalog queries rely on fresh data.
- Warm cache: when cache exists, sync failure must not destroy current queryability.
- TTL: use a fixed refresh interval in phase 1; `/models/count` remains an optional later enhancement.
- Atomicity: network fetch + mapping + DB write path must keep DB in consistent state (no half-write).

## Module
- `src/shared/modelCatalog/catalogSyncRunner.ts`
- `electron/modelCatalog/catalogSyncRunner.ts` (re-export for main process usage)

## Inputs
- `providerKey`
- `expectedSchemaVersion`
- `fixedTtlMs`
- `readMeta(providerKey)` from `catalog_meta`
- `runSync()` (calls `syncOpenRouterModelCatalog`)
- `onSyncSuccess()` hook (used for reasoning index refresh)

## Decision Flow
1. Load `catalog_meta` for provider.
2. Determine cache state:
   - `hadCache`: `model_count > 0`
   - `staleCache`: schema mismatch or TTL expired
3. Sync policy:
   - No cache: sync immediately.
   - Stale cache: sync and keep old cache if sync fails.
   - Fresh cache: skip sync.
4. Emit structured result with:
   - timing (`startedAtMs/finishedAtMs/durationMs`)
   - outcome (`reason`, `syncAttempted`, `syncSucceeded`, `usedCacheFallback`)
   - counts (`modelCountBefore/modelCountAfter`)
   - optional `syncSnapshotId`

## Startup Integration
- `electron/main.ts` runs runner after DB ready and before window creation.
- Success hook refreshes `reasoningIndex` from latest model catalog snapshot.
- Successful sync emits `db:modelCatalogSynced` to renderer.

## Failure Handling
- Network/API failure with cache: runner returns degraded result and keeps old catalog queryable.
- Missing API key:
  - with cache: keep cache and report `missing_api_key_with_cache`
  - without cache: report `missing_api_key_no_cache`
- DB write consistency stays protected by repo transactions (`syncSnapshot`/`syncCoreSnapshot`).

## Observable Fields
- `catalog_meta` remains source of:
  - `schema_version`
  - `data_source`
  - `last_sync_at_ms`
  - `model_count`

## Smoke Test
1. Ensure DB has no catalog rows and start app with valid OpenRouter key.
2. Verify startup logs show `CatalogSyncRunner` attempted sync and completed.
3. Query catalog list and confirm non-empty results.
4. Restart app with network disconnected but existing cache.
5. Verify startup logs show degraded sync and catalog list still queryable from cache.

