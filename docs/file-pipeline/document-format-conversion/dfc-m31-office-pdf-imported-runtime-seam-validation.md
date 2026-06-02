# DFC-M31 Office PDF Imported Runtime Seam Validation

Date: 2026-06-03
Branch: docs/dfc-0-format-conversion-foundation
Baseline: 73e508a

## Outcome

M31 validates the imported managed LibreOffice runtime seam for DOCX-first Office-to-PDF in the DFC worker path. The imported active runtime under the ignored dev app root can run real managed `soffice` through the existing adapter and the DFC worker smoke can produce a ready `pdf_attachment` option backed by a verified `converted_pdf` DerivedAsset.

This remains owner-gated / experimental Office-to-PDF support. M31 does not declare production Office-to-PDF readiness.

## Fixes

- Raised the external process policy maximum timeout to allow explicitly requested long conversion jobs while keeping the default conversion timeout at 60 seconds.
- Raised the Office PDF DFC job timeout and real smoke timeout to 300 seconds for dev managed LibreOffice execution.
- Restored the import dev smoke script so it runs both adapter-level real `soffice` import smoke and DFC worker imported-runtime smoke.
- Added a dedicated minimal DOCX fixture for the real DFC Office PDF smoke so the smoke validates the imported runtime seam rather than DOCX markdown hyperlink/privacy behavior.
- Moved the LibreOffice conversion sandbox for backend DOCX->PDF jobs to an OS temp Starverse-controlled sandbox root. The M15 sandbox helper still controls input/output/work dirs, output path validation, diagnostics, and cleanup; the generated PDF is read back into the verified DerivedAsset and no sandbox path is exposed to renderer DTOs.
- Added sanitized ready-state assertions before dereferencing `sendAssetRefs`, so future failures report option/generation/job status without raw paths, storage refs, file bodies, or full hashes.

## Validated semantics

- `targetKind: pdf_attachment`
- `derivedKind: converted_pdf`
- `sendStrategy: file_attachment`
- `sendAssetRefs: derived_asset`
- `usage: preview_and_send`
- Metadata-only PDF preview
- Send Plan authority remains selected refs plus verified DerivedAsset metadata
- `original_file` and DOCX `markdown` options remain independent
- Missing/failed runtime remains fail-closed with no legacy fallback

## Boundaries

- Real LibreOffice is run only from the imported managed runtime artifact.
- The LibreOffice binary, MSI, extracted runtime, staging files, sandbox files, and temp outputs remain outside git.
- No system LibreOffice, PATH fallback, user-selected executable path, renderer-provided path, runtime auto-download, or postinstall download is introduced.
- `.doc`, `.rtf`, and `.docm` remain unsupported.
- No DB schema, renderer IPC shape, Send Plan main-flow, asset model, DFC vocabulary, or HTML-to-PDF pipeline change is made.

## Production status

Office-to-PDF remains experimental / owner-gated. Production support still requires packaged smoke confidence, production managed package policy acceptance, focused security review, complete user-visible diagnostics, and owner approval for exposure.

## Recommended next round

Proceed to M32 packaged Office-to-PDF smoke confidence or M32 user-visible experimental enablement gate planning. Do not expand to `.doc`, `.rtf`, `.docm`, system fallback, or production Office-to-PDF claims before owner approval.
