# OpenAI Chat Completions-compatible Decision Coverage Matrix

## Status and rules

- Authoritative source: `OPENAI_CHAT_COMPATIBLE_OWNER_DECISIONS.md` (2,190 lines).
- Coverage unit: one frozen, independently testable obligation; section labels alone do not count as coverage.
- `Primary TP` owns implementation and acceptance. `Supporting TP` may supply prerequisites or end-to-end proof.
- Status `planned-closed` means the decision is frozen, has one primary owner, concrete gates and no remaining product choice. It does not mean implementation exists.
- Status `implemented-verified` means the primary task package implementation and package gates are green; listed supporting packages must still reverify their downstream integration obligations.
- D15 overrides any earlier wording that could permit custom reasoning to change source mid-response or silently fall back in `custom_only` mode.

## D1 — Protocol scope (Owner lines 72–100)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D1-01 | Target only cloud OpenAI Chat Completions-compatible request/stream semantics. | TP-07 | TP-08, TP-15 | canonical builder/parser integration | implemented-verified |
| FD-D1-02 | Responses, OpenRouter, DeepSeek native, Anthropic, Gemini, Ollama and local protocols are not target semantics. | TP-01 | TP-15, TP-16 | negative route/import/source gates | implemented-verified |
| FD-D1-03 | Shared code must be genuinely provider-neutral; no implicit bridge or fallback is allowed. | TP-01 | TP-08, TP-15 | dependency and fallback absence tests | implemented-verified |

## D2 — Multi-provider and identity (Owner lines 101–156)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D2-01 | Canonical protocol key is `openai_chat_compatible`. | TP-02 | TP-01, TP-15 | runtime/schema exhaustive-key tests | implemented-verified |
| FD-D2-02 | Support multiple independently named provider instances. | TP-03 | TP-14, TP-15 | two-instance CRUD/send tests | implemented-verified |
| FD-D2-03 | Provider instance, endpoint revision and model identities are distinct and stable. | TP-04 | TP-02, TP-06 | identity/FK/immutability tests | implemented-verified |
| FD-D2-04 | Endpoint/model selection cannot cross instance scope. | TP-06 | TP-14, TP-15 | same-model-ID isolation tests | implemented-verified |
| FD-D2-05 | Delete aliases, default-provider behavior and ambiguous legacy identities. | TP-01 | TP-16 | full-source negative gates | implemented-verified |

## D3 — Model sources and merged catalog (Owner lines 157–196)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D3-01 | Models may come from remote `/models` and manual entries. | TP-06 | TP-14 | remote/manual repository and UI tests | implemented-verified |
| FD-D3-02 | Merge is deterministic and source provenance is retained. | TP-06 | TP-14 | conflict-order/provenance tests | implemented-verified |
| FD-D3-03 | Model identity remains endpoint-instance scoped throughout picker, conversation and send. | TP-06 | TP-04, TP-15 | end-to-end route isolation | implemented-verified |
| FD-D3-04 | Capability, context and price remain unknown unless explicitly sourced; no other-provider inheritance. | TP-06 | TP-14 | unknown/provenance tests | implemented-verified |
| FD-D3-05 | Catalog cache/snapshot identity is stable instance scope, not credential fingerprint. | TP-06 | TP-02 | cache rotation/isolation tests | implemented-verified |

## D4 — Authentication and custom fields (Owner lines 197–247)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D4-01 | Support Bearer, Basic, sensitive-header credential bundles and no-auth. | TP-03 | TP-14, TP-15 | credential-mode integration tests | implemented-verified |
| FD-D4-02 | Secrets are main-process/secure-store owned and never revealable to renderer. | TP-03 | TP-14, TP-17 | preload contract and redaction tests | implemented-verified |
| FD-D4-03 | Support non-secret custom headers and static non-secret query parameters with deny rules. | TP-03 | TP-05, TP-07, TP-14 | validation/merge/wire tests | implemented-verified |
| FD-D4-04 | API keys and secret values are forbidden in URL/query/log/error/raw persistence. | TP-05 | TP-03, TP-10, TP-17 | adversarial leak searches/tests | implemented-verified |

