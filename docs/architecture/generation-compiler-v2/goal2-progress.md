# Generation Compiler V2 — Goal 2 Progress

> Goal 2 implements the Goal 1 plan on `main`. This ledger is updated immediately after each completed implementation or verification step.

## Baseline

- Repository: `D:\Starverse`
- Branch: `main`
- Goal 2 baseline SHA: `5b873c5384dad4ac512788ed8223ee5e6ac2885e`
- `origin/main` at start: `fd65a8023849e0079569b5f8320d8748b55fff6e`
- Worktree/index/untracked state at start: clean (`git status --porcelain=v1 -uall` count = 0)
- Started: 2026-07-13 (Asia/Shanghai)
- Sole implementation baseline: this directory's final plan, TP1–TP8, traceability matrix, and AC-01…AC-42.
- Production constraints: no compatibility layer, dual read/write, fallback, unknown wire patch, silent parameter drop/downgrade, or temporary provider bridge.

## Phase status

| Phase | State | Evidence / output |
|---|---|---|
| G2-0 Baseline and implementation map | Complete — awaiting Gate 0 Owner decisions before production edits | Goal 1 artifacts read in full; command, epoch/reset/credential, provider/request, deletion and test maps captured |
| G2-1 Epoch-2 workspace and destructive reset | Pending | TP2, AC-01…AC-06 |
| G2-2 Semantic intent, capability, persistence, UI projection | Pending | TP3/TP4 |
| G2-3 Compiler, ledger, snapshot, prepared request | Pending | TP5 |
| G2-4 Provider typed codecs and native transports | Pending | TP6/TP7 |
| G2-5 Native streaming decode and continuation | Pending | TP3/TP6/TP7 |
| G2-6 Unified commands and legacy deletion | Pending | TP1/TP5/TP8 |
| G2-7 Full AC-01…AC-42 acceptance and smoke | Pending | TP8 and traceability matrix |

## Changed files

- `docs/architecture/generation-compiler-v2/goal2-progress.md` — Goal 2 durable progress ledger (created).
- `docs/architecture/generation-compiler-v2/goal2-gate0-contract-audit.md` — current official contract audit and post-Goal-1 blocking conflicts.
- `docs/architecture/generation-compiler-v2/evidence/openrouter-images-provider-tag-smoke-20260714.json` — retained negative evidence for incorrect top-level `provider_tag` only.
- `docs/architecture/generation-compiler-v2/evidence/openrouter-images-provider-only-smoke-20260714.json` — corrected documented-wire exact bodies/hashes, descriptors, redacted responses/metadata, costs, routing verdicts, and OpenAPI discrepancy.
- `docs/architecture/generation-compiler-v2/generation-compiler-v2-final-plan.md`, `tp4-capability-evidence-ui.md`, `tp6-openrouter-openai-contracts.md`, `tp8-cutover-tests-goal3.md`, and `traceability-matrix.md` — corrected endpoint-specific OpenRouter Images capability and pin semantics.

## Verification log

| Date | Command / check | Result | Notes |
|---|---|---|---|
| 2026-07-13 | Baseline Git inspection | Pass | `main=5b873c53`, clean worktree, `origin/main=fd65a802` |
| 2026-07-13 | Goal 1 implementation baseline read | Pass | Final plan, TP1–TP8, traceability matrix, and AC-01…AC-42 read in full |
| 2026-07-13 | Provider/request-path read-only map | Pass | Current builders, profiles, wire mapper, transports, decoders, continuation and tests mapped for every TP6/TP7 contract |
| 2026-07-13 | Generation command/continuation Gate 0 map | Pass | Existing three-command transaction and orphan-recovery skeleton identified; initial send/edit and V2 compiler/ledger remain outside it |
| 2026-07-13 | Epoch/reset/credential startup map | Pass | Pre-`whenReady` config mutation, legacy DB/assets/debug/temp/reset paths, exact five secure leaves, fresh-schema seam and conflicting tests mapped |
| 2026-07-13 | Gate 0 current official contract audit | Blocked as designed | OpenAI/Anthropic/Gemini/Ollama evidence refined; LM Studio native `store:false` and OpenRouter Images endpoint pin conflict with the frozen plan |
| 2026-07-14 | OpenRouter Images top-level `provider_tag` smoke | Negative field-placement result | Three successful generations all resolved to the same Google endpoint; proves only that top-level `provider_tag` is not the documented pin shape |
| 2026-07-14 | Smoke evidence integrity and document consistency | Pass | Three serialized-body hashes re-computed, total cost re-summed, JSON parsed, secrets/image bytes absent, local links/fences/diff checked, and current baseline updated without rewriting Goal 1 history |
| 2026-07-14 | OpenRouter Images routing correction | Reopened | Current official Image Generation docs explicitly define `provider.only` plus `allow_fallbacks:false`; the prior top-level `provider_tag` smoke did not test the documented wire shape, so endpoint-specific capability remains pending the corrected two-request smoke |
| 2026-07-14 | Corrected OpenRouter Images `provider.only` smoke | Pass; wire contract closed | AI Studio and Vertex Global both routed to distinct matching generation endpoints with `allow_fallbacks:false`; authenticated OpenRouter Logs independently labeled both providers |
| 2026-07-14 | LM Studio 0.4.19+ Responses exact-body qualification | Pass; binding fixed | Eleven local requests covered complete item replay, multi-turn, branches, audited fresh-process artifact reload, reasoning, function calls and provider SSE terminal shape; zero external cost |

