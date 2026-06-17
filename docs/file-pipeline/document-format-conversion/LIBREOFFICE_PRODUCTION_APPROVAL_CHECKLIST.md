# LibreOffice Production Approval Checklist

Status: Owner approval checklist / production not approved

Date: 2026-06-17

Current HEAD reviewed: `f635508a6d493702db6853ff5c9fb5ab55f1848e`

Scope: LibreOffice Plugin Management / DOCX-to-PDF production approval package

Production state: `productionApproved=false`

This document is a production approval decision package for the existing LibreOffice Plugin Management and DFC Office-to-PDF integration. It records the current implementation evidence, remaining blockers, approval gates, and recommended next tasks. It does not approve production support, add conversion formats, change runtime behavior, or flip `productionApproved`.

## 1. Current Implementation Inventory

Current product status:

- LibreOffice Plugin Management integration is essentially complete, but not production-approved.
- Runtime acquisition source is recorded as a GitHub prerelease asset.
- Release redownload verification passed.
- DOCX-to-PDF managed runtime smoke passed.
- Office-to-PDF product status remains DOCX-only, owner-gated, and experimental.
- `productionApproved=false` remains correct.

Completed components:

- Managed runtime diagnostics normalization.
- Plugin Management inventory bridge.
- Catalog/import contract.
- Package layout verification policy.
- Lifecycle controls.
- DFC adapter switch-over: DOCX-to-PDF adapter obtains the LibreOffice runtime through the plugin-managed runtime handle.
- Product gate diagnostics.
- Acquisition/download pipeline, disabled by default and owner-gated.
- `.svpkg` package archive extraction/import bridge.
- Owner source decision and `.svpkg` dry-run / package preparation script.
- Official-source Windows x64 LibreOffice package preparation from The Document Foundation infrastructure.
- GitHub prerelease asset publication and redownload verification.
- Archive bridge verification, import helper verification, managed runtime gate verification, and real managed DOCX-to-PDF worker smoke.

Current verified upstream and package metadata:

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
| GitHub repo | `GuXinghai/starverse` |
| GitHub release tag | `starverse-runtime-libreoffice-v0.1.0-26.2.4-win32-x64` |
| Release type | prerelease |
| Catalog source kind | `github_release_asset` |
| Catalog download state | `downloadEnabled=false` |

Current supported product scope:

- Input: DOCX only for Office-to-PDF.
- Output target: `pdf_attachment`.
- Output asset: verified `converted_pdf` DerivedAsset.
- Send strategy: `file_attachment`.
- Fallbacks: `markdown` and `original_file`.
- Product state: owner-gated and experimental.

Explicitly unsupported:

- `.doc`, `.rtf`, `.docm`.
- `.xls`, `.xlsx` Office-to-PDF expansion.
- HTML PDF expansion in this approval package.
- PS/EPS.
- PDF OCR or local PDF parsing.
- Image or audio processing.
- System LibreOffice, PATH fallback, arbitrary executable path, or renderer-provided executable path.

## 2. Remaining Blockers

Production approval is blocked until all of the following are resolved and accepted by Owner:

- Legal / license / provenance review.
- Package signing policy.
- Production acquisition policy.
- Packaged distribution policy.
- Multi-platform assets beyond current Windows x64 package.
- Owner production approval.
- Windows path-depth / sandbox / LibreOffice output path risk.
- Typecheck issues under `infra/files/**` that have appeared in recent validation must be triaged or explicitly accepted as unrelated before release approval.

Path-depth risk summary:

- A real managed DOCX-to-PDF worker smoke from a very deep repo-external runtime root previously failed at process conversion.
- The same redownloaded package passed from a short repo-external runtime root.
- This must be tracked as a Windows path-depth / sandbox / LibreOffice output risk before production approval.

## 3. Legal / License / Provenance Checklist

Required evidence:

- Official source URL and release provenance from The Document Foundation.
- Official checksum metadata, including `.meta4` data where available.
- MSI sha256 and size:
  - `202f26cda071c5aa4996a5a28412fddceb3891dceb0366982c62650456c0730f`
  - `372539392`
- `.svpkg` sha256 and size:
  - `ce012cf1215f958286be29462d1ae8c122bdc6a779ac84076388de9875487f6e`
  - `518907010`
- Package manifest, runtime manifest, inventory, and provenance JSON.
- License and notice inputs observed during package preparation:
  - `license.txt`
  - `LICENSE.html`
  - `NOTICE`
  - `CREDITS.fodt`
