# OpenAI Chat Completions-compatible Rebuild Master Plan

## 0. Document status

- Verdict: `ready_for_implementation`.
- Canonical protocol provider key: `openai_chat_compatible`.
- Scope: planning and acceptance contracts only. This document does not authorize production implementation in Goal 1.
- Owner source fully ingested: `OPENAI_CHAT_COMPATIBLE_OWNER_DECISIONS.md` D1–D15.
- Execution SSOT: this master plan, `task-packages/`, `DECISION_COVERAGE_MATRIX.md`, and `PROGRESS_LEDGER.md`.
- Compatibility position: destructive, forward-only rebuild. No old provider key, endpoint config, route identity, chat migration bridge, alias, fallback, or dual runtime.

## 1. Frozen Owner Decisions

| Decision | Frozen result |
| --- | --- |
| D1 | Only cloud OpenAI Chat Completions-compatible `POST /v1/chat/completions`, SSE, non-stream JSON, and `GET /v1/models`; native protocols remain separate. |
| D2 | Multiple user-created provider instances and multiple models; stable model identity is `providerInstanceId + modelId`; one canonical protocol key. |
| D3 | Per-instance merged catalog from physically separate `remote_sync` and `manual` records. |
| D4 | Bearer, Basic, no-auth, and static custom headers; secrets only in secure storage and renderer sees references/summaries. |
| D5 | HTTP and HTTPS are allowed; HTTP shows a persistent inline warning. Cloud targets block loopback, link-local, private addressing, rebinding, and unsafe redirects. LocalEndpoint remains separate. |
| D6 | Builder order is standard builder → structured request mappings → `extraBody` → ownership protection → validation → fetch; no silent drops. |
| D7 | Built-in response reasoning order is custom → `reasoning` → `reasoning_content` → `thinking` → inline tags, subject to D15 source locking. |
| D8 | Custom reasoning mapping is product functionality, versioned, restricted, and replay-disabled by default. |
| D9 | Canonical `<think>` parsing is built in, chunk-safe, code-fence-aware, and not globally disableable. |
| D10 | Unknown field discovery observes and proposes; it never changes current-response semantics automatically. |
| D11 | Request reasoning controls and response reasoning parsing are separate versioned profiles and cannot infer each other. |
| D12 | Wire parser → compatible extension extractor → semantic mapper → provider-neutral events; no ambiguous `generic` naming. |
| D13 | Raw extensions are bounded, redacted, coalesced, version-pinned, and never rendered directly. |
| D14 | Remove old compatible implementations and identities; reset only affected data and preserve unrelated/native/LocalEndpoint data. |
| D15 | Exactly two custom mapping modes; one source per choice locks once, never switches, never merges, and remains pinned for replay/reload. |

## 2. Protocol Scope

| Included | Excluded |
| --- | --- |
| Cloud HTTP/HTTPS API root | OpenAI Responses and Assistants |
| `GET {apiRoot}/models` | OpenRouter-specific semantics |
| `POST {apiRoot}/chat/completions` | DeepSeek native behavior |
| SSE and non-stream JSON | Anthropic Messages and Gemini |
| Standard Chat Completions messages/tools | Ollama native and local lifecycle management |
| Bounded compatible extensions | LocalEndpoint config, transport, catalog, credentials, identity, or fallback |

`apiRoot` canonicalization is deterministic: reject userinfo/query/fragment in the Base URL; preserve an optional gateway prefix; normalize exactly one terminal `/v1` (append it when absent, keep it when present); remove trailing slashes. Models and chat paths append `/models` and `/chat/completions`. Static non-secret query parameters are stored separately from the Base URL and merged by an allow/deny policy. Secrets and API keys are forbidden in query parameters.

## 3. Canonical Identity Map

