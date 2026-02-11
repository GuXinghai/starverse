# Phase 2 Close-out / Freeze

## 1. Objective

Phase 2 close-out freezes delivery into an auditable, regression-ready, maintainable milestone.

Scope of this freeze:
- Documentation consolidation (single source of truth)
- Acceptance command consolidation
- Close-out PR narrative template

Non-goal:
- No new business logic changes (except reproducibility/documentation fixes)

## 2. Done Criteria

Phase 2 is considered done when all of the following are true:
- Type check passes:
  - `npx tsc --noEmit --pretty false`
- ESLint has zero errors (warnings allowed):
  - `npx eslint . --ext .ts,.tsx,.vue --max-warnings=9999`
- Phase 2 key regression tests pass as a fixed set (see section 5)
- Streaming contracts remain stable:
  - Core/adapter boundary unchanged
  - Error two-layer model unchanged
  - Wire decode protocol-invalid classification unchanged
- Backward compatibility constraints hold (see section 7)

## 3. Delivered Scope by Sub-phase (Key Entrypoints Only)

This section is a freeze summary of completed work, not a re-planning artifact.

### 2.0 Main loop unification
- `src/next/live/openRouterLiveStream.ts`
- `src/next/streaming/core/streamSemanticCore.ts`
- `src/next/streaming/core/streamWireSemanticCore.ts`

### 2.1 Error semantics grading + OpenRouter alignment
- `src/next/errors/appError.ts`
- `src/next/errors/normalizeOpenRouterError.ts`
- `src/next/errors/openRouterErrorEnvelope.ts`
- `docs/architecture/ERROR_SEMANTICS_OPENROUTER.md`

### 2.2 / 2.3 / 2.4 / 2.5 / 2.6 / 2.7 Streaming core extraction + IPC/fetch convergence
- `src/next/streaming/core/streamSemanticCore.ts`
- `src/next/streaming/core/streamWireSemanticCore.ts`
- `src/next/live/openRouterLiveStream.ts`
- `src/next/live/openRouterLiveStream.parity.test.ts`

### 2.8-C CI/scripts/ESLint/TSC baseline zero
- `scripts/lint-changed.cjs`
- `.github/workflows/ci.yml`
- `package.json`

### 2.8-B Wire schema decode
- `src/next/ipc/contracts/openRouterStreamWireContracts.ts`
- `src/next/ipc/contracts/openRouterStreamWireContracts.test.ts`
- `src/next/ipc/contracts/decodeError.ts`

### 2.8-A completionOutcome incremental fields
- `src/next/state/types.ts`
- `src/next/state/reducerCore.ts`
- `src/ui-app/AppChatApp.vue`
- `src/next/message/messageClient.ts`
- `infra/db/repo/messageRepo.ts`

Final checks completed for 2.8-A:
- IPC decode contract covers `setStatus(metaPatch)`:
  - `src/next/ipc/contracts/dbBridgeContracts.test.ts`
- `metaPatch` merge semantics preserve existing meta:
  - `infra/db/repo/messageRepo.appendDeltaGuard.test.ts`

## 4. Core Contracts (Frozen)

### 4.1 Streaming semantics: core vs adapter boundary
- Core (`src/next/streaming/core`):
  - SSE decode, chunk mapping, terminal arbitration, timing snapshots, error normalization hand-off
- Adapter (`src/next/live/openRouterLiveStream.ts` and IPC bridge path):
  - Transport I/O (fetch/Electron IPC), abort lifecycle, environment switches, side-effect wiring
- Rule:
  - Core does not depend on Electron channel semantics
  - Adapter does not reinterpret core terminal semantics

### 4.2 Error semantics: two-layer model
- Classification layer (`AppError`):
  - `appPhase` + `category` + `grade`
- Terminal layer (`DomainEvent` timing/end):
  - `endReason`
- Current frozen mapping includes:
  - `local_protocol_error / protocol_invalid / grade=3`
  - terminal `endReason=transport_error` (compatibility choice)

### 4.3 completionOutcome incremental field
- `completionOutcome` is additive and incremental
- Legacy terminal semantics remain unchanged:
  - `completionClass` unchanged
  - `endReason` unchanged
- Persistence path:
  - renderer sends `metaPatch`
  - DB patch merges without clobbering existing meta keys

### 4.4 Wire decode contract
- Wire event decode is schema-first via zod:
  - `decodeOpenRouterStreamWireEvent(...)`
