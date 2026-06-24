# DFC-M44R0 Magika Managed Runtime Acquisition Parity Audit

Date: 2026-06-22

Authority: `starverse_format_conversion_preview_v1_2.md` remains the DFC SSOT. This is a documentation-only parity audit before adding any manual GitHub download path for LibreOffice Office-to-PDF. It does not implement LibreOffice download, does not change Magika behavior, and does not enable production Office-to-PDF support.

## Scope Boundary

Unchanged:

- `productionApproved=false`.
- `downloadEnabled=false` for LibreOffice.
- LibreOffice Office-to-PDF remains DOCX-only, owner-gated, experimental, and not production-approved.
- no LibreOffice manual GitHub download implementation in this round.
- no automatic download, postinstall download, startup/background download, or conversion-time download.
- no system LibreOffice discovery, PATH fallback, arbitrary executable path, or renderer-provided executable path.
- no `.doc`, `.rtf`, `.docm`, `.xls/.xlsx`, PS/EPS, PDF OCR, image, or audio support.
- no Magika behavior changes.
- no shared acquisition refactor.
- no LibreOffice or Magika binaries, `.svpkg` files, extracted runtimes, staging output, sandbox output, packaged output, or signing secrets added.

## Targeted Mapping Commands

Commands used for this audit:

```powershell
rg --files | rg -i "magika|pluginLifecycle|enginePlugin|runtimePackage|managedPlugin|modelCatalog|dialogIpc|preload|PluginManagement|managementViewModel"
rg -n "magika|Magika" infra electron src scripts docs/file-pipeline/file-type-detection-implementation -g "*.ts" -g "*.tsx" -g "*.vue" -g "*.mjs" -g "*.md"
rg -n "installOfficialPlugin|operation|extractOfficialMagikaPackage|promoteOfficialMagikaEngine|registerLocalPackage|disablePlugin|uninstallPlugin|runHealthCheck|quarantine" infra/files/enginePluginLifecycleService.ts
rg -n "cancel|AbortController|AbortSignal|cancelInstall|officialInstall|installOperation|getInstallOperationStatus|installOfficialPlugin" electron src infra -g "*.ts" -g "*.vue"
rg -n "acquisitionSource|downloadEnabled|download|GitHub|release|expectedSha256|expectedSize|catalog|trust|signature|revoked|expired" infra/files/dfcManagedLibreOfficeRuntime.ts infra/files/dfcLibreOfficeRuntimeAcquisition.ts infra/files/dfcLibreOfficeSignedCatalog.ts infra/files/dfcLibreOfficeRuntimePackageArchive.ts
```

## Magika Route Map