| Concept | Canonical identity | Stability rule | Forbidden aliases/derivation |
| --- | --- | --- | --- |
| Protocol | `openai_chat_compatible` | Fixed code constant | `generic`, `generic_openai_compatible`, `remote_openai_compatible`, custom-openai aliases |
| Provider instance | `providerInstanceId` | Immutable generated ID | Display name, URL, current settings |
| Endpoint | `endpointRevisionId` | Immutable revision; edits create a new revision | Mutable global Base URL |
| Model | `(providerInstanceId, modelId)` | Composite stable identity | modelId alone or display name |
| Credential | `credentialVersionRef` | Immutable secure-store version ref | Raw secret, provider name, current credential |
| Request profile | `(requestProfileId, version)` | Immutable version | Current editable draft |
| Response profile | `(responseProfileId, version)` | Immutable version | Model/provider guessing |
| Reasoning mapping | `(mappingId, version, mode)` | Immutable version | Late dynamic profile lookup |
| Inline policy | `(inlinePolicyId, version)` | Immutable version | Global mutable tag list |
| Route | `routeProvenanceId` | Atomically created before outbound fetch | Reconstructed endpoint from current settings |

## 4. Domain Model and Data Ownership

| Object | Key and lifecycle | Persistence | Renderer visibility | Secret rule |
| --- | --- | --- | --- | --- |
| `CompatibleProviderInstance` | immutable ID; editable name; active/deleted tombstone | SQLite | full non-secret | none |
| `CompatibleEndpointRevision` | immutable revision per URL/auth/header/query/profile edit | SQLite | safe summary | refs only |
| `CompatibleCredentialDescriptor` | immutable credential version reference; rotate creates new ref | SQLite descriptor + secure payload | masked metadata only | payload secure-store only |
| `CompatibleAuthConfig` | `none`, `bearer`, `basic`, `custom_headers` descriptor | SQLite non-secret shape | safe descriptor | token/password/sensitive values secure |
| `CompatibleHeaderConfig` | case-normalized ordinary and sensitive header refs | SQLite + secure store | ordinary values and masked sensitive names | sensitive values never SQLite |
| `CompatibleQueryConfig` | static non-secret key/value list | SQLite | visible | secret-like values rejected |
| `CompatibleModelRecord` | instance/model/source record | SQLite | visible | none |
| `CompatibleMergedModel` | deterministic read model | query/view, not source writeback | visible with field provenance | none |
| `CompatibleRequestProfile` | immutable version | SQLite | visible | no secrets |
| `CompatibleRequestFieldMapping` | immutable mapping version, restricted path DSL | SQLite | visible | no scripts/secrets |
| `CompatibleResponseProfile` | immutable version, one active reasoning mapping ref | SQLite | visible | no secrets |
| `CompatibleReasoningMapping` | immutable version + D15 mode | SQLite | visible | raw samples excluded |
| `CompatibleInlineReasoningPolicy` | immutable tag-set version | SQLite | visible | static strings only |
| `CompatibleDiscoveredResponseField` | bounded candidate aggregate | SQLite diagnostics | redacted summary | samples bounded/redacted |
| `CompatibleRawExtensionRecord` | per-message coalesced extension record | SQLite | diagnostics only | redacted before write |
| `CompatibleRouteProvenance` | atomically bound to request and choice messages | SQLite | safe diagnostics | credential ref only |
| `CompatibleCatalogSyncState` | last attempt and last valid snapshot state | SQLite | visible | no secrets |
| `CompatibleProviderAvailability` | current computed status | ephemeral/cache | visible | safe only |

Deletion uses tombstones/restrict semantics for referenced immutable objects. A provider can be hidden from new sends without erasing endpoint/profile/provenance records needed by existing new-system messages. Explicit credential deletion invalidates dependent replay and produces a visible error; it never falls back to another credential.

## 5. Fresh Schema SSOT

Fresh schema is the only schema source for this provider. No legacy upgrade bridge is added.

