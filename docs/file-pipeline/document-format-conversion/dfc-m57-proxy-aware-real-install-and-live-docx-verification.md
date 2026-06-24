# DFC-M57 Proxy-Aware Real Install and Live DOCX Verification

Date: 2026-06-24

## Goal

Use the Starverse Network Proxy settings from M56 to run an app-path bounded LibreOffice official package diagnostic, then start exactly one proxy-aware `install_official_plugin` operation only if the diagnostic passes.

M57 did not start a real install operation because the app-path bounded diagnostic failed before package body transfer.

## Proxy Settings Preflight

Sanitized app-path preflight result:

- proxy mode: `environment`
- manual proxy configured: false
- environment proxy available to the Electron app path: false
- system mode selected: false
- runtime status class: `missing`
- initial diagnostic: `conversion_engine_missing`
- external `.svpkg` injection: not used
- external runtime path injection: not used

No proxy URL, proxy credential, environment proxy value, raw URL, package path, runtime root, executable path, command line, storage ref, content token, manifest body, DOCX body, PDF body, or full hash was recorded.

## Renderer Boundary Fix

The first app-path diagnostic attempt exposed a renderer mount failure before the network probe could run. The renderer failed with a sanitized `SyntaxError` because UI code imported the Node/undici-backed `networkProxy.ts` module, whose top-level `EnvHttpProxyAgent` import is not browser-bundle safe.

M57 added a narrow shared settings module:

- `src/next/plugin-distribution/networkProxyShared.ts`

Renderer-facing code now imports pure settings helpers from `networkProxyShared.ts`. Node downloader code continues to import `networkProxy.ts`, which keeps the undici-backed dispatcher logic.

This is a boundary fix only. It does not change official install policy, descriptor selection, automatic download behavior, runtime gate behavior, path-cap policy, trust policy, or DFC conversion behavior.

## Bounded App-Path Proxy Diagnostic

The bounded diagnostic ran through the live Electron app / DB worker path using the same lifecycle service probe used by Plugin Management:

- metadata reachable: true
- fixed official asset found: true
- HEAD passed: false
- content length: unavailable
- redirect host allowed: false
- 1 KB range passed: false
- terminal diagnostic: `metadata_reachable_head_failed`

Because the diagnostic failed, M57 did not run `install_official_plugin` and did not download the full LibreOffice package.

## Install Attempt

No real install operation was attempted in M57.

- operation states: none
- retry count: not applicable
- resume used: no
- package size verification: not reached
- package hash verification: not reached
- staging: not reached
- activation: not reached
- health check: not reached

This preserves the hard limit: no second install operation was started after diagnostic failure.

## Plugin Management Status

Plugin Management was opened in the live app path and showed the LibreOffice Office PDF entry. Opening Plugin Management and reading status did not start download.

Observed sanitized status:

- LibreOffice runtime state: missing
- automatic download: disabled
- conversion-time download: disabled
- source kind: `missing_manifest`
- package version: `0.0.0`
- runtime version: unavailable
- no sensitive UI text detected

The existing wording check did not fully pass in this run because the runtime remained missing and M57 stopped before install/ready-state verification.

## Live DOCX-to-PDF Result

Live DOCX-to-PDF was not reached because the runtime remained missing and the pre-install proxy diagnostic failed.

Expected blocked behavior remains:

- DOCX `pdf_attachment`: unavailable/blocked
- no ready `converted_pdf`
- no process launch
- no system LibreOffice fallback
- no PATH fallback
- no silent fallback to markdown/original/plain text unless the user explicitly chooses another option

## Privacy and Artifact Evidence

Sanitized evidence only was recorded:

- proxy mode
- boolean proxy configuration classes
- runtime status class
- diagnostic code
- bounded probe pass/fail fields
- no-install result

Not recorded:

- proxy credentials
- environment proxy values
- raw URLs
- raw paths
- temp file paths
- runtime roots
- executable paths
- sandbox paths
- input/output paths
- command lines
- storage refs
- content tokens
- full hashes
- DOCX/PDF bodies
- manifest bodies
- private keys

No LibreOffice `.svpkg`, MSI, extracted runtime, staging output, sandbox output, packaged output, or private signing key was committed by M57.

## Validation Status

Completed:

- `npm run rebuild:node`: passed
- `npm run rebuild:electron`: passed
- `node --check scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs`: passed
- `npx vue-tsc --noEmit --pretty false`: passed after the renderer/Node proxy module boundary fix
- `npx vitest --run src/next/plugin-distribution/networkProxy.test.ts src/next/plugin-distribution/packageDownloader.test.ts src/ui-app/components/PluginManagementPanel.test.ts --reporter=dot --silent`: passed, 58 tests
- app-path bounded proxy diagnostic: failed with `metadata_reachable_head_failed`
- `git diff --check`: passed with LF/CRLF warnings only
- privacy/artifact scan: no M57 evidence leak and no `.svpkg`, MSI, runtime, staging, sandbox, packaged output, or private signing key in the scoped status scan

Final ABI target after validation: node.

## Final Classification

`proxy_diagnostic_failed_no_install`

M57 established that the app can now mount and report the real proxy diagnostic state, but the selected `environment` proxy mode has no available environment proxy in the app path and the fixed LibreOffice GitHub asset HEAD/content-length probe fails before any package body transfer.

## Recommended M58

Configure a working proxy mode in Starverse before retrying install:

- set Manual proxy with a credential-free HTTP/HTTPS proxy URL, or
- provide environment proxy variables to the Electron app process, or
- implement an Electron-net-backed `system` proxy backend if Owner wants browser/system proxy parity without manual configuration.

After a bounded app-path diagnostic returns `proxy_probe_passed`, run exactly one Plugin Management `install_official_plugin` operation and verify live DOCX-to-PDF only if activation succeeds.
