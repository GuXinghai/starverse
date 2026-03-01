# Model Catalog Endpoints Cache Contract (Stage 4 Baseline)

Updated: 2026-02-18

## 1. Scope
- Applies to endpoint details inside `ModelPickerDialog` endpoints tab.
- Endpoint metadata is observation-only in Stage 4:
  - helps inspection/filter/sort in UI
  - does **not** change real request routing behavior
- Routing policy remains out of scope for this phase.

## 2. Upstream API
- Endpoint source: `GET /api/v1/models/:author/:slug/endpoints`
- Author/slug come from `model_id` split (`author/slug`).

## 3. Endpoint Key and Cache Dimensions
- `endpointKey`:
  - `model_id + "::" + tag + "::" + quantization + "::" + provider_name`
  - empty parts normalized to `_`
- Disk cache partition:
  - `(provider_key, base_url, model_id)`
- Volatile memory cache key:
  - `providerKey + "|" + baseUrl + "|" + modelId`

## 4. Two-layer Cache Strategy

### 4.1 Disk cache (`endpoint_meta`, long-lived)
- Stable fields persisted:
  - `provider_name`
  - `tag`
  - `quantization`
  - `context_length`
  - `max_prompt_tokens`
  - `max_completion_tokens`
  - `supported_parameters`
  - `supports_implicit_caching`
  - `raw_json`
  - `fetched_at_ms`
- Replace policy:
  - replace-by-model bucket `(provider_key, base_url, model_id)` in one write.
- TTL:
  - no automatic expiry; manual refresh is the only forced refetch trigger.

### 4.2 Memory cache (volatile perf layer)
- Volatile fields only:
  - `uptime_last_30m`
  - `latency_last_30m`
  - `throughput_last_30m`
  - `status`
- Policy:
  - TTL: 10 minutes
  - Capacity: 120 (LRU)

## 5. Fetch / Refresh Behavior
- First open of endpoints tab for a model:
  - if disk cache empty -> network fetch, then write disk + memory.
- Re-open same model/tab:
  - prefer cache, do not auto-refetch.
- Manual refresh button:
  - `forceRefresh=true`, always re-fetch.
- Refresh failure:
  - keep old cache and return notice/error message.
- Missing API key:
  - with cache: show cached rows + notice
  - without cache: empty state + notice

## 6. Endpoints Tab Local Filter/Sort (UI-only)
- Filters:
  - `provider_name`
  - `tag`
  - `quantization`
  - `supports_implicit_caching`
  - `supported_parameters` (contains-all)
  - `status`
  - `uptime` min threshold
- Sort:
  - `latency p50 / p99`
  - `throughput p50 / p99`
  - `uptime`
- Scope:
  - applies only to endpoints tab rendering, not routing.

## 7. Observability Events
- Endpoint detail service emits:
  - `cache_hit`
  - `cache_miss`
  - `refresh`
  - `fetch_success`
  - `fetch_fail`
- Required log fields:
  - `providerKey`
  - `modelId`
  - `modelKey`
  - `baseUrl`
  - `durationMs`
  - failure `stage/reason`

## 8. Validation Baseline
- Offline regression:
  - `tests/integration/model-catalog-stage4-smoke.test.ts` (endpoint cache path)
  - `src/next/modelCatalog/modelEndpointDetailService.test.ts`
  - `src/ui-app/components/EndpointDetailPanel.test.ts`
- Acceptance path:
  - first fetch -> cache hit -> manual refresh -> refresh-fail fallback.

## References
- Endpoints API: https://openrouter.ai/docs/api/api-reference/endpoints/list-endpoints
- Models API: https://openrouter.ai/docs/api/api-reference/models/get-models
- API Overview: https://openrouter.ai/docs/api/reference/overview

