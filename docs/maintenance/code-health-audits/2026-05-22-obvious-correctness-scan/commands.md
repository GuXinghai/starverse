# Commands

## 2026-05-22

### `Get-Location`

Summary:
- Current working directory is `D:\Starverse`.

Interpretation:
- Confirms audit commands are being run from the requested project root.

### `git status --short`

Summary:
- Worktree was already dirty before audit file creation, with modified files under `infra/` and `src/`, plus untracked test/helper files.
- No source edits were made by this audit.

Interpretation:
- Findings should be interpreted against the current dirty worktree.
- Existing source/test/config changes must not be reverted, staged, committed, or modified during this audit.

### `Get-ChildItem -Force`

Summary:
- Repository contains `src/`, `infra/`, `electron/`, `tests/`, `scripts/`, `docs/`, `node_modules/`, package files, Vite/Vitest/TypeScript configs, and build artifacts.

Interpretation:
- Confirms the repo shape and likely validation stack.

### `rg --files -g AGENTS.md -g package.json -g tsconfig*.json -g vite.config.* -g vitest.config.* -g electron.vite.config.*`

Summary:
- Found `AGENTS.md`, `package.json`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.model-catalog.json`, `vite.config.ts`, `vitest.config.ts`, and `electron.vite.config.ts`.

Interpretation:
- Next step is to inspect these configuration files and package scripts before running targeted checks.

### `Get-Content -Raw package.json`

Summary:
- Confirmed package scripts and dependency stack.
- `test`, `db:verify`, and `verify:ssot` run `npm run rebuild:node`.
- `electron:dev` runs `npm run rebuild:electron`.
- `build` runs clean/build steps and emits artifacts.

Interpretation:
- Full test/build/smoke scripts are not safe first-pass audit commands under the read-only constraint because native rebuilds or generated artifacts may change files outside the audit directory.

### `Get-Content -Raw tsconfig.json`

Summary:
- Main project uses `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `allowUnreachableCode: false`, and `noEmit: true`.
- Includes `src/**/*.ts`, `src/**/*.tsx`, `src/**/*.vue`, `electron`, `infra/**/*.ts`, and `tests/**/*.ts`.

Interpretation:
- A non-emitting TypeScript/Vue check should expose many in-scope correctness issues without build output.

### `Get-Content -Raw tsconfig.node.json`

Summary:
- Node config includes `vite.config.ts`, uses `composite: true`, and strict lint-like TypeScript options.

Interpretation:
- Node config can be checked separately if needed, but composite mode makes write avoidance important.

### `Get-Content -Raw vitest.config.ts`

Summary:
- Vitest uses Vue plugin, `jsdom`, `./tests/setup.ts`, and V8 coverage when coverage is requested.

Interpretation:
- Targeted Vitest runs may be useful later, but DB-heavy tests should follow the project ABI policy and are not the first read-only check.

### `Get-Content -Raw vite.config.ts`

Summary:
- Vite config uses Vue, Electron plugin, CSP injection, `@` alias to `src`, and renderer plugin disabled under `NODE_ENV=test`.

Interpretation:
- Import alias and Electron preload/main entry points are likely validation seams.

### `Get-Content -Raw electron.vite.config.ts`

Summary:
- Electron-vite has main inputs `electron/main.ts` and `electron/db/worker.ts`, preload inputs `electron/preload.ts` and `electron/preload/inapp-preload.ts`, and renderer alias `@renderer` to `src`.

Interpretation:
- Separate Electron build checks would emit artifacts and are not suitable for this read-only audit pass.

### Delegated targeted validation: `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false`

Summary:
- Delegated to `test_runner`; exit code `1`.
- No files were edited or written by the delegated runner.
- Reported compile failures in:
  - `electron/db/workerManager.ts`: missing `isProduction` on stored `Pick<WorkerInitConfig, ...>`.
  - `infra/db/repo/fileTypeVerdictRepo.test.ts`: `FileTypeVerdict` imported from a module that does not export it.
  - `src/next/file-type/externalProcessRunner.ts`: `stdio: ['ignore', 'pipe', 'pipe']` incompatible with `SpawnOptionsWithoutStdio`.
  - `src/next/file-type/fileTypeStaticPolicy.ts`: missing `SendRoute`.
  - `src/next/file-type/packagingRegressionSmoke.test.ts`: `TrustVerificationStatus` imported from a module that does not export it.
  - Several TS6133/TS6196 unused declaration errors in file-type tests and `externalEngineRegistry.ts`.

