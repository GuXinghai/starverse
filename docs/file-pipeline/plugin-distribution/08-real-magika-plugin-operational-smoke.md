# Real Magika Plugin Operational Smoke

## Status

Real Magika plugin operational smoke passed on 2026-05-14.

This is a validation record only. It does not start a new architecture phase.

## Scope

This smoke connected two completed themes:

- File Content Identification v1.0 managed Magika `detectFull` path.
- Plugin Distribution Platform package validation and management-state contracts.

The closeout is recorded under `plugin-distribution` because the smoke validated the real local Magika package through PDP-style manifest, inventory, trust, registration, and registry-state contracts before exercising `detectFull`. File identification behavior is cross-referenced through the gated Magika runtime tests and the real `detectFull` smoke.

## Local Package

Existing local package found:

- Location: `.starverse-engines/magika/`
- Git status: ignored by `.gitignore`
- Source: official npm package `magika`, whose package metadata points to `https://github.com/google/magika`
- Root package dependencies are local to `.starverse-engines/magika/`; Starverse root `package.json` and lockfiles were not modified.

Layout summary:

- `manifest.json`
- `package.json`
- `package-lock.json`
- `runtime/magika-pure-js-runtime.mjs`
- `model/standard_v3_3/model.json`
- `model/standard_v3_3/group1-shard1of1.bin`
- `model/standard_v3_3/config.min.json`
- `config/standard_v3_3/` duplicate model/config files
- `node_modules/magika/`
- `node_modules/@tensorflow/tfjs/`

The package did not include a PDP `inventory.json` file. PDP inventory validation was therefore performed by projecting inventory metadata from the existing managed Magika manifest and files, then validating that projected metadata with the current PDP contract.

One ignored local metadata adjustment was made to `.starverse-engines/magika/manifest.json`: `runtimeKind` was changed from `pure_js` to `local_loader` so the package matches the existing gated real test contract. The runtime remains the same pure-JS Node entry backed by the official `magika` npm package.

## Validation Results

Managed plugin validation:

- `validateMagikaPackageLayout`: passed.
- `discoverMagikaManagedPlugin`: passed.
- Manifest relative path and path-containment checks: passed.
- Manifest integrity hash checks for runtime, model, and config files: passed.
- Managed health check: passed.

PDP validation:

- PDP package manifest validation: passed using projected metadata.
- PDP artifact inventory validation: passed using projected runtime/model/config/license/attribution/signature metadata.
- Path safety validation: passed through PDP safe-relative-path validation.
- Hash and size validation: passed for existing runtime/model/config files.
- Signature/trust status: metadata-only dev/test signature envelope validated; cryptographic verification remains deferred by the current PDP contract.
- Executable trust: not approved by PDP metadata verification.
- `canEnableAfterVerification`: passed for metadata-only local registration.
- `registerLocalPackage`: passed with controlled root `dev_only`, install source `manual_local`, install ref `magika`.
- `createPdpRegistryRecord`: produced `registryState=verified`, `installState=installed`.

No production signing keys were invented or used. No production trust claim is made.

## Commands

Preflight:

```powershell
git status --short
git rev-parse --short HEAD
git diff --cached --name-only -- public/build-id.json
```

Initial result:

- `git status --short`: clean.
- HEAD: `0bc5f36`.
- `public/build-id.json`: not staged.

Discovery and package inspection included:

```powershell
rg --files docs/file-pipeline/file-type-detection-implementation docs/file-pipeline/plugin-distribution
Get-ChildItem -Force -Name .starverse-engines, .external-runtime-work -ErrorAction SilentlyContinue
Get-Content .gitignore
Get-ChildItem -Force -Recurse -Depth 2 .starverse-engines\magika
Get-Content .starverse-engines\magika\manifest.json
Get-Content .starverse-engines\magika\runtime\magika-pure-js-runtime.mjs
Get-Content .starverse-engines\magika\node_modules\magika\package.json
git check-ignore -v .starverse-engines/magika .starverse-engines/magika/manifest.json .starverse-engines/magika/node_modules/magika/package.json
```

Operational smoke:

```powershell
$env:STARVERSE_REAL_MAGIKA_PLUGIN_DIR=(Resolve-Path .\.starverse-engines\magika).Path
npx vitest --run .external-runtime-work/real-magika-operational-smoke/real-magika-operational-smoke.test.ts
```

Result: 2 tests passed.

Gated real Magika smoke:

```powershell
$env:STARVERSE_ENABLE_REAL_MAGIKA_TESTS='1'
$env:STARVERSE_REAL_MAGIKA_PLUGIN_DIR=(Resolve-Path .\.starverse-engines\magika).Path
npx vitest --run src/next/file-type/magikaClassifyRunner.real.test.ts
```

Result: 5 tests passed.

Targeted managed-plugin and file-identification tests:

```powershell
$env:STARVERSE_ENABLE_REAL_MAGIKA_TESTS='1'
$env:STARVERSE_REAL_MAGIKA_PLUGIN_DIR=(Resolve-Path .\.starverse-engines\magika).Path
npx vitest --run src/next/file-type/magikaManagedPlugin.test.ts src/next/file-type/magikaRuntimeLoader.test.ts src/next/file-type/magikaAdapter.test.ts infra/files/fileTypeDetectionService.test.ts
```

Result: 66 tests passed.

Targeted PDP contract tests:

```powershell
$env:STARVERSE_ENABLE_REAL_MAGIKA_TESTS='1'
$env:STARVERSE_REAL_MAGIKA_PLUGIN_DIR=(Resolve-Path .\.starverse-engines\magika).Path
npx vitest --run src/next/plugin-distribution/packageVerification.test.ts src/next/plugin-distribution/localPackageRegistration.test.ts src/next/plugin-distribution/registryModel.test.ts src/next/plugin-distribution/managementViewModel.test.ts
```

Result: 24 tests passed.

## Skipped Or Deferred

- No external clone was needed because a usable local package already existed.
- No real production signature was created.
- No production trust root was added.
- No generated Magika package, model file, node_modules tree, `.starverse-engines` content, or `.external-runtime-work` smoke harness was committed.
- No marketplace UI, auto-update, remote catalog fetch, third-party plugin ecosystem, document conversion, `provider_file_ref`, settings UI expansion, or plugin runtime expansion was started.

## Artifact Policy

Intentionally not committed:

- `.starverse-engines/magika/`
- `.external-runtime-work/`
- `.starverse-engines/magika/node_modules/`
- `.starverse-engines/magika/model/`
- `.starverse-engines/magika/config/`
- the ignored operational smoke harness under `.external-runtime-work/real-magika-operational-smoke/`

This smoke did not modify, stage, or commit `public/build-id.json`.

Final git status after committing this closeout is expected to be clean for tracked files. `.starverse-engines/` and `.external-runtime-work/` remain ignored local runtime/work directories.

## Notes

All repeated `baseline-browser-mapping` warnings were non-failing dependency freshness warnings from the test environment.
