# DFC-M26 Office PDF Fake-Process DFC Seam

Date: 2026-06-01
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: `1ad1824`

## Outcome

M26 wires the DOCX-first Office-to-PDF path into the DFC generation seam only
for a managed LibreOffice runtime plus an injected fake external process
runner. This proves the backend option, DerivedAsset, preview, and Send Plan
semantics without running real LibreOffice.

This is not production Office-to-PDF support.

## Implemented seam

The DFC worker now keeps the M23/M25 behavior when no fake runner is injected:

- DOCX `pdf_attachment` remains blocked/unavailable after the managed
  LibreOffice runtime gate succeeds.
- No ready `converted_pdf` DerivedAsset is generated.
- DOCX `markdown` and `original_file` remain available.

When both conditions are true, DFC can generate a ready PDF derivative:

- a valid managed LibreOffice runtime package fixture is available
- an internal fake process runner/test double is injected into the backend
  derivative job service

The generation path uses the M24 LibreOffice adapter skeleton and M15 sandbox
planning. It does not call `soffice`, does not use system LibreOffice, and does
not accept renderer-provided executable or file paths.

## DerivedAsset semantics

Successful fake-process DOCX-to-PDF output produces a verified DerivedAsset
with:

- `derivedKind: converted_pdf`
- `targetKind: pdf_attachment`
- `sendStrategy: file_attachment`
- `sendAssetRefs: derived_asset`
- `usage: preview_and_send`
- `converterName: starverse-libreoffice-docx-pdf`
- `converterVersion: skeleton-1`
- `conversionMode: fake_process_test_seam`

The converter identity intentionally remains a skeleton/fake-process identity.
It must not be read as production LibreOffice support.

## Fail-closed behavior

The seam fails closed and produces no ready DerivedAsset when:

- the managed runtime is missing, disabled, invalid, path-rejected,
  unsupported, or metadata-incomplete
- no fake process runner is injected
- the fake process fails or times out
- output is missing, not PDF, escaped, ambiguous, or unreadable

Unavailable or failed PDF candidates expose no send refs and cannot become
valid persisted ready selections. No legacy fallback is introduced.

## Preview and Send Plan

PDF preview remains metadata-only and uses the selected derived asset ref. It
does not read or expose PDF body, storage URI, sandbox path, full hash,
content token, runtime path, command, or environment.

Send Plan continues to rely on selected refs plus verified DerivedAsset
metadata. It does not infer Office PDF behavior from extension or MIME.

## Non-goals

- Do not run real LibreOffice or `soffice`.
- Do not use system LibreOffice or PATH fallback.
- Do not submit a LibreOffice binary.
- Do not support `.doc`, `.rtf`, or `.docm`.
- Do not claim production Office-to-PDF support.
- Do not change DB schema, renderer IPC shape, Send Plan main flow, asset
  model, DFC target vocabulary, or the HTML-to-PDF pipeline.

## Validation

Validation passed:

- `npm run rebuild:node`
- `git diff --check`
- `npx vue-tsc --noEmit --pretty false`
- `npx vitest --run infra/files/dfcLibreOfficePdfAdapter.test.ts infra/files/dfcManagedLibreOfficeRuntime.test.ts infra/db/worker.filePipeline.test.ts infra/files/conversationAttachmentService.test.ts infra/files/sendPlanService.test.ts --reporter=dot --silent`

Result summary:

- LibreOffice adapter/runtime gate and DFC backend option/preview/Send Plan
  targeted tests passed: 5 files / 154 tests.

## Recommended next package

M27 should choose between:

1. Office PDF fake-process hardening and smoke planning; or
2. owner decision for a real managed LibreOffice artifact and dev-only
   `soffice` execution package.

Do not move to real LibreOffice execution without a separate owner approval
covering binary distribution, package installation, runtime updates, sandbox
policy, smoke confidence, and production exposure gates.
