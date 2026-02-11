# Import Boundary Guardrails (Phase 1)

## Scope

This rule set applies to current code directories:

- `src/ui-app`
- `src/ui-kit`
- `src/next`
- `electron`
- `infra`

`ui-next` is out of scope (already removed).

## Boundary Rules

1. `src/ui-kit/**` must not import `src/next/**` directly.
2. `electron/**` must not import `src/next/**` directly.
3. `src/next/**` must not import `src/ui-app/**` or `src/ui-kit/**`.

Implementation: ESLint `no-restricted-imports` in `.eslintrc.cjs`.

## Allowed Dependency Direction (Phase 1 target)

- `src/ui-app` -> `src/ui-kit`, `src/next`, `infra` contracts
- `src/ui-kit` -> local ui-kit code and neutral/shared contracts only
- `src/next` -> `infra` and neutral/shared contracts; never UI
- `electron` -> `infra` and neutral/shared contracts; avoid `src/next` direct imports

## Current Exceptions (Temporary)

No active exceptions.

- `ui-kit -> next`: 0
- `electron -> next`: 0

Electron-side convergence landed:
- Streaming bridge wire contract: `src/shared/ipc/openRouterStreamWire.ts`
- Catalog sync shared core: `src/shared/modelCatalog/catalogSyncJob.ts`
- Electron wrapper entry: `electron/modelCatalog/catalogSyncJob.ts`

## Violation Baseline Scan (Phase 1)

Detected boundary-crossing imports before exception filtering:

- `ui-kit -> next`: 0 imports (no exceptions)
- `electron -> next`: 0 imports
- `next -> ui-app/ui-kit`: no matches in current scan

## Rollout Strategy

Phase 1 (this change):
- Enforce rules as `error`.
- Keep minimal explicit exceptions with rationale.

Phase 2:
- Keep `electron -> next` at zero by routing cross-layer contracts through `src/shared/**`.
