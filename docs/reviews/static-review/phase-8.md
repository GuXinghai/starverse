# Static Review — Phase 8: Build, Release and Tests

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

This is a read-only static review of branch `codex/basic-operation-exploration-8q02ix` at `2d73766` in the local checkout `D:\Starverse`. The application source matches baseline `aec217cd`.

- No application code was modified.
- No tests, builds, gates, `electron-builder` or rebuilds were run. The app was not launched, and no network or provider requests were made.
- Evidence about built output (`dist/`, `dist-electron/`) comes from files already present in the working tree, not from a new build.

## 1. Scope and coverage

| Area | Files | Depth |
|---|---|---|
| Packaging | `package.json` (`build`, scripts, dependencies), electron-builder defaults in `node_modules/app-builder-lib` (read-only), `vite.config.ts`, `config/appCsp.ts`, `scripts/clean-dist.cjs`, `scripts/gen-build-id.cjs` | Full |
| Native build | `scripts/build-epoch-native.cjs`, `native/epoch-win32/binding.gyp`, `electron/data-epoch/win32EpochRootLease.ts:241-275` | Full |
| Release | `.github/workflows/release-magika-plugin.yml`, `scripts/plugin-signing/*`, `scripts/plugin-packaging/magika/*` | Full workflow; scripts targeted |
| CI | `.github/workflows/ci.yml`, `.github/workflows/macos-preliminary.yml`, `.nvmrc`, `scripts/lint-changed.cjs` | Full |
| Test partitions | `vitest.{shared,unit,ui,integration}.config.ts`, `tests/test-partition-overrides.json`, `scripts/check-test-partitions.mjs`, `scripts/resolve-test-ci-scope.mjs`, `config/vitestPartitionConfig.test.ts`, `config/testCiScope.test.ts` | Full |
| Gates | `scripts/gates/*.mjs` and `.ps1` twins; `verify:ssot` wiring | Full for wiring; network-egress, tc12, tc15, tc17, goal3, zero-residual, capability-rule-authority read in full |
| Test adequacy | Spot checks for P2b-01, P3b-01, P4a-05, P6b-01, P7-01 | Targeted |

**Not covered (open):**
- GitHub repository settings: the `plugin-release-production` environment's branch rules and reviewers, and the default `GITHUB_TOKEN` permission.
- Built installer contents and the unpacked-file list (needs a build).
- Whether the plugin signature verifier enforces `expiresAt`.
- Internals of `privacy-scan`, tc14, tc16, tc18, tc19, `scripts/dev/smoke-*`, and `verify-magika-matrix-v020.mjs`.
- Zip determinism of the Magika package.
- The macOS DMG path beyond I1-02, and LibreOffice packaging beyond Phase 5a.
- Runtime confirmation of which test files each Vitest config actually runs (P8-04, P8-06).
- Electron 42's bundled Node version (I8-03 is unverified).

## 2. Subagent configuration and contributions

- Two concurrent read-only `Explore` subagents, model `sonnet`, effort `high`. The tool accepts only a model family, so the exact "Sonnet 5.5" version could not be confirmed.
- **8-A:** packaging, native build and release.
- **8-B:** CI, test partitions, gates and test adequacy.
- Neither subagent edited files, created temporary files, ran commands in the background, or spawned agents.
- The coordinator verified against source:
  - P8-01: no `.gitattributes`; `git ls-files --eol` in this checkout shows `infra/db/v2/*.sql` as a mix of `w/lf`, `w/crlf` and `w/mixed`; `schemaComposerV2.ts:22-26` pins three predecessor digests labelled "committed LF", "CRLF serialized" and "reviewed mixed-ending Windows checkout".
  - P8-02: `package.json` has no `electronFuses` or `afterPack`.
  - P8-03: `resolve-test-ci-scope.mjs:60-80` path rules.
  - P8-04: `tests/test-partition-overrides.json:2` assigns `epochNativeBoundary.test.ts` to unit while `vitest.unit.config.ts:23` excludes `electron/**/*.test.*`; `macos-preliminary.yml:59-62` names it under the integration config.
  - P8-08 / P8-13: `release-magika-plugin.yml:15-16` (`contents: write` workflow-wide) and `:129` (`--clobber`); `ci.yml` has no `permissions:` block.

## 3. Findings by severity

No High findings. Four Medium, eight Low-Medium, six Low, three Info.

### Medium

