# DFC LibreOffice Plugin Management Closeout

Status: Task 8 pre-acquisition closeout for the LibreOffice Plugin Management integration route.

Date: 2026-06-11

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This closeout records implementation status, verification confidence, and Owner gate boundaries after Tasks 0-7. Task 9 extends this route with an owner-gated acquisition/download pipeline; Task 10 remains the release/upload and final Owner gate closeout step.

## Summary

LibreOffice Office-to-PDF is wired as a first-party managed runtime plugin path for the DFC DOCX `pdf_attachment` pilot when a managed runtime already exists or has been imported. The Task 0-7 chain covers runtime availability diagnostics, plugin lifecycle inventory, catalog/import contract, package layout verification, lifecycle controls, adapter switch-over to the plugin-managed runtime handle, and product-facing diagnostics.

The current product status remains owner-gated and experimental. `productionApproved=false` is still the correct state. No LibreOffice binary is committed, acquisition remains disabled unless an owner-gated policy explicitly permits it, and no system LibreOffice or PATH fallback is allowed.

## Task 0-7 Commit List

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

Not implemented in this closeout:

- Remote package download. Task 9 adds the disabled-by-default acquisition contract and controlled cache/staging downloader, but not production approval or release upload.
- Bundled LibreOffice binary.
- DB-persisted full lifecycle registry.
- Full Plugin Management UI.
- Production approval flip.

## Task 9 Acquisition Addendum

Task 9 adds a first-party LibreOffice runtime acquisition/download pipeline that is disabled by default and owner-gated. The acquisition source is represented in the LibreOffice catalog entry with package source type, expected hash and size, package/runtime version, platform/arch, license/provenance/security requirements, and `productionApproved=false`.

The downloader writes only to a caller-provided controlled cache/staging root, rejects repo-local and `.artifacts/**` roots when the repo boundary is supplied, verifies hash and size before returning an internal staging path, and returns sanitized diagnostics. Downloaded candidates are not production-approved and still need the existing import/install verification contract before they can become an active runtime. GitHub Release upload remains Task 10.

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

## Owner Gate Checklist

Before `productionApproved` can change, the Owner must approve:

- First-party LibreOffice runtime package source.
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

## Known Limitations

- Lifecycle controls are file-scoped and not a full DB-persisted lifecycle platform.
- Packaged or near-packaged smoke is not yet established.
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
- Add Owner-approved first-party package source metadata.
- Decide CI gating for real runtime smoke.
- Review user-facing wording before wider exposure.
- Consider DB-persisted lifecycle registry only if Owner approves the platform scope.
- Defer Office family expansion until the DOCX path is accepted.
