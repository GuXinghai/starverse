# DFC-M61 Real Install After Staging Observability Fix Evidence

Date: 2026-06-24

## Scope

M61 ran exactly one controlled real LibreOffice official install operation after the M60 staging/import observability fix. The run used the normal Plugin Management `install_official_plugin` path, Electron-net `system` route, M54 resumable streaming, and M60 async/yielding `.svpkg` staging/import.

This round did not use external `.svpkg` env vars, did not use external runtime path injection, did not uninstall/reinstall, did not use system LibreOffice, did not use PATH fallback, did not allow arbitrary URL input, and did not enable automatic/startup/background/postinstall/conversion-time download.

## Route And Runtime Preflight

| Field | Result |
| --- | --- |
| Selected route | `system` |
| Bounded route diagnostic | `proxy_probe_passed` |
| Metadata reachable | true |
| Asset found | true |
| HEAD/content length | passed / match |
| Redirect host | allowed |
| 1 KB Range | passed |
| Runtime initial state | `missing` |
| Existing runtime reused | false |
| External `.svpkg` injection | not used |
| External runtime path injection | not used |
| System LibreOffice / PATH fallback | not used |

Because the runtime was missing, M61 proceeded with the one allowed real install operation.

## One Real Install Operation

| Field | Result |
| --- | --- |
| Real install operations started | 1 |
| Fixed official descriptor | used |
| Download attempted | yes |
| Resumable downloader | used |
| Retry/resume observed | no retry or resume needed |
| Operation state sequence | `accepted -> pending -> downloading -> verifying -> staging -> registering -> health_checking -> installed` |
| Phase timeout classification | none |
| Terminal install diagnostic | none |

M61 verifies the M60 fix moved the real install past the prior M59 blocker. The operation remained observable after `staging` and reached `installed`.

## Staging, Activation, And Health Check

| Gate | Result |
| --- | --- |
| Download body transfer | completed |
| Size/hash verification | completed by install path; no mismatch surfaced |
| Staging/import | passed |
| Registering/activation | passed from operation state perspective |
| Health checking | reached |
| Operation terminal state | `installed` |
| Final runtime status class | `blocked` |
| Final runtime diagnostic | `owner_gate_not_production_approved` |

The install operation succeeded, but the installed runtime was not DFC-ready because the runtime/product gate reported `owner_gate_not_production_approved`.

## Plugin Management Status

Plugin Management was visible. Opening the panel and reading status did not start an install. The one package body transfer was the explicit M61 `install_official_plugin` operation.

Post-install status was not ready for DOCX-to-PDF:

| Field | Result |
| --- | --- |
| Status class | `blocked` |
| Plugin version | `0.1.0` |
| Package version | `0.1.0` |
| Runtime version | `26.2.4` |
| Production approved | false |
| Automatic download | disabled |
| Conversion-time download | disabled |
| Diagnostic | `owner_gate_not_production_approved` |

## Live DOCX-To-PDF Result

The smoke attempted the DOCX workflow after the install operation reached `installed`.

| DFC field | Result |
| --- | --- |
| DOCX workflow attempted | true |
| Result | blocked |
| Diagnostic | `conversion_engine_missing` |
| Target kind | not produced |
| DerivedAsset kind | not produced |
| Send strategy | not produced |
| SendAssetRef kind | not produced |
| PDF validation | not run |
| Metadata-only preview | not reached |

Live DOCX-to-PDF was not verified because the runtime remained blocked after install.

## No Silent Fallback

The missing/blocked runtime path did not silently fall back to DOCX markdown, original file, plain text, legacy selected send mode, system LibreOffice, or PATH fallback. The sanitized smoke result was `missing_runtime_no_download_no_fallback`.

## Privacy And Artifact Evidence

Evidence remained sanitized. The M61 evidence does not include raw URLs, signed redirect URLs, proxy credentials, raw paths, temp file paths, package paths, runtime roots, executable paths, sandbox roots, input/output paths, command lines, env values, storage refs, content tokens, full hashes, DOCX/PDF bodies, manifest bodies, or private keys.

No LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, packaged output, temp package output, proxy credential, or private key is intentionally tracked by this round.

## Final Classification

`real_install_passed_live_docx_failed`

The staging/import observability blocker is closed for the real install path. The next blocker is that the installed runtime remains blocked by `owner_gate_not_production_approved`, so the DFC DOCX-to-PDF route still reports missing/blocked conversion engine.

## Recommended Next Step

M62 should diagnose why the installed Windows x64 runtime reports `owner_gate_not_production_approved` after the M46 scoped production approval decision. Do not reinstall or redownload. Start from the installed runtime state and inspect the production gate inputs, package manifest approval fields, trust/catalog state, and DFC runtime availability mapping.