## D5 — URL and network security (Owner lines 248–305)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D5-01 | Base URL normalization and Chat Completions/models path composition are explicit and testable. | TP-05 | TP-06, TP-07 | URL matrix tests | implemented-verified |
| FD-D5-02 | Cloud transport preserves explicit system/manual/environment/direct proxy routing and the existing dual-transport architecture. | TP-05 | TP-15, TP-17 | route/transport cross-product and egress integration | implemented-verified |
| FD-D5-03 | `strict_ssrf` requires proven lease consumption and blocks before egress when the selected transport cannot prove it. | TP-05 | TP-17 | rebinding/lease capability/typed-block tests | implemented-verified |
| FD-D5-05 | `compatibility_first` retains native selected-route behavior and checks all addresses before the first request and after every redirect without claiming connect-time proof. | TP-05 | TP-15, TP-17 | route-preservation/redirect/address tests | implemented-verified |
| FD-D5-06 | Security policy is independent from proxy route; neither axis nor transport may silently switch, fallback or downgrade. | TP-05 | TP-14, TP-15, TP-17 | schema/UI/runtime cross-product tests | implemented-verified |
| FD-D5-04 | Plain HTTP is explicit and persistently warned; LocalEndpoint stays independent and is never fallback. | TP-14 | TP-01, TP-05, TP-16 | warning and separation tests | implemented-verified |

## D6 — Request extension mode (Owner lines 306–378)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D6-01 | Builder owns standard fields and records their configured/unset/default state. | TP-07 | TP-02 | field-state matrix tests | implemented-verified |
| FD-D6-02 | `extraBody` is declarative bounded JSON with deterministic merge ownership. | TP-07 | TP-14 | collision/prototype/depth tests | implemented-verified |
| FD-D6-03 | Unsupported or conflicting fields fail before fetch; no silent drop/rewrite. | TP-07 | TP-15 | no-fetch failure tests | implemented-verified |
| FD-D6-04 | No scripts, templates or arbitrary code execute in request customization. | TP-07 | TP-14, TP-17 | schema/UI/security tests | implemented-verified |

## D7 — Reasoning/thinking overall contract (Owner lines 379–416)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D7-01 | Reasoning extraction is provider-neutral, profile-driven and separate from body text. | TP-11 | TP-10, TP-13 | mapping/event/persistence tests | implemented-verified |
| FD-D7-02 | Structured fields, inline tags and final snapshots reconcile without duplicated正文. | TP-11 | TP-12, TP-13 | stream/final conflict tests | implemented-verified |
| FD-D7-03 | Unknown fields enter bounded diagnostics/discovery rather than disappearing. | TP-10 | TP-13, TP-14 | discovery/raw limit tests | implemented-verified |
| FD-D7-04 | Reasoning is not assumed to be replayed into the next turn. | TP-13 | TP-07 | history projection tests | implemented-verified |

## D8 — Custom reasoning field mapping (Owner lines 417–490)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D8-01 | Mapping paths are declarative, versioned and choice-scoped. | TP-11 | TP-02, TP-14 | validator/version tests | implemented-verified |
| FD-D8-02 | Mapping supports allowed value shapes and rejects invalid configuration before send. | TP-11 | TP-10, TP-15 | shape/no-fetch tests | implemented-verified |
| FD-D8-03 | Selected source and mapping version persist with response/choice. | TP-13 | TP-04, TP-11 | DB/reload tests | implemented-verified |
| FD-D8-04 | UI exposes explicit response mapping without provider/model hardcoding. | TP-14 | TP-11 | component and negative heuristic tests | implemented-verified |

