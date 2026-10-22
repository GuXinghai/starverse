# Static Review — Phase 5a: Plugins, Engines, and Processes

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

This is a read-only static review of branch `codex/basic-operation-exploration-8q02ix` at `3032ef3`. The application source matches baseline `aec217cd`.

- No application code was modified.
- No tests, builds or rebuilds were run.
- The app was not launched, and nothing was downloaded.

## 1. Scope and coverage

| Area | Files | Depth |
|---|---|---|
| Plugin lifecycle | `infra/files/enginePluginLifecycleService.ts` (Magika install/uninstall, promote, zip, LibreOffice import entry), `electron/services/epoch2EnginePluginLifecycleService.ts`, `electron/ipc/enginePluginLifecycleV2Ipc.ts`, `infra/db/repo/enginePluginRegistryRepo.ts` | Targeted; LibreOffice probe/import paths skimmed |
| Catalog and trust | `src/next/file-type/{pluginCatalog,pluginCatalogSignature,enginePluginTrustContracts}.ts`, `src/next/plugin-distribution/{officialPackageRelease,magikaOfficialRelease,cryptoVerification,packageDownloader,validation}.ts` | Full for the live path |
| Download | `electron/services/electronOfficialPackageDownloadService.ts`, Magika memory fetch via `electronConversionService`/`electronConversionBridge` | Full for the request path |
| Magika | `src/next/file-type/{magikaManagedPlugin,magikaRuntimeLoader,magikaClassifyRunner,magikaAdapter}.ts`, `electron/services/magikaUtilityProcessRunner.ts`, `epoch2FileTypeDetectionService.ts` (`runMagika`) | Full for the load/health/classify paths |
| LibreOffice | `infra/files/dfcLibreOffice{ManagedPackageInstaller,RuntimePackageArchive,PdfAdapter,OfficialAssetBodyIntercept,SignedCatalog,RuntimeAcquisition}.ts`, `dfcManagedLibreOfficeRuntime.ts`, `electron/services/generationV2DfcService.ts` | Full for install, availability and conversion; type/catalog and summary regions skimmed |
| Processes | `src/next/file-type/{externalProcessRunner,externalProcessPolicy}.ts`, `dfcConversionSandbox.ts` | Full |

**Not covered (open):**
- Several `src/next/plugin-distribution` modules: `catalogMetadata`, `catalogCompatibility`, `packageVerification`, `localPackageRegistration`, `atomicInstaller`, `installRecovery`, `rollbackPolicy`, `quarantinePolicy`, `lifecycleState`, `updatePolicy`. Their liveness was not traced; `atomicInstaller` and `installRecovery` may be unused.
- `electronOfficialPackageTransport.ts`.
- The Magika runtime script executed in the utility process.
- `electronConversionBridge` HTML→PDF.
- The contents of the official 0.2.0 Magika zip.
- The real Windows behaviour of LibreOffice 26.2.4.
- Packaging scripts and CI, which belong to Phase 8.

**Unused in production (no callers found):**
- `libreOfficeRunner.ts`
- `dfcManagedBrowserRuntime.ts`
- `dfcLibreOfficeRuntimeAcquisition.ts`
- `dfcLibreOfficeSignedCatalog.ts` (`verifyDfcLibreOfficeSignedCatalog`)
- the tika, ffprobe and pandoc runners
- `dfcLibreOfficeOfficialAssetBodyIntercept.ts`, which is used only by smoke scripts and a gate

## 2. Subagent configuration and contributions

Two read-only `Explore` subagents ran concurrently with `model: sonnet` and `effort: high`. The exact "Sonnet 5.5" version cannot be confirmed. Neither spawned agents nor wrote files.

- **5A-A** covered lifecycle, trust and download, and returned 8 candidates.
- **5A-B** covered LibreOffice and processes, and returned 12 candidates.

