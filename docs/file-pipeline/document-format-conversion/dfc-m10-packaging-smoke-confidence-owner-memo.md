# DFC-M10 Packaging / Smoke Confidence Owner Memo

Date: 2026-05-29

Branch: `docs/dfc-0-format-conversion-foundation`

Baseline: `38a81ac`

## 1. Decision

DFC-M10 stops at an owner memo. It does not implement a new smoke harness.

Reason: the repository has useful pieces, but not a low-intrusion real
Electron/browser/packaged smoke seam for the DFC attachment path. Implementing
one correctly would require a dedicated harness package rather than a small
test addition.

This memo does not add runtime formats, dependencies, CI wiring, DB schema,
Send Plan behavior, asset model changes, IPC shape changes, UI features,
external engines, npm audit work, ESLint work, or packaging governance.

## 2. Read-only findings

Existing launch and test infrastructure:

- `package.json` has `electron:dev`, `electron`, `electron:build`,
  `dev:quiet`, `verify:live`, and `gate:tc14` scripts.
- `verify:live` / `gate:tc14` run `scripts/gates/tc14-ui-live-smoke.mjs`.
- `tc14-ui-live-smoke.mjs` is an OpenRouter chat/completions network smoke. It
  does not launch the app UI, Electron, preload, composer, attachment UI,
  preview, or Send Plan.
- `tests/e2e/*smoke.test.ts` are Vitest fixture replay tests, not a browser or
  Electron process smoke.
- `vitest.config.ts` uses jsdom with `tests/setup.ts`, which supplies mocked
  Electron preload bridges.
- `vite.config.ts` can start the renderer and `vite-plugin-electron` main and
  preload in dev, but it is optimized for interactive development, not a
  deterministic smoke harness.
- `electron.vite.config.ts` can build main, worker, preload, and renderer
  bundles, but there is no existing packaged smoke runner around it.
- `playwright` and `@axe-core/playwright` are already present in dev
  dependencies, but no Playwright config, browser smoke runner, Electron launch
  helper, or app readiness helper was found.

## 3. Why no low-intrusion smoke was added

A true DFC smoke should verify at least app startup, composer visibility,
attachment UI or equivalent fixture entry, attachment details, backend-owned
DFC option or preview visibility, selected-ref/send gate visibility, and scoped
preload behavior.

The current repo does not expose that as a small one-file addition because a
reliable smoke needs several harness decisions:

- How to launch Electron deterministically without depending on an interactive
  dev shell.
- Whether to use Vite dev server, built Electron output, or packaged output.
- How to isolate `userData`, DB state, config state, logs, and temp files.
- How to handle `better-sqlite3` ABI target switching between Node/Vitest and
  Electron.
- How to detect app readiness without brittle sleeps.
- How to seed or fixture a DFC attachment path without using OS file picker
  automation as the first dependency.
- How to close child processes reliably on Windows.
- Whether to permit a Playwright `_electron` based runner, a plain Playwright
  browser runner against Vite, or a packaged smoke script.

Adding those decisions inside M10 would become new test infrastructure, not a
low-intrusion smoke.

## 4. Recommended harness type

Recommended next package: Electron smoke harness using Playwright `_electron`
against development or built Electron output.

Rationale:

- It is the smallest route that can observe real preload scoping and the real
  renderer shell.
- It can eventually cover composer, attachment details, preview, and send gate
  behavior without packaging an installer.
- It can reuse the existing Playwright dependency instead of adding a new test
  framework.
- It keeps packaged installer validation as a later step.

Not recommended as the first package:

- Browser-only Playwright against Vite: useful for app-shell checks, but it
  cannot prove real Electron preload scoping.
- Full packaged smoke: valuable later, but it requires build/package time,
  artifact paths, installer or unpacked app selection, and cleanup policy.
- OS file picker automation: too brittle for the first confidence path.

## 5. Proposed minimum smoke chain

First Electron smoke target:

1. Rebuild native ABI for Electron if the smoke launches real Electron.
2. Launch app with isolated `userData`.
3. Wait for renderer app shell readiness through a stable DOM marker.
4. Assert composer is visible.
5. Assert raw `ipcRenderer` is absent from the renderer world.
6. Assert scoped preload objects are present, including `electronAPI` and
   `electronStore`.
7. Enter an attachment-like DFC fixture through a controlled test seam or
   existing mocked backend seam if available.
8. Open attachment details or the closest stable DFC UI seam.
9. Observe at least one backend-owned DFC option, selected preview, or send gate
   state.
10. Close Electron and remove isolated state.

If step 7 cannot be implemented without app/bootstrap changes, the first smoke
should stop at app shell plus scoped preload and document the DFC fixture seam
as package 2.

## 6. Proposed implementation package boundary

Files likely in scope:

- A single smoke runner under `scripts/gates/` or `tests/smoke/`.
- One package script such as `test:dfc:electron-smoke` or
  `gate:dfc-smoke`.
- Optional small app readiness selector if an existing stable selector is not
  sufficient.
- Optional owner memo update documenting the exact command and limitations.

Validation for that future package:

- `git diff --check`.
- `npx vue-tsc --noEmit --pretty false` if TypeScript files are added.
- Only the new smoke command and directly related tests.
- `npm run rebuild:electron` before real Electron smoke.
- Avoid DB-heavy Node/Vitest tests unless the package directly touches DB worker
  code.

## 7. Explicit non-goals for the harness package

The next package should not include:

- New document runtime formats.
- Office-to-PDF, HTML-to-PDF, PS/EPS, or external engine implementation.
- Full E2E platform or broad Playwright framework.
- CI integration.
- Packaged installer validation.
- OS file picker automation.
- Broad fixture infrastructure.
- Fixing the pre-existing full-suite failures.
- npm audit, ESLint, `any`, electron-builder, or code-health governance.
- DB schema, Send Plan main-flow, asset model, DFC option semantics, or legacy
  bridge changes.

## 8. Heavy runtime decision

Heavy runtime owner decisions should wait until after at least one smoke
confidence package lands.

Do not enter Office-to-PDF, HTML-to-PDF, PS/EPS, or external engine sandbox
implementation from M10. Those require a separate owner memo covering engine
choice, sandboxing, packaging impact, privacy DTO boundary, failure semantics,
and no-silent-fallback behavior.

## 9. Recommendation

Do not proceed directly to heavy runtime implementation.

Next recommended task: create a dedicated DFC-M11 Electron smoke harness owner
package that implements only app shell plus scoped preload first, then adds the
DFC attachment UI seam only if it can be done without app bootstrap, DB schema,
Send Plan, asset model, or UI architecture changes.
