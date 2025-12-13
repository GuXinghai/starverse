# TC-12 — Aggressive Deletion Checklist

## Deleted (directories)
- `archived-services/` (archived legacy provider implementations)
- `src/components/` (legacy UI)
- `src/stores/` (legacy Pinia stores)
- `src/composables/` (legacy sending/search composables)
- `src/services/` (legacy provider services, including OpenRouter call chain)
- `src/utils/` (legacy helpers used by the removed stack)
- `src/types/` (legacy shared types used by the removed stack)
- `src/next/generation/` (transitional generation facade/pipelines; removed in favor of ui-next direct reducer-driven flow)

## Deleted (tests)
- `tests/unit/` (legacy-unit tests for the removed stack)
- `tests/integration/` (legacy integration tests)
- `tests/performance/` (legacy perf scripts)
- `tests/utils/` (legacy test helpers)
- `tests/sampling-parameters-persistence.test.ts`
- `tests/usage-statistics.test.ts`

## Modified (entrypoints / imports)
- `src/App.vue` — removed `enableUiNext` split routing; ui-next is the only rendered app surface.
- `src/main.ts` — removed Pinia/store/bootstrap and legacy services; mount `App.vue` only.

## Gates updated/added
- `scripts/gates/tc12.mjs` + `scripts/gates/tc12.ps1` — assert legacy surfaces/identifiers are gone; runs full `npm test` (unless `--skip-tests`).
- `scripts/gates/tc00-tc02.mjs` — now only checks TC-00/TC-01 artifacts (no TC-02 code expectations after deletion).
