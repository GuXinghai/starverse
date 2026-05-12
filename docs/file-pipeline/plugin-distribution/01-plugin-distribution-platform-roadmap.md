# Plugin Distribution Platform Roadmap

## 1. Scope and baseline

**Status**: Planning only. No implementation, production code, tests, package files, lockfiles, or build artifacts are changed by this roadmap.

**Current baseline**:

- Current HEAD at planning time: `ad70e767822aa7fd2f747daaffc2d50991ec1d60`.
- File Content Identification v1.0 is complete and closed.
- The post-v1 file identification roadmap is narrowed to identification-only Phase 8 through Phase 11.
- Plugin distribution is now governed as this standalone Plugin Distribution Platform theme, using PDP phase numbers.

**Relevant prior baseline commits from the file identification roadmap**:

- `bc70785`, `ad49fbc`, `8cca912`, `bd7e250`: File Content Identification v1.0 completion baseline as referenced by `56-post-v1-future-phase-roadmap.md`.
- Earlier trust and lifecycle scaffolds exist, but they are not a completed plugin distribution platform.

**Relationship to file identification, conversion, and provider-file themes**:

- File identification answers what a file is. It may consume installed runtime plugins, such as Magika, but it does not own package distribution.
- Conversion answers what a file becomes. Future Pandoc, Tika, LibreOffice, and ffprobe plugins can reuse this platform for package distribution, but conversion behavior is outside this roadmap.
- Provider-file work answers where provider-managed files live and how they are referenced. `provider_file_ref` lifecycle is outside this roadmap.
- This roadmap covers package distribution, verification, installation, rollback, update, and management infrastructure only.

**Planning-only confirmation**:

- No document conversion implementation starts here.
- No `provider_file_ref` implementation starts here.
- No downloader, installer, marketplace, or signing implementation starts here.
- No plugin payload behavior is designed here beyond package metadata needed to distribute official plugins safely.

## 2. Why this is a standalone theme

Plugin distribution is cross-cutting infrastructure. It serves identification plugins, future conversion/runtime plugins, and future official utility plugins. Treating it as part of file identification would couple a supply-chain system to one consumer path.

The risk profile is also different. File identification runtime safety is about detection execution, fallback, and evidence correctness. Plugin distribution adds package authenticity, artifact integrity, catalog freshness, controlled install roots, update interruption, rollback, quarantine, and user-facing management. Those acceptance criteria need separate phase numbers and separate stop rules.

This separation also keeps Magika from becoming a platform special case. Magika can be the first pilot package, but the platform contract must also work for future Pandoc, Tika, LibreOffice, ffprobe, and other official plugins without implementing those payloads.

## 3. Security model

The first platform version is official-only.

- Only Starverse-curated plugins are eligible for production install and execution.
- MVP does not enable any third-party plugin ecosystem.
- No user-provided marketplace or catalog URLs are accepted.
- No user-editable trust roots are accepted in MVP.
- No arbitrary plugin scripts are allowed.
- No unsigned package execution is allowed.
- No package code executes during catalog browsing.
- No network execution hooks are allowed in plugin manifests by default; manifests default to `network.allowed=false`.
- Runtime plugins remain isolated from the renderer.
- Plugin failure must not block Starverse startup.
- Plugin failure must not break the core file-identification path.

Trust and integrity:

- Use a signed catalog and signed package model for MVP.
- Keep catalog signing and package signing separate.
- Require artifact inventory coverage for every executable, runtime, model, manifest, license, attribution, and config artifact included in a package.
- Verify SHA-256 and size before install.
- Verify package signature before unpack/install.
- Verify catalog signature before catalog entries are displayed as trusted.
- Treat missing integrity metadata as a failure, not as a warning.
- Keep compatibility filtering metadata in the catalog and manifest before install.

Verification order:

1. Verify Starverse trust root configuration.
2. Verify catalog signature, version, and expiry.
3. Verify catalog entry hashes and sizes.
4. Parse manifest from verified package bytes.
5. Validate relative paths and controlled-root containment.
6. Verify package inventory coverage.
7. Verify per-file integrity.
8. Install into a controlled root.
9. Run health check only after verified install.

Controlled roots:

- User-local app data plugin directory.
- Portable app plugin directory.
- Dev-only `.starverse-engines` directory.
- Do not install into the application program directory by default.
- Do not trust raw absolute paths in manifests. Manifest paths must be relative package paths.
- Do not expose raw absolute paths, raw hashes, tokens, or argv paths in ordinary logs or UI.

Fallback and disable semantics:

- Unverified, revoked, incompatible, unhealthy, or disabled plugins must be excluded from availability.
- Core file identification must continue through built-in/fallback behavior when a plugin fails.
- A failed plugin may be disabled or quarantined without affecting application startup.
- Local manual package registration is allowed before downloader work only after the package contract and verification policy are defined. Production execution still requires verified package status.

## 4. TUF / Sigstore-inspired decisions

MVP should use a hybrid minimal approach: signed catalog plus signed packages, with selected TUF-style metadata fields and a Starverse-owned offline signing workflow. It should not claim full TUF or full Sigstore until their client, metadata rotation, and operational requirements are implemented.

| Concept | Adopt now / reserve / reject | Reason |
|---------|-------------------------------|--------|
| Root metadata | Adopt minimal | Define Starverse trust roots, key IDs, key roles, root metadata version, expiry, and rotation rules. Keep the first implementation small and offline-signable. |
| Targets metadata | Adopt minimal | Catalog entries act as target metadata: package identity, version, platform, hashes, sizes, compatibility, and artifact references. |
| Snapshot metadata | Reserve | Useful for mix-and-match resistance once remote catalogs and multiple metadata files exist. Overhead is not justified for a local/static catalog MVP. |
| Timestamp metadata | Reserve | Useful for freshness and freeze resistance after remote catalog polling exists. Static/local catalog MVP can use metadata expiry without a timestamp service. |
| Target hashes and sizes | Adopt now | Required before downloader or installer work. Prevents partial, swapped, or tampered artifacts from installing. |
| Version monotonicity | Adopt now | Required for update and rollback safety. Prevents downgrade unless an explicit rollback policy selects a previous known-good version. |
| Expiration | Adopt now | Required for catalogs, root metadata, and package signatures so stale metadata can fail closed. |
| Delegated roles | Reserve | Useful for multiple product/plugin ownership groups later, but MVP is official-curated and should avoid role complexity. |
| Artifact signature | Adopt now | Package signatures must cover manifest and inventory digest, and the inventory must cover package artifacts. |
| Transparency log | Reserve | Rekor-style auditability is valuable later, but MVP should not depend on online transparency services. |
| Keyless signing | Reserve | Useful for CI-backed provenance later, but MVP should avoid binding platform availability to external identity infrastructure. |
| Offline signing key | Adopt now | A Starverse-owned offline key is the simplest production trust root for official curated packages. Private keys must never be committed. |

## 5. Plugin package model

Package anatomy should be runtime-kind neutral. A Magika package, a Pandoc package, and a Tika package should differ in runtime artifacts and declared capabilities, not in distribution mechanics.

Recommended package layout:

```text
plugin/
  manifest.json
  inventory.json
  signatures/
    package.sig
    manifest.sig
  runtime/
    ...
  models/
    ...
  config/
    ...
  licenses/
    LICENSE
    NOTICE
  attribution/
    attribution.json
```

Manifest fields:

- `manifestSchemaVersion`
- `pluginId`
- `engineId`
- `runtimeKind`
- `pluginVersion`
- `modelVersion`
- `artifactInventoryVersion`
- `displayName`
- `publisher`
- `description`
- `platforms`: OS and arch matrix
- `starverseVersionRange`
- `entrypoint`: relative path only
- `healthcheck`: declarative command reference or internal adapter reference only; no arbitrary scripts
- `capabilities`: package capability declarations, not payload behavior design
- `network`: defaults to `{ "allowed": false }`; any future exception requires a separate Owner-approved security design
- `licenseRefs`
- `attributionRefs`