| Area | Magika implementation | File/function | Reusable for LibreOffice? | Notes |
| --- | --- | --- | --- | --- |
| runtime/plugin manifest | Managed plugin manifest with `engineId`, runtime entry, model/config files, integrity, capabilities, platform, and healthcheck. | `src/next/file-type/magikaManagedPlugin.ts`, `parseMagikaManagedPluginManifest`, `discoverMagikaManagedPlugin` | Partial | Reusable path validation and integrity concepts, but LibreOffice uses `.svpkg` runtime manifest and external process policy rather than Magika model files. |
| managed package identity | Official package metadata pins plugin id/version, package hash/size, manifest hash, inventory hash, platform/arch, runtime kind, and channel. | `src/next/plugin-distribution/magikaOfficialRelease.ts`, `MAGIKA_OFFICIAL_RELEASE_METADATA` | Yes | LibreOffice should add a first-party official release descriptor with equivalent identity fields rather than a separate DTO family where possible. |
| acquisition source | Built-in official GitHub release asset descriptor with host allowlist, size cap, hash, signature envelope, trust root, and target metadata. | `magikaOfficialRelease.ts`, `officialPackageRelease.ts` | Yes | LibreOffice should model GitHub Release asset as an official catalog source while keeping automatic download disabled. |
| manual download/install/repair flow | Plugin Management exposes `install_official_plugin`; user action starts `EnginePluginLifecycleService.installOfficialPlugin`, then polls operation status. | `PluginManagementPanel.vue`, `installOfficialPlugin`; `enginePluginLifecycleService.ts`, `installOfficialPlugin` | Yes | This is the main pattern to reuse for LibreOffice: explicit user gesture, operation state, no status-read side effects. |
| auto download | No auto trigger was found. `installOfficialPlugin` is called by the UI install action or tests, not by listing status or detection. | `PluginManagementPanel.vue`, `loadData` and `runAction`; `enginePluginLifecycleHandlers.ts` | Yes | M44 LibreOffice must preserve this: list/status/DFC paths must not call download. |
| verification | Download policy validates official source, HTTPS, host allowlist, expected hash/size, byte limit; crypto verification validates signature/trust root/target metadata/compatibility/rollback. | `downloadPolicy.ts`, `packageDownloader.ts`, `cryptoVerification.ts`, `officialPackageRelease.ts` | Yes | LibreOffice should reuse these generic helpers for download bytes, then feed bytes into LibreOffice `.svpkg` import/archive verification and M43 signed catalog checks. |
| staging/activation | Magika downloads to memory, extracts ZIP to an owned `.stage-*` directory, validates manifest/inventory, health-checks stage, promotes to managed `magika`, then registers. | `enginePluginLifecycleService.ts`, `extractOfficialMagikaPackage`, `promoteOfficialMagikaEngine`, `upsertOfficialMagikaInstall` | Partial | Reuse operation sequencing and owned-dir safety, but LibreOffice activation must use `.svpkg` importer, short-path caps, app-managed runtime root, executable validation, and no system fallback. |
| cache/retry/cancel | In-flight install operations prevent duplicate concurrent installs. Failed retry is allowed except trust-blocked terminal states. Downloader accepts `AbortSignal` and state machine has `cancelled`, but no UI/IPC cancel action was found. | `installOperationState.ts`, `packageDownloader.ts`, `enginePluginLifecycleService.ts` | Partial | Reuse retry/dedup/polling. Do not invent a broad cancel UI for LibreOffice unless bounded; document cancel as transport-capable but not currently exposed. |
| Plugin Management UI | Official catalog rows, install button, status banner, polling, details, lifecycle controls, diagnostics, labels, and sanitized release provenance. | `PluginManagementPanel.vue`, `managementViewModel.ts`, `managementActions.ts` | Yes | LibreOffice already shares the panel; M44 should add a LibreOffice-specific Download/Install control using the same action model, not an unrelated UI. |
| IPC/preload | Magika official install uses DB bridge methods. LibreOffice offline import currently uses main-process dialog IPC for raw path isolation. | `enginePluginLifecycleHandlers.ts`, `enginePluginLifecycleClient.ts`, `dialogIpc.ts`, `preload.ts` | Partial | Remote download should use DB bridge action; offline import should remain dialog-mediated so renderer never receives raw package path. |
| renderer DTO sanitization | Zod-decoded DTOs and PDP view model sanitize status, diagnostics, provenance, and product gate fields. | `enginePluginLifecycleContracts.ts`, `managementViewModel.ts`, `sanitization.ts` | Yes | LibreOffice M42/M43 product-gate fields already align here; add acquisition status fields only as renderer-safe enums/buckets. |
| diagnostics/logs | Symbolic failure reasons, operation error chains, sanitized diagnostics, path/hash/url redaction helpers. | `sanitization.ts`, `installProgress.ts`, `enginePluginLifecycleService.ts` | Yes | Reuse sanitizers and symbolic diagnostics. Do not expose raw package/runtime paths, command lines, env, or full hashes. |
| revocation/expiration | Generic crypto/trust helpers support `expired_metadata`, signature failures, rollback detection, and revoked/quarantine policy. No Magika signed catalog revocation list beyond metadata/quarantine policy was found. | `cryptoVerification.ts`, `quarantinePolicy.ts`, `rollbackPolicy.ts` | Partial | LibreOffice M43 already has signed catalog revocation/expiration; M44 should bridge Magika-like official package verification with LibreOffice catalog revocation. |
| rollback | PDP rollback metadata evaluator rejects mismatches, unverified, revoked, incompatible, and unsafe refs; Magika promotion has filesystem rollback during failed final health. | `rollbackPolicy.ts`, `promoteOfficialMagikaEngine`, `rollbackOfficialMagikaPromote` | Partial | LibreOffice should continue using M43 rollback eligibility and may reuse operation rollback concepts for failed activation. |
| tests/smoke | Unit tests cover official release metadata, download policy, downloader, install operations, lifecycle service, management UI, rollback, quarantine, and sanitization. | `src/next/plugin-distribution/*.test.ts`, `infra/files/enginePluginLifecycleService.test.ts`, `src/ui-app/components/PluginManagementPanel.test.ts` | Yes | M44 should add LibreOffice-specific tests while reusing Magika test shapes. |

