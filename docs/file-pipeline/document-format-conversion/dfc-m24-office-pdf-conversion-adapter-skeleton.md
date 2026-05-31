# DFC-M24 Office-to-PDF Conversion Adapter Skeleton

Date: 2026-06-01
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: `a31ddb0` requested; implementation continued from current clean HEAD `59d85f4`.

## Outcome

M24 adds a DOCX-first LibreOffice PDF adapter skeleton for the future
Office-to-PDF path. It validates the process contract, sandbox paths, isolated
profile planning, output validation, fail-closed diagnostics, and test-double
process behavior.

This is not production Office-to-PDF support.

## Adapter boundary

New module: `infra/files/dfcLibreOfficePdfAdapter.ts`.

The adapter accepts only backend-owned DOCX bytes plus an internal M23 managed
LibreOffice execution descriptor. It does not accept renderer-provided paths,
system LibreOffice paths, or arbitrary executable paths.

The skeleton uses:

- M15 `dfcConversionSandbox` for controlled input, output, working directory,
  process policy mapping, fail-closed result mapping, and sanitized diagnostics.
- M23 `resolveDfcLibreOfficeRuntimeExecutionDescriptor` for an internal managed
  executable descriptor while keeping the existing renderer-safe availability
  check path-free.
- Existing `externalProcessPolicy` / `externalProcessRunner` contract types for
  a `shell: false` process plan.
- Injected fake process runner/test double for all tests.

## Command and process policy

The planned command uses only the managed runtime executable descriptor.

The planned arguments are intentionally minimal:

- `--headless`
- `--invisible`
- `--nologo`
- `--nodefault`
- `--nofirststartwizard`
- `--nolockcheck`
- `--norestore`
- `--convert-to pdf`
- `--outdir <controlled sandbox output dir>`
- `-env:UserInstallation=file://<controlled sandbox profile dir>`
- `<controlled sandbox input DOCX>`

The process plan uses:

- `shell: false`
- `allowBatchEntrypoint: false`
- controlled working directory under the sandbox
- empty environment in the skeleton plan
- configurable timeout with a 60 second default

No real `soffice` process is executed by this package.

## Output validation

The skeleton validates that:

- the expected PDF output path remains under the controlled sandbox output dir
- exactly one PDF output exists
- the output filename matches the expected descriptor
- output is present, is a file, and begins with a minimal `%PDF-` signature
- missing, non-PDF, escaped, or ambiguous outputs fail closed

Success returns only an internal controlled output descriptor. Failure and
timeout return no output descriptor.

## DFC integration seam

M24 does not wire the adapter into `conversationDraft.ensureDfcOptions`,
`DerivativeJobService`, or ready `converted_pdf` generation.

Current DFC behavior remains the M23 behavior:

- DOCX may expose a blocked/unavailable `pdf_attachment` candidate when the
  managed LibreOffice runtime gate is missing or invalid.
- A valid fake runtime gate still does not run conversion and remains blocked
  with `conversion_not_implemented`.
- DOCX `markdown` and `original_file` remain unaffected.
- `.doc`, `.rtf`, and `.docm` remain unsupported and do not expose Office PDF
  candidates.
- No legacy fallback is introduced.

## Privacy and diagnostics

Diagnostics remain symbolic/sanitized. Tests cover that process failure and
timeout diagnostics do not expose absolute paths, tokens, full hashes, command
lines, environment, storage refs, or file bodies.

The internal runtime execution descriptor includes an executable path only for
backend adapter planning. The existing M23 availability result continues to
strip executable and runtime root paths before it can feed DFC option DTOs.

## Validation

Validation passed:

- `git diff --check`
- `npx vue-tsc --noEmit --pretty false`
- `npm run rebuild:node` before DB worker targeted tests
- `npx vitest --run infra/files/dfcManagedLibreOfficeRuntime.test.ts infra/files/dfcLibreOfficePdfAdapter.test.ts --reporter=dot --silent`
- `npx vitest --run infra/db/worker.filePipeline.test.ts -t "LibreOffice|Office PDF|DOCX pdf_attachment|unsupported" --reporter=dot --silent`

Result summary:

- Runtime gate and adapter targeted tests: 18 passed.
- DB worker DOCX Office PDF candidate targeted tests: 6 passed, 44 skipped.

## Non-goals

- Do not run real LibreOffice or `soffice`.
- Do not use system LibreOffice.
- Do not submit a LibreOffice binary.
- Do not generate a real Office PDF DerivedAsset.
- Do not support `.doc`, `.rtf`, or `.docm`.
- Do not change DB schema, renderer IPC shape, Send Plan main flow, asset
  model, DFC target vocabulary, or the HTML-to-PDF pipeline.

## Recommended next package

M25 should decide whether to:

1. approve a dev-only real managed LibreOffice artifact path for local
   conversion tests; or
2. continue fake-process hardening and DFC generation seam design before any
   real `soffice` execution.

Production Office-to-PDF support should remain owner-gated until a real managed
runtime artifact, package validation, conversion output validation, no-fallback
behavior, and smoke confidence are all accepted.