Interpretation:
- Confirms current project typecheck is blocked by obvious compile errors without invoking package scripts that rebuild native modules or emit build artifacts.

### Delegated read-only mapping: `code_mapper`

Summary:
- Mapped high-yield areas around DB worker startup, file-type routing/packaging, external process execution, Vite config, and `.vue` type imports.
- Reported likely validation commands and affected symbols.

Interpretation:
- The mapper output guided narrow local snippet reads and avoided broad source reading in the parent context.

### `rg -n "WorkerInitConfig|workerInitFlags|isProduction" electron infra src`

Summary:
- Found `workerInitFlags` storage and `start()` parameter mismatch in `electron/db/workerManager.ts`.
- Found `WorkerInitConfig.isProduction` in `infra/db/types.ts`.
- Found runtime use of `config.isProduction` in `infra/db/worker/runtime.ts`.
- Found production flag passed from `electron/main.ts`.

Interpretation:
- Confirms FIND-001 is a stale type mismatch in the worker manager, not an absent field in `WorkerInitConfig`.

### `rg -n "FileTypeVerdict|TrustVerificationStatus|SendRoute" infra src tests`

Summary:
- Found canonical `SendRoute` export in `src/next/file-type/types.ts`.
- Found canonical `FileTypeVerdict` export in `src/next/file-type/types.ts`.
- Found canonical `TrustVerificationStatus` export in `src/next/file-type/enginePluginTrustContracts.ts`.
- Found stale or non-exporting import paths in tests and policy code.

Interpretation:
- Confirms FIND-002, FIND-004, and FIND-005 are import/export mismatches with nearby canonical symbols.

### `rg -n "StdioPipe|stdio|spawnImpl|externalProcessRunner" src/next/file-type`

Summary:
- Found `SpawnImpl` and the mixed stdio tuple in `src/next/file-type/externalProcessRunner.ts`.
- Found downstream runner users and tests.

Interpretation:
- Confirms FIND-003 is in a shared external process helper, not isolated dead code.

### `rg -n "SearchConvoOption|SearchProjectOption|ConversationListItem|ProjectListItem" src/ui-app/app src/ui-app/components`

Summary:
- Found named type imports in `src/ui-app/app/appChatApp.logic.ts`.
- Found named type exports inside `SearchModal.vue` and `ConversationList.vue`.

Interpretation:
- Supports UNCERT-001. The types exist in SFC source, but plain `tsc` later could not see them through the default-only `*.vue` declaration.

### `rg -n "manualChunks|appCsp|normalizeAppCspEnv|injectAppCspIntoHtml|getAppCsp" vite.config.ts src/shared/security`

Summary:
- Found `vite.config.ts` importing `src/shared/security/appCsp`.
- Found `manualChunks` returning only inside the `node_modules` branch.

Interpretation:
- Guided the Node config typecheck in FIND-007.

### `git diff --name-only -- docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan`

Summary:
- No output at that time because the audit directory was untracked, not a tracked diff.

Interpretation:
- Confirmed no tracked source diffs were being produced by audit edits.

### Narrow evidence snippet reads

Commands:
```powershell
$lines = Get-Content electron/db/workerManager.ts; for ($i = 100; $i -le 155; $i++) { ... }
$lines = Get-Content infra/db/types.ts; for ($i = 1590; $i -le 1610; $i++) { ... }
$lines = Get-Content src/next/file-type/fileTypeStaticPolicy.ts; for ($i = 1; $i -le 105; $i++) { ... }
$lines = Get-Content src/next/file-type/externalProcessRunner.ts; for ($i = 1; $i -le 110; $i++) { ... }
$lines = Get-Content infra/db/repo/fileTypeVerdictRepo.test.ts; for ($i = 1; $i -le 45; $i++) { ... }
$lines = Get-Content src/next/file-type/packagingRegressionSmoke.test.ts; for ($i = 1; $i -le 90; $i++) { ... }
$lines = Get-Content src/next/file-type/externalEngineTypes.ts; for ($i = 1; $i -le 110; $i++) { ... }
$lines = Get-Content vite.config.ts; for ($i = 1; $i -le 90; $i++) { ... }
```

