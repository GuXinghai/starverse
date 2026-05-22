# Triage

Date: 2026-05-22

Purpose: group the seven confirmed compile-blocking findings by likely shared root cause and identify the smallest safe fix batches. This is triage only; no source, test, config, script, package, lockfile, or existing documentation files were changed.

## Shared Root Cause Groups

1. DB worker startup flag contract drift:
   - FIND-001
   - `DbWorkerManager.start()` accepts `isProduction`, downstream runtime consumes it, but the manager's persisted restart flag type omits it.

2. File-type type surface and import path drift:
   - FIND-002, FIND-004, FIND-005
   - Canonical types exist, but call sites or tests import from modules that do not export those names, or omit a required local type import.

3. External process runner overload mismatch:
   - FIND-003
   - The helper type selects the all-pipe child-process overload, but the implementation intentionally uses mixed stdio with ignored stdin.

4. File-type packaging/trust cleanup leftovers:
   - FIND-006
   - Unused constants, imports, and locals were left behind in strict TypeScript source/test files.

5. Node config project boundary and strict return typing:
   - FIND-007
   - `tsconfig.node.json` no longer includes all files imported by `vite.config.ts`, and `manualChunks` falls through under `noImplicitReturns`.

## Fix Batch 1: DB Worker Init Flag Contract

Findings:
- FIND-001

Affected files and symbols:
- `electron/db/workerManager.ts`: `DbWorkerManager.workerInitFlags`, `DbWorkerManager.start`
- `infra/db/types.ts`: `WorkerInitConfig`
- `infra/db/worker/runtime.ts`: `DbWorkerRuntime` use of `config.isProduction`
- `electron/main.ts`: `dbWorkerManager.start` call

Exact compile/test evidence:
- `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false`
- Error:
  `electron/db/workerManager.ts(150,50): error TS2339: Property 'isProduction' does not exist on type 'Pick<WorkerInitConfig, "stampSchemaVersion" | "startupRebuildReason">'.`

Likely root cause:
- `isProduction` was added to the worker startup flow, but only the `start()` parameter was widened. The manager field used on initial start and restart still stores a narrower `Pick`.

Minimal patch direction:
- Widen the `workerInitFlags` field to include `isProduction`, preferably by introducing one shared local alias for the init flags accepted by `start()` and persisted across restart.
- Verify the restart path at `workerManager.ts:534` still forwards the full flag set.

Expected tests to run:
- `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false`
- A targeted DB worker startup test if one already exists for `electron/db/workerManager.ts`; otherwise rely on typecheck plus the nearest DB worker lifecycle tests after ABI setup is authorized.
- If DB-heavy tests are run, first run `npm run rebuild:node` per the Starverse ABI policy.

Subagent usage:
- `code_mapper`: no, affected flow is already mapped.
- `risk_reviewer`: recommended only if the patch changes production/trusted-root behavior, not for a pure type alias alignment.
- `test_runner`: yes, for targeted validation after a fix.
- `doc_consistency`: no.

## Fix Batch 2: File-Type Type Surface And Import Paths

Findings:
- FIND-002
- FIND-004
- FIND-005

Affected files and symbols:
- `infra/db/repo/fileTypeVerdictRepo.test.ts`: `FileTypeVerdict`
- `infra/db/types.ts`: local-only imported `FileTypeVerdict`
- `src/next/file-type/types.ts`: `FileTypeVerdict`, `SendRoute`
- `src/next/file-type/fileTypeStaticPolicy.ts`: `pickDefaultRoutes`
- `src/next/file-type/packagingRegressionSmoke.test.ts`: `TrustVerificationStatus`
- `src/next/file-type/externalEngineTypes.ts`: local-only imported `TrustVerificationStatus`
- `src/next/file-type/enginePluginTrustContracts.ts`: canonical `TrustVerificationStatus`