| Table | Primary/unique keys | Important references and policy |
| --- | --- | --- |
| `compatible_provider_instances` | PK `provider_instance_id`; unique normalized active display name only if UI requires | tombstone rather than cascade from routed messages |
| `compatible_endpoint_revisions` | PK `endpoint_revision_id`; unique `(provider_instance_id, revision)` | FK provider; immutable; refs credential/profile versions; `RESTRICT` when routed |
| `compatible_credential_descriptors` | PK `credential_version_ref` | contains backend/type/masked summary only; secure value external |
| `compatible_request_profiles` | PK `(request_profile_id, version)` | immutable JSON validated against one schema version |
| `compatible_request_field_mappings` | PK `(mapping_id, version)` | FK request profile; unique target path within profile |
| `compatible_response_profiles` | PK `(response_profile_id, version)` | immutable refs to reasoning/inline versions |
| `compatible_reasoning_mappings` | PK `(mapping_id, version)` | one mapping version selected per response profile |
| `compatible_inline_policies` | PK `(inline_policy_id, version)` | canonical tags always present; custom tags additive |
| `compatible_model_records` | PK `(provider_instance_id, model_id, source)` | source check `remote_sync|manual`; source records never overwrite each other |
| `compatible_catalog_snapshots` | PK `snapshot_id`; unique `(provider_instance_id, snapshot_sequence)` | immutable remote snapshot metadata |
| `compatible_catalog_sync_state` | PK `provider_instance_id` | last attempt, last success, empty-success, failure and backoff separated |
| `compatible_discovered_fields` | PK `(provider_instance_id, response_profile_id, profile_version, stream_path)` | bounded aggregates, ignore/confirmed state |
| `compatible_route_provenance` | PK `route_provenance_id`; unique `request_id`; indexed message/instance/model | all version refs required before fetch |
| `compatible_route_choices` | PK `(route_provenance_id, choice_index)`; unique `message_id` | maps every returned choice to a stable assistant candidate |
| `compatible_tool_calls` | PK `(message_id, choice_index, tool_index)`; unique `(route_provenance_id, tool_call_id)` when ID is present | ordered delta aggregate, function name/arguments/status/sequence |
| `compatible_tool_results` | PK `tool_result_message_id`; FK route/tool call | binds standard `role=tool` messages to the originating call |
| `compatible_raw_extension_records` | PK record ID; indexed `(message_id, choice_index, sequence_start)` | bounded and redacted; FK route/message/profile versions |

All JSON columns have named validators shared by repository writes and IPC decoders. Bootstrap must not recreate these tables through an independent upgrade implementation. Schema verification tests compare actual columns, FKs, constraints and indexes to the fresh schema.

## 6. Secret Storage Boundary

| Data | Storage | Renderer | Injection/lifecycle |
| --- | --- | --- | --- |
| Bearer token | secure store under immutable credential version ref | configured/masked only | `Authorization: Bearer …` after target validation |
| Basic username/password | secure store as one versioned payload | auth type/masked user only | RFC Basic header after target validation |
| Sensitive custom header values | secure store map by version ref | header names + masked state | injected after header policy and target validation |
| Ordinary headers | SQLite endpoint revision | editable | canonicalized case-insensitively |
| Static query params | SQLite endpoint revision | editable | secret-like values rejected; redacted in diagnostics |
| Base URL | SQLite endpoint revision | visible | contains no userinfo/query/fragment |

Credential rotation creates a new secure payload/ref and a new endpoint revision. Old routes keep the old ref until the user explicitly deletes it. Deletion makes those routes unavailable. Secure-store errors, logs, IPC, diagnostics and exceptions must never contain raw secret, Authorization, Basic material, sensitive values, or URL userinfo.

### Header deny policy

Names are compared case-insensitively. At minimum deny user override of `Host`, `Content-Length`, `Connection`, `Transfer-Encoding`, `Upgrade`, `Proxy-Authorization`, `Proxy-Authenticate`, `Trailer`, `TE`, `Keep-Alive`, every `Sec-*`, and runtime-owned `Authorization`, `Accept`, and `Content-Type`. Hop-by-hop headers and any header added later to the transport-owned registry are also denied. Sensitive names such as cookie/token/key/secret/signature headers require secure storage even when otherwise allowed.

## 7. Model Source Merge Rules

