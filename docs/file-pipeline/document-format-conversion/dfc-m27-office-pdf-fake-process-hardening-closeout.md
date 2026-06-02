# DFC-M27 Office PDF Fake-Process Hardening and Readiness Closeout

Date: 2026-06-03
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: `77cb8c8`

## Outcome

M27 hardens the M26 DOCX-to-PDF fake-process DFC seam and records readiness
boundaries before any real LibreOffice execution. The seam remains a backend
test/pilot confidence path, not production Office-to-PDF support.

## Hardening coverage

The M27 regression coverage confirms:

- fake success creates a verified `converted_pdf` DerivedAsset
- fake process failure creates no ready DerivedAsset
- fake process timeout creates no ready DerivedAsset
- missing fake output creates no ready DerivedAsset
- non-PDF fake output creates no ready DerivedAsset
- ambiguous multiple PDF outputs fail closed
- escaped output paths remain rejected by the adapter output validator
- adapter sandbox cleanup is attempted after fake success and fake failure when
  requested
- unavailable or failed PDF candidates cannot become valid selected ready
  options

The worker-level output-validation failures now map to
`derivative_output_write_failed` instead of a generic not-implemented result.
Timeout still maps to `derivative_task_timeout`.

## DFC semantics

The successful fake-process seam preserves:

- `derivedKind: converted_pdf`
- `targetKind: pdf_attachment`
- `sendStrategy: file_attachment`
- `sendAssetRefs: derived_asset`
- `usage: preview_and_send`
- metadata-only PDF preview
- Send Plan authority from selected refs plus verified DerivedAsset metadata
- no legacy fallback

DOCX `markdown` and `original_file` remain available and unaffected.

## Managed runtime gate

The managed LibreOffice runtime gate remains the required availability boundary.
M27 relies on existing M23/M25 gate regressions for:

- missing runtime
- disabled runtime
- invalid manifest
- executable path escape
- symlink escape
- metadata incomplete
- unsupported platform

A fake valid runtime only enables the gate. It does not run real conversion
unless the backend test injects a fake process runner.

## Privacy and diagnostics

Diagnostics and renderer-facing DTOs must not expose:

- absolute paths
- file URLs
- sandbox paths
- storage refs
- content tokens
- full hashes
- DOCX body
- PDF body
- command lines
- environment
- raw manifest/license body
- internal stack traces

M27 adds worker-level non-leak assertions for timeout and output-validation
failure modes, and adapter-level non-leak assertions for cleanup/failure.

## Non-goals

- Do not run real LibreOffice.
- Do not run `soffice`.
- Do not discover system LibreOffice.
- Do not use PATH fallback.
- Do not submit a LibreOffice binary.
- Do not support `.doc`, `.rtf`, or `.docm`.
- Do not change DB schema, renderer IPC shape, Send Plan main flow, asset
  model, DFC vocabulary, or HTML-to-PDF behavior.
- Do not declare production Office-to-PDF support.

## Validation

Validation passed:

- `npm run rebuild:node`
- `git diff --check`
- `npx vue-tsc --noEmit --pretty false`
- `npx vitest --run infra/files/dfcLibreOfficePdfAdapter.test.ts infra/files/dfcManagedLibreOfficeRuntime.test.ts infra/db/worker.filePipeline.test.ts infra/files/conversationAttachmentService.test.ts infra/files/sendPlanService.test.ts --reporter=dot --silent`

Result summary:

- Targeted Vitest passed: 5 files / 159 tests.
- `git diff --check` passed with LF/CRLF warnings only.

## Readiness decision

Office-to-PDF can remain as a fake-process backend seam for DFC contract
confidence. It is not ready for production or broad user-visible support until
Owner approves a real managed LibreOffice artifact, installer/update policy,
real execution sandboxing, smoke confidence, and exposure gates.

## Recommended next package

M28 should be an owner decision for one of:

1. a real managed LibreOffice artifact and dev-only `soffice` execution
   package; or
2. additional managed package/install policy hardening before real execution.

Do not enter `.doc`, `.rtf`, `.docm`, Office-family expansion, or production
support claims before that decision.