Inventory fields:

- Artifact relative path.
- Artifact class: `runtime`, `wrapper`, `model`, `config`, `manifest`, `signature`, `license`, `attribution`, or future approved class.
- SHA-256 digest.
- Byte size.
- Optional executable bit expectation for platforms that need it.

Package signatures:

- The manifest signature covers canonical manifest bytes.
- The package signature covers the canonical inventory digest and package identity.
- The inventory covers every shipped artifact except detached signatures where explicitly modeled.
- Verification failure is fail-closed.

Compatibility:

- Starverse app version range.
- Platform and architecture.
- Runtime kind.
- Engine id.
- Plugin version.
- Model version.
- Manifest schema version.
- Artifact inventory version.

Path safety:

- Manifests must use relative paths only.
- Path normalization must reject traversal, drive prefixes, UNC paths, symlinks escaping controlled roots, and empty or duplicate normalized paths.
- UI and ordinary logs use redacted install references, plugin ids, and failure categories, not raw absolute paths.

## 6. Catalog model

The first catalog is official-only.

- Static local official catalog first.
- Remote official catalog later, after signature/hash policy and rollback/quarantine semantics are implemented.
- No user-provided catalog URL.
- No third-party channels in MVP.
- Catalog browsing must not execute package code, unpack packages, run health checks, or resolve network hooks from manifests.

Catalog entry schema:

- `catalogSchemaVersion`
- `catalogVersion`
- `catalogExpiresAt`
- `pluginId`
- `engineId`
- `runtimeKind`
- `pluginVersion`
- `modelVersion`
- `manifestSchemaVersion`
- `artifactInventoryVersion`
- `starverseVersionRange`
- `platforms`
- `packageUrl` or local package reference, only for official sources
- `packageSha256`
- `packageSizeBytes`
- `manifestSha256`
- `inventorySha256`
- `signatureRef`
- `revocationStatus`
- `releaseNotesRef`
- `licenseRefs`
- `attributionRefs`

Compatibility filtering:

- Incompatible app versions are hidden or shown as unavailable with a sanitized reason.
- Incompatible platform/arch entries cannot be installed.
- Runtime kind and engine id must match Starverse allowlists.
- Catalog display must not imply installability until verification and compatibility checks pass.

## 7. Registry and lifecycle state model

Registry persistence should remain planning-level here. The platform should extend the existing engine/plugin registry concept without committing to a specific migration in this document.

Recommended persisted fields:

- `pluginId`
- `engineId`
- `runtimeKind`
- `pluginVersion`
- `modelVersion`
- `manifestSchemaVersion`
- `artifactInventoryVersion`
- `installState`
- `enabled`
- `healthStatus`
- `verificationStatus`
- `failureReason`
- `installRootKind`
- `installRef`
- `previousKnownGoodRef`
- `catalogVersion`
- `signatureKeyId`
- `installedAt`
- `updatedAt`
- `lastVerifiedAt`
- `lastHealthCheckAt`
- `metadataJson`

State values:

- `installState`: `not_installed`, `verifying`, `installing`, `installed`, `enabled`, `disabled`, `updating`, `rollback_pending`, `rolling_back`, `rolled_back`, `quarantined`, `uninstalling`, `uninstalled`, `failed`
- `healthStatus`: `unknown`, `healthy`, `unhealthy`, `health_check_failed`, `not_run`
- `verificationStatus`: `unverified`, `verified`, `failed`, `revoked`, `expired`, `incompatible`
- `failureReason`: `unsigned`, `signature_invalid`, `hash_mismatch`, `package_hash_mismatch`, `manifest_hash_mismatch`, `integrity_missing`, `revoked`, `trusted_root_unconfigured`, `trusted_root_revoked`, `trusted_root_expired`, `incompatible_platform`, `incompatible_app_version`, `manifest_platform_mismatch`, `install_interrupted`, `health_failed`, `disabled_by_user`, `path_escape`, `plugin_path_outside_root`, `catalog_signature_invalid`, `catalog_expired`, `package_unavailable`, `rollback_unavailable`
- `installRootKind`: `user_local`, `portable`, `dev_only`

