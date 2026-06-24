# DFC-M59 Electron-Net System Real Install and Live DOCX Evidence

Date: 2026-06-24

## Scope

M59 used the M58-selected Electron-net `system` route for LibreOffice official package acquisition. The round kept the Windows x64 DOCX-to-PDF scope unchanged: fixed first-party GitHub Release asset descriptor only, Plugin Management `install_official_plugin` only, no external `.svpkg` injection, no external runtime root injection, no system LibreOffice, no PATH fallback, no arbitrary URL, and no automatic/startup/background/postinstall/conversion-time download.

## Route Preflight

The first M59 live run stopped before install because the Electron-net bounded diagnostic returned `system_proxy_probe_failed`. No install operation was started in that run.

A diagnostic-only M58-style rerun immediately after that used the same Electron-net system probe and passed:

| Field | Result |
| --- | --- |
| Manual route | `manual_proxy_missing` |
| System route | `system_proxy_probe_passed` |
| Metadata reachable | true |
| Asset found | true |
| HEAD | passed |
| Content length | match |
| Redirect host | allowed |
| 1 KB Range | passed |
| Diagnostic | `proxy_probe_passed` |
| Selected M59 route | `system` |

## One Real Install Attempt

After the bounded system route passed again, M59 ran exactly one real `install_official_plugin` operation through the normal Plugin Management lifecycle path.

| Evidence | Result |
| --- | --- |
| External `.svpkg` env injection | not used |
| External runtime path injection | not used |
| System LibreOffice / PATH fallback | not used |
| Fixed official descriptor | used |
| Electron-net system route | selected |
| Real install operation count | 1 |
| Download attempted | yes |
| Resume/retry observed | no resume was needed before staging |
| Operation states | `accepted -> pending -> downloading -> verifying -> staging` |
| Terminal diagnostic | `install_operation_status_timeout` |

The package body download completed far enough for the operation to enter `verifying` and `staging`. The earlier large-body network blocker was not reproduced in this run. The blocker moved to status observability while the install/import/staging phase was running.

## Verification And Activation

The live smoke did not reach a terminal installed state. It timed out polling install operation status after `staging`, and a follow-up installed-state-only smoke reported the app-managed LibreOffice runtime as `missing`.

| Gate | Result |
| --- | --- |
| Package size verification | reached download completion path; final result not surfaced before timeout |
| Package hash verification | final result not surfaced before timeout |
| Staging | reached |
| Activation | not confirmed |
| Runtime ready | false |
| Runtime final state | `missing` |
| Production approved route usable | no, runtime missing |

Final classification: `system_install_failed_unknown`.

## Plugin Management Status

Plugin Management was visible during the live run. Status read and opening Plugin Management did not start download. The only package body transfer was the single explicit `install_official_plugin` operation.

The installed-state-only follow-up remained missing with diagnostic `conversion_engine_missing`; no second install was started.

## DOCX Workflow

Live DOCX-to-PDF was not reached because the runtime did not become ready.

| DFC field | Result |
| --- | --- |
| DOCX workflow | not run after install failure |
| Missing-runtime precheck | blocked |
| Missing-runtime diagnostic | `conversion_engine_missing` |
| Target kind | not produced |
| DerivedAsset kind | not produced |
| Send strategy | not produced |
| SendAssetRef kind | not produced |
| PDF validation | not run |
| Metadata-only preview | not reached |

The missing-runtime precheck confirmed no silent fallback and no download from DOCX option generation.

## Privacy And Artifact Evidence

Evidence remained sanitized. The smoke output did not include raw URLs, signed redirect URLs, proxy credentials, package paths, temp paths, runtime roots, executable paths, sandbox paths, input/output paths, command lines, env values, storage refs, content tokens, full hashes, DOCX/PDF bodies, manifest bodies, or private keys.

No `.svpkg`, MSI, runtime, staging, sandbox, packaged output, temp package output, or private key is intentionally tracked by this round.

## Remaining Blocker

M59 proves the Electron-net system route can complete the large package body transfer and reach staging. The remaining blocker is now install/import/staging status liveness or DB worker availability during the heavy staging phase, not initial GitHub body transfer.

Recommended next round: M60 should isolate LibreOffice `.svpkg` staging/import/extraction from DB worker status polling, or make operation status storage observable while staging/import is running. Do not start another real install operation until that staging/status observability problem is addressed or Owner explicitly authorizes a new attempt.
