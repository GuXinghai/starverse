# DFC-M52R0 Renderer Mount Timeout Watch Pollution Diagnosis

Date: 2026-06-23

## Scope

M52R0 diagnosed whether the M51 live renderer mount timeout was caused by Vite/Electron smoke scanning or watching generated/runtime directories. This round did not run `install_official_plugin`, did not download LibreOffice, did not use external `.svpkg` injection, and did not uninstall or reinstall any runtime.

## Generated Directory Scan

Repo-local generated/runtime directories present during the scan:

| Directory | Files | Directories | Size | Max depth |
| --- | ---: | ---: | ---: | ---: |
| `.external-runtime-work` | 252254 | 20459 | 19364.4 MB | 13 |
| `release` | 241 | 13 | 1564.53 MB | 3 |
| `out` | 370 | 7 | 14.16 MB | 2 |
| `dist-electron` | 6 | 3 | 13.43 MB | 1 |
| `dist` | 73 | 2 | 11.47 MB | 1 |

The largest risk was `.external-runtime-work`, a repo-local runtime preparation directory with approximately 19 GB and 252k files.

## Watch Configuration Diagnosis

Before M52R0:

- `vite.config.ts` ignored `.external-runtime-work` and `.artifacts/netlog`, but did not explicitly ignore `managed-runtimes`, `staging`, `sandbox`, `temp`, `.vite`, `dist`, `dist-electron`, `release`, or `out`.
- `scripts/smoke/vite.renderer-smoke.config.ts` ignored only `.artifacts/netlog`, so smoke-specific renderer runs could still watch `.external-runtime-work` and other generated output directories.

M52R0 added narrow generated/runtime watch ignores to both configs:

- `.external-runtime-work`;
- `.starverse-engines`;
- `managed-runtimes`;
- `staging`;
- `sandbox`;
- `temp`;
- `tmp`;
- `.vite`;
- `dist`;
- `dist-electron`;
- `release`;
- `out`.

No dependency discovery, acquisition, or package source behavior was changed.

## Renderer Mount Smoke

Command shape: installed-state-only live smoke, with `SV_M48_INSTALLED_STATE_ONLY=1`.

Sanitized result:

- app mode: `dev_electron_live_user_data`;
- external `.svpkg` path injection: not used;
- external runtime path injection: not used;
- install attempted: false;
- download attempted: false;
- initial runtime status class: `missing`;
- final runtime status class: `missing`;
- runtime diagnostic: `conversion_engine_missing`;
- operation states: none;
- status read started download: false;
- DOCX workflow: not run because installed-state-only mode stopped after runtime state;
- privacy: raw path leak detected false, sensitive evidence leak detected false.

The smoke reached sanitized installed-state evidence after the watch-ignore change. This closes the specific M51 renderer mount timeout.

## Classification

Final classification: `renderer_mount_fixed_by_watch_ignore`.

The renderer mount timeout was fixed by excluding repo-local generated/runtime output from Vite watcher scope, especially the smoke-specific renderer Vite config that previously did not ignore `.external-runtime-work`.

## Privacy And Artifact Evidence

Evidence recorded only directory labels, file counts, size classes, depth, runtime status class, symbolic diagnostics, and boolean operation states. No raw package path, runtime root, executable path, sandbox root, input/output path, command line, environment, storage ref, content token, full hash, DOCX body, PDF body, manifest body, or private key was recorded.

No LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, packaged output, or temp output was intentionally created or committed in this round.

## Remaining Work

LibreOffice remains missing in the live app-managed state on this machine. M52R0 did not attempt acquisition by design. The next round can rerun lightweight metadata/HEAD preflight and, only if the owner permits and the preconditions pass, consume the one controlled real streaming `install_official_plugin` retry.
