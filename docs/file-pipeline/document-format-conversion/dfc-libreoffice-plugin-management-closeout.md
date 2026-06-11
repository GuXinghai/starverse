# DFC LibreOffice Plugin Management Closeout

Status: LibreOffice Plugin Management closeout plus post-closeout package preparation and draft release verification evidence. Production approval remains blocked until Owner approves legal/license/provenance, signing, distribution, and product support gates.

Date: 2026-06-11

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This closeout records implementation status, verification confidence, release acquisition boundaries, and Owner gate decisions after Tasks 0-10.

## Summary

LibreOffice Office-to-PDF is wired as a first-party managed runtime plugin path for the DFC DOCX `pdf_attachment` pilot when a managed runtime already exists or has been imported. The Task 0-9 chain covers runtime availability diagnostics, plugin lifecycle inventory, catalog/import contract, package layout verification, lifecycle controls, adapter switch-over to the plugin-managed runtime handle, product-facing diagnostics, docs closeout, and a disabled-by-default owner-gated acquisition/download pipeline.

Task 10 performed the GitHub/release readiness audit and stopped before upload. Task 10R added the `.svpkg` archive import bridge and dry-run preparation script. The follow-up official-source preparation round downloaded LibreOffice 26.2.4 Windows x86_64 from The Document Foundation infrastructure, prepared a real Starverse `.svpkg` package candidate outside the repo, verified it with the archive/import bridge, and ran the real managed DOCX-to-PDF worker smoke from the imported runtime. The draft release verification round uploaded that package candidate to a GitHub draft release, redownloaded the release asset, verified hash/size, re-ran archive/import verification, and re-ran the real managed worker smoke from the redownloaded package import.

The current product status remains owner-gated and experimental. `productionApproved=false` is still the correct state. No LibreOffice binary is committed to git, the GitHub asset is a draft release candidate only, acquisition remains disabled unless an owner-gated policy explicitly permits it, and no system LibreOffice or PATH fallback is allowed.

## Task 0-10 Commit List

| Task | Commit | Scope |
| --- | --- | --- |
| 0 | `b50ce13 docs(file-conversion): archive v1.0 DFC docs and point to v1.2 SSOT` | Archived superseded v1.0 DFC docs and restored v1.2 navigation authority. |
| 1 | `a506258 feat(file-conversion): normalize LibreOffice runtime availability diagnostics` | Normalized runtime missing, invalid, unhealthy, timeout, and policy-denied diagnostics. |
| 2 | `462a259 feat(file-conversion): expose LibreOffice runtime to plugin lifecycle inventory` | Added LibreOffice plugin identity and read-only lifecycle bridge. |
| 3 | `677328f feat(file-conversion): unify LibreOffice runtime catalog import contract` | Added catalog/import/install contract semantics for the managed runtime. |
| 4 | `67b2bf5 feat(file-conversion): define LibreOffice runtime package verification policy` | Defined package layout, manifest verification, and cross-platform policy. |
| 5 | `ea33a9a feat(file-conversion): add LibreOffice runtime lifecycle controls` | Added file-scoped update, rollback, quarantine, and repair controls. |
| 6 | `4e11d00 feat(file-conversion): route Office PDF conversion through managed runtime` | Routed DOCX Office PDF conversion through the plugin-managed runtime handle. |
| 7 | `7c20e21 feat(file-conversion): surface LibreOffice runtime product gate diagnostics` | Exposed product gate diagnostics to DFC options and Plugin Management inventory. |
| 8 | `f79e38c docs(file-conversion): close out LibreOffice plugin management integration` | Recorded the pre-acquisition managed-runtime integration closeout. |
| 9 | `efe3696 feat(file-conversion): add LibreOffice runtime acquisition pipeline` | Added the owner-gated acquisition/download contract and controlled cache/staging downloader. |
| 10 | This closeout commit | Records GitHub permission checks, release upload blockers, acquisition smoke boundary, and final Owner gate state. |

## Current Architecture

- DFC option authority remains `selectedOptionId` and `selectedAssetRefs`; Send Plan remains selected-ref and DerivedAsset lineage driven.
- `original_file` and `markdown` fallback paths are unchanged.
- DOCX `pdf_attachment` uses the LibreOffice plugin-managed runtime handle before adapter execution.
- Runtime health comes from the managed runtime availability summary and is bridged into Plugin Management inventory and diagnostics.
- Package verification uses the same layout contract for imported dev artifacts and future first-party package candidates.
- External execution still goes through the Conversion Sandbox Runner and external process policy.
- Diagnostics expose product codes, internal codes, source, owner gate, experimental/degraded state, and fallback options without absolute local paths.

