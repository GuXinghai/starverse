# DFC-M19R-C Wire DFC HTML-to-PDF Generation to Main Conversion Service

Date: 2026-05-31
Branch: docs/dfc-0-format-conversion-foundation
Baseline: cc79e2c

## Scope

M19R-C wires the DFC `converted_pdf` / `pdf_attachment` generation path to the M19R-A/M19R-B main-process Electron conversion service boundary.

The worker/backend path now requests `html_to_pdf` conversion through the internal worker-to-main conversion bridge. It does not import `BrowserWindow`, `webContents`, or Electron main-only APIs in the DB worker/backend runtime.

## Implemented behavior

- Eligible backend-owned managed local `.html` / `.htm` assets can request a `converted_pdf` derivative job for `targetKind: pdf_attachment`.
- The derivative job creates a DFC sandbox plan, copies HTML into controlled sandbox input, requests main-process conversion through the bridge, validates the controlled PDF output, then copies the verified PDF into managed derivative storage.
- Ready PDF derivatives use:
  - `targetKind: pdf_attachment`
  - `sendStrategy: file_attachment`
  - `sendAssetRefs: derived_asset`
  - `usage: preview_and_send`
  - `storageClass: draft_bound`
  - `converterName: starverse-electron-html-pdf`
- PDF preview is metadata-only and does not read or expose the PDF body, storage path, sandbox path, storage ref, content token, full hash, or source HTML body.
- Send Plan authority remains selected refs plus verified `DerivedAsset` metadata. No extension/MIME legacy fallback was added.

## Fail-closed behavior

- Conversion service unavailable, blocked, failed, or timed out produces no ready `DerivedAsset`.
- Unavailable/failed PDF candidates remain non-persistable as ready selected options.
- Preview of unavailable or missing PDF selections remains blocked or missing.
- `original_file`, HTML safe `markdown`, and HTML `code` options remain available independently.

## Tests

Tests use a fake conversion bridge for backend integration. M19R-B remains responsible for adapter-level Electron window policy coverage.

Covered paths:

- successful fake `html_to_pdf` conversion creates a ready `converted_pdf` derivative with DFC PDF semantics;
- preview uses the same selected derived asset and stays metadata-only;
- Send Plan sees selected `pdf_attachment` as a file attachment through selected refs;
- service-unavailable path remains fail-closed;
- HTML markdown/code/original_file paths remain unaffected;
- DTOs do not expose storage paths, source HTML body, sandbox internals, storage refs, or full hashes.

## Non-goals

- No renderer IPC was added.
- No renderer can call the conversion service directly.
- No DB schema, IPC shape exposed to renderer, Send Plan main-flow, asset model, or DFC target vocabulary changed.
- No Playwright Chromium route, browser binary download, Puppeteer, LibreOffice, Ghostscript, Pandoc, Office->PDF, PS/EPS, packaged installer, CI, npm audit, ESLint, or full-suite failure work was added.

## Next step

Recommended next package: DFC-M19R-D / M20 Electron HTML-to-PDF hardening, focused on additional failure/timeout diagnostics, sandbox cleanup assertions, production runtime availability checks, and targeted risk review before declaring broader HTML->PDF support.
