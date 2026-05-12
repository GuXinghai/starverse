# PDP-Phase 1 Closeout: Trust-first Package and Catalog Contract

## Status

PDP-Phase 1 is implemented as a pure contract and validation layer in `src/next/plugin-distribution/`.

Implemented contracts:

- Package manifest schema, runtime kind, capability, platform, architecture, compatibility, license, attribution, and inventory-reference types.
- Artifact inventory schema with artifact class taxonomy, SHA-256 and size validation, duplicate artifact detection, required runtime artifact coverage, and package-relative path safety.
- Official-only catalog metadata with a stable-only channel field, target hash/size/signature references, compatibility metadata, and expiry validation.
- Minimal TUF-inspired root and targets metadata, reserved snapshot/timestamp/delegated roles, package signature metadata shape, offline Starverse signing metadata shape, verification/install/health/lifecycle state taxonomies, and failure reason taxonomy.

## Intentionally Not Implemented

No downloader, installer, marketplace UI, auto-update, plugin execution, package unpacking, conversion engine, provider-file lifecycle, third-party catalog, user catalog URL, settings UI, or DB schema migration was implemented.

Signature metadata is modeled for validation, but cryptographic package verification is not executed by this phase.

## Tests

Focused Vitest coverage was added for:

- Minimal manifest acceptance.
- Windows/POSIX/UNC/NUL/traversal/empty path rejection.
- User script and network execution hook rejection.
- Duplicate artifact id and path rejection.
- SHA-256 and size validation.
- Runtime license and attribution artifact coverage.
- Official-only catalog source validation.
- Catalog hash/size requirements and expiry.
- Reserved TUF role enforcement.
- Version rollback detection.

## Next Phase

The next PDP phase can consume these contracts to design controlled package acquisition or registry persistence. It must still keep downloader, installer, marketplace, auto-update, third-party catalog, and execution behavior behind explicit later-phase acceptance gates.
