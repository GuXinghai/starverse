# DFC-M47 Live Starverse Installed-State LibreOffice Verification

Date: 2026-06-23

## Scope

M47 launched Starverse in live dev Electron mode against the app-managed installed runtime state. The run did not provide external `.svpkg` env vars, did not pass an external runtime path, did not seed a fake runtime, did not uninstall or reinstall LibreOffice, and did not use system LibreOffice or PATH fallback.

The smoke uses the existing app DFC attachment path through a small DOCX fixture and the existing Plugin Management lifecycle APIs. The smoke does not print raw package paths, runtime roots, executable paths, sandbox paths, storage refs, content tokens, command lines, env, DOCX body, PDF body, manifest body, or full hashes.

## Installed-State Preflight

| Check | Result |
| --- | --- |
| App mode | dev Electron, live app-managed userData |
| External `.svpkg` env injection | not used |
| External runtime path injection | not used |
| Runtime initial status class | missing |
| Existing runtime reused | no |
| One-time install fallback used | yes |
| Download attempts | one |
| Operation states | `accepted -> pending -> downloading -> failed` |
| Terminal diagnostic | `fetch_failed` |

The runtime was not already installed and ready in the live Starverse app-managed state. Per the M47 rule, the smoke made exactly one official install attempt through the normal Plugin Management `install_official_plugin` path, then stopped after the fetch failure. It did not retry.

## Network Reset Rerun

Owner reset the network and authorized one more internal install retry. The rerun preserved the same live-state rules: no external `.svpkg` env vars, no external runtime path injection, no uninstall/reinstall, no system LibreOffice, no PATH fallback, no arbitrary URL, and no automatic/startup/background/postinstall/conversion-time download.

| Check | Result |
| --- | --- |
| Existing ready runtime reused | no ready runtime confirmed |
| External `.svpkg` env injection | not used |
| External runtime path injection | not used |
| One-time internal install retry | attempted through `install_official_plugin` path |
| Repeated download | no |
| Operation states | operation status polling timed out before a returned phase list |
| Terminal diagnostic | `install_operation_status_timeout` / `enginePluginLifecycle.getInstallOperationStatus` DB worker timeout |
| DOCX-to-PDF after install | not reached |
| PDF validation | not reached |
| No-silent-fallback result | no fallback evidence produced before the status timeout |

The rerun first hit a renderer mount timeout before any runtime preflight or install attempt. A second diagnostic launch mounted the app and reached the live Plugin Management/operation-status path, then failed while polling `enginePluginLifecycle.getInstallOperationStatus`. In the smoke harness control flow, that unguarded operation-status poll is reached only after the missing-runtime branch starts the official install operation, so the authorized retry budget is treated as consumed. The run stopped there and did not start another download.

The owner-reported `EPIPE: broken pipe, write` dialog came from an orphaned dev Electron process writing console output after the interrupted smoke parent closed its pipe. The orphaned Electron process was terminated. The smoke harness was hardened so Electron close now has a bounded task-tree cleanup fallback, and install-operation polling timeouts are converted into sanitized evidence diagnostics instead of losing the result to an uncaught stack.

## Plugin Management Evidence

| Check | Result |
| --- | --- |
| Starverse live launch | passed |
| Plugin Management visible | passed |
| LibreOffice Office PDF entry visible | passed |
| Status read started download | no |
| Opening Plugin Management started download | no |
| Recheck runtime | skipped because runtime was missing |
| Ready production wording | blocked by missing runtime / failed install |
| Sensitive UI text scan | passed |

The live UI could be opened and the LibreOffice entry was visible. Because the runtime was missing and the single install attempt failed before activation, the run could not verify the ready-state production wording for an installed Windows x64 package.

## DOCX Workflow Evidence