The coordinator verified these against source:
- `runMagika` gates only on version, flags and `lastVerifiedAt`, never on `manifestHash` (`electron/services/epoch2FileTypeDetectionService.ts:183-203`).
- `register-local-package` IPC is ungated (`electron/ipc/enginePluginLifecycleV2Ipc.ts:34-37`).
- The manifest `healthcheck.command` is passed to `runExternalProcess` (`magikaManagedPlugin.ts:555-566`).
- LibreOffice argv has no macro, link or network hardening, and no profile `.xcu` is written anywhere (`dfcLibreOfficePdfAdapter.ts:206-226`; grep found no hits).
- The quarantine marker lives inside the runtime root (`dfcManagedLibreOfficeRuntime.ts:542`), and the installer `rm`s that root when the runtime is unavailable (`dfcLibreOfficeManagedPackageInstaller.ts:279-294`).
- Only `electron-conversion` and `file-type-detection` are registered shutdown sources (`mainV2.ts` about lines 229-253).
- POSIX `detached: true` is set at `externalProcessRunner.ts:102`.

## 3. Findings by severity

There are no High findings. The worst issues need either a hostile document (P5a-01) or same-user write access to userData (P5a-02, P5a-03).

### Medium

#### P5a-01 — LibreOffice conversion of user DOCX files runs without enforced macro, link or network hardening [5A-B-1, 5A-B-6]
- **Severity:** Medium. Untrusted documents (user attachments, possibly downloaded from anywhere) are processed by a full office suite. The declared security policy is not what runs.
- **Status:**
  - Statically confirmed: no hardening is applied, and the manifest flags are hard-coded.
  - Suspected: the concrete impact, which depends on LibreOffice 26.2.4 defaults for linked graphics, UNC/`file://`/`http(s)` links and macro level in headless conversion.
- **Where:**
  - `infra/files/dfcManagedLibreOfficeRuntime.ts:1167-1173` sets `macrosDisabled`, `networkDisabled`, `externalLinksDisabled`, `embeddedObjectExecutionDisabled` and `isolatedProfileRequired` to `true` in the parsed manifest.
  - `:1189-1195` only checks that the package claims them.
  - `dfcLibreOfficePdfAdapter.ts:206-226` builds argv with no profile configuration. No `registrymodifications.xcu`, `MacroSecurityLevel` or `UpdateLinks` setting is written anywhere in `infra`, `electron` or `src`.
  - `generationV2DfcService.ts:154, 215-229`: the DOCX branch is chosen by `attachment.mime` alone, so any content labelled with the DOCX MIME type reaches LibreOffice. LibreOffice sniffs content, which widens the parsers exposed to RTF, HTML, ODT and others.
- **Trigger:** The user attaches a crafted document, and the composer requests the PDF representation.
- **Impact (suspected):**
  - Linked-image or OLE-link fetches during conversion: SSRF, an outbound SMB/NTLM authentication leak to a UNC host on Windows, or local file content rendered into the PDF that is then sent to a provider.
  - Exposure to LibreOffice parser CVEs, with no OS sandbox.
- **Safeguards:**
  - Per-run profile directory and per-run uuid sandbox.
  - `env: {}`.
  - Absolute managed executable.
  - No user-controlled argv.
  - 60 s timeout with a tree kill.
- **Repair direction:**
  - Seed the per-run profile with `registrymodifications.xcu`: macro security at its highest level with no trusted locations, link updates disabled, linked-graphic loading blocked.
  - Require content-detected DOCX before conversion.
  - Consider a network-blocked job object, AppContainer or firewall rule for `soffice`.
  - Make the manifest flags reflect what the code actually enforces.
- **Verify:** A Windows smoke test with a DOCX containing a UNC-linked image and an `http` linked image, watching the network and SMB traffic.

#### P5a-02 — Installed plugin code is trusted on load without re-verification; manifest-controlled health check spawns arbitrary commands [5A-A-1, 5A-B-8]
- **Severity:** Medium, as defense in depth. Tampering with userData persists across launches and is never detected. A manifest field turns into main-process command execution with the full app environment.
- **Status:** Statically confirmed.
- **Where:**
  - **Load path:** `epoch2FileTypeDetectionService.ts:183-203` never compares the on-disk manifest with `record.manifestHash`. `magikaManagedPlugin.ts:303-313, 972-1050` hash-checks only the files listed in the on-disk manifest's own `integrity` map. The official 0.2.0 build lists four files and declares `dependencyRoots: node_modules` (`scripts/dev/package-official-magika-v020.mjs:19-24, 171-172`), so the whole dependency tree is unverified. `inventory.json` is not kept after promote (`enginePluginLifecycleService.ts:3395-3432`).
  - **Health check:** `magikaManagedPlugin.ts:459` hard-codes `verificationStatus: 'verified'`. `:555-566` passes `healthcheck.command`, `args` and `cwd` from the manifest to `runExternalProcess`. That function uses a blocklist (`externalProcessPolicy.ts:121-134`) and `env: undefined`, so the child inherits all of `process.env` (`externalProcessRunner.ts:99`). It runs in main, not in the Magika utility process with its clean environment.