Summary:
- Read only targeted line ranges needed to verify compiler errors and import/export paths.

Interpretation:
- Provided line-level evidence for FIND-001 through FIND-007 without broad file reads.

### Failed quoted search command

Command:
```powershell
rg -n "export .*FileTypeVerdict|from './types'|from \"./types\"" src/next/file-type/index.ts src/next/file-type.ts src/next/file-type
```

Summary:
- Failed with a PowerShell parser error due quoting around `\"./types\"`.

Interpretation:
- No audit evidence was taken from this failed command. Later searches and direct file reads replaced it.

### Additional narrow snippet reads

Commands:
```powershell
$lines = Get-Content src/next/file-type/externalEngineRegistry.ts; for ($i = 1; $i -le 45; $i++) { ... }
$lines = Get-Content src/next/file-type/conversionRuntimePackage.test.ts; for ($i = 1; $i -le 45; $i++) { ... }
$lines = Get-Content src/next/file-type/enginePackageContract.test.ts; for ($i = 145; $i -le 165; $i++) { ... }
$lines = Get-Content src/next/file-type/pluginCatalogSignature.test.ts; for ($i = 100; $i -le 115; $i++) { ... }
$lines = Get-Content src/ui-app/app/appChatApp.logic.ts; for ($i = 170; $i -le 185; $i++) { ... }; for ($i = 2795; $i -le 2825; $i++) { ... }
$lines = Get-Content src/ui-app/components/SearchModal.vue; for ($i = 1; $i -le 20; $i++) { ... }
$lines = Get-Content src/ui-app/components/ConversationList.vue; for ($i = 1; $i -le 30; $i++) { ... }
```

Summary:
- Confirmed unused declarations reported by TypeScript.
- Confirmed SFC-local named type exports for UNCERT-001.

Interpretation:
- Supports FIND-006 and UNCERT-001.

### `rg --files src/next/file-type | rg "index\.ts$|types\.ts$"`

Summary:
- Found `src/next/file-type/index.ts` and `src/next/file-type/types.ts`.

Interpretation:
- Confirmed file-type barrel and type module locations before checking exports.

### `Get-Content -Raw src/next/file-type/index.ts`

Summary:
- File-type barrel re-exports `./types`, `./externalEngineTypes`, `./enginePluginTrustContracts`, and related modules.

Interpretation:
- Confirms canonical exports are available through the file-type package, but the failing tests import from narrower modules that do not export the requested names.

### `.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --incremental false`

Summary:
- Exit code `1`.
- Output: `tsconfig.node.json(2,3): error TS6379: Composite projects may not disable incremental compilation.`

Interpretation:
- This invocation was invalid for the composite Node project and was not used as code evidence.
- A retry used an audit-local build info file to avoid writing root build artifacts.

### `.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --tsBuildInfoFile docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo`

Summary:
- Exit code `1`.
- Reported:
  - `vite.config.ts(5,69): error TS6307` because `src/shared/security/appCsp.ts` is imported but outside the `tsconfig.node.json` file list.
  - `vite.config.ts(72,9): error TS7030` because not all `manualChunks` code paths return a value.

Interpretation:
- Confirms FIND-007.
- The temporary build-info path was inside the allowed audit directory.

### `Remove-Item -LiteralPath docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo -ErrorAction SilentlyContinue`

Summary:
- Removed the audit-local temporary TypeScript build-info file if it existed.

Interpretation:
- Keeps the required audit directory focused on report files.

### `Test-Path docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo`

Summary:
- Returned `False`.

Interpretation:
- Confirms the temporary audit-local build-info file was not left behind.

### `git status --short -- docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan`

Summary:
- Shows the audit directory as untracked.

Interpretation:
- Confirms report files are the only audit-owned worktree additions under the requested directory.

### `git status --short`

