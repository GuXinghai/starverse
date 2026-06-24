# DFC-M44 LibreOffice Manual GitHub Install via Magika-Aligned Official Plugin Operation

Date: 2026-06-22

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This round adds an owner-gated manual LibreOffice Download / Install path through the existing Plugin Management official install operation pattern. It does not approve production Office-to-PDF support and does not enable automatic, startup, postinstall, background, DFC-option, Send Plan, or conversion-time download.

## Scope Boundary

Unchanged:

- `productionApproved=false`.
- LibreOffice `downloadEnabled=false` continues to mean automatic/download-by-policy is disabled.
- LibreOffice Office-to-PDF remains DOCX-only, owner-gated, experimental, and not production-approved.
- no system LibreOffice discovery, PATH fallback, common-install probing, arbitrary executable path, or renderer-provided executable path.
- no `.doc`, `.rtf`, `.docm`, `.xls/.xlsx`, PS/EPS, PDF OCR, image, or audio support.
- no automatic download, install/repair download, postinstall download, startup/background download, DFC option download, Send Plan download, or conversion-time download.
- no production GitHub asset mutation, dependency, lockfile, DB schema, Send Plan main-flow, DFC vocabulary, or asset-model change.
- no LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, installer output, packaged output, temp output, or private signing key committed.

## Magika-Aligned Implementation Summary

M44 reuses the existing Plugin Management `install_official_plugin` operation entrypoint used by Magika:

1. Plugin Management renders an official catalog row.
2. The user explicitly clicks Download / Install.
3. The renderer calls `enginePluginLifecycle.installOfficialPlugin`.
4. `EnginePluginLifecycleService` creates an `official_install` operation and returns a sanitized operation DTO.
5. The background operation transitions through the existing state machine: `accepted`, `pending`, `downloading`, `verifying`, `staging`, `registering`, `health_checking`, then `installed`, `failed`, or `cancelled`.
6. Plugin Management polls `getInstallOperationStatus`.
7. Download uses the shared official-source downloader and policy gate.
8. Verified package bytes are passed into the existing LibreOffice `.svpkg` archive import, runtime validation, and activation path.

This avoids a parallel LibreOffice acquisition system. The older LibreOffice acquisition helper remains separate and is not the user-facing Plugin Management operation authority for M44.

## Acquisition Policy

| Policy | M44 state |
| --- | --- |
| Manual user-initiated GitHub install | Allowed through `install_official_plugin` only |
| Automatic startup/background download | Forbidden |
| Postinstall download | Forbidden |
| Conversion-time download | Forbidden |
| DFC option generation download | Forbidden |
| Send Plan download | Forbidden |
| Arbitrary URL | Forbidden |
| Fixed GitHub Release asset | Required |
| Offline `.svpkg` import | Still owner-gated and uses the same import/activation pipeline where practical |

Renderer-safe status wording:

- manual install available: true when the official catalog row is installable.
- automatic download enabled: false.
- conversion-time download enabled: false.
- requires user gesture: true.
- source kind: `github_release_asset`.

## GitHub Release Source Descriptor

The LibreOffice official source is the first-party runtime catalog entry in `infra/files/dfcManagedLibreOfficeRuntime.ts`.

Sanitized descriptor:

| Field | Value |
| --- | --- |
| plugin id | `libreoffice` |
| runtime id | `libreoffice-office-pdf` |
| package id | `starverse-runtime-libreoffice` |
| runtime package id | `starverse-runtime-libreoffice` |
| package version | `0.1.0` |
| LibreOffice runtime version | `26.2.4` |
| platform/arch | `win32` / `x64` |
| GitHub source | fixed Starverse GitHub Release asset |
| release tag | `starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64` |
| asset name | `starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg` |
| package size | `518907010` bytes |
| package sha256 | catalog-pinned; short prefix `ce012cf1` |
| source kind | `github_release_asset` |
| trust policy id | `owner_gated_hash_pinned_signed_catalog_required_for_production` |
| channel | owner-gated experimental / production-candidate |
| signed catalog status | unsigned candidate; signed catalog required before production approval |