- Malformed wire payloads map to:
  - `appPhase=local_protocol_error`
  - `category=protocol_invalid`
  - `grade=3`
- Decode error type:
  - `IpcContractDecodeError`

## 5. Phase 2 Regression Command Block (Recommended)

Run from repo root.

```bash
npx tsc --noEmit --pretty false
npx eslint . --ext .ts,.tsx,.vue --max-warnings=9999
npx vitest run src/next/live/openRouterLiveStream.parity.test.ts src/next/streaming/core/streamSemanticCore.fetch.test.ts src/next/streaming/core/streamSemanticCore.ipc.test.ts src/ui-app/AppChatApp.streamSession.terminalIdempotency.test.ts src/next/state/reducerCore.snapshot.test.ts src/next/state/reducer.timing.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts src/next/ipc/contracts/openRouterStreamWireContracts.test.ts
```

Notes:
- ESLint warnings are currently allowed in this freeze command (`--max-warnings=9999`), but errors must be zero.
- The vitest set above is the fixed Phase 2 regression subset for streaming parity/core/session/reducer/contracts.

## 6. lint:changed Usage (Local vs CI)

### Local mode

By default, local mode lints staged + unstaged + untracked changed `ts/tsx/vue` files:

```bash
npm run lint:changed
```

Optional (exclude untracked):

```bash
LINT_CHANGED_INCLUDE_UNTRACKED=0 npm run lint:changed
```

### CI mode

CI mode is enabled when `GITHUB_BASE_SHA` (or PR base context) is present.
The script lints files in `GITHUB_BASE_SHA...HEAD`.

Typical CI invocation:

```bash
GITHUB_BASE_SHA=<base_commit_sha> GITHUB_BASE_REF=<base_ref> npm run lint:changed
```

## 7. Backward Compatibility and Evolution Constraints

Frozen compatibility constraints:
- `ErrorEnvelope` external shape remains backward compatible
- DB schema remains unchanged for Phase 2 close-out
- Default redaction/sanitization strategy remains unchanged (`sanitizeErrorEnvelope`)

Future `endReason` refinement rule (example: adding `protocol_error`):
- Use additive introduction first (new enum value, old values still valid)
- Keep a compatibility window with dual-read / dual-write semantics if needed
- Do not reinterpret old persisted `transport_error` rows as a breaking rewrite

## 8. Troubleshooting

### better-sqlite3 Node ABI mismatch

Symptom keywords (typical):
- `NODE_MODULE_VERSION`
- `was compiled against a different Node.js version`
- `Module did not self-register`
- `better_sqlite3.node` load failure

When rebuild is needed:
- Node version changed (especially major/minor ABI boundary)
- Fresh dependency reinstall pulled a prebuilt binary mismatch
- Local runtime changed between plain Node and Electron contexts

Recovery commands:

```bash
npm rebuild better-sqlite3
```

If Electron runtime also requires rebuild:

```bash
npm run rebuild:electron
```

Phase 2 note:
- A test-blocking ABI issue occurred and was resolved via `npm rebuild better-sqlite3`.

## 9. Close-out PR Template

## Motivation
- Freeze Phase 2 into an auditable and regression-ready milestone.
- Consolidate SSOT documentation, verification commands, and compatibility constraints.

## What changed (high-level)
- Added `docs/architecture/PHASE_2_CLOSEOUT.md` as Phase 2 close-out SSOT.
- Documented delivered scope by sub-phase and core frozen contracts.
- Added reproducible regression command block and `lint:changed` local/CI usage.
- Added troubleshooting guide for better-sqlite3 ABI mismatch.

## What did NOT change (non-goals)
- No new business logic introduced.
- No DB schema migration introduced.
- No `ErrorEnvelope` external contract break.

## How to verify
```bash
npx tsc --noEmit --pretty false
npx eslint . --ext .ts,.tsx,.vue --max-warnings=9999
npx vitest run src/next/live/openRouterLiveStream.parity.test.ts src/next/streaming/core/streamSemanticCore.fetch.test.ts src/next/streaming/core/streamSemanticCore.ipc.test.ts src/ui-app/AppChatApp.streamSession.terminalIdempotency.test.ts src/next/state/reducerCore.snapshot.test.ts src/next/state/reducer.timing.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts src/next/ipc/contracts/openRouterStreamWireContracts.test.ts
```

## Risks / Rollback notes
- Change set is docs/test-verification only; no runtime logic rollback needed.
- If environment-specific test failures occur, first check better-sqlite3 ABI and rebuild.
