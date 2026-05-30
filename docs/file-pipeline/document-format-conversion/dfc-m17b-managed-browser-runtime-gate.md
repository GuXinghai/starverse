# DFC-M17B Managed Browser Runtime Gate

Date: 2026-05-31
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: M17A decision in progress

## Outcome

M17B adds a managed Playwright Chromium runtime availability gate for future HTML->PDF `pdf_attachment` conversion. It does not implement HTML->PDF generation, does not call Playwright, does not download Chromium, and does not create ready PDF DerivedAssets.

## Runtime contract

The gate expects a Starverse-managed runtime directory with a `manifest.json` file. The manifest must describe:

- `runtimeId`: `playwright-chromium-html-pdf`
- `platform`
- optional `arch`
- relative `executablePath`
- `playwrightVersion`
- `browserRevision`
- optional `sha256`
- optional `sizeBytes`
- optional `provenance`
- optional `license`

The executable path must be relative to the managed runtime root. Absolute paths, UNC paths, drive-qualified paths, NUL bytes, and traversal are rejected. The gate never accepts a renderer-provided path, arbitrary user path, system browser path, or Playwright cache path as production authority.

## DFC behavior

For managed local HTML/HTM assets, `conversationDraft.ensureDfcOptions` still produces ready `markdown` and `code` options and now also exposes a blocked `pdf_attachment` candidate when the managed browser runtime is unavailable.

When runtime validation fails:

- no Playwright process is launched;
- no PDF is generated;
- no ready `converted_pdf` derivative is created;
- the option is unavailable/blocked with a symbolic diagnostic;
- preview remains blocked/metadata-free;
- send cannot use a ready derived PDF asset;
- no legacy fallback is introduced.

## Fail-closed diagnostics

The runtime gate uses symbolic diagnostics only:

- `html_pdf_runtime_missing`
- `html_pdf_runtime_manifest_invalid`
- `html_pdf_runtime_executable_missing`
- `html_pdf_runtime_path_rejected`
- `html_pdf_runtime_platform_unsupported`

Diagnostics must not expose raw paths, Playwright cache locations, command lines, environment values, full hashes, storage refs, file body, or tokens to renderer DTOs.

## Validation scope

Targeted tests cover missing runtime, invalid manifest, executable outside managed root, traversal/UNC/NUL/drive path rejection, manifest hash/size validation for accepted fixtures, sanitized diagnostics, HTML markdown/code unaffected behavior, blocked `pdf_attachment` option exposure, no `converted_pdf` derivative, and blocked preview for selected unavailable PDF option.

## Current status

HTML->PDF is runtime-gated unavailable. The codebase is ready for M17C real PDF generation only after Owner provides an approved managed Chromium runtime artifact or fixture path for the test environment.
