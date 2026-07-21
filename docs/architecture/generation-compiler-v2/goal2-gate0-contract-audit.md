# Generation Compiler V2 — Goal 2 Gate 0 Contract Audit

Status: **OpenRouter Images routing, LM Studio Responses-first binding/request/continuation, and DeepSeek stable endpoint/thinking-history slices are closed for their bounded implementation. LM Studio native terminal SSE decoding is reopened and blocked on its formal terminal schema plus coordinator acceptance. The 2026-07-18 Owner decisions below close the OpenRouter profile, OpenAI continuation, local-profile, beta-web, transport-retry, and image-continuation policy questions; each still requires its corresponding implementation and acceptance evidence.** Verified 2026-07-13 through 2026-07-18 against current first-party documentation, OpenAPI and controlled live/local smokes.

This audit records evidence discovered after Goal 1. It does not silently rewrite the implementation baseline. A conflict with the frozen plan blocks the affected contract and the production cutover until the Owner records a decision backed by an official schema or a real authenticated smoke.

## OpenAI Responses continuation

Official sources:

- <https://developers.openai.com/api/docs/guides/conversation-state>
- <https://developers.openai.com/api/docs/guides/reasoning>
- <https://developers.openai.com/api/reference/resources/responses/methods/create>

Verified facts:

- `previous_response_id` and `conversation` are mutually exclusive server-state modes.
- Stateless client-managed continuation is officially supported with `store:false`, `include:["reasoning.encrypted_content"]`, and complete ordered replay of native response output items plus the next user item.
- `reasoning.encrypted_content` is an opaque continuation artifact. Visible summary/text is not a substitute.
- Tool, web, image, reasoning, message, and future supported native item variants must be stored and replayed through a closed union. Unknown item variants block instead of being dropped.
- The Goal 1 recommended OpenAI client-managed mode is implementable, but the current Starverse generic role/text history is insufficient.

Disposition: **contract evidence complete; Owner approval of the recommended mode remains required by Gate 0**.

## LM Studio Responses-first qualification and fixed protocol binding

Official sources:

- <https://lmstudio.ai/docs/developer/rest/chat>
- <https://lmstudio.ai/docs/developer/rest/stateful-chats>
- <https://lmstudio.ai/docs/developer/rest>
- <https://lmstudio.ai/docs/developer/openai-compat/responses>
- <https://lmstudio.ai/docs/developer/openai-compat/chat-completions>
- <https://lmstudio.ai/changelog/lmstudio-v0.4.19>

Verified facts:

- Native `/api/v1/chat` defaults to `store:true`, returns `response_id`, and continues with `previous_response_id`.
- With `store:false`, native chat returns no continuation id.
- The native chat contract does not allow assistant messages in request input. Therefore a `store:false` native request cannot implement client-managed multi-turn replay; it is one-shot only.
- LM Studio Responses accepts assistant/native output items in request input and supports custom tools and SSE. Chat Completions can replay complete messages but is a different protocol.
- LM Studio 0.4.19 specifically fixes reasoning replay through `/v1/responses`; 0.4.19 is therefore the minimum V2 qualification version.
- LM Studio does not expose OpenAI-hosted `reasoning.encrypted_content`; qualification instead requires lossless replay of every native item actually returned by the local Responses endpoint.

Owner-frozen protocol selection:

- first candidate: `lmstudio-openresponses` at `/v1/responses`;
- qualification-failure alternative: `lmstudio-openai-chat-completions` at `/v1/chat/completions` with Starverse-owned complete `messages` replay;
- native `/api/v1/chat` is forbidden for ordinary multi-turn Starverse conversations;
- the endpoint profile persists exactly one successful contract ID/revision; transport errors never switch protocol and a single failed request never invokes the alternative.
- Authentication/authorization failure, connection refusal, timeout, 5xx, unavailable/unloaded model, transient runtime failure, cancellation, or an inconclusive smoke result fail closed and leave the endpoint unbound. They never trigger Chat Completions qualification.
- Only a repeatable Responses contract/item round-trip failure on an otherwise healthy qualified runtime may make Chat Completions eligible, and then only through a separate explicit setup qualification operation. It cannot run in the same send or qualification transaction; Chat is persisted only after its own complete-message suite passes.