Exact compile/test evidence:
- `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false`
- Errors:
  - `infra/db/repo/fileTypeVerdictRepo.test.ts(8,40): error TS2459: Module '"../types"' declares 'FileTypeVerdict' locally, but it is not exported.`
  - `src/next/file-type/fileTypeStaticPolicy.ts(83,78): error TS2304: Cannot find name 'SendRoute'.`
  - `src/next/file-type/packagingRegressionSmoke.test.ts(25,44): error TS2459: Module '"./externalEngineTypes"' declares 'TrustVerificationStatus' locally, but it is not exported.`

Likely root cause:
- File-type domain types were split across narrower modules, but imports were left pointing at modules that only import those names locally. `fileTypeStaticPolicy` also gained an explicit route return type without adding the matching `SendRoute` import.

Minimal patch direction:
- Prefer direct imports from canonical modules for tests and policy code:
  - `FileTypeVerdict` from `src/next/file-type/types` or the established file-type barrel.
  - `SendRoute` from `./types`.
  - `TrustVerificationStatus` from `./enginePluginTrustContracts`.
- Only add re-exports if the owning module is intentionally a public type surface; avoid broad barrel changes unless needed by existing conventions.

Expected tests to run:
- `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false`
- `npx vitest --run infra/db/repo/fileTypeVerdictRepo.test.ts src/next/file-type/fileTypeStaticPolicy.test.ts src/next/file-type/packagingRegressionSmoke.test.ts`
- Because `fileTypeVerdictRepo.test.ts` is DB-heavy, run `npm run rebuild:node` before that Vitest command if it is included.

Subagent usage:
- `code_mapper`: no, canonical symbol locations are known.
- `risk_reviewer`: no for import-only fixes; use only if trust verification behavior changes.
- `test_runner`: yes, for the targeted Vitest command and typecheck.
- `doc_consistency`: no.

## Fix Batch 3: External Process Runner Spawn Typing

Findings:
- FIND-003

Affected files and symbols:
- `src/next/file-type/externalProcessRunner.ts`: `SpawnImpl`, `runExternalProcess`, `child`, spawn options at `stdio`

Exact compile/test evidence:
- `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false`
- Error:
  `src/next/file-type/externalProcessRunner.ts(93,15): error TS2322: Type '"ignore"' is not assignable to type 'StdioPipe'.`
- `risk_reviewer` classified this as a high-confidence process-execution type contract mismatch, not a broader process-security issue.

Likely root cause:
- The local helper type uses `SpawnOptionsWithoutStdio` and `ChildProcessWithoutNullStreams`, selecting the overload where stdio is all pipe-compatible. The implementation uses `['ignore', 'pipe', 'pipe']`, which is a different overload shape.

Minimal patch direction:
- Align the local `SpawnImpl` options and child process type with the actual mixed stdio tuple.
- Preserve existing behavior: `shell: false`, array args, hidden windows, ignored stdin, piped stdout/stderr, and timeout/termination handling.

Expected tests to run:
- `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false`
- `npx vitest --run src/next/file-type/externalProcessRunner.test.ts`
- Grep after the patch for any remaining `SpawnOptionsWithoutStdio` plus `['ignore', 'pipe', 'pipe']` mismatch in this helper.

Subagent usage:
- `code_mapper`: no, affected helper is isolated.
- `risk_reviewer`: yes, because the patch touches process execution typing.
- `test_runner`: yes, for typecheck and the targeted runner tests.
- `doc_consistency`: no.

## Fix Batch 4: Strict Unused Declarations

Findings:
- FIND-006

Affected files and symbols:
- `src/next/file-type/conversionRuntimePackage.test.ts`: `HEX_A`, `HEX_B`, `HEX_3`, `HEX_4`, `HEX_9`
- `src/next/file-type/enginePackageContract.test.ts`: `result`
- `src/next/file-type/externalEngineRegistry.ts`: `FileFormatId`, `EngineHealthStatus`
- `src/next/file-type/packagingRegressionSmoke.test.ts`: `ConversionPackageSeed`, `H_B`, `H_C`, `H_D`, `H_E`, `H_F`, `H_2`
- `src/next/file-type/pluginCatalogSignature.test.ts`: `otherKeyPair`, `otherKeyId`