- **Trigger:** A same-user process edits files under `pluginsRoot/managed_root/magika`, or edits the manifest and core files consistently. A user-initiated health check then runs any declared command. The same applies to any registered package (see P5a-03).
- **Counterevidence:**
  - Install-time verification is strong (see Held up).
  - Official packages ship `healthcheck: null`.
  - The attacker needs local write access as the user.
- **Repair direction:**
  - Bind the on-disk manifest to `record.manifestHash` on every load.
  - Persist the verified inventory and re-hash it before load (or re-hash once per launch).
  - Ignore `healthcheck.command` for managed packages, or confine it to `process.execPath` with an allowlisted environment.

**Same class for LibreOffice [5A-B-2]:**
- Production approval compares pinned values with fields declared inside the writable `manifest.json`, including a declared (not recomputed) `artifactSha256` (`dfcManagedLibreOfficeRuntime.ts:1535-1597`).
- Only `program/soffice.exe` is re-hashed per launch (`:610-615`).
- `createDfcLibreOfficeWindowsX64ProductionTrustStatus` reports `productionTrustReadiness: 'ready'` as a constant alongside `signature_missing` (`:1486-1517`).
- **Repair:** Write a tree-digest install receipt and verify it before launch.

### Low-Medium

| ID | Finding | Status | Where | Repair direction |
|---|---|---|---|---|
| P5a-03 [5A-A-2] | The `register-local-package` IPC is renderer-reachable in packaged builds and takes an arbitrary `packageDir`, root kind and ref. It registers an unsigned package as `enabled` with `lastVerifiedAt = now`, and `runMagika` accepts any record claiming version `0.2.0` regardless of `installSource`. Registry fields come from the first discovered directory, which may differ from the directory later loaded. Execution still needs files at the resolved plugin directory, and no renderer write path to it was found. | Confirmed | `enginePluginLifecycleV2Ipc.ts:34-37`; `electron/preload.ts:264`; `enginePluginLifecycleService.ts:1904-1953`; `epoch2FileTypeDetectionService.ts:186-191` | Dev-gate the local-registration channels; require `installSource === 'official_catalog'` in `runMagika` |
| P5a-04 [5A-B-3] | Re-importing LibreOffice silently clears quarantine, because the marker lives inside the runtime root, which the installer deletes when the runtime is unavailable. `.previous-<ts>-<pid>` backups (a full LibreOffice copy each) and crash-left `.staging-*` directories are never pruned. | Confirmed | `dfcManagedLibreOfficeRuntime.ts:542`; `dfcLibreOfficeManagedPackageInstaller.ts:250, 278-295`; `enginePluginLifecycleService.ts:1971-1996` | Store quarantine outside the replaceable directory and check it before import; prune backups and staging directories at startup |
| P5a-05 [5A-B-5] | LibreOffice conversion is not a shutdown source. On quit mid-conversion, `soffice` is orphaned (POSIX `detached: true`, and the kill timers die with main), and the sandbox containing the user's DOCX copy is never removed. Windows `rm` failures are swallowed. There is no startup sweep. | Confirmed | `generationV2DfcService.ts:215-229`; `externalProcessRunner.ts:102`; `mainV2.ts` shutdown registration | Register the DFC service with the shutdown coordinator (tree-kill on quiesce); sweep `dfc-*` temp directories at startup |
| P5a-06 [5A-B-6] | DOCX→PDF has no concurrency cap, in-flight de-duplication or failure cache. The HTML path has `htmlPdfInFlight`. Each request for an unconverted DOCX spawns another `soffice` for up to 60 s. | Confirmed | `generationV2DfcService.ts:215-229` | Semaphore, in-flight map, negative cache |
| P5a-07 [5A-B-4, 5A-A-3, 5A-A-4] | Install races and atomicity. Both installers promote with two renames and have no crash journal or startup reconciliation; `shouldCleanFailedOfficialInstallFinalDir` always returns false. A failed LibreOffice activation with no previous runtime leaves the broken active directory. There is no shared lock across dialog import, official install, clear and running conversions. Staging names use `Date.now()-pid`. Magika install ignores cancel after the final health check and can enable a plugin the user cancelled; cancel does not abort the download. | Confirmed | `dfcLibreOfficeManagedPackageInstaller.ts:294-310`; `enginePluginLifecycleService.ts:878-889, 935-936, 1013-1077, 1392-1395, 3411-3415` | One install mutex per engine; `AbortController` for downloads; re-check operation currency after each await; startup reconciliation |