UI and logs:

- `installRef` should be a stable redacted reference, not a raw absolute path.
- `metadataJson` may store detailed metadata needed for diagnostics, but ordinary UI and logs must sanitize paths, hashes, argv, tokens, and package URLs.

Planning-level state machine:

```text
not_installed
  -> verifying
  -> installing
  -> installed
  -> enabled
  -> disabled

enabled
  -> updating
  -> installed
  -> enabled

updating
  -> rolling_back
  -> enabled | disabled | quarantined

installed | enabled | disabled
  -> uninstalling
  -> uninstalled

any verification, install, update, or health failure
  -> failed | quarantined | disabled
```

State rules:

- Verification must precede install.
- Install must precede enable.
- Download must precede verified install only after downloader work begins.
- Auto-update must wait for rollback/quarantine semantics.
- Revoked packages transition to `quarantined` or `disabled` before any execution.
- A failed plugin must never prevent startup or core detection fallback.

## 8. Phase roadmap

### PDP-Phase 1 - Trust-first Package and Catalog Contract

**Goal**: Define the official plugin package format, catalog metadata format, trust model, integrity model, compatibility model, and lifecycle states before any downloader or installer exists.

**Task packages**:

- PDP1-A Package, manifest, and inventory contract.
  - Define package anatomy, manifest schema, relative-path-only rules, artifact classes, required license/attribution files, and SHA-256/size coverage.
  - Preserve runtime-kind neutrality so Magika, Pandoc, Tika, LibreOffice, ffprobe, and future official plugins use the same distribution contract.
- PDP1-B Official catalog and compatibility contract.
  - Define official source policy, catalog entry schema, platform/arch filtering, app version range, runtime kind, engine id, plugin version, model version, manifest schema version, and artifact inventory version.
  - Confirm catalog browsing has no package execution, no arbitrary package scripts, and no user-provided catalog URLs.
- PDP1-C Trust, signing, revocation, and verification contract.
  - Define trust root, offline signing, catalog signing, package signing, expiry, key rotation, revocation, and verification order from trust root through post-install health check.
  - Preserve the minimal TUF-inspired / deferred Sigstore-inspired decisions in this roadmap.
- PDP1-D Lifecycle states, failure taxonomy, and closeout.
  - Define install states, health states, verification states, failure reasons, rollback/quarantine labels, and sanitized reporting requirements.
  - Complete closeout with claim-safety review and no downloader, installer, update, UI, or payload work.

**Acceptance criteria**:

- MVP trust decision is explicit: signed catalog plus signed package, with minimal TUF-inspired metadata and offline Starverse signing.
- Catalog signing and package signing are separate.
- Package compatibility dimensions are documented.
- Failure reasons include unsigned, signature invalid, hash mismatch, integrity missing, revoked, incompatible app/platform, interrupted install, failed health, and user-disabled states.
- Verification order is documented from trust root through catalog, manifest, path containment, inventory, per-file integrity, install, and post-install health check.
- No downloader, installer, update, UI, or payload work is started.

**Stop conditions**:

- Stop if the trust model is ambiguous.
- Stop if any task implies unsigned production execution.
- Stop if a package field requires plugin payload behavior design.

### PDP-Phase 2 - Local Package Verification and Manual Registration

**Goal**: Implement local/manual-only plugin package handling without downloader, remote catalog browsing, auto-update, or marketplace UI.

