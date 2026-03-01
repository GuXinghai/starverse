# Model Catalog Query Contract (Phase 1)

## Scope
- Provide a unified catalog query API for UI/debug tooling.
- Stage 4 baseline uses catalog core tables (`models`, `model_tags`, `models_fts`) + category membership pre-filter.
- No endpoints metrics sorting in this phase.

## Entry Point
- DB method: `modelCatalog.queryCore`
- Renderer service: `src/next/modelCatalog/catalogQueryService.ts` (`CatalogQueryService.query`)

## Request Contract
```ts
type CatalogQueryInput = {
  sourceProviderKey?: string // source provider key, preferred
  providerKey?: string // deprecated alias of sourceProviderKey
  searchText?: string
  filter?: {
    vendors?: string[] // model vendor/author; matches models.vendor (lowercase exact match)
    providers?: string[] // deprecated alias of vendors (compat only)
    tags?: string[] // AND semantics: model must contain all tag keys
    contextBuckets?: ('small'|'medium'|'large'|'xlarge'|'unknown')[]
    contextLength?: { min?: number; max?: number } // inclusive range over models.context_length
    maxOutputTokens?: { min?: number; max?: number } // inclusive range over models.max_output_tokens
    expiringWithinDays?: number // optional upcoming-expiration window (days); still excludes already expired models
    priceBuckets?: ('cheap'|'standard'|'expensive'|'unknown')[]
    hasPerRequestLimits?: boolean // maps to models.has_per_request_limits (0/1)
    hasDefaultParameters?: boolean // maps to models.has_default_parameters (0/1)
    topProviderIsModerated?: boolean // maps to models.top_provider_is_moderated (0/1)
    category?: (
      | 'programming'
      | 'roleplay'
      | 'marketing'
      | 'marketing/seo'
      | 'technology'
      | 'science'
      | 'translation'
      | 'legal'
      | 'finance'
      | 'health'
      | 'trivia'
      | 'academia'
    ) // OpenRouter /models server-side category filter (single-select)
    categories?: (
      | 'programming'
      | 'roleplay'
      | 'marketing'
      | 'marketing/seo'
      | 'technology'
      | 'science'
      | 'translation'
      | 'legal'
      | 'finance'
      | 'health'
      | 'trivia'
      | 'academia'
    )[] // deprecated legacy field; service picks first value and emits compatibility notice
    architectureModalities?: string[] // capability-inclusion signature filter (e.g. text->image means input contains text AND output contains image)
    tokenizers?: string[] // lowercase exact match over architecture.tokenizer
    instructTypes?: string[] // lowercase exact match over architecture.instruct_type
    modalities?: ('text'|'image'|'audio'|'video'|'file')[] // each item must appear in input OR output modalities
    inputModalities?: ('text'|'image'|'audio'|'video'|'file')[] // each item must appear in input_modalities
    outputModalities?: ('text'|'image'|'audio'|'video'|'file')[] // each item must appear in output_modalities
    supportedParameters?: string[] // contains(all): each item must exist in supported_parameters_json
  }
  sort?: {
    by?: 'name' | 'created_at' | 'context_length' | 'max_output_tokens' // default: "name"
    order?: 'asc' | 'desc' // default: "asc"
  }
  page?: {
    limit?: number // clamped to [1, 100], default 20
    cursor?: CatalogQueryCursor | null
  }
}
```

### Provider Semantics
- `sourceProviderKey` is the catalog source provider dimension (preferred):
  - Examples: `openrouter`, `openai-direct`, `anthropic-direct`
  - Phase 1 usually uses `openrouter`
- `providerKey` is deprecated at the UI/service contract level and maps to `sourceProviderKey`.
- DB method `modelCatalog.queryCore` still executes with `providerKey` (worker normalizes `sourceProviderKey -> providerKey`).
- `filter.vendors` is the model vendor/author dimension:
  - Examples: `openai`, `anthropic`
  - Stored and filtered in `models.vendor`
- `filter.providers` is deprecated and mapped to `filter.vendors` for compatibility.

### Category Filter Semantics
- `filter.category` is implemented as OpenRouter membership pre-filter, not a local model column:
  - service calls `GET /models?category=<enum>` and caches returned `model.id` membership.
  - DB query receives membership as `modelIds` and applies `models.model_id IN (...)`.
- Final phase-4 semantics are single-select:
  - UI only exposes single `category`.
  - `categories[]` is compatibility input only and never treated as OR/AND multi-select.
- `filter.categories` is deprecated compatibility input:
  - if present, service selects first valid value and appends compatibility notice.
- Cache key scope includes base URL and category:
  - `openrouter|<baseUrl>|category|<category>`
  - This keeps `openrouter.ai` and `eu.openrouter.ai` memberships isolated.
- Base URL alignment rule:
  - service prefers `catalog_meta.base_url` for category membership requests (same source as current snapshot),
  - fallback to renderer `openRouterBaseUrl` setting if meta is unavailable.