1. Remote sync writes only `remote_sync`; manual CRUD writes only `manual`.
2. A successful sync creates an immutable snapshot and transactionally upserts seen remote models. Previously remote models absent from a successful snapshot become inactive/stale for the merged catalog; they remain diagnosable.
3. A syntactically valid empty response is an `empty_success`, advances the snapshot, and inactivates prior remote-only models. A failure or invalid envelope does not replace the last valid snapshot.
4. Malformed individual rows are skipped with bounded diagnostics; duplicates use a deterministic first-valid canonical ID plus duplicate diagnostics.
5. One merged identity is emitted for `(providerInstanceId, modelId)`.
6. Field precedence is manual explicit override → remote explicit value → `unknown`. An unset manual field does not erase a remote value.
7. Manual deletion reveals the remote record if it exists. Remote disappearance never deletes the manual record.
8. Every merged field carries provenance `manual|remote_sync|unknown`; both source records remain independently inspectable.
9. Picker, query and send use only the merged scoped query. There is no separate manual picker.
10. Context, price and capability metadata never inherit from OpenAI, OpenRouter or a same-named native model.

## 8. Request Field Ownership

| Ownership class | Fields/examples | Conflict rule |
| --- | --- | --- |
| Starverse-owned | `model`, `messages`, `stream`, `tools`, `tool_choice`, `parallel_tool_calls`, multimodal parts, route/continuation data | cannot be targeted by mappings or `extraBody` |
| Profile-owned structured | `response_format`, `stream_options`, `n`, token limits, `stop`, `temperature`, `top_p`, penalties, `seed`, `user`, standard metadata | only structured profile/UI owns; `extraBody` conflict fails |
| Mapping-owned | endpoint-specific paths created by request field mappings, including reasoning controls | mapping owns exact path and ancestors/descendants that would conflict |
| extraBody-owned | arbitrary valid JSON paths not owned above | accepted only after conflict/type/security validation |
| Transport-forbidden | headers, query, URL, method, credentials, provenance, prototype keys | never allowed in body or mapping |

The builder preserves `unset`, `explicit`, and `profile_default` provenance for every structured field. Unsupported or conflicting configured values fail before fetch with a user-visible reason. No configured value is silently removed.

`n` defaults to 1. If an endpoint returns multiple choices, each `choice.index` receives a deterministic `compatible_route_choices` record and assistant answer candidate; index 0 is initially selected, but other choices are persisted and selectable. Duplicate or missing indexes are protocol errors. No parser may silently keep only choice 0.

## 9. Request Reasoning Mapping Rules

- Request mappings belong only to a versioned request profile.
- Controls are `reasoning_enabled`, `reasoning_effort`, and `reasoning_budget`.
- Target paths use the same restricted object-path DSL as response mappings: object keys and bounded array wildcard where explicitly allowed; no script, regex, function, computed property or prototype-chain name.
- Mapping output passes field-ownership and `extraBody` conflict validation.
- Unset controls are omitted when `omitWhenUnset=true`; no endpoint-specific reasoning field is invented.
- Response observations never generate or mutate request mappings.

## 10. extraBody Protected Fields

Protection is path-aware, not a five-field denylist. Exact paths, parents and descendants of every Starverse-owned, structured-profile-owned or mapping-owned field are protected from `extraBody`. Reject `__proto__`, `prototype`, `constructor`, non-JSON values, excessive depth/keys/bytes, cyclic input and transport-shaped fields. Validation occurs before serialization and fetch.

## 11. Response Field Mapping

| Source | Eligibility | Semantic action |
| --- | --- | --- |
| Configured custom path | valid non-empty value matching mapping type/semantic | highest candidate priority unless `custom_only` is absent (no custom mapping) |
| `reasoning` | valid supported string/blocks | built-in reasoning candidate |
| `reasoning_content` | valid supported string/blocks | built-in reasoning candidate |
| `thinking` | valid supported string/blocks | built-in reasoning candidate |
| Inline canonical/custom tags | complete tag sequence outside code fences | inline candidate |
| Other unknown fields | bounded eligible JSON value | diagnostics/discovery only |

Content string/null/array, role, finish reason, usage, tools, errors and extensions are parsed per choice for both SSE and non-stream JSON. Unknown fields are preserved only through bounded extension records/diagnostics.

## 12. Reasoning Priority and Conflict Rules

