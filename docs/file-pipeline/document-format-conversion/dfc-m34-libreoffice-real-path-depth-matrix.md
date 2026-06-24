# DFC-M34 LibreOffice Real Path-Depth Matrix And Path Policy

Status: real path-depth evidence / production not approved

Date: 2026-06-22

Branch: `main`

Baseline: `e6ef1f7d`

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This round runs the real LibreOffice DOCX-to-PDF path-depth matrix with explicit repo-external managed runtime roots and selects a concrete path policy before packaged smoke work.

## Scope Boundary

M34 does not change production conversion behavior.

- `productionApproved=false` remains unchanged.
- `downloadEnabled=false` remains unchanged.
- DOCX `pdf_attachment` remains owner-gated and experimental.
- Production Office-to-PDF support is not declared.
- Packaged smoke is not complete.
- `.doc`, `.rtf`, `.docm`, `.xls` / `.xlsx` Office-to-PDF, PS/EPS, PDF OCR, image, and audio remain unsupported.
- System LibreOffice discovery, PATH fallback, arbitrary executable paths, renderer-provided executable paths, implicit runtime download, postinstall download, and conversion-time download remain forbidden.
- No LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, or temp output is committed.

## Runtime Roots Used

M34 used two explicit repo-external managed runtime roots:

- Short runtime root: prepared from the existing repo-external prerelease `.svpkg` through the archive/import bridge.
- Deep runtime root: copied from the verified short active runtime into a deliberately deep repo-external root, then revalidated by the matrix runtime gate before conversion attempts.

Raw absolute paths are intentionally not recorded here. The matrix records only path classes and lengths.

## Harness Changes

Test-only changes in `infra/files/dfcLibreOfficePathDepthSmokeMatrix.test.ts`:

- Added A/B/C/D labels.
- Added sanitized `failurePhase`.
- Added sanitized `pdfOutputValidation`.
- Added per-case sanitized evidence output.
- Continued through all matrix cases before evaluating harness failures.
- Treated deep-path conversion failures as evidence rather than a harness failure.
- Kept the harness failing on raw path leaks, missing path-class capture, cleanup failure, or short-short regression.
- Added a test-local guarded spawn wrapper to suppress stream-error noise from failed spawn attempts without changing production external-process behavior.

No adapter, runtime gate, acquisition, DB, IPC, Send Plan, asset model, DFC vocabulary, dependency, lockfile, or production catalog behavior changed.

## Real Matrix Evidence

Command shape:

```powershell
$env:STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SMOKE = '1'
$env:STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SHORT_RUNTIME_ROOT = '<repo-external-short-managed-runtime-root>'
$env:STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_DEEP_RUNTIME_ROOT = '<repo-external-deep-managed-runtime-root>'
npx vitest --run infra/files/dfcLibreOfficePathDepthSmokeMatrix.test.ts --reporter=dot
```

Sanitized matrix result:

| Label | Case | Runtime class | Sandbox class | Runtime root len | Sandbox root len | Input path len | Output dir len | Profile dir len | Pass/fail | Failure phase | Diagnostic code | Cleanup | PDF output validation |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |
| A | `short-runtime-short-sandbox` | short | short | 119 | 70 | 110 | 77 | 96 | pass | none | none | attempted | valid_pdf |
| B | `short-runtime-deep-sandbox` | short | deep | 119 | 257 | 321 | 264 | 283 | fail | process_execution | `command_not_found` | attempted | not_reached |
| C | `deep-runtime-short-sandbox` | deep | short | 300 | 69 | 124 | 76 | 95 | fail | process_execution | `command_not_found` | attempted | not_reached |
| D | `deep-runtime-deep-sandbox` | deep | deep | 300 | 256 | 319 | 263 | 282 | fail | process_execution | `command_not_found` | attempted | not_reached |

Evidence interpretation:

- Short runtime plus short sandbox is sufficient for the current Windows x64 managed LibreOffice DOCX-to-PDF path.
- Deep sandbox/input/output/profile paths fail even with a short runtime root.
- A deep runtime root fails even with a short sandbox.
- Deep runtime plus deep sandbox fails.
- All failed cases fail before controlled PDF output validation can run.
- Cleanup was attempted in all four cases.
- The sanitized matrix output did not include raw runtime roots, sandbox roots, executable paths, input paths, output paths, command lines, environment, DOCX body, PDF body, storage refs, content tokens, or full hashes.