## Smoke log

- OpenRouter Images Gate 0 smoke used the existing `electron_safe_storage` credential without persisting it. Dynamic discovery selected `google/gemini-3.1-flash-image`; exact requests tested baseline, `google-ai-studio`, and `google-vertex/global` top-level tags with `n=1`, `resolution=512`, and `aspect_ratio=1:1`.
- All three requests succeeded, cost USD 0.0448255 each (USD 0.1344765 total), and returned generation metadata with the same `provider_name=Google` and endpoint ID `275d7d39-ae50-4df3-8140-5dd69c3ab883`. The descriptor API exposes no endpoint ID, so neither tag produced independently attributable pin evidence; no repeat was needed because all cases were indistinguishable.
- Redacted descriptors, exact bodies/hashes, responses, metadata, cost, conclusion, and OpenAPI SHA-256 are in [`evidence/openrouter-images-provider-tag-smoke-20260714.json`](evidence/openrouter-images-provider-tag-smoke-20260714.json).
- Corrected smoke sent only two documented shapes. AI Studio returned `provider_name=Google AI Studio`, endpoint ID `a5c8267a-c7ec-42d3-9a53-08f34bce6af9`, cost USD 0.045996. Vertex Global returned `provider_name=Google`, endpoint ID `275d7d39-ae50-4df3-8140-5dd69c3ab883`, cost USD 0.0448255. Both were HTTP 200 with one provider response and distinct endpoint IDs; total was USD 0.0908215.
- Corrected exact bodies/hashes, redacted responses/metadata, current descriptors, OpenAPI SHA-256 `abaf90acc89dc3a2b4cd8824afcbf87734c8d0a5f4429ea85dca0d9eb02e353b`, and final routing verdict are in [`evidence/openrouter-images-provider-only-smoke-20260714.json`](evidence/openrouter-images-provider-only-smoke-20260714.json).
- LM Studio qualification used local `0.4.19+2`, CLI commit `9902c3a`, runtime `llama.cpp-win-x86_64-nvidia-cuda12-avx2@2.24.0`, and two local Qwen models. All eleven `/v1/responses` requests were HTTP 200, set `store:false`, omitted `previous_response_id`, and generated no external request or fee.
- Full item replay passed for text multi-turn, two branches, reasoning items and `function_call`/`function_call_output`. The restart audit recorded parent/child PIDs and a persisted-prefix hash before the fresh process replay. The provider stream emitted deltas and one final `response.completed`; Starverse terminal coordination remains an implementation acceptance test. Exact bodies/hashes and complete local response/SSE fields are in [`evidence/lmstudio-openresponses-compliance-20260714.json`](evidence/lmstudio-openresponses-compliance-20260714.json).

## Risks and blockers

