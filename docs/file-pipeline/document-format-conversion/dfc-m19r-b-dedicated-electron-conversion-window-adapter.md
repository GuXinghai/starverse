# DFC-M19R-B Dedicated Electron Conversion Window Adapter

Date: 2026-05-31
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: `d49b983`

## Status

M19R-B implements the main-process Dedicated Electron HTML->PDF conversion window adapter behind the M19R-A service boundary. It does not connect the adapter to DFC generation and does not create `converted_pdf` DerivedAssets.

## Adapter boundary

- The adapter lives in `electron/services/electronHtmlPdfConversionAdapter.ts`.
- The main service delegates `html_to_pdf` requests to the adapter after M19R-A request validation.
- The adapter uses Electron built-in Chromium through an injected or dynamically loaded BrowserWindow factory.
- Tests use a fake BrowserWindow/session/webContents factory; they do not require a real GUI environment.

## Window isolation policy

The conversion window is created hidden with:

- `show: false`
- `nodeIntegration: false`
- `contextIsolation: true`
- `sandbox: true`
- `webSecurity: true`
- `allowRunningInsecureContent: false`
- `javascript: false`
- no preload entry
- per-job non-persistent temporary partition

The adapter does not reuse the Starverse app renderer, app preload, or user session.

## HTML loading and resource policy

- Input is read from the already validated controlled sandbox input descriptor.
- The adapter loads controlled HTML through a `data:text/html` URL rather than arbitrary `file://` or remote URLs.
- `window.open` is denied.
- Arbitrary navigation is prevented.
- Downloads are prevented.
- Network and local-file resource requests are blocked by default.
- JavaScript is disabled through BrowserWindow webPreferences; if future Electron behavior cannot honor this, M19R-C must fail closed rather than enable JavaScript.

## PDF output and cleanup

- PDF bytes are produced by `webContents.printToPDF`.
- Output is written only to the validated controlled output path.
- M15 sandbox output validation is used before writing.
- Success returns a controlled output descriptor.
- Failed, blocked, unavailable, or timed-out conversion returns no output.
- Window/session cleanup is attempted after success and failure and reported as cleanup status.
- Diagnostics remain sanitized and do not expose raw paths, file URLs, HTML body, storage refs, tokens, hashes, command/env, or stack details.

## Explicit non-goals

- No DFC generation integration.
- No `DerivativeJobService` changes.
- No `conversationDraft.ensureDfcOptions` behavior changes.
- No `pdf_attachment` DerivedAsset creation.
- No renderer IPC entry.
- No Playwright Chromium, Puppeteer, LibreOffice, Ghostscript, Pandoc, Office->PDF, or PS/EPS.
- No DB schema, Send Plan, asset model, IPC shape, DFC vocabulary, packaged installer, or CI changes.

## Next step

M19R-C can connect DFC `converted_pdf` generation to this main-process service boundary. That package should wire selected refs/preview/send same-source semantics only after confirming worker/main invocation does not expose a renderer IPC path or weaken sandbox diagnostics.
