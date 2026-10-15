# NET-CLOSEOUT Network Proxy Governance Stage Closeout

Date: 2026-07-02

## Stage Judgment

Starverse's primary network exits have been consolidated from scattered `fetch` usage into a governable proxy system.

The stage is complete for the current scope: policy contracts, Electron session proxy control, primary cloud provider traffic, package downloads, local direct endpoints, structured error semantics, UI error mapping, and a regression guardrail are now in place.

This closeout does not add runtime behavior. Future work should be handled as explicitly scoped follow-up slices rather than expanding this phase.

## Completed Scope

| Slice | Commit | Result |
|---|---:|---|
| NET-P0 network egress investigation | `b0a07069` | Mapped Starverse external and local network exits in `network-egress-investigation.md`. |
| NET-P1a proxy policy contract | `c43a450d` | Added shared proxy policy type, defaults, normalization, validation, and Electron `ProxyConfig` compiler. |
| NET-P1b Electron proxy controller and IPC | `d10a6d3a` | Added session proxy controller, store-backed policy persistence, preload IPC, manual apply, and `resolveProxy` diagnostics. |
| NET-P2a cloud provider stream routing | `9ab5bb25` | Routed OpenAI Responses, Anthropic, and DeepSeek stream IPC defaults through Electron session fetch. |
| NET-P2b cloud provider availability routing | `09bb1e56` | Routed OpenAI Responses, Anthropic, and DeepSeek model availability IPC defaults through Electron session fetch. |
| NET-P2c OpenRouter catalog sync routing | `89a3e294` | Routed OpenRouter catalog startup/manual sync defaults through Electron session fetch injection. |
| NET-P3a provider upload and derivative routing | `d08a294c` | Routed provider file upload and derivative traffic through the provider session-backed fetch path. |
| NET-P3b runtime download transport | `04ffebe2` | Routed app runtime/package downloads through Electron transport while preserving Node fallback for CLI/test/no-Electron paths. |
| NET-P4a local endpoint direct transport | `84c885df` | Routed LocalEndpoint, LM Studio, and Ollama probe/chat/load/unload through explicit local direct transport. |
| NET-P5a structured network errors | `0d0f9b83` | Added serializable network error envelope and structured failure reasons. |
| NET-P5b UI error mapping | `96e3b148` | Mapped structured network errors in composer, console, runtime/download status, and UI fallback displays. |
| NET-P6 network egress guardrail | `376fb73c` | Added and wired `network-egress-gate.mjs` into project scripts and `verify:ssot`. |

Related cleanup:

- `2bd73a64` fixed a test fixture provider-id drift (`anthropic` -> `anthropic_messages`) exposed by `vue-tsc`; this was intentionally kept out of the network runtime slices.

## Explicitly Deferred

- Diagnostic panel.
- Full Settings UI.
- NetLog export.
- Per-provider proxy override UI.
- Node fallback downloader system/PAC equivalence.

These are not required for this stage's acceptance. Node fallback remains explicit fallback behavior and must not claim system/PAC support unless a later slice implements it.

## Governance Boundaries

- Cloud provider stream, provider availability, OpenRouter catalog sync, provider upload/derivative, and runtime downloads now have Electron-session or Electron-transport-backed app paths.
- LocalEndpoint, LM Studio, and Ollama remain default-direct by policy. They should not be routed through global proxy settings unless a later explicit local policy override is designed.
- Tests keep `fetchImpl` injection seams for focused behavior verification.
- Node/Undici package downloader remains a fallback for CLI, tests, or no Electron bridge; it is not the app default for system/PAC proxy behavior.
- Browser navigation, `shell.openExternal`, and NetLog are separate governance surfaces and were deliberately not folded into provider `NetworkTransport`.
- Existing guardrail allowlist is centralized in `scripts/gates/network-egress-gate.mjs`; future exceptions should be reviewed there instead of scattered through code comments.

## Regression Checks

Primary guardrail commands:

```text
npm run gate:network-egress
node scripts/gates/network-egress-gate.mjs --self-test
```

Type and focused validation used during closeout:

```text
npx tsc --noEmit --pretty false
npx vue-tsc --noEmit
npx vitest --run src/ui-app/components/ModelPickerDialog.test.ts --testTimeout 20000
git diff --check
```

`verify:ssot` now includes `npm run gate:network-egress` before `tc15-git-clean`, so the egress guardrail is no longer an isolated manual script.

## Closeout Classification

Final classification: `network_proxy_governance_stage_complete`.

The next work should be documentation, closeout verification, and narrowly scoped regression fixes. Do not expand this phase into Settings UI, diagnostics panels, NetLog export, per-provider proxy override UI, or Node system/PAC parity work without a new task boundary.

## 2026-10-15: Application and browser proxy completion

This is a separately authorized extension of the historical stage above. The
original stage's scope and deferred items are not retroactively reclassified.

### Configuration and runtime behavior

- The application retains `networkProxySettingsV2` and its four product modes:
  system, manual, environment, and direct. HTTP, HTTPS, and unauthenticated SOCKS5
  proxy URLs are supported by the Electron transport. TLS validation remains on.
- `inAppBrowserProxySettingsV1` defaults to following the application. Independent
  browser settings reuse the same compiler and retain their draft when switching
  back to follow. All browser tabs retain the existing `persist:intra-links`
  session, including tabs detached into another window.
