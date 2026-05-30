# DFC-M19R-D Electron HTML-to-PDF Hardening

Date: 2026-05-31
Branch: docs/dfc-0-format-conversion-foundation
Baseline: a942918

## Scope

M19R-D hardens the Electron HTML-to-PDF pilot after M19R-C wired DFC `converted_pdf` generation through the main-process conversion service.

This remains a backend pipeline pilot. It is not a full productized HTML-to-PDF feature and does not expand to Office->PDF or PS/EPS.

## Hardening coverage

### Timeout and failure

- Adapter-level tests now cover BrowserWindow creation failure, HTML load failure, `printToPDF` failure, print timeout, and non-PDF output.
- Backend worker tests cover conversion bridge `failed`, `timed_out`, and success-with-invalid-PDF output.
- All failure paths produce no ready `converted_pdf` DerivedAsset.
- Diagnostics remain symbolic and sanitized before reaching DFC DTOs.

### Cleanup

- Adapter tests assert the hidden conversion window is destroyed after success, print failure, load failure, timeout, and invalid output.
- Temporary session cleanup is attempted through `clearStorageData`.
- Backend sandbox cleanup now also runs when a conversion service returns success but the output is missing or not a PDF.
- Cleanup failure remains represented as sanitized cleanup status and does not turn a failed conversion into success.

### Output validation

- Adapter rejects resolved output paths that do not match the controlled sandbox output descriptor before creating a window.
- Backend verifies generated output has a minimal `%PDF-` signature before creating a ready DerivedAsset.
- Missing, escaped, failed, timed-out, or non-PDF outputs fail closed.

### DFC semantics

- Ready output remains `targetKind: pdf_attachment`, `sendStrategy: file_attachment`, and `sendAssetRefs: derived_asset`.
- Preview remains metadata-only and uses the selected derived asset without reading PDF body.
- Send Plan continues to use selected refs plus verified DerivedAsset metadata and does not fall back to extension/MIME routing.
- `original_file`, HTML safe `markdown`, and HTML `code` options remain unaffected.
- Unavailable or failed PDF candidates cannot become ready selected options.

## Non-goals

- No Office->PDF or PS/EPS runtime.
- No Playwright, Puppeteer, LibreOffice, Ghostscript, Pandoc, browser binary, packaged installer, or CI work.
- No renderer IPC exposure for conversion.
- No DB schema, renderer IPC shape, Send Plan main-flow, asset model, or DFC vocabulary change.

## Next step

Recommended next package: either an HTML-to-PDF pilot closeout / production-readiness owner decision, or a narrowly scoped Office->PDF owner memo. Do not expand heavy runtimes until the HTML-to-PDF pilot boundary is accepted.
