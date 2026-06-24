# DFC-M52 LibreOffice GitHub HEAD Preflight After Renderer Fix

Date: 2026-06-23

## Scope

M52 reran only the lightweight GitHub Release metadata and HEAD preflight after M52R0 fixed the live renderer mount timeout with Vite/smoke watch ignores. This round did not run `install_official_plugin`, did not download the full LibreOffice package, did not use external `.svpkg` injection, and did not consume the one real streaming install retry.

## Renderer Mount Status

Installed-state-only live smoke was rerun with `SV_M48_INSTALLED_STATE_ONLY=1`.

Sanitized result:

- app mode: `dev_electron_live_user_data`;
- renderer mount/status evidence reached: yes;
- external `.svpkg` path injection: not used;
- external runtime path injection: not used;
- install attempted: false;
- download attempted: false;
- operation states: none;
- privacy raw path leak detected: false;
- privacy sensitive evidence leak detected: false.

The M51 renderer mount timeout did not regress after the M52R0 watch-ignore fix.

## Installed-State Runtime Status

Sanitized runtime status:

- initial status class: `missing`;
- final status class: `missing`;
- reused existing runtime: false;
- diagnostic code: `conversion_engine_missing`;
- automatic download enabled: false;
- conversion-time download enabled: false;
- source kind: `missing_manifest`;
- package version: `0.0.0`;
- runtime version: unavailable.

Because the runtime is still missing, M53 cannot proceed directly to live DOCX-to-PDF verification without either a successful future install or an already-installed app-managed runtime.

## Metadata And HEAD Preflight

The lightweight preflight used the fixed first-party GitHub Release asset descriptor. It did not use arbitrary URL input and did not download the package body.

Sanitized result:

- source kind: `github_release_asset`;
- release metadata reachable: true;
- expected tag found: true;
- expected asset found: true;
- asset size metadata: `bytes_518907010`;
- HEAD attempted: true;
- HEAD reachable: false;
- redirect: unknown;
- content length: unavailable;
- terminal diagnostic: `network_econnreset`;
- range probe: skipped by default;
- raw URL printed: false;
- full hash printed: false;
- response body printed: false.

Release metadata is currently reachable, but HEAD/content-length verification still does not pass because the HEAD request ends with a network reset.

## No-Download Proof

- `install_official_plugin` was not called.
- No operation state entered `accepted`, `pending`, `downloading`, `verifying`, `staging`, `registering`, `health_checking`, or `installed`.
- The live installed-state smoke reported `downloadAttempted=false`.
- The metadata preflight performed release metadata and HEAD only.
- Range probe remained skipped.
- No full package body transfer was attempted.
- Recent temp `.svpkg` count for the run window: 0.
- The one controlled real streaming install retry remains unconsumed.

## Classification

Final classification: `head_preflight_failed_network`.

The renderer mount issue is fixed, and GitHub release metadata resolves, but the current environment still cannot complete HEAD/content-length verification for the official LibreOffice package asset. The next round should not consume the one real full install retry until HEAD/content-length passes or Owner explicitly accepts retrying despite this network preflight failure.

## Privacy And Artifact Evidence

Evidence recorded only state classes, booleans, symbolic diagnostics, and size class metadata. No raw package path, runtime root, executable path, sandbox root, input/output path, command line, environment, storage ref, content token, raw URL, full hash, response body, DOCX body, PDF body, manifest body, or private key was recorded.

No LibreOffice binary, MSI, `.svpkg`, extracted runtime, staging output, sandbox output, packaged output, or temp output was intentionally created or committed in this round.