- Gate 0 blocks production edits until the remaining Owner choices are frozen and recorded: canonical packaged `appId`; OpenRouter Images multiple-eligible-descriptor selection authority/tie-break; OpenAI continuation mode; OpenRouter beta server-tool exposure; automatic transport retry policy; image continuation first-release scope; Anthropic `thinking.display` exposure. Recommended defaults in the plan are not treated as implicit Owner decisions.
- `package.json` proves `productName: "Starverse"`; `electron-builder.json5` still contains `appId: "YourAppID"` and `productName: "YourAppName"`. No canonical appId was found in repository architecture/ADR sources, so the epoch root marker cannot safely be implemented by guessing one.
- Anthropic's exact current model × thinking × effort × sampling × web-tool matrix and Gemini Interactions continuation fields require fresh official-evidence fixtures before those contracts can be enabled; this is evidence work, not a reason to widen or fall back.
- Current official evidence closes most of the Anthropic matrix and proves `thinking.display` is a formal capability-gated field. Older basic web-search combinations without exact evidence remain unavailable.
- Resolved LM Studio decision: this tested endpoint binds `lmstudio-openresponses`. V2 must send `store:false`, never send `previous_response_id`, persist/replay the complete ordered native item union, and use a native Responses SSE decoder. `/api/v1/chat` is forbidden for ordinary multi-turn; `lmstudio-openai-chat-completions` is only the qualification-failure alternative for another endpoint, never a runtime fallback.
- LM Studio qualification failures are classified: auth/connect/timeout/5xx/model/runtime/cancel/inconclusive failures block and leave the endpoint unbound. Only a repeatable native-item contract failure on a healthy runtime permits a separately and explicitly initiated Chat Completions qualification; never in the same transaction and never automatically.
- Current production code does not yet satisfy that binding: it omits forced `store:false`, reduces Responses input to role/text, and sends Responses SSE through the Chat Completions mapper. The successful provider smoke authorizes the V2 contract, not the current implementation.
- Resolved wire contract: endpoint-specific Images routing is emitted only through typed `provider.only:[selectedDescriptor.provider_tag]` plus `allow_fallbacks:false`. The selected fresh descriptor must support the complete intent; top-level `provider_tag` is forbidden. The current readable docs define this contract while raw OpenAPI still exposes only `provider.options`, so exact-body fixtures and live regression are mandatory. Compile-time identity is the provider-owned tag/slug plus descriptor revision/digest, not the generation endpoint ID. Implementation remains blocked until the Owner freezes a deterministic authority/tie-break policy for multiple eligible descriptors.
- Current facts support but do not replace Owner choices: provider generation POSTs perform no automatic retry; OpenAI Responses has no native continuation artifact and replays only generic role/text history; Gemini Interactions image requests explicitly reject history; image regenerate is only question-level sibling generation.
- Current startup constructs and migrates `Store(config.json)` before `app.whenReady`, then opens `<userData>/chat.db`, runs legacy schema/ensure helpers, opens `<userData>/debug/generation-raw.sqlite`, registers IPC/window/jobs, and never owns an epoch marker/lock/journal. Epoch V2 must move config/service construction after a successful coordinator and must never call legacy credential read/migration APIs while filtering.
- The exact preservable records are `providerCredentials.v1.{openrouter,openai_responses,google_ai_studio,anthropic,deepseek}` with valid provider key, version 1, `electron_safe_storage`, non-empty ciphertext, valid timestamp, and successful decrypt. Plaintext fallback, legacy plaintext keys, catalog HMAC, compatible credentials, custom endpoints/secrets, and backups are deletion-only.
- Any official-contract conflict, reset path outside the managed epoch root, credential outside the closed preservation whitelist, or explicit semantic intent that a provider codec cannot express is a stop condition.
- `better-sqlite3` ABI must be switched deliberately: Node before DB/Vitest acceptance; Electron only for the final Electron smoke.

## Remaining work

1. Obtain and record the remaining Gate 0 Owner decisions listed below; no production edit is allowed before they are frozen.
2. Resolve the remaining Owner decisions and record the LM Studio fixed binding plus other decisions in the Gate 0 ADR.
3. Implement G2-1 through G2-7 without compatibility or fallback paths.
4. Close every AC with direct code/test/smoke evidence and run the complete gate sequence.

## Gate 0 Owner decision packet

| Decision | Plan-recommended value awaiting explicit approval |
|---|---|
| Canonical packaged identity | `productName = Starverse` is repository-proven; Owner must provide the exact stable `appId` (no inferred `com.*` value) |
| OpenRouter Images descriptor selection | Owner must choose the selection authority and deterministic tie-break when more than one fresh descriptor supports the complete intent; API order, observed price, and implicit provider preference are not defaults |
| OpenAI Responses continuation | Client-managed complete native response/reasoning/encrypted/tool/image items; no `previous_response_id` or conversation fallback |
| Ollama/local protocol binding | Every endpoint profile requires one explicit protocol choice; no probing/fallback to another codec |
| OpenRouter beta server web tool | Disabled by default; explicit experimental opt-in and capability/evidence gate |
| Automatic transport retry | Disabled for every provider; attempt remains 1 until a separately approved provider/error idempotency matrix exists |
| Image continuation first release | Enable only official native edit/continuation contracts with complete artifacts; otherwise visibly unavailable; sibling regenerate remains separate |
| Anthropic `thinking.display` | Owner must choose whether the capability-gated field is user-facing or compiler-unavailable; native continuation blocks are preserved either way |

