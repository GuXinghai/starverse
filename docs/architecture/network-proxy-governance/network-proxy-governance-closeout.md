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
