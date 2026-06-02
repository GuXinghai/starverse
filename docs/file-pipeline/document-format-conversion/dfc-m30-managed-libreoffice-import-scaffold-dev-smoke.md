# DFC-M30 Managed LibreOffice Import Scaffold and Dev Artifact Smoke

Date: 2026-06-03
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: `4a8bfad`

## Outcome

M30 adds a managed LibreOffice package import/install scaffold for the
DOCX-first Office-to-PDF path and a dev-only import smoke that uses the M28
managed LibreOffice artifact.

This does not declare production Office-to-PDF support.

## Import/install scaffold

New helper:

- `infra/files/dfcLibreOfficeManagedPackageInstaller.ts`

The helper imports an already prepared managed LibreOffice runtime directory
into an app-managed runtime root. It does not download LibreOffice and does not
discover system LibreOffice.

Covered scaffold behavior:

- source runtime root existence check
- source manifest parse
- optional expected artifact SHA-256 check
- M23/M25 runtime gate validation before import
- symlink rejection before and after staging
- controlled staging copy
- active runtime root activation
- previous known-good metadata capture
- rollback to previous non-revoked known-good runtime
- failed staging cleanup
- revoked package rejection
- sanitized diagnostics

## Dev artifact import smoke

New script:

- `scripts/dfc/office-pdf-libreoffice-import-dev-smoke.mjs`

The script requires the M28 dev artifact at:

- `.external-runtime-work/libreoffice/managed-runtimes/dfc-office-pdf/libreoffice-office-pdf`

If that artifact is missing, the script fails and does not download
LibreOffice.

The script imports the M28 runtime into:

- `.external-runtime-work/libreoffice/import-smoke-app-root/managed-runtimes/dfc-office-pdf/libreoffice-office-pdf`

Then it runs:

- adapter-level real `soffice` smoke through the imported active root

M30 intentionally does not run the DFC worker real smoke through the imported
active root. The imported-runtime adapter smoke is low-intrusion and passed in
the current environment; the worker-level path would require timeout/packaged
smoke tuning and remains an M31 task. The DFC seam itself remains covered by
M26 fake-process tests and M28 dev real smoke.

The work root remains ignored by git.

## Runtime and fallback boundary

M30 continues to forbid:

- system LibreOffice lookup
- `PATH` fallback
- user-selected arbitrary `soffice` executable paths
- renderer-provided executable paths
- runtime auto-download
- postinstall download
- LibreOffice binary commits

Real `soffice` is used only through the imported managed runtime artifact in the
dev smoke.

## DFC behavior

When the imported runtime is available, the dev smoke can exercise the existing
M26/M28 DOCX `pdf_attachment` path:

- `derivedKind: converted_pdf`
- `targetKind: pdf_attachment`
- `sendStrategy: file_attachment`
- `sendAssetRefs: derived_asset`
- metadata-only preview
- Send Plan selected-ref authority

Failure remains fail-closed. `.doc`, `.rtf`, and `.docm` remain unsupported.

## Production readiness

Office-to-PDF is still not production support. M30 proves managed import and
dev activation around the already approved M28 artifact only.

Production readiness still needs:

- production package source and signature policy
- packaged smoke
- user-visible diagnostics
- focused security review for package lifecycle and real execution
- owner approval for experimental exposure

## Validation

Required validation:

- `git diff --check`
- `npx vue-tsc --noEmit --pretty false`
- `npm run rebuild:node`
- targeted import/install/runtime/DFC tests
- `npm run test:office-pdf-libreoffice-import-dev-smoke` when the M28 artifact
  exists

M30 dev import smoke coverage:

- import M28 managed runtime artifact
- activate it under a separate app-managed dev root
- run real `soffice` through the imported active root at adapter level
- validate controlled PDF output and cleanup

DFC worker real smoke through the imported active root is deferred to M31.

## Recommended next package

Proceed to M31 packaged Office-to-PDF smoke confidence or user-visible
experimental gate planning only after Owner accepts the M30 managed import
boundary. Do not expand to `.doc`, `.rtf`, or `.docm`.