- Explainability rule for empty results:
  - if category membership itself is unresolved/offline, response returns empty with notice.
  - if category membership is non-empty but local filters produce empty rows, response appends
    `No models matched category "<category>" with current local filters.`
- Phase 2.8 strategy:
  - no startup prefetch of all categories (avoid +12 requests on full sync path),
  - fetch on demand when category filter is actually used.
  - category UX is intentionally single-select in phase 2.

### Future Extension (Phase 2+)
- Reserve a separate multi-source dimension in query contracts:
  - `sourceProviderKeys?: string[]`
- Phase 1 keeps single-source execution (`providerKey`) to match current repo query path.

### Context Buckets
- `small`: `0 < context_length < 8192`
- `medium`: `8192 <= context_length < 32768`
- `large`: `32768 <= context_length < 128000`
- `xlarge`: `context_length >= 128000`
- `unknown`: `context_length IS NULL OR context_length <= 0`

### Price Buckets
- Implemented via derived tags in `model_tags`:
  - `cheap` -> `category:cheap_bucket:cheap`
  - `standard` -> `category:cheap_bucket:standard`
  - `expensive` -> `category:cheap_bucket:expensive`
  - `unknown` -> `category:cheap_bucket:unknown`

### Numeric Range Filters
- `contextLength.min/max`:
  - `min` -> `COALESCE(models.context_length, 0) >= min`
  - `max` -> `COALESCE(models.context_length, 0) <= max`
- `maxOutputTokens.min/max`:
  - `min` -> `COALESCE(models.max_output_tokens, 0) >= min`
  - `max` -> `COALESCE(models.max_output_tokens, 0) <= max`

### Model-level Field Filters
- `hasPerRequestLimits` / `hasDefaultParameters`:
  - `true` -> `models.has_per_request_limits = 1` / `models.has_default_parameters = 1`
  - `false` -> `models.has_per_request_limits = 0` / `models.has_default_parameters = 0`
- `expiringWithinDays`:
  - query always excludes already expired rows.
  - when provided, additionally requires:
    - `models.expiration_at_sec IS NOT NULL`
    - `models.expiration_at_sec <= now_sec + expiringWithinDays * 86400`
- `architectureModalities[]`:
  - OR semantics across selected signatures.
  - each signature uses `input->output` expression where both sides support `+` joined modalities.
  - matching is capability-inclusion over JSON modality arrays, not strict string equality:
    - `text->image` => input contains `text` AND output contains `image`
    - `text->text` => input contains `text` AND output contains `text`
    - `text+image->text` => input contains both `text` and `image`, and output contains `text`
  - if a legacy token cannot be parsed as a signature, fallback is lowercase exact match over `models.architecture_modality`.
- `topProviderIsModerated`:
  - `true` -> `models.top_provider_is_moderated = 1`
  - `false` -> `models.top_provider_is_moderated = 0`
- `tokenizers[]` / `instructTypes[]`:
  - reads from structured columns:
    - `models.tokenizer`
    - `models.instruct_type`
  - matching is lowercase exact `IN (...)`.

### Modalities and Supported Parameters
- `modalities[]`:
  - AND semantics across selected values.
  - each selected value must exist in either `input_modalities_json` OR `output_modalities_json`.
- `inputModalities[]` / `outputModalities[]`:
  - AND semantics across selected values.
  - each selected value must exist in the corresponding JSON array.
- `supportedParameters[]`:
  - AND semantics across selected values.
  - implemented with `json_each(models.supported_parameters_json)` contains checks.

Implementation decision:
- Use JSON-array contains (`json_each`) rather than JSON string `LIKE`.
- Reason: avoids false positives and keeps semantic correctness for checkbox filters.

## Search Semantics
- `searchText` uses FTS5 (`models_fts MATCH`) over:
  - `display_name`
  - `canonical_slug`
  - `description`
- `model_id` and exact identity lookup are handled by exact-match fallback:
  - `LOWER(models.model_id) = LOWER(searchText)`
  - `LOWER(models.canonical_slug) = LOWER(searchText)`
  - `LOWER(models.display_name) = LOWER(searchText)`
  - `LOWER(models.description) = LOWER(searchText)`
- Search and filter are combined with `AND`.
- Base visibility filter is always:
  - `models.visibility = 'visible'`
  - `models.status = 'active'`
  - `models.expiration_at_sec IS NULL OR models.expiration_at_sec > now_sec`

## Sorting
- Supported sorts:
  - `name` -> `ORDER BY display_name COLLATE NOCASE`
  - `created_at` -> `ORDER BY COALESCE(created_at_sec, 0)`
  - `context_length` -> `ORDER BY COALESCE(context_length, 0)`
  - `max_output_tokens` -> `ORDER BY COALESCE(max_output_tokens, 0)`