## D9 — Inline `<think>` parser (Owner lines 491–551)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D9-01 | Canonical `<think>` support always exists; custom tag pairs are additive and bounded. | TP-12 | TP-14 | policy validator tests | implemented-verified |
| FD-D9-02 | Parser is a chunk-safe UTF-8 state machine, not regex. | TP-12 | TP-08 | exhaustive split tests | implemented-verified |
| FD-D9-03 | Code fences, literals, nested/repeated/unmatched tags and EOF have deterministic handling. | TP-12 | TP-13 | adversarial parser/reload tests | implemented-verified |
| FD-D9-04 | Stable segments/blocks preserve global content-reasoning-tool order without token-per-block output. | TP-12 | TP-13 | ordering/block-ID tests | implemented-verified |

## D10 — Unknown field discovery (Owner lines 552–601)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D10-01 | Discover only bounded candidate fields/shapes with redacted previews. | TP-10 | TP-14 | cardinality/size/redaction tests | implemented-verified |
| FD-D10-02 | Discovery is diagnostic, not automatic active-profile mutation. | TP-10 | TP-14 | accept/ignore workflow tests | implemented-verified |
| FD-D10-03 | Accepted mappings create new immutable profile versions. | TP-14 | TP-11 | versioning tests | implemented-verified |

## D11 — Request-side reasoning mapping (Owner lines 602–665)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D11-01 | Request reasoning customization is declarative, versioned and separate from response extraction. | TP-07 | TP-02, TP-14 | profile/ownership tests | implemented-verified |
| FD-D11-02 | Standard/extra-body ownership collisions fail deterministically before fetch. | TP-07 | TP-15 | collision/no-fetch tests | implemented-verified |
| FD-D11-03 | No provider/model-name heuristics or arbitrary transform code determine reasoning request fields. | TP-07 | TP-14, TP-17 | negative source/security tests | implemented-verified |

## D12 — Generic extension extraction architecture (Owner lines 666–705)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D12-01 | Wire parser preserves ordered standard and extension candidates independent of UI/provider. | TP-08 | TP-10 | chunk/field-order tests | implemented-verified |
| FD-D12-02 | Extension extraction is a bounded provider-neutral contract, not the runtime-dead Generic adapter. | TP-10 | TP-01, TP-08 | dependency and fixture replacement gates | implemented-verified |
| FD-D12-03 | Malformed/unknown extension values produce diagnostics without corrupting standard content. | TP-10 | TP-13 | malformed-event tests | implemented-verified |

## D13 — Raw extension retention (Owner lines 706–741)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D13-01 | Raw extensions are redacted, bounded, choice/sequence scoped and separately retained. | TP-10 | TP-13 | size/count/redaction DB tests | implemented-verified |
| FD-D13-02 | Standard text/tool/usage fields and secrets are excluded from raw diagnostic duplication. | TP-10 | TP-13, TP-17 | field-policy/leak tests | implemented-verified |
| FD-D13-03 | Retention/cleanup is explicit and targeted reset removes incompatible raw rows. | TP-13 | TP-16 | retention/reset tests | implemented-verified |

## D14 — Destructive rebuild principles (Owner lines 742–799)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D14-01 | No old implementation, provider key, config or historical chat compatibility is required. | TP-01 | TP-16 | negative reader/alias gates | implemented-verified |
| FD-D14-02 | Build one canonical path; no adapter/fallback/dual-track migration. | TP-15 | TP-01, TP-16 | runtime branch tests | implemented-verified |
| FD-D14-03 | Fresh schema and targeted destructive reset replace migration preservation. | TP-02 | TP-16 | fresh/reset equivalence tests | implemented-verified |
| FD-D14-04 | Preserve unrelated native-provider, LocalEndpoint, project and asset state. | TP-16 | TP-17 | mixed-data preservation tests | implemented-verified |

## D15 — Custom reasoning parsing modes (Owner lines 1792–2190)

