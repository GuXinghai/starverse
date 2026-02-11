# Code Complexity Guardrails (Phase 1.2)

## Scope

Complexity rules are enabled for:

- `**/*.ts`
- `**/*.tsx`
- `**/*.vue`

## Baseline Thresholds (warn)

Configured in `.eslintrc.cjs`:

- `max-lines-per-function`: `80` (skip blank lines/comments)
- `complexity`: `20`
- `max-depth`: `4`
- `max-params`: `6`
- `max-statements`: `50`

These start as `warn` for gradual adoption.

## Explicit Temporary Exceptions (Historical Debt)

The following files use relaxed thresholds temporarily:

1. `src/ui-app/AppChatApp.vue`
- Reason: monolithic UI orchestration and streaming flow handling in a single component.
- Direction: split by panel/transcript/stream lifecycle orchestrators.

2. `infra/db/worker.ts`
- Reason: centralized DB handler registry and worker runtime lifecycle in one file.
- Direction: split handler registration by bounded domains (`project`, `convo`, `branch`, `usage`).

3. `src/next/state/reducer.ts`
- Reason: large event reducer switch and state transitions.
- Direction: extract event sub-reducers + dispatch table.

4. `electron/ipc/openRouterStreamBridge.ts`
- Reason: IPC bridge currently bundles request build, stream decode, event mapping, and error shaping.
- Direction: extract transport adapter layer shared by electron/main and domain pipeline.

## Backlog Policy: Local Disable Hygiene

To avoid diluting Phase 1.2 guardrails, local `eslint-disable` for complexity rules is constrained:

1. Limit new local complexity disables to test files only.
2. Every local disable must include a one-line reason plus a TODO for follow-up split/extraction.
3. Prefer adding/removing entries in the explicit exception list over scattered inline disables when the file is a recurring hotspot.

## PR/CI Guard: Changed Files Only

New script:

- `npm run lint:changed`

Behavior:

1. Resolves a base commit from:
- `GITHUB_BASE_SHA` (preferred), else
- merge-base with `GITHUB_BASE_REF`, else
- merge-base with `origin/main|origin/master|main|master`, else
- fallback `HEAD~1`.

2. Collects changed files via `git diff --name-only --diff-filter=ACMR`.
3. Filters to `.ts/.tsx/.vue`.
4. Runs `eslint --max-warnings=0` on changed files only.

This blocks PRs from introducing new warnings (including complexity warnings) in modified files.

## Tightening Plan

1. Keep global thresholds as `warn` for 1-2 sprints while reducing exception scope.
2. For touched legacy exception files, require extraction/splitting in follow-up PRs.
3. Move complexity rules from `warn` to `error` for non-exception paths first.
4. Gradually lower exception thresholds and remove exception entries one-by-one.
