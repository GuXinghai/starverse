# DFC-M49 LibreOffice Install Status Observability

Date: 2026-06-23

## Scope

M49 verified whether LibreOffice official install operation status remains observable while a long-running acquisition is in progress. This round did not perform a full LibreOffice package download, did not use external `.svpkg` env vars, did not inject an external runtime path, did not uninstall or reinstall, did not use system LibreOffice or PATH fallback, did not enable automatic/startup/background/postinstall/conversion-time download, did not approve macOS/Linux packages, and did not add unsupported formats.

## Operation Architecture Map

| Layer | Path | Role |
| --- | --- | --- |
| Plugin Management UI/action | `PluginManagementPanel` / `install_official_plugin` action | user-initiated install only |
| Renderer IPC client | `enginePluginLifecycleClient.installOfficialPlugin` | calls DB bridge |
| Main process DB bridge | `DbWorkerManager.call` | posts worker request, supports multiple pending calls |
| DB worker router | `attachWorkerPort` / `dispatchWorkerMessage` | starts each handler promise asynchronously |
| DB worker handler | `enginePluginLifecycle.installOfficialPlugin` | forwards to lifecycle service |
| Lifecycle service | `EnginePluginLifecycleService.installOfficialPlugin` | creates official install operation |
| LibreOffice branch | `installOfficialLibreOfficePlugin` | validates fixed catalog source and starts async operation |
| Acquisition | `downloadOfficialLibreOfficeRuntimePackage` | downloads fixed official GitHub asset through shared downloader |
| Package body transfer | default official package transport | `fetch(...)` then full `arrayBuffer()` body read |
| Operation state storage | lifecycle service in-memory map | stores state/history/diagnostics |
| Status polling | `enginePluginLifecycle.getInstallOperationStatus` | reads operation by id or plugin/version |
| Activation/import | `importDfcLibreOfficeOfficialPackageBytes` | runs only after download size/hash verification |

The package transfer still occurs in the lifecycle service path running in the DB worker context. The worker manager can hold multiple pending calls, and the worker router does not intentionally serialize messages behind one awaiting handler.

## Simulated Long-Download Status Result

M49 added two simulated liveness checks without downloading the package body.

| Check | Result |
| --- | --- |
| Service-level long operation | passed |
| Operation state | `downloading` |
| Operation history | `accepted -> pending -> downloading` |
| Five service status polls | under 100 ms |
| Handler/router pending install simulation | passed |
| Status call while install handler pending | returned promptly |
| Status route used | `enginePluginLifecycle.getInstallOperationStatus` |
| Renderer-unsafe data in status DTO | not observed |

The handler/router test proves the status handler can complete while another install handler promise is still pending. The service test proves the operation status map is observable and fast while an operation remains in `downloading`.

## DB Worker Liveness Analysis

The M47 live timeout is not reproduced by the simulated DB worker handler path. Under simulation:

- `DbWorkerManager.call` can track multiple pending calls.
- `attachWorkerPort` starts async handler promises without waiting for a prior message to finish.
- `getInstallOperationStatus` itself is synchronous service state lookup/reconciliation and returns quickly.
- Plugin Management polling tests already render backend install phases while polling.

Remaining live risk: the real package body transfer is still executed from the DB worker lifecycle service path and reads the full response body into memory. A full install may still stress the worker or runtime under real Electron/network conditions even though the handler/router and status service are non-blocking by design.

## Fix Implemented

No production acquisition/status fix was required by the simulated evidence. M49 added test instrumentation only:

- a service-level mocked long-running `downloading` status regression;
- a DB worker handler/router concurrency regression for install/status observability.

The existing M47/M48 smoke harness cleanup hardening remains in place.

## Timeout And Diagnostic Taxonomy

| Diagnostic | Meaning |
| --- | --- |
| `asset_metadata_unreachable` | release metadata cannot be reached |
| `network_transport_failed` | package transport failed before verified bytes |
| `download_body_transfer_timeout` | full body transfer exceeded transport/download timeout |
| `install_operation_status_timeout` | status channel/polling failed independently of download |
| `db_worker_unavailable` | DB worker bridge unavailable or queue timed out |
| `runtime_activation_failed` | package verified but import/activation failed |
| `download_cancelled` | user or harness cancellation |
| `cleanup_failed` | cleanup could not complete |

M49 preserves the distinction that `install_operation_status_timeout` is a status-channel failure, not a generic package download failure.

## Smoke Harness Cleanup Evidence

The M47/M48 live smoke harness includes bounded Electron close with process-tree cleanup fallback. M48 installed-state-only smoke exited cleanly with runtime `missing`, no install, no download, and no orphaned Electron process observed. M49 did not need another Electron run to prove the simulated status path and avoided a full package retry.

## Real Install Retry

No real full-package internal install retry was attempted in M49. Preconditions for an optional retry were partially satisfied by simulation and metadata checks, but this round kept the default no-full-download boundary and stopped after proving status observability under simulation.

## Installed-State DOCX Result

Not reached. The live app-managed runtime remains missing from M48, and M49 did not perform a real install retry.

## Privacy Evidence

M49 evidence records only layer names, state names, pass/fail outcomes, and symbolic diagnostics. It does not print raw runtime paths, package paths, executable paths, sandbox paths, command lines, env, storage refs, content tokens, DOCX/PDF bodies, manifest bodies, full hashes, response bodies, or private keys.

## Final Classification

`status_polling_already_non_blocking`

Rationale: simulated service-level and DB worker handler/router liveness tests both passed. The observed M47 live timeout remains a live-condition issue around full acquisition/body buffering or worker/runtime pressure, not an intrinsic status lookup or handler serialization defect.

## Next Step

Recommended M50: add a bounded simulated body-transfer runner closer to the real transport path, or move full package body transfer out of the DB worker lifecycle service before the next real full install retry. Only after that should one controlled official install retry be attempted.