No arbitrary URL input is exposed. No fallback mirror is enabled.

## Manual Install Operation Lifecycle

| Stage | Evidence |
| --- | --- |
| `accepted` / `pending` | operation DTO is created through the existing official install operation map |
| `downloading` | shared `downloadOfficialPackageToMemory` validates source policy, HTTPS, official host allowlist, max bytes, expected size, and expected sha256 |
| `verifying` | verified bytes are handed to LibreOffice `.svpkg` activation after download hash/size pass |
| `staging` | `.svpkg` archive import extracts into owned staging and validates archive structure |
| `registering` | existing LibreOffice managed runtime import activates under the app-managed runtime root |
| `health_checking` | operation records the active runtime DTO; full DOCX smoke remains a separate owner-gated smoke command |
| `installed` | Plugin Management shows ready/experimental when runtime validation is active |
| `failed` | no active runtime is created; no process launch or fallback occurs |
| `cancelled` | operation state remains supported by the shared state machine and downloader failure mapping; no broad cancel UI was added in M44 |

## Verification, Staging, Activation

GitHub manual install and offline import converge on the same LibreOffice `.svpkg` verification and activation path as far as practical:

1. fixed official source descriptor.
2. official-source HTTPS/host allowlist policy.
3. package size check.
4. package sha256 check.
5. archive extraction into staging.
6. package manifest identity validation.
7. runtime identity validation.
8. package/runtime version validation.
9. platform/arch validation.
10. executable relative path validation.
11. executable hash/size validation.
12. capabilities `office_to_pdf` and `docx_to_pdf`.
13. provenance/license/security policy metadata validation.
14. realpath containment.
15. symlink/reparse escape rejection.
16. activation only after checks pass.

M43 trust policy remains in force: owner-gated hash-pinned candidate usage is allowed, production trust is blocked while signed catalog trust is missing, and revoked/expired/catalog-mismatched packages fail closed.

## No-Auto-Download Proof

New M44 tests cover that the LibreOffice download transport is not called by:

- listing official Plugin Management entries.
- reading installed Plugin Management entries.
- polling install-operation status.

New UI coverage proves the Plugin Management row does not call `installOfficialPlugin` on render. The call occurs only after clicking Download / Install.

Existing DFC worker and runtime-gate coverage remains the authority for missing runtime behavior: DOCX `pdf_attachment` is unavailable/blocked, no ready `converted_pdf` is created, and the runtime gate does not launch `soffice` or download a runtime when the managed runtime is missing or blocked.

## Plugin Management UI Evidence

LibreOffice now shows:

- Download / Install.
- Import `.svpkg`.
- Recheck runtime.
- Disable runtime.
- Clear runtime.
- Quarantine runtime.
- owner-gated experimental status.
- production approval pending.
- automatic conversion download disabled.
- package verified before activation.

The renderer receives only sanitized DTO fields. It does not receive raw package paths, temp paths, runtime roots, executable paths, command lines, env, storage refs, content tokens, DOCX/PDF body, manifest body, license body, or full hashes.

## DFC Behavior

| State | DOCX `pdf_attachment` | DerivedAsset | Download | Fallback |
| --- | --- | --- | --- | --- |
| Missing runtime, manual install available | unavailable/blocked | no ready `converted_pdf` | none | no legacy/system/PATH fallback |
| Manual install in progress | unavailable/blocked until runtime is active | no stale ready PDF | explicit user operation only | no legacy/system/PATH fallback |
| Manual install succeeds | ready under owner-gated experimental rules | `converted_pdf` through managed runtime | no conversion-time download | no legacy/system/PATH fallback |
| Manual install fails | unavailable/blocked | no ready `converted_pdf` | stopped in operation | no legacy/system/PATH fallback |
| Disabled/quarantined/revoked/expired/path-blocked | unavailable/blocked | no ready `converted_pdf` | none | no legacy/system/PATH fallback |

DOCX `markdown` and `original_file` remain independent where already supported. `.doc`, `.rtf`, and `.docm` remain unsupported.

## Failure Diagnostics

