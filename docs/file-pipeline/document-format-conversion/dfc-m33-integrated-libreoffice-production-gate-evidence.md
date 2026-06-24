# DFC-M33 Integrated LibreOffice Production-Gate Evidence Bundle

Status: evidence bundle / production not approved

Date: 2026-06-21

Branch: `main`

Baseline: `e6ef1f7d`

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This bundle consolidates the next LibreOffice DOCX-to-PDF production-gate evidence without changing production behavior, enabling downloads, or claiming production Office-to-PDF support.

## Scope Boundary

This round keeps the current product boundary:

- `productionApproved=false`.
- `downloadEnabled=false`.
- DOCX-only `pdf_attachment` remains owner-gated and experimental.
- `markdown` and `original_file` fallbacks remain independent.
- No `.doc`, `.rtf`, `.docm`, `.xls` / `.xlsx` Office-to-PDF, PS/EPS, PDF OCR, image, or audio support is added.
- No system LibreOffice, PATH fallback, arbitrary executable path, renderer-provided executable path, implicit runtime download, or postinstall download is added.
- No LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, or temp output is committed.

## Evidence Summary

Evidence produced in M33:

- Default-off path-depth smoke matrix validation ran and passed for matrix definition plus sanitized evidence shape.
- Real path-depth matrix did not run because this shell did not provide explicit `STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_*` runtime roots. No runtime root was inferred.
- Runtime security evidence was consolidated against the managed-runtime handle, sandbox, process policy, output validation, cleanup, and diagnostic-redaction seams.
- Legal/provenance review packet was assembled for the current Windows x64 prerelease `.svpkg`.
- Signing/trust and distribution decision memo was assembled with explicit Owner decision slots.
- Packaged smoke readiness plan was assembled. Packaged smoke remains incomplete until a production-like packaged app smoke actually runs.
- Progress ledger and recovery context were updated.

## Path-Depth Evidence

Default-off harness:

- File: `infra/files/dfcLibreOfficePathDepthSmokeMatrix.test.ts`.
- Flag: `STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SMOKE`.
- Default command:

```powershell
npm run rebuild:node
npx vitest --run infra/files/dfcLibreOfficePathDepthSmokeMatrix.test.ts --reporter=dot --silent
```

Matrix cases covered by the harness:

| Case | Runtime root class | Sandbox/input/output/profile class |
| --- | --- | --- |
| `short-runtime-short-sandbox` | short | short |
| `short-runtime-deep-sandbox` | short | deep |
| `deep-runtime-short-sandbox` | deep | short |
| `deep-runtime-deep-sandbox` | deep | deep |

Sanitized evidence shape:

- case id
- runtime path class
- sandbox path class
- status
- ok flag
- cleanup status
- path lengths only
- recorded path-class booleans
- diagnostic codes only

The evidence serializer test rejects raw user paths, executable names, source filenames, and private path segments. The real matrix also checks that serialized evidence does not include the runtime root, sandbox root, or managed executable path.

M33 result:

- Default-off matrix validation passed: 2 tests passed, 1 real smoke skipped.
- The skipped test is expected unless `STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SMOKE=1` and both explicit repo-external runtime roots are provided.
- No real path-depth evidence was captured in M33 because the required environment variables were absent.

Real path-depth matrix remains required before production approval:

```powershell
$env:STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SMOKE = '1'
$env:STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SHORT_RUNTIME_ROOT = '<repo-external-short-managed-runtime-root>'
$env:STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_DEEP_RUNTIME_ROOT = '<repo-external-deep-managed-runtime-root>'
npx vitest --run infra/files/dfcLibreOfficePathDepthSmokeMatrix.test.ts --reporter=dot --silent
```

Gate status:

- Closed in M33: default-off harness shape, matrix coverage, and sanitized evidence contract.
- Still blocked: real short/deep runtime plus short/deep sandbox matrix, chosen maximum-path policy or controlled short-path policy, and real failure/success evidence with sanitized diagnostics only.

## Runtime Security Evidence Report