#### P8-01 [8B-4] — Medium — No line-ending policy, so the shipped schema digest depends on the checkout that built it (corroborates and extends P2b-01)
- **Severity rationale:** P2b-01 showed that a digest mismatch can trigger a full data reset. This phase shows the precondition is real today: the local Windows checkout that would build the installer has mixed endings in the hashed SQL.
- **Status:** statically confirmed (repository state); runtime effect on a stamped database requires verification.
- **Evidence:**
  - No `.gitattributes` in the repository; `core.autocrlf=true` locally.
  - `git ls-files --eol infra/db/v2/*.sql`: index is LF, but the working tree has `w/crlf` (for example `attachmentAssetSchema.sql`, `coreConversationSchema.sql`) and `w/mixed` (`capabilityRuleSchema.sql`, `composerDraftSchema.sql`).
  - `infra/db/v2/schemaComposerV2.ts:226, 268-275` hash `readFileSync` bytes. The authors have already pinned three variants of one predecessor (`:22-26`, also `:461-465`), and migrations at `:590` and `:789` throw `GENERATION_V2_SCHEMA_DIGEST_MISMATCH` for any other variant.
  - `package.json` `files` ships `infra/db/v2/*.sql` as-is, so the installer carries whatever endings the build checkout has.
  - Tests compare a computed digest with itself (`schemaComposerV2.test.ts:197, 257, 283, 512`), so Linux CI (LF) and a Windows build (CRLF/mixed) both pass while producing different digests.
- **Impact:** a database stamped by one build can be judged a schema mismatch by a build from a differently-ended checkout, and an editor that rewrites endings in one file creates an unpinned variant that blocks migration.
- **Repair direction:** add `.gitattributes` with `*.sql text eol=lf` (and other hashed assets); normalise CR/LF to LF before hashing in `schemaComposerV2.ts`.
- **Verify:** a test hashing the same fragment as LF, CRLF and mixed and expecting one digest; a build from a CRLF checkout producing the LF digest.

#### P8-02 [8A-01] — Medium — Packaged app keeps every Electron fuse at its default
- **Severity rationale:** `RunAsNode` lets any local process run arbitrary Node under the app's identity, which can call safeStorage to decrypt stored provider credentials and use the Epoch root lease. This is local-attacker only, which caps it at Medium.
- **Status:** statically confirmed.
- **Evidence:** no `electronFuses`, `afterPack` or ASAR integrity setting in `package.json:10-54`; electron-builder skips fuse flipping when `electronFuses` is absent (`app-builder-lib/out/platformPackager.js:260`); no `flipFuses` / `FuseV1Options` in code. The app itself never needs `ELECTRON_RUN_AS_NODE`; Magika uses `utilityProcess.fork` (`magikaUtilityProcessRunner.ts:54`).
- **Impact:** `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS` and `--inspect` are honoured; the ASAR can be swapped without detection; cookie encryption is off.
- **Safeguards:** a same-user attacker can already read the data directory; safeStorage still binds to the user account.
- **Repair direction:** `electronFuses` with `runAsNode:false`, `enableNodeOptionsEnvironmentVariable:false`, `enableNodeCliInspectArguments:false`, `enableEmbeddedAsarIntegrityValidation:true`, `onlyLoadAppFromAsar:true`, `enableCookieEncryption:true`.
- **Verify:** `npx @electron/fuses read` on the built exe; rerun `test:packaged-identity-smoke` and packaged smokes.

#### P8-03 [8B-3] — Medium — PR test scope is path-prefix only, so shared-core changes skip DB and Windows tests
- **Status:** statically confirmed.
- **Evidence:** `scripts/resolve-test-ci-scope.mjs:67-76` triggers integration only for `electron/`, `infra/`, `native/`, `tools/provider-key-vault/`, `tests/integration/`, non-UI `tests/e2e/`, `scripts/dfc/`, `tests/setup-node.ts` and the integration config. `src/core/**`, `src/shared/**` and `src/next/**` trigger neither UI nor integration, although 55 `infra/` and `electron/` test files import `src/core` (for example the schema digest constants used by `infra/db/v2/schemaComposerV2.ts:5-11`). `tests/helpers/*` (other than two prefixes), `tests/utils/**` and `tests/fixtures/**` trigger nothing. `:66` skips any changed file whose basename contains a `slow` token, including production code. `config/testCiScope.test.ts:10-14` encodes "UI source change means no integration".
- **Impact:** a PR changing a shared contract or digest constant passes CI without running the DB, migration or Windows-only tests (the 14 `windowsIt` epoch tests run only in the conditional Windows job).
- **Repair direction:** always run every partition on `push` to `main`; on PRs add `src/core/`, `src/shared/`, `src/next/` and `tests/**` to both triggers, or use `vitest related` for an import-graph scope; apply the slow-token skip to test files only.