### Low

| ID | Finding | Status | Where |
|---|---|---|---|
| P5a-08 [5A-A-5, 5A-B-9] | Archive extraction defense in depth. `inflateRawSync`/`inflateRawAsync` run without `maxOutputLength`; the size is checked only after inflation. There is no total-size or entry cap, and no rejection of `:` alternate data streams, reserved device names or trailing dots. The LibreOffice package is held as about three copies in memory (about 1.5 GB for 519 MB), and manual import reads the whole user-chosen file before any size check. Mitigated by the pinned SHA-256 and signature checked on the same bytes before extraction. | Confirmed | `enginePluginLifecycleService.ts:3625-3646, 1958-1969`; `dfcLibreOfficeRuntimePackageArchive.ts:478, 554-557, 737`; `plugin-distribution/validation.ts:50-78` |
| P5a-09 [5A-A-6] | Trust-chain longevity. The Magika release signature expires 2027-08-13 against the local clock, after which shipped builds can no longer install. The Ed25519 signature covers only the package bytes; the envelope (`keyId`, `expiresAt`, digests) is unsigned. `appVersion` is hard-coded to `'0.0.0'`, so the compatibility check is a no-op. The catalog has no expiry or monotonic counter. After a single `hash_mismatch`/`signature_invalid`, install is blocked until restart (a MITM proxy can cause a session-long install denial), and the failure state survives uninstall. | Confirmed | `magikaOfficialRelease.ts:41-42`; `cryptoVerification.ts:96, 182-186, 436-446`; `enginePluginLifecycleService.ts:575-577, 774-777, 1072-1076, 2354-2364, 2718-2733`; `pluginCatalog.ts:113-127` |
| P5a-10 [5A-A-7] | Download path. Redirect hosts are checked only after the body has been fetched (`redirect: 'follow'`). The Magika in-memory fetch has a 60 s whole-body timeout and builds the body as both UTF-8 text and base64. Resume sends no `If-Range` header; the final SHA-256 still protects integrity. | Confirmed | `packageDownloader.ts:186-197, 263-283, 297`; `electronOfficialPackageDownloadService.ts:322-326`; `electronConversionService.ts:127-148` |
| P5a-11 [5A-B-7] | The LibreOffice output PDF is read fully, twice, with no size cap, just to check a 5-byte header. | Confirmed | `dfcLibreOfficePdfAdapter.ts:275-282`; `generationV2DfcService.ts:224` |
| P5a-12 [5A-B-10] | The availability check rewrites `manifest.json` (a legacy backfill that sets the pinned `artifactSha256` and release) inside a read path. The write is non-atomic, so concurrent readers can see a truncated file, and provenance is asserted without re-verification. | Confirmed | `dfcManagedLibreOfficeRuntime.ts:557-561, 1020-1028` |
| P5a-13 [5A-A-8, 5A-B-12] | IPC and diagnostics hygiene. Plugin channels have no sender-frame check (unlike the proxy IPC). `catalogPath`/`packageDir` are arbitrary renderer paths, and JSON parse errors can echo a snippet of a chosen `manifest.json`. `registerLocalOfficialPlugin` hashes the catalog-listed files but loads `<dir>/manifest.json`. Path redaction stops at whitespace and covers only a few prefixes. The catalog signature canonicalizes with `localeCompare`. | Confirmed | `mainV2.ts:92-94`; `magikaManagedPlugin.ts:641-745, 831-844`; `enginePluginLifecycleService.ts:2881-2886`; `externalProcessRunner.ts:15-16`; `pluginCatalogSignature.ts:118` |

