# DFC-M29 Production Managed LibreOffice Package / Install / Update Policy

Date: 2026-06-03
Branch: `docs/dfc-0-format-conversion-foundation`
Baseline: `80e3616`

## Outcome

M29 defines the production packaging, install, update, revocation, offline import,
packaged smoke, and user-visible enablement policy for the DOCX-first
LibreOffice Office-to-PDF runtime.

This is a policy checkpoint only. It does not download another artifact, run
`soffice`, implement `.doc` / `.rtf` / `.docm`, or declare production
Office-to-PDF support.

## Current facts

- M22 selected DOCX-first Office-to-PDF through LibreOffice headless as a
  Starverse managed external engine package.
- M23 added the LibreOffice managed runtime gate and package scaffold.
- M24 added the DOCX-to-PDF adapter skeleton and fake process strategy.
- M25 aligned the LibreOffice runtime gate with the Starverse managed
  plugin/runtime pattern.
- M26 wired fake-process DOCX-to-PDF DFC generation.
- M27 hardened fake-process failure, timeout, output validation, preview/send,
  metadata redaction, and no-fallback behavior.
- M28 proved a dev managed LibreOffice artifact can be prepared and real
  `soffice` can convert DOCX to PDF through the adapter and DFC seam.
- M28 observed LibreOffice version `25.8.7` from the official Document
  Foundation MSI.
- Office-to-PDF remains owner-gated and not production support.

## Production runtime source policy

Production Office-to-PDF must use only a Starverse managed LibreOffice runtime
package. The runtime gate must continue to reject every other source.

Allowed production sources:

- Starverse bundled managed package, if Owner approves base app size impact.
- Starverse installed managed package under the app-managed runtime root.
- Offline imported Starverse managed package, only after manifest, hash,
  provenance, license, platform, and realpath containment checks pass.

Disallowed production sources:

- system LibreOffice discovery
- `PATH` lookup
- `C:\Program Files\LibreOffice` fallback
- user-selected arbitrary `soffice` executable path
- renderer-provided executable path
- postinstall auto-download as the default behavior
- implicit runtime auto-download during conversion
- dev `.external-runtime-work` artifact as a production package

A future explicit repair or install action may download a package only after
separate Owner approval for UX, network policy, provenance verification,
rollback, offline behavior, and diagnostics. It must not be hidden behind
conversion execution.

## Production artifact contract

A production LibreOffice runtime package manifest must include at least:

- `manifestSchemaVersion`
- `pluginId: libreoffice`
- `engineId: libreoffice`
- `runtimeId: libreoffice-office-pdf`
- `packageId` and `runtimePackageId: starverse.dfc.libreoffice`
- `displayName`
- `pluginVersion`
- `runtimeKind: managed_external_process`
- `platform` and optional `arch`
- executable relative path, for example `program/soffice.exe`
- LibreOffice version
- Starverse package version
- source/provenance URL
- official release metadata, including package reference and release tag when
  available
- artifact SHA-256
- executable SHA-256
- package size and executable size
- license id, notices, attribution, and third-party notice references
- capabilities `office_to_pdf` and `docx_to_pdf`
- minimum Starverse runtime contract version
- minimum supported Starverse app version
- platform support matrix entry
- security policy metadata requiring macros disabled, network disabled,
  external links disabled, embedded object execution disabled, and isolated
  profile required
- update policy metadata, including `createdAt`, optional `expiresAt`, optional
  `revokedAt`, and package channel

Hash and size metadata must describe the exact package and executable that were
validated. The executable path must remain relative to the package root. Absolute
paths, UNC paths, drive-qualified paths, traversal, NUL bytes, and symlink
escapes remain invalid.

## Storage layout

Production storage should separate staging, active runtime packages, quarantine,
and cache cleanup.

Recommended roots:

- managed package root: app-managed runtime storage, for example
  `managed-runtimes/dfc-office-pdf/libreoffice-office-pdf/<packageVersion>`
- active pointer: an app-owned metadata record or atomic directory marker that
  points to the validated active package
- temp download root: app-managed temporary package download directory
- staging root: app-managed extraction and validation directory
- quarantine root: app-managed rejected/revoked package directory, or deletion
  if quarantine is not retained

The runtime gate should receive only the resolved active managed runtime root.
It should not scan arbitrary user directories.

## Install and import flow

Production install/import should be an explicit operation, not a side effect of
conversion.

Required flow:

1. Acquire package from an approved Starverse source or explicit offline import.
2. Store the artifact in a temp download or import staging directory.
3. Verify package size and artifact SHA-256 before extraction.
4. Extract into a staging directory controlled by Starverse.
5. Parse manifest before activation.
6. Validate required identity, version, platform, capabilities, license,
   provenance, notices, security policy, executable relative path, executable
   size, executable hash, and minimum contract version.
7. Resolve package root and executable realpaths and prove containment under the
   managed runtime root.
8. Reject symlinks or reparse points that escape the package root.
9. Optionally run a package health check only in a controlled sandbox and only
   after Owner approves packaged smoke.
10. Atomically activate the package by moving staging into the managed runtime
    root or updating the active pointer.
11. Roll back to the previous known-good package if activation fails.
12. Clean temp and stale staging directories.

Activation must fail closed for incomplete installs, invalid hashes, unsupported
platforms, revoked packages, path escapes, missing executables, metadata gaps,
and failed health checks.

## Discovery flow

DFC Office-to-PDF discovery remains manifest-first.

- The app selects the active Starverse managed package root.
- The M23/M25 runtime gate validates `manifest.json` and executable metadata.
- The M24/M26 adapter receives only the managed executable descriptor from that
  gate.
- The adapter must not perform system discovery, PATH lookup, registry probing,
  or common-install-location probing.
- Renderer DTOs and diagnostics must not expose absolute package paths,
  manifest bodies, license bodies, command lines, env, storage refs, full hashes,
  DOCX body, or PDF body.

## Update policy

Starverse owns the update responsibility for production managed LibreOffice
packages.

Update rules:

- Update candidates must be version-pinned and manifest-pinned.
- Updates must pass the same artifact, manifest, executable, license,
  provenance, security policy, and realpath containment checks as first install.
- Updates should install into staging first and only then atomically replace the
  active package pointer.
- Previous known-good packages may be retained for rollback if not revoked.
- A revoked package must not be a rollback target.
- Offline environments update by importing a new approved managed package.
- If an update is available but not mandatory, existing valid packages can
  remain active until their `expiresAt` or revocation policy requires action.
- If a package is expired, revoked, or policy-blocked, DOCX PDF candidates must
  become unavailable/blocked and generate no ready DerivedAsset.

Security update cadence should follow LibreOffice security release severity:
critical fixes should trigger a package revocation or mandatory update notice;
normal fixes can use the regular managed package update channel.

## Revocation policy

Revocation must be expressible through managed package metadata or trusted
catalog state.

Required revocation behavior:

- Mark package verification as revoked or policy-blocked.
- Disable conversion for that package immediately after the next policy refresh
  or local validation pass.
- Do not launch `soffice` from a revoked package.
- Do not keep a ready Office PDF candidate solely because the previous package
  was once valid.
- Do not route selected DFC-managed PDF options to legacy file handling.
- Surface only symbolic diagnostics such as `office_pdf_runtime_revoked` or the
  existing unavailable/disabled diagnostic family after implementation.
- Retain or clean the revoked package according to the package lifecycle policy,
  but never expose package paths or manifest bodies to renderer diagnostics.

M29 does not implement a new revocation diagnostic. M30 should decide whether to
add `office_pdf_runtime_revoked`, `office_pdf_runtime_expired`, and
`office_pdf_runtime_install_incomplete` as first-class gate diagnostics.

## Offline install policy

Offline install is allowed only as an explicit managed package import.

Offline import requirements:

- Owner/admin provides an approved package artifact.
- The package includes or is accompanied by manifest, hash, provenance, license,
  notices, and platform metadata.
- Import validation performs the same hash, metadata, platform, path, symlink,
  executable, and capability checks as online install.
- No system LibreOffice fallback is allowed if offline import is missing or
  invalid.
- Missing offline package keeps DOCX `pdf_attachment` unavailable/blocked.

## Packaged smoke policy

Packaged smoke is required before user-visible production exposure.

Minimum packaged smoke:

- packaged app can discover the managed LibreOffice package
- manifest and executable hash validation pass
- DOCX fixture converts to PDF through managed `soffice`
- output remains under controlled sandbox output directory
- preview is metadata-only
- Send Plan uses selected refs plus verified DerivedAsset metadata
- failure path for missing or disabled runtime is observable and fail-closed
- no system LibreOffice or PATH fallback is used
- no `.doc`, `.rtf`, or `.docm` route is exposed

Packaged smoke should not use the M28 `.external-runtime-work` dev artifact as a
production substitute.

