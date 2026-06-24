# DFC-M35 LibreOffice Packaged Smoke Confidence

Status: packaged managed-runtime smoke evidence / production not approved

Date: 2026-06-22

Branch: `main`

Baseline: `e6ef1f7d`

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. M35 follows the M34 controlled short-path runtime/sandbox policy and does not select a general Windows long-path support policy.

## Scope Boundary

M35 adds packaged-smoke harness confidence only.

- `productionApproved=false` remains unchanged.
- `downloadEnabled=false` remains unchanged.
- DOCX `pdf_attachment` remains owner-gated and experimental.
- Production Office-to-PDF support is not declared.
- Full packaged app / installer smoke completion is not declared.
- `.doc`, `.rtf`, `.docm`, `.xls` / `.xlsx` Office-to-PDF, PS/EPS, PDF OCR, image, and audio remain unsupported.
- System LibreOffice discovery, PATH fallback, arbitrary executable paths, renderer-provided executable paths, implicit runtime download, postinstall download, and conversion-time download remain forbidden.
- No LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, or temp output is committed.

## Harness Changes

New test/harness files:

- `infra/files/dfcLibreOfficePackagedSmokeConfidence.test.ts`
- `scripts/dfc/office-pdf-libreoffice-packaged-smoke.mjs`

Updated script entry:

- `npm run test:office-pdf-libreoffice-packaged-smoke`

The new command requires an explicit repo-external `.svpkg` input through `STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG` or `STARVERSE_DFC_LIBREOFFICE_REAL_SVPKG`. It does not download LibreOffice and does not use the M28 `.external-runtime-work` dev artifact as authority.

No adapter, runtime resolver, acquisition policy, DB schema, renderer IPC, Send Plan main-flow, asset model, DFC vocabulary, dependency, lockfile, production approval, or download state changed.

## Short-Path Gate

M35 enforces the M34 controlled short-path caps in the packaged-smoke harness before launching LibreOffice:

| Path | Cap | Observed M35 length | Result |
| --- | ---: | ---: | --- |
| managed runtime root | <= 120 | 98 | pass |
| sandbox root | <= 80 | 47 | pass |
| input path | <= 130 | 66 | pass |
| output directory | <= 90 | 54 | pass |
| isolated profile directory | <= 110 | 72 | pass |

If any cap is exceeded, the harness fails closed before launch with symbolic diagnostic `office_pdf_path_policy_exceeded`. The unit test verifies that this path does not attempt conversion and does not serialize raw paths.

## Packaged Smoke Evidence

Command shape:

```powershell
$env:STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG = '<repo-external-prerelease-svpkg>'
npm run test:office-pdf-libreoffice-packaged-smoke
```

Sanitized result:

| Case | Path class | Stage | Pass/fail | Diagnostic | Cleanup | PDF validation |
| --- | --- | --- | --- | --- | --- | --- |
| `m35-packaged-short-runtime-short-sandbox` | controlled_short | adapter_conversion | pass | none | attempted | valid_pdf |

Validated package/runtime identity:

- Top-level package identity: `starverse.dfc.libreoffice` / `libreoffice` / `libreoffice-office-pdf`.
- Package version: `0.1.0`.
- Runtime version: `26.2.4`.
- Platform / arch: `win32` / `x64`.
- Production gate: `productionApproved=false`, owner-gated, experimental.
- Acquisition state: catalog points at the prerelease asset but `downloadEnabled=false`.
- Runtime executable relative path: managed manifest-relative `program/soffice.exe`.
- Executable hash/size: validated against the runtime manifest by the runtime gate.
- Capabilities: `office_to_pdf` and `docx_to_pdf`.
- Security metadata: macro, network, external-link, embedded-object execution disabled, isolated profile required.

DOCX-to-PDF result:

- Minimal DOCX fixture converted through managed `soffice`.
- Process launch used the managed executable descriptor, `shell=false`, `allowBatchEntrypoint=false`, and an empty environment.
- Output path stayed under the controlled sandbox output directory.
- PDF validation passed.
- Sandbox cleanup was attempted.

DFC worker semantics:

- Existing real managed worker smoke was reused against the imported active runtime root.
- It passed and verified ready DOCX `pdf_attachment`, `derivedKind: converted_pdf`, `sendStrategy: file_attachment`, `sendAssetRefs: derived_asset`, metadata-only PDF preview, and Send Plan selected-ref authority backed by verified DerivedAsset metadata.

## Fail-Closed Evidence

M35 default-off tests verify:

- Missing managed runtime fails closed with `office_pdf_runtime_missing`.
- Disabled runtime fails closed with `office_pdf_runtime_disabled`.
- Executable hash/size mismatch fails closed with `office_pdf_runtime_manifest_invalid`.
- Path-cap exceedance fails closed before launch with `office_pdf_path_policy_exceeded`.
- Catalog remains default-off, owner-gated, DOCX-only, and not production-approved.