| Failure | Symbolic result |
| --- | --- |
| package size mismatch | `size_mismatch` |
| package hash mismatch | `hash_mismatch` |
| official source policy rejection | `verification_failed` with sanitized downloader code |
| transport failure | `download_failed` |
| invalid `.svpkg` / manifest / activation rejection | `local_package_unavailable` with sanitized diagnostic |
| unsupported platform / arch | `.svpkg` archive diagnostic, no activation |
| executable mismatch | `.svpkg` archive diagnostic, no activation |
| revoked / expired / catalog mismatch | M43 signed-catalog diagnostics, no launch |

Failure behavior is fail-closed: no active runtime, no stale ready PDF option, no process launch, no legacy fallback, no system LibreOffice, and no PATH fallback.

## Privacy / Redaction Evidence

Tests assert operation DTOs and UI text do not expose:

- Windows absolute paths.
- file URL strings.
- executable names or executable paths.
- content tokens.
- storage refs.
- raw package/runtime/executable paths.
- full sha256 strings in renderer-visible status.

The source descriptor is fixed and catalog-owned. The UI does not expose arbitrary URL input.

## Validation Snapshot

Completed validation:

- `npm run rebuild:node` passed.
- `npx vue-tsc --noEmit --pretty false` passed.
- `node --check scripts/dfc/libreoffice-svpkg-preflight.mjs` passed.
- `node --check scripts/dfc/office-pdf-libreoffice-packaged-electron-smoke.mjs` passed.
- `npx vitest --run infra/files/enginePluginLifecycleService.test.ts --reporter=dot --silent` passed: 67 tests.
- `npx vitest --run src/next/plugin-distribution/managementActions.test.ts src/ui-app/components/PluginManagementPanel.test.ts --reporter=dot --silent` passed: 44 tests.
- `npx vitest --run infra/files/dfcLibreOfficeSignedCatalog.test.ts infra/files/dfcManagedLibreOfficeRuntime.test.ts infra/files/dfcLibreOfficeManagedPackageInstaller.test.ts infra/files/dfcLibreOfficeRuntimePackageArchive.test.ts --reporter=dot --silent` passed: 46 passed / 1 skipped.
- `npx vitest --run infra/files/dfcLibreOfficePdfAdapter.test.ts infra/files/dfcLibreOfficeRuntimeAcquisition.test.ts infra/files/dfcLibreOfficeProductionApprovalChecklist.test.ts --reporter=dot --silent` passed: 26 tests.
- `npx vitest --run infra/files/dfcLibreOfficePathDepthSmokeMatrix.test.ts --reporter=dot --silent` passed: 2 passed / 1 skipped.
- `npx vitest --run infra/db/worker.filePipeline.test.ts -t "LibreOffice|Office PDF|DOCX pdf_attachment|unsupported|real managed" --reporter=dot --silent` passed: 15 passed / 45 skipped.
- `git diff --check` passed with LF/CRLF warnings only.
- privacy scan over M44 production/docs files found no raw path, executable path/name, file URL, storage ref, content token, or full-hash hits.

Blocked validation:

- `npm run test:office-pdf-libreoffice-packaged-smoke` did not run because `STARVERSE_DFC_LIBREOFFICE_PACKAGED_SVPKG` was absent.
- `npm run test:office-pdf-libreoffice-packaged-electron-smoke` did not run because `STARVERSE_DFC_LIBREOFFICE_PACKAGED_ELECTRON_SVPKG` was absent.

## Remaining Production Blockers

- Owner approval.
- owner-controlled production trust-root provisioning.
- signed production catalog publication.
- legal/provenance approval.
- approved production distribution source.
- multi-platform package evidence.
- invocation-enforced or accepted policy for macros, external links, network, and embedded objects.
- explicit production approval remains unset.

## Next Recommended Round

M45 should close production distribution hardening around signed catalog publication, production trust-root provisioning, and release-channel policy. Keep LibreOffice Office-to-PDF DOCX-only, owner-gated, experimental, `productionApproved=false`, and automatic/conversion-time download disabled until Owner/legal/security gates close.