- Cloud providers, catalogs, attachments, URL imports, and runtime downloads use
  the application policy. Local model sessions remain explicitly direct; external
  system browsers remain outside the application's proxy authority.
- Only manual mode uses the editable bypass list. Environment mode uses process
  `no_proxy`/`NO_PROXY`; system mode uses OS rules, including an existing OS PAC.
  Nonempty lowercase variables win. HTTP uses HTTP_PROXY then ALL_PROXY; HTTPS
  uses HTTPS_PROXY, HTTP_PROXY, then ALL_PROXY. Reapply reads the existing process
  environment, not later changes to the Windows environment registry.
- One serial coordinator applies both scopes and persists the configuration in a
  single store update. Identical saves do not close connections. Failed updates
  restore the previously applied compiled policies, not a freshly interpreted
  environment. A failed rollback blocks new requests in the affected scope.
- Proxy configuration corruption is retained for explicit repair and isolated by
  scope at runtime; it no longer aborts database bootstrap. An invalid application
  policy blocks a following browser, but not a healthy independent browser.
- Browser HTTP(S), subresources, and WebSocket handshakes are gated in the session
  alongside agent offline policy. Live connections are not promised seamless
  migration; rebuilding connections can interrupt work and does not replay it.
- Proxy configuration keys and descendants are protected from generic renderer
  store access and retained by safe-clear and configuration projection. Dedicated
  proxy IPC accepts only the current application window's main frame.

### Diagnostics and remaining boundaries

Draft probes own nonpersistent sessions. They never apply draft policy to a live
session or write settings, never obtain provider keys, and send HEAD without
cookies. The total deadline is ten seconds, including queueing, setup, DNS, and
proxy resolution; cancellation closes and clears the diagnostic session. Public
URL and redirect validation are reused from the attachment URL boundary.

Results distinguish configuration validity, planned proxy resolution, HTTP
status, elapsed time, and safe error code. A planned route does not prove actual
egress. HTTP 401/403/405 are received responses, not model-availability success;
407 indicates proxy authentication. LibreOffice's existing probe remains a
separately labeled download check against saved settings.

PAC editing, proxy credential storage/authentication, custom CA management,
per-provider overrides, and Node fallback SOCKS5/system/PAC equivalence remain
outside this extension. Unsupported Node fallback routes fail explicitly.

### Validation evidence

- Targeted compiler/coordinator, projection, protected-store, IPC, browser,
  diagnostics, settings-client, and UI suites cover mode semantics, scoped
  isolation, rollback, serialization, cancellation, redirect rejection, and draft
  testing without persistence. The existing SettingsPanel suite is retained.
- `node scripts/gates/network-egress-gate.mjs` and `--self-test` pass. The gate
  distinguishes a method declaration named fetch from a real ambient fetch call,
  including a call on the same line as the declaration; the removed compatible
  Node transport is no longer classified as a legitimate production exit.
- `node scripts/smoke/network-proxy-smoke.mjs` runs Electron against generated
  local HTTP/TLS targets, two recording HTTP proxies, and a recording SOCKS5
  proxy. An external temporary profile and a fixture-specific certificate key
  allow HTTPS routing tests; a second, untrusted certificate is still rejected.
  The runner verifies its PASS marker and removes only its guarded temporary root.
- The controlled Electron run passed application/browser follow and independent
  routing, real main-frame preload IPC, startup blocking, HTTP, HTTPS CONNECT,
  SOCKS5 HTTP/HTTPS, bypass, ALL_PROXY, direct mode, refusal without direct
  fallback, and independent-browser survival. Seventeen requests were recorded.
- Native Electron rebuild completed using the existing header cache via
  `npm_config_devdir` after the initial header download failed. Final ABI is
  Electron. No native outputs are part of the source change.

Public-provider requests, paid generation, full application UI visual acceptance,
macOS/Linux, and packaged-release acceptance were not performed. Controlled
session/IPC routing is not a claim of those broader acceptance results.

Final targeted results after static-review repairs: 86 integration tests, 10 unit
tests, and 44 UI tests passed (140 distinct tests). `npm run typecheck` and scoped
whitespace checks passed. ESLint over all changed TypeScript, Vue, and gate/smoke
files reported zero errors and 15 structural warnings (including existing large
functions in the main process, settings panel, and tests). The final Electron smoke also
loaded better-sqlite3, queried an in-memory database, and verified ABI 146.

A fresh-context GPT-6.1-sol review at high reasoning identified two P1 issues:
an equivalent save could incorrectly unblock a scope after failed rollback, and
scoped reapply could replace another scope's corrupt persisted configuration
with a default. Non-ready scopes now require a real session apply; scoped reapply
preserves unrelated raw configuration, while repair uses an explicit scoped reset.
Four controller regressions and the scoped UI reset regression pass. The reviewer
rechecked both repairs and reported no remaining P1 finding in that follow-up.

ABI record: mismatch encountered **no**; rebuild command
`npm run rebuild:electron` (successful retry with
`npm_config_devdir=%USERPROFILE%\.electron-gyp`); final target **electron**;
tests retried for ABI mismatch **none**; Electron smoke retried after rebuild
**yes**; native artifacts committed **none**. The earlier failed rebuild attempts
were environment failures (header download, then a custom nodedir library path),
not source regressions; the final cache-based rebuild and native load passed.
