# Findings

## FIND-001: DB worker production flag is accepted by `start()` but not stored in `workerInitFlags`

1. Issue id: FIND-001
2. Severity: blocker
3. Confidence: confirmed
4. Affected files and symbols:
   - `electron/db/workerManager.ts`: `DbWorkerManager.workerInitFlags`, `DbWorkerManager.start`
   - `infra/db/types.ts`: `WorkerInitConfig`
   - `infra/db/worker/runtime.ts`: `DbWorkerRuntime` constructor use of `config.isProduction`
   - `electron/main.ts`: call to `dbWorkerManager.start`
5. Evidence:
   - `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false` reports:
     `electron/db/workerManager.ts(150,50): error TS2339: Property 'isProduction' does not exist on type 'Pick<WorkerInitConfig, "stampSchemaVersion" | "startupRebuildReason">'.`
   - `electron/db/workerManager.ts:107` stores `workerInitFlags` as `Pick<WorkerInitConfig, 'stampSchemaVersion' | 'startupRebuildReason'>`.
   - `electron/db/workerManager.ts:135` accepts `initFlags?: Pick<WorkerInitConfig, 'stampSchemaVersion' | 'startupRebuildReason' | 'isProduction'>`.
   - `electron/db/workerManager.ts:150` reads `this.workerInitFlags.isProduction`.
   - `infra/db/types.ts:1598-1606` defines `WorkerInitConfig.isProduction?: boolean`.
   - `electron/main.ts:752-756` passes `isProduction` into `dbWorkerManager.start`.
   - `infra/db/worker/runtime.ts:294-296` consumes `config.isProduction` for trusted root behavior.
6. Suspected cause:
   - The stored restart flags were not widened when `isProduction` was added to the worker startup contract.
7. Suggested fix direction:
   - Update the stored flag type to include `isProduction`, or introduce a shared `WorkerInitFlags` alias used by both the field and `start()` parameter.
   - Confirm worker restart paths still preserve `isProduction`.
8. Dedicated fix phase recommended: yes

## FIND-002: File type verdict test imports a type from `infra/db/types` that is not exported there

1. Issue id: FIND-002
2. Severity: blocker
3. Confidence: confirmed
4. Affected files and symbols:
   - `infra/db/repo/fileTypeVerdictRepo.test.ts`: `FileTypeVerdict`
   - `infra/db/types.ts`: local imported `FileTypeVerdict`
   - `src/next/file-type/types.ts`: exported `FileTypeVerdict`
5. Evidence:
   - `vue-tsc` reports:
     `infra/db/repo/fileTypeVerdictRepo.test.ts(8,40): error TS2459: Module '"../types"' declares 'FileTypeVerdict' locally, but it is not exported.`
   - `infra/db/repo/fileTypeVerdictRepo.test.ts:8` imports `FileTypeVerdict` from `../types`.
   - `infra/db/types.ts:17-22` imports `FileTypeVerdict` from `../../src/next/file-type/types` for local use.
   - `infra/db/types.ts` does not re-export `FileTypeVerdict`.
   - `src/next/file-type/types.ts:246-256` exports `FileTypeVerdict`.
6. Suspected cause:
   - A test import path was left pointing at an infra type module after the canonical verdict type moved or stayed in `src/next/file-type/types`.
7. Suggested fix direction:
   - Import `FileTypeVerdict` from the canonical file-type type module, or deliberately re-export it from `infra/db/types` if that is intended as a public infra surface.
8. Dedicated fix phase recommended: yes

## FIND-003: External process runner spawn options type does not match the actual stdio tuple

1. Issue id: FIND-003
2. Severity: blocker
3. Confidence: confirmed
4. Affected files and symbols:
   - `src/next/file-type/externalProcessRunner.ts`: `SpawnImpl`, `runExternalProcess`, `child`
5. Evidence:
   - `vue-tsc` reports:
     `src/next/file-type/externalProcessRunner.ts(93,15): error TS2322: Type '"ignore"' is not assignable to type 'StdioPipe'.`
   - `src/next/file-type/externalProcessRunner.ts:11-15` defines `SpawnImpl` with `SpawnOptionsWithoutStdio` and `ChildProcessWithoutNullStreams`.
   - `src/next/file-type/externalProcessRunner.ts:87-94` passes `stdio: ['ignore', 'pipe', 'pipe']`.
   - `risk_reviewer` classified this as a high-confidence process-execution type contract mismatch, not a broader process-security issue.
   - `risk_reviewer` noted that `SpawnOptionsWithoutStdio.stdio` narrows to pipe-only stdio, while the implementation intentionally ignores stdin.