Current enforced or test-locked controls:

| Control | Evidence |
| --- | --- |
| Managed-runtime-only execution | Adapter inputs now use `DfcLibreOfficePluginManagedRuntimeHandle`; runtime resolution goes through `resolveDfcLibreOfficePluginManagedRuntimeHandle`. |
| No system/PATH fallback | Runtime manifest requires a managed relative executable; catalog policy keeps `systemPathFallbackAllowed=false`; tests scan for accidental production approval and enabled downloads. |
| No arbitrary executable path | Runtime gate rejects absolute paths, UNC paths, drive-qualified paths, parent traversal, NUL bytes, and executable realpath escape from the managed root. |
| Sandbox input/output | Adapter copies source bytes into a DFC conversion sandbox, uses controlled input/output/work directories, and validates output under the expected output dir. |
| Isolated LibreOffice profile | Adapter passes `-env:UserInstallation=<sandbox work profile file URL>` and creates the profile under sandbox work. |
| Argument-array process launch | Adapter builds an args array, sets `shell=false`, and sets `allowBatchEntrypoint=false`. |
| Timeout and cleanup | External process policy supplies timeout, stdout/stderr limits, and termination grace; adapter cleanup removes the sandbox root on success and failure when requested. |
| Output validation | Adapter requires exactly one expected PDF, verifies the path remains under controlled output, and checks `%PDF-` bytes before returning a descriptor. |
| Fail-closed behavior | Missing runner, unsupported source extension, process failure, timeout, missing output, ambiguous output, non-PDF output, invalid runtime, disabled runtime, unsupported platform, or quarantined runtime creates no ready DerivedAsset. |
| Redacted diagnostics | Sandbox and plugin-distribution sanitizers strip raw paths, command details, env, storage refs, full hashes, and private path text from exposed diagnostics. |

Current evidence files:

- `infra/files/dfcManagedLibreOfficeRuntime.ts`
- `infra/files/dfcManagedLibreOfficeRuntime.test.ts`
- `infra/files/dfcLibreOfficePdfAdapter.ts`
- `infra/files/dfcLibreOfficePdfAdapter.test.ts`
- `infra/files/dfcLibreOfficeManagedPackageInstaller.ts`
- `infra/files/dfcLibreOfficeManagedPackageInstaller.test.ts`
- `infra/files/dfcLibreOfficeRuntimePackageArchive.ts`
- `infra/files/dfcLibreOfficeRuntimePackageArchive.test.ts`
- `infra/files/dfcLibreOfficeRuntimeAcquisition.ts`
- `infra/files/enginePluginLifecycleService.test.ts`
- `infra/db/worker.filePipeline.test.ts`

Security gaps that remain blockers:

- Macro execution, external-link refresh, embedded-object execution, and network disablement are required manifest policy fields, but production approval still needs a focused real-runtime audit proving invocation and sandbox behavior agree with that policy.
- Process-tree cleanup is covered by external process policy and adapter cleanup seams, but production approval still needs real timeout/process-tree evidence from a production-like packaged app context.
- Real path-depth failure/success evidence is still missing.
- Packaged app smoke has not run, so no packaged runtime discovery, conversion, cleanup, and diagnostics evidence is complete.

## Legal And Provenance Review Packet

Current Windows x64 prerelease candidate:

| Item | Value |
| --- | --- |
| Upstream authority | The Document Foundation |
| Upstream URL | `https://download.documentfoundation.org/libreoffice/stable/26.2.4/win/x86_64/LibreOffice_26.2.4_Win_x86-64.msi` |
| Observed official mirror host | `www.mirrorservice.org` |
| Runtime version | `26.2.4` |
| Platform / arch | `win32` / `x64` |
| MSI sha256 | `202f26cda071c5aa4996a5a28412fddceb3891dceb0366982c62650456c0730f` |
| MSI sizeBytes | `372539392` |
| Package name | `starverse-runtime-libreoffice-0.1.0-26.2.4-win32-x64.svpkg` |
| Package sha256 | `ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e` |
| Package sizeBytes | `518907010` |
| Executable relative path | `program/soffice.exe` |
| Executable sha256 | `3c24436274cb9b5ccd363a517b377d07991eae82072690227e41c62ca9ca718b` |
| Executable sizeBytes | `523688` |
| Inventory artifact count | `19492` |
| GitHub release tag | `starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64` |
| Release type | prerelease |
| Catalog source kind | `github_release_asset` |
| Catalog download state | `downloadEnabled=false` |
| Production state | `productionApproved=false` |