| ID | Frozen obligation | Primary TP | Supporting TP | Required proof | Status |
| --- | --- | --- | --- | --- | --- |
| FD-D15-01 | Exactly two modes exist: custom-first-with-general-fallback and custom-only. | TP-11 | TP-14 | enum/UI/exhaustiveness tests | implemented-verified |
| FD-D15-02 | No third mode, per-event switch, provider/model heuristic or silent mode downgrade exists. | TP-11 | TP-14, TP-17 | negative source/UI tests | implemented-verified |
| FD-D15-03 | Mapping configuration stores mode, ordered paths, value rules and immutable version. | TP-11 | TP-02, TP-14 | profile schema/validator tests | implemented-verified |
| FD-D15-04 | Source selection is per choice and locks on the first valid selected source. | TP-11 | TP-08, TP-13 | multi-choice/source-lock tests | implemented-verified |
| FD-D15-05 | Custom-first tries custom paths in order, then built-in structured paths, then inline only when no valid earlier source exists. | TP-11 | TP-12 | precedence matrix tests | implemented-verified |
| FD-D15-06 | Custom-only skips built-ins and inline for that response; it does not globally disable canonical inline capability. | TP-11 | TP-12, TP-14 | custom-only isolation tests | implemented-verified |
| FD-D15-07 | Empty/null/invalid candidate values do not lock; invalid configuration blocks before fetch. | TP-11 | TP-10, TP-15 | value/config/no-fetch tests | implemented-verified |
| FD-D15-08 | Later competing sources never switch or duplicate output; conflicts become diagnostics/raw evidence. | TP-11 | TP-10, TP-13 | cross-chunk/final conflict tests | implemented-verified |
| FD-D15-09 | Final snapshots reconcile only against the locked source and cannot retroactively choose another source. | TP-11 | TP-08, TP-13 | stream/final reconciliation tests | implemented-verified |
| FD-D15-10 | UI exposes the two modes and ordered mappings but not internal source-lock state as a control. | TP-14 | TP-11 | component/contract tests | implemented-verified |
| FD-D15-11 | Selected source, mode, mapping version and conflicts survive persistence/reload and end-to-end tests. | TP-13 | TP-15, TP-17 | DB/Electron round trips | implemented-verified |

## Architecture, test, documentation and ordering obligations

