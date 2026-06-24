# DFC-M51 Controlled Real Streaming Install And Live Verification

Date: 2026-06-23

## Scope

M51 attempted to run the next controlled real LibreOffice official install retry after the M50 streaming acquisition change. The round did not start the full package body download because the required live installed-state and lightweight source preflight gates did not pass.

## Installed-State Preflight

Result: not reached.

The live dev Electron smoke launched and built the worker, renderer, main, and preload outputs, but the renderer did not mount the app within the smoke timeout. Sanitized failure evidence:

- app mode: `dev_electron_live_user_data`;
- page ready state: `complete`;
- app root present: yes;
- app root child count: 0;
- smoke helper registration: not reached;
- terminal diagnostic: renderer mount timeout;
- download attempted: no;
- install attempted: no.

Because the smoke did not reach the Plugin Management/runtime preflight helper, the current app-managed LibreOffice runtime state could not be confirmed in this run.

## Source Metadata Preflight

The lightweight metadata probe used the fixed first-party GitHub Release descriptor and did not download the package body.

Sanitized result:

- source kind: `github_release_asset`;
- arbitrary URL input: not used;
- release metadata reachable: true;
- expected tag found: true;
- expected asset found: true;
- size metadata: `bytes_518907010`;
- HEAD attempted: true;
- HEAD reachable: false;
- redirect: unknown;
- content length: unavailable;
- terminal diagnostic: `network_und_err_connect_timeout`;
- range probe: skipped by default;
- raw URL printed: false;
- full hash printed: false;
- response body printed: false.

Because HEAD did not complete and content length could not be verified, the M51 precondition `content length matches expected size` was not satisfied.

## Real Streaming Install Attempt

Attempted: no.

The single allowed real install retry was not consumed. Starting a 500 MB package download after live preflight failed and HEAD timed out would violate the controlled retry gate. No `install_official_plugin` body transfer was started in M51.

## Operation States

No real install operation state sequence was observed in M51 because install was not triggered.

## Streaming Acquisition Evidence

M50 streaming implementation remains the active acquisition path for LibreOffice official install:

- `downloadOfficialPackageToFile`;
- `fetchPackageToFileWithFetch`;
- chunked temp-file write;
- streaming sha256;
- size/hash verification before import;
- partial/temp cleanup on failure.

M51 did not exercise the real package body stream because preflight failed before download.

## Size And Hash Verification

Not reached for a real downloaded package.

Catalog metadata remained consistent at the release metadata layer. Actual package body size/hash verification did not run because no package body was downloaded.

## Activation Result

Not reached. No package was staged or activated.

## Plugin Management Status

Not reached in the live app because renderer mount timed out before Plugin Management could be opened. No UI state was captured, and no raw path or sensitive UI state was exposed.

## Live DOCX-To-PDF Result

Not reached. The runtime was not confirmed ready, no real install ran, and the DOCX workflow did not execute.

## No-Silent-Fallback Evidence

Not reached in the live DOCX workflow. Since no DOCX conversion was attempted, no markdown/original/plain-text/system/PATH fallback path was exercised.

## Privacy Evidence

Evidence is sanitized:

- no raw package path;
- no temp file path;
- no runtime root;
- no executable path;
- no sandbox root;
- no input/output path;
- no command line;
- no environment dump;
- no content token;
- no storage ref;
- no full hash;
- no DOCX/PDF body;
- no manifest body;
- no private key.

The metadata probe emitted only source class, booleans, size class, and symbolic diagnostics.

## Final Classification

`streaming_install_failed_network`

This classification is scoped to the M51 lightweight source preflight: release metadata was reachable, but HEAD failed with `network_und_err_connect_timeout`, so the full streaming install retry was not started.

## Next Step

Recommended M52:

1. Fix or isolate the live renderer mount timeout so installed-state preflight can reach Plugin Management.
2. Repeat lightweight source metadata/HEAD preflight.
3. If live preflight reaches runtime status and HEAD/content length match, perform exactly one controlled real `install_official_plugin` streaming install attempt.

Do not use external `.svpkg` env vars, external runtime injection, uninstall/reinstall, system LibreOffice, PATH fallback, arbitrary URL input, automatic/startup/background/postinstall/conversion-time download, macOS/Linux approval, unsupported Office/PDF/image/audio formats, or repeated downloads.
