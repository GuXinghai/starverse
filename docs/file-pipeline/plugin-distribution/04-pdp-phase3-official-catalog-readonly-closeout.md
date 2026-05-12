# PDP-Phase 3 Closeout: Official Catalog Read-only

## Implemented in this phase
- Added local/static official catalog source validation in `src/next/plugin-distribution/catalogSource.ts`.
- Added read-only catalog metadata validation and DTO construction in `src/next/plugin-distribution/catalogReadModel.ts`.
- Added catalog compatibility filtering in `src/next/plugin-distribution/catalogCompatibility.ts`.
- Exported the PDP3 domain modules through `src/next/plugin-distribution/index.ts`.
- Added focused PDP3 tests for source policy, metadata-only validation, compatibility filtering, sanitization, and read-only DTO behavior.

## Trust behavior
- Catalog signature metadata shape can be required by policy and is validated with existing trust metadata contracts.
- Actual cryptographic catalog signature verification is still deferred.
- Catalog entries are informational until later downloader and installer phases.

## Deferred items
- Downloader implementation.
- Installer implementation.
- Marketplace UI and settings UI.
- Remote catalog fetch.
- Actual cryptographic catalog signature verification.
- Package unpacking, package execution, update, and enable flows.

## Scope confirmation
- Catalog browsing performs no plugin execution.
- No downloader, installer, marketplace UI, remote catalog fetch, or auto-update work was started.
- The next phase remains PDP-Phase 4: Downloader and Installer.