**Task packages**:

- PDP2-A Local package verification gate.
  - Handle manual/local package verification contracts: manifest/inventory validation, controlled-root eligibility rules, signature metadata presence checks, policy compatibility checks, hash-shape checks, platform/arch/app compatibility checks, and relative path containment.
  - Explicitly keep cryptographic signature execution deferred in this phase.
  - Keep remote download, remote catalog browsing, auto-update, marketplace UI, and third-party plugins out of scope.
- PDP2-B Controlled-root manual registration contract.
  - Define local/manual registration DTOs and root kinds (`user_local`, `portable`, `dev_only`) with sanitized install/package references.
  - Allow host boundary local selection inputs, but do not expose raw absolute paths in public DTOs.
- PDP2-C Registry and lifecycle state modeling.
  - Define guarded state transitions for discovered/registered/verifying/verified/enabled/disabled/failed/uninstalled.
  - Gate enable on verified state, preserve disable semantics, and keep uninstall metadata-only for this phase.
- PDP2-D Existing lifecycle health integration seam.
  - Map existing safe health outcomes into PDP lifecycle state without executing arbitrary plugin payloads in PDP modules.
  - Ensure plugin failure never blocks startup or core file-identification fallback.
  - Validate failure sanitization and no raw path/hash/token/argv leakage.

**Acceptance criteria**:

- Local manual package verification is available through non-UI service/domain APIs.
- Controlled roots are enforced and public DTOs do not expose raw absolute paths.
- Enable does not occur until verification status is eligible.
- Health mapping updates lifecycle health status without invalidating artifact-integrity verification state.
- Install orchestration, atomic filesystem staging/rollback, and registry persistence execution remain deferred to a later phase.
- No downloader, official catalog browsing, auto-update, third-party plugins, or marketplace UI is implemented.

**Stop conditions**:

- Stop if local package import can execute an unsigned package.
- Stop if rollback-on-failure cannot be represented.
- Stop if ordinary errors leak absolute paths, hashes, tokens, or argv paths.

### PDP-Phase 3 - Official Catalog Read-only

**Goal**: Show official plugin catalog metadata without downloading, unpacking, installing, or executing anything.

**Task packages**:

- PDP3-A Official catalog source and signature verification.
  - Accept official catalog sources only, verify catalog signature, expiry, version, target hashes, and target sizes before entries are trusted.
  - Keep user-provided catalog URLs, third-party channels, and network execution hooks out of scope.
- PDP3-B Read-only catalog DTO and compatibility filtering.
  - Expose plugin id, engine id, runtime kind, versions, platform/arch/app compatibility, license/attribution refs, revocation status, and sanitized availability reasons.
  - Do not unpack, install, execute, or run health checks during browsing.
- PDP3-C Display-only UI/IPC plan and closeout.
  - Plan read-only catalog display with absent or disabled install/update controls until PDP-Phase 4 readiness is complete.
  - Close out with claim-safety review that the feature is catalog display only, not a marketplace ecosystem.

**Acceptance criteria**:

- Only official catalog sources are accepted.
- Catalog signature, expiry, version, target hash, and target size metadata are validated before entries are trusted.
- Catalog browsing does not execute code or package hooks.
- Compatibility filtering does not reveal raw local paths or internal argv.
- Install/update controls remain absent or disabled unless PDP-Phase 4 readiness is complete.

**Stop conditions**:

- Stop if a user-provided URL path is introduced.
- Stop if browsing a catalog can trigger package execution.
- Stop if display language implies a marketplace ecosystem or third-party plugin support.

### PDP-Phase 4 - Downloader and Installer

**Goal**: Add official package download and verified installation.

**Task packages**:

- PDP4-A Downloader policy and temporary artifact boundary.
  - Accept official catalog package URLs only, download into non-executable temp storage, and define cancel/resume/interruption cleanup semantics.
  - Prevent arbitrary user URLs and prevent temp artifacts from being loaded or executed.
