# Repair Phase 6a: build and configuration boundaries

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-25

This is the first part of repair Phase 6 from [repair-plan.md](repair-plan.md) section 3, following [repair-phase-5.md](repair-phase-5.md). It covers R6-01, R6-02, R6-07 and R6-08, the items that change build configuration, a profile file, the CSP and workflow files. R6-03 to R6-06, R6-09 and R6-10 change code boundaries and are Phase 6b.

The repair plan lists ten items for Phase 6 (R6-01 to R6-10); the Phase 5 report's "R6-01..R6-08" was a miscount.

Scope rule agreed with the owner for this phase: development comes first. Every change below affects packaged builds, a per-run LibreOffice profile, the production CSP or release workflows. Nothing changes `npm run dev`, tests or the development CSP.

- No provider or network request was made. LibreOffice was not run (section 5).
- Nothing was published and no release workflow was run.
- D-3, D-4, D-4r, D-6 and D-8 are untouched.

## 1. Scope and repository state

| Item | Value |
|---|---|
| Branch | `codex/static-review-repairs`, on top of `1b3fd9f0` (Phase 5) |
| Untouched working-tree content | `world_map_experiment/__pycache__/` (untracked, preserved, not committed) |
| Subagents | None |

## 2. Changes by item

### R6-01: Electron fuses (P8-02)

`package.json` `build.electronFuses` now sets `runAsNode`, `enableNodeOptionsEnvironmentVariable` and `enableNodeCliInspectArguments` off, and `enableEmbeddedAsarIntegrityValidation` and `onlyLoadAppFromAsar` on. The application never needs `ELECTRON_RUN_AS_NODE`: helper processes use `utilityProcess.fork`, and no application code uses `process.execPath` to start a child. A packaged unpacked build (`electron-builder --dir`, native rebuild skipped, output outside the repository) updated the ASAR integrity resource, applied the fuses, and `npx @electron/fuses read` on the built `Starverse.exe` reported exactly that. Attack precondition: a local process able to start the installed executable or replace its ASAR.

Not set: cookie encryption (a one-way change for stored cookies of the in-app browser), `grantFileProtocolExtraPrivileges` (the renderer is loaded from `file://`; changing it needs a protocol change, not a flag).

### R6-02: LibreOffice macro and link hardening (P5a-01)

The adapter now writes `user/registrymodifications.xcu` into the per-run profile before it starts the process: macro security level 3, macro execution disabled, untrusted referer links blocked, active content disabled, Writer link updates set to "never". The profile is created per run, so this is the only configuration LibreOffice sees. Attack precondition: the user attaches a crafted DOCX and requests its PDF form.

### R6-07: CSP follows the Vite mode (P1-08 / I7-01, P7-04, P8-14)

- `getAppCsp` adds `base-uri 'self'` and `form-action 'self'`. Production `connect-src` is `'self'` only; the two provider hosts moved to the development list, since the renderer makes no direct provider request (all providers are reached through the main process; the one renderer `fetch` is `/build-id.json`).
- A new `config/appCspPlugin.ts` replaces the two inline plugins in `vite.config.ts` and the smoke config. It uses Vite's resolved `mode`, not `process.env.NODE_ENV`, so a stray `NODE_ENV=development` can no longer ship `localhost` in a production build, and `vite dev` keeps its development CSP.
- The sanitizer drops a remote `src` (`http:`, `https:`, `ftp:`, `//host`) from images and keeps the alt text. Local sources (`data:`, relative paths) are kept. The CSP already blocked remote images; the renderer now does not attempt the request.
- A built `dist/index.html` (production mode) contains no `localhost` and carries the new directives.

### R6-08: release workflow least privilege (P8-08, P8-09, P8-13; P8-10 deferred)

- `release-magika-plugin.yml`: `contents: read` at workflow level; `contents: write` only on `sign-and-publish`. The publish job's first step fails unless the ref is `main` or a tag, before the signing key is used. The dispatch input `version` reaches shell text through `env:`, not interpolation. `--clobber` is gone, so a published asset is not silently replaced, and the release summary is attached next to the package and signature.
- `ci.yml`: `contents: read` at workflow level.

## 3. Tests added or changed

No existing assertion was changed.

| Item | File | Added | Fails without the fix |
|---|---|---|---|
| R6-02 | `infra/files/dfcLibreOfficePdfAdapter.test.ts` | 1 | 1 of 1 |
| R6-07 | `config/appCsp.test.ts` | 3 + 2 plugin tests | 2 of 3; the plugin tests exercise the new module |
| R6-07 | `src/ui-kit/chat/richtext/sanitizer.test.ts` | 8 (4 remote, 4 local) | 4 of 4 remote; the 4 local rows are guards |
| R6-01 | `config/electronFuses.test.ts` | 2 | configuration guard |
| R6-08 | `config/workflowPermissions.test.ts` | 5 | 5 of 5 against the previous workflow files |

The workflow and fuse tests read the files as text. The enforcement itself is in GitHub and in the built executable, which section 4 covers.

## 4. Checks run

| Check | Result |
|---|---|
| Touched and new tests, scoped runs | pass |
| `npx vue-tsc --noEmit` | exit 0 |
| `node scripts/check-test-partitions.mjs` | PASS |
| ESLint on changed files | 0 errors, 4 warnings (function length) |
| `npx @electron/fuses read` on a packaged `Starverse.exe` | RunAsNode, NodeOptions and NodeCliInspect disabled; ASAR integrity and OnlyLoadAppFromAsar enabled |
| `vite build` (production mode), `dist/index.html` | no `localhost`; `connect-src 'self'`; `base-uri` and `form-action` present |
| Unit / UI / integration partitions | 10 / 6 / 24 failing, all in the baseline. The one unit name not in the Phase 5 list is in the Phase 4b baseline and passes alone (timing flake) |

## 5. Limitations

- **LibreOffice was not run.** The profile settings are written by the adapter and tested as a file; their effect on a real `soffice` (a DOCX with a macro or UNC image link) is not observed. The configuration paths follow LibreOffice's registry names; unknown items are ignored by LibreOffice, so a wrong name would be silent.
- The DOCX content check before conversion (P5a-01), a network-blocked job object or firewall rule, and making the manifest flags reflect enforcement are not done.
- The installed packaged app was not started (native rebuild was skipped for the fuse check). ASAR integrity validation at startup was therefore not exercised, and no code-signed or notarised build was made.
- GitHub environment protection rules for `plugin-release-production` (P8-09) are repository settings and cannot be changed or verified from the repository.
- Actions are still pinned by tag, not commit SHA (P8-08 part). P8-10 (installer signing, `SHA256SUMS`) is not addressed.
- The development CSP still lists the two provider hosts.

## 6. Deferred work

- Phase 6b: R6-03 to R6-06, R6-09, R6-10.
- The limitation items above.
- The Phase 5 deferred items remain open.
