# DFC-M48 LibreOffice Official Install Reliability Diagnosis

Date: 2026-06-23

## Scope

M48 diagnosed the M47 live installed-state blockers without repeatedly downloading the LibreOffice package. This round did not run a full package download by default, did not uninstall or reinstall LibreOffice, did not use external `.svpkg` env vars, did not inject an external runtime path, did not use system LibreOffice or PATH fallback, did not allow arbitrary URL input, and did not enable automatic/startup/background/postinstall/conversion-time download.

## Installed-State Recheck

| Check | Result |
| --- | --- |
| Live app mode | dev Electron, app-managed state |
| External `.svpkg` injection | not used |
| External runtime injection | not used |
| Runtime status class | `missing` |
| Existing runtime reused | no |
| Install attempted | no |
| Download attempted | no |
| Status read started download | no |
| Diagnostic | `conversion_engine_missing` |
| DOCX workflow | not run because this was installed-state-only |

The status-only live smoke confirmed the current app-managed LibreOffice runtime is still missing. The check exited before Plugin Management install, DOCX conversion, or any download path.

## GitHub Asset Metadata Diagnosis

The new lightweight metadata probe uses the fixed first-party LibreOffice catalog/source descriptor and does not accept arbitrary URLs. The default probe reads release metadata and performs HEAD checks only; range probing is opt-in and was skipped.

| Check | Result |
| --- | --- |
| Source kind | `github_release_asset` |
| Arbitrary URL input | not used |
| Release metadata reachable | yes |
| Expected release tag found | yes |
| Expected asset found | yes |
| Asset size metadata | `518907010` bytes |
| HEAD reachable | yes |
| Redirect handling | accepted allowed host |
| Content length | match |
| Range probe | skipped by default |
| Raw URL / full hash / response body printed | no |

This rules out the fixed catalog metadata, release tag, asset name, content length, and basic redirect policy as the immediate M47 cause.

## Operation Status Polling Diagnosis

Added a mocked long-running LibreOffice official install operation test. The test injects an in-memory operation in `downloading` state and repeatedly calls `getInstallOperationStatus` by operation id and by plugin/version.

| Check | Result |
| --- | --- |
| Mocked operation state | `downloading` |
| Repeated status polls | passed |
| Poll duration budget | under 100 ms for five polls |
| Operation history preserved | `accepted -> pending -> downloading` |
| Renderer-unsafe data in DTO | not observed |

The service-level status accessor is fast and non-blocking when operation state is already available in memory. This narrows the M47 timeout away from pure `getInstallOperationStatus` record lookup logic.

## DB Worker Liveness Analysis

The official install path is:

1. Plugin Management user action calls `install_official_plugin`.
2. Renderer IPC calls `enginePluginLifecycle.installOfficialPlugin`.
3. The DB worker handler forwards to `EnginePluginLifecycleService.installOfficialPlugin`.
4. LibreOffice branches to `installOfficialLibreOfficePlugin`.
5. The service creates an operation and starts `runOfficialLibreOfficeInstallOperation` asynchronously.
6. The async operation downloads via `downloadOfficialLibreOfficeRuntimePackage`.
7. The default transport performs `fetch(...)` and reads the full response with `arrayBuffer()`.
8. Import/activation runs only after package size/hash verification passes.

Status polling also goes through `enginePluginLifecycle.getInstallOperationStatus` on the DB worker. The service getter itself is not slow in a mocked long-running operation, but the full live M47 timeout can still be caused by DB-worker availability under live Electron conditions, long package transfer/body buffering, worker startup/load, or another DB worker request queueing behind acquisition work.

## Downloader / Operation Separation

| Area | Finding |
| --- | --- |
| Download orchestrator | lifecycle service path |
| Process location | DB worker service context |
| Full package body | read into memory by default transport |
| Operation state storage | in-memory service map |
| Status API | same DB worker IPC route |
| Risk | long acquisition can still starve or queue DB worker IPC in live app conditions |

No broad acquisition refactor was made in M48. The evidence supports a targeted M49 design: keep operation status readable outside long-running acquisition work, or move the package transfer/body buffering out of the DB worker path.

## Smoke Harness Cleanup

M47 already added bounded Electron process-tree cleanup after the `EPIPE` orphan. M48 reused the hardened harness and added an installed-state-only flag so missing-runtime checks can exit before install. The installed-state-only run exited cleanly and did not leave an Electron process behind.

| Scenario | Result |
| --- | --- |
| Success cleanup | covered by existing finally path |
| Timeout cleanup | bounded Electron close/taskkill fallback present |
| DB worker timeout cleanup | bounded Electron close/taskkill fallback present |
| Missing runtime status-only exit | passed |
| Parent pipe close orphan mitigation | harness cleanup hardened |

## Real Install Retry

No real full-package internal Download / Install retry was attempted in M48. Preconditions for an optional retry were not met because the live status timeout class remains unresolved and the current goal was diagnosis without repeated full-package download.

## Installed-State DOCX Workflow

Not reached. The installed-state recheck found runtime `missing`, and M48 did not perform a real install retry.

## Privacy Evidence

M48 evidence records only state classes, symbolic diagnostics, metadata reachability booleans, content-length match status, redirect allowlist classification, operation-state names, and pass/fail results. It does not print raw package URLs, package paths, runtime roots, executable paths, sandbox paths, command lines, env, storage refs, content tokens, DOCX/PDF bodies, response bodies, full hashes, or private keys.

## Final Classification

`unresolved_without_full_download`

Rationale: asset metadata and HEAD checks pass, current installed state remains missing, and service-level status polling is responsive for a mocked long-running operation. The remaining blocker requires a bounded diagnosis of live DB-worker acquisition behavior or a controlled one-time install after adding better operation-status liveness evidence. M48 intentionally did not perform another full LibreOffice package download.

## Next Step

Recommended M49: split official install operation status from long-running package acquisition in the live DB worker path, or add a non-blocking main-process/worker-side acquisition runner with path-free operation status snapshots. Then perform one controlled official install retry only after status polling remains observable throughout a simulated long download.
