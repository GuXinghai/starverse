# DFC-M56 Starverse Network Proxy Settings for Plugin Downloads

Date: 2026-06-24

## Goal

Add Starverse-level proxy settings for Plugin Management official downloads so the LibreOffice GitHub Release `.svpkg` path can use an explicit user-selected network policy when browser/system routing differs from the Node downloader path.

M56 does not run `install_official_plugin`, does not download the full LibreOffice package, and does not consume the real install retry.

## Proxy Settings Model

Persistent settings are stored in `settings_kv` through the existing `SettingsRepo` pattern:

- `proxyMode`: `system`, `manual`, `environment`, or `direct`
- `manualProxyUrl`: HTTP/HTTPS proxy URL only
- `noProxy`: comma/space-separated bypass list
- `strictSSL`: fixed true for plugin downloads

Default mode is `environment`, because the downloader remains Node/undici based in this round. `system` is visible but reports `proxy_system_unavailable` until an Electron net backend is added. This avoids silent fallback.

Proxy credentials are not supported in M56 because no secure proxy-credential storage pattern was introduced. Credential-bearing proxy URLs are rejected before persistence, and diagnostics redact credential-like URL text.

## Implementation Route

Selected backend: undici-compatible Node fetch dispatcher.

- `direct`: no dispatcher.
- `environment`: `EnvHttpProxyAgent`.
- `manual`: `ProxyAgent` for HTTP/HTTPS proxy URLs.
- `system`: explicit unavailable diagnostic; no silent fallback.
- `noProxy`: Starverse-level bypass matching is applied before dispatcher selection.

The proxy policy is passed into the shared official package downloader and applies to:

- memory official package fetch path;
- file-staged streaming package fetch path;
- resumable Range retry path;
- LibreOffice official HEAD/Range diagnostic probe.

Offline `.svpkg` import does not use this proxy path.

## Downloader Integration

`EnginePluginLifecycleService` receives a `networkProxySettingsProvider` backed by `SettingsRepo`. LibreOffice official install passes the normalized proxy settings into `downloadOfficialPackageToFile`, preserving:

- fixed first-party GitHub descriptor;
- M54 streaming-to-temp-file download;
- resumable `Range` retry behavior;
- 3 retry / 3-second retry interval policy;
- size/hash verification before import;
- signed catalog/trust/staging/activation gates;
- no system LibreOffice or PATH fallback.

The existing Magika bytes path remains functionally unchanged except that the shared official transport can receive proxy settings when the lifecycle service supplies them.

## Network Diagnostics

M56 adds a bounded LibreOffice official package network probe:

- fixed descriptor only;
- HEAD with content-length validation;
- redirect host allowlist validation;
- `Range: bytes=0-1023`;
- no package body download beyond the bounded range;
- no install operation.

Sanitized result fields:

- proxy mode;
- metadata reachable;
- asset found;
- HEAD pass/fail;
- content-length match/mismatch/unavailable;
- redirect host allowed/rejected;
- range pass/fail;
- terminal diagnostic.

Diagnostics include `proxy_system_unavailable`, `proxy_auth_required`, `proxy_connection_timeout`, `asset_host_blocked`, `metadata_reachable_head_failed`, `range_failed`, and `proxy_probe_passed`.

## UI Evidence

Settings now includes a `Network Proxy` section with:

- Proxy mode: System / Manual / Environment variables / Direct
- Manual proxy URL
- No proxy / bypass list
- Test connection button
- strict SSL required indicator

Plugin Management LibreOffice rows show:

- current network mode;
- official install uses Network Proxy settings;
- manual install downloads from GitHub;
- user-initiated only;
- conversion-time download disabled.

Renderer DTOs do not receive proxy passwords, raw credential-bearing proxy URLs, GitHub signed URLs, package paths, runtime roots, executable paths, command lines, env values, storage refs, content tokens, manifest bodies, DOCX/PDF bodies, or full hashes.

## No-Auto-Download Proof

M56 did not add any new automatic trigger. The only code paths added are:

- settings get/set;
- bounded diagnostic probe;
- downloader proxy dispatcher selection when an existing explicit official install operation already runs.

Opening Settings, opening Plugin Management, changing proxy settings, testing proxy connectivity, DOCX upload, DFC option generation, Send Plan, and conversion attempt with missing runtime do not start `install_official_plugin` or a full package download.

## Validation Status

Validation completed:

- `npm run rebuild:node`: passed.
- `npx vitest --run src/next/plugin-distribution/networkProxy.test.ts src/next/plugin-distribution/packageDownloader.test.ts infra/db/repo/settingsRepo.test.ts --reporter=dot --silent`: passed, 35 tests.
- `npx vitest --run src/ui-app/components/PluginManagementPanel.test.ts --reporter=dot --silent`: passed, 31 tests.
- `npx vitest --run infra/files/enginePluginLifecycleService.test.ts --reporter=dot --silent`: passed, 71 tests.
- `npx vitest --run src/next/plugin-distribution/officialPackageRelease.test.ts --reporter=dot --silent`: passed, 4 tests.
- `npx vue-tsc --noEmit --pretty false`: passed.
- Script syntax checks for DFC probe/smoke scripts: passed.
- `node scripts/dfc/libreoffice-network-proxy-diagnostic-probe.mjs`: passed bounded probe. Metadata reachable true, asset found true, HEAD passed, content length matched, redirect host allowed, 1 KB Range passed, terminal diagnostic `proxy_probe_passed`.
- `git diff --check`: passed with LF/CRLF warnings only.
- Privacy/artifact scan: no renderer DTO proxy credential leak found; no `.svpkg`, MSI, runtime, staging, sandbox, official-download, or packaged output was staged.

No `install_official_plugin` operation was run and no full LibreOffice package download was attempted in M56.

## Remaining Limitations

- `system` proxy mode is explicit pending because M56 keeps the official downloader on Node/undici rather than Electron net.
- Proxy credentials require secure storage before support; plaintext credential URLs are rejected.
- SOCKS proxy is not supported without an approved dependency or backend route.
- M56 does not retry the real LibreOffice package install and does not verify live DOCX-to-PDF.

## Recommended M57

After M56 validation, run the bounded proxy diagnostic with the Owner-selected proxy mode. If HEAD/Range pass, request explicit Owner approval for one Plugin Management Retry install using the proxy-aware M54 resumable downloader, then verify live DOCX-to-PDF only if activation succeeds.
