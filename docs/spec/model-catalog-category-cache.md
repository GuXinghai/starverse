# Model Catalog Category Cache (Phase 2.8)

## Goal
- Support OpenRouter category filtering without adding 12 fixed prefetch requests to each sync.
- Keep category filter behavior deterministic in online/offline states.

## Investigated Facts
- Category is a server-side query dimension on OpenRouter `GET /models` (`category=<enum>`).
- `GET /models/user` is user-scoped availability and does not replace category membership fetch for this design.
- Allowed category enums are fixed by OpenRouter/OpenAPI at request-validation level (invalid enum -> 400).
- Quick probe on **2026-02-17**:
  - `GET /models?category=programming` -> HTTP `200` with subset payload,
  - `GET /models?category=not_a_real_category` -> HTTP `400` with enum validation error payload.
- Startup sync currently runs with fixed TTL (`1h` in `electron/main.ts`), so category cache should align with similar cadence.

## Final Strategy
- Recommended path: **on-demand category membership fetch + local TTL cache**.
- Not chosen for Phase 2.8: prefetch all 12 categories during sync.

Reason:
- avoids extra fixed network cost on startup/sync path,
- keeps category traffic proportional to actual UI usage.

## Single-category Contract and Compatibility
- Phase 2 contract is single-select:
  - `filter.category?: CategoryEnum`
- Legacy compatibility:
  - if `filter.categories` is provided, service selects the first valid value,
  - returns a compatibility notice indicating single-select downgrade.
- Category cache resolver only accepts one category per call.

## Cache Design
- Cache unit: `category -> model_id membership set`.
- Cache key:
  - `openrouter|<baseUrl>|category|<category>`
- Base URL isolated in key:
  - `https://openrouter.ai/api/v1` and `https://eu.openrouter.ai/api/v1` do not share membership cache.
- Default TTL:
  - `3600000ms` (1 hour), same order of magnitude as current fixed sync TTL.

## Query Integration
- Entry module: `src/next/modelCatalog/catalogQueryService.ts`
- Membership resolver: `src/next/modelCatalog/openRouterCategoryCache.ts`
- Flow:
1. Query receives `filter.category` (or legacy `filter.categories`).
2. Service resolves one category membership via OpenRouter (or cache hit).
3. Service passes `modelIds` to `modelCatalog.queryCore`.
4. Repo applies `models.model_id` pre-filter.

## SQLite Parameter Guardrail
- Risk: large membership arrays can exceed SQLite bind parameter limits.
- Implemented guard in repo query path:
  - if `modelIds.length <= 800`: use direct `models.model_id IN (...)`.
  - if `modelIds.length > 800`: switch to TEMP table path:
    - write ids into `catalog_query_model_ids`,
    - filter with `EXISTS (SELECT 1 FROM catalog_query_model_ids ...)`.
- Threshold rationale:
  - `800` is a conservative safety margin below common SQLite variable limits (for example 999 builds),
  - keeps room for additional bind parameters from other filters.
- Lifecycle guard:
  - TEMP table is populated in a transaction,
  - table is cleared in `finally` after query execution to avoid cross-query residue on reused connections.
- This guard is active in `infra/db/repo/modelCatalogRepo.ts` and covered by test.

## Offline and Failure Behavior
- No cache + fetch failure:
  - return empty result with notice:
  - `Category filter requires online refresh. Please reconnect and retry.`
- Stale cache exists + refresh failure:
  - continue query using stale membership,
  - return stale-cache notice for explainability.
- Non-openrouter source + category filter:
  - return empty result with notice (`openrouter source only`).

## Error Shape Notes
- For invalid category values, `/models` returns HTTP `400` (OpenAPI-defined 400 response).
- Observed response example (2026-02-17 probe):
  - top-level `error.message` includes enum validation detail.
- Client handling rule:
  - log HTTP status and a short body snippet,
  - surface user-friendly notice, do not crash query flow.

## Acceptance Tests (Minimum)
- `src/next/modelCatalog/openRouterCategoryCache.test.ts`
  - first fetch -> cache write
  - second same request -> cache hit (no extra fetch)
- `src/next/modelCatalog/catalogQueryService.test.ts`
  - category first query fetches membership and forwards `modelIds` to queryCore
  - repeated query hits cache
  - offline unresolved category returns explainable notice
  - legacy `categories[]` input is downgraded to first category with compatibility notice
- `infra/db/repo/modelCatalogRepo.test.ts`
  - large `modelIds` payload still queries successfully (guardrail path)
  - temp membership table is cleaned after large-query execution

## Known Boundaries
- Category membership is remote and time-varying; cache is a snapshot, not a durable truth table.
- Extremely large memberships still increase TEMP-table insert cost; monitor if category payload size grows significantly.

## References
- OpenRouter models list (`GET /models`, includes `category` query): https://openrouter.ai/docs/api/api-reference/models/get-models
- OpenRouter models user (`GET /models/user`): https://openrouter.ai/docs/api/api-reference/models/list-models-user
- OpenRouter API reference overview (base URL and endpoint structure): https://openrouter.ai/docs/api/reference/overview
- OpenRouter TypeScript SDK OpenAPI (`category` enum): https://raw.githubusercontent.com/OpenRouterTeam/typescript-sdk/main/.speakeasy/in.openapi.yaml
