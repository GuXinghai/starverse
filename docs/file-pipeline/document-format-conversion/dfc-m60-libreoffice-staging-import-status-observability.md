# DFC-M60 LibreOffice Staging/Import Status Observability Evidence

Date: 2026-06-24

## Scope

M60 diagnosed and hardened LibreOffice official install status observability after the M59 real Electron-net system-route install reached `staging` and then timed out while polling operation status.

This round did not start another real install operation, did not download the full LibreOffice package, did not click Retry, did not use external `.svpkg` env injection, did not use external runtime path injection, did not uninstall/reinstall, did not use system LibreOffice, and did not use PATH fallback.

## M59 State Sequence

M59 consumed exactly one real official install operation and observed:

| Field | Result |
| --- | --- |
| Selected route | `system` |
| Operation count | 1 |
| State sequence | `accepted -> pending -> downloading -> verifying -> staging` |
| Resume/retry before staging | not needed |
| Smoke terminal diagnostic | `install_operation_status_timeout` |
| Runtime follow-up | `missing` |
| Runtime diagnostic | `conversion_engine_missing` |
| Live DOCX-to-PDF | not reached |

The body-transfer blocker did not reproduce; the blocker moved to status liveness while staging/import was running.

## Staging/Import Architecture Map

The post-download path is:

1. Verified temp package produced by official downloader.
2. Package handed to `EnginePluginLifecycleService.executeOfficialLibreOfficeInstallOperation`.
3. Operation transitions through `verifying` and `staging`.
4. `importDfcLibreOfficeOfficialPackageFile` calls `importDfcLibreOfficeSvpkg` unless an injected test importer is present.
5. `importDfcLibreOfficeSvpkg` reads the `.svpkg` from disk and calls the archive importer.
6. Archive import verifies package size/hash, extracts zip-compatible entries, parses package/runtime manifests, verifies inventory, executable hash/size, platform/arch, capabilities, policy metadata, containment, and symlink/reparse safety.
7. Managed runtime package import copies the verified runtime into the app-managed root and activates it.
8. Operation transitions through `registering`, `health_checking`, then terminal `installed` or `failed`.

Status storage remains in the lifecycle service in-memory operation map. `enginePluginLifecycle.getInstallOperationStatus` is a lightweight status read, but it is served through the DB worker handler. If staging/import monopolizes the DB worker event loop, status reads can time out even though the operation state exists.

## Issue Identified

The default `.svpkg` archive extraction path previously used synchronous deflate work for each compressed zip entry. A large LibreOffice runtime package can therefore keep the worker event loop busy during staging/import and starve status polling.

M60 changed archive extraction so compressed entries use asynchronous zlib inflate and the extraction loop yields between entry batches. This preserves the existing validation and extraction rules while making long staging work less likely to block status polling.

## Simulated Long-Staging Status Result

Added a lifecycle regression test that:

1. Runs LibreOffice official install through the normal operation path.
2. Uses file-staged official download transport.
3. Enters `staging`.
4. Holds a simulated importer promise open.
5. Polls `getInstallOperationStatus` repeatedly.
6. Verifies every poll returns promptly with state `staging`.
7. Releases the importer and verifies terminal `installed`.

Result: passed.

Observed sanitized state sequence included `accepted`, `pending`, `downloading`, `verifying`, `staging`, `registering`, `health_checking`, and `installed`.

## DB Worker Liveness Analysis

No real DB-worker/full-package install was run in M60. The architecture analysis shows the status handler itself is lightweight, and the likely DB-worker liveness risk is event-loop starvation from heavy staging/import work, not status storage shape.

The synchronous zip-entry inflate section was removed. Remaining heavy work that may still be relevant for a real 500 MB package includes full-package disk read, package hash computation, inventory file hashing, runtime copy, and filesystem IO. These remain validation-required and were not weakened.

## Smoke Harness Timeout Behavior

The live smoke now treats status progress as meaningful. It records progress changes, keeps polling while the operation remains active, and reports phase-specific diagnostics:

| Phase | Timeout diagnostic |
| --- | --- |
| `staging` | `install_staging_timeout` |
| `registering` / `health_checking` | `install_activation_timeout` |
| other active state | `install_operation_timeout` |
| status channel exception | `install_operation_status_timeout` |

This prevents long but observable staging from being conflated with a broken status channel. It does not mask a real worker hang: status-channel exceptions still produce `install_operation_status_timeout`.

## Validation

| Check | Result |
| --- | --- |
| `npm run rebuild:node` | passed |
| `npx vitest --run infra/files/enginePluginLifecycleService.test.ts --reporter=dot --silent` | passed, 72 tests |
| `npx vitest --run infra/files/dfcLibreOfficeRuntimePackageArchive.test.ts --reporter=dot --silent` | passed, 9 tests, 1 skipped |
| `node --check scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs` | passed |
| `npx vue-tsc --noEmit --pretty false` | passed |
| `git diff --check` | passed with LF/CRLF warnings only |
| M60 evidence privacy scan | passed for the M60 evidence document |
| Git status package artifact scan | no `.svpkg`, MSI, official-download, managed-runtime, `.external-runtime-work`, or private-key output matched |

## Privacy And Artifact Evidence

New status evidence uses symbolic state names and diagnostics only. It does not expose package paths, temp paths, staging paths, runtime roots, executable paths, command lines, env, full hashes, manifest bodies, license bodies, DOCX/PDF bodies, storage refs, or content tokens.

No LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, packaged output, temp package output, or private key is intentionally tracked by this round.

## Final Classification

`staging_status_observability_fixed`

M60 fixed the known synchronous extraction starvation risk and added simulated long-staging observability coverage. A future real install is still required to prove the 500 MB package reaches activation and then live DOCX-to-PDF.

## Recommended M61

Run one controlled real install retry only with explicit Owner approval. The next round should verify whether the operation now progresses past `staging` into activation. If it still times out, collect sanitized phase-specific diagnostics to distinguish remaining extraction/import work from activation or health-check failure.