Summary:
- Current worktree still contains pre-existing source/test modifications outside the audit directory.
- The audit did not edit those files.

Interpretation:
- Final report must state that source, tests, configs, scripts, and existing docs outside the audit directory were not modified by this audit.

### Direct validation: `.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false`

Summary:
- Exit code `1`.
- Reproduced the delegated `vue-tsc` failures:
  - FIND-001 through FIND-006.
  - No TS2614 errors for named type imports from `.vue` files.

Interpretation:
- Confirms the main Vue-aware typecheck is blocked by the recorded findings.
- Supports keeping `.vue` named type imports in `blocked-or-uncertain.md` rather than `findings.md`.

### Direct validation: `.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit --pretty false --incremental false`

Summary:
- Exit code `1`.
- Reproduced the same errors as `vue-tsc`.
- Additionally reported TS2614 for named type imports from `*.vue` in `src/ui-app/app/appChatApp.logic.ts`.

Interpretation:
- Confirms plain `tsc` cannot see named SFC type exports under the current default-only `*.vue` declaration.
- Because `vue-tsc` did not reproduce those TS2614 errors and the package build uses `vue-tsc`, this is recorded as UNCERT-001.

### `rg -n "declare module ['\"]\*\.vue|vue'" src tests electron infra -g "*.d.ts" -g "*.ts"`

Summary:
- Exit code `1`; no matching declaration text was found in those searched files.

Interpretation:
- Needed a direct read of `src/vite-env.d.ts` to verify the Vue module declaration.

### `rg --files -g "*.d.ts"`

Summary:
- Found `tests/vitest.d.ts`, `src/vite-env.d.ts`, `infra/types/pngjs.d.ts`, and `electron/electron-env.d.ts`.

Interpretation:
- Identified the likely Vue module declaration file.

### `Get-Content -Raw src/vite-env.d.ts`

Summary:
- `src/vite-env.d.ts` declares `*.vue` modules with only a default `DefineComponent` export.

Interpretation:
- Explains why plain `tsc` reports TS2614 for named imports from `.vue` modules.

### Final sanity check: report file list

Command:
```powershell
Get-ChildItem docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan | Select-Object -ExpandProperty Name
```

Summary:
- Found exactly the required report files:
  - `README.md`
  - `progress.md`
  - `findings.md`
  - `commands.md`
  - `blocked-or-uncertain.md`
  - `next-actions.md`

Interpretation:
- Confirms the persistent audit record has the requested file set.

### Final sanity check: temporary build info absent

Command:
```powershell
Test-Path docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo
```

Summary:
- Returned `False`.

Interpretation:
- Confirms no temporary TypeScript build-info file remains in the audit directory.

### Final sanity check: audit directory git status

Command:
```powershell
git status --short -- docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan
```

Summary:
- Shows the audit directory as untracked.

Interpretation:
- The audit files are present and unstaged. No staging or commit was performed.

### Final sanity check: overall git status

Command:
```powershell
git status --short
```

Summary:
- Shows pre-existing source/test modifications outside the audit directory, plus the untracked audit directory.

Interpretation:
- Source, tests, configs, scripts, lockfiles, generated files, and existing docs outside the audit directory were not intentionally modified by this audit.

### Triage input read: required audit files

Commands:
```powershell
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/README.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/findings.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/blocked-or-uncertain.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/commands.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/progress.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/next-actions.md
```

Summary:
- Read the six required audit files before triage.

Interpretation:
- Triage was based only on the existing audit record and did not require source, test, config, or script edits.

### Triage report update

Summary:
- Created `triage.md`.
- Updated `progress.md`, `next-actions.md`, and `commands.md` inside the audit directory.

Interpretation:
- The only writes for this triage pass were inside `docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/`.

### Triage final sanity check

Commands:
```powershell
Get-ChildItem docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan | Select-Object -ExpandProperty Name
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/triage.md
git status --short -- docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan
git status --short
```

Summary:
- Confirmed `triage.md` exists alongside the six original required report files.
- Read back `triage.md` successfully.
- Git status showed the audit directory as untracked.
- Overall git status output showed only the audit docs directory at this check.

Interpretation:
- Triage writes remain confined to the audit directory.
- No staging or commit was performed.