## Selected Path Policy

M34 selects the controlled short-path runtime/sandbox policy.

Policy:

1. Windows x64 LibreOffice DOCX-to-PDF packaged smoke and any future user-visible gate must activate the managed runtime under a Starverse-controlled short runtime root.
2. Conversion must use a Starverse-controlled short sandbox root, preferably OS temp or an app-managed short temp root.
3. Deep app-data, workspace, profile, package extraction, or user-provided roots must not be used directly for LibreOffice execution.
4. If the app-managed install/cache root is deep, the runtime must be relocated or activated through a short controlled execution root before conversion.
5. If the sandbox/input/output/profile path cannot stay inside the short-path envelope, DOCX `pdf_attachment` must fail closed before launching LibreOffice.
6. Renderer-visible diagnostics must stay symbolic and must not expose the root selected for execution.

M34 short-path envelope for the next packaged smoke:

| Path | Evidence pass length | M35 target cap |
| --- | ---: | ---: |
| managed runtime root | 119 | <= 120 |
| sandbox root | 70 | <= 80 |
| input path | 110 | <= 130 |
| output directory | 77 | <= 90 |
| isolated profile directory | 96 | <= 110 |

These M35 target caps are not a general Windows maximum-path support claim. They are a concrete execution policy for the next packaged smoke. A future max supported path length policy remains unselected.

## Gate Status

Closed in M34:

- Real A/B/C/D matrix ran with explicit repo-external short and deep managed runtime roots.
- Sanitized evidence captured path classes, path lengths, pass/fail, failure phase, diagnostic code, cleanup status, and PDF output validation state.
- Controlled short-path runtime/sandbox policy selected for M35.

Still blocked:

- Production Office-to-PDF approval.
- `productionApproved=true`.
- `downloadEnabled=true`.
- Packaged smoke completion.
- User-visible experimental support.
- Legal/provenance approval.
- Signing/trust policy approval.
- Production acquisition/distribution policy approval.
- Runtime security audit for macro/network/external-link/embedded-object behavior in a production-like packaged context.
- Multi-platform runtime packages and platform-specific path-depth evidence.

## Validation

M34 validation:

- `npm run rebuild:node`: passed.
- `npx vue-tsc --noEmit --pretty false`: passed.
- `npx vitest --run infra/files/dfcLibreOfficePathDepthSmokeMatrix.test.ts --reporter=dot --silent`: passed with 2 default-off tests passed and 1 real smoke skipped.
- Repo-external short runtime root preparation through `infra/files/dfcLibreOfficeRuntimePackageArchive.test.ts -t "real owner-approved"`: passed with 1 real package import test passed and 8 skipped.
- Real path-depth matrix with explicit runtime roots: passed as an evidence run with 3 tests passed; A passed and B/C/D recorded expected path-depth failures.
- Targeted LibreOffice runtime/adapter/installer/acquisition/lifecycle/archive/checklist tests: passed with 7 files, 128 tests passed, and 1 gated real-smoke skipped.
- Targeted DFC worker tests for LibreOffice / Office PDF / DOCX `pdf_attachment` / unsupported / real managed: passed with 13 tests passed and 45 skipped.
- `git diff --check`: passed with LF/CRLF warnings only.

Validation leaves the ABI target as Node/Vitest.

## Recommended M35

Recommended M35: packaged smoke preparation using the controlled short-path policy.

M35 should:

- prepare a production-like packaged app smoke route,
- activate/import the current Windows x64 package into a controlled short execution root,
- force the LibreOffice conversion sandbox into a controlled short root,
- assert the M34 target caps before launch,
- run DOCX-to-PDF through the packaged app path,
- verify metadata-only preview and selected-ref Send Plan authority,
- verify missing/disabled runtime fail-closed behavior,
- keep `productionApproved=false` and `downloadEnabled=false`.

M35 must not claim production support or expand Office formats.
