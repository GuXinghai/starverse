# DFC-M21 HTML-to-PDF Electron Smoke Confidence

Date: 2026-05-31
Branch: docs/dfc-0-format-conversion-foundation
Baseline: a9df5ea

## Scope

M21 extends the existing Electron smoke runner with a real app-runtime HTML-to-PDF confidence path. It does not add a new E2E platform, CI integration, packaged installer smoke, OS file picker automation, Office->PDF, or PS/EPS.

## Smoke coverage

The smoke continues to verify:

- Electron app launch;
- composer/app shell mounted;
- scoped preload objects exist;
- raw `window.ipcRenderer` is absent;
- existing backend-owned DFC markdown attachment seam works.

M21 adds a query-gated backend HTML-to-PDF seeder that uses the existing scoped renderer APIs and backend services to:

- ingest a managed local HTML fixture;
- add it as a draft attachment;
- run `conversationDraft.ensureDfcOptions` through the app/backend path;
- trigger the Electron-backed HTML-to-PDF generation path;
- select the backend-owned `pdf_attachment` option;
- request `conversationDraft.getDfcPreview`;
- observe the attachment details UI.

## Assertions

The smoke asserts:

- the `pdf_attachment` option is backend-owned and available;
- selected refs include a `derived_asset`;
- preview is metadata-only (`raw_file` payload kind with ready status);
- `original_file`, HTML safe `markdown`, and HTML `code` options are still available;
- attachment chip/details/option/preview UI are observable;
- preview UI does not expose storage refs, file URLs, local paths, hashes, or raw HTML body-like content.

## Security boundary

The real smoke observes raw `ipcRenderer` remains absent and scoped preload objects remain present. M19R-D targeted tests remain the authority for detailed JavaScript/network/local-file blocking and adapter cleanup assertions; the smoke intentionally does not grow into a full browser-policy test platform.

## Validation

Passed:

- `git diff --check`
- `npx vue-tsc --noEmit --pretty false`
- `npm run test:electron-smoke`

The smoke rebuilt `better-sqlite3` for the Electron ABI, built the DB worker, launched Electron, generated a real HTML-to-PDF `pdf_attachment` derived asset, selected its backend-owned option, and observed metadata-only preview in the attachment details UI.

## Non-goals

- No Office->PDF or PS/EPS runtime.
- No Playwright/Puppeteer/LibreOffice/Ghostscript/Pandoc dependency change.
- No DB schema, renderer IPC shape, Send Plan main-flow, asset model, or DFC vocabulary change.
- No packaged installer smoke or CI wiring.
- No OS file picker automation.

## Next step

Recommended next package: Office->PDF owner decision only after accepting this HTML-to-PDF smoke confidence as sufficient for the current pilot, or a production-readiness hardening package if Owner wants broader default exposure.