Local exact-body qualification, 2026-07-14:

- LM Studio `0.4.19+2` (`ProductVersion 0.4.19.0`), CLI commit `9902c3a`, selected runtime `llama.cpp-win-x86_64-nvidia-cuda12-avx2@2.24.0`.
- Loopback-only server at `127.0.0.1:1234`; local models `gate0-qwen3-4b` and `gate0-qwen35-2b`; zero external provider requests and USD 0 cost.
- Eleven exact `/v1/responses` requests all returned HTTP 200. Every request serialized `store:false`; none contained `previous_response_id`.
- Complete client-owned replay passed for pure-text multi-turn and two branches from one persisted prefix. A separate restart audit serialized that prefix, recorded artifact SHA-256 `06de481179c4025664b140e6e32ddcdd3e9abe09fa52237ba5b75834f29dafc0`, and reloaded it in fresh child PID `16092` launched by PID `27916` before the next successful request.
- Native reasoning item and `reasoning_text` were captured unchanged and accepted in the next input. Native `function_call` retained its ID/call ID/name/arguments/status; the matching `function_call_output` round-trip produced the expected final message.
- The provider SSE sample included `response.created`, output deltas and exactly one final `response.completed`; no event followed it. This proves the observed provider event sequence, not Starverse's terminal coordinator, which remains an implementation acceptance test across completed/failed/incomplete/cancelled/connection-close paths.
- Exact serialized bodies/hashes, complete local responses and SSE fields, environment versions, assertions and conclusion are retained in [`evidence/lmstudio-openresponses-compliance-20260714.json`](evidence/lmstudio-openresponses-compliance-20260714.json).

Native SSE supplement, 2026-07-15:

- Repeated loopback-only, zero-cost exact-body requests on the same LM Studio/runtime and the same two previously qualified models observed the complete reasoning success sequence (`response.reasoning_text.delta/done`) on `gate0-qwen35-2b` and function-call success sequence (`response.function_call_arguments.delta/done`) on `gate0-qwen3-4b`, each ending in exactly one `response.completed`.
- A `max_output_tokens:1` reasoning probe also ended in `response.completed`; it did not produce `response.incomplete`. An invalid model failed before SSE with HTTP 400 and a JSON error; it did not produce `response.failed`.
- Therefore the successful reasoning/function-call wire is now locally observed, but LM Studio `response.failed` and `response.incomplete` terminal wire shapes remain unobserved. They must not be inferred from the native `/api/v1/chat` protocol or from the successful samples. The V2 decoder/runtime registration remains blocked until the formal OpenAI-compatible terminal schema is frozen and the Starverse exactly-once terminal coordinator fixtures cover completed, failed, incomplete, cancellation and premature EOF independently.
- Exact bodies/hashes, raw SSE, parsed full event objects and the HTTP failure body are recorded in [`evidence/lmstudio-openresponses-sse-contract-20260715.json`](evidence/lmstudio-openresponses-sse-contract-20260715.json), SHA-256 `d553ebeca66c21fc10884fcc835a4a85d8aed972d47fe732275cc0fda79bdee6`. After capture, both temporary models were unloaded and the loopback server was stopped and rechecked separately.

Disposition: **qualification passed; bind this endpoint explicitly to `lmstudio-openresponses`. Starverse V2 must implement and persist the complete ordered Responses item union before enabling the binding. `lmstudio-openai-chat-completions` remains only the fixed qualification-failure alternative for a separately tested endpoint; it is not a runtime fallback. `/api/v1/chat` is not registered for ordinary conversations.**

## Ollama protocol findings

Official sources:

- <https://docs.ollama.com/api/chat>
- <https://docs.ollama.com/api/openai-compatibility>

Verified facts:

- Native `/api/chat` uses complete client-managed `messages[]`; it has no `store`, `response_id`, or `previous_response_id` field.
- Ollama's OpenAI-compatible Responses endpoint documents only a non-stateful flavor and does not support `previous_response_id` or `conversation`.
- Current official evidence does not prove OpenAI encrypted reasoning-item replay for Ollama Responses.