Package/provenance inputs that must be attached or reviewable for legal signoff:

- TDF source URL and official download page.
- TDF `.meta4` checksum and signature metadata when available.
- MSI hash and size.
- Starverse `.svpkg` hash and size.
- Top-level package manifest.
- Runtime manifest.
- Inventory.
- Generated provenance JSON.
- `license.txt`.
- `LICENSE.html`.
- `NOTICE`.
- `CREDITS.fodt`.
- Attribution and notices generated into the package.

Legal/provenance decision slot:

| Option | Meaning | M33 state |
| --- | --- | --- |
| Promote current prerelease | Use the current GitHub prerelease asset as production authority | Not approved |
| Replace | Build and verify a new production release asset from the same or newer TDF source | Open |
| Mirror | Move the package to a Starverse-controlled production mirror with equal or stronger verification | Open |
| Bundle | Ship the runtime with the app package after size/update/legal approval | Open |
| Reject | Reject the current package candidate for production | Open |

M33 recommendation: do not promote the current prerelease asset as production authority until legal/license redistribution review, signing/trust policy, production acquisition policy, and packaged smoke are complete.

## Signing, Trust, And Distribution Decision Memo

Current trust state:

- Hash and size verification exist for the prerelease `.svpkg`.
- Package layout, manifest identity, inventory, executable path, executable hash/size, provenance, license, and security policy are verified by archive/import/runtime gates.
- Production signing policy is not approved.
- Unsigned package behavior is not approved for production.
- The current catalog source points at a prerelease asset with `downloadEnabled=false`.

Recommended policy for Owner/security decision:

| Decision area | M33 recommendation | Production status |
| --- | --- | --- |
| Signature format | Require signed catalog metadata plus either a detached package signature or embedded `signatures/` envelope for the exact `.svpkg` hash. | Not implemented or approved |
| Trust root | Use a Starverse-owned production trust root embedded or distributed with the app, separate from GitHub release trust. Include key id, role, created/expiry dates, and rotation policy. | Not selected |
| Verification order | Check source policy and platform first; verify package size/hash before extraction; verify signature/trusted catalog before activation; extract only to staging; validate manifest, inventory, runtime identity, executable hash/size, security policy, provenance, and license before activation. | Partially implemented for hash/layout; signing pending |
| Revocation | A revoked package must not launch, must not be a rollback target, and must produce only symbolic unavailable/blocked diagnostics. Cached packages are deleted or quarantined according to Owner policy. | Policy open |
| Rollback | Roll back only to a previous known-good package that is still trusted, unexpired, unrecalled, same platform/arch compatible, and hash/signature verified. | Partially scaffolded; production policy open |
| Unsigned package policy | Reject unsigned packages for production. Allow unsigned owner-gated experimental/offline-import packages only with explicit hash pinning and `productionApproved=false`. | Open |
| Production acquisition source | Do not use the current prerelease as production authority by default. Choose normal GitHub release, Starverse mirror, bundled asset, or offline import after legal/trust approval. | Open |
| Distribution mode | Prefer explicit install/repair or Owner/admin offline import first. Keep conversion-time automatic download disallowed. Bundling requires separate installer-size and update-cadence approval. | Open |
| User consent wording | Must explain that Starverse will install or import a Starverse-managed LibreOffice runtime for DOCX-to-PDF, show package version/source/size, state whether network download is required, and state that system LibreOffice is not used. | Draft only |

Draft consent wording for a future approved install/repair UX:

```text
Install Starverse-managed LibreOffice runtime for DOCX-to-PDF.

Starverse will use a version-pinned LibreOffice runtime package verified by hash, signature, provenance, license, and platform policy. The package is used only for managed DOCX-to-PDF conversion. Starverse will not use system LibreOffice or PATH discovery. Download/import may take several minutes and uses about 519 MB for the current Windows x64 candidate.
```

This wording is not a production approval. It is a decision input for a future UX gate.

## Packaged Smoke Readiness Plan

Packaged smoke is not complete in M33. It must not be marked complete until a production-like packaged app actually runs against a production-like managed runtime location.

Prerequisites:

- Owner chooses production acquisition/distribution mode.
- Legal/provenance packet is accepted or the package is explicitly kept owner-gated experimental.
- Signing/trust policy is selected, or unsigned experimental handling is explicitly accepted.
- Runtime root is repo-external and not under Vite watch scope.
- App package or production-like packaged app build can discover the managed runtime through the normal app-managed root.

Minimum packaged smoke steps:

1. Build or launch a production-like packaged app.
2. Install/import the Windows x64 `.svpkg` into the app-managed runtime root, not `.external-runtime-work`.
3. Verify Plugin Management/runtime diagnostics show LibreOffice installed, owner-gated, experimental, and not production-approved.
4. Run a DOCX fixture through DFC `pdf_attachment`.
5. Verify exactly one controlled PDF output becomes a `converted_pdf` DerivedAsset.
6. Verify preview remains metadata-only and Send Plan uses selected refs plus verified DerivedAsset metadata.
7. Disable or remove the runtime and verify DOCX `pdf_attachment` fails closed with fallback guidance.
8. Confirm no system LibreOffice, PATH lookup, common install path, or renderer executable path is used.
9. Confirm diagnostics expose no raw absolute paths, full hashes, command lines, env, DOCX body, PDF body, storage refs, or package paths.
10. Confirm sandbox/profile/temp cleanup on success and failure.

Completion rule:

- M33 produced the plan only.
- Packaged smoke remains blocked until the production-like packaged app smoke actually runs and records sanitized evidence.

## Gates Closed And Still Blocked

Closed in M33:

- Default-off path-depth harness validation.
- Typecheck failures in LibreOffice real-smoke/path-depth harness typing and one unused archive constant.
- Runtime security evidence consolidation.
- Legal/provenance packet assembly for the current Windows x64 prerelease package.
- Signing/trust and distribution decision memo assembly.
- Packaged smoke readiness plan assembly.

Still blocked:

- Real path-depth matrix with explicit repo-external short/deep runtime roots.
- Selected maximum path-length policy or controlled short-path runtime policy.
- Legal/license/provenance approval.
- Signing/trust root and signature verification policy approval.
- Production acquisition and distribution mode approval.
- Packaged app smoke completion.
- Runtime security audit against macro/network/external-link/embedded-object behavior in a production-like context.
- Multi-platform packages and per-platform smoke.
- Owner approval to change `productionApproved`.
- Owner approval to change `downloadEnabled`.

## ER / PR Delta

For this bundle:

- ER means evidence readiness.
- PR means production readiness.

M33 ER delta:

- Improved. Evidence is now consolidated into one bundle, the default-off path-depth matrix is validated, current runtime-security controls are mapped to files/tests, and legal/signing/distribution/packaged-smoke decision inputs are explicit.

M33 PR delta:

- Unchanged. Production readiness remains blocked. No production behavior changed, no production acquisition was enabled, no packaged smoke completed, and no production Office-to-PDF claim is made.

## Recommended M34 Path

Recommended M34: run the real LibreOffice path-depth matrix using explicit repo-external short and deep managed runtime roots, then choose one path policy:

- controlled short runtime/sandbox roots for production, or
- a documented maximum supported path length with tests/smoke evidence.

M34 should also record sanitized real evidence for success/failure, cleanup, and diagnostic codes. Do not combine M34 with `productionApproved=true`, `downloadEnabled=true`, broad Office format expansion, GitHub asset mutation, or packaged smoke claims.