| Mode/state | Behavior |
| --- | --- |
| No custom mapping | built-in `reasoning` → `reasoning_content` → `thinking` → inline |
| `custom_preferred_with_builtin_fallback` | custom evaluated first while unselected; built-in candidates may lock when custom has no valid value in that event |
| `custom_only` | only configured custom path participates; all built-ins and inline parser are skipped for that response |
| Locked | only locked source updates the stable block; later sources become diagnostics |
| Final | may confirm/complete/replace the same locked source; cannot select a new source; empty final cannot clear stream text |

Each choice owns an independent source-selection state. The first valid candidate locks once. Equivalent duplicates are suppressed. Different values are never concatenated. Conflicts include `multiple_sources_in_same_event`, `duplicate_equivalent_source`, `different_value_source`, `late_higher_priority_source`, `late_lower_priority_source`, `final_source_mismatch`, `custom_and_builtin_overlap`, and `structured_and_inline_overlap`.

Only one custom reasoning mapping version is active in a response profile, removing ambiguous custom-vs-custom ordering. A profile edit creates a new version.

## 13. Custom Reasoning Mapping Contract

The persisted contract includes mapping/version, D15 mode, stream path/mode/textPath, optional final path/mode/textPath, semantic, and replay config. Invalid DSL, semantic/type mismatch, illegal wildcard/prototype access, incompatible append/snapshot configuration or unsafe tag/path size fails at save/preflight/send and never falls back at runtime.

## 14. Reasoning History Replay Rules

Default is `historyReplay.mode=disabled`, `scope=never`. Parsing, display and local persistence do not imply replay. Explicit future-message profiles may use `assistant_field` or `assistant_content_tags` with scope `tool_call_chain_only` or `all_assistant_messages`. Tool-chain replay requires explicit profile declaration. Route provenance pins the exact profile/mapping/mode used at send time. Old messages are not reinterpreted after profile edits.

## 15. Inline Think State Transitions

| State | Input | Transition/action |
| --- | --- | --- |
| `content` | possible start prefix outside code fence | buffer → `possible_start_tag` |
| `possible_start_tag` | full allowed start tag | open stable segment → `reasoning` |
| `possible_start_tag` | mismatch | flush buffered bytes to content → `content` |
| `reasoning` | possible end prefix | buffer → `possible_end_tag` |
| `possible_end_tag` | full matching end tag | close segment → `content` |
| `possible_end_tag` | mismatch | flush buffered bytes to current reasoning segment |
| `content` | opening/closing Markdown fence | emit fence literally and enter/leave `code_fence` |
| `code_fence` | any tag text | literal content only |
| any | abort/EOF with incomplete tag | conservatively restore unmatched tag and buffered text to content; emit bounded conflict diagnostic |
| any | terminal | reconcile only the locked source; preserve stable block IDs |

Unmatched end tags are literal content. Nested starts inside reasoning remain literal reasoning text and record a conflict. Multiple complete segments create deterministic block IDs from message ID, choice index, source and segment ordinal; never one block per token. Tool and text/reasoning events share a monotonic sequence so interleaving is replayable.

## 16. Custom Tag Safety Rules

- Canonical `<think>...</think>` is always supported globally.
- `custom_only` is a per-response source policy, not a global parser-disable switch.
- Custom pairs are additive static strings; no regex, script or fuzzy matching.
- Validate count ≤ 16, each tag length 1–128 UTF-8 bytes, start/end non-empty and distinct, no prefix ambiguity across active tags, no canonical-tag removal, and total matcher state ≤ 4 KiB.
- Tags inside Markdown fenced code are literal. HTML/XML examples outside fences use conservative complete-pair parsing; incomplete pairs restore to content with diagnostics.

## 17. Unknown Field Discovery Rules

Observe after wire validation but before semantic dropping. Aggregate by response profile version and normalized stream/final path. Candidate confidence uses non-empty sample count, type stability, before/alongside-content position and stream/final pairing; provider/model/URL names never affect confidence. Built-in reasoning fields are handled by built-ins, not discovery. Refusal, citation, audio, trace, status and metadata strings are excluded from automatic reasoning candidacy.

Discovery never changes the current response, never auto-saves a mapping, and never opens a modal. Users may confirm a candidate to create a new response-profile/mapping version effective only for future sends, or add it to an ignore list.