Disposition: native chat may use its own typed message continuation. Responses remains disabled until exact native-item fixtures and smoke prove the intended contract. Neither protocol may fall back to the other.

## Anthropic Messages matrix

Official sources:

- <https://platform.claude.com/docs/en/api/typescript/messages/create>
- <https://platform.claude.com/docs/en/build-with-claude/extended-thinking>
- <https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking>
- <https://platform.claude.com/docs/en/build-with-claude/effort>
- <https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool>

Verified facts:

- `thinking.display` is a formal request field for adaptive and manual thinking; the closed values are `summarized` and `omitted`. It is invalid with disabled thinking.
- `omitted` still returns the signature required for continuation; lack of thinking deltas must never cause signature loss.
- Effort is `output_config.effort`, not a thinking child. Allowed effort, thinking modes, display default, sampling restrictions, and web tool versions vary by exact model family.
- Modern adaptive-only families reject manual budgets; newer families narrow sampling. Existing boolean-to-`thinking.type` mapping and builder token correction are invalid V2 behavior.
- Exact basic web-search support for older model families is not proven by a closed current official matrix and must remain unavailable pending evidence/smoke.

Owner resolution (2026-07-18): `thinking.display` is a user-facing three-state semantic setting. `provider_default` omits the native field; `summarized` and `omitted` encode exactly; product default is `summarized`. The control is disabled with thinking disabled and all disabled-thinking requests omit `display`; the persisted selection remains an explicit accepted-no-wire semantic disposition. `omitted` does not disable thinking or billing; complete native thinking blocks/signatures/order remain required continuation artifacts. Thinking mode is separately immutable (`model_recommended|manual|adaptive`): recommendation compiles only when that exact reviewed rule carries an explicit enabled-mode recommendation; otherwise it visibly rejects, never `disabled` or an inferred fallback. Manual requires an explicit positive budget before snapshot persistence. The exact family matrix is implementation evidence; unproven model/tool combinations remain blocked.

Verified exact-ID matrix (2026-07-18): V2's first reviewed rule set contains only `claude-fable-5`, `claude-mythos-5`, `claude-mythos-preview`, `claude-opus-4-8`, `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-5`, `claude-sonnet-4-6`, `claude-opus-4-5`, `claude-sonnet-4-5`, `claude-haiku-4-5`, and `claude-haiku-4-5-20251001`. The set records manual/adaptive/disabled legality, always-thinking/default behavior, display default, effort domain and the current explicit-sampling prohibition. It contains no model-family regex or wildcard: Models API visibility without a matching reviewed rule is insufficient to compile. The sources are the four first-party URLs above, checked 2026-07-18; their current table states that Sonnet 4.5 requires manual thinking, Haiku 4.5 supports manual rather than adaptive thinking, and the newer adaptive families reject manual mode or explicit sampling as documented. This closes only the model-thinking evidence input; tool/web/file capability and the native Messages codec remain independently blocked.

## Gemini Developer API v1beta continuation

Official source:

- <https://ai.google.dev/api/interactions-api> (explicit beta view, `/v1beta/interactions`)

Verified facts:

- The Owner-frozen provider-owned `v1beta` endpoint remains officially documented.
- Interactions exposes `store`, returns an interaction `id`, and accepts `previous_interaction_id` for multi-turn continuation.
- Complete interaction steps include native model output and tool-call variants and must be stored as provider-native artifacts where the selected continuation mode requires them.
- GenerateContent remains a separate codec and continuation artifact family; no Interactions fallback is permitted.

Disposition: no version conflict. Starverse's Owner-selected V2 mode is stateless: it must send `store:false`, must not send `previous_interaction_id`, and must persist/replay complete native steps rather than reconstructing continuation from visible text. `previous_interaction_id` remains a documented API fact only, not an available Starverse fallback.

### Gemini V2 surface-binding evidence gate

