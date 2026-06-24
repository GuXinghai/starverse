# DFC-M37-M39 Integrated LibreOffice Plugin Onboarding

Date: 2026-06-22

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This bundle integrates LibreOffice Office-to-PDF into Plugin Management as an owner-gated experimental managed runtime plugin. It does not approve production Office-to-PDF support.

## Scope Boundary

Unchanged:

- `productionApproved=false`.
- `downloadEnabled=false`.
- Office-to-PDF remains DOCX-only, owner-gated, experimental, and not production-approved.
- no production Office-to-PDF support claim.
- no `.doc`, `.rtf`, `.docm`, `.xls/.xlsx`, PS/EPS, PDF OCR, image, or audio expansion.
- no system LibreOffice discovery, PATH fallback, common-install probing, arbitrary executable path, renderer-provided executable path, implicit runtime download, postinstall download, or conversion-time download.
- no DB schema, Send Plan main-flow, asset model, DFC vocabulary, dependency, lockfile, GitHub release asset, or broad long-path support change.

## Plugin Management Integration Result

LibreOffice Office PDF is now preserved across the Plugin Management IPC contract and renderer view model as a managed runtime plugin with sanitized product-gate state.

Visible state includes:

| Field | Result |
| --- | --- |
| plugin name | LibreOffice Office PDF |
| status | missing / installed / disabled / invalid / blocked / experimental / degraded / ready via product gate and lifecycle state |
| runtime version | sanitized runtime DTO value |
| package version | sanitized package DTO value |
| platform / arch | runtime/catalog metadata only |
| capabilities | generic Plugin Management capability `document_conversion`; DFC runtime identity remains `office_to_pdf` / `docx_to_pdf` |
| source kind | sanitized product-gate source |
| experimental warning | shown through owner-gated / experimental labels |
| production approval | shown as not production approved |
| download state | shown as disabled by policy |
| last validation | lifecycle health/product-gate state |
| diagnostic | symbolic product/internal code only |

Implemented owner-gated control:

- `Recheck runtime` for LibreOffice calls the lifecycle health-check endpoint and re-reads the managed runtime bridge state. It does not enable, download, repair, or select an executable.

Not implemented in this round:

- renderer `.svpkg` import control.
- renderer disable / clear active runtime controls.
- quarantine action UI.

Those controls remain backend/lifecycle-planning gaps, not production blockers being silently bypassed.

## Packaged App Smoke Result

New command:

```text
npm run test:office-pdf-libreoffice-packaged-electron-smoke
```

The command requires one explicit repo-external package input:

```text
STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SVPKG=<repo-external .svpkg>
```

It stages the `.svpkg` into a short app-managed `userData` root, uses the existing packaged managed-runtime smoke for import/runtime validation, builds or uses a directory-packaged Electron app, launches the packaged executable with a smoke-only DFC query, and triggers DOCX-to-PDF through the packaged app renderer and normal DB worker path.

Current result in this shell: not run. `STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SVPKG`, `STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG`, and `STARVERSE_DFC_LIBREOFFICE_REAL_SVPKG` were absent, so no true packaged app smoke pass is claimed.

Expected sanitized evidence shape when run:

| Evidence | Value |
| --- | --- |
| packaged app smoke | `passed` / blocked before launch |
| plugin management visible | true |
| managed runtime discovery | validated by packaged worker |
| DOCX-to-PDF result | ready `pdf_attachment` |
| selected-ref authority | `derived_asset` |
| preview | metadata-only `raw_file:ready` |
| runtime root length | numeric only |
| input path length | numeric only |
| privacy | sanitized |

## Runtime Security Review Matrix

| Control | Evidence | Status |
| --- | --- | --- |
| actual invocation matches manifest policy | manifest-relative executable and realpath containment | enforced |
| managed runtime handle only | `DfcLibreOfficePluginManagedRuntimeHandle` drives launch | enforced |
| no system discovery | missing managed runtime blocks | enforced |
| no PATH fallback | process command is managed descriptor path | enforced |
| no user executable picker | no renderer/API executable path contract added | enforced |
| no renderer executable path | smoke seeder accepts fixture path only, not executable path | enforced |
| argument-array launch and `shell:false` | adapter tests and security evidence test | enforced |
| sandbox copy for input | adapter writes source bytes into DFC sandbox input | enforced |
| controlled output dir | output validated under sandbox output dir | enforced |
| isolated profile | `-env:UserInstallation=file:` profile arg | enforced |
| timeout/process-tree cleanup | external process policy and adapter diagnostics | enforced |
| stdout/stderr limits and redaction | sandbox diagnostics sanitizer tests | enforced |
| PDF output validation | PDF header validation under output dir | enforced |
| macros not executed | manifest requires policy metadata | blocking gap before production approval |
| external links not refreshed | manifest requires policy metadata | blocking gap before production approval |
| network disabled | manifest requires policy metadata and catalog declares network denied | blocking gap before production approval |
| embedded object execution disabled | manifest requires policy metadata | blocking gap before production approval |
| sandbox/profile/temp cleanup | adapter cleanup attempted on success/failure | enforced |

Manifest-only security declarations are recorded as blocking gaps before production approval. They are not treated as invocation-enforced controls.

## Diagnostic Taxonomy

