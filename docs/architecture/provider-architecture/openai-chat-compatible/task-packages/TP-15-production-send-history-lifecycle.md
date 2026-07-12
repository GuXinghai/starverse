# TP-15 — Production Send and Historical Lifecycle

Status: complete (2026-07-11). Canonical new send and provenance-pinned regenerate/retry/edit-resend are production reachable through the main-owned compatible runtime. Final acceptance: 7 focused files / 40 tests plus UI regression suites, TypeScript, Vue TypeScript, network-egress and diff gates green; independent P0/P1 review found no remaining blocker.

Provider-neutral first-send ownership is defined by `docs/architecture/chat/new-chat-template/ADR-001-persistent-hidden-new-chat-template.md`. TP-15 consumes that lifecycle after runtime dispatch; it does not own a separate Compatible renderer session or New-chat path.

## Goal

Enable the first runtime-reachable `openai_chat_compatible` send path and close send, stream/non-stream, stop, retry, regenerate, edit-resend, terminal persistence and window-lifecycle behavior without any fallback.

## Dependencies and prerequisite state

- TP-01 through TP-14 complete and accepted.
- Canonical identity, fresh schema, secure credentials, atomic route provenance, governed network, builders, parser, tools, reasoning, display/persistence and UI inputs are all closed contracts.
- No deprecated identity or alternate compatible runtime path remains reachable.

## Production files and deletion scope

Add the canonical runtime selection/adapter/controller, preload/IPC bridge and application orchestration. Register only provider key `openai_chat_compatible`. Replace historical resend routing in `src/ui-app/app/appChatApp.logic.ts` so persisted route provenance is authoritative. Remove compatible-path `legacyOpenRouter`, current-picker and current-settings route reconstruction.

## Schema, config and data impact

- Before any network attempt, atomically persist the user turn, assistant placeholder, selected provider instance, endpoint revision, credential ref, model and all profile/policy versions.
- Every retry/regenerate/edit-resend derives its route from persisted history according to the frozen lifecycle contract, never from current composer state.
- Terminal outcome, final snapshot, usage, errors and partial state finalize through TP-13.
- No historical legacy chat is migrated; incompatible rows are handled only by TP-16 targeted reset.

## Core invariants

- Runtime selection is explicit and fail-closed; missing/deleted/stale dependencies produce a typed blocking error before fetch.
- All requests traverse renderer → preload → IPC → Electron main → the explicitly selected D16 proxy route and retained transport family; the endpoint security policy never rewrites that route or silently changes transport.
- Stream and non-stream modes share request identity, error taxonomy and provider-neutral result semantics.
- Abort covers user stop, timeout, sender/frame destruction, window destruction and app shutdown.
- Redirect, proxy, DNS, TLS, HTTP, auth and protocol errors retain typed, redacted provenance.
- No request can silently switch endpoint, credential, provider, model, response profile or reasoning source.
- Partial failure never reports a completed assistant message.

## Implementation steps

1. Register the sole canonical runtime key and exhaustive runtime selection branch.
2. Implement main-owned credential resolution and request construction from the pinned route snapshot.
3. Implement compatible IPC start/event/stop contracts with sender/window ownership and cleanup.
4. Route both SSE and non-stream JSON through TP-08 and the same provider-neutral event stream.
5. Wire tool, reasoning, raw-extension, usage and multi-choice events through TP-13 display/persistence.
6. Implement atomic begin-turn persistence before network and typed failure compensation.
7. Implement stop, timeout, EOF, malformed stream, terminal flush and final-snapshot reconciliation.
8. Implement retry, regenerate and edit-resend using immutable historical provenance.
9. Add negative runtime guards proving no OpenRouter, Responses, DeepSeek-native, Anthropic, Gemini, Ollama or LocalEndpoint fallback.

## Tests and gates

- Full mocked renderer→preload→IPC→main→transport→parser→UI→SQLite integration tests.
- Multi-instance same-model isolation and deleted/stale revision blocking tests.
- Stream/non-stream equivalence, multi-choice, tools, reasoning, usage and raw-extension tests.
- Stop/timeout/frame destruction/window destruction/app shutdown cleanup tests.
- DNS/TLS/proxy/auth/HTTP/SSE/JSON error propagation and redaction tests.
- Retry/regenerate/edit-resend route immutability tests after current settings change.
- No-fetch-before-provenance and terminal-flush-failure tests.
- No ambient renderer/Node fetch and no fallback/alias tests.
- Run `npm run rebuild:node` before DB-heavy Vitest.
- `npx tsc --noEmit --pretty false`
- `npx vue-tsc --noEmit`
- `npm run gate:network-egress`
- focused integration Vitest using local mocks only.
- `git diff --check`

## Acceptance criteria

- UI-created compatible instances can be selected and can send through the canonical main-process path using only local mock servers in automated acceptance.
- The exact selected instance/revision/model/credential/profile identities survive send, reload and all historical actions.
- Stop, failure and finalization leave coherent durable messages and release resources.
- No external request is made before atomic provenance exists.
- No alternate provider, legacy builder or compatibility fallback is reachable.

## Prohibitions

- No real API key or external API call in tests.
- No renderer or ambient Node direct fetch.
- No current-picker/current-settings historical rerouting.
- No fallback, alias, adapter bridge or dual runtime.
- No silent persistence or parser error downgrade.

## Suggested commit

`feat(provider): enable canonical compatible chat runtime`

## Stable contract for the next package

TP-16 receives the only production-compatible identity and a fully closed fresh-schema runtime; all legacy persisted identities can now be identified and reset without compatibility preservation.
