# DFC-M18 Managed Browser Runtime Package Scaffold

Date: 2026-05-31
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: `67266a6`

## Outcome

M18 extends the M17B managed browser runtime gate into a testable managed Chromium runtime package scaffold. It defines the expected manifest fields, validates fake fixture packages, and keeps HTML->PDF generation unavailable.

This is not a Chromium distribution and not an HTML->PDF runtime implementation.

## Package scaffold contract

The managed runtime package is rooted under the Starverse app-managed runtime directory. The HTML->PDF Chromium runtime manifest is `manifest.json` and must describe:

- `packageId`: `starverse.dfc.playwright-chromium`
- `runtimeId`: `playwright-chromium-html-pdf`
- `platform`
- optional `arch`
- optional `capabilities`, including `html_to_pdf`
- relative `executablePath`
- `playwrightVersion`
- `browserRevision`
- required `sha256`
- required `sizeBytes`
- required `provenance`
- required `license`

The executable path must remain relative to the managed runtime root. Absolute paths, UNC paths, Windows drive-qualified paths, traversal, and NUL bytes are rejected before executable probing. The gate still does not accept renderer-provided paths, arbitrary user paths, Playwright cache paths, system Chrome/Edge, or runtime auto-download.

## Fake fixture structure

Tests create fake runtime packages in temporary directories rather than committing a browser binary. A valid fixture has this shape:

```text
<temp-runtime-root>/
  manifest.json
  bin/
    chromium
```

`bin/chromium` is a tiny test stub file. The manifest records the stub file size and SHA-256 so the gate can validate package metadata without launching a browser.

## Gate validation added in M18

M18 adds or tightens validation for:

- package id mismatch;
- runtime id mismatch;
- platform / architecture mismatch;
- executable relative-path containment;
- executable existence;
- executable file type;
- optional capability list shape;
- required hash / size / provenance / license metadata completeness;
- executable size mismatch;
- executable SHA-256 mismatch;
- sanitized diagnostics with no raw path, full hash, file body, storage ref, command, or environment exposure.

New diagnostic:

- `html_pdf_runtime_metadata_incomplete`

Existing diagnostics remain:

- `html_pdf_runtime_missing`
- `html_pdf_runtime_manifest_invalid`
- `html_pdf_runtime_executable_missing`
- `html_pdf_runtime_path_rejected`
- `html_pdf_runtime_platform_unsupported`

## Current HTML->PDF status

HTML->PDF remains runtime-gated unavailable. M18 does not call Playwright, does not download Chromium, does not generate PDF, and does not create ready `converted_pdf` DerivedAssets.

## Next step

Next recommended package is a production package policy/installer decision if Owner wants production-ready HTML->PDF. A dev-only M19 generation pilot can proceed only if Owner explicitly accepts a fake/fixture runtime or approved local managed runtime artifact for tests; it must still avoid `npx playwright install chromium` as an implicit production path.
