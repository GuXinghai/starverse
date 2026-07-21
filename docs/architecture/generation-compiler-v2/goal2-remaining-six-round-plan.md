# Generation Compiler V2 — Goal 2 remaining six-round closure plan

Accepted by the Owner on 2026-07-20. This document is the durable execution
order for the remaining Goal 2 work. It does not replace the final plan,
TP1–TP8, the traceability matrix, AC-01…AC-42, the execution charter, or later
Owner decisions. If those sources conflict, the latest explicit Owner decision
wins and execution stops long enough to record the reconciliation.

## Round status

| Round | Status |
| --- | --- |
| 1 — proxy and New Chat template | completed |
| 2 — OpenAI-compatible visible parity | completed |
| 3 — text-provider native history and context projection | completed |
| 4 — OpenRouter Images and Gemini Interactions | completed |
| 5 — atomic legacy deletion and zero-residual guards | completed |
| 6 — final candidate, acceptance, live evidence, and closure | in progress |

## Frozen Owner inputs

### Product proxy modes

The public product modes remain exactly `environment`, `manual`, `direct`, and
`system`:

- `environment` reads `http_proxy`/`HTTP_PROXY`,
  `https_proxy`/`HTTPS_PROXY`, and `no_proxy`/`NO_PROXY` in Electron main at
  startup and explicit reapply time, then compiles the result into one explicit
  Electron `fixed_servers` configuration;
- lowercase variables take precedence over uppercase variables;
- HTTP uses `http_proxy`; HTTPS uses `https_proxy` and may fall back to
  `http_proxy`; an HTTPS-only proxy leaves HTTP direct;
- `NO_PROXY` alone is not an available environment proxy configuration;
- invalid or unsupported proxy URLs, unsafe bypass rules, and proxy URL
  userinfo reject explicitly; no fallback to another mode or an earlier mode is
  allowed;
- `manual` compiles to `fixed_servers`, `direct` to `direct`, and `system` to
  Electron `system`;
- `pac_script` and `auto_detect` remain internal Electron types and are not
  exposed through this Goal 2 product UI or compatible extensions.

Proxy changes use one ordered application boundary:

```text
read input
-> validate and compile the complete Electron ProxyConfig
-> session.setProxy
-> forceReloadProxyConfig
-> closeAllConnections
-> confirm success
-> persist the product mode
```

An application starting with unavailable `environment` configuration may open,
but every governed provider, catalog, and download request fails closed with
`proxy_environment_unavailable`. `strict_ssrf` remains an independent endpoint
security policy. A transport without `validated_address_lease_v1` rejects with
`compatible_strict_ssrf_unavailable`; it never falls back to
`compatibility_first`. LM Studio, Ollama, and an explicitly verified loopback
LocalEndpoint use a direct target policy. Remote Generic and
OpenAI-compatible endpoints use the selected product proxy policy.

### Authorized live evidence

- Gemini Interactions may use the existing Google AI Studio credential and a
  small paid budget. The primary model is exactly
  `gemini-3.1-flash-image`; model-family guessing, `latest`, and unbounded
  dynamic selection are forbidden. Only a clear model/permission/region
  diagnostic may use `gemini-2.5-flash-image` once.
- Gemini Interactions is limited to at most three successful requests, two
  diagnostic requests, and USD 2 total. Its scenarios cover image-only,
  text-plus-image, and the necessary streaming terminal/image mapping without
  duplicate equivalent requests.
- The final release matrix may use existing stored credentials. Every paid
  protocol/profile receives at most one success and, only when ambiguous, one
  diagnostic request. Total final-matrix cost is capped at USD 5. Evidence
  already obtained by the valid Gemini Interactions path is reused.
- A qualifying smoke must use the production UI/IPC or a formal main-owned
  smoke entry, credential resolver, proxy/transport, compiler, parser, terminal
  coordination, and persistence/projection. Models/health calls, mocks,
  fixtures, curl, Postman, and provider SDK calls cannot independently close
  AC-39.
- Secrets, authorization headers, full provider responses, base64 image data,
  absolute local paths, and generated image binaries are never committed.
  Evidence stores only the approved sanitized identity, request hash, terminal,
  usage/cost, and output metadata/hash fields.
- Any later change to a request builder, transport, proxy, credential path,
  parser, stream mapper, or terminal persistence invalidates affected live
  evidence. Failure blocks Goal 2 closure and never rolls back production code.

## Six rounds

Each round is an outcome boundary, not a fixed timebox. A defect discovered in
a round is repaired in that same round; it does not create a seventh package.
Broad validation and paid smoke are deferred to Round 6. Before and after every
round, `goal2-progress.md` records the exact changed files, focused evidence,
remaining risks, and whether the exit condition is satisfied.

### Round 1 — epoch-2 shell parity and proxy authority

Implement the frozen proxy compiler and atomic apply/persist boundary; register
it in `mainV2`; make every governed cloud/catalog/download transport consume
the same authority; retain the strict-SSRF and direct-loopback boundaries.
Migrate the retained New Chat/system-template draft, reset, materialization,
first-turn, and lifecycle settings to epoch-2 repository/IPC/client ownership.
Remove reachable renderer dependencies on legacy `dbBridge` template methods.

