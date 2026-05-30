# DFC-M17 HTML-to-PDF browser runtime blocker

Date: 2026-05-31
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: `ec26713`

## Outcome

DFC-M17 attempted a minimal HTML -> PDF `pdf_attachment` backend pilot using Playwright Chromium after the M15 sandbox foundation and M16 engine strategy decision. The implementation attempt was stopped before commit and the production/test diff was withdrawn.

HTML->PDF remains unimplemented.

## Blocking fact

The local Playwright Chromium executable is not installed in the current environment. A direct runtime check failed with Playwright reporting a missing executable under the user Playwright cache:

```text
C:\Users\m1389\AppData\Local\ms-playwright\chromium_headless_shell-1200\chrome-headless-shell-win64\chrome-headless-shell.exe
```

Playwright suggested `npx playwright install`. That command was not run because M17 explicitly forbids adding a browser binary without a new Owner browser runtime / packaging decision.

## Validation state before rollback

- `npm run rebuild:node`: passed.
- `git diff --check`: passed with LF/CRLF warnings only.
- `npx vue-tsc --noEmit --pretty false`: passed after narrowing an implementation type.
- Targeted Vitest failed only in the new M17 HTML->PDF worker test because no ready `converted_pdf` derivative was generated when Chromium could not launch.
- Existing targeted tests outside the new M17 HTML->PDF case passed in that run.

## Withdrawn implementation scope

The withdrawn implementation attempted to add:

- `converted_pdf` handling in `infra/files/derivativeJobService.ts`.
- HTML `pdf_attachment` generation through `conversationDraft.ensureDfcOptions`.
- Metadata-only derived PDF preview behavior.
- Worker tests for HTML->PDF option generation, sandbox policy, selected refs, preview, send binding, and fail-closed behavior.

All of that implementation/test diff was reverted before this blocker checkpoint.

## Owner decision required

Before M17 can continue, Owner must decide the browser runtime / packaging policy for Playwright Chromium:

- Whether the project may install and rely on Playwright Chromium for production conversion.
- Whether the Chromium binary is developer-local, packaged with the app, downloaded during setup, or supplied by a managed engine package.
- How version pinning, platform coverage, licensing, update policy, and cache location are governed.
- Whether CI or packaged builds must validate the browser binary presence before enabling HTML->PDF.

## Non-goals retained

This blocker does not approve or implement:

- HTML->PDF runtime.
- Office->PDF.
- PS/EPS -> PDF.
- Puppeteer, LibreOffice, Ghostscript, Pandoc, or another external engine.
- DB schema changes.
- IPC shape changes.
- Send Plan main-flow changes.
- Asset model changes.
- DFC target vocabulary changes.
- Packaged installer smoke or CI.

## Recommended next package

DFC-M17 should resume only after Owner approves the browser binary / packaging policy. If approval is granted, the next package should explicitly include the allowed install/packaging step, then re-implement the minimal Playwright Chromium HTML->PDF pilot through the existing M15 sandbox helper.

If approval is not granted, choose the fallback strategy from M16: a dedicated isolated Electron/Chromium conversion window or a managed external engine package owner package.