## Existing Manual GitHub Download For Magika

Manual GitHub download exists for Magika.

The route is:

1. `listOfficialPlugins` exposes the built-in official Magika row only when an official trusted root is configured.
2. Plugin Management builds an enabled `install_official_plugin` action only for an installable official catalog row.
3. User click calls `enginePluginLifecycle.installOfficialPlugin`.
4. The lifecycle service starts an in-memory operation and returns a sanitized operation DTO immediately.
5. Background operation transitions through `accepted`, `pending`, `downloading`, `verifying`, `staging`, `registering`, `health_checking`, and terminal states.
6. The UI polls `enginePluginLifecycle.getInstallOperationStatus`.
7. Download uses the built-in GitHub release URL, official host allowlist, byte limit, expected size, and expected hash.
8. Signature/trust verification runs before extraction/activation.
9. Extraction/stage/health/promotion/register happen only after verification.

No code path was found where opening Plugin Management, listing plugin status, or running file detection automatically starts the official download.

## Conflict And Divergence Analysis

| Area | Current divergence | Classification | M44 implication |
| --- | --- | --- | --- |
| acquisition policy naming | Magika uses generic `official`/`catalog_official`/`official_remote_install_available`; LibreOffice uses Office PDF-specific `acquisitionSource`, `downloadEnabled=false`, and `office_pdf_acquisition_*`. | Should be renamed for consistency where renderer-facing. | Add LibreOffice official row/action using PDP action names; keep Office-specific diagnostics internally. |
| `downloadEnabled` semantics | Magika official release has `remoteInstallEnabled=true`; LibreOffice catalog has `downloadEnabled=false` and acquisition helper separately requires `allowDownload=true`. | Acceptable now, but should be explicit. | M44 must introduce an owner/user gesture gate distinct from automatic download. Do not flip existing production `downloadEnabled` unless the field is redefined or replaced by `manualDownloadEnabled`. |
| manual vs automatic flags | Magika has one explicit install action. LibreOffice has offline import and a disabled acquisition helper. | Should be refactored to shared managed runtime acquisition. | Use a manual Plugin Management action for LibreOffice; status reads and DFC paths remain no-op for download. |
| catalog source fields | Magika generic catalog has package, manifest, inventory, signature refs. LibreOffice first-party catalog has runtime-specific acquisition source, path caps, and verification order. | Partial reuse. | Add a LibreOffice official release descriptor that references existing first-party runtime catalog values instead of duplicating constants. |
| GitHub release asset lookup | Magika pins a specific release URL/asset in code. LibreOffice pins a GitHub asset URL in first-party catalog with download disabled. | Reusable. | Reuse host allowlist and official package transport; do not add arbitrary URL input. |
| progress/cancel/retry | Magika has operation polling and duplicate suppression; cancellation exists in lower-level types but no user-facing cancel command. LibreOffice acquisition helper has timeout/AbortController but no Plugin Management operation. | Reuse progress/retry; cancel partial. | M44 should implement operation polling and retry first. A Cancel button is optional only if it can reuse existing `AbortSignal` control safely. |
| cache directory layout | Magika downloads to memory and promotes directly under managed root. LibreOffice acquisition helper writes `.svpkg` into a repo-external cache and then expects import. | Acceptable because LibreOffice package is larger. | Keep repo-external cache and short-path app-managed root, but surface only abstract refs/buckets. |
| staging directory layout | Magika uses `magika.stage-*` owned dirs under managed root. LibreOffice importer uses temp extraction then app-managed activation. | Acceptable because LibreOffice uses `.svpkg` archive and path caps. | Generalize safe owned-dir cleanup concepts only. |
| active runtime pointer | Magika registry record points to managed install ref. LibreOffice active runtime is a managed runtime root/manifest bridge synthesized into Plugin Management. | Acceptable for now. | Do not force LibreOffice into Magika registry unless an explicit migration is approved. Bridge status can still use shared DTO/action model. |
| quarantine behavior | Magika has generic PDP quarantine policy and registry state. LibreOffice has a quarantine marker checked by runtime gate. | Acceptable because LibreOffice runtime is external-process. | Keep marker enforcement; optionally map status through shared quarantine labels. |
| status DTO shape | Magika uses generic catalog/registry/install operation DTOs. LibreOffice adds product gate/trust distribution fields. | Acceptable, should align labels. | Add acquisition status as generic install operation plus LibreOffice product gate fields, not a second renderer contract. |
| UI labels | Magika shows "Install official plugin"; LibreOffice currently disables install and uses owner-gated import/recheck/disable/clear/quarantine wording. | Should be renamed for consistency. | Use "Download / Install" or "Download official package" for LibreOffice owner-gated manual action; still show `downloadEnabled=false` or "Automatic download disabled". |
| IPC/preload command shape | Magika official install uses DB bridge. LibreOffice import uses Electron dialog IPC due raw path boundary. | Acceptable. | Remote LibreOffice download should use DB bridge; offline import should stay dialog/preload. |
| diagnostic vocabulary | Magika has generic `download_failed`, `signature_invalid`, `hash_mismatch`; LibreOffice has `office_pdf_*`. | Partial reuse. | Map generic acquisition failures into Office PDF diagnostics at DFC boundary while keeping Plugin Management reason codes generic where possible. |
| privacy boundaries | Both use sanitizers. LibreOffice smoke/evidence has stricter no raw path/hash requirements. | Acceptable because LibreOffice launches external process and handles documents. | Keep stricter LibreOffice evidence policy; use Magika sanitizers plus Office-specific scans. |