## Update log

- 2026-07-13: Started Goal 2 on clean `main` at `5b873c5384dad4ac512788ed8223ee5e6ac2885e`; created this ledger before production changes.
- 2026-07-13: Read the complete Goal 1 implementation baseline. Confirmed its explicit Gate 0 rule forbids production edits before the remaining Owner choices are frozen; began read-only source mapping instead of guessing defaults.
- 2026-07-13: Completed the first provider-path map. Confirmed generic `wirePath`/request patch ownership, multiple body construction paths, missing OpenRouter Images contract, asymmetric native continuation, and extensive fallback/unknown-patch deletion work. No production file was changed.
- 2026-07-13: Mapped generation commands and continuation. Existing branch transactions already prove operation idempotency, strict chosen validation, immediate chosen/head switching, replace-hide, non-rollback terminal finalization, and orphan recovery, but remain V1 and omit initial send/edit, capability/config revision, request/attempt ledger, prepared bytes, and full projection return. Confirmed OpenAI/Gemini image continuation gaps and absence of automatic generation POST retry.
- 2026-07-13: Completed the epoch/reset/credential map. Confirmed the current module-load config migration and legacy DB startup occur before any safe epoch boundary; froze the exact five-leaf strict-copy contract, V2 startup seam, legacy reset deletion inventory, and required crash/path/credential tests. Canonical `appId` remains unprovable from the repository and is a hard Owner blocker.
- 2026-07-13: Re-verified current official provider contracts. OpenAI client-managed native-item continuation is supported; Anthropic `thinking.display` and exact modern model constraints are formal; Gemini v1beta Interactions exposes native id continuation; Ollama protocols remain distinct. Found two hard plan conflicts: LM Studio native cannot do multi-turn with `store:false`, and OpenRouter Images documents `provider_tag` but exposes no request-side pin field in its official request schema. Recorded the full audit and stopped before production edits.
- 2026-07-14: Owner authorized an initial controlled OpenRouter Images smoke. Three successful requests used top-level `provider_tag` and all resolved to the same endpoint, costing USD 0.1344765. This is retained only as negative evidence for incorrect field placement; it did not test documented Images provider routing.
- 2026-07-14: Reopened the decision after current official docs were verified to define `provider.only`/`order`/`ignore`/`sort`/`allow_fallbacks` for Images and show `provider.only:["google-ai-studio"]`. Corrected two-request smoke routed AI Studio and Vertex Global to distinct endpoints with fallbacks disabled, costing USD 0.0908215 total; authenticated OpenRouter Logs independently labeled the rows `Google AI Studio` and `Google Vertex`. The exact request-side pin contract is frozen and the OpenAPI lag is tracked. Review also corrected the preflight binding from unavailable endpoint IDs to provider-owned tag/slug plus descriptor revision/digest, and reopened only the deterministic multi-eligible-descriptor selection policy as an Owner blocker.
- 2026-07-14: Final P0/P1 risk and document-consistency reviews passed. Successful refresh missing the bound tag now invalidates the capability revision and stale-rejects without same-command endpoint substitution; AC-24 and all affected artifacts carry the same invariant. Both evidence JSON files parse, exact-body hashes and USD 0.0908215 corrected cost recompute, secret/image scans are clear, local links/code fences and all 42 unique AC entries pass, and `git diff --check` reports no error.
- 2026-07-14: Owner replaced the blocked LM Studio native-chat decision with Responses-first qualification. Local LM Studio `0.4.19+2` and runtime `2.24.0` passed eleven exact-body checks at zero external cost, including an auditable fresh-process persisted-artifact replay, so the endpoint is fixed to `lmstudio-openresponses`; the inactive qualification-failure alternative is `lmstudio-openai-chat-completions`. Transient/inconclusive failures were explicitly excluded from alternative selection. The server and temporary model instances were restored to their pre-test off/unloaded state.
- 2026-07-14: Final LM Studio risk review closed two evidence-boundary issues: qualification failures now fail closed unless a healthy-runtime contract failure is repeatable and followed by a separate explicit Chat qualification; restart evidence now embeds the exact persisted artifact, its byte count/hash and distinct parent/child PIDs. Provider SSE evidence is named as a single-terminal sample, while Starverse terminal coordination remains an implementation acceptance suite. Final P0/P1 review, JSON/body/artifact hashes, secret scan, 42 AC, links/fences and `git diff --check` passed.
