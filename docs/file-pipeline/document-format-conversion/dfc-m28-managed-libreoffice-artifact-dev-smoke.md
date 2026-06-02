# DFC-M28 Managed LibreOffice Artifact Acquisition and Dev Smoke

Date: 2026-06-03
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: `f370846`

## Outcome

M28 adds a dev-only managed LibreOffice artifact acquisition and smoke path for
DOCX-first Office-to-PDF. It downloads/prepares a controlled LibreOffice runtime
outside git, generates a managed runtime manifest, validates the runtime through
the M25 gate, and runs real `soffice` through the M24 adapter.

This does not declare production Office-to-PDF support.

## Artifact acquisition

Script:

- `scripts/dfc/office-pdf-libreoffice-dev-smoke.mjs`

Package script:

- `npm run test:office-pdf-libreoffice-dev-smoke`

Default source:

- `https://download.documentfoundation.org/libreoffice/stable/25.8.7/win/x86_64/LibreOffice_25.8.7_Win_x86-64.msi`

Default local work root:

- `.external-runtime-work/libreoffice`

The work root is already gitignored. The downloaded MSI, administrative
extraction output, managed runtime files, and LibreOffice binaries are not
committed.

## Managed runtime manifest

The script creates:

- `.external-runtime-work/libreoffice/managed-runtimes/dfc-office-pdf/libreoffice-office-pdf/manifest.json`

Observed dev artifact metadata:

- LibreOffice version: `25.8.7`
- executable relative path: `program/soffice.exe`
- artifact sha256: `ecdb65e76f5e91dc198b8c8dce5b5d6e1eb12fea6023553e52b591afd10b619d`
- executable sha256: `f6a905cea619a73d33ad069b316a0401ad4f2c986571a037cd3b0d6d8ab2745c`
- executable size: `365480`
- provenance: The Document Foundation official LibreOffice MSI
- license metadata: `MPL-2.0`
- attribution: `LibreOffice by The Document Foundation`

The manifest includes package/plugin/runtime ids, platform/arch, capabilities
`office_to_pdf` and `docx_to_pdf`, official release metadata, and the existing
macro/network/external-link/embedded-object/isolated-profile security policy
metadata required by the M25 runtime gate.

## Dev-only real smoke

M28 adds:

- `infra/files/dfcLibreOfficePdfAdapter.real-smoke.test.ts`
- an env-gated DFC worker real smoke in `infra/db/worker.filePipeline.test.ts`

The smoke script sets:

- `STARVERSE_DFC_LIBREOFFICE_REAL_SMOKE=1`
- `STARVERSE_DFC_LIBREOFFICE_RUNTIME_ROOT=<managed runtime root>`

Smoke coverage:

- validates managed runtime discovery and manifest metadata
- runs real managed `soffice.exe` through `runExternalProcess`
- uses the M24 adapter command plan with `shell: false`
- uses M15 sandbox-controlled input/output/work dirs
- uses isolated LibreOffice profile under the sandbox
- converts a minimal DOCX fixture to PDF
- validates PDF output through the adapter output validator
- cleans up the sandbox
- triggers DFC DOCX `pdf_attachment` generation through `ensureDfcOptions`
- creates a `converted_pdf` DerivedAsset
- verifies metadata-only preview
- verifies Send Plan uses selected refs plus verified DerivedAsset metadata

## Boundaries

M28 does not:

- commit LibreOffice binaries
- commit downloaded/extracted artifacts
- use system LibreOffice or PATH fallback
- allow arbitrary user-provided `soffice` paths
- support `.doc`, `.rtf`, or `.docm`
- declare production Office-to-PDF support
- change DB schema, renderer IPC shape, Send Plan main flow, asset model, DFC
  vocabulary, or HTML-to-PDF behavior
- add packaged installer or CI support

## Validation

Dev smoke passed:

- `npm run test:office-pdf-libreoffice-dev-smoke`

Result summary:

- Adapter real smoke passed: 1 test.
- DFC worker real smoke passed: 1 test, 56 skipped by filter.
- Real `soffice.exe` generated a PDF.
- DFC real smoke generated a `converted_pdf` DerivedAsset.

Required final validation for completion report:

- `npm run rebuild:node`
- `git diff --check`
- `npx vue-tsc --noEmit --pretty false`
- targeted M23/M24/M26 tests

## Production readiness

Office-to-PDF remains dev-only and owner-gated. Production support still needs
separate approval for managed artifact distribution, installer/update policy,
artifact trust/signature handling, packaged smoke, security review, and default
exposure gates.

## Recommended next package

M29 should decide production managed LibreOffice packaging and trust policy, or
run a focused dev-real Office PDF hardening package. Do not enter `.doc`,
`.rtf`, `.docm`, or production support claims before that decision.