## 18. Raw Extension Retention Rules

| Limit | Value |
| --- | --- |
| SSE event JSON payload | 1 MiB |
| Pending SSE parser buffer | 2 MiB |
| Non-stream response body | 16 MiB |
| Total streamed response bytes | 64 MiB |
| Durable raw extension per record | 16 KiB after redaction/coalescing |
| Durable extension records per response | 256 |
| Durable raw extension total per response | 256 KiB |
| Discovery sample preview | 4 KiB per path |
| Discovery candidates per profile version | 128 |

Repeated append deltas for the same choice/path/semantic are coalesced by sequence range. Snapshot values replace only the prior snapshot aggregate for that path. Overflow records a count/hash/type summary and `dropped` state. Secret-like fields are removed before persistence. Opaque/signature/encrypted-like values stay diagnostic and never enter Markdown or reasoning text.

## 19. URL and Network Security Matrix

| Concern | Required behavior |
| --- | --- |
| Scheme | allow HTTP/HTTPS; HTTP persistent inline warning only |
| URL | reject userinfo/query/fragment; canonical API root; static query stored separately |
| Address classes | block loopback, unspecified, multicast, link-local, carrier-grade/private IPv4, unique-local/private IPv6, IPv4-mapped IPv6 equivalents |
| DNS | resolve all answers through the governed session; one blocked answer blocks the request |
| Proxy route | preserve explicit `system` / `manual` / `environment` / `direct` selection and the existing dual-transport architecture; security policy never substitutes for or rewrites the route |
| Compatibility-first | retain the selected route's native transport behavior; validate all DNS answers before the first request and after every redirect; do not claim connect-time proof |
| Strict SSRF | transport must prove it consumed the request/hop validated-address lease; otherwise typed block before egress, credentials or body with no fallback |
| Rebinding | strict mode proves lease consumption; compatibility-first repeats the contracted pre-request/per-redirect checks without an unchecked policy switch |
| Redirect | manual, maximum 5; re-canonicalize and revalidate each hop; block cross-origin credential forwarding and method-changing POST redirects |
| Transport | preserve the existing explicit proxy-route-to-transport selection; no renderer transport and no silent route/transport fallback |
| Credentials | inject only after final target/header validation; never query; never forward cross-origin |
| TLS | retain Electron certificate validation; surface provider-neutral TLS error |
| Timeouts | catalog 30s overall; chat 30s to headers, 60s idle, 30m overall, all abortable and bounded |
| Lifecycle | request registry keyed by WebContents/request; abort on user stop, timeout and WebContents destruction |
| Size | enforce Section 18 before allocation growth |
| Logging | safe origin/path summary; redact query values, headers, body, outputs and credential material |

The production transport chain is renderer → preload → typed IPC → main broker → explicitly selected existing proxy route/transport → independent endpoint security policy → address/redirect policy → parser. Renderer direct fetch, LocalEndpoint transport and network-egress exceptions remain forbidden. `compatibility_first` is accepted only as pre-request/per-redirect validation retaining native route behavior; `strict_ssrf` may pass only with adversarial proof of lease consumption and otherwise must block before egress. Neither policy may silently select the other policy, another proxy route or another transport.

## 20. Route Provenance Lifecycle

1. User selects merged `(providerInstanceId, modelId)`.
2. Main/repository resolves immutable endpoint, credential, request/response/reasoning/inline profile versions.
3. In one DB transaction, create user/assistant choice rows plus `CompatibleRouteProvenance` in `prepared` state before network start.
4. Outbound request may begin only after provenance commit succeeds.
5. State transitions are `prepared → streaming → completed|failed|aborted|interrupted` and are idempotent.
6. Every event and persisted block is scoped to route, message and choice index.
7. Retry/regenerate/edit resend starts a new route pinned to the historical route contract unless the user explicitly creates a new send with a newly selected provider/model.
8. Endpoint/profile/credential edits create new versions; old routes do not dynamically update.
9. Provider deletion tombstones new-send availability. Credential deletion blocks dependent replay with a readable error; no fallback.
10. Startup recovery changes orphan `prepared/streaming` routes to `interrupted` without fabricating completion and offers only contract-valid retry.