## Recommended LibreOffice Acquisition Model

Use a Magika-aligned, owner-gated manual official install flow.

What to reuse directly:

- `downloadOfficialPackageToMemory`.
- `validateDownloadPolicy`.
- official host allowlist and HTTPS-only redirect validation.
- expected hash/size verification.
- `verifyOfficialPackageReleaseDownload` pattern where possible.
- official install operation states and polling.
- `buildPdpManagementActions` action gating pattern.
- Plugin Management polling/banner/error display pattern.
- `sanitizePluginDistributionText`, install progress bucketing, and renderer DTO decoders.

What to generalize:

- A shared "official managed runtime package release" descriptor that can describe Magika ZIP and LibreOffice `.svpkg`.
- Shared manual install operation scaffolding: operation id, duplicate suppression, state transitions, sanitized diagnostics, polling DTO.
- Shared download/trust phase: official source policy, hash/size, signature/catalog state, revoked/expired checks.
- Shared install action labeling with a product-specific label override.

What remains LibreOffice-specific:

- `.svpkg` format and large package size.
- app-managed short runtime root and M36 short-path caps.
- DOCX-only `office_to_pdf` and `docx_to_pdf` capability checks.
- external process invocation, managed descriptor only, no system/PATH fallback.
- sandbox input/output, isolated profile, timeout/process cleanup, PDF validation.
- Office PDF symbolic diagnostics.
- macro/external-link/network/embedded-object policy blockers.
- signed Starverse LibreOffice catalog from M43 and revocation/rollback enforcement.

Proposed status model:

| Status field | Values/meaning |
| --- | --- |
| manual download | `available_owner_gated`, `in_progress`, `succeeded`, `failed`, `not_available` |
| automatic download | always `disabled_by_policy` for M44 |
| conversion-time download | always `disabled_by_policy` |
| source descriptor | `github_release_asset`, with fixed official host/asset metadata |
| hash/catalog/signature | `hash_pinned`, `signature_missing`, `signed_catalog_verified`, `revoked`, `expired`, `mismatch` |
| staging/activation | `downloaded_verified`, `importing`, `activated`, `activation_failed` |
| runtime state | `ready`, `blocked`, `quarantined`, `disabled`, `missing` |