6. Suspected cause:
   - The helper was typed against the child-process overload for all-pipe stdio, but the implementation uses a mixed tuple that ignores stdin and pipes stdout/stderr.
7. Suggested fix direction:
   - Make the local spawn typing match the actual tuple shape, or widen the options type to `SpawnOptions` if ignoring stdin is intended.
   - Align the child process type with the overload selected by the final options.
8. Dedicated fix phase recommended: yes

## FIND-004: `fileTypeStaticPolicy` uses `SendRoute` without importing it

1. Issue id: FIND-004
2. Severity: blocker
3. Confidence: confirmed
4. Affected files and symbols:
   - `src/next/file-type/fileTypeStaticPolicy.ts`: `pickDefaultRoutes`
   - `src/next/file-type/types.ts`: `SendRoute`
5. Evidence:
   - `vue-tsc` reports:
     `src/next/file-type/fileTypeStaticPolicy.ts(83,78): error TS2304: Cannot find name 'SendRoute'.`
   - `src/next/file-type/fileTypeStaticPolicy.ts:2` imports `FileTypeConflict`, `FileTypeFlag`, `FileTypePrimary`, and `FileTypeStaticPolicyResult` from `./types`.
   - `src/next/file-type/fileTypeStaticPolicy.ts:83` returns `SendRoute[]`.
   - `src/next/file-type/types.ts:187` exports `SendRoute`.
6. Suspected cause:
   - Stale or incomplete type import after adding explicit route typing to the helper.
7. Suggested fix direction:
   - Add `SendRoute` to the type import from `./types`, or use `FileTypeStaticPolicyResult['defaultSendRoutes']` if that better matches the local pattern.
8. Dedicated fix phase recommended: yes

## FIND-005: Packaging smoke test imports `TrustVerificationStatus` from a module that only imports it locally

1. Issue id: FIND-005
2. Severity: blocker
3. Confidence: confirmed
4. Affected files and symbols:
   - `src/next/file-type/packagingRegressionSmoke.test.ts`: `TrustVerificationStatus`
   - `src/next/file-type/externalEngineTypes.ts`: local imported `TrustVerificationStatus`
   - `src/next/file-type/enginePluginTrustContracts.ts`: exported `TrustVerificationStatus`
5. Evidence:
   - `vue-tsc` reports:
     `src/next/file-type/packagingRegressionSmoke.test.ts(25,44): error TS2459: Module '"./externalEngineTypes"' declares 'TrustVerificationStatus' locally, but it is not exported.`
   - `src/next/file-type/packagingRegressionSmoke.test.ts:25` imports `TrustVerificationStatus` from `./externalEngineTypes`.
   - `src/next/file-type/externalEngineTypes.ts:2` imports `TrustVerificationStatus` from `./enginePluginTrustContracts` but does not export it.
   - `src/next/file-type/enginePluginTrustContracts.ts:59-65` exports `TrustVerificationStatus`.
6. Suspected cause:
   - Stale import path or missing intentional re-export after trust contract types were split from engine types.
7. Suggested fix direction:
   - Import `TrustVerificationStatus` from `./enginePluginTrustContracts`, or explicitly re-export it from `externalEngineTypes` if that module is intended as the public engine type surface.
8. Dedicated fix phase recommended: yes

## FIND-006: Strict unused declaration errors block the project typecheck

1. Issue id: FIND-006
2. Severity: blocker
3. Confidence: confirmed
4. Affected files and symbols:
   - `src/next/file-type/conversionRuntimePackage.test.ts`: `HEX_A`, `HEX_B`, `HEX_3`, `HEX_4`, `HEX_9`
   - `src/next/file-type/enginePackageContract.test.ts`: `result`
   - `src/next/file-type/externalEngineRegistry.ts`: `FileFormatId`, `EngineHealthStatus`
   - `src/next/file-type/packagingRegressionSmoke.test.ts`: `ConversionPackageSeed`, `H_B`, `H_C`, `H_D`, `H_E`, `H_F`, `H_2`
   - `src/next/file-type/pluginCatalogSignature.test.ts`: `otherKeyPair`, `otherKeyId`
5. Evidence:
   - `vue-tsc` reports TS6133 and TS6196 errors for all symbols listed above.
   - The repo `tsconfig.json` enables `noUnusedLocals` and `noUnusedParameters`, so these are compile-blocking errors, not lint-only warnings.
6. Suspected cause:
   - Recent file-type packaging and trust tests were edited without removing or using leftover fixtures and imports.