## 21. Destructive Reset Impact Matrix

| Data | Action | Predicate |
| --- | --- | --- |
| Generic fixture code/tests | delete | entire approved fixture stack |
| Generic/custom aliases and source guards | delete | compatibility-only references |
| `openRouterBaseUrl` custom identity | delete config identity | preserve official OpenRouter credential unless independently orphaned |
| Legacy compatible config | delete | keys/records tied to removed identities |
| Compatible credentials | delete only when orphaned/legacy | never bulk-delete native provider credentials |
| Model preferences | reset | provider key/model key belongs to removed compatible identities |
| Catalog/cache | reset | scope belongs only to removed compatible identities |
| Conversations/messages | reset targeted | providerless/legacy-compatible route or incompatible attached data would misroute under new contract |
| Streaming rows | reset/finalize as deleted | incomplete and missing required provenance |
| File assets/projects | retain | independent of removed routes |
| Native provider chats/settings | retain | have valid native identity and are unaffected |
| LocalEndpoint data | retain | independent product, no coupling deletion beyond aliases |

Reset algorithm: produce a dry-run census; validate predicates and preservation set; stop on ambiguous ownership; transactionally delete affected SQLite rows in FK order; remove legacy config/localStorage keys; delete only proven orphan secure refs; rebuild affected indexes/catalog views; run post-reset orphan and preservation assertions; write a redacted count report. A full database wipe is prohibited.

## 22. Provider-neutral Error Taxonomy

`compatible_config_invalid`, `compatible_url_invalid`, `compatible_address_blocked`, `compatible_dns_rebinding_blocked`, `compatible_strict_ssrf_unavailable`, `compatible_redirect_blocked`, `compatible_proxy_route_invalid`, `compatible_transport_unavailable`, `compatible_request_capacity`, `compatible_credential_missing`, `compatible_auth_invalid`, `compatible_header_forbidden`, `compatible_query_invalid`, `compatible_extra_body_conflict`, `compatible_request_mapping_invalid`, `compatible_response_overflow`, `compatible_sse_overflow`, `compatible_http_auth`, `compatible_http_rate_limit`, `compatible_http_provider`, `compatible_json_malformed`, `compatible_sse_malformed`, `compatible_response_unsupported`, `compatible_tool_delta_invalid`, `compatible_reasoning_mapping_invalid`, `compatible_inline_conflict`, `compatible_extension_overflow`, `compatible_timeout`, `compatible_aborted`, `compatible_window_destroyed`, `compatible_network_proxy_tls`, `compatible_network_unknown`, and `compatible_catalog_sync_failed`.

Errors have distinct user message, configuration hint, safe log detail and bounded diagnostics. No `openrouter` field/name is allowed in the new provider's error or wire types.

## 23. Test Coverage Matrix

| Layer | Mandatory coverage |
| --- | --- |
| Unit | identity, merge/provenance, request ownership/mappings, auth/header/query/URL, SSE/JSON, multi-choice, tools, D15 source lock, inline state machine, discovery, raw limits, errors |
| Repository/DB | fresh schema, FKs/cascades/restrict, version pins, remote/manual isolation, reset, crash recovery, raw/discovery limits |
| IPC/network | typed renderer/preload/main; exact D16 route/transport selection; `compatibility_first` pre-request and per-redirect address audit; `strict_ssrf` proven lease consumption or typed pre-body/pre-credential/pre-egress block; timeout/abort/window destruction; secret redaction; egress gate |
| Integration | CRUD, sync/manual merge, picker, stream/non-stream, tools, all reasoning sources/modes, extraBody/mapping, persistence/reload, historical operations |
| Electron/Playwright | complete user flow through restart using only local mock servers and mock DNS/redirect policy |
| Optional live smoke | designed fixtures for standard/reasoning variants/custom tags/custom fields/tools/non-stream/unknown fields; never required in Goal 1 |

## 24. Implementation Milestones and Dependency Graph