- PDP4-B Download verification and package authenticity.
  - Verify package size, package hash, catalog entry binding, package signature, manifest hash, inventory hash, and per-file integrity before unpack/install.
  - Fail closed on unsigned, signature-invalid, hash-mismatch, integrity-missing, expired, revoked, or incompatible packages.
- PDP4-C Verified install into controlled roots.
  - Unpack only after verification, install atomically into controlled roots, update registry states, and preserve rollback-on-failure semantics.
  - Ensure partial downloads or installs never become enabled packages.
- PDP4-D Progress, failure reporting, and closeout.
  - Report sanitized progress and failure reasons without raw absolute paths, raw hashes, tokens, argv paths, package temp locations, or plugin directories.
  - Close out with downloader/install claim-safety checks and no auto-update.

**Acceptance criteria**:

- Downloader accepts official catalog package URLs only.
- Package bytes are downloaded to a temp location that cannot be executed.
- Hash and size verification occur before unpack/install.
- Signature verification occurs before unpack/install.
- Interrupted installs leave no enabled partial plugin.
- Failure reporting is sanitized.
- Package install uses controlled roots only.

**Stop conditions**:

- Stop if downloader exists before PDP-Phase 1 policy is complete.
- Stop if an unverified temp artifact can be executed or loaded.
- Stop if package URL handling permits arbitrary user URLs.

### PDP-Phase 5 - Update / Rollback / Quarantine

**Goal**: Enable safe plugin updates and failure recovery.

**Task packages**:

- PDP5-A Update metadata and staged replacement policy.
  - Use signed metadata, monotonic version rules, expiry checks, compatibility filtering, and explicit downgrade blocking except for approved rollback.
  - Stage updates without replacing the previous known-good package until verification and health pass.
- PDP5-B Rollback and previous-known-good recovery.
  - Persist previous known-good references, restore or disable safely after failed update, and define `rollback_pending`, `rolling_back`, `rolled_back`, and `rollback_unavailable` behavior.
  - Ensure startup and core file identification continue when rollback is unavailable.
- PDP5-C Quarantine, revocation response, and closeout.
  - Quarantine or disable failed/revoked packages before execution, fail closed on revoked trust roots or revoked packages, and sanitize all reporting.
  - Close out with proof that auto-update remains blocked until rollback and quarantine pass acceptance.

**Acceptance criteria**:

- Update checks use signed metadata and monotonic version rules.
- Staged updates do not overwrite the previous known-good package until verification and health pass.
- Rollback can restore the previous known-good version or disable safely.
- Revoked packages are quarantined or disabled before execution.
- Auto-update remains blocked until rollback and quarantine pass acceptance.

**Stop conditions**:

- Stop if update replaces the only known-good plugin before verification and health pass.
- Stop if downgrade can occur outside explicit rollback policy.
- Stop if revocation is advisory instead of fail-closed for execution.

### PDP-Phase 6 - Plugin Management UI

**Goal**: Expose a user-facing official plugin management page.

**Task packages**:

- PDP6-A Installed plugin status and diagnostics UI.
  - Show installed, enabled, disabled, failed, unhealthy, unverified, revoked, incompatible, and quarantined states with sanitized messages.
  - Do not display raw absolute paths, raw hashes, tokens, argv paths, plugin directories, or package temp locations.
- PDP6-B Official-only catalog UI.
  - Display official catalog entries, compatibility status, versions, license/attribution refs, and revocation status without third-party marketplace language or user-provided URLs.
  - Keep catalog browsing non-executing.
- PDP6-C Management controls.
  - Expose install, update, remove, enable, disable, and manual package import only through already-defined lifecycle operations.
  - Do not introduce UI trust bypasses or allow actions before verification, rollback, and quarantine requirements are met.