### Uncertain functional concern
- **U5a-01 [5A-B-11]:** The installer compares the inner manifest's `artifactSha256` with the expected SHA-256 of the whole `.svpkg` (`dfcLibreOfficeManagedPackageInstaller.ts:228`). A file inside an archive cannot contain the archive's own hash. The dry-run packager writes a content hash there (`scripts/dfc/prepare-libreoffice-svpkg-dry-run.mjs:107-110`). Tests pass only with `expectedPackageSha256` omitted, while the lifecycle service always supplies it (`enginePluginLifecycleService.ts:1982`). Either official import fails closed, or the real package carries a different value. This could not be resolved from source. It fails closed, so it is not a bypass. **Verify:** Inspect a real official `.svpkg` manifest, or run the official-install smoke test.

## 4. Uncertainties and excluded false positives

**Uncertainties:**
- LibreOffice default link, macro and network behaviour in headless conversion (P5a-01).
- Whether the renderer can write into `pluginsRoot` (P5a-03).
- Official zip contents outside the inventory.
- Whether the transport re-hashes the on-disk file after download.
- Magika `exit`-before-stdout ordering.
- U5a-01.

**Held up:**
- **Trust anchor:** the embedded official Ed25519 key, Ed25519 only. Env-var and test roots are unreachable in this service, and no private keys are tracked.
- **Download:** HTTPS with a host allowlist. Size, SHA-256 and signature are verified on the same in-memory bytes that are later extracted, so there is no verify-then-use gap. Rollback is compared against the previous version.
- **Renderer input:** `pluginId` and version must equal hard-coded constants, so the renderer cannot choose a package.
- **Install sequence:** staged inventory re-check, health check before and after promote, rollback on health failure, and one install in flight per plugin and version. The registry row is written last, so a half-active plugin is never registered.
- **Uninstall:** confined by `assertSafeMagikaManagedPath` plus realpath to `magika` and `magika.(stage|tmp|rollback)-*` directly under the managed root.
- **Registry:** parameterized SQL with validated `installRef` and `manifestHash`.
- **Process spawning:** `shell: false`, argv arrays, `stdin` ignored, capped stdout and stderr, timeout at most 300 s with a grace timer, `taskkill /T /F` on Windows, and process-group kill on POSIX. User filenames never reach LibreOffice argv: the asset id is sanitized and the input path is an absolute sandbox path.
- **LibreOffice run:** `env: {}` with a per-run profile and sandbox. The output must be exactly one expected `.pdf` starting with `%PDF-`. The runtime executable is relative, contained via realpath and hash-checked. The quarantine marker fails closed when unreadable.
- **LibreOffice archive:** traversal, absolute paths, symlinks and case-insensitive duplicates are rejected. Files are written with `wx`, every file is checked against the inventory, unlisted files are rejected, and the `mkdtemp` root is cleaned in `finally`.
- **Magika utility process:** `utilityProcess.fork` with a `SAFE_ENV_KEYS` environment; only `process.execPath` is allowed as the command. It accepts exactly one typed string message, caps output with a kill, serializes work and is quiesced at shutdown.

**Rejected or downgraded:**
- "The asset body intercept is a verification bypass": it is used only by test harnesses and is size/SHA-256 pinned.
- "LibreOffice argument injection via filenames": not possible.
- "Unused runners use full environment and `macroPolicy: 'warn'`": no production callers. They are noted so they are not wired in as-is.

## 5. Next phase

**Phase 5b — Files and attachments:**
- `src/shared/files`
- `infra/files` send plan and DFC
- conversion services and HTML→PDF (`electronConversionBridge`)
- attachment preflight and upload (Anthropic, Gemini)
- import/export
- the composer-staging items carried from P3b-05 and P3b-06

This phase is complete. I have stopped and am waiting for your instruction to continue.
