# TP-05 — Governed Electron Network Transport and Address Security

Status: `complete`

## Goal

Create the only allowed compatible provider network broker while retaining Starverse's existing `system` / `manual` / `environment` / `direct` proxy routes and dual-transport architecture. Add an independent endpoint security policy axis: `compatibility_first` retains the selected route's native transport behavior with pre-request and per-redirect address checks; `strict_ssrf` requires proven connect-time lease consumption and blocks before egress when the selected transport cannot prove it.

## Dependencies and prerequisite state

- TP-03 complete; endpoint revisions and main-only credential resolver exist.
- TP-04 may proceed in parallel, but production send remains forbidden.
- Security tests use local mock DNS/servers only.

## Current evidence

- `electron/net/providerHttpTransport.ts:46-53` wraps `session.fetch` but has no address/redirect policy.
- `electron/openrouter/externalUrlPolicy.ts:5-36` is not a complete provider SSRF policy.
- `infra/files/urlProbe.ts` separates DNS checking from fetch and therefore cannot prove connect-time address pinning.
- `scripts/gates/network-egress-gate.mjs` contains existing exceptions; the compatible path must not add one.

## Production files and deletion scope

Create:

- `electron/net/compatibleProviderTransport.ts`
- `electron/net/compatibleAddressPolicy.ts`
- `electron/net/compatibleRedirectPolicy.ts`
- `electron/ipc/compatibleProviderTransportIpc.ts`
- provider-neutral safe network error/diagnostic types under `src/shared/network/`.

Extend existing Electron session proxy controller only through provider-neutral APIs. Add typed preload contracts. Remove no LocalEndpoint transport; prohibit importing it. Delete any compatible direct-fetch exception if present.

## Schema, config and data impact

- Reads immutable endpoint revision, ordinary query/header config and credential refs.
- Persists only safe request lifecycle diagnostics/counts; never response body or secrets in network logs.
- No schema beyond TP-02 unless bounded network diagnostic columns/tables already planned there require repository implementation.

## Core invariants

- No renderer or Node/global direct fetch.
- Existing `system` / `manual` / `environment` / `direct` proxy modes and their dual-transport routing remain effective and are never renamed or selected by the endpoint security policy.
- All DNS answers must be public; one blocked answer blocks the request.
- `compatibility_first` performs all-answer checks before the first request and after every redirect while retaining the selected route's native transport behavior; it never claims connect-time proof.
- `strict_ssrf` requires the actual connected address to be covered by a consumed validated-address lease. If the selected transport lacks that proven capability, it returns a typed block before credentials/body/egress.
- Neither security policy may switch the proxy route, transport or other security policy. No silent fallback or downgrade exists.
- Every redirect is manual, bounded and fully revalidated.
- Credentials are injected only after address, redirect, header and query validation, and never forwarded cross-origin.
- HTTP is allowed and produces metadata for a persistent UI warning, not a transport block.
- All request lifecycles abort on user stop, timeout, sender/WebContents destruction and app shutdown.
- Size/buffer overflow fails deterministically with bounded diagnostics.

## Implementation steps

1. Implement canonical URL/API-path construction and public-address classifier for IPv4, IPv6 and mapped IPv6.
2. Implement all-answer DNS resolution through the explicitly selected route's governed resolver without changing that proxy route.
3. Implement `compatibility_first` pre-request/per-redirect checks and a separate request-scoped `ValidatedAddressLease` contract for `strict_ssrf`. A transport without proven lease-consumption capability must return `compatible_strict_ssrf_unavailable` before egress rather than falling back.
4. Implement manual redirects (max 5), same-origin credential rule, method-preserving POST rule and per-hop lease renewal.
5. Preserve and exercise all four existing proxy routes plus both existing transport families. Security-policy tests must be a cross-product and must assert no route, transport or policy switching.
6. Implement case-insensitive header policy, static query merge and late credential injection.
7. Implement catalog/chat timeout profiles, idle timeout, abort registry and WebContents/app cleanup.
8. Implement response limits: models JSON, non-stream JSON, SSE event/pending/cumulative bytes.
9. Normalize DNS/proxy/TLS/HTTP/timeout/abort/window errors without OpenRouter names.
10. Register all compatible egress call sites with the existing gate as classified production transport, not an allowlist exception.

## Tests and gates

- URL/userinfo/query/HTTP-warning tests.
- All blocked IPv4/IPv6/mapped ranges and mixed DNS answer tests.
- `compatibility_first` pre-request and per-redirect checks without false connect-time claims; `strict_ssrf` proven lease consumption or typed pre-egress block.
- `system` / `manual` / `environment` / `direct` crossed with both policies and both transport families; no silent switching, fallback or downgrade.
- Forbidden headers, CRLF injection and secret-like query tests.
- Header/body/stream/cumulative size limits.
- timeout, idle timeout, abort, duplicate abort, WebContents destroyed and app quit.
- typed renderer→preload→IPC→main tests.
- `npm run gate:network-egress` with no new compatible exception.
- `npx tsc --noEmit --pretty false`
- `git diff --check`

## Acceptance criteria

- Every compatible network use case is forced through one broker while retaining the explicitly selected existing proxy route and transport family.
- `compatibility_first` proves blocked pre-request/redirect targets never receive requests or credentials and reports its non-connect-bound security level honestly.
- `strict_ssrf` either proves actual connection consumption of the audited lease or blocks before egress with no policy/route/transport fallback.
- Existing proxy modes and dual-transport behavior remain intact.
- HTTP endpoints remain usable and are marked insecure for UI.
- There is no direct-fetch or LocalEndpoint bridge.
- No production send is enabled.

## Prohibitions

- Do not describe `compatibility_first` preflight checking as rebinding-proof or connect-bound enforcement.
- Do not replace proxy modes with security-policy names, or silently switch among proxy route, transport family or security policy.
- Do not add an egress-gate exception.
- Do not use renderer fetch, Node global fetch, LocalEndpoint transport or silent proxy fallback.
- Do not auto-follow redirects.
- Do not log URL query values, request body, response output or credentials.

## Suggested commit

`feat(network): add ssrf-safe compatible session transport`

## Stable contract for the next package

TP-06/TP-08/TP-15 receive a single safe main transport API that accepts a validated endpoint revision and returns bounded bytes/events or provider-neutral errors.