Exit: proxy and template behavior are V2-owned, production reachable, feature
equivalent, and covered by one combined focused proxy/template suite.

### Round 2 — OpenAI-compatible parity and activation

Complete V2 model/catalog/discovery persistence and the fixed `GET /v1/models`
connection/sync service. Move the complete visible multi-instance panel—URL,
auth, public headers/query, credentials, test, model sync/manual models,
capability/pricing/provenance, `extraBody`, request reasoning mappings, response
reasoning mappings, inline policy, and observation-only discovery—to its V2
IPC/client. Add the `openai_chat_compatible` renderer command route and connect
initial, retry, regenerate, edit-resend, abort, native reasoning replay, and the
declared function-tool continuation to the existing V2 runtime. Remove every
reachable use of the legacy compatible bridges.

Exit: renderer and settings have complete visible parity and use only the fixed
`openai_chat_compatible` compiler/runner. One combined compatible focused suite
passes; no full repository gate runs.

### Round 3 — text-provider native history and context projection closure

Close OpenRouter Chat, OpenAI Responses, Anthropic, DeepSeek, Gemini
GenerateContent, LM Studio OpenResponses, Generic/local, Ollama, and compatible
text semantics. Complete Gemini function continuation, Ollama complete-turn
context projection, and every mismatch between registry/capability declarations
and executable behavior. For every provider, included turns replay complete
native bundles; excluded turns are omitted as whole turns; server-managed
history handles are forbidden; incomplete bundles and active tool loops reject
before fetch. Complete provider-specific managed-file/URL-reference,
reasoning/thinking, web, image-tool, sampling, and extension encode-or-reject
coverage plus recovery for new continuation states.

Exit: no release-enabled text capability is advertised without an executable
typed path, and no explicit setting is silently dropped. One combined text
provider matrix suite passes.

### Round 4 — OpenRouter Images and Gemini Interactions

Finish OpenRouter descriptor refresh/hard-expiry settings, user-owned endpoint
selection UI, deterministic display ordering, exact binding persistence,
`provider.only`, `allow_fallbacks:false`, option allowlists, stale rejection,
and capability mismatch handling. Build Gemini Interactions as a separate
`v1beta` image operation with exact request codec, ordered Step/SSE artifact,
image delta/final mapping, terminal/usage persistence, snapshot, runner, IPC,
and renderer route. Support only verified single-image 1K/1:1 semantics and
explicitly reject unverified multi-image, higher-resolution, or continuation
semantics.

Exit: both image operations have independent typed compiler/runner/decoder
paths and one combined image suite passes. Final paid evidence is still held
for the final candidate in Round 6.

### Round 5 — atomic legacy deletion and zero-residual guards

After parity exists, delete the old main/worker/data/schema entrypoints, V1
snapshots and commands, renderer stream/request construction, old compatible
registry/catalog/chat/transport, old OpenRouter bridges/plugins/fallbacks,
provider/model-only resolvers, split semantic state owners, protocol guessing,
and obsolete IPC/preload/config/test fixtures. Retain the separate non-blocking
raw-request diagnostic database and prove that its exact-body hash matches the
prepared request, ledger, and transported bytes. Add architecture guards that
prevent legacy paths, `chat.db`, unowned wire construction, and fallback from
returning.

Exit: the only production path is `mainV2 -> generation-v2 IPC -> command ->
compiler/prepared request -> runner`. Run only zero-residual guards, a
development Vite build, and `git diff --check`.

### Round 6 — final candidate, acceptance, live evidence, and closure

Create the final local candidate SHA without pushing. Rebuild Node ABI once,
run the consolidated automated/schema/provider/architecture suite once, then
run TypeScript, Vue TypeScript, Vite/build, network-egress, and diff checks.
Rebuild Electron ABI once and run packaged fresh-profile, second-start,
crash-reset, proxy, template, orphan-recovery, and core Electron/Playwright
smokes. Execute the authorized real-provider matrix from the final production
path and bind sanitized evidence to the final SHA. Any code correction produces
a new candidate SHA and invalidates only affected evidence. Complete independent
P0/P1 and documentation consistency review, close AC-01…AC-42 directly, update
Gate 0/TP8/traceability/progress, and leave a clean worktree with Electron ABI.

Exit: all production paths are V2, legacy residuals are zero, every
release-enabled protocol/profile has a qualifying real success, every AC has
direct evidence, unresolved Critical/High findings are zero, documentation
matches the final SHA, and no remote push has occurred.

## Mandatory stop conditions

Stop and report instead of guessing when any of the following occurs:

- provider official behavior contradicts the frozen codec or evidence;
- the primary Gemini Interactions model is unavailable and the permitted
  diagnostic cannot distinguish contract failure from account availability;
- a release-enabled protocol lacks a credential or reachable required local
  endpoint;
- the authorized request-count or cost cap would be exceeded;
- a proxy, strict-SSRF, credential, managed-root, or deletion boundary cannot be
  satisfied without weakening security or changing Owner semantics;
- a change would delete or materially simplify an existing visible feature;
- an unrelated dirty-worktree conflict prevents safe preservation;
- a new request expands Goal 2 beyond the frozen plan and six rounds.