```text
TP-01 legacy excision
  → TP-02 domain + fresh schema
      → TP-03 registry + credentials
          → TP-04 endpoint revision + atomic provenance
          → TP-05 governed network security
          → TP-06 scoped merged catalog (also depends on TP-05)
      → TP-07 request/message builder (depends on TP-03/04)
      → TP-08 wire parser/error model (depends on TP-05)
          → TP-09 tool contract
          → TP-10 extension/raw/discovery core
              → TP-11 reasoning mapping/source lock
                  → TP-12 inline parser/custom tags
                      → TP-13 display/persistence/reload
                          → TP-14 CRUD/catalog/profile/diagnostics UI
                              → TP-15 production send + historical lifecycle
                                  → TP-16 targeted reset + final legacy cleanup
                                      → TP-17 full acceptance and closeout
```

No production compatible send route exists before TP-15. TP-15 is blocked unless TP-02, TP-04 and TP-05 acceptance is green.

## 25. Final Acceptance Criteria

1. Exactly one compatible protocol key exists and no alias/default/fallback reconstructs it.
2. Multiple instances and models are scoped by immutable IDs and endpoint revisions.
3. Secrets never enter renderer, SQLite, query, logs, errors or raw diagnostics.
4. HTTP warns persistently but remains usable; private/loopback/link-local/rebinding/unsafe redirects are blocked.
5. Production egress preserves D16: `system` uses Electron session transport, while `manual`, `environment`, and `direct` use the retained Node/Undici transport family. `compatibility_first` performs pre-request/per-redirect checks; `strict_ssrf` requires proven lease consumption and otherwise blocks before credentials, body, or egress.
6. Remote/manual catalog merge is deterministic, source-preserving and failure-safe.
7. Builder covers the frozen parameter matrix, preserves unset/explicit/default and never silent-drops.
8. SSE and non-stream parsers cover all required boundaries, multiple choices and unknown extensions.
9. Tools are fully parsed and persisted in observe-only mode; no silent loss or unapproved execution.
10. Request reasoning mappings never derive from response mappings.
11. Exactly two custom reasoning modes exist; per-choice source locks once and never switches or merges.
12. Structured reasoning suppresses inline parsing; `custom_only` skips built-ins/inline for that response; canonical inline support has no global off switch.
13. Reasoning/content/tool/usage/raw extensions persist and reload consistently without token-per-block behavior.
14. Unknown discovery is bounded, redacted, non-modal and never changes current semantics.
15. Provenance is committed before fetch and survives crash, retry, regenerate, edit resend, endpoint/profile edits and reload.
16. UI completes provider CRUD, auth/header/query, profiles, catalog merge, picker, diagnostics and HTTP warning flows.
17. Targeted reset removes only affected legacy-compatible data and proves preservation of native, LocalEndpoint, assets and unrelated projects.
18. No Generic fixture, duplicate mapper, OpenRouter-shaped new-provider error, compatibility source guard, temporary alias, dual path or fallback remains.
19. Unit, DB, IPC/network, integration and Electron/Playwright gates pass; optional live smoke design exists but is not executed in planning.
20. D15 diagnostics prove selected source, mode and version; reload/retry never reinterpret with a later profile.

## 26. Non-goals and prohibitions

- No native provider refactor except removing erroneous shared/default/alias coupling required by this rebuild.
- No LocalEndpoint refactor or reuse.
- No migration compatibility layer for old compatible chats/config.
- No automatic provider/model/URL-based semantic guessing.
- No script, regex, JSONPath execution, template evaluation, dynamic JavaScript, user code or prototype-chain path access.
- No production implementation, schema edit, fixture edit, staging or commit in Goal 1.

## Generation V2 Wire Adapter Supersession (2026-08-17)

The Generation V2 implementation supersedes any earlier plan text that treats
request mappings or codec profiles as model capability authorities. V2 keeps
only structural wire mapping (`sourceField`, `targetPath`, `omission`) and
writes the validator-approved source value unchanged. `valueKind`,
`valueMapping`, alias normalization, clamping, implicit defaults, and old
configuration decoding are out of scope. The final semantic/domain decision
belongs to `ResolvedCapabilityV2`; `EncodingCoverageRegistryV2` is code
coverage provenance only.
