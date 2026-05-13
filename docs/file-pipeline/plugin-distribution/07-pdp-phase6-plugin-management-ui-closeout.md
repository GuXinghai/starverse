# PDP-Phase 6 Closeout: Plugin Management UI

## Status

PDP-Phase 6 is implemented and closed out as a management UI and read-model integration phase.

Implemented files:

- `src/next/plugin-distribution/managementLabels.ts`
- `src/next/plugin-distribution/managementViewModel.ts`
- `src/next/plugin-distribution/managementActions.ts`
- `src/next/plugin-distribution/managementDetails.ts`
- `src/ui-app/components/PluginManagementPanel.vue`

The panel is wired into Settings through `src/ui-app/components/SettingsPanel.vue`.

## Implemented

### PDP6-A Management Read Model and Status Labels

- Added a safe management read model that combines official catalog metadata, registry/lifecycle records, verification status, install state, update eligibility state, rollback metadata state, quarantine state, health status, failure reasons, and sanitized diagnostics.
- Added user-facing status labels with reason codes and severity.
- Catalog-only metadata remains `metadata_compatible_future_install` and is not displayed as installed.
- Verified installed records display verified, installed, health, and enabled state only when registry state supports that view.
- Quarantined or revoked records display blocked/disabled state.
- Update state displays manual update eligibility, not auto-update.
- Rollback state displays previous known-good metadata, not full filesystem restore.

### PDP6-B Action Availability Contract

- Added an action availability model for:
  - View details.
  - Manual local package registration.
  - Enable.
  - Disable.
  - Uninstall metadata.
  - Verify package.
  - Check health.
  - Manual update eligibility.
  - Stage update contract.
  - Rollback metadata.
  - Quarantine acknowledgement.
- Enabled actions are limited to actions backed by existing Settings UI wiring and PDP contracts:
  - Enable.
  - Disable.
  - Uninstall metadata.
  - Check health.
- Disabled or future-only actions include reason codes:
  - Manual local package registration from this Settings panel.
  - Verify package from this Settings panel.
  - Manual update eligibility from this Settings panel.
  - Stage update contract from this Settings panel.
  - Rollback metadata from this Settings panel.
  - Quarantine acknowledgement from this Settings panel.
- No action triggers package execution, marketplace browsing, auto-update, remote fetch, user URL flow, downloader behavior, package unpacking, or arbitrary package execution.

### PDP6-C Minimal Settings UI

- Added `PluginManagementPanel.vue` and wired it into Settings.
- Displays:
  - Registered/installed official plugin records.
  - Read-only official catalog entries.
  - Verification state.
  - Install, update, quarantine, rollback, and health status.
  - Sanitized failure reasons.
  - Available actions and disabled reason codes.
- Uses existing `enginePluginLifecycleClient` methods only.
- Adds no broad IPC, preload API, DB schema migration, package dependency, or lockfile change.
- Does not expose raw paths, raw URLs, raw hashes, raw signatures, `contentToken`, or `fullHash`.

### PDP6-D Sanitized Diagnostics and Detail Model

- Added a sanitized detail model for:
  - Manifest identity.
  - Catalog identity.
  - Verification state.
  - Signature algorithm supported/unsupported status.
  - Health status.
  - Update, quarantine, and rollback state.
  - Sanitized failure reasons.
- Details omit raw absolute paths, raw URLs, raw hashes, raw signatures, raw argv, `contentToken`, and `fullHash`.
- Unsupported signature algorithms are shown as unsupported algorithm labels without exposing signature material.
- Quarantine and revocation are shown as trust/enablement state, not as a malware verdict.
- Rollback explicitly remains metadata-only with filesystem restore deferred.

### PDP6-E Closeout and Roadmap Sync

- Added this closeout.
- Updated `01-plugin-distribution-platform-roadmap.md` only for PDP-Phase 6 status synchronization.

## Enabled Actions

The Settings UI wires only the actions that are backed by existing lifecycle client/service methods:

- Enable.
- Disable.
- Uninstall metadata.
- Check health.

## Disabled or Future-Only Actions

The following actions are represented as disabled or future-only in the management model or Settings UI:

- Manual local package registration from the PDP6 Settings panel.
- Verify package from the PDP6 Settings panel.
- Manual update eligibility from the PDP6 Settings panel.
- Stage update contract from the PDP6 Settings panel.
- Rollback metadata from the PDP6 Settings panel.
- Quarantine acknowledgement from the PDP6 Settings panel.

These actions remain disabled where the current Settings UI does not have a safe, already-wired backing action.

## Claim-Safety Boundary

PDP-Phase 6 does not implement or claim:

- Marketplace UI.
- Auto-update scheduler.
- Background updater.
- Third-party plugin ecosystem.
- User-provided marketplace URLs.
- `provider_file_ref`.
- Conversion engine.
- Plugin runtime execution.
- Arbitrary package execution.
- New downloader or network behavior.
- Package unpacking.
- Durable filesystem install/delete implementation beyond existing metadata lifecycle behavior.
- DB migration.
- Package dependency or lockfile change.

The UI uses precise wording such as official plugin, read-only catalog metadata, verified by supported policy, manual update eligibility, previous known-good metadata, quarantined/disabled, and extraction deferred where only contracts exist.

## Privacy and Diagnostics Boundary

The PDP6 UI/read models do not expose:

- Raw absolute paths.
- Raw URLs.
- Raw hashes.
- Raw signatures.
- Raw argv.
- `contentToken`.
- `fullHash`.

Diagnostics and failure reasons pass through existing PDP sanitization helpers before display.

## Tests

Focused coverage was added for:

- `src/next/plugin-distribution/managementLabels.test.ts`
- `src/next/plugin-distribution/managementViewModel.test.ts`
- `src/next/plugin-distribution/managementActions.test.ts`
- `src/next/plugin-distribution/managementDetails.test.ts`
- `src/ui-app/components/PluginManagementPanel.test.ts`

The tests cover:

- Verified installed plugin status.
- Metadata-compatible catalog entries not displayed as installed.
- Unverified packages not displaying enabled actions.
- Quarantined plugins displayed as blocked/disabled.
- Manual update eligibility without auto-update wording.
- Rollback as previous known-good metadata, not filesystem restore.
- Action availability and disabled reason codes.
- Unsupported actions omitted or disabled.
- UI rendering of verified, disabled, and quarantined states.
- Unsafe-claim text absence.
- Raw path, URL, hash, signature, `contentToken`, and `fullHash` redaction.
- Unsupported signature algorithm detail display.
- Quarantine/revocation without malware verdict wording.

## Risk Review Summary

Mandatory `risk_reviewer` checks were run after each PDP6 package and before closeout work.

- PDP6-A initially found a P1 composite-key collision risk in the management read model. It was fixed with tuple-safe keys and re-reviewed clean.
- PDP6-B found no P0/P1 issues.
- PDP6-C found no P0/P1 issues.
- PDP6-D found no P0/P1 issues.

No unresolved P0/P1 findings remain at closeout draft time.

## Next Phase

No next PDP phase is started by this closeout. Later phases remain future-only and require separate acceptance before adding official channels, enterprise/offline bundle policy, transparency-log style verification, or any third-party plugin ecosystem.