## Plugin Management Integration Status

Implemented:

- Stable plugin id: `libreoffice`.
- Stable runtime id: `libreoffice-office-pdf`.
- Capability ids: `document_conversion`, `office_to_pdf`, and `docx_to_pdf`.
- Provider/source semantics for first-party managed runtime and imported dev artifact.
- Catalog entry with package layout, platform policy, provenance, license, and security policy requirements.
- Read-only inventory and diagnostics bridge.
- File-scoped lifecycle operations for update, rollback, quarantine, and repair.
- Product gate diagnostics for missing, invalid, unhealthy, quarantined, degraded, and owner-gated states.

Still not implemented or not approved:

- Production-enabled remote package download. Task 9 adds the disabled-by-default acquisition contract and controlled cache/staging downloader, but not production approval.
- GitHub release asset upload. Task 10 did not upload because the release target convention and Owner-approved package asset source are not established.
- Bundled LibreOffice binary.
- DB-persisted full lifecycle registry.
- Full Plugin Management UI.
- Production approval flip.

## Task 9 Acquisition Addendum

Task 9 adds a first-party LibreOffice runtime acquisition/download pipeline that is disabled by default and owner-gated. The acquisition source is represented in the LibreOffice catalog entry with package source type, expected hash and size, package/runtime version, platform/arch, license/provenance/security requirements, and `productionApproved=false`.

The downloader writes only to a caller-provided controlled cache/staging root, rejects repo-local and `.artifacts/**` roots when the repo boundary is supplied, verifies hash and size before returning an internal staging path, and returns sanitized diagnostics. Downloaded candidates are not production-approved and still need the existing import/install verification contract before they can become an active runtime.

## Task 10 Release Acquisition Closeout

Task 10 completed the release/upload readiness audit and did not perform a real GitHub upload.

GitHub permission check:

- Repository: `GuXinghai/starverse`.
- Visibility: public.
- Viewer permission: `ADMIN`.
- `gh auth status` succeeded and only printed a masked token.

Release/upload blockers:

- No existing Starverse release/tag convention for LibreOffice runtime package assets was found.
- No Owner-approved LibreOffice runtime package archive was available for upload.
- The local `.external-runtime-work/libreoffice` managed runtime is a dev/import artifact directory, not production package authority.
- Task 9 downloads a verified package byte stream into staging, but there is not yet an extraction/import bridge from a downloaded `.svpkg` archive into the Task 4 package layout verification contract.
- Uploading the current dev-managed runtime directory or an ad hoc archive would bypass the explicit Owner package-source approval boundary.

Result:

- No release was created.
- No release asset was uploaded.
- No catalog acquisition source was changed to an active GitHub release asset.
- No binary or generated runtime artifact was committed.
- The next release task must first define the package archive format, release tag/asset naming convention, and import-from-downloaded-package bridge.

## Official Source Package Preparation Addendum

After Task 10 and Task 10R, Owner allowed a real official-source local package preparation round without GitHub upload or production approval.

Official source:

- authority: The Document Foundation
- upstream URL: `https://download.documentfoundation.org/libreoffice/stable/26.2.4/win/x86_64/LibreOffice_26.2.4_Win_x86-64.msi`
- observed official MirrorBrain final URL host: `www.mirrorservice.org`
- MSI sha256: `202f26cda071c5aa4996a5a28412fddceb3891dceb0366982c62650456c0730f`
- MSI sizeBytes: `372539392`
- official `.meta4` metadata from `download.documentfoundation.org` supplied the expected size, sha256, and embedded signature metadata

Package preparation result:

- MSI extraction tool: Windows `msiexec /a` administrative extraction
- packageVersion: `0.1.0`
- runtimeVersion: `26.2.4`
- platform / arch: `win32` / `x64`
- package sha256: `ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e`
- package sizeBytes: `518907010`
- executable relative path: `program/soffice.exe`
- inventory artifact count: `19492`
- productionApproved: `false`
- ownerGated: `true`
- experimental: `true`