7. Suggested fix direction:
   - Remove unused declarations, or use them where an assertion was intended.
   - Treat `externalEngineRegistry.ts` separately from test fixture cleanup because it is source code.
8. Dedicated fix phase recommended: yes

## FIND-007: Node TypeScript project config fails on Vite config imports and `manualChunks`

1. Issue id: FIND-007
2. Severity: blocker
3. Confidence: confirmed
4. Affected files and symbols:
   - `tsconfig.node.json`: `include`
   - `vite.config.ts`: import of `./src/shared/security/appCsp`
   - `vite.config.ts`: `build.rollupOptions.output.manualChunks`
5. Evidence:
   - `.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --tsBuildInfoFile docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo` reports:
     - `tsconfig.node.json(2,3): error TS6379` when attempted with `--incremental false`; composite projects cannot disable incremental compilation.
     - Retried with a build-info file inside the audit directory.
     - `vite.config.ts(5,69): error TS6307: File 'D:/Starverse/src/shared/security/appCsp.ts' is not listed within the file list of project 'D:/Starverse/tsconfig.node.json'.`
     - `vite.config.ts(72,9): error TS7030: Not all code paths return a value.`
   - `tsconfig.node.json` includes only `vite.config.ts`.
   - `vite.config.ts:5` imports `./src/shared/security/appCsp`.
   - `vite.config.ts:72-80` has a `manualChunks(id)` callback that returns only inside the `node_modules` branch.
6. Suspected cause:
   - The Node TS project boundary was not updated when Vite config started importing shared source code.
   - `manualChunks` relies on implicit `undefined`, but `noImplicitReturns` is enabled in `tsconfig.node.json`.
7. Suggested fix direction:
   - Include the imported CSP helper in the Node TS project, move the helper behind a config-local module, or adjust the config project boundary intentionally.
   - Return `undefined` explicitly from `manualChunks` for non-`node_modules` ids, or restructure the callback so all paths return.
8. Dedicated fix phase recommended: yes

## 2026-05-22 Repair Pass Status

Status by finding:
- FIND-001: patched in `electron/db/workerManager.ts`; `WorkerInitFlags` now includes `isProduction` and the restart path continues to pass stored flags.
- FIND-002: patched in `infra/db/repo/fileTypeVerdictRepo.test.ts` by importing `FileTypeVerdict` from the canonical file-type surface.
- FIND-003: patched in `src/next/file-type/externalProcessRunner.ts`; the spawn helper type now matches ignored stdin with piped stdout/stderr. `risk_reviewer` found no process-execution behavior regression.
- FIND-004: patched in `src/next/file-type/fileTypeStaticPolicy.ts` by importing `SendRoute` from `./types`.
- FIND-005: patched in `src/next/file-type/packagingRegressionSmoke.test.ts` by importing `TrustVerificationStatus` from `./enginePluginTrustContracts`.
- FIND-006: patched by removing proven-unused declarations/imports in `src/next/file-type/conversionRuntimePackage.test.ts`, `src/next/file-type/enginePackageContract.test.ts`, `src/next/file-type/externalEngineRegistry.ts`, `src/next/file-type/packagingRegressionSmoke.test.ts`, and `src/next/file-type/pluginCatalogSignature.test.ts`.
- FIND-007: fixed. `vite.config.ts` now explicitly returns `undefined` from the non-`node_modules` `manualChunks` path. The CSP helper now lives under the config-owned boundary at `config/appCsp.ts`, and `tsconfig.node.json` includes that config-owned helper instead of directly including `src/shared/security/appCsp.ts`.

Validation result:
- Targeted file-type Vitest suites passed.
- Node config typecheck passed with the current partial config.
- Main `vue-tsc` now passes after DEC-001 resolution.

## 2026-05-22 DEC-001 Resolution Status

Changed files:
- `config/appCsp.ts`
- `config/appCsp.test.ts`
- `vite.config.ts`
- `tsconfig.node.json`
- Removed `src/shared/security/appCsp.ts`
- Removed `src/shared/security/appCsp.test.ts`

Validation result:
- `git diff --check`: passed.
- Node config typecheck with the audit-local `tsconfig.node.audit.tsbuildinfo`: passed.
- Root `vue-tsc`: passed.
- CSP/config and targeted file-type Vitest suites: passed, 7 files and 153 tests.
- `risk_reviewer`: passed with no P0/P1 findings.

Remaining caveat:
- DB-heavy `infra/db/repo/fileTypeVerdictRepo.test.ts` was not run because it requires `npm run rebuild:node` first under the Starverse ABI policy.
