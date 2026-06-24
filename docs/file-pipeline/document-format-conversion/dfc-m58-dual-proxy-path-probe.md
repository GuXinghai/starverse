# DFC-M58 Dual Proxy Path Probe

Date: 2026-06-24

## Goal

Evaluate both proxy routes for LibreOffice Plugin Management official package downloads without running `install_official_plugin` and without downloading the full LibreOffice package.

M58 added a bounded Electron-net system proxy diagnostic path and reran the live app smoke in dual-proxy-probe mode. This round did not install LibreOffice, did not consume a real install retry, and did not use external `.svpkg` or runtime path injection.

## Implementation Summary

M58 keeps the existing M56/M57 manual/environment/direct Node downloader path intact:

- manual proxy continues to use the Node/undici `ProxyAgent` path;
- environment proxy continues to use the Node/undici environment proxy path;
- direct remains no proxy;
- system proxy now has a bounded Electron-net diagnostic route instead of returning only `proxy_system_unavailable`.

New bounded system-proxy route:

- main-process IPC: `network-proxy:probe-libreoffice-system`;
- preload method: `probeLibreOfficeSystemProxyDownloadNetwork`;
- renderer client uses this method only when `proxyMode` is `system`;
- the route uses Electron/Chromium `net.request`;
- the route probes only the fixed first-party LibreOffice official asset descriptor;
- the route performs HEAD/content-length and a 1 KB `Range: bytes=0-1023` probe;
- if the Range request is not `206`, it aborts instead of consuming a full response body.

This is not an install path and not a generic package URL feature.

## Manual Proxy Route Result

Manual route evidence:

| Field | Result |
| --- | --- |
| manual proxy configured | false |
| manual diagnostic attempted | false |
| metadata | not reached |
| HEAD/content-length | not reached |
| Range | not reached |
| classification | `manual_proxy_missing` |

No manual proxy URL was supplied through the M58 smoke env and no existing manual proxy setting was present. The smoke therefore did not attempt manual-proxy network requests.

Credential-bearing proxy URLs remain rejected by the settings/downloader policy and were not used.

## System Proxy Route Result

System route evidence through Electron-net:

| Field | Result |
| --- | --- |
| system diagnostic attempted | true |
| metadata | reachable from fixed descriptor |
| fixed asset found | true |
| HEAD | passed |
| content length | match |
| redirect host | allowed |
| 1 KB Range | passed |
| terminal diagnostic | `proxy_probe_passed` |
| classification | `system_proxy_probe_passed` |

The system route did not download the full package body. The bounded Range body was limited to 1 KB.

## Route Comparison

| Route | Result | M59 suitability |
| --- | --- | --- |
| manual | `manual_proxy_missing` | not selected because no manual proxy was configured |
| system | `system_proxy_probe_passed` | selected |

Selected M59 route: `system`.

Final classification: `system_proxy_probe_passed_retry_available`.

## No-Auto-Download Proof

Observed in the M58 live smoke:

- opening Plugin Management did not start download;
- status read did not start download;
- the dual proxy diagnostics did not call `install_official_plugin`;
- no DOCX workflow was attempted;
- no package body download was attempted;
- no `.svpkg` temp package output was created by this round.

Runtime remained `missing` with diagnostic `conversion_engine_missing`; M58 intentionally stopped after bounded diagnostics.

## Privacy and Redaction Evidence

Recorded evidence used only:

- proxy mode class;
- manual configured boolean;
- diagnostic attempted booleans;
- metadata/head/range pass/fail booleans;
- content-length class;
- redirect allowed boolean;
- symbolic diagnostics and classifications.

Not recorded:

- proxy credentials;
- environment proxy values;
- raw proxy URL;
- raw GitHub or signed asset URL;
- tokens;
- raw local paths;
- package paths;
- temp paths;
- runtime roots;
- executable paths;
- command lines;
- storage refs;
- content tokens;
- full hashes;
- response bodies.

## Validation Status

Completed:

- `npm run rebuild:node`: passed.
- `node --check scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs`: passed.
- `npx vitest --run src/next/settings/networkProxySettingsClient.test.ts electron/ipc/libreOfficeSystemProxyProbeIpc.test.ts src/next/plugin-distribution/networkProxy.test.ts src/next/plugin-distribution/packageDownloader.test.ts src/ui-app/components/PluginManagementPanel.test.ts --reporter=dot --silent`: passed, 64 tests.
- `npx vue-tsc --noEmit --pretty false`: passed.
- `npm run rebuild:electron`: passed.
- `SV_M58_DUAL_PROXY_PROBE=1 npm run test:office-pdf-libreoffice-live-installed-state-smoke`: passed and produced bounded dual-proxy evidence.
- `git diff --check`: passed with LF/CRLF warnings only.
- focused privacy/artifact scan: no M58 raw path, raw URL, proxy credential, full hash, package output, runtime output, staging output, sandbox output, packaged output, or private key leak found.
- final `npm run rebuild:node` after Electron validation: passed.

## Remaining Limitations

- The full official install path has not yet been rerun after the system proxy probe passed.
- Manual proxy route was not evaluated because no manual proxy was configured.
- Full package body transfer through Electron-net system proxy is not implemented in this round; M58 proves bounded diagnostic viability only.
- macOS/Linux packages remain deferred.
- Unsupported formats remain unsupported.

## Recommended M59

Run one controlled real LibreOffice official install attempt using the selected `system` route only after Owner approval:

- use Plugin Management `install_official_plugin`;
- use the fixed first-party GitHub Release asset descriptor;
- preserve resumable streaming, size/hash/trust/staging/activation gates;
- do not use external `.svpkg` injection;
- do not enable automatic or conversion-time download;
- if activation succeeds, verify live DOCX-to-PDF selected-ref / DerivedAsset semantics.