- PDP6-D UI closeout and claim-safety review.
  - Validate sanitized health diagnostics, failure display, startup non-blocking behavior, and official-only language.
  - Confirm the UI is plugin management for official packages, not a third-party ecosystem.

**Acceptance criteria**:

- UI clearly distinguishes installed, available, incompatible, disabled, failed, and quarantined states.
- UI does not display raw absolute paths, raw hashes, tokens, argv paths, or internal package temp locations.
- UI shows official-only catalog language and does not support third-party URLs.
- UI actions call already-defined lifecycle operations; UI does not introduce new trust bypasses.
- Failure of the UI or plugin management page does not block app startup.

**Stop conditions**:

- Stop if UI implies community marketplace, monetization, or arbitrary third-party plugin support.
- Stop if UI can install/update before verification and rollback requirements are met.
- Stop if diagnostics leak sensitive filesystem or integrity values.

### Later phases, not MVP

- PDP-Phase 7: Multiple official channels: stable, beta, dev.
- PDP-Phase 8: Enterprise policy and offline bundle import.
- PDP-Phase 9: Transparency log or Sigstore-style verification, if adopted later.
- PDP-Phase 10: Third-party plugin ecosystem. Not planned unless Owner explicitly approves later.

**Task-package count**:

| Phase | Task packages |
|-------|---------------|
| PDP-Phase 1 | 4 |
| PDP-Phase 2 | 4 |
| PDP-Phase 3 | 3 |
| PDP-Phase 4 | 4 |
| PDP-Phase 5 | 3 |
| PDP-Phase 6 | 4 |
| **Total PDP-Phase 1 through 6** | **22** |

## 9. Gap mapping

| Existing gap | PDP phase | Notes |
|--------------|-----------|-------|
| Production signing / trust root | PDP-Phase 1 | Define offline Starverse signing, root metadata, key IDs, expiry, rotation, and revocation policy. |
| Signed package verification | PDP-Phase 1, PDP-Phase 2 | Contract first, then local/manual verified install. |
| Plugin upgrade / rollback | PDP-Phase 5 | Full update lifecycle belongs after downloader/installer and before marketplace-like UX. |
| Settings UI for plugin management | PDP-Phase 6 | Separate from identification plugin settings; this is official distribution management. |
| Downloader / installer | PDP-Phase 4 | Must wait for trust/package contract and local install semantics. |
| Official marketplace/catalog | PDP-Phase 3, PDP-Phase 6 | Read-only catalog before install controls; official-only UI later. |
| Magika local package | PDP-Phase 2 | First pilot package; must not make platform Magika-specific. |
| Future Pandoc/Tika/LibreOffice package reuse | PDP-Phase 1 through PDP-Phase 6 | Same package, catalog, registry, lifecycle, verification, rollback, and UI model; payload behavior remains out of scope. |

Dependency order:

1. Trust/package contract before install.
2. Install before downloader.
3. Downloader before auto-update.
4. Rollback/quarantine before marketplace-like UX.

## 10. Non-goals

- Conversion engine implementation.
- Pandoc conversion behavior.
- Tika extraction behavior.
- LibreOffice conversion behavior.
- ffprobe metadata behavior.
- `provider_file_ref` lifecycle.
- Third-party plugin ecosystem.
- Arbitrary user plugin scripts.
- User-provided marketplace URLs.
- Remote code execution hooks.
- Marketplace monetization or community ecosystem.
- Auto-update before rollback/quarantine semantics.
- Full TUF implementation in MVP.
- Full Sigstore implementation in MVP.

## 11. Recommended immediate next step

The immediate next step is PDP-Phase 1 planning:

1. First produce the concrete package, catalog, signing, lifecycle, and failure-state contracts.
2. Then define the smallest local/static verification path needed to prove the contract, without downloader or UI.

This keeps the platform trust-first and prevents a downloader or management UI from existing before authenticity, integrity, rollback, and quarantine semantics are reviewable.

