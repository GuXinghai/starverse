# DFC-M19R-A Main-process Electron Conversion Service Boundary

Date: 2026-05-31
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: current clean HEAD plus known unrelated dirty file outside this package

## Status

M19R-A establishes the internal boundary needed before a Dedicated Electron HTML->PDF runtime can be implemented. It does not implement HTML->PDF conversion and does not create `BrowserWindow`, `webContents`, or `printToPDF` calls.

## Boundary shape

- `infra/files/electronConversionServiceContract.ts` defines the internal request/response contract, path descriptor validation, policy normalization, fail-closed response helpers, and renderer-safe response redaction.
- `infra/files/electronConversionBridge.ts` defines the backend/worker-side bridge seam. The default bridge is unavailable and fails closed.
- `electron/services/electronConversionService.ts` defines the main-process service skeleton. It validates requests, blocks unsupported conversion kinds, and returns unavailable for `html_to_pdf` until a dedicated conversion window adapter exists.

## Request contract

The request carries:

- `requestId`
- `conversionKind`, currently expected to become `html_to_pdf`
- controlled sandbox input descriptor
- controlled sandbox output descriptor
- `timeoutMs`
- policy flags with JavaScript, network, and local-file access disabled by default
- expected output MIME and extension

Path descriptors must use an absolute internal root plus a relative path. Traversal, UNC paths, drive escapes, NUL bytes, and absolute relative paths are rejected before service execution.

## Response contract

The response carries:

- `status`: `success`, `failed`, `blocked`, `timed_out`, or `unavailable`
- output descriptor only on success
- symbolic diagnostics
- cleanup status

Renderer-safe summaries strip internal output paths and sanitize diagnostics so they do not expose raw paths, file URLs, storage refs, file bodies, command/env details, tokens, or full hashes.

## Explicit non-goals

- No `BrowserWindow` creation.
- No `webContents` creation.
- No `printToPDF`.
- No DFC generation integration.
- No Playwright Chromium recovery.
- No browser binary download or packaging change.
- No DB schema, IPC shape, Send Plan main-flow, asset model, or DFC vocabulary change.
- No renderer IPC entry for the conversion service.

## Next step

M19R-B can implement the dedicated hidden/offscreen Electron conversion window adapter behind this boundary. It must keep app renderer, app preload, and user session isolated, and it must keep JS/network/local-file blocking fail-closed.