| Case | Symbolic diagnostic |
| --- | --- |
| runtime missing | `office_pdf_runtime_missing` |
| runtime disabled | `office_pdf_runtime_disabled` |
| runtime invalid manifest | `office_pdf_runtime_manifest_invalid` |
| runtime metadata incomplete | `office_pdf_runtime_metadata_incomplete` |
| unsupported platform | `office_pdf_runtime_platform_unsupported` |
| install/import incomplete | `office_pdf_runtime_missing` |
| package revoked | `office_pdf_runtime_quarantined` |
| package expired | `office_pdf_runtime_manifest_invalid` |
| executable missing | `office_pdf_runtime_executable_missing` |
| executable hash mismatch | `office_pdf_runtime_manifest_invalid` |
| executable size mismatch | `office_pdf_runtime_manifest_invalid` |
| path policy exceeded | `office_pdf_path_policy_exceeded` |
| sandbox denied | `conversion_sandbox_denied` |
| conversion timeout | `conversion_engine_timeout` |
| conversion failed | `conversion_engine_failed` |
| output missing | `conversion_output_missing` |
| output escaped sandbox | `conversion_sandbox_denied` |
| output invalid PDF | `conversion_engine_failed` |
| runtime unhealthy | `conversion_engine_unhealthy` |
| package quarantined | `office_pdf_runtime_quarantined` |
| acquisition disabled | `office_pdf_acquisition_disabled` |
| download disabled by policy | `office_pdf_download_disabled_by_policy` |

All diagnostics are symbolic. No raw absolute paths, command lines, environment, storage refs, content tokens, manifest bodies, license bodies, document bodies, PDF bodies, or full hashes are part of the product/plugin evidence.

## Fail-Closed Behavior

| State | DOCX `pdf_attachment` | DerivedAsset | Fallback |
| --- | --- | --- | --- |
| valid enabled runtime under caps | ready | `converted_pdf` ready | none |
| missing runtime | unavailable/blocked | none ready | no system/PATH fallback |
| disabled runtime | unavailable/blocked | none ready | no system/PATH fallback |
| invalid manifest | unavailable/blocked | none ready | no system/PATH fallback |
| metadata incomplete | unavailable/blocked | none ready | no system/PATH fallback |
| unsupported platform | unavailable/blocked | none ready | no system/PATH fallback |
| executable missing/hash/size mismatch | unavailable/blocked | none ready | no system/PATH fallback |
| path cap exceeded | unavailable/blocked | none ready | no process launch |
| conversion timeout/failure/invalid output | unavailable/blocked | none ready | no legacy PDF fallback |
| revoked/quarantined/expired package | unavailable/blocked | none ready | no launch |
| acquisition/download disabled | unavailable/blocked | none ready | no download |

DOCX `markdown` and `original_file` remain independent. Unsupported Office formats remain unsupported.

## DFC Option Behavior

When runtime is valid and enabled under the controlled short-path policy:

- DOCX can expose ready `pdf_attachment` through LibreOffice.
- `derivedKind: converted_pdf`.
- `sendStrategy: file_attachment`.
- `sendAssetRefs: derived_asset`.
- preview remains metadata-only for PDF.
- Send Plan selected-ref authority remains verified DerivedAsset metadata.

When runtime is invalid, missing, disabled, quarantined, path-blocked, or conversion-blocked:

- DOCX `pdf_attachment` is unavailable/blocked with a symbolic diagnostic.
- no ready `converted_pdf` DerivedAsset is produced.
- no legacy fallback is selected.
- no system/PATH fallback occurs.

## Privacy Evidence

The product-gate DTO, Plugin Management view model, UI, packaged smoke script, and security evidence tests use only:

- symbolic codes.
- booleans.
- lifecycle states.
- sanitized source kinds.
- package/runtime version strings.
- numeric path lengths.
- short hash prefixes only where existing release provenance already allowed them.

No raw runtime roots, sandbox roots, executable paths, input paths, output paths, command lines, environment, usernames, storage refs, content tokens, DOCX/PDF body, manifest body, license body, or full hashes are exposed in the new plugin onboarding evidence.

## Validation

Completed in this round:

- `npx vue-tsc --noEmit --pretty false`
- `node --check scripts/dfc/office-pdf-libreoffice-packaged-electron-smoke.mjs`
- `npx vitest --run infra/files/dfcLibreOfficePluginOnboardingSecurityEvidence.test.ts src/next/files/enginePluginLifecycleClient.test.ts src/next/plugin-distribution/managementViewModel.test.ts src/ui-app/components/PluginManagementPanel.test.ts infra/files/enginePluginLifecycleService.test.ts --reporter=dot --silent`

Not completed in this shell:

- true packaged Electron app smoke, because explicit repo-external `.svpkg` env was absent.
- full required validation sweep, pending final command run.

## Remaining Blockers

- true packaged Electron app smoke must be run with an explicit repo-external `.svpkg`.
- renderer import/disable/clear/quarantine controls remain incomplete.
- manifest-only controls for macros, external links, network, and embedded object execution need invocation-enforced evidence or accepted production policy before production approval.
- legal/provenance final approval.
- signing/trust final approval.
- production acquisition/distribution approval.
- multi-platform package assets and smoke evidence.
- Owner approval to flip `productionApproved=true`.
- Owner approval to flip `downloadEnabled=true`.

## Production Claim Boundary

This bundle makes LibreOffice Office-to-PDF visible as an owner-gated experimental managed runtime plugin path. It does not make Office-to-PDF production supported, production-ready, downloadable, or broadly visible to unsupported formats.

## Recommended Next Round

Recommended M40: run the new true packaged Electron smoke with an explicit repo-external `.svpkg`, then complete bounded owner-gated import/disable/clear/quarantine controls if the smoke passes. Keep `productionApproved=false`, `downloadEnabled=false`, DOCX-only scope, and no system/PATH fallback until the remaining production blockers are closed.
