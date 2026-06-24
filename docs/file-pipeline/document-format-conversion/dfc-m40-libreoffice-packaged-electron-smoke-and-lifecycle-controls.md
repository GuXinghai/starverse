# DFC-M40 LibreOffice Packaged Electron Smoke and Lifecycle Controls

Date: 2026-06-22

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This round keeps LibreOffice Office-to-PDF DOCX-only, owner-gated, experimental, `productionApproved=false`, and `downloadEnabled=false`.

## Scope Boundary

Unchanged:

- `productionApproved=false`.
- `downloadEnabled=false`.
- Office-to-PDF remains DOCX-only, owner-gated, experimental, and not production-approved.
- no production Office-to-PDF support claim.
- no `.doc`, `.rtf`, `.docm`, `.xls/.xlsx`, PS/EPS, PDF OCR, image, or audio expansion.
- no system LibreOffice discovery, PATH fallback, common-install probing, arbitrary executable path, renderer-provided executable path, automatic runtime download, postinstall download, install/repair download, or conversion-time download.
- no DB schema, Send Plan main-flow, asset model, DFC vocabulary, dependency, lockfile, GitHub release asset, sandbox policy, macro policy, network policy, external-link policy, shell policy, diagnostics privacy, or path-cap loosening.

## True Packaged Electron Smoke Result

Command executed:

```text
npm run test:office-pdf-libreoffice-packaged-electron-smoke
```

Explicit repo-external package env used:

```text
STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SVPKG
```

Result: failed before Electron packaging/launch. The repo-external `.svpkg` candidate was present but was a small repo-external package candidate, not a usable LibreOffice managed runtime package for DOCX-to-PDF. The script entered the packaged smoke path, invoked the managed package staging command, and failed at the package import/validation expectation before any Electron app build or launch.

Sanitized observed evidence:

| Field | Evidence |
| --- | --- |
| case id | `m40-packaged-electron-smoke` |
| app mode | packaged Electron smoke harness, pre-launch staging |
| `.svpkg` source class | repo-external temp package candidate |
| `.svpkg` path length | 97 |
| `.svpkg` size class | <= 100 KB |
| validation stage | managed package import / packaged-smoke staging |
| pass/fail | fail |
| symbolic diagnostic | package import validation failed before runtime activation |
| cleanup status | staged packaged smoke command exited before Electron launch |
| PDF validation status | not reached |
| DFC option/preview/Send Plan | not reached |

No true packaged Electron app smoke pass is claimed. No DOCX-to-PDF conversion result is claimed for M40.

## Path Cap Evidence

The M36 product gate remains active. The true packaged Electron smoke did not reach runtime activation, so runtime/sandbox/input/output/profile cap evidence for a successful packaged app conversion was not produced in this round.

Previously proven short-path cap values from M35/M36 remain the current target envelope:

| Path | Cap |
| --- | --- |
| runtime root | <= 120 |
| sandbox root | <= 80 |
| input path | <= 130 |
| output dir | <= 90 |
| isolated profile dir | <= 110 |

The product/runtime gate still fails closed before `soffice` launch with `office_pdf_path_policy_exceeded` when caps are exceeded.

## Package and Runtime Validation Summary

Implemented and verified for the bounded lifecycle path:

| Validation | Result |
| --- | --- |
| manifest identity | preserved through existing runtime/package validators |
| runtime identity | preserved through `dfcManagedLibreOfficeRuntime` bridge |
| package/runtime version | exposed as sanitized DTO fields |
| platform/arch | exposed as metadata only |
| executable relative path | managed manifest-relative only |
| executable hash/size | validated by existing package/runtime validators |
| capabilities | `office_to_pdf` and `docx_to_pdf` remain required |
| production approval | remains false |
| download state | remains disabled |

The M40 smoke input did not satisfy package import validation, so an activated packaged runtime was not available for a true packaged Electron conversion.

## DOCX-to-PDF Result

For M40 true packaged Electron smoke: not reached.

The previously validated product/runtime path remains:

- valid enabled runtime under short-path caps can expose ready DOCX `pdf_attachment`.
- `derivedKind: converted_pdf`.
- `sendStrategy: file_attachment`.
- `sendAssetRefs: derived_asset`.
- preview remains metadata-only.
- Send Plan selected-ref authority remains verified DerivedAsset metadata.

## Plugin Management Lifecycle Controls

Implemented bounded owner-gated controls for LibreOffice Office PDF:

| Control | Implementation | Sanitized behavior |
| --- | --- | --- |
| import `.svpkg` | renderer calls `electronAPI.importLibreOfficeSvpkg()`, main opens a local `.svpkg` dialog, worker-only method receives the selected path | renderer receives only lifecycle DTO/result; no raw path is returned |
| recheck runtime | existing `enginePluginLifecycle.runHealthCheck` | returns sanitized current product-gate state |
| disable runtime | `disablePlugin({ engineId: 'libreoffice' })` writes `enabled=false` to the active managed runtime manifest | DOCX PDF gate becomes unavailable/blocked with symbolic disabled diagnostic |
| clear active runtime | `uninstallPlugin({ engineId: 'libreoffice' })` removes the active managed runtime root | DOCX PDF gate becomes missing/unavailable; no registry row is created |
| quarantine runtime | renderer calls `electronAPI.quarantineLibreOfficeRuntime()`, worker writes a quarantine marker in the active managed runtime root | product gate maps to quarantined/blocked with `office_pdf_runtime_quarantined` |

