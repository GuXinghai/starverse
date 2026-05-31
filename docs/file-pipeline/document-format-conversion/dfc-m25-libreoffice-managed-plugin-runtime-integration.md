# DFC-M25 LibreOffice Managed Plugin Runtime Integration

Status: implemented as a managed plugin/runtime boundary only.

## Scope

M25 aligns the DOCX-first Office-to-PDF LibreOffice runtime gate with the existing Starverse managed plugin/runtime pattern used by Magika. This is not real Office-to-PDF conversion support.

## Managed plugin/runtime contract

The LibreOffice Office PDF runtime package manifest now requires:

- `manifestSchemaVersion`
- `pluginId: libreoffice`
- `engineId: libreoffice`
- `runtimeId: libreoffice-office-pdf`
- `packageId` and `runtimePackageId: starverse.dfc.libreoffice`
- `displayName`
- `pluginVersion`
- `runtimeKind: managed_external_process`
- `platform` and optional `arch`
- managed executable relative path, for example `program/soffice.exe`
- LibreOffice version and package version
- capabilities `office_to_pdf` and `docx_to_pdf`
- artifact hash, executable hash, executable size
- provenance, official release/package reference, license, notices, attribution
- minimum Starverse runtime contract version
- security policy metadata requiring macros disabled, network disabled, external links disabled, embedded object execution disabled, and isolated profile required

## Magika precedent reused

The implementation follows the Magika managed runtime precedent at the contract boundary:

- manifest-first managed package discovery
- relative-path-only runtime entries
- realpath containment for symlink escape resistance
- hash/size/provenance/license metadata requirements
- conversion into an external engine registry manifest
- symbolic sanitized diagnostics instead of raw manifest/path details

M25 does not reuse Magika-specific lifecycle installation code directly. LibreOffice remains a separate DFC heavyweight conversion runtime with its own contract and diagnostics.

## Availability behavior

LibreOffice availability must come from an app-managed runtime package root and its manifest. The gate rejects or fails closed for:

- missing runtime manifest: `office_pdf_runtime_missing`
- disabled plugin/runtime: `office_pdf_runtime_disabled`
- invalid manifest shape or hash/size mismatch: `office_pdf_runtime_manifest_invalid`
- missing executable: `office_pdf_runtime_executable_missing`
- absolute path, traversal, UNC, drive escape, NUL, or symlink escape: `office_pdf_runtime_path_rejected`
- unsupported platform or architecture: `office_pdf_runtime_platform_unsupported`
- incomplete provenance, release, license, notices, capabilities, or security metadata: `office_pdf_runtime_metadata_incomplete`

The gate does not accept renderer-provided paths, arbitrary user paths, system LibreOffice, or `PATH` fallback.

## DFC behavior

DOCX may continue to expose an unavailable/blocked `pdf_attachment` candidate when the managed LibreOffice runtime is missing, disabled, invalid, or incomplete. A fake valid managed plugin/runtime package only proves gate availability; it does not run conversion and does not produce a ready DerivedAsset.

DOCX `markdown` and `original_file` remain unaffected. `.doc`, `.rtf`, and `.docm` remain unsupported. Unavailable PDF candidates have no selected refs and cannot become valid ready selected options. No legacy fallback is introduced.

## Explicit non-goals

- no real `soffice` execution
- no system LibreOffice lookup or production fallback
- no LibreOffice binary or package artifact committed
- no real Office-to-PDF conversion
- no DOC, RTF, DOCM, Office family expansion, or PS/EPS
- no DB schema, renderer IPC shape, Send Plan main-flow, asset model, DFC target vocabulary, or HTML-to-PDF pipeline change
- no packaged installer, CI, full-suite failure work, or npm audit work

## Validation

Required validation:

- `git diff --check`
- `npx vue-tsc --noEmit --pretty false`
- `npm run rebuild:node`
- `npx vitest --run infra/files/dfcManagedLibreOfficeRuntime.test.ts --reporter=dot --silent`
- `npx vitest --run infra/db/worker.filePipeline.test.ts -t "LibreOffice|Office PDF|DOCX pdf_attachment|unsupported" --reporter=dot --silent`

## Next step

M26 should either wire a fake-process DFC generation seam for DOCX PDF readiness testing, or continue managed runtime package hardening around official release metadata and installer policy. Real managed LibreOffice artifacts, installer distribution, `soffice` execution, and production Office-to-PDF support still require separate Owner approval.