### Coordinated repair pass: required audit reads

Commands:
```powershell
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/triage.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/findings.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/commands.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/progress.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/blocked-or-uncertain.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/next-actions.md
```

Summary:
- Read the required audit files before implementation.

Interpretation:
- The repair pass used the audit record as source of truth and targeted only the five triaged batches.

### Coordinated repair pass: initial git status and diff

Commands:
```powershell
git status --short
git diff --stat
git diff -- . ':(exclude)docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo'
```

Summary:
- Initial tracked diff was clean.
- The only reported worktree item was the untracked audit directory.

Interpretation:
- Source/config/test edits made during the repair pass are attributable to this pass.

### Coordinated repair pass: `code_mapper`

Summary:
- Delegated a read-only `code_mapper` before implementation.
- The mapper confirmed ownership and data flow for:
  - `WorkerInitFlags` and restart preservation in `electron/db/workerManager.ts`.
  - Canonical file-type exports in `src/next/file-type/types.ts` and `src/next/file-type/enginePluginTrustContracts.ts`.
  - Mixed stdio typing in `src/next/file-type/externalProcessRunner.ts`.
  - Strict-unused declarations in file-type tests and `src/next/file-type/externalEngineRegistry.ts`.
  - The Node config boundary around `vite.config.ts` and `src/shared/security/appCsp.ts`.

Interpretation:
- Batches 1 through 4 were unambiguous.
- Batch 5 had multiple credible architecture directions for the CSP helper project boundary.

### Coordinated repair pass: source/config patch

Summary:
- Patched:
  - `electron/db/workerManager.ts`
  - `infra/db/repo/fileTypeVerdictRepo.test.ts`
  - `src/next/file-type/fileTypeStaticPolicy.ts`
  - `src/next/file-type/packagingRegressionSmoke.test.ts`
  - `src/next/file-type/conversionRuntimePackage.test.ts`
  - `src/next/file-type/enginePackageContract.test.ts`
  - `src/next/file-type/pluginCatalogSignature.test.ts`
  - `src/next/file-type/externalEngineRegistry.ts`
  - `src/next/file-type/externalProcessRunner.ts`
  - `vite.config.ts`
  - `tsconfig.node.json`

Interpretation:
- Batches 1 through 4 were patched.
- Batch 5 was partially patched; the `tsconfig.node.json` direction is blocked by DEC-001.

### Coordinated repair pass: `vue-tsc`

Command:
```powershell
.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false
```

Summary:
- Exit code `1`.
- Reported:
  `error TS6305: Output file 'D:/Starverse/src/shared/security/appCsp.d.ts' has not been built from source file 'D:/Starverse/src/shared/security/appCsp.ts'.`

Interpretation:
- Original FIND-001 through FIND-006 compile errors were cleared from the observed output.
- The remaining failure is the new Batch 5 project-boundary decision point: `src/shared/security/appCsp.ts` is now included in `tsconfig.node.json` while also matching the root `tsconfig.json` `src/**/*.ts` include and the root project references `tsconfig.node.json`.

### Coordinated repair pass: Node config typecheck

Command:
```powershell
.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --tsBuildInfoFile docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo
```

Summary:
- Exit code `0`.

Interpretation:
- The explicit `manualChunks` return and current direct `appCsp.ts` include satisfy the isolated Node config check.
- This cannot be accepted alone because the same direct include breaks the root Vue-aware typecheck.

### Coordinated repair pass: delegated validation

Commands:
```powershell
git diff --check
.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false
.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --tsBuildInfoFile docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo
.\node_modules\.bin\vitest.cmd --run src/next/file-type/externalProcessRunner.test.ts src/next/file-type/fileTypeStaticPolicy.test.ts src/next/file-type/conversionRuntimePackage.test.ts src/next/file-type/enginePackageContract.test.ts src/next/file-type/packagingRegressionSmoke.test.ts src/next/file-type/pluginCatalogSignature.test.ts
```