The `v1beta` decision settles API version, but does not authorize guessing a codec per model and operation. Current first-party image material contains both GenerateContent and Interactions examples, while the live Models API supplies identity, supported methods and token limits rather than the complete model/operation field and value domains required by V2. Existing model-name regexes, `wirePath` profiles and legacy builders are prohibited as V2 capability or surface-binding evidence.

Chrome-reviewed first-party model evidence (2026-07-18): <https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-image> identifies `gemini-3.1-flash-image` as accepting text, image and PDF input and producing image/text output; its model table marks image generation, Google Search grounding and thinking supported, and function calling unsupported. The page also points readers to Interactions as the current API for latest capabilities. This is valid model-level negative/positive capability evidence: a V2 capability projection for this model must reject function tools and must not expose unsupported output modalities. It is not an exact operation/field/value codec fixture, so it does not by itself bind image/text requests to GenerateContent or Interactions.

Disposition: before a Gemini V2 request codec or UI projection is enabled, each model/operation must have a reviewed exact capability fixture or stronger provider-signed descriptor that names its required surface and accepted explicit fields. If an existing visible control lacks that evidence, it remains visible with an explicit blocked state; it must not be removed, silently inherited, or routed through a legacy/alternate codec. An official exact model-operation statement or an Owner-authorized exact-body smoke may close an affected binding. There is no protocol fallback or automatic surface switch.

### Gemini Interactions exact codec correction (2026-07-19)

The current official Interactions OpenAPI was fetched directly on 2026-07-19: HTTP 200, 326,278 UTF-8 bytes and SHA-256 `8db3dc884fb96ae2fdeb8872e1666fae5bcde2e46fd03dd6878ad1481e403151`, equal to the repository's pinned evidence hash. The schema's `ImageResponseFormat` nevertheless makes the existing dormant `interactionsRequestV1` unsafe to activate: its output `mime_type` enum is only `image/jpeg`, and it defines the optional image `delivery` values `inline|uri`; the dormant codec currently permits `image/png` and `image/webp` and does not represent delivery. The same schema describes the distinct typed SSE union (`interaction.created`, `interaction.completed`, status/error and step start/delta/stop) with a `[DONE]` sentinel. Therefore it cannot be routed through GenerateContent or OpenRouter Images.

Disposition: **Gemini Interactions remains execution-blocked until a corrected closed request codec, model/operation capability fixture, native step/event assembler and exact-body/terminal fixture are implemented together.** This is a contract correction, not an availability fallback: no PNG/WebP output is silently rewritten, no image delivery mode is guessed, and no Image/GenerateContent protocol substitution is authorized.

## DeepSeek stable Chat contract and thinking tool continuation

Official sources, reverified 2026-07-15:

- <https://api-docs.deepseek.com/quick_start/pricing>
- <https://api-docs.deepseek.com/api/create-chat-completion>
- <https://api-docs.deepseek.com/api/list-models>
- <https://api-docs.deepseek.com/guides/thinking_mode/>
- <https://api-docs.deepseek.com/guides/tool_calls/>

Owner-frozen contract:

- The stable first-party origin is exactly `https://api.deepseek.com`; Chat is `POST /chat/completions` and Models is `GET /models`. V2 never appends, probes, or falls back to `/v1`.
- `/beta` is an independently and explicitly selected Beta contract. Stable requests never switch to it automatically.
- Beta-only fields such as function-tool `strict` are rejected by the stable codec; they cannot smuggle a stable request onto the Beta origin.
- Thinking requests may send function-tool definitions. If no `tool_choice` is configured, the field is absent from the serialized body.
- Every explicit `tool_choice` while thinking is enabled, including `auto`, `none`, `required`, and a named function, is rejected before compilation with `DEEPSEEK_THINKING_EXPLICIT_TOOL_CHOICE_UNVERIFIED`. Thinking-disabled requests encode the formal Chat-schema field normally.
- Provider-native assistant history preserves `content`, `reasoning_content`, and `tool_calls`; following tool messages retain their original order and `tool_call_id`. A thinking tool continuation with a missing required `reasoning_content` blocks before transport instead of reconstructing it from visible text or display reasoning.
- The same ordered native artifact is authoritative across ordinary continuation, tool continuation, restart, branch, retry, regenerate, and edit-resend. Streaming assembly must preserve reasoning and tool deltas before terminal persistence.

