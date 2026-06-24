# DFC-M45 LibreOffice Manual GitHub Install End-to-End Smoke

Date: 2026-06-23

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This round closes the M44 smoke gap by running the real user-initiated LibreOffice `install_official_plugin` path end to end. It does not approve production Office-to-PDF support.

## Scope Boundary

Unchanged:

- `productionApproved=false`.
- `downloadEnabled=false` continues to mean no automatic, startup, background, postinstall, DFC-option, Send Plan, or conversion-time download.
- LibreOffice Office-to-PDF remains DOCX-only, owner-gated, experimental, and not production-approved.
- no system LibreOffice discovery, PATH fallback, common-install probing, arbitrary executable path, renderer-provided executable path, or arbitrary URL input.
- no `.doc`, `.rtf`, `.docm`, `.xls/.xlsx`, PS/EPS, PDF OCR, image, or audio support.
- no dependency, lockfile, DB schema, Send Plan main-flow, DFC vocabulary, asset model, or GitHub Release asset mutation.
- no LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, packaged output, temp output, or private signing key committed.

## Real Manual GitHub Install Result

Result: passed.

Command:

```powershell
npm run test:office-pdf-libreoffice-official-install-smoke
```

The smoke used the Magika-aligned `install_official_plugin` operation path through `EnginePluginLifecycleService.installOfficialPlugin` with `pluginId=libreoffice`. The package source was the fixed first-party GitHub Release asset descriptor from the bundled LibreOffice catalog. No arbitrary URL input was accepted or supplied.

The smoke used a repo-external temp app root and a repo-external temp `.svpkg` capture path. Both were cleaned after the run.

## Operation Lifecycle Trace

Observed states:

```text
accepted -> pending -> downloading -> verifying -> staging -> registering -> health_checking -> installed
```

M45 evidence mapping to task vocabulary:

| Task state | Starverse operation state |
| --- | --- |
| resolving | `accepted` / `pending` |
| downloading | `downloading` |
| verifying | `verifying` |
| staging | `staging` |
| activating | `registering` / `health_checking` |
| ready | `installed` |

Terminal state: `installed`.

No-auto-download proof inside the real smoke:

- Plugin Management-equivalent official listing before install: no download.
- installed status read before install: no download.
- install-operation status poll before install: no download.
- explicit `install_official_plugin` operation: download started.

## Download Verification Summary

| Check | Result |
| --- | --- |
| source kind | `github_release_asset` |
| source descriptor | fixed bundled catalog entry |
| package size | matched expected `518907010` bytes |
| package sha256 | matched catalog hash pin |
| owner-gated trust | allowed for candidate testing |
| production trust | still blocked without signed production catalog |
| arbitrary URL | not used |
| system LibreOffice/PATH | not used |

The test transport used `curl` only to fetch the fixed catalog URL into a repo-external temp file, then returned bytes to the existing shared downloader policy for size/hash validation. The transport did not expose raw paths or URLs in evidence.

## Activation Result

Activation result: passed.

| Check | Result |
| --- | --- |
| package manifest identity | validated |
| runtime identity | validated |
| package/runtime version | validated |
| platform/arch | validated |
| executable relative path | validated |
| executable hash/size | validated |
| `office_to_pdf` capability | validated |
| `docx_to_pdf` capability | validated |
| provenance/license/security policy metadata | validated |
| realpath containment | validated |
| symlink/reparse escape rejection | retained in archive/import test coverage |
| active runtime root length | 98 |
| production approval | false |
| download enabled | false |

## Post-Install DFC Smoke

After the official install operation activated the managed runtime, the normal DFC worker real-managed DOCX path passed:

```powershell
npx vitest --run infra/db/worker.filePipeline.test.ts -t "real managed" --reporter=dot --silent
```

Result: 1 passed / 59 skipped for the selected real-managed run.

Verified behavior:

- ready DOCX `pdf_attachment`.
- `converted_pdf` DerivedAsset.
- `file_attachment`.
- `derived_asset`.
- metadata-only preview.
- selected-ref Send Plan authority.
- no system/PATH fallback.
- no conversion-time download.

## Packaged Smoke Results

The package used for packaged smoke was the repo-external `.svpkg` captured from the real official install operation download.

Direct packaged smoke:

- Result: passed.
- Runtime root length: 98.
- Sandbox root length: 47.
- Input path length: 66.
- Output dir length: 54.
- Profile dir length: 72.
- PDF validation: `valid_pdf`.
- Cleanup: attempted.
- package/runtime/executable identity: validated.
- worker semantics: passed.

True packaged Electron smoke:

- Result: passed.
- Plugin Management row visible: true.
- production approval: false.
- owner-gated: true.
- experimental: true.
- status: degraded.
- diagnostic: `owner_gate_not_production_approved`.
- runtime discovery: validated by packaged worker.
- package version: `0.1.0`.
- runtime version: `26.2.4`.
- DOCX-to-PDF result: ready `pdf_attachment`.
- send strategy: `file_attachment`.
- selected-ref authority: `derived_asset`.
- preview: `raw_file:ready`.
- user data root length: 43.
- runtime root length: 98.
- input path length: 67.
- path caps satisfied: true.

## Failure Diagnostics Table

| Failure state | Coverage / diagnostic |
| --- | --- |
| GitHub/network failure | real smoke initially proved fail-closed symbolic `download_failed`; final smoke passed after robust fixed-source transport |
| user cancelled download | shared operation state supports `cancelled`; no broad cancel UI added |
| size mismatch | `size_mismatch` in lifecycle tests |
| hash mismatch | `hash_mismatch` in lifecycle tests |
| invalid manifest | `.svpkg` archive/import tests fail closed |
| unsupported platform | `.svpkg` archive/import tests fail closed |
| executable mismatch | archive/runtime gate tests fail closed |
| revoked package | signed catalog tests fail closed |
| expired package | signed catalog tests fail closed |
| activation failure | `local_package_unavailable` in lifecycle tests |
| path policy exceeded | path-depth/path-cap tests fail closed before process launch |

For fail-closed states, expected behavior remains: no active runtime if activation failed, no process launch when the gate fails before launch, no ready `converted_pdf`, no stale ready PDF option, no legacy fallback, no system LibreOffice, and no PATH fallback.

## Privacy / Redaction Evidence

Evidence output is sanitized:

- operation lifecycle uses symbolic states.
- package source is recorded as source class / fixed asset, not arbitrary URL input.
- path evidence is path lengths only.
- package hash evidence is match status or short prefix in existing preflight evidence.
- no raw package path, runtime root, executable path, command line, env, storage ref, content token, DOCX/PDF body, manifest body, license body, or full hash is emitted.

Privacy scan over M45 production/docs additions found only an intentional negative assertion in the test source. No renderer-visible or evidence doc leak was found.

## Validation

Completed:

- `npm run rebuild:node` passed before Node/Vitest validation.
- `npx vue-tsc --noEmit --pretty false` passed.
- script syntax checks passed for DFC preflight, packaged smoke, packaged Electron smoke, and official install smoke scripts.
- `npm run test:office-pdf-libreoffice-official-install-smoke` passed end to end.
- `npm run test:office-pdf-libreoffice-packaged-smoke` passed inside the official install smoke using the downloaded repo-external `.svpkg`.
- `npm run test:office-pdf-libreoffice-packaged-electron-smoke` passed inside the official install smoke using the downloaded repo-external `.svpkg`.
- targeted Magika/Plugin Management/lifecycle tests passed: 111 tests.
- targeted LibreOffice runtime/adapter/installer/acquisition/lifecycle/security/archive/checklist/signed-catalog tests passed: 72 passed / 1 skipped.
- targeted DFC worker LibreOffice tests passed: 15 passed / 45 skipped.
- default-off path-depth matrix passed: 2 passed / 1 skipped.
- `git diff --check` passed with LF/CRLF warnings only.
- artifact status scan found no `.svpkg`, MSI, managed runtime, staging, sandbox, release, packaged, or executable output in git status.
- final ABI target was restored to Node with `npm run rebuild:node`.

## Remaining Production Blockers

- Owner approval.
- owner-controlled production trust-root provisioning.
- signed production catalog publication.
- legal/provenance approval.
- approved production distribution source.
- multi-platform package evidence.
- invocation-enforced or accepted policy for macros, external links, network, and embedded objects.
- production approval remains false.

## Next Recommended Round

M46 should focus on production trust-root/catalog publication rehearsal and release-channel policy, plus legal/provenance and security blocker closure. Keep LibreOffice DOCX-only, owner-gated, experimental, `productionApproved=false`, and automatic/conversion-time download disabled until those gates close.