- Legal review of LibreOffice license obligations, redistribution rights, attribution, NOTICE requirements, and bundled third-party materials.
- Decision on whether GitHub-hosted prerelease distribution is acceptable for production or only for owner-gated testing.
- Reviewer names or approval references for source provenance, license obligations, NOTICE/attribution handling, and redistribution terms.
- A final approved production asset record that ties the TDF upstream artifact, MSI hash/size, Starverse `.svpkg` hash/size, package manifest, runtime manifest, inventory, license files, notices, attribution, and provenance JSON together.

Approval gate:

- Owner must have a signed-off legal/provenance checklist before the package can be marked production-approved.
- Production documentation must include the approved source URL, package hash, package size, license references, notice references, attribution references, and review date.
- Production approval must not proceed from the current GitHub prerelease asset alone; the approval record must explicitly state whether the current prerelease asset is promoted, replaced by a production release asset, mirrored, bundled, or rejected.

## 4. Package Signing And Trust Checklist

Current state:

- The verified `.svpkg` has hash and size verification.
- No production package signing policy is approved in the current DFC closeout.
- The `signatures/` package directory is optional until signing is approved.

Required signing/trust decisions:

- Choose whether production packages require:
  - detached signature files,
  - embedded package signature metadata,
  - signed catalog metadata,
  - GitHub release digest plus Starverse catalog hash pinning,
  - or a combination.
- Define the trusted public key / trust root.
- Define signature verification order relative to size/hash/extraction.
- Define revocation behavior for signed but later disallowed packages.
- Define rollback behavior when the active package is revoked or replaced.

Minimum production trust gate:

- Verify package size and sha256 before extraction.
- Verify manifest identity, runtime identity, package version, runtime version, platform, arch, executable path, executable hash/size, provenance, license, and security policy before activation.
- Reject absolute paths, traversal, UNC paths, drive escapes, NUL bytes, symlink/reparse-point escapes, missing executable, hash mismatch, unsupported platform, revoked package, expired package, and incomplete metadata.
- Define the exact checksum/signature verification order for downloaded, offline-imported, bundled, and cached packages.
- Define the package rollback policy, including which previous package can be a rollback target and when rollback is forbidden.
- Define the revocation policy, including local cached package handling, catalog state handling, user diagnostics, and whether a revoked package must be deleted or quarantined.
- Define how signature key rotation or trust-root replacement is handled.
- Production approval must not proceed until unsigned package handling is explicit. If unsigned packages remain allowed, the Owner must explicitly accept the risk and the package must remain hash-pinned and owner-gated.

## 5. Production Acquisition Policy

Current acquisition state:

- Catalog source points to a GitHub prerelease asset.
- `downloadEnabled=false`.
- The asset is owner-gated, experimental, and not production-approved.
- `downloadEnabled=false` must remain the default until Owner approves production acquisition policy, release trust policy, and user-facing install/repair UX.

Production questions:

- Is a GitHub prerelease asset acceptable for production? Current recommendation: no, not without Owner approval and signing/trust policy.
- Should production use a normal GitHub release, bundled app asset, first-run explicit download, offline import, or a product-managed mirror?
- Is automatic download ever allowed, or must install/repair be explicit?
- What is the network failure behavior?
- What is the offline install behavior?
- What is the cache eviction and update policy?
- Is a fallback mirror allowed? If yes, it must have equal provenance and hash/signature verification.

Required production behavior:

- No implicit runtime acquisition during conversion.
- No default postinstall download without Owner-approved UX and policy.
- No system LibreOffice fallback if acquisition fails.
- Failed/missing acquisition keeps DOCX `pdf_attachment` unavailable or blocked with safe diagnostics.
- Production acquisition must use a version-pinned source URL, expected sha256, expected size, package version, runtime version, platform, arch, and trust policy reference.
- GitHub prerelease assets are acceptable only for owner-gated testing unless the Owner explicitly approves prerelease-as-production policy.
- A production asset must have a rollback/revocation plan before `downloadEnabled` can change.
- Cache and retry behavior must not create silent background downloads during conversion.
- Offline import must run the same hash/signature/provenance/license/security policy checks as online acquisition.

## 6. Packaged Distribution Policy

Distribution options to decide:

| Option | Impact | Current status |
| --- | --- | --- |
| Bundle LibreOffice runtime with app | Increases app size by hundreds of MB; simplifies offline availability | Not approved |
| Download on demand through explicit install/repair | Smaller app; requires network policy, consent, cache, signing, retry, and failure UX | Not approved |
| Offline import by Owner/admin | Best for controlled environments; requires import UX and validation | Scaffold exists; production UX not approved |
| User-installed system LibreOffice | Avoids package size; weak provenance and inconsistent behavior | Disallowed |