Disposition: **the DeepSeek stable endpoint and thinking/tool-choice Gate 0 conflicts are closed by Owner decision.** Exact-body, native-history round-trip, missing-reasoning preflight, streaming assembly, and provider-400 regression tests are mandatory before activation. This decision does not authorize a `/v1` alias, a Beta fallback, or any inferred thinking-mode `tool_choice` value.

## OpenRouter Images endpoint pinning smoke and revised decision

Official sources:

- <https://openrouter.ai/docs/guides/overview/multimodal/image-generation>
- <https://openrouter.ai/docs/guides/routing/provider-selection>
- <https://openrouter.ai/openapi.json>

Current official facts, re-verified 2026-07-14:

- Per-endpoint records expose `provider_tag`, `provider_slug`, definitive `supported_parameters`, `allowed_passthrough_parameters`, and `supports_streaming`.
- The Images guide now explicitly defines `provider.only`, `order`, `ignore`, `sort`, and `allow_fallbacks`, shows an Images request with `provider.only:["google-ai-studio"]` and `allow_fallbacks:false`, and instructs clients to use descriptor `provider_tag` values as routing slugs.
- The provider-routing guide permits a complete endpoint variant slug such as `google-vertex/global`; the base slug matches its variants.
- The raw OpenAPI observed during the corrected smoke was 1,615,258 UTF-8 bytes with SHA-256 `abaf90acc89dc3a2b4cd8824afcbf87734c8d0a5f4429ea85dca0d9eb02e353b`. `ImageGenerationRequest.provider` still resolved only `options`, so the machine schema lags the readable official documentation.
- Decoder re-audit on 2026-07-15 found that the current OpenAPI is 1,609,078 bytes with SHA-256 `9a36929ad445b27a7010e11b474e8577c0c9b6f6570d67638db285b09adecdd8`. This does not reopen the proven provider-routing selection rule, but it reopens the native response/SSE codec gate: the machine contract now includes `image_generation.text_chunk`, describes omitted `media_type` differently, and leaves multi-image streaming/final framing ambiguities unresolved. Evidence: [`evidence/openrouter-images-openapi-drift-20260715.json`](evidence/openrouter-images-openapi-drift-20260715.json).
- Current readable-guide recheck on 2026-07-18 resolves the single-image streaming wire independently of the lagging machine schema: `image_generation.partial_image` carries `partial_image_index` plus `b64_json`; `image_generation.completed` carries `b64_json`, `created` and `usage` (including USD `cost`), with `media_type` omitted for raster PNG and present for vector output; mid-stream error is `{type:"error",error:{message,code}}`; the stream ends only with `data: [DONE]`. This authorizes a strict single-image decoder fixture and rejects any other event/type/terminal order. It does **not** specify the cardinality or association of completed events for `n > 1`, nor an unambiguous `image_generation.text_chunk` relationship. Those remain a full multi-image decoder/capability blocker; V2 must not silently narrow, merge or discard a user-selected multi-image result. Source: <https://openrouter.ai/docs/guides/overview/multimodal/image-generation> (checked 2026-07-18).

Incorrect-field smoke retained as negative evidence:

- Discovery used `GET /api/v1/images/models`, selected the stable non-Lite/non-preview Nano Banana 2 model `google/gemini-3.1-flash-image`, then followed its advertised `/api/v1/images/models/google/gemini-3.1-flash-image/endpoints` link.
- The current descriptors returned `google-ai-studio` for Google AI Studio and `google-vertex/global` for Google Vertex. Both supported the same lowest-cost request used by the smoke: one image, `resolution:"512"`, `aspect_ratio:"1:1"`, non-streaming, and the same prompt.
- Exactly three successful requests were sent: no-pin baseline, top-level `provider_tag:"google-ai-studio"`, and top-level `provider_tag:"google-vertex/global"`. No `provider.only`, `provider.order`, fallback flag, or other candidate selector was sent. No repeat was required.
- All three returned HTTP 200 and one PNG. The authoritative `GET /api/v1/generation?id=...` metadata for all three reported `provider_name:"Google"` and the same `provider_responses[0].endpoint_id:"275d7d39-ae50-4df3-8140-5dd69c3ab883"`.
- Each request cost USD 0.0448255; total smoke cost was USD 0.1344765.
- This proves only that top-level `provider_tag` produced no reliable routing difference. It does not test or refute the documented `provider.only` contract. Evidence remains in [`evidence/openrouter-images-provider-tag-smoke-20260714.json`](evidence/openrouter-images-provider-tag-smoke-20260714.json).