The MSI, extracted runtime, and `.svpkg` package were kept in repo-external runtime workdirs. No runtime binary, MSI, generated `.svpkg`, or extracted package artifact was committed.

Local verification result:

- `.svpkg` archive bridge verification: passed with the real package candidate.
- import helper verification: passed by importing the package into a repo-external managed runtime app root.
- runtime gate verification: passed through the existing managed runtime import/install contract.
- real DOCX-to-PDF smoke: passed through the DFC worker `pdf_attachment` path using the imported runtime's `program/soffice.exe`.

This addendum increases local packaging confidence but does not complete release distribution. GitHub release tag naming, asset naming, release upload, release re-download verification, legal/license/provenance review, and Owner production approval remain open.

## Draft Release Redownload Verification Addendum

Owner authorized draft/prerelease upload and redownload verification for the verified repo-external `.svpkg` candidate. The upload used a GitHub draft release, not a normal production release.

Release metadata:

- repository: `GuXinghai/starverse`
- release tag: `starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64`
- release URL: `https://github.com/GuXinghai/starverse/releases/tag/untagged-455b5afc040fff36e435`
- release type: draft
- title: `Starverse LibreOffice Runtime 0.1.0 / LibreOffice 26.2.4 / Windows x64`
- asset name: `starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg`
- asset state: uploaded
- asset sizeBytes: `518907010`
- asset digest: `sha256:ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e`

Upload and redownload verification:

- upload source: repo-external `.svpkg` only
- MSI was not uploaded
- extracted runtime directory was not uploaded
- `.artifacts/**` was not uploaded
- release notes explicitly mark owner-gated, experimental, `productionApproved=false`, DOCX-to-PDF-only, no PATH fallback, and no bundled production support claim
- redownload target: repo-external cache
- redownload sha256: `ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e`
- redownload sizeBytes: `518907010`
- redownload hash/size verification: passed
- archive bridge verification from redownloaded package: passed
- import helper verification from redownloaded package: passed
- managed runtime gate verification from redownloaded package: passed
- real managed DOCX-to-PDF worker smoke from redownloaded package import: passed

This draft release asset is now suitable for owner-gated acquisition testing. It is not production support, not a bundled runtime claim, and not approval for broad Office format support.

## DFC Adapter Switch-over Status

The DOCX Office-to-PDF adapter now receives a plugin-managed runtime handle instead of independently interpreting runtime internals. The handle must be resolved, verified, and allowed before conversion execution.

Fail-closed behavior blocks adapter execution when the runtime is missing, invalid, quarantined, repair-needed, unsupported on the current platform, verification-failed, fake-only, or denied by policy. Blocked `pdf_attachment` options retain fallback guidance to `markdown` and `original_file`.

## Product Gate Status

- `productionApproved=false`.
- Owner gate remains active.
- Imported dev artifacts may provide local validation confidence but do not become production package authority.
- Fake seams remain test/dev seams only.
- User-facing and product diagnostics must describe the path as experimental and owner-gated.

## Supported Scope

Current supported pilot scope:

- DOCX input only for Office-to-PDF.
- Output target: `pdf_attachment`.
- Preview/send source: generated PDF DerivedAsset lineage.
- Fallbacks: `markdown` and `original_file`.
- PDF attachment still requires the selected model/provider to support PDF or file input.

Out of scope:

- `.doc`, `.rtf`, `.docm`.
- Hybrid or mixed send strategy.
- HTML PDF JS or external-link expansion.
- PS/EPS.
- PDF OCR or local PDF parsing.
- Image and audio processing.
- System LibreOffice or PATH fallback.
- Arbitrary user-selected executable paths.

## Explicit Non-goals

- Do not claim broad Office family support.
- Do not commit LibreOffice binaries or generated runtime artifacts.
- Do not add remote download, postinstall download, or implicit runtime acquisition.
- Do not bypass manifest, hash, platform, provenance, license, or security policy checks.
- Do not relax sandbox, macro, path, or diagnostics privacy boundaries.
- Do not change Send Plan, DerivedAsset schema, MessageAttachment binding, or `original_file` semantics.

## Verification Matrix