The import and quarantine controls are command-style renderer APIs with no renderer-provided package path or executable path argument. The raw `.svpkg` path exists only inside the main-process dialog callback and worker-only lifecycle method.

## Fail-Closed Table

| State | Diagnostic / state | Launch behavior | DFC behavior |
| --- | --- | --- | --- |
| missing runtime | `office_pdf_runtime_missing` | no launch | DOCX `pdf_attachment` unavailable/blocked, no ready `converted_pdf` |
| disabled runtime | `office_pdf_runtime_disabled` | no launch | DOCX `pdf_attachment` unavailable/blocked, no stale ready option |
| invalid manifest | `office_pdf_runtime_manifest_invalid` | no launch | DOCX `pdf_attachment` unavailable/blocked |
| executable mismatch | `office_pdf_runtime_manifest_invalid` | no launch | DOCX `pdf_attachment` unavailable/blocked |
| path policy exceeded | `office_pdf_path_policy_exceeded` | no launch | blocked Office PDF option, no legacy fallback |
| import incomplete | `local_package_unavailable` lifecycle result | no activation | current runtime state remains authoritative |
| quarantined package | `office_pdf_runtime_quarantined` | no launch | DOCX `pdf_attachment` unavailable/blocked |
| conversion failed / invalid output | `conversion_engine_failed` / output diagnostic | no ready PDF | no legacy/system/PATH fallback |

DOCX `markdown` and `original_file` remain independent. `.doc`, `.rtf`, and `.docm` remain unsupported.

## Privacy and Redaction Evidence

The M40 implementation and tests verify:

- Plugin Management UI does not render raw package paths, executable paths, `soffice.exe`, full hashes, storage refs, or content tokens.
- client import/quarantine calls route through narrow `electronAPI` methods, not renderer-accessible raw-path worker calls.
- preload exposes command-style import/quarantine methods and invokes dialog channels without renderer path parameters.
- lifecycle service invalid package import failure does not echo the raw package path.
- disable/quarantine/clear lifecycle results serialize symbolic diagnostics and product-gate state only.
- true packaged Electron smoke output did not print the raw `.svpkg` path.

Forbidden evidence remains absent from the M40 docs: raw runtime roots, sandbox roots, executable paths, input/output paths, usernames, command lines, env, storage refs, content tokens, DOCX/PDF body, manifest body, license body, and full hashes.

## Validation

Completed:

- `npm run rebuild:node`
- `npx vue-tsc --noEmit --pretty false`
- `node --check scripts/dfc/office-pdf-libreoffice-packaged-electron-smoke.mjs`
- `npm run test:office-pdf-libreoffice-packaged-electron-smoke` with explicit repo-external `.svpkg` env: executed and failed at managed package import validation before Electron launch.
- `npm run test:office-pdf-libreoffice-packaged-smoke`: blocked without `STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG` in the ambient shell.
- `npx vitest --run infra/db/worker.handlerRegistration.test.ts src/next/files/enginePluginLifecycleClient.test.ts electron/preload.test.ts src/ui-app/components/PluginManagementPanel.test.ts infra/files/enginePluginLifecycleService.test.ts --reporter=dot --silent`: 116 passed.
- targeted LibreOffice runtime/adapter/installer/acquisition/lifecycle/security/archive/checklist tests: 139 passed / 2 skipped.
- targeted DFC worker LibreOffice tests: 14 passed / 45 skipped.
- default-off path-depth matrix: 2 passed / 1 skipped.

Pending final sweep at doc write time:

- `git diff --check`.
- final privacy scan after this document update.

## Remaining Production Blockers

- a true packaged Electron app smoke pass with a valid repo-external LibreOffice `.svpkg`.
- successful package/runtime validation from a real managed LibreOffice package in the packaged app path.
- DOCX-to-PDF packaged app conversion evidence with `valid_pdf`.
- invocation-enforced evidence or accepted production policy for macros, external links, network, and embedded object execution.
- legal/provenance final approval.
- signing/trust final approval.
- production acquisition/distribution approval.
- multi-platform package assets and smoke evidence.
- Owner approval to flip `productionApproved=true`.
- Owner approval to flip `downloadEnabled=true`.

## Production Claim Boundary

M40 completes bounded lifecycle controls and keeps the Plugin Management path owner-gated and experimental. It does not make LibreOffice Office-to-PDF production supported, production-ready, downloadable, or broadly visible beyond the DOCX-only owner-gated experimental path.

## Recommended Next Round

Recommended M41: provide a valid repo-external LibreOffice managed runtime `.svpkg` and rerun `npm run test:office-pdf-libreoffice-packaged-electron-smoke` until it reaches packaged Electron app launch and DOCX-to-PDF conversion. Keep M41 focused on smoke closure and evidence quality; do not enable downloads, production approval, broad Office support, system/PATH fallback, or long-path support.