#### P8-04 [8B-1] — Medium — The native-boundary guard test runs in no partition
- **Severity rationale:** it is the static guard that raw native-addon and config mutation stays inside `win32EpochRootLease.ts`, an Epoch/credential boundary; it is silently dead.
- **Status:** statically confirmed from config; confirm with `vitest list` per config.
- **Evidence:** `tests/test-partition-overrides.json:2` assigns `electron/data-epoch/epochNativeBoundary.test.ts` to `unit`. `vitest.unit.config.ts:10` includes it, but `:23` excludes `electron/**/*.test.*`, and Vitest's exclude wins. `vitest.integration.config.ts` excludes override-owned unit files. `macos-preliminary.yml:59-62` names the file with `--config vitest.integration.config.ts`, where the filter cannot re-include an excluded file. `config/vitestPartitionConfig.test.ts:8-18` checks only that override paths appear in include lists, not that they survive the owner's own excludes.
- **Repair direction:** remove the conflicting exclude for override-owned files or reassign the file to integration; add a test that resolves each config's include/exclude against real files and asserts each test file is owned by exactly one config.

### Low-Medium

| ID | Finding | Status | Evidence | Repair |
|---|---|---|---|---|
| P8-05 [8B-2] | The partition gate checks path-prefix ownership, not what the Vitest globs actually run. A new test under `src/core/**` (no tests today), root `src/*.test.ts`, `tests/*.test.ts` or a new `src/ui-app/<subdir>/` passes "every file has exactly one valid owner" yet runs nowhere. `scripts/agent/*.test.mjs` are assigned unit but run only under the integration config. | Confirmed (latent) | `scripts/check-test-partitions.mjs:55-72`; `vitest.unit.config.ts:4-11`; `vitest.ui.config.ts:6-14` | Evaluate the real globs (same test as P8-04). |
| P8-06 [8B-9] | None of the review's main correctness findings has a regression test, and no existing test encodes the wrong behaviour either: P3b-01 (portable→Anthropic assistant string; the only tests use attachments and take the array path), P4a-05 (no CR/LF-split test for the four parsers using per-chunk `replace(/\r\n?/g, '\n')`), P6b-01 (no `$&`, `` $` ``, `$'`, `$$` content), P2b-01/P8-01 (no LF vs CRLF test), P7-01 (no eviction test). | Confirmed | `portableGenerationHistoryV2.test.ts:384, 605`; `messagesRequestV1.test.ts:216-234`; `openrouter/chatStreamV1.ts:88`, `responsesStreamV1.ts:207`, `generateContentStreamV1.ts:160`; `finalRenderer.test.ts`; `generationOperationRuntimeRegistryV2.test.ts` | Add the verification tests listed in each finding before repairs. |
| P8-07 [8A-09] | The release build is never exercised in CI: no `npm run build`, `electron-builder` or packaged smoke; only `npx vite build`. Packaging regressions (P0-02, P1-03 class) go unnoticed. | Confirmed | `ci.yml`, `macos-preliminary.yml`; `package.json:92, 104-105` | Windows job running `npm run build -- --dir` plus `test:packaged-identity-smoke`. |
| P8-08 [8A-03, part of 8B-7] | The Magika release workflow grants `contents: write` to every job, including six matrix build jobs that install the full dependency tree and run repo scripts; every action is pinned by tag (`@v4`), not SHA; `${{ inputs.version }}` is interpolated into a `run:` shell (dispatchers are repo writers). | Confirmed | `release-magika-plugin.yml:15-16, 19-64, 36` | `contents: read` at top level, `write` only on `sign-and-publish`; SHA-pin actions; pass inputs through `env:`. |
| P8-09 [8A-04] | `sign-and-publish` checks out the dispatched ref and runs the repo's signing script with the signing private key in its environment, so any writer can dispatch from a branch with a modified script. Only environment protection rules (not visible in the repo) prevent this. | Needs repo settings | `release-magika-plugin.yml:89-132, 105-107` | Restrict `plugin-release-production` to `main`/tags with required reviewers, or fail unless `github.ref` is protected. |
| P8-10 [8A-02] | App installers are unsigned unless the builder's environment provides `CSC_LINK`; no `publish` config, no app-release workflow, no checksums; the macOS DMG is unsigned and un-notarized (adds to I1-02). No secrets are committed. | Confirmed | `package.json:25-53` | Document or automate signing; publish `SHA256SUMS`. |
| P8-11 [8B-5] | Several gates are never run in CI: `gate:generation-v2-zero-residual`, `gate:generation-v2-capability-rule-authority`, `gate:model-identity-purge`, `gate:docs`, `gate:tc13`, `gate:vite-renderer-resolution`, and the `--self-test` modes of network-egress and privacy-scan. | Confirmed | `package.json:114, 123, 125` | Add them to `verify:ssot` or a CI step. |
| P8-12 [8B-6] | `network-egress-gate` allows the Phase 7 legacy `fetch`/`ProxyAgent` paths (P7-06) by file plus line regex, regardless of reachability. It does not detect `net.request`, `net.fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon`, bare `'http'`/`'https'` imports, member `x.fetch(` calls, or `fetch` passed as an argument; it skips `native/`, `tools/`, `config/`. A missing scan root is skipped and `REPO_ROOT = process.cwd()`, so a wrong cwd passes with zero files scanned. No live evasion was found today. | Confirmed | `scripts/gates/network-egress-gate.mjs:24-62, 99-122, 188-191` | Resolve the root from `import.meta.url`, assert `filesScanned > 0`, add the missing APIs, scope the allowlist to named functions. |

### Low

| ID | Finding | Evidence | Repair |
|---|---|---|---|
| P8-13 [8A-05] | Published plugin assets can be replaced silently (`gh release upload --clobber`); the `packageSha256` summary is a workflow artifact only, not attached to the release; signatures expire after 365 days by default (enforcement not checked). | `release-magika-plugin.yml:113-119, 128-131`; `sign-official-plugin-release.mjs:9, 32` | Drop `--clobber`; attach the summary; add an expiry runbook. |
| P8-14 [8A-06] | The CSP plugin picks dev or prod from `process.env.NODE_ENV`, not Vite's `mode`; `build` does not set `NODE_ENV`; two smoke scripts build `--mode development` into the same `dist/`. A stray `NODE_ENV=development`/`test` ships `localhost` in `connect-src`. The current `dist/index.html` is correct and `build` cleans first. | `vite.config.ts:20`; `config/appCsp.ts:11-31` | Use Vite's `mode`; assert no `localhost` in built `dist/index.html` (also covers P7-04's test). |
| P8-15 [8A-07] | `dist-electron/` accumulates stale hashed chunks (312 files now) because `emptyOutDir` is false, and `files` packs the whole directory. `npm run build` is safe because it runs `clean:dist`; a direct `electron-builder` run is not. | `package.json:18, 61`; `vite-plugin-electron` defaults | Pre-pack prune or exclusion; CI check of the unpacked file list. |
| P8-16 [8A-08] | Renderer- and main-bundled packages (`vue`, `shiki`, `katex`, `markdown-it`, `dompurify`, `@types/*` and others) are in `dependencies`, so electron-builder copies them into the ASAR although only `better-sqlite3` is external. Bloat and a larger shipped supply-chain surface. | `package.json:138-159`; `vite.config.ts:43` | Move bundled-only packages to `devDependencies`, or narrow `files`; confirm with `npx asar list`. |
| P8-17 [8B-7] | CI hygiene: `ci.yml` has no `permissions:` or `concurrency`; actions tag-pinned; `live-smoke` runs repo scripts with `OPENROUTER_API_KEY` on same-repo PRs and fails CI on provider flakes; `lint:changed` covers `.ts/.tsx/.vue` only with no full lint; `vue-tsc --noEmit` does not cover `tools/`, most of `config/`, or `scripts/`. | `ci.yml:131-148`; `scripts/lint-changed.cjs:11` | Add `permissions: contents: read` and concurrency; SHA-pin; widen typecheck. |
| P8-18 [8B-8] | Silent skips: 44 skip uses in 31 files (none `.only`); 14 epoch tests use `windowsIt` and therefore depend on the conditional Windows job (P8-03); `enginePluginRegistryRepo.test.ts:8` `describe.skip`s with only a warning when better-sqlite3 fails to load, hiding an ABI mismatch. | `infra/testUtils/betterSqliteGate.ts` | Fail instead of skipping in CI when the native module cannot load. |

### Info

| ID | Item |
|---|---|
| I8-01 [8A-10] | `npm run build` runs `electron-builder install-app-deps` and electron-builder's own rebuild, leaving `node_modules` on the Electron ABI; DB tests then fail until `npm run test:prepare` (the AGENTS.md ABI hazard). The packaged ABI itself is deterministic: both steps target Electron, `smartUnpack` is on, and the epoch addon is N-API v8 (`native/epoch-win32/binding.gyp:9`). |
| I8-02 [8A-11] | `public/build-id.json` (commit and timestamp) is copied into `dist/` but fetched only in dev (`src/main.ts:9-11`). |
| I8-03 [8B-7] | `.nvmrc` pins Node 22.21.1 (`engines` `>=22.12 <23`); Electron 42 bundles a different Node line (assumed 24.x, unverified), so unit tests do not run on the shipped runtime. |

## 4. Uncertainties and excluded false positives

**Rejected hypotheses:**
- An `.mjs` preload breaks under sandbox: the content is bundled CJS requiring only `electron` (`dist-electron/preload.mjs`); needs runtime confirmation but is not a defect.
- `smartUnpack` disabled or `better-sqlite3` bundled into the main chunk: neither holds (`vite.config.ts:43`; electron-builder default).
- `pull_request_target` or secrets reachable by fork PRs: none.
- Destructive `rm` paths in build scripts: only fixed, repo-anchored paths (`clean-dist.cjs`, `build-epoch-native.cjs:24`).
- Runtime dependencies misplaced in `devDependencies`: none found.
- Gates swallowing errors: none in tc12, tc15, tc17, goal3, zero-residual or capability-rule-authority; `.ps1` twins are thin wrappers.
- `tc15` failing on `verify.log`: `.log` is gitignored.
- `pwsh | Tee-Object` masking exit codes: `$LASTEXITCODE` is preserved.

**Uncertainties:**
- P8-04 and P8-05 depend on Vitest's exclude-over-include behaviour; confirm with `vitest list`.
- P8-09 depends on environment protection rules not visible in the repository.
- P8-01's impact on a real installed database depends on which checkout produced the installer.

**Held up:**
- `files` is a whitelist (`dist`, `dist-electron`, `dist-native`, `infra/db/v2/*.sql`); `.env*`, `.opencode`, `.tmp*`, tests and docs are not packaged.
- `asarUnpack` covers `dist-native/win32-x64/*.node`; the runtime resolves `app.asar.unpacked` when packaged and fails closed with `EPOCH2_WIN32_NATIVE_REQUIRED` when missing (`win32EpochRootLease.ts:241-275`).
- `build-epoch-native.cjs` validates the product identity before writing the generated header (`:35-39`); any failure aborts the build chain.
- No secrets reach bundles: the main `process.env` define maps to the live environment; only `DEV` and `MODE` are read from `import.meta.env`; `.env.example` holds placeholders. No sourcemaps in `dist` or `dist-electron`.
- `--no-sandbox` is passed only by the dev-server `onstart` hook when `SV_NETLOG_PATH` is set.
- NSIS: non-one-click, per-user, `deleteAppDataOnUninstall:false`.
- Release: `workflow_dispatch` only, `dryRun` defaults to true, the signing secret is scoped to one step behind an environment, matrix builds must be byte-identical, Magika models are pinned by SHA-256, `npm ci --ignore-scripts` with a lockfile.
- CI: `npm ci` everywhere; `postinstall` and `test:prepare` rebuild for Node; no `continue-on-error` or `|| true`; `pipefail` with `tee`; artifacts uploaded `if: always()`; scope resolution fails closed when the base is unavailable and the unit partition always runs.

## 5. Next phase

**Phase 9 — Consolidation:** cross-phase reconciliation of all reports (Phases 0–8): a single deduplicated finding register with final severities, root-cause groupings (for example P2b-01/P8-01, P4a-13/P4b-02/P4b-05/P7-01, P2a-09/P2b-07/P7-03/P7-07), corrections recorded without editing earlier reports (such as I7-01 on P1-08), the open "Not covered" lists and carried questions from every phase, and a recommended repair and verification order.

This phase is complete. I have stopped and am waiting for your instruction to continue.