| Layer | Current evidence | What it proves | What it does not prove |
| --- | --- | --- | --- |
| Unit tests | Runtime, adapter, package installer, lifecycle service tests | Availability, layout verification, lifecycle, product gate, and adapter fail-closed behavior | Packaged runtime distribution readiness |
| Worker tests | DFC worker file pipeline tests | DOCX `pdf_attachment` option and generation semantics under scoped fixtures | Full app UI or packaged app behavior |
| IPC contract tests | DB bridge contract tests | Client schema can carry product gate diagnostics | Visual UI wording or layout quality |
| Dev/import smoke | `test:office-pdf-libreoffice-import-dev-smoke` when the ignored M28 artifact exists | Imported managed runtime can run real `soffice` through adapter and worker paths | Production package source, CI policy, or bundled runtime behavior |
| Acquisition unit tests | `dfcLibreOfficeRuntimeAcquisition.test.ts` | Owner-gated download policy, controlled cache/staging, hash/size checks, failure diagnostics, and disabled default source | Real LibreOffice package download, release upload, or production approval |
| Release readiness audit | Task 10 GitHub and package-source audit | Repository permissions are sufficient, and upload blockers are explicit | Release asset integrity or download-back smoke |
| Real `.svpkg` local verification | Env-gated `dfcLibreOfficeRuntimePackageArchive.test.ts` real package test | Official-source `.svpkg` can be extracted, verified, and imported locally | GitHub release distribution or production approval |
| Real managed DOCX-to-PDF smoke | Env-gated `infra/db/worker.filePipeline.test.ts` real managed smoke | The imported `.svpkg` runtime can run `soffice` through the DFC worker `pdf_attachment` path | Packaged app distribution or release re-download confidence |
| Draft release redownload verification | `gh release download` plus env-gated real package tests | GitHub draft release asset can be redownloaded and verified through archive/import/runtime/smoke path | Production approval, signing, or multi-platform support |
| Packaged smoke | Not present in this closeout | None | Packaged app runtime distribution confidence |

## Tests Run

Task 8 validation completed with Node ABI rebuilt:

```powershell
npm run rebuild:node
npx vitest --run infra/files/enginePluginLifecycleService.test.ts infra/files/dfcManagedLibreOfficeRuntime.test.ts infra/files/dfcLibreOfficePdfAdapter.test.ts infra/files/dfcLibreOfficeManagedPackageInstaller.test.ts infra/db/worker.filePipeline.test.ts src/next/ipc/contracts/dbBridgeContracts.test.ts --reporter=dot --silent
```

Result: passed, 6 files, 358 tests passed, 1 skipped.

The imported managed runtime artifact was present at the expected ignored work root, so the existing dev/import smoke also ran:

```powershell
npm run test:office-pdf-libreoffice-import-dev-smoke
```

Result: passed. The smoke imported the existing M28 managed runtime, ran real `soffice` through the package installer smoke, and ran the DFC worker DOCX `pdf_attachment` generation smoke through `[managed-runtime-root]`.

Final diff validation:

```powershell
git diff --check
```

Packaged or near-packaged smoke remains not established in this closeout. The import-dev smoke remains local confidence only and does not authorize production approval.

Task 9 validation completed with Node ABI rebuilt:

```powershell
npm run rebuild:node
npx vitest --run infra/files/enginePluginLifecycleService.test.ts infra/files/dfcManagedLibreOfficeRuntime.test.ts infra/files/dfcLibreOfficeManagedPackageInstaller.test.ts --reporter=dot --silent
npx vitest --run infra/files/dfcLibreOfficeRuntimeAcquisition.test.ts --reporter=dot --silent
```

Result: passed. No real download ran; acquisition tests used a mocked transport.

Task 10 validation reran the targeted acquisition/runtime/installer/lifecycle tests and the import-dev smoke where available. Release download-back verification was skipped because no release asset was uploaded.

Official-source package preparation validation completed with Node ABI rebuilt:

```powershell
npm run rebuild:node
npx vitest --run infra/files/dfcLibreOfficeRuntimePackageArchive.test.ts infra/files/dfcLibreOfficeRuntimeAcquisition.test.ts infra/files/dfcLibreOfficeManagedPackageInstaller.test.ts infra/files/dfcManagedLibreOfficeRuntime.test.ts --reporter=dot --silent
```

Result: passed.

The real `.svpkg` candidate was verified with the env-gated archive/import test:

```powershell
npx vitest --run infra/files/dfcLibreOfficeRuntimePackageArchive.test.ts -t "real owner-approved" --reporter=dot --silent
```

Result: passed using the repo-external package candidate.

The imported runtime from that package was then used for the real managed worker smoke:

```powershell
npx vitest --run infra/db/worker.filePipeline.test.ts -t "real managed" --reporter=dot --silent
```

Result: passed. This smoke used the repo-external imported runtime and did not use PATH discovery or a system LibreOffice fallback.

Draft release redownload validation completed with Node ABI rebuilt:

```powershell
npm run rebuild:node
npx vitest --run infra/files/dfcLibreOfficeRuntimePackageArchive.test.ts infra/files/dfcLibreOfficeRuntimeAcquisition.test.ts infra/files/dfcLibreOfficeManagedPackageInstaller.test.ts infra/files/dfcManagedLibreOfficeRuntime.test.ts --reporter=dot --silent
```

Result: passed.

The draft release asset was redownloaded to a repo-external cache and verified:

```powershell
gh release download starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64 --repo GuXinghai/starverse --pattern starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg
```

Redownload sha256 and sizeBytes matched `ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e` and `518907010`.

The redownloaded `.svpkg` candidate was verified with the env-gated archive/import test:

```powershell
npx vitest --run infra/files/dfcLibreOfficeRuntimePackageArchive.test.ts -t "real owner-approved" --reporter=dot --silent
```

Result: passed using the redownloaded repo-external package.

The imported runtime from the redownloaded package was then used for the real managed worker smoke:

```powershell
npx vitest --run infra/db/worker.filePipeline.test.ts -t "real managed" --reporter=dot --silent
```

Result: passed. This smoke used the redownloaded package import and did not use PATH discovery or a system LibreOffice fallback.

## Owner Gate Checklist

Before `productionApproved` can change, the Owner must approve:

- First-party LibreOffice runtime package source.
- Package archive format and import-from-downloaded-package bridge.
- GitHub release tag and asset naming convention.
- Approval to upload a specific package asset to a draft or prerelease.
- License, provenance, and security review.
- Platform package layout review for Windows, macOS, and Linux.
- Packaged or near-packaged smoke confidence.
- CI or gated smoke policy.
- User-facing wording for the experimental and supported-scope boundary.
- Rollback, quarantine, and repair policy acceptance.
- Explicit decision that the product may expose DOCX Office-to-PDF beyond owner-gated experimental use.

## Production Claim Boundary

Allowed wording:

- owner-gated
- experimental
- managed runtime path
- first-party runtime plugin integration
- imported-dev smoke confidence
- production approval pending
- DOCX-only current path
- no binary committed
- no PATH fallback

Disallowed wording:

- LibreOffice is bundled with the product
- broad Office family coverage
- `.doc`, `.rtf`, or `.docm` support
- system LibreOffice fallback
- automatic runtime download
- production approval already granted
- GitHub release asset is production support

## Known Limitations

- Lifecycle controls are file-scoped and not a full DB-persisted lifecycle platform.
- Packaged or near-packaged smoke is not yet established.
- GitHub draft release upload and redownload verification have passed for Windows x64 LibreOffice 26.2.4, but production release distribution is not approved.
- The official-source `.svpkg` package can be prepared, uploaded to a draft release, redownloaded, and locally verified, but production distribution has not been approved.
- Imported dev artifacts live outside git and are not product package authority.
- UI remains minimal; the current work surfaces diagnostics data without building a full Plugin Management UI.
- Cross-platform package layout policy exists, but real package confidence is still platform-dependent and Owner-gated.

## Rollback Plan

If the LibreOffice plugin path causes regressions:

1. Revert Task 7 to remove product gate surface changes.
2. Revert Task 6 to route adapter execution away from plugin-managed runtime handles.
3. Revert Task 5 if lifecycle operation state causes incorrect inventory or gate behavior.
4. Keep Task 0 navigation unless v1.2 authority itself changes.

Fallback behavior should continue to expose `markdown` and `original_file` options while blocking unavailable `pdf_attachment` candidates.

## Next Possible Tasks

- Define packaged or near-packaged smoke policy without committing binaries.
- Decide whether the draft release asset should remain draft, become prerelease, or move to another controlled distribution channel.
- Add owner-gated acquisition source metadata pointing at the verified draft/prerelease asset only after Owner approves the acquisition policy switch.
- Decide CI gating for real runtime smoke.
- Review user-facing wording before wider exposure.
- Consider DB-persisted lifecycle registry only if Owner approves the platform scope.
- Defer Office family expansion until the DOCX path is accepted.
