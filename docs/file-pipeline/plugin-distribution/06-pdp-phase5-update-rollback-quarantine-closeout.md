# PDP-Phase 5 Closeout: Update / Rollback / Quarantine

## Status

PDP-Phase 5 contract layer is implemented and closed out as metadata and state contracts in `src/next/plugin-distribution/`.

Implemented contracts:

- Update eligibility and version policy in `updatePolicy.ts`.
- Staged update state model in `updateState.ts`.
- Rollback metadata contract in `rollbackPolicy.ts`.
- Quarantine and revocation response policy in `quarantinePolicy.ts`.

## Implemented

### PDP5-A Update Eligibility and Version Policy

- Models current installed plugin metadata versus update candidate metadata.
- Enforces monotonic semver-like version comparison.
- Blocks same-version updates and downgrade-as-update attempts.
- Handles stable, beta, and dev channel constraints explicitly.
- Rejects prerelease versions that claim a more stable channel than their version suffix.
- Requires verified candidate status and executable trust approval.
- Rejects candidates carrying trust, integrity, revocation, rollback, incompatibility, or unknown failure metadata.

### PDP5-B Staged Update State Model

- Models update operation states: `idle`, `checking`, `eligible`, `downloading`, `verifying`, `staged`, `ready_to_activate`, `activated`, `failed`, and `cancelled`.
- Keeps staged update metadata separate from the current active plugin.
- Preserves the current active plugin on staged, failed, and cancelled updates.
- Requires activation to use the persisted staged update metadata.
- Requires activated candidate records to be verified, installed, enabled, and matched to staged plugin/version/install refs.
- Rejects invalid transitions and unsafe staged refs.

### PDP5-C Rollback Metadata Contract

- Models previous known-good metadata references.
- Allows rollback only to a verified previous known-good record.
- Rejects rollback to revoked, unverified, incompatible, mismatched, missing, or unsafe-ref targets.
- Keeps rollback as a metadata/state contract.
- Does not perform arbitrary filesystem restore or delete.

### PDP5-D Quarantine and Revocation Response Policy

- Models quarantine reasons and revocation response policy.
- Disables affected revoked plugins.
- Marks revoked plugins with revoked verification status and quarantined install state.
- Blocks enable for quarantined or revoked records.
- Preserves sanitized evidence/diagnostics.
- Restricts cleanup targets to owned abstract refs only.
- Does not delete arbitrary filesystem paths.

### PDP5-E Closeout and Roadmap Sync

- Added this closeout.
- Updated the roadmap with PDP-Phase 5 completed status only.

## Intentionally Not Implemented

No auto-update scheduler, background updater, marketplace UI, settings UI, plugin execution, arbitrary package execution, package runtime execution, third-party plugin ecosystem, provider-file lifecycle, `provider_file_ref`, document conversion engine, DB migration, package dependency change, durable filesystem rollback, or arbitrary filesystem deletion was implemented.

## Tests

Focused Vitest coverage was added for:

- `src/next/plugin-distribution/updatePolicy.test.ts`
- `src/next/plugin-distribution/updateState.test.ts`
- `src/next/plugin-distribution/rollbackPolicy.test.ts`
- `src/next/plugin-distribution/quarantinePolicy.test.ts`

The focused tests cover:

- Newer compatible verified update eligibility.
- Same-version and lower-version update rejection.
- Incompatible platform/app update rejection.
- Unverified and untrusted candidate rejection.
- Explicit prerelease channel behavior and stable-channel bypass rejection.
- Staged update active-version preservation.
- Failed and cancelled update active-version preservation.
- Invalid update transition rejection.
- Activation gate verification and staged-ref immutability.
- Rollback to verified previous known-good metadata.
- Rollback rejection for revoked, incompatible, missing, and unsafe targets.
- Revoked package enable blocking and quarantine state.
- Sanitized quarantine and rollback diagnostics.
- Owned-ref-only cleanup targets.

## Risk Review Summary

Independent `risk_reviewer` checks were run after each PDP5 implementation package.

- PDP5-A initially found P1 issues for prerelease channel bypass and incomplete integrity-failure blocking. Both were fixed and re-reviewed clean.
- PDP5-B initially found P1 issues for activation without a verified candidate and staged-update override bypasses. Both were fixed and re-reviewed clean.
- PDP5-C found no P0/P1 issues.
- PDP5-D found no P0/P1 issues.

No unresolved P0/P1 findings remain at closeout.

## Next Phase

PDP-Phase 6 Plugin Management UI remains future. It must consume the already-defined PDP lifecycle, verification, update, rollback, and quarantine contracts without adding trust bypasses or third-party marketplace behavior.