## User-visible enablement gate

DOCX-to-PDF can move from backend/dev pilot toward user-visible experimental
support only after all gates below pass:

- M28 dev managed runtime smoke passed.
- Production package policy is approved.
- Managed package install/import scaffold exists and validates package metadata.
- Packaged smoke passes with a production-like managed package location.
- Focused security review passes for process execution, profile isolation,
  macros, external links, embedded objects, network, path containment, output
  validation, diagnostics, and no-silent-fallback.
- User-visible diagnostics exist for missing, disabled, invalid, revoked,
  expired, unsupported-platform, install-incomplete, hash-mismatch, and
  conversion-failed states.
- Failure remains fail-closed with no ready DerivedAsset.
- Preview/send same-source behavior remains selected-ref and verified-DerivedAsset
  authoritative.
- `.doc`, `.rtf`, and `.docm` remain absent unless a separate owner decision
  approves those formats.

Before these gates, Office-to-PDF should remain dev/owner-gated. After these
gates, the recommended label is user-visible experimental support, not broad
production-ready support.

## DFC option behavior under package states

- Missing runtime: expose unavailable/blocked DOCX `pdf_attachment` candidate,
  no ready DerivedAsset.
- Disabled runtime: expose unavailable/blocked candidate, no ready DerivedAsset.
- Invalid manifest or metadata: expose unavailable/blocked candidate, no ready
  DerivedAsset.
- Unsupported platform: expose unavailable/blocked candidate, no ready
  DerivedAsset.
- Install incomplete: expose unavailable/blocked candidate, no ready
  DerivedAsset.
- Revoked or expired package: expose unavailable/blocked candidate, no ready
  DerivedAsset.
- Valid package but conversion failure/timeout/output-invalid: no ready
  DerivedAsset, no legacy fallback.
- Valid package and successful conversion: `derivedKind: converted_pdf`,
  `targetKind: pdf_attachment`, `sendStrategy: file_attachment`,
  `sendAssetRefs: derived_asset`, `usage: preview_and_send`, metadata-only
  preview, and Send Plan selected-ref authority.

DOCX `original_file` and DOCX `markdown` remain available and independent where
already supported. `.doc`, `.rtf`, and `.docm` remain unsupported.

## Non-goals

M29 does not:

- download a new LibreOffice artifact
- run `soffice`
- commit LibreOffice binaries or extracted runtime files
- implement an installer
- implement revocation code
- implement packaged smoke
- implement `.doc`, `.rtf`, or `.docm`
- declare production Office-to-PDF support
- change DB schema, renderer IPC, Send Plan main-flow, asset model, DFC
  vocabulary, or HTML-to-PDF behavior
- fix unrelated full-suite failures

## M30 recommendation

Recommended order:

1. M30-A Managed package import/install scaffold.
2. M30-B Packaged smoke confidence.
3. M30-C User-visible experimental enablement.

Do M30-A first. It provides the missing production package lifecycle boundary
without expanding formats or claiming production Office-to-PDF support.

## M30-A task package prompt

Task package: DFC-M30-A LibreOffice Managed Package Import/Install Scaffold

Goal: implement the production managed LibreOffice package import/install
scaffold for DOCX-first Office-to-PDF. The package should validate manifest,
hash, provenance, license, platform, executable relative path, executable hash,
realpath containment, symlink escape, incomplete install, and atomic activation
or rollback. Do not run `soffice`, do not implement packaged smoke, and do not
declare production Office-to-PDF support.

Scope:

- Reuse the Starverse managed plugin/runtime lifecycle patterns where possible.
- Define app-managed staging, active, temp, quarantine, and cleanup paths.
- Accept only Starverse managed package artifacts or explicit offline imports.
- Reject system LibreOffice, PATH fallback, user executable paths, renderer paths,
  traversal, UNC, drive escape, NUL, symlink escape, missing executable, invalid
  hash, incomplete metadata, revoked/expired package, and unsupported platform.
- Add targeted tests for install/import/rollback/cleanup diagnostics.
- Update DFC ledger/context with package lifecycle status.

Forbidden:

- no real LibreOffice execution
- no new Office formats
- no DB schema, renderer IPC, Send Plan main-flow, asset model, or DFC vocabulary
  change
- no packaged installer or CI
- no production support claim

Acceptance:

- `git diff --check`
- `npx vue-tsc --noEmit --pretty false`
- targeted tests for LibreOffice managed package install/import policy
- no full Vitest unless separately requested