Existing targeted archive/runtime tests continue to cover missing package manifest, missing inventory, missing runtime manifest, missing executable, unlisted files, hash/size mismatch, platform mismatch, executable path escape, production gate invalid, unsafe extraction root, and sanitized diagnostics.

## Deep-Path Classification

M35 deliberately did not attempt broad long-path support. It ran only the requested lightweight deep-runtime diagnostic slice.

Sanitized classification:

| Case | Runtime path class | Runtime root len | `fs.stat` deep executable | Runtime gate realpath containment | Spawn source | Final classification |
| --- | --- | ---: | --- | --- | --- | --- |
| `m35-deep-runtime-classification` | deep_runtime | 191 | found | passed | managed_descriptor | downstream_process_long_path_failure |

Interpretation:

- Starverse path resolution can locate the deep `soffice.exe`.
- The managed runtime gate realpath containment passes for the deep executable.
- Spawn source classification remains `managed_descriptor`; no PATH/system lookup was detected.
- The M34 deep-path `command_not_found` cases therefore classify as downstream process / Windows / LibreOffice long-path behavior for this evidence slice, not an obvious Starverse path resolution/import/manifest bug.

No Windows long-path manifest settings, LibreOffice internals, command escaping branches, antivirus behavior, filesystem policy, or broad long-path support investigation was performed.

## Privacy Evidence

Sanitized evidence records only:

- case id,
- path class,
- path lengths,
- validation stage,
- pass/fail,
- symbolic diagnostic code,
- cleanup status,
- PDF validation status,
- deep-path classification fields.

The packaged smoke output and evidence did not include raw absolute paths, usernames, runtime roots, sandbox roots, executable paths, input/output paths, command lines, env, DOCX body, PDF body, storage refs, content tokens, or full hashes.

## Validation

M35 validation:

- `npm run rebuild:node`: passed.
- `npx vue-tsc --noEmit --pretty false`: passed.
- `npm run test:office-pdf-libreoffice-packaged-smoke`: passed. Packaged smoke evidence passed and worker real-managed smoke passed.
- `npx vitest --run infra/files/dfcManagedLibreOfficeRuntime.test.ts infra/files/dfcLibreOfficePdfAdapter.test.ts infra/files/dfcLibreOfficeManagedPackageInstaller.test.ts infra/files/dfcLibreOfficeRuntimeAcquisition.test.ts infra/files/enginePluginLifecycleService.test.ts infra/files/dfcLibreOfficeRuntimePackageArchive.test.ts infra/files/dfcLibreOfficeProductionApprovalChecklist.test.ts infra/files/dfcLibreOfficePackagedSmokeConfidence.test.ts --reporter=dot --silent`: passed with 133 tests passed and 2 gated real-smoke tests skipped.
- `npx vitest --run infra/db/worker.filePipeline.test.ts -t "LibreOffice|Office PDF|DOCX pdf_attachment|unsupported|real managed" --reporter=dot --silent`: passed with 13 tests passed and 45 skipped.
- `npx vitest --run infra/files/dfcLibreOfficePathDepthSmokeMatrix.test.ts --reporter=dot --silent`: passed with 2 tests passed and 1 real smoke skipped.
- `git diff --check`: passed with LF/CRLF warnings only.
- Privacy/sanitized evidence scan over the M35 evidence doc and smoke script: passed; no raw runtime path, username, user profile path, concrete `.svpkg` asset filename, PDF body marker, content token, storage URI, or full hash was found.

Validation leaves the ABI target as Node/Vitest.

## Gate Status

Closed in M35:

- Production-like managed package-location smoke passed under the controlled short-path caps.
- The current Windows x64 prerelease `.svpkg` can be imported into a short app-managed root, discovered, validated, and used for DOCX-to-PDF.
- Ready DFC worker semantics are verified through the existing real managed worker smoke.
- Lightweight deep-runtime classification completed.
- Missing, disabled, executable-mismatch, and path-cap-exceeded fail-closed cases are covered.

Still blocked:

- Production Office-to-PDF approval.
- `productionApproved=true`.
- `downloadEnabled=true`.
- Full packaged app / installer smoke.
- User-visible experimental support.
- Legal/provenance approval.
- Signing/trust policy approval.
- Production acquisition/distribution approval.
- Runtime security audit for macro/network/external-link/embedded-object behavior in a production-like packaged context.
- Multi-platform runtime packages and platform-specific packaged smoke.
- General long-path support.

## Recommended M36

Recommended M36: full packaged app / installer smoke rehearsal using the M34/M35 controlled short-path policy.

M36 should:

- run from a built/packaged app or installer-equivalent layout,
- activate the managed LibreOffice runtime under the same short runtime-root cap,
- keep the conversion sandbox under the short-path cap,
- verify user-consent wording and owner-gated experimental diagnostics,
- keep `productionApproved=false` and `downloadEnabled=false`,
- preserve DOCX-only `pdf_attachment` scope,
- decide whether the M35 path-cap guard should move from harness enforcement into the production conversion gate before any user-visible exposure.