Corrected Owner-authorized `provider.only` smoke:

- Two requests used the same dynamically discovered model, `n:1`, `resolution:"512"`, `aspect_ratio:"1:1"`, and prompt. No baseline repeat was sent.
- AI Studio exact body used `provider.only:["google-ai-studio"]` and `allow_fallbacks:false`; HTTP 200 metadata reported `provider_name:"Google AI Studio"` and endpoint ID `a5c8267a-c7ec-42d3-9a53-08f34bce6af9`.
- Vertex Global exact body used `provider.only:["google-vertex/global"]` and `allow_fallbacks:false`; HTTP 200 metadata reported canonical provider name `Google` and endpoint ID `275d7d39-ae50-4df3-8140-5dd69c3ab883`, distinct from AI Studio and identical to the previously observed default Vertex endpoint.
- The authenticated OpenRouter Logs UI independently labeled the two corrected-smoke rows `Google AI Studio` and `Google Vertex`; their displayed costs (`$0.046` and `$0.0448`) and application label match the exact generation records. This closes the canonical `Google` metadata ambiguity for the Vertex request.
- The two responses and dashboard records therefore provide positive routing evidence for both discovered tags. No fallback or additional provider appeared in `provider_responses`.
- Costs were USD 0.045996 and USD 0.0448255; corrected-smoke total was USD 0.0908215.
- Exact serialized bodies and hashes, complete redacted responses/metadata, descriptors, OpenAPI hash/schema discrepancy, costs, and verdicts are retained in [`evidence/openrouter-images-provider-only-smoke-20260714.json`](evidence/openrouter-images-provider-only-smoke-20260714.json).

Final Owner selection rule:

- Selection authority belongs exclusively to the user. Resolver/compiler/transport never choose by price, API order, latency, historical success rate, or hard-coded provider preference.
- Binding lookup key is `(credentialScopeId, modelId, image_generate)`. The persisted value owns `providerTag`, `providerSlug`, descriptor revision/digest and selection origin (`user` or `sole_eligible`).
- A complete descriptor response containing duplicate `provider_tag` values is an invalid set and blocks before selection or cache replacement.
- If a binding exists and its latest complete descriptor remains present, fresh and supports the complete request, it remains selected. The current binding is displayed first; other candidates are displayed by Unicode code-point ascending `providerTag`. Display order never selects.
- Without a binding, zero eligible descriptors blocks as unsupported, one eligible descriptor is atomically bound/persisted, and multiple eligible descriptors return `OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED` until the user explicitly selects one.
- A missing/incomplete/hard-expired bound descriptor stale-rejects. If the bound fresh descriptor exists but the changed request is unsupported while another endpoint could support it, compilation returns `BOUND_ENDPOINT_CAPABILITY_MISMATCH`; the user must rebind and submit a new command. No same-command endpoint switch exists.
- A selected request always emits `provider.only:[providerTag]` and `allow_fallbacks:false`. Endpoint-specific fields and `provider.options[providerSlug]` are available only from that descriptor; option keys must belong to `allowed_passthrough_parameters`.
- Every binding change revalidates options and atomically removes values not valid for the new `providerSlug`/allowlist before a new command can compile.