| ID | Source lines | Frozen obligation | Primary TP/document | Supporting proof | Status |
| --- | --- | --- | --- | --- | --- |
| ARCH-01 | 821–844 | Canonical terminology and system boundary. | TP-02 | master identity map | implemented-verified |
| ARCH-02 | 845–882 | Provider instance/revision/profile/route domain model. | TP-02 | TP-03, TP-04 | implemented-verified |
| ARCH-03 | 883–922 | Fresh persistence design and ownership. | TP-02 | TP-13, TP-16 | implemented-verified |
| ARCH-04 | 923–954 | Instance-scoped merged model catalog. | TP-06 | TP-14 | implemented-verified |
| ARCH-05 | 955–1004 | Complete safe configuration and selection UI. | TP-14 | TP-03, TP-06 | implemented-verified |
| ARCH-06 | 1005–1051 | Deterministic Chat Completions request builder. | TP-07 | TP-15 | implemented-verified |
| ARCH-07 | 1052–1081 | Message/tool contract. | TP-09 | TP-13, TP-15 | implemented-verified |
| ARCH-08 | 1082–1130 | SSE and non-stream response architecture. | TP-08 | TP-15 | implemented-verified |
| ARCH-09 | 1131–1179 | Extension/reasoning extraction and display separation. | TP-10 | TP-11, TP-13 | implemented-verified |
| ARCH-10 | 1180–1209 | Inline state machine. | TP-12 | TP-13 | implemented-verified |
| ARCH-11 | 1210–1229 | Unknown-field diagnostics/discovery. | TP-10 | TP-14 | implemented-verified |
| ARCH-12 | 1230–1277 | Governed network/security boundary. | TP-05 | TP-15, TP-17 | implemented-verified |
| ARCH-13 | 1278–1312 | Immutable route provenance. | TP-04 | TP-13, TP-15 | implemented-verified |
| ARCH-14 | 1313–1348 | Targeted delete/reset design. | TP-16 | TP-02, TP-17 | implemented-verified |
| ARCH-15 | 1349–1393 | Provider-neutral error/diagnostics taxonomy. | TP-08 | TP-05, TP-15 | implemented-verified |
| TEST-UNIT | 1394–1440 | Unit coverage for builders/parsers/mappings/policies. | TP-17 | TP-05–TP-12 | implemented-verified |
| TEST-DB | 1441–1474 | Schema/repository/round-trip/reset coverage. | TP-17 | TP-02, TP-13, TP-16 | implemented-verified |
| TEST-NET | 1475–1504 | IPC, proxy, SSRF, redirect, abort and leak coverage. | TP-17 | TP-05, TP-15 | implemented-verified |
| TEST-INT | 1505–1533 | Full mocked integration coverage. | TP-17 | TP-15 | implemented-verified |
| TEST-E2E | 1534–1552 | Electron/Playwright local-mock user journeys. | TP-17 | TP-14, TP-15 | implemented-verified |
| TEST-LIVE | 1553–1572 | Live smoke is optional, owner-operated and never an automated dependency. | TP-17 | master test matrix | implemented-verified |
| PLAN-ORDER | 1573–1624 | Dependency order and first-send gate are fixed. | `REBUILD_MASTER_PLAN.md` | task-package README | implemented-verified |
| PLAN-PACKAGE | 1625–1685 | Every implementation unit is a closed package with prerequisites, tests and prohibitions. | task-package README | TP-01–TP-17 | implemented-verified |
| DOC-TABLES | 1625–1685 | Required decision/architecture/reset/test tables exist in the planning SSOT. | `REBUILD_MASTER_PLAN.md` | this matrix | implemented-verified |
| DOC-SSOT | 1625–1685 | Owner source remains authority; plan records frozen interpretation without reopening choices. | `REBUILD_MASTER_PLAN.md` | ledger and matrix | implemented-verified |
| ACCEPT-GLOBAL | 1686–1779 | Final report includes state, coverage, architecture, classification, milestones, tests and open questions. | TP-17 | all packages | implemented-verified |
| SCOPE-NONIMPLEMENTATION | 800–820 | The completed planning Goal changed planning documents only; Goal 2 implementation is recorded separately in this ledger and working tree. | `PROGRESS_LEDGER.md` | Git scope audit | implemented-verified |
| NET-D16 | D16 | Preserve `system` → Electron session and `manual` / `environment` / `direct` → Node/Undici; keep `compatibility_first` and `strict_ssrf` orthogonal with no switching or downgrade. | TP-05, TP-15 | transport/preflight/egress tests | implemented-verified |
| SESSION-NEW | provider-neutral New lifecycle ADR | One hidden persistent template owns pre-send state; first send atomically creates the Inbox conversation, branch, user, assistant, bindings and Compatible route provenance before builder/credential/transport. | `docs/architecture/chat/new-chat-template/ADR-001-persistent-hidden-new-chat-template.md` | DB/UI/runtime tests | implemented-verified |

## Coverage audit

| Measure | Result |
| --- | --- |
| Frozen D1–D16 obligations | 65 |
| Architecture/test/order/document obligations | 28 |
| Total independently owned rows | 93 |
| Rows without a primary owner | 0 |
| Rows without required proof | 0 |
| Reopened Owner choices | 0 |
| Unresolved Owner decisions | 0 |

At planning closeout TP-01 was the next executable unit. Current execution status is authoritative only in the task-package README and `PROGRESS_LEDGER.md`; implementation completion must replace every `planned-closed` status with source and test evidence, and documentation status alone is never implementation acceptance.