Production packaging concerns:

- App package size and installer performance.
- Per-platform runtime layout.
- Update cadence and security fixes.
- Revocation and rollback policy.
- User consent and owner gate wording.
- Product gate diagnostics before enabling conversion.

## 7. Multi-Platform Plan

Current verified asset:

- Windows x64 only: `win32` / `x64`.

Future platform requirements:

- macOS:
  - identify official TDF package source and architecture variants,
  - define extracted package layout,
  - verify executable relative path,
  - validate codesigning/notarization implications,
  - run archive/import/runtime/smoke validation.
- Linux:
  - decide package source format and distro assumptions,
  - avoid system package manager dependence as production authority unless Owner approves,
  - validate package layout and executable path,
  - run archive/import/runtime/smoke validation.
- Architecture naming must stay consistent across package metadata, catalog entries, release asset names, and runtime manifests.

Per-platform production approval requires:

- Package source decision.
- Hash/size/signature evidence.
- Layout verification.
- Runtime gate verification.
- Real DOCX-to-PDF managed worker smoke.
- Path-depth / sandbox / cleanup confidence.

## 8. Path-Depth / Sandbox / Output Risk

Known observation:

- Deep repo-external runtime root smoke failed at process conversion.
- Short repo-external runtime root smoke succeeded with the same redownloaded prerelease package.

Likely risk areas, without overclaiming root cause:

- Windows path length limits.
- LibreOffice profile/output path handling.
- Sandbox input/output/work path depth.
- Temporary profile path depth.
- Process working directory or argument path depth.
- Runtime package extraction root depth.

Required reproduction matrix before production approval:

| Dimension | Required cases |
| --- | --- |
| Runtime root depth | short, medium, deep |
| App data root | default user app data, custom managed root |
| Sandbox root | OS temp short path, app-managed temp path, deep path |
| Input path | short file name, long file name, Unicode file name, spaces |
| Output path | short output dir, deep output dir |
| Package source | imported local package, redownloaded release package |
| Failure capture | no raw absolute path in renderer-visible diagnostics |

Approval gate:

- Define a maximum supported runtime root/output path length or harden the sandbox/runtime root selection to enforce short controlled paths.
- Add targeted regression tests or documented smoke steps for the chosen policy.
- Record failure diagnostics and ensure they are symbolic/sanitized.
- Production approval must not proceed until the chosen maximum path-length policy or controlled short-path policy is written down and verified against the reproduction matrix above.

Default-off harness:

```powershell
npm run rebuild:node
npx vitest --run infra/files/dfcLibreOfficePathDepthSmokeMatrix.test.ts --reporter=dot --silent
```

The default command validates the matrix definition and sanitized evidence shape only. It does not run real LibreOffice.

Real path-depth smoke requires explicit Owner/engineer opt-in and two already prepared managed runtime roots:

```powershell
$env:STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SMOKE = '1'
$env:STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_SHORT_RUNTIME_ROOT = '<short-managed-runtime-root>'
$env:STARVERSE_DFC_LIBREOFFICE_PATH_DEPTH_DEEP_RUNTIME_ROOT = '<deep-managed-runtime-root>'
npx vitest --run infra/files/dfcLibreOfficePathDepthSmokeMatrix.test.ts --reporter=dot --silent
```

Required evidence from the real harness:

- short runtime root with short sandbox/input/output/profile paths succeeds or fails with sanitized diagnostic codes only.
- short runtime root with deep sandbox/input/output/profile paths succeeds or fails with sanitized diagnostic codes only.
- deep runtime root with short sandbox/input/output/profile paths succeeds or fails with sanitized diagnostic codes only.
- deep runtime root with deep sandbox/input/output/profile paths succeeds or fails with sanitized diagnostic codes only.
- harness output records only case ids, path classes, path lengths, cleanup status, and diagnostic codes; it must not print raw runtime roots, sandbox roots, executable paths, input paths, output paths, user names, or package paths.

## 9. Runtime Security Checklist

The current design requires:

- Execution only through a managed runtime handle.
- No system LibreOffice discovery.
- No PATH fallback.
- No user-selected executable.
- No renderer-provided executable path.
- Argument-array process launch; no shell command concatenation.
- Sandbox copy for input.
- Controlled sandbox output directory.
- Isolated temporary LibreOffice profile.
- Timeout and process-tree cleanup.
- Output validation requiring expected PDF output under controlled output dir.
- stdout/stderr size limits and redaction.
- No local absolute paths, raw storage refs, command lines, env, document body, PDF body, full hashes, or sensitive temp paths in renderer-visible diagnostics.

Before production approval, verify or complete:

- Macro execution disabled or not triggered.
- External links are not refreshed.
- Network is disabled or blocked according to policy.
- Embedded object execution is disabled.
- Temporary profile cleanup occurs on success and failure.
- Sandbox input/output/work dirs are cleaned up.
- Process timeout kills child process tree.
- Logs do not include sensitive absolute paths.
- Conversion failure remains fail-closed with no ready DerivedAsset and no legacy fallback.

Approval gate:

- Production approval must not proceed until runtime security evidence proves the manifest policy and actual LibreOffice process invocation agree: macros are not executed, network and external refresh behavior are blocked, the profile is isolated, stdout/stderr are bounded and redacted, timeout cleanup reaches the process tree, and sandbox/profile/temp cleanup is verified for success and failure.
- If any of these controls are only declared in manifest metadata rather than enforced by invocation or sandbox policy, the approval record must explicitly identify the gap and assign a follow-up task before `productionApproved` can change.

## 10. Product Gate / UX Checklist

Current product gate:

- Office-to-PDF is owner-gated.
- Experimental state remains visible in runtime/product diagnostics.
- Missing, invalid, unhealthy, quarantined, degraded, disabled, unsupported, timeout, and conversion-failed states must keep PDF conversion unavailable/blocked.

Required UX decisions before broader exposure:

- How Office-to-PDF is surfaced in Plugin Management.
- Whether users see a download/install/repair action.
- Required warning wording for experimental or production-approved states.
- Whether `pdf_attachment` appears by default or only under advanced options.
- How fallback to `markdown` and `original_file` is presented.
- How to explain unsupported `.doc`, `.rtf`, `.docm`, XLS/XLSX Office-to-PDF, HTML PDF, PS/EPS, and PDF OCR.
- What diagnostics are required before enabling the feature.

Product claim boundary:

- Allowed now: owner-gated, experimental, managed runtime path, DOCX-only, production approval pending.
- Not allowed now: production-ready, bundled LibreOffice, broad Office support, automatic runtime download, system fallback, or `productionApproved=true`.

## 11. Test / Validation Matrix

Existing validations already passed:

- Archive bridge verification from real `.svpkg`.
- Import helper verification from real `.svpkg`.
- Managed runtime gate verification.
- Real managed DOCX-to-PDF worker smoke.
- Draft/prerelease redownload hash/size verification.
- Redownloaded package archive/import/runtime/smoke verification.
- Targeted unit tests for runtime, adapter, package installer, lifecycle service, acquisition, and worker path in previous rounds.

Future required validations before production approval:

| Area | Required validation |
| --- | --- |
| Legal/provenance | verify source URL, TDF metadata, license, NOTICE, attribution, redistribution review |
| Package signing | verify selected signature/trust policy |
| Acquisition | redownload from production-approved source, hash/size/signature validation, offline failure behavior |
| Import/install | staged extraction, realpath containment, symlink/reparse rejection, rollback, cleanup |
| Runtime security | no macros, no network, no external links refresh, isolated profile, timeout/process cleanup |
| Path-depth | reproduction matrix across short/medium/deep roots |
| Product UX | owner-gated diagnostics, warning text, fallback behavior |
| Platform | Windows x64 plus future macOS/Linux asset-specific smoke |
| Regression | OpenRouter/provider work unaffected; Send Plan and DFC selected-ref authority unchanged |

Suggested targeted commands for future implementation/audit rounds:

```powershell
npm run rebuild:node
npx vitest --run infra/files/dfcManagedLibreOfficeRuntime.test.ts infra/files/dfcLibreOfficePdfAdapter.test.ts infra/files/dfcLibreOfficeManagedPackageInstaller.test.ts infra/files/dfcLibreOfficeRuntimeAcquisition.test.ts infra/files/enginePluginLifecycleService.test.ts --reporter=dot --silent
npx vitest --run infra/db/worker.filePipeline.test.ts -t "LibreOffice|Office PDF|DOCX pdf_attachment|unsupported|real managed" --reporter=dot --silent
git diff --check
```

Real smoke commands remain environment-gated and must use repo-external runtime roots:

```powershell
npm run test:office-pdf-libreoffice-import-dev-smoke
npx vitest --run infra/files/dfcLibreOfficeRuntimePackageArchive.test.ts -t "real owner-approved" --reporter=dot --silent
npx vitest --run infra/db/worker.filePipeline.test.ts -t "real managed" --reporter=dot --silent
```

Typecheck note:

- Recent validation in this repository has observed unresolved `infra/files/**` LibreOffice/DFC typecheck failures in real-smoke/package archive files. Before production approval, rerun `npx vue-tsc --noEmit --pretty false`, confirm whether those failures still exist, and either fix them or explicitly document why they are unrelated to production approval.

## 12. Approval Decision Table

| Gate | Owner | Current status | Required evidence | Pass/fail criteria | Target follow-up task |
| --- | --- | --- | --- | --- | --- |
| Legal/license/provenance | Owner/legal | Blocked | TDF source URL, MSI hash/size, `.svpkg` hash/size, license/NOTICE/attribution review | Written approval; no unresolved redistribution blocker | Legal/provenance review package |
| Signing/trust | Owner/security | Blocked | Signature format, trust root, revocation policy | Package verification can reject unsigned/untrusted or revoked artifacts according to policy | Signing policy implementation |
| Production acquisition | Owner/product/security | Blocked | Approved source, download UX, cache/update/offline policy | No implicit conversion-time download; safe failure behavior | Acquisition policy hardening |
| Packaged distribution | Owner/release | Blocked | Bundled/download/offline import decision, app size impact, user consent | Distribution route is explicit and tested | Distribution decision package |
| Windows path-depth | Engineering/Owner | Blocked | Reproduction matrix and selected mitigation | Deep/short behavior understood; chosen path policy enforced | Path-depth smoke matrix |
| Runtime security | Security/Owner | Partial | sandbox, profile, no network, no macro, cleanup, log redaction evidence | Fail-closed behavior and no sensitive diagnostics | Runtime security audit |
| Product UX | Product/Owner | Blocked | warning text, Plugin Management flow, fallback wording | No production overclaim; user can understand experimental state | UX/product gate checklist |
| Multi-platform | Owner/release | Blocked | macOS/Linux package candidates and smoke results | Each platform passes package/import/runtime/smoke gates | Platform package plan |
| Typecheck/regression | Engineering | Partial | current typecheck and targeted test results | No relevant DFC errors or accepted unrelated failures only | Validation cleanup |
| Final production approval | Owner | Not approved | all prior gates complete | Owner explicitly approves `productionApproved=true` change | Production approval implementation |

## 13. Recommended Next Tasks

Recommended Codex implementation/audit task:

- Task: `test(file-conversion): audit LibreOffice production approval blockers`
- Scope:
  - Add or update docs/tests only where useful to lock current blocker state.
  - Rerun targeted LibreOffice package/runtime/acquisition tests.
  - Rerun typecheck and classify any `infra/files/**` failures.
  - Do not change runtime behavior or flip `productionApproved`.

Recommended DeepSeek review/hardening task:

- Task: `review(file-conversion): LibreOffice runtime security and path-depth gate`
- Scope:
  - Review sandbox/profile/network/macro/output/logging policy.
  - Review path-depth failure evidence and suggest minimum reproduction matrix.
  - Identify P0/P1 blockers before production approval.

Recommended Owner checkpoint:

- Decision: approve or reject moving from owner-gated experimental to a specific next gate:
  - legal/provenance review,
  - signing/trust policy,
  - production acquisition policy,
  - packaged distribution policy,
  - or path-depth smoke matrix.

Task sizing guidance:

- Keep each next task medium-sized.
- Do not split into single-field doc patches.
- Do not combine production approval, signing, acquisition, packaged distribution, and multi-platform support into one implementation commit.

## 14. Explicit Non-Goals

This approval checklist does not:

- approve production Office-to-PDF support,
- change `productionApproved` to true,
- implement `.doc`, `.rtf`, `.docm`,
- implement `.xls` / `.xlsx` Office-to-PDF,
- implement HTML PDF changes,
- implement PS/EPS,
- implement PDF OCR or local PDF parsing,
- implement image or audio processing,
- change production runtime behavior,
- change DFC conversion code,
- change package.json or lockfiles,
- install dependencies,
- create runtime acquisition implementation,
- modify GitHub release assets,
- upload or download files,
- touch provider architecture source code,
- revive LiteLLM or old Gemini scope,
- add Agent/RAG/coding workflow platform scope.