Proposed UI wording:

- Primary action: `Download / Install`.
- Secondary text: `Owner-gated experimental download. Automatic download is disabled.`
- Disabled status: `Download disabled by policy` for non-owner/non-configured states.
- Progress: reuse Magika phase labels where possible, with LibreOffice label override: `Downloading LibreOffice package`, `Verifying package`, `Importing runtime`, `Checking runtime`.
- Diagnostics: symbolic codes only, no URL, path, command line, env, or full hash.

## No-Auto-Download Proof Plan

M44 implementation tests should prove:

1. Opening Plugin Management calls list/status methods only and does not call LibreOffice download transport.
2. Reading Plugin Management status does not call LibreOffice download transport.
3. Uploading a DOCX does not call LibreOffice download transport.
4. `ensureDfcOptions` with missing runtime does not call LibreOffice download transport.
5. Send Plan creation does not call LibreOffice download transport.
6. Conversion attempt with missing runtime returns blocked/unavailable and does not call LibreOffice download transport.
7. Download occurs only after explicit Plugin Management `Download / Install` user gesture.
8. Retry, if implemented, is another explicit user gesture.
9. Cancel, if implemented, only aborts a user-started operation and never creates an automatic retry.
10. Offline import and GitHub download converge on the same `.svpkg` import/archive/runtime verification path after bytes are acquired.
11. Trust-blocked, revoked, expired, path-cap-exceeded, disabled, and quarantined states do not launch `soffice`.

## Concrete M44 Implementation Package

Recommended M44 work:

1. Add a LibreOffice official release descriptor that references `getDfcLibreOfficeFirstPartyRuntimeCatalogEntry()` values and declares GitHub release asset source, expected hash/size, host allowlist, current owner-gated status, and signed-catalog production requirement.
2. Add an owner-gated manual `Download / Install` action for the LibreOffice row in Plugin Management. Do not make list/status/DFC paths call it.
3. Implement a LibreOffice install operation using the existing Magika operation state shape and polling DTO. Start with no cancel button unless a safe abort handle is held by the lifecycle service.
4. Reuse `downloadOfficialPackageToMemory` for HTTPS/host/hash/size/byte-limit validation.
5. Feed verified bytes into the existing LibreOffice `.svpkg` import path, then M43 signed catalog/trust policy, archive extraction, manifest/runtime/executable validation, activation, path-cap check, and optional owner-gated smoke/health.
6. Map generic downloader failures to existing `office_pdf_acquisition_*` and `office_pdf_catalog_*` diagnostics.
7. Add no-auto-download tests around Plugin Management load, DFC option generation, Send Plan, and conversion missing-runtime paths.
8. Add privacy tests/scans for the new operation DTO and UI text.

Recommended not to do in M44:

- Do not add arbitrary URL entry.
- Do not add automatic repair/download.
- Do not add conversion-time download.
- Do not publish or mutate GitHub assets.
- Do not flip production approval or general `downloadEnabled` without a narrow field meaning change approved by Owner.
- Do not refactor Magika install internals unless necessary for a tiny shared operation helper.

## Remaining Owner Decisions

- Whether the LibreOffice action label should say `Download / Install` or `Install official package`.
- Whether a manual owner-gated download should use a new field such as `manualDownloadEnabled` while preserving `downloadEnabled=false` as "no automatic/product download".
- Whether Cancel is required in M44 or can remain a future improvement because Magika does not expose cancel today.
- Whether downloaded `.svpkg` cache should be retained after successful import or deleted/quarantined.
- Whether GitHub prerelease asset remains candidate-only or must be replaced by a production release asset before any user-facing manual download.
- Whether M44 should generalize only interfaces or also move Magika code into a shared official-runtime installer helper.

## M44 Recommendation

Proceed with a Magika-aligned manual Plugin Management download/install path for LibreOffice, but keep it owner-gated and explicitly non-automatic. Reuse the generic downloader, policy, operation-state, DTO sanitization, and UI polling patterns. Keep LibreOffice-specific `.svpkg` import, path caps, external process security, DOCX-only capability, and M43 signed catalog/revocation gates in the LibreOffice runtime layer.