Magika should be the first pilot plugin because the repo already has managed Magika lifecycle scaffolding and diagnostics. The pilot must still use generic fields: `pluginId`, `engineId`, `runtimeKind`, `pluginVersion`, `modelVersion`, compatibility matrix, inventory, and signatures. Future Pandoc, Tika, LibreOffice, and ffprobe packages should reuse the same platform contract without adding conversion-specific behavior to this roadmap.

## 12. Claim-safety and stop rules

Claim-safety rules:

- Do not claim plugin distribution is implemented.
- Do not claim downloader, installer, auto-update, marketplace, or remote official catalog is complete.
- Do not claim production signing is complete until offline signing, embedded public root, verification wiring, and revocation handling are implemented and tested.
- Do not claim conversion engines are implemented.
- Do not claim provider file lifecycle is implemented.
- Do not claim third-party plugin support exists.

Required tests before any downloader exists:

- Canonical manifest signing and verification.
- Catalog signature verification, invalid signature failure, expired catalog failure.
- Package signature verification and invalid signature failure.
- SHA-256 and size mismatch failure.
- Missing inventory entry failure.
- Relative path normalization and path traversal rejection.
- Controlled-root install planning.
- Registry transition tests for verify, install, enable, disable, uninstall, failed, and quarantined states.
- Failure message sanitization for paths, hashes, tokens, argv paths, and package URLs.
- Startup behavior when a plugin registry entry is failed, missing, disabled, revoked, or incompatible.
- Core file-identification fallback when plugin loading or health fails.

Global stop rules:

- Stop if a phase requires arbitrary scripts.
- Stop if a phase requires user-specified marketplace URLs.
- Stop if a phase allows unsigned production execution.
- Stop if a phase installs outside controlled roots.
- Stop if ordinary logs or UI expose raw absolute paths, hashes, tokens, or argv paths.
- Stop if catalog browsing can execute package code.
- Stop if plugin failure can block Starverse startup.
- Stop if plugin failure can break core file identification.
- Stop if work drifts into conversion payload behavior or `provider_file_ref`.

## Appendix A. Source evidence used

- `docs/file-pipeline/file-type-detection-implementation/56-post-v1-future-phase-roadmap.md`
- `docs/file-pipeline/file-type-detection-implementation/55-final-spec-coverage-audit.md`
- `docs/file-pipeline/file-type-detection-implementation/54-file-content-identification-v1-roadmap.md`
- `docs/file-pipeline/file-type-detection-implementation/45-phase5-batch2-trust-runtime-planning.md`
- `docs/file-pipeline/file-type-detection-implementation/46-phase5-p5d-trust-signing-closeout.md`
- `docs/file-pipeline/file-type-detection-implementation/47-phase5-p5e1-p5e2-runtime-package-scaffold-closeout.md`
- `docs/file-pipeline/file-type-detection-implementation/48-phase5-p5e3-first-runtime-pilot-closeout.md`
- `docs/file-pipeline/file-type-detection-implementation/49-phase5-p5e4-packaging-regression-smoke-closeout.md`
- `docs/file-pipeline/file-type-detection-implementation/51-phase6-user-level-magika-runtime-pilot-closeout.md`
- `docs/file-pipeline/file-type-detection-implementation/53-phase6-magika-lifecycle-integration.md`
- `docs/file-pipeline/progress-ledger.md`
- `docs/file-pipeline/format-conversion-preview-final.md`
- `src/next/file-type/externalEngineManifest.ts`
- `src/next/file-type/externalEngineRegistry.ts`
- `src/next/file-type/externalEngineAvailability.ts`
- `src/next/file-type/externalEngineHealth.ts`
- `src/next/file-type/magikaManagedPlugin.ts`
- `src/next/file-type/conversionRuntimePackage.ts`
- `infra/db/schema.sql`
- `infra/db/migrations/`
- `infra/db/repo/`
- `electron/ipc/`
- Existing plugin/runtime tests under `src/next/file-type/`