Disposition: **The OpenRouter Images provider-routing/request-pin Gate 0 blocker is closed. Its request-side wire shape, user-owned selection algorithm, binding key, candidate ordering, stale/mismatch behavior, option namespace/allowlist and no-switch invariant remain frozen. The compile-time identity remains provider-owned selector data, never post-request generation endpoint ID. The original readable-doc/request-schema discrepancy remains a versioned routing regression risk, not a routing blocker. The native response/SSE gate is partially closed: a strict `n:1` decoder may be implemented from the readable official guide, but complete multi-image and text-chunk handling remains blocking until its cardinality/association and terminal framing are explicitly re-frozen. No production Images capability may advertise or accept a request whose terminal result cannot be losslessly persisted.**

## Resolved identity and remaining Owner decisions

- Canonical packaged identity is resolved: production uses `appId=io.github.guxinghai.starverse`, `productName=Starverse`, and package name `starverse-client`. Only explicit `.dev`/`.e2e` Electron/OS application-ID variants are permitted; ordinary launches deliberately share the explicitly assigned `%APPDATA%\Starverse` userData/managed workspace, while a non-empty explicit `--user-data-dir` remains a smoke/diagnostic override. The managed manifest and ownership checks remain production-appId-bound. `com.starverse.desktop` is neither recognized nor migrated.
- **2026-07-18 Owner decision — unified OpenRouter first-party profile:** the immutable permanent profile ID is `openrouter-first-party-v1`. It owns the OpenRouter credential scope, official endpoint provenance and runtime network authorization. `chat_completions` and `image_generate` are separate operation contracts below it and each retains its own capability, typed codec, command, runner and decoder. A load-inferred generic wire path is prohibited.
- **2026-07-18 Owner decision — OpenAI Responses continuation:** use complete client-native item replay with `store:false` and without `previous_response_id`; Starverse persists and returns the complete native item union.
- **2026-07-18 Owner decision — generic/local:** every endpoint binds one fixed explicit profile and protocol. Runtime probing, protocol guessing and fallback are prohibited; concrete Ollama profile inventory is an implementation-slice decision.
- **2026-07-18 Owner decision — OpenRouter server web:** expose only the verified Beta server web tool, default-disabled and visibly Beta. No legacy plugin or other fallback may remain.
- **2026-07-18 Owner decision — transport attempts:** generation transports make exactly one attempt and never automatically retry. Bounded retries for descriptor/catalog read-only refresh remain authority-local and are not transport retry.
- **2026-07-18 Owner decision — image continuation:** first release permits only provider-formally-declared and verified native image edit/continuation. Every other case creates a new sibling generation; no continuation state is inferred, simulated or migrated across providers.
- Anthropic `thinking.display` is resolved as a three-state user setting (`provider_default|summarized|omitted`, default `summarized`); model-level capability evidence and the native Messages codec remain separate work.
- **2026-07-20 Owner decision — OpenAI-compatible:** retain `openai_chat_compatible` as a user-owned, fixed `POST /v1/chat/completions` + SSE/JSON + `GET /v1/models` contract. It is not a first-party-provider alias and may never probe or fall back to Responses, native Ollama/LM Studio, Anthropic, Gemini, DeepSeek or OpenRouter. Compatible-only explicit/versioned extensions are allowed: bounded top-level `extraBody`, static reasoning-request mappings, response reasoning mappings, static inline policies and bounded observation-only discovery. They must be represented in the V2 snapshot, semantic ledger, field-ownership ledger and exact body; they never auto-enable from discovery or failure. The epoch-2 UI keeps multi-instance endpoint/auth/header/query/test/catalog/manual-model/capability/pricing/configuration/discovery parity. This replaces the earlier blanket unknown-patch prohibition only for this contract; every native provider still rejects unknown fields.
Production implementation may proceed for the resolved OpenRouter profile/Images route, packaged-identity reconciliation, LM Studio Responses-first binding/request/continuation, and DeepSeek stable endpoint/thinking-history slices. Identity resolution does not authorize destructive epoch reset: the native Windows coordinator lease and handle-relative/no-follow deletion mechanism remain separate prerequisites. LM Studio native terminal SSE remains separately blocked. Policy resolution never substitutes for exact-body, persistence, native-history, terminal or UI acceptance evidence.