| Check | Result |
| --- | --- |
| DOCX fixture uploaded through app DFC path | attempted |
| `pdf_attachment` ready | blocked |
| Diagnostic | `conversion_engine_missing` |
| Download triggered by DOCX option/conversion attempt | no |
| Ready `converted_pdf` DerivedAsset | no |
| Send strategy | not reached |
| SendAssetRef kind | not reached |
| PDF validation | not reached |
| Metadata-only PDF preview | not reached |
| Silent fallback | not observed |

The missing-runtime DOCX attempt stayed blocked and did not trigger an automatic download. No ready converted PDF option was produced, and there was no silent fallback to markdown, original file, plain text, legacy selected-send mode, system LibreOffice, or PATH output.

## Negative-State Evidence

Destructive negative checks were skipped. The run did not disable, clear, quarantine, uninstall, or reinstall the runtime because the live state was missing and any destructive check would not add installed-state confidence.

Non-destructive negative coverage from this run:

- Missing runtime did not auto-download during status read.
- Missing runtime did not auto-download when Plugin Management opened.
- Missing runtime did not auto-download during DOCX option/conversion attempt.
- Missing runtime did not produce ready `converted_pdf`.
- Missing runtime did not fall back to system/PATH LibreOffice.

## Privacy Evidence

The M47 smoke evidence is sanitized. The evidence records only status classes, operation state names, symbolic diagnostics, production/download booleans, DFC semantic fields, and pass/fail results.

After the first blocked run, the failure diagnostics were hardened so renderer console text is redacted by default and only type/length is retained unless a developer explicitly opts in. UUIDs and full SHA-256 values are also redacted by the harness sanitizer.

## Validation

| Command | Result |
| --- | --- |
| `npm run rebuild:node` | passed |
| `npx vue-tsc --noEmit --pretty false` | passed |
| `node --check scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs` | passed |
| `node --check scripts/dfc/libreoffice-svpkg-preflight.mjs` | passed |
| `node --check scripts/dfc/office-pdf-libreoffice-packaged-electron-smoke.mjs` | passed |
| `npm run rebuild:electron` | passed |
| `npm run test:office-pdf-libreoffice-live-installed-state-smoke` | blocked by one official install `fetch_failed` |
| Network-reset rerun of `npm run test:office-pdf-libreoffice-live-installed-state-smoke` | blocked by `install_operation_status_timeout` while polling official install operation status |
| Final `npm run rebuild:node` after Electron validation | passed |
| `git diff --check` | passed with LF/CRLF warnings only |
| Privacy scan over updated M47 evidence and harness diff | passed |
| Runtime/package artifact status scan | no committed LibreOffice binary/MSI/`.svpkg`/runtime/staging/sandbox/packaged output found |

The original live app launch reached Plugin Management/DFC checks. The network-reset rerun reached a mounted app in diagnostic mode but did not complete installed-state verification because the official install operation status read timed out. The production DOCX-to-PDF success path remains blocked in this live installed-state run because no installed LibreOffice runtime was confirmed ready and no successful official install activation completed.

## Remaining Issues

- Live app-managed LibreOffice runtime is missing on this machine.
- The single allowed official install fallback failed with `fetch_failed`.
- The network-reset rerun consumed the authorized internal install retry and then failed while polling operation status with `install_operation_status_timeout`.
- Ready installed-state Plugin Management wording and DOCX-to-PDF conversion could not be verified in M47.
- M46/M47 keep Windows x64 scoped production approval in code, but live installed-state usability remains blocked until the runtime is actually installed in the app-managed root.
- macOS/Linux packages remain deferred, not rejected.

## Next Step

Recommended M48: diagnose official install reliability without repeated full-package retries, including the `fetch_failed` download failure and the `enginePluginLifecycle.getInstallOperationStatus` DB worker timeout seen after the network reset. Rerun M47 only after a live app-managed runtime exists or one successful user-initiated install completes. Keep the scope Windows x64 DOCX-to-PDF only, with no automatic download, no external `.svpkg` injection, no system/PATH fallback, and no unsupported format expansion.