Exact compile/test evidence:
- `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false`
- Errors:
  - TS6133 for unused constants/imports/locals in the listed test files.
  - TS6133 for `FileFormatId` and TS6196 for `EngineHealthStatus` in `externalEngineRegistry.ts`.

Likely root cause:
- Recent packaging/trust test edits left unused fixtures and imports under a strict `noUnusedLocals` project config.

Minimal patch direction:
- Remove unused declarations where they are truly leftover.
- If a declaration was intended to support an assertion, add the missing assertion instead of deleting blindly.
- Treat the source-file cleanup in `externalEngineRegistry.ts` separately inside the same batch review because it is production code, not fixture-only cleanup.

Expected tests to run:
- `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false`
- `npx vitest --run src/next/file-type/conversionRuntimePackage.test.ts src/next/file-type/enginePackageContract.test.ts src/next/file-type/packagingRegressionSmoke.test.ts src/next/file-type/pluginCatalogSignature.test.ts`
- Add `src/next/file-type/externalEngineRegistry` coverage only if existing tests are known; likely `src/next/file-type/packagingRegressionSmoke.test.ts` exercises it.

Subagent usage:
- `code_mapper`: no.
- `risk_reviewer`: no, unless cleanup changes registry behavior rather than unused imports.
- `test_runner`: yes, for targeted Vitest and typecheck.
- `doc_consistency`: no.

## Fix Batch 5: Node Config Typecheck

Findings:
- FIND-007

Affected files and symbols:
- `tsconfig.node.json`: `include`
- `vite.config.ts`: import of `./src/shared/security/appCsp`
- `vite.config.ts`: `build.rollupOptions.output.manualChunks`

Exact compile/test evidence:
- Invalid first attempt:
  `.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --incremental false`
  reported `TS6379` because composite projects may not disable incremental compilation.
- Valid read-only audit attempt:
  `.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --tsBuildInfoFile docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo`
- Errors:
  - `vite.config.ts(5,69): error TS6307: File 'D:/Starverse/src/shared/security/appCsp.ts' is not listed within the file list of project 'D:/Starverse/tsconfig.node.json'.`
  - `vite.config.ts(72,9): error TS7030: Not all code paths return a value.`

Likely root cause:
- `vite.config.ts` now imports a shared source helper while the composite Node project still includes only `vite.config.ts`.
- `manualChunks` relies on implicit `undefined` for non-`node_modules` ids, but `tsconfig.node.json` enables `noImplicitReturns`.

Minimal patch direction:
- Expand the Node config project boundary to include the CSP helper, or move the helper behind a config-local module if source imports are not desired.
- Add an explicit `return undefined` for the non-`node_modules` `manualChunks` path or restructure so every path returns.
- Avoid running the check in a way that writes root `tsconfig.node.tsbuildinfo`; use an audit-local or temp build-info path during validation.

Expected tests to run:
- `.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --tsBuildInfoFile docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo`
- Remove the audit-local `tsconfig.node.audit.tsbuildinfo` after validation.
- `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false` after all compile batches are patched.

Subagent usage:
- `code_mapper`: no.
- `risk_reviewer`: no, unless config changes alter CSP behavior rather than TypeScript project inclusion.
- `test_runner`: yes, for the Node config typecheck.
- `doc_consistency`: no.

## Recommended Fix Order

1. Batch 2: file-type type surface and import paths.
2. Batch 4: strict unused declarations.
3. Batch 3: external process runner spawn typing.
4. Batch 1: DB worker init flag contract.
5. Batch 5: Node config typecheck.

Rationale:
- Batches 2 and 4 are mostly local type hygiene in the same file-type area and should quickly reduce compiler noise.
- Batch 3 is isolated but touches process execution, so it should receive focused review.
- Batch 1 is small but touches startup production flag propagation and should be checked against restart behavior.
- Batch 5 is independent of app source typecheck and can be validated with a separate Node config command.