- Both sorts use stable tie-breakers:
  - `model_key`

## Pagination Contract
```ts
type CatalogQueryCursor = {
  sortBy: 'name' | 'created_at' | 'context_length' | 'max_output_tokens'
  sortOrder: 'asc' | 'desc'
  name?: string
  createdAtSec?: number
  contextLength?: number
  maxOutputTokens?: number
  modelKey: string
  providerKey?: string // deprecated legacy field
  modelId?: string // deprecated legacy field
}
```

- Pagination strategy: keyset cursor (no offset).
- Query fetches `limit + 1`, returns at most `limit`.
- If there is another page, `nextCursor` is built from the last returned row.
- Cursor must match current sort (`sortBy`, `sortOrder`), otherwise request is invalid.
- Cursor tie-breaker uses `modelKey` (`provider_key::model_id`).

## Response Contract
```ts
type CatalogQueryResult = {
  items: Array<{
    providerKey: string
    modelId: string
    modelKey: string
    canonicalSlug: string | null
    displayName: string
    description: string | null
    vendor: string | null
    contextLength: number | null
    maxOutputTokens: number | null
    createdAtSec: number | null
    pricing: {
      prompt: string | null
      completion: string | null
      request: string | null
      image: string | null
    }
    capabilities: {
      reasoning: boolean
      tools: boolean
      structuredOutputs: boolean
      vision: boolean
      longContext: boolean
    }
  }>
  nextCursor: CatalogQueryCursor | null
  notice?: string | null
}
```

## Failure and Degrade Paths
- Missing `dbBridge` in renderer: return empty result (`items=[]`, `nextCursor=null`).
- Malformed row payload: row is dropped, request does not fail.
- Malformed cursor payload from DB: ignored (`nextCursor=null`).
- Invalid input in worker (`providerKey/sourceProviderKey` both missing): return validation error.
- Sync failures are handled by `CatalogSyncRunner`; query path only reads existing snapshot/cache.
- Category-specific degrade:
  - unsupported source provider + category filter: return empty with explanatory notice.
  - category fetch fails and no cached membership: return empty with notice `Category filter requires online refresh...`.
  - category refresh fails but stale membership exists: continue query with stale membership and notice.
  - legacy `categories[]` input adds compatibility notice (first value only).
  - large membership guardrail: repo switches from direct `IN (...)` to TEMP-table membership filter when id list exceeds threshold.

## Observability
- `CatalogQueryService` emits structured logs:
  - `query_success`: includes source provider, sort, limit, filter summary, result count, duration.
  - `query_degraded`: includes degrade stage (`precondition`/`category_resolution`) and reason.
  - `query_fail`: includes failure stage (`query_execution`), reason, and duration.

## Smoke Test
1. Run unit tests:
   - `npx vitest run src/next/modelCatalog/catalogQueryService.test.ts`
   - `npx vitest run infra/db/repo/modelCatalogRepo.test.ts`
2. Run stage-4 fixture integration:
   - `npx vitest run tests/integration/model-catalog-stage4-smoke.test.ts`
   - validates grouped model-level filters and category membership behavior with offline fixtures.
3. Verify method registry and worker registration:
   - `npx vitest run infra/db/dbMethodsRegistry.test.ts infra/db/worker.handlerRegistration.test.ts`
4. Optional runtime check (Electron dev):
   - Ensure catalog has synced.
   - Call `CatalogQueryService.query({ searchText: 'gpt', page: { limit: 20 } })`.
   - Re-call with returned `nextCursor` and confirm no overlap between pages.
5. Alias compatibility check:
   - Call `CatalogQueryService.query({ sourceProviderKey: 'openrouter', filter: { providers: ['openai'] } })`.
   - Verify worker payload resolves to `providerKey='openrouter'` and `vendors=['openai']`.
6. Category cache check:
   - First call: `CatalogQueryService.query({ sourceProviderKey: 'openrouter', filter: { category: 'programming' } })`.
   - Second call with same category should hit cache (no extra network call).
   - In offline state without cache, response should include `notice` and keep process stable.
7. Legacy compatibility check:
   - Call `CatalogQueryService.query({ sourceProviderKey: 'openrouter', filter: { categories: ['programming', 'science'] } })`.
   - Verify first value is used and response `notice` mentions single-select compatibility.

## References
- OpenRouter models list (`GET /models`, includes `category` query): https://openrouter.ai/docs/api/api-reference/models/get-models
- OpenRouter models user (`GET /models/user`, user-filtered semantics and EU in-region routing note): https://openrouter.ai/docs/api/api-reference/models/list-models-user
- OpenRouter API reference (base URL and endpoint overview): https://openrouter.ai/docs/api/reference/overview
- OpenRouter TypeScript SDK OpenAPI (`category` enum source): https://raw.githubusercontent.com/OpenRouterTeam/typescript-sdk/main/.speakeasy/in.openapi.yaml