Summary:
- `git diff --check`: exit code `0`; only line-ending warnings.
- `vue-tsc`: exit code `1`; same TS6305 `appCsp.ts` project-boundary failure.
- `tsc -p tsconfig.node.json`: exit code `0`.
- Targeted Vitest: exit code `0`; 6 files passed, 148 tests passed.
- The audit-local `tsconfig.node.audit.tsbuildinfo` was removed after validation.

Interpretation:
- File-type and process-runner targeted tests passed.
- Main compile validation is blocked by DEC-001.
- DB-heavy `infra/db/repo/fileTypeVerdictRepo.test.ts` was not run because it requires `npm run rebuild:node` first.

### Coordinated repair pass: delegated risk review

Summary:
- `risk_reviewer` reported no P0 findings.
- `risk_reviewer` reported one P1 blocker:
  - `tsconfig.node.json` includes `src/shared/security/appCsp.ts`, while `tsconfig.json` includes the same source and references the Node project, causing TS6305 in root typechecks.
- `risk_reviewer` reported explicit non-issues:
  - `src/next/file-type/externalProcessRunner.ts` remains behavior-preserving for `shell: false`, argv-array execution, timeout handling, and output caps.
  - `electron/db/workerManager.ts` preserves stored init flags through scheduled restart.

Interpretation:
- Further source/config edits are stopped until DEC-001 is resolved.

### Coordinated repair pass: build-info cleanup

Command:
```powershell
Remove-Item -LiteralPath docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo -ErrorAction SilentlyContinue
Remove-Item -LiteralPath tsconfig.node.tsbuildinfo -ErrorAction SilentlyContinue
```

Summary:
- Removed ignored TypeScript build-info artifacts if present.

Interpretation:
- No generated TypeScript build-info artifact should be included in the repair pass.

### DEC-001 input read and status check

Commands:
```powershell
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/decision-points.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/triage.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/findings.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/commands.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/progress.md
Get-Content -Raw docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/next-actions.md
git status --short
git diff --stat
git diff -- tsconfig.json tsconfig.node.json vite.config.ts src/shared/security/appCsp.ts src/shared/security/appCsp.test.ts
```

Summary:
- Read the required audit files before continuing from DEC-001.
- Current DEC-001 diff before resolution was the invalid direct `src/shared/security/appCsp.ts` include in `tsconfig.node.json` plus the valid `manualChunks` explicit return.

Interpretation:
- Confirmed Batch 5 was the only open batch and the direct `src` include needed to be replaced with a single-owner shared/config boundary.

### DEC-001 `code_mapper`

Summary:
- Delegated `code_mapper` to map TypeScript project references, include/exclude patterns, and all imports/usages of `src/shared/security/appCsp.ts`.
- Mapper found:
  - Root `tsconfig.json` owns `src/**/*.ts`, `src/**/*.tsx`, `src/**/*.vue`, `electron`, `infra/**/*.ts`, and `tests/**/*.ts`.
  - Node `tsconfig.node.json` is composite and had directly included `vite.config.ts` plus `src/shared/security/appCsp.ts`.
  - `vite.config.ts` and `src/shared/security/appCsp.test.ts` were the only consumers of the CSP helper.
  - No existing dedicated shared/config project boundary existed.

Interpretation:
- A narrow single-owner fix required moving the canonical CSP helper out of `src`.
- Keeping the helper under `src` while adding a second project boundary would preserve the root/project overlap.

### DEC-001 temporary TypeScript reference experiment

Summary:
- A first temp experiment command was malformed and accidentally wrote then removed temporary probe files:
  - `src/b.ts`
  - `tsconfig.shared.json`
  - a temporary overwrite of `tsconfig.json`
- Those accidental probe artifacts were immediately removed/restored and `git status --short -- tsconfig.json` was clean afterward.
- A corrected temp experiment outside the repo confirmed that a referenced composite helper project fails under a no-build root typecheck with TS6305 unless declarations are built first.

Interpretation:
- A dedicated referenced shared composite project would require a broader declaration-build flow and was not the narrow DEC-001 repair.

### DEC-001 patch

Summary:
- Added `config/appCsp.ts`.
- Added `config/appCsp.test.ts`.
- Deleted `src/shared/security/appCsp.ts`.
- Deleted `src/shared/security/appCsp.test.ts`.
- Updated `vite.config.ts` to import from `./config/appCsp`.
- Updated `tsconfig.node.json` to include `vite.config.ts`, `config/appCsp.ts`, and `config/appCsp.test.ts`.

Interpretation:
- The CSP helper now has one TypeScript project owner: the Node/config composite project.
- CSP constants were moved, not duplicated.
- Runtime CSP semantics were intended to remain unchanged.

### DEC-001 delegated validation

Commands:
```powershell
git diff --check
.\node_modules\.bin\tsc.cmd -p tsconfig.node.json --noEmit --pretty false --tsBuildInfoFile docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo
.\node_modules\.bin\vue-tsc.cmd --noEmit --pretty false --incremental false
npx vitest --run config/appCsp.test.ts src/next/file-type/externalProcessRunner.test.ts src/next/file-type/fileTypeStaticPolicy.test.ts src/next/file-type/conversionRuntimePackage.test.ts src/next/file-type/enginePackageContract.test.ts src/next/file-type/packagingRegressionSmoke.test.ts src/next/file-type/pluginCatalogSignature.test.ts
rg -n "appCsp" tsconfig.json tsconfig.node.json vite.config.ts config src/shared/security
```

Summary:
- `git diff --check`: exit code `0`; line-ending warnings only.
- Node config typecheck: exit code `0`; audit-local build-info was created and removed.
- Root `vue-tsc`: exit code `0`.
- Targeted Vitest: exit code `0`; 7 files passed, 153 tests passed.
- `rg appCsp`: only expected config-owned references remained in `vite.config.ts`, `tsconfig.node.json`, and `config/appCsp.test.ts`.

Interpretation:
- DEC-001 is resolved by validation.
- No generated `tsconfig.node.audit.tsbuildinfo` was left behind.

### DEC-001 delegated risk review

Summary:
- `risk_reviewer` reported no P0 or P1 findings.
- It confirmed:
  - CSP env normalization, CSP generation, and placeholder injection are unchanged in substance.
  - `config/appCsp.test.ts` resolves the repo root correctly from the new `config/` location.
  - `vite.config.ts` still injects CSP through `transformIndexHtml`.
  - `tsconfig.node.json` now owns `config/appCsp.ts`, removing the prior `src/shared/security` overlap.
  - External process runner behavior and DB worker restart propagation remain non-regressions.

Interpretation:
- No code fix remained after DEC-001 validation and risk review.

### DEC-001 additional grep checks

Commands:
```powershell
rg -n "src/shared/security/appCsp|onHeadersReceived\(|registerDevCspHeaders\(" .
rg -n "isProduction|startupRebuildReason|stampSchemaVersion" electron/db/workerManager.ts electron/main.ts infra/db/worker/runtime.ts -S
```

Summary:
- The first grep only found historical audit documentation references and the moved CSP regression guard assertions.
- The second grep confirmed `isProduction`, `startupRebuildReason`, and `stampSchemaVersion` still flow through `electron/main.ts`, `electron/db/workerManager.ts`, and `infra/db/worker/runtime.ts`.

Interpretation:
- No live import of `src/shared/security/appCsp` remains.
- DB worker startup/restart flag propagation remains visible in the intended files.

### DEC-001 final sanity check

Commands:
```powershell
git diff --check
Test-Path docs/maintenance/code-health-audits/2026-05-22-obvious-correctness-scan/tsconfig.node.audit.tsbuildinfo
Test-Path tsconfig.node.tsbuildinfo
Get-ChildItem -Force -LiteralPath . -Filter *.tsbuildinfo
Remove-Item -LiteralPath tsconfig.tsbuildinfo -ErrorAction SilentlyContinue
git status --short
```

Summary:
- `git diff --check` passed with line-ending warnings only.
- The audit-local `tsconfig.node.audit.tsbuildinfo` file was absent.
- `tsconfig.node.tsbuildinfo` was absent.
- A root ignored `tsconfig.tsbuildinfo` file was found during final artifact scan and removed.
- `git status --short` showed only the intended tracked source/config/test changes plus untracked `config/` and audit docs.

Interpretation:
- No TypeScript build-info artifacts remain after cleanup.
- No staging or commit was performed.
